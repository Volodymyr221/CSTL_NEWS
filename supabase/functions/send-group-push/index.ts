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
const VAPID_EMAIL               = 'mailto:illiabogdanets041@gmail.com';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

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
      .from('user_push_devices').select('*').in('uid', recipientUids);
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

    let sent = 0;
    const dead: number[] = [];
    for (const d of devices) {
      try {
        await webpush.sendNotification(
          { endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth_key } },
          payload,
        );
        sent++;
      } catch (e: any) {
        if (e.statusCode === 410 || e.statusCode === 404) dead.push(d.id);
      }
    }
    if (dead.length) await admin.from('user_push_devices').delete().in('id', dead);

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
