-- scripts/supabase_fundraisers.sql
-- ЗБОРИ КОШТІВ: публікація з адмінки + заявки від жителів (17.08.2026).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 НАВІЩО ПЕРЕЇЗД. До 17.08 збори лежали у файлі `data/fundraisers.json` у git.
-- Це працювало, поки їх вписував Вова руками через GitHub. Замовлення 17.08 —
-- створювати збори З АДМІНКИ і приймати заявки від людей. Адмінка (`admin.html`)
-- пише в Supabase і НЕ МОЖЕ писати в git: для цього їй потрібен був би ключ
-- запису в репозиторій, а він лежав би у браузері, тобто у всіх на видноті.
-- ➡️ Отже дані мусять переїхати в базу. Переїзд був передбачений заздалегідь:
-- форма запису в JSON навмисно пласка, тому колонки тут — рівно ті самі поля.
--
-- 🔑 ЗРАЗОК УЗЯТО З НАЯВНОГО, А НЕ ВИГАДАНО: `announcements` (адмін створює →
-- застосунок показує) і `ad_reports` (людина подає → адмін розглядає). Обидва
-- шляхи в проєкті вже працюють; тут вони просто сходяться в одній темі.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 ГОЛОВНЕ РІШЕННЯ СХЕМИ: ЗАЯВКА І ЗБІР МАЮТЬ ОДНАКОВІ ПОЛЯ.
--
-- Не «схожі», а однакові — і саме тому схвалення це ОДНА кнопка
-- (`approve_fundraiser_request`), а не переписування руками. Якби поля різнились,
-- адмін щоразу набирав би дані заново, і рано чи пізно зʼявилась би друкарська
-- помилка В ПОСИЛАННІ НА ЧУЖУ БАНКУ — найдорожча помилка, яка тут можлива.
--
-- ⚠️ Тому при зміні полів ТРЕБА міняти обидві таблиці разом. Сторож на це —
-- перевірка «набори колонок збігаються» в `tests/home.mjs` не поставиш (то
-- браузерний стенд), тож на розходження ловить `fundraiser_field_parity()` нижче.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ЗБОРИ
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.fundraisers (
  id          bigserial primary key,

  -- Поля, які бачить людина (дзеркалять формат `data/fundraisers.json`).
  title       text    not null,
  org         text    not null,          -- 🔴 ХТО збирає. Без цього не показуємо
  url         text    not null,          -- 🔴 посилання на банку, тільки https
  goal        bigint,                    -- ціль у гривнях; null → комірки немає
  photo       text,
  note        text,
  kind        text    not null default 'community',
  until       date,                      -- до якої дати; null → безстроковий
  place       text,
  verified    boolean not null default false,
  active      boolean not null default true,

  -- Службове.
  sort_order  int     not null default 0,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- 🔴 ВАЛІДАЦІЯ СТОЇТЬ У БАЗІ, А НЕ ЛИШЕ У ФОРМІ. Форму можна обійти — базу ні,
  -- а йдеться про гроші. Кожне правило тут дзеркалить те, що вже перевіряє
  -- `loadFundraisers()` у клієнті: збір, який не пройде клієнтський фільтр,
  -- взагалі не має потрапити в таблицю — інакше він мовчки лежав би «наче є».
  constraint fundraisers_title_ok  check (length(btrim(title)) between 3 and 120),
  constraint fundraisers_org_ok    check (length(btrim(org))   between 2 and 80),
  constraint fundraisers_url_https check (url ~* '^https://' and length(url) <= 500),
  constraint fundraisers_goal_ok   check (goal is null or (goal > 0 and goal <= 100000000)),
  constraint fundraisers_kind_ok   check (kind in ('military', 'humanitarian', 'community')),
  constraint fundraisers_note_ok   check (note is null or length(note) <= 400)
);

-- Індекс під єдиний запит застосунку: активні, найтерміновіші першими.
create index if not exists fundraisers_active_idx
  on public.fundraisers (active, sort_order desc, until nulls last);

comment on table public.fundraisers is
  'Збори коштів на головній. Створює адмін; житель подає заявку в fundraiser_requests.';
comment on column public.fundraisers.verified is
  'Позначка «перевірено». Ставиться ОКРЕМОЮ дією, не автоматично при схваленні: схвалив = «ми це пропустили», перевірив = «ми це перевірили». Різні рівні відповідальності.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. ЗАЯВКИ ВІД ЖИТЕЛІВ
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.fundraiser_requests (
  id            bigserial primary key,

  -- ── ТІ САМІ ПОЛЯ, ЩО В ЗБОРІ (див. блок «головне рішення схеми» вгорі) ──
  title       text    not null,
  org         text    not null,
  url         text    not null,
  goal        bigint,
  photo       text,
  note        text,
  kind        text    not null default 'community',
  until       date,
  place       text,

  -- ── Контакт заявника. 🔴 Обовʼязковий: збір публікується лише після живої
  --    розмови, а без телефона розмови не буде. Це не бюрократія — це єдине,
  --    що відрізняє «ми перевірили людину» від «нам щось надіслали».
  contact_name  text not null,
  contact_phone text not null,
  author_uid    uuid not null default auth.uid(),
  -- Знімок імені на момент подачі. Той самий прийом, що в `ad_reports`: людина
  -- може перейменуватись чи видалити акаунт, а заявка мусить лишитись читабельною.
  author_name   text,

  -- ── Модерація ──
  status        text not null default 'new',   -- new | contacted | approved | rejected
  admin_note    text,
  fundraiser_id bigint references public.fundraisers(id) on delete set null,
  created_at    timestamptz not null default now(),
  reviewed_at   timestamptz,

  constraint freq_title_ok  check (length(btrim(title)) between 3 and 120),
  constraint freq_org_ok    check (length(btrim(org))   between 2 and 80),
  constraint freq_url_https check (url ~* '^https://' and length(url) <= 500),
  constraint freq_goal_ok   check (goal is null or (goal > 0 and goal <= 100000000)),
  constraint freq_kind_ok   check (kind in ('military', 'humanitarian', 'community')),
  constraint freq_note_ok   check (note is null or length(note) <= 400),
  constraint freq_phone_ok  check (length(btrim(contact_phone)) between 5 and 30),
  constraint freq_name_ok   check (length(btrim(contact_name))  between 2 and 80),
  constraint freq_status_ok check (status in ('new', 'contacted', 'approved', 'rejected'))
);

create index if not exists freq_status_idx on public.fundraiser_requests (status, created_at desc);
create index if not exists freq_author_idx on public.fundraiser_requests (author_uid, created_at desc);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ТРИГЕРИ
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fundraisers_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_fundraisers_touch on public.fundraisers;
create trigger trg_fundraisers_touch
  before update on public.fundraisers
  for each row execute function public.fundraisers_touch();

-- Знімок імені + антифлуд заявок.
-- 🔑 `SECURITY DEFINER` потрібен рівно для читання `profiles`: RLS не дає
-- клієнту дивитись чужі профілі, а імʼя треба взяти НА СЕРВЕРІ — інакше його
-- підставляв би сам клієнт, тобто підробив би будь-хто.
create or replace function public.freq_fill()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  свіжих int;
begin
  -- Стеля 3 заявки на добу. Не «про всяк випадок»: форма подачі відкрита всім
  -- залогіненим, а йдеться про гроші — саме такі форми першими й заливають.
  select count(*) into свіжих
    from public.fundraiser_requests
   where author_uid = new.author_uid
     and created_at > now() - interval '24 hours';
  if свіжих >= 3 then
    raise exception 'freq_flood' using errcode = 'P0001';
  end if;

  select p.name into new.author_name from public.profiles p where p.uid = new.author_uid;
  -- Заявка завжди починається новою: статус із клієнта не приймаємо взагалі,
  -- інакше можна було б надіслати одразу 'approved'.
  new.status := 'new';
  new.fundraiser_id := null;
  new.reviewed_at := null;
  return new;
end;
$$;

drop trigger if exists trg_freq_fill on public.fundraiser_requests;
create trigger trg_freq_fill
  before insert on public.fundraiser_requests
  for each row execute function public.freq_fill();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS — ХТО ЩО БАЧИТЬ
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.fundraisers         enable row level security;
alter table public.fundraiser_requests enable row level security;

-- Збори читають УСІ, включно з незалогіненими: блок стоїть на головній, і
-- людина мусить бачити його ще до входу. Але лише `active` — прихований збір
-- це чернетка адміна, а не контент.
drop policy if exists "fund_read_active" on public.fundraisers;
create policy "fund_read_active" on public.fundraisers
  for select to anon, authenticated
  using (active = true);

-- Писати може ЛИШЕ адмін. Не редактор (`is_team_member`): редактор веде новини,
-- а публікація чужого збору коштів — інший рівень відповідальності.
drop policy if exists "fund_admin_all" on public.fundraisers;
create policy "fund_admin_all" on public.fundraisers
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Заявку подає лише залогінений і лише під собою. 🔴 Анонімна заявка на збір
-- коштів — відкритий канал для шахрая, і немає з ким звʼязатись.
drop policy if exists "freq_insert_own" on public.fundraiser_requests;
create policy "freq_insert_own" on public.fundraiser_requests
  for insert to authenticated
  with check (author_uid = auth.uid());

-- Свою заявку видно автору (щоб бачив статус), решту — адміну.
drop policy if exists "freq_read_own" on public.fundraiser_requests;
create policy "freq_read_own" on public.fundraiser_requests
  for select to authenticated
  using (author_uid = auth.uid() or public.is_admin());

-- Змінювати статус може лише адмін. Автор свою заявку не редагує: після подачі
-- вона предмет розмови, а не документ, який можна тихо переписати.
drop policy if exists "freq_admin_write" on public.fundraiser_requests;
create policy "freq_admin_write" on public.fundraiser_requests
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "freq_admin_delete" on public.fundraiser_requests;
create policy "freq_admin_delete" on public.fundraiser_requests
  for delete to authenticated
  using (public.is_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. СХВАЛЕННЯ ОДНІЄЮ КНОПКОЮ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔑 Чому RPC, а не два запити з адмінки (insert + update).
--   • АТОМАРНО: або зʼявився збір і заявка позначена, або не сталося нічого.
--     Двома запитами буває «збір створено, заявка досі нова» — і адмін схвалює
--     її вдруге, тобто на головній два однакові збори.
--   • ПОЛЯ КОПІЮЮТЬСЯ ТУТ, А НЕ В БРАУЗЕРІ: неможливо «схвалити» заявку,
--     підмінивши посилання на банку по дорозі.
--   • `verified` НАВМИСНО лишається false — див. коментар до колонки.
create or replace function public.approve_fundraiser_request(p_request_id bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  з public.fundraiser_requests%rowtype;
  новий_id bigint;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = 'P0001';
  end if;

  select * into з from public.fundraiser_requests where id = p_request_id for update;
  if not found then
    raise exception 'request_not_found' using errcode = 'P0001';
  end if;
  -- Повторне схвалення — не помилка адміна, а подвійний тап. Віддаємо той самий
  -- збір, який уже створили, замість другого такого самого на головній.
  if з.fundraiser_id is not null then
    return з.fundraiser_id;
  end if;

  insert into public.fundraisers (title, org, url, goal, photo, note, kind, until, place, created_by)
  values (з.title, з.org, з.url, з.goal, з.photo, з.note, з.kind, з.until, з.place, auth.uid())
  returning id into новий_id;

  update public.fundraiser_requests
     set status = 'approved', fundraiser_id = новий_id, reviewed_at = now()
   where id = p_request_id;

  return новий_id;
end;
$$;

revoke all on function public.approve_fundraiser_request(bigint) from public, anon;
grant execute on function public.approve_fundraiser_request(bigint) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. СТОРОЖ ОДНАКОВОСТІ ПОЛІВ
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Уся конструкція тримається на тому, що заявка і збір описують одне й те саме
-- однаковими колонками. Розійдуться — `approve_fundraiser_request` мовчки
-- перестане копіювати частину даних, і збір на головній буде неповним.
-- Функція віддає список полів, які є лише в одній із таблиць.
create or replace function public.fundraiser_field_parity()
returns table (поле text, лише_в text) language sql stable set search_path = public as $$
  with спільні as (
    select unnest(array['title','org','url','goal','photo','note','kind','until','place']) as поле
  ),
  f as (select column_name from information_schema.columns
         where table_schema='public' and table_name='fundraisers'),
  r as (select column_name from information_schema.columns
         where table_schema='public' and table_name='fundraiser_requests')
  select с.поле,
         case when с.поле not in (select column_name from f) then 'fundraiser_requests'
              else 'fundraisers' end
    from спільні с
   where с.поле not in (select column_name from f)
      or с.поле not in (select column_name from r);
$$;
