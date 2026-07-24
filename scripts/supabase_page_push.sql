-- scripts/supabase_page_push.sql
-- Надійні сповіщення про новий пост сторінки «Стрічки» (потік /byyou 24.07).
--
-- ✅ УЖЕ НАКАТАНО 24.07 через Supabase MCP (міграція `page_push_trigger_and_log`).
--    Цей файл — джерело правди на випадок відновлення/повторного розгортання.
--
-- ЩО ЦЕ ЛІКУЄ
--   Раніше сповіщення слав БРАУЗЕР АВТОРА одразу після публікації. Якщо автор закрив
--   додаток, втратив мережу або пост створено інакше (адмінка, SQL) — сповіщення не
--   йшло НІКОЛИ і мовчки. Тепер розсилку запускає САМА БАЗА при появі поста.
--
-- ТРИ ЧАСТИНИ
--   1) page_push_log — журнал: про який пост розсилка вже була. Гарантує, що сповіщення
--      піде РІВНО РАЗ, навіть якщо функцію покличуть двічі (тригер + клієнт-підстраховка)
--      або станеться повтор після збою мережі.
--   2) app_secrets — спільний секрет, яким тригер доводить Edge-функції, що виклик
--      справді від бази. ⚠️ Свідомо НЕ використовуємо тут ключ service_role: він не має
--      з'являтись ані в git, ані в переписці. Функція має `verify_jwt = false` і
--      автентифікує себе САМА (секрет або токен автора).
--   3) тригер AFTER INSERT ON page_posts → кличе Edge-функцію через pg_net.
--
-- ⚠️ ЛИШЕ НОВІ ПОСТИ (рішення Вови 24.07): тригер на INSERT, не на UPDATE —
--    виправив друкарську помилку в пості → люди НЕ отримують друге сповіщення.
--
-- Ідемпотентно: можна виконувати повторно.

-- ── 1. Журнал розсилок ──────────────────────────────────────────────────────
create table if not exists public.page_push_log (
  post_id  bigint primary key references public.page_posts(id) on delete cascade,
  sent_at  timestamptz not null default now(),
  sent     int not null default 0            -- скільком пристроям реально відправлено
);
alter table public.page_push_log enable row level security;
drop policy if exists "service manages page push log" on public.page_push_log;
create policy "service manages page push log" on public.page_push_log for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 2. Спільний секрет «база ↔ Edge-функція» ────────────────────────────────
create table if not exists public.app_secrets (
  name       text primary key,
  value      text not null,
  created_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security;
drop policy if exists "service reads app secrets" on public.app_secrets;
create policy "service reads app secrets" on public.app_secrets for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- Значення секрету НЕ зберігаємо у git. Згенерувати і покласти (один раз):
--   insert into app_secrets (name, value)
--   values ('page_push_secret', encode(gen_random_bytes(32), 'hex'))
--   on conflict (name) do nothing;
-- Після зміни секрету нічого передеплоювати не треба — функція читає його з бази.

-- ── 3. Розширення для HTTP-запитів із бази ──────────────────────────────────
create extension if not exists pg_net with schema extensions;

-- ── 4. Функція тригера ──────────────────────────────────────────────────────
create or replace function public.notify_new_page_post()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_url text := 'https://uabyfecseqnemvcqhdem.supabase.co/functions/v1/send-page-push';
begin
  select value into v_secret from public.app_secrets where name = 'page_push_secret' limit 1;
  if v_secret is null then
    raise warning 'notify_new_page_post: секрет page_push_secret відсутній';
    return new;
  end if;

  -- Асинхронно: pg_net ставить запит у чергу і НЕ блокує вставку поста.
  -- Публікація поста важливіша за сповіщення — вона не має падати через пуш.
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',       'application/json',
                 'x-cstl-push-secret', v_secret
               ),
    body    := jsonb_build_object('post_id', new.id),
    timeout_milliseconds := 8000
  );
  return new;
end;
$$;

-- ── 5. Тригер: ЛИШЕ на новий пост ───────────────────────────────────────────
drop trigger if exists trg_notify_new_page_post on public.page_posts;
create trigger trg_notify_new_page_post
  after insert on public.page_posts
  for each row execute function public.notify_new_page_post();

-- ── Перевірка ───────────────────────────────────────────────────────────────
--   select tgname from pg_trigger where tgname = 'trg_notify_new_page_post';
--   select * from page_push_log order by sent_at desc limit 5;        -- кому вже слали
--   select status_code, content from net._http_response
--     order by created desc limit 5;                                   -- відповіді функції
--
-- Перевірено 24.07 наживо: чужий виклик → 401 «no auth»; підроблений секрет → 401
-- «bad secret»; правильний → 200. Вставка поста запускає тригер за ~40 мс.
