-- supabase_seen_marks.sql
-- 🔴 24.08.2026 — «ЩО Я ВЖЕ БАЧИВ» СИНХРОНІЗУЄТЬСЯ МІЖ ПРИСТРОЯМИ.
--
-- Питання Вови дослівно: «А не можна щоб синхронізація була з акаунтом, тобто
-- якщо прочитаю з телефону і зайду з компʼютера, то і там буде рівно те саме
-- прочитано?»
--
-- Можна, і це правильніше. Уранці того ж дня мітки зробили ІМЕННИМИ (щоб другий
-- акаунт на телефоні не успадковував чужі), але лишили на пристрої — і це було
-- свідомо дешевше рішення, назване боргом у `NOW.md`. Тепер борг закривається.
--
-- ═══ ДВІ ТАБЛИЦІ, БО МІТКИ ДВОХ РІЗНИХ ФОРМ ═════════════════════════════════
--   • `user_seen_marks`   — ОДНЕ число на розділ: коли я востаннє заходив.
--                           Чотири розділи: news · board · chat · feed.
--   • `user_seen_threads` — МАПА «яку тему коли дивився» (Питання). Тут одного
--                           числа замало: теми читаються вибірково.
--
-- ═══ 🔑 ГОЛОВНЕ РІШЕННЯ: МІТКА РУХАЄТЬСЯ ТІЛЬКИ ВПЕРЕД ══════════════════════
-- Без цього правила синхронізація стає ГІРШОЮ за її відсутність. Сценарій:
-- відкритий зі вчора таб на компʼютері прокидається, дописує свою СТАРУ мітку —
-- і на телефоні все «непрочитується» назад. Людина бачить купу «нових» речей,
-- які вже читала, і перестає вірити лічильнику взагалі.
-- ✅ Тому запис іде тільки через `greatest(...)`: новіше замінює старіше,
-- старіше не замінює нічого.
--
-- 🛑 І ЧАС БЕРЕ СЕРВЕР, А НЕ ТЕЛЕФОН. Годинник на пристрої може відставати або
-- бігти вперед (у людини руками виставлений час, зона, дешевий Android). Якби
-- клієнт присилав своє «зараз», телефон із годинником на добу вперед поставив би
-- мітку в майбутнє, і `greatest` уже НІКОЛИ не пустив би туди правду.
-- Саме тому це функції, а не просто `upsert` з клієнта.

-- ── 1. МІТКИ РОЗДІЛІВ ───────────────────────────────────────────────────────
create table if not exists public.user_seen_marks (
  uid     uuid not null references auth.users(id) on delete cascade,
  scope   text not null check (scope in ('news', 'board', 'chat', 'feed')),
  seen_at timestamptz not null default now(),
  primary key (uid, scope)
);
alter table public.user_seen_marks enable row level security;

-- Лише свої — той самий зразок, що `saved_posts` і `saved_articles`.
drop policy if exists "seen marks own" on public.user_seen_marks;
create policy "seen marks own" on public.user_seen_marks for all
  using (uid = auth.uid()) with check (uid = auth.uid());

-- ── 2. МІТКИ ТЕМ (Питання) ──────────────────────────────────────────────────
-- ⚠️ `post_id` без зовнішнього ключа НАВМИСНО: тема може бути видалена, а мітка
-- «я це читав» від того не стає брехнею. Каскад стер би історію перегляду разом
-- із чужим постом, тобто дія ІНШОЇ людини міняла б МОЮ памʼять.
create table if not exists public.user_seen_threads (
  uid     uuid not null references auth.users(id) on delete cascade,
  post_id bigint not null,
  seen_at timestamptz not null default now(),
  primary key (uid, post_id)
);
alter table public.user_seen_threads enable row level security;

drop policy if exists "seen threads own" on public.user_seen_threads;
create policy "seen threads own" on public.user_seen_threads for all
  using (uid = auth.uid()) with check (uid = auth.uid());

-- ── 3. ПОСТАВИТИ МІТКУ РОЗДІЛУ ──────────────────────────────────────────────
-- Час бере сервер (`now()`), клієнт його НЕ присилає — див. пояснення в шапці.
create or replace function public.mark_seen(p_scope text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  ts timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.user_seen_marks (uid, scope, seen_at)
  values (auth.uid(), p_scope, now())
  on conflict (uid, scope) do update
     set seen_at = greatest(public.user_seen_marks.seen_at, excluded.seen_at)
  returning seen_at into ts;

  return ts;
end;
$$;

revoke all on function public.mark_seen(text) from public;
grant execute on function public.mark_seen(text) to authenticated;

-- ── 4. ПОСТАВИТИ МІТКУ ТЕМИ ─────────────────────────────────────────────────
create or replace function public.mark_thread_seen(p_post_id bigint)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  ts timestamptz;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  insert into public.user_seen_threads (uid, post_id, seen_at)
  values (auth.uid(), p_post_id, now())
  on conflict (uid, post_id) do update
     set seen_at = greatest(public.user_seen_threads.seen_at, excluded.seen_at)
  returning seen_at into ts;

  return ts;
end;
$$;

revoke all on function public.mark_thread_seen(bigint) from public;
grant execute on function public.mark_thread_seen(bigint) to authenticated;

-- ── 5. ПЕРЕНЕСТИ МІТКУ, ЯКА ВЖЕ ЛЕЖИТЬ НА ПРИСТРОЇ ──────────────────────────
-- 🔑 Тут клієнт ПРИСИЛАЄ час — і це єдине місце, де так можна: він переносить
-- те, що вже записано на цьому телефоні, а не каже «зараз».
-- ⚠️ Але `greatest` лишається, і додано стелю `now()`: телефон із годинником у
-- майбутньому не зможе поставити мітку, яку потім ніщо не перекриє.
create or replace function public.seed_seen(p_scope text, p_seen_at timestamptz)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  ts timestamptz;
  safe timestamptz := least(p_seen_at, now());
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_seen_at is null then return null; end if;

  insert into public.user_seen_marks (uid, scope, seen_at)
  values (auth.uid(), p_scope, safe)
  on conflict (uid, scope) do update
     set seen_at = greatest(public.user_seen_marks.seen_at, excluded.seen_at)
  returning seen_at into ts;

  return ts;
end;
$$;

revoke all on function public.seed_seen(text, timestamptz) from public;
grant execute on function public.seed_seen(text, timestamptz) to authenticated;

-- ── ЯК ПЕРЕВІРИТИ ───────────────────────────────────────────────────────────
--   select scope, seen_at from public.user_seen_marks where uid = '<свій>';
--   -- поставити мітку двічі: друге значення НЕ МОЖЕ бути меншим за перше.
