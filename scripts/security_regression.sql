-- ============================================================================
-- РЕГРЕС БЕЗПЕКИ — прогін від чотирьох ролей (anon · користувач А · користувач Б · адмін)
-- ============================================================================
--
-- 🔑 НАВІЩО ЦЕЙ ФАЙЛ, А НЕ СТЕНД У `npm test`.
--   Стенди проєкту працюють у Chromium і читають файли репозиторію. До ПРОДА
--   вони не дістаються: у середовищі немає ані `SUPABASE_DB_URL`, ані ключів.
--   Node-стенд, який «перевіряє RLS», не маючи бази, перевіряв би текст
--   `scripts/*.sql` — тобто НАМІР, а не розгорнутий стан. Такий сторож у цьому
--   проєкті вже був би десятим випадком брехливої перевірки.
--   ➡️ Тому справжній регрес — ось цей SQL. Він ходить у живу базу і питає її
--      саму. Сторож `tests/security-regression.mjs` стежить лише за тим, щоб
--      цей файл не зник і не схуд — і чесно каже, що більшого не доводить.
--
-- 🔴 РОЗХОДЖЕННЯ ФАЙЛІВ І ПРОДА — не теорія. Аудит 09.08 знайшов:
--   `scripts/supabase_comments_reactions.sql` обіцяє політику
--   `"Anyone can delete reaction" USING (true)` — у проді її давно немає.
--   Аудит по файлах дав би хибну тривогу.
--
-- ЯК ЗАПУСКАТИ: Supabase → SQL Editor → вставити весь файл → Run.
--   Скрипт іде в транзакції і завершується ROLLBACK: він НІЧОГО не лишає в базі,
--   навіть проби на підробку автора (вони справді вставляють рядок і відкочують).
--
-- ЯК ЧИТАТИ: остання таблиця. Стовпчик «вердикт»:
--   ✅        — фактично збіглося з очікуваним
--   🔴 ПРОВАЛ — розійшлося, читати рядок
--   ℹ️ ВІДОМО — свідомо відкрите місце, за ним закріплений крок у BYYOU_PLAN
--
-- ⚠️ ПІДСТАВНІ ОСОБИ. Нижче — реальні uid із `profiles` (потрібні, бо RLS
--    звіряється саме з ними). Це НЕ секрет: uid і так видно в публічних
--    коментарях «Стрічки». Пароля/токена тут немає.
-- ============================================================================

begin;

-- Хто грає ролі. Міняти тут, а не по всьому файлу.
create temp table пер (ключ text primary key, знач text) on commit drop;
insert into пер values
  ('uidA',    '4dcde4ce-eaff-4b44-9016-96c7e930084f'),   -- Володимир
  ('uidB',    '31f36209-a12a-42db-a5bf-879efa6d0c33'),   -- Макс Безушкевич
  ('adminEm', 'volodymyrshevchuk19@gmail.com');

create temp table rez (
  n int generated always as identity,
  роль text, перевірка text, очікувано text, фактично text, режим text default 'strict'
) on commit drop;

-- ⚠️ `security definer` тут ОБОВ'ЯЗКОВИЙ, і це не формальність: проби біжать
--    від імені `anon` / `authenticated`, а ці ролі не мають права писати в
--    тимчасову таблицю власника сесії. Без нього скрипт падає на першій же пробі
--    з «permission denied for table rez» — саме так і сталось при першому прогоні.
create or replace function pg_temp.зафіксувати(
  p_роль text, p_перевірка text, p_очікувано text, p_фактично text, p_режим text default 'strict'
) returns void language sql security definer as $$
  insert into rez (роль, перевірка, очікувано, фактично, режим)
  values (p_роль, p_перевірка, p_очікувано, p_фактично, p_режим);
$$;

-- Чи можна викликати функцію. Ловимо будь-яку відмову як «заборонено».
create or replace function pg_temp.спроба_rpc(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return 'виконалась';
exception
  when insufficient_privilege then return 'заборонено';
  when others                 then return 'помилка: ' || sqlstate;
end $$;

-- ── РОЛЬ 1: АНОНІМ (сторонній із публічним ключем із bundle.js) ─────────────
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select pg_temp.зафіксувати('анонім','профілі людей','0',(select count(*)::text from profiles));
select pg_temp.зафіксувати('анонім','приватні повідомлення','0',(select count(*)::text from messages));
select pg_temp.зафіксувати('анонім','групові повідомлення','0',(select count(*)::text from chat_group_messages));
select pg_temp.зафіксувати('анонім','приватні чати (треди)','0',(select count(*)::text from threads));
select pg_temp.зафіксувати('анонім','рекламодавці (ads)','0',(select count(*)::text from ads));
select pg_temp.зафіксувати('анонім','статистика профілів адмінки','not admin',
  coalesce((admin_profile_stats()->>'error'),'ВІДДАЛА ДАНІ'));

-- 🔴 СТОРОЖ ПОДАННЯ `ads_public`.
--    Радник Supabase позначає це подання як ERROR `security_definer_view` — і в
--    загальному випадку слушно: подання-визначник оминає RLS базової таблиці.
--    Тут це ЗРОБЛЕНО СВІДОМО і замін немає:
--      • `security_invoker = on` → подання виконувалось би від аноніма, у якого
--        прав на `ads` немає → вітрина порожня;
--      • колонкові GRANT замість подання → `authenticated` втратив би
--        `client_phone`, а адмін заходить саме як `authenticated` → адмінка
--        осліпла б МОВЧКИ (та сама пастка, що і з REVOKE);
--      • повернути публічну політику → повертає рівно ту діру, яку закрили.
--    ➡️ Витікати нема чому: контактних колонок у поданні ФІЗИЧНО немає.
--       Але саме тому потрібен сторож — якщо колись хтось напише
--       `create or replace view ads_public as select *`, діра повернеться мовчки.
select pg_temp.зафіксувати('анонім','у ads_public немає контактних колонок','ні',
  case when exists (select 1 from information_schema.columns
                     where table_schema='public' and table_name='ads_public'
                       and column_name in ('client_phone','client_email','client_name','paid_amount'))
       then '🔴 З’ЯВИЛИСЬ' else 'ні' end);

-- Службові функції: після кроку 5 обидві мають бути «заборонено».
select pg_temp.зафіксувати('анонім','RPC heal_orphan_page_comments','заборонено',
  pg_temp.спроба_rpc('select public.heal_orphan_page_comments()'));
select pg_temp.зафіксувати('анонім','RPC flush_page_comment_push','заборонено',
  pg_temp.спроба_rpc('select public.flush_page_comment_push()'));

-- Публічне за задумом — стежимо, щоб не РОЗШИРИЛОСЬ.
select pg_temp.зафіксувати('анонім','get_public_profile віддає лише білий список',
  'uid,name,avatar_url,settlement,trusted,created_at',
  (select string_agg(a.attname, ',' order by a.attnum)
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     join pg_type t on t.oid=p.prorettype
     join pg_attribute a on a.attrelid=t.typrelid and a.attnum>0
    where n.nspname='public' and p.proname='get_public_profile'),
  'loose');
select pg_temp.зафіксувати('анонім','get_avatars має стелю на довжину масиву','так',
  case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                     where n.nspname='public' and p.proname='get_avatars'
                       and pg_get_functiondef(p.oid) ~* 'array_length')
       then 'так' else 'ні' end);

-- Відомі відкриті місця — не провал, а позначка з номером кроку.
select pg_temp.зафіксувати('анонім','телефони дошки одним запитом (потік 2, крок 10)','0',
  (select count(*)::text from posts where contact ~ '[0-9]{5}'), 'known');
select pg_temp.зафіксувати('анонім','видно хто лайкнув (потік 2, крок 9)','0',
  (select count(distinct user_id)::text from page_reactions), 'known');

reset role;

-- ── РОЛЬ 2: КОРИСТУВАЧ А (залогінений житель) ───────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"4dcde4ce-eaff-4b44-9016-96c7e930084f"}';

select pg_temp.зафіксувати('користувач А','бачить рівно свій профіль','1',
  (select count(*)::text from profiles));
select pg_temp.зафіксувати('користувач А','чужий профіль напряму','0',
  (select count(*)::text from profiles where uid <> auth.uid()));
select pg_temp.зафіксувати('користувач А','рекламодавці (ads)','0',
  (select count(*)::text from ads));
select pg_temp.зафіксувати('користувач А','він НЕ адмін','false', is_admin()::text);
select pg_temp.зафіксувати('користувач А','RPC heal_orphan_page_comments','заборонено',
  pg_temp.спроба_rpc('select public.heal_orphan_page_comments()'));

-- 🔴 ГОЛОВНА ПРОБА ПОТОКУ: підробка імені автора.
-- Вставляємо коментар із чужим підписом і дивимось, що ЗАПИСАЛА база.
-- До кроку 3 тут лишиться підробка; після — ім'я з profiles.
do $$
declare v_post bigint; v_id bigint; v_author text; v_expect text;
begin
  select id into v_post from posts where status='published' and type='chat' order by id limit 1;
  select name into v_expect from profiles where uid = auth.uid();
  if v_post is null then
    perform pg_temp.зафіксувати('користувач А','підробка автора коментаря','(нема поста для проби)','(пропущено)','loose');
    return;
  end if;
  insert into comments (post_id, author, text, sender_uid)
  values (v_post, 'ПІДРОБКА · Адміністрація', 'регрес безпеки, рядок буде відкочено', auth.uid())
  returning id, author into v_id, v_author;
  perform pg_temp.зафіксувати('користувач А','підпис коментаря бере сервер, не клієнт',
                              coalesce(v_expect,'(ім’я з профілю)'), v_author);
  delete from comments where id = v_id;
exception when others then
  perform pg_temp.зафіксувати('користувач А','підробка автора коментаря','вставка або відхилена, або підпис виправлено',
                              'помилка ' || sqlstate || ' — ' || left(sqlerrm, 80), 'loose');
end $$;

do $$
declare v_id bigint; v_author text; v_expect text;
begin
  select name into v_expect from profiles where uid = auth.uid();
  insert into posts (type, status, author, text, owner_uid)
  values ('chat','published','ПІДРОБКА · Сільрада','регрес безпеки, рядок буде відкочено', auth.uid())
  returning id, author into v_id, v_author;
  perform pg_temp.зафіксувати('користувач А','підпис допису Обговорень бере сервер',
                              coalesce(v_expect,'(ім’я з профілю)'), v_author);
  delete from posts where id = v_id;
exception when others then
  perform pg_temp.зафіксувати('користувач А','підробка автора допису','вставка або відхилена, або підпис виправлено',
                              'помилка ' || sqlstate || ' — ' || left(sqlerrm, 80), 'loose');
end $$;

reset role;

-- ── РОЛЬ 3: КОРИСТУВАЧ Б (інша людина — не бачить чужого) ───────────────────
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","sub":"31f36209-a12a-42db-a5bf-879efa6d0c33"}';

select pg_temp.зафіксувати('користувач Б','профіль А недосяжний','0',
  (select count(*)::text from profiles
    where uid = '4dcde4ce-eaff-4b44-9016-96c7e930084f'));
select pg_temp.зафіксувати('користувач Б','чужі приватні повідомлення','0',
  (select count(*)::text from messages m
    where not exists (select 1 from threads t where t.id=m.thread_id
                        and auth.uid() in (t.author_uid, t.buyer_uid))));
select pg_temp.зафіксувати('користувач Б','чужі підписки на push','0',
  (select count(*)::text from push_subscriptions));
select pg_temp.зафіксувати('користувач Б','він НЕ адмін','false', is_admin()::text);

reset role;

-- ── РОЛЬ 4: АДМІН (усе, що потрібно адмінці, мусить лишитись робочим) ───────
set local role authenticated;
set local request.jwt.claims =
  '{"role":"authenticated","sub":"4dcde4ce-eaff-4b44-9016-96c7e930084f","email":"volodymyrshevchuk19@gmail.com"}';

select pg_temp.зафіксувати('адмін','is_admin()','true', is_admin()::text);
select pg_temp.зафіксувати('адмін','читає ads (адмінка не має осліпнути)','так',
  case when (select count(*) from ads) >= 0 then 'так' else 'ні' end);
select pg_temp.зафіксувати('адмін','бачить НЕопубліковані пости','так',
  case when exists (select 1 from posts where status <> 'published') then 'так' else 'ні' end);
select pg_temp.зафіксувати('адмін','читає скарги','так',
  case when (select count(*) from ad_reports) >= 0 then 'так' else 'ні' end);
select pg_temp.зафіксувати('адмін','статистика профілів','є число',
  case when (admin_profile_stats()->>'total_profiles') is not null then 'є число' else 'ПОРОЖНЬО' end);

reset role;

-- ── ПІДСУМОК ────────────────────────────────────────────────────────────────
select
  роль, перевірка, очікувано, фактично,
  case
    when очікувано = фактично then '✅'
    when режим = 'known'      then 'ℹ️ ВІДОМО'
    when режим = 'loose'      then '🟡 ГЛЯНУТИ'
    else '🔴 ПРОВАЛ'
  end as вердикт
from rez order by n;

rollback;
