-- ============================================================================
-- ANON LOCKDOWN — «анонім лише переглядає» (накатано 01.08.2026)
-- ============================================================================
--
-- ⚠️ ЦЕЙ ФАЙЛ ДЗЕРКАЛИТЬ ПРОД. Знято з бази після накату, не написано «по пам'яті».
-- Міграції: board_submit_requires_login · posts_insert_requires_login ·
--           push_subscriptions_own_rows_only · storage_upload_requires_login_and_limits
--
-- РІШЕННЯ ВОВИ (дослівно, 01.08.2026):
--   «Робити будь які дії, лайкати, надсилати коменти, повідомлення, фото, може
--    тільки залогінений користувач. Не залогінений може тільки переглядати
--    публічну інформацію.»
--   Аналітика — виняток за окремим рішенням: «анонімні метрики… всю аналітику
--   по анонімах треба збирати».
--
-- ЩО ПОКАЗАВ АУДИТ ДО ЗМІН (жива вибірка з pg_policies, не з файлів):
--   з 49 політик запису 44 вже вимагали auth.uid() — правило діяло на ~95%.
--   Відкритими були рівно 5 місць; закрито 3, два лишено свідомо.
--
-- 🔑 ГОЛОВНИЙ УРОК ЦЬОГО НАКАТУ — RLS МОЖЕ БУТИ НІ ПРИ ЧОМУ.
--   Головний шлях подачі оголошення йде через RPC `submit_board_post`, а вона
--   SECURITY DEFINER, тобто виконується з правами власника і RLS ОБХОДИТЬ.
--   Закрити саму лише політику на `posts` = косметика: анонімна подача
--   працювала б далі, а звіт казав би «зроблено».
--   ➡️ Перед «закрити таблицю» — спитати: чи не пише в неї SECURITY DEFINER
--      функція, доступна anon? Перелік: has_function_privilege('anon', oid, 'execute').
--   Прогін по всіх 36 таких функціях: чотири `admin_*` мають сторож is_admin(),
--   решта звіряються з auth.uid() і для аноніма безпечно нічого не роблять.
--   `submit_board_post` була ЄДИНОЮ, що свідомо обробляла аноніма (owner_uid = null).
--
-- ============================================================================
-- 1. ПОДАЧА ОГОЛОШЕННЯ — сторож усередині RPC (головний рубіж)
-- ============================================================================
-- Повне тіло функції — у міграції `board_submit_requires_login`. Тут лише суть:
-- ПЕРШИМ рядком у begin, до будь-якої валідації.
--
--   if v_uid is null then
--     return jsonb_build_object('ok', false, 'error', 'Треба увійти в акаунт');
--   end if;
--
-- ⚠️ Тіло знято з прода через pg_get_functiondef і збережено ДОСЛІВНО — додано
--    рівно цей блок. Не переписувати функцію «по пам'яті»: серверна реалізація
--    багатша за старі файли (гейт ціни за категорією, price_negotiable,
--    серверне currency, рейт-ліміт 3/хв). Урок 28.07.

-- ============================================================================
-- 2. ПРЯМА ВСТАВКА В posts — другий рубіж (повз RPC, через PostgREST)
-- ============================================================================
DROP POLICY IF EXISTS "Anyone can submit a pending post" ON public.posts;

CREATE POLICY "Logged-in can submit a pending post"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND auth.uid() IS NOT NULL
    AND owner_uid = auth.uid()
  );

-- ℹ️ Це НЕ зміна продукту, а приведення бази до того, що застосунок уже робить:
--    анонімні оголошення — 18 шт., усі з 17.05 по 16.06.2026; усі 7 постів
--    з 20.06 мають owner_uid. Клієнт гейтить вхід із того ж часу
--    (`src/tabs/board.js` → requireAuth('подати оголошення')).
--    Старі 18 рядків з owner_uid = null не чіпаємо — політика діє на ВСТАВКУ.

-- ============================================================================
-- 3. push_subscriptions — НАЙГОСТРІШЕ, і не там, де здавалось
-- ============================================================================
-- Було: push_insert/update/delete для {anon,authenticated} з USING/CHECK = true.
-- `USING true` на DELETE — це не «анонім пише своє», а «БУДЬ-ХТО видаляє ЧУЖІ
-- рядки»: одним запитом стиралися б усі підписки на автобусні сповіщення.
-- Шкоди не сталося — на момент правки 0 рядків, міграції даних не треба.
DROP POLICY IF EXISTS "push_insert" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_update" ON public.push_subscriptions;
DROP POLICY IF EXISTS "push_delete" ON public.push_subscriptions;

CREATE POLICY "push_insert" ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (user_uuid = (auth.uid())::text);

CREATE POLICY "push_update" ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (user_uuid = (auth.uid())::text)
  WITH CHECK (user_uuid = (auth.uid())::text);

CREATE POLICY "push_delete" ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (user_uuid = (auth.uid())::text);

REVOKE INSERT, UPDATE, DELETE ON public.push_subscriptions FROM anon;
REVOKE USAGE, SELECT ON SEQUENCE public.push_subscriptions_id_seq FROM anon;

-- ℹ️ Прив'язка саме до `user_uuid = auth.uid()::text` — це те, що клієнт уже пише
--    (`src/tabs/buses.js:104-105`), там же й коментар «RLS-перепис вимагає
--    user_uuid = auth.uid()::text». Гейт входу в інтерфейсі стоїть
--    (requireAuth('відстежувати автобус' / 'увімкнути сповіщення')).
--    ⬜ Лишився хвіст: у `buses.js:105` фолбек `currentUserId() || getAnonId()`.
--    Через UI недосяжний, але як тільки з'явиться шлях без входу — вставка
--    почне падати з RLS. Не чіпав (HOT_RULES №9), сказано Вові.

-- ============================================================================
-- 4. STORAGE — хто вантажить + що вантажать
-- ============================================================================
UPDATE storage.buckets
   SET file_size_limit = 5242880,                                    -- 5 МБ
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
 WHERE id = 'community-photos';

DROP POLICY IF EXISTS "Anyone can upload to community-photos" ON storage.objects;

CREATE POLICY "Logged-in can upload to community-photos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'community-photos' AND auth.uid() IS NOT NULL);

-- ⚠️ Стеля 5 МБ, а НЕ 2 МБ — ЗАМІРЯНО, не на око. У бакеті 103 файли:
--    понад 2 МБ — 6 штук (найбільший PNG 3229 кБ), понад 5 МБ — ЖОДНОГО.
--    2 МБ відрізали б 6 справжніх завантажень наших людей; 5 МБ не відрізає
--    жодного і лишає стелю вдесятеро нижчою за дефолтні 50 МБ.
--    Побічний висновок: клієнтське стиснення (800px JPEG q0.78) тримає НЕ на
--    всіх шляхах — інакше 3-мегабайтних PNG у бакеті не було б.
-- Типи: реально в бакеті лише image/jpeg (87) і image/png (16); webp на виріст.
-- ============================================================================
-- 4б. ПЕРЕЛІЧУВАННЯ БАКЕТА ВИМКНЕНО (міграція storage_disable_anonymous_listing)
-- ============================================================================
-- Це та сама давня задача з BACKLOG (`public_bucket_allows_listing`) — але коли
-- її перевірили наживо, вона виявилась НЕ косметичною.
--
-- Політика "Public read community photos" давала SELECT на storage.objects
-- будь-кому. Це не «читання картинки», а читання СПИСКУ: прогін від імені anon
-- повертав усі 103 імені файлів. Чужу адресу не треба було вгадувати.
--
-- 🔴 Чому це важило — у бакеті лежать не лише публічні картинки:
--    · 23 фото з ПРИВАТНИХ переписок (`messages.photo_url`, 22.06-29.07).
--      Текст повідомлення RLS захищає (анонім бачить 0), а файл лежав відкрито.
--    · фото 2 оголошень, які НЕ опубліковані (1 на модерації, 1 відхилене).
DROP POLICY IF EXISTS "Public read community photos" ON storage.objects;

CREATE POLICY "Owner reads own community photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'community-photos' AND owner = auth.uid());

-- Безпечність перевірена ПО КОДУ: у клієнті рівно два виклики сховища —
--   `.upload(path, file, { upsert: false })` → потрібен INSERT (лишається)
--   `.getPublicUrl(path)`                    → у мережу не ходить, складає рядок
-- Жодного `.list()` / `.download()` / `.remove()` у `src/`, `admin.html`,
-- `editor/` немає. Бакет лишається `public = true`, віддача через
-- /object/public/… з RLS не звіряється → показ картинок не змінюється.
-- Перевірено після накату: анонім бачив 103 файли → бачить 0; бакет public = true.
--
-- ⚠️ ЦЕ ПІВЗАХОДУ, І ЦЕ СВІДОМО. Хто вже має посилання — відкриє його й далі.
--    ⬜ Справжнє рішення: фото приватних чатів → ОКРЕМИЙ ЗАКРИТИЙ бакет, доступ
--       лише учасникам розмови, тимчасові посилання. Разом із переглядом
--       авторизації (домовлено з Вовою 01.08).
--
-- ↩️ ВІДКАТ, якщо картинки раптом зникнуть (одна команда):
--    CREATE POLICY "Public read community photos" ON storage.objects
--      FOR SELECT TO public USING (bucket_id = 'community-photos');

-- ============================================================================
-- 5. ЩО ЛИШЕНО ВІДКРИТИМ АНОНІМОВІ — СВІДОМО, за рішенням Вови
-- ============================================================================
--   public.analytics_events  "Anyone can log an event"  (6105 рядків)
--   public.ad_events         "Anyone can log ad events" (0 рядків)
-- Метрика неавторизованих відвідувачів за визначенням пишеться ДО входу —
-- закрити означає осліпнути на найбільшу частину аудиторії.
-- ⬜ Ліміт частоти на ці дві таблиці — окрема задача (зараз CHECK = true,
--    тобто кількість подій не обмежена нічим).

-- ============================================================================
-- 6. ПЕРЕВІРКА — бойовими спробами від імені anon, а не читанням політик
-- ============================================================================
-- Правило проєкту: міряти те, що побачить користувач. Усі чотири прогнано:
--
--   begin; set local role anon;
--     select public.submit_board_post('{"text":"т","title":"т"}'::jsonb);
--       → {"ok": false, "error": "Треба увійти в акаунт"}
--     insert into public.posts (type,text,title,status) values ('board','x','y','pending');
--       → ERROR 42501: new row violates row-level security policy for table "posts"
--     delete from public.push_subscriptions;
--       → ERROR 42501: permission denied for table push_subscriptions
--     insert into storage.objects (bucket_id,name,owner) values ('community-photos','x.html',null);
--       → ERROR 42501: new row violates row-level security policy for table "objects"
--   rollback;
