-- scripts/supabase_comment_as_page.sql
-- ВІДПОВІДЬ ВІД ІМЕНІ СПІЛЬНОТИ У «СТРІЧЦІ» (25.08.2026).
-- ✅ УЖЕ НАКАТАНО через Supabase MCP — міграції `page_comments_as_page_identity`
--    і `page_comments_team_edits_community_voice`. Цей файл — джерело правди
--    на випадок відновлення.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔑 РІШЕННЯ, І ЧОМУ САМЕ ТАКЕ
--
-- `author_uid` лишається ЗАВЖДИ = людина, яка натиснула «Надіслати».
-- Додається `as_page_id` — від чийого імені це ЗВУЧИТЬ.
-- Так само влаштовані пости: `page_posts` = page_id + author_uid + show_author.
--
-- 🛑 ЧОМУ НЕ `actor_type` / `actor_id` (порада ChatGPT, принесена Вовою 25.08).
-- У тій моделі коментар спільноти має `actor_id` = id спільноти, і сліду людини
-- не лишається взагалі. Наслідки, кожен реальний для цього коду:
--   • модерація сліпне — в Олиці на 3000 людей адмін це сусід, і «хто це написав»
--     мусить лишатись відповідальністю конкретної людини;
--   • антиспам рахує за автором (`trg_page_comments_antispam`, B-26) — рахувати
--     стало б нічого;
--   • ламаються видалення, згадки `reply_to_uid`, капсули «під вашим дописом»
--     і адресація push — усе це ключується на `author_uid`.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.page_comments
  add column if not exists as_page_id bigint references public.pages(id) on delete set null;

comment on column public.page_comments.as_page_id is
  'Від чийого імені звучить коментар: NULL = від людини (author_uid), інакше — від спільноти. author_uid ЗАВЖДИ лишається людиною, що написала.';

-- ── 1. ВСТАВКА ──────────────────────────────────────────────────────────────
-- Дві умови, і обидві обовʼязкові:
--   can_edit_page(as_page_id)  — я справді в команді цієї сторінки;
--   as_page_id = page_id поста — говорити від імені спільноти можна ЛИШЕ під її
--     власним постом.
-- 🔴 Друга умова закриває справжню діру, а не гіпотетичну: без неї адмін «ФК Олика»
-- відповів би як «ФК Олика» під постом сільради, і це виглядало б як офіційна заява
-- клубу на чужій сторінці. ChatGPT радив «не привʼязувати до автора поста» — у UI ми
-- згодні (вибір і так завжди рівно два), але в БАЗІ привʼязка обовʼязкова.
drop policy if exists "pcom insert" on public.page_comments;
create policy "pcom insert" on public.page_comments for insert with check (
  author_uid = auth.uid()
  and length(trim(text)) between 1 and 2000
  and (
    as_page_id is null
    or (
      public.can_edit_page(as_page_id)
      and as_page_id = (select pp.page_id from public.page_posts pp where pp.id = post_id)
    )
  )
);

-- ── 2. ПРАВКА ───────────────────────────────────────────────────────────────
-- 🔴 `as_page_id` ЗАМОРОЖЕНО в обидва боки. Без цього був би тихий шлях: написати
-- особисто → люди прочитали → перемкнути на спільноту (або навпаки). Позначка
-- «змінено» стосується ТЕКСТУ і про зміну голосу не сказала б нічого.
--
-- 🔑 Текст: дві гілки, бо це два різні за природою випадки.
--   особистий коментар — правити може ЛИШЕ автор (чужа мова від чужого імені);
--   коментар спільноти — правити може вся команда сторінки (рішення Вови 25.08:
--     «адмін і учасники команди»). Голос належить спільноті, не людині.
-- ⚠️ Ціна другої гілки, прийнята свідомо: хто саме правив — ніде не записано,
-- видно лише «змінено». Для СПІЛЬНОГО голосу це чесно, для особистого було б ні —
-- і саме тому гілки дві.
create or replace function public.page_comments_guard_update()
returns trigger language plpgsql set search_path to 'public' as $function$
declare
  reason text;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id           is distinct from old.id
     or new.post_id      is distinct from old.post_id
     or new.author_uid   is distinct from old.author_uid
     or new.created_at   is distinct from old.created_at
     or new.parent_id    is distinct from old.parent_id
     or new.reply_to_uid is distinct from old.reply_to_uid
     or new.as_page_id   is distinct from old.as_page_id then
    raise exception 'У коментарі можна змінити лише текст або видалити його'
      using errcode = '42501';
  end if;

  if old.deleted_at is not null
     and (new.deleted_at is distinct from old.deleted_at
          or new.text is distinct from old.text) then
    raise exception 'Видалений коментар змінювати не можна'
      using errcode = '42501';
  end if;

  if new.text is distinct from old.text then
    if old.as_page_id is not null then
      if not public.can_edit_page(old.as_page_id) then
        raise exception 'Редагувати відповідь спільноти може лише її команда'
          using errcode = '42501';
      end if;
    elsif old.author_uid is distinct from auth.uid() then
      raise exception 'Редагувати можна лише власний коментар'
        using errcode = '42501';
    end if;
    -- Той самий двигун, що на вставці: редагування не має бути обхідним шляхом.
    reason := public.text_abuse_reason(new.text);
    if reason is not null then
      raise exception 'antispam: %', reason using errcode = 'check_violation';
    end if;
    new.edited_at := now();     -- ставить БАЗА, не клієнт
  else
    new.edited_at := old.edited_at;   -- не даємо підробити позначку без правки
  end if;

  return new;
end;
$function$;

-- ── 3. БЕЙДЖ «АДМІН»: ПІДТВЕРДЖУЄ, АЛЕ НЕ ПЕРЕЛІЧУЄ ─────────────────────────
-- 🔴 Перешкода, знайдена вже під час роботи: намалювати бейдж не було З ЧОГО.
-- Політика `page_admins` віддає лише ВЛАСНИЙ рядок (`uid = auth.uid() or is_admin()`),
-- а `list_page_moderators()` вимагає власника сторінки. Тобто читач у принципі не
-- може дізнатись, хто веде спільноту — і саме тому офіційну відповідь не відрізнити
-- від сусідської.
--
-- 🔑 Політику НЕ відкриваємо: `using (true)` віддало б команду будь-якої сторінки
-- одним запитом. Замість цього — вузьке питання «хто з ЦИХ людей у команді».
-- Спитати можна лише про тих, хто вже є на екрані.
-- ⚠️ Чесно: це підвищена планка, а не стіна. Але зріз у 200 uid не дає перебирати
-- базу пачками, а списку команди функція не віддає ніколи.
-- 🛑 `set search_path = public, auth` БЕЗ ЛАПОК (у лапках це одна схема з такою назвою).
create or replace function public.page_team_flags(p_page_id bigint, p_uids uuid[])
returns setof uuid
language sql stable security definer set search_path = public, auth as $$
  select a.uid
  from public.page_admins a
  where a.page_id = p_page_id
    and a.uid = any(p_uids[1:200]);
$$;

comment on function public.page_team_flags(bigint, uuid[]) is
  'Хто з переданих uid входить у команду сторінки. Підтверджує, але не перелічує: список команди цілком не віддає ніколи.';

grant execute on function public.page_team_flags(bigint, uuid[]) to anon, authenticated;

-- ── ДОВЕДЕНО НА ЖИВІЙ БАЗІ (транзакція з відкотом, 25.08) ───────────────────
--   адмін як СВОЯ спільнота під її постом ....... ПРОЙШЛО
--   адмін як ЧУЖА для цього поста спільнота ..... ВІДМОВА
--   сторонній від імені спільноти ............... ВІДМОВА
--   житель від себе (контроль на регрес) ........ ПРОЙШЛО
--   особистий → спільнота після публікації ...... ВІДМОВА
--   спільнота → особистий після публікації ...... ВІДМОВА
--   правка ТЕКСТУ коментаря спільноти ........... ПРОЙШЛО
--   МОДЕРАТОР править коментар своєї спільноти .. ПРОЙШЛО
--   МОДЕРАТОР править ОСОБИСТИЙ коментар колеги . ВІДМОВА
--   команда ЧУЖОЇ сторінки править цей рядок .... 0 рядків (RLS відсіяв)
--   page_team_flags(3, [адмін, сторонній]) ...... лише «адмін»
