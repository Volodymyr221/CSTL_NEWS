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
-- ============================================================================
