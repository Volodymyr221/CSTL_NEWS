-- scripts/supabase_unanswered_push.sql
-- ТИП 4 — «У ГРОМАДІ ПИТАННЯ БЕЗ ВІДПОВІДІ» (24.08.2026, крок 6 MVP).
--
-- 🔴 ЧОМУ ЦЕЙ ТИП ЧЕКАВ І НЕ РОБИВСЯ РАНІШЕ. Він єдиний з чотирьох, на який
-- людина НЕ підписувалась: ні питання не ставила, ні відповіді не писала в
-- ньому. Отже вимикач у типу 4 не «в собі» (як кнопка «Мене теж цікавить» у
-- типу 3), а мусить бути в налаштуваннях. Поки вимикачі кабінету були
-- декоративні (B-33), увімкнути цей тип означало б завести сповіщення, яке
-- НЕМОЖЛИВО вимкнути — а це і є визначення спаму. Тому порядок був жорсткий:
-- спершу `notif_prefs` (24.08), і аж потім тип 4.
--
-- 🛑 І це НЕ РОЗСИЛКА. Замовлення описувало push «у громаді 5 питань без
-- відповіді» широкому колу; звужено до тих, хто **вже відповідав у Питаннях за
-- останні 90 днів** (`docs/QA_CONCEPT.md` §13-§14). Джерело — таблиця
-- `comments`, нічого про людину не вгадується: «я відповідаю людям у Питаннях»
-- — це те, що людина може згадати про себе (`HOT_RULES` №12).
--
-- Що робить ця міграція:
--   1) журнал `qa_unanswered_push_log` — щоб тримати межу «не частіше 1 разу
--      на 3 доби на людину» (§15);
--   2) функцію-обгортку `notify_unanswered_questions()`, яка кличе Edge
--      Function `send-unanswered-push`;
--   3) розклад `pg_cron` — двічі на добу, о 08:00 і 09:00 UTC.
--
-- 🔑 ЧОМУ ДВА ЗАПУСКИ, ЯКЩО ПРОХІД ОДИН. Замовлено «один прохід об 11:00 за
-- Києвом». `pg_cron` живе в UTC і про перехід на літній час не знає: влітку
-- 11:00 Києва = 08:00 UTC, взимку = 09:00 UTC. Прибитий до одного числа розклад
-- двічі на рік мовчки поїхав би на годину. Тому будильник дзвонить двічі, а сама
-- функція звіряє київську годину і працює РІВНО ОДИН раз — другий виклик
-- виходить із `{"reason":"not the hour"}`. Перевірка часу живе там, де є
-- нормальна робота з часовими поясами, а не в рядку розкладу.

-- ── 1. ЖУРНАЛ НАДІСЛАНОГО ─────────────────────────────────────────────────────
--
-- ⚠️ Таблиця СЛУЖБОВА: RLS увімкнено, політик НЕМАЄ жодної — як у
-- `answer_push_log` і `answer_push_targets`. Доступ лише `service_role` (Edge
-- Function). Рядки кажуть, кого застосунок просив допомогти — це персональні
-- дані, і житель їх бачити не мусить.
create table if not exists public.qa_unanswered_push_log (
  id         bigserial   primary key,
  uid        uuid        not null,
  -- Які саме питання пропонували цій людині. Потрібне не для межі 3 діб (для
  -- неї досить часу), а щоб було чим пояснити скаргу «мені прийшло не те».
  posts      bigint[]    not null,
  sent       int         not null default 0,
  created_at timestamptz not null default now()
);

-- Головний запит функції: «чи писали цій людині за останні 3 доби».
create index if not exists qa_unanswered_push_log_recent
  on public.qa_unanswered_push_log (uid, created_at desc);

alter table public.qa_unanswered_push_log enable row level security;
-- Політик немає навмисно — див. пояснення вище.

-- ── 2. ОБГОРТКА ДЛЯ РОЗКЛАДУ ──────────────────────────────────────────────────
--
-- 🔑 ЧОМУ ФУНКЦІЯ, А НЕ `net.http_post` ПРЯМО В РОЗКЛАДІ. Наявна робота
-- `send-bus-push` тримає спільний секрет ВПИСАНИМ у текст розкладу
-- (`cron.job.command`), тобто секрет лежить ще в одному місці й потрапляє в
-- кожен дамп таблиці розкладів. Тут він читається з `app_secrets` у момент
-- виклику: у розкладі лишається сама назва функції, а секрет — там, де вже
-- зберігається. Ротація секрету не вимагає чіпати розклад.
--
-- ⚠️ БЕЗ `security definer` НАВМИСНО. Функція має рівно ті права, з якими її
-- викликали. Розклад `pg_cron` крутиться від `postgres`, який `app_secrets`
-- читає; будь-хто інший прочитає `null` і функція тихо нічого не зробить.
-- `security definer` тут дав би стороннім чужі права — і рівно нуль користі.
create or replace function public.notify_unanswered_questions()
returns void
language plpgsql
set search_path = public, extensions
as $$
declare
  секрет text;
begin
  select value into секрет from public.app_secrets where name = 'page_push_secret';
  if секрет is null or секрет = '' then
    return;   -- немає чим підтвердити довіру — краще нічого, ніж виклик без секрету
  end if;

  perform net.http_post(
    url     := 'https://uabyfecseqnemvcqhdem.supabase.co/functions/v1/send-unanswered-push',
    headers := jsonb_build_object(
      'Content-Type',        'application/json',
      -- Публічний ключ (той самий, що в `src/core/supabase.js`), бо у функції
      -- `verify_jwt` УВІМКНЕНО. Секрет нижче — ДРУГИЙ рубіж, а не заміна цього.
      'Authorization',       'Bearer sb_publishable_sbV0XNktCiTK0iA4659P9g_Y3sT0mDv',
      'x-cstl-push-secret',  секрет),
    body    := '{}'::jsonb);
end;
$$;

-- Викликати має лише розклад. Прибираємо право, яке Postgres роздає за
-- замовчуванням усім.
revoke execute on function public.notify_unanswered_questions() from public;
revoke execute on function public.notify_unanswered_questions() from anon, authenticated;

-- ── 3. РОЗКЛАД ────────────────────────────────────────────────────────────────
select cron.unschedule('qa-unanswered-push')
  where exists (select 1 from cron.job where jobname = 'qa-unanswered-push');

select cron.schedule(
  'qa-unanswered-push',
  '0 8,9 * * *',                              -- 11:00 за Києвом (літо / зима)
  $$select public.notify_unanswered_questions()$$
);

-- Перевірка після накату:
--   select count(*) from qa_unanswered_push_log;                                  -- 0
--   select relrowsecurity from pg_class where relname='qa_unanswered_push_log';   -- t
--   select jobname, schedule, active from cron.job where jobname='qa-unanswered-push';
