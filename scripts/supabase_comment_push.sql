-- scripts/supabase_comment_push.sql
-- Згадка адресата у відповідях + сповіщення про коментарі «Стрічки» (потік 25.07).
--
-- ⚠️ НЕ НАКАТАНО АВТОМАТИЧНО: у сесії 25.07 конектор Supabase не був авторизований.
--    Виконує ВОВА вручну у Supabase → SQL Editor. Ідемпотентно (можна повторювати).
--
-- ЩО ЦЕ ДАЄ (рішення Вови 25.07)
--   1) Відповідь показує, КОМУ вона адресована: «Віктор,» на початку — клікабельне
--      імʼя у кольорі бренду, без собачки. Зберігаємо uid, а не текст (див. нижче).
--   2) Сповіщення двох типів:
--      • тобі відповіли на коментар → приходить ЗАВЖДИ, одразу (персональне);
--      • новий коментар під твоїм постом (ти адмін сторінки) → перше одразу, далі
--        вікно тиші 10 хв, після якого приходить зведене «Ще N коментарів».
--
-- 🔑 ЧОМУ uid, А НЕ ТЕКСТ «Віктор,» У САМОМУ КОМЕНТАРІ
--    Текст застигає: людина перейменувалась — у старих відповідях лишилось старе імʼя.
--    І будь-хто міг би підробити згадку, просто набравши її руками. Тримаємо посилання
--    на користувача, а імʼя підставляємо живим при показі (як уже робить liveName).

-- ── 1. Кому адресована відповідь ────────────────────────────────────────────
alter table public.page_comments
  add column if not exists reply_to_uid uuid references public.profiles(uid) on delete set null;

-- 🔒 ЗАХИСТ ВІД СПАМУ ЗГАДКАМИ. Без цієї умови будь-хто міг би вписати у reply_to_uid
--    довільного користувача і слати йому сповіщення з будь-якого поста. Дозволяємо
--    згадувати ЛИШЕ того, хто вже щось написав під ЦИМ постом — тобто коло учасників
--    саме цього обговорення. Решта політики не змінюється.
drop policy if exists "pcom insert" on public.page_comments;
create policy "pcom insert" on public.page_comments for insert with check (
  author_uid = auth.uid()
  and length(trim(text)) between 1 and 2000
  and (
    reply_to_uid is null
    or exists (
      select 1 from public.page_comments c
      where c.post_id = page_comments.post_id
        and c.author_uid = page_comments.reply_to_uid
    )
  )
);

-- ── 2. Журнал розсилок: одне сповіщення на коментар ─────────────────────────
-- Той самий прийом, що в page_push_log: функцію можуть покликати двічі (тригер +
-- добіг), і первинний ключ робить другий виклик безпечним no-op.
create table if not exists public.page_comment_push_log (
  comment_id bigint primary key references public.page_comments(id) on delete cascade,
  sent_at    timestamptz not null default now(),
  sent       int not null default 0
);
alter table public.page_comment_push_log enable row level security;
drop policy if exists "service manages comment push log" on public.page_comment_push_log;
create policy "service manages comment push log" on public.page_comment_push_log for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 3. Стан накопичення для адмінів ─────────────────────────────────────────
-- Одне вікно тиші НА ПАРУ (пост, адмін): у різних адмінів свій відлік, і сповіщення
-- про різні пости не глушать одне одного.
--   last_sent_at — коли цьому адміну востаннє пішло про цей пост;
--   pending      — скільки коментарів накопичилось за час тиші;
--   pending_since— коли зʼявився перший накопичений (для добігу).
create table if not exists public.page_comment_push_state (
  post_id       bigint      not null references public.page_posts(id) on delete cascade,
  uid           uuid        not null references public.profiles(uid)  on delete cascade,
  last_sent_at  timestamptz,
  pending       int         not null default 0,
  pending_since timestamptz,
  primary key (post_id, uid)
);
alter table public.page_comment_push_state enable row level security;
drop policy if exists "service manages comment push state" on public.page_comment_push_state;
create policy "service manages comment push state" on public.page_comment_push_state for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Добіг шукає саме за цим: є накопичене і вікно тиші вже минуло.
create index if not exists idx_ccps_pending
  on public.page_comment_push_state (pending_since)
  where pending > 0;

-- ── 4. Тригер: новий коментар → Edge-функція ────────────────────────────────
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_page_comment()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_url text := 'https://uabyfecseqnemvcqhdem.supabase.co/functions/v1/send-comment-push';
begin
  -- Секрет спільний із розсилкою постів: та сама база, та сама довіра.
  select value into v_secret from public.app_secrets where name = 'page_push_secret' limit 1;
  if v_secret is null then
    raise warning 'notify_new_page_comment: секрет page_push_secret відсутній';
    return new;
  end if;

  -- Асинхронно: публікація коментаря важливіша за сповіщення і не має падати через нього.
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',       'application/json',
                 'x-cstl-push-secret', v_secret
               ),
    body    := jsonb_build_object('comment_id', new.id),
    timeout_milliseconds := 8000
  );
  return new;
end;
$$;

-- ЛИШЕ нові коментарі (як і з постами): виправив друкарську помилку — другого
-- сповіщення не буде.
drop trigger if exists trg_notify_new_page_comment on public.page_comments;
create trigger trg_notify_new_page_comment
  after insert on public.page_comments
  for each row execute function public.notify_new_page_comment();

-- ── 5. Добіг накопичених ────────────────────────────────────────────────────
-- ⚠️ БЕЗ ЦЬОГО ЛОГІКА ТИХО ГУБИТЬ СПОВІЩЕННЯ. Зведене «Ще N коментарів» відправляє
--    НАСТУПНИЙ коментар — а якщо його не буде (настала ніч, обговорення стихло), то
--    накопичене не піде НІКОЛИ. Тому раз на хвилину перевіряємо, чи є накопичене зі
--    стухлим вікном, і досилаємо. Той самий підхід, що в сповіщеннях про автобуси.
create or replace function public.flush_page_comment_push()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_url text := 'https://uabyfecseqnemvcqhdem.supabase.co/functions/v1/send-comment-push';
begin
  select value into v_secret from public.app_secrets where name = 'page_push_secret' limit 1;
  if v_secret is null then return; end if;

  if exists (select 1 from public.page_comment_push_state
             where pending > 0 and pending_since < now() - interval '10 minutes') then
    perform net.http_post(
      url     := v_url,
      headers := jsonb_build_object('Content-Type','application/json','x-cstl-push-secret', v_secret),
      body    := jsonb_build_object('flush', true),
      timeout_milliseconds := 8000
    );
  end if;
end;
$$;

create extension if not exists pg_cron with schema extensions;
select cron.unschedule('flush-comment-push') where exists (
  select 1 from cron.job where jobname = 'flush-comment-push'
);
select cron.schedule('flush-comment-push', '* * * * *', 'select public.flush_page_comment_push()');

-- ── Перевірка ───────────────────────────────────────────────────────────────
--   select column_name from information_schema.columns
--     where table_name='page_comments' and column_name='reply_to_uid';   -- колонка є
--   select tgname from pg_trigger where tgname='trg_notify_new_page_comment';
--   select * from page_comment_push_state order by pending_since desc limit 10;
--   select status_code, content from net._http_response order by created desc limit 5;
--   select jobname, schedule from cron.job where jobname='flush-comment-push';
