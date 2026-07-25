-- scripts/supabase_comment_cascade.sql
-- Каскадне видалення гілки коментарів (правило Вови, 25.07).
--
-- ПРАВИЛО ДОСЛІВНО:
--   «Якщо видаляється головний коментар, а йому відповідало там 10 користувачів, то має
--    видалитися вся сітка. Якщо видалилось повідомлення, яке йому відповідало, то пропадає
--    тільки це повідомлення. Це одна система, це одна сітка, одна підструктура.»
--
-- 🔑 ЧОМУ ТРИГЕР, А НЕ КОД У ЗАСТОСУНКУ
--   1) Видалити коментар можуть трьома різними шляхами: автор із застосунку, адмін
--      сторінки, або руками через SQL. Правило «одна сітка» має діяти в УСІХ трьох —
--      у клієнті довелося б дублювати його в кожному місці й памʼятати про це завжди.
--   2) RLS не дала б клієнту видалити ЧУЖІ відповіді: політика `pcom update` пускає лише
--      на свої рядки. Автор кореневого коментаря не має права чіпати чужі відповіді —
--      і не повинен мати. Тригер (security definer) робить це від імені бази.
--
-- 🔑 ЧОМУ НЕ `on delete cascade` НА КОЛОНЦІ parent_id
--   Він там уже стоїть, але спрацьовує лише на СПРАВЖНЄ видалення рядка. У нас видалення
--   мʼяке (проставляється `deleted_at`, рядок лишається) — саме щоб нічого не губилось
--   безповоротно. Тому каскад мʼякого видалення треба зробити окремо, ось цим тригером.
--
-- Ідемпотентно: можна виконувати повторно.

create or replace function public.cascade_soft_delete_replies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Лише МОМЕНТ видалення (було живе → стало видалене). Просте редагування тексту
  -- гілку не чіпає, інакше кожна правка друкарської помилки зносила б відповіді.
  if new.deleted_at is not null and old.deleted_at is null then
    update public.page_comments
       set deleted_at = new.deleted_at
     where parent_id = new.id
       and deleted_at is null;   -- вже видалені не чіпаємо: це і зупиняє рекурсію
  end if;
  return new;
end;
$$;

-- AFTER UPDATE: тригер спрацьовує і на власні оновлення (відповіді теж проходять через
-- нього), але кожен наступний виток шукає дітей глибшого рівня, а `deleted_at is null`
-- відсікає вже оброблені — тож ланцюжок гарантовано завершується.
drop trigger if exists trg_cascade_soft_delete_replies on public.page_comments;
create trigger trg_cascade_soft_delete_replies
  after update on public.page_comments
  for each row execute function public.cascade_soft_delete_replies();

-- ── Прибирання за старим правилом ───────────────────────────────────────────
-- До сьогодні діяло протилежне: відповідь на видалений коментар лишалась жити і
-- виринала у стрічці як самостійний коментар. Такі «сироти» вже є в базі — приводимо
-- їх до нового правила (їхнього батька видалено, отже й вони мають зникнути).
update public.page_comments c
   set deleted_at = p.deleted_at
  from public.page_comments p
 where c.parent_id = p.id
   and p.deleted_at is not null
   and c.deleted_at is null;

-- ── Перевірка ───────────────────────────────────────────────────────────────
--   select count(*) from page_comments c join page_comments p on p.id = c.parent_id
--    where p.deleted_at is not null and c.deleted_at is null;   -- має бути 0
--   select tgname from pg_trigger where tgname = 'trg_cascade_soft_delete_replies';
