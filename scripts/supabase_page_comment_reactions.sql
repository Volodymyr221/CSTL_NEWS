-- supabase_page_comment_reactions.sql
-- «СТРІЧКА» фаза 3b: лайк ❤️ на КОМЕНТАРІ постів (як в Instagram).
-- Одна реакція на коментар на користувача, тільки авторизовані (як лайк поста).
-- READ публічний (лічильник видно всім), INSERT/DELETE — лише свій рядок.
-- REPLICA IDENTITY FULL — щоб realtime DELETE віддавав comment_id/user_id.
-- Ідемпотентно. Застосовує Вова вручну у Supabase → SQL Editor.

create table if not exists public.page_comment_reactions (
  id          bigserial primary key,
  comment_id  bigint not null references public.page_comments(id) on delete cascade,
  user_id     text   not null,                 -- uid акаунту (тільки авторизовані)
  created_at  timestamptz default now(),
  unique (comment_id, user_id)
);
create index if not exists idx_pcomreact_comment on public.page_comment_reactions (comment_id);

alter table public.page_comment_reactions enable row level security;

drop policy if exists "pcomreact read"   on public.page_comment_reactions;
drop policy if exists "pcomreact insert" on public.page_comment_reactions;
drop policy if exists "pcomreact delete" on public.page_comment_reactions;

create policy "pcomreact read"   on public.page_comment_reactions for select using (true);
create policy "pcomreact insert" on public.page_comment_reactions for insert with check (
  auth.uid() is not null and user_id = auth.uid()::text
);
create policy "pcomreact delete" on public.page_comment_reactions for delete using (
  user_id = auth.uid()::text or is_admin()
);

alter table public.page_comment_reactions replica identity full;

-- Realtime publication (жива синхронізація лічильника лайків коментарів).
do $$ begin
  begin alter publication supabase_realtime add table public.page_comment_reactions;
    exception when duplicate_object then null; end;
end $$;
