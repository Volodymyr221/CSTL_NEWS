-- 0012_profile_email_from_auth.sql — ДІРКА Б4 З АУДИТУ БЕЗПЕКИ 24.10.2026.
-- 🗣️ Вова 26.10: «приступаєм до Б4».
--
-- 🔴 ЩО БУЛО. `add_page_moderator` шукав людину за `profiles.email` АБО
-- `auth.users.email` з `limit 1` і без порядку. А `profiles.email` людина може
-- оновити САМА (права на колонку відкриті). Тобто будь-хто міг вписати собі в
-- профіль чужу пошту — і коли власник спільноти додавав модератора за цією поштою,
-- база могла взяти ЧУЖИЙ акаунт. `list_page_moderators` при цьому показував власникові
-- саме профільну пошту, тож підміну не було б видно й у списку команди.
--
-- 📐 ЗАМІРЯНО 26.10: профілів 16, у всіх є пошта входу, розбіжностей між
-- `profiles.email` і `auth.users.email` — 0. Тобто правило «пошта = пошта входу»
-- нікого не відрізає і нічого не перезаписує в живих даних.
--
-- 🔑 ЛІКУЄМО ПРИЧИНУ, А НЕ ЛИШЕ ПОШУК. Клієнт і так пише в `profiles.email` пошту входу
-- (`auth.js`, рядок `email: accountEmail`) — поле задумане як ДЗЕРКАЛО. Тож сторож
-- робить дзеркало примусовим: що б не прийшло, у колонку ляже пошта з `auth.users`.
-- Підробити її стає неможливо скрізь, а не лише в одній функції (адмінка, аналітика
-- й журнал збоїв теж показують `profiles.email`).
-- ⚠️ Пошта входу перевірена: Google або код із листа. Зміна пошти (`email_change`)
-- спершу підтверджується кодом, і лише тоді змінюється `auth.users.email`.

-- ── 1. Профільна пошта = пошта входу, завжди ─────────────────────────────────
create or replace function public.profiles_email_from_auth()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_email text;
begin
  select u.email into v_email from auth.users u where u.id = new.uid;
  if v_email is not null then new.email := v_email; end if;
  return new;
end $$;

drop trigger if exists trg_profiles_email_from_auth on public.profiles;
create trigger trg_profiles_email_from_auth before insert or update on public.profiles
  for each row execute function public.profiles_email_from_auth();

-- ── 2. Модератора шукаємо ЛИШЕ за поштою входу ───────────────────────────────
create or replace function public.add_page_moderator(p_page_id bigint, p_email text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid; v_email text;
begin
  if not can_manage_page(p_page_id) then
    raise exception 'Немає прав додавати людей до цієї сторінки';
  end if;

  v_email := lower(trim(p_email));
  if v_email = '' or v_email not like '%_@_%.__%' then
    return 'bad_email';
  end if;

  -- 🔐 26.10 (Б4): лише `auth.users.email` — підтверджена пошта входу. Профіль
  -- потрібен, бо `page_admins.uid` посилається на `profiles(uid)`.
  select p.uid into v_uid
    from auth.users u
    join profiles p on p.uid = u.id
   where lower(u.email) = v_email;

  if v_uid is null then
    return 'not_found';
  end if;

  if exists (select 1 from page_admins where page_id = p_page_id and uid = v_uid) then
    return 'already';
  end if;

  insert into page_admins (page_id, uid, role)
  values (p_page_id, v_uid, 'moderator')
  on conflict (page_id, uid) do nothing;
  return 'ok';
end $$;

-- ── 3. Список команди показує пошту входу ────────────────────────────────────
create or replace function public.list_page_moderators(p_page_id bigint)
returns table(uid uuid, email text, name text, role text, status text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not can_manage_page(p_page_id) then
    raise exception 'Немає прав переглядати команду сторінки';
  end if;
  return query
    select a.uid,
           coalesce(u.email, nullif(p.email, ''))::text,
           coalesce(p.name, '')::text,
           a.role::text,
           'active'::text
      from page_admins a
      left join auth.users u on u.id = a.uid
      left join profiles  p on p.uid = a.uid
     where a.page_id = p_page_id
     order by (a.role = 'owner') desc, coalesce(p.name, ''), a.added_at nulls last;
end $$;
