-- scripts/supabase_official_badge.sql
-- ПОТІК 3 (09.08.2026) — ОФІЦІЙНА ГАЛОЧКА І ЗАХИСТ ІМЕНІ.
--
-- ⛔ СТАТУС: НЕ НАКАТАНО (запис у прод із сесії блокує сторож дозволів
--    середовища; читання дозволене). Накотити має Вова через SQL Editor.
--
-- Замовлення Вови (09.08, дослівно): «додай можливість для призначення синьої
-- галочки з адмінки спільнотам та певним користувачам… просто буде користувач
-- Олександр Прендецький, це голова міської ради — йому треба додати офіційну
-- галочку, щоб користувачі розуміли, що це він».
--
-- 🔴 ГАЛОЧКА НЕ ВІШАЄТЬСЯ НА `trusted` — це рішення Вови від 02.08, записане в
-- `src/tabs/board.js`. `trusted` означає зовсім інше: «підтверджений житель», дає
-- автопублікацію оголошень без модерації. Малювати галочку за чужим прапорцем =
-- збрехати про статус людини. Тому окрема колонка `official`.
--
-- 📌 Продуктове правило, зафіксоване тим же рішенням: **офіційне говорить від
-- СТОРІНКИ, а не від людини.** Спільноту у Стрічці створює лише адмін, тож
-- «Олицька сільрада» як сторінка підробці не піддається взагалі. Галочка на
-- людині — для випадку «конкретна людина при посаді» (голова ради), а не замість
-- цього правила.
--
-- 📐 Заміряно ДО (жива база, 09.08):
--   • колонки `pages`: id, slug, name, theme, avatar_url, banner_url, is_system,
--     created_at, sort_order — жодного поля офіційності немає;
--   • `profiles.trusted` має anon/authenticated: SELECT, INSERT — і **не має
--     UPDATE**. Це і є взірець, який повторюємо для `official`;
--   • `profiles.name` має **UPDATE** — тобто ім'я людина вписує собі сама, і
--     звідси виріс крок 17.
--   • `text_norm_cyr('Адмiнiстрацiя CSTL')` → `адміністрація сsтl` — гомогліфи
--     (латинська «i» замість кириличної) зводяться ✅, але **пробіли не
--     схлопуються**, тож рознесене «А д м і н і с т р а ц і я» пройшло б.
--     Саме тому нижче є окреме схлопування.

-- ── КРОК 14. КОЛОНКА `official` ─────────────────────────────────────────────

alter table public.profiles add column if not exists official boolean not null default false;
alter table public.pages    add column if not exists official boolean not null default false;

comment on column public.profiles.official is
  'Офіційний акаунт (синя галочка). Ставить ЛИШЕ адмін через admin_set_official().
   🛑 Не плутати з trusted — той про «підтверджений житель» і автопублікацію.';
comment on column public.pages.official is
  'Офіційна спільнота (синя галочка). Ставить лише адмін через admin_set_official().';

-- 🔴 Право запису відбираємо в обох клієнтських ролей — тим самим прийомом, яким
-- уже захищені `trusted` і `approved_count`. Політика RLS тут не допомогла б:
-- «own profile update» законно пускає людину в СВІЙ рядок, і без колонкового
-- REVOKE вона дописала б собі `official = true` тим самим запитом, яким міняє ім'я.
revoke update (official) on public.profiles from anon, authenticated;
revoke insert (official) on public.profiles from anon, authenticated;
revoke update (official) on public.pages    from anon, authenticated;
revoke insert (official) on public.pages    from anon, authenticated;

-- ⚠️ СУПУТНЯ ЗНАХІДКА 09.08, закривається тут же. У `profiles` колонка `trusted`
-- має INSERT-право для anon/authenticated, політика вставки — лише `uid =
-- auth.uid()`, а BEFORE INSERT-сторожа на таблиці немає (єдиний тригер —
-- `trg_sync_profile_denorm`, і він AFTER UPDATE). Тобто людина, створюючи свій
-- профіль ПЕРШИМ запитом, могла вписати собі `trusted = true` і отримати
-- автопублікацію оголошень без модерації. UPDATE був закритий, INSERT — ні.
-- 🛑 ЧЕСНО: живою пробою це НЕ доведено — вставка це запис, а запис із сесії
-- заблоковано. Довести після накату спробою вставки від імені `authenticated`.
revoke insert (trusted, approved_count) on public.profiles from anon, authenticated;

-- ── КРОК 12 ЗАОДНО: `get_public_profile` доганяє клієнта ────────────────────
-- 🔑 Одна редакція функції на обидва кроки НАВМИСНО. Потік 3 і крок 12 обидва
-- переписують `get_public_profile`; двома окремими файлами другий накат мовчки
-- стер би поля першого.
--
-- Прод віддавав **6 полів**, а `src/core/profile-card.js` уже малює `bio` і
-- `age` — тобто картка профілю була написана під дані, яких їй ніколи не давали.
-- Клієнта міняти НЕ треба взагалі, бракувало саме цих полів.
--
-- 🛑 ВІК ПУБЛІЧНО НЕ ПОКАЗУЄМО — рішення Вови 09.08 після розбору.
-- Спершу прозвучало «можна», далі Вова перепитав «а можливо ні?» і погодився з
-- трьома доводами. Записую їх сюди, бо `profile-card.js` уміє малювати `age`, і
-- наступна сесія неодмінно вирішить, що це недогляд, і «полагодить»:
--   1. **Згода не була поінформована.** Дату народження люди вписували у формі
--      профілю, яка ніде не казала «це побачать усі». Публікація заднім числом —
--      найгірший вид зміни, тихий.
--   2. **Неповнолітні.** У застосунку є приватний чат покупець↔продавець.
--      Публічне «15 років» біля імені й фото в селі, де всіх видно, — це маркер,
--      який ми малюємо самі. Ризик малоймовірний, ціна помилки непропорційна.
--   3. **Вік не працює на жоден сценарій.** Ні на довіру в угоді, ні на
--      впізнавання (у селі впізнають за іменем і фото). Відчуття «свій/новачок»
--      уже дає рядок «Учасник CSTL LIFE з <місяць> <рік>» — а він побудований із
--      даних, зданих саме для цього.
-- ✅ `bio` показуємо: людина пише його своїми словами й очевидно для показу.
-- ➡️ Повертати `age` — лише разом із явним питанням у формі профілю
--    («показувати вік у публічній картці?») і з дефолтом «ні».
-- 🔴 DROP ПЕРЕД CREATE — ОБОВʼЯЗКОВО, І ЦЕ НЕ ПРИДИРКА.
-- `create or replace` не вміє міняти НАБІР полів у `returns table`: Postgres
-- відповідає `42P13: cannot change return type of existing function`. Ми
-- додаємо `official` і `bio`, тобто набір міняється — отже лише через DROP.
-- ⚠️ Перша редакція цього файлу мала самий `create or replace` і впала на проді
-- у Вови. Добра новина: редактор Supabase виконує скрипт ОДНІЄЮ транзакцією,
-- тож усе відкотилось, база лишилась чистою — але саме тому DROP має стояти
-- ТУТ, а не окремим запитом «потім».
-- ⚠️ DROP забирає з функції права. Заміряно, які були: EXECUTE у PUBLIC, `anon`,
-- `authenticated`, `service_role`. Тому нижче їх повертаємо явно — покладатись
-- на дефолт Postgres тут не можна: мовчазна втрата прав виглядала б як
-- «картка профілю раптом порожня в гостей», і шукали б це в клієнті.
drop function if exists public.get_public_profile(uuid);

create function public.get_public_profile(p_uid uuid)
returns table(uid uuid, name text, avatar_url text, settlement text,
              trusted boolean, official boolean, bio text,
              created_at timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.uid, p.name, p.avatar_url, p.settlement, p.trusted, p.official,
         p.bio, p.created_at
  from public.profiles p
  where p.uid = p_uid
$function$;

grant execute on function public.get_public_profile(uuid)
  to anon, authenticated, service_role;

-- ── КРОК 15. RPC ДЛЯ АДМІНКИ ────────────────────────────────────────────────
-- ⚠️ Адмінка ходить у базу звичайним Google-входом, тобто роллю `authenticated`.
-- Після REVOKE вище пряме `update … set official` у неї не пройде — і не має.
-- Тому окрема функція зі сторожем `is_admin()` УСЕРЕДИНІ (взірець —
-- `admin_create_community`).
create or replace function public.admin_set_official(
  p_kind text, p_id text, p_value boolean
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  n integer;
begin
  if not is_admin() then
    raise exception 'official_not_admin';
  end if;

  if p_kind = 'profile' then
    update public.profiles set official = coalesce(p_value, false)
     where uid = p_id::uuid;
  elsif p_kind = 'page' then
    -- ⚠️ `pages.id` — bigint, `profiles.uid` — uuid. Саме тому параметр приходить
    -- текстом і приводиться тут: одна функція на два різні типи ключа.
    update public.pages set official = coalesce(p_value, false)
     where id = p_id::bigint;
  else
    raise exception 'official_bad_kind';
  end if;

  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'official_not_found';
  end if;
  return true;
end;
$function$;

revoke all on function public.admin_set_official(text, text, boolean) from public, anon;
grant execute on function public.admin_set_official(text, text, boolean) to authenticated;

-- Список людей для адмінки. 🔑 Без нього перемикач нема куди вішати: політика
-- «own profile read» пускає людину лише у ВЛАСНИЙ рядок, тобто адмінка чужих
-- профілів не бачить взагалі — вона ходить у базу звичайним Google-входом.
-- ⚠️ Віддає рівно те, що потрібно, щоб упізнати людину і поставити позначку.
-- Телефон і точна дата народження сюди не йдуть: адмінка їх не показує, а
-- «щоб було» — це саме той шлях, яким контактні колонки й потрапили в публічну
-- вибірку `ads` (потік 1).
create or replace function public.admin_list_profiles(p_query text default null)
returns table(uid uuid, name text, surname text, email text, avatar_url text,
              settlement text, trusted boolean, official boolean,
              created_at timestamptz)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  q text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if not is_admin() then
    raise exception 'official_not_admin';
  end if;

  return query
    select p.uid, p.name, p.surname, p.email, p.avatar_url, p.settlement,
           p.trusted, p.official, p.created_at
    from public.profiles p
    where q is null
       or p.name     ilike '%' || q || '%'
       or p.surname  ilike '%' || q || '%'
       or p.email    ilike '%' || q || '%'
    order by p.official desc, p.created_at desc
    limit 200;
end;
$function$;

revoke all on function public.admin_list_profiles(text) from public, anon;
grant execute on function public.admin_list_profiles(text) to authenticated;

-- ── КРОК 16Б. ГАЛОЧКА ЇДЕ РАЗОМ З ІМЕНЕМ ────────────────────────────────────
-- 🔴 ДРУГЕ ЗАМОВЛЕННЯ ВОВИ (09.08, дослівно): *«якщо вона є, вона має
-- відображатися ВСЮДИ де пише ім'я користувача… бо хтось може зареєструватися
-- під таким іменем, а користувачі можуть просто прочитати, але не тапнути і не
-- відкрити картку жителя»*.
--
-- 🔑 Чому саме `get_avatars`, а не новий запит. У застосунку вже є ОДНЕ місце
-- правди про чужі імена: кожна поверхня несе `data-name-uid`, а `hydrateNames`
-- підставляє живе імʼя батчем через цю функцію. Додавши сюди `official`, ми
-- отримуємо галочку в шапці чату, у списку розмов, в Обговореннях, у коментарях
-- і в авторі оголошення ОДНИМ рядком — без обходу кожного екрана.
-- Окремий RPC «дай офіційність» був би другим джерелом того самого і колись
-- розійшовся б із першим (у проєкті так уже двічі розходились копії).
--
-- ⚠️ DROP + CREATE + GRANT, а не `create or replace` — набір полів міняється,
-- Postgres відповів би `42P13` (той самий урок, що з `get_public_profile`).
-- Заміряно, які права були: EXECUTE у PUBLIC, anon, authenticated, service_role.
drop function if exists public.get_avatars(uuid[]);

create function public.get_avatars(uids uuid[])
returns table(uid uuid, name text, avatar_url text, official boolean)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select p.uid, p.name, p.avatar_url, p.official
  from public.profiles p
  where p.uid = any(uids[1:500])
$function$;

grant execute on function public.get_avatars(uuid[])
  to anon, authenticated, service_role;

-- ── КРОК 17. ЗАБОРОНЕНІ ІМЕНА ───────────────────────────────────────────────
-- Потік 1 закрив підробку ПІДПИСУ (клієнт більше не диктує, як підписати
-- повідомлення). Але ім'я у профілі людина вписує собі сама — і сервер сумлінно
-- підпише її «Адміністрацією CSTL LIFE», бо це справді ім'я профілю.
--
-- 🔑 Чому нормалізація обовʼязкова: без неї «Адмiнiстрацiя» з латинською «i»
-- пройде повз будь-який список (заміряно вище).
-- ⚠️ Пробіли схлопуємо ОКРЕМО — `text_norm_cyr` їх не чіпає, тож «А д м і н і с т
-- р а ц і я» інакше проходила б.
-- 🛑 Список свідомо з ДОВГИХ і однозначних слів. Урок B-29: злиття тексту без
-- пробілів робить із коротких стемів пастку для звичайної мови («роблять»
-- містило «блят»). Тут найкоротше — «сільрада», випадково його не набереш.
create or replace function public.profiles_guard_name()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  norm text;
  bad  text;
  reserved text[] := array[
    'адміністрація','адміністратор','модератор','сільрада','міськрада',
    'офіційнасторінка','службапідтримки','cstllife','cstlnews'
  ];
begin
  -- Офіційному акаунту можна називатись офіційно — це і є сенс галочки.
  if coalesce(new.official, false) then
    return new;
  end if;

  norm := regexp_replace(coalesce(public.text_norm_cyr(new.name), ''), '\s+', '', 'g');
  if norm = '' then
    return new;
  end if;

  foreach bad in array reserved loop
    if position(bad in norm) > 0 then
      raise exception 'name_reserved';
    end if;
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_profiles_guard_name on public.profiles;
create trigger trg_profiles_guard_name
  before insert or update of name on public.profiles
  for each row execute function public.profiles_guard_name();

-- ── ПЕРЕВІРКА ПІСЛЯ НАКАТУ ──────────────────────────────────────────────────
-- 1) Людина не може поставити собі галочку:
--      set local role authenticated;
--      set local request.jwt.claims = '{"sub":"<реальний uid>","role":"authenticated"}';
--      update public.profiles set official = true where uid = '<той самий uid>';
--      -- очікуємо відмову по правах на колонку
-- 2) Те саме для trusted (супутня знахідка) — вставка профілю з trusted = true
--    має бути відхилена.
-- 3) Заборонені імена:
--      update public.profiles set name = 'Адмiнiстрацiя' where uid = '<uid>';
--      -- очікуємо name_reserved (саме з латинською «i» — це і є перевірка
--      --  нормалізації, звичайний запис зловив би і наївний список)
--      update public.profiles set name = 'А д м і н і с т р а ц і я' where uid = '<uid>';
--      -- очікуємо name_reserved (перевірка схлопування пробілів)
--      update public.profiles set name = 'Олександр Прендецький' where uid = '<uid>';
--      -- очікуємо УСПІХ — контроль на хибне спрацювання
-- 4) Адмін ставить галочку:
--      select public.admin_set_official('profile', '<uid>', true);   -- true
--      select public.admin_set_official('page', '<id сторінки>', true);
-- 5) `get_public_profile` віддає 7 полів разом з `official`.
