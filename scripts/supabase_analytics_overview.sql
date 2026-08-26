-- scripts/supabase_analytics_overview.sql
-- ✅ НАКАТАНО 26.08.2026 (міграція `analytics_overview_rpc`).
--
-- 🔴 НАВІЩО. Адмінка тягнула СИРІ події в браузер і рахувала їх там:
--     supa.from('analytics_events').select(...).limit(20000)
-- Але PostgREST має серверну стелю `db-max-rows` (1000), і клієнт її підняти НЕ МОЖЕ.
-- Тобто на екран ішли числа, пораховані по першій тисячі рядків, ще й без `ORDER BY`.
--
-- 📐 ЗАМІРЯНО НА ЖИВІЙ БАЗІ 26.08 (аудит `_ai-tools/AUDIT_ANALYTICS_2026-08.md`):
--   | що                  | екран казав | насправді |
--   | унікальних за 7 днів | 203        | 336       |
--   | унікальних усього    | 35         | 736       |
--   | подій усього         | 1000       | 11 130    |
--
-- 🔑 Найкращий доказ був видний БЕЗ бази — суми на екрані давали рівно 1000:
--     розділи 544+164+134+82+76 = 1000 · пристрої 803+197 = 1000.
-- Це відбиток стелі, а не властивість даних.
--
-- 🛑 ЗВІДСИ Й ПАРАДОКС «усього менше, ніж за 7 днів», на який показав Вова: для «весь
-- час» приходила тисяча НАЙСТАРІШИХ подій (липень), де різних відвідувачів мало; для
-- «7 днів» — тисяча зі свіжих 1836. Обидва числа неправдиві, просто по-різному.
--
-- ✅ Тепер рахує база на ПОВНОМУ наборі. Правило «весь час ≥ 7 днів» не треба нікуди
-- вписувати як перевірку: воно стало арифметично неможливим порушити.
-- 📐 Після накату: 15 → 336 → 531 → 736 відвідувачів (today/7d/30d/all), монотонно.
--
-- ⚠️ ЧОМУ ТУТ НЕМАЄ «КОРИСТУВАЧІВ» І «СЕСІЙ». У `analytics_events` рівно шість колонок:
-- id · visitor_id · event_type · tab · meta · created_at. Ні `user_id`, ні `session_id`
-- не існує, а `visitor_id` це `currentUserId() || getAnonId()` — тобто змішані
-- авторизований UUID і анонімний id. Одна людина до входу і після входу дає ДВА різні
-- значення. Тому поле зветься `visitors`, а не `users`, і жодної метрики сесій тут нема:
-- порахувати їх сьогодні НЕМА З ЧОГО. Це наступний крок (окрема міграція).
--
-- 🔑 `one_hit` / `with_profile` / `returning` віддаються НАВМИСНО: без них 736
-- «відвідувачів» виглядають як аудиторія, хоча 628 із них мали рівно одну подію, а
-- профіль мають 11. Це те, що відрізняє «нас читає громада» від «нас індексують боти».

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

  -- 🔑 «Сьогодні» — календарна доба КИЄВА. Стара адмінка брала годину через
  -- `new Date().getHours()`, тобто в поясі того, ХТО ДИВИТЬСЯ: з іншої країни та сама
  -- подія потрапляла б в іншу добу.
  v_from := case p_period
    when 'today' then (date_trunc('day', now() at time zone 'Europe/Kyiv')) at time zone 'Europe/Kyiv'
    when '7d'    then now() - interval '7 days'
    when '30d'   then now() - interval '30 days'
    else null                     -- 'all' — без нижньої межі
  end;

  with e as (
    select * from analytics_events
    where v_from is null or created_at >= v_from
  )
  select jsonb_build_object(
    'period', p_period,
    'from', v_from,
    'generated_at', now(),
    'visitors',     (select count(distinct visitor_id) from e),
    'events',       (select count(*) from e),
    'with_profile', (select count(distinct e.visitor_id) from e
                     join profiles p on p.uid::text = e.visitor_id),
    'one_hit',      (select count(*) from (
                       select visitor_id from e group by visitor_id having count(*) = 1) t),
    'returning',    (select count(*) from (
                       select visitor_id from e group by visitor_id
                       having count(distinct date(created_at at time zone 'Europe/Kyiv')) > 1) t),
    'pwa_installs', (select count(*) from e where event_type = 'pwa_install'),
    'failures',     (select count(*) from e where event_type in ('db_refusal','js_error')),
    -- Кожен розділ віддає І відвідувачів, І перегляди: саме плутанина «544 — це люди чи
    -- заходи?» була головною вадою старого екрана.
    'by_tab', (select coalesce(jsonb_object_agg(tab, jsonb_build_object(
                 'visitors', u, 'views', n)), '{}'::jsonb)
               from (select tab, count(distinct visitor_id) u, count(*) n
                     from e where event_type = 'tab_view' and tab is not null
                     group by tab) x),
    'by_device', (select coalesce(jsonb_object_agg(d, jsonb_build_object(
                    'visitors', u, 'events', n)), '{}'::jsonb)
                  from (select coalesce(meta->>'device','—') d,
                               count(distinct visitor_id) u, count(*) n
                        from e group by 1) y),
    'by_hour', (select coalesce(jsonb_object_agg(h::text, n), '{}'::jsonb)
                from (select extract(hour from created_at at time zone 'Europe/Kyiv')::int h,
                             count(*) n from e group by 1) z),
    'by_event', (select coalesce(jsonb_object_agg(event_type, n), '{}'::jsonb)
                 from (select event_type, count(*) n from e group by event_type) w)
  ) into result;

  return result;
end;
$$;

revoke all on function public.admin_analytics_overview(text) from public, anon;
grant execute on function public.admin_analytics_overview(text) to authenticated;

-- ── ЯК ПЕРЕВІРИТИ НАЖИВО (транзакція з відкотом, підставлені роль і JWT) ─────────
-- begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims','{"email":"<email адміна>","role":"authenticated"}', true);
--   select p, admin_analytics_overview(p) from unnest(array['today','7d','30d','all']) p;
-- rollback;
-- ✅ Заміряно 26.08: 15 / 336 / 531 / 736 відвідувачів — монотонно, як і має бути.
-- ✅ Без адміна функція віддає {"error":"not admin"} — перевірено тим самим способом.

-- ══════════════════════════════════════════════════════════════════════════════
-- ДРУГА МІГРАЦІЯ ТОГО САМОГО ДНЯ: `analytics_user_anon_session_split`
-- ✅ НАКАТАНО 26.08.2026.
--
-- 🔴 ЧОМУ. `visitor_id` змішував акаунт і гостя в одній колонці. Заміряно:
--   • 736 «унікальних» = 11 акаунтів + 725 анонімних пристроїв;
--   • 11 акаунтів дали 8192 події (74%), 725 «гостей» — 2938;
--   • 628 із 736 мали РІВНО ОДНУ подію (прев'ю посилань, сканери, боти).
-- Тобто головне число екрана описувало не людей.
--
-- ЩО ДОДАНО в `analytics_events`:
--   user_id    uuid → auth.users (NULL для гостя) — ЄДИНА чесна одиниця «людина»
--   anon_id    text (NULL для залогіненого)
--   session_id uuid — один захід у застосунок
-- + індекси (user_id, created_at), (session_id), (created_at desc).
--
-- 🛑 `visitor_id` НЕ чіпали: на ньому тримається журнал збоїв («скільки різних
-- пристроїв зачепило»), і ламати робочу діагностику заради чистоти схеми не можна.
-- ⚠️ Історію заповнено (0 подій лишились без обох полів), а `session_id` для історії
-- чесно NULL — сесій тоді не існувало, вигадувати їх заднім числом не стали.
--
-- 📐 ПІСЛЯ ДВОХ МІГРАЦІЙ (заміряно тим самим способом із відкотом):
--   період | людей | гостьових пристроїв | подій | старе число
--   today  |   1   |        14           |    77 |   15
--   7d     |   6   |       330           |  1836 |  336
--   30d    |   7   |       524           |  5717 |  531
--   all    |  11   |       725           | 11130 |  736
-- ➡️ Тобто «336 унікальних за 7 днів» насправді 6 людей.
