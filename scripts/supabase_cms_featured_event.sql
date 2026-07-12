-- ── Потік 8 «Найближчі події»: звʼязок скопійованої події з оригіналом ──────
-- Додає колонку source_article_id до cms_articles: коли модератор натискає
-- «Скопіювати в Найближчі події» на опублікованій статті/святі, створюється
-- НОВИЙ рядок type='event', а source_article_id = id оригіналу. Це дає:
--   • не плодити дублі (кнопка бачить що вже скопійовано);
--   • слід «звідки взято» (для майбутньої синхронізації/чистки).
--
-- Запустити ОДИН раз у Supabase → SQL Editor (робить Рома/Вова).
-- Безпечно повторно (IF NOT EXISTS). Тільки додає колонку — нічого не ламає.

-- 1) Колонка-звʼязок на оригінальну статтю. NULL = створено з нуля (не копія).
--    ON DELETE SET NULL — якщо оригінал видалять, подія лишається, лише втрачає слід.
ALTER TABLE public.cms_articles
  ADD COLUMN IF NOT EXISTS source_article_id bigint
  REFERENCES public.cms_articles(id) ON DELETE SET NULL;

-- 2) Індекс — щоб швидко перевіряти «чи вже є подія, скопійована з цієї статті».
CREATE INDEX IF NOT EXISTS idx_cms_articles_source
  ON public.cms_articles (source_article_id)
  WHERE source_article_id IS NOT NULL;

-- 3) Коментар для ясності схеми.
COMMENT ON COLUMN public.cms_articles.source_article_id IS
  'Потік 8: id оригінальної статті/свята, з якої скопійовано цю Найближчу подію (type=event). NULL = створено з нуля.';
