-- supabase_posts_color_check_widen.sql
-- 🔴 ФІКС ПРОДА (12.07.2026): публікація оголошень падала з
--   "new row for relation \"posts\" violates check constraint \"posts_color_check\"".
--
-- Причина: 11.07 категорії Дошки перевели на СЕМАНТИЧНІ кольори тегів
-- (src/core/board-categories.js): Продам=red, Знайдено/Загубилось=amber, тощо.
-- RPC submit_board_post вставляє posts.color = payload->>'color' (= колір категорії),
-- але старий CHECK дозволяв лише yellow/green/blue/pink/white → red/amber відхилялись.
-- Розсинхрон код↔БД: constraint не оновили разом з кольорами.
--
-- Фікс: розширити дозволений набір кольорів (додано red, amber; gray — на майбутнє).
-- Наявні пости мають старі валідні кольори → drop+add без ризику (усі проходять).
-- ЗАСТОСОВАНО в БД 12.07 через Supabase MCP (apply_migration widen_posts_color_check_red_amber).
--
-- ⚠️ На майбутнє: posts.color — фактично legacy. Рендер картки/модалки/прев'ю бере колір
-- через catColor(category) (board-categories.js), а НЕ p.color. Тобто збережений color
-- ніде не показується. Кандидат на прибирання (payload+RPC+column) окремою задачею —
-- тоді розсинхрон кольорів більше не траплятиметься.

alter table public.posts drop constraint if exists posts_color_check;
alter table public.posts add constraint posts_color_check
  check (color = any (array['yellow','green','blue','pink','white','red','amber','gray']));
