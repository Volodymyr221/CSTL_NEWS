-- ============================================================================
-- СЛУЖБОВІ RPC + search_path + стеля get_avatars (09.08.2026)
-- ============================================================================
--
-- 🔑 ГОЛОВНЕ ПРО РАДНИКА SUPABASE. Він видав 88 попереджень, і 76 з них —
--    «anon може виконати SECURITY DEFINER функцію». Механічно виправляти всі
--    БУЛО Б ПОМИЛКОЮ:
--      • 13 із них — ТРИГЕРНІ функції (`sync_profile_denorm`,
--        `notify_new_page_post`, `touch_thread_on_message`…). Postgres не дає
--        викликати їх через PostgREST узагалі — «trigger functions can only be
--        called as triggers». Це хибна тривога.
--      • ~63 — предикати RLS (`is_admin`, `can_edit_page`, `is_group_member`)
--        і функції зі сторожем `auth.uid()` / `is_admin()` УСЕРЕДИНІ. Право
--        виконання аноніму тут ПОТРІБНЕ: без нього впадуть самі політики.
--    ➡️ Реально відкритих виявилось РІВНО ДВІ. Їх і закриваємо.
--    🛑 Мета — коректна модель доступу, а не нуль попереджень у дашборді.
--
-- ⚠️ `REVOKE ... FROM public` ОБОВ'ЯЗКОВИЙ. Право на виконання функції за
--    замовчуванням видається псевдоролі PUBLIC, яку успадковують усі. Зняти
--    лише з `anon` і `authenticated` — косметика: доступ лишиться через PUBLIC.
--
-- ⚠️ `pg_cron` і Edge-функції не постраждають: вони ходять від `postgres` /
--    `service_role`, а тригер `notify_new_page_comment` — SECURITY DEFINER,
--    тобто виконується з правами власника.
-- ============================================================================

-- ── 1. Дві службові функції — не публічне API ───────────────────────────────
revoke execute on function public.heal_orphan_page_comments() from public, anon, authenticated;
revoke execute on function public.flush_page_comment_push()   from public, anon, authenticated;
grant  execute on function public.heal_orphan_page_comments() to service_role;
grant  execute on function public.flush_page_comment_push()   to service_role;

-- ── 2. Мутабельний search_path (7 функцій) ──────────────────────────────────
-- 🛑 Через ALTER, а НЕ переписуванням тіла. `text_abuse_reason` — 100+ рядків
--    живого фільтру лайки, який ДЗЕРКАЛИТЬ `src/core/utils.js`. Відтворення
--    «по пам'яті» — найкоротший шлях до розходження двох копій, а в цьому
--    проєкті списки антиспаму вже одного разу розійшлись.
-- ℹ️ Жодна з семи НЕ є SECURITY DEFINER, тож ризик був низький. Виправляємо,
--    бо дешево, а не бо «радник світиться».
alter function public.text_norm_cyr(text)       set search_path = public, pg_temp;
alter function public.text_norm_lat(text, text) set search_path = public, pg_temp;
alter function public.text_abuse_reason(text)   set search_path = public, pg_temp;
alter function public.comments_antispam()       set search_path = public, pg_temp;
alter function public.page_comments_antispam()  set search_path = public, pg_temp;
alter function public.ad_reports_guard_update() set search_path = public, pg_temp;
alter function public.set_bumped_on_publish()   set search_path = public, pg_temp;

-- ── 3. Стеля на довжину масиву в get_avatars ────────────────────────────────
-- ⚠️ Це НЕ про «перебір uid», як писав ChatGPT: uuid 128-бітний, перебрати його
--    неможливо. Справжня вада — відсутність межі: один виклик міг попросити
--    мільйон uid. Профілів у базі 10, тож 500 — запас на роки.
create or replace function public.get_avatars(uids uuid[])
returns table (uid uuid, name text, avatar_url text)
language sql
security definer
set search_path = public
stable
as $$
  select p.uid, p.name, p.avatar_url
  from public.profiles p
  where p.uid = any(uids[1:500])
$$;

comment on function public.get_avatars(uuid[]) is
  'Публічні імена й фото за списком uid. Стеля 500 uid на виклик (array slice). Ніколи не віддає phone/email/birth_date.';
