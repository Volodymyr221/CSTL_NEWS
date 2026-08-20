-- ═══════════════════════════════════════════════════════════════════════════
-- МОДЕЛЬ ВИДИМОСТІ: ДИТИНА ВИДНА РІВНО ТОДІ, КОЛИ ВИДНО БАТЬКА
-- 20.08.2026 · знайдено аудитом /byyou
--
-- 🔴 ЩО БУЛО ЗАМІРЯНО НА ЖИВІЙ БАЗІ:
--   • 111 ВИДАЛЕНИХ коментарів сторінок читаються будь-ким;
--   • 14 відповідей під видаленими/неопублікованими постами — теж;
--   •  4 реакції під невидимими постами;
--   • 15 реакцій під видаленими коментарями.
-- Людина видалила свій коментар — а він лишається доступним тому, хто питає
-- базу напряму. Застосунок його не малює, і саме тому дірку не було видно.
--
-- 🔑 КОРІНЬ — НЕ В ОКРЕМИХ ПОЛІТИКАХ, А В ТОМУ, ЩО ЇХ НЕ ПОВʼЯЗАЛИ. Кожна
-- дочірня таблиця відповідала на питання «чи можна читати ЦЕЙ рядок» самостійно
-- (`true`, або «чи ти залогінений»), тобто видимість коментаря нічого не знала
-- про видимість поста. Поки пости не видаляли, збігалось.
--
-- ➡️ ТОМУ НЕ ЛАТКА, А ПРАВИЛО: видимість дитини ВИВОДИТЬСЯ з видимості батька,
-- і живе вона в ОДНІЙ функції на сутність. Батьківські політики кличуть ту саму
-- функцію — інакше з'явилась би друга копія правила, а копії розходяться (у
-- проєкті це вже коштувало двох списків антиспаму і двох кривих анімації).
--
-- ⚠️ SECURITY DEFINER тут обовʼязковий і безпечний: функція читає таблицю від
-- імені власника, для якого RLS не діє, тож політика на posts, що кличе
-- post_visible(), НЕ входить у рекурсію. Той самий прийом уже працює в
-- is_admin() і can_edit_page().
-- 🛑 `set search_path = public, auth` БЕЗ ЛАПОК. У лапках це одна схема з
-- назвою «public, auth» — на цьому вже горіли 20.08 («relation admins does not
-- exist»).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. ВИДИМІСТЬ ПОСТА ДОШКИ/ПИТАНЬ ────────────────────────────────────────
create or replace function public.post_visible(p_id bigint)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.posts p
    where p.id = p_id
      and (p.status = 'published' or p.owner_uid = auth.uid() or public.is_admin())
  );
$$;
comment on function public.post_visible(bigint) is
  'Чи видно пост цьому глядачеві. ОДНЕ місце правди: політики posts і всіх дочірніх таблиць кличуть саме її.';

-- ── 2. ВИДИМІСТЬ ПОСТА СТОРІНКИ ────────────────────────────────────────────
create or replace function public.page_post_visible(p_id bigint)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.page_posts p
    where p.id = p_id
      and ((p.deleted_at is null and p.status = 'published')
           or public.can_edit_page(p.page_id) or public.is_admin())
  );
$$;
comment on function public.page_post_visible(bigint) is
  'Чи видно пост спільноти. Видалений або неопублікований бачать лише редактори сторінки й адміни.';

-- ── 3. ВИДИМІСТЬ КОМЕНТАРЯ СТОРІНКИ ────────────────────────────────────────
-- Два рівні: сам коментар не видалений І його пост видно. Ланцюг три ланки
-- завглибшки (реакція → коментар → пост), тому кожна ланка питає попередню, а
-- не повторює її умову.
create or replace function public.page_comment_visible(c_id bigint)
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from public.page_comments c
    where c.id = c_id
      and (c.deleted_at is null or public.is_admin())
      and public.page_post_visible(c.post_id)
  );
$$;
comment on function public.page_comment_visible(bigint) is
  'Чи видно коментар спільноти: сам не видалений І видно його пост.';

grant execute on function public.post_visible(bigint)        to anon, authenticated;
grant execute on function public.page_post_visible(bigint)   to anon, authenticated;
grant execute on function public.page_comment_visible(bigint) to anon, authenticated;

-- ── 4. БАТЬКИ КЛИЧУТЬ СВОЮ Ж ФУНКЦІЮ ───────────────────────────────────────
-- Три окремі політики на posts (адмін / власник / опубліковане) казали те саме,
-- що тепер каже post_visible(). Лишити їх означало б тримати правило у двох
-- місцях і чекати, поки вони розійдуться.
drop policy if exists "Admins can see all posts"        on public.posts;
drop policy if exists "Owner reads own posts"           on public.posts;
drop policy if exists "Public can read published posts" on public.posts;
create policy "posts read" on public.posts for select using (public.post_visible(id));

drop policy if exists "pposts read" on public.page_posts;
create policy "pposts read" on public.page_posts for select using (public.page_post_visible(id));

-- ── 5. ДІТИ ВИВОДЯТЬ ВИДИМІСТЬ ІЗ БАТЬКА ───────────────────────────────────
drop policy if exists "Public can read comments" on public.comments;
create policy "comments read" on public.comments for select
  using ((deleted_at is null or public.is_admin()) and public.post_visible(post_id));

drop policy if exists "Public can read reactions" on public.reactions;
create policy "reactions read" on public.reactions for select
  using (public.post_visible(post_id));

drop policy if exists "pcom read" on public.page_comments;
create policy "pcom read" on public.page_comments for select
  using (public.page_comment_visible(id));

drop policy if exists "preact read" on public.page_reactions;
create policy "preact read" on public.page_reactions for select
  using (public.page_post_visible(post_id));

drop policy if exists "pcomreact read" on public.page_comment_reactions;
create policy "pcomreact read" on public.page_comment_reactions for select
  using (public.page_comment_visible(comment_id));
