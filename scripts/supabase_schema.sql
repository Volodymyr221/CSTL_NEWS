-- ============================================================================
-- CSTL LIFE — Supabase schema (Фаза 9 Спринт 1)
-- ============================================================================
-- Запустити у Supabase SQL Editor → New Query → Run
-- Перед запуском: знайди БЛОК "AUTHENTICATION SETUP" нижче і впиши свій email.
--
-- ⚠️  Скрипт ІДЕМПОТЕНТНИЙ — можна запускати повторно. Усе скидається і
-- створюється наново. Якщо у БД вже є дані з попередніх запусків — вони
-- видаляться. На цій стадії проекту даних ще нема — безпечно.
--
-- Що створюється:
--   1. posts          — оголошення Дошки громади (3 типи: board/chat/greeting)
--   2. announcements  — офіційні оголошення сільради
--   3. ads            — реклама (з docs/MONETIZATION.md, закладено наперед)
--   4. admins         — whitelist пошт що мають доступ до /admin
--   5. Storage bucket community-photos — для фото оголошень
--   6. RLS policies   — публічне читання тільки 'published', запис тільки admin
-- ============================================================================


-- ============================================================================
-- 0. CLEANUP — скидаємо все що могло створитись раніше (для повторних запусків)
-- ============================================================================
-- CASCADE — видаляє разом з залежностями (індекси, policies, foreign keys)
DROP TABLE IF EXISTS ad_events     CASCADE;
DROP TABLE IF EXISTS ads           CASCADE;
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS posts         CASCADE;
DROP TABLE IF EXISTS admins        CASCADE;

-- Storage policies теж скидаємо (для повторного запуску)
DROP POLICY IF EXISTS "Public read community photos"   ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload to community-photos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete photos"       ON storage.objects;


-- ============================================================================
-- 1. POSTS — Дошка громади 2.0 (3 типи постів)
-- ============================================================================

CREATE TABLE posts (
  id            BIGSERIAL PRIMARY KEY,

  -- 'board' = оголошення (продам/куплю), 'chat' = розмови, 'greeting' = вітання
  type          TEXT NOT NULL DEFAULT 'board' CHECK (type IN ('board', 'chat', 'greeting')),

  -- Для board: 'продам'/'куплю'/'шукаю'/.../'оголошення'. Для chat/greeting: null
  category      TEXT,

  -- Основний текст (обов'язковий для всіх типів)
  text          TEXT NOT NULL,

  -- Заголовок: для board — назва оголошення (опціонально); greeting — кому. chat: null
  title         TEXT,

  -- NULL = анонімно
  author        TEXT,

  -- Телефон / Telegram. Тільки для board
  contact       TEXT,

  -- Колір стікера (тільки для board)
  color         TEXT DEFAULT 'yellow' CHECK (color IN ('yellow', 'green', 'blue', 'pink', 'white')),

  -- Масив URL-ів зі Storage (для всіх типів). До 5 для board, до 1 для chat/greeting
  photos        TEXT[] DEFAULT '{}',

  -- Хештеги (тільки для chat): ['#громада', '#дороги']
  tags          TEXT[] DEFAULT '{}',

  -- Ціна (тільки для board)
  price         NUMERIC,
  currency      TEXT DEFAULT 'UAH',

  -- Для greeting-постів: emoji-обкладинка + CSS-градієнт фону
  cover_emoji    TEXT,
  cover_gradient TEXT,

  -- Село ОТГ (Олика, Дерно, Ставок, Жорнище...)
  location      TEXT,

  -- Модерація: pending → admin клікнув approve/reject
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),

  ts            BIGINT,                    -- legacy timestamp у мс (для імпорту з JSON)
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Індекси для типових запитів
CREATE INDEX idx_posts_status_published ON posts (status, published_at DESC) WHERE status = 'published';
CREATE INDEX idx_posts_type             ON posts (type) WHERE status = 'published';
CREATE INDEX idx_posts_pending          ON posts (created_at DESC) WHERE status = 'pending';


-- ============================================================================
-- 2. ANNOUNCEMENTS — офіційні оголошення адміністрації
-- ============================================================================

CREATE TABLE announcements (
  id            BIGSERIAL PRIMARY KEY,
  pinned        BOOLEAN DEFAULT false,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  author        TEXT,                       -- "Олицька сільська рада" і т.і.
  ts            BIGINT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'published', 'rejected')),
  published_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_announcements_published ON announcements (pinned DESC, published_at DESC)
  WHERE status = 'published';


-- ============================================================================
-- 3. ADS — реклама (з docs/MONETIZATION.md, закладено наперед)
-- ============================================================================

CREATE TABLE ads (
  id            BIGSERIAL PRIMARY KEY,
  title         TEXT NOT NULL,
  body          TEXT,
  image_url     TEXT,                       -- зі Storage
  link_url      TEXT,                       -- куди веде клік (телефон, сайт)
  placement     TEXT NOT NULL CHECK (placement IN ('board', 'news_feed', 'event_card', 'banner')),
  priority      INT DEFAULT 0,              -- 0 = звичайне, 1+ = підняте
  paid_amount   NUMERIC,
  client_name   TEXT,
  client_email  TEXT,
  client_phone  TEXT,
  starts_at     TIMESTAMPTZ DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  views_count   INT DEFAULT 0,
  clicks_count  INT DEFAULT 0,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ads_active ON ads (placement, priority DESC, expires_at)
  WHERE is_active = true;

-- Окрема таблиця для аналітики (щоб UPDATE views_count не блокував читачів)
CREATE TABLE ad_events (
  id          BIGSERIAL PRIMARY KEY,
  ad_id       BIGINT REFERENCES ads(id) ON DELETE CASCADE,
  event_type  TEXT CHECK (event_type IN ('view', 'click')),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_ad_events_ad_id ON ad_events (ad_id, created_at DESC);


-- ============================================================================
-- 4. ADMINS — whitelist пошт що мають доступ до /admin (magic-link auth)
-- ============================================================================

CREATE TABLE admins (
  email       TEXT PRIMARY KEY,
  name        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);


-- ============================================================================
-- 5. AUTHENTICATION SETUP — ВПИШИ СВОЮ ПОШТУ НИЖЧЕ ⬇️
-- ============================================================================
-- Заміни 'твоя_пошта@gmail.com' на email який будеш використовувати для
-- входу в /admin через magic-link. Лист буде приходити саме на цю пошту.
-- Тільки ЦЯ пошта зможе апрувати/реджектити оголошення.

INSERT INTO admins (email, name) VALUES ('твоя_пошта@gmail.com', 'Вова');


-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS) — хто що може робити
-- ============================================================================

-- Функція is_admin() — обходить RLS через SECURITY DEFINER (запобігає catch-22)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE email = auth.email());
$$;


-- POSTS:
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Всі (анонімні і залогінені) бачать тільки опубліковані пости
CREATE POLICY "Public can read published posts"
  ON posts FOR SELECT
  USING (status = 'published');

-- Будь-хто може створити НОВИЙ пост — але тільки зі статусом 'pending'
CREATE POLICY "Anyone can submit a pending post"
  ON posts FOR INSERT
  WITH CHECK (status = 'pending');

CREATE POLICY "Admins can update posts"  ON posts FOR UPDATE
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete posts"  ON posts FOR DELETE
  USING (is_admin());
CREATE POLICY "Admins can see all posts" ON posts FOR SELECT
  USING (is_admin());


-- ANNOUNCEMENTS:
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read published announcements" ON announcements FOR SELECT
  USING (status = 'published');
CREATE POLICY "Admins manage announcements" ON announcements FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());


-- ADS:
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read active ads" ON ads FOR SELECT
  USING (is_active = true AND expires_at > now());
CREATE POLICY "Admins manage ads" ON ads FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

ALTER TABLE ad_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can log ad events" ON ad_events FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Admins can read ad events" ON ad_events FOR SELECT
  USING (is_admin());


-- ADMINS:
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
-- Кожен залогінений може прочитати ВЛАСНИЙ запис (для перевірки «чи я адмін»)
CREATE POLICY "Authenticated read own admin row" ON admins
  FOR SELECT TO authenticated
  USING (email = auth.email());
-- Адміни бачать ВСІХ адмінів (для tab «Адміни» у adminка)
CREATE POLICY "Admins read all admins" ON admins FOR SELECT TO authenticated
  USING (is_admin());
-- Адміни управляють admins
CREATE POLICY "Admins manage admins" ON admins FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());


-- ============================================================================
-- 7. STORAGE BUCKET — фото оголошень
-- ============================================================================

-- Створюємо публічний bucket для фото
INSERT INTO storage.buckets (id, name, public)
VALUES ('community-photos', 'community-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Публічне читання усіх фото у цьому bucket
CREATE POLICY "Public read community photos"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'community-photos');

-- Будь-хто може завантажити фото (з submit-форми) — обмеження розміру у клієнті (800px JPEG q0.78)
CREATE POLICY "Anyone can upload to community-photos"
  ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'community-photos');

-- Тільки admin може видаляти фото
CREATE POLICY "Admins can delete photos"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'community-photos' AND is_admin());


-- ============================================================================
-- ✅ ГОТОВО
-- ============================================================================
-- Після Run:
--   1. Перевір що 5 таблиць створені (Table Editor зліва)
--   2. Перевір що admins має 1 запис з твоєю поштою
--   3. У Authentication → Providers → Email — переконайся що "Enable Email
--      provider" увімкнено, "Enable email confirmations" опційно
--   4. У Authentication → URL Configuration:
--      - Site URL:       https://volodymyr221.github.io/CSTL_NEWS/
--      - Redirect URLs:  https://volodymyr221.github.io/CSTL_NEWS/admin.html
--   5. Дай мені у чат: SUPABASE_URL + anon-key + service_role-key
--      → я запущу scripts/migrate_to_supabase.py і заллю 8 демо-постів +
--        2 анонси з data/*.json у БД.
-- ============================================================================
