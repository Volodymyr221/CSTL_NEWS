-- scripts/supabase_failures_resolved.sql
-- Міграція `analytics_failures_resolved` — 26.08.2026.
--
-- 🗣️ Вова: «оці збої висять, ми їх виправили».
--
-- 🔴 ЧОМУ ЖУРНАЛ ЗБОЇВ ПОЧАВ БРЕХАТИ. Він показує все, що сталося за 30 днів, і не вміє
-- відрізнити «це відбувається ПРЯМО ЗАРАЗ» від «це було три дні тому й давно полагоджено».
-- Наслідок гірший за незручність: коли в списку постійно висять чотири мертві рядки, око
-- перестає їх читати — і пʼятий, живий, теж не побачить. Журнал, який завжди червоний,
-- дорівнює журналу, якого немає.
--
-- 🔑 ГОЛОВНЕ РІШЕННЯ: ПОЗНАЧКА «ПОЛАГОДЖЕНО» — ЦЕ НЕ ВИДАЛЕННЯ Й НЕ ОБІЦЯНКА.
-- Ми не ховаємо збій назавжди і не віримо слову «виправив». Ми записуємо МОМЕНТ: «станом
-- на цей час поломку вважаємо закритою». Далі вирішує факт:
--   • не траплялось після позначки → збій лежить у згорнутому розділі «Полагоджені»;
--   • трапилось хоч раз після → він САМ повертається нагору з поміткою «повернувся».
-- ➡️ Тобто фікс перевіряється тим, що поломка більше не приходить, а не тим, що ми так
-- сказали. Кнопка «полагоджено», яка ховає збій НАЗАВЖДИ, була б способом обманути себе.
--
-- 🛑 НІЧОГО НЕ ВИДАЛЯЄМО З `analytics_events`. Позначка — окрема таблиця поруч. Історія
-- поломок лишається цілою: інакше через місяць неможливо буде відповісти на питання
-- «а це вже колись було?».

create table if not exists public.analytics_failures_resolved (
  -- Ключ — та сама четвірка полів, за якою `admin_failures()` групує поломки. Якби ключем
  -- був окремий id, позначка розійшлася б із групуванням при першій же зміні тексту.
  kind         text not null,
  code         text not null,
  message      text not null,
  where_       text not null default '',
  resolved_at  timestamptz not null default now(),
  resolved_by  uuid references auth.users(id) on delete set null,
  resolved_email text,
  -- Коли поломка востаннє траплялась НА МОМЕНТ позначки. Потрібне, щоб потім бачити:
  -- «закрили після 11 випадків» — і чи не почалось усе спочатку.
  last_seen_at timestamptz,
  note         text,
  primary key (kind, code, message, where_)
);

alter table public.analytics_failures_resolved enable row level security;

-- Читає лише адмін. Писати з клієнта не можна взагалі — лише через RPC нижче, де стоїть
-- той самий гейт: так у таблиці не зʼявиться позначка з підробленим автором.
drop policy if exists "Admins read resolved" on public.analytics_failures_resolved;
create policy "Admins read resolved" on public.analytics_failures_resolved
  for select to authenticated using (is_admin());

revoke all on public.analytics_failures_resolved from anon;
grant select on public.analytics_failures_resolved to authenticated;

-- ── Позначити / зняти позначку ─────────────────────────────────────────────────
-- 🔑 Через RPC, а не прямою вставкою: гейт `is_admin()` і автор позначки беруться з
-- сервера. Клієнт не може ні підробити пошту, ні позначити чужим іменем.
create or replace function public.admin_failure_resolve(
  p_kind text, p_code text, p_message text, p_where text default '', p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_last timestamptz;
begin
  if not is_admin() then
    return jsonb_build_object('error', 'not admin');
  end if;

  -- Запамʼятовуємо, коли поломка траплялась востаннє ДО позначки.
  select max(created_at) into v_last
  from analytics_events
  where event_type in ('db_refusal','js_error')
    and (case when event_type = 'js_error' then 'застосунок' else 'база' end) = p_kind
    and coalesce(nullif(meta->>'code',''), meta->>'kind', '—') = p_code
    and coalesce(meta->>'msg','') = p_message
    and coalesce(meta->>'at','') = coalesce(p_where, '');

  insert into analytics_failures_resolved
    (kind, code, message, where_, resolved_at, resolved_by, resolved_email, last_seen_at, note)
  values (p_kind, p_code, p_message, coalesce(p_where, ''), now(), auth.uid(),
          (auth.jwt() ->> 'email'), v_last, p_note)
  on conflict (kind, code, message, where_) do update
    set resolved_at = now(), resolved_by = auth.uid(),
        resolved_email = (auth.jwt() ->> 'email'),
        last_seen_at = v_last, note = coalesce(excluded.note, analytics_failures_resolved.note);

  return jsonb_build_object('ok', true, 'resolved_at', now(), 'last_seen_at', v_last);
end;
$$;

create or replace function public.admin_failure_unresolve(
  p_kind text, p_code text, p_message text, p_where text default '')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_admin() then
    return jsonb_build_object('error', 'not admin');
  end if;
  delete from analytics_failures_resolved
   where kind = p_kind and code = p_code and message = p_message
     and where_ = coalesce(p_where, '');
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.admin_failure_resolve(text, text, text, text, text) from public, anon;
grant execute on function public.admin_failure_resolve(text, text, text, text, text) to authenticated;
revoke all on function public.admin_failure_unresolve(text, text, text, text) from public, anon;
grant execute on function public.admin_failure_unresolve(text, text, text, text) to authenticated;

-- ── `admin_failures()` тепер знає про позначки ────────────────────────────────
-- Додано три поля на групу: `resolved`, `resolved_at`, `regressed`.
-- 🔑 `regressed` — найважливіше з трьох: воно означає «ми думали, що полагодили, а воно
-- сталося знову». Такий рядок мусить кричати гучніше за звичайний збій, бо він каже не
-- лише про поломку, а про хибний фікс.
create or replace function public.admin_failures(p_period text default '7d')
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_from timestamptz;
  result jsonb;
begin
  if not is_admin() then
    return jsonb_build_object('error', 'not admin');
  end if;

  v_from := case p_period
    when 'today' then (date_trunc('day', now() at time zone 'Europe/Kyiv')) at time zone 'Europe/Kyiv'
    when '7d'    then now() - interval '7 days'
    when '30d'   then now() - interval '30 days'
    else null
  end;

  with norm as (
    -- Нормалізуємо форму поломки ОДИН раз: далі і групування, і імена, і позначки
    -- спираються на ті самі чотири поля, тож розійтись вони не можуть.
    select
      case when event_type = 'js_error' then 'застосунок' else 'база' end as kind,
      coalesce(nullif(meta->>'code',''), meta->>'kind', '—')             as code,
      coalesce(meta->>'msg','')                                          as message,
      coalesce(meta->>'at','')                                           as where_,
      user_id, anon_id, created_at
    from analytics_events
    where event_type in ('db_refusal','js_error')
      and (v_from is null or created_at >= v_from)
  ),
  per_acc as (
    select n.kind, n.code, n.message, n.where_,
           coalesce(p.name, '(без імені)') as nm, count(*) as c
    from norm n
    left join profiles p on p.uid = n.user_id
    where n.user_id is not null
    group by 1,2,3,4,5
  ),
  grouped as (
    select kind, code, message, where_,
           count(*)                     as cnt,
           count(distinct anon_id)      as guests,
           count(distinct user_id)      as accounts_n,
           min(created_at)              as first_at,
           max(created_at)              as last_at
    from norm group by 1,2,3,4
  ),
  withres as (
    select g.*, r.resolved_at,
           (r.resolved_at is not null and g.last_at <= r.resolved_at) as resolved,
           (r.resolved_at is not null and g.last_at >  r.resolved_at) as regressed
    from grouped g
    left join analytics_failures_resolved r
      on r.kind = g.kind and r.code = g.code
     and r.message = g.message and r.where_ = g.where_
  )
  select jsonb_build_object(
    'period', p_period,
    'generated_at', now(),
    'total', (select coalesce(sum(cnt),0) from withres),
    -- 🔑 Окремі лічильники: «скільки болить зараз» і «скільки закрито» — різні питання,
    -- і зводити їх в одне число означало б знову зробити журнал завжди червоним.
    'active_total',   (select coalesce(sum(cnt),0) from withres where not resolved),
    'resolved_total', (select coalesce(sum(cnt),0) from withres where resolved),
    'regressed_n',    (select count(*) from withres where regressed),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kind', g.kind, 'code', g.code, 'message', g.message, 'where', g.where_,
        'count', g.cnt, 'guests', g.guests, 'accounts_n', g.accounts_n,
        'first_at', g.first_at, 'last_at', g.last_at,
        'resolved', g.resolved, 'resolved_at', g.resolved_at, 'regressed', g.regressed,
        'accounts', coalesce((
          select jsonb_agg(jsonb_build_object('name', a.nm, 'count', a.c) order by a.c desc)
          from per_acc a
          where a.kind = g.kind and a.code = g.code
            and a.message = g.message and a.where_ = g.where_
        ), '[]'::jsonb)
      ) order by g.regressed desc, g.resolved, g.last_at desc)
      from withres g
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_failures(text) from public, anon;
grant execute on function public.admin_failures(text) to authenticated;
