-- ============================================================================
-- CSTL LIFE — Керування СПІЛЬНОТАМИ з адмінки (створення / порядок / видалення)
-- ============================================================================
-- Запустити у Supabase → SQL Editor → New query → Run.
-- ⚠️ ІДЕМПОТЕНТНИЙ і НЕ руйнівний (add column if not exists / drop policy → create /
--    create or replace function). Повторний запуск безпечний, дані не чіпає.
--
-- Що робить:
--   1) додає колонку pages.sort_order — порядок кружечків-каналів у «Стрічці»;
--   2) дозволяє глобальному admin ВИДАЛЯТИ сторінку (каскад прибирає пости/лайки);
--   3) RPC admin_create_community(...) — атомарне створення сторінки + власників
--      (я маю доступ / або власник по email — profiles закриті RLS, тому SECURITY DEFINER);
--   4) RPC admin_find_uid_by_email(...) — пошук uid жителя за email (для «Редагувати → додати власника»).
--
-- Залежності (вже в базі): таблиці pages/page_admins (supabase_pages.sql),
--   profiles з колонкою email (supabase_profiles.sql), функція is_admin() (supabase_fix_rls.sql).
-- ============================================================================


-- ── 1. Колонка порядку кружечків у «Стрічці» ────────────────────────────────
alter table public.pages add column if not exists sort_order int not null default 0;

-- Первинна ініціалізація порядку (лише коли sort_order ще всюди 0 — тобто перший накат):
--   «Олицька міська рада» першою (як був хардкод PINNED_PAGES у feed.js), решта — за датою.
do $$
begin
  if not exists (select 1 from public.pages where sort_order <> 0) then
    with ordered as (
      select id, row_number() over (
        order by (lower(name) like '%олицька міська рада%') desc, created_at asc
      ) as rn
      from public.pages
    )
    update public.pages p set sort_order = o.rn from ordered o where o.id = p.id;
  end if;
end $$;

create index if not exists idx_pages_order on public.pages (sort_order asc, created_at asc);


-- ── 2. Видалення сторінки — лише глобальний admin ───────────────────────────
-- (RLS pages не мала delete-політики взагалі → видалення було заблоковане всім.)
-- Каскад on delete cascade прибере page_posts/page_comments/page_reactions/
-- page_subscriptions/page_admins цієї сторінки.
drop policy if exists "pages admin delete" on public.pages;
create policy "pages admin delete" on public.pages for delete using (is_admin());


-- ── 3. RPC: пошук uid жителя за email (profiles закриті RLS «лише свій рядок») ─
create or replace function public.admin_find_uid_by_email(p_email text)
returns uuid
language plpgsql stable security definer set search_path = public
as $$
declare v_uid uuid;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  select uid into v_uid
  from public.profiles
  where lower(email) = lower(trim(p_email))
  limit 1;
  return v_uid;   -- null = такого email серед жителів нема
end $$;
grant execute on function public.admin_find_uid_by_email(text) to authenticated;


-- ── 4. RPC: атомарне створення спільноти + власників ────────────────────────
-- p_self_owner  — TRUE: я (адмін, що викликав) стаю власником (маю доступ писати);
-- p_owner_email — опційно: ще один власник за email (напр. передати спільноту комусь).
-- Хоча б один власник має зʼявитись, інакше — виняток (сторінку не створюємо).
create or replace function public.admin_create_community(
  p_name        text,
  p_theme       text    default null,
  p_avatar_url  text    default null,
  p_banner_url  text    default null,
  p_self_owner  boolean default true,
  p_owner_email text    default null
)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  v_page_id bigint;
  v_uid     uuid;
  v_next    int;
begin
  if not public.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'EMPTY_NAME';
  end if;

  -- новий канал стає в кінець порядку
  select coalesce(max(sort_order), 0) + 1 into v_next from public.pages;

  insert into public.pages (name, theme, avatar_url, banner_url, sort_order)
  values (
    trim(p_name),
    nullif(trim(coalesce(p_theme, '')), ''),
    nullif(trim(coalesce(p_avatar_url, '')), ''),
    nullif(trim(coalesce(p_banner_url, '')), ''),
    v_next
  )
  returning id into v_page_id;

  -- власник-адмін (я маю доступ)
  if p_self_owner then
    insert into public.page_admins (page_id, uid, role)
    values (v_page_id, auth.uid(), 'owner')
    on conflict (page_id, uid) do nothing;
  end if;

  -- власник за email (якщо вказаний)
  if coalesce(trim(p_owner_email), '') <> '' then
    select uid into v_uid
    from public.profiles
    where lower(email) = lower(trim(p_owner_email))
    limit 1;
    if v_uid is null then
      raise exception 'EMAIL_NOT_FOUND';   -- відкат усієї транзакції: сторінка НЕ створиться
    end if;
    insert into public.page_admins (page_id, uid, role)
    values (v_page_id, v_uid, 'owner')
    on conflict (page_id, uid) do nothing;
  end if;

  -- має бути хоча б один власник
  if not exists (select 1 from public.page_admins where page_id = v_page_id) then
    raise exception 'NO_OWNER';
  end if;

  return v_page_id;
end $$;
grant execute on function public.admin_create_community(text, text, text, text, boolean, text) to authenticated;


-- ── 5. RPC: перелік власників сторінки (email/імʼя) для екрана «Редагувати» ──
-- profiles закриті RLS «лише свій рядок», тому адмінці треба SECURITY DEFINER,
-- щоб показати, ХТО веде спільноту (а не голі uid).
create or replace function public.admin_page_owners(p_page_id bigint)
returns table (uid uuid, role text, email text, name text, added_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select a.uid, a.role, pr.email, pr.name, a.added_at
  from public.page_admins a
  left join public.profiles pr on pr.uid = a.uid
  where a.page_id = p_page_id
    and public.is_admin()               -- лише адмін бачить перелік
  order by (a.role = 'owner') desc, a.added_at asc;
$$;
grant execute on function public.admin_page_owners(bigint) to authenticated;


-- ── ПЕРЕВІРКА ───────────────────────────────────────────────────────────────
select id, name, theme, sort_order from public.pages order by sort_order asc, created_at asc;
-- ============================================================================
-- ✅ ГОТОВО. Далі — код адмінки (розділ «Спільноти») вже вміє це викликати.
-- ============================================================================
