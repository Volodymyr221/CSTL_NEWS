-- ════════════════════════════════════════════════════════════════════════════
-- 🔴 22.08.2026 — КОМЕНТАР НЕ НАДСИЛАВСЯ. ПОЛІТИКА ЧИТАННЯ ПИТАЛА САМА СЕБЕ.
--
-- СИМПТОМ (знімок Вови з другого акаунта, 21:36): пишеш «Клас» під дописом
-- спільноти → тост «Коментар не надіслано — спробуй ще раз». У базі за дві
-- години — НУЛЬ нових коментарів, тобто вставки справді не було.
--
-- 🔑 КОРІНЬ. `addPageComment` робить `.insert(row).select().single()`, а це в
-- Postgres `INSERT ... RETURNING`. RETURNING віддає рядок назад, тобто його
-- треба ще й ПРОЧИТАТИ — і читання йде через SELECT-політику `pcom read`.
-- З 20.08 (міграція моделі видимості) вона звучала так:
--
--     using (public.page_comment_visible(id))
--
-- Функція оголошена STABLE і всередині робить `select … from page_comments
-- where id = c_id`. STABLE-функція бачить знімок бази на ПОЧАТОК оператора —
-- а щойно вставленого рядка в тому знімку ще немає. Отже `exists(…)` = false,
-- читання не дозволене, і весь INSERT відкочується з 42501.
--
-- 📐 ДОВЕДЕНО ЕКСПЕРИМЕНТОМ на живій базі (усе в транзакції з rollback,
-- підставлені роль `authenticated` і JWT справжнього профілю):
--     INSERT БЕЗ  returning ....... OK
--     INSERT З    returning ....... 42501 violates row-level security policy
--     той самий рядок окремим оператором → page_comment_visible = true
-- Тобто рядок цілком законний. Ламався рівно момент RETURNING.
--
-- ⚠️ НАЙПІДСТУПНІШЕ: помилка називає INSERT і веде розслідування до політики
-- вставки, яка ЦІЛКОМ СПРАВНА. Той самий обман, що 16.08 у
-- `push_subscriptions` (там `upsert` вимагав SELECT-політики, а текст помилки
-- теж указував на INSERT). Правило, яке варто памʼятати:
-- 🛑 **42501 на вставці — дивись і на політику ЧИТАННЯ теж.**
--
-- 🔬 ЧОМУ ЛАМАЛОСЬ НЕ ВСЕ. Політика, що питає про БАТЬКА (`comments read` →
-- `post_visible(post_id)`, `preact read` → `page_post_visible(post_id)`),
-- працює нормально: батько існував ДО вставки, тож у знімку він є. Ламаються
-- рівно ті три, що питали про ВЛАСНИЙ рядок — `posts`, `page_posts`,
-- `page_comments`.
--
-- ✅ ЛІКУВАННЯ, ЯКЕ НЕ ВІДКОЧУЄ МОДЕЛЬ ВИДИМОСТІ 20.08. Найпростіше було б
-- вписати умову прямо в політику — але тоді правило жило б у ДВОХ місцях
-- (у функції і в політиці), а це рівно та вада, від якої 20.08 і тікали
-- (`visibility-model`: «кожна дочірня таблиця вирішувала свою видимість САМА»).
-- Тому правило виноситься в *_row(…) — функцію ВІД КОЛОНОК, а не від id:
--   • політика таблиці кличе *_row(…) з колонками свого рядка — RLS має їх
--     напряму, знімок не потрібен, RETURNING працює;
--   • *_visible(id) читає рядок і кличе ТУ САМУ *_row(…) — тобто лишається
--     єдиним входом для дочірніх політик і зовнішніх викликів.
-- Джерело правди лишається одне на сутність, як і було задумано.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1. ОГОЛОШЕННЯ / ПИТАННЯ (posts) ─────────────────────────────────────────
create or replace function public.post_visible_row(p_status text, p_owner_uid uuid)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select p_status = 'published' or p_owner_uid = auth.uid() or public.is_admin();
$$;
comment on function public.post_visible_row(text, uuid) is
  'Правило видимості оголошення/питання — ВІД КОЛОНОК. Єдине джерело правди; '
  'post_visible(id) кличе цю ж функцію. Від колонок, щоб політика працювала і '
  'на INSERT ... RETURNING (див. шапку supabase_visibility_returning_fix.sql).';

create or replace function public.post_visible(p_id bigint)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_id and public.post_visible_row(p.status, p.owner_uid)
  );
$$;

-- ── 2. ДОПИС СПІЛЬНОТИ (page_posts) ─────────────────────────────────────────
create or replace function public.page_post_visible_row(
  p_deleted_at timestamptz, p_status text, p_page_id bigint)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select (p_deleted_at is null and p_status = 'published')
      or public.can_edit_page(p_page_id)
      or public.is_admin();
$$;
comment on function public.page_post_visible_row(timestamptz, text, bigint) is
  'Правило видимості допису спільноти — ВІД КОЛОНОК. page_post_visible(id) кличе цю ж.';

create or replace function public.page_post_visible(p_id bigint)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.page_posts p
    where p.id = p_id
      and public.page_post_visible_row(p.deleted_at, p.status, p.page_id)
  );
$$;

-- ── 3. КОМЕНТАР СПІЛЬНОТИ (page_comments) ───────────────────────────────────
-- ⚠️ Тут друга ланка (`page_post_visible(post_id)`) СВІДОМО лишається запитом за
-- id: вона питає БАТЬКА, який на момент вставки коментаря вже існує. Саме тому
-- `comments read` на Дошці ніколи й не ламалась.
create or replace function public.page_comment_visible_row(
  c_deleted_at timestamptz, c_post_id bigint)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select (c_deleted_at is null or public.is_admin())
     and public.page_post_visible(c_post_id);
$$;
comment on function public.page_comment_visible_row(timestamptz, bigint) is
  'Правило видимості коментаря спільноти — ВІД КОЛОНОК. page_comment_visible(id) кличе цю ж.';

create or replace function public.page_comment_visible(c_id bigint)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.page_comments c
    where c.id = c_id
      and public.page_comment_visible_row(c.deleted_at, c.post_id)
  );
$$;

grant execute on function public.post_visible_row(text, uuid)                       to anon, authenticated;
grant execute on function public.page_post_visible_row(timestamptz, text, bigint)   to anon, authenticated;
grant execute on function public.page_comment_visible_row(timestamptz, bigint)      to anon, authenticated;

-- ── 4. ТРИ ПОЛІТИКИ ПЕРЕСТАЮТЬ ПИТАТИ САМІ СЕБЕ ─────────────────────────────
-- 🔑 Правило не змінилось ні на йоту — змінився лише спосіб його спитати.
drop policy if exists "posts read" on public.posts;
create policy "posts read" on public.posts for select
  using (public.post_visible_row(status, owner_uid));

drop policy if exists "pposts read" on public.page_posts;
create policy "pposts read" on public.page_posts for select
  using (public.page_post_visible_row(deleted_at, status, page_id));

drop policy if exists "pcom read" on public.page_comments;
create policy "pcom read" on public.page_comments for select
  using (public.page_comment_visible_row(deleted_at, post_id));

-- 🛑 Дочірні політики НЕ ЧІПАЄМО — вони питають батька і працюють правильно:
--    comments read     → post_visible(post_id)
--    reactions read    → post_visible(post_id)
--    preact read       → page_post_visible(post_id)
--    pcomreact read    → page_comment_visible(comment_id)
