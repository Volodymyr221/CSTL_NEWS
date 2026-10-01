-- scripts/supabase_digest_push.sql
-- РАНКОВЕ ЗВЕДЕННЯ (01.10.2026). Застосувати: Supabase → SQL Editor → Run.
-- Ідемпотентно.
--
-- 🔴 ЗАРАДИ ЧОГО. Ціль №1 курсу — ЗВИЧКА: 🗣️ «щоб в людей випрацювалась звичка
-- заходити сюди». Звичка тримається на приводі заходити В ТОЙ САМИЙ ЧАС, і
-- такого приводу не було: push про новини не існував як тип, зведення в
-- розкладі не стояло. 🔑 Заразом зведення не додає шуму, а ЗАМІНЯЄ його: одне
-- сповіщення зранку замість восьми за вечір (разом зі
-- `scripts/supabase_push_quota.sql` це одна робота).

-- 1. Вимикач у кабінеті ------------------------------------------------------
-- 🛑 ОКРЕМИЙ ВІД «СТРІЧКИ», і це не дрібниця. «Стрічка» — про кожен новий допис,
-- тобто про шум, який людина може не хотіти. Зведення — одне на ранок, і його
-- якраз можуть хотіти ті, хто вимкнув решту. Один вимикач на двох означав би:
-- вимикаючи шум, людина мовчки втрачає єдине, що їй, можливо, і потрібне.
-- (Та сама причина, що вивела «Події» з-під «Стрічки» 04.09.)
ALTER TABLE public.notif_prefs
  ADD COLUMN IF NOT EXISTS digest BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Журнал «одне на добу» ---------------------------------------------------
-- 🔑 Первинний ключ `(uid, день)` — це і є сама межа, а не позначка про неї.
-- У вікні 6:00-9:00 розклад може дзвонити кілька разів (`pg_cron` тут
-- душиться, див. нижче), і без цього ключа людина отримала б три зведення за
-- ранок — рівно той потоп, проти якого вся робота.
CREATE TABLE IF NOT EXISTS digest_push_log (
  uid         UUID NOT NULL,
  день        DATE NOT NULL,
  надіслано_о TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (uid, день)
);

ALTER TABLE digest_push_log ENABLE ROW LEVEL SECURITY;
-- 🛑 Політик немає навмисно: таблиця службова, читає лише `service_role`.

-- Прибирання: журнал потрібен на добу, тримаємо тиждень — щоб було чим
-- відповісти на «чому мені не прийшло зведення».
-- 🔴 24.09 диск Supabase вичерпав бюджет IO через розпухлі службові журнали.
-- Кожен новий журнал у цьому проєкті заводиться РАЗОМ із прибиранням.
CREATE OR REPLACE FUNCTION prune_digest_log()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH прибрано AS (
    DELETE FROM digest_push_log WHERE день < CURRENT_DATE - 7 RETURNING 1
  )
  SELECT COUNT(*)::INTEGER FROM прибрано;
$$;

-- 3. Штовхач функції ---------------------------------------------------------
-- Той самий патерн, що в `notify_unanswered_questions`: `pg_net` стукає в Edge
-- Function, несучи спільний секрет у заголовку.
CREATE OR REPLACE FUNCTION notify_morning_digest()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  _secret TEXT;
  _url    TEXT;
  _req    BIGINT;
BEGIN
  SELECT value INTO _secret FROM app_secrets WHERE name = 'page_push_secret';
  IF _secret IS NULL THEN
    RAISE NOTICE 'notify_morning_digest: немає секрета page_push_secret';
    RETURN NULL;
  END IF;
  SELECT value INTO _url FROM app_secrets WHERE name = 'functions_base_url';
  IF _url IS NULL THEN
    RAISE NOTICE 'notify_morning_digest: немає functions_base_url';
    RETURN NULL;
  END IF;

  SELECT net.http_post(
    url     := _url || '/send-digest-push',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cstl-push-secret', _secret),
    body    := '{}'::jsonb
  ) INTO _req;
  RETURN _req;
END $$;

REVOKE ALL ON FUNCTION notify_morning_digest() FROM PUBLIC;
REVOKE ALL ON FUNCTION notify_morning_digest() FROM anon;
REVOKE ALL ON FUNCTION notify_morning_digest() FROM authenticated;

-- 4. Розклад -----------------------------------------------------------------
-- ═════════════════════════════════════════════════════════════════════════════
-- 🛑 ЧОМУ СЛОТІВ ЧОТИРИ, А НЕ ОДИН — І ЧОМУ ЦЕ НЕ «ПРО ВСЯК ВИПАДОК».
-- 📐 Заміряно 22-23.09 на власному вартовому: `pg_cron` у цьому проєкті
-- душиться незалежно від синтаксису — з десятка оголошених слотів виконуються
-- ДВА, проміжки доходять до 2.5 години. Один слот означав би, що зведення не
-- приходить більшість ранків.
-- 🔑 Тому слотів чотири в межах ранку, а від зайвих спрацювань боронить не
-- розклад, а журнал `(uid, день)` і воротар часу в самій функції. Тобто
-- надійність тут зроблена ІДЕМПОТЕНТНІСТЮ, а не точністю розкладу — бо
-- точності в цьому `pg_cron` немає й не буде.
-- ⚠️ Час у `pg_cron` — UTC. Київ улітку +3, узимку +2, тож 04:05-06:35 UTC
-- накриває ранок у обох випадках, а функція сама відсіє все, що випало з
-- вікна 6:00-9:00 за Києвом.
-- 📐 Хвилини явні (05, 35), не крок: `*/N` тут душиться гірше (заміряно).
-- ═════════════════════════════════════════════════════════════════════════════
SELECT cron.unschedule('morning-digest')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'morning-digest');
SELECT cron.schedule('morning-digest', '5,35 4,5,6 * * *',
                     $$SELECT public.notify_morning_digest();$$);

SELECT cron.unschedule('prune-digest-log')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-digest-log');
SELECT cron.schedule('prune-digest-log', '45 3 * * *',
                     $$SELECT public.prune_digest_log();$$);

-- 🔎 ПЕРЕВІРИТИ, НІЧОГО НЕ НАДСИЛАЮЧИ (сухий прогін) — із SQL Editor:
--   SELECT net.http_post(
--     url := (SELECT value FROM app_secrets WHERE name='functions_base_url')
--            || '/send-digest-push',
--     headers := jsonb_build_object('Content-Type','application/json',
--                'x-cstl-push-secret',(SELECT value FROM app_secrets WHERE name='page_push_secret')),
--     body := '{"dry_run":true}'::jsonb);
-- Відповідь (у `net._http_response`) покаже `kyiv_hour`, `would_send` і текст.
-- 🔑 Саме так і треба перевіряти воротар часу: він може зламатись МОВЧКИ — не
-- застосується пояс `Europe/Kyiv`, лишиться UTC, і влітку різниця складе три
-- години.
