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
import { createDragTracker, finishSwipe, sheetRemaining, createBackdropFade } from './sheet-motion.js';

let _active = null;   // { el, close } — лише одна активна модалка примітиву за раз

function buildSheet({ title, bodyHtml }) {
  return `
    <div class="app-modal-backdrop"></div>
    <div class="app-modal-sheet" role="dialog" aria-modal="true"${title ? ` aria-label="${escapeHtml(title)}"` : ''}>
      <div class="app-modal-handle"></div>
      <button class="app-modal-close" type="button" aria-label="Закрити">✕</button>
      ${title ? `<h2 class="app-modal-title">${escapeHtml(title)}</h2>` : ''}
      <div class="app-modal-body">${bodyHtml}</div>
    </div>`;
}

function buildCenter({ title, bodyHtml }) {
  return `
    <div class="app-modal-backdrop"></div>
    <div class="app-modal-card" role="dialog" aria-modal="true">
      <button class="app-modal-close" type="button" aria-label="Закрити">✕</button>
      ${title ? `<h2 class="app-modal-title">${escapeHtml(title)}</h2>` : ''}
      <div class="app-modal-body">${bodyHtml}</div>
    </div>`;
}

// Відкриває модалку. onMount(wrap) — щоб викликач дов'язав власні обробники до bodyHtml.
// onClose() — викликається ОДИН раз перед закриттям (будь-яким шляхом: backdrop/X/ESC/свайп) —
// для прибирання ресурсів викликача (напр. URL.revokeObjectURL на blob-фото).
// Повертає { close, el }. swipeClose=false вимикає свайп (напр. коли всередині свій скрол-жест).
export function openModal({ title = '', bodyHtml = '', variant = 'sheet', onMount, onClose, swipeClose = true, className = '' } = {}) {
  closeModal();   // одна модалка примітиву за раз — друга просто заміняє першу

  const wrap = document.createElement('div');
  wrap.className = `app-modal app-modal--${variant}${className ? ' ' + className : ''}`;
  wrap.innerHTML = variant === 'center' ? buildCenter({ title, bodyHtml }) : buildSheet({ title, bodyHtml });
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => wrap.classList.add('open'));

  const backdrop = wrap.querySelector('.app-modal-backdrop');
  const panel    = wrap.querySelector('.app-modal-sheet, .app-modal-card');
  const closeBtn = wrap.querySelector('.app-modal-close');

  const onKey = e => { if (e.key === 'Escape') close(); };
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

  backdrop?.addEventListener('click', close);
  closeBtn?.addEventListener('click', close);

  // Свайп-вниз закриває (лише sheet-варіант).
  if (variant === 'sheet' && swipeClose && panel) {
    let startY = 0, dragging = false, dy = 0, travel = 1;
    const drag = createDragTracker();   // швидкість пальця → нативне завершення жесту
    const fade = createBackdropFade(backdrop);   // затемнення світлішає разом з рухом
    panel.addEventListener('touchstart', e => {
      const y = e.touches[0].clientY;
      // Граб від верхньої шапки (перші ~64px аркуша — рисочка/заголовок) закриває свайпом
      // ЗАВЖДИ, навіть коли контент прогорнуто. У тілі — лише коли скрол на самому верху,
      // інакше це звичайний скрол (не перехоплюємо).
      const inHeader = (y - panel.getBoundingClientRect().top) < 64;
      if (!inHeader && panel.scrollTop > 0) return;
      startY = y; dragging = true; dy = 0;
      travel = Math.max(panel.offsetHeight || 1, 1);   // повний шлях аркуша — міряємо раз за жест
      drag.start(y);
    }, { passive: true });
    panel.addEventListener('touchmove', e => {
      if (!dragging) return;
      dy = e.touches[0].clientY - startY;
      if (dy <= 0) { panel.style.transform = ''; fade?.track(0); return; }   // тягнуть вгору — віддаємо нативному скролу
      // Зсув-закриття вмикаємо ЛИШЕ коли контент на самому верху (scrollTop === 0) —
      // як у рідних нижніх аркушах iOS (потягнути-закрити можна лише долиставши вгору).
      // Якщо контент ще прокручений (напр. прокрутив вниз, потім розвернув палець
      // назад в одному жесті) — НЕ хапаємо це в закриття, а віддаємо нативному скролу
      // довести контент до верху; startY переставляємо, щоб зсув почав рахуватись від
      // точки досягнення верху (без стрибка). Це усуває відрив липкої шапки: transform
      // на прокрученому контейнері зі sticky-дітьми рве їх від тіла на iOS WebKit.
      if (panel.scrollTop > 0) {
        panel.style.transform = '';
        fade?.track(0);
        startY = e.touches[0].clientY;
        drag.start(startY);
        dy = 0;
        return;
      }
      // passive:false + preventDefault — БЛОКУЄ нативний скрол поки тягнемо аркуш вниз.
      // Інакше контент рухався б і від transform, і від скролу разом (візуально 2× + відрив тексту).
      e.preventDefault();
      panel.style.transition = 'none';
      panel.style.transform = `translateY(${dy}px)`;
      fade?.track(dy / travel);   // фон світлішає рівно на стільки, на скільки пішов аркуш
      drag.move(e.touches[0].clientY);
    }, { passive: false });
    panel.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      // Доїзд рахує sheet-motion: закрити (дотягнув АБО кинув швидко) чи повернути,
      // і за який час — пропорційно залишку шляху. Раніше close() лишав інлайн
      // transform на translateY(dy) → панель застигала на місці й різко зникала.
      finishSwipe({
        panel, dy, velocity: drag.velocity,
        remaining: sheetRemaining(panel, dy),
        dismissTransform: 'translateY(100%)',
        // Аркуш УЖЕ поїхав донизу (`finishSwipe` щойно поставив transform), а затемнення
        // гасить `fade`. Тому тут НЕ кличемо close() — він запустив би другу, зустрічну
        // анімацію. Робимо рівно два діла: фіксуємо висоту (нерухома ціль для
        // translateY) і прибираємо вузол після доїзду. Клас `open` НЕ знімаємо —
        // інакше контейнер загасив би аркуш раніше, ніж той доїде («просто зникло»).
        onDismiss: (ms) => {
          if (closing) return;
          closing = true;
          teardown();
          panel.style.height = panel.offsetHeight + 'px';
          setTimeout(() => wrap.remove(), ms + 20);
        },
        backdrop: fade,
      });
      dy = 0;
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
