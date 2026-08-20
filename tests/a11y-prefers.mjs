// Стенд: ЗАСТОСУНОК СЛУХАЄ НАЛАШТУВАННЯ ДОСТУПНОСТІ ТЕЛЕФОНА (§14 `apple-design`).
//
// 📐 ЗНАХІДКА АУДИТУ. Скіл вимагає ТРИ незалежні сигнали. У проєкті був один
// (`prefers-reduced-motion`, і той у 3 файлах із 20), двох інших не існувало
// взагалі — заміряно **36 провалів з 42**. Людина, що ввімкнула в телефоні
// «Зменшити прозорість» або «Збільшити контраст», отримувала ті самі 56
// скляних поверхонь.
//
// 🔴 ГОЛОВНЕ, ЩО ЦЕЙ СТЕНД СТЕРЕЖЕ — і чого легко не помітити.
// «Підтримати зменшену прозорість» ≠ «прибрати `backdrop-filter`». Капсули
// Громади і панелі зборів — це БІЛИЙ текст поверх ФОТО, і читабельним його
// робить саме розмиття. Знімеш розмиття, лишивши тло 10-26% прозорості, — текст
// ляже прямо на фотографію, тобто налаштування «щоб краще бачити» зробить ГІРШЕ.
// Тому перевіряється ПАРА: розмиття зникло **і** тло стало щільним.
//
// 🔬 ЧОМУ ПОВЕДІНКОВО, А НЕ ЧИСЛОМ ІЗ ПРИЛАДУ.
// `tests/tools/apple-audit.mjs` рахує «скільки вузлів змінилось» під кожним
// налаштуванням. Для цього пункту його число ЗАНИЖУЄ (на частині екранів
// показує 0 там, де зміна є — доведено прямим виміром). Причину не з'ясовано,
// тож на нього тут не спираюсь: сумі, якої не розумієш, вірити не можна.
// Цей стенд питає конкретну поверхню про конкретні дві властивості.
//
// ⚠️ Емуляція — через CDP: у Playwright немає прапорця для
// `prefers-reduced-transparency`, а `page.emulateMedia()` і CDP перебивають
// одне одного (`setEmulatedMedia` замінює ВЕСЬ набір фіч, а не додає).
// Тому все трьома викликами ОДНІЄЇ сесії.
// 🔴 Контроль першого порядку: перед кожним виміром стенд питає браузер
// `matchMedia(...)`. Без цього «нічого не змінилось» неможливо відрізнити від
// «емуляція не ввімкнулась» — і стенд тихо доводив би відсутність підтримки.
//
// ⚠️ `serviceWorkers: 'block'` — восьмий випадок брехливої перевірки в проєкті.
//
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     CSS_REV=origin/main node tests/a11y-prefers.mjs
// підсовує `style/base.css` ДО фіксу — усі 🔴-перевірки мусять УПАСТИ.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile, baseCss} from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.CSS_REV || '';
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Вова' } };

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();
// 🔴 17.08 — СЦЕНА БІЛЬШЕ НЕ ЗАЛЕЖИТЬ ВІД СЬОГОДНІШНЬОГО РОЗКЛАДУ АВТОБУСІВ.
// Стенд міряє CSS-контракт на `.hm-cap2`, але вузол мусить існувати. Раніше він
// брався з живих даних: капсула «ЗАРАЗ» малювалась, поки логіка обирала будь-який
// найближчий рейс. Після виправлення 17.08 рейс мусить проходити через Олику і
// бути ближчим за 2 години — тобто вночі й у «дірках» розкладу капсули законно
// НЕМАЄ, і стенд червонів на цілком справному коді.
// ✅ Тепер капсулу дає роль «НОВЕ»: одне нове оголошення + давня позначка
// «востаннє був на Дошці». Це не залежить ні від годинника, ні від розкладу.
// ⚠️ Позначку ставимо ДО завантаження: без ключа перший запуск навмисно віддає
// нуль (той, хто щойно поставив застосунок, нічого не пропускав).
await ctx.addInitScript(() => localStorage.setItem('cstl_board_seen_ts', '1'));
await mockSupabase(p,
  { posts: [{ id: 1, type: 'board', status: 'published', owner_uid: 'u-hto',
              title: 'Продам плуг', text: 'текст', location: 'Олика',
              created_at: new Date().toISOString() }],
    threads: [], messages: [], thread_user_state: [], announcements: [], comments: [] },
  { user: ME, profiles: [{ uid: 'u-me', name: 'Вова', avatar_url: '' }] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
if (REV) {
  const body = baseCss(REV);
  await p.route('**/style/base.css', r => r.fulfill({ contentType: 'text/css; charset=utf-8', body }));
}

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1600);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });
await p.waitForTimeout(600);

const cdp = await ctx.newCDPSession(p);
const режим = async (фіча, значення) => {
  await cdp.send('Emulation.setEmulatedMedia',
    { features: фіча ? [{ name: фіча, value: значення }] : [] });
  await p.waitForTimeout(350);
  if (!фіча) return true;
  return p.evaluate(f => matchMedia(`(${f})`).matches, `${фіча}: ${значення}`);
};

// Непрозорість тла: 1 = щільне, 0 = діри немає взагалі.
const поверхня = (sel) => p.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const c = getComputedStyle(el);
  const m = /rgba?\(([^)]+)\)/.exec(c.backgroundColor);
  const альфа = m ? (m[1].split(',').length > 3 ? parseFloat(m[1].split(',')[3]) : 1) : 1;
  return { альфа, blur: (c.backdropFilter || c.webkitBackdropFilter || 'none') };
}, sel);

// ── ЗВИЧАЙНИЙ РЕЖИМ: скло має лишитись склом ────────────────────────────────
await режим(null);
const звичайно = await поверхня('.hm-cap2');
if (!звичайно) {
  ok('сцена: капсула Громади на екрані', false, 'вузла .hm-cap2 немає');
} else {
  ok('🛑 без налаштувань капсула лишається СКЛОМ (звичайний вигляд не зачеплено)',
     звичайно.blur !== 'none' && звичайно.альфа < 0.5,
     `blur ${звичайно.blur} · альфа тла ${звичайно.альфа}`);
}

// ── «ЗМЕНШИТИ ПРОЗОРІСТЬ» ───────────────────────────────────────────────────
const увТрансп = await режим('prefers-reduced-transparency', 'reduce');
ok('емуляція «зменшити прозорість» справді ввімкнена (контроль 1-го порядку)', увТрансп);

const трансп = await поверхня('.hm-cap2');
if (трансп) {
  ok('🔴 «зменшити прозорість»: розмиття капсули знято',
     трансп.blur === 'none', трансп.blur);
  // 🔴 Це і є головна пара: без щільного тла зняте розмиття робить ГІРШЕ.
  ok('🔴 «зменшити прозорість»: тло капсули стало ЩІЛЬНИМ (текст не ляже на фото)',
     трансп.альфа >= 0.9, `альфа ${трансп.альфа}`);
}

// Жодного розмиття не лишилось НІДЕ — правило глобальне, і саме це перевіряємо.
const скляних = await p.evaluate(() => {
  let n = 0;
  for (const el of document.querySelectorAll('body *')) {
    const c = getComputedStyle(el);
    if ((c.backdropFilter || c.webkitBackdropFilter || 'none') !== 'none') n++;
  }
  return n;
});
ok('🔴 «зменшити прозорість»: на екрані не лишилось жодної скляної поверхні',
   скляних === 0, `знайдено ${скляних}`);

// ── «ЗБІЛЬШИТИ КОНТРАСТ» ────────────────────────────────────────────────────
const увКонтраст = await режим('prefers-contrast', 'more');
ok('емуляція «збільшити контраст» справді ввімкнена (контроль 1-го порядку)', увКонтраст);

const контраст = await поверхня('.hm-cap2');
if (контраст) {
  ok('🔴 «збільшити контраст»: тло капсули щільне',
     контраст.альфа >= 0.9, `альфа ${контраст.альфа}`);
}
// Скіл §14: «near-solid backgrounds with a defined, contrasting border».
const межа = await p.evaluate(() => {
  const el = document.querySelector('.hm-cap2');
  if (!el) return null;
  const c = getComputedStyle(el);
  return { колір: c.borderTopColor, товщина: parseFloat(c.borderTopWidth) };
});
if (межа) {
  ok('🔴 «збільшити контраст»: у капсули є видима межа',
     межа.товщина >= 1 && /255,\s*255,\s*255/.test(межа.колір),
     `${межа.товщина}px ${межа.колір}`);
}

// ── ПОВЕРНЕННЯ: усе як було ─────────────────────────────────────────────────
// Якщо налаштування вимкнули, застосунок мусить повернутись до скла — інакше це
// вже не «підтримка налаштування», а одностороння зміна дизайну.
await режим(null);
const назад = await поверхня('.hm-cap2');
if (назад) {
  ok('🛑 налаштування вимкнули → капсула знову скло',
     назад.blur !== 'none' && назад.альфа < 0.5,
     `blur ${назад.blur} · альфа ${назад.альфа}`);
}

await ctx.close(); await b.close(); await stop();
done();
