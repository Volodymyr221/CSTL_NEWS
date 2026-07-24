-- scripts/supabase_page_moderators.sql
-- Модератори сторінок «Стрічки» + вибір «від чийого імені» (потік /byyou 24.07).
-- ✅ УЖЕ НАКАТАНО через Supabase MCP (міграції can_edit_page_includes_site_admin,
--    page_moderators_rpc_and_show_author, fix_list_page_moderators_profiles_key).
--    Цей файл — джерело правди на випадок відновлення.

-- ── 1. Розсинхрон прав (знайдено 24.07) ─────────────────────────────────────
-- БУЛО: редагування сторінки пускало глобального адміна, а вставка поста — ні.
-- Клієнт при цьому показував глобальному адміну композер на ВСІХ сторінках
-- (fetchMyEditablePageIds читає page_admins, а RLS віддає адміну всі рядки) →
-- поле «Написати пост…» видно, а публікація впала б помилкою прав.
-- СТАЛО: одна відповідь на питання «чи можу я тут писати» для всіх перевірок.
create or replace function public.can_edit_page(p_page_id bigint)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select is_admin()
      or exists (select 1 from public.page_admins a
                 where a.page_id = p_page_id and a.uid = auth.uid());
$$;

-- ── 2. Від чийого імені опубліковано пост ───────────────────────────────────
-- true  → під текстом видно підпис автора-людини (як було, тому default true —
--         старі пости не міняють вигляду);
-- false → пост суто від імені спільноти, без особистого підпису.
alter table public.page_posts
  add column if not exists show_author boolean not null default true;

-- ── 3. Хто керує командою сторінки ──────────────────────────────────────────
-- Власник (role='owner') або глобальний адмін. Модератор пише пости, але людей
-- не додає (рішення Вови 24.07).
create or replace function public.can_manage_page(p_page_id bigint)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select is_admin()
      or exists (select 1 from public.page_admins a
                 where a.page_id = p_page_id and a.uid = auth.uid() and a.role = 'owner');
$$;

-- Список команди. Пошту бачить лише той, хто керує сторінкою (перевірка всередині).
create or replace function public.list_page_moderators(p_page_id bigint)
returns table (uid uuid, email text, name text, role text)
language plpgsql stable security definer set search_path to 'public'
as $$
begin
  if not can_manage_page(p_page_id) then
    raise exception 'Немає прав переглядати команду сторінки';
  end if;
  return query
    select a.uid, u.email::text, coalesce(p.name, '')::text, a.role::text
    from page_admins a
    left join auth.users u on u.id = a.uid
    left join profiles  p on p.uid = a.uid       -- ⚠️ ключ profiles саме uid, не id
    where a.page_id = p_page_id
    order by (a.role = 'owner') desc, a.added_at nulls last;
end;
$$;

-- Додати за поштою. Нічиїх даних не розкриває: у відповідь лише 'ok' / 'not_found'.
create or replace function public.add_page_moderator(p_page_id bigint, p_email text)
returns text language plpgsql volatile security definer set search_path to 'public'
as $$
declare v_uid uuid;
begin
  if not can_manage_page(p_page_id) then
    raise exception 'Немає прав додавати людей до цієї сторінки';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_uid is null then
    return 'not_found';       -- людина ще жодного разу не заходила в додаток
  end if;
  insert into page_admins (page_id, uid, role)
  values (p_page_id, v_uid, 'moderator')
  on conflict (page_id, uid) do nothing;
  return 'ok';
end;
$$;

-- Прибрати людину. Власника прибрати не можна — сторінка не має лишитись без господаря.
create or replace function public.remove_page_moderator(p_page_id bigint, p_uid uuid)
returns text language plpgsql volatile security definer set search_path to 'public'
as $$
begin
  if not can_manage_page(p_page_id) then
    raise exception 'Немає прав змінювати команду сторінки';
  end if;
  if exists (select 1 from page_admins
              where page_id = p_page_id and uid = p_uid and role = 'owner') then
    return 'owner_protected';
  end if;
  delete from page_admins where page_id = p_page_id and uid = p_uid;
  return 'ok';
end;
$$;

revoke all on function public.add_page_moderator(bigint, text)    from public, anon;
revoke all on function public.remove_page_moderator(bigint, uuid) from public, anon;
revoke all on function public.list_page_moderators(bigint)        from public, anon;
grant execute on function public.add_page_moderator(bigint, text)    to authenticated;
grant execute on function public.remove_page_moderator(bigint, uuid) to authenticated;
grant execute on function public.list_page_moderators(bigint)        to authenticated;

-- ── Перевірено наживо 24.07 (від імені власника сторінки 4) ─────────────────
--   list_page_moderators(4) → власник із поштою та ім'ям
--   add_page_moderator(4,'nemaye@example.com') → 'not_found'
--   can_manage_page(4)=true, can_manage_page(1)=false
--   від імені anon → permission denied (grant лише authenticated)
