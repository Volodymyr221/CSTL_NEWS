-- ============================================================================
-- supabase_cms_dedup.sql — чистка ДУБЛІВ свято-чернеток + захист від повторів
-- Причина (08.07): щоденний крон editor-holidays × 7-денне вікно календаря плодив
-- дублі однієї свято-чернетки (16 замість ~10). Код уже дедупить нові (CabinetSink
-- GET-перевірка). Цей SQL: (1) прибирає ВЖЕ наявні дублі, (2) ставить UNIQUE-захист.
--
-- ⚠️ ВОВА: спершу запусти КРОК 0 (прев'ю — нічого не видаляє), глянь що знайшло,
--    тоді КРОК 1 (видалення) і КРОК 2 (індекс). Виконувати в Supabase SQL Editor.
-- ============================================================================

-- КРОК 0 — ПРЕВ'Ю: які draft-чернетки дублюються (title+тип, для свят ще й дата).
SELECT title, type, event_date, count(*) AS копій, min(id) AS найстарший, max(id) AS найновіший
FROM cms_articles
WHERE status = 'draft'
GROUP BY title, type, event_date
HAVING count(*) > 1
ORDER BY копій DESC;

-- КРОК 1 — ВИДАЛЕННЯ дублів: лишаємо НАЙНОВІШИЙ рядок (max id) у кожній групі
-- (title, type, event_date), решту draft-копій видаляємо. Публіковані НЕ чіпаємо.
DELETE FROM cms_articles a
USING cms_articles b
WHERE a.status = 'draft'
  AND b.status = 'draft'
  AND a.title = b.title
  AND a.type = b.type
  AND a.event_date IS NOT DISTINCT FROM b.event_date
  AND a.id < b.id;

-- КРОК 2 — UNIQUE-захист: не давати ДВІ draft-чернетки з тим самим (title, type, event_date).
-- Партіальний індекс лише по status='draft' (публіковані/архів не обмежуємо).
-- Для новин event_date зазвичай NULL — там дедуп тримає код-рівень + кап черги.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cms_draft_title_type_date
  ON cms_articles (title, type, event_date)
  WHERE status = 'draft';
