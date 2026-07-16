-- scripts/supabase_profiles_grant_extended.sql
-- Фікс (15.07.2026): аватар і поля анкети (прізвище/телефон/село/вулиця/про себе)
-- не зберігались — клієнт діставав «permission denied for table profiles».
--
-- Причина: supabase_reputation_hardening.sql (08.07) зробив REVOKE UPDATE на всю
-- таблицю profiles і повернув колонковий GRANT UPDATE ЛИШЕ на (uid, name, email,
-- birth_date). Розширені колонки (supabase_profiles_extended.sql + avatar_url з
-- Потоку 12) до гранту не додали, хоча коментар у hardening це прямо передбачав
-- («коли розширені поля буде застосовано — додати їх сюди ж»). Тому будь-який
-- upsert, що чіпав surname/phone/settlement/street/bio/avatar_url, відхилявся.
--
-- Фікс: додаємо ці колонки у грант UPDATE. trusted/approved_count СВІДОМО НЕ
-- додаємо — вони мають мінятись лише SECURITY DEFINER-тригерами
-- (reputation_on_publish/revoke_trust_on_reject); захист від самопризначення
-- довіри лишається чинним.
--
-- ЗАСТОСОВАНО 15.07.2026 через MCP apply_migration (profiles_grant_extended_update_columns).
-- Звірено information_schema.role_column_grants: authenticated/anon UPDATE тепер =
--   avatar_url, bio, birth_date, email, name, phone, settlement, street, surname, uid
--   (trusted/approved_count відсутні — як і має бути).
-- ============================================================================

grant update (surname, phone, settlement, street, bio, avatar_url)
  on public.profiles to authenticated, anon;
