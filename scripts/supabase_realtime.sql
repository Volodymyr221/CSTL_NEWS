-- ============================================================================
-- ПАТЧ-3: REALTIME для comments + reactions (2026-05-18)
-- ============================================================================
-- Без цього лайки і коментарі видно тільки після перезавантаження PWA.
-- Цей патч додає таблиці у publication 'supabase_realtime' — Supabase
-- буде слати WebSocket-події (INSERT/UPDATE/DELETE) усім підписаним клієнтам.
--
-- ⚠️ Запустити у Supabase SQL Editor → New query → Run.
-- ⚠️ Ідемпотентно — можна перезапускати.
-- ============================================================================

DO $$
BEGIN
  -- reactions
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE reactions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  -- comments
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE comments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- Перевірка які таблиці у publication:
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename;
-- Має повернути список включаючи reactions і comments.
