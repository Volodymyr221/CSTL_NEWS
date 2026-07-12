-- scripts/supabase_chat_delete_fix.sql
-- 🔴 ПРОД-ФІКС (12.07.2026, Вова): видалення повідомлення приватного чату
-- падало з помилкою У ВСІХ користувачів — тост «❌ Не вдалося видалити: …».
--
-- КОРІНЬ (самосуперечлива міграція supabase_chat_actions.sql):
--   deleteMessage() (src/core/supabase.js) робить soft-delete (м'яке видалення):
--     UPDATE messages SET deleted_at=now(), text=NULL, photo_url=NULL
--   а constraint messages_text_check з того ж файлу вимагав
--     «текст (1-2000) АБО фото» — БЕЗ винятку для видалених рядків.
--   Обнулення обох полів → обидві гілки CHECK хибні → Postgres відхиляє
--   UPDATE (23514) → UI відкочує бульбашку і показує помилку.
--   Тобто файл сам заявляв мету «soft-delete», але власним constraint
--   унеможливлював його. RLS і тригер messages_guard_own_edit — НЕ винні
--   (перевірено на живій БД: політика пускає учасників, тригер пускає автора).
--
-- ФІКС: видалене повідомлення (deleted_at IS NOT NULL) МОЖЕ бути порожнім.
-- Невидалене — правила ті самі (текст 1-2000 або фото). Розглянутий і
-- ВІДКИНУТИЙ варіант «не обнуляти вміст» — діра приватності (вміст
-- «видаленого» лишався б у БД і читався через API).
--
-- ✅ ЗАСТОСОВАНО на проді 12.07.2026 через Supabase MCP apply_migration
--    (міграція messages_text_check_allow_soft_delete). Цей файл —
--    документація стану БД. Ідемпотентно — безпечно повторювати.
-- ============================================================================

alter table public.messages drop constraint if exists messages_text_check;
alter table public.messages add constraint messages_text_check
  check (
    deleted_at is not null
    or (text is not null and length(trim(text)) between 1 and 2000)
    or photo_url is not null
  );

-- ============================================================================
-- ✅ Перевірено на живій БД 12.07.2026 (обидва тести в транзакції з ROLLBACK):
--   1) UPDATE … SET deleted_at=now(), text=NULL, photo_url=NULL → ПРОХОДИТЬ
--      (раніше падав) — видалення працює.
--   2) UPDATE … SET text=NULL, photo_url=NULL (БЕЗ deleted_at) → 23514
--      (відхилено) — захист від порожніх НЕвидалених повідомлень зберігся.
-- Клієнтський код НЕ змінювався (deleteMessage був правильний) — деплой
-- сайту не потрібен, фікс діє одразу для всіх.
-- ============================================================================
