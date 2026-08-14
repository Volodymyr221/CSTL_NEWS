-- scripts/supabase_delete_account.sql
-- ВИДАЛЕННЯ АКАУНТА САМОСТІЙНО (14.08.2026, потік /byyou «правова відповідність»)
-- ============================================================================
-- 🔴 НАВІЩО. Політика конфіденційності обіцяла право «вимагати видалення», а в
-- продукті кнопки не було взагалі — у кабінеті лише «Вийти». Формально право
-- реалізувалось через пошту, і це допустимо, але документ говорив у теперішньому
-- часі про механізм, якого немає. Ст. 8 ЗУ «Про захист персональних даних»
-- №2297-VI дає суб'єктові право на видалення; ця функція робить обіцянку правдою.
--
-- ⚠️ ЗАСТОСУВАТИ ВРУЧНУ (Supabase → SQL Editor → Run). Ідемпотентно:
-- `create or replace` + `drop policy if exists` — можна запускати повторно.
--
-- 🛑 ПЕРЕД НАКАТОМ ПЕРЕВІРИТИ НА ГІЛЦІ БАЗИ АБО ТЕСТОВОМУ АКАУНТІ. Функція
-- писалась за зліпком політик `scripts/RLS_SNAPSHOT.md` (13.08) — там названі
-- живі колонки, але не всі типи. Помилка в імені колонки впаде голосно (виняток),
-- а не тихо, і транзакція відкотиться цілком — але краще спіймати це на тесті.
--
-- ============================================================================
-- ЩО САМЕ РОБИТЬ — і чому не «видалити все, де є мій uid»
-- ============================================================================
--
-- Дані діляться на ТРИ купи, і поводитись з ними однаково не можна:
--
-- 1️⃣ МОЄ ОСОБИСТЕ → стирається насправді.
--    Профіль, оголошення, питання, коментарі, реакції, збережене, підписки на
--    сповіщення, відстеження автобусів, скарги, події статистики.
--
-- 2️⃣ ЗАПИСИ СПІЛЬНОТ («Стрічка») → лишаються сторінці, але без імені.
--    Пост на сторінці громади зроблений у ролі редактора сторінки, а не «мій
--    щоденник»: видалення забрало б у громади її ж хроніку. Схема це вже
--    передбачає — `page_posts.author_uid references profiles(uid) ON DELETE SET
--    NULL`, тобто підпис відв'язується САМ, щойно зникає профіль.
--
-- 3️⃣ 🔴 ПРИВАТНЕ ЛИСТУВАННЯ → двостороннє, тому не стирається.
--    Кожне повідомлення бачать ДВОЄ, і воно є даними обох. Стерти його означало б
--    вичистити чужу скриньку. Тому повідомлення лишаються, а підпис у списку
--    розмов міняється на «Видалений користувач».
--
--    ⚠️ ВИНЯТОК, ЯКИЙ ТРЕБА НАЗИВАТИ ЧЕСНО: розмова про ВАШЕ оголошення зникає
--    разом з оголошенням. Це не рішення цієї функції, а конструкція бази:
--    `threads.post_id references posts(id) ON DELETE CASCADE`. Тред про оголошення
--    без оголошення — розмова без предмета. Саме тому в Політиці написано
--    «листування про ваші оголошення видаляється разом з ними», а не загальне
--    «повідомлення лишаються» — інакше документ знову обіцяв би не те.
--
-- 🛑 ЧОГО ФУНКЦІЯ НЕ РОБИТЬ: не чіпає фото в приватних чатах (`chat-photos`).
--    Вони — така сама частина двосторонньої розмови, як і текст; прибрати їх
--    означало б лишити в чужій скриньці дірки замість картинок.
--
-- ============================================================================

-- ── 1. Сама функція ─────────────────────────────────────────────────────────
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
-- 🔑 `set search_path` — не косметика: без нього власник схеми може підсунути
-- свою таблицю з тим самим іменем і функція під правами postgres виконає її.
-- Це той самий захист, що вже стоїть на решті SECURITY DEFINER у проєкті.
set search_path = public, auth, storage
as $$
declare
  v_uid   uuid := auth.uid();
  v_paths text[];
begin
  -- Гість сюди дійти не може навіть теоретично: RPC викликається лише з кабінету,
  -- а кабінет відкривається залогіненим. Але SECURITY DEFINER працює під правами
  -- postgres, тож перевірка мусить бути ВСЕРЕДИНІ функції — рівно той урок, що
  -- дав `submit_board_post` (закриття політики на таблиці було б косметикою).
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  -- ── 1.1 Файли в публічному сховищі: аватар + фото своїх оголошень ─────────
  -- Шлях об'єкта дістаємо з публічної адреси: усе після '/community-photos/'.
  -- Тека завантаження будується від анонімного id пристрою, а не від uid, тож
  -- «видалити теку користувача» неможливо — тільки за посиланнями з його рядків.
  select coalesce(array_agg(p), '{}')
    into v_paths
    from (
      select split_part(avatar_url, '/community-photos/', 2) as p
        from public.profiles
       where uid = v_uid and avatar_url is not null
      union all
      select split_part(ph, '/community-photos/', 2)
        from public.posts, unnest(coalesce(photos, '{}'::text[])) as ph
       where owner_uid = v_uid
    ) s
   where p is not null and p <> '';

  if array_length(v_paths, 1) is not null then
    delete from storage.objects
     where bucket_id = 'community-photos' and name = any(v_paths);
  end if;

  -- ── 1.2 Приватне листування: підпис замість імені ─────────────────────────
  -- Імена в `threads` денормалізовані навмисно (RLS профілю приватний, співрозмовник
  -- не прочитав би ім'я запитом). Тому саме тут і треба міняти підпис — живого
  -- профілю після видалення не лишиться, і підставляти не буде звідки.
  update public.threads set author_name = 'Видалений користувач' where author_uid = v_uid;
  update public.threads set buyer_name  = 'Видалений користувач' where buyer_uid  = v_uid;

  -- ── 1.3 Особисте — стираємо ───────────────────────────────────────────────
  -- Порядок має значення лише в одному місці: `posts` мусять піти ПІСЛЯ всього,
  -- що на них посилається без каскаду, і ДО `auth.users` (там FK без каскаду).
  delete from public.saved_posts            where uid          = v_uid;
  delete from public.reactions              where user_id      = v_uid::text;
  delete from public.page_reactions         where user_id      = v_uid::text;
  delete from public.page_comment_reactions where user_id      = v_uid::text;
  delete from public.page_subscriptions     where uid          = v_uid;
  delete from public.push_subscriptions     where user_uuid    = v_uid::text;
  delete from public.user_push_devices      where uid          = v_uid;
  delete from public.thread_user_state      where uid          = v_uid;
  delete from public.ad_reports             where reporter_uid = v_uid;
  delete from public.post_contact_views     where viewer_uid   = v_uid;
  delete from public.analytics_events       where visitor_id   = v_uid::text;

  -- Коментарі Дошки й відповіді в «Питаннях» — це репліки самої людини, їх
  -- Політика обіцяє стерти. Осиротілі вкладені відповіді інших людей лишаються
  -- видимими коренем (у списку відповідей вони малюються рівно двома рівнями).
  delete from public.comments where sender_uid = v_uid;

  -- Коментарі «Стрічки» — м'яке видалення, як робить сам застосунок: у них є
  -- гілки відповідей і тригер каскаду, який ці гілки закриє тим самим правилом.
  update public.page_comments
     set deleted_at = now()
   where author_uid = v_uid and deleted_at is null;

  -- Оголошення й питання. 🔴 Каскадом за ними підуть `comments` під ними,
  -- `threads` про них і `messages` у цих тредах — див. шапку файлу.
  delete from public.posts where owner_uid = v_uid;

  -- Права редактора (якщо були) — інакше видалений акаунт лишив би за собою роль.
  delete from public.editor_users where uid = v_uid;

  -- Профіль. Саме тут спрацьовує `ON DELETE SET NULL` на `page_posts.author_uid`
  -- і `page_comments.author_uid`: записи спільнот лишаються, підпис відв'язується.
  delete from public.profiles where uid = v_uid;

  -- ── 1.4 Сам обліковий запис ───────────────────────────────────────────────
  -- Без цього рядка людина «видалила все», але наступний вхід через Google привів
  -- би її в ТОЙ САМИЙ порожній акаунт — тобто акаунт не видалено, а спустошено.
  delete from auth.users where id = v_uid;
end;
$$;

-- Викликати може лише залогінений. `anon` не додаємо свідомо: гостю нічого
-- видаляти, а зайвий grant — це зайва поверхня.
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- ── 2. Перевірка після накату (виконати ОКРЕМО, під тестовим акаунтом) ───────
-- select public.delete_my_account();
-- Очікується: порожня відповідь, а далі —
--   select count(*) from public.profiles where uid = '<uid>';        -- 0
--   select author_name, buyer_name from public.threads where id = N; -- «Видалений користувач»
--   select count(*) from public.messages where thread_id = N;        -- НЕ 0 (листування ціле)
