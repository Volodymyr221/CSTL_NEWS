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
-- 🔴 25.08 — ОДНЕ ПРАВИЛО ОДНИМ ЧИСЛОМ: **15 секунд**. За цей час не більше
-- 8 повідомлень і не двічі той самий текст. Раніше вікно мав лише рейт-ліміт,
-- а дубль порівнювався з останнім текстом БЕЗ обмеження в часі — тому
-- найкоротші й найприродніші відповіді («Окей», «Дякую», «Так») блокувались
-- найнадійніше: саме їх пишуть повторно. Скарга Вови: «я вчора написав
-- повідомлення, сьогодні зранку не можу те саме слово написати».
-- 🛑 Число дзеркалить клієнт (`src/core/utils.js`, DUP_WINDOW / FLOOD_WINDOW).
-- ✅ Накатано міграцією `antispam_duplicate_gets_time_window` і доведено на
-- живій базі транзакцією з відкотом: дубль годину тому проходить, миттєвий
-- повтор блокується САМЕ антиспамом, інший текст одразу проходить.
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

  -- Апостроф — ЧАСТИНА українського слова («обʼєднає», «памʼять»), не роздільник.
  -- Прибираємо ДО розбору: інакше «…два дні й обʼєднає…» розпадалось на «й» + «об»
  -- і склеювалось у «йоб». Спроба ж обійти фільтр («хʼуʼй») навпаки схлопнеться в «хуй».
  cyr := translate(public.text_norm_cyr(raw), '''’ʼ`´', '');

  -- Легальні слова, що ПОЧИНАЮТЬСЯ з матюкового стему — знімаємо перед перевіркою.
  -- Не вигадані: знайдені прогоном фільтра по живому корпусу (400 статей
  -- data/articles.json, 26.07). «підорлик» — птах Aquila pomarina (стаття про
  -- орнітологів нацпарку «Припʼять – Стохід»); «ЄБРР» — Європейський банк
  -- реконструкції та розвитку (стаття про теплові мережі Луцька).
  cyr := regexp_replace(cyr, '\m(підорлик|єбрр)[а-яіїєґ]*', ' ', 'g');

  -- 2. Сильні стеми — блокуємо слово, якщо воно ПОЧИНАЄТЬСЯ з них (\m = початок слова).
  --    ⚠️ ЗВУЖЕНО 26.07 (рішення Вови «послаб фільтр тільки на прямі матюки»):
  --    прибрано ОБРАЗИ (ідіот, кретин, придур, імбецил, дебіл, лох, дурак/дурень/дурний,
  --    тупий/тупиця, козел, даун, бовдур, скотина, гнида, тварюка, лошара, мразь, падло,
  --    сволота, педик) і ВУЛЬГАРИЗМИ (гівно, говно, срака, сраний, жопа, сцикло).
  --    Це не матюки, а звичайна різкість — мовчки відхиляти за них повідомлення задорого.
  --    Також 'довбо'/'долбо' → повні форми: стем блокував легальне «довбати стіну».
  --    Стеми перевірені щоб не чіпати легальні: художник/хустка/хуліган, мандарин,
  --    корабля, сучок, шлюб.
  if cyr ~ ('\m(хуй|хує|хуя|хуї|хуйл|хуєс|пизд|пізд|бляд|блят|єб|їб|йоб|ебал|ебан|ебат|ебут|ебуч|ебну'
         || '|наєб|наеб|наїб|заєб|заїб|виєб|виїб|доїб|уїб|уєб|уеб|залуп|гандон|гондон|мудак|мудил'
         || '|підар|підор|пидор|пидар|наху|похуй|дроч|сцук|курв|шлюх|шльондр'
         || '|довбойоб|довбоєб|довбаєб|долбоеб|долбойоб)') then
    return 'нецензурна лексика';
  end if;

  -- 3. Ризиковані короткі — ЛИШЕ повним словом (\m…\M), бо префікс дав би хибу
  --    («сукня», «корабля»). Звужено разом із п.2.
  if cyr ~ '\m(бля|сука|суки|суку|сучка|сучки|хер|манда|манди)\M' then
    return 'нецензурна лексика';
  end if;

  -- 4. Рознесений обхід «х у й» / «х-у-й» / «б л я т ь».
  --    🔴 ПЕРЕПИСАНО 26.07 — це і була головна причина хибних блокувань.
  --    БУЛО: з тексту прибирались УСІ пробіли й розділові знаки, і стеми шукались
  --    підрядком у злитому полотні. Задум правильний, наслідок — ні: у злитому тексті
  --    шматками матюків стають звичайні слова. Пост Вови про туристичну Олику не
  --    публікувався через «…та ро[блят]ь усе…» — слово «роблять». Прогін 21 звичайної
  --    фрази ловив 15: роблять/люблять/зроблять, «свій обовʼязок», «який обрав»,
  --    «твій образ», «стій обережно» («йоб»), «під орудою» («підор»), «купи здоровя».
  --    СТАЛО: кожне слово з 2+ літер стає БАРʼЄРОМ '|', решта не-літер зникає. Тобто
  --    склеюються лише ланцюжки ОДИНОЧНИХ літер — саме так і виглядає обхід. Стем
  --    не містить '|', тож знайтись може лише всередині одного ланцюжка.
  --    Дзеркалить spacedRuns() з src/core/utils.js.
  if regexp_replace(regexp_replace(cyr, '[а-яіїєґa-z]{2,}', '|', 'g'), '[^а-яіїєґa-z|]', '', 'g')
     ~ '(хуй|хуйл|пизд|пізд|єбал|їбал|йоб|бляд|блят|мудак|підор|пидор)' then
    return 'нецензурна лексика';
  end if;

  -- 5. Трансліт латиницею + англійська. Стеми довші, щоб не чіпати легальні
  --    англійські слова (не 'ass'/'dick'/'cunt' префіксом).
  --    ⚠️ ЗВУЖЕНО 26.07 разом із кирилицею — пішли образи й вульгаризми: durak, govno,
  --    gavno, mraz, nahren, retard, bastard, jackass, dumbass, douche, wanker, bollock,
  --    dickhead, whore, biatch.
  --    🛑 nigger / nigga / faggot ЛИШЕНО СВІДОМО — це не «різкість у розмові», а мова
  --    ворожнечі; під правило «прибрати образи» вони не підпадають.
  foreach one in array array['i', 'l'] loop
    lat := translate(public.text_norm_lat(raw, one), '''’ʼ`´', '');
    if lat ~ ('\m(huy|hui|huil|huyl|huylo|huilo|huesos|xyu|pizd|pizda|yeban|ebal|ebat|zaeb|doeb|vyeb'
           || '|blya|blyad|blyat|suka|suchka|suchara|pidor|pidar|pidoras|mudak|mudil|zalupa|gandon|gondon'
           || '|dolboeb|dolbaeb|nahui|nahuy|nahyi|pohui|pohuy|yoban|yobn'
           || '|fuck|fuk|fuq|shit|bullshit|bitch|asshole|motherfuck|faggot|nigger|nigga)') then
      return 'нецензурна лексика';
    end if;
    -- Рознесений латинський («b l y a t») — той самий барʼєрний прийом, що в п.4.
    -- БУЛО: склейка всього тексту, через що «this hit» → «thishit» → shit.
    if regexp_replace(regexp_replace(lat, '[a-z]{2,}', '|', 'g'), '[^a-z|]', '', 'g')
       ~ '(blyat|pizda|nahui|pidoras|zalupa|dolboeb)' then
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

  -- Рейт-ліміт і дубль: 8 повідомлень / 15с + блок точного повтору.
  -- Було 5 — послаблено 25.07 разом зі «Стрічкою», щоб межі не розходились.
  if NEW.sender_uid is not null then
    select count(*) into recent from public.comments
     where sender_uid = NEW.sender_uid and created_at > now() - interval '15 seconds';
    if recent >= 8 then
      raise exception 'antispam: занадто швидко (зачекайте кілька секунд)' using errcode = 'check_violation';
    end if;

    -- 🔑 25.08 — ДУБЛЬ МАЄ ВІКНО. Без `created_at > …` останній текст блокував
    -- свій повтор НАЗАВЖДИ: «Окей», написане вчора, не давало написати «Окей»
    -- сьогодні. Рейт-ліміт вікно мав, а ця перевірка — ні.
    select text into lasttext from public.comments
     where sender_uid = NEW.sender_uid
       and created_at > now() - interval '15 seconds'
     order by created_at desc limit 1;
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
  if recent >= 8 then
    raise exception 'antispam: занадто швидко (зачекайте кілька секунд)' using errcode = 'check_violation';
  end if;

  -- ВІДМІННІСТЬ ВІД ДОШКИ (навмисна): дубль рахується в межах ПОСТ + АДРЕСАТ.
  -- У стрічці нормально написати «Дякую» під двома різними постами, і так само
  -- нормально подякувати ДВОМ РІЗНИМ людям під ОДНИМ постом — на це впоролось
  -- живе тестування (Вова 25.07). Спам — те саме слово ТІЙ САМІЙ людині вдруге.
  -- `is not distinct from` — щоб null (кореневий коментар) порівнювався з null,
  -- а не давав невизначеність, за якої умова ніколи не спрацьовує.
  -- 🔑 25.08 — те саме вікно, що й у Дошці (див. пояснення там).
  select text into lasttext from public.page_comments
   where author_uid = NEW.author_uid
     and post_id = NEW.post_id
     and reply_to_uid is not distinct from NEW.reply_to_uid
     and created_at > now() - interval '15 seconds'
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
