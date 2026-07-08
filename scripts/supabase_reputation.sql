-- scripts/supabase_reputation.sql
-- Захід 2 — Репутація користувача + автопублікація (Дошка громади).
-- Мета: після 5 схвалених постів автор стає «довіреним» → його оголошення
-- публікуються ОДРАЗУ (без ручної модерації). Запобіжник: модератор відхилив
-- пост довіреного → довіра скидається (лічильник у 0, знову на ручну модерацію).
-- Плюс серверний рейт-ліміт (обмеження частоти): не більше 3 постів/хв на автора.
--
-- ЗАСТОСОВАНО (08.07.2026, через MCP apply_migration, project uabyfecseqnemvcqhdem).
-- Скрипт ІДЕМПОТЕНТНИЙ (additive) — можна запускати повторно, дані не втрачаються.
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
create or replace function public.submit_board_post(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid    := auth.uid();
  v_trusted boolean := false;
  v_recent  integer := 0;
  v_status  text;
  v_text    text    := nullif(btrim(coalesce(payload->>'text','')), '');
begin
  if v_text is null then
    return jsonb_build_object('ok', false, 'error', 'Порожній текст');
  end if;

  -- Рейт-ліміт: не більше 3 постів за останню хвилину на автора.
  if v_uid is not null then
    select count(*) into v_recent
      from public.posts
      where owner_uid = v_uid
        and created_at > now() - interval '1 minute';
    if v_recent >= 3 then
      return jsonb_build_object('ok', false,
        'error', 'Занадто часто — зачекайте хвилину');
    end if;

    select coalesce(trusted, false) into v_trusted
      from public.profiles where uid = v_uid;
  end if;

  v_status := case when v_trusted then 'published' else 'pending' end;

  insert into public.posts
    (type, text, author, photos, category, color, contact, title, tags,
     status, owner_uid, published_at, bumped_at, ts)
  values (
    coalesce(payload->>'type', 'board'),
    v_text,
    payload->>'author',
    coalesce((select array_agg(value) from jsonb_array_elements_text(payload->'photos')), '{}'),
    payload->>'category',
    coalesce(payload->>'color', 'yellow'),
    payload->>'contact',
    payload->>'title',
    coalesce((select array_agg(value) from jsonb_array_elements_text(payload->'tags')), '{}'),
    v_status,
    v_uid,
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
