// src/tabs/community.js
// Модуль «Громада» — головна вкладка-дашборд.
// Тонкий entry-point: скелетон + greeting + диспетчер render-блоків.
// Render-блоки винесено у community-blocks.js, модалка — у community-modal.js.
//
// Порядок на вкладці:
//   Hero фото → Greeting (дата + Добрий ранок/вечір) → Дошка → Погода
//   → Світло → Автобус → Подія громади → Контакти.

import { escapeHtml, attachSwipe } from '../core/utils.js';
import {
  renderWeatherBlock,
  renderPowerBlock,
  renderBusBlock,
  renderBoardBlock,
  renderEventBlock,
  renderContactsBlock,
} from './community-blocks.js';

// ── Hero ротатор: 3 фото Олики, fade-transition 0.8s, інтервал 6s ────────────
const HERO_IMAGES = [
  './photos/olyka-1.jpg',
  './photos/olyka-2.jpg',
  './photos/olyka-3.jpg',
];

let _heroInterval = null;
let _heroIndex = 0;

function showHeroSlide(idx) {
  const wrap = document.querySelector('.cm-hero');
  if (!wrap) return;
  _heroIndex = (idx + HERO_IMAGES.length) % HERO_IMAGES.length;
  wrap.querySelectorAll('.cm-hero-img').forEach((img, i) => {
    img.classList.toggle('active', i === _heroIndex);
  });
  wrap.querySelectorAll('.cm-hero-dot').forEach((d, i) => {
    d.classList.toggle('active', i === _heroIndex);
  });
}

function restartHeroAutoRotate() {
  if (_heroInterval) clearInterval(_heroInterval);
  if (HERO_IMAGES.length < 2) return;
  _heroInterval = setInterval(() => {
    const wrap = document.querySelector('.cm-hero');
    if (!wrap) { clearInterval(_heroInterval); _heroInterval = null; return; }
    showHeroSlide(_heroIndex + 1);
  }, 6000);
}

function startHeroRotator() {
  _heroIndex = 0;
  restartHeroAutoRotate();
  // Свайп — ручна зміна фото. Скидає авто-таймер щоб одразу не перескочило.
  const wrap = document.querySelector('.cm-hero');
  if (wrap) {
    attachSwipe(wrap,
      () => { showHeroSlide(_heroIndex + 1); restartHeroAutoRotate(); },
      () => { showHeroSlide(_heroIndex - 1); restartHeroAutoRotate(); }
    );
    // Клік на dot — переходить на той слайд
    wrap.querySelectorAll('.cm-hero-dot').forEach((d, i) => {
      d.style.cursor = 'pointer';
      d.addEventListener('click', () => {
        showHeroSlide(i);
        restartHeroAutoRotate();
      });
    });
  }
}

// ── Greeting + Дата (заголовок вкладки) ──────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5  && h < 11) return { text: 'Добрий ранок, громадо!', sub: 'Ось що головне у нас сьогодні' };
  if (h >= 11 && h < 17) return { text: 'Добридень, громадо!',    sub: 'Ось що головне у нас сьогодні' };
  if (h >= 17 && h < 22) return { text: 'Добрий вечір, громадо!', sub: 'Що цікавого було сьогодні' };
  return { text: 'Доброї ночі, громадо!', sub: 'Громада спить — ось добірка' };
}

function formatTodayHeader() {
  const d = new Date();
  const wd = ['неділя','понеділок','вівторок','середа','четвер','пʼятниця','субота'][d.getDay()];
  const m  = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'][d.getMonth()];
  return `${wd} · ${d.getDate()} ${m}`;
}

// ── Скелетон-каркас вкладки ──────────────────────────────────────────────────

function renderSkeleton() {
  const el = document.getElementById('cm-content');
  if (!el) return;

  const greeting = getGreeting();
  const todayStr = formatTodayHeader();

  el.innerHTML = `
    <section class="cm-greeting">
      <div class="cm-greeting-date">${escapeHtml(todayStr)}</div>
      <div class="cm-greeting-text">${escapeHtml(greeting.text)}</div>
      <div class="cm-greeting-sub">${escapeHtml(greeting.sub)}</div>
    </section>

    <section class="cm-hero">
      ${HERO_IMAGES.map((url, i) => `
        <img class="cm-hero-img${i === 0 ? ' active' : ''}" src="${escapeHtml(url)}" alt="${i === 0 ? 'Олика' : ''}" loading="${i === 0 ? 'eager' : 'lazy'}">
      `).join('')}
      <div class="cm-hero-overlay">
        <h2 class="cm-hero-title">Олика</h2>
        <p class="cm-hero-sub">Наше містечко на Волині</p>
      </div>
      <div class="cm-hero-dots">
        ${HERO_IMAGES.map((_, i) => `<span class="cm-hero-dot${i === 0 ? ' active' : ''}"></span>`).join('')}
      </div>
    </section>

    <section class="cm-block cm-block--board">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Дошка громади</h3>
      </header>
      <div id="cm-board-content" class="cm-board-body cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--weather">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Погода в Олиці</h3>
      </header>
      <div id="cm-weather-content" class="cm-block-body cm-loading">Завантаження…</div>
    </section>

    <!-- Блок Світло — приховано 16.05.2026 (світло наразі не відключають).
         Щоб повернути: розкоментувати секцію + повернути renderPowerBlock() у initCommunity. -->
    <!--
    <section class="cm-block cm-block--power">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Світло зараз</h3>
        <button class="cm-block-link" data-switch-tab="power">Графік →</button>
      </header>
      <div id="cm-power-content" class="cm-block-body cm-loading">Завантаження…</div>
    </section>
    -->

    <section class="cm-block cm-block--bus">
      <div id="cm-bus-content" class="cm-block-body cm-loading">Завантаження…</div>
      <footer class="cm-block-footer">
        <button class="cm-block-title cm-block-title--bus-link" data-switch-tab="buses">РОЗКЛАД АВТОБУСНИХ МАРШРУТІВ →</button>
      </footer>
    </section>

    <section class="cm-block cm-block--event">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Найближча подія громади</h3>
        <button class="cm-block-link" data-switch-tab="events">Афіша →</button>
      </header>
      <div id="cm-event-content" class="cm-block-body cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--contacts">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Корисні контакти</h3>
      </header>
      <div id="cm-contacts-content" class="cm-block-body cm-contacts-body cm-loading">Завантаження…</div>
    </section>
  `;
}

// ── Точка входу ──────────────────────────────────────────────────────────────

export function initCommunity() {
  renderSkeleton();
  attachSwitchTabDelegation();
  startHeroRotator();
  // Запускаємо всі блоки паралельно — кожен оновить свою секцію коли готовий.
  renderWeatherBlock();
  // renderPowerBlock(); — Світло приховано (16.05.2026, не актуально)
  renderBusBlock();
  renderBoardBlock();
  renderEventBlock();
  renderContactsBlock();
}

// B-21 fix: event delegation замість inline onclick="switchTab(...)" (XSS hardening).
// Один listener на #cm-content ловить click на будь-якому [data-switch-tab] всередині блоків.
function attachSwitchTabDelegation() {
  const root = document.getElementById('cm-content');
  if (!root) return;
  root.addEventListener('click', e => {
    const target = e.target.closest('[data-switch-tab]');
    if (!target) return;
    const tab = target.dataset.switchTab;
    if (tab && typeof window.switchTab === 'function') window.switchTab(tab);
  });
}
