-- scripts/supabase_thread_user_state.sql
-- Д-15 — відновлений (раніше НЕ закомічений) SQL таблиці thread_user_state:
-- per-user стан приватної розмови (архів / приховано / момент «видалення»).
-- Таблиця вже існує в БД (накатана через MCP давніше, але у scripts/ її не було —
-- борг документації, дотичне до СИ-5). Цей файл фіксує її схему + RLS у репо
-- і гарантує коректні політики «лише свій рядок».
--
-- Використання у коді: fetchThreadStates / setThreadState / fetchThreadClearedAt
-- (src/core/supabase.js) і список «Повідомлення» (src/tabs/board-chat.js):
--   archived   — розмову згорнуто в «Архів»
--   hidden     — розмову «видалено» зі списку (ховається доки нема нового)
--   cleared_at — момент видалення: історія до нього не показується/не рахується
--
-- ЗАСТОСУВАТИ: Supabase → SQL Editor → Run (або MCP apply_migration).
-- Ідемпотентно — безпечно повторювати, наявних даних не чіпає.
-- ============================================================================

create table if not exists public.thread_user_state (
  uid        uuid        not null references auth.users(id) on delete cascade,
  thread_id  bigint      not null references public.threads(id) on delete cascade,
  archived   boolean     not null default false,
  hidden     boolean     not null default false,
  cleared_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (uid, thread_id)
);

alter table public.thread_user_state enable row level security;

-- Кожен бачить і змінює ЛИШЕ свій рядок (uid = auth.uid()). Чужий архів/
-- cleared_at не витікає і не редагується.
drop policy if exists "own thread state" on public.thread_user_state;
create policy "own thread state" on public.thread_user_state for all
  using (uid = auth.uid())
  with check (uid = auth.uid());

-- ============================================================================
-- ✅ Перевірка: select * from pg_policies where tablename='thread_user_state';
--   → політика "own thread state" (ALL) з uid = auth.uid().
-- ============================================================================
