// tests/tools/notif-exit-smooth.mjs — ПРИЛАД, а не вирок.
//
// ЗАМОВЛЕННЯ ВОВИ (15.08): «можна тепер щоб зразу з чату на громаду перекидало.
// Роби і деплой, без блимання і без ривків і глюкання».
//
// ЩО МІРЯЄМО — не «гарно/негарно», а ЧОТИРИ числа на шляху назад
// (чат → Повідомлення → Громада):
//   1) КАДРИ БЕЗ ВМІСТУ — скільки кадрів поспіль на екрані немає ні шару чатів,
//      ні застосунку. Саме це око читає як «блимнуло».
//   2) СТРИБОК ПРОКРУТКИ — `window.scrollY` до і після. Замок клавіатури
//      (`setupKeyboardResize`) ставить `body{position:fixed}` і повертає прокрутку
//      при знятті; помилка там дає видимий ривок сторінки.
//   3) ПЕРЕТІКАННЯ ТЛА — чи міняється `background-color` у `.app-main`. Фони
//      вкладок різні, а перехід стоїть 0.3с: зайве перемикання вкладки під шарами
//      дає повзучу пляму вже ПІСЛЯ того, як вміст готовий.
//   4) ЗМІНА ВКЛАДКИ — на якій вкладці людина опиняється в кінці.
//
// 🔑 Кадри знімаємо з `requestAnimationFrame` У САМІЙ СТОРІНЦІ, а не знімками
// ззовні: скріншот Playwright синхронізує рендер і показав би рівні кадри там,
// де на телефоні провал. Цей проєкт уже мав 20 брехливих мірок — ця не 21-ша.
//
// Запуск:  node tests/tools/notif-exit-smooth.mjs
import { chromium } from '@playwright/test';
import { launch, serve, blockExternal, projectFile } from '../_lib.mjs';

// Порівняння «до/після»: BUNDLE_REV=<git-ish> node tests/tools/notif-exit-smooth.mjs
const REV = process.env.BUNDLE_REV || '';
const OLD_BUNDLE = REV ? projectFile('bundle.js', REV) : null;

const THREAD_ID = 77;

const stub = `
const нитки = [
  { id: ${THREAD_ID}, author_uid: 'other', buyer_uid: 'me', last_message_at: '2026-08-15T10:00:00Z',
    post: { id: 5, title: 'Продам будинок', text: '', category: 'Інше', photos: [], author: 'Олександр',
            contact: '', location: 'Жорнище', status: 'active',
            published_at: '2026-08-01T10:00:00Z', created_at: '2026-08-01T10:00:00Z' } },
  { id: 78, author_uid: 'other2', buyer_uid: 'me', last_message_at: '2026-08-15T09:00:00Z',
    post: { id: 6, title: 'Пральна машина', text: '', category: 'Інше', photos: [], author: 'Інший',
            contact: '', location: '', status: 'active',
            published_at: '2026-08-01T10:00:00Z', created_at: '2026-08-01T10:00:00Z' } },
];
const рядки = { threads: нитки };
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

// Знімач кадрів усередині сторінки.
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
    const шарів = [...document.querySelectorAll('.pm-screen')].filter(видно).length;
    window.__кадри.push({
      шарів,
      таббар: видно(document.querySelector('.tab-item')),
      вкладка: main ? main.dataset.tab : '—',
      тло: main ? getComputedStyle(main).backgroundColor : '',
      scrollY: Math.round(window.scrollY),
      t: Math.round(performance.now()),
    });
    requestAnimationFrame(крок);
  };
  requestAnimationFrame(крок);
  return () => { йде = false; };
};
`;

const browser = await launch(chromium);
const site = await serve();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await blockExternal(page);
if (OLD_BUNDLE) await page.route('**/bundle.js', r =>
  r.fulfill({ body: OLD_BUNDLE, contentType: 'text/javascript; charset=utf-8' }));
await page.addInitScript(stub);

console.log(`🔬 ПЛАВНІСТЬ ВИХОДУ: чат → Повідомлення → Громада${REV ? '   [версія ' + REV + ']' : ''}\n`);

await page.goto(`${site.url}/index.html#/thread/${THREAD_ID}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(600);

await page.evaluate(() => { window.__стоп = window.__почати(); });
await page.goBack();                 // чат → Повідомлення
await page.waitForTimeout(700);
await page.goBack();                 // Повідомлення → застосунок
await page.waitForTimeout(900);
const кадри = await page.evaluate(() => { window.__стоп?.(); return window.__кадри; });

// ── Розбір ───────────────────────────────────────────────────────────────────
const пустий = k => k.шарів === 0 && !k.таббар;
const порожні = кадри.filter(пустий);
let найдовша = 0, поточна = 0;
for (const k of кадри) {
  if (пустий(k)) { поточна++; if (поточна > найдовша) найдовша = поточна; }
  else поточна = 0;
}
const тла = [...new Set(кадри.map(k => k.тло))];
const вкладки = [...new Set(кадри.map(k => k.вкладка))];
const скроли = [...new Set(кадри.map(k => k.scrollY))];

console.log(`   кадрів знято:            ${кадри.length}`);
console.log(`   КАДРІВ БЕЗ ВМІСТУ:       ${порожні.length}   (найдовший поспіль: ${найдовша})`);
console.log(`   тло .app-main:           ${тла.length} значень → ${тла.join(' · ')}`);
console.log(`   вкладка по дорозі:       ${вкладки.join(' → ')}`);
console.log(`   стрибок прокрутки:       ${скроли.length === 1 ? 'немає (scrollY ' + скроли[0] + ')' : 'Є: ' + скроли.join(' → ')}`);
console.log(`   шарів у кінці:           ${кадри[кадри.length - 1].шарів}`);
console.log(`   вкладка в кінці:         ${кадри[кадри.length - 1].вкладка}`);

console.log('\n   🔑 Як читати: «кадрів без вмісту» > 0 — це і є блим. Кілька значень тла');
console.log('      = фон перетікає під готовим вмістом. Різні scrollY = ривок сторінки.\n');

await ctx.close();
await site.stop();
await browser.close();
