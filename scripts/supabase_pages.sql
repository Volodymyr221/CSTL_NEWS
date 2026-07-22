-- ============================================================================
-- CSTL LIFE — «СТРІЧКА»: сторінки-канали громади (ЕТАП 1 — база даних)
-- ============================================================================
-- Запустити у Supabase → SQL Editor → New query → Run.
-- ⚠️ ІДЕМПОТЕНТНИЙ і НЕ руйнівний: повторний запуск НЕ видаляє дані
--    (CREATE TABLE IF NOT EXISTS + DROP POLICY IF EXISTS → CREATE).
--
-- Модель (мінісоцмережа-стрічка):
--   pages              — сторінка-канал (назва, аватар-кружечок, банер, тема)
--   page_admins        — хто веде сторінку (owner/admin) → право писати
--   page_posts         — пости сторінки (автор = сторінка, підпис = людина author_uid)
--   page_comments      — коментарі під постами (реюз патерну comments)
--   page_reactions     — лайки (одна реакція на пост per user, як reactions)
--   page_subscriptions — дзвіночок = підписка на push (кількість НЕ показуємо)
--
-- Ролі/доступ (рішення Вови 22.07): сторінки+власників створює глобальний admin
--   вручну (v1). Право писати в сторінку = власник/адмін ЦІЄЇ сторінки. Решта —
--   читають/лайкають/коментують. Дзвіночок — простий перемикач push.
-- ============================================================================


-- ── 1. PAGES — сторінка-канал ───────────────────────────────────────────────
create table if not exists public.pages (
  id          bigserial primary key,
  slug        text unique,                 -- коротка англ. мітка (для URL, опційно)
  name        text not null,
  theme       text,                        -- тематика (напр. «Культура», «Туризм»)
  avatar_url  text,                        -- кружечок (як в Instagram stories)
  banner_url  text,                        -- широка шапка на екрані сторінки
  is_system   boolean not null default false,  -- системна сторінка (напр. «Афіша громади»)
  created_at  timestamptz default now()
);

-- ── 2. PAGE_ADMINS — хто має право писати від імені сторінки ─────────────────
create table if not exists public.page_admins (
  page_id   bigint not null references public.pages(id)     on delete cascade,
  uid       uuid   not null references public.profiles(uid) on delete cascade,
  role      text   not null default 'admin' check (role in ('owner','admin')),
  added_at  timestamptz default now(),
  primary key (page_id, uid)
);

-- ── 3. PAGE_POSTS — пости сторінки ──────────────────────────────────────────
create table if not exists public.page_posts (
  id          bigserial primary key,
  page_id     bigint not null references public.pages(id)     on delete cascade,
  author_uid  uuid            references public.profiles(uid) on delete set null,  -- людина-автор (підпис «— Ім'я»)
  text        text   not null,
  image_url   text,                        -- одне фото (широке), опційно
  created_at  timestamptz default now(),
  deleted_at  timestamptz                  -- м'яке видалення (як у чатах)
);
create index if not exists idx_page_posts_page on public.page_posts (page_id, created_at desc);
create index if not exists idx_page_posts_feed on public.page_posts (created_at desc) where deleted_at is null;

-- ── 4. PAGE_COMMENTS — коментарі під постами ────────────────────────────────
create table if not exists public.page_comments (
  id          bigserial primary key,
  post_id     bigint not null references public.page_posts(id) on delete cascade,
  author_uid  uuid            references public.profiles(uid)  on delete set null,
  text        text   not null,
  created_at  timestamptz default now(),
  deleted_at  timestamptz
);
create index if not exists idx_page_comments_post on public.page_comments (post_id, created_at asc);

-- ── 5. PAGE_REACTIONS — лайки (одна на пост per user) ────────────────────────
create table if not exists public.page_reactions (
  id          bigserial primary key,
  post_id     bigint not null references public.page_posts(id) on delete cascade,
  user_id     text   not null,             -- uid акаунту АБО анонімний clientId (як reactions)
  emoji       text   not null default '❤️',
  created_at  timestamptz default now(),
  unique (post_id, user_id)
);
create index if not exists idx_page_reactions_post on public.page_reactions (post_id);

-- ── 6. PAGE_SUBSCRIPTIONS — дзвіночок (підписка на push про нові пости) ──────
create table if not exists public.page_subscriptions (
  page_id     bigint not null references public.pages(id)     on delete cascade,
  uid         uuid   not null references public.profiles(uid) on delete cascade,
  created_at  timestamptz default now(),
  primary key (page_id, uid)
);


-- ── ГЕЙТ ДОСТУПУ: чи може auth.uid() писати від імені сторінки ───────────────
-- SECURITY DEFINER (оминає RLS page_admins → без рекурсії), як has_editor_perm().
-- Клієнт викликає її, щоб вирішити, чи показувати поле «написати пост».
create or replace function public.can_edit_page(p_page_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.page_admins a
    where a.page_id = p_page_id and a.uid = auth.uid()
  );
$$;
grant execute on function public.can_edit_page(bigint) to anon, authenticated;


-- ── RLS (Row Level Security — правила доступу на рівні рядків) ───────────────
alter table public.pages              enable row level security;
alter table public.page_admins        enable row level security;
alter table public.page_posts         enable row level security;
alter table public.page_comments      enable row level security;
alter table public.page_reactions     enable row level security;
alter table public.page_subscriptions enable row level security;

-- PAGES: усі читають; створює/редагує лише глобальний admin (вручну, v1)
drop policy if exists "pages read"         on public.pages;
drop policy if exists "pages admin insert" on public.pages;
drop policy if exists "pages admin update" on public.pages;
create policy "pages read"         on public.pages for select using (true);
create policy "pages admin insert" on public.pages for insert with check (is_admin());
create policy "pages admin update" on public.pages for update using (is_admin()) with check (is_admin());

-- PAGE_ADMINS: користувач бачить СВОЇ членства; керує ними глобальний admin (v1).
-- (Власник-призначає-адмінів — окремим етапом з UI, щоб не плодити рекурсію тут.)
drop policy if exists "padmins read own"  on public.page_admins;
drop policy if exists "padmins admin all" on public.page_admins;
create policy "padmins read own"  on public.page_admins for select using (uid = auth.uid() or is_admin());
create policy "padmins admin all" on public.page_admins for all    using (is_admin()) with check (is_admin());

-- PAGE_POSTS: усі читають невидалені; пише/редагує лише власник/адмін ЦІЄЇ сторінки,
-- і лише від свого імені (author_uid = auth.uid()).
drop policy if exists "pposts read"   on public.page_posts;
drop policy if exists "pposts insert" on public.page_posts;
drop policy if exists "pposts update" on public.page_posts;
create policy "pposts read"   on public.page_posts for select using (deleted_at is null or can_edit_page(page_id));
create policy "pposts insert" on public.page_posts for insert with check (can_edit_page(page_id) and author_uid = auth.uid());
create policy "pposts update" on public.page_posts for update using (can_edit_page(page_id)) with check (can_edit_page(page_id));

-- PAGE_COMMENTS: усі читають невидалені; залогінений пише свій; свій — редагує/видаляє;
-- адмін/куратор сторінки теж може видалити (модерація).
drop policy if exists "pcom read"   on public.page_comments;
drop policy if exists "pcom insert" on public.page_comments;
drop policy if exists "pcom update" on public.page_comments;
create policy "pcom read"   on public.page_comments for select using (true);
create policy "pcom insert" on public.page_comments for insert with check (
  author_uid = auth.uid() and length(trim(text)) between 1 and 2000
);
create policy "pcom update" on public.page_comments for update using (
  author_uid = auth.uid()
  or is_admin()
  or can_edit_page((select pp.page_id from public.page_posts pp where pp.id = page_comments.post_id))
) with check (true);

-- PAGE_REACTIONS: усі читають; будь-хто ставить/оновлює/знімає свою (анонімно теж).
drop policy if exists "preact read"   on public.page_reactions;
drop policy if exists "preact insert" on public.page_reactions;
drop policy if exists "preact update" on public.page_reactions;
drop policy if exists "preact delete" on public.page_reactions;
create policy "preact read"   on public.page_reactions for select using (true);
create policy "preact insert" on public.page_reactions for insert with check (length(emoji) between 1 and 16);
create policy "preact update" on public.page_reactions for update using (true) with check (true);
create policy "preact delete" on public.page_reactions for delete using (true);

-- PAGE_SUBSCRIPTIONS: користувач керує ЛИШЕ своїми (дзвіночок увімк/вимк).
drop policy if exists "psub read"   on public.page_subscriptions;
drop policy if exists "psub insert" on public.page_subscriptions;
drop policy if exists "psub delete" on public.page_subscriptions;
create policy "psub read"   on public.page_subscriptions for select using (uid = auth.uid());
create policy "psub insert" on public.page_subscriptions for insert with check (uid = auth.uid());
create policy "psub delete" on public.page_subscriptions for delete using (uid = auth.uid());


-- ── REALTIME (жива стрічка — нові пости/коментарі/лайки без перезавантаження) ─
do $$
begin
  begin alter publication supabase_realtime add table public.page_posts;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.page_comments;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.page_reactions; exception when duplicate_object then null; end;
end $$;


-- ── SEED: 2 тестові сторінки + Вова власником (для перевірки Етапу 1) ────────
-- Ідемпотентно (не дублює при повторному запуску).
insert into public.pages (name, theme)
select v.name, v.theme
from (values
  ('Туристична Олика',    'Туризм'),
  ('Відділ культури ОТГ', 'Культура')
) as v(name, theme)
where not exists (select 1 from public.pages p where p.name = v.name);

-- Призначити Вову власником обох сторінок (за email акаунту).
-- ⚠️ Якщо у тебе інший email акаунту в додатку — заміни рядок нижче.
insert into public.page_admins (page_id, uid, role)
select p.id, pr.uid, 'owner'
from public.pages p
join auth.users   u  on u.email = 'vitocorleone191@outlook.com'
join public.profiles pr on pr.uid = u.id
where p.name in ('Туристична Олика', 'Відділ культури ОТГ')
  and not exists (
    select 1 from public.page_admins a where a.page_id = p.id and a.uid = pr.uid
  );


-- ── ПЕРЕВІРКА (побачиш результат унизу після Run) ───────────────────────────
select 'pages' as tbl, count(*) from public.pages
union all select 'page_admins', count(*) from public.page_admins;
-- ============================================================================
-- ✅ ГОТОВО. Далі — Етап 2 (клієнт: стрічка постів + кружечки-канали).
-- ============================================================================
