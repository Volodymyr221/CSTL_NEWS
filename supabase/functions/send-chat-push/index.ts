// supabase/functions/send-chat-push/index.ts
// Edge Function: пуш про нове повідомлення приватного чату — ДРУГОМУ учаснику.
//
// Викликається КЛІЄНТОМ одразу після вставки повідомлення:
//   supa.functions.invoke('send-chat-push', { body: { message_id } })
// verify_jwt = true → у запиті є JWT відправника; перевіряємо що він і є автор
// повідомлення (захист від чужих викликів). Далі service_role знаходить
// отримувача (учасник треда ≠ відправник) і шле web-push на його пристрої.
//
// Патерн VAPID/web-push — як у send-bus-push.

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
      .from('messages').select('id, thread_id, sender_uid, text, photo_url').eq('id', message_id).single();
    if (!msg) return json({ error: 'message not found' }, 404);
    if (msg.sender_uid !== callerUid) return json({ error: 'not sender' }, 403);

    // Тред → отримувач (учасник ≠ відправник)
    const { data: thread } = await admin
      .from('threads').select('id, author_uid, buyer_uid, post_id').eq('id', msg.thread_id).single();
    if (!thread) return json({ error: 'thread not found' }, 404);
    const recipientUid = thread.author_uid === callerUid ? thread.buyer_uid : thread.author_uid;

    // Ім'я відправника (для заголовку сповіщення)
    const { data: prof } = await admin
      .from('profiles').select('name').eq('uid', callerUid).maybeSingle();
    const senderName = (prof && prof.name) || 'Нове повідомлення';

    // Пристрої отримувача
    const { data: devices } = await admin
      .from('user_push_devices').select('*').eq('uid', recipientUid);
    if (!devices?.length) return json({ sent: 0, reason: 'no devices' });

    // P-2: msg.text буває null (фото-повідомлення) — .length на null валив функцію
    // (500, отримувач БЕЗ пуша). Патерн — як у send-group-push (еталон).
    const bodyText = msg.text || (msg.photo_url ? '📷 Фото' : '');
    const payload = JSON.stringify({
      type:  'chat',
      thread_id: thread.id,
      title: senderName,
      body:  bodyText.length > 120 ? bodyText.slice(0, 117) + '…' : bodyText,
      tag:   `chat-${thread.id}`,
      url:   './',
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
