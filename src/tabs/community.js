// src/tabs/community.js
// Модуль «Громада» — головна вкладка-дашборд.
// Тонкий entry-point: скелетон + greeting + диспетчер render-блоків.
// Render-блоки винесено у community-blocks.js, модалка — у community-modal.js.
//
// Порядок на вкладці:
//   Hero фото → Greeting (дата + Добрий ранок/вечір) → Дошка → Погода
//   → Світло → Автобус → Подія громади → Контакти.

import { escapeHtml, sunTimes } from '../core/utils.js';
import { isLoggedIn, currentUserName, onAuthChange } from '../core/auth.js';
import {
  renderWeatherBlock,
  renderPowerBlock,
  renderBusBlock,
  renderBoardBlock,
  renderEventBlock,
  renderContactsBlock,
  renderCommunityNews,
} from './community-blocks.js';

// ── Hero: 4 денних + 4 вечірніх фото Олики, fade 0.55s, інтервал 6s ──────────
// Набір обирається за сходом/заходом сонця (sunTimes — авто-розрахунок щодня).
// Ручного гортання НЕМАЄ (рішення Роми 08.07): без свайпу і крапок — лише авто.
// Кожне фото несе ПІДПИС — показується під «Олика» замість статичного слогана
// (рішення Роми 08.07: підпис = що зображено). Зараз усі 8 кадрів — костел
// (Вова лишив лише його); нові фото — просто додати {src, caption}.
const KOSTEL = 'Колегіальний костел Святої Трійці';
const HERO_DAY     = [1, 2, 3, 4].map(i => ({ src: `./photos/olyka.day-${i}.jpg`,     caption: KOSTEL }));
const HERO_EVENING = [1, 2, 3, 4].map(i => ({ src: `./photos/olyka.evening-${i}.jpg`, caption: KOSTEL }));

let _heroInterval = null;
let _heroIndex = 0;
let _heroIsDay = null;   // поточний режим — щоб зловити схід/захід прямо на тіку

// Вечірній набір вмикається за 2 ГОДИНИ ДО заходу сонця (рішення Роми 08.07):
// золота година + сутінки виглядають як «вечір», не як день.
const EVENING_LEAD_MS = 2 * 60 * 60 * 1000;

function isDaytime(now = new Date()) {
  const t = sunTimes(now);
  if (!t) return true;                       // fail-soft: без розрахунку — день
  return now >= t.sunrise && now.getTime() < t.sunset.getTime() - EVENING_LEAD_MS;
}

function heroSet() { return isDaytime() ? HERO_DAY : HERO_EVENING; }

function heroImgsHtml() {
  return heroSet().map((it, i) => `
    <img class="cm-hero-img${i === 0 ? ' active' : ''}" src="${escapeHtml(it.src)}" alt="${escapeHtml(it.caption)}" loading="${i === 0 ? 'eager' : 'lazy'}">
  `).join('');
}

// Підпис під «Олика» = що на АКТИВНОМУ фото (міняється разом зі слайдом)
function syncHeroCaption() {
  const sub = document.querySelector('.cm-hero-sub');
  const it = heroSet()[_heroIndex];
  if (sub && it) sub.textContent = it.caption;
}

function showHeroSlide(idx) {
  const wrap = document.querySelector('.cm-hero');
  if (!wrap) return;
  const n = heroSet().length;
  _heroIndex = (idx + n) % n;
  wrap.querySelectorAll('.cm-hero-img').forEach((img, i) => {
    img.classList.toggle('active', i === _heroIndex);
  });
  syncHeroCaption();
}

// Тік кожні 6с: наступний слайд. Якщо тим часом сонце зійшло/зайшло —
// перезбираємо картинки на інший набір прямо на льоту, без перезавантаження.
function startHeroRotator() {
  if (_heroInterval) clearInterval(_heroInterval);
  _heroIndex = 0;
  _heroIsDay = isDaytime();
  _heroInterval = setInterval(() => {
    const wrap = document.querySelector('.cm-hero');
    if (!wrap) { clearInterval(_heroInterval); _heroInterval = null; return; }
    const day = isDaytime();
    if (day !== _heroIsDay) {
      _heroIsDay = day;
      _heroIndex = 0;
      // <img> — перші діти .cm-hero, overlay/градієнт лишаються на місці
      wrap.querySelectorAll('.cm-hero-img').forEach(img => img.remove());
      wrap.insertAdjacentHTML('afterbegin', heroImgsHtml());
      syncHeroCaption();
      return;
    }
    showHeroSlide(_heroIndex + 1);
  }, 6000);
}

// ── Greeting + Дата (заголовок вкладки) ──────────────────────────────────────

function getGreeting() {
  // Підзаголовок («Ось що головне…») видалено 08.07 (рішення Роми) — лише дата+вітання.
  const h = new Date().getHours();
  let hello;
  if (h >= 5  && h < 11)      hello = 'Добрий ранок';
  else if (h >= 11 && h < 17) hello = 'Добридень';
  else if (h >= 17 && h < 22) hello = 'Добрий вечір';
  else                        hello = 'Доброї ночі';
  // Персоналізація: якщо юзер вписав ім'я в особистому кабінеті — вітаємо по імені.
  let who = 'громадо';
  if (isLoggedIn()) {
    const name = (currentUserName() || '').trim().split(/\s+/)[0];
    if (name && name !== 'Житель') who = name;
  }
  return { text: `${hello}, ${who}!` };
}

// Оновити вітання наживо, коли профіль/ім'я підвантажились (onAuthChange).
function updateGreetingName() {
  const el = document.querySelector('.cm-greeting-text');
  if (el) el.textContent = getGreeting().text;
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
    <!-- Стик-зона вітання: висота = вітання + запас «залипання» (padding-bottom).
         .cm-greeting всередині — position:sticky, тому браузер тримає його
         на КОМПОЗИТОРІ (без JS-скролу) → нуль дьоргання на iOS. Коли зона
         дозникає (проскролили padding-bottom) — вітання відпускається й їде вгору. -->
    <div class="cm-greeting-stick">
      <section class="cm-greeting">
        <div class="cm-greeting-date">${escapeHtml(todayStr)}</div>
        <div class="cm-greeting-text">${escapeHtml(greeting.text)}</div>
      </section>
      <!-- Розпірка запасу «залипання»: РЕАЛЬНИЙ блок (не padding!) — інакше
           sticky у Chromium не тримає (padding контейнера не рахується у діапазон
           залипання). Її висота = скільки px вітання ігнорує скрол. -->
      <div class="cm-greeting-stickpad" aria-hidden="true"></div>
    </div>

    <section class="cm-hero">
      ${heroImgsHtml()}
      <!-- Смуга блюру: прикріплена до НИЗУ героя, росте вгору разом із верхом
           верхньої картки при скролі (community.js). Низ мутніє, верх лишається
           чіткий — блюр «слідкує» за карткою (рішення Роми 08.07). -->
      <div class="cm-hero-blurband" aria-hidden="true"></div>
      <div class="cm-hero-overlay">
        <h2 class="cm-hero-title">Олика</h2>
        <p class="cm-hero-sub">${escapeHtml(heroSet()[0].caption)}</p>
      </div>
    </section>
    <div class="cm-hero-spacer"></div>

    <!-- Порядок блоків (рішення Роми 08.07):
         Табло новин → Дошка → Найближча подія → Автобуси → Погода → Контакти. -->

    <section id="cm-news-board" class="cm-block cm-block--news">
      <div class="cm-news-board-bar">
        <span class="cm-news-board-dot"></span>
        <span class="cm-news-board-label">Табло новин</span>
        <span class="cm-news-board-live">LIVE</span>
      </div>
      <div id="cm-news-content" class="cm-block-body cm-news-body cm-loading">Завантаження…</div>
      <div id="cm-news-controls" class="cm-news-controls"></div>
    </section>

    <section class="cm-block cm-block--board">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Дошка громади</h3>
      </header>
      <div id="cm-board-content" class="cm-board-body cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--event">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Найближча подія громади</h3>
        <button class="cm-block-link" data-switch-tab="shotam">Афіша →</button>
      </header>
      <div id="cm-event-content" class="cm-block-body cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--bus">
      <div id="cm-bus-content" class="cm-block-body cm-loading">Завантаження…</div>
      <footer class="cm-block-footer">
        <button class="cm-block-title cm-block-title--bus-link" data-switch-tab="buses">РОЗКЛАД АВТОБУСНИХ МАРШРУТІВ →</button>
      </footer>
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

    <section id="cm-contacts" class="cm-block cm-block--contacts">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Корисні контакти</h3>
      </header>
      <div id="cm-contacts-content" class="cm-block-body cm-contacts-body cm-loading">Завантаження…</div>
    </section>
  `;
}

// ── Точка входу ──────────────────────────────────────────────────────────────

let _greetingWired = false;
let _heroBlurWired = false;
// Блюр обоїв «СЛІДКУЄ ЗА КАРТКОЮ» (рішення Роми 08.07): смуга розмиття своїм НИЗОМ
// приклеєна до ВЕРХНЬОГО краю верхньої картки (Табло новин) і росте ВГОРУ, поки
// картка піднімається. Тобто фрост-хвиля їде вгору РАЗОМ із карткою й поступово
// закриває картинку від низу до верху; сам верх (вітання) лишається чіткий доки
// картка не підніметься глибоко. Слухач на .app-main (справжній скролер), rAF.
// Вітання більше НЕ рухаємо з JS — «залипання» тримає CSS position:sticky
// (.cm-greeting-stick), тому воно на композиторі й не дьоргається на iOS.
function wireHeroBlur() {
  if (_heroBlurWired) return;
  const main = document.querySelector('.app-main');
  if (!main) return;
  _heroBlurWired = true;
  let ticking = false;
  // Кеш елементів (щоб не шукати щоразу — стабільніше й швидше).
  let hero, band, block;
  const cache = () => {
    hero = document.querySelector('.cm-hero');
    band = hero && hero.querySelector('.cm-hero-blurband');
    block = document.getElementById('cm-news-board');
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (!hero || !band || !block) cache();
      if (!hero || !band || !block) return;
      // Усе в локальних координатах героя (він fixed): C — де зараз верх картки.
      const heroTop = hero.getBoundingClientRect().top;
      const heroH   = hero.offsetHeight;
      const C = block.getBoundingClientRect().top - heroTop;   // верх картки в системі героя
      const C0 = heroH - 80;                                   // стартова позиція верху картки (~низ героя)
      const travel = Math.max(0, C0 - C);                      // на скільки картка вже піднялась
      // Смуга росте вгору від верху картки на 0.6× пройденого шляху; верх лишається
      // чіткий (обмежуємо, щоб не полізло вище героя і не розмило все одразу).
      let h = Math.min(travel * 0.6, Math.max(0, C));
      let top = C - h;
      if (top < 0) { top = 0; h = Math.max(0, C); }
      band.style.top = top + 'px';
      band.style.height = h + 'px';
      band.style.opacity = h > 2 ? '1' : '0';
    });
  };
  cache();
  main.addEventListener('scroll', onScroll, { passive: true });
}

export function initCommunity() {
  renderSkeleton();
  attachSwitchTabDelegation();
  startHeroRotator();
  wireHeroBlur();
  // Вітання персоналізується, коли профіль/ім'я підвантажились (вхід/зміна).
  if (!_greetingWired) { onAuthChange(updateGreetingName); _greetingWired = true; }
  updateGreetingName();
  // Запускаємо всі блоки паралельно — кожен оновить свою секцію коли готовий.
  renderWeatherBlock();
  // renderPowerBlock(); — Світло приховано (16.05.2026, не актуально)
  renderBusBlock();
  renderBoardBlock();
  renderEventBlock();
  renderContactsBlock();
  renderCommunityNews();
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
