-- 0013_rls_auth_initplan.sql — ПОРАДНИК SUPABASE «Auth RLS Initialization Plan».
-- 🗣️ Вова 31.10: «давай поки 2 закриєм» (пункт 3 розділу ➡️ ДАЛІ у NOW.md).
--
-- 🔴 ЩО БУЛО. У політиках доступу (RLS) стоїть `auth.uid()` напряму. Для бази це
-- виклик функції в умові, і вона рахує його ЗАНОВО ДЛЯ КОЖНОГО РЯДКА, який
-- переглядає. 1000 рядків — 1000 викликів того самого «хто зараз увійшов».
-- Disk IO у нас 29.10 стояв на 99% — зайва робота на кожному запиті туди лягає.
--
-- ✅ ЩО СТАЄ. `(select auth.uid())` — та сама відповідь, але база бачить
-- підзапит без залежності від рядка і рахує його ОДИН РАЗ на запит (InitPlan,
-- «план ініціалізації»). Саме це рекомендує порадник і документація Supabase.
-- 🔑 Зміст правил НЕ змінюється: хто бачив/писав — той і бачить/пише.
--
-- 🔑 ЧОМУ ДИНАМІЧНО, А НЕ ПЕРЕПИСУВАННЯМ ФАЙЛІВ. Політики розкидані по 40+ файлах
-- `scripts/*.sql`, і ті файли вже розходились із продом (README цієї теки, NOW.md
-- «supabase_public_profile.sql розійшовся з продом»). Переписати їх руками =
-- накотити старі версії правил поверх живих. Тому міграція читає ЖИВІ правила з
-- `pg_policies` і міняє в них лише виклик, нічого більше.
--
-- ♻️ ПОВТОРНИЙ ПРОГІН БЕЗПЕЧНИЙ: вже обгорнуте (так його показує база:
-- `( SELECT auth.uid() AS uid)`) вдруге не обгортається; політика, в якій
-- нічого міняти, не чіпається.
-- 🛡 Одна політика, яку не вдалось змінити (напр. немає прав на `storage`),
-- НЕ зриває решту: попередження в журнал, далі. Зміна рівнозначна, тож
-- частковий накат нічого не ламає.
--
-- 📐 ПЕРЕВІРЕНО 31.10 на локальному Postgres 16, стенд `scripts/bench/0013_rls_initplan/`
-- (підробка `auth.*` + 8 політик усіх наших форм: `=`, `::text`, `in (select…)`,
-- `exists`, `auth.jwt() ->> …`, `auth.role()`, `storage.objects`, вже обгорнута):
--   • контроль ДО знайшов 7 (восьма вже була обгорнута — не чіпалась);
--   • накат: змінено 7, помилок 0; повтор: змінено 0;
--   • план запиту: було `Filter: … current_setting(...)` (на кожен рядок),
--     стало `InitPlan 1 (returns $0)` — рахується раз;
--   • що бачить/пише/видаляє кожен із двох користувачів — до і після байт у байт;
--   • мутант (обгортка зламана) → контроль червоніє, 7 рядків.
-- У кінці файлу — контрольний запит; на проді має повернути НУЛЬ рядків.

-- ── 1. Перетворювач тексту умови (тимчасовий, живе лише в цьому сеансі) ──────
create or replace function pg_temp.wrap_auth_calls(expr text)
returns text language plpgsql immutable as $$
declare s text := expr;
begin
  if s is null then return null; end if;
  -- а) сховати вже обгорнуті виклики, щоб не обгорнути двічі
  s := regexp_replace(s,
         '\(\s*select\s+auth\.(uid|jwt|role|email)\(\)(\s+as\s+\w+)?\s*\)',
         '@@AUTHCALL_\1@@', 'gi');
  -- б) обгорнути голі виклики
  s := regexp_replace(s, 'auth\.(uid|jwt|role|email)\(\)', '(select auth.\1())', 'g');
  -- в) повернути сховані на місце
  s := regexp_replace(s, '@@AUTHCALL_(\w+)@@', '(select auth.\1())', 'g');
  return s;
end $$;

-- Чи лишився в умові хоч один ГОЛИЙ виклик. 🔑 Порівнювати тексти «до/після»
-- НЕ можна: база показує обгорнуте як `( SELECT auth.uid() AS uid)`, наше
-- перетворення пише `(select auth.uid())` — тексти різні, хоч суть та сама.
-- Перша редакція так і робила, і стенд піймав: повтор «міняв» усі 8 політик.
create or replace function pg_temp.has_bare_auth_call(expr text)
returns boolean language sql immutable as $$
  select coalesce(
    regexp_replace(expr,
      '\(\s*select\s+auth\.(uid|jwt|role|email)\(\)(\s+as\s+\w+)?\s*\)', '', 'gi')
    ~ 'auth\.(uid|jwt|role|email)\(\)',
    false)
$$;

-- ── 2. Пройти всі живі політики і переписати ті, де є що міняти ──────────────
do $$
declare
  r        record;
  v_qual   text;
  v_check  text;
  v_sql    text;
  n_ok     int := 0;
  n_fail   int := 0;
begin
  for r in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname in ('public', 'storage')
       and (pg_temp.has_bare_auth_call(qual) or pg_temp.has_bare_auth_call(with_check))
     order by schemaname, tablename, policyname
  loop
    v_qual  := pg_temp.wrap_auth_calls(r.qual);
    v_check := pg_temp.wrap_auth_calls(r.with_check);

    v_sql := format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
    if v_qual  is not null then v_sql := v_sql || ' using ('      || v_qual  || ')'; end if;
    if v_check is not null then v_sql := v_sql || ' with check (' || v_check || ')'; end if;

    begin
      execute v_sql;
      n_ok := n_ok + 1;
    exception when others then
      n_fail := n_fail + 1;
      raise warning 'НЕ змінено %.% «%»: %', r.schemaname, r.tablename, r.policyname, sqlerrm;
    end;
  end loop;

  raise notice 'auth initplan: змінено політик — %, не вдалось — %', n_ok, n_fail;
end $$;

-- ── 3. Контроль: що лишилось необгорнутим. ОЧІКУВАНО — НУЛЬ РЯДКІВ. ───────────
select schemaname, tablename, policyname
  from pg_policies
 where schemaname in ('public', 'storage')
   and (pg_temp.has_bare_auth_call(qual) or pg_temp.has_bare_auth_call(with_check))
 order by 1, 2, 3;
