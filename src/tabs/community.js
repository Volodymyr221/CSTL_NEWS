// src/tabs/community.js
// Модуль «Громада» — головна вкладка-дашборд.
// Тонкий entry-point: скелетон + greeting + диспетчер render-блоків.
// Render-блоки винесено у community-blocks.js, модалка — у community-modal.js.
//
// Порядок на вкладці:
//   Hero фото → Greeting (дата + Добрий ранок/вечір) → Дошка → Погода
//   → Світло → Автобус → Подія громади → Контакти.

import { escapeHtml } from '../core/utils.js';
import {
  renderWeatherBlock,
  renderPowerBlock,
  renderBusBlock,
  renderBoardBlock,
  renderEventBlock,
  renderContactsBlock,
} from './community-blocks.js';

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
      <img class="cm-hero-img" src="https://vidviday.ua/storage/media/place/5304/260244-6a454c65-caf-11264762-1467163756920578-759794530-n.jpg" alt="Олика" loading="eager">
      <div class="cm-hero-overlay">
        <h2 class="cm-hero-title">Олика</h2>
        <p class="cm-hero-sub">Наше містечко на Волині</p>
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

    <section class="cm-block cm-block--power">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Світло зараз</h3>
        <button class="cm-block-link" onclick="switchTab('power')">Графік →</button>
      </header>
      <div id="cm-power-content" class="cm-block-body cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--bus">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Наступний автобус</h3>
        <button class="cm-block-link" onclick="switchTab('buses')">Розклад →</button>
      </header>
      <div id="cm-bus-content" class="cm-block-body cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--event">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Найближча подія громади</h3>
        <button class="cm-block-link" onclick="switchTab('events')">Афіша →</button>
      </header>
      <div id="cm-event-content" class="cm-block-body cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--contacts">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Корисні контакти</h3>
      </header>
      <div id="cm-contacts-content" class="cm-block-body cm-contacts-grid cm-loading">Завантаження…</div>
    </section>
  `;
}

// ── Точка входу ──────────────────────────────────────────────────────────────

export function initCommunity() {
  renderSkeleton();
  // Запускаємо всі блоки паралельно — кожен оновить свою секцію коли готовий.
  renderWeatherBlock();
  renderPowerBlock();
  renderBusBlock();
  renderBoardBlock();
  renderEventBlock();
  renderContactsBlock();
}
