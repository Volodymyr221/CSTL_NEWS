-- ============================================================================
-- CSTL LIFE — ЧЕРНЕТКИ ПОСТІВ СТОРІНКИ (для ШІ-агента спільноти OLYKA CASTLE)
-- ============================================================================
-- Запустити у Supabase → SQL Editor. ІДЕМПОТЕНТНО: повторний запуск безпечний.
--
-- НАВІЩО. 20.08 Вова замовив агента, який пише пости в стрічку від імені
-- офіційної спільноти бренду (`pages.id = 3`, OLYKA CASTLE) — і на питання
-- «публікує сам чи готує чернетку» відповів: **чернетка**. Отже постам потрібен
-- стан, якого в таблиці не було: вона знала лише «є» і «мʼяко видалений».
--
-- 🔴 ГОЛОВНЕ РІШЕННЯ: ЧЕРНЕТКА НЕВИДИМА НА РІВНІ БАЗИ, А НЕ В КЛІЄНТІ.
-- Можна було просто дописати фільтр у запит застосунку — і цього вистачило б
-- рівно до першої помилки в іншому запиті. Тут ідеться про офіційний голос
-- бренду: текст, який Вова ще не бачив, не має існувати для читача НІ ЗА ЯКИХ
-- обставин, навіть якщо клієнт помилиться.
-- ➡️ Тому правило стоїть у політиці читання, і зразок узято не з голови, а той
--    самий, що вже діє поруч для мʼяко видалених постів:
--       було:  (deleted_at is null) OR can_edit_page(page_id)
--       стало: (deleted_at is null AND status = 'published') OR can_edit_page(...)
--    Тобто редактор сторінки бачить свої чернетки (він і має їх вичитувати),
--    решта людей — ні.
--
-- ⚠️ `default 'published'` НЕ випадковий: усі 17 наявних постів і весь наявний
-- код створення постів (`createPagePost`) продовжують працювати без жодної
-- правки. Міграція нічого не ховає з того, що вже опубліковано.
-- ============================================================================

-- ── 1. Стан поста ────────────────────────────────────────────────────────────
alter table public.page_posts
  add column if not exists status text not null default 'published';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'page_posts_status_chk') then
    alter table public.page_posts
      add constraint page_posts_status_chk check (status in ('draft', 'published'));
  end if;
end $$;

comment on column public.page_posts.status is
  'draft — написав ШІ-агент, чекає вичитки; published — видно всім. Чернетки ховає політика читання, а не клієнт.';

-- ── 2. Читання: чернетку бачить лише редактор сторінки ───────────────────────
drop policy if exists "pposts read" on public.page_posts;
create policy "pposts read" on public.page_posts
  for select
  using (
    ((deleted_at is null) and (status = 'published'))
    or can_edit_page(page_id)
  );

-- ── 3. Індекс під головну вибірку стрічки ────────────────────────────────────
-- Наявний `idx_page_posts_feed` покриває лише `deleted_at is null`. Тепер у
-- кожному запиті стрічки є ще й `status`, тож даємо точний частковий індекс.
create index if not exists idx_page_posts_feed_pub
  on public.page_posts (created_at desc)
  where deleted_at is null and status = 'published';
