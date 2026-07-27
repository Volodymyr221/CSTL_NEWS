// Стенд №15: СИСТЕМНІ ПОВІДОМЛЕННЯ (toast).
// Вова, скрін IMG_3680: «Можна закріпити щонайбільше 3 пости. Спершу відкріпи яки…» —
// текст обрізано праворуч і він вилітає за екран.
//
// Проба до фіксу (екран 390px): коробка 358px, тексту треба 403px, 45px за краєм.
// Корінь — `white-space: nowrap` у .toast.
//
// Прогін по ревізіях: CSS_REV=<git-ish> node toast.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { ROOT, launch, projectFile } from './_lib.mjs';

const R = ROOT;
const REV = process.env.CSS_REV || '';
const src = (f) => REV
  ? execFileSync('git', ['-C', R, 'show', `${REV}:${f}`], { encoding: 'utf8', maxBuffer: 1 << 26 })
  : projectFile(f);

const css = src('style/base.css');

// Три довжини: коротке, те саме що спіймав Вова, і крайній випадок.
const KOROTKE = 'Пост закріплено';
const VOVYNE  = 'Можна закріпити щонайбільше 3 пости. Спершу відкріпи якийсь';
const DOVGE   = 'Сповіщення вимкнені в налаштуваннях телефону або браузера. Увімкніть їх, щоб отримувати нагадування про рейси, відповіді на коментарі та новини спільнот, які ви читаєте.';

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
 *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
 html,body{height:100%;background:#eee}
 :root{--black:#1a1a1a;--red:#722F37}
 ${css}
</style></head><body>
 <div class="toast visible" id="k">${KOROTKE}</div>
 <div class="toast visible" id="v" style="top:120px">${VOVYNE}</div>
 <div class="toast toast--error visible" id="e" style="top:240px">${VOVYNE}</div>
 <div class="toast visible" id="d" style="top:360px">${DOVGE}</div>
<script>
 window.__m = (id) => {
   const e = document.getElementById(id), cs = getComputedStyle(e), r = e.getBoundingClientRect();
   return { wrap: cs.whiteSpace, radius: parseInt(cs.borderRadius),
            left: Math.round(r.left), right: Math.round(r.right),
            w: Math.round(r.width), h: Math.round(r.height),
            // Скільки вмісту не влізло по горизонталі (0 = все всередині).
            perepovnenniaX: Math.max(0, e.scrollWidth - e.clientWidth),
            // Наскільки вилізло за екран (>0 = видно обрізаним).
            zaEkranom: Math.max(0, Math.round(r.right) - window.innerWidth, -Math.round(r.left)),
            // Реальний виступ ТЕКСТУ за правий край екрана.
            tekstZaEkranom: Math.max(0, Math.round(r.left) + e.scrollWidth - window.innerWidth) };
 };
</script></body></html>`;

const b = await launch(chromium);
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.setContent(html); await p.waitForTimeout(150);

const k = await p.evaluate(() => window.__m('k'));
const v = await p.evaluate(() => window.__m('v'));
const e = await p.evaluate(() => window.__m('e'));
const d = await p.evaluate(() => window.__m('d'));
await b.close();

const res = []; const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };

console.log(`\n── ревізія: ${REV || 'робоче дерево'}, екран 390px ──`);
const row = (t, m) => console.log(`   ${t.padEnd(22)} ${String(m.w).padStart(3)}×${String(m.h).padStart(3)}  перенос:${m.wrap.padEnd(7)} за екран:${m.tekstZaEkranom}px`);
row('коротке', k); row('повідомлення Вови', v); row('те саме, червоне', e); row('дуже довге', d);

// 🔑 ГОЛОВНЕ — те, на що скаржився Вова.
ok('повідомлення Вови НЕ вилітає за екран', v.tekstZaEkranom === 0, `${v.tekstZaEkranom}px`);
ok('текст не обрізається всередині коробки', v.perepovnenniaX === 0, `${v.perepovnenniaX}px`);
ok('довгий текст теж не вилітає', d.tekstZaEkranom === 0, `${d.tekstZaEkranom}px`);

// Перенос — однаковий для ВСІХ типів (раніше червоні переносились, звичайні ні).
ok('звичайне і червоне переносяться однаково', v.wrap === e.wrap, `${v.wrap} проти ${e.wrap}`);
ok('перенос увімкнено', v.wrap !== 'nowrap', v.wrap);

// Коробка росте по тексту, а не завжди на всю ширину.
ok('коротке повідомлення — вузька плашка', k.w < 200, `${k.w}px`);
// ⚠️ Критерій посилено. Було просто «ширша за коротку» — і воно ЗЕЛЕНІЛО при 195px,
// хоча насправді всі повідомлення виходили однакової ширини, а довгий текст ставав
// вузьким стовпчиком на 4 рядки. Тепер вимагаємо, щоб довший текст РЕАЛЬНО
// використовував доступну ширину, а не тягнувся вниз.
ok('довше повідомлення — ширша плашка', v.w > k.w, `${v.w} проти ${k.w}`);
ok('довший текст використовує ширину, а не тягнеться вниз', v.w > 300, `${v.w}px`);
ok('повідомлення Вови вміщується у 2 рядки', v.h <= 62, `${v.h}px (рядок ~18px + падінги)`);
ok('коробка не ширша за 92% екрана', v.w <= Math.round(390 * 0.92) && d.w <= Math.round(390 * 0.92),
   `${v.w} / ${d.w} при стелі ${Math.round(390 * 0.92)}`);

// Довге не накриває пів екрана.
ok('дуже довге обмежене по висоті', d.h <= 110, `${d.h}px`);

// Плашка не торкається країв екрана.
ok('є відступ від країв екрана', v.left >= 8 && (390 - v.right) >= 8, `зліва ${v.left}, справа ${390 - v.right}`);

// Вигляд, який уже був правильний, — не загубити.
ok('радіус лишився 20px', v.radius === 20, `${v.radius}px`);
ok('плашка по центру', Math.abs(v.left - (390 - v.right)) <= 1, `${v.left} / ${390 - v.right}`);

const bad = res.filter(r => !r).length;
console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
