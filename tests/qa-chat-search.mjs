// Стенд: ПОШУК ДОБИРАЄТЬСЯ ДО «ПИТАНЬ» І ДО «ПОВІДОМЛЕНЬ» (06.09).
//
// 🗣️ ЗАМОВЛЕННЯ ВОВИ 06.09: підключити єдиний пошук там, де його ще не було —
// «в питаннях зроби таке, можливо хтось буде шукати якесь питання».
//
// 🔴 ЩО БУЛО ЗАМІРЯНО ПЕРЕД РОБОТОЮ (не з памʼяті — прогоном коду):
//   • «Повідомлення» (`board-chat.js:766`) шукали через `hay.includes(q)` —
//     точний ПІДРЯДОК по злитому тексту. «велосипеда» не знаходило розмову про
//     «велосипед», «Мельник Оксана» не знаходило «Оксана Мельник».
//   • «Питання» вже йшли через `core/search.js`, але на полях ЗА ЗАМОВЧУВАННЯМ,
//     а в записі `type:'chat'` немає ні `title`, ні `tags`: сам текст питання
//     лежить у `text`, тобто шукався НАЙТИХІШИМ полем (вага 15). А ВІДПОВІДЕЙ у
//     записі немає взагалі — вони окремі рядки `comments`, і пошук їх не бачив.
//   • сам двигун не знає ПРЕФІКСІВ: «вело» → нічого, «окса» → нічого.
//
// 🔑 ЩО САМЕ МІРЯЄ ЦЕЙ СТЕНД І ЧОМУ НЕ ІМПОРТУЄ `core/search.js`.
// Механізм уже доведений трьома стендами (`search-stem` 35 · `search-engine` 30 ·
// `search-synonyms` 17). Вони НЕ доводять, що дві нові поверхні його кличуть, що
// поля передані правильно і що картка малює підпис. Тому тут нічого не
// імпортується: стенд ВІДКРИВАЄ застосунок, ДРУКУЄ запит у справжнє поле і
// дивиться на екран. Той самий урок, що з екраном входу 30.08 — помічник може
// бути ідеальним, а екран не зібраним.
//
// 🔴 КОНТРОЛЬ (без нього стенд нічого не доводить):
//     BUNDLE_REV=origin/main node tests/qa-chat-search.mjs
// На коді до 06.09 мусять почервоніти саме нові вміння: збіг за ВІДПОВІДДЮ,
// підпис «знайдено за…» на картці питання, префікс і відмінок у Повідомленнях.
// ⚠️ Частина перевірок у контролі лишається ЗЕЛЕНОЮ навмисно (пошук по самому
// тексту питання працював і до того) — це межа, а не недогляд: якби червоніло
// геть усе, стенд доводив би лише «сторінка відкрилась».
//
// Запуск: node tests/qa-chat-search.mjs

import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const BUNDLE_REV = process.env.BUNDLE_REV || '';

const t0 = Date.now() - 5 * 864e5;
const ME = { id: 'u-me', name: 'Я' };

// ── СЦЕНА «ПИТАННЯ» ─────────────────────────────────────────────────────────
// 🔑 Три питання, і кожне має роль:
//   701 — слова «афіша» в САМОМУ питанні НЕМАЄ, воно лише у відповіді;
//   702 — контроль на зайве: не має вилазити на запити про афішу;
//   703 — слово «афішу» стоїть у САМОМУ питанні → потрібне для перевірки порядку.
const POSTS = [
  { id: 701, type: 'chat', text: 'Коли буде концерт на День міста?', title: null,
    author: 'Олена', owner_uid: 'u-olena', status: 'published', location: null, tags: [],
    ts: t0, created_at: new Date(t0).toISOString(), published_at: new Date(t0).toISOString() },
  { id: 702, type: 'chat', text: 'Хтось знає, коли ремонтуватимуть дорогу?', title: null,
    author: 'Петро', owner_uid: 'u-petro', status: 'published', location: null, tags: [],
    ts: t0 + 6e4, created_at: new Date(t0 + 6e4).toISOString(), published_at: new Date(t0 + 6e4).toISOString() },
  { id: 703, type: 'chat', text: 'Де взяти афішу заходів на вересень?', title: null,
    author: 'Ніна', owner_uid: 'u-nina', status: 'published', location: null, tags: [],
    ts: t0 + 12e4, created_at: new Date(t0 + 12e4).toISOString(), published_at: new Date(t0 + 12e4).toISOString() },
];
const COMMENTS = [
  // Слово «афішу» — ЛИШЕ тут. У тексті питання 701 його немає жодного разу.
  { id: 5001, post_id: 701, author: 'Віктор', text: 'Афішу вже повісили біля клубу.', sender_uid: 'u-viktor',
    reply_to_id: null, created_at: new Date(t0 + 36e5).toISOString(), edited_at: null, deleted_at: null, client_tag: null },
  // 🛑 ВКЛАДЕНА відповідь (репліка під чужою). У картку вона не потрапляє ніколи,
  // але людина могла запамʼятати слово саме з неї — тому пошук її брати МУСИТЬ.
  // Це і є різниця між `answersText` (усі живі) і `answersCount` (лише кореневі).
  { id: 5002, post_id: 701, author: 'Марія', text: 'Кажуть, перенесли на понеділок.', sender_uid: 'u-maria',
    reply_to_id: 5001, created_at: new Date(t0 + 44e5).toISOString(), edited_at: null, deleted_at: null, client_tag: null },
  // 🛑 ВИДАЛЕНА відповідь. Пошук не сміє воскрешати те, що прибрали з екрана.
  { id: 5003, post_id: 702, author: 'Галина', text: 'Асфальтоукладальник вже приїхав.', sender_uid: 'u-halyna',
    reply_to_id: null, created_at: new Date(t0 + 45e5).toISOString(), edited_at: null,
    deleted_at: new Date(t0 + 46e5).toISOString(), client_tag: null },
];

const { url, stop } = await serve();
const b = await launch(chromium);

async function відкрити(таб) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const впало = [];
  p.on('pageerror', e => впало.push(String(e && e.message || e)));
  if (BUNDLE_REV) {
    const old = projectFile('bundle.js', BUNDLE_REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
  }
  return { ctx, p, впало, таб };
}

// ═══ ЧАСТИНА А. ПИТАННЯ ══════════════════════════════════════════════════════
{
  const { p, впало } = await відкрити('discussions');
  await mockSupabase(p, { posts: POSTS, comments: COMMENTS, announcements: [],
                          reactions: [], saved_posts: [] }, { user: ME });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForTimeout(300);
  await p.evaluate(() => window.switchTab && window.switchTab('discussions'));
  await p.waitForTimeout(1500);

  const питання = () => p.evaluate(() =>
    [...document.querySelectorAll('#disc-content .qa-card-q')].map(e => e.textContent.trim()));

  async function шукати(q) {
    await p.evaluate(() => {
      const i = document.querySelector('#disc-content .bd-search-input');
      if (i) { i.value = ''; i.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    await p.waitForTimeout(200);
    if (q) {
      await p.evaluate((текст) => {
        const i = document.querySelector('#disc-content .bd-search-input');
        i.value = текст;
        i.dispatchEvent(new Event('input', { bubbles: true }));
      }, q);
    }
    await p.waitForTimeout(400);
    return питання();
  }

  // ── 0. ПРИЛАД. Без цього будь-яке «не знайшлось» нижче доводило б лише те,
  //       що сцена не піднялась.
  const усі = await питання();
  ok('ПРИЛАД: усі три питання намальовані', усі.length === POSTS.length, `${усі.length} з ${POSTS.length}`);
  ok('ПРИЛАД: застосунок не впав', впало.length === 0, впало[0] || 'чисто');

  // ── 1. ПОШУК ПО САМОМУ ПИТАННЮ (працював і до 06.09 — межа названа) ────────
  const a1 = await шукати('концерти');
  ok('питання знаходиться за словом із себе, в іншому числі',
     a1.length === 1 && /концерт/i.test(a1[0]), a1.join(' | ') || '—');

  // ── 2. 🔴 ГОЛОВНЕ: ЗБІГ ЗА ВІДПОВІДДЮ ──────────────────────────────────────
  // Слова «афіша» в тексті питання 701 немає — воно лише у відповіді.
  const a2 = await шукати('афіша');
  ok('питання знаходиться за словом із ВІДПОВІДІ',
     a2.some(t => /концерт/i.test(t)), a2.join(' | ') || '—');

  // ── 3. ПОРЯДОК: ПИТАННЯ ВАЖИТЬ БІЛЬШЕ ЗА ВІДПОВІДЬ ─────────────────────────
  // 🔑 Це і є відповідь на «а раптом знайдеться зайве»: обидва питання у видачі,
  // але вгорі те, де слово стоїть у САМОМУ питанні. Без ваг вони стали б урівні,
  // і слабший сигнал іноді перебивав би головний.
  ok('слово в самому питанні стоїть ВИЩЕ за слово у відповіді',
     a2.length >= 2 && /афіш/i.test(a2[0]), a2.join(' | ') || '—');

  // ── 4. ВКЛАДЕНА ВІДПОВІДЬ ТЕЖ ШУКАЄТЬСЯ ────────────────────────────────────
  const a3 = await шукати('понеділок');
  ok('слово з ВКЛАДЕНОЇ відповіді теж знаходить питання',
     a3.some(t => /концерт/i.test(t)), a3.join(' | ') || '—');

  // ── 5. ВИДАЛЕНА ВІДПОВІДЬ НЕ ШУКАЄТЬСЯ ─────────────────────────────────────
  const a4 = await шукати('асфальтоукладальник');
  ok('видалена відповідь у пошук НЕ потрапляє', a4.length === 0, a4.join(' | ') || '—');

  // ── 6. ПІДПИС «ЗНАЙДЕНО ЗА…» НА КАРТЦІ ПИТАННЯ ─────────────────────────────
  // 🔑 Потрібен саме тут більше, ніж на Дошці: питання потрапило у видачу за
  // словом, якого в ньому НЕМАЄ. Без підпису це читається як випадковість.
  await шукати('афіша');
  const підпис = await p.evaluate(() => {
    const e = document.querySelector('#disc-content .qa-row .bd-ad-why');
    return e ? { текст: e.textContent.trim(), кегль: getComputedStyle(e).fontSize } : null;
  });
  ok('підпис «знайдено за…» намальований на картці питання', !!підпис, підпис?.текст || 'немає');
  ok('підпис тихіший за питання (виноска, не другий заголовок)',
     !!підпис && parseFloat(підпис.кегль) < 14, підпис?.кегль || '—');

  // 🛑 Без запиту підпису бути не мусить — інакше він шумів би на кожній картці.
  await шукати('');
  const безЗапиту = await p.evaluate(() =>
    document.querySelectorAll('#disc-content .qa-row .bd-ad-why').length);
  ok('без запиту підпису на питаннях НЕМАЄ', безЗапиту === 0, `${безЗапиту}`);

  // ── 7. ПРЕФІКС ПІД ЧАС НАБОРУ ──────────────────────────────────────────────
  const a5 = await шукати('афіш');
  ok('незакінчене слово («афіш») уже щось знаходить', a5.length > 0, a5.join(' | ') || '—');

  // ── 8. ЧУЖИЙ ЗАПИТ → ПОРОЖНЬО (контроль на «знаходить будь-що») ────────────
  const a6 = await шукати('вертоліт');
  ok('чужий запит нічого не знаходить', a6.length === 0, a6.join(' | ') || '—');

  ok('за всю частину А жодної помилки в застосунку', впало.length === 0, впало.join(' · ') || 'чисто');
}

// ═══ ЧАСТИНА Б. ПОВІДОМЛЕННЯ ════════════════════════════════════════════════
{
  const NOW = new Date().toISOString();
  const ADS = [
    { id: 'p-1', type: 'board', category: 'sell', title: 'ВЕЛОСИПЕД ДОРОСЛИЙ',
      text: 'Робочий стан.', price: '2500', location: 'Олика', author: 'Оксана Мельник',
      owner_uid: 'u-oksana', contact: '', photos: [], status: 'published',
      published_at: NOW, created_at: NOW },
    { id: 'p-2', type: 'board', category: 'sell', title: 'ПРАЛЬНА МАШИНА',
      text: 'Справна.', price: '3000', location: 'Олика', author: 'Дмитро Гринь',
      owner_uid: 'u-dmytro', contact: '', photos: [], status: 'published',
      published_at: NOW, created_at: NOW },
  ];
  const THREADS = [
    { id: 't-1', post_id: 'p-1', author_uid: 'u-oksana', buyer_uid: ME.id,
      author_name: 'Оксана Мельник', buyer_name: 'Я',
      last_message_at: NOW, last_message_text: 'Ще актуально?', post: ADS[0] },
    { id: 't-2', post_id: 'p-2', author_uid: 'u-dmytro', buyer_uid: ME.id,
      author_name: 'Дмитро Гринь', buyer_name: 'Я',
      last_message_at: NOW, last_message_text: 'Домовились.', post: ADS[1] },
  ];

  const { p, впало } = await відкрити('board');
  await mockSupabase(p, { posts: ADS, threads: THREADS, messages: [],
                          thread_user_state: [], announcements: [] }, { user: ME });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.evaluate(() => window.switchTab && window.switchTab('board'));
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('.brules-ok')?.click());
  await p.waitForTimeout(400);
  // Відкриваємо «Повідомлення» тим самим шляхом, що людина: FAB → пункт меню.
  await p.waitForSelector('#board-fab-menu [data-fab="messages"]', { timeout: 9000 }).catch(() => {});
  await p.evaluate(() => document.getElementById('board-trigger')?.click());
  await p.waitForTimeout(300);
  await p.evaluate(() => document.querySelector('#board-fab-menu [data-fab="messages"]')?.click());
  await p.waitForTimeout(1200);

  const рядки = () => p.evaluate(() =>
    [...document.querySelectorAll('.pm-thread')].map(e => e.textContent.replace(/\s+/g, ' ').trim()));

  async function шукатиЧат(q) {
    await p.evaluate((текст) => {
      const i = document.querySelector('#pm-search');
      i.value = текст;
      i.dispatchEvent(new Event('input', { bubbles: true }));
    }, q);
    await p.waitForTimeout(350);
    return рядки();
  }

  // ── 0. ПРИЛАД ──────────────────────────────────────────────────────────────
  const усі = await рядки();
  ok('ПРИЛАД: обидві розмови намальовані', усі.length === 2, `${усі.length} з 2`);
  const полеЄ = await p.evaluate(() => {
    const e = document.querySelector('.pm-search');
    return !!e && getComputedStyle(e).display !== 'none';
  });
  ok('ПРИЛАД: поле пошуку розмов видиме', полеЄ, полеЄ ? 'видиме' : 'сховане');

  // ── 1. 🔴 ВІДМІНОК (до 06.09 — точний підрядок, тобто провал) ──────────────
  const b1 = await шукатиЧат('велосипеда');
  ok('«велосипеда» знаходить розмову про «ВЕЛОСИПЕД»',
     b1.length === 1 && /Оксана/i.test(b1[0]), b1.join(' | ') || '—');

  // ── 2. 🔴 ПОРЯДОК СЛІВ В ІМЕНІ ─────────────────────────────────────────────
  const b2 = await шукатиЧат('Мельник Оксана');
  ok('імʼя у зворотному порядку теж знаходить',
     b2.length === 1 && /Оксана/i.test(b2[0]), b2.join(' | ') || '—');

  // ── 3. ПРЕФІКС ПІД ЧАС НАБОРУ ──────────────────────────────────────────────
  // 🔑 Саме через це в `core/search.js` заведено `prefix`: список розмов
  // перемальовується на кожне натискання, і без префікса перехід на двигун був би
  // РЕГРЕСОМ проти старого підрядка, який «вело» ловив.
  const b3 = await шукатиЧат('вело');
  ok('незакінчене «вело» уже знаходить розмову', b3.length === 1, b3.join(' | ') || '—');
  const b4 = await шукатиЧат('окса');
  ok('незакінчене імʼя «окса» уже знаходить розмову', b4.length === 1, b4.join(' | ') || '—');

  // ── 4. ЗВУЖЕННЯ ПРАЦЮЄ (контроль на «знаходить усе») ───────────────────────
  const b5 = await шукатиЧат('пральна');
  ok('інший запит дає ІНШУ розмову, а не обидві',
     b5.length === 1 && /Дмитро/i.test(b5[0]), b5.join(' | ') || '—');
  const b6 = await шукатиЧат('вертоліт');
  ok('чужий запит не знаходить жодної розмови', b6.length === 0, b6.join(' | ') || '—');
  const b7 = await шукатиЧат('');
  ok('порожній запит повертає обидві розмови', b7.length === 2, `${b7.length}`);

  ok('за всю частину Б жодної помилки в застосунку', впало.length === 0, впало.join(' · ') || 'чисто');
}

await stop(); await b.close();
done();
