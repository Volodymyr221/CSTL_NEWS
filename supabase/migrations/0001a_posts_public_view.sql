-- 0001a_posts_public_view.sql — ВІТРИНА ДОШКИ (перша половина Б1).
-- Виділено з 0001 24.09.2026, бо порядок накату в тому файлі був НЕВИКОНАННИЙ.
--
-- 🔴 ЧОМУ РОЗДІЛЕНО. Старий 0001 вимагав: «крок 1 — перевести клієнта на
--    `posts_public`, крок 2 — задеплоїти, крок 3 — накотити цей файл». Але
--    саму вітрину створює той самий файл, кроком 3. Тобто клієнт із кроку 1
--    читав би вітрину, якої ще немає, і Дошка лягла б між кроками 2 і 3 —
--    рівно та поломка, від якої файл застерігав.
--
-- ✅ Ця половина ДОДАЄ і нічого не забирає: створює вітрину і дає на неї право
--    читання. Накатити її можна будь-коли, застосунок при цьому не міняється
--    жодним чином — вітрини просто ніхто ще не читає.
--
-- ПОРЯДОК: цей файл → зміна клієнта → деплой і перевірка живцем → 0001b.

-- ── 1. ВІТРИНА ──────────────────────────────────────────────────────────────
create or replace view public.posts_public as
  select
    p.id, p.type, p.category, p.title, p.text, p.price, p.color, p.location,
    p.photos, p.author, p.owner_uid, p.status, p.published_at, p.created_at,
    p.bumped_at, p.deleted_at,
    -- 🔴 24.09 — ЦИХ СЕМИ КОЛОНОК У ПЕРШІЙ РЕДАКЦІЇ ВІТРИНИ НЕ БУЛО, і це
    -- зламало б Дошку МОВЧКИ — рівно тим класом тихої поломки, від якого
    -- застерігає шапка. Звірено з живою базою 24.09 (`information_schema`
    -- проти `select('*')` у клієнті):
    --   currency + price_negotiable → `formatPrice(p.price, p.currency,
    --     p.price_negotiable)` (board.js ~126, ~834, ~860). Без них ціна
    --     втратила б валюту і позначку «торг».
    --   edited_at → мітка «· змінено» на питанні й відповіді
    --     (board-discussions.js ~435, ~616).
    --   cover_emoji + cover_gradient → прев'ю оголошення в списку розмов
    --     (board-chat.js ~1130); без них плитка стала б сірою заглушкою.
    --   ts → запасний ключ сортування (board.js ~1973).
    --   tags → поле пошуку за замовчуванням (core/search.js).
    p.currency, p.price_negotiable, p.edited_at,
    p.cover_emoji, p.cover_gradient, p.ts, p.tags,
    -- ⚠️ ЧИ Є номер, а не сам номер. Без цього поля клієнт не відрізнив би
    -- «телефон є, попроси» від «телефону немає взагалі» — і кнопка «Показати
    -- номер» висіла б на оголошеннях, за якою порожнеча.
    (nullif(btrim(coalesce(p.contact, '')), '') is not null) as has_contact
  from public.posts p
  where p.deleted_at is null
    and p.status = 'published';

comment on view public.posts_public is
  'Вітрина Дошки без колонки contact (міграція 0001). Свідомо обходить RLS: сама
   таблиця posts більше не читається публічно, бо RLS ховає рядки, а не колонки.
   Той самий розкрій, що ads → ads_public.
   Свідомо НЕ включені: contact (уся суть міграції), reject_reason і updated_at
   (їх бачить лише автор у своїх чернетках, а `fetchMyPosts` лишається на
   самій таблиці posts).';

grant select on public.posts_public to anon, authenticated;

