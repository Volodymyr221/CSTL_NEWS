-- ============================================================================
-- CSTL LIFE — ФІКС RLS для push_subscriptions
-- ============================================================================
-- Помилка: "new row violates row-level security policy for table push_subscriptions"
-- Причина: політики (дозволи) на INSERT/UPDATE не пропускають анонімного юзера.
--
-- Запустити у Supabase → SQL Editor → New Query → вставити все → Run.
-- Ідемпотентний (можна запускати повторно).
-- ============================================================================

-- Переконуємось що RLS увімкнено
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Прибираємо ВСІ старі політики (і нові, і старі назви)
DROP POLICY IF EXISTS "Anyone can insert push subscription"  ON push_subscriptions;
DROP POLICY IF EXISTS "Anyone can update push subscription"  ON push_subscriptions;
DROP POLICY IF EXISTS "Anyone can delete push subscription"  ON push_subscriptions;
DROP POLICY IF EXISTS "Service role can read all subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "push_insert" ON push_subscriptions;
DROP POLICY IF EXISTS "push_update" ON push_subscriptions;
DROP POLICY IF EXISTS "push_delete" ON push_subscriptions;
DROP POLICY IF EXISTS "push_select" ON push_subscriptions;

-- INSERT — анонімний і залогінений юзер можуть додати підписку
CREATE POLICY "push_insert" ON push_subscriptions
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- UPDATE — потрібно для upsert (INSERT ... ON CONFLICT DO UPDATE)
-- ОБОВ'ЯЗКОВО і USING, і WITH CHECK — інакше upsert падає
CREATE POLICY "push_update" ON push_subscriptions
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- DELETE — зняти відстеження
CREATE POLICY "push_delete" ON push_subscriptions
  FOR DELETE TO anon, authenticated
  USING (true);

-- SELECT — тільки service_role (Edge Function) читає всі підписки
CREATE POLICY "push_select" ON push_subscriptions
  FOR SELECT TO service_role
  USING (true);

-- Явно видаємо привілеї ролям (на випадок якщо GRANT не спрацював автоматично)
GRANT INSERT, UPDATE, DELETE ON push_subscriptions TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE push_subscriptions_id_seq TO anon, authenticated;
