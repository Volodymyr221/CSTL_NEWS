-- ============================================================================
-- СТОРОЖ АВТОРСТВА — ім'я підписує СЕРВЕР, а не клієнт (09.08.2026)
-- ============================================================================
--
-- 🔴 ПРИВІД — доведено живою пробою, не міркуванням. Регрес
--    `scripts/security_regression.sql` від імені звичайного залогіненого
--    користувача вставив:
--      • коментар із підписом `ПІДРОБКА · Адміністрація`
--      • допис в Обговорення від `ПІДРОБКА · Сільрада`, одразу `status='published'`
--    База прийняла обидва. Транзакцію відкочено, у базі нічого не лишилось.
--
-- 🔑 ЧОМУ RLS ЦЬОГО НЕ ЛОВИЛА. Політики звіряють `owner_uid` / `sender_uid` з
--    `auth.uid()` — і роблять це правильно. Але поруч лежать ДЕНОРМАЛІЗОВАНІ
--    колонки з іменем, які політика не згадує взагалі, а PostgREST дозволяє
--    прислати будь-яке поле. Тобто «хто вставив» перевірено, «як підписано» — ні.
--    ➡️ Урок ширший за цей файл: RLS перевіряє РЯДОК ЦІЛКОМ або нічого. Скрізь,
--       де поруч із перевіреним uid лежить неперевірене ім'я, потрібен тригер.
--
-- 🔑 ЧОМУ НЕ ВИСТАЧАЛО `sync_profile_denorm`. Та функція переписує ім'я лише
--    коли ЛЮДИНА змінює його у своєму профілі (AFTER UPDATE ON profiles).
--    На вставку чужого підпису вона не реагує ніяк.
--
-- 🛑 ЧОМУ НЕ ЛІКУВАТИ ЦЕ В КЛІЄНТІ. Підробка йде ПОВЗ застосунок — прямим
--    запитом до PostgREST з тим самим публічним ключем. Прибрати поле з
--    `src/core/supabase.js` означало б лише сховати кнопку, а не замкнути двері.
--
-- ЩО РОБИТЬ: перед вставкою і оновленням підставляє ім'я з `profiles` за тим
--   uid, який РЛС уже звірила з `auth.uid()`. Чотири таблиці, один тригер.
--
-- ⚠️ ЛЕГАСІ НЕ ЧІПАЄМО. У базі 18 оголошень і 40 коментарів з `uid = null`
--   (анонімна доба до 01.08). Для них профілю не існує — тригер лишає підпис
--   як є. Без цієї умови вони втратили б автора при першому ж редагуванні.
--
-- ⚠️ ПОРОЖНЄ ІМ'Я — ТЕЖ ОБХІД. Якби ми писали «підставляй, лише якщо в профілі
--   щось є», зловмиснику вистачило б очистити своє ім'я у профілі — і підпис
--   з клієнта пройшов би. Тому порожнє ім'я дає `Житель`, а не пропуск правила.
--
-- ⚠️ ПОРЯДОК ТРИГЕРІВ: Postgres виконує BEFORE-тригери за абеткою імені.
--   `trg_comments_antispam` < `trg_enforce_identity` — антиспам відпрацює
--   першим. Це не заважає: він дивиться на текст, ми на підпис.
--
-- Ідемпотентно (`create or replace` + `drop trigger if exists`).
-- ============================================================================

create or replace function public.enforce_denorm_identity()
returns trigger
language plpgsql
security definer                 -- треба читати ЧУЖИЙ профіль (ім'я співрозмовника),
set search_path = public         -- а RLS на profiles пускає лише до свого рядка
as $$
declare
  v_name text;
begin
  -- Ім'я людини за uid. Порожнє або відсутнє → «Житель» (див. блок вище).
  -- uid = null → повертаємо null і НЕ чіпаємо колонку (легасі).
  if tg_table_name = 'posts' then
    if new.owner_uid is not null then
      select coalesce(nullif(trim(p.name), ''), 'Житель') into v_name
        from profiles p where p.uid = new.owner_uid;
      new.author := coalesce(v_name, 'Житель');
    end if;

  elsif tg_table_name = 'comments' then
    if new.sender_uid is not null then
      select coalesce(nullif(trim(p.name), ''), 'Житель') into v_name
        from profiles p where p.uid = new.sender_uid;
      new.author := coalesce(v_name, 'Житель');
    end if;

  elsif tg_table_name = 'threads' then
    if new.author_uid is not null then
      select coalesce(nullif(trim(p.name), ''), 'Житель') into v_name
        from profiles p where p.uid = new.author_uid;
      new.author_name := coalesce(v_name, 'Житель');
    end if;
    if new.buyer_uid is not null then
      select coalesce(nullif(trim(p.name), ''), 'Житель') into v_name
        from profiles p where p.uid = new.buyer_uid;
      new.buyer_name := coalesce(v_name, 'Житель');
    end if;

  elsif tg_table_name = 'chat_group_members' then
    if new.uid is not null then
      select coalesce(nullif(trim(p.name), ''), 'Житель') into v_name
        from profiles p where p.uid = new.uid;
      new.name := coalesce(v_name, 'Житель');
    end if;
  end if;

  return new;
end $$;

comment on function public.enforce_denorm_identity() is
  'Підпис автора бере сервер із profiles, а не клієнт. Привід: підробка імені через PostgREST повз застосунок (09.08.2026).';

-- Вішаємо на INSERT і на UPDATE. UPDATE обов'язковий: інакше лишався б обхід
-- «вставив чесно → одразу перейменував себе окремим запитом».
drop trigger if exists trg_enforce_identity on public.posts;
create trigger trg_enforce_identity
  before insert or update on public.posts
  for each row execute function public.enforce_denorm_identity();

drop trigger if exists trg_enforce_identity on public.comments;
create trigger trg_enforce_identity
  before insert or update on public.comments
  for each row execute function public.enforce_denorm_identity();

drop trigger if exists trg_enforce_identity on public.threads;
create trigger trg_enforce_identity
  before insert or update on public.threads
  for each row execute function public.enforce_denorm_identity();

drop trigger if exists trg_enforce_identity on public.chat_group_members;
create trigger trg_enforce_identity
  before insert or update on public.chat_group_members
  for each row execute function public.enforce_denorm_identity();
