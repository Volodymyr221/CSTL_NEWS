-- Закріплення поста ВСЕРЕДИНІ спільноти (рішення Вови 27.07):
-- «адмін якоїсь спільноти може закріпляти тільки в себе на спільноті,
--  а не в головній стрічці».
--
-- ✅ НАКАТАНО 27.07 (міграція `page_posts_pinned`). Файл — для історії й відкату.
--
-- Чому timestamptz, а не boolean: дає природний порядок серед кількох закріплених
-- (свіжіше закріплення — вище) і сам собою документує, коли це сталось.
-- null = не закріплено, тобто стара поведінка для всіх наявних постів.
alter table public.page_posts
  add column if not exists pinned_at timestamptz;

-- Прав НЕ додаємо навмисно. Чинна політика вже робить рівно те, що просив Вова:
--   create policy "pposts update" on public.page_posts for update
--     using (can_edit_page(page_id)) with check (can_edit_page(page_id));
-- тобто редагувати (а отже й закріплювати) можна ЛИШЕ пости своєї сторінки.
-- Закріпити щось у ЧУЖІЙ спільноті неможливо навіть в обхід застосунку.
-- Перевірено запитом до pg_policies після накату: обидві умови = can_edit_page(page_id).

-- Індекс під сортування на екрані спільноти: закріплені зверху, решта за датою.
-- Частковий (тільки непорожні) — закріплених одиниці, повний індекс був би марним.
create index if not exists page_posts_pinned_idx
  on public.page_posts (page_id, pinned_at desc)
  where pinned_at is not null and deleted_at is null;

-- ── ВІДКАТ ────────────────────────────────────────────────────────────────────
-- drop index if exists public.page_posts_pinned_idx;
-- alter table public.page_posts drop column if exists pinned_at;
