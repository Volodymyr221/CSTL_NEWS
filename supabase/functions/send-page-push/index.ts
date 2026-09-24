// supabase/functions/send-page-push/index.ts
// Edge Function: пуш про новий пост СТОРІНКИ-каналу «Стрічки» — усім підписникам
// дзвіночка (page_subscriptions) ≠ автор.
//
// ДВА ШЛЯХИ ВИКЛИКУ (обидва ведуть сюди, дублю не буде — див. page_push_log):
//   1) ОСНОВНИЙ — тригер бази `trg_notify_new_page_post` на INSERT у page_posts.
//      Доводить себе секретом у заголовку x-cstl-push-secret. Працює навіть коли
//      браузер автора закрито / пост створено з адмінки.
//   2) ПІДСТРАХОВКА — браузер автора одразу після публікації:
//      supa.functions.invoke('send-page-push', { body: { post_id } })
//      Тут перевіряємо токен і що викликач справді автор поста.
// verify_jwt ВИМКНЕНО: функція автентифікує себе сама (секрет або токен автора) —
// інакше тригер бази не міг би її покликати, не маючи користувацького токена.
// Далі service_role знаходить підписників сторінки (uid ≠ автор) і шле web-push.
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
const VAPID_EMAIL               = 'mailto:olykacastle@gmail.com';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// ── РОЗСИЛКА НА ВЕЛИКУ АУДИТОРІЮ (24.09, аудит готовності) ──────────────────
//
// 🔴 ТРИ МЕЖІ, ЯКІ ЦЯ ФУНКЦІЯ ПЕРЕХОДИЛА МОВЧКИ. Жодна з них не давала помилки —
// саме тому їх і не було видно:
//   1. PostgREST віддає щонайбільше **1000 рядків** на запит (`db-max-rows`).
//      `.select('uid')` без сторінок на 1001-му підписнику просто обрізається:
//      тисяча отримує сповіщення, решта — ні, і в журналі стоїть «надіслано».
//   2. `.in('uid', [...])` кладе весь перелік В АДРЕСУ запиту. Кілька тисяч
//      uid — це десятки кілобайт адреси, і сервер відповідає `414`, тобто
//      розсилка падає цілком.
//   3. Edge Function має стелю **150 секунд**. Надсилання йшло по одному
//      пристрою в черзі; при ~150 мс на пуш це близько тисячі пристроїв, далі
//      функція вмирає на півдорозі — частина отримала, журнал каже «готово».
//
// 🛑 Запуску ще не було, тож сьогодні підписників десятки і жодна з меж не
// болить. Але всі три спрацюють БЕЗ ПОПЕРЕДЖЕННЯ і саме тоді, коли аудиторія
// нарешті виросте — тобто в найгірший можливий момент.

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
    // Коротша за крок пачка означає, що це був останній шматок.
    if (пачка.length < крок) return усе;
    // 🛑 Запобіжник від нескінченного циклу, якщо сервер колись почне віддавати
    // рівно `крок` рядків назавжди. Краще недорозіслати, ніж крутитись до стелі.
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
      // 410/404 — підписка мертва (людина знесла застосунок або відкликала
      // дозвіл). Це єдиний випадок, коли рядок можна прибрати: решта збоїв
      // тимчасові, і видаляти по них означало б тихо втрачати живих людей.
      if (код === 410 || код === 404) dead.push(пачка[i].id);
    });
  }
  return { sent, dead };
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cstl-push-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── Хто викликає: база чи людина? ────────────────────────────────────────
    // ДВА довірених джерела виклику:
    //   1) ТРИГЕР БАЗИ (основний, надійний) — доводить це спільним секретом у
    //      заголовку x-cstl-push-secret (лежить у таблиці app_secrets, читає лише
    //      service_role). Базі довіряємо: вона кличе рівно на реальний INSERT поста.
    //   2) БРАУЗЕР АВТОРА (підстраховка) — звичайний користувацький токен, для нього
    //      лишається сувора перевірка «ти справді автор цього поста».
    // Функція автентифікує себе САМА (verify_jwt вимкнено), тож без секрету і без
    // валідного токена користувача сторонній виклик нічого не зробить.
    const secretHeader = req.headers.get('x-cstl-push-secret') || '';
    let isServiceCall = false;
    if (secretHeader) {
      const { data: row } = await admin
        .from('app_secrets').select('value').eq('name', 'page_push_secret').maybeSingle();
      isServiceCall = !!row?.value && row.value === secretHeader;
      if (!isServiceCall) return json({ error: 'bad secret' }, 401);
    }

    let callerUid: string | null = null;
    if (!isServiceCall) {
      const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
      if (!jwt) return json({ error: 'no auth' }, 401);
      const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
      callerUid = userData?.user?.id ?? null;
      if (userErr || !callerUid) return json({ error: 'bad token' }, 401);
    }

    const { post_id } = await req.json().catch(() => ({}));
    if (!post_id) return json({ error: 'no post_id' }, 400);

    // Пост + (для виклику людиною) перевірка що викликач — його автор
    const { data: post } = await admin
      .from('page_posts')
      .select('id, page_id, author_uid, text, image_urls')
      .eq('id', post_id).single();
    if (!post) return json({ error: 'post not found' }, 404);
    if (!isServiceCall && post.author_uid !== callerUid) return json({ error: 'not author' }, 403);

    // 🔒 ІДЕМПОТЕНТНІСТЬ: розсилка про один пост — рівно раз.
    // Функцію можуть покликати ДВІЧІ: тригер бази (надійний шлях) і браузер автора
    // (підстраховка), плюс можливий повтор після збою мережі. Журнал page_push_log
    // (post_id — первинний ключ) робить другий виклик безпечним no-op: якщо рядок
    // уже є, insert нічого не поверне → виходимо, не надіславши дубль користувачам.
    const { data: logRow } = await admin
      .from('page_push_log')
      .insert({ post_id: post.id })
      .select('post_id')
      .maybeSingle();
    if (!logRow) return json({ sent: 0, reason: 'already sent' });

    // Назва сторінки (заголовок сповіщення)
    const { data: page } = await admin
      .from('pages').select('name').eq('id', post.page_id).single();
    const pageName = (page && page.name) || 'Стрічка';

    // Підписники сторінки, крім АВТОРА ПОСТА. Беремо саме post.author_uid, а не
    // викликача: при виклику з тригера бази викликач — сервер, а не людина.
    // Сторінками: на 1001-му підписнику запит без `.range()` мовчки обрізався б.
    const subs = await усіРядки<{ uid: string }>((від, до) => {
      let q = admin.from('page_subscriptions').select('uid')
        .eq('page_id', post.page_id).order('uid').range(від, до);
      if (post.author_uid) q = q.neq('uid', post.author_uid);
      return q;
    });
    // 🆕 24.08 (B-33) — хто вимкнув «Стрічку» в кабінеті, того прибираємо
    // ще ДО перевірки «чи є взагалі кому слати». Інакше запис журналу лишився б
    // із думкою «надіслали», хоча всі адресати мовчать.
    // 🔴 До 24.08 вимикачі сповіщень не читав НІХТО: вони писались у
    // `localStorage` і там лишались. Слово Вови: «Декоративного в нас нічого не
    // має бути… скасування сповіщення має бути робоче».
    // 🔑 Відсутній рядок = ДОЗВОЛЕНО; помилка запиту — теж (краще зайве, ніж
    // мовчки проковтнути підписку, яку людина зробила сама).
    const усі = (subs || []).map((s: { uid: string }) => s.uid);
    let recipientUids = усі;
    {
      // Шматками по 200: весь перелік в одному `.in(...)` зібрав би адресу
      // запиту на десятки кілобайт і отримав `414`.
      const off = new Set<string>();
      let збій = false;
      for (const шматок of частинами(усі, 200)) {
        const { data: prefs, error } = await admin
          .from('notif_prefs').select('uid, feed').in('uid', шматок);
        if (error) { збій = true; break; }
        ((prefs || []) as Array<{ uid: string; feed: boolean }>)
          .filter((r) => r.feed === false).forEach((r) => off.add(r.uid));
      }
      // 🔑 Відсутній рядок = ДОЗВОЛЕНО; збій запиту — теж (краще зайве
      // сповіщення, ніж мовчки проковтнута підписка, яку людина зробила сама).
      if (!збій) recipientUids = усі.filter((u: string) => !off.has(u));
    }
    // ⚠️ Виходимо ТІЛЬКИ прибравши запис журналу. Інакше «нікому не надіслали» лишалось
    // би позначеним як «надіслано», і повтор уже не спрацював би. Реальна гонка: тригер
    // кличе функцію за ~40 мс після вставки поста, а пристрій підписника саме в цю мить
    // міг ще дореєстровуватись (self-heal при старті) → сповіщення втрачалось назавжди.
    // Дубль неможливий: нікому нічого не пішло.
    if (!recipientUids.length) return await bail(admin, post.id, 'no subscribers');

    // Пристрої всіх підписників
    const devices: Array<{ id: number; endpoint: string; p256dh: string; auth_key: string }> = [];
    for (const шматок of частинами(recipientUids, 200)) {
      const пачка = await усіРядки<typeof devices[number]>((від, до) => admin
        .from('user_push_devices').select('id, endpoint, p256dh, auth_key')
        .in('uid', шматок).order('id').range(від, до));
      devices.push(...пачка);
    }
    if (!devices.length) return await bail(admin, post.id, 'no devices');

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

    const { sent, dead } = await слатиПачками(devices, payload);
    for (const шматок of частинами(dead, 200)) {
      await admin.from('user_push_devices').delete().in('id', шматок);
    }

    // Якщо не дійшло НІКОМУ (тимчасовий збій сервісу push) — прибираємо запис із журналу,
    // щоб повтор (підстраховка з клієнта / ручний виклик) міг спробувати ще раз.
    // Дубль при цьому неможливий: сповіщення не отримав жоден пристрій.
    if (sent === 0) await admin.from('page_push_log').delete().eq('post_id', post.id);
    else            await admin.from('page_push_log').update({ sent }).eq('post_id', post.id);

    return json({ sent });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

// Вихід «нічого не надіслано»: прибираємо позначку в журналі, щоб повторний виклик
// (підстраховка з клієнта) міг спробувати ще раз. Дубль неможливий — нікому не пішло.
// deno-lint-ignore no-explicit-any
async function bail(admin: any, postId: number, reason: string) {
  await admin.from('page_push_log').delete().eq('post_id', postId);
  return json({ sent: 0, reason });
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
