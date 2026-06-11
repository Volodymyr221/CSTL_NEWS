// supabase/functions/send-bus-push/index.ts
// Edge Function: надсилає Web Push коли автобус відправляється через ~10 хв.
//
// Запускається за розкладом: кожну хвилину через Supabase Dashboard → Edge Functions → Schedule.
// Cron: * * * * *
//
// Необхідні Secrets у Supabase Dashboard → Edge Functions → Secrets:
//   VAPID_PRIVATE_KEY = o03idVnwjS-ziu1uU8IXwprjxoCk0TzSd2JhvSOfL_k
//   (SUPABASE_URL і SUPABASE_SERVICE_ROLE_KEY додаються автоматично)

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PRIVATE_KEY         = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY          = 'BL6FKk0c_UoMo7TfJ17dlea2RCe2seP7amdebBb5SeomfXsH1k4UTWI10LPE9-ittx9Gzciudao7rMe9EciLeJo';
const VAPID_EMAIL               = 'mailto:illiabogdanets041@gmail.com';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Повертає поточний час у хвилинах від початку дня (Київ)
function nowKyivMins(): number {
  const kyiv = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Kyiv' }));
  return kyiv.getHours() * 60 + kyiv.getMinutes();
}

// Повертає сьогоднішню дату у Києві (YYYY-MM-DD)
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

  // Видаляємо застарілі підписки (вчорашні і старіші)
  await supa.from('push_subscriptions').delete().lt('track_date', today);

  // Отримуємо всі сьогоднішні підписки що ще не отримали push-сповіщення
  const { data: subs, error } = await supa
    .from('push_subscriptions')
    .select('*')
    .eq('track_date', today)
    .eq('notified_dep', false);

  if (error) {
    console.error('DB error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  if (!subs?.length) {
    return new Response(JSON.stringify({ sent: 0, checked: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let sent = 0;
  const toMarkNotified: number[] = [];
  const toDelete: number[] = [];

  for (const sub of subs) {
    if (!sub.dep_time) continue;

    const depMins  = timeToMins(sub.dep_time);
    const minsLeft = depMins - nowMins;

    // Вікно відправки push: 9-11 хвилин до відправлення (точність ±1 хв при cron * * * * *)
    if (minsLeft < 9 || minsLeft > 11) continue;

    const routeLabel = sub.route_name || sub.route_id;
    const segLabel   = sub.boarding_stop && sub.alighting_stop
      ? `${sub.boarding_stop.toUpperCase()} → ${sub.alighting_stop.toUpperCase()}`
      : routeLabel.toUpperCase();

    const payload = JSON.stringify({
      title: `🚌 ${segLabel}`,
      body:  `Відправляється через ${minsLeft} хв (${sub.dep_time})`,
      tag:   `bus-${sub.route_id}`,
    });

    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth_key },
        },
        payload
      );
      sent++;
      toMarkNotified.push(sub.id);
    } catch (e: any) {
      console.warn(`Push error for sub ${sub.id}:`, e.message);
      // 410 Gone або 404 — підписка більше недійсна (юзер заборонив або перевстановив браузер)
      if (e.statusCode === 410 || e.statusCode === 404) {
        toDelete.push(sub.id);
      }
    }
  }

  // Позначаємо успішно надіслані як notified_dep = true
  if (toMarkNotified.length) {
    await supa.from('push_subscriptions')
      .update({ notified_dep: true })
      .in('id', toMarkNotified);
  }

  // Видаляємо недійсні підписки
  if (toDelete.length) {
    await supa.from('push_subscriptions').delete().in('id', toDelete);
  }

  return new Response(
    JSON.stringify({ sent, checked: subs.length }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
