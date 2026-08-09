-- scripts/supabase_page_reactions_guest.sql
-- ПОТІК 2, КРОК 9 (09.08.2026) — ГІСТЬ БІЛЬШЕ НЕ БАЧИТЬ, ХТО САМЕ ЛАЙКНУВ.
--
-- ⛔ СТАТУС: НЕ НАКАТАНО. Накат у прод із цієї сесії заблоковано політикою
--    дозволів середовища. Накотити має Вова (Supabase → SQL Editor) або
--    наступна сесія. Після накату — замінити цей рядок на «✅ НАКАТАНО <дата>».
--
-- ── ПРОБЛЕМА (заміряно на живій базі від імені ролі anon, 09.08) ────────────
--   set local role anon;
--   select count(*), count(distinct user_id) from public.page_reactions;
--   → 11 рядків, 5 унікальних uid
-- Тобто будь-хто з публічним ключем із bundle.js міг зібрати, хто саме що
-- лайкнув у Стрічці. Політика читання була `USING (true)`.
--
-- 🔑 ЧОМУ НЕ «ПРОСТО ЗАКРИТИ ТАБЛИЦЮ». Клієнт рахує лічильник лайків із самих
-- рядків (`fetchPageReactions`, src/core/supabase.js) і має на цю таблицю живу
-- підписку. Закриття «в лоб» дало б гостю 0 лайків усюди — не захист, а поломка.
-- Той самий урок, що з `ads` у потоці 1: RLS ховає РЯДКИ, а не колонки, тож
-- вітрину без чутливої колонки треба будувати окремо.
--
-- ── РІШЕННЯ ─────────────────────────────────────────────────────────────────
--   • подання `page_reaction_counts` — тільки `post_id` і кількість, uid у ньому
--     фізично немає, тож ховати нема чого;
--   • самі рядки — лише авторизованим (вони ж єдині, хто може лайкати:
--     політика `preact insert` вимагає auth.uid() is not null).
--
-- ⚠️ СВІДОМА ЦІНА: гість більше не отримує ЖИВЕ оновлення лічильника (realtime
-- поважає RLS, а рядків він не бачить). Число при завантаженні правильне.
-- Для залогіненого не змінюється нічого. Приймаємо: лайкати гість однаково не
-- може, а точність числа збережена.
--
-- ⚠️ Подання свідомо виконується з правами власника (не `security_invoker`) —
-- інакше воно віддавало б гостю порожньо, тобто 0 лайків. Радник Supabase
-- позначить це як `security_definer_view`; те саме рішення і з тієї ж причини
-- вже прийнято для `ads_public` у потоці 1.

create or replace view public.page_reaction_counts as
  select post_id, count(*)::int as cnt
  from public.page_reactions
  group by post_id;

comment on view public.page_reaction_counts is
  'Лічильники лайків постів Стрічки для НЕзалогінених. Свідомо обходить RLS:
   віддає лише post_id і кількість, uid у ньому фізично немає. Крок 9 потоку 2.';

grant select on public.page_reaction_counts to anon, authenticated;

drop policy if exists "preact read" on public.page_reactions;
create policy "preact read" on public.page_reactions
  for select using (auth.uid() is not null);

-- ── ПЕРЕВІРКА ПІСЛЯ НАКАТУ (виконати обидва блоки) ──────────────────────────
-- 1) Гість більше не бачить рядків, але бачить числа:
--      set local role anon;
--      select count(*) from public.page_reactions;         -- очікуємо 0
--      select count(*) from public.page_reaction_counts;   -- очікуємо > 0
-- 2) Залогінений бачить усе як раніше:
--      set local role authenticated;
--      set local request.jwt.claims = '{"sub":"<будь-який реальний uid>"}';
--      select count(*), count(distinct user_id) from public.page_reactions;
--
-- 🛑 Якщо перший запит НЕ дав 0 — політику не замінено, накат неповний.
