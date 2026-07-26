-- supabase_comment_counts_reachable.sql
-- ✅ НАКАТАНО 26.07.2026 через MCP. Дві міграції + ремонт даних:
--    1) forbid_reply_under_deleted_parent
--    2) page_comment_counts_only_reachable
--    3) ремонт: мʼяке видалення наявних «сиріт» (1 рядок — коментар 111 під постом 14)
--
-- ЩО ЛІКУЄМО (скарга Вови 26.07): «в самій картці поста біля іконки коментарів пише два
-- коментаря. Коли я натискаю, там зверху пише два коментарі, але коментар один».
--
-- КОРІНЬ (доведено живими даними, не здогад). Пост 14, два живі рядки:
--   68  «Приві»  — корінь, живий            → його й видно
--   111 «Так»    — відповідь на коментар 110, а 110 ВИДАЛЕНИЙ → недосяжна з екрана
-- Хронологія: 13:45:24 створено 110 → 13:45:41 видалено 110 → 13:45:48 створено 111.
-- Тобто відповідь пішла під коментар, якого вже 7 секунд не існувало (людина тримала
-- лист відкритим і натиснула «Відповісти» на щойно видаленому).
--
-- Чотири окремі причини розходження:
--   1. Подання рахувало ВСЕ живе: count(*) where deleted_at is null.
--   2. `fetchPostComments` спускається лише від ЖИВИХ коренів → сироту не покаже ніколи.
--   3. Жоден із 4 тригерів на page_comments не перевіряв, чи живий батько при INSERT.
--   4. Каскад «одна сітка» цього закрити НЕ МОЖЕ — він прибирає гілку на момент
--      видалення, про дітей, що народяться пізніше, він не знає.
--
-- ⚠️ Звірка лічильника з базою (PR #651, сесія E) була зроблена правильно, але марно:
-- вона синхронізувала клієнта з джерелом, яке саме брехало.

-- ── 1. ЗАБОРОНА СИРОТИ ──────────────────────────────────────────────────────────────
-- Правило додано в НАЯВНИЙ BEFORE INSERT тригер «Стрічки» (`page_comments_antispam`),
-- а не другим тригером на ту саму подію: саме через дві копії в проєкті вже розходились
-- списки слів (див. supabase_antispam_shared.sql). Спільний двигун text_abuse_reason
-- не чіпано. Повний текст функції — у міграції `forbid_reply_under_deleted_parent`;
-- доданий блок:
--
--   if NEW.parent_id is not null then
--     if not exists (select 1 from public.page_comments p
--                     where p.id = NEW.parent_id
--                       and p.deleted_at is null
--                       and p.post_id  = NEW.post_id) then
--       raise exception 'comment: parent_deleted (цей коментар уже видалено)'
--         using errcode = 'check_violation';
--     end if;
--   end if;
--
-- `p.post_id = NEW.post_id` — щоб батько був із ТОГО САМОГО поста: інакше коментар знову
-- виходив би недосяжним (рахувався б під одним постом, а гілка була б під іншим).
-- Маркер `parent_deleted` ловить клієнт (`netErrorText` у src/core/supabase.js) і показує
-- «Цей коментар уже видалено», а `addPageComment` віддає ще й прапорець `gone`, щоб
-- «Стрічка» перемалювала гілку — інакше людина далі дивиться на коментар, якого нема.

-- ── 2. ЛІЧИЛЬНИК РАХУЄ ЛИШЕ ДОСЯЖНЕ ─────────────────────────────────────────────────
-- Спускаємось від живих коренів униз по живих відповідях — рівно тим шляхом, яким лист
-- малює гілки. Що недосяжне з екрана — те й не рахується.
-- Це не лише лікування, а й запобіжник: пункт 1 закриває ВІДОМИЙ шлях появи розриву,
-- а це подання робить так, що НОВИЙ розрив (звідки б не взявся) не збреше числом.
-- security_invoker = on — обов'язково, інакше подання читало б таблицю правами власника
-- і обійшло б RLS (права доступу).
create or replace view public.page_comment_counts
with (security_invoker = on) as
with recursive reachable as (
  select c.id, c.post_id
    from public.page_comments c
   where c.deleted_at is null
     and c.parent_id is null
  union all
  select c.id, c.post_id
    from public.page_comments c
    join reachable r on c.parent_id = r.id
   where c.deleted_at is null
     and c.post_id = r.post_id
)
select post_id, count(*)::integer as n
  from reachable
 group by post_id;

-- ── 3. РЕМОНТ ДАНИХ ─────────────────────────────────────────────────────────────────
-- Живі, але недосяжні коментарі — мʼяко видалити (правило «одна сітка»).
-- Виконано 26.07: 1 рядок (id 111, пост 14). Ідемпотентно — можна ганяти повторно.
update public.page_comments t
   set deleted_at = now()
 where t.deleted_at is null
   and t.parent_id is not null
   and not exists (select 1 from public.page_comments p
                    where p.id = t.parent_id and p.deleted_at is null);

-- ── ПЕРЕВІРКА (можна ганяти будь-коли; має бути 0 розходжень і 0 сиріт) ─────────────
-- каже_лічильник  = нове подання
-- старе_число     = як рахувало ДО фіксу (усе живе)
-- за_логікою_екрана = скільки покаже лист (спуск від живих коренів)
with recursive reachable as (
  select c.id, c.post_id from public.page_comments c
   where c.deleted_at is null and c.parent_id is null
  union all
  select c.id, c.post_id from public.page_comments c
    join reachable r on c.parent_id = r.id
   where c.deleted_at is null and c.post_id = r.post_id
)
select v.post_id,
       v.n                                                          as каже_лічильник,
       (select count(*) from public.page_comments c
         where c.post_id = v.post_id and c.deleted_at is null)       as старе_число,
       (select count(*) from reachable x where x.post_id = v.post_id) as за_логікою_екрана,
       case when v.n = (select count(*) from reachable x where x.post_id = v.post_id)
            then 'збігається' else '🔴 РОЗХОДЖЕННЯ' end             as вердикт
  from public.page_comment_counts v
 order by v.post_id desc;
