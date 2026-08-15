// tests/notif-thread-coldstart.mjs — ТАП ПО СПОВІЩЕННЮ ЧАТУ НА ХОЛОДНОМУ СТАРТІ.
// Заведено 15.08.2026 після другої скарги Вови.
//
// 🔴 ЩО ОХОРОНЯЄМО. Слова Вови: «на коментар перекидає, а коли я пишу приватне
// повідомлення… мені вибиває сповіщення, я на нього натискаю — і воно закидає
// на головну сторінку, а не на чат».
//
// 🔑 ЧОМУ СТАРИЙ СТОРОЖ (`notif-deeplink.mjs`) БУВ ЗЕЛЕНИЙ І ВСЕ ОДНО НЕ ЛОВИВ.
// Він читає ТЕКСТ файлів: сервер кладе `#/thread/<id>` · `sw.js` віддає · `app.js`
// має гілку `if (d.threadId != null)`. Усі три ланки на місці — і всі три були
// цілі. Ламалось те, чого в тексті не видно: ПОРЯДОК У ЧАСІ. `handleThreadHash()`
// зʼїдав хеш (`replaceState`) раніше, ніж `initAuth()` встигав відновити вхід, і
// `openThreadById()` виходив на першому ж рядку. Тому цей стенд — БРАУЗЕРНИЙ:
// він піднімає застосунок і дивиться, чи відкрився екран розмови.
//
// Це вже другий випадок у проєкті, коли зелений текстовий сторож стоїть над
// зламаною поведінкою (перший — іконка «Стрічка», де поріг площі проходив).
// Правило, яке з цього випливає: якщо замовлення звучить «має відкритись» —
// перевіряти треба ВІДКРИТТЯ, а не наявність рядка в коді.
//
// Контроль (доведення падінням) — версія ДО фікса, тобто коміт ПЕРЕД PR #927:
//   BUNDLE_REV=f400ad18 node tests/notif-thread-coldstart.mjs      → 3/9
// ⚠️ `origin/main` для контролю БІЛЬШЕ НЕ ГОДИТЬСЯ: фікс уже там, і контрольний
// прогін показав би 9/9, тобто «довів» би сам себе. Ревізію контролю треба
// оновлювати щоразу, коли лікування доїжджає в `main`.
// Стенд підмінює `bundle.js` вказаною ревізією з git.
import { chromium } from '@playwright/test';
import { reporter, launch, serve, blockExternal, projectFile } from './_lib.mjs';

const { ok, done } = reporter();

const REV = process.env.BUNDLE_REV || '';
const OLD_BUNDLE = REV ? projectFile('bundle.js', REV) : null;
const SRC = projectFile('src/tabs/board-chat.js', REV);

const THREAD_ID = 77;
const OTHER_THREAD_ID = 78;

// Підміна Supabase: вхід відновлюється із заданою затримкою, у людини дві розмови.
// Мережі назовні стенд не потребує — міряємо ПОРЯДОК, а не чужий сервер.
const stub = (delayMs) => `
window.__t = { sessionAt: null, t0: performance.now() };
const нитки = [
  { id: ${THREAD_ID}, author_uid: 'other', buyer_uid: 'me',
    last_message_at: '2026-08-15T10:00:00Z',
    post: { id: 5, title: 'Велосипед', text: '', category: 'Інше', photos: [], author: 'Сусід',
            contact: '', location: '', status: 'active',
            published_at: '2026-08-01T10:00:00Z', created_at: '2026-08-01T10:00:00Z' } },
  { id: ${OTHER_THREAD_ID}, author_uid: 'other2', buyer_uid: 'me',
    last_message_at: '2026-08-15T09:00:00Z',
    post: { id: 6, title: 'Пральна машина', text: '', category: 'Інше', photos: [], author: 'Інший',
            contact: '', location: '', status: 'active',
            published_at: '2026-08-01T10:00:00Z', created_at: '2026-08-01T10:00:00Z' } },
];
const рядки = { threads: нитки };
function builder(table) {
  const p = Promise.resolve({ data: рядки[table] || [], error: null });
  const chain = new Proxy(function () {}, {
    get(_t, k) {
      if (k === 'then')    return p.then.bind(p);
      if (k === 'catch')   return p.catch.bind(p);
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
        getSession: () => new Promise(r => setTimeout(() => {
          window.__t.sessionAt = performance.now() - window.__t.t0;
          r({ data: { session: { user: { id: 'me', email: 'me@example.com', user_metadata: {} } } } });
        }, ${delayMs})),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        getUser: () => Promise.resolve({ data: { user: { id: 'me' } } }),
        signOut: () => Promise.resolve({}),
      },
      from: (table) => builder(table),
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

async function відкрити({ hash = '', delay = 0, after = null }) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await blockExternal(page);
  if (OLD_BUNDLE) await page.route('**/bundle.js', r =>
    r.fulfill({ body: OLD_BUNDLE, contentType: 'text/javascript; charset=utf-8' }));
  await page.addInitScript(stub(delay));
  await page.goto(`${site.url}/index.html${hash}`, { waitUntil: 'domcontentloaded' });
  // 🔴 15.08, ДРУГА РЕДАКЦІЯ СТЕНДА. Було `waitForTimeout(900 + delay)` — і стенд
  // почервонів, щойно показову частину deep-link'а свідомо відсунули за заставку
  // (скарга Вови: «назад» показувало сторінку завантаження). Код був правий,
  // застаріло ЧИСЛО в перевірці.
  // ➡️ Тепер чекаємо ПОДІЮ, а не мілісекунди: заставка зникла з DOM. Так стенд
  // переживе будь-яку зміну її тривалості й не доведеться правити його втретє.
  await page.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 })
    .catch(() => {});
  await page.waitForTimeout(400 + delay);   // осісти після заставки
  if (after) { await after(page); await page.waitForTimeout(900); }
  const стан = await page.evaluate(() => ({
    екранів: document.querySelectorAll('.pm-screen--chat').length,
    заголовок: (document.querySelector('.pm-screen--chat .pm-head-titles')?.textContent || '').trim(),
    оголошення: (document.querySelector('.pm-screen--chat .pm-ctx')?.textContent || '').trim(),
  }));
  await ctx.close();
  return стан;
}

// ── 1. Головне: холодний старт із сповіщення відкриває САМУ розмову ──────────
const базовий = await відкрити({ hash: `#/thread/${THREAD_ID}` });
ok('1а. 🔴 тап по сповіщенню чату відкриває екран розмови, а не Громаду',
   базовий.екранів === 1,
   базовий.екранів === 0 ? 'екран чату не відкрився — людина лишилась на головній'
                         : `екранів чату: ${базовий.екранів}`);
ok('1б. відкрито САМЕ ту розмову, про яку прийшло сповіщення',
   /Велосипед/.test(базовий.оголошення),
   базовий.оголошення ? `контекст: «${базовий.оголошення.slice(0, 40)}»` : 'контексту немає');
ok('1в. екран рівно один (повторний onAuthChange не відкриває чат удруге)',
   базовий.екранів <= 1, `екранів: ${базовий.екранів}`);

// ── 2. Повільний телефон: вхід відновлюється помітно пізніше ─────────────────
// Саме цей випадок і ламався: що повільніше пристрій, то надійніше «на головну».
const повільний = await відкрити({ hash: `#/thread/${THREAD_ID}`, delay: 500 });
ok('2. 🔴 вхід відновився на 500мс пізніше — розмова однаково відкрилась',
   повільний.екранів === 1, `екранів чату: ${повільний.екранів}`);

// ── 3. Не хапаємо людину без причини ─────────────────────────────────────────
const без = await відкрити({ hash: '' });
ok('3а. без сповіщення застосунок відкривається як завжди (жодного чату)',
   без.екранів === 0, `екранів чату: ${без.екранів}`);
const чужий = await відкрити({ hash: '#/thread/999999' });
ok('3б. неіснуюча розмова нічого не відкриває і не ламає застосунок',
   чужий.екранів === 0, `екранів чату: ${чужий.екранів}`);

// ── 4. Гарячий шлях: застосунок УЖЕ відкритий, тап шле повідомлення від SW ───
// Це та гілка, яку лагодили 15.08 зранку. Перевіряємо, що вона й далі жива:
// новий відкладений намір не мав її зачепити.
const гарячий = await відкрити({
  after: page => page.evaluate((id) => {
    // Те саме, що робить sw.js у notificationclick при знайденому вікні.
    // `data` у MessageEvent лише читається, тож задаємо його конструктором.
    navigator.serviceWorker.dispatchEvent(new MessageEvent('message', {
      data: { __cstl: 'notif-click', threadId: id, groupId: null, url: null },
    }));
  }, THREAD_ID),
});
ok('4. при ВІДКРИТОМУ застосунку тап теж відкриває розмову',
   гарячий.екранів === 1, `екранів чату: ${гарячий.екранів}`);

// ── 5. Код: намір відкладається, але не назавжди ─────────────────────────────
// ⚠️ ЧЕСНО: саме протухання (15 с) стенд НЕ проганяє живцем — це коштувало б
// хвилини очікування на кожному прогоні. Перевіряємо, що межа існує і що намір
// знімається ПЕРЕД виконанням (інакше повторні `onAuthChange` відкрили б чат двічі).
ok('5а. вікно очікування входу обмежене (намір не живе вічно)',
   /PENDING_THREAD_MS\s*=\s*\d+/.test(SRC),
   /PENDING_THREAD_MS\s*=\s*(\d+)/.exec(SRC)?.[1]
     ? `межа: ${/PENDING_THREAD_MS\s*=\s*(\d+)/.exec(SRC)[1]}мс` : 'межі немає');
const знято = /_pendingThreadId\s*=\s*null;[\s\S]{0,120}?openThreadById\(id\)/.test(SRC);
ok('5б. намір знімається ПЕРЕД відкриттям (захист від подвійного чату)', знято,
   знято ? 'зняли намір → потім відкрили' : 'відкладеного наміру в коді немає');

await site.stop();
await browser.close();
done();
