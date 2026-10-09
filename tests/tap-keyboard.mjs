// Стенд: КНОПКА ПРИ ВІДКРИТІЙ КЛАВІАТУРІ — З ПЕРШОГО ТАПУ (09.10.2026).
//
// 🗣️ Вова: «натискаю "Надіслати" — ховається клавіатура, але не надсилається;
// натискаю ще раз — надсилається». Те саме з «Опублікувати» і в повідомленнях Дошки.
// Лікування — `keepKeyboardOnTap` / `keepKeyboardOnTapIn` у core/keyboard.js:
// дія на відпусканні пальця (`touchend` → preventDefault → програмний click).
//
// ⚠️ ЧОГО СТЕНД НЕ ДОВОДИТЬ: сам баг iOS (фокус злітає на «сумісних» мишачих подіях)
// у Chromium не відтворюється — тут він і з ліками 26.07 тримав фокус. Тому стенд
// стереже те, що МОЖНА виміряти: справжній дотик (CDP touch) дає РІВНО одну дію,
// поле лишається у фокусі, гортання і вимкнена кнопка — нуль дій, а кожна кнопка
// відправки в застосунку справді під'єднана. Остаточно — на айфоні.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { ROOT, launch, reporter } from './_lib.mjs';

const { ok, done } = reporter();
const KB_SRC = readFileSync(`${ROOT}/src/core/keyboard.js`, 'utf8').replace(/^export /gm, '');

const PAGE = `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;font:16px sans-serif} button{width:120px;height:48px} input{width:200px;height:40px}</style>
</head><body>
<div id="bar"><input id="inp"><button id="send" type="button">Надіслати</button><button id="x" type="button">✕</button></div>
<form id="f"><input id="inp2"><button id="sub" type="submit">Опублікувати</button></form>
<button id="off" type="button" disabled>Вимкнена</button>
<script>
  window.n = { send: 0, x: 0, sub: 0, off: 0 };
  ${KB_SRC}
  const send = document.getElementById('send');
  // Як у коментарях Стрічки: окрема кнопка + загальний обробник рядка вводу.
  keepKeyboardOnTap(send);
  keepKeyboardOnTapIn(document.getElementById('bar'));
  send.addEventListener('click', () => n.send++);
  document.getElementById('x').addEventListener('click', () => n.x++);
  keepKeyboardOnTap(document.getElementById('sub'));
  document.getElementById('f').addEventListener('submit', e => { e.preventDefault(); n.sub++; });
  const off = document.getElementById('off');
  keepKeyboardOnTap(off);
  off.addEventListener('click', () => n.off++);
</script></body></html>`;

const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.setContent(PAGE);
const cdp = await ctx.newCDPSession(p);

const центр = sel => p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
async function дотик(sel, зсув = 0) {
  const { x, y } = await центр(sel);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  if (зсув) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + зсув }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(150);
}
const стан = () => p.evaluate(() => ({ ...window.n, фокус: document.activeElement?.id || '' }));

await p.focus('#inp');
await дотик('#send');
let s = await стан();
ok('🔴 один дотик «Надіслати» = рівно одна відправка', s.send === 1, JSON.stringify(s));
ok('🔴 поле лишилось у фокусі (клавіатура не ховається)', s.фокус === 'inp', `фокус: ${s.фокус}`);

await дотик('#x');
s = await стан();
ok('кнопка рядка вводу (✕) через загальний обробник — одна дія, фокус на місці', s.x === 1 && s.фокус === 'inp', JSON.stringify(s));

await дотик('#send', 40);
s = await стан();
ok('🛑 палець поїхав (гортання / передумав) — відправки нема', s.send === 1, JSON.stringify(s));

await p.focus('#inp2');
await дотик('#sub');
s = await стан();
ok('submit-кнопка форми: один дотик = одна відправка форми', s.sub === 1 && s.фокус === 'inp2', JSON.stringify(s));

await дотик('#off');
s = await стан();
ok('🛑 вимкнена кнопка («Публікую…») — нуль дій', s.off === 0, JSON.stringify(s));

// Мишка (компʼютер) — звичайний шлях.
const m = await b.newPage({ viewport: { width: 1200, height: 700 } });
await m.setContent(PAGE);
await m.focus('#inp');
await m.click('#send');
const мс = await m.evaluate(() => ({ ...window.n, фокус: document.activeElement?.id || '' }));
ok('мишка: один клік = одна відправка, фокус у полі', мс.send === 1 && мс.фокус === 'inp', JSON.stringify(мс));

// ── Кожна кнопка відправки в застосунку справді під'єднана ─────────────────
const файл = f => readFileSync(`${ROOT}/${f}`, 'utf8');
const має = (f, re) => re.test(файл(f));
const точки = [
  ['коментар у Стрічці', 'src/tabs/feed.js', /keepKeyboardOnTap\(sendBtn\);\s*\n[\s\S]{0,400}sendBtn\.addEventListener\('click', send\)/],
  ['«Опублікувати» допису', 'src/tabs/feed.js', /querySelector\('\.fd-comp-send'\);[\s\S]{0,200}keepKeyboardOnTap\(sendBtn\)/],
  ['повідомлення на Дошці', 'src/tabs/board-chat.js', /keepKeyboardOnTap\(api\.screen\.querySelector\('\.pm-send'\)\)/],
  ['відповідь у Питаннях', 'src/tabs/board-discussions.js', /keepKeyboardOnTap\(screen\.querySelector\('\.qa-send'\)\)/],
  ['групи', 'src/core/messages-ui.js', /keepKeyboardOnTap\(form\.querySelector\('\.pm-send'\)\)/],
  ['оголошення Дошки', 'src/tabs/community-modal.js', /keepKeyboardOnTap\(wrap\.querySelector\('\.cm-board-submit'\)\)/],
  ['скарга на оголошення', 'src/tabs/board.js', /keepKeyboardOnTap\(send\)/],
  ['заявка у фонд', 'src/tabs/fund-screen.js', /keepKeyboardOnTap\(btn\)/],
];
const бракує = точки.filter(([, f, re]) => !має(f, re)).map(([н]) => н);
ok('🔴 усі 8 кнопок відправки під\'єднані', !бракує.length, бракує.length ? 'бракує: ' + бракує.join(', ') : 'усі');

await b.close();
done();
