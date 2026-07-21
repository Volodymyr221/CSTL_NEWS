-- supabase_identity_sync.sql
-- Синхронізація ІДЕНТИЧНОСТІ (ім'я + телефон) з профілю на СТАРІ денормалізовані
-- копії. Мета (Вова 21.07): у міні-соцмережі ім'я/телефон — атрибути АКАУНТУ,
-- а не вморожені копії в кожному записі. Змінив у кабінеті → оновилось скрізь.
--
-- ── Контекст ──────────────────────────────────────────────────────────────────
-- Ім'я денормалізоване в кількох таблицях (копія тексту на момент запису):
--   posts.author      (owner_uid) — оголошення + теми обговорень
--   posts.contact     (owner_uid) — телефон в оголошенні
--   comments.author   (sender_uid) — репліки обговорень
--   threads.author_name / buyer_name (author_uid / buyer_uid) — приватний чат
-- Ім'я + аватар вже підтягуються ЖИВИМИ на клієнті (RPC get_avatars + hydrateNames)
-- — це миттєвий показ. Цей скрипт наводить лад і в САМІЙ БД (перманентно) + робить
-- ЄДИНО можливу приватну синхронізацію ТЕЛЕФОНУ (його не можна віддавати публічним
-- RPC — злило б номери тих, хто ввів телефон у кабінеті, але не публікував оголошення).
--
-- ⚠️ ДОПУЩЕННЯ по телефону: `posts.contact` = телефон автора (так з Д-24 — поле
--    автозаповнюється з profile.phone і маскується). Якщо десь у contact лежить
--    ЧУЖИЙ/інший номер під конкретне оголошення — тригер його перепише на профільний.
--    Вова: підтвердь що contact завжди = твій номер (інакше звузимо умову).
--
-- Приватність: чіпає ЛИШЕ власні рядки автора (owner_uid/sender_uid/author_uid =
--    той, хто змінив профіль). Нічого чужого.
--
-- Ідемпотентно: create or replace + drop trigger if exists. Виконати в Supabase → SQL Editor.

-- ── 1. Функція-пропагатор: профіль змінився → оновити власні денормалізовані копії ──
create or replace function public.sync_profile_denorm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Тільки коли реально змінилось ім'я або телефон (не на кожен save профілю).
  if new.name is distinct from old.name then
    update public.posts    set author = new.name where owner_uid  = new.uid and author is distinct from new.name;
    update public.comments set author = new.name where sender_uid = new.uid and author is distinct from new.name;
    update public.threads  set author_name = new.name where author_uid = new.uid and author_name is distinct from new.name;
    update public.threads  set buyer_name  = new.name where buyer_uid  = new.uid and buyer_name  is distinct from new.name;
  end if;

  if new.phone is distinct from old.phone then
    -- Оновлюємо контакт лише в оголошеннях автора, де контакт непорожній
    -- (тобто автор публікував номер). Порожній контакт не чіпаємо.
    update public.posts set contact = new.phone
      where owner_uid = new.uid and contact is not null and contact <> ''
        and contact is distinct from new.phone;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_profile_denorm on public.profiles;
create trigger trg_sync_profile_denorm
  after update on public.profiles
  for each row
  execute function public.sync_profile_denorm();

-- ── 2. Разова доливка (backfill) існуючих рядків під ПОТОЧНИЙ профіль ──────────────
-- Виправляє все, що написане ДО створення тригера (старі оголошення/репліки з
-- вмороженим старим іменем/номером).
update public.posts p
  set author = pr.name
  from public.profiles pr
  where p.owner_uid = pr.uid and p.author is distinct from pr.name;

update public.comments c
  set author = pr.name
  from public.profiles pr
  where c.sender_uid = pr.uid and c.author is distinct from pr.name;

update public.threads t
  set author_name = pr.name
  from public.profiles pr
  where t.author_uid = pr.uid and t.author_name is distinct from pr.name;

update public.threads t
  set buyer_name = pr.name
  from public.profiles pr
  where t.buyer_uid = pr.uid and t.buyer_name is distinct from pr.name;

-- Телефон: доливаємо лише де контакт непорожній (автор публікував номер).
update public.posts p
  set contact = pr.phone
  from public.profiles pr
  where p.owner_uid = pr.uid and p.contact is not null and p.contact <> ''
    and p.contact is distinct from pr.phone;
