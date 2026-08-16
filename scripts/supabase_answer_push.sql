-- ============================================================================
-- СПОВІЩЕННЯ ПРО ВІДПОВІДЬ НА ПИТАННЯ / КОМЕНТАР ДО ОГОЛОШЕННЯ (16.08.2026)
-- ============================================================================
--
-- 🔴 ЯКУ ДІРУ ЦЕ ЗАКРИВАЄ (знайдено аудитом 16.08, підтверджено на живій базі).
-- Тригери сповіщень стояли лише на `page_comments` і `page_posts` («Стрічка») та
-- на приватних повідомленнях. На таблиці `comments` — тій самій, де живуть
-- ВІДПОВІДІ НА ПИТАННЯ і коментарі до оголошень Дошки — не було ЖОДНОГО.
--
-- Наслідок: людина ставила питання громаді, їй відповідали — і вона про це не
-- дізнавалась, поки сама не поверталась і не перевіряла. Головний цикл вкладки
-- «Питання» («запитав → тобі відповіли») був розірваний.
--
-- 🔑 ЧОМУ ОДИН МЕХАНІЗМ НА ПИТАННЯ Й ОГОЛОШЕННЯ: `comments` — спільна таблиця,
--    `posts.type` розрізняє ('chat' = питання, решта = оголошення). Розділяти це
--    на два тригери означало б дві копії одного правила, а в проєкті вже двічі
--    розходились копії (списки антиспаму). Різниця лише в ТЕКСТІ сповіщення, і
--    вона живе в Edge-функції, де їй і місце.
--
-- ⚠️ Секрет НЕ новий — той самий `page_push_secret`, що вже обслуговує дві
--    функції. Нової сутності не заводимо.
-- ============================================================================

-- ── 1. Журнал: рівно одне сповіщення на відповідь ───────────────────────────
-- Первинний ключ по `comment_id` робить повторний виклик (ретрай мережі, друге
-- спрацювання тригера) безпечним no-op — той самий прийом, що в
-- `page_comment_push_log`.
-- ⚠️ `post_id` ДЕНОРМАЛІЗОВАНИЙ навмисно. Вікно тиші питає «чи слали щось під ЦИМ
--    записом за останні 10 хв»; через `comments` це був би вкладений запит
--    PostgREST (embed), тобто зайва залежність від назви відношення. Один стовпчик
--    робить перевірку тривіальною і незалежною від схеми.
create table if not exists public.answer_push_log (
  comment_id bigint primary key references public.comments(id) on delete cascade,
  post_id    bigint,
  sent       int         not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists answer_push_log_post_recent
  on public.answer_push_log (post_id, created_at desc);

alter table public.answer_push_log enable row level security;
-- Читає і пише лише service_role (Edge-функція). Людям тут нічого робити.
revoke all on public.answer_push_log from anon, authenticated;

-- ── 2. Тригер: нова відповідь → Edge-функція ────────────────────────────────
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_answer()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret text;
  v_url text := 'https://uabyfecseqnemvcqhdem.supabase.co/functions/v1/send-answer-push';
begin
  select value into v_secret from public.app_secrets where name = 'page_push_secret' limit 1;
  if v_secret is null then
    raise warning 'notify_new_answer: секрет page_push_secret відсутній';
    return new;
  end if;

  -- Асинхронно: публікація відповіді важливіша за сповіщення і НЕ має падати
  -- через нього. Якщо функція недоступна — людина все одно побачить відповідь.
  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type',       'application/json',
                 'x-cstl-push-secret', v_secret
               ),
    body    := jsonb_build_object('comment_id', new.id),
    timeout_milliseconds := 8000
  );
  return new;
end;
$$;

-- ЛИШЕ на вставку: редагування відповіді не є новою подією для читача.
drop trigger if exists trg_notify_new_answer on public.comments;
create trigger trg_notify_new_answer
  after insert on public.comments
  for each row execute function public.notify_new_answer();

-- ⚠️ Порядок тригерів на `comments` (за іменем): `trg_comments_antispam` (BEFORE)
--    відпрацьовує ДО вставки, тож у `trg_notify_new_answer` (AFTER) потрапляють
--    лише ті відповіді, які база прийняла. Спам сповіщень не породжує.
