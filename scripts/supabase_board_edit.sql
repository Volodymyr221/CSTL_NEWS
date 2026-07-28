-- scripts/supabase_board_edit.sql
-- Д-3 — Редагування власного оголошення (Дошка громади).
-- Автор редагує свій пост із вкладки «Мої оголошення»: заголовок, опис, категорія,
-- локація, фото, телефон. Базова RLS дозволяє UPDATE лише адмінам (див.
-- supabase_schema.sql «Admins can update posts»), тому редагування автором іде
-- через цю SECURITY DEFINER RPC з серверною перевіркою owner_uid = auth.uid().
--
-- Статус після редагування (рішення Вови 12.07 — «залежно від довіри»):
--   • автор trusted (profiles.trusted, див. supabase_reputation.sql) → published
--     лишається published (правка зберігається одразу, пост не зникає з Дошки);
--   • автор НЕ trusted, пост був published → status='pending' (повторна модерація,
--     published_at=null) — захист від «схвалили безневинне → підмінили на спам»;
--   • пост уже pending → лишається pending (редагування до першого схвалення).
-- Редагувати можна лише active/pending; closed/rejected — ні.
--
-- ЗАСТОСУВАТИ через Supabase MCP apply_migration (project uabyfecseqnemvcqhdem).
-- Скрипт ІДЕМПОТЕНТНИЙ (create or replace) — можна запускати повторно.
--
-- ✅ 28.07.2026 — підтримка ЦІНИ вже НА ПРОДІ (міграція `board_price_support_update`,
--    20260728122127, накатана 12:21 UTC). Повторний накат НЕ потрібен — файл лише
--    дзеркалить базу.
-- ============================================================================

-- ============================================================================
-- ⚠️ БЛОК НИЖЧЕ — ДЗЕРКАЛО ПРОДА (знято з бази 28.07.2026 через pg_get_functiondef).
-- Міграція `board_price_support_update` (20260728122127) пішла в базу, але в цей файл
-- НЕ потрапила. Парна до `board_price_support_submit` у supabase_reputation.sql —
-- там же розписано, чим цей розсинхрон мало не коштував.
-- ➡️ Перед накатом — спершу зняти живий код із прода і порівняти.
-- ============================================================================
create or replace function public.update_board_post(p_id bigint, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  if v_status not in ('published', 'pending') then
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

  v_new_status := case
    when v_status = 'published' and not v_trusted then 'pending'
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
$$;

revoke execute on function public.update_board_post(bigint, jsonb) from public, anon;
grant  execute on function public.update_board_post(bigint, jsonb) to authenticated;

-- ============================================================================
-- Перевірка після Run:
--   1. Автор редагує свій pending-пост → ok, status лишається 'pending'.
--   2. НЕ-trusted автор редагує свій published-пост → ok, status='pending'
--      (зник з Дошки, поїхав на модерацію).
--   3. trusted-автор редагує свій published → ok, status лишається 'published'.
--   4. Чужий пост (owner_uid <> auth.uid()) → error 'Це не ваше оголошення'.
--   5. closed/rejected пост → error 'не можна редагувати'.
--   🆕 Ціна (28.07) — поведінка ПРОДА, звірена з живим кодом:
--   6. price: '2500' + категорія «продам» → price=2500, currency='UAH', negotiable=false.
--   7. price: '' → ціну знято (null). ⚠️ Ключ 'price' відсутній дає ТЕ САМЕ — функція
--      не розрізняє «не передали» і «стерли». Тобто клієнт МУСИТЬ слати ціну щоразу,
--      інакше редагування її зітре.
--   8. price: 'abc' → error 'Ціна має бути числом'; '-5' → 'Ціна не може бути відʼємною';
--      >100 млн → 'Завелика ціна'.
--   9. Категорія НЕ з ['продам','послуга','куплю'] → price і price_negotiable
--      витираються, навіть якщо клієнт їх надіслав. Це й ремонт заднім числом:
--      перемкнув «Продам» → «Загубилось», стара ціна пішла.
--  10. price_negotiable=true разом із числом → число перемагає, negotiable стає false.
-- ============================================================================
