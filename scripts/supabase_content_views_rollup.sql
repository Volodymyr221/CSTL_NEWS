-- scripts/supabase_content_views_rollup.sql
-- ЗГОРТАННЯ ПОДІЙ ЧИТАННЯ (21.09.2026). Застосувати: Supabase → SQL Editor → Run.
-- Ідемпотентно.
--
-- 🔴 ЗАРАДИ ЧОГО. 21.09 застосунок почав писати `content_open` (відкрив статтю)
-- і `content_seen` (картка побула на екрані ≥1с) — без них ціль №1 курсу
-- («щоденна користь» і «адмін бачить, що його читають») не мала чим
-- підтвердитись.
--
-- ⚠️ АЛЕ ЦЕ НАЙЧАСТІШІ ПОДІЇ ЗАСТОСУНКУ, і мовчазна ціна тут — обсяг.
-- 📐 Порядок величини під ціль курсу (5 000 людей із 13 000 громади):
-- 5 000 × ~10 матеріалів на день ≈ 50 000 рядків на добу ≈ 1,5 млн на місяць.
-- Для порівняння, за ДВА МІСЯЦІ роботи всіх інших подій у таблиці було 11 130.
-- 🛑 Тобто без згортання ми помітимо це не планом, а рахунком за базу — і
-- полагодити доведеться вже під навантаженням, на живих людях.
--
-- 🔑 ЩО САМЕ РОБИМО: сирі рядки живуть 90 днів (їх вистачає на будь-яке
-- розслідування «що сталось того тижня»), а підсумки по днях лишаються НАЗАВЖДИ.
-- Підсумок дешевий: один рядок на (день × вид × матеріал), і саме з нього
-- рахується «вашу новину прочитали N людей».
--
-- 🛑 ЧОМУ ПІДСУМОК РАХУЄ ЛЮДЕЙ, А НЕ ПОДІЇ. Питання, на яке відповідає це
-- число, — «скільки людей мене прочитало», а не «скільки разів відкривали».
-- Друге завищує: одна людина за день може відкрити матеріал кілька разів із
-- різних сеансів. Завищене число гірше за відсутнє — на ньому автор вирішує,
-- писати йому далі чи ні (той самий урок, що в `HOT_RULES.md` №12).

-- 1. Підсумки по днях ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_views_daily (
  день        DATE   NOT NULL,
  kind        TEXT   NOT NULL,          -- 'news' | 'feed_post' | 'board_ad'
  content_id  TEXT   NOT NULL,          -- id матеріалу (TEXT: у новин число, далі може бути інакше)
  подія       TEXT   NOT NULL,          -- 'content_open' | 'content_seen'
  людей       INTEGER NOT NULL,         -- унікальних читачів (акаунти + пристрої гостей)
  разів       INTEGER NOT NULL,         -- усіх подій, для повноти картини
  PRIMARY KEY (день, kind, content_id, подія)
);

ALTER TABLE content_views_daily ENABLE ROW LEVEL SECURITY;

-- Читати підсумки може будь-хто, хто ввійшов: саме з них застосунок показує
-- авторові «прочитали N людей» під його дописом.
-- 🛑 Тут НЕМАЄ жодного поля, за яким можна впізнати читача — лише кількості.
-- Це і є та межа, заради якої підсумок узагалі існує окремо від сирих подій:
-- сирі рядки бачить тільки адмін, і так лишається.
DROP POLICY IF EXISTS "Signed-in can read view counts" ON content_views_daily;
CREATE POLICY "Signed-in can read view counts"
  ON content_views_daily FOR SELECT
  TO authenticated
  USING (true);

-- 2. Згортання ----------------------------------------------------------------
-- Рахує вчорашній день (і будь-який інший на вимогу), кладе підсумок, ПОТІМ
-- прибирає сирі події, старші за 90 днів.
--
-- ⚠️ ПОРЯДОК НЕ ВИПАДКОВИЙ: спершу підсумок, потім прибирання. Навпаки — і
-- невдалий підсумок лишив би нас без обох джерел. Це той самий урок, що з
-- синком кабінету (`sync_cms.py`): позначку ставить той, хто БАЧИВ успіх.
CREATE OR REPLACE FUNCTION rollup_content_views(p_day DATE DEFAULT (CURRENT_DATE - 1))
RETURNS TABLE (рядків INTEGER, прибрано INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _рядків  INTEGER := 0;
  _прибрано INTEGER := 0;
BEGIN
  INSERT INTO content_views_daily (день, kind, content_id, подія, людей, разів)
  SELECT p_day,
         COALESCE(e.meta->>'kind', '—'),
         COALESCE(e.meta->>'id', '—'),
         e.event_type,
         -- 🔑 Одна людина = один акаунт, а гість = один пристрій. Саме так
         -- рахує решта аналітики проєкту (`admin_analytics_overview`), і
         -- розходитись із нею не можна: два різні «унікальні» в одному
         -- кабінеті — це вже було, і коштувало окремого розслідування 26.08.
         COUNT(DISTINCT COALESCE(e.user_id::text, e.anon_id, e.visitor_id)),
         COUNT(*)
    FROM analytics_events e
   WHERE e.event_type IN ('content_open', 'content_seen')
     AND e.created_at >= p_day
     AND e.created_at <  p_day + 1
     AND e.meta ? 'kind'
   GROUP BY 2, 3, 4
  ON CONFLICT (день, kind, content_id, подія) DO UPDATE
     SET людей = EXCLUDED.людей, разів = EXCLUDED.разів;
  GET DIAGNOSTICS _рядків = ROW_COUNT;

  DELETE FROM analytics_events
   WHERE event_type IN ('content_open', 'content_seen')
     AND created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS _прибрано = ROW_COUNT;

  RETURN QUERY SELECT _рядків, _прибрано;
END;
$$;

-- 3. Розклад ------------------------------------------------------------------
-- 🛑 `pg_cron` живе в UTC (правило проєкту, записане в `NOW.md`): 02:10 UTC це
-- близько 5 ранку за Києвом — найтихіша година, коли добова межа вже минула.
SELECT cron.schedule('rollup-content-views', '10 2 * * *',
                     'SELECT public.rollup_content_views()');

-- Перевірка руками:
--   SELECT * FROM rollup_content_views(CURRENT_DATE);      -- згорнути сьогоднішнє
--   SELECT * FROM content_views_daily ORDER BY день DESC LIMIT 20;
