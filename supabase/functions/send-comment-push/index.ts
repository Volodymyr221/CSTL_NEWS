// supabase/functions/send-comment-push/index.ts
// Edge Function: сповіщення про коментарі «Стрічки». Два різні за важливістю сигнали:
//
//   1) ТОБІ ВІДПОВІЛИ (reply_to_uid) — приходить ЗАВЖДИ і одразу. Це персональне
//      звернення, притишувати його не можна.
//   2) НОВИЙ КОМЕНТАР ПІД ТВОЇМ ДОПИСОМ (ти адмін сторінки) — з накопиченням:
//      перше сповіщення одразу, далі 10 хвилин тиші, після якої йде зведене
//      «Ще N коментарів». Без цього під популярним постом адмін отримав би
//      40 сповіщень за вечір (сценарій, який Вова назвав прямо).
//
// ДВА ШЛЯХИ ВИКЛИКУ, обидва доводять себе спільним секретом x-cstl-push-secret:
//   • тригер бази trg_notify_new_page_comment  → { comment_id }
//   • добіг pg_cron flush_page_comment_push    → { flush: true }
// verify_jwt має бути ВИМКНЕНО — функцію кличе база, у якої немає токена людини.
//
// Ідемпотентність: page_comment_push_log (comment_id — первинний ключ) не дає
// відправити двічі про той самий коментар.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PRIVATE_KEY         = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_PUBLIC_KEY = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';
const VAPID_EMAIL      = 'mailto:illiabogdanets041@gmail.com';

// Вікно тиші для адмінів. Мусить збігатися з інтервалом у flush_page_comment_push().
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

    // ── Довіряємо лише базі: секрет лежить у app_secrets, читає його тільки
    //    service_role. Без секрету сторонній виклик нічого не зробить.
    const secretHeader = req.headers.get('x-cstl-push-secret') || '';
    if (!secretHeader) return json({ error: 'no secret' }, 401);
    const { data: row } = await admin
      .from('app_secrets').select('value').eq('name', 'page_push_secret').maybeSingle();
    if (!row?.value || row.value !== secretHeader) return json({ error: 'bad secret' }, 401);

    const body = await req.json().catch(() => ({}));
    if (body.flush) return json(await flushPending(admin));
    if (!body.comment_id) return json({ error: 'no comment_id' }, 400);
    return json(await handleComment(admin, body.comment_id));
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

// ── Новий коментар ────────────────────────────────────────────────────────────
async function handleComment(admin: Admin, commentId: number) {
  const { data: c } = await admin
    .from('page_comments')
    .select('id, post_id, author_uid, text, reply_to_uid, deleted_at')
    .eq('id', commentId).single();
  if (!c || c.deleted_at) return { sent: 0, reason: 'comment gone' };

  // 🔒 Рівно раз на коментар: повторний виклик (добіг, ретрай мережі) — безпечний no-op.
  const { data: logRow } = await admin
    .from('page_comment_push_log').insert({ comment_id: c.id }).select('comment_id').maybeSingle();
  if (!logRow) return { sent: 0, reason: 'already sent' };

  const { data: post } = await admin
    .from('page_posts').select('id, page_id, text').eq('id', c.post_id).single();
  if (!post) return await bail(admin, c.id, 'post gone');

  const { data: page } = await admin.from('pages').select('name').eq('id', post.page_id).single();
  const pageName = page?.name || 'Стрічка';
  const authorName = await nameOf(admin, c.author_uid);
  const snippet = trim(c.text, 110);
  const url = `./#/post/feed/${post.id}?c=${c.id}`;   // відкриє пост і підсвітить коментар

  let sent = 0;
  const notified = new Set<string>();
  if (c.author_uid) notified.add(c.author_uid);   // собі сповіщення не йде ніколи

  // 1. Персональне: тобі відповіли. Без затримок і без накопичення.
  if (c.reply_to_uid && !notified.has(c.reply_to_uid)) {
    sent += await push(admin, [c.reply_to_uid], {
      type: 'comment-reply', post_id: post.id, comment_id: c.id,
      title: `${authorName} відповів на ваш коментар`,
      body: snippet, tag: `comment-reply-${c.id}`, url,
    });
    notified.add(c.reply_to_uid);
  }

  // 2. Адмінам сторінки — з вікном тиші.
  const { data: admins } = await admin
    .from('page_admins').select('uid').eq('page_id', post.page_id);
  // 🆕 24.08 (B-33) — хто вимкнув «Стрічку» в кабінеті, той не отримує.
  // 🛑 Гілка 1 вище ЦЬОГО НЕ ПИТАЄ: «вам відповіли» — персональне звернення,
  // воно не притишується нічим (те саме правило, що в `send-answer-push`).
  const targets = await allowed(
    admin,
    (admins || []).map((a: { uid: string }) => a.uid).filter((u: string) => !notified.has(u)),
    'feed',
  );

  for (const uid of targets) {
    const { data: st } = await admin
      .from('page_comment_push_state').select('*')
      .eq('post_id', post.id).eq('uid', uid).maybeSingle();

    const quietUntil = st?.last_sent_at
      ? new Date(new Date(st.last_sent_at).getTime() + QUIET_MINUTES * 60_000)
      : null;

    if (quietUntil && quietUntil > new Date()) {
      // Ще триває тиша — лише рахуємо. Відправить наступний коментар або добіг.
      await admin.from('page_comment_push_state').upsert({
        post_id: post.id, uid,
        last_sent_at: st.last_sent_at,
        pending: (st.pending || 0) + 1,
        pending_since: st.pending_since || new Date().toISOString(),
      });
      continue;
    }

    // Вікно вільне: шлемо. Якщо за час тиші щось накопичилось — шлемо зведене.
    const pend = st?.pending || 0;
    const payload = pend > 0
      ? { title: pageName, body: `Ще ${pend + 1} ${pluralComments(pend + 1)} під вашим дописом${post.text ? `: «${trim(post.text, 60)}»` : ''}` }
      : { title: `${authorName} прокоментував ваш допис`, body: snippet };

    sent += await push(admin, [uid], {
      type: 'comment-new', post_id: post.id, comment_id: c.id,
      tag: `comment-post-${post.id}`, url, ...payload,
    });
    await admin.from('page_comment_push_state').upsert({
      post_id: post.id, uid,
      last_sent_at: new Date().toISOString(), pending: 0, pending_since: null,
    });
  }

  // Нікому не дійшло (тимчасовий збій сервісу push) — прибираємо позначку журналу,
  // щоб повтор міг спробувати ще раз. Дубль неможливий: жоден пристрій не отримав.
  if (sent === 0) await admin.from('page_comment_push_log').delete().eq('comment_id', c.id);
  else await admin.from('page_comment_push_log').update({ sent }).eq('comment_id', c.id);
  return { sent };
}

// ── Добіг: дослати накопичене, вікно тиші якого вже минуло ────────────────────
async function flushPending(admin: Admin) {
  const cutoff = new Date(Date.now() - QUIET_MINUTES * 60_000).toISOString();
  const { data: rows } = await admin
    .from('page_comment_push_state').select('*')
    .gt('pending', 0).lt('pending_since', cutoff).limit(200);
  if (!rows?.length) return { sent: 0, reason: 'nothing pending' };

  let sent = 0;
  for (const st of rows) {
    // 🆕 24.08 (B-33) — і в ДОБІГУ теж. Пропустити цю перевірку тут означало б
    // лишити дірку рівно там, де вона найпомітніша: людина вимкнула тему, під
    // дописом за вечір набралось 12 коментарів, і за десять хвилин їй усе одно
    // прилітає «Ще 12 коментарів». Тобто вимикач працює на кожному окремому
    // сповіщенні і не працює на зведеному — найгірший вид напівробочого.
    if (!(await allowed(admin, [st.uid], 'feed')).length) { await clearState(admin, st); continue; }
    const { data: post } = await admin
      .from('page_posts').select('id, page_id, text').eq('id', st.post_id).single();
    if (!post) { await clearState(admin, st); continue; }
    const { data: page } = await admin.from('pages').select('name').eq('id', post.page_id).single();

    sent += await push(admin, [st.uid], {
      type: 'comment-new', post_id: post.id,
      title: page?.name || 'Стрічка',
      body: `Ще ${st.pending} ${pluralComments(st.pending)} під вашим дописом${post.text ? `: «${trim(post.text, 60)}»` : ''}`,
      // 🔴 15.08 — `?c=all`: тап відкриває САМІ КОМЕНТАРІ, а не лише пост.
      // Скарга Вови: «воно повинно… наводитись саме на цей допис і відкривати
      // модалку коментарів». Тут зведення («Ще N коментарів»), тож конкретного
      // рядка для підсвітки немає — звідси `all`, а не номер.
      tag: `comment-post-${post.id}`, url: `./#/post/feed/${post.id}?c=all`,
    });
    await admin.from('page_comment_push_state').upsert({
      post_id: st.post_id, uid: st.uid,
      last_sent_at: new Date().toISOString(), pending: 0, pending_since: null,
    });
  }
  return { sent, flushed: rows.length };
}

async function clearState(admin: Admin, st: { post_id: number; uid: string }) {
  await admin.from('page_comment_push_state')
    .delete().eq('post_id', st.post_id).eq('uid', st.uid);
}

// ── ЧИ ДОЗВОЛИЛА ЛЮДИНА ЦЮ ТЕМУ (B-33, 24.08) ───────────────────────────────
// 🔴 До 24.08 вимикачі сповіщень у кабінеті не читав НІХТО — вони писались у
// `localStorage` і там лишались. Слово Вови: «Декоративного в нас нічого не має
// бути… скасування сповіщення має бути робоче».
// 🔑 Відсутній рядок = ДОЗВОЛЕНО (людина нічого не міняла). Помилку запиту
// трактуємо так само: краще надіслати зайве, ніж мовчки проковтнути те, на що
// людина підписалась сама.
// ⚠️ Дубль в кожній Edge Function навмисно: вони крутяться в Deno на сервері
// Supabase, деплояться окремо, спільного модуля між ними немає.
async function allowed(admin: Admin, uids: string[], topic: string) {
  if (!uids.length) return uids;
  const { data, error } = await admin
    .from('notif_prefs').select('uid, buses, board, questions, feed').in('uid', uids);
  if (error) return uids;
  const off = new Set(
    (data || []).filter((r: Record<string, unknown>) => r[topic] === false)
                .map((r: { uid: string }) => r.uid),
  );
  return uids.filter((u) => !off.has(u));
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

// 1 коментар · 2-4 коментарі · 5+ коментарів
function pluralComments(n: number) {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return 'коментар';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'коментарі';
  return 'коментарів';
}

async function bail(admin: Admin, commentId: number, reason: string) {
  await admin.from('page_comment_push_log').delete().eq('comment_id', commentId);
  return { sent: 0, reason };
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json', ...cors },
  });
}
