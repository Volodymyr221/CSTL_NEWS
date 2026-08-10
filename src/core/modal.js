// src/core/modal.js
// Спільний примітив модалки (Потік C1, стандартизація — docs/PLAN_MODALS_STANDARDIZATION.md).
// Раніше кожна фіча мала власну реалізацію (createElement + backdrop + swipe) — ~15 копій
// майже однакової логіки. Цей примітив — перший крок: chrome (backdrop/панель/закриття),
// НЕ чіпає складний вміст (графіки, keyboard-aware чат тощо) — той лишається за викликачем
// через bodyHtml/onMount.
//
// variant:
//   'sheet'  — виїжджає знизу (handle, свайп-вниз закриває). Погода/Сайдбар/Світло/Автобуси.
//   'center' — центрована картка, scale-in. Акаунт (join/profile/cabinet екрани).

import { escapeHtml } from './utils.js';
import { ICONS } from './icons.js';
import { createBackdropFade, attachSheetDismiss } from './sheet-motion.js';

let _active = null;   // { el, close } — лише одна активна модалка примітиву за раз

// 🔴 08.08 — ✕ ВЕКТОРНИЙ, А НЕ СИМВОЛ. Скарга Вови: «ця кругла кнопка закриття,
// всередині хрестик невекторний. Зроби в усіх модалках, стандартизуй».
// Було `✕` (U+2715) — звичайний текстовий гліф, тобто його малює шрифт пристрою.
// Наслідок: на кожному телефоні свій хрестик — інша товщина, інші пропорції, іноді
// зсув від центру; і він НЕ підхоплює `stroke-width` решти іконок застосунку.
// Стало `ICONS.close` — той самий Tabler-контур, що й усі інші іконки хроми.
// 🔑 Правку зроблено САМЕ ТУТ, у примітиві: `core/modal.js` будує аркуш і картку
// для ВСІХ модалок застосунку, тож одне місце стандартизує їх усі одразу. Правити
// це по кожній модалці окремо означало б заводити п'яту копію того самого хрестика.
function closeBtnHtml() {
  return `<button class="app-modal-close" type="button" aria-label="Закрити">${ICONS.close}</button>`;
}

// `dismissible: false` — модалка, яку не можна просто відхилити: немає ✕, немає
// рисочки-грабера (вона обіцяє свайп, якого не буде), закриття по фону і по Escape
// вимкнене. Єдиний вихід — кнопка у вмісті. Потрібно там, де закриття означає
// «прочитав»: гейт правил Дошки (03.08).
function buildSheet({ title, bodyHtml, dismissible }) {
  return `
    <div class="app-modal-backdrop"></div>
    <div class="app-modal-sheet" role="dialog" aria-modal="true"${title ? ` aria-label="${escapeHtml(title)}"` : ''}>
      ${dismissible ? '<div class="app-modal-handle"></div>' : ''}
      ${dismissible ? closeBtnHtml() : ''}
      ${title ? `<h2 class="app-modal-title">${escapeHtml(title)}</h2>` : ''}
      <div class="app-modal-body">${bodyHtml}</div>
    </div>`;
}

function buildCenter({ title, bodyHtml, dismissible }) {
  return `
    <div class="app-modal-backdrop"></div>
    <div class="app-modal-card" role="dialog" aria-modal="true">
      ${dismissible ? closeBtnHtml() : ''}
      ${title ? `<h2 class="app-modal-title">${escapeHtml(title)}</h2>` : ''}
      <div class="app-modal-body">${bodyHtml}</div>
    </div>`;
}

// Відкриває модалку. onMount(wrap) — щоб викликач дов'язав власні обробники до bodyHtml.
// onClose() — викликається ОДИН раз перед закриттям (будь-яким шляхом: backdrop/X/ESC/свайп) —
// для прибирання ресурсів викликача (напр. URL.revokeObjectURL на blob-фото).
// Повертає { close, el }. swipeClose=false вимикає свайп (напр. коли всередині свій скрол-жест).
// dismissible=false — закрити можна ЛИШЕ програмно (з кнопки у вмісті): без ✕, без
// свайпу, без тапу по фону, без Escape. Викликач зобовʼязаний дати свій вихід.
export function openModal({ title = '', bodyHtml = '', variant = 'sheet', onMount, onClose, swipeClose = true, className = '', dismissible = true } = {}) {
  closeModal();   // одна модалка примітиву за раз — друга просто заміняє першу
  if (!dismissible) swipeClose = false;   // свайп — теж спосіб відхилити

  const wrap = document.createElement('div');
  wrap.className = `app-modal app-modal--${variant}${className ? ' ' + className : ''}`;
  wrap.innerHTML = variant === 'center'
    ? buildCenter({ title, bodyHtml, dismissible })
    : buildSheet({ title, bodyHtml, dismissible });
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => wrap.classList.add('open'));

  const backdrop = wrap.querySelector('.app-modal-backdrop');
  const panel    = wrap.querySelector('.app-modal-sheet, .app-modal-card');
  const closeBtn = wrap.querySelector('.app-modal-close');

  const onKey = e => { if (e.key === 'Escape' && dismissible) close(); };
  document.addEventListener('keydown', onKey);

  // ── ЗАКРИТТЯ ЯК У «СТРІЧЦІ»: АРКУШ З'ЇЖДЖАЄ ДОНИЗУ, А НЕ ЗГАСАЄ (27.07) ──────────
  // Вова: «логіка закриття / відкриття модалок має бути така як в стрічці, плавна і чітка».
  //
  // БУЛО: `wrap.classList.remove('open')` → `.app-modal { opacity: 0 }` гасив УВЕСЬ
  // контейнер разом з аркушем. Аркуш нікуди не їхав — він просто зникав.
  // СТАЛО (дослівно патерн `.fd-sheet` зі «Стрічки»): рухаємо `transform` аркуша,
  // а затемнення гасимо ОКРЕМИМ елементом. Це різні вузли, тож аркуш лишається
  // повністю видимим усю дорогу вниз — те, чого Вова домагався в листі коментарів
  // (PR #664, «не видно що вона згортається до низу»).
  //
  // ⚠️ ГЕОМЕТРІЮ СКРОЛУ НЕ ЧІПАЄМО. Саме вона (хто скролиться — аркуш чи тіло) двічі
  // зламала «Подати оголошення» і була відкочена (#677). Анімація закриття від неї
  // не залежить: тут немає жодної зміни в CSS розкладки.
  let closing = false;
  // Спільна частина будь-якого закриття — знімаємо стан і слухачі рівно один раз.
  function teardown() {
    if (_active?.el === wrap) _active = null;
    onClose?.();
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey);
  }

  // ⚠️ Висоту фіксуємо в пікселях ПЕРЕД рухом: `translateY(100%)` рахується від ВЛАСНОЇ
  // висоти елемента, і якщо вона в цей момент зміниться — ціль «тікає» і рух стає
  // нерівномірним. Це вже коштувало окремого фіксу в листі коментарів (PR #663).
  function slideOut(ms = 240) {
    panel.style.height = panel.offsetHeight + 'px';
    panel.style.transition = `transform ${ms}ms cubic-bezier(0.32, 0.72, 0, 1)`;
    panel.style.transform = 'translateY(100%)';
    if (backdrop) {
      backdrop.style.transition = `opacity ${ms}ms linear`;
      backdrop.style.opacity = '0';
    }
    setTimeout(() => wrap.remove(), ms + 20);
  }

  function close() {
    if (closing || _active?.el !== wrap) return;
    closing = true;
    teardown();
    // Центрована картка донизу не їде — там своя анімація (scale), лишаємо як було.
    if (variant !== 'sheet' || !panel) {
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 240);
      return;
    }
    slideOut();
  }

  if (dismissible) backdrop?.addEventListener('click', close);
  closeBtn?.addEventListener('click', close);   // при dismissible:false кнопки в розмітці немає

  // Свайп-вниз закриває (лише sheet-варіант).
  //
  // 🔴 10.08 — САМ ЖЕСТ ПЕРЕЇХАВ У `core/sheet-motion.js` (`attachSheetDismiss`).
  // Тут лишилось те, що специфічне САМЕ для цієї модалки: як її прибирати.
  // Причина переїзду: хаб «Збережені» будує власний нижній аркуш із рисочкою-
  // грабером, тобто з обіцянкою свайпу, але жесту не мав (скарга Вови «модалку
  // збереження не можу закрити свайпом»). Копія цих ~50 рядків у другому файлі
  // була б рівно тією помилкою, від якої застерігав коментар, що тут стояв:
  // копії в цьому проєкті вже двічі розходились.
  // ⚠️ Поведінка не змінена ні на крок — весь опис жесту (замок на прокрутку,
  // граб за шапку, блокування нативного скролу) переїхав дослівно й лежить тепер
  // у шапці `attachSheetDismiss`.
  if (variant === 'sheet' && swipeClose && panel) {
    const fade = createBackdropFade(backdrop);   // затемнення світлішає разом з рухом
    attachSheetDismiss({
      panel,                 // у цієї модалки панель сама собі скролер
      backdrop: fade,
      // Аркуш УЖЕ поїхав донизу (`finishSwipe` щойно поставив transform), а
      // затемнення гасить `fade`. Тому тут НЕ кличемо close() — він запустив би
      // другу, зустрічну анімацію. Робимо рівно два діла: фіксуємо висоту
      // (нерухома ціль для translateY) і прибираємо вузол після доїзду. Клас
      // `open` НЕ знімаємо — інакше контейнер загасив би аркуш раніше, ніж той
      // доїде («просто зникло»).
      onDismiss: (ms) => {
        if (closing) return;
        closing = true;
        teardown();
        panel.style.height = panel.offsetHeight + 'px';
        setTimeout(() => wrap.remove(), ms + 20);
      },
    });
  }

  onMount?.(wrap);
  _active = { el: wrap, close };
  return { close, el: wrap };
}

// Закрити поточну активну модалку примітиву (якщо є).
export function closeModal() {
  _active?.close();
}
