// Стенд: ЗБІЙ ЗАЛИШАЄ СЛІД. Два контури діагностики, заведені 22.08.
//
// 🔴 НАВІЩО. 20.08 міграція RLS мовчки зламала КОЖЕН коментар Стрічки, і дві доби
// про це не знав ніхто: людина бачила «Коментар не надіслано», а до нас не
// долітало нічого. Дізнались випадково — Вова спробував із другого акаунта і
// надіслав знімок. Слова Вови: «це такі речі які будуть траплятись в
// користувачів, це проблема тому що ми це не зможемо побачити».
//
// 🔑 СТОРОЖ МІРЯЄ НАСЛІДОК, А НЕ ФОРМУ. Перевірити «чи стоїть слухач помилок»
// було б рівно тією вадою, через яку баг і прожив дві доби: `visibility-model`
// перевіряв, що політика написана правильними словами, і не перевіряв, чи можна
// після цього написати коментар. Тому тут кидається СПРАВЖНЯ помилка в живому
// застосунку, і перевіряється, що в базу пішов рядок.
//
// 🛑 ЧОГО ЦЕЙ СТОРОЖ НЕ ДОВОДИТЬ (і що треба знати, щоб не почуватись у безпеці):
//   • що подія доїхала до СПРАВЖНЬОЇ бази — тут заглушка, мережі немає;
//   • що ми побачимо «мовчазний провал» — коли нічого не впало, просто нічого не
//     сталося. Саме таким був баг капсули на дописі ШІ-агента того ж дня. Жоден
//     журнал такого не ловить: ловлять стенди й живі люди.
import { chromium } from 'playwright';
import { chromiumPath, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const REV = process.env.BUNDLE_REV || '';

async function сцена() {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  await mockSupabase(p, { posts: [], profiles: [], comments: [], threads: [],
                          messages: [], thread_user_state: [] });
  if (REV) {
    const body = projectFile('bundle.js', REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
  }
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector('.consent-ok,[data-consent-ok],.consent-accept')?.click());
  await p.waitForTimeout(500);
  return { ctx, p };
}

// Що застосунок надіслав у `analytics_events` за час сцени.
const події = (p, тип) => p.evaluate((t) => (window.__cstlInserted || [])
  .filter(r => r.table === 'analytics_events' && r.row && r.row.event_type === t)
  .map(r => r.row), тип);

// ── 1. ПОМИЛКА ЗАСТОСУНКУ ДОЛІТАЄ ──────────────────────────────────────────
{
  const s = await сцена();
  // Справжня помилка виконання, не підроблена подія: саме так виглядає «натиснув
  // — і нічого» з боку людини.
  await s.p.evaluate(() => { setTimeout(() => { window.__нема.поле = 1; }, 0); });
  await s.p.waitForTimeout(900);

  const list = await події(s.p, 'js_error');
  ok('🔴 помилка застосунку залишає слід у журналі', list.length >= 1, `подій: ${list.length}`);
  ok('🔴 у сліді є текст помилки', !!(list[0] && list[0].meta && list[0].meta.msg),
     list[0] ? String(list[0].meta.msg).slice(0, 60) : '(немає)');
  ok('🔴 і місце, де впало (файл:рядок)', !!(list[0] && list[0].meta && list[0].meta.at),
     list[0] ? String(list[0].meta.at) : '(немає)');
  await s.ctx.close();
}

// ── 1б. НАЗВА ФАЙЛУ СПРАВДІ ЗАПИСУЄТЬСЯ ────────────────────────────────────
// ⚠️ Перевірка вище проходить і з ПОРОЖНЬОЮ назвою файлу («:1:47»), бо помилка,
// кинута через evaluate, джерела не має. У проді без назви файлу слід каже «щось
// зламалось» і не каже ДЕ — тобто половина користі зникає мовчки. Тому окрема
// сцена: помилка з НАСПРАВЖНЬОГО скрипта.
{
  const s = await сцена();
  await s.p.evaluate(() => {
    const el = document.createElement('script');
    el.src = 'data:text/javascript,window.__зламане.поле=1';
    document.head.appendChild(el);
  });
  await s.p.waitForTimeout(900);
  const list = await події(s.p, 'js_error');
  const місце = list[0] && list[0].meta && String(list[0].meta.at || '');
  ok('🔴 у сліді є НЕПОРОЖНЯ назва файлу, а не лише рядок',
     !!місце && !місце.startsWith(':'), місце || '(немає)');
  // ⚠️ Вміст сторінки в слід потрапити не сміє — це журнал поломок, не журнал людей.
  const підозріле = JSON.stringify(list).match(/[а-яїєі]{12,}/i);
  ok('🛑 у сліді немає тексту з екрана (журнал поломок ≠ журнал людей)',
     !підозріле, підозріле ? підозріле[0] : 'чисто');
  await s.ctx.close();
}

// ── 2. ЗАПОБІЖНИК ВІД ПОТОПУ ────────────────────────────────────────────────
// 🔑 Одна зламана функція в циклі перемальовки здатна кинути сотні однакових
// помилок за секунду. Без стелі така подія залила б таблицю і сховала решту
// сигналів — тобто діагностика вбила б саму себе.
{
  const s = await сцена();
  await s.p.evaluate(() => {
    for (let i = 0; i < 40; i++) setTimeout(() => { window.__нема.поле = 1; }, 0);
  });
  await s.p.waitForTimeout(1200);
  const list = await події(s.p, 'js_error');
  ok('🔴 40 однакових помилок не заливають журнал', list.length <= 5, `подій: ${list.length}`);
  ok('🔴 однакова помилка пишеться РАЗ (нам треба ЩО, а не скільки разів)',
     list.length === 1, `подій: ${list.length}`);
  await s.ctx.close();
}

// ── 3. РІЗНІ ПОМИЛКИ — РІЗНІ СЛІДИ ─────────────────────────────────────────
// Дедуплікація не сміє з'їдати ДРУГУ, іншу поломку: інакше ми побачили б лише
// найпершу за сеанс і вважали б, що більше нічого не ламалось.
{
  const s = await сцена();
  await s.p.evaluate(() => {
    setTimeout(() => { window.__першаВада.x = 1; }, 0);
    setTimeout(() => { window.__другаВада.y = 2; }, 30);
    // Обіцянка, що впала без обробника — найтихіша поломка: на екрані просто
    // нічого не відбувається.
    setTimeout(() => { Promise.reject(new Error('третя вада')); }, 60);
  });
  await s.p.waitForTimeout(1200);
  const list = await події(s.p, 'js_error');
  ok('🔴 три різні поломки дають три сліди', list.length === 3, `подій: ${list.length}`);
  ok('🔴 серед них є впала обіцянка (unhandledrejection)',
     list.some(r => r.meta && r.meta.kind === 'promise'),
     list.map(r => r.meta && r.meta.kind).join(','));
  await s.ctx.close();
}

// ── 4. ВИМИКАЧ СТАТИСТИКИ ГЛУШИТЬ І ДІАГНОСТИКУ ────────────────────────────
// 🔑 Правова підстава обробки в нас — ЗГОДА (правило 14.08). Людина, яка її
// відкликала, не має лишати слідів ЖОДНОГО виду, навіть технічних. Тому вимикач
// у кабінеті мусить глушити і журнал поломок — інакше обіцянка в тексті згоди
// була б неправдою.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await ctx.addInitScript(() => localStorage.setItem('cstl-analytics-off', '1'));
  await mockSupabase(p, { posts: [], profiles: [], comments: [], threads: [],
                          messages: [], thread_user_state: [] });
  if (REV) {
    const body = projectFile('bundle.js', REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
  }
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => { setTimeout(() => { window.__нема.поле = 1; }, 0); });
  await p.waitForTimeout(900);
  const list = await події(p, 'js_error');
  ok('🛑 вимкнена статистика глушить і журнал поломок', list.length === 0, `подій: ${list.length}`);
  await ctx.close();
}

await b.close();
await stop();
done();
