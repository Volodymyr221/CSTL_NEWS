-- supabase_avatars_public.sql
-- Потік 12 Інкремент Б — крос-юзер аватари (фото профілю у чужих кружечках).
--
-- ПРОБЛЕМА: RLS на profiles — «own read» (кожен бачить лише свій рядок,
--   uid = auth.uid()). Тому чужий avatar_url напряму НЕ прочитати, і фото
--   користувача не видно іншим в обговореннях / приватних чатах.
--
-- РІШЕННЯ: вузька публічна функція get_avatars(uids) — SECURITY DEFINER
--   (виконується з правами власника → оминає RLS), але повертає ЛИШЕ 3 поля:
--   uid, name, avatar_url. НІКОЛИ не віддає phone / birth_date / email тощо.
--   Приймає масив uid, повертає таблицю — один запит на цілий тред (батч).
--
-- БЕЗПЕКА: read-only, тільки 3 несекретні поля (ім'я вже й так денормалізоване
--   в коментарі/треди). Виконати може anon і authenticated (гість теж бачить фото).
--
-- Ідемпотентно: create or replace. Застосувати в Supabase → SQL Editor.

create or replace function public.get_avatars(uids uuid[])
returns table (uid uuid, name text, avatar_url text)
language sql
security definer
set search_path = public
stable
as $$
  select p.uid, p.name, p.avatar_url
  from public.profiles p
  where p.uid = any(uids)
$$;

grant execute on function public.get_avatars(uuid[]) to anon, authenticated;
