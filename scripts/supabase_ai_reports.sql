-- scripts/supabase_ai_reports.sql
-- Міграція `analytics_ai_reports` — 26.08.2026.
--
-- 🗣️ ЗАМОВЛЕННЯ ВОВИ, ДОСЛІВНО: «зроби ще, щоб була якась база зберігання цих аудитів,
-- я щойно зберіг, заблокував телефон, він з'явився, і я розблокував телефон, оновив його
-- і він відразу пропав».
--
-- 🔴 ЧОМУ ЦЕ НЕ ДРІБНИЦЯ. Висновок жив ЛИШЕ в пам'яті відкритої сторінки. Будь-яке
-- перемальовування — повернення у вкладку, оновлення, перезапуск застосунку після
-- блокування екрана — стирало його безслідно. А кожен виклик КОШТУЄ ГРОШЕЙ: тобто
-- випадковий дотик до екрана спалював гроші й забирав уже куплений текст.
-- 🔑 Заразом це прибирає другу ваду, м'якшу, але постійну: щоб просто ПОДИВИТИСЬ
-- учорашній висновок, доводилось платити за новий.
--
-- 🔑 `snapshot` — ГОЛОВНА КОЛОНКА ЦІЄЇ ТАБЛИЦІ, а не додаток до тексту.
-- Без чисел, на яких висновок зроблено, через тиждень його неможливо ні перевірити, ні
-- зрозуміти: «6 людей» у тексті й «6 людей» на екрані сьогодні — це різні шість людей.
-- Саме збережений знімок робить із записів ІСТОРІЮ, а не стрічку думок.
-- ➡️ І він же — готова основа для порівняння періодів, яке Вова просив обміркувати
-- окремо: маючи знімки, «минулий тиждень проти поточного» рахується без нових запитів.
--
-- 🛑 ПИСАТИ МОЖЕ ЛИШЕ СЕРВЕР. Політики `insert` для `authenticated` тут НЕМАЄ ЗОВСІМ —
-- запис робить Edge Function під `service_role`, який RLS обходить. Якби вставку
-- дозволили клієнту, будь-який залогінений адмін (а завтра — будь-яка вада в адмінці)
-- міг би покласти в журнал вигаданий «висновок AI» з вигаданими числами. Журнал, у який
-- можна дописати руками, не варто вести взагалі.

create table if not exists public.analytics_ai_reports (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  author_uid   uuid references auth.users(id) on delete set null,
  author_email text,
  model        text,
  -- Які саме зрізи увійшли у вхідні дані — щоб через місяць було видно, що читала
  -- модель, коли набір періодів зміниться.
  periods      text[] not null default '{}',
  summary_text text not null,
  -- 🔑 Обрубок мусить лишатись позначеним і в журналі: інакше через тиждень недописаний
  -- висновок читатиметься як повний. Та сама вимога, що на екрані.
  truncated    boolean not null default false,
  usage        jsonb,
  snapshot     jsonb
);

-- Журнал читають лише «останні N», тому індекс рівно під це.
create index if not exists analytics_ai_reports_created_idx
  on public.analytics_ai_reports (created_at desc);

alter table public.analytics_ai_reports enable row level security;

-- Читає лише адмін. Та сама функція, що й скрізь у цьому розділі, — щоб правило доступу
-- було ОДНЕ на весь застосунок і не розійшлось копіями.
drop policy if exists "Admins read ai reports" on public.analytics_ai_reports;
create policy "Admins read ai reports" on public.analytics_ai_reports
  for select to authenticated using (is_admin());

-- ⚠️ Політик insert/update/delete НЕМАЄ НАВМИСНО — див. шапку. `service_role` їх не
-- потребує, а всі інші не мають права дописувати в журнал.

revoke all on public.analytics_ai_reports from anon;
grant select on public.analytics_ai_reports to authenticated;

-- ── ЯК ПЕРЕВІРИТИ ───────────────────────────────────────────────────────────────
-- begin;
--   select set_config('request.jwt.claims',
--     json_build_object('email',(select email from admins limit 1),'role','authenticated')::text, true);
--   set local role authenticated;
--   select count(*) from analytics_ai_reports;          -- адмін бачить
--   insert into analytics_ai_reports (summary_text) values ('спроба');  -- МУСИТЬ упасти
-- rollback;
