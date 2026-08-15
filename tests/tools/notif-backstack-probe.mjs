// tests/tools/notif-backstack-probe.mjs — ПРИЛАД, а не вирок.
//
// СКАРГА ВОВИ (15.08, два знімки): тап по сповіщенню чату відкриває саму розмову
// («це круто працює»), але **назад іти нікуди**: «воно мені вибиває сторінку
// завантаження і пусту сторінку, ніби немає під цим нічого. А воно має
// перекидати мене назад в усі повідомлення, і звідти в застосунок, у Дошку».
//
// ЩО МІРЯЄМО, по кроках:
//   0) що на екрані одразу після тапу (чи стоїть заставка `#splash` ПІД чатом);
//   1) що лишається після ПЕРШОГО «назад»;
//   2) що лишається після ДРУГОГО «назад».
//
// 🔑 Заставка живе 3.5с + 0.4с згасання (`app.js`, кінець `init()`), а розмова
// відкривається за ~0.5с. Тобто перші ~3.5 секунди під чатом лежить НЕ застосунок,
// а заставка — і саме її видно, коли людина одразу свайпає назад.
//
// Друкуємо СТАН ЕКРАНА і довжину історії, а не «ок/не ок».
//
// Запуск:  node tests/tools/notif-backstack-probe.mjs [затримка_перед_назад_мс]
import { chromium } from '@playwright/test';
import { launch, serve, blockExternal } from '../_lib.mjs';

// Скільки чекаємо, перш ніж тиснути «назад». За замовчуванням 4600мс — це вже
// ПІСЛЯ заставки (3.5с показу + 0.4с згасання), тобто мить, коли людина справді
// бачить розмову. Передай менше число, щоб подивитись на стан під заставкою.
const ЧЕКАТИ = Number(process.argv[2] || 4600);
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
window.__initCount = 0;
document.addEventListener('DOMContentLoaded', () => { window.__initCount++; });
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
`;

const зняти = () => {
  const видно = (el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const splash = document.getElementById('splash');
  const екрани = [...document.querySelectorAll('.pm-screen')].filter(видно)
    .map(e => [...e.classList].find(c => c.startsWith('pm-screen--')) || 'pm-screen');
  return {
    заставка: видно(splash) ? 'ВИДНО' : (splash ? 'є, але прозора' : 'немає'),
    екрани,
    вкладка: document.querySelector('.app-main')?.dataset.tab || '—',
    стан: JSON.stringify(history.state),
    історія: history.length,
    ініціалізацій: window.__initCount ?? '?',
  };
};

const browser = await launch(chromium);
const site = await serve();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await blockExternal(page);
await page.addInitScript(stub);

console.log('🔬 КУДИ ВЕДЕ «НАЗАД» ПІСЛЯ ТАПУ ПО СПОВІЩЕННЮ ЧАТУ\n');

await page.goto(`${site.url}/index.html#/thread/${THREAD_ID}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(ЧЕКАТИ);
console.log(`   0. одразу після тапу (через ${ЧЕКАТИ}мс):`, JSON.stringify(await page.evaluate(зняти)));

for (let i = 1; i <= 4; i++) {
  await page.goBack().catch(() => {});
  await page.waitForTimeout(500);
  const ст = await page.evaluate(зняти).catch(() => null);
  const url = page.url();
  console.log(`   ${i}. після «назад» №${i}:`.padEnd(34),
    ст ? JSON.stringify(ст) : '— сторінку покинуто',
    `\n      url: ${url.length > 70 ? '…' + url.slice(-60) : url}`);
}

console.log('\n   🔑 Чого хоче Вова: 0 = чат · 1 = Повідомлення · 2 = застосунок на Дошці.');
console.log('      «заставка: ВИДНО» на кроці 1 і є тією «сторінкою завантаження» зі знімка.\n');

await ctx.close();
await site.stop();
await browser.close();
