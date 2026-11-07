// Стенд: ЩИРО ПОРОЖНЯ ДОШКА — перший екран першого жителя.
//
// 🔴 НАВІЩО ЗАВЕДЕНИЙ (27.09.2026). Оцінка готовності 26.09: на дошці без
// жодного оголошення стояло рівно три слова — «Тут поки порожньо». Без
// пояснення, навіщо цей розділ, і без жодної дії. А це той самий екран, який
// перший житель побачить у день запуску, коли база ще пуста.
// `KURS.md` вимагає дослівно: «перший житель не сміє побачити порожню стрічку».
//
// 🔑 ЗРАЗОК БУВ У ЦЬОМУ Ж ФАЙЛІ, за двадцять рядків: гілка «Питань поки немає»
// (назва → одне речення «що тут роблять» → одна дія). Тобто нова конструкція не
// заводилась — повторено ту, яку проєкт уже визнав удалою.
//
// 🛑 ГОЛОВНЕ, ЩО ТУТ СТЕРЕЖЕТЬСЯ, — РІЗНИЦЯ МІЖ ДВОМА ПОРОЖНЯМИ. «Оголошень
// немає взагалі» і «нічого не знайшлось за фільтром» — різні екрани з різними
// діями, і злити їх в один найлегше саме наступною правкою. Тому прогін 2
// ставить фільтр і вимагає СТАРИЙ текст зі скиданням, а не новий із поданням:
// пропонувати «подайте перше оголошення» людині, у якої просто ввімкнена чужа
// категорія, означало б брехати їй про стан громади.
//
// 🔴 КОНТРОЛЬ: BUNDLE_REV=origin/main node tests/board-empty-first.mjs
// На коді до 27.09 мусять упасти перевірки нового екрана (там лише три слова).
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const BUNDLE_REV = process.env.BUNDLE_REV || '';

const NOW = new Date().toISOString();
// Одне оголошення в ОДНІЙ категорії — рівно щоб прогін 2 мав що відфільтрувати.
const ОДНЕ = [{
  id: 301, type: 'board', status: 'published', category: 'продам', owner_uid: 'u1',
  title: 'Продам тачку', text: 'Садова, майже нова.', location: 'Олика',
  price: 300, photos: [], created_at: NOW, published_at: NOW,
}];

const { ok, done } = reporter();
const { url, stop } = await serve();
const b = await launch(chromium);
const errs = [];

async function дошка(posts, user = null) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await mockSupabase(p, { posts, threads: [], messages: [], thread_user_state: [], announcements: [] }, user ? { user } : {});
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  if (BUNDLE_REV) {
    const body = projectFile('bundle.js', BUNDLE_REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
  }
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForTimeout(200);
  await p.evaluate(() => window.switchTab && window.switchTab('board'));
  await p.waitForTimeout(1200);
  // Гейт правил Дошки при першому вході — інакше екран під ним не видно.
  await p.evaluate(() => document.querySelector('.brules-ok')?.click());
  await p.waitForTimeout(600);
  return { p, ctx };
}

function зріз(p) {
  return p.evaluate(() => {
    const e = document.querySelector('.bd-empty');
    const btn = e && e.querySelector('button');
    return {
      є:         !!e,
      текст:     (e?.textContent || '').replace(/\s+/g, ' ').trim(),
      назва:     (e?.querySelector('.bd-empty-title')?.textContent || '').trim(),
      кнопка:    (btn?.textContent || '').trim(),
      дія:       btn ? Object.keys(btn.dataset)[0] || '' : '',
      влазить:   btn ? btn.getBoundingClientRect().right <= window.innerWidth + 1 : true,
    };
  });
}

// ── ПРОГІН 1: жодного оголошення ─────────────────────────────────────────────
{
  const { p, ctx } = await дошка([]);
  const s = await зріз(p);
  ok('порожній екран Дошки намальовано', s.є);
  ok('🔴 екран має НАЗВУ, а не лише три слова', s.назва === 'Оголошень поки немає', s.назва || '(немає)');
  ok('🔑 пояснено, що тут роблять жителі',
     /продають/.test(s.текст) && /шукають/.test(s.текст), s.текст.slice(0, 80));
  ok('🛑 старий текст-тупик прибрано', !/Тут поки порожньо/.test(s.текст),
     /Тут поки порожньо/.test(s.текст) ? 'лишився' : 'прибрано');
  // 🔴 07.11 — РЕДИЗАЙН: окрема кнопка поступилась чотирьом прикладам-категоріям
  // (кругла «Подати оголошення» стоїть на Дошці завжди — дубль змагався б із нею).
  const приклади = await p.evaluate(() => [...document.querySelectorAll('.bd-empty [data-bd-post-cat]')]
    .map(b => ({ id: b.dataset.bdPostCat, r: b.getBoundingClientRect().right <= innerWidth + 1, h: b.getBoundingClientRect().height })));
  ok('🔑 є чотири приклади: продам · куплю · віддам · шукаю',
     приклади.map(x => x.id).join(',') === 'продам,куплю,віддам,шукаю', приклади.map(x => x.id).join(','));
  ok('приклади не вилазять за екран і мають ціль ≥44px', приклади.every(x => x.r && x.h >= 44), JSON.stringify(приклади.map(x => x.h)));
  ok('є малюнок-вітрина', await p.evaluate(() => !!document.querySelector('.bd-empty .bd-empty-art svg')));

  // 🔴 ВИДНО ОКОМ, А НЕ ЛИШЕ Є В РОЗМІТЦІ. До 07.11 цей стенд був зелений, а Вова
  // бачив порожній сірий екран: `.board-bg` (fixed, z-index 0, непрозорий) лежав
  // поверх тексту. elementFromPoint тут бреше (шар без pointer-events), тому
  // міряємо ПІКСЕЛІ: на місці заголовка мусять бути темні точки тексту.
  const r = await p.evaluate(() => { const e = document.querySelector('.bd-empty-title').getBoundingClientRect();
    return { x: e.left, y: e.top, width: e.width, height: e.height }; });
  const png = await p.screenshot({ clip: r });
  const темних = await p.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] < 300) n++;
    return n;
  }, png.toString('base64'));
  ok('🔴 заголовок ВИДНО на екрані (темні пікселі тексту є)', темних > 30, `темних пікселів: ${темних}`);
  await ctx.close();
}

// ── ПРОГІН 2: КОНТРОЛЬ — оголошення є, але фільтр їх ховає ───────────────────
// 🔑 Це не «ще один випадок», а доведення, що перший прогін щось значить. Якби
// новий екран показувався завжди, ця перевірка почервоніла б.
{
  const { p, ctx } = await дошка(ОДНЕ);
  // Пошук за завідомо відсутнім словом — найкоротший спосіб дійти до
  // «нічого не знайшлось», не воюючи з меню категорій.
  await p.evaluate(() => {
    const i = document.querySelector('#bd-search, .bd-search input, input[type=search]');
    if (!i) return;
    i.value = 'чогонемаєвгромаді';
    i.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.waitForTimeout(800);
  const s = await зріз(p);
  ok('🛑 КОНТРОЛЬ: при фільтрі екран ІНШИЙ — про пошук, не про подання',
     /Нічого не знайшлось/.test(s.текст), s.текст.slice(0, 80));
  ok('КОНТРОЛЬ: і кнопка тут не «подати», а повернути список',
     s.кнопка !== 'Подати перше оголошення', s.кнопка);
  await ctx.close();
}

// 🆕 07.11 — тап по прикладу відкриває форму з цією категорією вже вибраною.
{
  const { p, ctx } = await дошка([], { id: 'uid-me', email: 'me@example.com', user_metadata: { full_name: 'Вова' } });
  await p.evaluate(() => document.querySelector('[data-bd-post-cat="віддам"]')?.click());
  await p.waitForTimeout(900);
  const активна = await p.evaluate(() => document.querySelector('.app-modal--board-compose .bm-chip.active')?.dataset.cat || null);
  ok('🔑 «Віддам» відкриває форму з категорією «віддам»', активна === 'віддам', `вибрано: ${активна}`);
  await ctx.close();
}

ok('помилок у консолі нема', errs.length === 0, errs.slice(0, 2).join(' | '));

await b.close();
await stop();
done();
