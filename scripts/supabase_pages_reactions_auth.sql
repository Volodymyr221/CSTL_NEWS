-- supabase_pages_reactions_auth.sql
-- «СТРІЧКА»: лайки постів — ТІЛЬКИ авторизованим (рішення Вови 22.07).
-- Причина: анонімна реакція ламає ідентифікацію і статистику (гість лайкнув,
-- потім залогінився і лайкнув ще раз → це не статистика). Один акаунт = один голос.
--
-- Що робить:
--   1) INSERT/UPDATE/DELETE реакції — лише власна (user_id = auth.uid()), вхід обовʼязковий.
--      READ лишається публічним (лічильник видно всім).
--   2) REPLICA IDENTITY FULL — щоб realtime DELETE-подія віддавала post_id/user_id
--      (інакше зняття лайка не синхронізувалось би у інших наживо).
--
-- Ідемпотентно (можна виконувати повторно). Застосовує Вова вручну у Supabase.

-- ── 1. RLS: реакції лише авторизованих, лише свої ───────────────────────────
drop policy if exists "preact insert" on public.page_reactions;
drop policy if exists "preact update" on public.page_reactions;
drop policy if exists "preact delete" on public.page_reactions;

-- Вставити лайк може лише залогінений, і лише від свого імені.
create policy "preact insert" on public.page_reactions for insert with check (
  auth.uid() is not null
  and user_id = auth.uid()::text
  and length(emoji) between 1 and 16
);

-- Оновити (upsert при повторному лайку) — лише свій рядок.
create policy "preact update" on public.page_reactions for update
  using (user_id = auth.uid()::text)
  with check (user_id = auth.uid()::text);

-- Зняти лайк — лише свій (адмін може модерувати).
create policy "preact delete" on public.page_reactions for delete
  using (user_id = auth.uid()::text or is_admin());

-- ── 2. REPLICA IDENTITY FULL для realtime DELETE ────────────────────────────
-- Без цього payload.old при DELETE містить лише PK (id), без post_id/user_id,
-- і клієнт не може зменшити лічильник при знятті лайка іншим користувачем.
alter table public.page_reactions replica identity full;
