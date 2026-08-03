// Стенд №2: ЗАКРИТТЯ свайпом. Перевіряє те, на що скаржився Вова —
// «не звертається донизу, а дьоргається і пропадає».
// Суть бага: translateY(100%) рахується від ВЛАСНОЇ висоти елемента. Якщо висота
// анімується одночасно — ціль тікає, рух нерівномірний. Тут міряємо обидва варіанти.
import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { ROOT, launch } from './_lib.mjs';

const css = readFileSync(`${ROOT}/style/feed.css`, 'utf8');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html,body{margin:0;height:100%;overflow:hidden}
  :root{--fd-surface:#fff;--fd-ink:#111}
  ${css}
</style></head><body>
  <div class="fd-sheet-back fd-sheet-back--kbsafe open">
    <div class="fd-sheet-vp">
      <div class="fd-sheet fd-com-sheet" style="height:496px">
        <div class="fd-com-grip"><div class="fd-sheet-handle"></div><div class="fd-sheet-title">1 коментар</div></div>
        <div class="fd-com-list" style="flex:1"></div>
      </div>
    </div>
  </div>
<script>
window.__geom = () => {
  const s = document.querySelector('.fd-com-sheet');
  const r = s.getBoundingClientRect();
  return { top: Math.round(r.top), h: Math.round(r.height) };
};
// Відтворює finishSwipe: transform у translateY(100%) з переходом.
window.__dismiss = (freeze) => {
  const s = document.querySelector('.fd-com-sheet');
  if (freeze) {                                  // ← НОВА поведінка (фікс)
    s.classList.remove('fd-com-sheet--anim');
    s.style.height = s.offsetHeight + 'px';
  } else {                                       // ← СТАРА поведінка (баг): blur міняв висоту
    s.classList.add('fd-com-sheet--anim');
    s.style.height = '';                         // назад у 82svh — росте під час з'їзду
  }
  s.style.transition = 'transform 260ms cubic-bezier(0.32,0.72,0,1)';
  s.style.transform = 'translateY(100%)';
};
</script></body></html>`;

const b = await launch(chromium);
const results = [];
const ok = (n, c, i='') => { results.push(c); console.log(`${c?'✅':'❌'} ${n}${i?'  — '+i:''}`); };

async function run(freeze) {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.setContent(html);
  await p.waitForTimeout(80);
  const frames = await p.evaluate(async (fr) => {
    // ⚠️ Разом із геометрією пишемо ЧАС кадру. Без нього крок міряється «за тік
    // requestAnimationFrame», а тік — не одиниця часу: під навантаженням браузер
    // пропускає кадр, і наступна проба покриває подвійний шлях. Стенд бачив «ривок»
    // 14 → 24 там, де рух був рівний, і червонів у повному прогоні, лишаючись зеленим
    // поодинці. Класична пастка проєкту: міряли зручне, а не те, що бачить око.
    const snap = () => Object.assign(window.__geom(), { t: performance.now() });
    const out = [snap()];
    window.__dismiss(fr);
    for (let i = 0; i < 14; i++) { await new Promise(r => requestAnimationFrame(r)); out.push(snap()); }
    return out;
  }, freeze);
  await p.close();
  return frames;
}

for (const [label, freeze] of [['СТАРА поведінка (висота росте)', false], ['НОВА поведінка (висота заморожена)', true]]) {
  const f = await run(freeze);
  const heights = f.map(x => x.h);
  const hSpread = Math.max(...heights) - Math.min(...heights);
  // Рівномірність: різниці top між кадрами не мають стрибати.
  const steps = f.slice(1).map((x, i) => x.top - f[i].top).filter(d => d > 0);
  const stepSpread = steps.length ? Math.max(...steps) - Math.min(...steps) : 0;
  console.log(`\n── ${label}`);
  console.log(`   висоти: ${heights.join(', ')}`);
  console.log(`   розкид висоти: ${hSpread}px · нерівномірність кроку: ${stepSpread}px`);
  if (freeze) {
    ok('висота НЕ змінюється під час закриття', hSpread === 0, `розкид ${hSpread}px`);
    // ⚠️ «Однаковий крок» — ХИБНИЙ критерій: крива cubic-bezier(0.32,0.72,0,1) навмисно
    // гальмує (перші кадри довгі, останні короткі). Правильний критерій плавності:
    // рух іде ЛИШЕ вниз і крок не РОСТЕ після старту (тобто сповільнення, без ривків).
    const monotone = f.slice(1).every((x, i) => x.top >= f[i].top);
    // Профіль кроку звірено КОНТРОЛЬНИМ дослідом (control.mjs): при `linear` кроки рівні
    // (32,32,31…), при штатній кривій — 80,104,128,80,38,22,14,9… Отже «нерівний крок» дає
    // САМА крива cubic-bezier(0.32,0.72,0,1) — спільна для всіх модалок застосунку
    // (швидкий старт + довге гальмування), а не наша геометрія. Тому критерій — не рівність
    // кроків, а ГАЛЬМУВАННЯ: після піку рух лише сповільнюється, без нових ривків.
    // Міряємо ШВИДКІСТЬ (px за мілісекунду), а не шлях за тік — тоді пропущений кадр
    // дає довший Δt і швидкість лишається тією самою, якою вона й була насправді.
    const vel = f.slice(1)
      .map((x, i) => ({ v: (x.top - f[i].top) / Math.max(x.t - f[i].t, 1), d: x.top - f[i].top }))
      .filter(o => o.d > 0)
      .map(o => o.v);
    // ⚠️ ПЕРШУ пробу відкидаємо: інтервал між `__dismiss()` і першим кадром не
    // вирівняний зі стартом анімації, тому швидкість там рахується від випадкового Δt
    // (заміряно 11.29 px/мс при справжніх ~5). Під навантаженням саме вона ставала
    // «піком», вікно гальмування починалось зарано і захоплювало ШТАТНИЙ розгін кривої.
    // Те, що ми охороняємо, — це хвіст: після піку рух лише сповільнюється.
    const tail = vel.slice(1);
    const peak = tail.indexOf(Math.max(...tail));
    // 8% допуску — шум таймера, а не прискорення: людське око ривком це не читає.
    const decel = tail.slice(peak + 1).every((v, i, a) => i === 0 || v <= a[i - 1] * 1.08 + 0.002);
    ok('після піку — рівне гальмування, без ривків', decel,
       `швидкість px/мс: ${vel.map(v => v.toFixed(2)).join(', ')}`);
  } else {
    ok('стенд відтворює БАГ (висота дійсно росла)', hSpread > 0, `розкид ${hSpread}px — саме це й дьоргало`);
  }
}

await b.close();
const bad = results.filter(r => !r).length;
console.log(`\n${bad ? '❌' : '✅'} ${results.length - bad}/${results.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
