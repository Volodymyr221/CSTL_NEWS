// supabase/functions/send-answer-push/index.ts
// Edge Function: сповіщення про ВІДПОВІДЬ на питання і про КОМЕНТАР до оголошення.
//
// 🔴 Заведено 16.08.2026 після аудиту: на таблиці `comments` не було ЖОДНОГО
// тригера сповіщень, тобто цикл «запитав громаду → тобі відповіли» був розірваний.
// Людина мусила сама повертатись і перевіряти, чи хтось відповів.
//
// Три різні за важливістю сигнали (перші два — та сама логіка, що в
// `send-comment-push`):
//   1) ТОБІ ВІДПОВІЛИ (`reply_to_id` вказує на твою репліку) — завжди й одразу.
//      Це персональне звернення, притишувати його не можна.
//   2) НОВА ВІДПОВІДЬ ПІД ТВОЇМ ЗАПИСОМ (ти автор питання/оголошення) — з вікном
//      тиші 10 хв. Без нього під живим обговоренням автор отримав би десяток
//      сповіщень за вечір.
//   3) 🆕 23.08 — ВІДПОВІДЬ У ПИТАННІ, ЯКЕ ТИ ПОЗНАЧИВ «МЕНЕ ТЕЖ ЦІКАВИТЬ»
//      (вікно тиші 30 хв). До цього дня кнопка «Мене теж цікавить» не мала
//      ЖОДНОГО наслідку: вона писала рядок у `reactions` і на цьому все —
//      тобто застосунок обіцяв людині відповідь і не повідомляв про неї.
//
// 🛑 ТИПИ 1 І 2 НЕ ПЕРЕПИСАНІ — пряме слово Вови 23.08: «Не змінювати вже
// працюючу систему push для власного питання та відповіді на відповідь. Вона
// вже працює з 16.08. Завдання — ДОДАТИ відсутню логіку, а не переписувати те,
// що вже працює». Тип 3 доданий ПІСЛЯ них, тим самим набором `notified`.
// Єдина зміна всередині типу 2 — ЦИФРА ПРОПУЩЕНОГО (крок А2), і її Вова
// замовив прямо: «debounce має обʼєднувати події, а не просто губити їх».
//
// 🔑 ЧОМУ У ТИПУ 3 ВЛАСНЕ ВІКНО, А НЕ СПІЛЬНЕ З АВТОРОМ. Автор питання один, і
// «під цим постом щойно надсилали» для нього означає «надсилали мені». Для
// підписників це неправда: автору могли написати хвилину тому, і спільне вікно
// змусило б мовчати всіх інших. Тому тип 3 рахує вікно ПО ЛЮДИНІ —
// `answer_push_targets` (див. `scripts/supabase_answer_push_targets.sql`).
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
// Вікно тиші для тих, хто позначив «Мене теж цікавить». Довше за авторське
// свідомо: я не автор питання, терміновості для мене менше, а сповіщень під
// живим питанням може бути багато.
const INTEREST_QUIET_MINUTES = 30;

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
      await mark(admin, c.id, post.id, [target], 'reply');   // лише запис у журнал адресатів
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
      // 🆕 23.08 (крок А2) — СКІЛЬКИ ВІДПОВІДЕЙ ЛЮДИНА ПРОПУСТИЛА, ПОКИ МОВЧАЛИ.
      const n = await missed(admin, owner, post.id);
      sent += await push(admin, [owner], {
        type: 'answer-new', post_id: post.id, comment_id: c.id,
        title: n > 1
          ? (isQuestion
              ? `${n} ${plural(n, 'нова відповідь', 'нові відповіді', 'нових відповідей')} на ваше питання`
              : `${n} ${plural(n, 'новий коментар', 'нові коментарі', 'нових коментарів')} до вашого оголошення`)
          : (isQuestion
              ? `${authorName} відповів на ваше питання`
              : `${authorName} прокоментував ваше оголошення`),
        // 🔑 Коли відповідей кілька — у тілі стоїть САМЕ ПИТАННЯ, а не текст
        //    останньої з них. Показати одну з восьми означало б знову сказати
        //    людині менше, ніж є: заголовок обіцяв би вісім, а тіло показувало б
        //    одну — і саме та одна виглядала б як «усе, що сталось».
        body: n > 1 ? subject : (snippet || subject),
        tag: `answer-post-${post.id}`, url,
      });
      await mark(admin, c.id, post.id, [owner], 'owner');    // лише запис у журнал адресатів
      notified.add(owner);
    }
  }

  // 3. 🆕 «МЕНЕ ТЕЖ ЦІКАВИТЬ» — тим, хто попросив стежити за цим питанням.
  //
  // ⚠️ Лише для ПИТАНЬ. На оголошеннях Дошки реакцій немає з 11.07 (рішення
  //    Вови: на маркетплейсі вони не доречні), тож там цей блок просто не має
  //    з чим працювати — але явна умова чесніша за «однаково нічого не знайде».
  //
  // 🔴 `reactions.user_id` — це TEXT, і в ньому історично лежать ДВА різні види
  //    id: uid акаунта (сьогодні) і анонімний id з `localStorage` (до переписування
  //    політик). 📐 Заміряно на живій базі 23.08: з 14 рядків таблиці 7 анонімні —
  //    але **на питаннях усі 5 сердець належать справжнім акаунтам**, бо кнопка
  //    стала «Мене теж цікавить» аж 11.08, коли політика вже вимагала `auth.uid()`.
  //    Тому анонімні id не «майже неможливі», а просто НЕ ЗУСТРІЧАЮТЬСЯ тут —
  //    і все ж відсіюємо їх зіставленням із `profiles`, а не вірою в це.
  if (isQuestion) {
    const { data: rows } = await admin
      .from('reactions').select('user_id').eq('post_id', post.id).eq('emoji', '❤️');
    // 🛑 ФІЛЬТР ФОРМИ — ОБОВʼЯЗКОВИЙ, І ЦЕ НЕ ПЕРЕСТРАХОВКА.
    //    `profiles.uid` має тип `uuid`, а `reactions.user_id` — `text`. Якщо в
    //    списку трапиться значення, яке не є UUID, Postgres відкине ВЕСЬ запит
    //    (`invalid input syntax for type uuid`) — тобто через один сторонній
    //    рядок мовчки не отримає сповіщення ЖОДЕН підписник цього питання.
    //    Такий id уже вміє зʼявлятись: `getAnonId()` у `core/supabase.js` має
    //    запасну гілку `'anon-' + …` для браузерів без `crypto.randomUUID`.
    // 🔑 Це рівно клас «мовчазний провал» із правила №12: збою не видно, вада
    //    виглядає як «сповіщення чомусь не приходять».
    const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const кандидати = [...new Set((rows || []).map((r: { user_id: string }) => r.user_id))]
      .filter((u) => u && UUID.test(u) && !notified.has(u));

    if (кандидати.length) {
      // Відсів анонімних id: беремо лише тих, хто справді є акаунтом.
      const { data: живі } = await admin
        .from('profiles').select('uid').in('uid', кандидати);
      const uids: string[] = (живі || []).map((p: { uid: string }) => p.uid);

      // Вікно тиші рахуємо ПО ЛЮДИНІ. Кому писали під цим питанням за останні
      // 30 хв — той цього разу мовчить.
      // ⚠️ Порожній список сюди не пускаємо: `.in('uid', [])` перетворюється на
      // `in.()`, і PostgREST відповідає помилкою розбору, а не «нікого немає».
      if (!uids.length) return await finish(admin, c.id, sent, isQuestion);
      const since = new Date(Date.now() - INTEREST_QUIET_MINUTES * 60_000).toISOString();
      const { data: свіжі } = await admin
        .from('answer_push_targets')
        .select('uid')
        .eq('post_id', post.id)
        .in('uid', uids)
        .gte('created_at', since);
      const тихі = new Set((свіжі || []).map((r: { uid: string }) => r.uid));
      const кому = uids.filter((u) => !тихі.has(u));

      // Число пропущеного рахуємо ДЛЯ КОЖНОГО окремо — у людей різні моменти
      // останнього сповіщення, тож спільне число було б неправдою для всіх, крім
      // одного. Тому й розсилаємо не одним пакетом, а групами з однаковим числом.
      const порції = new Map<number, string[]>();
      for (const u of кому) {
        const n = await missed(admin, u, post.id);
        if (!порції.has(n)) порції.set(n, []);
        порції.get(n)!.push(u);
      }

      for (const [n, група] of порції) {
        sent += await push(admin, група, {
          type: 'answer-interest', post_id: post.id, comment_id: c.id,
          // 🔑 Формулювання каже, ЧОМУ це прийшло: «яке вас цікавить» — це
          // посилання на ВЛАСНУ дію людини. Без цього сповіщення про чуже
          // питання виглядало б як розсилка (правило №12 `HOT_RULES`).
          title: n > 1
            ? `${n} ${plural(n, 'нова відповідь', 'нові відповіді', 'нових відповідей')} на питання, яке вас цікавить`
            : 'Зʼявилась відповідь на питання, яке вас цікавить',
          body: n > 1 ? subject : (snippet || subject),
          tag: `answer-interest-${post.id}`, url,
        });
        await mark(admin, c.id, post.id, група, 'interest');
        група.forEach((u) => notified.add(u));
      }
    }
  }

  return await finish(admin, c.id, sent, isQuestion);
}

// Спільне завершення: дописати підсумок у журнал і віддати відповідь.
// 🔑 Окремою функцією, бо з блоку типу 3 є ранній вихід, а він НЕ сміє
// пропустити запис `sent` — інакше вікно тиші автора рахувалося б по журналу з
// нулями, тобто мовчки перестало б працювати.
async function finish(admin: Admin, commentId: number, sent: number, isQuestion: boolean) {
  await admin.from('answer_push_log').update({ sent }).eq('comment_id', commentId);
  return { sent, question: isQuestion };
}

// ── СКІЛЬКИ ВІДПОВІДЕЙ ЛЮДИНА НЕ БАЧИЛА (крок А2, 23.08) ────────────────────
//
// 🔴 ЯКУ ВАДУ ЦЕ ЛІКУЄ. Вікно тиші досі ГАСИЛО сповіщення назовсім, а не
// відкладало. Тобто десять відповідей за двадцять хвилин давали автору два push,
// і про решту вісім він не дізнавався ніколи. Це рівно той клас, що коштував дня
// 23.08: **число, яке применшує, гірше за відсутнє** — людина дивиться на нього
// і вважає, що все прочитала. Слово Вови: «debounce має обʼєднувати події, а не
// просто губити їх».
//
// 🔑 РАХУЄМО ВІД ОСТАННЬОГО PUSH САМЕ ЦІЙ ЛЮДИНІ (`answer_push_targets`), а не
// від останнього сповіщення під постом: у автора питання і в того, хто позначив
// «Цікавить», ці моменти різні, і спільна межа збрехала б обом.
//
// ⚠️ ЧОМУ ФІЛЬТРУЄМО В JS, А НЕ ЗАПИТОМ. `.neq('sender_uid', uid)` у Postgres
// відсіює ще й рядки, де `sender_uid` порожній (`NULL <> значення` дає NULL, а
// не «істину») — а порожній автор у нас буває: так пишуть дописи ШІ-агента.
// Тобто запит мовчки не порахував би частину відповідей. Обсяг тут — відповіді
// під ОДНИМ питанням, тож ціна вибірки в памʼять нульова.
//
// 🛑 ЩО ЦЕ НЕ ЛІКУЄ, І ЦЕ ЧЕСНО. Якщо після сплеску більше ніхто не відповість,
// останнього push не буде взагалі — число приїде лише з наступною відповіддю.
// Повне лікування — відкладений push за розкладом, і він свідомо лишений на
// «пізніше» (`docs/QA_CONCEPT.md` §18). Але в САМОМУ ЗАСТОСУНКУ інформація не
// втрачається: капсула «відповіли на моє питання» на Громаді рахує все джерело
// (`RANK.ANSWERS`), тож людина побачить правильне число, щойно відкриє додаток.
async function missed(admin: Admin, uid: string, postId: number) {
  const { data: last } = await admin
    .from('answer_push_targets')
    .select('created_at')
    .eq('uid', uid).eq('post_id', postId)
    .order('created_at', { ascending: false })
    .limit(1);
  const від = last?.[0]?.created_at;
  if (!від) return 1;   // цій людині під цим записом ще не писали

  const { data: rows } = await admin
    .from('comments')
    .select('sender_uid')
    .eq('post_id', postId)
    .is('deleted_at', null)
    .gt('created_at', від);
  // Свої відповіді не рахуємо: автор питання часто дописує сам.
  const n = (rows || []).filter((r: { sender_uid: string | null }) => r.sender_uid !== uid).length;
  return n > 0 ? n : 1;
}

// Українська має три форми числа — «1 відповідь · 2 відповіді · 5 відповідей».
// Окремо 11-14: вони беруть форму «відповідей» попри останню цифру.
// ⚠️ Копія `plural()` з `src/tabs/home-caps.js`, і це НЕ порушення правила про
// дублі: Edge Function крутиться в Deno на сервері Supabase і фізично не може
// імпортувати нічого з `src/` — то інший рантайм і інший деплой. Формула взята
// один-в-один навмисно, щоб число в push і число в капсулі відмінювались
// однаково: два різні правила на те саме — це вже розходження поверхонь.
function plural(n: number, one: string, few: string, many: string) {
  const t = n % 100, o = n % 10;
  if (t >= 11 && t <= 14) return many;
  if (o === 1) return one;
  if (o >= 2 && o <= 4) return few;
  return many;
}

// Запис у журнал адресатів. 🔑 Потрібен не для цього кроку, а для наступного:
// «ще 4 відповіді на ваше питання» рахується від моменту, коли ЦІЙ людині
// писали востаннє (крок А2 у `docs/QA_CONCEPT.md`). Тому пишемо всі три типи,
// хоча читає поки лише третій.
// ⚠️ Помилку запису ковтаємо навмисно: журнал — це зручність для наступних
// сповіщень, і провалити через нього вже НАДІСЛАНИЙ push означало б зіпсувати
// головну дію заради побічної.
async function mark(admin: Admin, commentId: number, postId: number, uids: string[], kind: string) {
  if (!uids.length) return;
  try {
    await admin.from('answer_push_targets').upsert(
      uids.map((uid) => ({ comment_id: commentId, uid, post_id: postId, kind })),
      { onConflict: 'comment_id,uid' },
    );
  } catch (_) { /* журнал адресатів не має права зривати сповіщення */ }
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
