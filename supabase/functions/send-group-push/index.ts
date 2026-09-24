// supabase/functions/send-group-push/index.ts
// Edge Function: пуш про нове повідомлення у ГРУПОВОМУ чаті — усім учасникам ≠ відправник.
//
// Викликається КЛІЄНТОМ одразу після вставки повідомлення:
//   supa.functions.invoke('send-group-push', { body: { message_id } })
// verify_jwt = true → у запиті є JWT відправника; перевіряємо що він і є автор
// повідомлення (захист від чужих викликів). Далі service_role знаходить усіх
// активних учасників групи (status='member', uid ≠ відправник) і шле web-push.
//
// Патерн VAPID/web-push — як у send-chat-push (заголовок = назва групи,
// тіло = «Ім'я: текст»). Тег group-<id> групує сповіщення однієї групи.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PRIVATE_KEY         = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY          = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';
const VAPID_EMAIL               = 'mailto:olykacastle@gmail.com';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);


// ── РОЗСИЛКА НА ВЕЛИКУ АУДИТОРІЮ (24.09, аудит готовності) ──────────────────
//
// 🔴 ТРИ МЕЖІ, ЯКІ ЦЯ ФУНКЦІЯ ПЕРЕХОДИЛА МОВЧКИ. Жодна не давала помилки —
// саме тому їх і не було видно:
//   1. PostgREST віддає щонайбільше **1000 рядків** на запит (`db-max-rows`).
//      Вибірка без сторінок на 1001-му рядку просто обрізається: тисяча
//      отримує сповіщення, решта — ні, а в журналі стоїть «надіслано».
//   2. `.in('uid', [...])` кладе весь перелік В АДРЕСУ запиту. Кілька тисяч
//      uid — десятки кілобайт адреси, і сервер відповідає `414`: розсилка
//      падає цілком.
//   3. Edge Function має стелю **150 секунд**. Надсилання йшло по одному
//      пристрою в черзі; при ~150 мс на пуш це близько тисячі пристроїв, далі
//      функція вмирає на півдорозі — частина отримала, журнал каже «готово».
//
// 🛑 Запуску ще не було, тож сьогодні підписників десятки і жодна межа не
// болить. Але всі три спрацюють БЕЗ ПОПЕРЕДЖЕННЯ саме тоді, коли аудиторія
// нарешті виросте — у найгірший можливий момент.
// ⚠️ Ці три помічники СВІДОМО скопійовані в кожну функцію розсилки, а не
// винесені в спільний модуль: функції деплояться поштучно, і відносний імпорт
// зламав би накат через панель Supabase.

/** Читає ВСІ рядки запиту сторінками, а не перші 1000. */
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
    // Запобіжник від нескінченного циклу: краще недорозіслати, ніж крутитись.
    if (усе.length > 200_000) return усе;
  }
}

/** Ріже перелік на шматки — щоб `.in(...)` не зібрав адресу на десятки КБ. */
function частинами<T>(масив: T[], розмір: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < масив.length; i += розмір) out.push(масив.slice(i, i + розмір));
  return out;
}

/**
 * Шле пуш пачками по `ширина` штук одночасно.
 * 🔑 Чому не всі одразу: тисяча одночасних запитів до чужого push-сервісу — це
 * спосіб отримати `429` і втратити розсилку цілком. Пачка — компроміс між
 * швидкістю і чемністю.
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
      // 410/404 — підписка мертва (застосунок знесли, дозвіл відкликали). Це
      // єдиний випадок, коли рядок можна прибрати: решта збоїв тимчасові, і
      // видаляти по них означало б тихо втрачати живих людей.
      if (код === 410 || код === 404) dead.push(пачка[i].id);
    });
  }
  return { sent, dead };
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return json({ error: 'no auth' }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Хто викликає (за JWT)
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const callerUid = userData?.user?.id;
    if (userErr || !callerUid) return json({ error: 'bad token' }, 401);

    const { message_id } = await req.json().catch(() => ({}));
    if (!message_id) return json({ error: 'no message_id' }, 400);

    // Повідомлення + перевірка що викликач — його автор
    const { data: msg } = await admin
      .from('chat_group_messages')
      .select('id, group_id, sender_uid, text, photo_url')
      .eq('id', message_id).single();
    if (!msg) return json({ error: 'message not found' }, 404);
    if (msg.sender_uid !== callerUid) return json({ error: 'not sender' }, 403);

    // Назва групи (заголовок сповіщення)
    const { data: group } = await admin
      .from('chat_groups').select('name').eq('id', msg.group_id).single();
    const groupName = (group && group.name) || 'Група';

    // Ім'я відправника (денормалізоване у chat_group_members.name)
    const { data: senderRow } = await admin
      .from('chat_group_members').select('name')
      .eq('group_id', msg.group_id).eq('uid', callerUid).maybeSingle();
    const senderName = (senderRow && senderRow.name) || 'Учасник';

    // Активні учасники групи, крім відправника
    const { data: members } = await admin
      .from('chat_group_members').select('uid')
      .eq('group_id', msg.group_id).eq('status', 'member').neq('uid', callerUid);
    const recipientUids = (members || []).map((m: { uid: string }) => m.uid);
    if (!recipientUids.length) return json({ sent: 0, reason: 'no recipients' });

    // Пристрої всіх отримувачів
    const { data: devices } = await admin
      .from('user_push_devices').select('id, endpoint, p256dh, auth_key').in('uid', recipientUids);
    if (!devices?.length) return json({ sent: 0, reason: 'no devices' });

    const bodyText = msg.text || (msg.photo_url ? '📷 Фото' : '');
    const trimmed = bodyText.length > 110 ? bodyText.slice(0, 107) + '…' : bodyText;
    const payload = JSON.stringify({
      type:     'group',
      group_id: msg.group_id,
      title:    groupName,
      body:     `${senderName}: ${trimmed}`,
      tag:      `group-${msg.group_id}`,
      url:      './',
    });

    const { sent, dead } = await слатиПачками(devices, payload);
    for (const шматок of частинами(dead, 200)) {
      await admin.from('user_push_devices').delete().in('id', шматок);
    }

    return json({ sent });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
