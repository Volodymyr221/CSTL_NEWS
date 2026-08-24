-- scripts/supabase_notif_prefs.sql
-- НАЛАШТУВАННЯ СПОВІЩЕНЬ, ЯКІ СПРАВДІ ПРАЦЮЮТЬ (24.08.2026) — закриває B-33.
--
-- 🔴 ЩО БУЛО. Чотири тумблери в кабінеті («Автобуси · Світло · Новини · Дошка»)
-- писались у `localStorage` під ключем `notif_prefs:<uid>` і **не читались ніде**:
-- `grep` по `src/`, `supabase/`, `scripts/` давав рівно одного споживача — той
-- самий файл, що їх писав. Edge Functions шлють push на всі пристрої людини,
-- ні про які налаштування не питаючи.
--
-- 📐 Заміряно по кожному тумблеру окремо, бо випадки різні:
--   • «Автобуси» — підписка СПРАВЖНЯ (`push_subscriptions`, порейсова), але
--     вимикається ІНШИМ місцем. Два вимикачі на одну річ, і кабінетний бреше:
--     людина вимикає — push приходить — довіра падає до ВСІХ сповіщень;
--   • «Дошка» — не перевіряється взагалі;
--   • «Світло» і «Новини» — вимикають те, чого НЕ ІСНУЄ: функцій
--     `send-power-push` / `send-news-push` у проєкті немає. Це вада з фальшивим
--     підтвердженням: вимкнув, нічого не приходить — «отже працює».
--
-- ⚠️ Слово Вови 23.08: «Декоративного в нас нічого не має бути, у нас все має
-- бути робоче. Тобто скасування сповіщення має бути робоче».
--
-- 🔑 ЧОМУ В БАЗУ, А НЕ ЛИШИТИ В `localStorage`. Друга половина тієї ж вади:
-- налаштування жили НА ПРИСТРОЇ. Вимкнув на телефоні — на компʼютері й далі
-- приходить, і навпаки. Push прив'язаний до акаунта (`user_push_devices.uid`),
-- отже і його вимикач мусить бути акаунтним.
--
-- 🛑 КОЛОНКИ, А НЕ РЯДКИ `(uid, topic, enabled)`. Edge Function читає префи
-- ОДНИМ запитом перед надсиланням, і колонковий вигляд дає рівно один рядок на
-- людину замість вибірки з групуванням. Тем мало і вони змінюються рідко.

create table if not exists public.notif_prefs (
  uid        uuid        primary key,
  -- Теми названі за РЕАЛЬНИМИ push, які існують у проєкті (звірено 24.08):
  buses      boolean     not null default true,   -- send-bus-push
  board      boolean     not null default true,   -- send-answer-push (оголошення) + коментарі до них
  questions  boolean     not null default true,   -- send-answer-push (питання)
  feed       boolean     not null default true,   -- send-page-push + send-comment-push («Стрічка»)
  updated_at timestamptz not null default now()
);

-- 🛑 ЧОГО ТУТ НЕМАЄ І ЧОМУ.
--   • `power` / `news` — таких push не існує. Тумблер під те, чого немає, — це
--     та сама декорація, тільки з обіцянкою на майбутнє. Заведемо push про
--     світло — повернемо тумблер РАЗОМ із ним.
--   • приватні повідомлення (`send-chat-push`) і груповий чат
--     (`send-group-push`) — це ПЕРСОНАЛЬНЕ ЗВЕРНЕННЯ до конкретної людини.
--     Те саме правило, що вже діє всередині `send-answer-push`: «вам
--     відповіли» не притишується ніколи. Вимкнути їх = вимкнути сам месенджер,
--     а для цього є видалення акаунта, не тумблер.

alter table public.notif_prefs enable row level security;

-- Свої налаштування — читати й міняти. Чужі не видно взагалі.
-- ⚠️ Політика виражена ВІД КОЛОНКИ (`uid = auth.uid()`), а не через функцію
-- `*_visible(id)`: за правилом №11-БІС SELECT-політика не сміє питати про
-- власний щойно вставлений рядок, інакше `INSERT … RETURNING` (а саме так
-- працює `.upsert().select()` у supabase-js) відкотиться з 42501.
drop policy if exists "notif own read"   on public.notif_prefs;
drop policy if exists "notif own write"  on public.notif_prefs;
drop policy if exists "notif own update" on public.notif_prefs;

create policy "notif own read"   on public.notif_prefs for select using (uid = auth.uid());
create policy "notif own write"  on public.notif_prefs for insert with check (uid = auth.uid());
create policy "notif own update" on public.notif_prefs for update
  using (uid = auth.uid()) with check (uid = auth.uid());

-- Edge Functions ходять під `service_role` — він обходить RLS, окремої політики
-- для нього не потрібно (той самий підхід, що в `answer_push_log`).

-- Перевірка після накату:
--   select count(*) from notif_prefs;                                  -- 0
--   select count(*) from pg_policies where tablename='notif_prefs';    -- 3
