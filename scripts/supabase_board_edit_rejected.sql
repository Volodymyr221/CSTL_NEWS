-- ============================================================================
-- ВИПРАВИТИ ВІДХИЛЕНЕ ОГОЛОШЕННЯ І ПОДАТИ ЗНОВУ — `update_board_post`
--
-- ✅ СТАН: НАКАТАНО 17.08.2026 (міграція `board_edit_rejected_posts`), ПІСЛЯ
--    `scripts/supabase_reject_reason.sql` — саме в цьому порядку.
--
-- 🧪 ДОВЕДЕНО НА ЖИВІЙ БАЗІ з підстановкою ролі й JWT автора (усе в транзакції,
--    відкоченій виключенням; сміття в таблиці — нуль):
--      1. автор править свій `rejected`   → {"ok": true, "status": "pending"}
--      2. статус у базі після правки      → `pending`, причина стерта в NULL
--      3. автор із `trusted = true`       → так само `pending` (модератора не обійти)
--      4. свій `closed`                   → «Це оголошення не можна редагувати» (регресу немає)
--
-- 🔴 НАВІЩО. 17.08 житель нарешті побачив ПРИЧИНУ відхилення (`reject_reason`) —
--    і тут же виявилось, що виправити оголошення він не може: сторож у RPC
--    пускав лише `published`/`pending`. Тобто продукт казав «ось що не так» і не
--    давав це полагодити — глухий кут, гірший за відсутність причини.
--
-- 🔑 ДВІ ЗМІНИ, І ДРУГА ВАЖЛИВІША ЗА ПЕРШУ:
--    1. `rejected` додано до дозволених станів редагування;
--    2. відредаговане відхилене оголошення ЗАВЖДИ їде на `pending` — навіть від
--       автора з довірою (`profiles.trusted`).
--    ⚠️ Без другої зміни trusted-автор обходив би рішення модератора: пост
--    відхилили руками, він тицьнув «зберегти» — і той самий текст знову на Дошці.
--    Довіра пришвидшує ПЕРШУ публікацію, а не скасовує вже ухвалену відмову.
--
-- 🧹 Причину стирати тут НЕ ТРЕБА: тригер `trg_clear_reject_reason` (сусідній
--    файл) робить це сам на будь-якій зміні статусу з `rejected`. Одне місце
--    правди — інакше довелось би пам'ятати про причину в кожному шляху.
--
-- 🛑 `closed` свідомо НЕ додано: завершене оголошення це закритий епізод, для
--    нього в «Моїх оголошеннях» уже є окрема дія «Повернути».
--
-- 📋 Тіло функції знято з ПРОДА (`pg_get_functiondef`, 17.08, md5
--    5b42f2f73e3fe3758003006a65d35def) і відтворене тут байт-у-байт, крім двох
--    названих змін. Так вимагає шапка `supabase_board_edit.sql`: у цього файла
--    вже був розсинхрон із базою (міграція ціни 28.07 у файл не потрапила).
-- ============================================================================

create or replace function public.update_board_post(p_id bigint, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_uid        uuid    := auth.uid();
  v_owner      uuid;
  v_type       text;
  v_status     text;
  v_trusted    boolean := false;
  v_new_status text;
  v_text       text    := nullif(btrim(coalesce(payload->>'text','')), '');
  v_title      text    := nullif(btrim(coalesce(payload->>'title','')), '');
  v_cat        text    := payload->>'category';
  v_price_cats text[]  := array['продам','послуга','куплю'];
  v_price_ok   boolean := v_cat = any(v_price_cats);
  v_price      numeric;
  v_negot      boolean := coalesce((payload->>'price_negotiable')::boolean, false);
  v_price_max  numeric := 100000000;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Треба увійти');
  end if;

  select owner_uid, type, status
    into v_owner, v_type, v_status
    from public.posts where id = p_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Оголошення не знайдено');
  end if;
  if v_owner is null or v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'Це не ваше оголошення');
  end if;
  if coalesce(v_type, 'board') <> 'board' then
    return jsonb_build_object('ok', false, 'error', 'Можна редагувати лише оголошення');
  end if;
  -- 🔴 ЗМІНА 1: `rejected` тепер редагується (було лише published/pending).
  if v_status not in ('published', 'pending', 'rejected') then
    return jsonb_build_object('ok', false, 'error', 'Це оголошення не можна редагувати');
  end if;

  if v_text is null then
    return jsonb_build_object('ok', false, 'error', 'Порожній текст');
  end if;
  if v_title is null then
    return jsonb_build_object('ok', false, 'error', 'Потрібен заголовок');
  end if;

  begin
    v_price := nullif(btrim(coalesce(payload->>'price','')), '')::numeric;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'Ціна має бути числом');
  end;

  if v_price is not null then
    if v_price < 0 then
      return jsonb_build_object('ok', false, 'error', 'Ціна не може бути відʼємною');
    end if;
    if v_price > v_price_max then
      return jsonb_build_object('ok', false, 'error', 'Завелика ціна');
    end if;
    v_price := round(v_price, 2);
  end if;

  -- Категорія без ціни → витираємо обидва поля. Це ще й ремонт заднім числом: якщо
  -- людина ПЕРЕКЛЮЧИЛА категорію з «Продам» на «Загубилось», стара ціна мусить піти.
  if not v_price_ok then
    v_price := null;
    v_negot := false;
  end if;
  if v_price is not null then
    v_negot := false;
  end if;

  select coalesce(trusted, false) into v_trusted
    from public.profiles where uid = v_uid;

  -- 🔴 ЗМІНА 2: відхилене після правки ЗАВЖДИ на повторну модерацію.
  -- Довіра не скасовує вже ухвалену відмову — інакше «зберегти» ставало б
  -- кнопкою обходу модератора.
  v_new_status := case
    when v_status = 'rejected'                       then 'pending'
    when v_status = 'published' and not v_trusted    then 'pending'
    else v_status
  end;

  update public.posts set
    text             = v_text,
    title            = left(v_title, 80),
    category         = v_cat,
    color            = coalesce(payload->>'color', color),
    contact          = payload->>'contact',
    location         = payload->>'location',
    photos           = coalesce(
                         (select array_agg(value) from jsonb_array_elements_text(payload->'photos')),
                         '{}'),
    price            = v_price,
    currency         = 'UAH',
    price_negotiable = v_negot,
    status           = v_new_status,
    published_at     = case when v_new_status = 'pending' then null else published_at end,
    updated_at       = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'status', v_new_status);
end;
$function$;

revoke execute on function public.update_board_post(bigint, jsonb) from public, anon;
grant  execute on function public.update_board_post(bigint, jsonb) to authenticated;

-- ============================================================================
-- ПЕРЕВІРКА ПІСЛЯ RUN (від імені ЖИТЕЛЯ, не адміна):
--   1. Свій `rejected` пост → правка проходить, у відповіді `status = 'pending'`.
--   2. `select reject_reason` того ж поста → NULL (стер тригер із сусіднього файла).
--   3. Автор із `trusted = true` править свій `rejected` → однаково `pending`.
--   4. Свій `closed` пост → відмова «Це оголошення не можна редагувати».
--   5. ЧУЖИЙ пост → відмова «Це не ваше оголошення» (регресу немає).
-- ============================================================================
