-- ============================================================================
-- РОЛІ Й ДОЗВОЛИ ЗАСТОСУНКУ — замовлення Вови 19.09.2026
--
-- 🗣️ «Нам треба побудувати шкалу ролей в застосунку, і відносно цього видавати
-- переваги в адмін користуванні».
-- 🗣️ «треба додати можливість додавати ДВІ РОЛІ НА ОДНУ ЛЮДИНУ. Тобто зараз я
-- буду власником і буду CEO-проєкту».
-- 🗣️ «треба зробити таку можливість, щоб певна роль мала обмеження, але в разі
-- чого можна додати якийсь певний вид».
-- 🗣️ Про розробника: «він може це бачити, але не видаляти».
-- 🗣️ Про спільноти: «вони взагалі не мають відношення до адмінки… це нижчий
-- левел, вони ведуть просто сторінки».
--
-- 🔑 ЧОМУ ЦЕ НЕ «ШКАЛА», ХОЧА ПРОСИЛИ ШКАЛУ.
-- Слово «шкала» передбачає, що кожна людина стоїть на ОДНІЙ сходинці і рівні
-- можна порівняти. Вимога «дві ролі на одну людину» це заперечує: сказати
-- «Вова = рівень 1» не можна, бо він Власник І CEO одночасно. Тому модель —
-- НАБІР ролей, а підсумковий дозвіл береться як НАЙВИЩИЙ серед усіх його ролей.
-- Порядок ролей при цьому лишається (owner вище за editor), просто він живе в
-- самих дозволах, а не в номері сходинки.
--
-- 📐 ЗАМІРЯНО ПЕРЕД РОБОТОЮ (жива база 19.09):
--   admins ......... 1 рядок (Вова), ключ по EMAIL, без звʼязку з auth.users
--   editor_users ... 0 рядків
--   page_admins .... 8 (7 owner + 1 moderator) — це СПІЛЬНОТИ, не адмінка
--   profiles ....... 15
-- 🔴 Шкали не існувало: три незалежні пласкі списки, а в адмінці майже кожен
-- пункт стояв на одній перевірці `isAdmin` — доступ «все або нічого».
--
-- ✅ НАКАТАНО 19.09 (міграція `app_roles_and_permissions`) І ДОВЕДЕНО НА ЖИВІЙ
-- БАЗІ транзакціями з відкотом — 14 перевірок, усі збіглися з очікуваним:
--   • Вова = owner + ceo, усі 14 розділів `manage`, `can_manage_owners` true,
--     `can_release_update` true, `legacy_admin` true (запобіжник на місці);
--   • розробник: `updates` manage · `board`/`questions`/`spend`/`analytics` view ·
--     `people`/`access` none · випустити всім може · власниками не керує;
--   • спроба розробника дати собі `owner` → «Власників призначає лише власник»;
--   • спроба дати собі `admin` → «Немає права роздавати ролі»;
--   • спроба дописати собі розділ → «Немає права керувати доступами»;
--   • зняти ОСТАННЬОГО власника → «Це останній власник — знімати не можна».
--
-- ⚠️ ЧЕСНО ПРО РОЗХОДЖЕННЯ З ПРОДОМ: у базу пішла та сама логіка, але з КОРОТШИМИ
-- коментарями (довгі пояснення поза тілами функцій у Postgres не зберігаються
-- взагалі). Тіла функцій, назви, права й політики збігаються; звірено
-- `pg_get_functiondef` — 13 функцій, усі `security definer` крім `perm_rank`.
-- 🛑 Правитимеш логіку — прав ТУТ і накочуй, а не редагуй у Supabase Studio:
-- саме так `supabase_public_profile.sql` колись розійшовся з продом.
--
-- ЗАСТОСУВАТИ через Supabase MCP apply_migration (project uabyfecseqnemvcqhdem).
-- Скрипт ІДЕМПОТЕНТНИЙ.
-- ============================================================================

-- ── 1. ДОВІДНИК РОЛЕЙ ──────────────────────────────────────────────────────
--
-- ⚠️ `rank` тут НЕ «хто головніший» для перевірки прав (права рахуються по
-- дозволах), а лише ПОРЯДОК ПОКАЗУ в адмінці. Інакше спокуса написати десь
-- `rank <= 2` і отримати другу, приховану модель доступу поруч із явною.
create table if not exists public.app_roles (
  role        text primary key,
  label       text not null,
  descr       text,
  rank        int  not null default 100
);

insert into public.app_roles (role, label, descr, rank) values
  ('owner',     'Власник',   'Повний доступ. Лише власник керує власниками.',      10),
  ('ceo',       'CEO',       'Усе, крім керування власниками.',                    20),
  ('developer', 'Розробник', 'Оновлення застосунку; решту здебільшого лише бачить.',30),
  ('admin',     'Адмін',     'Модерація і контент громади.',                       40),
  ('editor',    'Редактор',  'Новини та події. Деталі — у картці редактора.',       50)
on conflict (role) do update
  set label = excluded.label, descr = excluded.descr, rank = excluded.rank;

-- ── 2. РОЛІ ЛЮДИНИ — БАГАТО НА ОДНУ ────────────────────────────────────────
--
-- 🔑 Ключ по `uid`, а не по пошті. Стара `admins` ключується поштою
-- (`is_admin()` = exists … where email = auth.email()), і це слабке місце:
-- людина міняє пошту — втрачає доступ, а звʼязку з `auth.users` немає взагалі.
-- ⚠️ Стару таблицю НЕ чіпаємо і НЕ видаляємо — див. розділ 7 про сумісність.
create table if not exists public.user_roles (
  uid        uuid not null references auth.users(id) on delete cascade,
  role       text not null references public.app_roles(role) on update cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (uid, role)
);

create index if not exists user_roles_role_idx on public.user_roles(role);

-- ── 3. ДОЗВОЛИ: РОЗДІЛ × РІВЕНЬ ────────────────────────────────────────────
--
-- Рівні: 'none' | 'view' | 'manage'.
-- 🔑 `view` — це дослівна вимога Вови про розробника: «він може це бачити, але
-- не видаляти». Без середнього рівня довелось би вибирати між «не бачить нічого»
-- і «може стерти все».
create table if not exists public.role_perms (
  role  text not null references public.app_roles(role) on update cascade on delete cascade,
  area  text not null,
  level text not null check (level in ('none', 'view', 'manage')),
  primary key (role, area)
);

-- 🔴 ОСОБИСТИЙ ВИНЯТОК — саме те, про що просив Вова: «щоб певна роль мала
-- обмеження, але в разі чого можна додати якийсь певний вид».
-- Перебиває заготовку ролі В ОБИДВА БОКИ: можна і додати розділ, і відібрати.
create table if not exists public.user_perms (
  uid   uuid not null references auth.users(id) on delete cascade,
  area  text not null,
  level text not null check (level in ('none', 'view', 'manage')),
  note  text,
  primary key (uid, area)
);

-- ── 4. ЗАГОТОВКИ ДОЗВОЛІВ ─────────────────────────────────────────────────
--
-- Розділи = пункти адмінки (`menuItems()` в `admin.html`) + новий `updates`.
-- 🛑 Записуємо ЛИШЕ те, що дозволено: відсутній рядок = 'none'. Так таблиця
-- читається як перелік прав, а не як простирадло з переважно порожніми клітинками.
delete from public.role_perms where role in ('owner','ceo','developer','admin','editor');

-- Власник і CEO — усе. Різниця між ними ОДНА і вона не в розділах, а в
-- особливому праві керувати власниками (розділ 6).
insert into public.role_perms (role, area, level)
select r.role, a.area, 'manage'
  from (values ('owner'), ('ceo')) as r(role)
  cross join (values
    ('articles'), ('board'), ('questions'), ('reports'), ('announcements'),
    ('fundraisers'), ('communities'), ('people'), ('admins'), ('access'),
    ('spend'), ('analytics'), ('settings'), ('updates')
  ) as a(area);

-- Розробник. 🗣️ «Розробник буде мати доступ до оновлення. Це 100%.»
-- 🔑 `spend` = view за окремим рішенням Вови («Давай»): агент новин уже ставав на
-- місяць через вичерпаний бюджет, і причина була видна лише в логах GitHub —
-- розробник, який не бачить витрат, не помітить, що агент мовчить через гроші.
-- Міняти суми він не може: це рішення про гроші, а не про код.
insert into public.role_perms (role, area, level) values
  ('developer', 'updates',   'manage'),
  ('developer', 'board',     'view'),
  ('developer', 'questions', 'view'),
  ('developer', 'spend',     'view'),
  ('developer', 'analytics', 'view'),
  ('developer', 'settings',  'view');

-- Адмін застосунку — модерація і контент громади.
-- ⚠️ `access` лише 'view': бачити, хто має доступ, корисно всім у команді, але
-- роздавати ролі — не адмінська дія (за рішенням Вови це власник і CEO).
insert into public.role_perms (role, area, level) values
  ('admin', 'articles',     'manage'),
  ('admin', 'board',        'manage'),
  ('admin', 'questions',    'manage'),
  ('admin', 'reports',      'manage'),
  ('admin', 'announcements','manage'),
  ('admin', 'fundraisers',  'manage'),
  ('admin', 'communities',  'manage'),
  ('admin', 'people',       'manage'),
  ('admin', 'analytics',    'view'),
  ('admin', 'access',       'view'),
  ('admin', 'updates',      'view');

-- Редактор. ⚠️ Тонку грануляцію (`can_create` / `can_publish` / `can_events`)
-- НЕ переносимо сюди: вона вже працює в `editor_users` і `has_editor_perm()`.
-- Дублювати означало б завести друге джерело правди про ті самі права — рівно
-- та хвороба, від якої в проєкті вже страждали списки антиспаму.
insert into public.role_perms (role, area, level) values
  ('editor', 'articles', 'manage');

-- ── 5. ПІДСУМКОВИЙ ДОЗВІЛ ЛЮДИНИ ──────────────────────────────────────────
--
-- Порядок: найвищий рівень серед УСІХ ролей людини → потім особистий виняток.
-- 🔑 Саме тому «дві ролі на одну людину» працює без жодної додаткової логіки:
-- Власник+CEO отримує максимум із двох, і нічого не «перемагає» випадково.
create or replace function public.perm_rank(p_level text)
returns int language sql immutable as $fn$
  select case p_level when 'manage' then 2 when 'view' then 1 else 0 end;
$fn$;

create or replace function public.my_perm(p_area text)
returns text
language plpgsql stable security definer
set search_path = public
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_role  text;
  v_user  text;
begin
  if v_uid is null then return 'none'; end if;

  select rp.level into v_role
    from public.user_roles ur
    join public.role_perms rp on rp.role = ur.role
   where ur.uid = v_uid and rp.area = p_area
   order by public.perm_rank(rp.level) desc
   limit 1;

  -- Особистий виняток перебиває заготовку в ОБИДВА боки.
  select up.level into v_user
    from public.user_perms up
   where up.uid = v_uid and up.area = p_area;

  return coalesce(v_user, v_role, 'none');
end;
$fn$;

create or replace function public.has_perm(p_area text, p_min text default 'view')
returns boolean
language sql stable security definer
set search_path = public
as $fn$
  select public.perm_rank(public.my_perm(p_area)) >= public.perm_rank(p_min);
$fn$;

create or replace function public.has_role(p_role text)
returns boolean
language sql stable security definer
set search_path = public
as $fn$
  select exists (select 1 from public.user_roles where uid = auth.uid() and role = p_role);
$fn$;

create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public
as $fn$ select public.has_role('owner'); $fn$;

-- ── 6. ОСОБЛИВІ ПРАВА, ЯКІ НЕ Є РОЗДІЛОМ ──────────────────────────────────
--
-- 🗣️ «власників може додавати тільки власник. Тобто тільки я».
-- 🗣️ CEO — «будь-що він може робити, крім того, щоб видаляти власників».
create or replace function public.can_manage_owners()
returns boolean language sql stable security definer set search_path = public
as $fn$ select public.is_owner(); $fn$;

-- 🗣️ Випустити оновлення НА ВСЮ ГРОМАДУ: «Власник + СЕО + Розробник».
-- ⚠️ Адмін має `updates` = view, тобто бачить, що тестується, але не випускає.
create or replace function public.can_release_update()
returns boolean language sql stable security definer set search_path = public
as $fn$
  select public.has_role('owner') or public.has_role('ceo') or public.has_role('developer');
$fn$;

-- ── 7. 🔴 СУМІСНІСТЬ: СТАРА ПЕРЕВІРКА ЛИШАЄТЬСЯ ЗАПАСНИМ ШЛЯХОМ ────────────
--
-- 🛑 НАЙНЕБЕЗПЕЧНІШЕ МІСЦЕ ВСІЄЇ МІГРАЦІЇ. `is_admin()` стоїть у політиках
-- доступу до половини таблиць. Переписати її «начисто» означає: якщо нова гілка
-- помилиться, власник втрачає адмінку — і полагодити це з інтерфейсу вже не
-- зможе, бо інтерфейс саме туди й не пускає.
-- ✅ Тому нова перевірка йде ЧЕРЕЗ `or` зі старою: поки рядок Вови живий у
-- `admins`, доступ тримається навіть при повній відмові нової моделі.
-- ➡️ Прибрати старий шлях — ОКРЕМИМ кроком і лише після того, як Вова
-- підтвердить пальцем, що нова модель працює.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = 'public'
as $fn$
  select exists (select 1 from admins where email = auth.email())
      or exists (select 1 from user_roles
                  where uid = auth.uid() and role in ('owner', 'ceo', 'admin'));
$fn$;

-- `is_team_member()` — «пускати в кабінет узагалі». Тепер сюди входить і
-- розробник: без цього він не відкрив би навіть розділ «Оновлення», заради
-- якого роль і заводиться.
create or replace function public.is_team_member()
returns boolean
language sql stable security definer
set search_path = 'public'
as $fn$
  select public.is_admin()
      or exists (select 1 from editor_users where uid = auth.uid() and disabled_at is null)
      or exists (select 1 from user_roles where uid = auth.uid());
$fn$;

-- ── 8. ПЕРЕНЕСЕННЯ НАЯВНОГО ДОСТУПУ ───────────────────────────────────────
--
-- 🗣️ «Моя пошта основна — volodymyrshevchuk19@gmail.com. Це я власником
-- рахуюся… зараз я буду власником і буду CEO-проєкту».
-- ⚠️ Беремо uid із `auth.users` за поштою зі старої таблиці `admins` — тобто
-- переносимо ФАКТИЧНИЙ доступ, а не вписуємо адресу руками в міграцію.
insert into public.user_roles (uid, role)
select u.id, r.role
  from public.admins a
  join auth.users u on lower(u.email) = lower(a.email)
  cross join (values ('owner'), ('ceo')) as r(role)
on conflict (uid, role) do nothing;

-- Наявні редактори (зараз 0) — щоб модель від старту описувала ВСІХ, хто має доступ.
insert into public.user_roles (uid, role)
select e.uid, 'editor' from public.editor_users e where e.disabled_at is null
on conflict (uid, role) do nothing;

-- ── 9. RLS ────────────────────────────────────────────────────────────────
alter table public.app_roles  enable row level security;
alter table public.user_roles enable row level security;
alter table public.role_perms enable row level security;
alter table public.user_perms enable row level security;

-- Довідник і заготовки читає команда: адмінка малює з них інтерфейс.
drop policy if exists app_roles_read  on public.app_roles;
drop policy if exists role_perms_read on public.role_perms;
create policy app_roles_read  on public.app_roles  for select using (public.is_team_member());
create policy role_perms_read on public.role_perms for select using (public.is_team_member());

-- 🔑 Свої ролі людина бачить ЗАВЖДИ — інтерфейсу треба знати, що показувати, ще
-- до того, як стане ясно, чи вона в команді. Чужі — лише тому, хто керує доступом.
drop policy if exists user_roles_read on public.user_roles;
create policy user_roles_read on public.user_roles for select
  using (uid = auth.uid() or public.has_perm('access', 'view'));

drop policy if exists user_perms_read on public.user_perms;
create policy user_perms_read on public.user_perms for select
  using (uid = auth.uid() or public.has_perm('access', 'view'));

-- 🛑 ЗАПИС У ЦІ ТАБЛИЦІ З КЛІЄНТА ЗАБОРОНЕНО ПОВНІСТЮ. Жодної політики
-- insert/update/delete немає навмисно: роздавання прав іде лише через функції
-- розділу 10, де перевіряється і хто це робить, і кому. Відкрита політика
-- запису тут означала б, що той, хто має 'access', може видати собі 'owner'.
revoke insert, update, delete on public.user_roles from anon, authenticated;
revoke insert, update, delete on public.user_perms from anon, authenticated;
revoke insert, update, delete on public.role_perms from anon, authenticated;
revoke insert, update, delete on public.app_roles  from anon, authenticated;

-- ── 10. ВИДАЧА Й ВІДКЛИКАННЯ РОЛЕЙ ────────────────────────────────────────
--
-- 🛑 ТРИ ПРАВИЛА, КОЖНЕ З ЯКИХ ЗАКРИВАЄ СВІЙ СПОСІБ ЗЛАМАТИ СИСТЕМУ:
--   1. роль `owner` видає і знімає ЛИШЕ власник;
--   2. решту ролей — той, хто має `access` = manage (це власник і CEO);
--   3. ОСТАННЬОГО власника зняти не можна — інакше застосунок лишиться без
--      ключа, і повернути його можна буде тільки SQL-запитом повз інтерфейс.
create or replace function public.grant_role(p_uid uuid, p_role text)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare v_me uuid := auth.uid();
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'Треба увійти'); end if;
  if not exists (select 1 from app_roles where role = p_role) then
    return jsonb_build_object('ok', false, 'error', 'Невідома роль');
  end if;
  if p_role = 'owner' and not public.can_manage_owners() then
    return jsonb_build_object('ok', false, 'error', 'Власників призначає лише власник');
  end if;
  if p_role <> 'owner' and not public.has_perm('access', 'manage') then
    return jsonb_build_object('ok', false, 'error', 'Немає права роздавати ролі');
  end if;
  if not exists (select 1 from auth.users where id = p_uid) then
    return jsonb_build_object('ok', false, 'error', 'Такої людини немає');
  end if;

  insert into public.user_roles (uid, role, granted_by)
  values (p_uid, p_role, v_me)
  on conflict (uid, role) do nothing;

  return jsonb_build_object('ok', true);
end;
$fn$;

create or replace function public.revoke_role(p_uid uuid, p_role text)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
declare
  v_me    uuid := auth.uid();
  v_left  int;
begin
  if v_me is null then return jsonb_build_object('ok', false, 'error', 'Треба увійти'); end if;
  if p_role = 'owner' then
    if not public.can_manage_owners() then
      return jsonb_build_object('ok', false, 'error', 'Власників знімає лише власник');
    end if;
    select count(*) into v_left from public.user_roles where role = 'owner' and uid <> p_uid;
    if v_left = 0 then
      return jsonb_build_object('ok', false, 'error', 'Це останній власник — знімати не можна');
    end if;
  elsif not public.has_perm('access', 'manage') then
    return jsonb_build_object('ok', false, 'error', 'Немає права керувати ролями');
  end if;

  delete from public.user_roles where uid = p_uid and role = p_role;
  return jsonb_build_object('ok', true);
end;
$fn$;

-- Особистий виняток. 🔑 `p_level = null` прибирає виняток і повертає людину до
-- заготовки її ролей — саме цього й хочеться після «спробували і не треба».
create or replace function public.set_user_perm(p_uid uuid, p_area text, p_level text, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
begin
  if not public.has_perm('access', 'manage') then
    return jsonb_build_object('ok', false, 'error', 'Немає права керувати доступами');
  end if;
  if p_level is null then
    delete from public.user_perms where uid = p_uid and area = p_area;
    return jsonb_build_object('ok', true, 'cleared', true);
  end if;
  if p_level not in ('none', 'view', 'manage') then
    return jsonb_build_object('ok', false, 'error', 'Невідомий рівень');
  end if;
  -- 🛑 Видати більше, ніж маєш сам, не можна: інакше CEO дописав би собі те,
  -- що належить лише власникові, через «виняток» для власного акаунта.
  if not public.has_perm(p_area, p_level) then
    return jsonb_build_object('ok', false, 'error', 'Не можна видати більше, ніж маєте самі');
  end if;

  insert into public.user_perms (uid, area, level, note)
  values (p_uid, p_area, p_level, p_note)
  on conflict (uid, area) do update set level = excluded.level, note = excluded.note;

  return jsonb_build_object('ok', true);
end;
$fn$;

-- ── 11. ЩО ПОКАЗУВАТИ ТОМУ, ХТО ЗАЙШОВ ────────────────────────────────────
--
-- Одним викликом: мої ролі + підсумкові дозволи по всіх розділах + особливі
-- права. 🔑 Адмінка малює меню з ЦЬОГО, а не зі своїх уявлень про ролі —
-- інакше зʼявиться друге джерело правди, і воно розійдеться з базою.
create or replace function public.my_access()
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_roles jsonb;
  v_perms jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('roles', '[]'::jsonb, 'perms', '{}'::jsonb);
  end if;

  select coalesce(jsonb_agg(ur.role order by ar.rank), '[]'::jsonb)
    into v_roles
    from public.user_roles ur join public.app_roles ar on ar.role = ur.role
   where ur.uid = v_uid;

  select coalesce(jsonb_object_agg(a.area, public.my_perm(a.area)), '{}'::jsonb)
    into v_perms
    from (
      select distinct area from public.role_perms
      union select distinct area from public.user_perms where uid = v_uid
    ) a;

  return jsonb_build_object(
    'roles', v_roles,
    'perms', v_perms,
    'can_manage_owners',  public.can_manage_owners(),
    'can_release_update', public.can_release_update(),
    -- Сумісність: поки старий шлях живий, адмінка мусить знати і його відповідь.
    'legacy_admin', exists (select 1 from admins where email = auth.email())
  );
end;
$fn$;

-- ── 12. ПРАВА ВИКЛИКУ ─────────────────────────────────────────────────────
revoke execute on function public.grant_role(uuid, text)                    from public, anon;
revoke execute on function public.revoke_role(uuid, text)                   from public, anon;
revoke execute on function public.set_user_perm(uuid, text, text, text)     from public, anon;
revoke execute on function public.my_access()                               from public, anon;
grant  execute on function public.grant_role(uuid, text)                    to authenticated;
grant  execute on function public.revoke_role(uuid, text)                   to authenticated;
grant  execute on function public.set_user_perm(uuid, text, text, text)     to authenticated;
grant  execute on function public.my_access()                               to authenticated;
grant  execute on function public.my_perm(text)                             to authenticated;
grant  execute on function public.has_perm(text, text)                      to authenticated;
grant  execute on function public.has_role(text)                            to authenticated;
grant  execute on function public.is_owner()                                to authenticated;
grant  execute on function public.can_manage_owners()                       to authenticated;
grant  execute on function public.can_release_update()                      to authenticated;

comment on table public.user_roles is
  'Ролі людини. Їх може бути КІЛЬКА (Вова = owner + ceo). Підсумковий дозвіл — найвищий серед усіх ролей, потім особистий виняток із user_perms.';
comment on table public.user_perms is
  'Особистий виняток поверх заготовки ролі — «в разі чого додати певний вид» (Вова 19.09). Перебиває в обидва боки.';

-- ── 13. КОМАНДА І ПОШУК ЛЮДЕЙ (міграція `team_list_and_people_search`) ─────
--
-- 🔴 Заведено 19.09 після скарги Вови: «Як мені додати редактора, я не розумію».
-- 📐 Перевірено ФАКТОМ: розділ «Доступи» мав лише «Відкликати» і «Повернути»,
-- форми додавання не існувало взагалі; таблиця `editor_invites` у базі Є, а в
-- коді (`admin.html`, `src/`) не згадується ЖОДНОГО разу. Механізм був
-- збудований наполовину — сховище є, дверей немає.
--
-- 🔑 Чому RPC, а не запит із клієнта: пошта живе в `auth.users`, куди клієнту
-- ходу немає в принципі, а збирати «хто в команді» з трьох таблиць на клієнті
-- означало б тримати це правило в другому місці — і воно розійшлося б.

create or replace function public.team_list()
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare v_out jsonb;
begin
  if not public.has_perm('access', 'view') then
    return jsonb_build_object('ok', false, 'error', 'Немає доступу');
  end if;

  select coalesce(jsonb_agg(t order by t->>'name'), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'uid',   u.id,
      'email', u.email,
      'name',  coalesce(nullif(btrim(p.name || ' ' || coalesce(p.surname, '')), ''), u.email),
      'roles', (select coalesce(jsonb_agg(ur2.role order by ar.rank), '[]'::jsonb)
                  from user_roles ur2 join app_roles ar on ar.role = ur2.role
                 where ur2.uid = u.id),
      'perms', (select coalesce(jsonb_object_agg(up.area, up.level), '{}'::jsonb)
                  from user_perms up where up.uid = u.id),
      -- Старий доступ по пошті показуємо ОКРЕМО: поки він живий, людина має
      -- права навіть без жодної ролі, і ховати це від очей не можна.
      'legacy_admin', exists (select 1 from admins a where lower(a.email) = lower(u.email))
    ) as t
    from auth.users u
    left join profiles p on p.uid = u.id
    where exists (select 1 from user_roles ur where ur.uid = u.id)
       or exists (select 1 from admins a where lower(a.email) = lower(u.email))
  ) s;

  return jsonb_build_object('ok', true, 'team', v_out);
end;
$fn$;

-- 🛑 Пошук лише для того, хто керує доступами: інакше це відкритий довідник
-- пошт усіх жителів.
-- ⚠️ Шукає серед ТИХ, ХТО ВЖЕ ЗАХОДИВ: роль ставиться на акаунт, а не на адресу.
-- Запрошення того, кого ще немає в застосунку, — окрема задача (саме її й
-- мала закривати мертва `editor_invites`).
create or replace function public.people_search(p_q text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare v_out jsonb; v_q text := '%' || btrim(coalesce(p_q, '')) || '%';
begin
  if not public.has_perm('access', 'manage') then
    return jsonb_build_object('ok', false, 'error', 'Немає доступу');
  end if;
  if length(btrim(coalesce(p_q, ''))) < 2 then
    return jsonb_build_object('ok', true, 'people', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'uid', u.id, 'email', u.email,
      'name', coalesce(nullif(btrim(p.name || ' ' || coalesce(p.surname, '')), ''), u.email)
    ) as t
    from auth.users u
    left join profiles p on p.uid = u.id
    where u.email ilike v_q
       or coalesce(p.name, '') ilike v_q
       or coalesce(p.surname, '') ilike v_q
    order by u.created_at
    limit 12
  ) s;

  return jsonb_build_object('ok', true, 'people', v_out);
end;
$fn$;

revoke execute on function public.team_list()         from public, anon;
revoke execute on function public.people_search(text) from public, anon;
grant  execute on function public.team_list()         to authenticated;
grant  execute on function public.people_search(text) to authenticated;
