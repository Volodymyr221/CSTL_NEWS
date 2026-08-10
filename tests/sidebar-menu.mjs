// Стенд: РЕДИЗАЙН БУРГЕР-МЕНЮ (10.08, макет Вови).
//
// Замовлення: «редизайн бургер меню, +- так як на фото, особливо особистий
// кабінет треба зробити так… типу імʼя і знизу особистий кабінет… тому що навіть
// колір бежевий там, а ми його з проєкту прибрали».
//
// 🔴 ЧОГО ЦЕЙ СТЕНД НЕ РОБИТЬ: не стереже механіку відкриття. Її вже стережуть
// `sidebar-account.mjs` (11) і `sidebar-overlay.mjs` (27) — за ними стоять три
// полагоджені баги, і редизайн їх не чіпав. Дублювати означало б завести другу
// копію правди, яка колись розійдеться з першою.
//
// 🔬 ЩО СТЕРЕЖЕ: чотири речі, які легко зламати мовчки.
//   1. Беж не повернеться. Міряється ТЕПЛОТА обчисленого кольору (R−B), а не
//      наявність слова в CSS: інакше перевірку обходив би будь-який новий hex.
//      Поріг 6 — той самий, що в `board-cream.mjs` (нейтраль ≤3, найслабший
//      кремовий `#FAF8EF` = 11), тобто лежить у розриві між родинами.
//   2. Картка профілю має ОБИДВА стани. Гість — найчастіший стан для нової
//      людини, і в макеті його не було; порожня картка тут була б регресом.
//   3. Контраст тихого тексту рахується з ЖИВИХ кольорів на ЖИВИХ підкладках.
//      Саме тут перша редакція й помилилась: колір із головної (`#6E727A`) на
//      сірому тлі меню дає 3.86 замість 4.5, а в коментарі стояло вигадане
//      «4.6:1». Число, якого ніхто не міряв, — не число.
//   4. Пастка `data-account-btn` на картці профілю. Якби її поставили,
//      `refreshAccountButtons()` переписав би картку на самий кружечок аватара,
//      а `handleNav` почав би клікати сам себе. Симптом виглядав би як «кабінет
//      не відкривається», тобто знову B-31 — тому сторож саме на причину.
//
// ⚠️ `serviceWorkers: 'block'` — восьмий випадок брехливої перевірки в проєкті.
//
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     BUNDLE_REV=origin/main CSS_REV=origin/main node tests/sidebar-menu.mjs
// на коді ДО редизайну мусять упасти перевірки бежу, карток, груп, шевронів,
// підписів соцмереж і хрестика 44px.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';
const CSS_REV = process.env.CSS_REV || '';
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Володимир' } };

const { url, stop } = await serve();
const b = await launch(chromium);

async function сторінка(user) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  await mockSupabase(p,
    { posts: [], threads: [], messages: [], thread_user_state: [], announcements: [] },
    { user, profiles: user ? [{ uid: 'u-me', name: 'Володимир', avatar_url: '' }] : [] });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  if (REV) {
    const body = projectFile('bundle.js', REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
  }
  if (CSS_REV) {
    const body = projectFile('style/sidebar.css', CSS_REV);
    await p.route('**/style/sidebar.css', r => r.fulfill({ contentType: 'text/css; charset=utf-8', body }));
  }
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1600);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });
  return { ctx, p };
}

const відкрити = async p => {
  await p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
  await p.waitForTimeout(500);
};

// ── ЖИТЕЛЬ УВІЙШОВ ──────────────────────────────────────────────────────────
const { ctx, p } = await сторінка(ME);
await p.evaluate(() => window.switchTab && window.switchTab('buses'));
await p.waitForTimeout(900);
await відкрити(p);

// 1. БЕЖУ НЕМАЄ. Міряємо теплоту живого кольору, а не текст правила.
const тло = await p.evaluate(() => {
  const s = getComputedStyle(document.getElementById('sidebar'));
  const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor);
  const [r, g, bl] = m ? m[1].split(',').map(Number) : [0, 0, 0];
  return { hex: s.backgroundColor, теплота: r - bl };
});
ok('🔴 тло меню НЕ кремове (теплота R−B ≤ 6; у бежу #F4F1E6 вона 14)',
   тло.теплота <= 6, `${тло.hex} · теплота ${тло.теплота}`);

// 2. КАРТКА ПРОФІЛЮ — імʼя і підпис під ним, як у блоці автора оголошення.
const картка = await p.evaluate(() => {
  const el = document.querySelector('.sb-card--me');
  if (!el) return null;
  return {
    імʼя: el.querySelector('.sb-card-name')?.textContent.trim() || '',
    підпис: el.querySelector('.sb-card-sub')?.textContent.trim() || '',
    аватар: !!el.querySelector('.sb-av'),
    шеврон: !!el.querySelector('.sb-card-go'),
    висота: Math.round(el.getBoundingClientRect().height),
    хибнийАтрибут: el.hasAttribute('data-account-btn'),
    веде: el.dataset.nav,
  };
});
ok('🔴 картка профілю: імʼя людини + підпис «Особистий кабінет» під ним',
   !!картка && картка.імʼя === 'Володимир' && картка.підпис === 'Особистий кабінет',
   картка ? `${картка.імʼя} / ${картка.підпис}` : 'картки немає');
ok('картка має аватар і шеврон (та сама конструкція, що автор оголошення)',
   !!картка && картка.аватар && картка.шеврон);
ok('картка веде в кабінет (data-nav="account" — шлях B-31 лишився той самий)',
   !!картка && картка.веде === 'account', картка ? картка.веде : '—');
// 🔴 Сторож саме на пастку, а не на вигляд.
ok('🔴 на картці НЕМАЄ `data-account-btn` (інакше її переписав би refreshAccountButtons)',
   !!картка && !картка.хибнийАтрибут);

// 3. АДМІНКА — окрема картка, і для не-команди схована.
const адмінка = await p.evaluate(() => {
  const el = document.querySelector('.sb-card--admin');
  return el ? { є: true, схована: el.hidden, підпис: el.querySelector('.sb-card-sub')?.textContent.trim() } : null;
});
ok('Адмінка — окрема картка з підписом «Панель керування»',
   !!адмінка && адмінка.підпис === 'Панель керування', адмінка ? адмінка.підпис : 'немає');
ok('🛑 Адмінка схована від того, хто не в команді (сторож на сервері не змінився)',
   !!адмінка && адмінка.схована === true);

// 4. НАЗВАНІ ГРУПИ замість анонімних ліній.
const групи = await p.evaluate(() =>
  [...document.querySelectorAll('.sb-cap')].map(e => e.textContent.trim().toLowerCase()));
ok('🔴 групи НАЗВАНІ: «Розділи» і «Інформація»',
   групи.includes('розділи') && групи.includes('інформація'), групи.join(' · '));
ok('розділових ліній-без-назви більше немає',
   await p.evaluate(() => !document.querySelector('.sidebar-divider')));

// 5. ШЕВРОНИ — кожен рядок каже, що веде кудись.
const рядки = await p.evaluate(() => {
  const els = [...document.querySelectorAll('.sidebar-item')];
  // ⚠️ Висоту міряємо лише у ВИДИМИХ рядків. Схований (`display:none`) віддає 0,
  // і перша редакція чесно рахувала його «нижчим за 44px» — тобто звітувала про
  // замалу ціль там, де цілі взагалі немає. Контроль це й показав: на старому
  // коді «1 нижче норми» був схований пункт Адмінки, а не справжня проблема.
  const видимі = els.filter(e => e.offsetParent !== null);
  return {
    всього: els.length,
    видимих: видимі.length,
    зШевроном: els.filter(e => e.querySelector('.sidebar-item-go')).length,
    нижче44: видимі.filter(e => e.getBoundingClientRect().height < 44).length,
  };
});
ok('🔴 кожен рядок меню має шеврон', рядки.всього > 0 && рядки.зШевроном === рядки.всього,
   `${рядки.зШевроном} з ${рядки.всього}`);
ok('жоден ВИДИМИЙ рядок не нижчий за 44px (Apple HIG)', рядки.нижче44 === 0,
   `видимих ${рядки.видимих} · нижче норми: ${рядки.нижче44}`);

// 6. «ТИ ЗАРАЗ ТУТ» — рівно одна позначка, і на тій вкладці, де ми стоїмо.
const тут = await p.evaluate(() => {
  const dots = [...document.querySelectorAll('.sidebar-item-dot')];
  const own = dots.map(d => d.closest('.sidebar-item')?.dataset.nav);
  return { кількість: dots.length, на: own };
});
ok('🔴 позначка «ти зараз тут» рівно одна і саме на активній вкладці',
   тут.кількість === 1 && тут.на[0] === 'buses', `${тут.кількість} шт · ${тут.на.join(',')}`);

// 7. ЛІЧИЛЬНИК ВЕРСІЇ — одне джерело, не другий рядок у розмітці.
const версія = await p.evaluate(() => ({
  вМеню: document.getElementById('sidebar-ver')?.textContent.trim() || '',
  вШапці: document.querySelector('.deploy-stamp')?.textContent.trim() || '',
}));
ok('лічильник версії в меню дорівнює лічильнику в шапці (одне джерело)',
   !!версія.вМеню && версія.вМеню === версія.вШапці,
   `меню «${версія.вМеню}» · шапка «${версія.вШапці}»`);

// 8. ТАП-ЦІЛІ хрестика і соцмереж.
const цілі = await p.evaluate(() => {
  const r = el => el ? Math.round(Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height)) : 0;
  const соц = [...document.querySelectorAll('.sb-social-btn')];
  return {
    хрестик: r(document.getElementById('sidebar-close')),
    соцМін: соц.length ? Math.min(...соц.map(e => Math.round(e.getBoundingClientRect().height))) : 0,
    соцПідписи: соц.map(e => e.querySelector('.sb-social-lb')?.textContent.trim()).filter(Boolean),
  };
});
ok('🔴 хрестик ≥ 44px (був 34 — єдина ціль нижче норми після деплою про тап-цілі)',
   цілі.хрестик >= 44, `${цілі.хрестик}px`);
ok('кнопки соцмереж ≥ 44px', цілі.соцМін >= 44, `${цілі.соцМін}px`);
ok('🔴 соцмережі ПІДПИСАНІ, а не два голі кружечки',
   цілі.соцПідписи.length === 2, цілі.соцПідписи.join(' · ') || 'підписів немає');

// 9. ♿ КОНТРАСТ — рахуємо з живих кольорів на живих підкладках.
// Саме ця перевірка спіймала б вигадане «4.6:1» у першій редакції.
const контраст = await p.evaluate(() => {
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const rgb = s => { const m = /rgba?\(([^)]+)\)/.exec(s); return m ? m[1].split(',').map(Number) : null; };
  const L = a => 0.2126 * lin(a[0]) + 0.7152 * lin(a[1]) + 0.0722 * lin(a[2]);
  // Підкладка = перший предок із НЕпрозорим фоном. Саме тут ховалась помилка:
  // напівпрозорий тінт домішується до того, що під ним.
  const під = el => {
    for (let n = el; n; n = n.parentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c && (c[3] === undefined || c[3] > 0.99)) return c;
    }
    return [255, 255, 255];
  };
  const k = el => {
    const f = rgb(getComputedStyle(el).color), b = під(el);
    const [x, y] = [L(f), L(b)].sort((p, q) => q - p);
    return +((x + 0.05) / (y + 0.05)).toFixed(2);
  };
  const out = [];
  for (const sel of ['.sb-cap', '.sb-card--me .sb-card-sub', '.sb-card--admin .sb-card-sub', '.sb-social-cap']) {
    const el = document.querySelector(sel);
    if (el) out.push({ sel, k: k(el) });
  }
  return out;
});
const слабкі = контраст.filter(c => c.k < 4.5);
ok('♿ увесь тихий текст меню тримає 4.5:1 на СВОЇЙ підкладці',
   контраст.length >= 3 && слабкі.length === 0,
   контраст.map(c => `${c.sel} ${c.k}`).join(' · '));

await ctx.close();

// ── ГІСТЬ (не увійшов) ──────────────────────────────────────────────────────
// Стану немає в макеті, але він найчастіший для нової людини.
const { ctx: ctx2, p: p2 } = await сторінка(null);
await відкрити(p2);
const гість = await p2.evaluate(() => {
  const el = document.querySelector('.sb-card--me');
  if (!el) return null;
  return {
    імʼя: el.querySelector('.sb-card-name')?.textContent.trim() || '',
    підпис: el.querySelector('.sb-card-sub')?.textContent.trim() || '',
    гостьоваІконка: !!el.querySelector('.sb-av--guest'),
  };
});
ok('🔴 гість бачить не порожню картку, а запрошення увійти',
   !!гість && гість.імʼя === 'Приєднатись' && /Google/.test(гість.підпис),
   гість ? `${гість.імʼя} / ${гість.підпис}` : 'картки немає');
ok('у гостя замість аватара — іконка людини, а не битий кружечок',
   !!гість && гість.гостьоваІконка);

await ctx2.close(); await b.close(); await stop();
done();
