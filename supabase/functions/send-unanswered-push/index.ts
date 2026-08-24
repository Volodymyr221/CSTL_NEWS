// supabase/functions/send-unanswered-push/index.ts
// Edge Function: ТИП 4 — «у громаді є питання, на яке ніхто не відповів».
//
// 🔴 ЧОМУ ЦЕЙ ТИП ІШОВ ОСТАННІМ І ЧОМУ ВІН НАЙРИЗИКОВАНІШИЙ.
// Три інші типи сповіщень у Питаннях приходять до людини, яка щось зробила:
// поставила питання, відповіла комусь, натиснула «Мене теж цікавить». Тип 4 —
// єдиний, де людина не робила НІЧОГО. Правило №12 (`сам зробив + сталась подія
// + ще актуально`) він провалює на першому ж пункті, якщо надіслати його всім.
// А ціна помилки тут не «незручно»: одне вимкнення сповіщень — і людина втрачає
// ВСІ типи, зокрема автобусні, які їй справді потрібні. Канал втрачається
// назавжди.
//
// 🛑 ТОМУ КОЛО ЗВУЖЕНЕ ДО ТИХ, ХТО ВЖЕ ВІДПОВІДАВ (`docs/QA_CONCEPT.md` §14):
// людина написала хоча б одну відповідь у Питаннях за останні 90 днів. Це не
// вгадування («ми думаємо, ви знаєте про дороги»), а факт, який людина може
// згадати про себе: «я відповідаю людям у Питаннях». Джерело — таблиця
// `comments`, нічого нового збирати не треба.
//
// 🔑 І ГОЛОСНИЙ РІВЕНЬ ТУТ ТРЕТІЙ, А НЕ ПЕРШИЙ. Два тихі вже працюють і нікуди
// не діваються: капсула «ПИТАННЯ · ПОТРІБНА ВІДПОВІДЬ» на Громаді
// (`RANK.QUESTION`) і крапка на вкладці «Питання» (`unseenDiscussionsCount`).
// Push — це не заміна їм, а звернення до тих, хто вже показав, що відповідає.
//
// Межі (§15), усі до одної:
//   • питання «дозріло»  — старше 24 год і БЕЗ ЖОДНОЇ відповіді;
//   • питання «протухло» — старше 7 діб, більше не турбуємо;
//   • один прохід на добу, 11:00 за Києвом;
//   • не частіше 1 разу на 3 доби на людину (`qa_unanswered_push_log`);
//   • не авторові самого питання;
//   • не тому, хто вимкнув «Питання» в кабінеті (`notif_prefs`, B-33);
//   • список порожній → НЕ ШЛЕМО НІЧОГО. Мовчання краще за розсилку.
//
// 🔑 Нічна тиша (22:00–08:00) окремою перевіркою не потрібна: прохід один і він
// прибитий до 11:00. Це і був аргумент за «один прохід» замість «через 24 год
// після питання» — другий варіант розмазав би push по добі й дав би нічні
// спрацювання.
//
// Кличе РОЗКЛАД `pg_cron` через `public.notify_unanswered_questions()`
// (`scripts/supabase_unanswered_push.sql`), тому:
//   • `verify_jwt` УВІМКНЕНО — розклад шле публічний ключ, як у `send-bus-push`;
//   • спільний секрет `x-cstl-push-secret` — ДРУГИЙ рубіж, а не заміна першого.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PRIVATE_KEY         = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';
const VAPID_EMAIL      = 'mailto:illiabogdanets041@gmail.com';

const SEND_HOUR_KYIV   = 11;   // §15 — обід: людина в телефоні, не за кермом і не спить
const RIPE_HOURS       = 24;   // добу громаді дали, не спрацювало
const STALE_DAYS       = 7;    // якщо тиждень ніхто не знав — не знає ніхто
const RESPONDER_DAYS   = 90;   // «відповідав у Питаннях» — за який строк
const PER_PERSON_DAYS  = 3;    // не частіше разу на 3 доби на людину
// Стеля на вибірку відповідей за 90 днів. Потрібна не для швидкості, а щоб межа
// була НАЗВАНА: PostgREST однаково обріже дуже велику вибірку — краще обрізати
// самим і помітити це, ніж мовчки недорахувати відповідачів (див. нижче).
const RESPONDER_ROWS   = 5000;

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cstl-push-secret',
};

// deno-lint-ignore no-explicit-any
type Admin = any;

type Question = { id: number; title: string | null; text: string | null; owner_uid: string | null };

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

    // 🔑 СУХИЙ ПРОГІН — щоб перевірити механіку, НІЧОГО не надсилаючи живим
    // людям. Рахує той самий відбір і повертає, кому і що пішло б. Це не режим
    // «обійти розклад»: він нічого не шле і нічого не пише в журнал, тому
    // жодної нової дірки не відкриває.
    const сухий = body.dry_run === true;

    // Розклад дзвонить двічі (08:00 і 09:00 UTC), бо `pg_cron` не знає про
    // перехід на літній час. Робочий — рівно той виклик, що припав на 11:00
    // за Києвом; другий тихо виходить тут.
    if (!сухий) {
      const година = kyivHour();
      if (година !== SEND_HOUR_KYIV) return json({ sent: 0, reason: 'not the hour', kyiv_hour: година });
    }

    // 🔑 Сухий прогін віддає ще й ГОДИНУ, яку функція бачить у Києві. Без цього
    // перевірити воротар часу можна було б лише справжнім запуском — тобто
    // ризикуючи розіслати живим людям, якщо він якраз зламаний. А зламатись він
    // може мовчки: якщо пояс `Europe/Kyiv` не застосується, лишиться UTC, і
    // влітку різниця складе рівно три години.
    const відповідь = await run(admin, сухий);
    return json(сухий ? { ...відповідь, kyiv_hour: kyivHour() } : відповідь);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function run(admin: Admin, сухий: boolean) {
  const тепер = Date.now();

  // ── 1. ЯКІ ПИТАННЯ ЛИШИЛИСЬ БЕЗ ВІДПОВІДІ ──────────────────────────────────
  const дозріло = new Date(тепер - RIPE_HOURS * 3600_000).toISOString();
  const протухло = new Date(тепер - STALE_DAYS * 86_400_000).toISOString();
  const { data: кандидати } = await admin
    .from('posts')
    .select('id, title, text, owner_uid')
    .eq('type', 'chat').eq('status', 'published')
    .lt('created_at', дозріло)
    .gt('created_at', протухло)
    .order('created_at', { ascending: false });

  const ids: number[] = (кандидати || []).map((p: Question) => p.id);
  if (!ids.length) return { sent: 0, reason: 'no ripe questions', dry_run: сухий };

  // «Без жодної відповіді» рахуємо по НЕвидаленим репліках: питання, під яким
  // відповідь була й її прибрали, для читача так само лишилось без відповіді.
  // ⚠️ Порожній список у `.in()` сюди не потрапить — `ids` уже перевірений
  // (`.in('post_id', [])` дає `in.()`, тобто помилку розбору PostgREST).
  const { data: репліки } = await admin
    .from('comments').select('post_id').in('post_id', ids).is('deleted_at', null);
  const відповіли = new Set((репліки || []).map((r: { post_id: number }) => r.post_id));
  const без_відповіді: Question[] = (кандидати || []).filter((p: Question) => !відповіли.has(p.id));
  if (!без_відповіді.length) return { sent: 0, reason: 'all answered', dry_run: сухий };

  // ── 2. КОГО ВЗАГАЛІ Є СЕНС ПИТАТИ (§14) ────────────────────────────────────
  //
  // Умова рівно одна і вона вже є в базі: людина написала хоча б одну відповідь
  // У ПИТАННЯХ за останні 90 днів. Саме в Питаннях, а не будь-де: коментар під
  // оголошенням Дошки («ще продаєте?») нічого не каже про готовність відповідати
  // громаді.
  const { data: усі_питання } = await admin.from('posts').select('id').eq('type', 'chat');
  const питання_ids: number[] = (усі_питання || []).map((p: { id: number }) => p.id);
  if (!питання_ids.length) return { sent: 0, reason: 'no questions at all', dry_run: сухий };

  const відколи = new Date(тепер - RESPONDER_DAYS * 86_400_000).toISOString();
  const { data: відповіді } = await admin
    .from('comments')
    .select('sender_uid')
    .in('post_id', питання_ids)
    .is('deleted_at', null)
    .gt('created_at', відколи)
    .limit(RESPONDER_ROWS);
  // 🛑 ЯКЩО ВПЕРЛИСЬ У СТЕЛЮ — ЦЕ ТРЕБА ПОБАЧИТИ, А НЕ ПРОКОВТНУТИ. Обрізана
  // вибірка означає, що частина відповідачів не потрапила в коло, і сповіщення
  // тихо не дійде до людей, які його заслужили. Помилки тут немає — тому єдиний
  // спосіб її помітити це запис у лог. Коли громада доросте до цієї межі,
  // вибірку треба переносити в RPC із `distinct` на боці Postgres.
  if ((відповіді || []).length >= RESPONDER_ROWS) {
    console.warn(`[qa-unanswered] вперлись у стелю вибірки ${RESPONDER_ROWS} — коло відповідачів може бути неповним`);
  }
  // ⚠️ Порожній `sender_uid` відсіюємо в JS, а не запитом: половина старих
  // відповідей у Питаннях написана до введення підпису, і так само пишуть
  // дописи ШІ-агента. Це той самий випадок, що вже коштував уваги 23.08.
  const відповідачі = [...new Set(
    (відповіді || []).map((r: { sender_uid: string | null }) => r.sender_uid).filter(Boolean),
  )] as string[];
  if (!відповідачі.length) return { sent: 0, reason: 'no responders', dry_run: сухий };

  // ── 3. КОГО ВИКЛЮЧАЄМО ─────────────────────────────────────────────────────
  //
  // 🛑 «Той, хто вже відповів у цьому питанні» окремою перевіркою не потрібен і
  // це не пропуск: у списку §1 лишились питання РІВНО з нулем відповідей, тож
  // такої людини там фізично немає.
  const межа = new Date(тепер - PER_PERSON_DAYS * 86_400_000).toISOString();
  const { data: свіжі } = await admin
    .from('qa_unanswered_push_log')
    .select('uid').in('uid', відповідачі).gte('created_at', межа);
  const тихі = new Set((свіжі || []).map((r: { uid: string }) => r.uid));

  // Вимикач «Питання» в кабінеті. Для типу 4 він ОБОВʼЯЗКОВИЙ — людина на це
  // сповіщення не підписувалась, отже власного вимикача «в собі» воно не має.
  const кому = await allowed(admin, відповідачі.filter((u) => !тихі.has(u)), 'questions');
  if (!кому.length) return { sent: 0, reason: 'nobody to ask', dry_run: сухий };

  // ── 4. У КОЖНОГО СВІЙ СПИСОК ───────────────────────────────────────────────
  //
  // Автор питання зі свого ж списку випадає: він і так чекає, і сповіщення
  // «допоможіть відповісти на ваше питання» виглядало б знущанням.
  const план = new Map<string, Question[]>();
  for (const uid of кому) {
    const мої = без_відповіді.filter((q) => q.owner_uid !== uid);
    if (мої.length) план.set(uid, мої);
  }
  if (!план.size) return { sent: 0, reason: 'nobody to ask', dry_run: сухий };

  if (сухий) {
    return {
      sent: 0, dry_run: true,
      questions: без_відповіді.map((q) => q.id),
      plan: [...план].map(([uid, qs]) => ({ uid, posts: qs.map((q) => q.id) })),
    };
  }

  // ── 5. НАДСИЛАННЯ ──────────────────────────────────────────────────────────
  const надіслано = await pushEach(admin, [...план].map(([uid, qs]) => ({ uid, payload: payloadFor(qs) })));

  // Журнал пишемо ВСІМ, кому надсилали — навіть якщо жоден пристрій не прийняв.
  // 🔑 Межа «раз на 3 доби» рахує спроби звернутись, а не успіхи доставки:
  // інакше людина з тимчасово мертвим пристроєм щодня потрапляла б у список
  // заново і, повернувшись, отримала б чергу однакових сповіщень.
  const рядки = [...план].map(([uid, qs]) => ({
    uid, posts: qs.map((q) => q.id), sent: надіслано.get(uid) || 0,
  }));
  try {
    // ⚠️ `insert` БЕЗ `.select()` — `INSERT … RETURNING` мусив би прочитати
    // вставлене через SELECT-політику, а політик у службової таблиці немає
    // жодної (правило №11-БІС: на цьому проєкт горів двічі).
    await admin.from('qa_unanswered_push_log').insert(рядки);
  } catch (_) { /* журнал не має права зривати вже надіслане */ }

  let sum = 0;
  for (const n of надіслано.values()) sum += n;
  return { sent: sum, people: рядки.length, questions: без_відповіді.length };
}

// ── ЯК ВИГЛЯДАЄ САМЕ СПОВІЩЕННЯ (§16) ───────────────────────────────────────
//
// 🔑 ОДНЕ ПИТАННЯ — ПОКАЗУЄМО САМЕ ЙОГО. Текст живого питання переконує краще
// за будь-яке число: людина одразу бачить, чи знає відповідь.
// 🔑 КІЛЬКА — ЧИСЛО, І ТАП ВЕДЕ У ВКЛАДКУ, а не в одне з них. Push, який каже
// «5 питань» і відкриває одне, бреше про решту чотири — рівно та вада, яку
// лікували 23.08 у зведеному «N нових відповідей».
// 🛑 Стелі на число немає навмисно: «13 питань громади» — це чесно, і в такому
// вигляді воно скоріше вражає, ніж дратує. Обмежена ЧАСТОТА (§15), а не число.
function payloadFor(qs: Question[]) {
  const n = qs.length;
  if (n === 1) {
    const q = qs[0];
    return {
      type: 'qa-unanswered', post_id: q.id, count: 1,
      title: 'Потрібна відповідь',
      body: trim(q.title || q.text, 110) || 'Питання в громаді чекає на відповідь',
      tag: 'qa-unanswered', url: `./#/post/disc/${q.id}`,
    };
  }
  return {
    type: 'qa-unanswered', count: n,
    title: `${n} ${plural(n, 'питання чекає', 'питання чекають', 'питань чекають')} на відповідь`,
    body: 'Можливо, ви знаєте відповідь на одне з них',
    // `#/tab/disc` — вкладка «Питання» цілком. Маршрут заведено разом із цим
    // типом (`handleTabHash` у `src/app.js`): доти deep-link умів вести лише в
    // конкретний запис, і «кілька питань» не мали куди вести чесно.
    tag: 'qa-unanswered', url: './#/tab/disc',
  };
}

// ── НАДСИЛАННЯ, ДЕ В КОЖНОГО СВОЄ ПОВІДОМЛЕННЯ ──────────────────────────────
//
// 🔑 ЧОМУ ВЛАСНА ФУНКЦІЯ, А НЕ ТА, ЩО В `send-answer-push`. Там один payload на
// групу людей, тут у кожного свій список питань (у автора питання воно зі
// списку випадає). Наївне рішення — виклик спільного `push()` на кожного —
// означало б окремий запит до `user_push_devices` на КОЖНУ людину. Тут пристрої
// беруться ОДНИМ запитом, а далі розкладаються по власниках у памʼяті.
async function pushEach(admin: Admin, завдання: { uid: string; payload: Record<string, unknown> }[]) {
  const результат = new Map<string, number>();
  if (!завдання.length) return результат;

  const uids = завдання.map((z) => z.uid);
  const { data: пристрої } = await admin.from('user_push_devices').select('*').in('uid', uids);
  if (!пристрої?.length) return результат;

  // deno-lint-ignore no-explicit-any
  const по_людях = new Map<string, any[]>();
  for (const d of пристрої) {
    if (!по_людях.has(d.uid)) по_людях.set(d.uid, []);
    по_людях.get(d.uid)!.push(d);
  }

  const мертві: number[] = [];
  for (const { uid, payload } of завдання) {
    const свої = по_людях.get(uid) || [];
    const msg = JSON.stringify(payload);
    let n = 0;
    for (const d of свої) {
      try {
        await webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth_key } }, msg);
        n++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 410 || code === 404) мертві.push(d.id);   // пристрій відписався
      }
    }
    результат.set(uid, n);
  }
  if (мертві.length) await admin.from('user_push_devices').delete().in('id', мертві);
  return результат;
}

// ── ЧИ ДОЗВОЛИЛА ЛЮДИНА ЦЮ ТЕМУ (B-33, 24.08) ───────────────────────────────
//
// 🔑 ВІДСУТНІЙ РЯДОК = ДОЗВОЛЕНО, помилка запиту — теж. Інакше вмикання фічі
// мовчки вимкнуло б сповіщення всім, хто нічого не міняв.
// ⚠️ Хелпер продубльований у кожній Edge Function, і це не недогляд: вони
// крутяться в Deno на сервері Supabase, кожна деплоїться окремо і спільного
// модуля між ними немає.
async function allowed(admin: Admin, uids: string[], topic: string) {
  if (!uids.length) return uids;
  const { data, error } = await admin
    .from('notif_prefs').select('uid, buses, board, questions, feed').in('uid', uids);
  if (error) return uids;   // не змогли спитати — не глушимо
  const off = new Set(
    (data || []).filter((r: Record<string, unknown>) => r[topic] === false)
                .map((r: { uid: string }) => r.uid),
  );
  return uids.filter((u) => !off.has(u));
}

// Котра зараз година в Києві. `pg_cron` живе в UTC і про літній час не знає,
// тому час доби звіряється тут — там, де є справжня робота з поясами.
// ⚠️ `hourCycle: 'h23'` обовʼязковий: без нього частина реалізацій віддає «24»
// замість «0» опівночі, і година мовчки поїхала б.
function kyivHour() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Kyiv', hour: '2-digit', hour12: false, hourCycle: 'h23',
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  return Number.isFinite(h) ? h % 24 : -1;
}

// Українська має три форми числа. Окремо 11-14: вони беруть форму «багато»
// попри останню цифру.
// ⚠️ Копія `plural()` з `src/tabs/home-caps.js` — Edge Function крутиться в Deno
// і фізично не може імпортувати нічого з `src/`. Формула взята один-в-один
// навмисно, щоб число в push і число в капсулі відмінювались однаково.
function plural(n: number, one: string, few: string, many: string) {
  const t = n % 100, o = n % 10;
  if (t >= 11 && t <= 14) return many;
  if (o === 1) return one;
  if (o >= 2 && o <= 4) return few;
  return many;
}

function trim(s: string | null, n: number) {
  const t = (s || '').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json', ...cors },
  });
}
