-- supabase_chat_actions.sql
-- Дії над повідомленнями приватного чату: фото + відповідь + редагування + soft-delete.
-- Застосувати в Supabase SQL Editor (MCP-запис у веб-сесії потребує підтвердження).
-- Ідемпотентно — безпечно запускати повторно.

-- Нові колонки
alter table public.messages add column if not exists photo_url   text;
alter table public.messages add column if not exists reply_to_id bigint references public.messages(id) on delete set null;
alter table public.messages add column if not exists edited_at   timestamptz;
alter table public.messages add column if not exists deleted_at  timestamptz;

-- Дозволити фото-без-тексту: text стає nullable, нове обмеження «текст АБО фото»
-- ⚠️ ЗАСТАРІЛО (12.07.2026): цей варіант constraint ламав soft-delete (обнулення
-- text+photo_url порушувало CHECK → видалення повідомлення падало у ВСІХ користувачів).
-- Чинна версія — supabase_chat_delete_fix.sql (+виняток deleted_at). НЕ застосовувати цей блок.
alter table public.messages alter column text drop not null;
alter table public.messages drop constraint if exists messages_text_check;
alter table public.messages add constraint messages_text_check
  check ((text is not null and length(trim(text)) between 1 and 2000) or photo_url is not null);

-- RLS: окремих політик не треба — чинна "msg recipient marks read" (update для будь-кого
-- з двох учасників) покриває і редагування, і м'яке видалення. Обмеження «лише своє»
-- робиться в UI. Серверне посилення (лише автор редагує свій текст) — окремий follow-up
-- для майбутніх багатоучасникових чатів/обговорень.
