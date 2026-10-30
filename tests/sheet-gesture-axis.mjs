// Стенд: НАПРЯМОК ЖЕСТУ НА АРКУШІ ВИРІШУЄТЬСЯ ОДИН РАЗ (30.10).
//
// 🗣️ Вова (аркуш дня погоди): «коли свайпаю до низу то вміст в модалці "плаває"
// в ліво, в право, вверх, вниз». Причина — два рухи разом: `attachSheetDismiss`
// тягнув аркуш `transform`ом, а iOS уже вела свою прокрутку (гума аркуша / стрічка
// годин убік), бо перший рух пальця був убік чи вгору і `preventDefault` не прозвучав.
//
// 🔑 Що міряємо: справжній `attachSheetDismiss` (зібраний esbuild тим самим шляхом,
// що й `bundle.js`) на голому аркуші. Події — справжні `TouchEvent` з потрібним
// `cancelable`: саме `cancelable = false` і є «iOS уже прокручує».
// ⚠️ Межа стенда: гуму iOS Chromium не відтворює. Стенд доводить ПРАВИЛО (коли
// аркуш рухається, а коли ні), а не вигляд на айфоні — це перевіряє палець.
//
// 🔴 КОНТРОЛЬ: на коді до 30.10 мусять почервоніти «убік», «вгору→вниз» і
// «нескасовна подія»; «чисто вниз» і «тремтіння» зелені і там (це межа, не недогляд).
//
// Запуск: node tests/sheet-gesture-axis.mjs

import { chromium } from 'playwright';
import { buildSync } from 'esbuild';
import { ROOT, launch, reporter } from './_lib.mjs';

const { ok, done } = reporter();

const js = buildSync({
  entryPoints: [`${ROOT}/src/core/sheet-motion.js`],
  bundle: true, format: 'iife', globalName: 'SM', write: false,
}).outputFiles[0].text;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;overflow:hidden}
  #p{position:fixed;left:0;right:0;bottom:0;height:500px;overflow-y:auto;background:#2E6FC4}
  #c{height:1200px}
</style></head><body><div id="p"><div id="c"></div></div>
<script>${js}
const panel = document.getElementById('p');
SM.attachSheetDismiss({ panel, onDismiss() {} });
const T = (x, y) => new Touch({ identifier: 1, target: panel, clientX: x, clientY: y });
// Жест: список точок; cancelableFrom — з якого кроку руху iOS «уже прокручує».
window.__жест = (точки, cancelableFrom = Infinity) => {
  panel.style.transform = ''; panel.scrollTop = 0;
  const [x0, y0] = точки[0];
  panel.dispatchEvent(new TouchEvent('touchstart', { touches: [T(x0, y0)], bubbles: true, cancelable: true }));
  let заблоковано = 0, макс = 0;
  точки.slice(1).forEach(([x, y], i) => {
    const e = new TouchEvent('touchmove', { touches: [T(x, y)], bubbles: true, cancelable: i < cancelableFrom });
    panel.dispatchEvent(e);
    if (e.defaultPrevented) заблоковано++;
    const m = /translateY\\(([-\\d.]+)px\\)/.exec(panel.style.transform);
    if (m) макс = Math.max(макс, +m[1]);
  });
  const зсув = макс;
  const кінець = +((/translateY\\(([-\\d.]+)px\\)/.exec(panel.style.transform) || [0, 0])[1]);
  // touchend не шлемо: доїзд finishSwipe тут не предмет виміру.
  panel.dispatchEvent(new TouchEvent('touchcancel', { touches: [], bubbles: true }));
  return { зсув, заблоковано, кінець };
};
</script></body></html>`;

const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
const p = await ctx.newPage();
const впало = [];
p.on('pageerror', e => впало.push(e.message));
await p.setContent(html);

const жест = (точки, від) => p.evaluate(([t, v]) => window.__жест(t, v ?? Infinity), [точки, від ?? null]);
const вниз = (x, y0, кроки, крок = 15) => Array.from({ length: кроки }, (_, i) => [x, y0 + i * крок]);

// ── 1. ЧИСТО ВНИЗ — аркуш їде, нативне заблоковано ──────────────────────────
const a = await жест(вниз(195, 400, 8));
ok('чисто вниз: аркуш їде за пальцем', a.зсув >= 90, `зсув ${a.зсув}px`);
ok('чисто вниз: нативна прокрутка заблокована (preventDefault)', a.заблоковано >= 6, `${a.заблоковано} подій`);

// ── 2. 🔴 УБІК (стрічка годин), потім униз — аркуш НЕ чіпаємо ────────────────
const б = await жест([[195, 400], [215, 404], [240, 410], [250, 440], [255, 480], [260, 520]]);
ok('🔴 перший рух убік → аркуш не рухається до кінця жесту', б.зсув === 0, `зсув ${б.зсув}px`);
ok('🔴 убік → системі нічого не заблоковано (стрічка гортається)', б.заблоковано === 0, `${б.заблоковано} подій`);

// ── 3. 🔴 ВГОРУ, потім униз — це прокрутка вмісту, не закриття ───────────────
const в = await жест([[195, 400], [195, 392], [195, 384], [195, 420], [195, 470], [195, 520]]);
ok('🔴 перший рух угору → аркуш не підхоплюється на зворотному русі', в.зсув === 0, `зсув ${в.зсув}px`);

// ── 4. 🔴 iOS УЖЕ ПРОКРУЧУЄ (подія нескасовна) — transform не накладаємо ──────
const г = await жест(вниз(195, 400, 8), 2);
ok('🔴 нескасовна подія → аркуш відпускає жест (без «плавання» поверх прокрутки)',
   г.кінець === 0, `наприкінці ${г.кінець}px · максимум ${г.зсув}px (перші 2 кроки ще скасовні)`);

// ── 5. ТРЕМТІННЯ ПАЛЬЦЯ (2px угору) не зриває свайп-закриття ──────────────────
const д = await жест([[195, 400], [196, 398], [195, 410], [195, 440], [195, 480], [195, 520]]);
ok('тремтіння 2px угору на старті не скасовує закриття', д.зсув >= 100, `зсув ${д.зсув}px`);

ok('жодної помилки на сторінці', впало.length === 0, впало.join(' · ') || 'чисто');
await b.close();
done();
