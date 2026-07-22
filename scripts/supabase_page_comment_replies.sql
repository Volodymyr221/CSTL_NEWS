-- supabase_page_comment_replies.sql
-- «СТРІЧКА» фаза 3c: відповіді на коментарі (гілки, як в Instagram).
-- Додає parent_id у page_comments: відповідь посилається на батьківський коментар.
-- 2 рівні (відповідь на відповідь чіпляється до кореневого коментаря — робить клієнт).
-- RLS не змінюється (read усе публічний; insert уже перевіряє author_uid=auth.uid()).
-- Ідемпотентно. Застосовує Вова вручну у Supabase → SQL Editor.

alter table public.page_comments
  add column if not exists parent_id bigint references public.page_comments(id) on delete cascade;

create index if not exists idx_page_comments_parent on public.page_comments (parent_id);
