-- 0011_chat_page_guards.sql — ДІРКИ Б1 · Б2 · Б3 З АУДИТУ БЕЗПЕКИ 24.10.2026.
-- 🗣️ Вова 26.10: «спочатку «Роби» на дірки безпеки Б1→Б2→Б3».
-- 📄 Звіт: `CSTL NEWS VOVA/docs/AUDYT_BEZPEKY_2026-10-24.md`.
--
-- 🔑 УСІ ТРИ — ОДНОГО КЛАСУ: «дозволено змінити рядок» без «заборонено змінити ОЦІ
-- колонки». Політики RLS (правила доступу до рядків) кажуть ЯКИЙ рядок можна чіпати,
-- але не ЩО в ньому.
--
-- ⚠️ ЧОМУ ТРИГЕРИ, А НЕ `revoke update … grant update (колонки)`, як радив звіт:
-- адмінка (`admin.html`) пише в `pages` (`sort_order`, назва, тема) тією самою роллю
-- `authenticated`, що й житель. Колонковий grant відрізав би адміна разом зі
-- сторонньою людиною. Тригер розрізняє їх через `is_admin()` — те саме правило, що
-- в політиках. Це також той самий візерунок, що наявний `messages_guard_own_edit`.
--
-- 🟢 `auth.uid() is null` → пропускаємо: так ходять сервісна роль, cron і Edge
-- Functions (серверні функції), яким ці колонки міняти законно.
--
-- 📐 ЩО БУЛО НА ПРОДІ ДО НАКАТУ (заміряно 26.10):
--   • `threads` UPDATE — політика «учасник», тригер лише переписує імена;
--     клієнт пише ЛИШЕ `last_message_at`, `last_message_text` (`supabase.js` ~1841);
--   • `messages` UPDATE — політика «учасник треду», сторож стеріг текст/фото/
--     редагування/видалення, але НЕ `sender_uid`, `thread_id`;
--   • `pages` UPDATE — політика `is_admin() or can_edit_page(id)` на ВЕСЬ рядок,
--     права на рівні таблиці (колонковий revoke не діяв).
-- ⚠️ Накат ЧАСТИНАМИ з `set lock_timeout = '3s'` (урок 07.10 і 12.10).

-- ── Б1. ТРЕД НЕ МОЖНА «ПЕРЕПРИВʼЯЗАТИ» ─────────────────────────────────────────
-- Було: учасник міняв `post_id` на чуже оголошення → політика «thread party reads its
-- post» віддавала йому той рядок `posts` разом із КОНТАКТОМ і неопублікованим.
create or replace function public.threads_guard_identity()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or is_admin() then return new; end if;
  if new.id         is distinct from old.id
  or new.post_id    is distinct from old.post_id
  or new.author_uid is distinct from old.author_uid
  or new.buyer_uid  is distinct from old.buyer_uid
  or new.created_at is distinct from old.created_at then
    raise exception 'Розмову не можна переприв''язати до іншого оголошення чи людини'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_threads_guard_identity on public.threads;
create trigger trg_threads_guard_identity before update on public.threads
  for each row execute function public.threads_guard_identity();

-- ── Б2. ПОВІДОМЛЕННЯ НЕ МОЖНА «ПЕРЕПІДПИСАТИ» ─────────────────────────────────
-- Було: учасник міняв `sender_uid` чужого повідомлення → воно ставало «від імені»
-- співрозмовника. Тепер: службові колонки незмінні для всіх; текст/фото — лише
-- автор (як і було); «прочитано» (`read_at`) — лише отримувач.
create or replace function public.messages_guard_own_edit()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null then return new; end if;
  if new.id          is distinct from old.id
  or new.thread_id   is distinct from old.thread_id
  or new.sender_uid  is distinct from old.sender_uid
  or new.created_at  is distinct from old.created_at
  or new.reply_to_id is distinct from old.reply_to_id
  or new.client_tag  is distinct from old.client_tag then
    raise exception 'Службові поля повідомлення змінювати не можна' using errcode = '42501';
  end if;
  if (new.text is distinct from old.text
      or new.photo_url is distinct from old.photo_url
      or new.edited_at is distinct from old.edited_at
      or new.deleted_at is distinct from old.deleted_at)
     and old.sender_uid <> auth.uid() then
    raise exception 'Редагувати/видаляти можна лише власні повідомлення' using errcode = '42501';
  end if;
  if new.read_at is distinct from old.read_at and old.sender_uid = auth.uid() then
    raise exception '«Прочитано» ставить лише отримувач' using errcode = '42501';
  end if;
  return new;
end $$;
-- Тригер `trg_messages_guard_own_edit` уже висить на цій функції — перестворювати не треба.

-- ── Б3. МОДЕРАТОР НЕ СТАВИТЬ СОБІ «ОФІЦІЙНА» ──────────────────────────────────
-- Модератор (`can_edit_page`) лишає назву, тему, аватар, банер. Значок «офіційна»,
-- системність, адреса й порядок — лише адмін (`admin_set_official`, адмінка).
create or replace function public.pages_guard_admin_cols()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is null or is_admin() then return new; end if;
  if new.id         is distinct from old.id
  or new.slug       is distinct from old.slug
  or new.official   is distinct from old.official
  or new.is_system  is distinct from old.is_system
  or new.sort_order is distinct from old.sort_order
  or new.created_at is distinct from old.created_at then
    raise exception 'Це поле спільноти змінює лише адміністратор' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_pages_guard_admin_cols on public.pages;
create trigger trg_pages_guard_admin_cols before update on public.pages
  for each row execute function public.pages_guard_admin_cols();
