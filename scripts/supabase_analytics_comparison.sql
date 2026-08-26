-- scripts/supabase_analytics_comparison.sql
-- Міграція `analytics_comparison` — 26.08.2026.
--
-- 🗣️ Замовлення Вови: «як можна відслідковувати, порівнювати минулий тиждень з поточним,
-- минулий місяць з поточним місяцем — щоб прогрес, регрес відслідковувати».
--
-- 🔑 ГОЛОВНЕ РІШЕННЯ: РОЗДІЛЯЄМО «ЗМІНУ» І «СИГНАЛ».
-- Відсоток — математична характеристика, її можна порахувати завжди. Сигнал —
-- аналітична: чи взагалі можна робити з цієї зміни висновок. Коли людей було 5, а стало
-- 8, «+60%» математично бездоганне й аналітично порожнє: у базі 11 тестових акаунтів, і
-- один зайвий захід зміщує все. Зелена стрілка «+60%» тут була б брехнею у формі правди.
-- ➡️ Тому кожна метрика віддає ОБИДВА поля, і екран показує відсоток лише там, де він
-- щось означає.
--
-- 🛑 N/A ≠ 0 — І ЦЕ НЕ ПРИДИРКА.
-- `session_id` існує лише з 26.08.2026. Якщо для попереднього тижня чесно порахувати
-- заходи, вийде нуль — і будь-яке порівняння покаже «зростання з нуля», хоча насправді
-- ми просто тоді не рахували. Тому там, де збір почався ПІЗНІШЕ за початок попереднього
-- вікна, `previous` віддається як `null`, а поруч стоїть причина. Нуль означає «не було»,
-- `null` означає «не знаємо» — плутати їх не можна.
--
-- 🛑 ЧОМУ ВІКНА КОВЗНІ, А НЕ КАЛЕНДАРНІ. Перемикач на екрані вже ковзний
-- («7 днів» = останні 7 діб). Календарний тиждень у порівнянні при ковзній картці згори
-- дав би два різні числа під однією назвою — і людина не мала б як зрозуміти, котре
-- правильне. Одна одиниця виміру на весь екран.
--
-- 🔑 ЧОМУ РАХУЄ БАЗА, А НЕ МОДЕЛЬ. Відсотки й різниці — робота калькулятора, а не
-- аналітика. Модель, яка сама рахує арифметику, помиляється тихо; база — ні.

create or replace function public.admin_analytics_comparison(p_period text default '7d')
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $$
declare
  v_len          interval;
  v_cur_from     timestamptz;
  v_prev_from    timestamptz;
  v_now          timestamptz := now();
  v_sessions_since timestamptz;
  result jsonb;
begin
  if not is_admin() then
    return jsonb_build_object('error', 'not admin');
  end if;

  v_len := case p_period
    when 'today' then interval '1 day'
    when '30d'   then interval '30 days'
    else              interval '7 days'
  end;

  -- «Сьогодні» — календарна доба Києва проти попередньої доби; решта — ковзні вікна.
  if p_period = 'today' then
    v_cur_from := (date_trunc('day', v_now at time zone 'Europe/Kyiv')) at time zone 'Europe/Kyiv';
  else
    v_cur_from := v_now - v_len;
  end if;
  v_prev_from := v_cur_from - v_len;

  -- Відколи взагалі існують заходи. Усе, що раніше, — не нуль, а невідомо.
  select min(created_at) into v_sessions_since
  from analytics_events where session_id is not null;

  with cur as (
    select * from analytics_events where created_at >= v_cur_from
  ),
  prev as (
    select * from analytics_events
    where created_at >= v_prev_from and created_at < v_cur_from
  ),
  -- Один рядок = одна метрика. Так додати нову метрику коштує один рядок, а правило
  -- порівняння лишається ОДНЕ на всіх — інакше воно розійдеться копіями.
  m as (
    select 'users' k,
           (select count(distinct user_id) from cur  where user_id is not null) c,
           (select count(distinct user_id) from prev where user_id is not null) p,
           false late
    union all select 'guests',
           (select count(distinct anon_id) from cur  where anon_id is not null),
           (select count(distinct anon_id) from prev where anon_id is not null),
           false
    union all select 'events',
           (select count(*) from cur), (select count(*) from prev), false
    union all select 'tab_views',
           (select count(*) from cur  where event_type = 'tab_view'),
           (select count(*) from prev where event_type = 'tab_view'),
           false
    union all select 'failures',
           (select count(*) from cur  where event_type in ('db_refusal','js_error')),
           (select count(*) from prev where event_type in ('db_refusal','js_error')),
           false
    union all select 'pwa_installs',
           (select count(*) from cur  where event_type = 'pwa_install'),
           (select count(*) from prev where event_type = 'pwa_install'),
           false
    union all select 'actions',
           (select count(*) from cur  where event_type in
              ('feed_post_create','feed_post_edit','question_answer','board_post_submit')),
           (select count(*) from prev where event_type in
              ('feed_post_create','feed_post_edit','question_answer','board_post_submit')),
           false
    -- 🛑 Заходи — єдина метрика, збір якої почався пізніше за історію подій. Прапорець
    -- `late` вмикає підміну попереднього значення на `null`, якщо вікно старіше за збір.
    union all select 'sessions',
           (select count(distinct session_id) from cur  where session_id is not null),
           (select count(distinct session_id) from prev where session_id is not null),
           (v_sessions_since is null or v_prev_from < v_sessions_since)
  ),
  calc as (
    select k,
           c as current,
           case when late then null else p end as previous,
           case when late then null else c - p end as absolute_change,
           case
             when late then null
             when p = 0 then null            -- від нуля відсоток не рахуємо взагалі
             else round((c - p)::numeric * 100 / p, 1)
           end as percent_change,
           -- 🔑 СИГНАЛ. Три чесні рівні замість псевдостатистики: довірчі інтервали на
           -- числах у півтора десятка спостережень були б обманом у науковій обгортці.
           -- Дивимось на ОБСЯГ (більше з двох), бо саме він вирішує, чи зміна щось значить.
           case
             when late                       then 'збір_почався_пізніше'
             when c = 0 and p = 0            then 'немає_даних'
             when p = 0                      then 'нове'
             when c = p                      then 'без_змін'
             when greatest(c, p) < 10        then 'недостатньо'
             when greatest(c, p) < 50        then 'мало'
             else                                 'помітно'
           end as signal
    from m
  )
  select jsonb_build_object(
    'period', p_period,
    'current_from', v_cur_from, 'current_to', v_now,
    'previous_from', v_prev_from, 'previous_to', v_cur_from,
    'sessions_since', v_sessions_since,
    'generated_at', v_now,
    'metrics', (select jsonb_object_agg(k, jsonb_build_object(
        'current', current, 'previous', previous,
        'absolute_change', absolute_change, 'percent_change', percent_change,
        'signal', signal)) from calc)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_analytics_comparison(text) from public, anon;
grant execute on function public.admin_analytics_comparison(text) to authenticated;

-- ── Журнал AI: версія завдання ─────────────────────────────────────────────────
-- 🔑 Без неї через місяць неможливо зрозуміти, чому старий висновок звучить інакше:
-- змінилися дані чи змінилось те, про що ми питали.
alter table public.analytics_ai_reports
  add column if not exists prompt_version text;

-- ── ЯК ПЕРЕВІРИТИ ───────────────────────────────────────────────────────────────
-- select set_config('request.jwt.claims',
--   json_build_object('email',(select email from admins limit 1),'role','authenticated')::text, true);
-- select jsonb_pretty(admin_analytics_comparison('7d'));
