-- scripts/supabase_profiles_extended.sql
-- Розширення профілю жителя під повноцінний «Мій кабінет» (анкета).
-- Додає колонки до наявної public.profiles. Ідемпотентно (IF NOT EXISTS).
-- Застосувати: Supabase → SQL Editor → Run. RLS уже налаштовано у supabase_profiles.sql
-- (кожен читає/пише лише свій рядок) — нові колонки успадковують ті самі політики.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS surname    text,
  ADD COLUMN IF NOT EXISTS phone      text,
  ADD COLUMN IF NOT EXISTS settlement text,   -- населений пункт (Олика/села громади/інше)
  ADD COLUMN IF NOT EXISTS street     text,
  ADD COLUMN IF NOT EXISTS bio        text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- Примітка: налаштування сповіщень (Автобуси/Світло/Новини/Дошка) зберігаються
-- на пристрої (localStorage), тож окремих колонок під них поки не заводимо.
