// tests/tools/notif-journey-frames.mjs — ПРИЛАД, а не вирок.
//
// ЗАМОВЛЕННЯ ВОВИ (15.08, повторено двічі): «без ривків і щоб не блимали сторінки
// і не глючили».
//
// Попередній прилад міряв ЛИШЕ вихід (чат → Повідомлення → Громада) і показав
// нуль. Цього мало: «блимає» може бути в будь-якій ланці шляху, а не тільки там,
// куди я подивився. Тут міряється ВЕСЬ шлях сповіщення, кадр за кадром.
//
// ЩО ЛОВИМО (усе — числами, по кадрах з requestAnimationFrame У САМІЙ СТОРІНЦІ;
// знімок ззовні синхронізує рендер і показав би рівні кадри там, де на телефоні
// провал — цей проєкт має 20 задокументованих випадків брехливої мірки):
//
//   1) ПОРОЖНІЙ ЕКРАН — кадр, у якому немає ні шару чатів, ні застосунку.
//   2) ПОРОЖНІЙ СПИСОК — шар «Повідомлення» видно, а рядків у ньому нуль.
//      Саме так виглядає «блимнула сторінка»: коробка приїхала, вміст — ні.
//   3) НЕНАМАЛЬОВАНІ ФОТО — рядки списку є, а жодного завантаженого аватара нема.
//      Той самий клас вади, що ловив `tab-return-repaint` у «Стрічці».
//   4) ПЕРЕТІКАННЯ ТЛА — кілька значень `background-color` у `.app-main`.
//   5) СТРИБОК ПРОКРУТКИ — різні `scrollY` (замок клавіатури знімає body{fixed}).
//   6) СТРИБОК ГЕОМЕТРІЇ — верх видимого шару скаче більш ніж на 1px поза
//      власною анімацією виїзду (ривок під пальцем).
//
// Запуск:  node tests/tools/notif-journey-frames.mjs
//   порівняння: BUNDLE_REV=<git-ish> node tests/tools/notif-journey-frames.mjs
import { chromium } from '@playwright/test';
import { launch, serve, blockExternal, projectFile } from '../_lib.mjs';

const REV = process.env.BUNDLE_REV || '';
const OLD_BUNDLE = REV ? projectFile('bundle.js', REV) : null;

const THREAD_ID = 77;
const POST_ID   = 501;
const COM_ID    = 9001;

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
  ],
  messages: [
    { id: 1, thread_id: ${THREAD_ID}, sender_uid: 'other', text: 'Продаєте будинок?',
      photo_url: null, created_at: '2026-08-15T10:00:00Z', reply_to_id: null, deleted_at: null },
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
    const main   = document.querySelector('.app-main');
    const шари   = [...document.querySelectorAll('.pm-screen')].filter(видно);
    const список = шари.find(e => e.classList.contains('pm-screen--list'));
    const рядків = список ? список.querySelectorAll('.pm-thread, .pm-row, [data-thread]').length : -1;
    const фото   = список ? [...список.querySelectorAll('img')] : [];
    window.__кадри.push({
      шарів:  шари.length,
      верх:   шари.length ? Math.round(шари[шари.length - 1].getBoundingClientRect().top) : null,
      список: !!список,
      рядків,
      фотоВсього:   фото.length,
      фотоГотових:  фото.filter(i => i.complete && i.naturalWidth > 0).length,
      таббар: видно(document.querySelector('.tab-item')),
      лист:   видно(document.querySelector('.fd-com-sheet')),
      тло:    main ? getComputedStyle(main).backgroundColor : '',
      scrollY: Math.round(window.scrollY),
    });
    requestAnimationFrame(крок);
  };
  requestAnimationFrame(крок);
  return () => { йде = false; };
};
`;

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

function розбір(назва, кадри) {
  const порожній  = k => k.шарів === 0 && !k.таббар && !k.лист;
  const списокПуст = k => k.список && k.рядків === 0;
  const фотоНемає  = k => k.список && k.фотоВсього > 0 && k.фотоГотових === 0;
  const тла    = [...new Set(кадри.map(k => k.тло))].filter(Boolean);
  const скроли = [...new Set(кадри.map(k => k.scrollY))];
  // Ривок геометрії: верх шару стрибнув більш ніж на 40px між сусідніми кадрами
  // ПІСЛЯ того, як він уже стояв на місці (тобто не власний виїзд).
  let ривків = 0;
  for (let i = 2; i < кадри.length; i++) {
    const a = кадри[i - 2], b = кадри[i - 1], c = кадри[i];
    if (a.верх == null || b.верх == null || c.верх == null) continue;
    if (Math.abs(a.верх - b.верх) <= 1 && Math.abs(c.верх - b.верх) > 40) ривків++;
  }
  console.log(`\n   ── ${назва} ──`);
  console.log(`   кадрів:                  ${кадри.length}`);
  console.log(`   порожній екран:          ${кадри.filter(порожній).length}`);
  console.log(`   список без рядків:       ${кадри.filter(списокПуст).length}`);
  console.log(`   список без жодного фото: ${кадри.filter(фотоНемає).length}`);
  console.log(`   значень тла:             ${тла.length}  ${тла.join(' · ')}`);
  console.log(`   стрибок прокрутки:       ${скроли.length === 1 ? 'немає' : 'Є: ' + скроли.join(' → ')}`);
  console.log(`   ривків геометрії:        ${ривків}`);
}

console.log(`🔬 ВЕСЬ ШЛЯХ СПОВІЩЕННЯ, КАДР ЗА КАДРОМ${REV ? '   [версія ' + REV + ']' : ''}`);

// ── А. Чат: відкриття + два «назад» ─────────────────────────────────────────
{
  const s = await сцена(`#/thread/${THREAD_ID}`);
  await s.page.waitForTimeout(2500);                       // ще під заставкою
  await s.page.evaluate(() => { window.__стоп = window.__почати(); });
  await s.page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 }).catch(() => {});
  await s.page.waitForTimeout(900);                        // чат виїхав
  await s.page.goBack();  await s.page.waitForTimeout(700);   // → Повідомлення
  await s.page.goBack();  await s.page.waitForTimeout(900);   // → Громада
  const кадри = await s.page.evaluate(() => { window.__стоп?.(); return window.__кадри; });
  розбір('ЧАТ: заставка → чат → Повідомлення → Громада', кадри);
  await s.close();
}

// ── Б. Коментар: відкриття листа + підсвітка ────────────────────────────────
{
  const s = await сцена(`#/post/feed/${POST_ID}?c=${COM_ID}`);
  await s.page.waitForTimeout(2500);
  await s.page.evaluate(() => { window.__стоп = window.__почати(); });
  await s.page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 }).catch(() => {});
  await s.page.waitForTimeout(1800);
  const кадри = await s.page.evaluate(() => { window.__стоп?.(); return window.__кадри; });
  розбір('КОМЕНТАР: заставка → Стрічка → пост → лист', кадри);
  await s.close();
}

console.log('\n   🔑 Будь-яке число > 0 у перших чотирьох рядках — це те, що око читає');
console.log('      як «блимнуло» або «глюкнуло». Нулі = шлях чистий.\n');

await site.stop();
await browser.close();
