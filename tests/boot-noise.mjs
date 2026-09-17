// Стенд: ЖУРНАЛ ЗБОЇВ МАЄ БУТИ СПИСКОМ ВАД, А НЕ СПИСКОМ ШУМУ.
//
// 🔴 ЗАРАДИ ЧОГО ВІН ІСНУЄ (17.09). На екрані «Аналітика» у Вови за 30 днів
// стояло чотири активні помилки. Дві з них були не вадами застосунку:
//
//   1. `promise: Failed to update a ServiceWorker… Operation has been aborted`
//      `registration.update()` повертає обіцянку, і жоден із трьох викликів у
//      `boot.js` її не ловив. Людина згортає застосунок рівно в мить перевірки
//      оновлення — браузер обриває запит, обіцянка падає, і вона летить у
//      `unhandledrejection`, тобто В ЖУРНАЛ ВАД. Це штатний хід подій.
//
//   2. `error: Script error.` `:0:0` — так стандарт велить браузеру позначати
//      збій у ЧУЖОМУ скрипті (у нас GoatCounter): ні тексту, ні файлу, ні рядка.
//      Діяти по такому запису неможливо за будовою: єдиний спосіб побачити текст
//      — `crossorigin` на чужому скрипті, а це заборонено (`NOW.md` → НЕ ЧІПАТИ:
//      аналітика мовчки помре).
//
// 🛑 ЧОМУ ЦЕ ВАРТО ЛІКУВАТИ, А НЕ ПРОСТО «НЕ ЗВЕРТАТИ УВАГИ». У `reportJsError`
// стоїть запобіжник: НЕ БІЛЬШЕ 5 ПОДІЙ ЗА СЕАНС. Тобто шум не просто заважав
// читати — він ВИТІСНЯВ зі стелі те, що ми можемо полагодити.
//
// 🔑 ЩО МІРЯЄМО — НАСЛІДОК, А НЕ ТЕКСТ КОДУ: що саме доїхало в базу (заглушка
// записує вставки в `window.__cstlInserted`) і що долетіло в `unhandledrejection`.
// Текстова перевірка «чи є .catch» не побачила б, що ловиться не та обіцянка.
//
// ⚠️ ГОЛОВНА ПЕРЕВІРКА ТУТ — ТРЕТЯ: справжня помилка В ЖУРНАЛ ПОТРАПЛЯЄ. Фільтр,
// який глушить зайве, небезпечніший за шум: мовчазний журнал виглядає як здоровий
// застосунок. Без цієї перевірки стенд заохочував би глушити все підряд.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();

await mockSupabase(p, { pages: [], page_posts: [], posts: [] });
await p.route('**://api.open-meteo.com/**', r => r.abort());

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);
// Згода на статистику — без неї `logEvent` мовчить, і стенд зеленів би дарма.
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(400);

const записиЖурналу = () => p.evaluate(() => (window.__cstlInserted || [])
  .filter(r => r.table === 'analytics_events' && r.row?.event_type === 'js_error')
  .map(r => r.row?.meta?.msg || ''));

const скинути = () => p.evaluate(() => { window.__cstlInserted = []; });

// ── 1. КОНТРОЛЬ ПЕРШОГО ПОРЯДКУ: журнал узагалі працює ─────────────────────
// Спершу доводимо, що прилад живий. Інакше «шуму немає» означало б лише
// «ми нічого не бачимо» — рівно та брехня, від якої весь цей файл.
await скинути();
await p.evaluate(() => window.dispatchEvent(new ErrorEvent('error', {
  message: 'Тестова справжня помилка застосунку', filename: 'bundle.js',
  lineno: 42, colno: 7,
})));
await p.waitForTimeout(400);
const справжня = await записиЖурналу();
ok('контроль: справжня помилка З ФАЙЛОМ І РЯДКОМ доїжджає в журнал',
   справжня.some(m => /Тестова справжня/.test(m)), справжня.join(' · ') || '(порожньо)');

// ── 2. ШУМ №1: `Script error.` без файлу і рядка ───────────────────────────
await скинути();
await p.evaluate(() => window.dispatchEvent(new ErrorEvent('error', {
  message: 'Script error.', filename: '', lineno: 0, colno: 0,
})));
await p.waitForTimeout(400);
const шум = await записиЖурналу();
ok('🔴 `Script error.` без файлу і рядка В ЖУРНАЛ НЕ ПОТРАПЛЯЄ',
   шум.length === 0, шум.join(' · ') || 'записів немає');

// ── 3. А ОСЬ ТАКА Ж ПОМИЛКА З АДРЕСОЮ — ПОТРАПЛЯЄ ──────────────────────────
// Межа фільтра має бути вузькою. Якби глушилось усе зі словами «Script error»,
// ми б осліпли на справжній збій у нашому ж коді з таким текстом.
await скинути();
await p.evaluate(() => window.dispatchEvent(new ErrorEvent('error', {
  message: 'Script error.', filename: 'bundle.js', lineno: 900, colno: 1,
})));
await p.waitForTimeout(400);
const зАдресою = await записиЖурналу();
ok('🔴 фільтр ВУЗЬКИЙ: той самий текст, але з файлом і рядком — у журналі',
   зАдресою.length === 1, зАдресою.join(' · ') || '(порожньо — фільтр занадто широкий)');

// ── 4. ШУМ №2: обірвана перевірка оновлення Service Worker ─────────────────
// Відтворюємо саме те, що буває в людини: обіцянка `registration.update()`
// падає, бо браузер обірвав операцію. Міряємо не код, а те, чи долетіло це до
// `unhandledrejection` — тобто до журналу.
// 🔑 Підміняємо реєстрацію, а не мережу: браузер без живого SW не дасть
//    відтворити обрив, а сцена має бути однаковою на будь-якій машині.
const впало = await p.evaluate(async () => {
  let спіймано = 0;
  const h = () => { спіймано++; };
  window.addEventListener('unhandledrejection', h);
  // Точна копія того, як `boot.js` кличе перевірку оновлення.
  const reg = { update: () => Promise.reject(new DOMException('Operation has been aborted', 'AbortError')) };
  try { reg.update()?.catch(() => {}); } catch (_) {}
  await new Promise(r => setTimeout(r, 300));
  window.removeEventListener('unhandledrejection', h);
  return спіймано;
});
ok('🔴 обірвана перевірка оновлення SW не летить у `unhandledrejection`',
   впало === 0, `спіймано: ${впало}`);

// ── 5. КОНТРОЛЬ: без `catch` та сама обіцянка ДОЛІТАЄ ──────────────────────
// Доводить, що четверта перевірка вміє червоніти, а не просто «нічого не буває».
const безCatch = await p.evaluate(async () => {
  let спіймано = 0;
  const h = () => { спіймано++; };
  window.addEventListener('unhandledrejection', h);
  const reg = { update: () => Promise.reject(new DOMException('Operation has been aborted', 'AbortError')) };
  try { reg.update(); } catch (_) {}
  await new Promise(r => setTimeout(r, 300));
  window.removeEventListener('unhandledrejection', h);
  return спіймано;
});
ok('контроль: та сама обіцянка БЕЗ catch справді долітає', безCatch === 1, `спіймано: ${безCatch}`);

// ── 6. І ВЖЕ ПОТІМ — ЧИ СТОЇТЬ `catch` НА ВСІХ ТРЬОХ ВИКЛИКАХ У КОДІ ───────
// Перевірки 4-5 доводять ПРАВИЛО; цей рядок стежить, щоб правило не обійшли в
// одному з трьох місць. Сам по собі він нічого не довів би — тому стоїть останнім.
// ⚠️ КОМЕНТАРІ ЗНІМАЄМО ПЕРШИМ. Перша редакція цього рядка червоніла на
// ВЛАСНІЙ ПОЯСНЮВАЛЬНІЙ КОМЕНТАР у `boot.js`, де згадано `registration.update()`.
// Це й є вада текстових сторожів у чистому вигляді: вони не відрізняють код від розмови про код.
const boot = (await import('fs')).readFileSync(new URL('../src/core/boot.js', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const голіОновлення = boot.match(/\.update\(\)(?!\s*\??\.catch)/g) || [];
ok('🔴 у boot.js не лишилось виклику update() без catch',
   голіОновлення.length === 0, голіОновлення.join(' · ') || 'усі під catch');

await b.close(); await stop();
done();
