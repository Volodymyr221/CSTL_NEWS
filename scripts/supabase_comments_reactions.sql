-- ============================================================================
-- ПАТЧ-2: COMMENTS + REACTIONS + COVER ПОЛЯ ДЛЯ GREETING (2026-05-18)
-- ============================================================================
-- Запити Вови:
--   1. «Мої смайлики не бачать інші юзери. Я не бачу їхні» — реакції і
--      коментарі досі у localStorage. Переходимо у БД щоб усі бачили.
--   2. «Вітання не хоче публікувати» — підтверджено: схема posts не має
--      колонок cover_emoji і cover_gradient які submit-форма записує
--      для greeting-постів. INSERT падає, користувач бачить помилку.
--
-- ⚠️ Запустити у Supabase SQL Editor → New query → Run.
-- ⚠️ Скрипт ідемпотентний (можна перезапускати).
-- ============================================================================


-- 1. ДОДАЄМО ВІДСУТНІ КОЛОНКИ У POSTS (для greeting)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS cover_emoji    TEXT;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS cover_gradient TEXT;


-- 2. CLEANUP COMMENTS+REACTIONS (для повторних запусків)
DROP TABLE IF EXISTS comments  CASCADE;
DROP TABLE IF EXISTS reactions CASCADE;


-- ============================================================================
-- COMMENTS — коментарі під chat- і greeting-постами
-- ============================================================================
CREATE TABLE comments (
  id          BIGSERIAL PRIMARY KEY,
  post_id     BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author      TEXT,                     -- NULL = анонімно
  text        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_comments_post_created ON comments (post_id, created_at ASC);

ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Усі можуть читати коментарі (анонімно і залогінено)
CREATE POLICY "Public can read comments"
  ON comments FOR SELECT USING (true);

-- Будь-хто може додати коментар (модерація буде через DELETE admin-ом)
CREATE POLICY "Anyone can post comment"
  ON comments FOR INSERT WITH CHECK (
    text IS NOT NULL AND length(trim(text)) BETWEEN 1 AND 2000
  );

-- Тільки admin може видалити (для модерації грубощів)
CREATE POLICY "Admins can delete comments"
  ON comments FOR DELETE USING (is_admin());


-- ============================================================================
-- REACTIONS — emoji-реакції на пости (board/chat/greeting)
-- ============================================================================
-- user_id — анонімний UUID що генерується клієнтом і живе у localStorage
-- (поки немає авторизації для звичайних юзерів). Один user може мати
-- ОДНУ реакцію на пост (UNIQUE constraint) — як у iMessage.
CREATE TABLE reactions (
  id          BIGSERIAL PRIMARY KEY,
  post_id     BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,            -- анонімний clientId з localStorage
  emoji       TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE (post_id, user_id)             -- одна реакція на пост per user
);
CREATE INDEX idx_reactions_post ON reactions (post_id);

ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read reactions"
  ON reactions FOR SELECT USING (true);

-- Будь-хто може поставити, оновити, або зняти свою реакцію.
-- НЕ перевіряємо user_id строго (анонімно — не можемо) — довіряємо клієнту.
-- Якщо з'являться спамери — додамо rate limit через Cloudflare або Edge Function.
CREATE POLICY "Anyone can insert reaction"
  ON reactions FOR INSERT WITH CHECK (
    emoji IS NOT NULL AND length(emoji) BETWEEN 1 AND 16
  );
CREATE POLICY "Anyone can update reaction"
  ON reactions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete reaction"
  ON reactions FOR DELETE USING (true);


-- ============================================================================
-- ✅ ГОТОВО
-- ============================================================================
-- Перевірити що таблиці створені: зліва Table Editor → бачиш comments і reactions.
-- ============================================================================
