-- scripts/supabase_analytics_drilldown.sql
-- Міграція `analytics_drilldown` — 26.08.2026.
--
-- 🗣️ ЗАМОВЛЕННЯ ВОВИ (його власні слова, не переказ ChatGPT):
--   «в цій аналітиці має збиратися тільки правдива інформація… не можна, щоб тут було
--    все на кучу… базові щоб було видно зразу, і можна було відкрити детальніше»;
--   «статистика заходів: з веб-версії чи з PWA — обов'язково розділяти»;
--   «унікальні користувачі і загальна кількість заходів — один користувач може зайти
--    десять разів»; «щоб було видно, хто саме заходив»;
--   «по вкладках… треба тап → хто заходив, скільки разів, за який період»;
--   «населені пункти: тап → хто саме заходив сьогодні / за 7 днів».
--
-- 🔑 ГОЛОВНЕ РІШЕННЯ ЦІЄЇ МІГРАЦІЇ: кожне число на екрані має вміти назвати ЛЮДЕЙ, з
-- яких воно склалось. Не «81 унікальний», а «ось ці шестеро, ось скільки разів кожен».
-- Поки число не розкладається на імена, перевірити його неможливо — а Вова просив
-- саме перевірності («тільки правдива інформація»).
--
-- 🛑 ЧОГО ТУТ СВІДОМО НЕМАЄ. Розділення PWA / браузер, браузер і ОС рахуються ЛИШЕ з
-- подій `session_start`, а вони існують із 26.08.2026 09:19 UTC. За липень і серпень
-- цих полів у базі НЕМАЄ ВЗАГАЛІ — і домальовувати їх заднім числом (наприклад,
-- вгадувати PWA по User-Agent) не можна: UA у PWA і в браузері однаковий. Тому функція
-- віддає `modes_since` — дату, з якої розділення справжнє, а екран її показує. Порожній
-- розділ, чесно підписаний «даних ще немає», кращий за вигаданий.

-- ══════════════════════════════════════════════════════════════════════════════
-- 1. ОГЛЯД — доповнений розділеннями і «активними селами».
-- ══════════════════════════════════════════════════════════════════════════════
create or replace function public.admin_analytics_overview(p_period text default '7d')
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

  -- «Сьогодні» — календарна доба КИЄВА, а не того, хто дивиться екран.
  v_from := case p_period
    when 'today' then (date_trunc('day', now() at time zone 'Europe/Kyiv')) at time zone 'Europe/Kyiv'
    when '7d'    then now() - interval '7 days'
    when '30d'   then now() - interval '30 days'
    else null
  end;

  with e as (
    select * from analytics_events
    where v_from is null or created_at >= v_from
  ),
  -- 🔑 Один рядок = один ЗАХІД. Саме те, що Вова називає «зайшов десять разів».
  -- Контекст заходу (PWA / браузер / ОС) шлеться один раз на сесію, тому джерело
  -- розділень — тільки ці рядки, і зводити їх до подій не можна: одна людина за захід
  -- дає 50 подій і від того не стає п'ятдесятьма заходами.
  -- ⚠️ `distinct on` НЕ прикраса: перезавантаження сторінки в тій самій вкладці пише
  -- ДРУГИЙ `session_start` із тим самим `session_id` (`sessionStorage` переживає F5).
  -- Заміряно 26.08: така пара вже є в базі. Без цього рядка один захід рахувався б за
  -- два — тобто «скільки разів заходили» брехало б угору рівно на кількість перезавантажень.
  s as (
    select distinct on (session_id)
           session_id, user_id, anon_id,
           meta->>'app_mode' app_mode, meta->>'browser' browser, meta->>'os' os
    from e where event_type = 'session_start' and session_id is not null
    order by session_id, created_at
  )
  select jsonb_build_object(
    'period', p_period,
    'from', v_from,
    'generated_at', now(),
    -- ── ЧЕСНІ ОДИНИЦІ ─────────────────────────────────────────────────────────
    'users',        (select count(distinct user_id) from e where user_id is not null),
    'guests',       (select count(distinct anon_id) from e where anon_id is not null),
    'sessions',     (select count(distinct session_id) from e where session_id is not null),
    'events',       (select count(*) from e),
    'visitors',     (select count(distinct visitor_id) from e),
    'with_profile', (select count(distinct e.user_id) from e
                     join profiles p on p.uid = e.user_id where e.user_id is not null),
    'one_hit',      (select count(*) from (
                       select visitor_id from e group by visitor_id having count(*) = 1) t),
    'returning',    (select count(*) from (
                       select user_id from e where user_id is not null group by user_id
                       having count(distinct date(created_at at time zone 'Europe/Kyiv')) > 1) t),
    'sessions_per_user', (
      select case when count(distinct user_id) = 0 then null
        else round(count(distinct session_id)::numeric / count(distinct user_id), 2) end
      from e where session_id is not null and user_id is not null),
    'pwa_installs', (select count(*) from e where event_type = 'pwa_install'),
    'failures',     (select count(*) from e where event_type in ('db_refusal','js_error')),
    -- ── РОЗБИВКИ ПОДІЙ ────────────────────────────────────────────────────────
    'by_tab', (select coalesce(jsonb_object_agg(tab, jsonb_build_object(
                 'visitors', u, 'users', uu, 'views', n)), '{}'::jsonb)
               from (select tab, count(distinct visitor_id) u,
                            count(distinct user_id) uu, count(*) n
                     from e where event_type = 'tab_view' and tab is not null
                     group by tab) x),
    'by_device', (select coalesce(jsonb_object_agg(d, jsonb_build_object(
                    'visitors', u, 'events', n)), '{}'::jsonb)
                  from (select coalesce(meta->>'device','—') d,
                               count(distinct visitor_id) u, count(*) n
                        from e where meta ? 'device' group by 1) y),
    'by_hour', (select coalesce(jsonb_object_agg(h::text, n), '{}'::jsonb)
                from (select extract(hour from created_at at time zone 'Europe/Kyiv')::int h,
                             count(*) n from e group by 1) z),
    'by_event', (select coalesce(jsonb_object_agg(event_type, n), '{}'::jsonb)
                 from (select event_type, count(*) n from e group by event_type) w),
    -- ── РОЗДІЛЕННЯ ЗАХОДІВ (лише з 26.08, див. шапку) ─────────────────────────
    'modes_since', (select min(created_at) from analytics_events where event_type = 'session_start'),
    'by_app_mode', (select coalesce(jsonb_object_agg(m, jsonb_build_object(
                      'visits', n, 'users', uu, 'guests', gg)), '{}'::jsonb)
                    from (select coalesce(app_mode,'—') m, count(distinct session_id) n,
                                 count(distinct user_id) uu, count(distinct anon_id) gg
                          from s group by 1) am),
    'by_browser', (select coalesce(jsonb_object_agg(b, jsonb_build_object(
                     'visits', n, 'users', uu, 'guests', gg)), '{}'::jsonb)
                   from (select coalesce(browser,'—') b, count(distinct session_id) n,
                                count(distinct user_id) uu, count(distinct anon_id) gg
                         from s group by 1) br),
    'by_os', (select coalesce(jsonb_object_agg(o, jsonb_build_object(
                'visits', n, 'users', uu, 'guests', gg)), '{}'::jsonb)
              from (select coalesce(os,'—') o, count(distinct session_id) n,
                           count(distinct user_id) uu, count(distinct anon_id) gg
                    from s group by 1) oss),
    -- ── СЕЛА ТИХ, ХТО СПРАВДІ ЗАХОДИВ ─────────────────────────────────────────
    -- 🛑 Не плутати зі старим «Населені пункти (профілі)»: там був зріз АНКЕТ, тобто
    -- де люди живуть. Тут — де живуть ті, хто заходив у цей період. Вова просив саме
    -- друге («тап → хто саме заходив сьогодні / за 7 днів»), а перше лишається окремо.
    'by_settlement', (select coalesce(jsonb_object_agg(st, jsonb_build_object(
                        'users', uu, 'events', n)), '{}'::jsonb)
                      from (select coalesce(nullif(trim(p.settlement),''),'не вказано') st,
                                   count(distinct e.user_id) uu, count(*) n
                            from e join profiles p on p.uid = e.user_id
                            where e.user_id is not null group by 1) se)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_analytics_overview(text) from public, anon;
grant execute on function public.admin_analytics_overview(text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 2. «ХТО САМЕ ЗАХОДИВ» — один запит на всі тапи екрана.
-- ══════════════════════════════════════════════════════════════════════════════
-- 🔑 ОДНА ФУНКЦІЯ, А НЕ П'ЯТЬ. Питання скрізь те саме — «покажи людей за цим числом», —
-- міняється лише звуження. П'ять окремих функцій означали б п'ять копій правила «хто
-- вважається людиною», і вони б розійшлись (у проєкті це вже ставалось із антиспамом).
--
-- p_scope: all | tab | device | app_mode | browser | os | settlement
-- p_key  : значення для звуження (для 'all' ігнорується)
--
-- ⚠️ Гості НЕ потрапляють у список імен — їх немає як назвати. Вони віддаються
-- ЧИСЛОМ поруч, бо мовчазно викинути третину трафіку означало б збрехати в інший бік.
create or replace function public.admin_analytics_people(
  p_period text default '7d',
  p_scope  text default 'all',
  p_key    text default null)
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

  with base as (
    select * from analytics_events
    where v_from is null or created_at >= v_from
  ),
  -- Сесії періоду з їхнім контекстом — потрібні і для звуження по PWA/браузеру/ОС,
  -- і щоб порахувати кожній людині ЗАХОДИ, а не події.
  -- `distinct on` із тієї самої причини, що в огляді: без нього перезавантаження
  -- сторінки розмножило б УСІ події тієї сесії при приєднанні.
  sess as (
    select distinct on (session_id)
           session_id, meta->>'app_mode' app_mode, meta->>'browser' browser, meta->>'os' os
    from base where event_type = 'session_start' and session_id is not null
    order by session_id, created_at
  ),
  e as (
    select b.* from base b
    left join sess s on s.session_id = b.session_id
    where case p_scope
      when 'tab'        then b.event_type = 'tab_view' and b.tab = p_key
      when 'device'     then coalesce(b.meta->>'device','—') = p_key
      when 'app_mode'   then coalesce(s.app_mode,'—') = p_key
      when 'browser'    then coalesce(s.browser,'—') = p_key
      when 'os'         then coalesce(s.os,'—') = p_key
      when 'settlement' then b.user_id in (
             select uid from profiles
             where coalesce(nullif(trim(settlement),''),'не вказано') = p_key)
      else true
    end
  )
  select jsonb_build_object(
    'period', p_period, 'scope', p_scope, 'key', p_key,
    'generated_at', now(),
    'events',  (select count(*) from e),
    'users',   (select count(distinct user_id) from e where user_id is not null),
    'guests',  (select count(distinct anon_id) from e where anon_id is not null),
    'guest_events', (select count(*) from e where user_id is null),
    'guest_visits', (select count(distinct session_id) from e
                     where user_id is null and session_id is not null),
    'people', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select p.uid,
               coalesce(nullif(trim(concat_ws(' ', p.name, p.surname)),''), 'без імені') as name,
               p.email,
               coalesce(nullif(trim(p.settlement),''),'не вказано') as settlement,
               count(*)                                   as events,
               count(distinct e.session_id)               as visits,
               count(distinct date(e.created_at at time zone 'Europe/Kyiv')) as days,
               min(e.created_at)                          as first_at,
               max(e.created_at)                          as last_at
        from e join profiles p on p.uid = e.user_id
        where e.user_id is not null
        group by p.uid, p.name, p.surname, p.email, p.settlement
        order by count(*) desc
        limit 200) t),
    -- 🔑 «Скільки разів заходив» на рівні всієї вибірки — щоб підпис під списком не
    -- доводилось складати в браузері з двох різних чисел і не помилитись.
    'visits', (select count(distinct session_id) from e where session_id is not null)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_analytics_people(text, text, text) from public, anon;
grant execute on function public.admin_analytics_people(text, text, text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════════
-- 3. ЗБОЇ ПОШТУЧНО — з іменем, поштою і часом кожного випадку.
-- ══════════════════════════════════════════════════════════════════════════════
-- 🗣️ «якщо є збої, то тап відкриває деталі: який користувач, його email, ім'я, що
--     сталося, який баг, час».
-- 🛑 `admin_failures()` лишається і не замінюється: вона відповідає на «що зламано і в
-- скількох», а це питання головніше при першому погляді. Ця функція відповідає на
-- друге питання — «покажи мені конкретний випадок», — і тільки після тапу.
-- ⚠️ Приєднуємось І по `user_id`, І по `visitor_id`: збої, записані до 26.08, мали лише
-- `visitor_id`, і без другої гілки весь старий журнал лишився б безіменним.
create or replace function public.admin_failure_cases(p_period text default '30d')
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

  select jsonb_build_object(
    'period', p_period,
    'generated_at', now(),
    'total', (select count(*) from analytics_events
              where event_type in ('db_refusal','js_error')
                and (v_from is null or created_at >= v_from)),
    'cases', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select ev.id,
               ev.event_type                              as kind,
               ev.created_at                              as at,
               coalesce(ev.meta->>'code', ev.meta->>'kind','')   as code,
               coalesce(ev.meta->>'msg','')               as message,
               coalesce(ev.meta->>'at','')                as place,
               ev.tab,
               (ev.user_id is null and p.uid is null)     as guest,
               coalesce(nullif(trim(concat_ws(' ', p.name, p.surname)),''),
                        case when ev.user_id is null then 'гість' else 'без імені' end) as who,
               p.email                                    as email,
               ev.visitor_id                              as device
        from analytics_events ev
        -- 🛑 `visitor_id` це TEXT, і кинути його в `::uuid` наосліп означало б валити
        -- ВЕСЬ журнал збоїв на першому ж рядку, де там не UUID. Тому спершу зразок.
        left join profiles p on p.uid = case
          when ev.user_id is not null then ev.user_id
          when ev.visitor_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then ev.visitor_id::uuid
          else null end
        where ev.event_type in ('db_refusal','js_error')
          and (v_from is null or ev.created_at >= v_from)
        order by ev.created_at desc
        limit 300) t)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_failure_cases(text) from public, anon;
grant execute on function public.admin_failure_cases(text) to authenticated;

-- ── ЯК ПЕРЕВІРИТИ НАЖИВО (транзакція з відкотом) ────────────────────────────────
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"email":"<email адміна>","role":"authenticated"}', true);
--   select admin_analytics_overview('7d');
--   select admin_analytics_people('7d','all',null);
--   select admin_failure_cases('30d');
-- rollback;
