-- scripts/supabase_page_push.sql
-- Надійні сповіщення про новий пост сторінки «Стрічки» (потік /byyou 24.07).
--
-- ЩО ЦЕ ЛІКУЄ
--   Раніше сповіщення слав БРАУЗЕР АВТОРА одразу після публікації. Якщо автор закрив
--   додаток, втратив мережу або пост створено інакше (адмінка, SQL) — сповіщення не
--   йшло НІКОЛИ і мовчки. Тепер розсилку запускає САМА БАЗА при появі поста.
--
-- ДВІ ЧАСТИНИ
--   1) page_push_log — журнал: про який пост розсилка вже була. Гарантує, що
--      сповіщення піде РІВНО РАЗ, навіть якщо функцію покличуть двічі (клієнт + тригер)
--      або якщо станеться повтор після збою мережі.
--   2) тригер AFTER INSERT ON page_posts → викликає Edge-функцію send-page-push
--      через pg_net (розширення для HTTP-запитів прямо з бази).
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

-- Пише і читає лише сервер (Edge Function через service_role). Людям тут нічого робити.
drop policy if exists "service manages page push log" on public.page_push_log;
create policy "service manages page push log" on public.page_push_log for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 2. Розширення для HTTP-запитів із бази ──────────────────────────────────
create extension if not exists pg_net with schema extensions;

-- ── 3. Ключ беремо з Vault (сховище секретів Supabase) ──────────────────────
-- ⚠️ Ключ service_role НЕ пишемо в цей файл — він потрапив би в git.
-- ОДИН РАЗ виконай окремо у SQL Editor, підставивши свій ключ
-- (Supabase → Project Settings → API → service_role, він же «secret»):
--
--   select vault.create_secret('ВСТАВ_СЮДИ_SERVICE_ROLE_КЛЮЧ', 'service_role_key');
--
-- Якщо колись зміниш ключ:
--   select vault.update_secret(id, 'НОВИЙ_КЛЮЧ') from vault.secrets where name = 'service_role_key';

-- ── 4. Функція тригера: кличе Edge-функцію send-page-push ───────────────────
create or replace function public.notify_new_page_post()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_key text;
  v_url text := 'https://uabyfecseqnemvcqhdem.supabase.co/functions/v1/send-page-push';
begin
  -- Ключ із Vault. Якщо секрет не заведено — тихо виходимо: публікація поста НЕ має
  -- падати через проблему зі сповіщеннями (пост важливіший за пуш).
  select decrypted_secret into v_key
    from vault.decrypted_secrets where name = 'service_role_key' limit 1;
  if v_key is null then
    raise warning 'notify_new_page_post: секрет service_role_key не заведено у Vault';
    return new;
  end if;

  -- Асинхронний HTTP-виклик: pg_net ставить запит у чергу і НЕ блокує вставку поста.
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := jsonb_build_object('post_id', new.id),
    timeout_milliseconds := 8000
  );
  return new;
end;
$$;

-- ── 5. Тригер: ЛИШЕ на новий пост ───────────────────────────────────────────
-- AFTER INSERT (не UPDATE) — рішення Вови 24.07: виправлення друкарської помилки
-- в опублікованому пості НЕ має слати людям друге сповіщення.
drop trigger if exists trg_notify_new_page_post on public.page_posts;
create trigger trg_notify_new_page_post
  after insert on public.page_posts
  for each row execute function public.notify_new_page_post();

-- ── Перевірка після накатування ─────────────────────────────────────────────
--   select * from page_push_log order by sent_at desc limit 5;          -- кому вже слали
--   select status_code, content from net._http_response
--     order by created desc limit 5;                                     -- відповіді Edge-функції
