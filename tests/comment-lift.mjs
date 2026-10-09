// Стенд: ЛИСТ КОМЕНТАРІВ — ТРЮК «ПОЛЕ НАГОРІ В МИТЬ ФОКУСА» (09.10.2026).
//
// 🗣️ Вова: «верх модалки коментарів підтягується до верхнього краю, але тягнеться
// як резина — пройшло і повернулося назад. Можемо, щоб плавно піднімалося й
// зупинялося?» Корінь — той самий, що в чаті (зсув webview від iOS + компенсація
// на кадр пізніше). Лікування — `setupFocusLift` (core/keyboard.js), уже
// перевірене Вовою на айфоні в чаті («Вийшло, стоїть на місці, ура»).
//
// 🔑 СПРАВЖНІЙ ЗАСТОСУНОК (bundle + мок Supabase), справжні дотики (CDP).
// visualViewport підмінено керованим об'єктом ДО завантаження застосунку.
// ⚠️ Стенд не доводить, що iOS справді не зсуне сторінку — це лише на айфоні.
// Стереже нашу частину: поле на мить над списком і невидиме, після клавіатури —
// на місці; кнопки смуги вводу — не наші; закритий лист не рахується «невдачею».
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const b = await launch(chromium);
const H = 844, KB = 336;

const iso = m => new Date(Date.now() - m * 60000).toISOString();
const pages = [{ id: 1, name: 'Olyka Castle', sort_order: 1 }];
const page_posts = [{ id: 701, page_id: 1, author: 'x', author_uid: 'u', text: 'Допис для коментарів.',
  image_urls: [], photos: [], created_at: iso(5), status: 'published', pages: { name: 'Olyka Castle', avatar_url: null } }];

const ctx = await b.newContext({ viewport: { width: 390, height: H }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.addInitScript(([h]) => {
  try { localStorage.setItem('cstl-legal-consent-v1', '05.10.2026'); } catch (_) {}
  const ls = { resize: [], scroll: [] };
  window.__vv = { height: h, width: 390, offsetTop: 0, offsetLeft: 0,
    addEventListener: (t, f) => ls[t]?.push(f),
    removeEventListener: (t, f) => { const a = ls[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } };
  Object.defineProperty(window, 'visualViewport', { value: window.__vv, configurable: true });
  window.__fire = () => ls.resize.forEach(f => f());
}, [H]);
const p = await ctx.newPage();
await mockSupabase(p, { posts: [], pages, page_posts, page_comments: [] }, {});
await p.goto(url + '/index.html');
await p.waitForTimeout(3500);
await p.getByText('Поки пропустити').click({ timeout: 500 }).catch(() => {});
await p.evaluate(() => window.switchTab('shotam'));
await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-comments="701"]')?.click());
await p.waitForTimeout(900);
ok('сцена: лист коментарів відкрито', await p.evaluate(() => !!document.querySelector('.fd-com-sheet .fd-com-input')), 'нема поля');

const cdp = await ctx.newCDPSession(p);
const тап = async (sel, рух = 0) => {
  const { x, y } = await p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  if (рух) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - рух }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x, y: y - рух }] });
};
const стан = () => p.evaluate(() => {
  const i = document.querySelector('.fd-com-input'), l = document.querySelector('.fd-com-list');
  return { фокус: document.activeElement === i, зсув: i?.style.transform || '', прозоре: i?.style.opacity === '0',
    верхПоля: Math.round(i.getBoundingClientRect().top), верхСписку: Math.round(l.getBoundingClientRect().top),
    kb: document.querySelector('.fd-com-sheet')?.classList.contains('fd-com-sheet--kb'),
    невдачі: localStorage.getItem('cstl-kb-lift-fail'), вимкнено: localStorage.getItem('cstl-kb-lift-off') };
});

// 1. Тап великим пальцем (прокочування 18px) по полю коментаря.
await тап('.fd-com-input', 18);
await p.waitForTimeout(80);
const піднято = await стан();
ok('🔴 тап у поле: фокус є, поле на мить над списком і невидиме',
   піднято.фокус && /translateY\(-/.test(піднято.зсув) && піднято.прозоре && піднято.верхПоля <= піднято.верхСписку + 12,
   JSON.stringify(піднято));

// 2. Клавіатура з'явилась (видима область стиснулась) → поле на місці.
await p.evaluate(([h, kb]) => { window.__vv.height = h - kb; window.__fire(); }, [H, KB]);
await p.waitForTimeout(80);
const сіло = await стан();
ok('🔴 клавіатура з\'явилась → поле на місці й видиме, лист у режимі клавіатури', сіло.kb && !сіло.зсув && !сіло.прозоре, JSON.stringify(сіло));

// 3. Клавіатура сховалась → нічого не висить.
await p.evaluate((h) => { document.querySelector('.fd-com-input').blur(); window.__vv.height = h; window.__fire(); }, H);
await p.waitForTimeout(80);
const пішла = await стан();
ok('клавіатура сховалась → нічого не висить', !пішла.kb && !пішла.зсув && !пішла.прозоре && !пішла.фокус, JSON.stringify(пішла));

// 4. Кнопка «Надіслати» у смузі вводу — не наш тап: поле не стрибає нагору.
await тап('.fd-com-send');
await p.waitForTimeout(80);
const кнопка = await стан();
ok('тап по кнопці смуги вводу — поле не підіймається (це кнопка, не поле)', !кнопка.зсув, JSON.stringify(кнопка));

// 5. Тап у поле і одразу закрити лист (до 1.5 с) — це не «невдача трюку».
// 📐 Мутаціями заміряно: захисти тут ДВА і кожен окремо тримає — `blur` поля при
// закритті скидає страховку, і `stopLift()` у `close`. Червоніє лише без обох.
await p.evaluate(() => localStorage.removeItem('cstl-kb-lift-fail'));
await тап('.fd-com-input');
await p.waitForTimeout(100);
await p.keyboard.press('Escape');
await p.waitForTimeout(1800);
const закрито = await p.evaluate(() => ({ лист: !!document.querySelector('.fd-com-sheet'), невдачі: localStorage.getItem('cstl-kb-lift-fail') }));
ok('🛑 лист закрили одразу після тапу — лічильник невдач трюку не росте', !закрито.лист && !закрито.невдачі, JSON.stringify(закрито));

await b.close(); await stop();
done();
