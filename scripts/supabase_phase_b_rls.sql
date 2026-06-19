-- scripts/supabase_phase_b_rls.sql
-- Фаза Б, Етап 3 — Переписати RLS реакцій/коментарів/push на auth.uid().
-- Закриває попередження security-advisor (анонімний запис → справжній акаунт).
--
-- 🔴🔴🔴 НЕ ЗАПУСКАТИ, ПОКИ ВХІД (Google) НЕ ПРАЦЮЄ НАЖИВО! 🔴🔴🔴
-- Після цього скрипта НЕзалогінені НЕ зможуть реагувати/коментувати/трекати
-- автобус (це і є задум — гейтинг). Якщо вхід ще не налаштований (Етап 0) —
-- заблокуєш усіх. Спершу Етап 0 + перевірка signInWithGoogle, ПОТІМ цей файл.
--
-- ЧИТАННЯ лишається публічним (старий анонімний контент видно й далі).
-- Ідемпотентний.

-- ── РЕАКЦІЇ: писати/міняти/знімати лише свою (user_id = auth.uid()) ──
drop policy if exists "Anyone can insert reaction" on public.reactions;
drop policy if exists "Anyone can update reaction" on public.reactions;
drop policy if exists "Anyone can delete reaction" on public.reactions;

create policy "Auth insert own reaction" on public.reactions for insert to authenticated
  with check (user_id = auth.uid()::text and emoji is not null and length(emoji) between 1 and 16);
create policy "Auth update own reaction" on public.reactions for update to authenticated
  using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
create policy "Auth delete own reaction" on public.reactions for delete to authenticated
  using (user_id = auth.uid()::text);
-- (Політика "Public can read reactions" лишається — усі бачать лічильники.)

-- ── КОМЕНТАРІ: додаємо власника (sender_uid), писати лише від себе ──
alter table public.comments add column if not exists sender_uid uuid references auth.users(id);

drop policy if exists "Anyone can post comment" on public.comments;
create policy "Auth post comment" on public.comments for insert to authenticated
  with check (
    sender_uid = auth.uid()
    and text is not null and length(trim(text)) between 1 and 2000
  );
-- Автор може видалити свій коментар (на додачу до admin-видалення)
drop policy if exists "Author deletes own comment" on public.comments;
create policy "Author deletes own comment" on public.comments for delete to authenticated
  using (sender_uid = auth.uid());
-- (Політики "Public can read comments" і "Admins can delete comments" лишаються.)

-- ── PUSH-ПІДПИСКИ АВТОБУСІВ: прив'язка до акаунта (user_uuid = auth.uid()) ──
drop policy if exists "Anyone can insert push subscription" on public.push_subscriptions;
drop policy if exists "Anyone can update push subscription" on public.push_subscriptions;
drop policy if exists "Anyone can delete push subscription" on public.push_subscriptions;

create policy "Auth insert own push sub" on public.push_subscriptions for insert to authenticated
  with check (user_uuid = auth.uid()::text);
create policy "Auth update own push sub" on public.push_subscriptions for update to authenticated
  using (user_uuid = auth.uid()::text) with check (user_uuid = auth.uid()::text);
create policy "Auth delete own push sub" on public.push_subscriptions for delete to authenticated
  using (user_uuid = auth.uid()::text);
-- (Політика "Service role can read all subscriptions" лишається — Edge Function шле push.)

-- ── Перевірка після застосування ──
-- SELECT через get_advisors(security) має показати менше попереджень
-- (анонімний запис закрито). Реакції/коментарі/трек автобуса працюють лише
-- залогіненим. Старі анонімні рядки лишаються видимими (read = public).
