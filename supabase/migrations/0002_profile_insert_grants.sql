-- 0002_profile_insert_grants.sql — Б2: НЕ ДАТИ ЛЮДИНІ ПРИЗНАЧИТИ СЕБЕ ДОВІРЕНОЮ.
-- Автор: аудит 24.09.2026. Накочує Вова через Supabase → SQL Editor.
--
-- ── ЩО НЕ ТАК (заміряно на живій базі 24.09, не з коду) ─────────────────────
--   select grantee, privilege_type, column_name
--   from information_schema.column_privileges
--   where table_name='profiles' and column_name in ('trusted','official','approved_count');
-- Віддає INSERT на всі три колонки і ролі `anon`, і ролі `authenticated`.
--
-- Політика `own profile insert` перевіряє лише `uid = auth.uid()` — тобто ЧИЙ
-- рядок, але не ЩО в ньому. Разом це означає: людина, яка щойно ввійшла і ще не
-- має профілю, може створити його одним запитом із `trusted: true`,
-- `official: true`, `approved_count: 999`. Публічний ключ лежить у `bundle.js`,
-- тобто для цього потрібен лише акаунт Google і браузерна консоль.
--
-- 🔑 ЧОМУ САМЕ GRANT, А НЕ ПОЛІТИКА. RLS вирішує, ЯКІ РЯДКИ видно й можна
-- писати; він не вміє сказати «цей рядок можна, але не цю колонку». Обмеження
-- на колонку — це GRANT. Спроба дописати перевірку в `with check` виглядала б
-- як рішення, але ламалась би на кожній новій привілейованій колонці.
--
-- 🛑 UPDATE ТУТ НЕ ЧІПАЄМО — І ЦЕ НАЙЦІКАВІШЕ В УСІЙ ЗНАХІДЦІ. Звірка тих самих
-- колонок на привілей UPDATE віддає рівно два рядки: `name` і `uid`. Тобто
-- `trusted/official/approved_count` для UPDATE **вже закриті колонковим
-- GRANT-ом** — хтось колись це зробив свідомо і правильно. А INSERT лишився
-- відкритим: ту саму дію просто перенесли на крок раніше, у створення рядка.
-- ⚠️ Саме тому це вада, а не недогляд «ще не дійшли руки»: захист є, він
-- обходиться з іншого боку, і виглядає закритим, доки не перевіриш обидва
-- привілеї окремо.
--
-- 🔑 ХТО Ж ТОДІ СТАВИТЬ `trusted` ПО-СПРАВЖНЬОМУ. Функції `reputation_on_publish()`
-- і `revoke_trust_on_reject()` — SECURITY DEFINER, тобто пишуть повз GRANT-и
-- ролей. Ця міграція їх не зачіпає, репутація працює як і працювала.
--
-- ⚠️ ЩО МАЄ ЛИШИТИСЬ ПРАЦЮВАТИ ПІСЛЯ НАКАТУ: створення профілю при першому
-- вході. Клієнт вставляє `uid`, `name`, `avatar` — цих колонок revoke не
-- торкається. Значення `trusted/official/approved_count` проставить DEFAULT.

revoke insert (trusted, official, approved_count)
  on public.profiles from anon, authenticated;

-- REFERENCES теж зайве: воно дозволяє повісити зовнішній ключ на чужу колонку.
-- Практичної шкоди тут немає, але й підстави давати його ролям застосунку —
-- також.
revoke references (trusted, official, approved_count)
  on public.profiles from anon, authenticated;

-- SELECT свідомо ЛИШАЄМО: значок «довірений» малюється в інтерфейсі, і без
-- читання колонки він зник би з усіх карток.

-- ── ПЕРЕВІРКА ПІСЛЯ НАКАТУ ──────────────────────────────────────────────────
-- 1) Право зникло:
--      select grantee, privilege_type, column_name
--      from information_schema.column_privileges
--      where table_schema='public' and table_name='profiles'
--        and column_name in ('trusted','official','approved_count');
--    очікуємо: жодного рядка з INSERT для anon/authenticated.
-- 2) Звичайне створення профілю не зламалось — живцем: вийти з акаунта,
--    зайти наново іншим Google-акаунтом, переконатись що профіль створився.
