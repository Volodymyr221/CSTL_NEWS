-- 0004_push_indexes.sql — В6: ІНДЕКСИ ПІД РЕАЛЬНІ ЗАПИТИ PUSH.
-- Автор: аудит 24.09.2026. Накочує Вова через Supabase → SQL Editor.
--
-- ── ЧЕСНО ПРО ПІДСТАВУ ──────────────────────────────────────────────────────
-- 🛑 На 24.09 `push_subscriptions` МАЄ 0 РЯДКІВ. Тобто зараз ця міграція не
-- прискорює нічого: на порожній таблиці план і так послідовний. Це робота НА
-- ПЕРСПЕКТИВУ (`HOT_RULES` №12) — щоб спрацювало на першому ж справжньому
-- потоці підписок, а не щоб полагодити те, що болить сьогодні.
--
-- ── ЯКІ САМЕ ЗАПИТИ (виписані з коду, не з голови) ──────────────────────────
--   supabase/functions/send-bus-push/index.ts:106
--     .delete().lt('track_date', today)                → скан по track_date
--   supabase/functions/send-bus-push/index.ts:110
--     .select('*').eq('track_date', today)             → скан по track_date
--   src/core/supabase.js (fetchTrackedRoutesFromDB)
--     .eq('user_uuid', uid).gte('track_date', todayISO) → (user_uuid, track_date)
--   src/core/supabase.js (migratePushEndpoint)
--     .eq('user_uuid', uid).eq('endpoint', old)         → (user_uuid, endpoint)
--
-- ⚠️ Наявний `push_subs_unique (endpoint, route_id, track_date)` жодному з них
-- не допомагає: у всіх чотирьох перша колонка інша, а індекс читається лише
-- зліва направо.
--
-- 🔑 ЧОМУ `if not exists` І ЧОМУ БЕЗ `concurrently`. Таблиця порожня, тож
-- блокування на час побудови нікому не заважає; `concurrently` не можна
-- всередині транзакції, а SQL Editor виконує скрипт саме нею.

create index if not exists push_subs_track_date_idx
  on public.push_subscriptions (track_date);

create index if not exists push_subs_user_date_idx
  on public.push_subscriptions (user_uuid, track_date);

create index if not exists push_subs_user_endpoint_idx
  on public.push_subscriptions (user_uuid, endpoint);

-- ── ПЕРЕВІРКА ПІСЛЯ НАКАТУ ──────────────────────────────────────────────────
--   select indexname from pg_indexes
--   where schemaname='public' and tablename='push_subscriptions';
-- очікуємо три нові імені поруч із pkey і push_subs_unique.
