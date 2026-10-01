// supabase/functions/send-digest-push/index.ts
// Edge Function: РАНКОВЕ ЗВЕДЕННЯ — одне сповіщення на ранок про те, що в
// громаді змінилось за добу.
//
// 🔴 ЗАРАДИ ЧОГО (аудит готовності 30.09, розрив план-vs-код 25.09).
// Ціль №1 курсу — ЗВИЧКА: 🗣️ «зробити цей додаток зручний в повсякденному
// користуванні… щоб в людей випрацювалась звичка заходити сюди». Звичка
// тримається на приводі заходити В ТОЙ САМИЙ ЧАС. Такого приводу не було
// взагалі: push про новини не існував як тип, зведення в розкладі не стояло, і
// людина згадувала про застосунок лише коли їй особисто щось написали.
//
// 🔑 І ДРУГА ПОЛОВИНА ЗАДУМУ, ВАЖЛИВІША ЗА ПЕРШУ. Зведення не додає шуму — воно
// його ЗАМІНЯЄ: одне сповіщення зранку замість восьми за вечір. Разом зі стелею
// частоти (`scripts/supabase_push_quota.sql`) це одна робота, а не дві.
//
// ═════════════════════════════════════════════════════════════════════════════
// 🛑 ВОРОТАР ЧАСУ — ГОЛОВНЕ РІШЕННЯ ЦЬОГО ФАЙЛУ, І ВІН ТУТ НЕ ЗАРАДИ АКУРАТНОСТІ.
// 📐 Заміряно 22-23.09 на власному вартовому: `pg_cron` у цьому проєкті
// душиться незалежно від синтаксису — із десятка оголошених слотів виконуються
// два, і проміжки доходять до 2.5 години. Тобто «розклад о 07:30» тут
// НЕ ОБІЦЯНКА, а побажання.
// ➡️ Наслідок, якого не можна допустити: зведення, що приходить о 14:00, — це
// не ранкова звичка, а випадковий шум, і воно вчить людину вимикати сповіщення.
// 🔑 Тому функція сама дивиться на годинник і шле ЛИШЕ у вікні 6:00-9:00 за
// Києвом. Ненадійний розклад тоді псується в безпечний бік: «якогось ранку
// зведення не прийшло» замість «зведення приходить коли завгодно».
// ⚠️ Вікно, а не одна година (як у `send-unanswered-push`), саме через це
// душіння: прибите до однієї години зведення не приходило б більшість днів.
// ═════════════════════════════════════════════════════════════════════════════
//
// Межі, усі до одної:
//   • вікно 6:00-9:00 за Києвом (воротар вище);
//   • одне на добу на людину (`digest_push_log`, первинний ключ `(uid, день)`) —
//     тож навіть три спрацювання розкладу за ранок дадуть одне сповіщення;
//   • нічого не сталось → НЕ ШЛЕМО НІЧОГО. Зведення «за добу нічого нового»
//     гірше за тишу: воно витрачає довіру і ще раз каже, що тут порожньо;
//   • не тому, хто вимкнув «Ранкове зведення» в кабінеті (`notif_prefs.digest`);
//   • 🛑 стелю класу «громада» НЕ бере і в неї НЕ входить. Зведення — це те, що
//     ми найбільше хочемо донести, і воно вже жорстко обмежене одним на добу
//     власним журналом. Поставити його в спільну чергу з дописами спільнот
//     означало б, що вечірні дописи зʼїдають ранкову звичку.
//
// Кличе РОЗКЛАД `pg_cron` через `public.notify_morning_digest()`
// (`scripts/supabase_digest_push.sql`), тому автентифікація як у
// `send-unanswered-push`: спільний секрет `x-cstl-push-secret`.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PRIVATE_KEY         = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';
const VAPID_EMAIL      = 'mailto:olykacastle@gmail.com';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Вікно ранку за Києвом. 🗣️ Число — рішення Вови, міняється цими двома рядками.
const ВІКНО_ВІД = 6;
const ВІКНО_ДО  = 9;

// Скільки годин назад вважаємо «за добу».
const ЗА_ГОДИН = 24;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cstl-push-secret',
};

// deno-lint-ignore no-explicit-any
type Admin = any;

function частинами<T>(масив: T[], розмір: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < масив.length; i += розмір) out.push(масив.slice(i, i + розмір));
  return out;
}

/**
 * Шле пуш пачками по `ширина` штук одночасно.
 * ⚠️ Копія з `send-unanswered-push`, і це не недогляд: Edge Functions крутяться
 * в Deno на сервері Supabase, кожна деплоїться окремо, спільного модуля між
 * ними немає.
 */
async function слатиПачками(
  пристрої: Array<{ id: number; endpoint: string; p256dh: string; auth_key: string }>,
  payload: string,
  ширина = 50,
): Promise<{ sent: number; dead: number[] }> {
  let sent = 0;
  const dead: number[] = [];
  for (const пачка of частинами(пристрої, ширина)) {
    const наслідки = await Promise.allSettled(пачка.map((d) =>
      webpush.sendNotification(
        { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth_key } },
        payload,
      )
    ));
    наслідки.forEach((н, i) => {
      if (н.status === 'fulfilled') { sent++; return; }
      const код = (н.reason as { statusCode?: number })?.statusCode;
      // 410/404 — підписка мертва. Єдиний випадок, коли рядок можна прибрати:
      // решта збоїв тимчасові, і видаляти по них означало б тихо втрачати живих.
      if (код === 410 || код === 404) dead.push(пачка[i].id);
    });
  }
  return { sent, dead };
}

/** Читає ВСІ рядки запиту сторінками, а не перші 1000 (`db-max-rows`). */
async function усіРядки<T>(
  збудувати: (від: number, до: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  крок = 1000,
): Promise<T[]> {
  const усе: T[] = [];
  for (let від = 0; ; від += крок) {
    const { data, error } = await збудувати(від, від + крок - 1);
    if (error) throw error;
    const пачка = data || [];
    усе.push(...пачка);
    if (пачка.length < крок) return усе;
  }
}

// Котра зараз година в Києві. `pg_cron` живе в UTC і про літній час не знає,
// тому час доби звіряється тут.
// ⚠️ `hourCycle: 'h23'` обовʼязковий: без нього частина реалізацій віддає «24»
// замість «0» опівночі, і година мовчки поїхала б.
function kyivHour() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', hour12: false, hourCycle: 'h23',
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  return Number.isFinite(h) ? h % 24 : -1;
}

/** Який сьогодні день у Києві (`YYYY-MM-DD`) — ключ журналу «одне на добу». */
function kyivDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date());
}

// Українська має три форми числа; 11-14 беруть форму «багато» попри останню цифру.
// ⚠️ Копія `plural()` з `home-caps.js` один-в-один навмисно, щоб число в push і
// число в капсулі відмінювались однаково.
function plural(n: number, one: string, few: string, many: string) {
  const t = n % 100, o = n % 10;
  if (t >= 11 && t <= 14) return many;
  if (o === 1) return one;
  if (o >= 2 && o <= 4) return few;
  return many;
}

/**
 * Чи дозволила людина цю тему.
 * 🔑 ВІДСУТНІЙ РЯДОК = ДОЗВОЛЕНО, помилка запиту — теж. Інакше вмикання нової
 * теми мовчки вимкнуло б сповіщення всім, хто нічого не міняв (B-33, 24.08).
 */
async function allowed(admin: Admin, uids: string[], topic: string) {
  if (!uids.length) return uids;
  const off = new Set<string>();
  for (const шматок of частинами(uids, 200)) {
    const { data, error } = await admin.from('notif_prefs').select(`uid, ${topic}`).in('uid', шматок);
    if (error) return uids;   // не змогли спитати — не глушимо
    (data || []).filter((r: Record<string, unknown>) => r[topic] === false)
                .forEach((r: { uid: string }) => off.add(r.uid));
  }
  return uids.filter((u) => !off.has(u));
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json', ...cors },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const secretHeader = req.headers.get('x-cstl-push-secret') || '';
    if (!secretHeader) return json({ error: 'no secret' }, 401);
    const { data: row } = await admin
      .from('app_secrets').select('value').eq('name', 'page_push_secret').maybeSingle();
    if (!row?.value || row.value !== secretHeader) return json({ error: 'bad secret' }, 401);

    const body = await req.json().catch(() => ({}));

    // 🔑 СУХИЙ ПРОГІН — перевірити механіку, НІЧОГО не надсилаючи живим людям.
    // Рахує той самий відбір і повертає, кому і що пішло б; у журнал не пише,
    // тож жодної нової дірки не відкриває.
    const сухий = body.dry_run === true;

    if (!сухий) {
      const година = kyivHour();
      if (година < ВІКНО_ВІД || година > ВІКНО_ДО) {
        return json({ sent: 0, reason: 'not the morning', kyiv_hour: година });
      }
    }

    // 🔑 Сухий прогін віддає ще й ГОДИНУ, яку функція бачить у Києві. Без цього
    // воротаря часу можна було б перевірити лише справжнім запуском — тобто
    // ризикуючи розіслати живим людям, якщо він якраз зламаний. А зламатись він
    // може МОВЧКИ: не застосується пояс `Europe/Kyiv` — лишиться UTC, і влітку
    // різниця складе рівно три години.
    const відповідь = await run(admin, сухий);
    return json(сухий ? { ...відповідь, kyiv_hour: kyivHour(), kyiv_day: kyivDay() } : відповідь);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function run(admin: Admin, сухий: boolean) {
  const від = new Date(Date.now() - ЗА_ГОДИН * 3600_000).toISOString();
  const день = kyivDay();

  // ── 1. ЩО СТАЛОСЬ ЗА ДОБУ ──────────────────────────────────────────────────
  // 🔑 Рахуємо ТІЛЬКИ числа (`head: true` + `count`), а не везем рядки: зведенню
  // потрібні кількості, і тягнути сотні дописів, щоб їх перелічити, означало б
  // платити памʼяттю і часом функції за те, що база робить сама.
  const число = async (
    таблиця: string,
    // deno-lint-ignore no-explicit-any
    доробити?: (q: any) => any,
  ) => {
    let q = admin.from(таблиця).select('id', { count: 'exact', head: true }).gte('created_at', від);
    if (доробити) q = доробити(q);
    const { count, error } = await q;
    // 🛑 Збій по одному джерелу НЕ має валити зведення цілком: краще сказати
    // про дописи, ніж промовчати про все, бо не відповіла Дошка.
    if (error) { console.warn(`[digest] ${таблиця}:`, error.message); return 0; }
    return count || 0;
  };

  const дописів = await число('page_posts', (q) =>
    q.eq('status', 'published').is('deleted_at', null));
  const оголошень = await число('ads');
  const питань = await число('posts');

  // 🛑 НІЧОГО НЕ СТАЛОСЬ — МОВЧИМО. Зведення «за добу нічого нового» гірше за
  // тишу: воно витрачає довіру і ще раз нагадує, що тут порожньо. А на старті,
  // поки громади в застосунку мало, це буде частий випадок — тобто правило не
  // теоретичне, воно спрацює вже першого тижня.
  const разом = дописів + оголошень + питань;
  if (!разом) return { sent: 0, reason: 'nothing happened', day: день, dry_run: сухий };

  // ── 2. КОМУ ────────────────────────────────────────────────────────────────
  // Усі, у кого є пристрій. Сторінками: на 1001-му мовчки обрізалось би.
  const пристрої = await усіРядки<{ id: number; uid: string; endpoint: string; p256dh: string; auth_key: string }>(
    (а, б) => admin.from('user_push_devices').select('id, uid, endpoint, p256dh, auth_key').order('id').range(а, б));
  const усіUid = [...new Set((пристрої || []).map((d) => d.uid).filter(Boolean))];
  if (!усіUid.length) return { sent: 0, reason: 'no devices', day: день, dry_run: сухий };

  // Вимикач у кабінеті. Для зведення він ОБОВʼЯЗКОВИЙ: людина на це сповіщення
  // не підписувалась окремо, отже власного вимикача «в собі» воно не має.
  const дозволені = await allowed(admin, усіUid, 'digest');

  // Хто вже отримав зведення сьогодні. 🔑 Журнал по (uid, день) робить
  // повторне спрацювання розкладу безпечним: у вікні 6-9 розклад може
  // дзвонити кілька разів, і без цього людина отримала б три зведення за ранок
  // — тобто рівно той потоп, проти якого вся робота.
  const { data: вже } = await admin
    .from('digest_push_log').select('uid').eq('день', день).in('uid', дозволені.slice(0, 1000));
  const отримали = new Set((вже || []).map((r: { uid: string }) => r.uid));
  const кому = дозволені.filter((u) => !отримали.has(u));
  if (!кому.length) return { sent: 0, reason: 'already sent today', day: день, dry_run: сухий };

  // ── 3. ТЕКСТ ───────────────────────────────────────────────────────────────
  // 🔑 Називаємо РЕЧІ, а не розділи: «3 дописи» зрозуміло, «активність у
  // Стрічці» — ні. Те саме правило, що в копірайтингу креативів: конкретний
  // факт замість узагальнення.
  const частини: string[] = [];
  if (дописів)   частини.push(`${дописів} ${plural(дописів, 'новий допис', 'нові дописи', 'нових дописів')}`);
  if (оголошень) частини.push(`${оголошень} ${plural(оголошень, 'оголошення', 'оголошення', 'оголошень')}`);
  if (питань)    частини.push(`${питань} ${plural(питань, 'питання', 'питання', 'питань')}`);

  const payload = JSON.stringify({
    type:  'digest',
    title: 'Доброго ранку',
    body:  `За добу в громаді: ${частини.join(' · ')}`,
    tag:   'digest',            // один тег — нове зведення заміняє непрочитане
    url:   './#/tab/community',
  });

  if (сухий) {
    return { sent: 0, dry_run: true, day: день, would_send: кому.length,
             counts: { дописів, оголошень, питань }, payload: JSON.parse(payload) };
  }

  // ── 4. НАДСИЛАННЯ ──────────────────────────────────────────────────────────
  // ⚠️ Журнал пишемо ПІСЛЯ надсилання і лише тим, кому справді дійшло. Навпаки —
  // і збій сервісу push зʼїв би людині зведення на цілу добу, не показавши його.
  // Той самий урок, що з синком кабінету: позначку ставить той, хто БАЧИВ успіх.
  const свої = (пристрої || []).filter((d) => кому.includes(d.uid));
  const { sent, dead } = await слатиПачками(свої, payload);
  for (const шматок of частинами(dead, 200)) {
    await admin.from('user_push_devices').delete().in('id', шматок);
  }

  if (sent > 0) {
    // Кому дійшло: ті, чий хоч один живий пристрій не потрапив у `dead`.
    const мертві = new Set(dead);
    const дійшло = [...new Set(свої.filter((d) => !мертві.has(d.id)).map((d) => d.uid))];
    for (const шматок of частинами(дійшло, 200)) {
      // ⚠️ `insert` БЕЗ `.select()`: `INSERT … RETURNING` мусив би прочитати
      // вставлене через SELECT-політику, а політик у службової таблиці немає
      // жодної (правило №11-БІС — на цьому проєкт горів двічі).
      await admin.from('digest_push_log')
        .upsert(шматок.map((uid) => ({ uid, день })), { onConflict: 'uid,день' });
    }
  }

  return { sent, day: день, counts: { дописів, оголошень, питань } };
}
