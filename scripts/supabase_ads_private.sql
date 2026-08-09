-- ============================================================================
-- РЕКЛАМА: комерційні дані — приватні, показ — окремим поданням (09.08.2026)
-- ============================================================================
--
-- 🔴 ПРИВІД. Політика `"Public can read active ads"` фільтрувала РЯДКИ
--    (`is_active AND expires_at > now()`) — і жодним чином не ховала КОЛОНКИ.
--    **RLS у Postgres рядковий, не колонковий.** Тобто разом з оголошенням
--    віддавались `client_name`, `client_email`, `client_phone`, `paid_amount`.
--
--    Рядків у таблиці на момент правки — 0, тож витоку не сталося. Але політика
--    вже стояла: перший платний рекламодавець злив би свій телефон і суму оплати.
--
-- 🛑 ЧОМУ НЕ `REVOKE SELECT ... FROM authenticated`, як радив ChatGPT.
--    `REVOKE` діє НИЖЧЕ за RLS: він знімає право на таблицю цілком, і жодна
--    політика його вже не поверне. Адмін заходить у застосунок звичайним
--    входом Google, тобто теж має роль `authenticated` — після такого REVOKE
--    політика `"Admins manage ads"` перестала б його рятувати, і адмінка
--    осліпла б МОВЧКИ, без помилки в коді.
--    ➡️ Правильний рівень — сама політика. Знімаємо публічне читання; лишається
--       `"Admins manage ads" USING (is_admin())`. Тоді:
--         анонім              → 0 рядків
--         звичайний житель    → 0 рядків
--         адмін               → повний доступ ✅
--
-- ЩО ЗАМІСТЬ. Подання `ads_public` з БЕЗПЕЧНИМИ колонками. Воно навмисно
--    БЕЗ `security_invoker` — тобто виконується з правами власника і RLS
--    базової таблиці оминає. Саме це й потрібно: колонок із контактами в ньому
--    немає фізично, тож віддати їх неможливо навіть помилкою.
--
-- ⚠️ ЗАРАЗ ЦЕ ПОДАННЯ НЕ ЧИТАЄ НІХТО. Перевірено пошуком по всьому репозиторію:
--    0 входжень `ads` у `src/` і в `admin.html`. Заводимо його наперед, щоб
--    коли реклама з'явиться, ніхто не потягнувся по звичці до самої таблиці.
--
-- Ідемпотентно. Відкат — у кінці файлу.
-- ============================================================================

-- 1. Прибрати публічне читання самої таблиці
drop policy if exists "Public can read active ads" on public.ads;

-- 2. Показ — лише безпечні колонки
drop view if exists public.ads_public;
create view public.ads_public as
  select id, title, body, image_url, link_url, placement, priority,
         starts_at, expires_at, created_at
    from public.ads
   where is_active = true
     and expires_at > now()
     and (starts_at is null or starts_at <= now());

comment on view public.ads_public is
  'Публічна вітрина реклами. Свідомо БЕЗ client_name/client_email/client_phone/paid_amount: RLS колонок не ховає, тому їх тут просто немає.';

grant select on public.ads_public to anon, authenticated;

-- 3. Лічильники показів/кліків лишаються службовими — у поданні їх теж немає
--    (views_count / clicks_count рахує адмінка через ad_events).

-- ── ВІДКАТ (якщо колись знадобиться повернути як було) ───────────────────────
-- drop view if exists public.ads_public;
-- create policy "Public can read active ads" on public.ads for select
--   using (is_active = true and expires_at > now());
