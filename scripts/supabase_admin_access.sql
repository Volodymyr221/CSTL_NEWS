-- ============================================================================
-- ДОСТУПИ І ЖУРНАЛ ДІЙ — міграція 20.08.2026
-- ============================================================================
-- 🔴 ЗАРАДИ ЧОГО. 20.08 виявилось, що людина, яка пішла з команди півтора місяця
-- тому, досі мала ПОВНІ права публікувати від імені видання. Прибрати вдалось
-- лише SQL-запитом: в адмінці немає списку тих, хто має доступ, — вона читає
-- права ЛИШЕ того, хто зайшов.
--
-- 🔑 ГОЛОВНИЙ ВИСНОВОК АУДИТУ: примус працює добре, видимості немає.
-- Перевірено по живій базі того ж дня:
--   • RLS увімкнено на всіх 38 таблицях;
--   • усі 51 функція SECURITY DEFINER мають заданий search_path;
--   • чужий залогінений бачить НУЛІ в admins, editor_users, ad_reports,
--     analytics_events, cms_articles, profiles;
--   • заборона публікації для редактора стоїть у САМІЙ базі:
--     cms_articles UPDATE with_check = (status <> 'ready' OR has_editor_perm('publish')).
-- Тобто «хто що може» захищене. Не було відповіді на питання «а хто взагалі
-- може» — і саме через це доступ і забули.
--
-- ⚠️ ЧОГО ЦЯ МІГРАЦІЯ СВІДОМО НЕ РОБИТЬ: не заводить ролей, не переписує
-- наявні політики, не чіпає публічний застосунок. Додає рівно те, чого бракує
-- для видимості й підзвітності.
-- ============================================================================

-- ── 1. ЖИТТЄВИЙ ЦИКЛ ДОСТУПУ РЕДАКТОРА ──────────────────────────────────────
-- 🔑 Було: uid, email, name, can_create, can_publish, can_events, created_at.
-- Тобто на питання «коли він востаннє користувався доступом» відповіді не
-- існувало в природі — не «екрана немає», а ПОКАЗУВАТИ НЕМА ЧОГО.
alter table editor_users
  add column if not exists disabled_at  timestamptz,
  add column if not exists disabled_by  text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists invited_by   text;

comment on column editor_users.disabled_at  is 'Коли доступ відкликано. NULL = діючий.';
comment on column editor_users.disabled_by  is 'Пошта того, хто відкликав.';
comment on column editor_users.last_seen_at is 'Останній вхід у кабінет. NULL = жодного разу.';
comment on column editor_users.invited_by   is 'Пошта того, хто видав доступ.';

-- ── 2. ВІДКЛИКАННЯ ДІЄ В БАЗІ, А НЕ В ІНТЕРФЕЙСІ ────────────────────────────
-- 🛑 Без цих двох правок «відкликати» ховало б кнопки, лишаючи справжній доступ.
-- Саме такий вид «захисту» проєкт відкидає з самого початку.
create or replace function public.has_editor_perm(p text)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select
    public.is_admin()
    or coalesce((
      select case
        when p = 'create'  then (e.can_create or e.can_publish)
        when p = 'publish' then e.can_publish
        when p = 'events'  then e.can_events
        else false
      end
      from editor_users e
      where e.uid = auth.uid()
        and e.disabled_at is null      -- 🔴 додано 20.08
    ), false);
$$;

-- ⚠️ ДРУГА ДІРКА, знайдена тим самим аудитом: `is_team_member()` пускає в
-- адмінку будь-кого, хто ПРИСУТНІЙ у editor_users. Відключений редактор і далі
-- бачив би пункт «Адмінка» в меню й відкривав би кабінет — порожній, але
-- відкривав. Права всередині він уже не мав би (пункт вище), проте показувати
-- людині двері, які для неї зачинені, — це недороблене відкликання.
create or replace function public.is_team_member()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.is_admin()
      or exists (
        select 1 from editor_users
        where uid = auth.uid() and disabled_at is null   -- 🔴 додано 20.08
      );
$$;

-- ── 3. ЖУРНАЛ ДІЙ АДМІНА ────────────────────────────────────────────────────
-- 🔑 Пишеться ТІЛЬКИ функціями з правами власника. Клієнту INSERT недоступний
-- узагалі: журнал, у який може дописати той, чиї дії він фіксує, — не журнал.
create table if not exists admin_audit_log (
  id          bigserial primary key,
  actor_email text        not null,
  action      text        not null,
  entity_type text,
  entity_id   text,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists admin_audit_log_time_idx on admin_audit_log (created_at desc);

alter table admin_audit_log enable row level security;

-- Читає лише адмін. Політики на запис немає ЗОВСІМ — це і є заборона:
-- RLS без політики означає «нікому», а функції нижче пишуть в обхід RLS,
-- бо вони SECURITY DEFINER.
drop policy if exists audit_read_admin on admin_audit_log;
create policy audit_read_admin on admin_audit_log
  for select using (public.is_admin());

create or replace function public.admin_audit(
  p_action text, p_entity_type text, p_entity_id text,
  p_old jsonb default null, p_new jsonb default null)
returns void
language sql security definer
set search_path to 'public'
as $$
  insert into admin_audit_log (actor_email, action, entity_type, entity_id, old_data, new_data)
  values (coalesce(auth.email(), 'system'), p_action, p_entity_type, p_entity_id, p_old, p_new);
$$;

revoke all on function public.admin_audit(text, text, text, jsonb, jsonb) from public, anon, authenticated;

-- ── 4. СПИСОК ТИХ, ХТО МАЄ ДОСТУП ───────────────────────────────────────────
-- 🔑 Одним запитом і адміни, і редактори. Окремо їх довелось би зводити на
-- клієнті, а «звести на клієнті» вже одного разу дало розбіжність двох
-- лічильників того самого (B-27).
create or replace function public.admin_list_access()
returns table (
  вид text, uid uuid, email text, name text,
  can_create boolean, can_publish boolean, can_events boolean,
  created_at timestamptz, last_seen_at timestamptz,
  disabled_at timestamptz, disabled_by text, invited_by text
)
language sql stable security definer
set search_path to 'public, auth'
as $$
  select 'admin'::text, u.id, a.email, coalesce(a.name, ''),
         true, true, true, a.created_at, u.last_sign_in_at,
         null::timestamptz, null::text, null::text
  from admins a
  left join auth.users u on u.email = a.email
  where public.is_admin()
  union all
  select 'editor'::text, e.uid, e.email, coalesce(e.name, ''),
         e.can_create, e.can_publish, e.can_events,
         e.created_at, coalesce(e.last_seen_at, u.last_sign_in_at),
         e.disabled_at, e.disabled_by, e.invited_by
  from editor_users e
  left join auth.users u on u.id = e.uid
  where public.is_admin()
  order by 1, 3;
$$;

-- ── 5. ЗМІНА ПРАВ І ВІДКЛИКАННЯ — ЧЕРЕЗ RPC, ІЗ ЗАПИСОМ У ЖУРНАЛ ────────────
-- 🛑 Сторож `is_admin()` стоїть УСЕРЕДИНІ функції, а не лише в політиці:
-- функція має права власника, тож без нього її міг би викликати будь-хто.
-- Той самий урок, що з `submit_board_post` (01.08).
create or replace function public.admin_set_editor_perms(
  p_uid uuid, p_create boolean, p_publish boolean, p_events boolean)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare було jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  select to_jsonb(e) into було from editor_users e where e.uid = p_uid;
  if було is null then
    raise exception 'editor_not_found';
  end if;
  update editor_users
     set can_create = p_create, can_publish = p_publish, can_events = p_events
   where uid = p_uid;
  perform public.admin_audit('editor.permissions', 'editor_users', p_uid::text, було,
                             jsonb_build_object('can_create', p_create,
                                                'can_publish', p_publish,
                                                'can_events', p_events));
end $$;

create or replace function public.admin_set_editor_disabled(p_uid uuid, p_disabled boolean)
returns void
language plpgsql security definer
set search_path to 'public'
as $$
declare було jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  select to_jsonb(e) into було from editor_users e where e.uid = p_uid;
  if було is null then
    raise exception 'editor_not_found';
  end if;
  update editor_users
     set disabled_at = case when p_disabled then now() else null end,
         disabled_by = case when p_disabled then auth.email() else null end
   where uid = p_uid;
  perform public.admin_audit(
    case when p_disabled then 'editor.disabled' else 'editor.enabled' end,
    'editor_users', p_uid::text, було,
    jsonb_build_object('disabled', p_disabled));
end $$;

-- ── 6. «ОСТАННІЙ ВХІД» ЗАПОВНЮЄ САМ РЕДАКТОР ────────────────────────────────
-- ⚠️ `auth.users.last_sign_in_at` не годиться сам по собі: він росте від входу
-- в ЗАСТОСУНОК, а нас цікавить користування ДОСТУПОМ. Людина може щодня
-- заходити в застосунок як житель і роками не відкривати кабінет — і саме
-- такий доступ забувають.
create or replace function public.touch_editor_seen()
returns void
language sql security definer
set search_path to 'public'
as $$
  update editor_users set last_seen_at = now()
   where uid = auth.uid() and disabled_at is null;
$$;

-- ── 7. ПРАВА НА ВИКЛИК ──────────────────────────────────────────────────────
revoke all on function public.admin_list_access()                              from public, anon;
revoke all on function public.admin_set_editor_perms(uuid, boolean, boolean, boolean) from public, anon;
revoke all on function public.admin_set_editor_disabled(uuid, boolean)          from public, anon;
revoke all on function public.touch_editor_seen()                               from public, anon;

grant execute on function public.admin_list_access()                              to authenticated;
grant execute on function public.admin_set_editor_perms(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.admin_set_editor_disabled(uuid, boolean)          to authenticated;
grant execute on function public.touch_editor_seen()                               to authenticated;
-- 🔑 `authenticated` тут не дірка: сторож `is_admin()` стоїть усередині кожної
-- адмінської функції, а `touch_editor_seen` торкається лише ВЛАСНОГО рядка.
