// tests/_lib.mjs — спільне для всіх стендів.
//
// НАВІЩО ЦЕЙ ФАЙЛ. Стенди писались у тимчасовій папці сесії і мали в собі
// жорстко прописані шляхи: корінь репозиторію `/home/user/CSTL_NEWS` і адресу
// браузера `/opt/pw-browsers/chromium-1194/...`. На іншій машині (чи навіть у
// наступній сесії, де номер збірки браузера інший) вони б просто не запустились.
// Тому все, що залежить від оточення, зібрано тут в одному місці.
//
// ⚠️ Історичний урок: у документах проєкту згадувались сторожі `kb-guard.test.js`
// і `kb-tapinput.test.js` — але їх НІКОЛИ не було в репозиторії. Вони жили в
// тимчасовій папці й зникли разом із сесією, а посилання на них лишились.
// Саме тому стенди тепер тут.

import { readFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { createServer } from 'http';
import { execFileSync } from 'child_process';

// Корінь репозиторію — на рівень вище за теку tests/. Ніяких абсолютних шляхів.
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Прочитати файл проєкту. З `rev` — версію з git (для порівняння «до/після»):
//   CSS_REV=<git-ish> node tests/toast.mjs
export function projectFile(relPath, rev = '') {
  return rev
    ? execFileSync('git', ['-C', ROOT, 'show', `${rev}:${relPath}`], { encoding: 'utf8', maxBuffer: 1 << 26 })
    : readFileSync(join(ROOT, relPath), 'utf8');
}

// ── Пошук браузера ───────────────────────────────────────────────────────────
// Порядок: змінна оточення → стандартна тека Playwright (номер збірки НЕ
// прибиваємо цвяхами, шукаємо будь-яку) → хай Playwright шукає сам.
export function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  let dirs = [];
  try { dirs = readdirSync(base); } catch { return undefined; }
  // ⚠️ Спершу відсіюємо `chromium_headless_shell-*`: він теж починається на «chromium»,
  // сортується ПІЗНІШЕ за звичайний, і саме його підхопила перша версія цієї функції —
  // а бінарник у нього називається інакше, тож запуск падав. Беремо повний браузер.
  const full = dirs.filter(d => /^chromium(-\d+)?$/.test(d)).sort().reverse();
  const shell = dirs.filter(d => d.startsWith('chromium_headless_shell')).sort().reverse();
  const candidates = [];
  for (const d of full) candidates.push(join(base, d, 'chrome-linux', 'chrome'), join(base, d, 'chrome'));
  for (const d of shell) candidates.push(join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
  for (const c of candidates) if (existsSync(c)) return c;
  return undefined;   // undefined → Playwright візьме свій вбудований
}

export async function launch(chromium) {
  const executablePath = chromiumPath();
  return chromium.launch(executablePath ? { executablePath } : {});
}

// ── Локальний сервер для стендів, що піднімають ЖИВИЙ застосунок ─────────────
// Раніше кожен такий стенд вимагав, щоб хтось руками запустив `python3 -m http.server`.
// Забув — і стенд падав із незрозумілою помилкою. Тепер він піднімає сервер сам.
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

export async function serve() {
  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = resolve(ROOT, rel);
    // Не віддаємо нічого поза коренем проєкту.
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    const ext = file.slice(file.lastIndexOf('.'));
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, stop: () => new Promise(r => server.close(r)) };
}

// Мережа назовні в стендах не потрібна — глушимо, щоб не чекати таймаутів.
export async function blockExternal(page) {
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.route('**://api.open-meteo.com/**', r => r.abort());
}

// ── Однаковий звіт у всіх стендах ────────────────────────────────────────────
export function reporter() {
  const res = [];
  const ok = (name, cond, info = '') => {
    res.push(!!cond);
    console.log(`${cond ? '✅' : '❌'} ${name}${info ? '  — ' + info : ''}`);
    return !!cond;
  };
  const done = () => {
    const bad = res.filter(r => !r).length;
    console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
    process.exit(bad ? 1 : 0);
  };
  return { ok, done, res };
}

// ── ЧИТАННЯ ЖИВИХ ПІКСЕЛІВ ЗІ ЗНІМКА ────────────────────────────────────────
//
// 🔴 НАВІЩО. Частину замовлень Вови неможливо перевірити читанням CSS: «щоб воно
// зливалося», «щоб не було видно стику», «щоб з лівого краю світліше» — це
// властивості КАРТИНКИ. Правило можна написати бездоганно і все одно отримати
// шов, бо шарів у градієнті два, а геометрія рахується від розміру екрана.
// Тому такі речі міряються пікселями знімка.
//
// 🔑 ДЕКОДУЄ PNG САМ БРАУЗЕР (`createImageBitmap`), а не саморобний читач.
// Перша редакція розбирала PNG руками і першим же прогоном видала кислотні
// `#00ffff` там, де на екрані бордо, — тобто прилад збрехав раніше, ніж встиг
// щось довести. Це був би черговий випадок у довгому ряду брехливих перевірок
// цього проєкту.
//
// 🔬 САМОПЕРЕВІРКА ВБУДОВАНА: перед читанням помічник знімає квадрат відомого
// кольору й звіряє його байт-у-байт. Не збіглось — кидає помилку одразу, і
// жодне число далі не встигне зійти за замір. Правило проєкту №1 про мірку:
// спершу зміряй, що дає порівняння стану з самим собою.
export async function pixelsOf(page, selector) {
  const зняти = async sel => {
    const buf = await page.locator(sel).screenshot();
    return page.evaluate(async b64 => {
      const бін = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const bmp = await createImageBitmap(new Blob([бін], { type: 'image/png' }));
      const cv = new OffscreenCanvas(bmp.width, bmp.height);
      const g = cv.getContext('2d', { willReadFrequently: true });
      g.drawImage(bmp, 0, 0);
      return { w: bmp.width, h: bmp.height,
               out: Array.from(g.getImageData(0, 0, bmp.width, bmp.height).data) };
    }, buf.toString('base64'));
  };

  const МІТКА = '__px-selftest__', ЕТАЛОН = [0x5E, 0x17, 0x23];
  await page.evaluate(([id, hex]) => {
    const d = document.createElement('div');
    d.id = id;
    d.style.cssText = `position:fixed;left:0;top:0;z-index:2147483647;width:24px;height:24px;background:${hex};`;
    document.body.appendChild(d);
  }, [МІТКА, '#5E1723']);
  const проба = await зняти(`#${МІТКА}`);
  await page.evaluate(id => document.getElementById(id)?.remove(), МІТКА);
  const c = [проба.out[0], проба.out[1], проба.out[2]];
  if (c[0] !== ЕТАЛОН[0] || c[1] !== ЕТАЛОН[1] || c[2] !== ЕТАЛОН[2]) {
    throw new Error(`читач пікселів бреше: #5E1723 прочитано як rgb(${c.join(',')})`);
  }

  const { w, h, out } = await зняти(selector);
  return {
    w, h,
    px: (x, y) => { const o = (y * w + x) * 4; return [out[o], out[o + 1], out[o + 2]]; },
    // Яскравість за sRGB — та сама формула, якою в проєкті рахують контраст.
    ярк: ([r, g, b]) => +(0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(1),
    hex: ([r, g, b]) => '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join(''),
  };
}

// ── КЛОН ЕЛЕМЕНТА ДЛЯ ЗНІМКА (коли живий елемент зняти неможливо) ───────────
//
// 🔴 НАВІЩО. Бордова смуга запасу живе у `border-top` і в спокої лежить ВИЩЕ нуля
// прокрутки, накрита непрозорою `.app-header` — на екрані її нема чого знімати.
// Клон несе той самий клас і ту саму ширину, тобто і градієнт, і рамка рахуються
// з тих самих чисел.
//
// 🔑 ДВІ ПАСТКИ, ОБИДВІ СПІЙМАНІ ЖИВИМ ПРОГОНОМ — прилад показував ЧИСТО БІЛИЙ
// ряд замість бордового, тобто міряв не те, що малюється на екрані.
//   1. Клон кладеться ДО БАТЬКА оригінала, а не в `body`. Правила Дошки scoped
//      під `#board-content` (бо ті самі класи `.bd-*` носять Обговорення), тож
//      поза цим предком вони просто не діють.
//   2. Хост зсувається ПІД шапку застосунку. `position: fixed` не рятує: батько
//      (`.bd-controls`, `z-index: 90`) створює контекст накладання, тож хост
//      замкнений усередині нього і непрозора `.app-header` (z-index 100) лягає
//      зверху. Пересунути хост дешевше, ніж ламати контекст.
// Обидві — той самий клас помилки, що `zoneCss()` нижче: трималось за випадкову
// обставину замість за живу поведінку.
export async function cloneForShot(page, selector, id = 'seam-probe') {
  return page.evaluate(([sel, ід]) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const hdr = document.querySelector('.app-header');
    const відступ = hdr ? Math.ceil(hdr.getBoundingClientRect().bottom) + 8 : 8;
    const хост = document.createElement('div');
    хост.id = ід;
    хост.style.cssText = `position:fixed;left:0;top:${відступ}px;z-index:2147483646;width:${r.width}px;`;
    const c = el.cloneNode(true);
    c.style.margin = '0';   // відʼємні поля оригінала ні до чого — ширину дає хост
    хост.appendChild(c);
    (el.parentElement || document.body).appendChild(хост);
    return {
      рамка: parseFloat(s.borderTopWidth) || 0,
      ширина: Math.round(r.width),
      висотаБлока: Math.round(r.height - (parseFloat(s.borderTopWidth) || 0)),
    };
  }, [selector, id]);
}

// 🆕 05.08 — СТИЛІ ЗОНИ «ГРОМАДА + ДОШКА» ОДНИМ РЯДКОМ.
//
// 🔴 Навіщо окремий хелпер, а не `projectFile('style/community.css')`.
// До 05.08 стилі Дошки жили в `community.css` (68% його селекторів), і пʼять
// стендів шукали правила Дошки саме там — за ІМЕНЕМ файлу. Щойно стилі
// винесли в `style/board.css`, усі пʼять впали, хоча жодне правило не
// змінилось: вони перевіряли не стилі, а місце їх зберігання.
//
// 🔑 Урок той самий, що з демо-фолбеком і зі сценою `board-cream`: перевірка
// має триматись за ПОВЕДІНКУ, а не за випадкову обставину. Тепер стенд питає
// «що каже CSS цієї зони», і йому байдуже, у скількох файлах воно лежить.
// Додаси третій файл зони — допишеш його сюди, і жоден стенд не зміниться.
export function zoneCss(rev = '') {
  return ['style/community.css', 'style/board.css']
    .map(f => projectFile(f, rev))
    .join('\n');
}

// ── ТОКЕНИ `:root` ІЗ `style/base.css` ──────────────────────────────────────
//
// 🔴 НАВІЩО ЦЕ ЗʼЯВИЛОСЬ (14.08). Стенди `motion` і `keyboard` малюють ВЛАСНУ
// сторінку і підключають лише той файл стилів, який міряють (`modal.css`,
// `feed.css`). 13.08 двадцять сім однакових кривих звели в токени
// (`--ease-drawer` і сусіди) — і рух у цих двох стендах помер МОВЧКИ.
//
// 📐 Заміряно приладом, а не вгадано: `transition: transform .25s var(--ease-drawer)`
// при НЕоголошеному токені дає обчислене `all 0s ease`. Тобто браузер викидає
// не криву, а ВСЮ властивість — анімації не лишається взагалі.
//
// 🔑 Найгірше в цьому те, ЯК воно виглядало: `motion` показував «відкривається
// рухом угору — 0px», тобто звинувачував ЗАСТОСУНОК. У самому застосунку
// `base.css` підключений завжди, і рух там цілий. **17-й випадок брехливої
// перевірки в проєкті** — і рівно той самий клас, що `zoneCss` вище: стенд
// тримався за випадкову обставину (що крива вписана числом), а не за поведінку.
//
// ⚠️ Беремо саме `:root { … }`, а не весь `base.css`: у ньому reset і розкладка
// застосунку, які перекроїли б синтетичні сторінки стендів і зробили б їхні
// заміри неспівставними з попередніми.
export function rootTokens(rev = '') {
  const css = projectFile('style/base.css', rev);
  const m = css.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!m) throw new Error('rootTokens: у style/base.css не знайдено блок :root');
  return m[1];
}

// Сторож проти повторення тієї самої історії: знаходить у ВИМІРЮВАНОМУ CSS
// звернення `var(--x)` БЕЗ запасного значення і питає браузер, чи кожне з них
// справді оголошене на сторінці стенда.
//
// 🔑 Чому лише без запасного значення: `var(--bg-card, #fff)` при відсутньому
// токені дає білий і нічого не ламає, а `var(--ease-drawer)` — викидає всю
// властивість. Небезпечні саме другі, і тільки їх має сенс стерегти.
//
// ⚠️ ЦЕЙ СТОРОЖ САМ ЗБРЕХАВ НА ПЕРШОМУ Ж ПРОГОНІ — і це записано тут навмисно,
// бо правило проєкту №1 каже міряти мірку так само прискіпливо, як код. Він
// звинуватив `--fd-card-r` і `--kb-h`, хоча обидва цілком справні:
//   • `--fd-card-r` оголошений не в `:root`, а на самій `.fd-card` — токени
//     бувають місцевими, і дивитись лише на корінь недостатньо;
//   • `--kb-h` узагалі згадувався в КОМЕНТАРІ, а в коді стоїть із запасним
//     значенням (`var(--kb-h, 0px)`) — регулярка читала пояснення як код.
// Тому тепер: коментарі вирізаються ДО розбору, а токен вважається справним
// ще й тоді, коли сам вимірюваний CSS його десь оголошує.
export async function unresolvedTokens(page, css) {
  const code = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const declared = new Set(
    [...code.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1])
  );
  const names = [...new Set(
    [...code.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)].map(m => m[1])
  )].filter(n => !declared.has(n));
  return page.evaluate((list) => {
    const cs = getComputedStyle(document.documentElement);
    return list.filter(n => !cs.getPropertyValue(n).trim());
  }, names);
}
