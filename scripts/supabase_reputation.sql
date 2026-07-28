-- scripts/supabase_reputation.sql
-- Захід 2 — Репутація користувача + автопублікація (Дошка громади).
-- Мета: після 5 схвалених постів автор стає «довіреним» → його оголошення
-- публікуються ОДРАЗУ (без ручної модерації). Запобіжник: модератор відхилив
-- пост довіреного → довіра скидається (лічильник у 0, знову на ручну модерацію).
-- Плюс серверний рейт-ліміт (обмеження частоти): не більше 3 постів/хв на автора.
--
-- ЗАСТОСОВАНО (08.07.2026, через MCP apply_migration, project uabyfecseqnemvcqhdem).
-- Скрипт ІДЕМПОТЕНТНИЙ (additive) — можна запускати повторно, дані не втрачаються.
--
-- ✅ 28.07.2026 — підтримка ЦІНИ вже НА ПРОДІ (міграція `board_price_support_submit`,
--    20260728122041, накатана 12:20 UTC). Накочувати цей файл повторно НЕ треба —
--    він лише дзеркалить те, що в базі. Доведено живими даними: пост id 53
--    «Продаю машину» має price=1500.00, currency='UAH'.
--    Файл лишається ЄДИНИМ джерелом тіла цієї функції — окремої копії в новому
--    файлі свідомо не робимо (дві копії вже коштували проєкту розʼїзду антиспаму).
-- ============================================================================


-- 1. profiles: лічильник схвалених + прапорець довіри ------------------------
alter table public.profiles
  add column if not exists approved_count integer not null default 0,
  add column if not exists trusted        boolean not null default false;


-- 2. Тригер: пост pending → published (модератор схвалив) підвищує репутацію.
--    SECURITY DEFINER — щоб оминути RLS profiles («лише свій рядок»).
--    На 5-му схваленні → trusted=true (далі лишається true).
--    Автопубліковані пости — це INSERT (не UPDATE pending→published), тож
--    лічильник рахує ЛИШЕ реально промодеровані — саме те що треба.
create or replace function public.reputation_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_uid is not null
     and old.status = 'pending'
     and new.status = 'published' then
    insert into public.profiles (uid, approved_count, trusted)
    values (new.owner_uid, 1, false)
    on conflict (uid) do update
      set approved_count = public.profiles.approved_count + 1,
          trusted        = public.profiles.trusted
                           or (public.profiles.approved_count + 1) >= 5;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reputation_on_publish on public.posts;
create trigger trg_reputation_on_publish
  after update on public.posts
  for each row execute function public.reputation_on_publish();


-- 3. Тригер-запобіжник: відхилили пост довіреного → скидаємо довіру.
--    Дефолт «можна заробити знову»: лічильник=0, trusted=false (набере ще 5 —
--    знову довірений). Якщо колись треба «назавжди» — додати колонку
--    trust_revoked boolean і ставити її тут true + блокувати у пункті 2.
create or replace function public.revoke_trust_on_reject()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_uid is not null
     and old.status is distinct from 'rejected'
     and new.status = 'rejected' then
    update public.profiles
      set approved_count = 0, trusted = false
      where uid = new.owner_uid;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_revoke_trust_on_reject on public.posts;
create trigger trg_revoke_trust_on_reject
  after update on public.posts
  for each row execute function public.revoke_trust_on_reject();


-- 4. RPC подачі поста з автопублікацією для довірених + рейт-лімітом.
--    SECURITY DEFINER: дозволяє вставити status='published' в обхід RLS
--    («insert only pending») — але ЛИШЕ для довірених, перевірка серверна,
--    клієнт не може підробити. Статус і owner_uid форсуються сервером,
--    payload.status/payload.owner_uid ігноруються.
-- ============================================================================
-- ⚠️ БЛОК НИЖЧЕ — ДЗЕРКАЛО ПРОДА (знято з бази 28.07.2026 через pg_get_functiondef).
-- Міграція `board_price_support_submit` (20260728122041) пішла в базу, але в цей файл
-- НЕ потрапила — репозиторій і база розійшлись на кілька годин.
-- 🔴 ЧИМ ЦЕ МАЛО НЕ КОШТУВАЛО: у сесії 28.07 я, прочитавши ЦЕЙ файл (а не базу),
--    вирішив що ціна не підтримується, написав ВЛАСНУ, БІДНІШУ версію і зібрався її
--    накотити. Вона знищила б: гейт за категорією (`v_price_cats`), прапорець
--    «Договірна» (`price_negotiable`) і серверне жорстке `currency = 'UAH'`.
--    Врятувала лише звірка з живою базою ПЕРЕД накатом.
-- ➡️ ПРАВИЛО: перед накатом будь-якої RPC — спершу `pg_get_functiondef` з прода
--    і порівняти з файлом. Файл може відставати.
-- ============================================================================
create or replace function public.submit_board_post(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid    := auth.uid();
  v_trusted   boolean := false;
  v_recent    integer := 0;
  v_status    text;
  v_text      text    := nullif(btrim(coalesce(payload->>'text','')), '');
  v_title     text    := nullif(btrim(coalesce(payload->>'title','')), '');
  v_cat       text    := payload->>'category';
  -- Категорії, де ціна має сенс. «віддам» тут НЕМА свідомо: воно безкоштовне за
  -- визначенням, і показ «Безкоштовно» — справа клієнта, а не збережене число.
  v_price_cats text[] := array['продам','послуга','куплю'];
  v_price_ok  boolean := v_cat = any(v_price_cats);
  v_price     numeric;
  v_negot     boolean := coalesce((payload->>'price_negotiable')::boolean, false);
  -- Стеля: без неї хтось вписав би 10^20 і зламав верстку картки. 100 млн грн —
  -- завідомо вище будь-якого реального оголошення в громаді.
  v_price_max numeric := 100000000;
begin
  if v_text is null then
    return jsonb_build_object('ok', false, 'error', 'Порожній текст');
  end if;
  if v_title is null then
    return jsonb_build_object('ok', false, 'error', 'Потрібен заголовок');
  end if;

  -- Ціна: приймаємо лише коректне число. `payload->>'price'` може бути будь-чим,
  -- тому парсимо через безпечне приведення, а не довіряємо типу.
  begin
    v_price := nullif(btrim(coalesce(payload->>'price','')), '')::numeric;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'Ціна має бути числом');
  end;

  if v_price is not null then
    if v_price < 0 then
      return jsonb_build_object('ok', false, 'error', 'Ціна не може бути відʼємною');
    end if;
    if v_price > v_price_max then
      return jsonb_build_object('ok', false, 'error', 'Завелика ціна');
    end if;
    v_price := round(v_price, 2);
  end if;

  -- Категорія без ціни (шукаю / знайдено / загубилось / віддам) → витираємо обидва поля,
  -- навіть якщо клієнт їх надіслав.
  if not v_price_ok then
    v_price := null;
    v_negot := false;
  end if;
  -- «Договірна» і число — взаємовиключні. Число має пріоритет: якщо людина його вписала,
  -- вона таки назвала ціну.
  if v_price is not null then
    v_negot := false;
  end if;

  if v_uid is not null then
    select count(*) into v_recent from public.posts
      where owner_uid = v_uid and created_at > now() - interval '1 minute';
    if v_recent >= 3 then
      return jsonb_build_object('ok', false, 'error', 'Занадто часто — зачекайте хвилину');
    end if;
    select coalesce(trusted, false) into v_trusted from public.profiles where uid = v_uid;
  end if;
  v_status := case when v_trusted then 'published' else 'pending' end;

  insert into public.posts
    (type, text, author, photos, category, color, contact, title, location, tags,
     price, currency, price_negotiable,
     status, owner_uid, published_at, bumped_at, ts)
  values (
    coalesce(payload->>'type', 'board'),
    v_text,
    payload->>'author',
    coalesce((select array_agg(value) from jsonb_array_elements_text(payload->'photos')), '{}'),
    v_cat,
    coalesce(payload->>'color', 'yellow'),
    payload->>'contact',
    left(v_title, 80),
    payload->>'location',
    coalesce((select array_agg(value) from jsonb_array_elements_text(payload->'tags')), '{}'),
    v_price,
    'UAH',            -- валюту НЕ беремо від клієнта: у громаді розрахунки в гривні
    v_negot,
    v_status, v_uid,
    case when v_status = 'published' then now() else null end,
    case when v_status = 'published' then now() else null end,
    (extract(epoch from now()) * 1000)::bigint
  );
  return jsonb_build_object('ok', true, 'status', v_status);
end;
$$;

grant execute on function public.submit_board_post(jsonb) to anon, authenticated;


-- ============================================================================
-- ✅ ГОТОВО. Перевірка після Run (виконана 08.07.2026 через execute_sql):
--   1. profiles має колонки approved_count, trusted.               ✅
--   2. Схвали 5 постів одного автора → у нього trusted=true.       ✅
--   3. 6-й пост того автора з'являється published одразу (RPC).    ✅
--   4. Відхили пост довіреного → trusted=false, approved_count=0.  ✅
--   5. Рейт-ліміт 3 пости/хв — логіка в RPC, не тестовано наживо
--      (потребує 4 швидких подачі поспіль).
-- ============================================================================
