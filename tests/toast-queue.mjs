// Стенд №16: ЧЕРГА СИСТЕМНИХ ПОВІДОМЛЕНЬ.
// Головна проблема, якої не було в постановці: один вузол + один таймер, тож друге
// повідомлення МИТТЄВО затирало перше — його ніхто не встигав прочитати.
//
// ⚠️ Ганяємо СПРАВЖНІЙ код: блок toast витягується прямо з src/core/utils.js.
// Час і кадри підмінюємо, щоб не чекати секундами.
import { readFileSync } from 'fs';
import { projectFile } from './_lib.mjs';
const SRC = projectFile('src/core/utils.js');

const from = SRC.indexOf('const TOAST_MIN');
const to   = SRC.indexOf('// Перегляд фото на весь екран');
if (from < 0 || to < 0) { console.log('❌ не знайшов блок toast у utils.js'); process.exit(1); }
const block = SRC.slice(from, to).replace(/^export /gm, '');

// ── Підроблений DOM і час ──
let now = 0;
const timers = [];
const node = {
  id: 'cstl-toast', className: 'toast', textContent: '', attrs: {},
  classList: {
    _s: new Set(),
    add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
    toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); },
    contains(c) { return this._s.has(c); },
  },
  setAttribute(k, v) { this.attrs[k] = v; },
};
// ⚠️ Вузол «ще не створений», поки його не створять — інакше гілка створення
// (а саме там ставляться aria-атрибути) не виконається жодного разу, і стенд
// доповість «атрибутів нема» там, де код їх насправді ставить.
let stvoreno = false;
globalThis.document = {
  getElementById: () => (stvoreno ? node : null),
  createElement: () => { stvoreno = true; return node; },
  body: { appendChild() {} },
};
globalThis.requestAnimationFrame = (fn) => fn();
globalThis.setTimeout = (fn, ms) => { timers.push({ at: now + ms, fn }); return timers.length; };
globalThis.clearTimeout = (id) => { if (timers[id - 1]) timers[id - 1].fn = null; };
globalThis.Date = { now: () => now };
// Просунути час: виконує всі таймери, чий час настав.
const tick = (ms) => {
  const target = now + ms;
  for (;;) {
    const due = timers.filter(t => t.fn && t.at <= target).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    now = due.at; const fn = due.fn; due.fn = null; fn();
  }
  now = target;
};

const { showToast } = new Function(`${block}\nreturn { showToast };`)();
const vydno = () => (node.classList.contains('visible') ? node.textContent : null);

const res = []; const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };

// 1. Просте повідомлення показується.
showToast('Пост закріплено');
ok('повідомлення з\'являється', vydno() === 'Пост закріплено', String(vydno()));

// 2. 🔑 ГОЛОВНЕ: друге повідомлення НЕ затирає перше миттєво.
tick(200);
showToast('Помилка мережі');
ok('друге НЕ затирає перше одразу', vydno() === 'Пост закріплено', String(vydno()));

// 3. …але дочікується і показується.
// ⚠️ Тік має бути РІВНО до появи другого, а не «з запасом»: перша версія ганяла
// 6000мс, за які друге встигало і показатись, і згаснути — стенд бачив порожньо
// і звинувачував код. Перше живе 2500мс + 220мс згасання = 2720мс.
tick(2700);
ok('друге дочекалось і показалось', vydno() === 'Помилка мережі', String(vydno()));

// 4. Те саме повідомлення двічі — не блимає.
tick(6000);
showToast('Готово');
const t1 = node.textContent;
showToast('Готово');
ok('дубль не перезапускає показ', node.textContent === t1 && vydno() === 'Готово');

// 5. Якщо перше вже провисіло достатньо — нове показується без довгого чекання.
tick(6000);
showToast('Перше');
tick(1600);                       // більше за TOAST_READ
showToast('Друге');
tick(300);                        // лише згасання
ok('після прочитання нове показується швидко', vydno() === 'Друге', String(vydno()));

// 6. Черга не росте нескінченно (стеля 2 + поточне).
tick(6000);
showToast('A'); showToast('B'); showToast('C'); showToast('D'); showToast('E');
const seen = [];
for (let i = 0; i < 6; i++) { if (vydno()) seen.push(vydno()); tick(7000); }
ok('черга обмежена, не показує все підряд', seen.length <= 3, `показано ${seen.length}: ${seen.join(', ')}`);
ok('показано САМЕ найсвіжіші', seen.includes('E') || seen.includes('D'), seen.join(', '));

// 7. Час показу росте з довжиною тексту.
tick(9000);
showToast('Ок');
const korotke = timers.filter(t => t.fn).map(t => t.at - now)[0];
tick(9000);
showToast('Можна закріпити щонайбільше 3 пости, спершу відкріпи якийсь із них будь ласка');
const dovge = timers.filter(t => t.fn).map(t => t.at - now)[0];
console.log(`\n   час показу: коротке ${korotke}мс · довге ${dovge}мс`);
ok('довше повідомлення висить довше', dovge > korotke, `${dovge} проти ${korotke}`);
ok('коротке не менше за 2.5с', korotke >= 2500, `${korotke}мс`);
ok('довге не більше за 6с', dovge <= 6000, `${dovge}мс`);

// 8. Явно заданий час має пріоритет.
tick(9000);
showToast('З явним часом', 4000);
const yavnyi = timers.filter(t => t.fn).map(t => t.at - now)[0];
ok('явний duration має пріоритет', yavnyi === 4000, `${yavnyi}мс`);

// 9. Порожнє повідомлення нічого не показує.
tick(9000);
const bulo = node.textContent;
showToast('   ');
ok('порожній текст ігнорується', node.textContent === bulo && !vydno());

// 10. Доступність.
ok('є aria-live для читача екрана', node.attrs['aria-live'] === 'polite', String(node.attrs['aria-live']));
ok('є role=status', node.attrs.role === 'status', String(node.attrs.role));

const bad = res.filter(r => !r).length;
console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
