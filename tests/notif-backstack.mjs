// tests/notif-backstack.mjs — ТАП ПО СПОВІЩЕННЮ: ЩО ВИДНО І КУДИ ВЕДЕ «НАЗАД».
// Заведено 15.08.2026 після третьої скарги Вови (два знімки).
//
// 🔴 ЩО ОХОРОНЯЄМО. Слова Вови: «мене перекидає в сам чат, це круто працює. Але
// відкриває тільки цю сторінку, і коли я свайпом виходжу назад — вибиває сторінку
// завантаження і пусту сторінку, ніби немає під цим нічого. А воно має перекидати
// мене назад в усі повідомлення, і звідти в застосунок, у Дошку». Плюс про
// «Стрічку»: «треба вважати те, що три секунди сторінка завантаження ще йде…
// щоб він почав виділятися трішки пізніше, вже після завантаження».
//
// 🔑 ОБИДВІ ВАДИ — ОДНА ПРИЧИНА: `#splash` живе 3.5с + 0.4с, а deep-link
// спрацьовував за ~0.5с. Тому під розмовою стояла заставка (її й видно на знімку),
// а підсвітка коментаря (2.4с) встигала згаснути НЕПОБАЧЕНОЮ. Плюс запис в
// історії був РІВНО ОДИН — тобто «назад» вело з застосунку геть.
//
// ⚠️ СТЕНД БРАУЗЕРНИЙ І МІРЯЄ ЧАС. Текстова перевірка тут безсила за визначенням:
// у коді і до фікса все було «на місці», ламався ПОРЯДОК У ЧАСІ.
//
// Контроль (доведення падінням) — версія ДО фікса:
//   BUNDLE_REV=origin/main node tests/notif-backstack.mjs
import { chromium } from '@playwright/test';
import { reporter, launch, serve, blockExternal, projectFile } from './_lib.mjs';

const { ok, done } = reporter();

const REV = process.env.BUNDLE_REV || '';
const OLD_BUNDLE = REV ? projectFile('bundle.js', REV) : null;

const THREAD_ID = 77;
const POST_ID   = 501;
const COM_ID    = 9001;

// Заставка: 3.5с показу + 0.4с згасання + запас. Усі «після заставки» заміри
// беруться саме звідси, щоб число стояло в одному місці.
const ПІСЛЯ_ЗАСТАВКИ = 4600;
const ПІД_ЗАСТАВКОЮ  = 900;

const stub = `
const нитки = [
  { id: ${THREAD_ID}, author_uid: 'other', buyer_uid: 'me', last_message_at: '2026-08-15T10:00:00Z',
    post: { id: 5, title: 'Продам будинок', text: '', category: 'Інше', photos: [], author: 'Олександр',
            contact: '', location: 'Жорнище', status: 'active',
            published_at: '2026-08-01T10:00:00Z', created_at: '2026-08-01T10:00:00Z' } },
];
const рядки = {
  threads: нитки,
  pages: [{ id: 1, name: 'Сільрада', avatar_url: null, official: true }],
  page_posts: [{ id: ${POST_ID}, page_id: 1, author_uid: 'me', text: 'Оголошення сільради',
                 image_url: null, image_urls: null, show_author: false,
                 event_date: null, event_time: null, event_location: null,
                 created_at: '2026-08-15T09:00:00Z', pinned_at: null,
                 pages: { name: 'Сільрада', avatar_url: null, official: true } }],
  page_comment_counts: [{ post_id: ${POST_ID}, n: 2 }],
  page_comments: [
    { id: ${COM_ID}, post_id: ${POST_ID}, author_uid: 'other', text: 'Дуже потрібна інформація',
      created_at: '2026-08-15T09:30:00Z', deleted_at: null, parent_id: null, edited_at: null, reply_to_uid: null },
    { id: 9002, post_id: ${POST_ID}, author_uid: 'other2', text: 'Підтримую',
      created_at: '2026-08-15T09:31:00Z', deleted_at: null, parent_id: null, edited_at: null, reply_to_uid: null },
  ],
};
function builder(table) {
  const p = Promise.resolve({ data: рядки[table] || [], error: null });
  const chain = new Proxy(function () {}, {
    get(_t, k) {
      if (k === 'then') return p.then.bind(p);
      if (k === 'catch') return p.catch.bind(p);
      if (k === 'finally') return p.finally.bind(p);
      if (k === 'maybeSingle' || k === 'single')
        return () => Promise.resolve({ data: (рядки[table] || [])[0] || null, error: null });
      return () => chain;
    },
    apply() { return chain; },
  });
  return chain;
}
window.supabase = {
  createClient() {
    return {
      auth: {
        getSession: () => Promise.resolve({ data: { session: { user: { id: 'me', email: 'me@e.com', user_metadata: {} } } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        getUser: () => Promise.resolve({ data: { user: { id: 'me' } } }),
        signOut: () => Promise.resolve({}),
      },
      from: (t) => builder(t),
      rpc: () => Promise.resolve({ data: null, error: null }),
      channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
      removeChannel: () => {},
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
      storage: { from: () => ({ upload: () => Promise.resolve({ data: null, error: null }),
                                getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    };
  },
};

// Знімач кадрів для перевірки плавності. Кадри беремо з requestAnimationFrame
// У САМІЙ СТОРІНЦІ: знімок ззовні синхронізує рендер і показав би рівні кадри
// там, де на телефоні провал.
window.__почати = () => {
  window.__кадри = [];
  const видно = (el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  let йде = true;
  const крок = () => {
    if (!йде) return;
    const main = document.querySelector('.app-main');
    window.__кадри.push({
      шарів: [...document.querySelectorAll('.pm-screen')].filter(видно).length,
      таббар: видно(document.querySelector('.tab-item')),
      тло: main ? getComputedStyle(main).backgroundColor : '',
      scrollY: Math.round(window.scrollY),
    });
    requestAnimationFrame(крок);
  };
  requestAnimationFrame(крок);
  return () => { йде = false; };
};
`;

// Зліпок екрана. Видимість міряємо ОБЧИСЛЕНИМИ стилями і геометрією, а не
// наявністю вузла: заставка згасає через opacity і лишається в DOM ще 600мс.
const зняти = () => {
  const видно = (el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const екрани = [...document.querySelectorAll('.pm-screen')].filter(видно)
    .map(e => [...e.classList].find(c => c.startsWith('pm-screen--')) || 'pm-screen');
  return {
    заставка: видно(document.getElementById('splash')),
    екрани,
    вкладка: document.querySelector('.app-main')?.dataset.tab || '—',
    лист: !!document.querySelector('.fd-com-sheet'),
    підсвічено: [...document.querySelectorAll('.fd-com-row--replying')]
      .map(r => r.closest('[data-com-id]')?.dataset.comId
             || r.getAttribute('data-com-id') || '?'),
    таббар: !!document.querySelector('.tab-item'),
  };
};

const browser = await launch(chromium);
const site = await serve();

async function сцена(hash) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await blockExternal(page);
  if (OLD_BUNDLE) await page.route('**/bundle.js', r =>
    r.fulfill({ body: OLD_BUNDLE, contentType: 'text/javascript; charset=utf-8' }));
  await page.addInitScript(stub);
  await page.goto(`${site.url}/index.html${hash}`, { waitUntil: 'domcontentloaded' });
  return { page, close: () => ctx.close() };
}

// ── 1. ЧАТ: під заставкою нічого не показуємо ────────────────────────────────
{
  const s = await сцена(`#/thread/${THREAD_ID}`);
  await s.page.waitForTimeout(ПІД_ЗАСТАВКОЮ);
  const під = await s.page.evaluate(зняти);
  ok('1. 🔴 поки стоїть заставка, розмову НЕ показуємо',
     під.заставка && под_немає(під),
     `заставка: ${під.заставка ? 'видно' : 'немає'} · екрани: [${під.екрани}]`);
  await s.close();
}
function под_немає(з) { return !з.екрани.length; }

// ── 2-4. ЧАТ: що видно після заставки і куди веде «назад» ────────────────────
{
  const s = await сцена(`#/thread/${THREAD_ID}`);
  await s.page.waitForTimeout(ПІСЛЯ_ЗАСТАВКИ);
  const крок0 = await s.page.evaluate(зняти);
  ok('2а. після заставки відкрито саму розмову',
     крок0.екрани.includes('pm-screen--chat'), `екрани: [${крок0.екрани}]`);
  ok('2б. 🔴 заставки під розмовою вже немає',
     !крок0.заставка, крок0.заставка ? 'заставка ВИДНО — це «сторінка завантаження» зі знімка' : 'чисто');
  // 🔴 15.08, уточнення Вови: шлях назад — чат → Повідомлення → **Громада**.
  // Раніше вкладку примусово ставили на Дошку; тепер не чіпаємо взагалі.
  ok('2в. вкладка застосунку — Громада (кінець шляху назад)',
     крок0.вкладка === 'community', `вкладка: ${крок0.вкладка}`);

  await s.page.goBack();
  await s.page.waitForTimeout(500);
  const крок1 = await s.page.evaluate(зняти);
  ok('3. 🔴 перший «назад» веде в «Повідомлення», а не в порожнечу',
     крок1.екрани.includes('pm-screen--list'),
     крок1.екрани.length ? `екрани: [${крок1.екрани}]` : 'жодного екрана — людина випала з застосунку');

  await s.page.goBack();
  await s.page.waitForTimeout(500);
  const крок2 = await s.page.evaluate(зняти).catch(() => null);
  ok('4. 🔴 другий «назад» лишає людину в застосунку на ГРОМАДІ',
     !!крок2 && !крок2.екрани.length && крок2.вкладка === 'community' && крок2.таббар,
     крок2 ? `вкладка: ${крок2.вкладка} · таб-бар: ${крок2.таббар ? 'є' : 'немає'}` : 'сторінку покинуто');

  // 🔴 ТРЕТІЙ ЗНІМОК ВОВИ — порожня сторінка Safari. Сповіщення відкриває
  // застосунок у СВІЖІЙ вкладці, тож позаду коренем немає нічого, і зайвий рух
  // пальця вивалював людину в нікуди. Заміряно приладом: на третьому «назад»
  // `url: about:blank`.
  for (let i = 3; i <= 4; i++) {
    await s.page.goBack().catch(() => {});
    await s.page.waitForTimeout(400);
  }
  const хвіст = await s.page.evaluate(зняти).catch(() => null);
  const url = s.page.url();
  ok('5а. 🔴 зайві «назад» НЕ вивалюють у порожню вкладку',
     !url.startsWith('about:'), `url: ${url.startsWith('about:') ? url : 'сторінка застосунку'}`);
  ok('5б. після них людина досі в застосунку, на Громаді',
     !!хвіст && хвіст.таббар && хвіст.вкладка === 'community',
     хвіст ? `вкладка: ${хвіст.вкладка} · таб-бар: ${хвіст.таббар ? 'є' : 'немає'}` : 'сторінку покинуто');
  // 🛑 Перша редакція запобіжника ставила його ДО `replaceState`, і той затирав
  // запис, лишаючи хеш на записі під ним: «назад» повертав `#/thread/<id>`,
  // слухач `hashchange` спрацьовував удруге і чат відкривався ЗАНОВО.
  ok('5в. 🛑 «назад» не відкриває розмову заново (хеш не воскресає)',
     !!хвіст && !хвіст.екрани.length, `екрани: [${хвіст ? хвіст.екрани : '—'}]`);
  await s.close();
}

// ── 10. ПЛАВНІСТЬ ВИХОДУ: «без блимання і без ривків» (замовлення Вови) ──────
// Міряємо ЧИСЛАМИ, а не на око: кадри, у яких на екрані немає ні шару чатів, ні
// застосунку — це і є блим; кілька значень тла — фон перетікає під готовим
// вмістом; різні scrollY — ривок сторінки (замок клавіатури знімає body{fixed}).
{
  const s = await сцена(`#/thread/${THREAD_ID}`);
  // 🛑 ЗНІМАТИ ПОЧИНАЄМО ПІД ЗАСТАВКОЮ, А НЕ ПІСЛЯ НЕЇ. Перша редакція цього
  // розділу стартувала на `ПІСЛЯ_ЗАСТАВКИ` і показувала «1 значення тла» навіть
  // на коді, який давав ВИДИМЕ перетікання: воно встигало закінчитись до першого
  // знятого кадру. Тобто прилад був чесний, а вікно спостереження — замале.
  // Заміряно на старій версії з широким вікном: **18 значень тла** за прохід.
  await s.page.waitForTimeout(2500);
  await s.page.evaluate(() => { window.__стоп = window.__почати(); });
  await s.page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 })
    .catch(() => {});
  await s.page.waitForTimeout(900);           // чат виїхав
  await s.page.goBack();                      // чат → Повідомлення
  await s.page.waitForTimeout(700);
  await s.page.goBack();                      // Повідомлення → Громада
  await s.page.waitForTimeout(900);
  const кадри = await s.page.evaluate(() => { window.__стоп?.(); return window.__кадри; });

  const пустий = k => k.шарів === 0 && !k.таббар;
  const порожніх = кадри.filter(пустий).length;
  const тла = [...new Set(кадри.map(k => k.тло))];
  const скроли = [...new Set(кадри.map(k => k.scrollY))];

  ok('10а. 🔴 жодного кадру без вмісту (це і був би блим)',
     кадри.length > 20 && порожніх === 0,
     `кадрів ${кадри.length}, порожніх ${порожніх}`);
  ok('10б. 🔴 тло не перетікає в людини на очах',
     тла.length === 1,
     `значень тла: ${тла.length}${тла.length > 1 ? ' → ' + тла[0] + ' … ' + тла[тла.length - 1] : ''}`);
  ok('10в. сторінка не смикається (прокрутка не стрибає)',
     скроли.length === 1, `scrollY: ${скроли.join(' → ')}`);
  await s.close();
}

// ── 5-7. КОМЕНТАР: лист і підсвітка мусять бути ВИДНІ, а не згаснути ─────────
{
  const s = await сцена(`#/post/feed/${POST_ID}?c=${COM_ID}`);
  await s.page.waitForTimeout(ПІД_ЗАСТАВКОЮ);
  const під = await s.page.evaluate(зняти);
  ok('5. 🔴 підсвітка не витрачається під заставкою',
     під.заставка && !під.підсвічено.length,
     `заставка: ${під.заставка ? 'видно' : 'немає'} · підсвічено: [${під.підсвічено}]`);

  await s.page.waitForTimeout(ПІСЛЯ_ЗАСТАВКИ - ПІД_ЗАСТАВКОЮ + 400);
  const після = await s.page.evaluate(зняти);
  ok('6а. після заставки застосунок стоїть на «Стрічці»',
     після.вкладка === 'shotam', `вкладка: ${після.вкладка}`);
  ok('6б. лист коментарів відкрито', після.лист, після.лист ? 'відкрито' : 'листа немає');
  ok('7. 🔴 підсвічено САМЕ той коментар, і він ще світиться',
     після.підсвічено.includes(String(COM_ID)),
     після.підсвічено.length ? `підсвічено: [${після.підсвічено}]` : 'нічого не підсвічено');
  await s.close();
}

// ── 8. Зведене «Ще N коментарів»: лист відкривається без підсвітки ───────────
{
  const s = await сцена(`#/post/feed/${POST_ID}?c=all`);
  await s.page.waitForTimeout(ПІСЛЯ_ЗАСТАВКИ + 400);
  const st = await s.page.evaluate(зняти);
  ok('8. «all» відкриває лист, але нічого не підсвічує',
     st.лист && !st.підсвічено.length, `лист: ${st.лист} · підсвічено: [${st.підсвічено}]`);
  await s.close();
}

// ── 9. Без сповіщення застосунок відкривається як завжди ────────────────────
{
  const s = await сцена('');
  await s.page.waitForTimeout(ПІСЛЯ_ЗАСТАВКИ);
  const st = await s.page.evaluate(зняти);
  ok('9. звичайний запуск нічого зайвого не відкриває',
     !st.екрани.length && !st.лист && st.вкладка === 'community',
     `вкладка: ${st.вкладка} · екрани: [${st.екрани}] · лист: ${st.лист}`);
  await s.close();
}

await site.stop();
await browser.close();
done();
