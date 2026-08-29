// supabase/functions/send-bus-push/index.ts
// Edge Function: надсилає Web Push сповіщення при відстеженні автобусного рейсу.
//
// Запускається кожну хвилину: cron * * * * *
//
// Типи сповіщень:
//   А. Проміжна зупинка (boarding ≠ перша зупинка маршруту):
//      1. notified_warning: "Автобус буде на зупинці Олика через ~15 хв · 07:45" — T-15 до зупинки посадки
//      2. notified_dep:     "Автобус на зупинці · Олика"          — T-0 (автобус на зупинці посадки)
//   Б. Звичайний рейс (boarding = початкова зупинка або без сегменту):
//      1. notified_warning: "Автобус відправляється через ~15 хв · 07:15" — T-15
//      2. notified_dep:     "Автобус вирушив · 07:15"            — T-0 (момент відправлення)
//   В обох випадках:
//      notified_canc: "Рейс скасовано · 07:15" — якщо рейс скасовано

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PRIVATE_KEY         = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY          = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';
const VAPID_EMAIL               = 'mailto:push@castlelife.org';
// 🔴 16.08 — АДРЕСА РОЗКЛАДУ ПЕРЕВЕДЕНА НА БОЙОВИЙ ДОМЕН.
// Було старе дзеркало `volodymyr221.github.io/CSTL_NEWS/…`, тоді як сайт живе на
// `castlelife.org` (файл `CNAME`). Дзеркало ще працює, але це крихкість: воно ніде
// не гарантоване, а від цього файлу залежить визначення СКАСОВАНИХ рейсів.
const SCHEDULE_URL              = 'https://castlelife.org/data/schedule.json';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function nowKyivMins(): number {
  const kyiv = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  return kyiv.getHours() * 60 + kyiv.getMinutes();
}

function todayKyiv(): string {
  const kyiv = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  return `${kyiv.getFullYear()}-${String(kyiv.getMonth()+1).padStart(2,'0')}-${String(kyiv.getDate()).padStart(2,'0')}`;
}

function timeToMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// 🔴 16.08 — ТЕГ СПОВІЩЕННЯ МУСИТЬ РОЗРІЗНЯТИ ПІДПИСКИ, А НЕ ЛИШЕ МАРШРУТИ.
// Було `bus-warn-${route_id}`: у Web Push однаковий `tag` означає «заміни попереднє
// сповіщення». Тобто дві підписки на ОДИН маршрут (різні сегменти або сьогодні +
// завтра) затирали одна одну — людина бачила лише останнє і не дізнавалась про
// свій другий рейс. Дата і зупинки роблять тег унікальним рівно там, де підписка
// унікальна.
function busTag(kind: string, sub: any): string {
  const seg = `${sub.boarding_stop || ''}-${sub.alighting_stop || ''}`;
  return `bus-${kind}-${sub.route_id}-${sub.track_date}-${seg}`;
}

// 🔴 12.08 — АВТЕНТИФІКАЦІЯ ВИКЛИКУ (безпековий аудит, клас «неперевірені вебхуки»).
//
// Було: `serve(async () => …)` — функція не дивилась на запит ВЗАГАЛІ. Cron слав
// заголовок `Authorization: Bearer sb_publishable_…`, але це **публічний ключ із
// `bundle.js`**, відомий кожному, хто відкрив сайт. Тобто захисту не існувало:
// заголовок був, сенсу в ньому не було.
//
// 📐 Чому не Critical, а Medium: корисне навантаження обмежене прапорцями
// `notified_warning` / `notified_dep` / `notified_canc` — повторне сповіщення тій
// самій людині не піде. Залишковий ризик — витрата квоти Edge Functions і
// навантаження на базу сторонніми викликами.
//
// 🔑 Секрет лежить у `app_secrets`, яку читає ЛИШЕ `service_role` (RLS:
// `auth.role() = 'service_role'`). Той самий прийом, що вже працює в
// `send-comment-push` і `send-page-push` — нової конструкції не вигадуємо.
//
// ⚠️ ПОРЯДОК УВІМКНЕННЯ МАВ ЗНАЧЕННЯ і був саме таким: (1) секрет створено в
// базі, (2) cron почав його слати, (3) аж тоді функція почала вимагати. Якби
// кроки 2 і 3 помінялись місцями, автобусні сповіщення перестали б ходити до
// наступного деплою — а їх чекають на зупинці.
// ⚠️ `verify_jwt` лишається УВІМКНЕНИМ: секрет тут ДРУГИЙ рубіж, а не заміна
// першого. Cron шле обидва заголовки. (Перша редакція цієї правки прибрала
// `Authorization` з cron — тоді платформа відхиляла б виклик ДО нашого коду.)
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: { 'Access-Control-Allow-Origin': '*',
                 'Access-Control-Allow-Headers': 'authorization, content-type, x-cstl-push-secret' },
    });
  }

  const supa    = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const secretHeader = req.headers.get('x-cstl-push-secret') || '';
  if (!secretHeader) {
    return new Response(JSON.stringify({ error: 'no secret' }), { status: 401 });
  }
  const { data: secretRow } = await supa
    .from('app_secrets').select('value').eq('name', 'bus_push_secret').maybeSingle();
  if (!secretRow?.value || secretRow.value !== secretHeader) {
    return new Response(JSON.stringify({ error: 'bad secret' }), { status: 401 });
  }

  const today   = todayKyiv();
  const nowMins = nowKyivMins();

  // Видаляємо застарілі підписки
  await supa.from('push_subscriptions').delete().lt('track_date', today);

  // Всі сьогоднішні підписки
  const { data: subs, error } = await supa
    .from('push_subscriptions')
    .select('*')
    .eq('track_date', today);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!subs?.length) {
    return new Response(JSON.stringify({ sent: 0, checked: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Завантажуємо schedule.json один раз
  // ⚠️ 16.08 — ЗБІЙ ЗАВАНТАЖЕННЯ ТЕПЕР ГУЧНИЙ. Раніше `catch` писав рядок у лог і
  // функція йшла далі з ПОРОЖНІМ розкладом. Наслідок нікому не видно: скасовані
  // рейси не виявляються взагалі (пункт 1 нижче спирається на `routeData.status`),
  // тобто людина їде на зупинку до автобуса, якого не буде. Тепер видно і в лозі
  // (`❌`), і у відповіді функції (`scheduleOk`), тож збій можна помітити.
  let scheduleRoutes: any[] = [];
  let scheduleOk = false;
  try {
    const res = await fetch(`${SCHEDULE_URL}?v=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    scheduleRoutes = json.days?.[today]?.routes || [];
    scheduleOk = true;
  } catch (e) {
    console.error('❌ schedule.json НЕ завантажено — скасовані рейси НЕ виявляться:', e);
  }

  // ── B-33 (24.08): ХТО ВИМКНУВ «АВТОБУСИ» В КАБІНЕТІ — ТОМУ НЕ ШЛЕМО ────────
  //
  // 🔴 Це найгірший із чотирьох випадків B-33, і саме через те, що підписка тут
  // СПРАВЖНЯ. Людина відстежує рейс, тумблер у кабінеті вимикає — а push усе
  // одно приходить. Тобто на одну річ було ДВА вимикачі, і кабінетний брехав.
  // Наслідок ширший за автобуси: після такого людина перестає вірити будь-якому
  // вимикачу в застосунку.
  //
  // 🔑 Кабінетний тумблер — ГЛОБАЛЬНИЙ рубильник теми, а відстеження рейсу
  // лишається точковим вибором. Вимкнув тему — мовчать усі рейси, зокрема ті,
  // що вже відстежуються.
  //
  // ⚠️ `push_subscriptions.user_uuid` має тип TEXT, а `notif_prefs.uid` — `uuid`.
  // Один нестандартний рядок у списку відкинув би ВЕСЬ запит
  // (`invalid input syntax for type uuid`), і тоді б замовкли ВСІ автобусні
  // сповіщення — мовчазний провал, який виглядав би як «push зник». Тому
  // фільтр форми обовʼязковий (та сама пастка, що в `reactions.user_id`).
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const вимкнули = new Set<string>();
  {
    const uids = [...new Set(
      (subs as Array<{ user_uuid?: string }>)
        .map((x) => x.user_uuid || '')
        .filter((u) => u && UUID_RE.test(u)),
    )];
    if (uids.length) {
      const { data: prefs } = await supa
        .from('notif_prefs').select('uid, buses').in('uid', uids);
      for (const r of ((prefs || []) as Array<{ uid: string; buses: boolean }>)) {
        if (r.buses === false) вимкнули.add(r.uid);
      }
    }
  }

  let sent = 0;
  const toDelete: number[] = [];

  const sendPush = async (sub: any, payload: string): Promise<boolean> => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
        payload
      );
      sent++;
      return true;
    } catch (e: any) {
      console.warn(`Push error sub ${sub.id}:`, e.message);
      if (e.statusCode === 410 || e.statusCode === 404) toDelete.push(sub.id);
      return false;
    }
  };

  for (const sub of subs) {
    // 🛑 Тема вимкнена — рейс далі відстежується, але телефон мовчить.
    // Підписку НЕ видаляємо: людина може ввімкнути тему назад, і відстеження
    // має лишитись там, де вона його поставила.
    if (sub.user_uuid && вимкнули.has(sub.user_uuid)) continue;
    const routeLabel = sub.route_name || sub.route_id;
    const segLabel   = sub.boarding_stop && sub.alighting_stop
      ? `${sub.boarding_stop.toUpperCase()} → ${sub.alighting_stop.toUpperCase()}`
      : routeLabel.toUpperCase();

    // Знаходимо дані маршруту з schedule.json
    const routeData = scheduleRoutes.find((r: any) => r.id === sub.route_id);

    // ── 1. Скасування рейсу (найвищий пріоритет) ──────────────────────────
    if (!sub.notified_canc && routeData?.status === 'cancelled') {
      const ok = await sendPush(sub, JSON.stringify({
        title: segLabel,
        body:  `Рейс скасовано · ${sub.dep_time}`,
        tag:   busTag('canc', sub),
      }));
      if (ok) await supa.from('push_subscriptions').update({ notified_canc: true }).eq('id', sub.id);
      continue;
    }

    if (!sub.dep_time) continue;
    const depMins  = timeToMins(sub.dep_time);
    const minsLeft = depMins - nowMins;

    // Чи зупинка посадки — початкова зупинка маршруту (звичайний рейс).
    // null boarding_stop (без сегменту) теж = початкова.
    const firstStopName = routeData?.stops?.[0]?.name || '';
    const isOriginBoarding = !sub.boarding_stop ||
      (firstStopName && firstStopName.toLowerCase() === sub.boarding_stop.toLowerCase());

    // ── 3. Попередження перед посадкою ───────────────────────────────────
    //
    // 🔴 16.08 — БУЛО ВІКНО `13..17`, СТАЛО `2..17`. Це не новий інтервал, а
    // виправлення дірки, яку заміряв аудит: хто вмикав відстеження ЗА 10 ХВИЛИН
    // до відправлення, не отримував **нічого** — вікно T-15 уже минуло, і перше
    // (воно ж єдине) сповіщення приходило аж у момент відправлення, коли бігти
    // на зупинку пізно. Тобто чим потрібніше було попередження, тим певніше воно
    // не приходило.
    // 🔑 Правило тепер просте і передбачуване: **перше попередження надсилаємо,
    //    щойно до відправлення лишилось 17 хвилин або менше** — і кажемо
    //    ФАКТИЧНЕ число хвилин. Підписався за 15 → «через 15 хв», за 8 → «через
    //    8 хв», за 3 → «через 3 хв». Одне на рейс (прапорець `notified_warning`).
    // ⚠️ Нижня межа 2 (а не 0) — щоб попередження не наклалось на T-0 нижче:
    //    інакше за одну хвилину прилетіли б два сповіщення поспіль.
    if (!sub.notified_warning && minsLeft >= 2 && minsLeft <= 17) {
      // Початкова зупинка → «відправляється»; проміжна → «буде на зупинці X».
      const warnBody = isOriginBoarding
        ? `Автобус відправляється через ${minsLeft} хв · ${sub.dep_time}`
        : `Автобус буде на зупинці ${sub.boarding_stop} через ${minsLeft} хв · ${sub.dep_time}`;
      const ok = await sendPush(sub, JSON.stringify({
        title: segLabel,
        body:  warnBody,
        tag:   busTag('warn', sub),
      }));
      if (ok) await supa.from('push_subscriptions').update({ notified_warning: true }).eq('id', sub.id);
    }

    // ── 4. T-0 (вікно від -3 до +1 хв) ───────────────────────────────────
    //   звичайний рейс → "Автобус вирушив" (момент відправлення з його зупинки)
    //   проміжна зупинка → "Автобус на зупинці · НАЗВА"
    //   Нижня межа -3 (а не -1): якщо cron моргне і пропустить хвилину, наступний
    //   запуск (до 3 хв після відправлення) все одно надішле T-0, а не втратить його.
    if (!sub.notified_dep && minsLeft >= -3 && minsLeft <= 1) {
      const body = isOriginBoarding
        ? `Автобус вирушив · ${sub.dep_time}`
        : `Автобус на зупинці · ${sub.boarding_stop}`;
      const ok = await sendPush(sub, JSON.stringify({
        title: segLabel,
        body,
        tag:   busTag('dep', sub),
      }));
      if (ok) await supa.from('push_subscriptions').update({ notified_dep: true }).eq('id', sub.id);
    }
  }

  if (toDelete.length) {
    await supa.from('push_subscriptions').delete().in('id', toDelete);
  }

  return new Response(
    JSON.stringify({ sent, checked: subs.length, scheduleOk }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
