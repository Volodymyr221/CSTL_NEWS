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
import { escapeHtml } from '../core/utils.js';
import {
  ensureNewsLoaded, newsCardsHtml, openArticle,
  NEWS_GEO_GROUPS, articlesOfGroup,
} from './news.js';

const IC_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6"/></svg>';

// Відкритий хаб — щоб другий тап по віджету не наплодив других екранів.
let _hub = null;
// Остання відкрита категорія: повернувся в хаб — потрапив туди, де був.
// Свідомо в пам'яті модуля, а НЕ в localStorage: це стан сесії, а не налаштування.
// Новий ключ сховища — 🔴-крок за правилами /byyou, і він тут не потрібен.
let _lastGroup = NEWS_GEO_GROUPS[0];

export function isNewsHubOpen() { return !!_hub; }

// Відкрити хаб. group — з якої категорії почати (за замовчуванням остання відкрита).
export async function openNewsHub(group) {
  if (_hub) return;                                  // вже відкритий — другий не потрібен
  const active = NEWS_GEO_GROUPS.includes(group) ? group : _lastGroup;
  _lastGroup = active;

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
    <div class="nh-list" data-nh-list>
      <div class="nh-loading">Завантаження…</div>
    </div>`;
  document.body.appendChild(screen);

  // Шар історії. `close` — миттєве прибирання (системний жест уже відпрацював свою
  // анімацію); `animateOut` — плавне зникнення для натискання КНОПКИ «назад», де
  // анімації нема. Той самий розподіл, що в екрані спільноти «Стрічки».
  // ⚠️ Спостерігач дозавантаження знімаємо ТУТ, а не покладаємось на прибирання
  // вузла: `IntersectionObserver` тримає посилання на ціль і на свій `root`, тож
  // мовчки пережив би закритий екран — а кожне наступне відкриття вішало б ще один.
  const layer = openLayer(
    () => { if (_io) { _io.disconnect(); _io = null; } screen.remove(); _hub = null; },
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

  await paint(active);
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
  appendChunk(list, all);
  armSentinel(list, all);
}

// Дописати наступні PAGE_SIZE карток. `insertAdjacentHTML('beforeend')` — саме
// дописування, а не `innerHTML +=`: останнє перебудувало б УЖЕ намальовані картки,
// зруйнувавши прокрутку під пальцем і перезавантаживши всі картинки.
function appendChunk(list, all) {
  const next = all.slice(_shown, _shown + PAGE_SIZE);
  if (!next.length) return false;
  list.insertAdjacentHTML('beforeend', newsCardsHtml(next, { compact: true }));
  _shown += next.length;
  return true;
}

// «Сторож» — порожній вузол у кінці списку. Щойно він потрапляє у видиму область,
// дописуємо наступну порцію. `IntersectionObserver` замість слухача `scroll`: браузер
// сам вирішує, коли перевіряти, і не смикає наш код на кожен кадр прокрутки.
// `rootMargin` 600px — дописуємо ЗАЗДАЛЕГІДЬ, за пів екрана до кінця, щоб людина не
// впиралась у порожнечу і не бачила підвантаження.
function armSentinel(list, all) {
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
    const more = appendChunk(list, all);
    list.appendChild(mark);
    if (!more || _shown >= all.length) { _io.disconnect(); _io = null; mark.remove(); }
  }, { root: list, rootMargin: '600px' });
  _io.observe(mark);
}
