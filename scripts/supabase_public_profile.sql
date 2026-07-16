-- supabase_public_profile.sql
-- Картка профілю користувача (перегляд іншими) — тап по аватару відкриває картку.
--
-- ПРОБЛЕМА: RLS на profiles — «own read» (кожен бачить лише свій рядок). Тому
--   для показу картки ЧУЖОГО профілю потрібен вузький публічний доступ.
--
-- РІШЕННЯ: SECURITY DEFINER функція get_public_profile(uid) — віддає лише
--   несекретні поля картки: uid, name, avatar_url, settlement, trusted,
--   created_at, bio, age. НІКОЛИ не віддає phone / email / точну дату народження
--   (birth_date). Вік — ПОХІДНЕ число (повні роки), сама дата не розкривається.
--
-- БЕЗПЕКА: read-only. bio — текст, який користувач сам пише про себе для показу.
--   age — лише число (extract року з age(birth_date)), не дата. Виконує anon і
--   authenticated (гість теж бачить картку).
--
-- Ідемпотентно (create or replace). Застосувати в Supabase → SQL Editor.
-- Оновлення 15.07: додано bio + age (рішення Вови — доробка контенту картки).

create or replace function public.get_public_profile(p_uid uuid)
returns table (
  uid        uuid,
  name       text,
  avatar_url text,
  settlement text,
  trusted    boolean,
  created_at timestamptz,
  bio        text,
  age        int
)
language sql
security definer
set search_path = public
stable
as $$
  select p.uid, p.name, p.avatar_url, p.settlement, p.trusted, p.created_at,
         p.bio,
         case when p.birth_date is not null
              then extract(year from age(p.birth_date))::int
         end as age
  from public.profiles p
  where p.uid = p_uid
$$;

grant execute on function public.get_public_profile(uuid) to anon, authenticated;
