// tests/tools/notif-thread-probe.mjs — ПРИЛАД, а не вирок.
//
// ПИТАННЯ ВОВИ (15.08, після деплою #4310): «на коментар перекидає, а коли
// приходить приватне повідомлення і я тапаю по сповіщенню — закидає на головну
// сторінку, а не в чат».
//
// ЩО МІРЯЄМО. Тап по сповіщенню чату на ХОЛОДНОМУ старті: `sw.js` відкриває
// вікно на `./#/thread/<id>`, а `app.js` у `init()` кличе `handleThreadHash()`.
// Той кличе `openThreadById()`, у якого перший рядок — `if (!isLoggedIn()) return`.
//
// 🔑 Сесія входу відновлюється АСИНХРОННО (`await supa.auth.getSession()`), і
// `initAuth()` в `init()` НЕ дочікується. Тобто питання одне: чи встигає сесія
// відновитись до моменту, коли хеш розбирається?
//
// ЯК ЧИТАЄМО ВІДПОВІДЬ. Пройти повз `isLoggedIn()` можна лише в один спосіб —
// одразу після цього `openThreadById()` кличе `fetchMyThreads()`, тобто запит
// `from('threads')`. Тому лічильник таких запитів і є виміром:
//   0 запитів → застосунок навіть не спробував відкрити розмову (людина лишилась
//               на Громаді — рівно скарга Вови);
//   1+ запит  → спробував.
// Друкуємо ЧИСЛО і час, а не «ок/не ок»: прилад мусить показувати вимір.
//
// Supabase підмінений: `window.supabase.createClient` перехоплено до завантаження
// збірки, тож затримку відновлення сесії задаємо самі й міряємо ПРИЧИНУ, а не
// швидкість чужого сервера.
//
// Запуск:  node tests/tools/notif-thread-probe.mjs [затримка_мс ...]
import { chromium } from '@playwright/test';
import { launch, serve, blockExternal } from '../_lib.mjs';

const DELAYS = process.argv.slice(2).map(Number).filter(n => !Number.isNaN(n));
const CASES = DELAYS.length ? DELAYS : [0, 30, 120, 400];
const THREAD_ID = 77;

// Підміна Supabase: усе, чого торкається шлях «відкрий розмову за номером».
const stub = (delayMs, threadId) => `
window.__probe = { threadQueries: 0, firstThreadQueryAt: null, sessionAt: null,
                   hashEatenAt: null, hashEaten: null, t0: performance.now() };
// 🔑 ГОЛОВНИЙ ЗАМІР: коли саме хеш зʼїли. handleThreadHash() першою дією робить
// replaceState — тобто СПОЖИВАЄ посилання. Якщо це сталось раніше, ніж відновилась
// сесія, відкрити розмову вже нічим: посилання зникло, а isLoggedIn() був false.
// (Зворотних лапок у цьому рядку бути не може — він живе всередині шаблонного рядка.)
{
  const orig = history.replaceState.bind(history);
  history.replaceState = function (...a) {
    if (location.hash && window.__probe.hashEatenAt == null) {
      window.__probe.hashEatenAt = performance.now() - window.__probe.t0;
      window.__probe.hashEaten = location.hash;
    }
    return orig(...a);
  };
}
const rows = {
  threads: [{ id: ${threadId}, author_uid: 'other', buyer_uid: 'me',
              last_message_at: new Date().toISOString(),
              post: { id: 5, title: 'Велосипед', text: '', category: 'Інше', photos: [],
                      author: 'Сусід', contact: '', location: '', status: 'active',
                      published_at: new Date().toISOString(), created_at: new Date().toISOString() } }],
};
function builder(table) {
  const res = { data: rows[table] || [], error: null };
  const p = Promise.resolve(res);
  const chain = new Proxy(function () {}, {
    get(_t, k) {
      if (k === 'then')    return p.then.bind(p);
      if (k === 'catch')   return p.catch.bind(p);
      if (k === 'finally') return p.finally.bind(p);
      if (k === 'maybeSingle' || k === 'single') return () => Promise.resolve({ data: (rows[table] || [])[0] || null, error: null });
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
        // 🔑 ОСЬ ЗМІННА ДОСЛІДУ: скільки триває відновлення сесії.
        getSession: () => new Promise(r => setTimeout(() => {
          window.__probe.sessionAt = performance.now() - window.__probe.t0;
          r({ data: { session: { user: { id: 'me', email: 'me@example.com', user_metadata: {} } } } });
        }, ${delayMs})),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        getUser: () => Promise.resolve({ data: { user: { id: 'me' } } }),
        signOut: () => Promise.resolve({}),
      },
      from(table) {
        if (table === 'threads') {
          window.__probe.threadQueries++;
          if (window.__probe.firstThreadQueryAt == null)
            window.__probe.firstThreadQueryAt = performance.now() - window.__probe.t0;
        }
        return builder(table);
      },
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

const browser = await launch(chromium);
const site = await serve();

console.log('🔬 ТАП ПО СПОВІЩЕННЮ ЧАТУ — ХОЛОДНИЙ СТАРТ\n');
console.log('   Питання: чи встигає сесія входу відновитись до розбору #/thread/<id>?\n');

for (const delay of CASES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await blockExternal(page);
  await page.addInitScript(stub(delay, THREAD_ID));
  await page.goto(`${site.url}/index.html#/thread/${THREAD_ID}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);   // з великим запасом на всі затримки досліду

  const p = await page.evaluate(() => window.__probe);
  const chatOpen = await page.evaluate(() => !!document.querySelector('.pm-screen--chat'));

  const ms = v => (v == null ? '—' : Math.round(v) + 'мс');
  const late = p.hashEatenAt != null && p.sessionAt != null && p.hashEatenAt < p.sessionAt;
  console.log(`   затримка сесії ${String(delay).padStart(4)}мс` +
    ` │ хеш зʼїдено на ${ms(p.hashEatenAt).padStart(6)} ("${p.hashEaten || '—'}")` +
    ` │ сесія готова на ${ms(p.sessionAt).padStart(6)}` +
    ` │ ЕКРАН ЧАТУ: ${chatOpen ? '✅ відкрито' : '❌ НЕ ВІДКРИТО'}`);
  console.log(`      ${late ? '🔴 хеш спожито РАНІШЕ, ніж зʼявився вхід' : 'хеш спожито після входу'}` +
    ` · запитів threads усього: ${p.threadQueries} (з них частина — бейдж непрочитаних, не наш шлях)`);
  await ctx.close();
}

console.log('\n   🔑 ЯК ЧИТАТИ. «Хеш зʼїдено» раніше за «сесія готова» — це нормально й');
console.log('      незмінно: `init()` не чекає на `initAuth()`. Питання лише в тому, що');
console.log('      сталося з наміром далі:');
console.log('        ЕКРАН ЧАТУ ❌ → намір ВТРАЧЕНО (стан до фікса 15.08: `openThreadById()`');
console.log('                        виходив на `if (!isLoggedIn()) return`, людина лишалась');
console.log('                        на Громаді — рівно скарга Вови);');
console.log('        ЕКРАН ЧАТУ ✅ → намір ВІДКЛАДЕНО і доведено до кінця, щойно зʼявився вхід.\n');

await site.stop();
await browser.close();
