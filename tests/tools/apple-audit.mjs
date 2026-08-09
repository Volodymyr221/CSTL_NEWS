// tests/tools/apple-audit.mjs — ВИМІРЮВАЧ ПІД АУДИТ `apple-design`.
//
// Замовлення Вови (09.08, дослівно): «проаналізуй і завантаж собі цей скіл —
// github.com/emilkowalski/skills/tree/main/skills/apple-design. І відносно цього
// скіла проведи жорстокий аудит проекту CSTL LIFE вцілому, всі сторінки,
// включаючи всі вкладки таббара, і окремі підсторінки в вкладці дошка в кнопці
// FAB — повідомлення, мої оголошення і тд. Включаючи бургер меню і навіть
// особистий кабінет. Все повністю, абсолютно навіть шапку профілю».
//
// Це НЕ стенд — тут нічого не «падає». Це прилад: обходить екрани в Chromium і
// збирає ОБЧИСЛЕНІ дані у `_ai-tools/APPLE_AUDIT_RAW.json`. Висновки робить
// людина у кроках 5-13 потоку, спираючись на ці числа.
//
// 🔴 ЧОМУ ОБЧИСЛЕНІ, А НЕ ТЕКСТ CSS. У проєкті це вже коштувало помилок:
// коментар стверджував, що в картки табла є обідок, а `border-top-width`
// дорівнював 0px. Читати наміри в коді — не вимірювання.
//
// 🔬 ЩО САМЕ МІРЯЄМО (номери § — розділи скіла `.claude/skills/apple-design/SKILL.md`)
//   §1  відгук   — чи має клікабельний вузол правило `:active`; tap-highlight
//   §10 жести    — розмір тап-цілі проти 44×44 (Apple HIG)
//   §3-4 рух     — усі живі `transition`: властивість, тривалість, крива
//   §12 матеріали— `backdrop-filter`, прозоре тло, СКЛО ПОВЕРХ СКЛА
//   §14 доступність — три `prefers-*`: чи міняється хоч щось при кожному
//   §15 типографіка — трійки «кегль ↔ tracking ↔ leading» на живому тексті
//
// ⚠️ ПАСТКА, ЯКУ ТУТ ОБІЙДЕНО: `:active` не існує в обчислених стилях узагалі —
// це стан, а не властивість. Тому правила з `:active` витягуються з
// `document.styleSheets`, у селектора віднімається сам `:active`, і вузол
// звіряється через `element.matches()`. Спроба «зміряти» це через
// `getComputedStyle` дала б нуль покриття на будь-якому коді — тобто збрехала б
// у страшний бік і дала б десятки вигаданих знахідок.
//
// ⚠️ `serviceWorkers: 'block'` — обовʼязково (восьмий випадок брехливої
// перевірки в проєкті: без цього запити йдуть повз `page.route`).
//
// 🔴 КОНТРОЛЬ ПРИЛАДУ (запускати перед тим, як вірити числам):
//     node tests/tools/apple-audit.mjs --selftest
// Сторінці підкидаються вузли з ЗАЗДАЛЕГІДЬ ВІДОМИМИ властивостями: дрібна
// кнопка без `:active`, кнопка з `:active`, скло поверх скла. Прилад мусить
// побачити рівно їх. Без цього кроку прилад — просто ще одна думка.
//
// Запуск:
//   node tests/tools/apple-audit.mjs tabs     # 5 вкладок таб-бару (крок 2)
//   node tests/tools/apple-audit.mjs fab      # підсторінки FAB Дошки (крок 3)
//   node tests/tools/apple-audit.mjs menus    # бургер, кабінет, картки (крок 4)
//   node tests/tools/apple-audit.mjs all
// Результат ДОПИСУЄТЬСЯ у `_ai-tools/APPLE_AUDIT_RAW.json` за ключем екрана —
// тобто три прогони складаються, а не затирають один одного.

import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { launch, serve, ROOT } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const OUT = join(ROOT, 'CSTL NEWS VOVA', '_ai-tools', 'APPLE_AUDIT_RAW.json');
const ARG = (process.argv[2] || 'tabs').replace(/^--/, '');

// ── Підроблені дані: рівно стільки, щоб екрани не були порожні ───────────────
// Порожній екран міряти немає сенсу: не буде ні карток, ні кнопок, ні тексту.
const NOW = new Date().toISOString();
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Вова' } };
const OTHER = 'u-other';
const POSTS = [
  { id: 'p-1', type: 'board', category: 'sell', title: 'ВЕЛОСИПЕД ДОРОСЛИЙ', text: 'Робочий стан, гальма нові. Віддам недорого, бо купив інший.',
    price: '2500', location: 'Олика', author: 'Петро', owner_uid: OTHER, contact: '', photos: [], status: 'published', published_at: NOW, created_at: NOW },
  { id: 'p-2', type: 'board', category: 'services', title: 'РЕМОНТ ВЗУТТЯ', text: 'Швидко і якісно.',
    price: '', location: 'Олика', author: 'Вова', owner_uid: ME.id, contact: '', photos: [], status: 'published', published_at: NOW, created_at: NOW },
  { id: 'd-1', type: 'discussion', category: '', title: 'Коли полагодять дорогу?', text: 'Питання до громади.',
    price: '', location: 'Олика', author: 'Петро', owner_uid: OTHER, contact: '', photos: [], status: 'published', published_at: NOW, created_at: NOW },
];
const THREADS = [{
  id: 't-1', post_id: 'p-2', author_uid: ME.id, buyer_uid: OTHER,
  author_name: 'Вова', buyer_name: 'Петро',
  last_message_at: NOW, last_message_text: 'Ще актуально?',
  post: { id: 'p-2', title: 'РЕМОНТ ВЗУТТЯ', status: 'published' },
}];
const PROFILES = [
  { uid: OTHER, name: 'Петро Коваль', avatar_url: '' },
  { uid: ME.id, name: 'Вова Шевчук', avatar_url: '' },
];

// ── ЗБИРАЧ, ЩО ПРАЦЮЄ ВСЕРЕДИНІ СТОРІНКИ ────────────────────────────────────
// Один великий рядок функції: її текст передається у браузер, тому вона не має
// права звертатись до нічого зовні.
const COLLECTOR = () => {
  const видимий = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && parseFloat(s.opacity) > 0.02;
  };
  const короткий = (t) => (t || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const імʼя = (el) => {
    const cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
  };

  // ── §1: селектори з :active з УСІХ таблиць стилів ──────────────────────────
  // Стан не існує в обчислених стилях — його треба діставати з правил.
  const активні = [];
  const обійти = (rules) => {
    for (const r of rules) {
      // 🔴 `@import` — це CSSImportRule, і його правила лежать у
      // `r.styleSheet.cssRules`, а НЕ в `r.cssRules`. Перша версія приладу
      // цього не знала і показала «0 правил :active на весь застосунок» при
      // реальних 125 — бо всі 20 файлів `style/*.css` підключені саме через
      // `@import` у `style.css`. Контроль тоді був зелений, бо підкидав
      // правила інлайновим <style>. Пʼятнадцятий випадок брехливої перевірки.
      if (r.styleSheet) обійтиБезпечно(r.styleSheet.cssRules);
      if (r.cssRules) обійтиБезпечно(r.cssRules);
      if (r.selectorText && r.selectorText.includes(':active')) активні.push(r.selectorText);
    }
  };
  const обійтиБезпечно = (rules) => { try { обійти(rules); } catch {} };
  for (const sheet of document.styleSheets) {
    try { обійти(sheet.cssRules); } catch {}   // чужий домен — пропускаємо
  }
  // Селектор «.a:active, .b .c:active» → базові «.a», «.b .c».
  const базові = [];
  for (const sel of активні) {
    for (const part of sel.split(',')) {
      const b = part.trim().replace(/:active\b/g, '').trim();
      if (b && !базові.includes(b)) базові.push(b);
    }
  }
  const маєActive = (el) => {
    for (const b of базові) { try { if (el.matches(b)) return true; } catch {} }
    return false;
  };

  // ── §1 + §10: клікабельні вузли ───────────────────────────────────────────
  const КЛІК = 'a,button,[role="button"],input,select,textarea,label[for],[onclick],[data-tab],[data-fab],[data-nav],[data-action],[tabindex]:not([tabindex="-1"])';
  const кандидати = new Set(document.querySelectorAll(КЛІК));
  // Плюс усе, що виглядає клікабельним через курсор (у проєкті багато делегатів
  // на `div` з `data-*`, і формальний список їх не покриє).
  for (const el of document.querySelectorAll('body *')) {
    if (кандидати.has(el)) continue;
    if (getComputedStyle(el).cursor === 'pointer') кандидати.add(el);
  }
  const цілі = [];
  for (const el of кандидати) {
    if (!видимий(el)) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    цілі.push({
      вузол: імʼя(el),
      текст: короткий(el.textContent),
      ш: Math.round(r.width), в: Math.round(r.height),
      active: маєActive(el),
      tapHighlight: s.webkitTapHighlightColor || '',
      transition: s.transitionProperty === 'none' ? '' : `${s.transitionProperty} ${s.transitionDuration} ${s.transitionTimingFunction}`,
      touchAction: s.touchAction,
    });
  }

  // ── §3-4: усі живі переходи й анімації ────────────────────────────────────
  const переходи = [];
  const анімації = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    const dur = s.transitionDuration || '0s';
    if (dur !== '0s' && dur !== '') {
      переходи.push({
        вузол: імʼя(el), властивість: s.transitionProperty,
        тривалість: dur, крива: s.transitionTimingFunction, затримка: s.transitionDelay,
        видимий: видимий(el),
      });
    }
    if (s.animationName && s.animationName !== 'none') {
      анімації.push({ вузол: імʼя(el), назва: s.animationName, тривалість: s.animationDuration,
        крива: s.animationTimingFunction, повтори: s.animationIterationCount });
    }
  }

  // ── §12: матеріали. Головне питання — СКЛО ПОВЕРХ СКЛА ────────────────────
  const прозоре = (bg) => {
    const m = /rgba?\(([^)]+)\)/.exec(bg);
    if (!m) return false;
    const p = m[1].split(',').map(x => parseFloat(x));
    return p.length > 3 && p[3] < 0.98;
  };
  const матеріали = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    const bf = s.backdropFilter || s.webkitBackdropFilter || 'none';
    if (bf === 'none' && !прозоре(s.backgroundColor)) continue;
    if (!видимий(el)) continue;
    const r = el.getBoundingClientRect();
    // Чи є скляний предок — «світле скло на світлому» зі скіла.
    let предокСкло = '';
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const as = getComputedStyle(a);
      const abf = as.backdropFilter || as.webkitBackdropFilter || 'none';
      if (abf !== 'none') { предокСкло = імʼя(a); break; }
    }
    матеріали.push({
      вузол: імʼя(el), blur: bf === 'none' ? '' : bf, тло: s.backgroundColor,
      площа: Math.round(r.width * r.height), тінь: s.boxShadow === 'none' ? '' : s.boxShadow.slice(0, 60),
      склоПоверхСкла: предокСкло,
    });
  }

  // ── §15: типографіка на ЖИВОМУ тексті ─────────────────────────────────────
  const типографіка = [];
  for (const el of document.querySelectorAll('body *')) {
    let свій = '';
    for (const n of el.childNodes) if (n.nodeType === 3) свій += n.nodeValue;
    if (!свій.trim() || !видимий(el)) continue;
    const s = getComputedStyle(el);
    типографіка.push({
      вузол: імʼя(el), текст: короткий(свій),
      кегль: parseFloat(s.fontSize),
      tracking: s.letterSpacing === 'normal' ? 0 : parseFloat(s.letterSpacing),
      leading: s.lineHeight === 'normal' ? 'normal' : +(parseFloat(s.lineHeight) / parseFloat(s.fontSize)).toFixed(2),
      вага: s.fontWeight,
      шрифт: (s.fontFamily || '').split(',')[0].replace(/["']/g, ''),
    });
  }

  // ── Прокрутники: під §9 (гумові межі) і §12 (контент під склом) ───────────
  const скролери = [];
  for (const el of document.querySelectorAll('body *')) {
    const s = getComputedStyle(el);
    const може = /(auto|scroll)/.test(s.overflowY + s.overflowX);
    if (!може || !видимий(el)) continue;
    if (el.scrollHeight <= el.clientHeight + 4 && el.scrollWidth <= el.clientWidth + 4) continue;
    скролери.push({ вузол: імʼя(el), overscroll: s.overscrollBehavior,
      анкер: s.overflowAnchor, вміст: el.scrollHeight, вікно: el.clientHeight });
  }

  return { цілі, переходи, анімації, матеріали, типографіка, скролери,
           правилActive: базові.length };
};

// ── Підпис екрана для порівняння `prefers-*` ────────────────────────────────
// Беремо стабільні властивості, на які скіл прямо вказує в §14.
const SIGNATURE = () => {
  const out = [];
  const all = document.querySelectorAll('body *');
  for (let i = 0; i < all.length && i < 1200; i++) {
    const s = getComputedStyle(all[i]);
    out.push([s.backgroundColor, s.backdropFilter || s.webkitBackdropFilter,
      s.transitionDuration, s.animationDuration, s.opacity, s.borderColor,
      s.color, s.boxShadow].join('|'));
  }
  return out;
};

// ── Навігація по екранах ────────────────────────────────────────────────────
const пауза = (p, ms) => p.waitForTimeout(ms);
const наВкладку = async (p, tab, ms = 1500) => {
  await p.evaluate(t => window.switchTab && window.switchTab(t), tab);
  await пауза(p, ms);
};
const закритиШари = async (p) => {
  // Повертаємось у спокійний стан між екранами: закриті модалки, закритий FAB.
  await p.evaluate(() => {
    document.querySelectorAll('.app-modal-close, .pm-screen [data-pm-back]').forEach(b => b.click?.());
    document.getElementById('sidebar-close')?.click();
  });
  await пауза(p, 600);
};
const відкритиFab = async (p, ключ) => {
  await наВкладку(p, 'board', 1200);
  await p.evaluate(() => document.getElementById('board-trigger')?.click());
  await пауза(p, 400);
  await p.evaluate(k => document.querySelector(`#board-fab-menu [data-fab="${k}"]`)?.click(), ключ);
  await пауза(p, 1600);
};

const ЕКРАНИ = {
  tabs: {
    'вкладка: Громада (Home)':   p => наВкладку(p, 'community'),
    'вкладка: Стрічка (shotam)': p => наВкладку(p, 'shotam'),
    'вкладка: Обговорення':      p => наВкладку(p, 'discussions'),
    'вкладка: Дошка':            p => наВкладку(p, 'board'),
    'вкладка: Автобуси':         p => наВкладку(p, 'buses'),
  },
  fab: {
    'FAB Дошки: меню':            async p => { await наВкладку(p, 'board', 1200);
                                               await p.evaluate(() => document.getElementById('board-trigger')?.click());
                                               await пауза(p, 500); },
    'FAB: Повідомлення':          p => відкритиFab(p, 'messages'),
    'FAB: Мої оголошення':        p => відкритиFab(p, 'mine'),
    'FAB: Збережені':             p => відкритиFab(p, 'saved'),
    'FAB: Подати оголошення':     p => відкритиFab(p, 'post'),
  },
  menus: {
    'Бургер-меню':      async p => { await наВкладку(p, 'community', 900);
                                     await p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
                                     await пауза(p, 700); },
    'Особистий кабінет': async p => { await наВкладку(p, 'community', 900);
                                      await p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
                                      await пауза(p, 500);
                                      await p.evaluate(() => document.querySelector('[data-nav="account"]')?.click());
                                      await пауза(p, 1500); },
    'Картка оголошення': async p => { await наВкладку(p, 'board', 1400);
                                      await p.evaluate(() => document.querySelector('#board-content .cm-board-note')?.click());
                                      await пауза(p, 1400); },
    'Правила Дошки':     async p => { await наВкладку(p, 'community', 900);
                                      await p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
                                      await пауза(p, 500);
                                      await p.evaluate(() => document.querySelector('[data-nav="boardrules"]')?.click());
                                      await пауза(p, 1200); },
  },
};

// ── КОНТРОЛЬ ПРИЛАДУ ────────────────────────────────────────────────────────
// Підкидаємо вузли з відомими наперед властивостями. Якщо прилад їх не бачить —
// усі його числа нічого не варті, і краще дізнатись це тут, ніж у звіті.
async function selftest(p) {
  const знайдено = await p.evaluate((код) => {
    const st = document.createElement('style');
    st.textContent = `
      #кт-скло{position:fixed;left:0;top:0;width:120px;height:60px;
        background:rgba(255,255,255,0.5);backdrop-filter:blur(10px);z-index:99999}
      #кт-скло2{width:40px;height:20px;background:rgba(255,255,255,0.4);backdrop-filter:blur(6px)}
      #кт-жива{position:fixed;left:0;top:70px;width:20px;height:20px;cursor:pointer}
      #кт-жива:active{transform:scale(0.9)}
      #кт-мертва{position:fixed;left:30px;top:70px;width:20px;height:20px;cursor:pointer;letter-spacing:3px;font-size:11px}`;
    document.head.appendChild(st);
    const скло = document.createElement('div'); скло.id = 'кт-скло';
    const скло2 = document.createElement('div'); скло2.id = 'кт-скло2'; скло.appendChild(скло2);
    const жива = document.createElement('button'); жива.id = 'кт-жива'; жива.textContent = 'A';
    const мертва = document.createElement('button'); мертва.id = 'кт-мертва'; мертва.textContent = 'Б';
    document.body.append(скло, жива, мертва);
    // eslint-disable-next-line no-eval
    const дані = eval('(' + код + ')()');
    скло.remove(); жива.remove(); мертва.remove(); st.remove();
    return {
      живаActive:   !!дані.цілі.find(c => c.вузол.includes('кт-жива'))?.active,
      мертваActive: !!дані.цілі.find(c => c.вузол.includes('кт-мертва'))?.active,
      мертваМала:   (дані.цілі.find(c => c.вузол.includes('кт-мертва'))?.ш || 99) < 44,
      склоПоверхСкла: !!дані.матеріали.find(m => m.вузол.includes('кт-скло2'))?.склоПоверхСкла,
      трекінг3:     дані.типографіка.find(t => t.вузол.includes('кт-мертва'))?.tracking,
      // 🔴 Два рядки нижче куплені живою поломкою приладу (див. коментар про
      // CSSImportRule вище). Перший контроль перевіряв лише ВЛАСНОРУЧ підкинуті
      // правила з інлайнового <style> — і був зелений на приладі, який не бачив
      // жодного з 125 справжніх правил `:active` проєкту.
      правилВсього:  дані.правилActive,
      живихРеальних: дані.цілі.filter(c => !c.вузол.includes('кт-') && c.active).length,
    };
  }, COLLECTOR.toString());

  const рядки = [
    ['кнопка З правилом :active — прилад бачить active', знайдено.живаActive === true],
    ['кнопка БЕЗ правила :active — прилад бачить її голою', знайдено.мертваActive === false],
    ['тап-ціль 20px виміряна як менша за 44px', знайдено.мертваМала === true],
    ['скло у склі впіймано як «скло поверх скла»', знайдено.склоПоверхСкла === true],
    ['tracking 3px прочитано числом', знайдено.трекінг3 === 3],
    [`🔴 правила з файлів, підключених через @import, ВИДНО (${знайдено.правилВсього} шт.)`,
      знайдено.правилВсього > 20],
    [`🔴 хоч один СПРАВЖНІЙ вузол застосунку має :active (${знайдено.живихРеальних} шт.)`,
      знайдено.живихРеальних > 0],
  ];
  let погано = 0;
  for (const [назва, добре] of рядки) { if (!добре) погано++; console.log(`${добре ? '✅' : '❌'} ${назва}`); }
  console.log(`\n${погано ? '❌' : '✅'} контроль приладу: ${рядки.length - погано}/${рядки.length}`);
  return погано === 0;
}

// ── Прогін ──────────────────────────────────────────────────────────────────
const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();
await mockSupabase(p,
  { posts: POSTS, threads: THREADS, messages: [], thread_user_state: [], announcements: [] },
  { user: ME, profiles: PROFILES });
await p.route('**://api.open-meteo.com/**', r => r.abort());

await p.goto(url, { waitUntil: 'domcontentloaded' });
await пауза(p, 1800);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await пауза(p, 300);
// Гейт правил Дошки: `dismissible:false`, тап повз нього не рятує — тільки кнопка.
await наВкладку(p, 'board', 1300);
await p.evaluate(() => document.querySelector('.brules-ok')?.click());
await пауза(p, 900);

if (ARG === 'selftest') {
  const добре = await selftest(p);
  await ctx.close(); await b.close(); await stop();
  process.exit(добре ? 0 : 1);
}

const групи = ARG === 'all' ? Object.keys(ЕКРАНИ) : [ARG];
const невідомі = групи.filter(g => !ЕКРАНИ[g]);
if (невідомі.length) {
  console.error(`Невідома група: ${невідомі.join(', ')}. Є: ${Object.keys(ЕКРАНИ).join(' | ')} | all | selftest`);
  await ctx.close(); await b.close(); await stop();
  process.exit(2);
}

const сховище = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { знято: '', екрани: {} };
сховище.знято = new Date().toISOString();

for (const g of групи) {
  for (const [назва, йти] of Object.entries(ЕКРАНИ[g])) {
    await закритиШари(p);
    try { await йти(p); } catch (e) { console.log(`⚠️  ${назва}: навігація впала — ${e.message}`); }

    const дані = await p.evaluate(COLLECTOR);

    // §14: три `prefers-*`. Підпис до і після — якщо діфу нема, підтримки нема.
    const база = await p.evaluate(SIGNATURE);

    // 🔴 ШУМОВИЙ ПОРІГ. Правило проєкту (CLAUDE.md, урок 27.07): перед
    // порівнянням двох станів зміряй порівняння стану З САМИМ СОБОЮ. Тут це не
    // формальність — на екрані живуть годинник, погода і смуга рейсу, тобто
    // частина «змін» приїде без жодного `prefers-*`. Усе, що менше або дорівнює
    // шуму, читати як «підтримки немає».
    await пауза(p, 350);
    const контрольний = await p.evaluate(SIGNATURE);
    let шум = 0;
    for (let i = 0; i < Math.min(база.length, контрольний.length); i++) if (база[i] !== контрольний[i]) шум++;

    const prefers = { шум };
    for (const [ключ, медіа] of [['reduced-motion', { reducedMotion: 'reduce' }],
                                 ['reduced-transparency', { media: [] }],   // ставиться нижче вручну
                                 ['contrast', { contrast: 'more' }]]) {
      try {
        if (ключ === 'reduced-transparency') {
          // Playwright не має окремого прапорця — ставимо через CDP-подібний шлях
          // емуляції медіа-фіч, який приймає довільні пари.
          await ctx.newCDPSession(p).then(s => s.send('Emulation.setEmulatedMedia',
            { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] }));
        } else {
          await p.emulateMedia(медіа);
        }
        await пауза(p, 350);
        const після = await p.evaluate(SIGNATURE);
        let змін = 0;
        for (let i = 0; i < Math.min(база.length, після.length); i++) if (база[i] !== після[i]) змін++;
        prefers[ключ] = { змінилось: змін, зі: Math.min(база.length, після.length) };
      } catch (e) {
        prefers[ключ] = { помилка: e.message };
      } finally {
        try { await p.emulateMedia({ reducedMotion: 'no-preference', contrast: 'no-preference' }); } catch {}
        try { const s = await ctx.newCDPSession(p); await s.send('Emulation.setEmulatedMedia', { features: [] }); } catch {}
        await пауза(p, 250);
      }
    }

    сховище.екрани[назва] = { ...дані, prefers };
    const малі = дані.цілі.filter(c => c.ш < 44 || c.в < 44).length;
    const безActive = дані.цілі.filter(c => !c.active).length;
    console.log(`📐 ${назва}: цілей ${дані.цілі.length} (без :active ${безActive}, менших за 44px ${малі}) · ` +
                `переходів ${дані.переходи.length} · матеріалів ${дані.матеріали.length} · ` +
                `тексту ${дані.типографіка.length} · prefers Δmotion ${prefers['reduced-motion']?.змінилось ?? '?'} ` +
                `Δtransp ${prefers['reduced-transparency']?.змінилось ?? '?'} Δcontrast ${prefers['contrast']?.змінилось ?? '?'} ` +
                `(шум ${prefers.шум})`);
  }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(сховище, null, 1));
console.log(`\n💾 ${OUT.replace(ROOT + '/', '')} — екранів у файлі: ${Object.keys(сховище.екрани).length}`);

await ctx.close(); await b.close(); await stop();
