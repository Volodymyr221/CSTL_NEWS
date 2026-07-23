// supabase/functions/send-page-push/index.ts
// Edge Function: пуш про новий пост СТОРІНКИ-каналу «Стрічки» — усім підписникам
// дзвіночка (page_subscriptions) ≠ автор.
//
// Викликається КЛІЄНТОМ одразу після вставки поста:
//   supa.functions.invoke('send-page-push', { body: { post_id } })
// verify_jwt = true → у запиті є JWT автора; перевіряємо що він і є автор поста
// (захист від чужих викликів). Далі service_role знаходить усіх підписників
// сторінки (uid ≠ автор) і шле web-push на їхні пристрої (user_push_devices).
//
// Патерн VAPID/web-push — як у send-group-push (заголовок = назва сторінки,
// тіло = текст поста). Тег page-<id> групує сповіщення однієї сторінки.
// url = deep-link на пост (#/post/feed/<id>) → клік відкриває саме той пост (крок 6a).

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

    const { post_id } = await req.json().catch(() => ({}));
    if (!post_id) return json({ error: 'no post_id' }, 400);

    // Пост + перевірка що викликач — його автор
    const { data: post } = await admin
      .from('page_posts')
      .select('id, page_id, author_uid, text, image_urls')
      .eq('id', post_id).single();
    if (!post) return json({ error: 'post not found' }, 404);
    if (post.author_uid !== callerUid) return json({ error: 'not author' }, 403);

    // Назва сторінки (заголовок сповіщення)
    const { data: page } = await admin
      .from('pages').select('name').eq('id', post.page_id).single();
    const pageName = (page && page.name) || 'Стрічка';

    // Підписники сторінки, крім автора
    const { data: subs } = await admin
      .from('page_subscriptions').select('uid')
      .eq('page_id', post.page_id).neq('uid', callerUid);
    const recipientUids = (subs || []).map((s: { uid: string }) => s.uid);
    if (!recipientUids.length) return json({ sent: 0, reason: 'no subscribers' });

    // Пристрої всіх підписників
    const { data: devices } = await admin
      .from('user_push_devices').select('*').in('uid', recipientUids);
    if (!devices?.length) return json({ sent: 0, reason: 'no devices' });

    const hasPhoto = Array.isArray(post.image_urls) && post.image_urls.length > 0;
    const bodyText = (post.text && post.text.trim()) || (hasPhoto ? '📷 Фото' : 'Новий пост');
    const trimmed = bodyText.length > 110 ? bodyText.slice(0, 107) + '…' : bodyText;
    const payload = JSON.stringify({
      type:    'page',
      page_id: post.page_id,
      post_id: post.id,
      title:   pageName,
      body:    trimmed,
      tag:     `page-${post.page_id}`,
      url:     `./#/post/feed/${post.id}`,
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
