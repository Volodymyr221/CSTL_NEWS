-- scripts/supabase_question_owner_edit.sql
-- 🔴 25.08.2026 — АВТОР МОЖЕ РЕДАГУВАТИ Й ВИДАЛЯТИ СВОЄ ПИТАННЯ.
--
-- Слово Вови: «Коли користувач написав питання, він його не може ні редагувати,
-- ні видалити. Крім, може видалити тільки адмін з адмінки. Це потрібно
-- виправити. Виправити технічно правильно.»
--
-- 📐 ЗАМІРЯНО ПЕРЕД РОБОТОЮ, обидва рівні:
--   • клієнт: `grep` по `src/` дав на таблиці `posts` лише `select` та `insert`
--     — жодного `update`/`delete` у всьому застосунку;
--   • база: на `posts` стояли рівно дві політики запису — «Admins can update
--     posts» і «Admins can delete posts», обидві `is_admin()`.
--   Тобто заборона була не випадковою дірою, а станом за замовчуванням.
--
-- 🔑 ЧОМУ RPC, А НЕ ВІДКРИТА UPDATE-ПОЛІТИКА ДЛЯ АВТОРА.
-- Це вже усталений спосіб цього проєкту: `update_board_post`
-- (`supabase_board_edit.sql`) редагує оголошення так само — SECURITY DEFINER із
-- серверною перевіркою `owner_uid = auth.uid()`. Причина не в смаку:
-- 🛑 політика `using (owner_uid = auth.uid())` дозволяє змінити БУДЬ-ЯКЕ поле
-- рядка, а не лише текст. Автор міг би переписати `status` ('rejected' →
-- 'published', обійшовши модерацію), `type` ('chat' → 'board': питання
-- зʼявляється автоматично, оголошення проходить перевірку — тобто оголошення
-- без модерації), `owner_uid`, `price`. Це рівно клас вади **B-23**, де
-- `with check (true)` на `page_comments` дозволяла підробити `author_uid`.
-- RPC не має цієї проблеми за побудовою: він пише ТІЛЬКИ ті колонки, які
-- перелічені в його тілі, і нових колонок туди не додасть жодна майбутня зміна
-- схеми.
--
-- 🛑 РЕДАГУВАННЯ ПРОХОДИТЬ АНТИСПАМ — це урок **B-26**, дослівно той самий:
-- «редагування ОБХОДИЛО антиспам», бо перевірка стояла лише на вставці. Людина
-- публікувала безневинне і підміняла на спам правкою. Тому `update_question`
-- кличе `public.text_abuse_reason()` — ту саму функцію, якою живе
-- `comments_guard_update_antispam`. Другої копії правил не заводимо.
--
-- 🔑 ВИДАЛЕННЯ М'ЯКЕ (`deleted_at`), а не `delete from`. Так само, як у
-- `comments` (`deleteComment` виставляє `deleted_at`). Причини дві:
--   1. рядок лишається для адміна і для розбору скарг — жорстке видалення
--      знищило б і докази;
--   2. відповіді інших людей лежать у `comments` із `post_id` — при жорсткому
--      видаленні вони або впали б на зовнішньому ключі, або осиротіли.
--   ⚠️ Рішення Вови 25.08: питання видаляється РАЗОМ із відповідями. Окремо їх
--   не чіпаємо — вони недосяжні без свого питання, і це ЗВОРОТНО: адмін бачить
--   рядок і може зняти `deleted_at`. Жорстке видалення такого шансу не лишає.
--
-- ЗАСТОСУВАТИ через Supabase MCP apply_migration (project uabyfecseqnemvcqhdem).
-- Скрипт ІДЕМПОТЕНТНИЙ.
-- ============================================================================

-- 1. Дві колонки того самого ґатунку, що вже є в `comments`.
alter table public.posts add column if not exists deleted_at timestamptz;
alter table public.posts add column if not exists edited_at  timestamptz;

-- 2. Видалене зникає з очей. 🛑 Разом із власником: `post_visible_row` показує
--    рядок авторові НЕЗАЛЕЖНО від статусу (щоб він бачив свій pending), тож без
--    цієї умови «видалене» лишалось би видимим саме тому, хто його видалив.
--    Адмін бачить усе — на цьому й тримається зворотність.
drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts
  for select
  using (
    (deleted_at is null and public.post_visible_row(status, owner_uid))
    or public.is_admin()
  );

-- 3. Редагування тексту питання.
create or replace function public.update_question(p_id bigint, p_text text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_owner  uuid;
  v_type   text;
  v_del    timestamptz;
  v_text   text := nullif(btrim(coalesce(p_text, '')), '');
  v_reason text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Треба увійти');
  end if;
  if v_text is null then
    return jsonb_build_object('ok', false, 'error', 'Порожнє питання');
  end if;
  -- Стеля тексту питання — та сама, що на вставці з клієнта.
  if length(v_text) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'Задовге питання');
  end if;

  select owner_uid, type, deleted_at into v_owner, v_type, v_del
    from public.posts where id = p_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Питання не знайдено');
  end if;
  if v_owner is null or v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'Це не ваше питання');
  end if;
  if coalesce(v_type, 'board') <> 'chat' then
    return jsonb_build_object('ok', false, 'error', 'Це не питання');
  end if;
  if v_del is not null then
    return jsonb_build_object('ok', false, 'error', 'Питання вже видалене');
  end if;

  -- 🛑 B-26: правка мусить проходити те саме сито, що й публікація.
  v_reason := public.text_abuse_reason(v_text);
  if v_reason is not null then
    return jsonb_build_object('ok', false, 'error', v_reason);
  end if;

  update public.posts
     set text = v_text,
         edited_at = now()
   where id = p_id;

  return jsonb_build_object('ok', true, 'edited_at', now());
end;
$$;

-- 4. М'яке видалення питання автором.
create or replace function public.delete_question(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_owner uuid;
  v_type  text;
  v_del   timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Треба увійти');
  end if;

  select owner_uid, type, deleted_at into v_owner, v_type, v_del
    from public.posts where id = p_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Питання не знайдено');
  end if;
  if v_owner is null or v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'Це не ваше питання');
  end if;
  if coalesce(v_type, 'board') <> 'chat' then
    return jsonb_build_object('ok', false, 'error', 'Це не питання');
  end if;
  -- Повторний виклик не помилка: людина могла тапнути двічі на поганому звʼязку.
  if v_del is not null then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  update public.posts set deleted_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- 5. Кликати може лише той, хто увійшов. `anon` не має чого тут робити:
--    обидві функції першим рядком перевіряють `auth.uid()`, але прибрати право
--    виклику дешевше, ніж покладатись на перевірку всередині.
revoke execute on function public.update_question(bigint, text) from public, anon;
revoke execute on function public.delete_question(bigint)       from public, anon;
grant  execute on function public.update_question(bigint, text) to authenticated;
grant  execute on function public.delete_question(bigint)       to authenticated;

-- ============================================================================
-- 6. 🔴 ДРУГА МІГРАЦІЯ ТОГО САМОГО ДНЯ — `post_visible_respects_soft_delete`.
--
-- Знайдено ПЕРЕВІРКОЮ, а не читанням: після мʼякого видалення питання зникало
-- зі списку, але його ВІДПОВІДІ лишались читомими через API. Заміряно на живій
-- базі в транзакції з відкотом: `comments where post_id=84` віддавало 2 рядки
-- після `delete_question(84)`.
--
-- Причина: `post_visible(p_id)` питає лише `post_visible_row(status, owner_uid)`
-- і про `deleted_at` НЕ ЗНАЄ. На цю функцію спираються ТРИ дочірні політики —
-- `comments read`, `reactions read`, `preact read`.
--
-- 🛑 Це рівно той клас вади, від якого в проєкті вже стоїть сторож
-- `tests/visibility-model.mjs` (16/16): «видимість дитини виводиться з видимості
-- батька». Він заведений після того, як 111 ВИДАЛЕНИХ коментарів спільнот
-- читалися будь-ким, бо кожна дочірня таблиця вирішувала видимість САМА.
--
-- 🔑 Тому правка ОДНА і в ОДНОМУ місці — усередині функції, а не в трьох
-- політиках: друга копія правила розійшлася б із першою.
create or replace function public.post_visible(p_id bigint)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'auth'
as $function$
  select exists (
    select 1 from public.posts p
    where p.id = p_id
      and (p.deleted_at is null or public.is_admin())
      and public.post_visible_row(p.status, p.owner_uid)
  );
$function$;

-- ✅ ПЕРЕВІРЕНО НА ЖИВІЙ БАЗІ 25.08 (транзакція з відкотом, роль `authenticated`,
--    `request.jwt.claims` = автор питання 84):
--      A. автор редагує своє            → ok:true
--      B. чуже питання                  → «Це не ваше питання»
--      C. оголошення замість питання     → «Це не питання»
--      D. порожній текст                → «Порожнє питання»
--      E. автор видаляє своє            → ok:true
--      F. повторне видалення            → ok:true, already:true (не помилка:
--                                          на поганому звʼязку тапають двічі)
--    І окремо, покроково (CTE тут не годяться — вони не бачать запису одне одного):
--      ДО:    питання видно 1 · відповіді 2
--      ПІСЛЯ: питання видно 0 · відповіді 0   ← навіть ВЛАСНИКОВІ
