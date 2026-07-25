-- scripts/supabase_comment_guard.sql
-- B-23 — сторож редагування коментарів «Стрічки» (page_comments).
--
-- ПРОБЛЕМА. Політика `pcom update` вирішувала лише ХТО може чіпати рядок
-- (автор / адмін / редактор сторінки), а `with check (true)` дозволяла міняти
-- у ньому ЩО ЗАВГОДНО. Через відкритий API це давало:
--   • переписати свій коментар на чуже імʼя (підробка авторства);
--   • адміну сторінки — зробити те саме з ЧУЖИМИ коментарями;
--   • поставити deleted_at = null і «воскресити» видалений коментар —
--     а це прямий обхід каскаду «одна сітка» (trg_cascade_soft_delete_replies);
--   • підробити згадку reply_to_uid (на вставці захист є, на редагуванні не було).
--
-- РІШЕННЯ — те саме, що 08.07 для приватних повідомлень Дошки
-- (messages_guard_own_edit): тригер BEFORE UPDATE.
--
-- РОЗПОДІЛ ВІДПОВІДАЛЬНОСТІ (навмисний, щоб не дублювати логіку у двох місцях):
--   RLS `pcom update`  → ХТО взагалі має право торкатись рядка.
--   Цей тригер         → ЯКІ поля в ньому можна змінити.
-- Тому тригер не перевіряє права адміна повторно — це робота RLS.
--
-- ЧОМУ ТРИГЕР, А НЕ ЛИШЕ `with check`: with check бачить тільки НОВИЙ рядок
-- і не може порівняти його зі старим, тобто «поле не змінилось» ним не виразити.
-- Тригер бачить OLD і NEW одночасно — це єдине місце, де правило формулюється чесно.

create or replace function public.page_comments_guard_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Службові виклики без JWT людини (service_role, міграції, Edge Functions,
  -- SQL-редактор) лишаються повновладними — інакше неможливо було б
  -- виправити дані руками. Той самий виняток, що у messages_guard_own_edit.
  if auth.uid() is null then
    return new;
  end if;

  -- 1. Незмінні поля: особа автора, місце коментаря у сітці, час і адресат згадки.
  --    Міняти можна ЛИШЕ text і deleted_at — решта фіксується назавжди.
  if new.id           is distinct from old.id
     or new.post_id      is distinct from old.post_id
     or new.author_uid   is distinct from old.author_uid
     or new.created_at   is distinct from old.created_at
     or new.parent_id    is distinct from old.parent_id
     or new.reply_to_uid is distinct from old.reply_to_uid then
    raise exception 'У коментарі можна змінити лише текст або видалити його'
      using errcode = '42501';
  end if;

  -- 2. Видалений коментар заморожений: ні воскресити, ні переписати.
  --    Саме це закриває обхід каскаду «одна сітка».
  if old.deleted_at is not null
     and (new.deleted_at is distinct from old.deleted_at
          or new.text is distinct from old.text) then
    raise exception 'Видалений коментар змінювати не можна'
      using errcode = '42501';
  end if;

  -- 3. Текст править лише автор. Адмін сторінки може ВИДАЛИТИ чужий коментар
  --    (модерація), але не переписати його — інакше під імʼям людини зʼявився б
  --    текст, якого вона не писала.
  if new.text is distinct from old.text
     and old.author_uid is distinct from auth.uid() then
    raise exception 'Редагувати можна лише власний коментар'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_page_comments_guard_update on public.page_comments;

-- BEFORE UPDATE — спрацьовує ДО запису, тож заборонена зміна не потрапляє в таблицю.
-- Каскад (trg_cascade_soft_delete_replies) — AFTER UPDATE, конфлікту нема:
-- він міняє лише deleted_at (null → час), а це дозволене цим сторожем.
create trigger trg_page_comments_guard_update
before update on public.page_comments
for each row execute function public.page_comments_guard_update();

-- Другий рубіж: прибираємо `with check (true)`, щоб коментар не можна було
-- перенести під пост, до якого людина не має доступу. Вираз той самий, що в USING,
-- тож для законних дій нічого не змінюється.
-- (Заразом знімає попередження advisors `rls_policy_always_true` по цій політиці.)
drop policy if exists "pcom update" on public.page_comments;
create policy "pcom update" on public.page_comments
  for update
  using (
    author_uid = auth.uid()
    or is_admin()
    or can_edit_page((select pp.page_id from public.page_posts pp where pp.id = page_comments.post_id))
  )
  with check (
    author_uid = auth.uid()
    or is_admin()
    or can_edit_page((select pp.page_id from public.page_posts pp where pp.id = page_comments.post_id))
  );
