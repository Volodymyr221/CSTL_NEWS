-- scripts/supabase_post_contact.sql
-- ПОТІК 2, КРОК 10 (09.08.2026) — ТЕЛЕФОН З ОГОЛОШЕННЯ ВИДАЄТЬСЯ ПО ЗАПИТУ.
--
-- ⛔ СТАТУС ЧАСТИНИ А: НЕ НАКАТАНО (накат у прод із сесії блокує сторож дозволів
--    середовища; читання дозволене). Накотити має Вова через Supabase SQL Editor.
--
-- ── ПРОБЛЕМА (заміряно на живій базі, роль `anon`, 09.08) ───────────────────
-- Клієнт читає Дошку через `select('*')`, тобто колонка `contact` приїжджає
-- в кожній вибірці — **4 телефони з 11 опублікованих оголошень качаються всім**,
-- включно з незалогіненим. Достатньо публічного ключа з `bundle.js`, щоб зібрати
-- їх усі одним запитом, не відкриваючи жодного оголошення.
--
-- 🔴 РОЗБИТО НА ДВІ ЧАСТИНИ НАВМИСНО — щоб не було вікна, коли застосунок уже
-- не бачить телефон, а взяти його ще нема звідки. Порядок обовʼязковий:
--   А (цей файл, зараз) — RPC + журнал. Адитивно, НІЧОГО не ламає: колонка поки
--     що приходить як раніше, застосунок працює і до, і після накату.
--   Б (окремим кроком, після смоуку А) — вітрина `posts_public` без `contact`
--     і зняття публічної політики читання `posts`.
-- ⚠️ Б не накочувати, доки клієнт із кнопкою «Показати номер» не побуває на
-- проді: інакше номер зникне з інтерфейсу раніше, ніж зʼявиться спосіб його
-- попросити.
--
-- 🔑 ЩО ВЖЕ ЗʼЯСОВАНО ПРО ЧАСТИНУ Б (щоб наступна сесія не наступила):
-- вибірка розмов (`src/core/supabase.js`, `threads`) тягне пост вкладено:
--   .select('*, post:posts(id, title, …, contact, …)')
-- Після зняття політики «Public can read published posts» лишаються тільки
-- «Owner reads own posts» і «Admins can see all posts» — тобто ПОКУПЕЦЬ у
-- розмові перестане бачити оголошення, про яке пише. Це видимий регрес списку
-- розмов, і його треба закрити ОКРЕМО (політика для учасника розмови або
-- вкладене читання через вітрину). Не «просто зняти політику».

-- ── ЧАСТИНА А ───────────────────────────────────────────────────────────────

-- Журнал переглядів. Потрібен не для статистики, а як підстава рейт-ліміту:
-- без нього «по запиту» означало б лише зайвий тап, а вигребти всі номери
-- скриптом можна було б так само вільно.
create table if not exists public.post_contact_views (
  id         bigserial primary key,
  post_id    bigint not null references public.posts(id) on delete cascade,
  viewer_uid uuid   not null,
  created_at timestamptz not null default now()
);

alter table public.post_contact_views enable row level security;

-- Читає лише адмін. Політики на INSERT немає свідомо: пише сам SECURITY DEFINER,
-- тобто повз RLS — клієнт не має жодної дороги підробити чи почистити журнал.
drop policy if exists "pcv admin read" on public.post_contact_views;
create policy "pcv admin read" on public.post_contact_views
  for select using (is_admin());

create index if not exists post_contact_views_viewer_idx
  on public.post_contact_views (viewer_uid, created_at desc);

-- ⚠️ `posts.id` — **bigint**, а не uuid (звірено запитом до information_schema;
-- перша редакція цього файлу мала uuid і не накотилася б).
create or replace function public.get_post_contact(p_post_id bigint)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_contact text;
  v_status  text;
begin
  -- Гість номера не отримує взагалі: це і є суть кроку.
  if auth.uid() is null then
    raise exception 'contact_auth';
  end if;

  -- 30 номерів за годину. Людині вистачає з великим запасом (у Дошці всього
  -- 11 оголошень), а вигрібання скриптом стає безглуздим.
  if (select count(*) from public.post_contact_views
      where viewer_uid = auth.uid()
        and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'contact_flood';
  end if;

  select contact, status into v_contact, v_status
  from public.posts where id = p_post_id;

  -- Одна відповідь і на «немає такого», і на «не опубліковане»: інакше різниця
  -- у помилках сама розповідала б, які приховані оголошення існують.
  if v_status is distinct from 'published' then
    raise exception 'contact_no_post';
  end if;

  v_contact := nullif(btrim(coalesce(v_contact, '')), '');
  if v_contact is null then
    return null;          -- телефон не вказаний — не помилка, просто немає
  end if;

  insert into public.post_contact_views (post_id, viewer_uid)
  values (p_post_id, auth.uid());

  return v_contact;
end;
$function$;

-- Машинні коди помилок (`contact_auth` / `contact_flood` / `contact_no_post`) —
-- той самий підхід, що в `ad_reports`: база не вирішує, якою мовою говорити з
-- людиною, людський текст живе в `src/core/supabase.js`.
revoke all on function public.get_post_contact(bigint) from public;
revoke all on function public.get_post_contact(bigint) from anon;
grant execute on function public.get_post_contact(bigint) to authenticated;

-- ── ПЕРЕВІРКА ПІСЛЯ НАКАТУ ЧАСТИНИ А ────────────────────────────────────────
-- 1) Гість не отримує номер:
--      set local role anon;
--      select public.get_post_contact(<id опублікованого>);   -- очікуємо contact_auth
-- 2) Залогінений отримує і слід лишається в журналі:
--      set local role authenticated;
--      set local request.jwt.claims = '{"sub":"<реальний uid>","role":"authenticated"}';
--      select public.get_post_contact(<той самий id>);        -- очікуємо номер
--      -- журнал читається лише адміном, тому перевіряти його окремо, від postgres
-- 3) Неопубліковане не віддається:
--      select public.get_post_contact(<id зі status <> 'published'>);  -- contact_no_post


-- ═══════════════════════════════════════════════════════════════════════════
-- ЧАСТИНА Б — ЗАКРИТИ САМУ КОЛОНКУ. ⛔ НЕ НАКОЧУВАТИ РАЗОМ ІЗ ЧАСТИНОЮ А.
-- ═══════════════════════════════════════════════════════════════════════════
-- Умова накату: частина А на проді І клієнт із кнопкою «Показати номер»
-- задеплоєний і перевірений живцем. Інакше номер зникне з екрана раніше, ніж
-- зʼявиться спосіб його попросити.
--
-- 🔑 ЧОМУ ВІТРИНА, А НЕ «ПРОСТО ЗАБРАТИ ПРАВО НА КОЛОНКУ». Колонковий REVOKE діє
-- на РОЛЬ цілком, тобто відрізав би `contact` і власнику оголошення — а він
-- підставляється у форму при редагуванні. Людина відкрила б своє оголошення і
-- побачила порожнє поле телефону.
--
-- 🔴 ПАСТКА, ЯКУ ТРЕБА ЗАКРИТИ ТИМ САМИМ КРОКОМ (знайдено читанням коду, не
-- здогадкою). Список розмов тягне оголошення вкладено:
--     .select('*, post:posts(id, title, …, contact, …)')   ← src/core/supabase.js
-- Знявши «Public can read published posts», ми лишаємо тільки «Owner reads own
-- posts» і «Admins can see all posts» — тобто ПОКУПЕЦЬ перестав би бачити
-- оголошення, про яке він же й листується. Тому нижче додається політика для
-- учасника розмови. Вона свідомо віддає йому і `contact`: людина вже в розмові
-- саме про це оголошення, це не масове вигрібання номерів.

/*  -- зняти коментар, коли умова накату виконана

create or replace view public.posts_public as
  select
    p.id, p.type, p.category, p.title, p.text, p.price, p.color, p.location,
    p.photos, p.author, p.owner_uid, p.status, p.published_at, p.created_at,
    p.bumped_at,
    -- ⚠️ ЧИ Є номер, а не сам номер. Без цього поля клієнт не міг би відрізнити
    -- «телефон є, попроси» від «телефону немає взагалі» — і кнопка «Показати
    -- номер» висіла б на оголошеннях, де за нею порожнеча.
    (nullif(btrim(coalesce(p.contact, '')), '') is not null) as has_contact
  from public.posts p
  where p.status = 'published';

comment on view public.posts_public is
  'Вітрина Дошки без колонки contact. Свідомо обходить RLS (крок 10Б потоку 2):
   сама таблиця posts більше не читається публічно, бо RLS ховає рядки, а не
   колонки — той самий розкрій, що ads → ads_public у потоці 1.';

grant select on public.posts_public to anon, authenticated;

-- Учасник розмови бачить оголошення, про яке листується (інакше список розмов
-- показував би порожні картки — див. пастку вище).
drop policy if exists "Thread party reads its post" on public.posts;
create policy "Thread party reads its post" on public.posts
  for select using (
    exists (
      select 1 from public.threads t
      where t.post_id = posts.id
        and (t.author_uid = auth.uid() or t.buyer_uid = auth.uid())
    )
  );

-- І лише тепер — прибрати публічне читання таблиці.
drop policy if exists "Public can read published posts" on public.posts;

*/

-- ── ПЕРЕВІРКА ПІСЛЯ НАКАТУ ЧАСТИНИ Б ────────────────────────────────────────
--   set local role anon;
--   select count(*) from public.posts;              -- очікуємо 0
--   select count(*), count(*) filter (where has_contact) from public.posts_public;
--                                                   -- очікуємо 11 і 4
-- 🛑 І ОБОВʼЯЗКОВО живцем на телефоні: відкрити список розмов з акаунта
-- ПОКУПЦЯ (не власника оголошення) — назва оголошення має лишитись на місці.
