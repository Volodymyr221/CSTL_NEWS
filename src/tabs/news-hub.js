// src/tabs/news-hub.js
// ПОВНОЕКРАННИЙ ХАБ НОВИН (31.07, потік /byyou «блок новин Громади»).
//
// НАВІЩО. Блок «Табло новин» у Громаді був вкладеним скролером: заміряно живцем
// (390×844) вікно 465px при вмісті 6 933px — тобто **6 468px сховано всередині
// картки**, яка сама займала 567px = 77.6% видимої зони головного екрана. Прокрутка
// всередині прокрутки — єдиний такий випадок у Громаді (решта шість віджетів дали
// рівно 0 вкладених скролерів), і вона з'їдала головну сторінку заради вмісту,
// який нікуди не вміщався. Новинам потрібен власний екран, а не щілина у віджеті.
//
// 🔴 ЧОМУ ШАР, А НЕ ВКЛАДКА. Вкладка означала б повернення «Новин» у таб-бар, який
// Вова свідомо звів до п'яти (22.07). Шар (`core/layers.js`) відкривається ПОВЕРХ
// Громади й закривається системним жестом «назад» — таб-бар не чіпаємо.
//
// 🔴 ЖЕСТ «НАЗАД» ОБСЛУГОВУЄ СИСТЕМА. Власного свайпу тут НЕМА навмисно: iOS
// однаково малює свою анімацію переходу, і два рухи накладались один на одного
// (баг зі скріна IMG_3559, 24.07 — детально в шапці `core/layers.js`). Ми лише
// кладемо запис в історію і прибираємо екран, коли система повідомляє `popstate`.
import { openLayer, closeLayer } from '../core/layers.js';
import { escapeHtml, attachSwipe } from '../core/utils.js';
import {
  ensureNewsLoaded, newsCardsHtml, openArticle,
  NEWS_GEO_GROUPS, articlesOfGroup, markNewsSeen, handleImgError,
} from './news.js';

const IC_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6"/></svg>';

// Відкритий хаб — щоб другий тап по віджету не наплодив других екранів.
let _hub = null;
// Остання відкрита категорія: повернувся в хаб — потрапив туди, де був.
// Свідомо в пам'яті модуля, а НЕ в localStorage: це стан сесії, а не налаштування.
// Новий ключ сховища — 🔴-крок за правилами /byyou, і він тут не потрібен.
let _lastGroup = NEWS_GEO_GROUPS[0];

export function isNewsHubOpen() { return !!_hub; }

// Скелет на перший показ (крок 10). До цього екран відкривався з написом
// «Завантаження…» посеред порожнечі — а `data/articles.json` це 1.31 МБ, тобто на
// слабкому звʼязку порожнеча тримається помітно довго.
// ⚠️ Скелет повторює РЕАЛЬНУ розкладку списку (велика перша + рядки з мініатюрою
// праворуч), а не абстрактні смужки: сенс у тому, щоб при появі даних нічого не
// стрибнуло. Заглушка, схожа на щось інше, лише додає ривок.
// `aria-hidden` — читачу екрана ці порожні блоки не потрібні, для нього є
// `nh-loading` з текстом.
function skeletonHtml() {
  const row = `<div class="nh-sk-row"><div class="nh-sk-txt">
      <span class="nh-sk-line"></span><span class="nh-sk-line nh-sk-line--short"></span>
    </div><span class="nh-sk-thumb"></span></div>`;
  return `<div class="nh-sk" aria-hidden="true">
      <div class="nh-sk-lead"><span class="nh-sk-photo"></span>
        <span class="nh-sk-line nh-sk-line--big"></span>
        <span class="nh-sk-line nh-sk-line--big nh-sk-line--short"></span></div>
      ${row.repeat(4)}
    </div>
    <div class="nh-loading sr-only" role="status">Завантаження новин…</div>`;
}

// Відкрити хаб. group — з якої категорії почати (за замовчуванням остання відкрита).
export async function openNewsHub(group) {
  if (_hub) return;                                  // вже відкритий — другий не потрібен
  const active = NEWS_GEO_GROUPS.includes(group) ? group : _lastGroup;
  _lastGroup = active;

  // Новини побачено — бейдж «N нових» на віджеті гасне (крок 8).
  // ⚠️ Подією, а НЕ прямим імпортом віджета: `community-blocks.js` уже імпортує цей
  // модуль, і зворотний імпорт замкнув би коло. Той самий прийом, що `cstl-disc-seen`
  // між Обговореннями і таб-баром.
  markNewsSeen();
  window.dispatchEvent(new CustomEvent('cstl-news-seen'));

  const screen = document.createElement('div');
  screen.className = 'nh-screen';
  screen.innerHTML = `
    <div class="nh-bar">
      <button class="nh-back" type="button" aria-label="Назад">${IC_BACK}</button>
      <div class="nh-title">Новини</div>
    </div>
    <div class="nh-tabs" role="tablist">
      ${NEWS_GEO_GROUPS.map(g => `
        <button class="nh-tab${g === active ? ' is-on' : ''}" type="button" role="tab"
                aria-selected="${g === active}" data-nh-group="${escapeHtml(g)}">${escapeHtml(g)}</button>
      `).join('')}
    </div>
    <div class="nh-list" data-nh-list>${skeletonHtml()}</div>`;
  document.body.appendChild(screen);
  // Биті чужі фото → брендовий плейсхолдер 🏰 замість системної іконки «зламане
  // зображення». ⚠️ `error` НЕ спливає, тому слухаємо у фазі ЗАХОПЛЕННЯ (третій
  // аргумент `true`) — зі звичайним слухачем на контейнері подія просто не дійшла б.
  // Обробник спільний із модалкою статті (`news.js`), своєї копії тут нема.
  screen.addEventListener('error', handleImgError, true);
  // 🔴 Мітка «хаб відкритий» на <body> (31.07, баг зі скріна IMG_3776).
  // Через неї CSS піднімає модалку статті НАД хабом. Скарга Вови: «модалка новини
  // відкривається під сторінкою НОВИНИ» — і так воно й було: `#article-modal` має
  // z-index 1100, а цей екран 1200 (число я скопіював з `.fd-screen`, не звіривши;
  // у «Стрічці» конфлікт не спливав, бо звідти статті не відкривають).
  // ⚠️ Чому саме міткою, а не просто підняттям модалки назавжди: шапка застосунку
  // лишається доступною при відкритій статті, тож людина може тапнути бургер —
  // а сайдбар теж має z-index 1200 і поїхав би ПІД статтю. Поки відкритий хаб,
  // шапки не видно взагалі, тому в цьому стані підняття безпечне.
  document.body.classList.add('nh-open');

  // Шар історії. `close` — миттєве прибирання (системний жест уже відпрацював свою
  // анімацію); `animateOut` — плавне зникнення для натискання КНОПКИ «назад», де
  // анімації нема. Той самий розподіл, що в екрані спільноти «Стрічки».
  // ⚠️ Спостерігач дозавантаження знімаємо ТУТ, а не покладаємось на прибирання
  // вузла: `IntersectionObserver` тримає посилання на ціль і на свій `root`, тож
  // мовчки пережив би закритий екран — а кожне наступне відкриття вішало б ще один.
  const layer = openLayer(
    () => {
      if (_io) { _io.disconnect(); _io = null; }
      screen.remove();
      document.body.classList.remove('nh-open');
      _hub = null;
    },
    { animateOut: () => screen.classList.remove('open') },
  );
  _hub = { screen, layer };
  screen.querySelector('.nh-back').addEventListener('click', () => closeLayer(layer, { animate: 240 }));

  // Клас `.open` — наступним кадром, інакше браузер побачить елемент одразу в
  // кінцевому стані й переходу не буде (він анімує ЗМІНУ, а не перший запис).
  requestAnimationFrame(() => screen.classList.add('open'));

  // Перемикач категорій і відкриття статті — одним делегованим слухачем.
  // Список перемальовується, тож прямі слухачі на картках злітали б.
  screen.addEventListener('click', e => {
    const tab = e.target.closest('[data-nh-group]');
    if (tab) { setGroup(tab.dataset.nhGroup); return; }
    const card = e.target.closest('[data-article-id]');
    if (card) {
      const id = Number(card.dataset.articleId);
      if (Number.isFinite(id)) openArticle(id);
    }
  });

  // Свайп між категоріями (крок 5). Вішаємо на СПИСОК, а не на весь екран: інакше
  // жест ловився б і на смузі вкладок, де палець і так має цілитись у кнопку.
  // ⚠️ `edgeGuard: 28` — дотик, що почався в лівій смузі, віддаємо системі: там живе
  // жест «назад» iOS, і без цього один рух пальця і повертав би екран, і гортав
  // категорію. Ортогональність до вертикальної прокрутки тримає сам `attachSwipe`
  // (|dx| > |dy| і поріг 50px), тому діагональний рух лишається прокруткою.
  attachSwipe(
    screen.querySelector('.nh-list'),
    () => stepGroup(+1),   // палець уліво → наступна категорія
    () => stepGroup(-1),   // палець управо → попередня
    { edgeGuard: 28 },
  );

  await paint(active);
}

// Сусідня категорія. БЕЗ закільцьовування: на краю списку свайп нічого не робить.
// Кільце тут було б шкідливе — людина не бачить, що опинилась на іншому кінці,
// і три розділи занадто короткі, щоб це читалось як «прокрутка по колу».
function stepGroup(dir) {
  const i = NEWS_GEO_GROUPS.indexOf(_lastGroup) + dir;
  if (i < 0 || i >= NEWS_GEO_GROUPS.length) return;
  setGroup(NEWS_GEO_GROUPS[i]);
}

// Перемкнути категорію: підсвітити вкладку і перемалювати список.
function setGroup(group) {
  if (!_hub || !NEWS_GEO_GROUPS.includes(group) || group === _lastGroup) return;
  _lastGroup = group;
  _hub.screen.querySelectorAll('.nh-tab').forEach(t => {
    const on = t.dataset.nhGroup === group;
    t.classList.toggle('is-on', on);
    t.setAttribute('aria-selected', String(on));
  });
  // Нова категорія — новий список, тож починаємо з початку. Це НЕ той випадок, коли
  // треба тримати прокрутку (`core/list-patch.js`): там список той самий і зміна
  // часткова, а тут людина свідомо перейшла в інший розділ.
  _hub.screen.querySelector('.nh-list').scrollTop = 0;
  paint(group);
}

// ── ПОРЦІЇ (крок 4) ─────────────────────────────────────────────────────────
// 🔴 НАВІЩО. Без порцій хаб малює всю категорію одразу — заміряно 212 карток у
// «Україна та Світ» і 166 у «Волині», тобто рівно та хвороба, від якої тікали з
// віджета (там було 216 карток і 162 `<img>` в одному DOM). Перенести вкладений
// скролер на власний екран і лишити той самий обсяг = перекласти проблему, а не
// вирішити.
//
// ⚠️ Порції — це про РЕНДЕР, не про мережу. `data/articles.json` (1.31 МБ) однаково
// тягнеться цілим; його розділення на «свіже + архів» Вова свідомо відклав у
// наступний потік 31.07. Тобто тут стає легше телефону (менше вузлів і картинок),
// а не каналу. Плутати ці дві речі не можна.
const PAGE_SIZE = 20;
let _shown = 0;           // скільки карток уже намальовано в поточній категорії
let _io = null;           // спостерігач за «сторожем» унизу списку

// Намалювати ПЕРШУ порцію категорії. `ensureNewsLoaded` кешує — після першого разу
// перемикання вкладок у мережу не ходить.
async function paint(group) {
  const arts = await ensureNewsLoaded();
  if (!_hub || _lastGroup !== group) return;   // встигли перемкнути / закрити — не малюємо
  const list = _hub.screen.querySelector('.nh-list');
  const all = articlesOfGroup(arts, group);
  _shown = 0;
  list.innerHTML = '';
  appendChunk(list, all, group);
  markLead(list, all);
  armSentinel(list, all, group);
}

// Дописати наступні PAGE_SIZE карток. `insertAdjacentHTML('beforeend')` — саме
// дописування, а не `innerHTML +=`: останнє перебудувало б УЖЕ намальовані картки,
// зруйнувавши прокрутку під пальцем і перезавантаживши всі картинки.
function appendChunk(list, all, group) {
  const next = all.slice(_shown, _shown + PAGE_SIZE);
  if (!next.length) return false;
  const from = list.children.length;
  list.insertAdjacentHTML('beforeend', newsCardsHtml(next, { variant: 'row' }));
  const fresh = [...list.children].slice(from);
  fresh.forEach(node => dropRedundantGeo(node, group));
  _shown += next.length;
  return true;
}

// 🔴 ГЕО-МІТКА, ЯКА ПОВТОРЮЄ АКТИВНУ ВКЛАДКУ, — ЦЕ ШУМ (31.07).
// У вкладці «Громада» кожна картка писала «ГРОМАДА», у «Волині» — «ВОЛИНЬ».
// ⚠️ Але прибирати гео СКРІЗЬ не можна: у розділі «Україна та Світ» мітка каже,
// що саме це — Україна чи Світ, і там вона єдина несе інформацію. Тому звіряємо
// текст із назвою активної групи і знімаємо лише збіг.
// Робимо в JS, а не в CSS: правило «сховати, якщо текст дорівнює назві вкладки»
// селектором не виражається.
function dropRedundantGeo(node, group) {
  const b = node.querySelector && node.querySelector('.nc-badge--geo');
  if (!b) return;
  const t = b.textContent.trim().toLowerCase();
  // 'Олика' — стара назва Громади у старих статтях, для читача це те саме.
  if (t === group.toLowerCase() || (group === 'Громада' && t === 'олика')) b.remove();
}

// Перша новина списку — ВЕЛИКОЮ карткою з фото (патерн Apple News / Google News).
// ⚠️ Тільки якщо фото справді є: «герой» без знімка — це просто роздутий блок
// тексту, який з'їдає екран і нічого не додає. Тому клас вішає JS, а не
// `:first-child` у CSS — CSS не бачить, чи вантажиться картинка.
// ⚠️ Саме ЗАМІНА варіанта (`nc--row` → `nc--lead`), а не додавання класу поверх:
// інакше картка носила б два варіанти одночасно і правильний вигляд тримався б
// лише на порядку правил у файлі — тобто зламався б від невинного перенесення
// блоку в CSS. Варіант у компонента завжди рівно один.
function markLead(list, all) {
  const first = list.firstElementChild;
  if (!first || !all.length) return;
  if (all[0].image && first.querySelector('img')) first.classList.replace('nc--row', 'nc--lead');
}

// «Сторож» — порожній вузол у кінці списку. Щойно він потрапляє у видиму область,
// дописуємо наступну порцію. `IntersectionObserver` замість слухача `scroll`: браузер
// сам вирішує, коли перевіряти, і не смикає наш код на кожен кадр прокрутки.
// `rootMargin` 600px — дописуємо ЗАЗДАЛЕГІДЬ, за пів екрана до кінця, щоб людина не
// впиралась у порожнечу і не бачила підвантаження.
function armSentinel(list, all, group) {
  if (_io) { _io.disconnect(); _io = null; }
  if (_shown >= all.length) return;            // усе вмістилось — сторож не потрібен
  const mark = document.createElement('div');
  mark.className = 'nh-more';
  list.appendChild(mark);
  _io = new IntersectionObserver(entries => {
    if (!entries.some(e => e.isIntersecting)) return;
    if (!_hub) { _io.disconnect(); _io = null; return; }
    // Сторож завжди має лишатись ОСТАННІМ, інакше нова порція ляже під нього і він
    // більше ніколи не вийде з видимої області → дозавантаження зупиниться назавжди.
    const more = appendChunk(list, all, group);
    list.appendChild(mark);
    if (!more || _shown >= all.length) { _io.disconnect(); _io = null; mark.remove(); }
  }, { root: list, rootMargin: '600px' });
  _io.observe(mark);
}
