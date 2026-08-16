// supabase/functions/send-answer-push/index.ts
// Edge Function: сповіщення про ВІДПОВІДЬ на питання і про КОМЕНТАР до оголошення.
//
// 🔴 Заведено 16.08.2026 після аудиту: на таблиці `comments` не було ЖОДНОГО
// тригера сповіщень, тобто цикл «запитав громаду → тобі відповіли» був розірваний.
// Людина мусила сама повертатись і перевіряти, чи хтось відповів.
//
// Два різні за важливістю сигнали (та сама логіка, що в `send-comment-push`):
//   1) ТОБІ ВІДПОВІЛИ (`reply_to_id` вказує на твою репліку) — завжди й одразу.
//      Це персональне звернення, притишувати його не можна.
//   2) НОВА ВІДПОВІДЬ ПІД ТВОЇМ ЗАПИСОМ (ти автор питання/оголошення) — з вікном
//      тиші 10 хв. Без нього під живим обговоренням автор отримав би десяток
//      сповіщень за вечір.
//
// Кличе БАЗА (тригер `trg_notify_new_answer`), тому:
//   • verify_jwt ВИМКНЕНО — у бази немає токена людини;
//   • довіра доводиться спільним секретом `x-cstl-push-secret` (`app_secrets`).
//
// Ідемпотентність: `answer_push_log` (comment_id — первинний ключ) не дає
// відправити двічі про ту саму відповідь.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PRIVATE_KEY         = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';
const VAPID_EMAIL      = 'mailto:illiabogdanets041@gmail.com';

// Вікно тиші для автора запису. Пряма відповідь конкретній людині його НЕ слухає.
const QUIET_MINUTES = 10;

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
    if (!body.comment_id) return json({ error: 'no comment_id' }, 400);
    return json(await handleAnswer(admin, body.comment_id));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

async function handleAnswer(admin: Admin, commentId: number) {
  const { data: c } = await admin
    .from('comments')
    .select('id, post_id, sender_uid, text, reply_to_id, deleted_at')
    .eq('id', commentId).single();
  if (!c || c.deleted_at) return { sent: 0, reason: 'answer gone' };

  // 🔒 Рівно раз на відповідь: повторний виклик — безпечний no-op.
  const { data: logRow } = await admin
    .from('answer_push_log').insert({ comment_id: c.id, post_id: c.post_id })
    .select('comment_id').maybeSingle();
  if (!logRow) return { sent: 0, reason: 'already sent' };

  const { data: post } = await admin
    .from('posts').select('id, type, title, text, owner_uid').eq('id', c.post_id).single();
  if (!post) return await bail(admin, c.id, 'post gone');

  // Питання і оголошення — та сама механіка, різні слова і різний deep-link.
  const isQuestion = post.type === 'chat';
  const url = `./#/post/${isQuestion ? 'disc' : 'board'}/${post.id}`;
  const subject = trim(post.title || post.text, 60) || (isQuestion ? 'ваше питання' : 'ваше оголошення');
  const authorName = await nameOf(admin, c.sender_uid);
  const snippet = trim(c.text, 110);

  let sent = 0;
  const notified = new Set<string>();
  if (c.sender_uid) notified.add(c.sender_uid);   // собі сповіщення не йде ніколи

  // 1. Персональне: тобі відповіли. Без затримок і без вікна тиші.
  if (c.reply_to_id) {
    const { data: parent } = await admin
      .from('comments').select('sender_uid').eq('id', c.reply_to_id).maybeSingle();
    const target = parent?.sender_uid;
    if (target && !notified.has(target)) {
      sent += await push(admin, [target], {
        type: 'answer-reply', post_id: post.id, comment_id: c.id,
        title: `${authorName} відповів на ваш коментар`,
        body: snippet, tag: `answer-reply-${c.id}`, url,
      });
      notified.add(target);
    }
  }

  // 2. Автору запису — з вікном тиші, щоб живе обговорення не перетворилось на
  //    чергу сповіщень. Рахуємо по журналу: чи вже щось надсилалось під цим
  //    записом за останні QUIET_MINUTES хвилин.
  const owner = post.owner_uid;
  if (owner && !notified.has(owner)) {
    const since = new Date(Date.now() - QUIET_MINUTES * 60_000).toISOString();
    const { data: recent } = await admin
      .from('answer_push_log')
      .select('comment_id')
      .eq('post_id', post.id)
      .neq('comment_id', c.id)          // власний свіжий запис у розрахунок не йде
      .gt('sent', 0)
      .gte('created_at', since);

    if (!recent?.length) {
      sent += await push(admin, [owner], {
        type: 'answer-new', post_id: post.id, comment_id: c.id,
        title: isQuestion
          ? `${authorName} відповів на ваше питання`
          : `${authorName} прокоментував ваше оголошення`,
        body: snippet || subject,
        tag: `answer-post-${post.id}`, url,
      });
      notified.add(owner);
    }
  }

  await admin.from('answer_push_log').update({ sent }).eq('comment_id', c.id);
  return { sent, question: isQuestion };
}

// ── Надсилання на всі пристрої вказаних людей ─────────────────────────────────
async function push(admin: Admin, uids: string[], payload: Record<string, unknown>) {
  if (!uids.length) return 0;
  const { data: devices } = await admin.from('user_push_devices').select('*').in('uid', uids);
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
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 410 || code === 404) dead.push(d.id);   // пристрій відписався
    }
  }
  if (dead.length) await admin.from('user_push_devices').delete().in('id', dead);
  return sent;
}

async function nameOf(admin: Admin, uid: string | null) {
  if (!uid) return 'Житель';
  const { data } = await admin.from('profiles').select('name').eq('uid', uid).maybeSingle();
  return (data?.name || '').trim() || 'Житель';
}

function trim(s: string | null, n: number) {
  const t = (s || '').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

async function bail(admin: Admin, commentId: number, reason: string) {
  await admin.from('answer_push_log').delete().eq('comment_id', commentId);
  return { sent: 0, reason };
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json', ...cors },
  });
}
