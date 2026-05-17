-- ============================================================================
-- ВИПРАВЛЕННЯ RLS CATCH-22 ДЛЯ АДМІНКИ (2026-05-17, баг знайдено при тестуванні)
-- ============================================================================
-- Проблема: оригінальна policy "Admins read admins" мала умову
--   USING (auth.email() IN (SELECT email FROM admins))
-- Це порочне коло: щоб прочитати admins треба ВЖЕ бути у admins.
-- Postgres не може встановити чи ти адмін → блокує SELECT → адмінка
-- завжди отримує порожній результат → показує «Немає доступу».
--
-- Рішення: SECURITY DEFINER функція `is_admin()` обходить RLS під час перевірки.
-- ============================================================================


-- 1. Функція яка перевіряє чи поточний email є у admins
--    SECURITY DEFINER → виконується від імені власника, не залежить від RLS
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM admins WHERE email = auth.email());
$$;


-- 2. POSTS — заміняємо рекурсивні policies на is_admin()
DROP POLICY IF EXISTS "Admins can update posts"      ON posts;
DROP POLICY IF EXISTS "Admins can delete posts"      ON posts;
DROP POLICY IF EXISTS "Admins can see all posts"     ON posts;

CREATE POLICY "Admins can update posts"  ON posts FOR UPDATE
  USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete posts"  ON posts FOR DELETE
  USING (is_admin());
CREATE POLICY "Admins can see all posts" ON posts FOR SELECT
  USING (is_admin());


-- 3. ANNOUNCEMENTS
DROP POLICY IF EXISTS "Admins manage announcements" ON announcements;
CREATE POLICY "Admins manage announcements" ON announcements FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());


-- 4. ADS
DROP POLICY IF EXISTS "Admins manage ads" ON ads;
CREATE POLICY "Admins manage ads" ON ads FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admins can read ad events" ON ad_events;
CREATE POLICY "Admins can read ad events" ON ad_events FOR SELECT
  USING (is_admin());


-- 5. ADMINS — найкритичніше
DROP POLICY IF EXISTS "Admins read admins"    ON admins;
DROP POLICY IF EXISTS "Admins manage admins"  ON admins;

-- 5a. Кожен ЗАЛОГІНЕНИЙ юзер може прочитати ВЛАСНИЙ рядок (для перевірки «чи я
--     адмін»). Це використовує admin.html у функції handleSession().
CREATE POLICY "Authenticated read own admin row" ON admins
  FOR SELECT TO authenticated
  USING (email = auth.email());

-- 5b. Адмін може прочитати ВСІХ адмінів (для tab «Адміни» у adminка)
CREATE POLICY "Admins read all admins" ON admins
  FOR SELECT TO authenticated
  USING (is_admin());

-- 5c. Адмін може INSERT/UPDATE/DELETE у admins (додавання нових модераторів)
CREATE POLICY "Admins manage admins" ON admins
  FOR ALL TO authenticated
  USING (is_admin()) WITH CHECK (is_admin());


-- 6. STORAGE: admin може видаляти фото
DROP POLICY IF EXISTS "Admins can delete photos" ON storage.objects;
CREATE POLICY "Admins can delete photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'community-photos' AND is_admin());


-- ============================================================================
-- ✅ ГОТОВО
-- ============================================================================
-- Після Run перезавантаж адмінку у браузері і знову зайди через magic-link.
-- Має пустити, бо тепер:
--   1. Адмінка робить SELECT email FROM admins WHERE email = твоя_пошта
--   2. Policy "Authenticated read own admin row" дозволяє SELECT власного email
--   3. Запит повертає 1 рядок → isAdmin = true → перехід у App view
-- ============================================================================
