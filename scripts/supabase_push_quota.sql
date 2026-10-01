-- scripts/supabase_push_quota.sql
-- СТЕЛЯ ЧАСТОТИ СПОВІЩЕНЬ (01.10.2026). Застосувати: Supabase → SQL Editor → Run.
-- Ідемпотентно.
--
-- 🔴 ЗАРАДИ ЧОГО. `notif_prefs` дає ВИМИКАЧІ по розділах, і це не те саме, що
-- стеля. Тобто захисту від «людині прийшло вісім сповіщень за вечір, вона
-- заборонила їх у телефоні» не було взагалі. 🛑 А заборона на рівні телефона —
-- це кінець: людина не вимкнула розділ, який їй надокучив, вона вимкнула
-- ЗАСТОСУНОК, і повернути її в сповіщення вже нічим. Один клас сповіщень
-- здатен забрати всі вісім.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- 🔑 СТЕЛЯ ТІЛЬКИ НА КЛАС «ГРОМАДА», І ЦЕ ГОЛОВНЕ РІШЕННЯ ФАЙЛУ.
-- Персональне не притишується ніколи — той самий поділ, що вже стоїть у
-- `send-answer-push`: відповідь на МОЄ питання, повідомлення в чаті,
-- коментар під моїм дописом, скасування МОГО рейсу. Людина на це чекає, і
-- проґавлене персональне сповіщення коштує дорожче за зайве.
-- ➡️ Притишуємо те, що приходить «бо в громаді щось сталось»: нові дописи
-- спільнот і нагадування про питання без відповіді.
--
-- 📐 ЧОМУ ТРИ НА ДОБУ, А НЕ ОДНЕ. Розрив план-vs-код від 25.09 писав «не
-- частіше разу на добу». Я беру ТРИ, і ось чому: дзвіночок на сторінці людина
-- вмикає САМА, по одній сторінці. Хто підписався на пʼять спільнот і отримує
-- одне сповіщення на добу, бачить не турботу, а зламані сповіщення — і піде
-- вимикати їх у телефоні рівно з тієї ж причини, від якої ми захищаємось.
-- Три вбивають потоп (вісім за вечір) і лишають явну підписку робочою.
-- 🗣️ Число — рішення Вови: один рядок (`ГРОМАДА_НА_ДОБУ` в Edge Functions).
-- ═════════════════════════════════════════════════════════════════════════════

-- 1. Журнал надісланого ------------------------------------------------------
-- Один рядок на кожне надіслане сповіщення класу зі стелею. Більше нічого тут
-- не треба: ні тексту, ні id матеріалу — лише «кому і коли», бо саме це й
-- рахує стеля. 🛑 Зміст сповіщень у журнал не кладемо принципово: він не
-- потрібен для рішення, а зберігати його означало б тримати копію всього, що
-- людина отримала.
CREATE TABLE IF NOT EXISTS push_quota_log (
  id          BIGSERIAL PRIMARY KEY,
  uid         UUID        NOT NULL,
  клас        TEXT        NOT NULL,     -- 'hromada'
  надіслано_о TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Покажчик під єдиний запит, який до цієї таблиці ходить: «скільки рядків у
-- цієї людини в цьому класі за останню добу».
CREATE INDEX IF NOT EXISTS push_quota_log_uid_idx
  ON push_quota_log (uid, клас, надіслано_о DESC);

ALTER TABLE push_quota_log ENABLE ROW LEVEL SECURITY;
-- 🛑 Політик НЕМА НАВМИСНО: таблиця службова, з неї читає лише `service_role`
-- (Edge Functions), а він RLS обходить. Жодному клієнтові — ні гостю, ні
-- ввійшлому — ці рядки не потрібні, і «порожня RLS» тут означає «закрито для
-- всіх», а не недогляд. (Лінтер Supabase показує це як INFO
-- `rls_enabled_no_policy` — очікувано, поряд із чотирма такими ж службовими.)

-- 2. Видати квоту ------------------------------------------------------------
-- Приймає перелік людей, віддає ТІЛЬКИ тих, кому ще можна слати, і тим самим
-- рухом позначає видачу.
--
-- 🔴 ЧОМУ ОДНИМ ЗАПИТОМ, А НЕ «СПЕРШУ ПОРАХУЙ, ПОТІМ ЗАПИШИ». Між читанням і
-- записом втиснеться другий виклик (у нас їх два шляхи: тригер бази і браузер
-- автора, плюс повтор після збою мережі) — і обидва побачать «місце ще є».
-- Стеля, яку можна обійти гонкою, не стеля. Тут вставка і перевірка — один
-- оператор, тож рішення ухвалює база, а не порядок викликів.
--
-- 🔑 ВИДАЄМО ДО НАДСИЛАННЯ, а не після, і це свідомо: краще не надіслати через
-- збій, ніж надіслати двічі. Якщо розсилка впала і не дійшла НІКОМУ, функція
-- кличе `push_quota_release` — той самий прийом, що з `page_push_log`.
CREATE OR REPLACE FUNCTION push_quota_take(
  p_uids  UUID[],
  p_class TEXT,
  p_max   INT      DEFAULT 3,
  p_window INTERVAL DEFAULT INTERVAL '24 hours'
)
RETURNS TABLE (uid UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH кандидати AS (
    SELECT DISTINCT u AS uid FROM unnest(p_uids) AS u
  ), можна AS (
    SELECT к.uid FROM кандидати к
     WHERE (SELECT COUNT(*) FROM push_quota_log l
             WHERE l.uid = к.uid AND l.клас = p_class
               AND l.надіслано_о > now() - p_window) < p_max
  ), позначка AS (
    INSERT INTO push_quota_log (uid, клас)
    SELECT uid, p_class FROM можна
    RETURNING uid
  )
  SELECT uid FROM позначка;
$$;

-- 3. Повернути квоту ---------------------------------------------------------
-- Розсилка не дійшла нікому (тимчасовий збій сервісу push) — позначка мусить
-- зникнути, інакше людина втратила б добову квоту на сповіщення, якого не
-- бачила. ⚠️ Прибираємо лише НАЙСВІЖІШИЙ рядок кожного, а не всі: решта — це
-- сповіщення, які людина справді отримала.
CREATE OR REPLACE FUNCTION push_quota_release(p_uids UUID[], p_class TEXT)
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH свіжі AS (
    SELECT DISTINCT ON (l.uid) l.id
      FROM push_quota_log l
     WHERE l.uid = ANY(p_uids) AND l.клас = p_class
     ORDER BY l.uid, l.надіслано_о DESC
  ), прибрано AS (
    DELETE FROM push_quota_log WHERE id IN (SELECT id FROM свіжі) RETURNING 1
  )
  SELECT COUNT(*)::INTEGER FROM прибрано;
$$;

-- 🛑 Обидві функції — лише для `service_role` (Edge Functions). Клієнтові тут
-- робити нічого: квота це рішення сервера про розсилку, а не дані людини.
REVOKE ALL ON FUNCTION push_quota_take(UUID[], TEXT, INT, INTERVAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION push_quota_take(UUID[], TEXT, INT, INTERVAL) FROM anon;
REVOKE ALL ON FUNCTION push_quota_take(UUID[], TEXT, INT, INTERVAL) FROM authenticated;
REVOKE ALL ON FUNCTION push_quota_release(UUID[], TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION push_quota_release(UUID[], TEXT) FROM anon;
REVOKE ALL ON FUNCTION push_quota_release(UUID[], TEXT) FROM authenticated;

-- 4. Прибирання --------------------------------------------------------------
-- Журнал потрібен рівно на вікно стелі. 🔴 Без прибирання він росте без межі, і
-- це вже коштувало проєкту дня: 24.09 диск Supabase вичерпав бюджет IO саме
-- через розпухлі службові журнали (`cron.job_run_details`, `net._http_response`,
-- 186 МБ). Той самий клас вади повторювати не будемо.
-- 📐 Тримаємо 7 днів, а не 1: добова стеля рахує тільки свіжі рядки, але тиждень
-- історії дає чим відповісти на питання «чому людині не прийшло сповіщення».
CREATE OR REPLACE FUNCTION prune_push_quota_log()
RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH прибрано AS (
    DELETE FROM push_quota_log WHERE надіслано_о < now() - INTERVAL '7 days' RETURNING 1
  )
  SELECT COUNT(*)::INTEGER FROM прибрано;
$$;

-- 🕓 У розклад — поряд з іншим прибиранням. `pg_cron` живе в UTC (правило з
-- `NOW.md`), і 03:50 UTC стоїть перед `prune-analytics` (03:40) і
-- `prune-service-logs` (03:55) так, щоб три прибирання не ліпились в одну
-- хвилину. Явна хвилина, не крок: `*/N` тут душиться (заміряно 22-23.09).
SELECT cron.unschedule('prune-push-quota')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-push-quota');
SELECT cron.schedule('prune-push-quota', '50 3 * * *',
                     $$SELECT public.prune_push_quota_log();$$);
