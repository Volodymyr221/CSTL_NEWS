// Стенд: НОВИНИ ДОЗАВАНТАЖУЮТЬСЯ САМІ, КОЛИ ЗВ'ЯЗОК ПОВЕРНУВСЯ.
//
// 🔴 ЗАРАДИ ЧОГО (замовлення Вови 17.09, дослівно):
//   «коли я захожу в Інстаграм, і там щось не завантажує, я розумію, що воно його
//    дозавантажить коли з'явився інтернет… А в себе в додатку я не розумію, чи воно
//    зависло, чи ні. Тому нам треба, щоб воно в будь-якому випадку обновляло чи
//    дозавантажувало, коли користувач заходить в додаток, чи на якусь вкладку».
//
// 🔬 ЩО САМЕ ЛАМАЛОСЬ. `ensureNewsLoaded()` ходила по `articles.json` РІВНО ОДИН
// раз за сеанс (`if (!allArticles.length)`). Якщо той раз випав на мить без
// зв'язку, `_newsLoadFailed` лишався піднятим і віджет показував «Не вдалось
// завантажити новини» ДО КІНЦЯ СЕАНСУ — навіть коли інтернет повернувся через
// секунду. Повторного походу в мережу не існувало взагалі.
//
// 🔑 ЩО МІРЯЄМО: не наявність рядка в коді, а НАСЛІДОК НА ЕКРАНІ — чи зник блок
// збою і чи зʼявились справжні картки після події `online`. Текстова перевірка
// пропустила б випадок «слухач є, але перемальовки немає» — саме ним і була
// перша версія цієї роботи (кликала неіснуючу `renderNews()` у try/catch).
//
// ⚠️ `serviceWorkers: 'block'` — інакше запити йдуть повз `page.route`.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';

const { ok, done } = reporter('news-autoretry');
const { url, stop } = await serve();
const b = await launch(chromium);
// 🔴 `serviceWorkers: 'block'` ОБОВʼЯЗКОВИЙ. Перша версія стенда його не мала, і
// вона ЗБРЕХАЛА найтоншим способом: екран оновився, картки зʼявились — тобто всі
// «головні» перевірки зазеленіли, — але лічильник походів у мережу лишився 2→2.
// Тобто дані прийшли з кешу Service Worker, і стенд НЕ доводив, що застосунок
// справді сходив за свіжим. Дев'ятий випадок брехливої перевірки в проєкті.
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();

// Глушимо базу й погоду — сцена має бути про НОВИНИ, не про сусідів.
for (const шлях of ['**://cdn.jsdelivr.net/npm/@supabase/supabase-js**', '**/vendor/supabase-js*']) {
  await p.route(шлях, r => r.abort());
}
await p.route('**://*.supabase.co/**', r => r.abort());
await p.route('**://api.open-meteo.com/**', r => r.abort());

// 🔴 ПЕРША СПРОБА ПАДАЄ — рівно як у дорозі без зв'язку.
let мережаЖива = false;
let спробЗаНовинами = 0;
await p.route('**/data/articles.json*', route => {
  спробЗаНовинами++;
  if (!мережаЖива) return route.abort();
  return route.continue();
});

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(1600);

const збій = await p.evaluate(() => {
  const el = document.querySelector('.hm-nerr');
  return { блок: !!el, текст: el?.querySelector('.hm-nerr-tx')?.textContent.trim() || '',
           кнопка: !!document.querySelector('[data-cm-news-retry]'),
           карток: document.querySelectorAll('[data-article-id]').length };
});
ok('🔴 без зв\'язку видно ЧЕСНИЙ збій, а не «новин немає»', збій.блок && /Не вдалось/i.test(збій.текст), збій.текст);
ok('…і кнопка ручного повтору на місці', збій.кнопка);
ok('КОНТРОЛЬ: карток новин при збої справді нема', збій.карток === 0, `карток: ${збій.карток}`);
const спробДо = спробЗаНовинами;

// 🟢 ЗВ'ЯЗОК ПОВЕРНУВСЯ. Людина НІЧОГО не робить: не тапає, не перемикає вкладки,
// не згортає застосунок — саме та сцена, де двох старих приводів не вистачало.
мережаЖива = true;
await p.evaluate(() => window.dispatchEvent(new Event('online')));
await p.waitForTimeout(2500);

const після = await p.evaluate(() => ({
  блок: !!document.querySelector('.hm-nerr'),
  карток: document.querySelectorAll('[data-article-id]').length,
}));
ok('🔴 ГОЛОВНЕ: після появи мережі новини дозавантажились САМІ (без тапу)',
   після.карток > 0, `карток: ${після.карток}`);
ok('🔴 …і блок збою зник з екрана', !після.блок);
ok('🔑 по новини СПРАВДІ сходили ще раз (а не показали кеш)',
   спробЗаНовинами > спробДо, `спроб: ${спробДо} → ${спробЗаНовинами}`);

// ── ДРУГА ПОЛОВИНА ЗАМОВЛЕННЯ: «КОЛИ КОРИСТУВАЧ ЗАХОДИТЬ У ДОДАТОК» ─────────
// 🛑 Тут раніше стояла перевірка «другий online підряд не зʼївся порогом». Вона
// ЗЕЛЕНІЛА ТРИВІАЛЬНО: після вдалого повтору `newsLoadFailed()` уже false, тож
// нових походів у мережу не мало бути НІКОЛИ — 3→3 однаково зійшло б за успіх.
// Перевірка, яка не вміє впасти, нічого не стереже. Замінено на живу сцену.
//
// Сцена: людина відкрила застосунок без зв'язку, побачила збій, СХОВАЛА застосунок
// (пішла в інший), там зв'язок з'явився — і повернулась. Події `online` при цьому
// може не бути взагалі: браузер вважав мережу живою, недосяжним був сам файл.
мережаЖива = false;
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(1500);
const збій2 = await p.evaluate(() => !!document.querySelector('.hm-nerr'));
ok('КОНТРОЛЬ: після перезавантаження без зв\'язку збій знову на екрані', збій2);

мережаЖива = true;
const спробПеред3 = спробЗаНовинами;
// Ховаємо застосунок і повертаємось — саме те, що робить людина з телефоном.
await p.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
await p.waitForTimeout(300);
await p.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
await p.waitForTimeout(2500);
const після2 = await p.evaluate(() => ({
  блок: !!document.querySelector('.hm-nerr'),
  карток: document.querySelectorAll('[data-article-id]').length,
}));
ok('🔴 повернувся в застосунок — новини дозавантажились самі',
   після2.карток > 0 && !після2.блок, `карток: ${після2.карток}, блок збою: ${після2.блок}`);
ok('🔑 і по них теж СХОДИЛИ в мережу', спробЗаНовинами > спробПеред3,
   `спроб: ${спробПеред3} → ${спробЗаНовинами}`);

await b.close(); await stop();
done();
