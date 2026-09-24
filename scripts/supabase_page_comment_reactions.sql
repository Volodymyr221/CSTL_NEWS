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

-- 🔴 24.09.2026 — ЦЕЙ РЯДОК БУВ `using (true)` І ВІДКОТИВ БИ ЖИВЕ ВИПРАВЛЕННЯ.
-- Звірка з продом (аудит 24.09) показала: на базі політика ВЖЕ звужена до
-- `page_comment_visible(comment_id)`, а файл лишався зі старим `true` — і, що
-- гірше, рядком вище стоїть `drop policy if exists`. Тобто повторний прогін
-- цього файлу МОВЧКИ зняв би звуження і знову відкрив би анонімам рядки
-- реакцій під невидимими коментарями. Це саме той клас вади, через який у
-- `NOW.md` стоїть правило «звіряй `pg_get_functiondef`, а не файл у репо».
--
-- ⚠️ ЧОМУ ЧЕРЕЗ `do $$`, А НЕ ПРОСТО ЗАМІНЕНИЙ РЯДОК. `page_comment_visible()`
-- заводить ІНША міграція. Якби тут стояв прямий виклик, цей файл на чистій базі
-- падав би з «функції немає» — і людина, яка накочує з нуля, лишилась би взагалі
-- без політики читання, тобто з мовчки порожнім списком лайків. Запасний шлях
-- відтворює стару поведінку, але гучно каже про це.
do $$
begin
  if to_regprocedure('public.page_comment_visible(bigint)') is not null then
    create policy "pcomreact read" on public.page_comment_reactions
      for select using (public.page_comment_visible(comment_id));
  else
    raise warning 'page_comment_visible() ще немає — ставлю широку політику читання. Накотіть supabase_page_comments_visibility і перезапустіть цей файл.';
    create policy "pcomreact read" on public.page_comment_reactions
      for select using (true);
  end if;
end $$;
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
