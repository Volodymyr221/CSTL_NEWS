-- scripts/supabase_page_push.sql
-- Надійні сповіщення про новий пост сторінки «Стрічки» (потік /byyou 24.07).
--
-- ЩО ЦЕ ЛІКУЄ
--   Раніше сповіщення слав БРАУЗЕР АВТОРА одразу після публікації. Якщо автор закрив
--   додаток, втратив мережу або пост створено інакше (адмінка, SQL) — сповіщення не
--   йшло НІКОЛИ і мовчки. Тепер розсилку запускає САМА БАЗА при появі поста.
--
-- ДВІ ЧАСТИНИ
--   1) page_push_log — журнал: про який пост розсилка вже була. Гарантує, що
--      сповіщення піде РІВНО РАЗ, навіть якщо функцію покличуть двічі (клієнт + тригер)
--      або якщо станеться повтор після збою мережі.
--   2) тригер AFTER INSERT ON page_posts → викликає Edge-функцію send-page-push
--      через pg_net (розширення для HTTP-запитів прямо з бази).
--
-- ⚠️ ЛИШЕ НОВІ ПОСТИ (рішення Вови 24.07): тригер на INSERT, не на UPDATE —
--    виправив друкарську помилку в пості → люди НЕ отримують друге сповіщення.
--
-- Ідемпотентно: можна виконувати повторно.

-- ── 1. Журнал розсилок ──────────────────────────────────────────────────────
create table if not exists public.page_push_log (
  post_id  bigint primary key references public.page_posts(id) on delete cascade,
  sent_at  timestamptz not null default now(),
  sent     int not null default 0            -- скільком пристроям реально відправлено
);

alter table public.page_push_log enable row level security;

-- Пише і читає лише сервер (Edge Function через service_role). Людям тут нічого робити.
drop policy if exists "service manages page push log" on public.page_push_log;
create policy "service manages page push log" on public.page_push_log for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
