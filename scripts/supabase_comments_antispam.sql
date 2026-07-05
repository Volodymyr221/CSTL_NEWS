-- Д-2: серверний антиспам-тригер на public.comments (варіант B — прагматичний backstop)
-- Дублює клієнтський фільтр (utils.js containsProfanity/looksLikeSpam + board.js антифлуд)
-- як бар'єр НА РІВНІ БАЗИ, який не обійти через прямий виклик API.
-- Рейт-ліміт і дубль — рівно як клієнт: макс 5 повідомлень / 15 сек + блок повтору останнього.
-- Профанність — ядро топ-стемів із межею слова (\m/\M), щоб не ловити «Херсон», «ебоніт» тощо.

create or replace function public.comments_antispam()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  txt      text := coalesce(NEW.text, '');
  squashed text;
  letters  text;
  recent   int;
  lasttext text;
begin
  -- ── 1. Базовий спам ────────────────────────────────────────────────
  if length(btrim(txt)) = 0 then
    raise exception 'antispam: порожній коментар' using errcode = 'check_violation';
  end if;
  if txt ~ '(.)\1{5,}' then                          -- один символ повторено ≥6 разів
    raise exception 'antispam: спам (повтори символів)' using errcode = 'check_violation';
  end if;
  letters := regexp_replace(txt, '[^а-яіїєґёa-z]', '', 'gi');
  if char_length(letters) >= 12 and letters !~* '[аеиіоуяюєїёauoiey]' then
    raise exception 'antispam: беззмістовний набір літер' using errcode = 'check_violation';
  end if;

  -- ── 2. Ядро профанності ───────────────────────────────────────────
  -- стеми (по початку слова \m — як startsWith на клієнті)
  if lower(txt) ~* '\m(хуй|хує|хуя|хуї|хуйл|хуєс|пизд|пізд|бляд|блят|єб|їб|йоб|наху|похуй|підор|підар|пидор|пидар|залуп|гандон|гондон|мудак|мудил|дебіл|дебил|мраз)' then
    raise exception 'antispam: нецензурна лексика' using errcode = 'check_violation';
  end if;
  -- точні короткі слова (ціле слово \m..\M — щоб «Херсон»/«лохина» не ловились)
  if lower(txt) ~* '\m(бля|сука|суку|сучка|хер|лох|манда|педик|педік|даун)\M' then
    raise exception 'antispam: нецензурна лексика' using errcode = 'check_violation';
  end if;
  -- squashed (рознесене «х у й») — лише ультра-безпечні стеми
  squashed := regexp_replace(lower(txt), '[^а-яіїєґёa-z]', '', 'g');
  if squashed ~ '(хуй|хуйл|пизд|пізд|єбал|їбал|йоб)' then
    raise exception 'antispam: нецензурна лексика' using errcode = 'check_violation';
  end if;
  -- трансліт латиницею (по початку слова)
  if lower(txt) ~* '\m(huy|hui|huil|pizd|yeban|ebal|blyad|blyat|pidor|pidar|mudak|zalupa)' then
    raise exception 'antispam: нецензурна лексика' using errcode = 'check_violation';
  end if;

  -- ── 3. Рейт-ліміт + дубль (як клієнт: 5/15с + блок повтору) ─────────
  if NEW.sender_uid is not null then
    select count(*) into recent
    from public.comments
    where sender_uid = NEW.sender_uid
      and created_at > now() - interval '15 seconds';
    if recent >= 5 then
      raise exception 'antispam: занадто швидко (зачекайте кілька секунд)' using errcode = 'check_violation';
    end if;

    select text into lasttext
    from public.comments
    where sender_uid = NEW.sender_uid
    order by created_at desc
    limit 1;
    if lasttext is not null and lasttext = txt then
      raise exception 'antispam: ви щойно це написали' using errcode = 'check_violation';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_comments_antispam on public.comments;
create trigger trg_comments_antispam
  before insert on public.comments
  for each row execute function public.comments_antispam();
