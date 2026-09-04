-- scripts/supabase_events_reminders.sql
-- ПОДІЇ СПІЛЬНОТ: НАГАДУВАННЯ, ЯКІ ЛЮДИНА ВВІМКНУЛА САМА — 04.09.2026.
-- Накачено на прод через Supabase MCP: міграції `event_reminders_and_notif_events`
-- і `event_reminders_cron`. Тут — дзеркало для історії в репо. Ідемпотентне.
--
-- 🗣️ ЗАМОВЛЕННЯ ВОВИ: «щоб людина могла створити нагадування, нажати сповіщення
-- за якийсь певний термін, коли буде ця подія проходити». На уточнення, кому
-- дзвонити: «в тому випадку якщо людина сама вибрала».
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔑 МОДЕЛЬ: ПОДІЯ — ЦЕ ДОПИС ІЗ ДАТОЮ, А НЕ НОВА СУТНІСТЬ.
-- `page_posts.event_date/_time/_location` існують із 23.07. Другої таблиці не
-- заводимо, тому подія безкоштовно отримує коментарі, лайки, редагування, мʼяке
-- видалення, realtime і модерацію чернеток — усе, що вже написано для дописів.
--
-- 🔴 ЩО БУЛО ЗЛАМАНЕ ДО ЦЬОГО (заміряно 04.09):
--   • подій у застосунку було ДВА НЕЗАЛЕЖНІ СВІТИ — події спільнот у базі
--     (0 живих) і статичний `data/events.json` (7 записів, 0 майбутніх), який
--     читав віджет на Громаді. Спільнота могла опублікувати подію, і у віджет
--     вона не потрапила б НІКОЛИ;
--   • нагадувань про подію не існувало взагалі: те, що так звалось, було
--     завантаженням `.ics`-файлу і лише для статичних подій.
-- ➡️ Рішення Вови: «зводь» — одне джерело, події спільнот.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. ПʼЯТИЙ ТИП СПОВІЩЕНЬ ─────────────────────────────────────────────────
-- 🔑 Окремий від «Стрічки» навмисно: «Стрічка» це нові дописи (шум, який можна
-- не хотіти), а нагадування людина попросила САМА. Один вимикач на двох означав
-- би, що вимикаючи шум, вона мовчки втрачає власний вибір.
-- ⚠️ Клієнт мусить знати про цю тему теж: `NOTIF_TOPICS` у `core/supabase.js` —
-- біле правило, і тема, якої там немає, у базу НЕ ЗАПИШЕТЬСЯ.
alter table public.notif_prefs
  add column if not exists events boolean not null default true;

-- ── 2. ПІДПИСКА ЛЮДИНИ НА ПОДІЮ ─────────────────────────────────────────────
-- 🛑 ЧОМУ ОКРЕМА ТАБЛИЦЯ, А НЕ `push_subscriptions`: та заточена під автобуси
-- (`route_id`, `track_date`, `dep_time`, чотири прапорці `notified_*`) і несе
-- endpoint ПРИСТРОЮ в кожному рядку. Підписка на подію — факт про ЛЮДИНУ:
-- ввімкнула один раз, прийти має на всі її пристрої. Пристрої вже лежать окремо
-- (`user_push_devices`) — саме звідти їх бере `send-answer-push`.
create table if not exists public.event_reminders (
  id         bigserial primary key,
  post_id    bigint not null references public.page_posts(id) on delete cascade,
  uid        uuid   not null references public.profiles(uid)  on delete cascade,
  -- Журнал надісланого — В ЦЬОМУ Ж РЯДКУ: він і так один на пару «людина+подія»,
  -- і саме він відповідає на питання «чи вже дзвонили». Окрема таблиця дала б
  -- два джерела правди про той самий факт (клас B-27).
  notified_day  boolean not null default false,
  notified_hour boolean not null default false,
  created_at timestamptz default now(),
  unique (post_id, uid)
);

create index if not exists idx_event_reminders_post on public.event_reminders (post_id);
create index if not exists idx_event_reminders_uid  on public.event_reminders (uid);

alter table public.event_reminders enable row level security;

-- ⚠️ SELECT-ПОЛІТИКА ОБОВʼЯЗКОВА, і не лише «щоб читати»: будь-який запис із
-- `returning` мусить ще й ПРОЧИТАТИ рядок, і без неї прийшла б помилка `42501`,
-- яка називає INSERT і веде розслідування не туди. Правило №11-БІС, двічі
-- коштувало проєкту діб (`push_subscriptions` 16.08, `page_comments` 22.08).
drop policy if exists "evr own read"   on public.event_reminders;
drop policy if exists "evr own insert" on public.event_reminders;
drop policy if exists "evr own delete" on public.event_reminders;
create policy "evr own read"   on public.event_reminders for select using (uid = auth.uid());
create policy "evr own insert" on public.event_reminders for insert with check (uid = auth.uid());
create policy "evr own delete" on public.event_reminders for delete using (uid = auth.uid());

-- ── 3. ПЕРЕМКНУТИ НАГАДУВАННЯ ───────────────────────────────────────────────
-- Одна дія замість «спробуй insert → спіймай дубль → зроби delete».
-- 🛑 `security invoker` (за замовчуванням): RLS лишається чинною, функція не дає
-- прав, яких у людини немає. Вона лише прибирає з клієнта дві подорожі в мережу.
create or replace function public.toggle_event_reminder(p_post_id bigint)
returns boolean
language plpgsql
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;

  delete from public.event_reminders
   where post_id = p_post_id and uid = v_uid;
  if found then
    return false;
  end if;

  -- Нагадування має сенс лише для допису, який СПРАВДІ є подією і не видалений.
  -- Без перевірки підписатись можна було б на будь-який допис.
  if not exists (
    select 1 from public.page_posts p
     where p.id = p_post_id and p.event_date is not null and p.deleted_at is null
  ) then
    raise exception 'not an event' using errcode = 'P0001';
  end if;

  insert into public.event_reminders (post_id, uid) values (p_post_id, v_uid);
  return true;
end;
$function$;

grant execute on function public.toggle_event_reminder(bigint) to authenticated;

-- ── 4. СКІЛЬКИ ЛЮДЕЙ ЧЕКАЄ НА ПОДІЮ ─────────────────────────────────────────
-- 🛑 SECURITY DEFINER саме тому, що RLS вище навмисно ховає ЧУЖІ рядки —
-- звичайний `count` завжди давав би 0 або 1. Віддаємо ЧИСЛО без імен.
create or replace function public.event_reminder_counts(post_ids bigint[])
returns table (post_id bigint, cnt bigint)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select r.post_id, count(*)::bigint
  from public.event_reminders r
  where r.post_id = any(post_ids[1:500])
  group by r.post_id
$function$;

grant execute on function public.event_reminder_counts(bigint[]) to anon, authenticated;

-- ── 5. РОЗКЛАД ──────────────────────────────────────────────────────────────
-- 🔑 Секрет читається В МОМЕНТ ВИКЛИКУ, а не вписаний у текст розкладу: тоді
-- ротація секрету не вимагає чіпати cron.
-- 🛑 `verify_jwt` у функції ВИМКНЕНО (її кличе база, а базі нема чим показати
-- токен людини), тому `x-cstl-push-secret` тут ЄДИНИЙ рубіж, а не другий.
create or replace function public.notify_event_reminders()
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  секрет text;
begin
  select value into секрет from public.app_secrets where name = 'page_push_secret';
  if секрет is null or секрет = '' then
    return;   -- немає чим підтвердити довіру — краще нічого, ніж виклик без підпису
  end if;

  perform net.http_post(
    url     := 'https://uabyfecseqnemvcqhdem.supabase.co/functions/v1/send-event-push',
    headers := jsonb_build_object(
      'Content-Type',       'application/json',
      'x-cstl-push-secret', секрет),
    body    := '{}'::jsonb);
end;
$$;

revoke execute on function public.notify_event_reminders() from public, anon, authenticated;

-- ⚠️ Крок 5 хвилин, а вікно спрацювання у функції ±10 хв: вікно мусить бути
-- ШИРШИМ за крок, інакше нагадування провалиться між двома запусками і не прийде
-- взагалі. Дешево: коли слати нема чого, функція виходить одразу.
select cron.unschedule('event-reminders')
 where exists (select 1 from cron.job where jobname = 'event-reminders');

select cron.schedule('event-reminders', '*/5 * * * *',
                     $$select public.notify_event_reminders()$$);

-- ─────────────────────────────────────────────────────────────────────────────
-- 🔗 КЛІЄНТСЬКА ПОЛОВИНА:
--   • `core/supabase.js` — `feedSortKey()` (републікація в день події),
--     `eventState()`, `fetchUpcomingEvents()`, `toggleEventReminder()`;
--   • `tabs/feed.js` — шапка події замість рядка з емодзі, кнопка «Нагадати»;
--   • `tabs/community.js` + `community-blocks.js` — секція «Події громади»;
--   • `core/account-ui.js` — пʼятий вимикач.
--
-- ✅ Перевірено наживо 04.09: `select public.notify_event_reminders();` →
-- відповідь функції **200 `{"sent":0,"reason":"nothing pending"}`**, тобто
-- ланцюг «cron → база → Edge Function → секрет» замкнений.
--
-- 🛡 Стереже `tests/community-events.mjs`.
