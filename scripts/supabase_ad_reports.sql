-- supabase_ad_reports.sql
-- СКАРГИ НА ОГОЛОШЕННЯ — кнопка «Поскаржитися» нарешті кудись пише.
--
-- ЩО БУЛО ДО ЦЬОГО (знайдено власним аудитом 02.08 і визнано відкритим):
--   modal.querySelector('[data-ad-report]').addEventListener('click', () => {
--     showToast('Дякуємо. Ми перевіримо це оголошення.');
--   });
-- Тобто застосунок ОБІЦЯВ дію, якої не існувало. Це гірше за відсутню кнопку:
-- людина вважає, що поскаржилась, і більше не пише Вові напряму.
--
-- ✅ НАКАТАНО 02.08 (міграції `ad_reports_table_and_guards` + `ad_reports_machine_codes`).
-- Ідемпотентно (create if not exists / create or replace), повторний прогін безпечний.
-- Заміряно після накату: 4 політики · 2 тригери · RLS увімкнено.
--
-- ── ЧОТИРИ РІШЕННЯ, ЯКІ ТУТ ЗАКОДОВАНІ ──────────────────────────────────────
--
-- 1. ЗНІМОК НА МОМЕНТ СКАРГИ (`post_title`, `post_owner_uid`, і обидва імені).
--    Оголошення редагують і видаляють, профілі перейменовують. Без знімка скарга
--    на видалене оголошення перетворюється на «хтось поскаржився на щось» —
--    тобто на сміття в модерації. Знімок робить ТРИГЕР, а не клієнт: інакше
--    зловмисник надіслав би чужий `post_owner_uid` і підставив би людину.
--
-- 2. ОДНА СКАРГА ВІД ОДНІЄЇ ЛЮДИНИ НА ОДНЕ ОГОЛОШЕННЯ (unique). Без цього одна
--    ображена людина накидає сотню рядків, і вхідні модерації мертві.
--
-- 3. НА СВОЄ ОГОЛОШЕННЯ ПОСКАРЖИТИСЬ НЕ МОЖНА — відхиляє тригер.
--
-- 4. ЛИШЕ ЗАЛОГІНЕНИМ. Анонімна скарга це і канал спаму, і водночас нічого не
--    варта: нема з ким зʼясувати деталі. Той самий принцип, що вже ухвалений
--    01.08 у `supabase_anon_lockdown.sql` («анонім лише переглядає»).
--
-- 🔴 ЧОМУ БЕЗ ЗОВНІШНЬОГО КЛЮЧА на `posts`. `on delete cascade` знищив би скаргу
--    разом з оголошенням — тобто рівно тоді, коли вона найпотрібніша (порушник
--    прибрав доказ). `on delete set null` лишив би рядок, але тоді `post_id`
--    мусить бути nullable і зникає звʼязок із самим оголошенням, поки воно живе.
--    Обрано: звичайна колонка + знімок. Цілісність тут менш цінна за історію.

create table if not exists public.ad_reports (
  id                bigserial primary key,
  post_id           bigint      not null,
  reason            text        not null,
  details           text,

  -- хто поскаржився
  reporter_uid      uuid        not null default auth.uid(),
  reporter_name     text,

  -- знімок оголошення на момент скарги (заповнює тригер)
  post_title        text,
  post_owner_uid    uuid,
  post_owner_name   text,

  -- стан розгляду: вхідні працюють як пошта
  status            text        not null default 'new',
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz,

  constraint ad_reports_reason_chk check (
    reason in ('scam', 'spam', 'offensive', 'false_info', 'outdated', 'other')
  ),
  constraint ad_reports_status_chk check (status in ('new', 'reviewed', 'dismissed')),
  -- «Інше» без пояснення не каже нічого — і тому не приймається.
  constraint ad_reports_other_needs_details check (
    reason <> 'other' or (details is not null and length(btrim(details)) >= 5)
  ),
  constraint ad_reports_once unique (post_id, reporter_uid)
);

comment on table public.ad_reports is
  'Скарги користувачів на оголошення Дошки. Знімок автора й назви робиться тригером на момент скарги.';

create index if not exists ad_reports_new_idx  on public.ad_reports (created_at desc) where status = 'new';
create index if not exists ad_reports_post_idx on public.ad_reports (post_id);

-- ── ТРИГЕР: знімок + сторожі ────────────────────────────────────────────────
-- SECURITY DEFINER — щоб прочитати `profiles` авторa (RLS там «own read», тобто
-- клієнт чужий рядок не бачить). Саме тому знімок мусить робити база, а не код.
create or replace function public.ad_reports_fill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p record;
begin
  -- ⚠️ Кидаємо МАШИННІ КОДИ, а не готові українські фрази. Людські формулювання в
  -- проєкті живуть в ОДНОМУ місці (`REPORT_ERRORS` у src/core/supabase.js); якби базa
  -- слала текст, він став би другою копією словника — а дві копії тут уже розходились
  -- тричі. Заразом `netErrorText` не поглинає код у загальне «не вдалося зберегти».
  if auth.uid() is null then
    raise exception 'report_auth';
  end if;
  -- reporter_uid не довіряємо клієнту: ставимо його самі
  new.reporter_uid := auth.uid();

  select id, title, owner_uid into p from public.posts where id = new.post_id;
  if p.id is null then
    raise exception 'report_no_post';
  end if;
  if p.owner_uid is not null and p.owner_uid = auth.uid() then
    raise exception 'report_self';
  end if;

  new.post_title      := p.title;
  new.post_owner_uid  := p.owner_uid;
  new.post_owner_name := (select name from public.profiles where uid = p.owner_uid);
  new.reporter_name   := (select name from public.profiles where uid = auth.uid());

  -- Обрізаємо опис: у поле вводу і так стоїть стеля, але база не має вірити клієнту.
  new.details := nullif(btrim(left(coalesce(new.details, ''), 1000)), '');

  -- Гальмо флуду: не більше 10 скарг на добу від однієї людини. Unique вище закриває
  -- повтори на ОДНЕ оголошення, це правило — про «пройшовся по всій Дошці».
  if (select count(*) from public.ad_reports
      where reporter_uid = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'report_flood';
  end if;

  -- Стан і час розгляду ставить лише адмін (нижче) — при вставці завжди «нова».
  new.status := 'new';
  new.reviewed_at := null;
  return new;
end;
$$;

drop trigger if exists ad_reports_fill_trg on public.ad_reports;
create trigger ad_reports_fill_trg
  before insert on public.ad_reports
  for each row execute function public.ad_reports_fill();

-- ── ПРАВА ───────────────────────────────────────────────────────────────────
alter table public.ad_reports enable row level security;

-- Писати — лише залогіненим і лише від свого імені.
drop policy if exists "ad_reports insert own" on public.ad_reports;
create policy "ad_reports insert own" on public.ad_reports
  for insert to authenticated
  with check (reporter_uid = auth.uid());

-- 🔴 ЧИТАТИ — ЛИШЕ АДМІНУ. Скарга містить імена обох сторін і текст звинувачення;
-- віддавати її будь-кому означало б зробити з модерації публічний ганебний стовп.
-- ⚠️ Автор скарги теж НЕ бачить свою — інакше `select` віддав би йому знімок із
-- імʼям власника оголошення, якого він міг і не знати.
drop policy if exists "ad_reports admin read" on public.ad_reports;
create policy "ad_reports admin read" on public.ad_reports
  for select using (public.is_admin());

-- Міняти стан («Переглянуто» / «Відхилити») — лише адмін.
drop policy if exists "ad_reports admin update" on public.ad_reports;
create policy "ad_reports admin update" on public.ad_reports
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ad_reports admin delete" on public.ad_reports;
create policy "ad_reports admin delete" on public.ad_reports
  for delete using (public.is_admin());

-- ⚠️ Тригер на UPDATE стежить, щоб адмін міняв ЛИШЕ стан: знімок і текст скарги
-- мусять лишитись такими, якими їх надіслала людина, інакше журнал модерації
-- перестає бути доказом.
create or replace function public.ad_reports_guard_update()
returns trigger
language plpgsql
as $$
begin
  if new.post_id is distinct from old.post_id
     or new.reason is distinct from old.reason
     or new.details is distinct from old.details
     or new.reporter_uid is distinct from old.reporter_uid
     or new.reporter_name is distinct from old.reporter_name
     or new.post_title is distinct from old.post_title
     or new.post_owner_uid is distinct from old.post_owner_uid
     or new.post_owner_name is distinct from old.post_owner_name
     or new.created_at is distinct from old.created_at then
    raise exception 'Змінювати можна лише стан розгляду скарги';
  end if;
  if new.status is distinct from old.status then
    new.reviewed_at := case when new.status = 'new' then null else now() end;
  end if;
  return new;
end;
$$;

drop trigger if exists ad_reports_guard_update_trg on public.ad_reports;
create trigger ad_reports_guard_update_trg
  before update on public.ad_reports
  for each row execute function public.ad_reports_guard_update();
