-- scripts/dump_prod_mirror.sql
-- ГЕНЕРАТОР ДЗЕРКАЛА ПРОДА (24.09.2026)
--
-- 🔴 НАВІЩО ЦЕЙ ФАЙЛ ІСНУЄ. Аудит 24.09 звірив репозиторій із живою базою і
-- знайшов, що вони розходяться щонайменше вчетверо:
--   • політика на `posts` зветься `posts read`, а `supabase_post_contact.sql`
--     планує знімати `Public can read published posts` — такої на проді немає;
--   • `pcomreact read` у репо стоїть `using (true)`, на проді вже звужена до
--     `page_comment_visible(comment_id)`;
--   • схеми групового чату (`chat_groups`, `chat_group_members`,
--     `chat_group_messages`, `chat_group_invites`) у репозиторії немає ВЗАГАЛІ,
--     а на проді вони є і з політиками;
--   • тригер `analytics_events_rate_limit` на проді Є, хоч жоден файл його не
--     описує — і аудит спершу записав його у відсутні.
--
-- 🔑 УРОК КЛАСУ, вже записаний у `NOW.md`: «пишеш RPC — звіряй
--    `pg_get_functiondef`, а не файл у репо». Цей генератор робить те саме для
--    ВСІЄЇ схеми, а не для однієї функції.
--
-- ⚠️ ЧОМУ ГЕНЕРАТОР, А НЕ ПРОСТО ЗНІМОК. Знімок, знятий руками один раз,
--    застаріє на першій же міграції і знову почне брехати — тобто повторить
--    саме ту ваду, яку має лікувати. Файл поруч (`prod_mirror_<дата>.sql`) —
--    це ВИВІД цього запиту, а не джерело правди. Джерело правди — прод.
--
-- ЯК КОРИСТУВАТИСЬ: виконати в Supabase SQL Editor, вивід покласти у
--    `scripts/prod_mirror_<РРРР-ММ-ДД>.sql` і закомітити. Розбіжність зі старим
--    знімком = або наша міграція, або чиясь правка руками повз репозиторій.
--
-- 🛑 Це ЧИТАННЯ. Жодного DDL тут немає і бути не може.

select string_agg(частина, E'\n\n' order by порядок) as дзеркало from (

  -- 1. Політики RLS
  select 1 as порядок, E'-- ── ПОЛІТИКИ RLS ──────────────────────────────\n'
    || string_agg(
         'create policy ' || quote_ident(policyname) || ' on public.' || quote_ident(tablename)
         || ' for ' || lower(cmd) || ' to ' || array_to_string(roles, ', ')
         || coalesce(E'\n  using (' || qual || ')', '')
         || coalesce(E'\n  with check (' || with_check || ')', '') || ';',
         E'\n' order by tablename, cmd, policyname) as частина
  from pg_policies where schemaname = 'public'

  union all

  -- 2. Індекси
  select 2, E'-- ── ІНДЕКСИ ───────────────────────────────────\n'
    || string_agg(indexdef || ';', E'\n' order by tablename, indexname)
  from pg_indexes where schemaname = 'public'

  union all

  -- 3. Функції: імʼя · чи SECURITY DEFINER · чи виставлений search_path.
  -- Повні тіла свідомо НЕ беремо: файл став би нечитабельним, а для звірки
  -- досить трьох цих полів — саме вони й тримають захист.
  select 3, E'-- ── ФУНКЦІЇ (імʼя · права · search_path) ──────\n'
    || string_agg(format('-- %-38s %-16s %s', p.proname,
         case when p.prosecdef then 'SECURITY DEFINER' else 'invoker' end,
         coalesce(array_to_string(p.proconfig, ' '), '—')), E'\n' order by p.proname)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'

  union all

  -- 4. Тригери. Саме тут ховалось те, чого не було в жодному файлі.
  select 4, E'-- ── ТРИГЕРИ ───────────────────────────────────\n'
    || string_agg(pg_get_triggerdef(t.oid) || ';', E'\n' order by c.relname, t.tgname)
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and not t.tgisinternal

  union all

  -- 5. Колонкові гранти для `anon` і `authenticated`.
  -- 🔴 Саме звідси видно діру Б2: INSERT на `profiles.trusted` для
  --    `authenticated`. Політика вставки такого не показує — вона перевіряє
  --    лише `uid`, а колонку пускає грант.
  select 5, E'-- ── КОЛОНКОВІ ГРАНТИ (anon / authenticated) ───\n'
    || string_agg(format('-- %-26s %-18s %-16s %s', table_name, column_name, grantee, privilege_type),
         E'\n' order by table_name, column_name, grantee, privilege_type)
  from information_schema.column_privileges
  where table_schema = 'public' and grantee in ('anon', 'authenticated')
    and privilege_type in ('INSERT', 'UPDATE')

  union all

  -- 6. Таблиці без RLS і таблиці з RLS без жодної політики.
  select 6, E'-- ── RLS: стан по таблицях ─────────────────────\n'
    || string_agg(format('-- %-30s rls=%-5s політик=%s', c.relname, c.relrowsecurity,
         (select count(*) from pg_policy p where p.polrelid = c.oid)), E'\n' order by c.relname)
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'

) s;
