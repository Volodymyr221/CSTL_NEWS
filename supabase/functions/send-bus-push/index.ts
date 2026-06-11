// supabase/functions/send-bus-push/index.ts
// Edge Function: надсилає Web Push сповіщення при відстеженні автобусного рейсу.
//
// Запускається кожну хвилину: cron * * * * *
//
// Три типи сповіщень:
//   1. T-15 хв (notified_warning): "Відправляється через ~15 хв"
//   2. T-0  хв (notified_dep):    "Автобус на зупинці" / "Автобус відправляється"
//   3. Скасування (notified_canc): "Рейс скасовано" — перевіряє schedule.json

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PRIVATE_KEY         = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY          = 'BL6FKk0c_UoMo7TfJ17dlea2RCe2seP7amdebBb5SeomfXsH1k4UTWI10LPE9-ittx9Gzciudao7rMe9EciLeJo';
const VAPID_EMAIL               = 'mailto:illiabogdanets041@gmail.com';
const SCHEDULE_URL              = 'https://volodymyr221.github.io/CSTL_NEWS/data/schedule.json';

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

serve(async () => {
  const supa    = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

  // Завантажуємо schedule.json один раз для перевірки скасувань
  let scheduleRoutes: any[] = [];
  try {
    const res = await fetch(`${SCHEDULE_URL}?v=${Date.now()}`);
    const json = await res.json();
    scheduleRoutes = json.days?.[today]?.routes || [];
  } catch (e) {
    console.warn('schedule.json fetch failed:', e);
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
    const routeLabel = sub.route_name || sub.route_id;
    const segLabel   = sub.boarding_stop && sub.alighting_stop
      ? `${sub.boarding_stop.toUpperCase()} → ${sub.alighting_stop.toUpperCase()}`
      : routeLabel.toUpperCase();

    // ── 1. Скасування рейсу ────────────────────────────────────────────────
    if (!sub.notified_canc) {
      const routeData = scheduleRoutes.find((r: any) => r.id === sub.route_id);
      if (routeData?.status === 'cancelled') {
        const ok = await sendPush(sub, JSON.stringify({
          title: segLabel,
          body:  `Рейс скасовано · ${sub.dep_time}`,
          tag:   `bus-canc-${sub.route_id}`,
        }));
        if (ok) await supa.from('push_subscriptions').update({ notified_canc: true }).eq('id', sub.id);
        continue; // Інші сповіщення для скасованого рейсу не потрібні
      }
    }

    if (!sub.dep_time) continue;
    const depMins  = timeToMins(sub.dep_time);
    const minsLeft = depMins - nowMins;

    // ── 2. Попередження: T-15 хв (вікно 13-17 хв) ─────────────────────────
    if (!sub.notified_warning && minsLeft >= 13 && minsLeft <= 17) {
      const ok = await sendPush(sub, JSON.stringify({
        title: segLabel,
        body:  `Відправляється через ${minsLeft} хв · ${sub.dep_time}`,
        tag:   `bus-warn-${sub.route_id}`,
      }));
      if (ok) await supa.from('push_subscriptions').update({ notified_warning: true }).eq('id', sub.id);
    }

    // ── 3. Автобус на зупинці: T-0 (вікно від -1 до +1 хв) ───────────────
    if (!sub.notified_dep && minsLeft >= -1 && minsLeft <= 1) {
      const body = sub.boarding_stop
        ? `Автобус на зупинці · ${sub.boarding_stop}`
        : `Автобус відправляється · ${sub.dep_time}`;
      const ok = await sendPush(sub, JSON.stringify({
        title: segLabel,
        body,
        tag:   `bus-dep-${sub.route_id}`,
      }));
      if (ok) await supa.from('push_subscriptions').update({ notified_dep: true }).eq('id', sub.id);
    }
  }

  if (toDelete.length) {
    await supa.from('push_subscriptions').delete().in('id', toDelete);
  }

  return new Response(
    JSON.stringify({ sent, checked: subs.length }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
