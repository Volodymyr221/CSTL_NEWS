-- ============================================================================
-- ОНОВЛЕННЯ ЗАСТОСУНКУ — ПРАПОРЦІ ФІЧ І КОЛО РАННЬОГО ДОСТУПУ
-- Замовлення Вови 19.09.2026
--
-- 🗣️ «як робити покращення застосунку або оновлення застосунку… щоб не бачили
-- користувачі. І тільки після того, як погодиться, що ця версія робоча… випускати
-- його в прод. Але ці покращення і оновлення мають бути з такою можливістю, щоб я
-- міг протестити і побачити його В РАМКАХ ДОДАТКУ, як воно працює».
-- 🗣️ Назва розділу — «Оновлення». Перемикач «дивитись як житель» — «Одразу».
-- 🗣️ Випускати всім: «Власник + СЕО + Розробник».
--
-- 🔑 ЧОМУ ПРАПОРЦІ, А НЕ ОКРЕМИЙ САЙТ (staging). Його вимога звучить «побачити
-- В РАМКАХ ДОДАТКУ». Окремий сайт це ДРУГИЙ застосунок: інший вхід, інша PWA,
-- інше сховище на телефоні — а головне, інші дані. Або він дивиться в живу базу
-- (і тоді зламаний код псує справжні дані людей), або в порожню (і тоді перевірка
-- нічого не доводить: дивишся на макет, а не на життя).
-- ➡️ Прапорець дає рівно те, що просили: СВІЙ застосунок, СВОЇ дані, і при цьому
-- ніхто інший цього не бачить.
--
-- 🛑 ГОЛОВНА МЕЖА: ПРАПОРЕЦЬ КЕРУЄ ПОКАЗОМ, А НЕ ПРАВАМИ.
-- Він НІКОЛИ не є перевіркою доступу: людина з devtools вимкне будь-що на своєму
-- боці за секунду. Право живе в RLS і в `has_perm()`; прапорець лише вирішує, чи
-- малювати новий шлях. Плутанина тут перетворила б «фічу на тесті» у відчинені
-- двері.
--
-- ✅ НАКАТАНО 19.09 (міграція `feature_flags_and_testers`) і доведено на живій
-- базі транзакціями з відкотом:
--   • нова фіча народжується `off`; `circle` → власник (він у колі) бачить `on:true`;
--   • адмін застосунку: `updates` = view, фіча зі стану `circle` для нього
--     схована (`on:false`), а спроби вмикати/випускати/додавати тестера всі
--     відмовляють — «Немає права керувати оновленнями».
-- ============================================================================

-- ── 1. ПЕРЕЛІК ФІЧ ────────────────────────────────────────────────────────
-- Три стани, а не два — це і є вся суть замовлення:
--   'off'    — код у проді, але мертвий. Навіть зламаний нікому не шкодить.
--   'circle' — бачить лише коло. ТУТ Вова тапає і каже «криво».
--   'all'    — його «годиться».
create table if not exists public.app_features (
  key         text primary key,
  label       text not null,
  descr       text,
  stage       text not null default 'off' check (stage in ('off','circle','all')),
  created_at  timestamptz not null default now(),
  -- 🔑 Коли випустили всім. Потрібне не для звіту, а для прибирання: фіча, що
  -- місяць працює у всіх, мусить втратити прапорець, інакше за півроку буде
  -- сорок мертвих перемикачів і код, де кожен екран має два шляхи.
  released_at timestamptz,
  changed_by  uuid references auth.users(id) on delete set null
);

-- ── 2. КОЛО РАННЬОГО ДОСТУПУ ──────────────────────────────────────────────
-- 🗣️ Вова: у коло йдуть «мої тестові профілі та команду».
-- ⚠️ Членство в команді НЕ додає в коло автоматично: «має доступ до адмінки» і
-- «дивиться недороблене» — різні речі. Редактор, який відкриє криву фічу і
-- почне нею публікувати, це не тест, а аварія.
create table if not exists public.feature_testers (
  uid      uuid primary key references auth.users(id) on delete cascade,
  note     text,
  added_by uuid references auth.users(id) on delete set null,
  added_at timestamptz not null default now()
);

alter table public.app_features    enable row level security;
alter table public.feature_testers enable row level security;

-- Перелік фіч читає будь-хто, хто ввійшов: клієнт мусить знати, що вмикати.
-- Це не витік — назва фічі не секрет, а стан 'off' однаково нічого не показує.
drop policy if exists app_features_read on public.app_features;
create policy app_features_read on public.app_features for select using (auth.uid() is not null);

drop policy if exists feature_testers_read on public.feature_testers;
create policy feature_testers_read on public.feature_testers for select
  using (uid = auth.uid() or public.has_perm('updates','view'));

revoke insert, update, delete on public.app_features    from anon, authenticated;
revoke insert, update, delete on public.feature_testers from anon, authenticated;

-- ── 3. ЩО ВВІМКНЕНО ДЛЯ МЕНЕ ──────────────────────────────────────────────
--
-- 🔴 ФОРМА ВІДПОВІДІ ЗМІНИЛАСЬ 19.09, І ЦЕ ВИПРАВЛЕННЯ МОЄЇ ЖЕ ВАДИ.
-- Перша редакція віддавала просто мапу `ключ → {stage, on}`, а клієнт виводив
-- «чи я в колі» з неї: «є хоч одна фіча `circle`, і вона для мене `on`».
-- 📐 Заміряно перед деплоєм: `app_features` — **0 рядків** (фіч ще немає, перша
-- зʼявиться з першим оновленням). Тобто в мить випуску Вова відкрив би
-- «Оновлення» і не побачив НІЧОГО, а пункт «Дивитись як житель» не показався б
-- йому взагалі — бо виводився з фіч, яких нема.
-- ➡️ Система, яку замовили, щоб «протестити В РАМКАХ ДОДАТКУ», була б
-- непроверяємою рівно тоді, коли він уперше її відкриє.
-- 🔑 Тому членство в колі їде ОКРЕМИМ полем: це факт про ЛЮДИНУ, а не побічний
-- наслідок того, що саме зараз тестується.
create or replace function public.my_features()
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare v_uid uuid := auth.uid(); v_in_circle boolean;
begin
  select exists (select 1 from feature_testers where uid = v_uid) into v_in_circle;
  return jsonb_build_object(
    'in_circle', coalesce(v_in_circle, false),
    'features', coalesce((
      select jsonb_object_agg(f.key, jsonb_build_object(
        'stage', f.stage,
        'on', f.stage = 'all' or (f.stage = 'circle' and v_in_circle)
      )) from app_features f
    ), '{}'::jsonb)
  );
end;
$fn$;

-- ── 4. ПЕРЕМИКАННЯ СТАНУ ──────────────────────────────────────────────────
-- 🛑 Випуск НА ВСІХ — окреме право (`can_release_update`: власник, CEO,
-- розробник). Увімкнути «лише колу» може той, хто має `updates` = manage.
-- ⚠️ Адмін застосунку має `updates` = view: він БАЧИТЬ, що тестується, але не
-- вмикає і не випускає.
create or replace function public.set_feature_stage(p_key text, p_stage text)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
begin
  if p_stage not in ('off','circle','all') then
    return jsonb_build_object('ok', false, 'error', 'Невідомий стан');
  end if;
  if not public.has_perm('updates','manage') then
    return jsonb_build_object('ok', false, 'error', 'Немає права керувати оновленнями');
  end if;
  if p_stage = 'all' and not public.can_release_update() then
    return jsonb_build_object('ok', false, 'error', 'Випустити всім можуть власник, CEO або розробник');
  end if;
  update app_features
     set stage = p_stage,
         changed_by = auth.uid(),
         released_at = case when p_stage = 'all' then now() else null end
   where key = p_key;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Такої фічі немає');
  end if;
  return jsonb_build_object('ok', true);
end;
$fn$;

-- ── 5. КОЛО ────────────────────────────────────────────────────────────────
create or replace function public.set_feature_tester(p_uid uuid, p_on boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
begin
  if not public.has_perm('updates','manage') then
    return jsonb_build_object('ok', false, 'error', 'Немає права керувати оновленнями');
  end if;
  if p_on then
    insert into feature_testers (uid, note, added_by) values (p_uid, p_note, auth.uid())
    on conflict (uid) do update set note = excluded.note;
  else
    delete from feature_testers where uid = p_uid;
  end if;
  return jsonb_build_object('ok', true);
end;
$fn$;

create or replace function public.feature_testers_list()
returns jsonb
language plpgsql stable security definer set search_path = public
as $fn$
declare v_out jsonb;
begin
  if not public.has_perm('updates','view') then
    return jsonb_build_object('ok', false, 'error', 'Немає доступу');
  end if;
  select coalesce(jsonb_agg(t order by t->>'name'), '[]'::jsonb) into v_out
  from (
    select jsonb_build_object(
      'uid', u.id, 'email', u.email, 'note', ft.note,
      'name', coalesce(nullif(btrim(p.name || ' ' || coalesce(p.surname,'')),''), u.email)
    ) as t
    from feature_testers ft
    join auth.users u on u.id = ft.uid
    left join profiles p on p.uid = u.id
  ) s;
  return jsonb_build_object('ok', true, 'testers', v_out);
end;
$fn$;

-- ── 6. РЕЄСТРАЦІЯ ФІЧІ ────────────────────────────────────────────────────
-- 🛑 Нова фіча народжується ВИМКНЕНОЮ. Інакше вона поїхала б усім у мить появи —
-- тобто рівно те, від чого вся ця робота.
create or replace function public.register_feature(p_key text, p_label text, p_descr text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $fn$
begin
  if not public.has_perm('updates','manage') then
    return jsonb_build_object('ok', false, 'error', 'Немає права керувати оновленнями');
  end if;
  insert into app_features (key, label, descr) values (p_key, p_label, p_descr)
  on conflict (key) do update set label = excluded.label, descr = excluded.descr;
  return jsonb_build_object('ok', true);
end;
$fn$;

revoke execute on function public.set_feature_stage(text, text)           from public, anon;
revoke execute on function public.set_feature_tester(uuid, boolean, text) from public, anon;
revoke execute on function public.feature_testers_list()                  from public, anon;
revoke execute on function public.register_feature(text, text, text)      from public, anon;
grant  execute on function public.my_features()                           to authenticated;
grant  execute on function public.set_feature_stage(text, text)           to authenticated;
grant  execute on function public.set_feature_tester(uuid, boolean, text) to authenticated;
grant  execute on function public.feature_testers_list()                  to authenticated;
grant  execute on function public.register_feature(text, text, text)      to authenticated;

-- Власник одразу в колі: інакше перший же прапорець не було б кому побачити.
insert into public.feature_testers (uid, note)
select uid, 'власник' from public.user_roles where role = 'owner'
on conflict (uid) do nothing;

comment on table public.app_features is
  'Прапорці оновлень: off | circle | all. Керують ПОКАЗОМ, не правами — право живе в RLS і has_perm().';
