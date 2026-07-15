-- supabase_public_profile.sql
-- Картка профілю користувача (перегляд іншими) — тап по аватару відкриває картку.
--
-- ПРОБЛЕМА: RLS на profiles — «own read» (кожен бачить лише свій рядок). Тому
--   для показу картки ЧУЖОГО профілю потрібен вузький публічний доступ.
--
-- РІШЕННЯ: SECURITY DEFINER функція get_public_profile(uid) — віддає РІВНО 6
--   несекретних полів: uid, name, avatar_url, settlement, trusted, created_at.
--   НІКОЛИ не віддає phone / email / birth_date / street / bio (приватне).
--   Окрема від get_avatars (той — лінивий батч лише uid/name/avatar_url для
--   гідрації кружечків; тут — один юзер, більше полів для картки).
--
-- БЕЗПЕКА: read-only, лише погоджені публічні поля. Виконує anon і authenticated
--   (гість теж бачить картку). settlement/trusted/created_at — публічні за
--   рішенням власника (громада, бейдж довіри, «у громаді з <рік>»).
--
-- Ідемпотентно (create or replace). Застосувати в Supabase → SQL Editor.

create or replace function public.get_public_profile(p_uid uuid)
returns table (
  uid        uuid,
  name       text,
  avatar_url text,
  settlement text,
  trusted    boolean,
  created_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select p.uid, p.name, p.avatar_url, p.settlement, p.trusted, p.created_at
  from public.profiles p
  where p.uid = p_uid
$$;

grant execute on function public.get_public_profile(uuid) to anon, authenticated;
