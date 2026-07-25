-- scripts/supabase_antispam_shared.sql
-- Антиспам/профанність — ОДИН двигун на всі коментарі застосунку.
--
-- ПРОБЛЕМА, ЯКУ ЦЕ ЛІКУЄ (два боки однієї монети):
--   1) Коментарі «Стрічки» (`page_comments`) не мали серверного захисту ВЗАГАЛІ —
--      будь-хто через відкритий API міг писати матюки і флудити повз застосунок.
--      Дошка (`comments`) захист мала з 05.07 (trg_comments_antispam).
--   2) Списки слів РОЗІЙШЛИСЬ: клієнтський фільтр (`src/core/utils.js`
--      containsProfanity) навчився гомогліфів («xyй»), leet («сук4», «x0й») і
--      схлопування повторів («хуууй»), а серверний лишився на грубих регулярках.
--
-- Скопіювати серверну функцію на другу таблицю = закріпити обидві проблеми
-- (дві копії, які й далі розходяться). Тому логіка винесена в ОДНУ функцію
-- `text_abuse_reason(txt)`, а обидва тригери стали тонкими обгортками над нею.
--
--   text_abuse_reason(txt)   → ЩО вважається неприйнятним текстом (спільне)
--   comments_antispam()      → рейт-ліміт і дублі Дошки      (sender_uid, comments)
--   page_comments_antispam() → рейт-ліміт і дублі «Стрічки»  (author_uid, page_comments)
--
-- Рейт-ліміт лишається в обгортках навмисно: у таблиць різні колонки автора
-- і різне поняття «дубль» (див. коментар у page_comments_antispam).
--
-- Джерело правди для списків слів — `src/core/utils.js` (клієнт). Тут вони
-- дзеркалені 1-в-1. Міняєш там — міняй і тут (обидва рівні мусять збігатись,
-- інакше людина бачить «надіслано», а база мовчки відхиляє).

-- ── Нормалізація (дзеркало normalizeForFilter з utils.js) ────────────────────
-- leet (цифри/символи → літери) + '1'→i + латинські гомогліфи → кирилиця
-- + схлоп повторів «хуууй» → «хуй».
create or replace function public.text_norm_cyr(txt text)
returns text language sql immutable as $$
  select regexp_replace(
           translate(
             translate(replace(lower(coalesce(txt, '')), '1', 'i'),
                       '03456789@$!|+', 'oeasgtbgasilt'),   -- leet
                       'aeocxpykibmht', 'аеосхрукібмнт'),   -- гомогліфи lat→cyr
           '(.)\1{2,}', '\1', 'g');
$$;

-- Латинський прохід іде по тексту БЕЗ гомогліфів (інакше «fuck» стало б «fuсk»
-- з кириличною «с» і не зловилось). '1' неоднозначна → викликаємо двічі: i та l.
create or replace function public.text_norm_lat(txt text, one text)
returns text language sql immutable as $$
  select translate(
           replace(regexp_replace(lower(coalesce(txt, '')), '(.)\1{2,}', '\1', 'g'), '1', one),
           '03456789@$!|+', 'oeasgtbgasilt');
$$;

-- ── Спільне ядро: null = текст чистий, інакше — причина відмови ──────────────
create or replace function public.text_abuse_reason(txt text)
returns text language plpgsql immutable as $$
declare
  raw     text := coalesce(txt, '');
  letters text;
  cyr     text;
  lat     text;
  one     text;
begin
  -- 1. Базовий спам (дзеркало looksLikeSpam з utils.js)
  if length(btrim(raw)) = 0 then return 'порожній коментар'; end if;
  if raw ~ '(.)\1{5,}' then return 'спам (повтори символів)'; end if;
  letters := regexp_replace(raw, '[^а-яіїєґёa-z]', '', 'gi');
  if char_length(letters) >= 12 and letters !~* '[аеиіоуяюєїёauoiey]' then
    return 'беззмістовний набір літер';
  end if;

  cyr := public.text_norm_cyr(raw);

  -- 2. Сильні стеми — блокуємо слово, якщо воно ПОЧИНАЄТЬСЯ з них (\m = початок слова).
  --    Перевірені щоб не чіпати легальні: художник/хустка/хуліган, мандарин,
  --    педикюр, корабля, сучок, шлюб, лоша.
  if cyr ~ ('\m(хуй|хує|хуя|хуї|хуйл|хуєс|пизд|пізд|бляд|блят|єб|їб|йоб|ебал|ебан|ебат|ебут|ебуч|ебну'
         || '|наєб|наеб|наїб|заєб|заїб|виєб|виїб|доїб|уїб|уєб|уеб|залуп|гандон|гондон|мудак|мудил'
         || '|підар|підор|пидор|пидар|наху|похуй|дроч|сцук|сцикл|курв|сволоч|гівн|говн|срак|сран|жоп'
         || '|мраз|шлюх|шльондр|падл|довбо|долбо|скотин|тварюк|козлин|лошар'
         || '|ідіот|кретин|придур|імбецил|дебіл|дебил|дибіл|дибил)') then
    return 'нецензурна лексика';
  end if;

  -- 3. Ризиковані короткі — ЛИШЕ повним словом (\m…\M), бо префікс дав би хибу
  --    («сукня», «корабля», «педикюр», «скотч»).
  if cyr ~ ('\m(бля|сука|суки|суку|сучка|сучки|хер|лох|лоха|лохи|манда|манди'
         || '|педик|педики|педік|педіки|пєдік|пєдик|пєдики|гнида|гниди'
         || '|дурак|дурень|дурний|дурна|дурне|дурні|тупий|тупа|тупе|тупиця|тупиці'
         || '|козел|козли|даун|бовдур|скот)\M') then
    return 'нецензурна лексика';
  end if;

  -- 4. «Схлопнутий» прохід — ловить рознесене «х у й» / «х-у-й».
  --    Лише ультра-безпечні стеми: як підрядок вони майже не трапляються в легальних словах.
  if regexp_replace(cyr, '[^а-яіїєґa-z]', '', 'g')
     ~ '(хуй|хуйл|пизд|пізд|єбал|їбал|йоб|бляд|блят|мудак|підор|пидор)' then
    return 'нецензурна лексика';
  end if;

  -- 5. Трансліт латиницею + англійська. Стеми довші, щоб не чіпати легальні
  --    англійські слова (не 'ass'/'dick'/'cunt' префіксом).
  foreach one in array array['i', 'l'] loop
    lat := public.text_norm_lat(raw, one);
    if lat ~ ('\m(huy|hui|huil|huyl|huylo|huilo|huesos|xyu|pizd|pizda|yeban|ebal|ebat|zaeb|doeb|vyeb'
           || '|blya|blyad|blyat|suka|suchka|suchara|pidor|pidar|pidoras|mudak|mudil|zalupa|gandon|gondon'
           || '|dolboeb|dolbaeb|mraz|nahui|nahuy|nahyi|nahren|pohui|pohuy|yoban|yobn|govno|gavno|durak'
           || '|fuck|fuk|fuq|shit|bullshit|bitch|biatch|asshole|motherfuck|faggot|nigger|nigga|whore'
           || '|wanker|bollock|dickhead|jackass|dumbass|retard|bastard|douche)') then
      return 'нецензурна лексика';
    end if;
    -- Схлопнутий латинський — ЛИШЕ довгі форми, безпечні як підрядок
    -- (короткі дали б «this hit» → «thishit» → shit).
    if regexp_replace(lat, '[^a-z]', '', 'g') ~ '(blyat|pizda|nahui|pidoras|zalupa|dolboeb)' then
      return 'нецензурна лексика';
    end if;
  end loop;

  return null;
end;
$$;

-- ── Дошка: та сама функція, тепер тонка обгортка ─────────────────────────────
create or replace function public.comments_antispam()
returns trigger language plpgsql as $$
declare
  txt      text := coalesce(NEW.text, '');
  reason   text;
  recent   int;
  lasttext text;
begin
  reason := public.text_abuse_reason(txt);
  if reason is not null then
    raise exception 'antispam: %', reason using errcode = 'check_violation';
  end if;

  -- Рейт-ліміт і дубль — як було: 5 повідомлень / 15с + блок точного повтору.
  if NEW.sender_uid is not null then
    select count(*) into recent from public.comments
     where sender_uid = NEW.sender_uid and created_at > now() - interval '15 seconds';
    if recent >= 5 then
      raise exception 'antispam: занадто швидко (зачекайте кілька секунд)' using errcode = 'check_violation';
    end if;

    select text into lasttext from public.comments
     where sender_uid = NEW.sender_uid order by created_at desc limit 1;
    if lasttext is not null and lasttext = txt then
      raise exception 'antispam: ви щойно це написали' using errcode = 'check_violation';
    end if;
  end if;

  return NEW;
end;
$$;

-- ── «Стрічка»: новий тригер на тому самому двигуні ───────────────────────────
create or replace function public.page_comments_antispam()
returns trigger language plpgsql as $$
declare
  txt      text := coalesce(NEW.text, '');
  reason   text;
  recent   int;
  lasttext text;
begin
  reason := public.text_abuse_reason(txt);
  if reason is not null then
    raise exception 'antispam: %', reason using errcode = 'check_violation';
  end if;

  -- Рейт-ліміт лише для живих людей. Службові вставки (міграції, імпорт,
  -- service_role) не мають auth.uid() і крізь обмеження проходять — інакше
  -- будь-який масовий перенос даних упирався б у «занадто швидко».
  if auth.uid() is null or NEW.author_uid is null then
    return NEW;
  end if;

  select count(*) into recent from public.page_comments
   where author_uid = NEW.author_uid and created_at > now() - interval '15 seconds';
  if recent >= 5 then
    raise exception 'antispam: занадто швидко (зачекайте кілька секунд)' using errcode = 'check_violation';
  end if;

  -- ВІДМІННІСТЬ ВІД ДОШКИ (навмисна): дубль рахується В МЕЖАХ ОДНОГО ПОСТА.
  -- У стрічці нормально написати «Дякую» під двома різними постами поспіль —
  -- глобальна перевірка «останнього повідомлення», як на Дошці, блокувала б
  -- живу людину. Повтор того самого під ТИМ САМИМ постом — уже спам.
  select text into lasttext from public.page_comments
   where author_uid = NEW.author_uid and post_id = NEW.post_id
   order by created_at desc limit 1;
  if lasttext is not null and lasttext = txt then
    raise exception 'antispam: ви щойно це написали' using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_page_comments_antispam on public.page_comments;

-- BEFORE INSERT: перевірка відпрацьовує ДО запису, тож брудний коментар
-- не потрапляє в таблицю навіть на мить (і не встигає підняти сповіщення —
-- trg_notify_new_page_comment спрацьовує AFTER INSERT).
create trigger trg_page_comments_antispam
before insert on public.page_comments
for each row execute function public.page_comments_antispam();
