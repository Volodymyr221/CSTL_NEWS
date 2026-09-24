-- 0001b_contact_column_lockdown.sql — ЗАМОК (друга половина Б1).
-- Виділено з 0001 24.09.2026. Пояснення «чому вітрина, а не колонковий revoke»
-- лишилось у шапці 0001a — прочитай його перед накатом.
--
-- 🛑 НАКОЧУВАТИ ЛИШЕ ПІСЛЯ ТОГО, ЯК:
--    1. накочено `0001a_posts_public_view.sql`;
--    2. клієнт переведений на вітрину там, де телефон не потрібен:
--         fetchPublishedPosts   (src/core/supabase.js)
--         fetchPostById
--         fetchAuthorAds
--       `fetchMyPosts` ЛИШАЄТЬСЯ на `posts` (людині показують її власні
--       чернетки й відхилені, яких у вітрині немає за означенням);
--       вкладене читання в розмовах теж лишається на `posts` — його покриває
--       політика учасника розмови нижче;
--    3. цей клієнт ЗАДЕПЛОЄНИЙ і перевірений живцем на телефоні.
--
-- Накат раніше цього = порожня Дошка для гостя.

-- ── 2. УЧАСНИК РОЗМОВИ ──────────────────────────────────────────────────────
-- 🔴 ПАСТКА, ЯКУ ЗАКРИВАЄМО ТИМ САМИМ КРОКОМ. Список розмов тягне оголошення
-- вкладено, з `contact` серед колонок (`src/core/supabase.js` ~1351). Звузивши
-- читання `posts`, ми лишили б ПОКУПЦЯ без картки оголошення, про яке він же й
-- листується. Ця політика віддає йому рядок цілком, разом із номером: людина
-- вже в розмові саме про це оголошення, це не масове вигрібання.
drop policy if exists "thread party reads its post" on public.posts;
create policy "thread party reads its post" on public.posts
  for select using (
    exists (
      select 1 from public.threads t
      where t.post_id = posts.id
        and (t.author_uid = auth.uid() or t.buyer_uid = auth.uid())
    )
  );

-- ── 3. ЗВУЗИТИ ЧИТАННЯ САМОЇ ТАБЛИЦІ ────────────────────────────────────────
-- 🔴 УВАГА НА НАЗВУ. У старих планах політика називалась
-- «Public can read published posts» — ТАКОЇ НА ПРОДІ НЕМАЄ. Є одна політика
-- читання, `posts read`, у яку три старі давно зведені:
--     using (((deleted_at is null) and post_visible_row(status, owner_uid)) or is_admin())
-- а `post_visible_row()` це `status='published' or owner=auth.uid() or is_admin()`.
-- Хто піде «знімати публічну політику» за старою назвою — не знайде її,
-- вирішить, що вже зроблено, і лишить діру відкритою.
-- ➡️ Тому тут не `drop`, а ПЕРЕПИСУВАННЯ: лишаємо власника й адміна, знімаємо
--    «будь-хто бачить опубліковане» (це тепер робота вітрини).
drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts
  for select using (
    (deleted_at is null and owner_uid = auth.uid()) or public.is_admin()
  );

-- ── ПЕРЕВІРКА ПІСЛЯ НАКАТУ ──────────────────────────────────────────────────
--   set local role anon;
--   select count(*) from public.posts;                    -- очікуємо 0
--   select count(*), count(*) filter (where has_contact)
--     from public.posts_public;                           -- очікуємо 12 і 6
-- 🛑 І ОБОВʼЯЗКОВО живцем: відкрити список розмов з акаунта ПОКУПЦЯ (не
-- власника оголошення) — назва оголошення має лишитись на місці.

