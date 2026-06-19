-- scripts/supabase_phase_b_chat.sql
-- Фаза Б, Етап 4 — Приватний чат покупець↔продавець + прив'язка push-пристроїв.
-- БЕЗПЕЧНО застосовувати будь-коли: лише ДОДАЄ нові таблиці/колонку, нічого
-- наявного не ламає (аноніми не торкаються threads/messages).
-- Ідемпотентний (можна виконувати повторно).
--
-- Застосувати через Supabase MCP apply_migration або SQL Editor.

-- ── 1. Хто подав оголошення (якщо був залогінений). Старі пости → NULL. ──
alter table public.posts add column if not exists owner_uid uuid references auth.users(id);

-- ── 2. Треди (гілки приватних розмов): один покупець = один тред на оголошення ──
create table if not exists public.threads (
  id              bigserial primary key,
  post_id         bigint not null references public.posts(id) on delete cascade,
  author_uid      uuid not null,   -- продавець (власник оголошення)
  buyer_uid       uuid not null,   -- покупець (ініціатор)
  created_at      timestamptz default now(),
  last_message_at timestamptz default now(),
  unique (post_id, buyer_uid)
);
create index if not exists idx_threads_author on public.threads (author_uid, last_message_at desc);
create index if not exists idx_threads_buyer  on public.threads (buyer_uid,  last_message_at desc);

-- ── 3. Повідомлення ──
create table if not exists public.messages (
  id         bigserial primary key,
  thread_id  bigint not null references public.threads(id) on delete cascade,
  sender_uid uuid not null,
  text       text not null check (length(trim(text)) between 1 and 2000),
  created_at timestamptz default now(),
  read_at    timestamptz
);
create index if not exists idx_messages_thread on public.messages (thread_id, created_at asc);

-- ── 4. RLS: тред і повідомлення бачать ТІЛЬКИ двоє учасників ──
alter table public.threads  enable row level security;
alter table public.messages enable row level security;

drop policy if exists "thread participants read" on public.threads;
create policy "thread participants read" on public.threads for select
  using (auth.uid() in (author_uid, buyer_uid));

-- Покупець створює тред лише на себе і лише якщо author_uid = справжній власник посту
drop policy if exists "buyer creates thread" on public.threads;
create policy "buyer creates thread" on public.threads for insert
  with check (
    buyer_uid = auth.uid()
    and author_uid = (select owner_uid from public.posts where id = post_id)
    and author_uid is not null
    and author_uid <> auth.uid()                       -- не пишемо самі собі
  );

-- Учасники можуть оновити last_message_at / read_at свого треда
drop policy if exists "thread participants update" on public.threads;
create policy "thread participants update" on public.threads for update
  using (auth.uid() in (author_uid, buyer_uid))
  with check (auth.uid() in (author_uid, buyer_uid));

drop policy if exists "msg participants read" on public.messages;
create policy "msg participants read" on public.messages for select
  using (exists (
    select 1 from public.threads t
    where t.id = thread_id and auth.uid() in (t.author_uid, t.buyer_uid)
  ));

drop policy if exists "msg participants write" on public.messages;
create policy "msg participants write" on public.messages for insert
  with check (
    sender_uid = auth.uid()
    and exists (
      select 1 from public.threads t
      where t.id = thread_id and auth.uid() in (t.author_uid, t.buyer_uid)
    )
  );

-- Отримувач може позначити прочитаним (read_at)
drop policy if exists "msg recipient marks read" on public.messages;
create policy "msg recipient marks read" on public.messages for update
  using (exists (
    select 1 from public.threads t
    where t.id = thread_id and auth.uid() in (t.author_uid, t.buyer_uid)
  ))
  with check (exists (
    select 1 from public.threads t
    where t.id = thread_id and auth.uid() in (t.author_uid, t.buyer_uid)
  ));

-- ── 5. Пристрої для push (прив'язані до акаунта, не до маршруту) ──
create table if not exists public.user_push_devices (
  id         bigserial primary key,
  uid        uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth_key   text not null,
  created_at timestamptz default now(),
  unique (uid, endpoint)
);
alter table public.user_push_devices enable row level security;

drop policy if exists "own device manage" on public.user_push_devices;
create policy "own device manage" on public.user_push_devices for all
  using (uid = auth.uid()) with check (uid = auth.uid());

-- Edge Function (send-chat-push) читає пристрої отримувача через service_role
drop policy if exists "service reads devices" on public.user_push_devices;
create policy "service reads devices" on public.user_push_devices for select
  using (auth.role() = 'service_role');

-- ── 6. Realtime: вмикаємо трансляцію змін messages/threads (живий чат) ──
-- (Безпечно повторювати: додаємо в публікацію лише якщо ще немає.)
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.messages'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.threads';  exception when duplicate_object then null; end;
end $$;
