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
  const layer = openLayer(
    () => { screen.remove(); _hub = null; },
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

// Намалювати список категорії. `ensureNewsLoaded` кешує — після першого разу
// перемикання вкладок у мережу не ходить.
async function paint(group) {
  const arts = await ensureNewsLoaded();
  if (!_hub || _lastGroup !== group) return;   // встигли перемкнути / закрити — не малюємо
  const list = _hub.screen.querySelector('.nh-list');
  list.innerHTML = newsCardsHtml(articlesOfGroup(arts, group), { compact: true });
}
