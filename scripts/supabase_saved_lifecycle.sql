-- ============================================================================
-- ЖИТТЄВИЙ ЦИКЛ ЗБЕРЕЖЕНОГО — замовлення Вови 18.09.2026
--
-- 🗣️ «якщо… воно видалилось з додатку, то воно має пропасти із збереження, тому
-- що його вже не існує. А якщо… рейс скасований, то він має бути там, але так
-- само з позначкою скасований… не то, що користувач зберіг якесь питання, і
-- воно видалилось, і воно досі там, і користувач його не може не відкрити, не
-- видалити збережене, нічого».
--
-- 🔑 ПРАВИЛО, ЗАТВЕРДЖЕНЕ ВОВОЮ, ОДНЕ НА ВСІ ТИПИ:
--   Збережене зникає, лише коли зник САМ ПРЕДМЕТ.
--   Якщо предмет живий, а змінився його СТАН — він лишається, і стан написаний
--   на картці.
--
-- 📐 ЗАМІРЯНО НА ЖИВІЙ БАЗІ 18.09 ПЕРЕД РОБОТОЮ (не здогад):
--   saved_posts — 5 рядків, з них 2 МЕРТВІ: обидва на post 90 («Тест»,
--   type=chat, deleted_at 09.09). Тримають ДВА різні акаунти —
--   volodymyrshevchuk19@ (admin=true) і olena2762@ (admin=false).
--
-- 🔴 І САМЕ ЦЕ ПОЯСНЮЄ, ЧОМУ СИМПТОМ У ДВОХ ЛЮДЕЙ РІЗНИЙ, А ВАДА ОДНА.
--   Політика `posts read` = `(deleted_at is null and post_visible_row(…)) or is_admin()`.
--   • адмін бачить видалений рядок → мертва картка, тап нікуди не веде;
--   • звичайна людина не бачить → картка ТИХО зникла, рядок лишився назавжди.
--   Тобто «полагодити тільки у власника» тут не вийшло б: у решти вада тихіша,
--   не менша.
--
-- 🛑 ЧОМУ ЧИСТКА ЖИВЕ В БАЗІ, А НЕ В КЛІЄНТІ — ГОЛОВНЕ РІШЕННЯ ЦЬОГО ФАЙЛУ.
--   Клієнт звичайної людини ФІЗИЧНО не відрізняє «видалено» від «не
--   завантажилось»: RLS ховає видалене рівно так само, як обрив мережі ховає
--   все. Чистка за відсутністю даних стерла б ЖИВІ закладки на поганому
--   інтернеті. Той самий клас, що вада 18.09, коли збій приходив ВИНЯТКОМ, а не
--   значенням, і виклик нагорі його мовчки ковтав.
--   ➡️ Тому рішення «предмет зник» ухвалює єдиний, хто бачить правду, — база.
--   Клієнт малює те, що вона сказала, і НІКОЛИ не виводить видалення з тиші.
--
-- ЗАСТОСУВАТИ через Supabase MCP apply_migration (project uabyfecseqnemvcqhdem).
-- Скрипт ІДЕМПОТЕНТНИЙ.
-- ============================================================================

-- ── 1. ЗНІМОК НАЗВИ І ТИПУ В МОМЕНТ ЗБЕРЕЖЕННЯ ─────────────────────────────
--
-- 🔑 Навіщо, якщо назва є в самому пості: щоб сказати «Оголошення «Куплю
-- будинок», яке ви зберегли, знято» — треба знати назву ПІСЛЯ того, як запис
-- зник. Для справжнього видалення (рядок пішов з таблиці) взяти її вже нізвідки.
-- Це пряма вимога Вови 18.09: «не просто "запис прибрано", а щось типу
-- "Оголошення «назва», яке ви зберегли, знято"».
--
-- ⚠️ `kind` теж знімок, і він не дублює `posts.type` даремно: саме через його
-- відсутність тап по збереженому ПИТАННЮ кидав на ДОШКУ з текстом «це
-- оголошення більше недоступне» — тип на той момент був уже втрачений.
alter table public.saved_posts add column if not exists snap_title text;
alter table public.saved_posts add column if not exists snap_kind  text;

alter table public.saved_articles add column if not exists snap_title text;
alter table public.saved_articles add column if not exists snap_url   text;

-- ── 2. РАЗОВЕ ЗАПОВНЕННЯ ЗНІМКІВ ДЛЯ ВЖЕ ЗБЕРЕЖЕНОГО ──────────────────────
--
-- 🔑 Мʼяке видалення тут ПРАЦЮЄ НА НАС: видалене питання лишається рядком у
-- `posts`, тож назву можна взяти навіть для того, що людина вже втратила з очей.
-- Заміряно: post 90 має text='Тест' попри deleted_at — отже обидві мертві
-- закладки будуть названі, а не знеособлені.
-- ⚠️ Безіменним лишиться тільки те, що видалили ЖОРСТКО (рядка немає). Сьогодні
-- таких нема; на майбутнє знімок пишеться при самому збереженні (п.3).
update public.saved_posts s
   set snap_title = coalesce(nullif(btrim(p.title), ''), nullif(btrim(p.text), '')),
       snap_kind  = coalesce(p.type, 'board')
  from public.posts p
 where p.id = s.post_id
   and (s.snap_title is null or s.snap_kind is null);

-- ── 3. ЗБЕРЕЖЕННЯ ПОСТА РАЗОМ ІЗ ЗНІМКОМ ──────────────────────────────────
--
-- 🛑 Чому RPC, а не `upsert` зі знімком з клієнта: клієнт міг би надіслати БУДЬ-ЯКУ
-- назву і будь-який тип — і повідомлення «Оголошення «…» знято» показувало б те,
-- чого ніколи не існувало. Знімок мусить знімати той, хто бачить оригінал.
-- 🔑 `security definer` тут по суті: RLS на `posts` ховає від людини чужий
-- pending, а нам треба лише переписати назву в її власну закладку.
create or replace function public.save_post(p_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid   uuid := auth.uid();
  v_title text;
  v_kind  text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Треба увійти');
  end if;

  select coalesce(nullif(btrim(p.title), ''), nullif(btrim(p.text), '')), coalesce(p.type, 'board')
    into v_title, v_kind
    from public.posts p
   where p.id = p_id
     and p.deleted_at is null;

  -- Зберегти те, чого немає або що вже видалене, не можна: інакше ми самі й
  -- створили б мертву закладку, яку цей файл лікує.
  if v_kind is null then
    return jsonb_build_object('ok', false, 'error', 'Запису вже немає');
  end if;

  insert into public.saved_posts (uid, post_id, snap_title, snap_kind)
  values (v_uid, p_id, v_title, v_kind)
  on conflict (uid, post_id) do update
    set snap_title = excluded.snap_title,
        snap_kind  = excluded.snap_kind;

  return jsonb_build_object('ok', true, 'title', v_title, 'kind', v_kind);
end;
$fn$;

-- ── 4. ЗВІРКА І ЧИСТКА ОДНИМ ТАКТОМ ───────────────────────────────────────
--
-- 📐 МАПА СТАНІВ — виведена з того, що в таблиці БУВАЄ, а не вигадана.
-- Заміряно 18.09: `status` у живій базі лише `published`; `closed` знає клієнт
-- (`board-chat.js:107` — «оголошення завершене»), `pending` ставить повторна
-- модерація після правки (`supabase_board_edit.sql:111`).
--
--   | у базі                        | стан     | що робимо                        |
--   |-------------------------------|----------|----------------------------------|
--   | published, не видалене        | alive    | звичайна картка                  |
--   | closed                        | closed   | ЛИШАЄТЬСЯ, позначка «Знято»      |
--   | pending                       | pending  | ЛИШАЄТЬСЯ, позначка «На перевірці»|
--   | rejected (чи інший статус)    | removed  | прибрати + сказати назвою        |
--   | deleted_at не null            | removed  | прибрати + сказати назвою        |
--   | рядка немає зовсім            | removed  | прибрати + сказати назвою        |
--
-- 🔴 `pending` НЕ ПРИБИРАЄМО, і це не дрібниця. Автор править своє оголошення →
-- воно йде на повторну модерацію → на кілька годин зникає з `published`. Якби
-- «зник із виду» означало «прибрати», правка автора МОВЧКИ знищувала б чужі
-- закладки на його оголошення. Стан тимчасовий — отже це стан, а не зникнення,
-- і за правилом Вови він лишається з позначкою.
-- ⚠️ Для `pending` назва береться ЗІ ЗНІМКА, а не з живого рядка: свіжий текст
-- модерацію ще не пройшов, і показувати його стороннім не можна.
--
-- 🔑 Чому звірка і видалення в ОДНІЙ функції, а не двома викликами: між ними
-- людина могла б закрити застосунок, і чистка не сталась би ніколи — а список
-- уже показав би «прибрано». Тобто інтерфейс підтвердив би дію, якої не було
-- (B-33, 25.08).
-- 4а. САМЕ ПРАВИЛО — ОКРЕМОЮ ФУНКЦІЄЮ І ВІД КОЛОНОК.
-- 🛑 Так вимагає `HOT_RULES` 11-БІС: правило виражається ВІД КОЛОНОК і живе в
-- ОДНОМУ місці. Нижче його кличуть двічі — чистка і збірка списку; написане
-- двома `case` воно розійшлося б, і розбіжність була б МОВЧАЗНОЮ: запис
-- прибрали, а в списку лишили, або навпаки.
create or replace function public.saved_post_state(
  p_exists boolean, p_deleted timestamptz, p_status text
) returns text
language sql
immutable
as $fn$
  select case
    when not p_exists           then 'removed'
    when p_deleted is not null  then 'removed'
    when p_status = 'closed'    then 'closed'
    when p_status = 'pending'   then 'pending'
    when p_status = 'published' then 'alive'
    else 'removed'
  end;
$fn$;

comment on function public.saved_post_state(boolean, timestamptz, text) is
  'Стан збереженого поста ВІД КОЛОНОК: alive | closed | pending | removed. pending лишається навмисно — повторна модерація після правки автора, стан тимчасовий.';

create or replace function public.sync_saved_posts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid     uuid := auth.uid();
  v_removed jsonb;
  v_items   jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Треба увійти');
  end if;

  -- 🛑 ПОРЯДОК ОБОВ'ЯЗКОВИЙ: назвати прибуте ДО видалення. Після `delete` брати
  -- назву вже нізвідки, а саме назва і є те, чого просив Вова
  -- («Оголошення «…», яке ви зберегли, знято»).
  select coalesce(jsonb_agg(jsonb_build_object(
           'post_id', s.post_id,
           'kind',    coalesce(s.snap_kind, p.type, 'board'),
           'title',   s.snap_title
         ) order by s.post_id), '[]'::jsonb)
    into v_removed
    from public.saved_posts s
    left join public.posts p on p.id = s.post_id
   where s.uid = v_uid
     and public.saved_post_state(p.id is not null, p.deleted_at, p.status) = 'removed';

  -- Мертві з ЖИВИМ рядком (видалене мʼяко, відхилене модерацією).
  delete from public.saved_posts s
   using public.posts p
   where s.uid = v_uid and p.id = s.post_id
     and public.saved_post_state(true, p.deleted_at, p.status) = 'removed';

  -- ⚠️ Окремим кроком — ті, чийого рядка в `posts` немає ЗОВСІМ (жорстке
  -- видалення). `delete … using` це внутрішнє зʼєднання, тож попередній оператор
  -- їх не дістає в принципі — без цього рядка вони лишались би назавжди,
  -- тобто рівно та вада, яку ми лікуємо.
  delete from public.saved_posts s
   where s.uid = v_uid
     and not exists (select 1 from public.posts p where p.id = s.post_id);

  select coalesce(jsonb_agg(jsonb_build_object(
           'post_id', s.post_id,
           'kind',    coalesce(s.snap_kind, p.type, 'board'),
           -- pending: назва ЗІ ЗНІМКА — свіжий текст модерацію ще не пройшов
           'title',   case
                        when public.saved_post_state(true, p.deleted_at, p.status) = 'pending'
                          then s.snap_title
                        else coalesce(nullif(btrim(p.title), ''), nullif(btrim(p.text), ''), s.snap_title)
                      end,
           'state',   public.saved_post_state(true, p.deleted_at, p.status),
           'created_at', p.created_at
         ) order by p.created_at desc nulls last), '[]'::jsonb)
    into v_items
    from public.saved_posts s
    join public.posts p on p.id = s.post_id
   where s.uid = v_uid;

  return jsonb_build_object('ok', true, 'items', v_items, 'removed', v_removed);
end;
$fn$;

-- ── 5. ЗНІМОК ДЛЯ ЗБЕРЕЖЕНОЇ СТАТТІ ───────────────────────────────────────
--
-- 🔴 Стаття — єдиний тип, чиє джерело правди НЕ в базі: вона живе в
-- `data/articles.json` (git), і стрічка має ротацію за віком. Тобто зникнення
-- збереженої новини не рідкісний випадок, а РОЗКЛАД: рано чи пізно зникне
-- кожна. До 18.09 `getArticlesByIds` (`news.js`) просто робив `.filter(Boolean)`
-- — тихо викидав те, чого вже немає, і людина не дізнавалась нічого.
-- 🔑 Рішення Вови 18.09 («Окей» на пропозицію): тримаємо знімок заголовка і
-- адресу джерела, щоб картка не зникала, а вела на оригінал.
-- ⚠️ Знімок пише КЛІЄНТ, і тут це не суперечність із п.3: підробити нема кому —
-- у `saved_articles` людина може писати лише СВОЇ рядки (RLS `uid = auth.uid()`),
-- а стаття не має ні автора в базі, ні модерації, яку можна обійти назвою.
create or replace function public.save_article(p_id bigint, p_title text, p_url text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Треба увійти');
  end if;

  insert into public.saved_articles (uid, article_id, snap_title, snap_url)
  values (v_uid, p_id, nullif(btrim(coalesce(p_title, '')), ''), nullif(btrim(coalesce(p_url, '')), ''))
  on conflict (uid, article_id) do update
    -- ⚠️ `coalesce` у цьому порядку: новий знімок перебиває, але ПОРОЖНІЙ не
    -- стирає наявний. Інакше повторне збереження з екрана, де заголовка під
    -- рукою немає, знеособило б картку, яка вже була підписана.
    set snap_title = coalesce(excluded.snap_title, saved_articles.snap_title),
        snap_url   = coalesce(excluded.snap_url,   saved_articles.snap_url);

  return jsonb_build_object('ok', true);
end;
$fn$;

-- ── 6. ПРАВА ──────────────────────────────────────────────────────────────
-- Усі три першим рядком питають `auth.uid()`, але право виклику знімаємо
-- окремо: дешевше, ніж покладатись на перевірку всередині.
revoke execute on function public.save_post(bigint)                from public, anon;
revoke execute on function public.sync_saved_posts()               from public, anon;
revoke execute on function public.save_article(bigint, text, text) from public, anon;
grant  execute on function public.save_post(bigint)                to authenticated;
grant  execute on function public.sync_saved_posts()               to authenticated;
grant  execute on function public.save_article(bigint, text, text) to authenticated;

comment on function public.sync_saved_posts() is
  'Звіряє збережені пости зі станом у базі, прибирає мертві і повертає їх назви. '
  'Рішення «предмет зник» ухвалює база: клієнт не відрізняє видалене від невдалого запиту.';
