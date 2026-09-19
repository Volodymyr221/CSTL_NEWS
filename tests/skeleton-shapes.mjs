// Стенд: КІСТЯК ЗАВАНТАЖЕННЯ ПОВТОРЮЄ ФОРМУ СВОГО ЕКРАНА (19.09.2026).
//
// 🗣️ Замовлення Вови зі знімків: «зроби сторінку завантаження кожної сторінки в
// такому вигляді як сторінка, до прикладу стрічка зараз завантажується як
// список, а може так як елементи на стрічці… І так з кожною вкладкою».
//
// 🔴 ЩО САМЕ БУЛО НЕ ТАК. Кістяк був ОДИН на всі екрани — «фото 64px ліворуч +
// три смужки». На Стрічку ж приїжджає карусель спільнот і картка з фото 4:5 на
// всю ширину. Тобто застосунок обіцяв одну розкладку, а показував іншу.
//
// 🔑 ГОЛОВНА ПЕРЕВІРКА ТУТ — НЕ «ЧИ Є КЛАСИ», А ЧИ НЕ СІПНЕТЬСЯ РОЗКЛАДКА.
// Порахувати класи легко і майже нічого не доводить: можна намалювати правильні
// імена з неправильними розмірами, і стенд зеленів би, поки людина бачить
// стрибок. Тому блок 3 міряє ВИСОТУ кістяка проти висоти того, що приходить
// замість нього, на тій самій сцені.
//
// 🧪 ДОВЕДЕНО МУТАЦІЯМИ (19.09, прогони — не припущення):
//   1. знято перевірку прапорця в `loadingHtml` → 9/10, падає блок 1;
//   2. усі форми підмінено формою Дошки → 6/10, зокрема «форми різні» дає 3 з 4;
//   3. кістяк Дошки сплющено (фото 14px, смужки по 3px, без відступів) → 9/10,
//      розбіжність 82%.
// 🛑 І ЧЕСНО ПРО МЕЖУ ЦЬОГО ПРИЛАДУ, бо мутація її показала: спроба зменшити
// саме фото кістяка з 96 до 18px залишила стенд ЗЕЛЕНИМ (111 проти 109px) —
// висоту картки тримає текстовий стовпчик, а не фото. Тобто блок 4 стереже
// ПОРЯДОК ВЕЛИЧИНИ, а не точність до пікселя, і видавати його за друге не можна.
// Саме порядок величини й ламався, коли картку з фото 4:5 підміняли рядком 64px.
//
// 🛑 ЧОГО ТУТ НЕМАЄ: Громади. Її блоки ВЖЕ мають власні кістяки під свою форму
// (`skeletonNews` — велика картка + два рядки, `skeletonRows` — рядки
// оголошень), зроблені свідомо і з коментарем. Переписувати правильне заради
// одноманітності означало б ризикувати робочим кодом без виграшу.

import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();

const ФІЧА = 'skeleton_shapes';
const Я = { id: 'uid-me', email: 'me@example.com', user_metadata: { full_name: 'Вова' } };

const { url, stop } = await serve();
const b = await launch(chromium);

// Сцена з ПОВІЛЬНОЮ базою: без затримки кістяк живе кілька мілісекунд і зникає
// раніше, ніж його встигне побачити і стенд, і людина. 📐 `slow` — той самий
// прийом, яким у проєкті вже ловили вади «пізньої відповіді» (B-30).
async function сцена({ стан }) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await mockSupabase(p, {
    posts: [], announcements: [], profiles: [],
    app_features: [{ key: ФІЧА, label: 'Кістяки', stage: стан }],
    feature_testers: [{ uid: 'uid-me' }],
  }, { user: Я, slow: { posts: 30000, page_posts: 30000, pages: 30000 } });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  // 🔑 Розклад автобусів — ЛОКАЛЬНИЙ файл, `slow` заглушки бази його не гальмує.
  // Без цієї затримки кістяк Автобусів живе кілька мілісекунд, і стенд міряв би
  // вже намальований розклад — тобто зеленів би над порожнечею.
  await p.route('**/data/schedule.json*', async (r) => {
    await new Promise(res => setTimeout(res, 30000));
    r.abort();
  });
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForTimeout(400);
  return { ctx, p };
}

// Що зараз намальовано в корені вкладки: які кістякові класи видно.
const кістяк = (p, sel) => p.evaluate((s) => {
  const root = document.querySelector(s);
  if (!root) return { нема: true };
  const є = (k) => !!root.querySelector(k);
  return {
    загальний: є('.hm-sk-row'),            // стара одна-на-всіх форма
    стрічка:   є('.sk-circles') && є('.sk-feed-photo'),
    дошка:     є('.sk-board-card'),
    питання:   є('.sk-qa-row'),
    автобуси:  є('.sk-bus-hero') && є('.sk-bus-card'),
    напис:     !!root.querySelector('.scr-loading-tx'),
  };
}, sel);

const наВкладку = async (p, tab) => {
  await p.evaluate(t => window.switchTab?.(t), tab);
  await p.waitForTimeout(500);
};

// ── 1. 🛑 ПРАПОРЕЦЬ ВИМКНЕНО — ГРОМАДА БАЧИТЬ СТАРЕ ───────────────────────
//
// 🔴 Це перша перевірка не випадково: уся система оновлень тримається на тому,
// що `off` означає «код у проді, але мертвий». Якби нове малювалось і при
// вимкненому прапорці, решта перевірок стерегла б декорацію.
{
  const { ctx, p } = await сцена({ стан: 'off' });
  const s = await кістяк(p, '#feed-list');
  ok('🛑 прапорець `off` — на Стрічці стара форма, нової НЕМАЄ',
     s.загальний === true && s.стрічка === false, JSON.stringify(s));
  await ctx.close();
}

// ── 2. 🔴 УВІМКНЕНО «ЛИШЕ КОЛУ» — КОЖНА ВКЛАДКА ЗІ СВОЄЮ ФОРМОЮ ───────────
{
  const { ctx, p } = await сцена({ стан: 'circle' });

  const feed = await кістяк(p, '#feed-list');
  ok('🔴 СТРІЧКА: карусель спільнот + картка з фото (а не список)',
     feed.стрічка === true && feed.загальний === false, JSON.stringify(feed));
  ok('напис «Завантажую…» лишився — сірі смужки самі нічого не кажуть',
     feed.напис === true);

  await наВкладку(p, 'board');
  const board = await кістяк(p, '#board-content');
  ok('🔴 ДОШКА: картки оголошень', board.дошка === true, JSON.stringify(board));

  await наВкладку(p, 'discussions');
  const qa = await кістяк(p, '#disc-content');
  ok('🔴 ПИТАННЯ: рядки питань, а НЕ картки оголошень',
     qa.питання === true && qa.дошка === false, JSON.stringify(qa));

  await наВкладку(p, 'buses');
  const bus = await кістяк(p, '#buses-content');
  ok('🔴 АВТОБУСИ: банер рейсу + рядки розкладу', bus.автобуси === true, JSON.stringify(bus));

  await ctx.close();
}

// ── 3. 🔴 ГОЛОВНЕ: ФОРМИ РІЗНІ МІЖ СОБОЮ ─────────────────────────────────
//
// Зустрічна межа до блоку 2. Там кожна вкладка перевірялась ОКРЕМО, і чотири
// однакові кістяки з різними іменами класів пройшли б усі чотири рядки. Саме
// заради цього замовлення й робилось: «взяти макет сторінки», тобто різні
// екрани мають виглядати по-різному ще до появи даних.
{
  const { ctx, p } = await сцена({ стан: 'circle' });
  const знімок = async (tab, sel) => {
    if (tab) await наВкладку(p, tab);
    return p.evaluate((s) => {
      const root = document.querySelector(s);
      const sk = root?.querySelector('.scr-loading');
      if (!sk) return null;
      // Підпис форми: перелік кістякових класів усередині. Порівнюємо СТРУКТУРУ,
      // а не текст — тексту в кістяку немає взагалі.
      // 🔴 ПЕРША РЕДАКЦІЯ ЦЬОГО ВИРАЗУ БРЕХАЛА, І ВАРТО ЗНАТИ ЯК. Вона брала
      // `[class*="sk-"]`, а під цей взірець підпадає і СТАРИЙ клас `hm-sk-ph`;
      // далі фільтр `startsWith('sk-')` викидав його в ПОРОЖНІЙ рядок, і підпис
      // виходив на кшталт «||||». Чотири екрани зі старим кістяком давали
      // чотири різні кількості порожніх рядків — тобто перевірка «форми різні»
      // була ЗЕЛЕНОЮ над чотирма однаковими старими кістяками.
      // ✅ Тепер беремо лише справжні нові класи і вимагаємо, щоб їх було з чого
      // складати підпис.
      const класи = [...sk.querySelectorAll('[class]')]
        .flatMap(e => e.className.toString().split(' '))
        .filter(c => c.startsWith('sk-'));
      return класи.length ? класи.join('|') : null;
    }, sel);
  };
  const f = await знімок(null, '#feed-list');
  const bo = await знімок('board', '#board-content');
  const q = await знімок('discussions', '#disc-content');
  const bu = await знімок('buses', '#buses-content');

  const усі = { стрічка: f, дошка: bo, питання: q, автобуси: bu };
  const порожні = Object.entries(усі).filter(([, v]) => !v).map(([k]) => k);
  ok('прилад БАЧИТЬ кістяк на всіх чотирьох вкладках',
     порожні.length === 0,
     порожні.length ? `не знайдено на: ${порожні.join(', ')}` : 'усі чотири на місці');

  const унікальних = new Set(Object.values(усі).filter(Boolean)).size;
  ok('🔴 форми чотирьох вкладок РІЗНІ між собою',
     унікальних === 4, `різних форм: ${унікальних} з 4`);

  await ctx.close();
}

// ── 4. 🔴 РОЗКЛАДКА НЕ СІПАЄТЬСЯ ─────────────────────────────────────────
//
// 🔑 НАЙЦІННІША ПЕРЕВІРКА ФАЙЛУ, і саме її найлегше було б не написати.
// Класи можна намалювати правильні, а розміри — будь-які; тоді кістяк виглядав
// би «схожим», а в мить появи даних список стрибав би. Міряємо висоту кістяка і
// висоту того, що стало на його місце, на ОДНІЙ сцені.
// ⚠️ Поріг 40% свідомо широкий: кількість карток у кістяку і в даних різна за
// самою природою (кістяк не знає, скільки прийде). Стережемо не рівність, а
// порядок величини — саме він і ламався, коли картка з фото 4:5 підмінялась
// рядком на 64px.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const t0 = Date.now() - 864e5;
  const оголошення = (i) => ({
    id: 700 + i, type: 'board', status: 'published', author: 'Олена', owner_uid: 'u-o',
    title: `Оголошення номер ${i}`, text: 'Опис оголошення у кілька слів для висоти.',
    location: 'Олика', tags: [], category: 'other', price: 500, currency: 'грн',
    ts: t0 + i * 6e4, created_at: new Date(t0 + i * 6e4).toISOString(),
    published_at: new Date(t0 + i * 6e4).toISOString(),
  });
  await mockSupabase(p, {
    posts: [оголошення(1), оголошення(2), оголошення(3)],
    announcements: [], comments: [], reactions: [], saved_posts: [],
    app_features: [{ key: ФІЧА, label: 'Кістяки', stage: 'circle' }],
    feature_testers: [{ uid: 'uid-me' }],
  }, { user: Я, slow: { posts: 6000 } });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForTimeout(300);
  await наВкладку(p, 'board');

  const висотаКістяка = await p.evaluate(() => {
    const el = document.querySelector('#board-content .sk-board-card');
    return el ? Math.round(el.getBoundingClientRect().height) : 0;
  });
  // Чекаємо, поки повільна заглушка віддасть дані і кістяк поступиться картками.
  await p.waitForTimeout(7000);
  const висотаКартки = await p.evaluate(() => {
    const el = document.querySelector('#board-content .bd-card--board');
    return el ? Math.round(el.getBoundingClientRect().height) : 0;
  });

  ok('прилад побачив і кістяк, і справжню картку',
     висотаКістяка > 0 && висотаКартки > 0,
     `кістяк ${висотаКістяка}px · картка ${висотаКартки}px`);

  const розбіжність = висотаКартки
    ? Math.abs(висотаКістяка - висотаКартки) / висотаКартки : 1;
  ok('🔴 висота кістяка Дошки близька до справжньої картки (розкладка не стрибне)',
     висотаКістяка > 0 && висотаКартки > 0 && розбіжність <= 0.4,
     `кістяк ${висотаКістяка}px · картка ${висотаКартки}px · розбіжність ${Math.round(розбіжність * 100)}%`);

  await ctx.close();
}

await stop();
await b.close();
done();
