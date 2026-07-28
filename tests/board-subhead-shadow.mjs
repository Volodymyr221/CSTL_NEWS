// Стенд №20: ТІНЬ ПІД ЛИПКИМ БЛОКОМ ОГОЛОШЕННЯ З'ЯВЛЯЄТЬСЯ ЛИШЕ КОЛИ ПІД НИМ ЩОСЬ ЇДЕ.
//
// Вова 28.07, дослівно: «коли вже фіксується цей верхній блок і починає текст скролитись
// під цей блок, то тоді вона має з'являтися плавно… тому що зараз вона виглядає негарно».
// До фіксу тінь малювалась ЗАВЖДИ — і на нескроленій модалці відділяла блок ні від чого.
//
// 🔴 ЩО САМЕ МІРЯЄМО (урок 27.07: критерій має міряти те, що ПОБАЧИТЬ ВОВА).
// Не наявність класу і не форму запису CSS, а АЛЬФУ ТІНІ — тобто рівно те, що видно оку:
//   0    → тіні немає;
//   0.12 → тінь у повну силу.
//
// 🔴 ПЕРЕХІД МУСИТЬ ДОЇХАТИ ПЕРЕД ВИМІРОМ. У блоку `transition: … 0.22s`, тож заміряти
// одразу після прокрутки — це заміряти ПЕРШИЙ КАДР згасання і отримати «тіні немає» там,
// де вона просто ще не проявилась. Саме на цьому вже падав стенд board-header 28.07.
// Тому перед кожним виміром чекаємо 400мс (0.22s переходу + запас).
//
// 🔴 НАЙВАЖЛИВІШИЙ ВИПАДОК — ОГОЛОШЕННЯ БЕЗ ФОТО. Тоді липкий блок стоїть угорі від
// самого початку, тобто «прилип» уже при нульовій прокрутці. Перевірка лише на «блок
// уперся у верх» показала б тінь одразу — це рівно той баг, який лагодимо. Друга умова
// (`scrollTop > 2`) існує саме для цього, і саме цей випадок тут перевіряється окремо.
//
// ⚠️ ГАНЯЄМО СПРАВЖНІЙ CSS ПРОЄКТУ (`style/community.css`), а не копію значень: якщо
// хтось поверне постійну тінь у сам блок, стенд це побачить.
//
// ⚠️ ЧОГО ЦЕЙ СТЕНД НЕ ДОВОДИТЬ — І ЧОМУ ЧЕСНО ЦЕ СКАЗАТИ ВГОЛОС.
// Умову «блок прилип» стенд відтворює СВОЄЮ копією (`WIRE` нижче), бо `board.js` тягне
// пів застосунку і в голий браузер не імпортується. Тобто перевіряється ПРИЙОМ, а не
// проводка. Проводку тримає окремий сторож присутності (перевірки 1-2 нижче): він
// стежить, що `attachSubheadShadow` реально викликається в ОБОХ місцях, де народжується
// модалка — і в `expand()` (тап по картці), і в `openAdModalStandalone()` (відкриття з
// чату). Якщо колись логіку в board.js змінять, а копію тут ні — сторож не врятує,
// і це треба пам'ятати: копія жива лише поки збігається з оригіналом.
import { chromium } from 'playwright';
import { launch, projectFile, reporter } from './_lib.mjs';

const COMM_CSS = projectFile('style/community.css');
const BOARD_JS = projectFile('src/tabs/board.js');

const { ok, done } = reporter();

// ── Сторож проводки: обидва шляхи створення модалки мусять кликати підключення ──
const calls = (BOARD_JS.match(/attachSubheadShadow\s*\(/g) || []).length;
ok('attachSubheadShadow є в board.js (оголошення + 2 виклики)', calls >= 3,
   `знайдено входжень: ${calls}, треба ≥3`);
ok('тінь не «прибита» назавжди у сам блок',
   /\.cm-board-modal-subhead\.is-stuck\s*\{[^}]*box-shadow/.test(COMM_CSS),
   'у community.css немає box-shadow під .cm-board-modal-subhead.is-stuck');
ok('згасання плавне, а не «клац»',
   /\.cm-board-modal-subhead\s*\{[^}]*transition:[^;]*box-shadow/.test(COMM_CSS),
   'у .cm-board-modal-subhead немає transition на box-shadow');

// ── Поведінка в браузері ──
// Сцена дзеркалить розмітку renderAdModal: скролер → [фото] → липкий блок → текст.
const PAGE = (withPhoto) => `<!doctype html><html><head><meta charset="utf-8"><style>
${COMM_CSS}
html,body{margin:0}
.cm-board-modal-note{position:fixed;left:0;top:0;width:390px;height:500px;display:flex;flex-direction:column;background:#fff}
.cm-board-modal-scrollarea{flex:1;overflow-y:auto}
.cm-board-modal-photo{height:220px;background:#ccc}
.cm-board-modal-content{padding:20px}
.filler{height:1200px}
</style></head><body>
<article class="cm-board-note cm-board-modal-note">
  <div class="cm-board-modal-scrollarea">
    ${withPhoto ? '<div class="cm-board-modal-photo"></div>' : ''}
    <div class="cm-board-modal-subhead">
      <span class="cm-board-cat">ПРОДАМ</span>
      <div class="cm-board-price">1 500 ₴</div>
      <h3 class="cm-board-title">Продаю машину</h3>
    </div>
    <div class="cm-board-modal-content"><p class="filler">текст</p></div>
  </div>
</article></body></html>`;

// ⚠️ Копія логіки attachSubheadShadow з board.js — див. попередження в шапці файлу.
const WIRE = () => {
  const scroller = document.querySelector('.cm-board-modal-scrollarea');
  const head = document.querySelector('.cm-board-modal-subhead');
  const sync = () => {
    const reachedTop = head.getBoundingClientRect().top - scroller.getBoundingClientRect().top <= 1;
    head.classList.toggle('is-stuck', scroller.scrollTop > 2 && reachedTop);
  };
  sync();
  scroller.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
};

const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 700 } });

const scrollTo = (y) => page.evaluate(
  (v) => { document.querySelector('.cm-board-modal-scrollarea').scrollTop = v; }, y);

// Альфа тіні = те, що бачить око. Чекаємо доїзду переходу — не міряємо перший кадр.
async function shadowAlpha() {
  await page.waitForTimeout(400);
  return page.evaluate(() => {
    const bs = getComputedStyle(document.querySelector('.cm-board-modal-subhead')).boxShadow;
    const m = bs.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map(s => parseFloat(s.trim()));
    return parts.length === 4 ? parts[3] : 1;
  });
}

for (const withPhoto of [true, false]) {
  const label = withPhoto ? 'з фото' : 'БЕЗ ФОТО';
  await page.setContent(PAGE(withPhoto));
  await page.evaluate(WIRE);

  const a0 = await shadowAlpha();
  ok(`${label} · не прокручено → тіні немає`, a0 === 0, `alpha=${a0}`);

  await scrollTo(400);
  const a1 = await shadowAlpha();
  ok(`${label} · текст поїхав під блок → тінь у повну силу`, a1 > 0.1, `alpha=${a1}`);

  await scrollTo(0);
  const a2 = await shadowAlpha();
  ok(`${label} · повернулись угору → тінь зникла`, a2 === 0, `alpha=${a2}`);
}

// Проміжна точка: фото ще не доїхало догори, блок ЩЕ не прилип — тіні бути не повинно.
// Без цієї перевірки «не прокручено → немає» довело б лише те, що тінь вимкнена на нулі.
await page.setContent(PAGE(true));
await page.evaluate(WIRE);
await scrollTo(60);
const aMid = await shadowAlpha();
ok('з фото · прокрутили 60px, блок ще не прилип → тіні немає', aMid === 0, `alpha=${aMid}`);

await browser.close();
done();
