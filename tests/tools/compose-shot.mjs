// Знімок листа подачі оголошення — щоб ПОДИВИТИСЬ на правки аудиту, а не лише
// прочитати числа. Запускається руками: node tests/tools/compose-shot.mjs
//
// Навіщо окремо від стендів: `tests/board-compose.mjs` міряє ГЕОМЕТРІЮ (чи не плаває
// вміст), а правки 30.07 були про ВИДИМІСТЬ меж — це можна довести числом, але не можна
// прийняти без ока. Знімки лягають у tests/tools/_out/.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { launch, projectFile, ROOT } from '../_lib.mjs';
import { join } from 'path';

const BASE = projectFile('style/base.css');
const MODAL = projectFile('style/modal.css');
const COMM = projectFile('style/community.css');

const chip = (label, active = '') =>
  `<button class="bm-chip ${active}" type="button"><span class="bm-chip-emoji">◆</span><span class="bm-chip-label">${label}</span></button>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${BASE}
${MODAL}
${COMM}
* { animation: none !important; transition: none !important; }
</style></head><body>
<div class="app-modal app-modal--sheet app-modal--board-compose open">
  <div class="app-modal-sheet">
    <div class="app-modal-handle"></div>
    <div class="app-modal-body">
      <div class="cm-board-modal-head">
        <h3 class="cm-board-modal-title">Нове оголошення</h3>
        <p class="cm-board-modal-sub">Заповніть поля нижче.</p>
      </div>
      <div class="bm-type-tabs">
        <button class="bm-type-tab active" type="button"><span class="bm-type-emoji">🛒</span><span class="bm-type-label">Оголошення</span></button>
        <button class="bm-type-tab" type="button"><span class="bm-type-emoji">💬</span><span class="bm-type-label">Розмова</span></button>
      </div>
      <div class="bm-section">
        <label class="bm-label">Ім'я</label>
        <span class="bm-author-fixed"><span class="bm-author-ic">◍</span>Вова</span>
      </div>
      <div class="bm-section">
        <label class="bm-label">Категорія <span class="bm-label-req">*</span></label>
        <div class="bm-chips">${chip('продам', 'active')}${chip('куплю')}${chip('послуга')}${chip('шукаю')}</div>
      </div>
      <div class="bm-section">
        <label class="bm-label">Заголовок <span class="bm-label-req">*</span>
          <span class="bm-label-count">18/80</span></label>
        <input class="cm-board-input cm-board-input--small" value="Продам мотоцикл">
      </div>
      <div class="bm-section">
        <label class="bm-label">Опис <span class="bm-label-req">*</span></label>
        <textarea class="cm-board-input bm-invalid" rows="3" placeholder="Що хочете повідомити громаді?"></textarea>
      </div>
      <div class="bm-section">
        <label class="bm-label">Фото</label>
        <div class="bm-photos">
          <div class="bm-photo-slot"><span class="bm-photo-plus">+</span></div>
          <div class="bm-photo-slot filled" style="background-image:linear-gradient(135deg,#8aa,#556)"></div>
          <div class="bm-photo-slot"><span class="bm-photo-plus">+</span></div>
        </div>
      </div>
      <button class="cm-board-submit" type="button">Опублікувати</button>
    </div>
  </div>
</div>
</body></html>`;

const out = join(ROOT, 'tests/tools/_out');
mkdirSync(out, { recursive: true });
const browser = await launch(chromium);
const pg = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await pg.setContent(html);
await pg.waitForTimeout(200);
await pg.screenshot({ path: join(out, 'compose-після-аудиту.png') });

// Числа поруч зі знімком — щоб було видно, що око і формула кажуть одне.
const nums = await pg.evaluate(() => {
  const rgb = (s) => { const m = String(s).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? [+m[1], +m[2], +m[3]] : null; };
  const lum = ([r, g, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const cr = (a, b) => { const x = lum(a), y = lum(b), hi = Math.max(x, y), lo = Math.min(x, y); return +((hi + 0.05) / (lo + 0.05)).toFixed(3); };
  const sheet = rgb(getComputedStyle(document.querySelector('.app-modal-sheet')).backgroundColor);
  const pick = (sel, prop) => rgb(getComputedStyle(document.querySelector(sel))[prop]);
  return {
    'поверхня листа': `rgb(${sheet})`,
    'межа поля Імʼя ↔ лист': cr(pick('.bm-author-fixed', 'borderTopColor'), sheet),
    'межа чіпа ↔ лист': cr(pick('.bm-chip:not(.active)', 'borderTopColor'), sheet),
    'пунктир слота ↔ лист': cr(pick('.bm-photo-slot', 'borderTopColor'), sheet),
    'дорожка табів ↔ лист': cr(pick('.bm-type-tabs', 'backgroundColor'), sheet),
    'білий бігунок ↔ дорожка': cr(pick('.bm-type-tab.active', 'backgroundColor'), pick('.bm-type-tabs', 'backgroundColor')),
    'рамка невалідного ↔ поле': cr(pick('.bm-invalid', 'borderTopColor'), pick('.bm-invalid', 'backgroundColor')),
  };
});
console.log(JSON.stringify(nums, null, 2));
console.log('→ tests/tools/_out/compose-після-аудиту.png');
await browser.close();
