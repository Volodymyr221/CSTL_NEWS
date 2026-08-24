-- supabase_account_scoped_state.sql
-- 🔴 24.08.2026 — ПЕРСОНАЛЬНЕ ПЕРЕЇЖДЖАЄ В АКАУНТ.
--
-- Слово Вови дослівно: «все персональне… має зберігатись в акаунті, а не на
-- пристрої, якщо користувач виходить, він може тільки переглядати публічну
-- інформацію, а не взаємодіяти в рамках додатку».
--
-- Привід — реальний випадок на проді: Вова вийшов з акаунта «Олександр», зайшов
-- як «Володимир», а push прилетів на попередній акаунт.
--
-- ═══ ЩО САМЕ БУЛО ЗЛАМАНО (заміряно, не припущено) ═══════════════════════════
--
-- ── (1) PUSH-ПРИСТРІЙ НЕ ВІДВʼЯЗУВАВСЯ ПРИ ВИХОДІ ───────────────────────────
-- Запит до живої бази показав ОДИН endpoint під ДВОМА акаунтами:
--     Володимир — доданий 26.07
--     Олександр — доданий 24.08 08:09 UTC  (рівно коли Вова перемикався)
-- Причина: `signOut()` чистив лише памʼять і сесію, про базу там не було жодного
-- рядка. А `unique (uid, endpoint)` вважає ці два рядки цілком законними.
-- 🛑 Це не незручність, а ВИТІК: у тілі push лежить текст повідомлення.
--
-- ── (2) ЗБЕРЕЖЕНІ СТАТТІ ЖИЛИ НА ПРИСТРОЇ ───────────────────────────────────
-- Ключ `cstl_saved_articles` у `localStorage`, без жодної згадки про людину.
-- Доведено стендом `tests/account-scope.mjs` у живому браузері: акаунт Б бачить
-- статтю, збережену акаунтом А, і гість бачить її теж.
-- 🔑 Контроль у тому ж стенді: збережені ОГОЛОШЕННЯ (`saved_posts`, з `uid`) НЕ
-- протікають. Тобто зразок правильного рішення вже жив у проєкті — лишалось
-- звести статті до нього.

-- ── 1. ЗБЕРЕЖЕНІ СТАТТІ (дзеркалить `saved_posts`) ──────────────────────────
-- ⚠️ `article_id` — bigint, а не FK: статті лежать у `data/articles.json` у git,
-- таблиці статей у базі немає. Посилатись нема на що, і саме тому тут
-- зберігається ЛИШЕ номер — той самий принцип, що вже діяв у `localStorage`
-- («зберігаємо лише id, контент завжди з `articles.json`»).
create table if not exists public.saved_articles (
  uid        uuid not null references auth.users(id) on delete cascade,
  article_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (uid, article_id)
);
alter table public.saved_articles enable row level security;

-- Лише свої — рівно як у `saved_posts`. Чужі закладки не бачить ніхто, включно
-- з тим, хто сидить за тим самим телефоном.
drop policy if exists "saved articles own" on public.saved_articles;
create policy "saved articles own" on public.saved_articles for all
  using (uid = auth.uid()) with check (uid = auth.uid());

-- Порядок «найновіші зверху» бере аркуш «Збережені».
create index if not exists saved_articles_uid_created_idx
  on public.saved_articles (uid, created_at desc);

-- ── 2. ЗАХОПЛЕННЯ PUSH-ПРИСТРОЮ ОДНИМ АКАУНТОМ ──────────────────────────────
--
-- 🔑 ЧОМУ ЦЕ ФУНКЦІЯ, А НЕ ПРАВКА КЛІЄНТА. Вихід з акаунта прибирає СВІЙ рядок
-- (це вміє звичайна політика). Але рядок лишається ще й тоді, коли виходу не
-- було зовсім: застосунок убили, телефон розрядився, мережа впала. Тоді
-- наступний акаунт на тому самому пристрої успадкував би чужі сповіщення —
-- саме те, що сталося з Вовою.
--
-- 🛑 ЧОМУ ПРИБИРАННЯ ЧУЖИХ РЯДКІВ ТУТ БЕЗПЕЧНЕ, хоч виглядає небезпечно.
-- Функція видаляє рядки за `endpoint`, тобто теоретично можна стерти чужу
-- підписку. Практично — ні: `endpoint` це ~200 випадкових символів, які видає
-- Apple/Google, і прочитати чужий неможливо (політика `select` пускає лише до
-- своїх рядків, решта — тільки `service_role`). Назвати те, чого не бачиш, не
-- вийде, а вгадати — тим більше.
-- ⚠️ І окремо чесно: «покласти СВІЙ рядок з чужим endpoint» можливе було й до
-- цієї функції — політика `with check (uid = auth.uid())` перевіряє людину, а не
-- пристрій. Тобто нової дірки тут не зʼявляється, закривається стара.
--
-- 🔑 Одна транзакція, а не «видали, потім встав»: між двома окремими запитами
-- існувало б вікно, у якому пристрій не належить нікому і сповіщення губляться.
create or replace function public.claim_push_device(
  p_endpoint text,
  p_p256dh   text,
  p_auth_key text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_endpoint is null or length(p_endpoint) < 20 then
    raise exception 'bad endpoint' using errcode = '22023';
  end if;

  -- Пристрій може належати РІВНО ОДНОМУ акаунту: у браузері одночасно
  -- залогінена одна людина, тож будь-який інший рядок із цим endpoint —
  -- слід попереднього входу, а не чинна підписка.
  delete from public.user_push_devices
   where endpoint = p_endpoint and uid <> auth.uid();

  insert into public.user_push_devices (uid, endpoint, p256dh, auth_key)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth_key)
  on conflict (uid, endpoint) do update
     set p256dh = excluded.p256dh, auth_key = excluded.auth_key;
end;
$$;

revoke all on function public.claim_push_device(text, text, text) from public;
grant execute on function public.claim_push_device(text, text, text) to authenticated;

-- ── 3. ОДНОРАЗОВЕ ПРИБИРАННЯ ВЖЕ НАКОПИЧЕНОГО ───────────────────────────────
-- На момент міграції в базі лежить один endpoint під двома акаунтами (той
-- самий iPhone Вови). Лишити його означало б, що фікс діє лише для майбутніх
-- входів, а наявна пара так і слатиме сповіщення не тому.
-- 🔑 Лишаємо НАЙНОВІШИЙ рядок кожного endpoint: він відповідає тому, хто
-- заходив останнім, тобто чинному власнику пристрою.
delete from public.user_push_devices d
 where exists (
   select 1 from public.user_push_devices d2
    where d2.endpoint = d.endpoint
      and (d2.created_at, d2.id) > (d.created_at, d.id)
 );

-- ── ЯК ПЕРЕВІРИТИ ───────────────────────────────────────────────────────────
--   select endpoint, count(*) from public.user_push_devices
--    group by endpoint having count(*) > 1;      -- має бути порожньо ЗАВЖДИ

-- ── ДОВЕДЕНО НА ЖИВІЙ БАЗІ 24.08 (роль `authenticated`, підставлені JWT) ─────
-- Обидві половини перевірені сценарієм, а не міркуванням.
--
--   ЗБЕРЕЖЕНІ СТАТТІ                          очікували  вийшло
--   А вставив і бачить своє                       1        1  ✅
--   Б бачить закладку А                           0        0  ✅
--   Б стер рядків А                               0        0  ✅
--   А стер своє                                   1        1  ✅
--
--   ЗАХОПЛЕННЯ ПРИСТРОЮ (той самий телефон)   очікували  вийшло
--   після входу А — рядків з цим пристроєм        1        1  ✅
--   після входу Б — рядків з цим пристроєм        1        1  ✅
--   пристрій належить                             Б        Б  ✅
--   після виходу Б — рядків лишилось              0        0  ✅
--
-- 🔑 Третій рядок і є сценарієм Вови: до фікса після входу Б рядків було ДВА і
-- пристрій належав обом. Тепер попередній акаунт віддає його автоматично.
