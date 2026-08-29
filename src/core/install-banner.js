// src/core/install-banner.js
// Банер «Відкрий/встанови у додатку» — показується ЛИШЕ коли застосунок відкрито
// у браузері (НЕ в PWA). Мета: людина, що перейшла по deep-link у браузері (напр.
// з месенджера), легко потрапляє в PWA на головному екрані.
//
// ⚠️ Автоматично перекинути в PWA неможливо — Apple блокує це на iOS (PWA —
// ізольований контейнер, веб-URL завжди відкривається в браузері; Universal Links
// лише для нативних App Store додатків). Тому це ПІДКАЗКА, не перенаправлення:
//   • Android — нативне встановлення через beforeinstallprompt;
//   • iOS Safari — покрокова інструкція «Поділитись ⎋ → На головний екран»;
//   • iOS НЕ Safari — див. нижче, там інструкція фізично не спрацює.

import { isIOS, isStandalone } from './utils.js';
import { consentPending } from './consent.js';

const SNOOZE_KEY  = 'cstl-install-snooze-v1';
const SHOWS_KEY   = 'cstl-install-shows-v1';
const SNOOZE_DAYS = 7;
const МАКС_ПОКАЗІВ = 2;

// isStandalone (вже в PWA?) / isIOS — спільні в core/utils.js (24.07): ті самі перевірки
// потрібні дзвіночку сповіщень, тож живуть в одному місці, а не двома копіями.
function snoozed() {
  try {
    const t = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return t && (Date.now() - t) < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch { return false; }
}
function snooze() { try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch {} }

// 🔴 29.08 — «ЗІГНОРУВАВ» ТЕЖ Є ВІДПОВІДДЮ.
// Досі пауза ставилась лише при тапі ✕ або встановленні. Хто просто гортав далі —
// бачив банер КОЖНОГО візиту, і це саме те «переслідування», якого не хочемо.
// 🔑 Рахуємо покази: другий поспіль без дії = мовчазна відмова, ставимо ту саму
// семиденну паузу. Число 2, а не 1, бо перший показ людина цілком могла не
// помітити за банером згоди.
function порахуватиПоказ() {
  try {
    const n = Number(localStorage.getItem(SHOWS_KEY) || 0) + 1;
    localStorage.setItem(SHOWS_KEY, String(n));
    if (n >= МАКС_ПОКАЗІВ) snooze();
  } catch {}
}
function забутиПокази() { try { localStorage.removeItem(SHOWS_KEY); } catch {} }

// 🔴 29.08 — НА iPHONE ДОДАТИ НА ЕКРАН УМІЄ ЛИШЕ SAFARI.
// Досі `isIOS()` вирішував усе, а він дивиться на СИСТЕМУ, не на браузер. Тобто
// людина з Chrome, Instagram чи Telegram бачила кроки «Поділитись → На початковий
// екран», яких у неї на екрані фізично немає. Це той самий клас, що вада з
// посиланнями новин: показуємо одне, а веде в нікуди.
// ⚠️ Невідомий браузер вважаємо Safari — на нього припадає більшість, і показати
// робочу інструкцію зайвий раз дешевше, ніж відправити в Safari того, хто вже в ньому.
function isIOSSafari() {
  const ua = navigator.userAgent || '';
  const чужий = /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|YaBrowser|DuckDuckGo/i.test(ua)
             || /FBAN|FBAV|Instagram|Line\/|MicroMessenger|Twitter/i.test(ua);
  return isIOS() && !чужий;
}

let deferredPrompt = null;   // Android beforeinstallprompt (відкладений нативний діалог)

export function initInstallBanner() {
  if (isStandalone()) return;   // вже в PWA (відкрито з іконки) — банер не потрібен

  // Android/desktop: сигнал «застосунок МОЖНА встановити» приходить ЛИШЕ якщо PWA
  // ще НЕ встановлена. Якщо вже встановлена — подія не приходить, банер не зʼявиться
  // (не набридаємо тим, у кого додаток є). Показуємо банер саме з цієї події.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!snoozed()) уЧергу(() => showBanner(false), 1200);
  });

  // iOS: події beforeinstallprompt немає, і дізнатися з браузера чи встановлена PWA
  // НЕМОЖЛИВО (обмеження Apple). Показуємо підказку. Кого відкрив з іконки — вже
  // відсіяно вгорі (standalone), тож набридання мінімальне.
  if (isIOS() && !snoozed()) уЧергу(() => showBanner(true), 2500);
}

// ── ЧЕРГА: СПЕРШУ ЗГОДА, ПОТІМ ВСТАНОВЛЕННЯ ─────────────────────────────────
// 🗣️ Вова 29.08: «користувач погоджується з умовами, скролить ленту… там 5 секунд
// він сидить в застосунку, і через 5 секунд у нього знов трішки затемняється екран
// і вилазить плавно». 🔑 Сенс паузи не в числі, а в тому, що між двома проханнями
// має бути шматок ЖИТТЯ застосунку — інакше друге читається як продовження першого.
const ПАУЗА_ПІСЛЯ_ЗГОДИ = 5000;

// 🔴 ЕКРАН МОЖЕ БУТИ ЗАЙНЯТИЙ, І ТОДІ ЦЕ ВЖЕ НЕ ПРИВЕРНЕННЯ УВАГИ, А ПЕРЕХОПЛЕННЯ.
// За 5 секунд людина цілком встигає відкрити статтю або лист коментарів. Затемнення
// поверх відкритої модалки — найгірший можливий момент: воно накриває те, що людина
// САМА щойно попросила показати.
// ⚠️ Ознаки беремо ті, якими застосунок уже позначає зайнятий екран, а не власну
// нову — інакше наступний повноекранний шар доведеться згадати ще й тут.
const ОЗНАКИ_ЗАЙНЯТОГО = ['modal-open', 'fs-open', 'nh-open', 'cm-zoom-open', 'dev-locked'];
const екранЗайнятий = () =>
  ОЗНАКИ_ЗАЙНЯТОГО.some(к => document.body.classList.contains(к));

// Чекаємо, поки екран звільниться. Спостерігач за класами `body`, а не опитування
// за таймером: банер зʼявиться в ту саму мить, коли людина закриє модалку.
function колиЕкранВільний(показати) {
  if (!екранЗайнятий()) { показати(); return; }
  const сторож = new MutationObserver(() => {
    if (екранЗайнятий()) return;
    сторож.disconnect();
    показати();
  });
  сторож.observe(document.body, { attributes: true, attributeFilter: ['class'] });
}

function уЧергу(показати, затримка) {
  const далі = () => колиЕкранВільний(показати);
  if (!consentPending()) { setTimeout(далі, затримка); return; }
  document.addEventListener('cstl-consent-accepted',
    () => setTimeout(далі, ПАУЗА_ПІСЛЯ_ЗГОДИ), { once: true });
}

function showBanner(iosMode) {
  if (isStandalone() || snoozed() || document.querySelector('.pwa-cta')) return;

  // 🔴 ЗАТЕМНЕННЯ (рішення Вови 29.08). Його діагноз був точний: «воно зливається
  // зі всією інформацією, не зрозуміло, що саме оце надо». Банер напівпрозорий і
  // світлий поверх строкатої стрічки — він читається як ще одна картка.
  // 🛑 І одразу рішення про НАТИСКИ, бо затемнення без нього — пастка: шар виглядає
  // як модалка, але палець проходить крізь нього, і це читається як зламане.
  // ➡️ Тут шар ЛОВИТЬ натиски, і тап повз банер = закрити. Тобто «хрестик» стає
  // завбільшки з екран — це закриває скаргу про дрібний ✕ надійніше за сам ✕.
  // ⚠️ У банера ЗГОДИ рішення протилежне (там шар не ловить нічого) — і це не
  // непослідовність: наш власний текст каже «КОРИСТУЮЧИСЬ CSTL LIFE, ви
  // погоджуєтесь», тобто згода дається фактом користування. Заблокувати застосунок
  // означало б суперечити своєму ж тексту. Рішення Вови: «залишаємо як зараз».
  const шар = document.createElement('div');
  шар.className = 'notice-scrim';

  const el = document.createElement('div');
  el.className = 'pwa-cta';
  // 🔑 Іконка — СПРАВЖНЯ іконка застосунку (`icons/icon-192.png`), та сама, що
  // зʼявиться на головному екрані. Було 📲 — емодзі, який на кожній системі свій і
  // до бренду не має стосунку. Тепер людина бачить у підказці рівно те, що отримає.
  el.innerHTML = `
    <button class="pwa-cta-x" type="button" aria-label="Закрити">✕</button>
    <img class="pwa-cta-ic" src="icons/icon-192.png" alt="" width="40" height="40">
    <div class="pwa-cta-txt">
      <b>Встанови CSTL LIFE на екран</b>
      <span>Швидкий доступ до життя громади</span>
    </div>
    <button class="pwa-cta-go" type="button">${iosMode ? 'Як встановити' : 'Встановити'}</button>`;

  // Одне місце, що прибирає ОБИДВА елементи. Доти кожен вихід кликав `el.remove()`
  // сам, і додавання шару означало б чотири місця, де його можна забути.
  const прибрати = () => { el.remove(); шар.remove(); };
  const відмовитись = () => { snooze(); забутиПокази(); прибрати(); };

  el.querySelector('.pwa-cta-x').addEventListener('click', відмовитись);
  шар.addEventListener('click', відмовитись);

  el.querySelector('.pwa-cta-go').addEventListener('click', async () => {
    if (deferredPrompt) {                 // Android — нативне встановлення
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null;
      відмовитись();
    } else if (iosMode) {
      // 🔴 БАНЕР ЗАКРИВАЄТЬСЯ, А НЕ ЛИШАЄТЬСЯ ПОЗАДУ МОДАЛКИ. Інакше під
      // інструкцією висить та сама кнопка «Як встановити», і незрозуміло, чи
      // натиснулось. Пауза тут не потрібна — модалка перекриває екран цілком.
      прибрати();
      // 🔴 РОЗВИЛКА, ЯКОЇ ТУТ НЕ БУЛО. `isIOS()` каже про СИСТЕМУ, а додати на
      // екран уміє лише Safari. Показати кроки в Chrome чи в браузері Instagram
      // означало б відправити людину шукати кнопку, якої в неї немає.
      if (isIOSSafari()) відкритиІнструкцію();
      else               відкритиПроБраузер();
    } else {
      відмовитись();
    }
  });

  document.body.appendChild(шар);
  document.body.appendChild(el);
  порахуватиПоказ();
  requestAnimationFrame(() => {
    шар.classList.add('notice-scrim--in');
    el.classList.add('pwa-cta--in');
  });
}

// ── ІНСТРУКЦІЯ: ТРИ КРОКИ, ОДИН НА ЕКРАН ────────────────────────────────────
//
// 🔴 29.08 — ЧОМУ ЦЕ ЗАМІНИЛО ОДИН РЯДОК ПІДКАЗКИ.
// Було: «Тапни Поділитись ⎋ унизу браузера → „Додати на початковий екран“» —
// один рядок, що розгортався просто в банері. Слово Вови: «це геть нічого не
// пояснює… не кожен може це зрозуміти». Для людини, яка не знає, що таке PWA,
// назва кнопки без картинки не є інструкцією.
//
// 🛑 ЧОМУ СХЕМИ, А НЕ ЗНІМКИ SAFARI (рішення Вови 29.08 — «схеми»).
// Справжні знімки виглядають переконливіше рівно один сезон: Apple перемальовує
// панель майже щороку, і застаріла картинка гірша за текст — вона впевнено
// показує те, чого на екрані немає. Плюс три знімки це ~600 KB у передкеші PWA
// проти кількох кілобайт векторної схеми, і чужий інтерфейс у ПУБЛІЧНОМУ репо.
// ➡️ Схема малює тільки те, що стабільне роками: де ПАНЕЛЬ, який ПОРЯДОК дій.
//
// ⚠️ І тому ж крок 1 названо ширше за один значок: на iOS 18+ низ Safari це
// `‹ › [адреса] ⋯`, і «Поділитись» лежить УСЕРЕДИНІ меню ⋯; на старших вона
// стоїть окремою кнопкою. Обидва шляхи ведуть в один список, тож інструкція
// називає обидва входи, а не той, що випав нам на очі.

const БРЕНД = '#5E1723';

// Низ Safari: адреса і панель, з обведеним входом у меню.
// 🔴 29.08, ПІСЛЯ ЖИВОЇ ПЕРЕВІРКИ НА iPHONE — КРОКІВ ЧОТИРИ, А НЕ ТРИ.
// Перша редакція вела «⋯ → На початковий екран», і це БУЛО НЕПРАВДОЮ: Вова
// надіслав знімок відкритого меню ⋯, і в ньому «Поширити · Додати до папки
// «Закладки» · Додати закладку до… · Нова вкладка · Нова приватна вкладка».
// Пункту «На Початковий екран» там НЕМАЄ — він живе в аркуші «Поширити», на крок
// глибше. 🛑 Тобто інструкція впевнено називала кнопку, якої на тому екрані немає:
// рівно та вада, заради якої ми й розводили Safari з рештою браузерів.
// 🔑 Урок ширший за цей екран: схему, намальовану з памʼяті про чужий інтерфейс,
// доводить лише знімок із живого пристрою. Мій «здогад про очевидне» був хибний.

// Низ Safari — за знімком Вови: КРУЖОК ліворуч, поле адреси посередині, КРУЖОК ⋯ праворуч.
const СХЕМА_1 = `
<svg viewBox="0 0 260 150" role="img" aria-label="Нижня панель браузера з обведеною кнопкою «три крапки»">
  <rect x="16" y="30" width="228" height="90" rx="16" fill="#fff" stroke="#E3E3E7"/>
  <circle cx="48" cy="75" r="17" fill="#F1F1F4"/>
  <text x="48" y="82" text-anchor="middle" font-size="17" fill="#B9B9BE">‹</text>
  <rect x="76" y="58" width="104" height="34" rx="17" fill="#F1F1F4"/>
  <text x="128" y="80" text-anchor="middle" font-size="11.5" fill="#8E8E93">castlelife.org</text>
  <circle cx="212" cy="75" r="17" fill="#F1F1F4"/>
  <text x="212" y="81" text-anchor="middle" font-size="17" fill="${БРЕНД}" font-weight="700">···</text>
  <circle cx="212" cy="75" r="23" fill="none" stroke="${БРЕНД}" stroke-width="2.5"/>
</svg>`;

// Меню ⋯ — перший пункт «Поширити», саме він веде далі.
const СХЕМА_2 = `
<svg viewBox="0 0 260 150" role="img" aria-label="Меню браузера з пунктом «Поширити»">
  <rect x="40" y="10" width="204" height="130" rx="16" fill="#fff" stroke="#E3E3E7"/>
  <rect x="50" y="20" width="184" height="34" rx="10" fill="#FAE2E6" stroke="${БРЕНД}" stroke-width="2"/>
  <path d="M68 44 v-14 M62 36 l6-6 6 6" fill="none" stroke="${БРЕНД}" stroke-width="2.2"
        stroke-linecap="round" stroke-linejoin="round"/>
  <text x="88" y="42" font-size="13" fill="${БРЕНД}" font-weight="700">Поширити</text>
  <rect x="88" y="68" width="126" height="9" rx="4.5" fill="#E8E8EC"/>
  <rect x="88" y="90" width="104" height="9" rx="4.5" fill="#E8E8EC"/>
  <rect x="88" y="112" width="88" height="9" rx="4.5" fill="#E8E8EC"/>
</svg>`;

// Аркуш «Поширити» — тут і живе «На Початковий екран».
const СХЕМА_3 = `
<svg viewBox="0 0 260 150" role="img" aria-label="Аркуш «Поширити» з пунктом «На Початковий екран»">
  <rect x="16" y="10" width="228" height="130" rx="16" fill="#fff" stroke="#E3E3E7"/>
  <rect x="32" y="24" width="120" height="9" rx="4.5" fill="#E8E8EC"/>
  <rect x="32" y="46" width="150" height="9" rx="4.5" fill="#E8E8EC"/>
  <rect x="26" y="68" width="208" height="36" rx="10" fill="#FAE2E6" stroke="${БРЕНД}" stroke-width="2"/>
  <path d="M44 86 h14 M51 79 v14" stroke="${БРЕНД}" stroke-width="2.5" stroke-linecap="round"/>
  <text x="68" y="91" font-size="12.5" fill="${БРЕНД}" font-weight="700">На Початковий екран</text>
  <rect x="32" y="118" width="96" height="9" rx="4.5" fill="#E8E8EC"/>
</svg>`;

// Останній екран — зі СПРАВЖНЬОЮ іконкою застосунку і його назвою.
// 🗣️ Вова: «можна туди вставити нашу іконку додатку… це буде більш правдоподібно.
// І написати CSTL LIFE в назві. А все остальне, рядки, залишити таким блюром».
const СХЕМА_4 = `
<svg viewBox="0 0 260 150" role="img" aria-label="Екран додавання: іконка CSTL LIFE і кнопка «Додати»">
  <rect x="16" y="14" width="228" height="118" rx="16" fill="#fff" stroke="#E3E3E7"/>
  <rect x="34" y="36" width="52" height="9" rx="4.5" fill="#E8E8EC"/>
  <rect x="168" y="26" width="60" height="28" rx="14" fill="${БРЕНД}"/>
  <text x="198" y="45" text-anchor="middle" font-size="12" fill="#fff" font-weight="700">Додати</text>
  <rect x="160" y="18" width="76" height="44" rx="22" fill="none" stroke="${БРЕНД}" stroke-width="2.5"/>
  <image href="icons/icon-192.png" x="34" y="78" width="38" height="38" preserveAspectRatio="xMidYMid slice"
         clip-path="inset(0 round 9)"/>
  <text x="84" y="94" font-size="12" fill="#2A2520" font-weight="700">CSTL LIFE</text>
  <rect x="84" y="104" width="118" height="8" rx="4" fill="#F1F1F4"/>
</svg>`;

const КРОКИ = [
  { схема: СХЕМА_1, назва: 'Натисни «три крапки»',
    текст: 'Кнопка <b>···</b> у правому нижньому куті браузера.' },
  { схема: СХЕМА_2, назва: 'Обери «Поширити»',
    текст: 'Перший пункт меню, зі значком стрілки вгору.' },
  { схема: СХЕМА_3, назва: 'Знайди «На Початковий екран»',
    текст: 'Гортай список униз, поки не побачиш цей пункт, і натисни його.' },
  { схема: СХЕМА_4, назва: 'Натисни «Додати»',
    текст: 'Кнопка вгорі справа. Іконка CSTL LIFE стане на твій екран — далі заходиш одним тапом.' },
];

function відкритиІнструкцію() {
  const крок = { i: 0 };
  const el = document.createElement('div');
  el.className = 'pwa-guide';
  // 🔑 Один крок на екран, а не три картинки поспіль: на 390pt три схеми з
  // підписами дали б довгу прокрутку, у якій «де я зараз» губиться. Лічильник
  // «1 / 3» відповідає на це питання, не займаючи місця.
  el.innerHTML = `
    <div class="pwa-guide-sheet" role="dialog" aria-modal="true" aria-label="Як встановити CSTL LIFE">
      <button class="pwa-guide-x" type="button" aria-label="Закрити">✕</button>
      <div class="pwa-guide-head">
        <h2>Як встановити CSTL LIFE</h2>
        <!-- 🗣️ Вова 29.08: сказати чесно, що зараз це ВЕБ-версія, а не застосунок
             з App Store. Людина, яка чекала магазин застосунків, інакше вирішить,
             що її обманули на кроці «Поширити». Пояснення термінів у дужках — як
             усюди в проєкті: слово PWA більшості нічого не каже. -->
        <p>Поки що CSTL LIFE — це <b>веб-версія</b> (PWA, застосунок із браузера):
           у магазинах застосунків його ще немає. Ставиться за 4 кроки, і далі
           працює як звичайний застосунок з іконкою на екрані.</p>
      </div>
      <div class="pwa-guide-num"><span class="pwa-guide-now">1</span> / ${КРОКИ.length}</div>
      <div class="pwa-guide-pic"></div>
      <div class="pwa-guide-step">
        <b class="pwa-guide-name"></b>
        <span class="pwa-guide-text"></span>
      </div>
      <div class="pwa-guide-dots" aria-hidden="true"></div>
      <button class="pwa-guide-next" type="button">Далі →</button>
    </div>`;

  const $ = с => el.querySelector(с);
  const намалювати = () => {
    const к = КРОКИ[крок.i];
    const останній = крок.i === КРОКИ.length - 1;
    $('.pwa-guide-now').textContent  = String(крок.i + 1);
    $('.pwa-guide-pic').innerHTML    = к.схема;
    $('.pwa-guide-name').textContent = к.назва;
    $('.pwa-guide-text').innerHTML   = к.текст;
    $('.pwa-guide-next').textContent = останній ? 'Готово' : 'Далі →';
    $('.pwa-guide-dots').innerHTML = КРОКИ
      .map((_, i) => `<i class="${i === крок.i ? 'on' : ''}"></i>`).join('');
  };

  const закрити = () => {
    el.classList.remove('pwa-guide--in');
    setTimeout(() => el.remove(), 220);
    // Дійшов до інструкції — значить банер своє відпрацював. Пауза на 7 днів
    // ставиться в будь-якому разі: показувати його знов завтра означало б не
    // повірити людині, яка вже читала кроки.
    snooze(); забутиПокази();
  };

  $('.pwa-guide-x').addEventListener('click', закрити);
  $('.pwa-guide-next').addEventListener('click', () => {
    if (крок.i === КРОКИ.length - 1) return закрити();
    крок.i += 1;
    намалювати();
  });
  // Тап повз аркуш закриває — та сама звичка, що в решті модалок застосунку.
  el.addEventListener('click', (e) => { if (e.target === el) закрити(); });

  // ── СВАЙП МІЖ КРОКАМИ (прохання Вови 29.08 після живої перевірки) ──────────
  // 🔑 Кнопка «Далі» лишається головним шляхом, свайп — другим: гортання це те,
  // чого рука на телефоні пробує САМА, і коли воно не працює, екран здається
  // зламаним. 📐 Поріг 40px і перевага горизонталі (|dx| > |dy|) — щоб звичайна
  // прокрутка аркуша вгору-вниз не гортала кроки випадково.
  let x0 = null, y0 = null;
  const аркуш = $('.pwa-guide-sheet');
  аркуш.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    x0 = t.clientX; y0 = t.clientY;
  }, { passive: true });
  аркуш.addEventListener('touchend', (e) => {
    if (x0 === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) <= Math.abs(dy)) return;
    // ⚠️ На КРАЯХ свайп навмисно НІЧОГО не робить. «Догорнути» вліво з останнього
    // кроку і закрити аркуш означало б завершити встановлення жестом, схожим на
    // гортання, — людина не зрозуміла б, що сталося.
    const куди = dx < 0 ? крок.i + 1 : крок.i - 1;
    if (куди < 0 || куди >= КРОКИ.length) return;
    крок.i = куди;
    намалювати();
  }, { passive: true });

  намалювати();
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('pwa-guide--in'));
}

// 🔴 БРАУЗЕР, ЯКИЙ ЦЬОГО НЕ ВМІЄ. Чесна відповідь замість мертвих кроків: на
// iPhone «На початковий екран» є тільки в Safari — це обмеження системи, не наше.
// 🔑 Даємо ОДНУ дію (скопіювати адресу), а не просто відмову: інакше людина мусить
// сама згадати, що вона читала, і вручну набрати домен у другому браузері.
function відкритиПроБраузер() {
  const el = document.createElement('div');
  el.className = 'pwa-guide';
  el.innerHTML = `
    <div class="pwa-guide-sheet" role="dialog" aria-modal="true" aria-label="Потрібен Safari">
      <button class="pwa-guide-x" type="button" aria-label="Закрити">✕</button>
      <div class="pwa-guide-head">
        <h2>Потрібен Safari</h2>
        <p>На iPhone поставити застосунок на екран уміє лише Safari — так влаштована
           сама система.</p>
      </div>
      <div class="pwa-guide-step">
        <b class="pwa-guide-name">Що зробити</b>
        <span class="pwa-guide-text">Відкрий <b>castlelife.org</b> у Safari й натисни
          там «Як встановити» — далі три кроки.</span>
      </div>
      <button class="pwa-guide-next" type="button">Скопіювати адресу</button>
    </div>`;

  const закрити = () => {
    el.classList.remove('pwa-guide--in');
    setTimeout(() => el.remove(), 220);
    snooze(); забутиПокази();
  };
  el.querySelector('.pwa-guide-x').addEventListener('click', закрити);
  el.addEventListener('click', (e) => { if (e.target === el) закрити(); });
  el.querySelector('.pwa-guide-next').addEventListener('click', async (e) => {
    // ⚠️ Копіювання може не спрацювати (немає дозволу, старий браузер). Тоді
    // мовчазний провал був би найгіршим варіантом — кнопка «спрацювала», а в
    // буфері порожньо. Кажемо результат просто на кнопці.
    let вийшло = false;
    try { await navigator.clipboard.writeText('https://castlelife.org'); вийшло = true; } catch {}
    e.target.textContent = вийшло ? 'Скопійовано ✓' : 'castlelife.org';
    setTimeout(закрити, вийшло ? 900 : 2200);
  });

  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('pwa-guide--in'));
}
