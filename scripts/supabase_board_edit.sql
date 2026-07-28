-- scripts/supabase_board_edit.sql
-- Д-3 — Редагування власного оголошення (Дошка громади).
-- Автор редагує свій пост із вкладки «Мої оголошення»: заголовок, опис, категорія,
-- локація, фото, телефон. Базова RLS дозволяє UPDATE лише адмінам (див.
-- supabase_schema.sql «Admins can update posts»), тому редагування автором іде
-- через цю SECURITY DEFINER RPC з серверною перевіркою owner_uid = auth.uid().
--
-- Статус після редагування (рішення Вови 12.07 — «залежно від довіри»):
--   • автор trusted (profiles.trusted, див. supabase_reputation.sql) → published
--     лишається published (правка зберігається одразу, пост не зникає з Дошки);
--   • автор НЕ trusted, пост був published → status='pending' (повторна модерація,
--     published_at=null) — захист від «схвалили безневинне → підмінили на спам»;
--   • пост уже pending → лишається pending (редагування до першого схвалення).
-- Редагувати можна лише active/pending; closed/rejected — ні.
--
-- ЗАСТОСУВАТИ через Supabase MCP apply_migration (project uabyfecseqnemvcqhdem).
-- Скрипт ІДЕМПОТЕНТНИЙ (create or replace) — можна запускати повторно.
--
-- ⚠️ 28.07.2026 — функцію ДОПОВНЕНО ціною (потік 2 Дошки), парно з
--    supabase_reputation.sql (submit_board_post). Накочувати ОБИДВА файли разом:
--    інакше подати ціну можна буде, а відредагувати — ні (або навпаки).
-- ============================================================================

create or replace function public.update_board_post(p_id bigint, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid        uuid    := auth.uid();
  v_owner      uuid;
  v_type       text;
  v_status     text;
  v_trusted    boolean := false;
  v_new_status text;
  v_text       text    := nullif(btrim(coalesce(payload->>'text','')), '');
  v_title      text    := nullif(btrim(coalesce(payload->>'title','')), '');
  -- 🆕 28.07 (потік 2 Дошки): ціна. Розрізняємо ТРИ випадки, а не два:
  --   ключа 'price' у payload НЕМА          → ціну не чіпаємо (стара лишається);
  --   ключ є, значення порожнє              → ціну ЗНЯТО (людина стерла поле);
  --   ключ є, значення число                → нова ціна.
  -- Без цієї різниці будь-яке редагування старого поста мовчки стирало б ціну.
  v_has_price  boolean := payload ? 'price';
  v_price_raw  text    := nullif(btrim(coalesce(payload->>'price','')), '');
  v_price      numeric;
  v_curr       text    := upper(nullif(btrim(coalesce(payload->>'currency','')), ''));
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Треба увійти');
  end if;

  -- Пост має існувати; беремо власника/тип/статус для перевірок.
  select owner_uid, type, status
    into v_owner, v_type, v_status
    from public.posts where id = p_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Оголошення не знайдено');
  end if;
  if v_owner is null or v_owner <> v_uid then
    return jsonb_build_object('ok', false, 'error', 'Це не ваше оголошення');
  end if;
  if coalesce(v_type, 'board') <> 'board' then
    return jsonb_build_object('ok', false, 'error', 'Можна редагувати лише оголошення');
  end if;
  if v_status not in ('published', 'pending') then
    return jsonb_build_object('ok', false, 'error', 'Це оголошення не можна редагувати');
  end if;

  -- Валідація вмісту (як у submit_board_post — авторитетно на сервері).
  if v_text is null then
    return jsonb_build_object('ok', false, 'error', 'Порожній текст');
  end if;
  if v_title is null then
    return jsonb_build_object('ok', false, 'error', 'Потрібен заголовок');
  end if;

  -- Ціна: та сама валідація, що в submit_board_post (форму можна обійти прямим API).
  if v_price_raw is not null then
    if v_price_raw !~ '^[0-9]+(\.[0-9]{1,2})?$' then
      return jsonb_build_object('ok', false, 'error', 'Некоректна ціна');
    end if;
    v_price := v_price_raw::numeric;
    if v_price > 100000000 then
      return jsonb_build_object('ok', false, 'error', 'Завелика ціна');
    end if;
  end if;
  if v_curr is not null and v_curr not in ('UAH', 'USD', 'EUR') then
    return jsonb_build_object('ok', false, 'error', 'Невідома валюта');
  end if;

  -- Довіра автора: trusted-published лишається published; звичайний published → pending.
  select coalesce(trusted, false) into v_trusted
    from public.profiles where uid = v_uid;

  v_new_status := case
    when v_status = 'published' and not v_trusted then 'pending'
    else v_status
  end;

  update public.posts set
    text         = v_text,
    title        = left(v_title, 80),
    category     = payload->>'category',
    color        = coalesce(payload->>'color', color),
    contact      = payload->>'contact',
    location     = payload->>'location',
    photos       = coalesce(
                     (select array_agg(value) from jsonb_array_elements_text(payload->'photos')),
                     '{}'),
    price        = case when v_has_price then v_price else price end,
    currency     = case
                     when not v_has_price then currency
                     when v_price is null  then null            -- ціну зняли
                     else coalesce(v_curr, 'UAH')
                   end,
    status       = v_new_status,
    published_at = case when v_new_status = 'pending' then null else published_at end,
    updated_at   = now()
  where id = p_id;

  return jsonb_build_object('ok', true, 'status', v_new_status);
end;
$$;

-- Лише залогінені: прибираємо дефолтний PUBLIC/anon-грант (аноніми й так блокуються
-- перевіркою auth.uid(), але тримаємо доступ мінімальним).
revoke execute on function public.update_board_post(bigint, jsonb) from public, anon;
grant  execute on function public.update_board_post(bigint, jsonb) to authenticated;

-- ============================================================================
-- Перевірка після Run:
--   1. Автор редагує свій pending-пост → ok, status лишається 'pending'.
--   2. НЕ-trusted автор редагує свій published-пост → ok, status='pending'
--      (зник з Дошки, поїхав на модерацію).
--   3. trusted-автор редагує свій published → ok, status лишається 'published'.
--   4. Чужий пост (owner_uid <> auth.uid()) → error 'Це не ваше оголошення'.
--   5. closed/rejected пост → error 'не можна редагувати'.
--   🆕 Ціна (28.07):
--   6. payload БЕЗ ключа 'price' → стара ціна лишилась незмінною.
--   7. payload з 'price': '' → price і currency стали null (ціну знято).
--   8. payload з 'price': '2500' → price=2500, currency='UAH'.
--   9. payload з 'price': '-5' або 'abc' → error 'Некоректна ціна', рядок не змінено.
-- ============================================================================
