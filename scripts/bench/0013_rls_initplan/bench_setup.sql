-- Підробка Supabase: схема auth, ролі, таблиці з політиками всіх форм.
create schema auth;
create schema storage;
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.role() returns text language sql stable as
  $$ select auth.jwt() ->> 'role' $$;
do $r$ begin create role authenticated nologin; exception when duplicate_object then null; end $r$;
grant usage on schema auth, public, storage to authenticated;
grant execute on all functions in schema auth to authenticated;

create table public.posts (id int primary key, user_id uuid, author text, published bool);
create table public.members (page_id int, uid uuid);
create table public.notes (id int, owner text, email text);
create table storage.objects (id int, owner uuid, bucket_id text);
grant select, insert, update, delete on public.posts, public.members, public.notes, storage.objects to authenticated;

alter table public.posts   enable row level security;
alter table public.members enable row level security;
alter table public.notes   enable row level security;
alter table storage.objects enable row level security;

-- форми, що трапляються в наших scripts/*.sql
create policy "posts read" on public.posts for select
  using (published or user_id = auth.uid());
create policy "posts insert own" on public.posts for insert
  with check (auth.uid() = user_id and author = auth.uid()::text);
create policy "posts update own" on public.posts for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "posts delete via page" on public.posts for delete
  using (exists (select 1 from public.members m where m.uid = auth.uid() and m.page_id = posts.id));
create policy "members read" on public.members for select
  using (uid = auth.uid() or auth.role() = 'service_role');
create policy "notes already wrapped" on public.notes for select
  using (owner = (select auth.uid())::text);
create policy "notes by email" on public.notes for update
  using (email = auth.jwt() ->> 'email');
create policy "notes public" on public.notes for insert with check (true);
create policy "objects own" on storage.objects for select
  using (bucket_id = 'avatars' and owner = auth.uid());

insert into public.posts values
  (1, '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', false),
  (2, '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', false),
  (3, '22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', true);
insert into public.members values (1, '11111111-1111-1111-1111-111111111111'), (2, '22222222-2222-2222-2222-222222222222');
insert into public.notes values (1, '11111111-1111-1111-1111-111111111111', 'a@x.ua'), (2, 'zzz', 'b@x.ua');
insert into storage.objects values (1, '11111111-1111-1111-1111-111111111111', 'avatars'), (2, '22222222-2222-2222-2222-222222222222', 'avatars');
