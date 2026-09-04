// НАГАДУВАННЯ ПРО ПОДІЮ СПІЛЬНОТИ — за добу і за годину.
//
// 🗣️ ЗАМОВЛЕННЯ ВОВИ (04.09.2026): «щоб людина могла створити нагадування,
// нажати сповіщення за якийсь певний термін, коли буде ця подія проходити».
// На уточнення, кому саме дзвонити: «в тому випадку якщо людина сама вибрала».
//
// 🔑 ТОМУ ЦЕ НЕ РОЗСИЛКА. Адресат рівно один тип: той, хто НАТИСНУВ «Нагадати»
// (рядок у `event_reminders`). Ні підписники спільноти, ні автор події, ні
// «схожі люди» сюди не потрапляють. Це та сама межа, що в правилі капсул: у
// застосунку показуємо і надсилаємо те, що людина сама створила, обрала або
// ввімкнула.
//
// 🛑 ДВА НАГАДУВАННЯ, БЕЗ НАЛАШТУВАНЬ: за добу і за годину. Вибір часу вимагав
// би окремого екрана заради одного тапу — а «за добу» дає час спланувати,
// «за годину» ловить того, хто планував і забув. Третє між ними нічого не додає.
//
// 🔴 ЖУРНАЛ НАДІСЛАНОГО — В ТОМУ САМОМУ РЯДКУ (`notified_day` / `notified_hour`),
// а не окремою таблицею: рядок і так один на пару «людина + подія», і саме він
// відповідає на питання «чи вже дзвонили». Друга таблиця означала б два джерела
// правди про той самий факт (клас B-27).
//
// ⚠️ ЧАС ПОДІЇ ЗБИРАЄТЬСЯ В КИЄВІ, А НЕ В UTC. `event_date` це `date`, а
// `event_time` — текст «17:00». Наївне склеювання дало б UTC і зсунуло б усі
// нагадування на 2-3 години залежно від пори року. `pg_cron` живе в UTC і про
// літній час не знає — тому пояс застосовується ТУТ, при обчисленні.
//
// 🔑 ПОДІЯ БЕЗ ЧАСУ — теж подія. Тоді за точку відліку беремо 10:00 ранку дня
// події: нагадування «за годину» о 00:01 було б знущанням, а мовчати про подію,
// на яку людина підписалась, — гірше за неточність у пів дня.
//
// Запуск: `pg_cron` кожні 5 хвилин через `public.notify_event_reminders()`.
// Секрет — той самий `page_push_secret`, нового не заводимо.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PRIVATE_KEY         = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';
const VAPID_EMAIL      = 'mailto:olykacastle@gmail.com';

// Вікна нагадувань, у хвилинах до початку події.
// ⚠️ Ширина вікна (`SLOT`) мусить бути НЕ МЕНШОЮ за крок cron, інакше нагадування
// просто провалиться між двома запусками і не прийде взагалі.
const DAY_MIN  = 24 * 60;   // за добу
const HOUR_MIN = 60;        // за годину
const SLOT     = 10;        // допуск ±: cron ходить раз на 5 хв

// Подія без часу — вважаємо, що вона о 10:00 (див. шапку).
const DEFAULT_HOUR = 10;

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cstl-push-secret',
};

// deno-lint-ignore no-explicit-any
type Admin = any;

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
    return json(await run(admin, !!body.dry_run));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

// Момент початку події в мілісекундах, зібраний У КИЄВІ.
// 🔑 Зсув береться з самої дати, а не вписаний числом: `Intl` знає про перехід
// на літній час, а «+3» — ні, і взимку всі нагадування поїхали б на годину.
function eventStartMs(dateStr: string, timeStr: string | null): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(timeStr || '');
  const hh = m ? Number(m[1]) : DEFAULT_HOUR;
  const mm = m ? Number(m[2]) : 0;
  // Спершу тлумачимо як UTC, потім знімаємо київський зсув для ЦІЄЇ дати.
  const naive = Date.parse(`${dateStr}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`);
  return naive - kyivOffsetMs(naive);
}

function kyivOffsetMs(atMs: number): number {
  const d = new Date(atMs);
  const kyiv = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  const utc  = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
  return kyiv.getTime() - utc.getTime();
}

async function run(admin: Admin, dryRun: boolean) {
  const now = Date.now();

  // Беремо лише ті нагадування, де ще НЕ надіслано хоча б одне з двох.
  // ⚠️ Вкладений select тягне саму подію: без назви й дати push нічого не скаже.
  const { data: rows, error } = await admin
    .from('event_reminders')
    .select('id, uid, post_id, notified_day, notified_hour, page_posts(id, text, event_date, event_time, event_location, deleted_at, page_id, pages(name))')
    .or('notified_day.eq.false,notified_hour.eq.false')
    .limit(500);
  if (error) return { error: error.message };
  if (!rows?.length) return { sent: 0, reason: 'nothing pending' };

  const dueDay: number[] = [];    // id рядків, кому час слати «за добу»
  const dueHour: number[] = [];   // …і «за годину»
  const plan: { uid: string; payload: Record<string, unknown>; row: number; kind: string }[] = [];

  for (const r of rows) {
    const p = r.page_posts;
    // Подію видалили або зняли з неї дату — нагадувати нема про що.
    if (!p || p.deleted_at || !p.event_date) continue;

    const startMs = eventStartMs(p.event_date, p.event_time);
    const minsLeft = Math.round((startMs - now) / 60000);

    // 🛑 Подія вже почалась — мовчимо. Нагадування «про те, що вже йде» не дія,
    // а докір; те саме правило, що в шкалі капсул («прикро ≠ терміново»).
    if (minsLeft < 0) continue;

    const near = (target: number) => Math.abs(minsLeft - target) <= SLOT;
    const title = firstLine(p.text);
    const when  = p.event_time ? ` о ${p.event_time}` : '';
    const place = p.event_location ? ` · ${p.event_location}` : '';
    const page  = p.pages?.name || 'Спільнота';

    if (!r.notified_day && near(DAY_MIN)) {
      dueDay.push(r.id);
      plan.push({
        uid: r.uid, row: r.id, kind: 'day',
        payload: {
          title: `Завтра${when}: ${title}`,
          body: `${page}${place}`,
          tag: `event-${p.id}-day`,
          url: `/#/post/feed/${p.id}`,
        },
      });
    } else if (!r.notified_hour && near(HOUR_MIN)) {
      dueHour.push(r.id);
      plan.push({
        uid: r.uid, row: r.id, kind: 'hour',
        payload: {
          title: `Через годину: ${title}`,
          body: `${page}${place}`,
          tag: `event-${p.id}-hour`,
          url: `/#/post/feed/${p.id}`,
        },
      });
    }
  }

  if (!plan.length) return { sent: 0, reason: 'nothing due' };

  // 🛑 ВИМИКАЧ КАБІНЕТУ ПОВАЖАЄМО (B-33: вимикач, який нічого не вимикає, гірший
  // за його відсутність — він підтверджує дію, якої ніхто не зробив).
  const uids = [...new Set(plan.map(p => p.uid))];
  const { data: prefs } = await admin
    .from('notif_prefs').select('uid, events').in('uid', uids);
  const off = new Set((prefs || []).filter((p: any) => p.events === false).map((p: any) => p.uid));
  const live = plan.filter(p => !off.has(p.uid));

  if (dryRun) {
    return { dry_run: true, planned: live.length, muted: plan.length - live.length,
             kinds: live.map(p => p.kind) };
  }

  let sent = 0;
  for (const item of live) sent += await push(admin, item.uid, item.payload);

  // 🔑 ПОЗНАЧАЄМО ВСІХ, КОМУ НАСТАВ ЧАС, — включно з тими, хто вимкнув сповіщення
  // або чий пристрій мовчить. Позначка означає «момент минув», а не «долетіло»:
  // інакше людина з мертвим пристроєм щоп'ять хвилин потрапляла б у вибірку
  // знову, а вимкнувши сповіщення — отримала б їх усі гуртом, коли ввімкне.
  if (dueDay.length)  await admin.from('event_reminders').update({ notified_day: true }).in('id', dueDay);
  if (dueHour.length) await admin.from('event_reminders').update({ notified_hour: true }).in('id', dueHour);

  return { sent, planned: live.length, muted: plan.length - live.length };
}

// Перший рядок допису — він і є назвою події на екрані.
// ⚠️ Стеля 60 символів: довший заголовок системне сповіщення однаково обріже, а
// обрізаємо ми по СЛОВУ, щоб не лишити половину.
function firstLine(text: string): string {
  const line = String(text || '').split('\n')[0].trim() || 'Подія';
  if (line.length <= 60) return line;
  const cut = line.slice(0, 60);
  const sp = cut.lastIndexOf(' ');
  return (sp > 30 ? cut.slice(0, sp) : cut) + '…';
}

async function push(admin: Admin, uid: string, payload: Record<string, unknown>) {
  const { data: devices } = await admin.from('user_push_devices').select('*').eq('uid', uid);
  if (!devices?.length) return 0;
  const msg = JSON.stringify(payload);
  let sent = 0;
  const dead: number[] = [];
  for (const d of devices) {
    try {
      await webpush.sendNotification(
        { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth_key } }, msg);
      sent++;
    } catch (e) {
      // 404/410 — пристрій відписався назавжди; решта помилок тимчасові.
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) dead.push(d.id);
    }
  }
  if (dead.length) await admin.from('user_push_devices').delete().in('id', dead);
  return sent;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
