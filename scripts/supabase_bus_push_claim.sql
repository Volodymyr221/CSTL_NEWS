-- ============================================================================
-- CSTL LIFE — ENDPOINT АВТОБУСНИХ СПОВІЩЕНЬ НАЛЕЖИТЬ ТОМУ, ХТО НА ПРИСТРОЇ ЗАРАЗ
-- ============================================================================
--
-- ✅ НАКАТАНО НА ПРОД 17.09.2026 (міграція `claim_bus_push_endpoint`).
--
-- 🔴 СИМПТОМ. Журнал збоїв застосунку, акаунт Катерини, 09.09.2026, 2 випадки:
--       42501  new row violates row-level security policy (USING expression)
--              for table "push_subscriptions"
--    Людина тисне «Відстежувати рейс» → тост «Не вдалося увімкнути сповіщення».
--
-- ⚠️ ЦЕ НЕ ТА САМА ВАДА, ЩО 16.08 (`supabase_push_select_own.sql`). Тоді бракувало
--    SELECT-політики, і текст був БЕЗ дужок. Дужки `(USING expression)` Postgres
--    додає рівно в одному випадку: `INSERT ... ON CONFLICT DO UPDATE` знайшов
--    конфліктний рядок, але той не пройшов USING-вираз політики UPDATE — тобто
--    рядок ЧУЖИЙ. Ця деталь і вказала на причину: розслідування «знову SELECT»
--    завело б у глухий кут удруге.
--
-- 🔑 ПРИЧИНА. Унікальний індекс `push_subs_unique` — це
--    `(endpoint, route_id, track_date)`, БЕЗ власника. А `endpoint` — адреса
--    ПРИСТРОЮ, не людини. На одному телефоні може побувати кілька акаунтів
--    (сімейний пристрій; наші ж тести з двох акаунтів). Підписка попереднього
--    лишалась у базі — і наступна людина не могла відстежити той самий рейс у той
--    самий день УЗАГАЛІ, скільки б не тиснула.
--
-- 🛑 І це не лише помилка на екрані. Edge Function `send-bus-push` шле на
--    `endpoint`, тобто на ПРИСТРІЙ. Забутий рядок чужого акаунта прилетів би
--    сповіщенням про чужий рейс тому, хто користується телефоном зараз.
--
-- ✅ РІШЕННЯ — те саме, яким 24.08 вилікували `user_push_devices`
--    (`claim_push_device` у `supabase_account_scoped_state.sql`): пристрій
--    належить тому, хто на ньому зараз. Клієнт кличе цю функцію ПЕРЕД записом
--    підписки (`savePushSubscription` у `src/core/supabase.js`), раз на сеанс на
--    endpoint, плюс повтор, якщо 42501 усе ж прилетів.
--
-- 🔑 ЩО ЦЕ **НЕ** ПОСЛАБЛЮЄ. Функція чіпає лише рядки з ЦИМ `endpoint` і лише для
--    залогіненого. Прочитати чуже нею не можна — вона нічого не повертає, крім
--    кількості прибраних рядків. Своїх рядків не чіпає: їх оновить сам `upsert`.
--    `SECURITY DEFINER` потрібен тому, що RLS (правильно) не дає клієнту стерти
--    чужий рядок — а стерти його тут і треба.
--
-- ✅ ДОВЕДЕНО ЕКСПЕРИМЕНТОМ НА ЖИВІЙ БАЗІ 17.09 (усе в транзакції, відкочено;
--    роль і JWT підставлені так само, як це робить PostgREST для залогіненої
--    людини — `set_config('role','authenticated')` + `request.jwt.claims`):
--
--      A вставляє рядок (endpoint E, рейс R, дата D) ………………………… OK
--      B робить upsert того самого (E,R,D) …… 42501 new row violates row-level
--                          security policy (USING expression)   ← СИМПТОМ ВІДТВОРЕНО
--      B кличе claim_bus_push_endpoint(E) …………… прибрано чужих рядків: 1
--      B повторює той самий upsert ……………………………………………………… OK
--
--    Тобто відтворено рівно те повідомлення, яке бачила Катерина, і показано, що
--    після фікса та сама послідовність проходить.
-- ============================================================================

create or replace function public.claim_bus_push_endpoint(p_endpoint text)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_endpoint is null or length(p_endpoint) < 20 then
    raise exception 'bad endpoint' using errcode = '22023';
  end if;

  delete from public.push_subscriptions
   where endpoint = p_endpoint
     and user_uuid is distinct from (auth.uid())::text;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.claim_bus_push_endpoint(text) from public, anon;
grant execute on function public.claim_bus_push_endpoint(text) to authenticated;

-- ── ЧОМУ НЕ ПЕРЕРОБИЛИ УНІКАЛЬНИЙ ІНДЕКС ────────────────────────────────────
-- Спокуса: додати `user_uuid` в `push_subs_unique` — і конфлікту не буде.
-- Відкинуто свідомо: тоді рядки двох акаунтів співіснували б на ОДНОМУ пристрої,
-- і обидва слали б push на ту саму адресу. Помилка зникла б, а хибне сповіщення
-- лишилось би — вилікували б симптом, а не хворобу. Один пристрій = одна людина
-- зараз; саме це й описує нинішній індекс, і він правильний.
