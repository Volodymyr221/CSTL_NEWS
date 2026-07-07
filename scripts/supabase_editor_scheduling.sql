-- ── Блок 2 AI-редактора: розклад автопостингу ──────────────────────────────
-- Додає колонку publish_at до cms_articles: коли стаття має автоматично
-- опублікуватись. Разом зі status='scheduled' це «автопостинг на дату/час».
--
-- Запустити ОДИН раз у Supabase → SQL Editor (робить Вова).
-- Безпечно повторно (IF NOT EXISTS).

-- 1) Колонка часу автопублікації (UTC). NULL = без розкладу.
ALTER TABLE public.cms_articles
  ADD COLUMN IF NOT EXISTS publish_at timestamptz;

-- 1b) Дата події/свята (YYYY-MM-DD) — для «Шо в селі» (type=holiday/event).
--     Це ДАТА самої події у стрічці, НЕ час автопостингу (publish_at).
ALTER TABLE public.cms_articles
  ADD COLUMN IF NOT EXISTS event_date text;

-- 2) Індекс для швидкого пошуку «що вже пора публікувати».
--    Публікатор шукає: status='scheduled' AND publish_at <= now().
CREATE INDEX IF NOT EXISTS idx_cms_articles_scheduled
  ON public.cms_articles (status, publish_at)
  WHERE status = 'scheduled';

-- 3) Коментар для ясності схеми.
COMMENT ON COLUMN public.cms_articles.publish_at IS
  'Час автопублікації (UTC). Разом зі status=scheduled — автопостинг. NULL = вручну/зараз.';

-- Примітка: значення status тепер: draft | scheduled | ready | published | archived.
-- RLS не змінюється — редактор оновлює власні рядки як і раніше.
