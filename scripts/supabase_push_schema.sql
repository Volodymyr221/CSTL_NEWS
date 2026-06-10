-- ============================================================================
-- CSTL LIFE — push_subscriptions (Level B — Web Push сповіщення для автобусів)
-- ============================================================================
-- Запустити у Supabase SQL Editor → New Query → Run
-- Можна запускати повторно (ідемпотентний скрипт).
-- ============================================================================

-- Таблиця push підписок: одна підписка = один браузер + один маршрут + одна дата
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id             BIGSERIAL PRIMARY KEY,
  user_uuid      TEXT        NOT NULL,
  endpoint       TEXT        NOT NULL,   -- URL push-підписки браузера
  p256dh         TEXT        NOT NULL,   -- Ключ шифрування
  auth_key       TEXT        NOT NULL,   -- Auth secret
  route_id       TEXT        NOT NULL,   -- ID маршруту з schedule.json
  route_name     TEXT,                   -- Назва маршруту ("ЛУЦЬК → ОЛИКА")
  boarding_stop  TEXT,                   -- Зупинка посадки (або null = перша)
  alighting_stop TEXT,                   -- Зупинка висадки (або null = остання)
  track_date     DATE        NOT NULL,   -- Дата відстеження (YYYY-MM-DD)
  dep_time       TEXT,                   -- Час відправлення HH:MM (від boarding_stop)
  notified_dep   BOOLEAN     DEFAULT FALSE, -- Вже надіслали push (≤15 хв до відправлення)
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Унікальний ключ: один рядок на endpoint + маршрут + день
-- При повторному відстеженні — upsert оновлює дані (dep_time, зупинки)
CREATE UNIQUE INDEX IF NOT EXISTS push_subs_unique
  ON push_subscriptions (endpoint, route_id, track_date);

-- RLS (Row Level Security — безпека на рівні рядків)
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Будь-хто може додати підписку (анонімний юзер)
DROP POLICY IF EXISTS "Anyone can insert push subscription" ON push_subscriptions;
CREATE POLICY "Anyone can insert push subscription"
  ON push_subscriptions FOR INSERT WITH CHECK (true);

-- Будь-хто може оновити (upsert) свою підписку
DROP POLICY IF EXISTS "Anyone can update push subscription" ON push_subscriptions;
CREATE POLICY "Anyone can update push subscription"
  ON push_subscriptions FOR UPDATE USING (true);

-- Будь-хто може видалити свою підписку (при знятті відстеження)
DROP POLICY IF EXISTS "Anyone can delete push subscription" ON push_subscriptions;
CREATE POLICY "Anyone can delete push subscription"
  ON push_subscriptions FOR DELETE USING (true);

-- Edge Function (service_role) може читати всі підписки для надсилання push
DROP POLICY IF EXISTS "Service role can read all subscriptions" ON push_subscriptions;
CREATE POLICY "Service role can read all subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.role() = 'service_role');
