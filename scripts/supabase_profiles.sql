-- scripts/supabase_profiles.sql
-- Фаза Б, Етап 1 — Кабінет жителя (профіль). Прив'язка до Google-входу (auth.users).
-- Застосовано у базі через Supabase MCP apply_migration (міграція phase_b_profiles, 19.06.2026).
-- Тут — для історії в репо. Ідемпотентний (можна виконувати повторно).

create table if not exists public.profiles (
  uid        uuid primary key references auth.users(id) on delete cascade,
  name       text,
  email      text,
  birth_date date,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Кожен бачить і редагує ТІЛЬКИ свій профіль (auth.uid() = власник рядка).
drop policy if exists "own profile read"   on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
create policy "own profile read"   on public.profiles for select using (uid = auth.uid());
create policy "own profile insert" on public.profiles for insert with check (uid = auth.uid());
create policy "own profile update" on public.profiles for update using (uid = auth.uid()) with check (uid = auth.uid());
