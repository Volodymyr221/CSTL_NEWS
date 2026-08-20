// Стенд №25: КНОПКА В ТОСТІ СПРАВДІ НАТИСКАЄТЬСЯ («Видалено · Скасувати»).
//
// 🔴 НАВІЩО ЦЕ ОКРЕМИЙ СТЕНД І ЧОМУ САМЕ ТАК МІРЯЄМО.
// `.toast` має `pointer-events: none` СВІДОМО (щоб 3-6 секунд не з'їдати тапи по шапці
// і бару «назад»). Отже кнопка всередині нього мертва за замовчуванням: намальована,
// на місці, з правильним текстом — і тап провалюється НАСКРІЗЬ. Це ламається МОВЧКИ,
// без жодної помилки в консолі.
// Тому критерій — не «чи є кнопка» і не «чи є в CSS pointer-events», а справжній ТАП
// пальцем по її координатах і факт, що обробник спрацював.
//
// ⚠️ Перевіряємо ще й ЗВОРОТНЕ: решта коробки тоста мусить лишитись прохідною —
// інакше ми полагодили кнопку і зламали те, для чого `pointer-events: none` ставили.
import { chromium } from 'playwright';
import { launch, projectFile, reporter, baseCss} from './_lib.mjs';

const BASE_CSS = baseCss();
const UTILS_JS = projectFile('src/core/utils.js');

const { ok, done } = reporter();

// Сторож присутності: без цього рядка «Скасувати» не працює взагалі.
if (!/\.toast--action\s+\.toast-action\s*\{[^}]*pointer-events:\s*auto/.test(BASE_CSS)) {
  console.log('❌ у base.css немає `pointer-events: auto` на .toast--action .toast-action');
  console.log('   Без нього кнопка тоста мертва МОВЧКИ — намальована, але тап іде наскрізь.');
  process.exit(1);
}
// І що `showToast` узагалі приймає дію (а не ми перевіряємо CSS від неіснуючої фічі).
if (!/export function showToast\(msg[^)]*action\s*=\s*null\)/.test(UTILS_JS)) {
  console.log('❌ showToast більше не приймає `action` — стенд перевіряє неіснуючу фічу');
  process.exit(1);
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
* { animation: none !important; transition: none !important; }
/* Ціль ПІД тостом — нею перевіряємо, що коробка лишилась прохідною для пальця. */
#under { position: fixed; top: 0; left: 0; right: 0; height: 120px; }
</style></head><body>
<div id="under"></div>
<script>
  window.hits = { action: 0, under: 0 };
  document.getElementById('under').addEventListener('click', () => window.hits.under++);
</script>
</body></html>`;

const browser = await launch(chromium);
const pg = await browser.newPage({ viewport: { width: 390, height: 844 } });
await pg.setContent(PAGE);

// Будуємо тост рівно так, як це робить toastShow() із дією.
await pg.evaluate(() => {
  const t = document.createElement('div');
  t.id = 'cstl-toast';
  t.className = 'toast toast--action visible';
  const span = document.createElement('span');
  span.className = 'toast-text';
  span.textContent = 'Розмову з Андрієм видалено';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'toast-action';
  btn.textContent = 'Скасувати';
  btn.addEventListener('click', () => { window.hits.action++; });
  t.append(span, btn);
  document.body.appendChild(t);
});

const geo = await pg.evaluate(() => {
  const t = document.getElementById('cstl-toast');
  const b = t.querySelector('.toast-action').getBoundingClientRect();
  const box = t.getBoundingClientRect();
  return {
    btn: { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), w: Math.round(b.width), h: Math.round(b.height) },
    boxLeftX: Math.round(box.x + 8), boxY: Math.round(box.y + box.height / 2),
    pe: getComputedStyle(t).pointerEvents,
    btnPe: getComputedStyle(t.querySelector('.toast-action')).pointerEvents,
  };
});

// ── 0) ШУМ: коробка тоста і далі НЕ ловить тапи (те, для чого pointer-events:none) ──
ok('коробка тоста лишилась прохідною', geo.pe === 'none', `pointer-events: ${geo.pe}`);
ok('кнопка має власні тапи', geo.btnPe === 'auto', `pointer-events: ${geo.btnPe}`);

// ── 1) ГОЛОВНЕ: справжній тап по кнопці доходить до обробника ────────────────
await pg.mouse.click(geo.btn.x, geo.btn.y);
let hits = await pg.evaluate(() => window.hits);
ok('тап по «Скасувати» спрацював', hits.action === 1, `спрацювань: ${hits.action}`);

// ── 2) ЗВОРОТНЕ: тап по коробці ПОВЗ кнопку іде наскрізь, до елемента під тостом ──
await pg.mouse.click(geo.boxLeftX, geo.boxY);
hits = await pg.evaluate(() => window.hits);
ok('тап по тексту тоста проходить наскрізь', hits.under === 1,
   `елемент під тостом отримав ${hits.under} тап(ів)`);
ok('тап повз кнопку не викликав дію', hits.action === 1, `дія спрацювала разів: ${hits.action}`);

// ── 3) ТАП-ЦІЛЬ не мікроскопічна ────────────────────────────────────────────
// Не 44px за Apple HIG: це не самостійна кнопка, а дія в короткому повідомленні,
// і 44px розтягнули б тост. Але менше ~28px по висоті вже незручно пальцем.
ok('висота тап-цілі ≥ 28px', geo.btn.h >= 28, `${geo.btn.w}×${geo.btn.h}px`);

// ── 4) КОНТРОЛЬ: знімаємо pointer-events — тап МУСИТЬ перестати доходити ────
// Без цього «тап спрацював» не доводить, що працює саме наш рядок CSS.
await pg.evaluate(() => { window.hits.action = 0; });
await pg.addStyleTag({ content: '.toast--action .toast-action { pointer-events: none !important; }' });
await pg.mouse.click(geo.btn.x, geo.btn.y);
const after = await pg.evaluate(() => window.hits);
ok('контроль: без pointer-events кнопка мертва', after.action === 0,
   after.action === 0 ? 'тап не дійшов — саме цей рядок CSS і тримає кнопку живою'
                      : '🔴 кнопка працює й без нього — стенд міряє не те');

await browser.close();
done();
