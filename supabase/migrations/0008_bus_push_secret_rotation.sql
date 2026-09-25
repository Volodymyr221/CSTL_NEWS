-- 0008_bus_push_secret_rotation.sql — СЕКРЕТ PUSH БІЛЬШЕ НЕ ЛЕЖИТЬ ВІДКРИТИМ.
-- Пункт 2 списку `_ai-tools/ZAVDANNIA_VOVI_2026-09-24.md`. Накочено 25.09.2026.
--
-- 🔴 ЩО БУЛО ЗАМІРЯНО, А НЕ ПРИПУЩЕНО (25.09, з живої бази):
--   • Секрет `x-cstl-push-secret` доводить Edge Functions базі. Усі СІМ
--     функцій-викликачів у базі беруть його з `public.app_secrets` на льоту
--     (`flush_page_comment_push`, `notify_event_reminders`, `notify_new_answer`,
--     `notify_new_page_comment`, `notify_new_page_post`,
--     `notify_unanswered_questions`, `nudge_rss_parser`) — звірено по `prosrc`.
--   • І рівно ОДНЕ місце випадало зі схеми: завдання розкладу `send-bus-push`
--     (`cron.job`, jobid 4) будувало заголовки РЯДКОМ, із секретом усередині.
--     Тобто хто міг читати розклад — читав і секрет.
--
-- ⚠️ ЩО В ТОМУ РЯДКУ БУЛО НЕ СЕКРЕТОМ, хоч і виглядало ним: `Bearer` там —
--    ключ `sb_publishable_…`, той самий, що лежить у `bundle.js` і в тілі
--    `nudge_rss_parser`. Звірено відбитком md5: збігається. Публічний ключ
--    перевипускати нема потреби, і цей файл його не чіпає.
--
-- 🔑 ПОРЯДОК НАВМИСНИЙ, І ЙОГО НЕ МОЖНА МІНЯТИ МІСЦЯМИ. Спершу завдання
--    переводиться на читання сховища, і ЛИШЕ ПОТІМ міняється значення. Навпаки
--    вийшло б вікно, у якому завдання шле старий секрет, а функція чекає нового:
--    щохвилинна розсилка автобусів мовчки віддавала б 401. Після цього файлу
--    обидві сторони читають ОДИН рядок, тож розійтись їм більше нема як.
--
-- 🛑 НОВОГО ЗНАЧЕННЯ НЕ БАЧИВ НІХТО, включно з тим, хто це накочував: його
--    народжує сама база (`gen_random_bytes`). Тому воно не лежить ні в цьому
--    файлі, ні в журналі сесії, ні в історії репозиторію — а репозиторій
--    ПУБЛІЧНИЙ.

-- ── 1. ВИКЛИКАЧ, ЯКИЙ ЧИТАЄ СХОВИЩЕ ─────────────────────────────────────────
-- Той самий крій, що й у решти семи. `url` і публічний ключ беруться з уже
-- існуючого завдання, а не вписуються руками: так у файл не потрапляє навіть
-- те, що можна було б переплутати з секретом.
do $$
declare
  стара_команда text;
  адреса        text;
  публічний     text;
begin
  select command into стара_команда from cron.job where jobname = 'send-bus-push';
  if стара_команда is null then
    raise exception 'Немає завдання send-bus-push — накочувати нема на що';
  end if;

  адреса    := (regexp_match(стара_команда, 'url\s*:=\s*''([^'']+)'''))[1];
  публічний := (regexp_match(стара_команда, 'Bearer ([A-Za-z0-9_.-]+)'))[1];

  if адреса is null or публічний is null then
    raise exception 'Не впізнав крій команди send-bus-push — зупиняюсь, щоб не зламати розсилку';
  end if;

  execute format($тіло$
    create or replace function public.nudge_bus_push() returns void
    language plpgsql
    as $ф$
    declare
      секрет text;
    begin
      select value into секрет from public.app_secrets where name = 'bus_push_secret';
      -- Тиха відмова, а не виняток: інакше кожна хвилина лишала б рядок помилки
      -- у журналі запусків, а саме він торік зжер диск (див. 0007).
      if секрет is null or секрет = '' then
        return;
      end if;

      perform net.http_post(
        url     := %L,
        headers := jsonb_build_object(
          'Content-Type',       'application/json',
          'Authorization',      'Bearer ' || %L,
          'x-cstl-push-secret', секрет),
        body    := '{}'::jsonb);
    end;
    $ф$;
  $тіло$, адреса, публічний);
end $$;

comment on function public.nudge_bus_push() is
  'Щохвилинний поштовх send-bus-push. Секрет бере з app_secrets на льоту —
   саме тому його більше немає в тілі завдання розкладу (міграція 0008).';

-- Викликає лише розклад (він ходить від postgres). Нікому іншому не треба.
revoke all on function public.nudge_bus_push() from public, anon, authenticated;

-- ── 2. ЗАВДАННЯ РОЗКЛАДУ БЕЗ СЕКРЕТУ В ТІЛІ ─────────────────────────────────
select cron.schedule('send-bus-push', '* * * * *', 'select public.nudge_bus_push();');

-- ── 3. ПЕРЕВИПУСК ───────────────────────────────────────────────────────────
-- 32 байти з `gen_random_bytes` у шістнадцятковому вигляді — 64 знаки, рівно
-- як у старого значення, тож нічого в довжині не змінюється.
update public.app_secrets
   set value = encode(gen_random_bytes(32), 'hex')
 where name = 'bus_push_secret';

-- ── 4. ЗАЙВІ ПРАВА НА САМЕ СХОВИЩЕ ──────────────────────────────────────────
-- 🔴 Знайдено дорогою: на `app_secrets` висіли ПОВНІ табличні права для `anon`
--    і `authenticated` (select, insert, update, delete). Рядки ховала лише RLS
--    (одна політика, `service_role`) — заміряно з-під `anon`: 0 рядків.
--    Тобто діри сьогодні не було, але тримався захист на одному цвяху: вимкнули б
--    RLS на хвилину для налагодження — і секрети поїхали б у браузер.
--    Функції це не зачіпає: вони ходять від `service_role` і від postgres.
revoke all on table public.app_secrets from anon, authenticated;

-- ── ПЕРЕВІРКА ПІСЛЯ НАКАТУ ──────────────────────────────────────────────────
--   select jobname, command from cron.job where jobname = 'send-bus-push';
--     -- очікуємо рівно `select public.nudge_bus_push();`, без жодного ключа
--   select count(*) from cron.job where command ilike '%x-cstl-push-secret%';
--     -- очікуємо 0
--   select public.nudge_bus_push();
--   select status_code from net._http_response order by created desc limit 1;
--     -- очікуємо 200; 401 означає, що функція не бачить нового значення
