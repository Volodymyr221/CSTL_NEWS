// Стенд: ОБОЛОНКА АДМІНКИ — шапка тримається, кольори спільні із застосунком.
//
// 🔴 ЗАРАДИ ЧОГО. 20.08 Вова: «я скролю сторінку — скролиться все, з кнопками,
// з шапкою і тд, це не по нашому стандарту який ми налаштовували, навіть колір
// багряний, а ми вже змінили його в додатку».
//
// Дві різні вади в одній скарзі:
//   1. Шапка їхала разом зі сторінкою, а в ній «На сайт» і «Вийти». Тобто вихід
//      із адмінки зникав саме тоді, коли ти внизу довгого списку.
//   2. Адмінка мала ВЛАСНУ палітру: плаский `#722F37` і кремовий `#F4F1E6`.
//      Застосунок від обох давно відійшов — бренд став градієнтом
//      (#5E1723 → #2E0C14), фон нейтральним `#ECEEF1`.
//
// 🛑 ЧОМУ НЕ ДОСИТЬ ПОШУКУ СЛОВА `sticky` В CSS. Прибитість ламається не
// відсутністю властивості, а батьком із `overflow` чи `transform` — правило
// лишається на місці, а шапка їде. Тому стенд СКРОЛИТЬ справжню сторінку в
// браузері й дивиться, де опинилась шапка. Контроль: з `position: static` та
// сама перевірка мусить почервоніти.
import { chromium } from '@playwright/test';
import { readFileSync, existsSync } from 'fs';
import { createServer } from 'http';
import { join } from 'path';
import { ROOT, launch, reporter } from './_lib.mjs';

const { ok, done } = reporter();
const ADMIN = readFileSync(join(ROOT, 'admin.html'), 'utf-8');
const БЕЗ_КОМЕНТАРІВ = ADMIN.replace(/\/\*[\s\S]*?\*\//g, '').replace(/<!--[\s\S]*?-->/g, '');

// ── 1. ОДНЕ ДЖЕРЕЛО КОЛЬОРУ ────────────────────────────────────────────────
ok('🔴 адмінка підключає спільні токени бренду',
   /<link rel="stylesheet" href="style\/tokens\.css">/.test(ADMIN));
ok('🔴 у розмітці адмінки не лишилось власного бордового hex',
   !/#722F37/i.test(БЕЗ_КОМЕНТАРІВ), (БЕЗ_КОМЕНТАРІВ.match(/#722F37/ig) || []).join(','));
ok('🔴 у адмінки не лишилось власного кремового фону',
   !/#F4F1E6/i.test(БЕЗ_КОМЕНТАРІВ));
ok('фон береться токеном застосунку', /background: var\(--app-bg\)/.test(ADMIN));

// Токени живуть В ОДНОМУ місці: якщо їх оголосять ще й у base.css, файли
// розійдуться — рівно те, від чого й тікали.
const TOKENS = readFileSync(join(ROOT, 'style/tokens.css'), 'utf-8');
const BASE = readFileSync(join(ROOT, 'style/base.css'), 'utf-8');
ok('base.css тягне токени імпортом, а не копією',
   /@import url\('tokens\.css'\)/.test(BASE));
for (const т of ['--red', '--brand-grad', '--app-bg', '--ease-drawer']) {
  ok(`токен «${т}» оголошено рівно один раз у проєкті`,
     new RegExp(`^\\s*${т}:`, 'm').test(TOKENS)
     && !new RegExp(`^\\s*${т}:`, 'm').test(BASE));
}

// ⚠️ Новий файл стилів, якого немає в передкеші, offline просто не завантажиться
// — і адмінка лишиться без кольорів узагалі.
const SW = readFileSync(join(ROOT, 'sw.js'), 'utf-8');
ok('🔴 tokens.css у передкеші service worker', /'\.\/style\/tokens\.css'/.test(SW));

// ── 2. ПОВЕДІНКА: ШАПКА ТРИМАЄТЬСЯ ПРИ СКРОЛІ ──────────────────────────────
const сервер = createServer((req, res) => {
  const шлях = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
  if (!existsSync(шлях)) { res.writeHead(404); return res.end(); }
  const тип = шлях.endsWith('.html') ? 'text/html; charset=utf-8'
            : шлях.endsWith('.css') ? 'text/css; charset=utf-8'
            : 'application/octet-stream';
  res.writeHead(200, { 'content-type': тип });
  res.end(readFileSync(шлях));
});
await new Promise(r => сервер.listen(0, r));
const порт = сервер.address().port;

const b = await launch(chromium);

/** Відкриває адмінку, за потреби ламає прибитість, скролить і міряє. */
async function поміряти({ зламати = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.addInitScript(() => {
    const відповідь = (data) => Promise.resolve({ data, error: null });
    // ⚠️ Список прохідних методів тримаємо ПОВНИМ (див. `ad-report.mjs`, 24.08):
    // бракує одного — ланцюг рветься на «X is not a function», екран не малюється
    // взагалі, а стенд повідомляє про зламану розмітку замість дірки в заглушці.
    const МЕТОДИ = ['select', 'eq', 'neq', 'order', 'limit', 'in', 'is', 'not',
                    'filter', 'or', 'gt', 'lt', 'gte', 'lte', 'like', 'ilike',
                    'contains', 'range', 'match', 'abortSignal', 'returns',
                    'insert', 'update', 'delete', 'upsert'];
    const запит = () => { const o = { maybeSingle: () => відповідь(null),
      single: () => відповідь(null), then: (f) => відповідь([]).then(f) };
      for (const m of МЕТОДИ) o[m] = () => o; return o; };
    window.supabase = { createClient: () => ({
      auth: { getSession: () => відповідь({ session: { user: { id: 'u1', email: 'v@e.com' } } }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signOut: () => відповідь(null) },
      from: запит, rpc: () => відповідь([]) }) };
  });
  // 🔴 26.08 — глушимо SDK за обома адресами: він переїхав із CDN у `vendor/`.
for (const шлях of ['**cdn.jsdelivr.net/**', '**/vendor/supabase-js*']) {
  await p.route(шлях, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
}
  await p.goto(`http://127.0.0.1:${порт}/admin.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(500);
  if (зламати) await p.evaluate(() => { document.querySelector('.header').style.position = 'static'; });
  // Сцена підроблена і коротка — доточуємо висоту, щоб було ЩО скролити.
  await p.evaluate(() => { const d = document.createElement('div'); d.style.height = '2000px'; document.body.appendChild(d); });
  await p.evaluate(() => window.scrollTo(0, 900));
  await p.waitForTimeout(200);
  const дані = await p.evaluate(() => {
    const h = document.querySelector('.header').getBoundingClientRect();
    const в = document.getElementById('btn-logout')?.getBoundingClientRect();
    return { верх: Math.round(h.top), прокрутка: window.scrollY,
             вихідВидно: !!в && в.bottom > 0 && в.top < window.innerHeight };
  });
  await ctx.close();
  return дані;
}

const живе = await поміряти();
ok('сторінка справді прокрутилась (інакше міряли б нерухоме)', живе.прокрутка === 900, `y=${живе.прокрутка}`);
ok('🔴 шапка лишається вгорі екрана після прокрутки', живе.верх === 0, `top=${живе.верх}`);
ok('🔴 «Вийти» лишається доступним у будь-якій точці списку', живе.вихідВидно);

// 🛑 КОНТРОЛЬ: зі `static` та сама перевірка мусить упасти. Без нього «шапка
// вгорі» була б зеленою і на сторінці, яка просто не вміє скролитись.
const зламане = await поміряти({ зламати: true });
ok('🔴 КОНТРОЛЬ: без прибитості шапка їде вгору за екран',
   зламане.верх < -100, `top=${зламане.верх}`);

await b.close();
сервер.close();
done();
