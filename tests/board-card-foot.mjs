// Стенд №21: ФУТЕР КАРТКИ ДОШКИ ВИРІВНЯНИЙ — усі рядки починаються з однієї точки.
//
// Вова 28.07, дослівно: «дату треба розмістити зліва під населеним пунктом з початку
// рядка, бо вона зараз то напочатку, то посередині… все в карточці має бути рівномірним».
//
// 🔴 ЩО САМЕ МІРЯЄМО (урок 27.07: критерій має міряти те, що ПОБАЧИТЬ ВОВА).
// Не наявність класу і не значення `text-align`, а ЛІВУ КООРДИНАТУ кожного рядка футера
// у пікселях. «Рівномірно» перекладається в число однозначно: різниця між лівим краєм
// населеного пункту і лівим краєм дати має бути 0.
//
// 🔴 ЧОМУ ПОТРІБЕН КОНТРОЛЬ. «Різниця 0» сама по собі нічого не доводить: якщо обидва
// рядки однакової довжини, вони збіжаться за будь-якого вирівнювання. Тому кожна сцена
// ганяється ДВІЧІ — з чинним CSS і зі СТАРИМ правилом (`text-align: right`, як було до
// фіксу). Старий спосіб МУСИТЬ дати ненульовий розʼїзд, інакше стенд не міряє нічого.
//
// ⚠️ Беремо СПРАВЖНІЙ `style/community.css`, а не копію значень: інакше правка в проєкті
// лишила б стенд зеленим і він збрехав би.
import { chromium } from 'playwright';
import { launch, projectFile, reporter } from './_lib.mjs';

const CSS = projectFile('style/community.css');
const { ok, done } = reporter();

// Пари «населений пункт / дата» різної довжини — саме на різниці довжин і вилазив баг.
const CASES = [
  ['ОЛИЦЬКА ГРОМАДА', '20 хв тому'],
  ['ЖОРНИЩЕ', '13 липня'],
  ['ДІДИЧІ', 'щойно'],
  ['ОЛИКА', '3 дні тому'],
];

// oldRule=true відтворює стан ДО фіксу (контроль).
// bumped=true → дата зі стрілкою «піднято» (інший випадок вирівнювання).
const PAGE = (loc, time, oldRule, bumped = false) => `<!doctype html><html><head><meta charset="utf-8"><style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--red:#722F37;--ink-soft:#5F5448;--ink:#2A2520}
${CSS}
body{width:190px;padding:0}
${oldRule ? '.cm-board-foot--card{justify-content:space-between}.cm-board-foot--card .cm-board-foot-who{text-align:right;width:auto}' : ''}
</style></head><body>
<article class="cm-board-note bd-card bd-card--board" style="--tilt:0deg">
  <span class="cm-board-cat">ПРОДАМ</span>
  <div class="cm-board-price">1 500 ₴</div>
  <h3 class="cm-board-title">Продаю машину</h3>
  <div class="cm-board-foot cm-board-foot--card">
    <div class="cm-board-foot-who">
      <span class="cm-board-loc cm-board-loc--foot"><svg width="12" height="12" viewBox="0 0 24 24"></svg><span class="cm-board-loc-t">${loc}</span></span>
      <span class="cm-board-time">${bumped
        ? `<span class="cm-board-bumped"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 19V6"/><path d="M6 12l6-6 6 6"/></svg>${time}</span>`
        : time}</span>
    </div>
  </div>
</article></body></html>`;

const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 200, height: 500 } });

async function measure(loc, time, oldRule, bumped = false) {
  await page.setContent(PAGE(loc, time, oldRule, bumped));
  return page.evaluate(() => {
    // 🔴 МІРЯЄМО ГЛІФИ, А НЕ КОРОБКИ. Перша версія цього стенда брала
    // `element.getBoundingClientRect()` — і давала 0 навіть на СТАРОМУ, зламаному CSS:
    // обидва рядки — блоки на всю ширину футера, тож їхні ліві межі збігаються ЗАВЖДИ,
    // а по-різному стоїть лише ТЕКСТ усередині. Око бачить текст, не бокс.
    // Контроль це й спіймав (він мусив почервоніти — і почервонів).
    const textLeft = (el) => {
      const r = document.createRange();
      r.selectNodeContents(el);
      return r.getBoundingClientRect().left;
    };
    const locEl = document.querySelector('.cm-board-loc--foot');
    const locTxt = document.querySelector('.cm-board-loc-t');
    const timeEl = document.querySelector('.cm-board-time');
    const pin = locEl.querySelector('svg');
    const bump = document.querySelector('.cm-board-bumped');
    const bumpIcon = bump && bump.querySelector('svg');
    const card = document.querySelector('.cm-board-note');
    // Текст дати = останній текстовий вузол (у «піднятих» перед ним стоїть стрілка).
    const timeTextEl = bump || timeEl;
    const timeTextLeft = (() => {
      const r = document.createRange();
      const node = [...timeTextEl.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
      if (!node) return textLeft(timeTextEl);
      r.selectNode(node);
      return r.getBoundingClientRect().left;
    })();
    return {
      // 🔑 КРИТЕРІЙ ЗМІНИВСЯ (Вова, друга ітерація): дата має починатись НЕ під піном,
      // а під ПЕРШОЮ БУКВОЮ населеного пункту.
      drift: Math.round(Math.abs(textLeft(locTxt) - timeTextLeft)),
      // Стрілка «піднято» — навпаки, має стояти рівно під піном.
      bumpDrift: bumpIcon ? Math.round(Math.abs(pin.getBoundingClientRect().left - bumpIcon.getBoundingClientRect().left)) : null,
      locFromCard: Math.round(locEl.getBoundingClientRect().left - card.getBoundingClientRect().left),
      oneLine: Math.round(locEl.getBoundingClientRect().height) < 30,
      locSize: parseFloat(getComputedStyle(locTxt).fontSize),
    };
  });
}

let controlWorked = false;
for (const [loc, time] of CASES) {
  const now = await measure(loc, time, false);
  const old = await measure(loc, time, true);
  ok(`«${loc}» + «${time}» · дата під ПЕРШОЮ БУКВОЮ НП`, now.drift === 0,
     `розʼїзд=${now.drift}px`);
  ok(`«${loc}» · НП в ОДИН рядок`, now.oneLine, `висота ${now.oneLine ? 'ок' : 'перенеслось'}`);
  if (old.drift > 0) controlWorked = true;
}

// Випадок «піднято»: стрілка стає під пін, а текст дати лишається під першою буквою.
for (const [loc, time] of [['ЖОРНИЩЕ', '13 липня'], ['ОЛИЦЬКА ГРОМАДА', '20 хв тому']]) {
  const b = await measure(loc, time, false, true);
  ok(`«${loc}» ↑піднято · текст дати все одно під першою буквою`, b.drift === 0,
     `розʼїзд=${b.drift}px`);
  ok(`«${loc}» ↑піднято · стрілка рівно під піном`, b.bumpDrift === 0,
     `розʼїзд стрілки=${b.bumpDrift}px`);
}

// Контроль: старе правило мусить давати розʼїзд бодай в одній сцені.
ok('КОНТРОЛЬ: старе правило (text-align:right) дає розʼїзд', controlWorked,
   'старий CSS теж дав 0 — тоді стенд не міряє нічого, його треба переписати');

// НП у футері має бути помітно більший за дату (Вова: «трішки збільшити»).
const m = await measure('ЖОРНИЩЕ', '13 липня', false);
ok("НП більший за 11px, але менший за 12.5px (Вова: «зменшити, але не як раніше»)", m.locSize > 11 && m.locSize < 12.5, `${m.locSize}px`);

await browser.close();
done();
