-- scripts/supabase_chat_edit_guard.sql
-- Д-15 (аудит приватного чату) — серверне посилення «редагувати/видаляти
-- лише СВОЄ повідомлення». Закриває дірку, яку прямо визнавав
-- supabase_chat_actions.sql: чинна UPDATE-політика "msg recipient marks read"
-- (supabase_phase_b_chat.sql) дозволяє БУДЬ-ЯКОМУ з двох учасників треда
-- оновлювати БУДЬ-ЯКУ колонку БУДЬ-ЯКОГО повідомлення — тобто отримувач міг
-- з консолі викликати editMessage/deleteMessage на ЧУЖОМУ повідомленні, і БД
-- це пропускала (обмеження «лише своє» жило тільки в UI).
--
-- RLS у Postgres не вміє обмежувати UPDATE по конкретних колонках у WITH CHECK,
-- тож ставимо BEFORE UPDATE тригер: зміну ВМІСТУ (text/photo_url/edited_at/
-- deleted_at) пропускаємо лише автору повідомлення (sender_uid = auth.uid());
-- read_at (позначка «прочитано») лишається доступною обом учасникам, щоб
-- markThreadRead() працював. Edge Functions / service_role (auth.uid() = null)
-- проходять без обмежень.
--
-- ЗАСТОСУВАТИ: Supabase → SQL Editor → Run (або MCP apply_migration).
-- Ідемпотентно — безпечно повторювати.
-- ============================================================================

create or replace function public.messages_guard_own_edit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- service_role / внутрішні виклики (немає JWT-користувача) — без обмежень.
  if auth.uid() is null then
    return new;
  end if;

  -- Зміна вмісту повідомлення дозволена ЛИШЕ його автору.
  -- read_at (та інші суто-технічні позначки) не чіпаємо — обидва учасники ок.
  if (new.text       is distinct from old.text
      or new.photo_url  is distinct from old.photo_url
      or new.edited_at  is distinct from old.edited_at
      or new.deleted_at is distinct from old.deleted_at)
     and old.sender_uid <> auth.uid() then
    raise exception 'Редагувати/видаляти можна лише власні повідомлення'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_messages_guard_own_edit on public.messages;
create trigger trg_messages_guard_own_edit
  before update on public.messages
  for each row execute function public.messages_guard_own_edit();

-- ============================================================================
-- ✅ Перевірка (виконати від імені учасника-Б, чиє auth.uid() ≠ автор А):
--   update messages set text='зламано' where id=<повідомлення А>  → відмова 42501
--   update messages set read_at=now()   where id=<повідомлення А>  → проходить
--   (автор А редагує/видаляє своє)                                 → проходить
-- ============================================================================
