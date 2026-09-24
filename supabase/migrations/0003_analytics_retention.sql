-- 0003_analytics_retention.sql — В5: РЕТЕНШЕН АНАЛІТИКИ.
-- Автор: аудит 24.09.2026. Накочує Вова через Supabase → SQL Editor.
--
-- ── ЩО НЕ ТАК (заміряно 24.09) ──────────────────────────────────────────────
--   analytics_events: 16 447 рядків, найстаріший від 11.07.2026.
--   з них tab_view — 15 104, тобто 92% таблиці це «людина перемкнула вкладку».
-- Жодного завдання на прибирання в `cron.job` немає: перевірено, у розкладі
-- сім завдань, і жодне не чистить аналітику.
--
-- 🛑 ЧОМУ ЦЕ ВАЖЛИВО САМЕ ЗАРАЗ, А НЕ «КОЛИ РОЗРОСТЕТЬСЯ». Запуску ще не було
-- (`HOT_RULES` №12): 16 тисяч подій дали кілька людей за два місяці. Тобто це
-- не «мало даних», це «мало людей» — на сотні жителів та сама вкладка дасть
-- сотні тисяч рядків на місяць, і вільних 500 МБ бази не стане тихо, без
-- жодного повідомлення.
--
-- 🔑 ЧОМУ РІЗНІ СТРОКИ ДЛЯ РІЗНИХ ПОДІЙ. `tab_view` цінний рівно поки свіжий:
-- питання до нього — «як ходять ЗАРАЗ». А `js_error`, `db_refusal`,
-- `pwa_install` — рідкісні й потрібні саме історією, їх видаляти шкода.
--   tab_view, content_seen, session_start  → 30 днів (масові, швидко старіють)
--   решта                                  → 180 днів
--
-- ⚠️ Підсумки НЕ втрачаємо: `rollup_content_views()` (щодня о 02:10) уже
-- згортає перегляди в окрему таблицю. Тому прибирання зачіпає сирі події, а не
-- те, з чого читають цифри.

create or replace function public.prune_analytics_events()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n integer;
begin
  delete from public.analytics_events
  where (event_type in ('tab_view', 'content_seen', 'content_open', 'session_start')
           and created_at < now() - interval '30 days')
     or (event_type not in ('tab_view', 'content_seen', 'content_open', 'session_start')
           and created_at < now() - interval '180 days');
  get diagnostics n = row_count;
  return n;
end;
$function$;

revoke all on function public.prune_analytics_events() from public, anon, authenticated;

-- Щодня о 03:40 за UTC — окремо від решти завдань, щоб довге видалення не
-- зустрілось із нічним згортанням переглядів (02:10) і лікуванням коментарів
-- (03:15).
select cron.schedule('prune-analytics', '40 3 * * *',
                     'select public.prune_analytics_events()');

-- ── ПЕРЕВІРКА ПІСЛЯ НАКАТУ ──────────────────────────────────────────────────
-- 1) Скільки прибере ПЕРШИЙ прогін (порахувати ДО запуску):
--      select count(*) from analytics_events
--      where event_type in ('tab_view','content_seen','content_open','session_start')
--        and created_at < now() - interval '30 days';
-- 2) Запустити руками один раз:  select public.prune_analytics_events();
-- 3) Завдання в розкладі:  select jobname, schedule from cron.job where jobname='prune-analytics';
