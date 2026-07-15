-- scripts/supabase_reputation_hardening.sql
-- Захист від самопризначення довіри (доповнення до supabase_reputation.sql).
--
-- Проблема: RLS-політика "own profile update" (supabase_profiles.sql) дозволяє
-- юзеру міняти БУДЬ-ЯКУ колонку свого рядка profiles (перевіряє лише
-- uid = auth.uid(), без обмежень по колонках). Разом зі стандартним для
-- Supabase table-level GRANT UPDATE ON profiles TO authenticated, це означає
-- що будь-хто зі своєї сесії міг би напряму виконати
-- supabase.from('profiles').update({trusted:true}) і отримати автопублікацію
-- без жодного реального схвалення — колонки trusted/approved_count мають
-- мінятись ЛИШЕ тригерами reputation_on_publish/revoke_trust_on_reject
-- (SECURITY DEFINER — це обмеження їх не зачіпає, вони виконуються від імені
-- власника функції, не від ролі authenticated/anon).
--
-- ⚠️ Точковий "revoke update (trusted, approved_count) ..." НЕ ПРАЦЮЄ, поки
-- лишається table-level GRANT UPDATE — він покриває всі колонки незалежно
-- від колонкового revoke (перевірено емпірично 08.07.2026). Правильний
-- патерн: зняти UPDATE з усієї таблиці, потім явно дозволити UPDATE лише на
-- ті колонки, які реально редагує клієнт (saveProfile у auth.js).
--
-- ЗАСТОСОВАНО (08.07.2026, через MCP apply_migration).
-- ============================================================================

revoke update on public.profiles from authenticated, anon;

-- uid — конфліктна колонка Supabase upsert(onConflict:'uid'), значення не
-- змінюється, RLS все одно блокує чужий uid. name/email/birth_date — реально
-- редаговані поля кабінету (auth.js saveProfile). Коли розширені поля
-- профілю (surname/phone/settlement/street/bio/avatar_url,
-- supabase_profiles_extended.sql) буде застосовано в БД — додати їх сюди ж.
-- ✅ [15.07.2026] ДОДАНО окремою міграцією scripts/supabase_profiles_grant_extended.sql
--    (цей крок був пропущений → аватар/анкета падали «permission denied»).
grant update (uid, name, email, birth_date) on public.profiles to authenticated, anon;


-- ============================================================================
-- ✅ Перевірка (виконана 08.07.2026 через execute_sql, role authenticated):
--   1. UPDATE profiles SET trusted=true ...     → permission denied.  ✅
--   2. upsert(uid,name,email,birth_date) ...    → проходить як і раніше. ✅
-- ============================================================================
