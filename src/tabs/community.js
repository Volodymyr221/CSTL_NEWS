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
import { refreshAccountButtons } from '../core/account-ui.js';
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
  fitGreeting();
}

// Привітання — ОДИН рядок (рішення Вови 15.07): міряємо реальну ширину тексту
// і зменшуємо шрифт від базового до мінімуму, поки не влізе (nowrap у CSS).
// Мінімум 19px — «щоб не здавалось маленьким»; довші імена все одно влазять.
const GREET_FONT_MAX = 27, GREET_FONT_MIN = 19;
function fitGreeting() {
  const el = document.querySelector('.cm-greeting-text');
  if (!el) return;
  let size = GREET_FONT_MAX;
  el.style.fontSize = size + 'px';
  // scrollWidth > clientWidth = текст обрізається → крок униз на 1px.
  while (size > GREET_FONT_MIN && el.scrollWidth > el.clientWidth) {
    size -= 1;
    el.style.fontSize = size + 'px';
  }
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
    <!-- Кнопка кабінету — ПРИБИТА (хореографія Вови 16.07: «іконка нікуди не
         дівається»). Окремий sticky-елемент нульової висоти: кнопка стоїть у
         правому верхньому куті контенту від старту до кінця скролу — привітання
         їде геть, «ШО В СЕЛІ?» приїжджає, а вона на місці. -->
    <div class="cm-acc-pin">
      <button class="cm-greet-account" type="button" data-account-btn aria-label="Кабінет">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor" aria-hidden="true"><circle cx="12" cy="7.6" r="4.2"/><path d="M12 13.6c-4.5 0-8.2 2.9-8.2 6.6 0 .9.7 1.6 1.6 1.6h13.2c.9 0 1.6-.7 1.6-1.6 0-3.7-3.7-6.6-8.2-6.6z"/></svg>
      </button>
    </div>

    <!-- Стик-зона вітання: висота = вітання + запас «залипання» (padding-bottom).
         .cm-greeting всередині — position:sticky, тому браузер тримає його
         на КОМПОЗИТОРІ (без JS-скролу) → нуль дьоргання на iOS. Коли зона
         дозникає (проскролили padding-bottom) — вітання відпускається й їде вгору. -->
    <div class="cm-greeting-stick">
      <section class="cm-greeting">
        <div class="cm-greeting-col">
          <div class="cm-greeting-date">${escapeHtml(todayStr)}</div>
          <div class="cm-greeting-text">${escapeHtml(greeting.text)}</div>
        </div>
      </section>
      <!-- Розпірка запасу «залипання»: РЕАЛЬНИЙ блок (не padding!) — інакше
           sticky у Chromium не тримає (padding контейнера не рахується у діапазон
           залипання). Її висота = скільки px вітання ігнорує скрол. -->
      <div class="cm-greeting-stickpad" aria-hidden="true"></div>
    </div>

    <section class="cm-hero">
      ${heroImgsHtml()}
      <!-- Фрост-смугу (.cm-hero-blurband) прибрано 16.07 (Вова, редизайн «лист»):
           непрозорий тілесний лист налягає на фото і повністю її закриває. -->
      <div class="cm-hero-overlay">
        <h2 class="cm-hero-title">Олика</h2>
        <!-- Підпис фото повернено 16.07 (Вова) — оформлений як підпис фотографії
             (курсив, дрібний). «ШО В СЕЛІ?» живе окремо нижче (cm-sec-head). -->
        <p class="cm-hero-sub">${escapeHtml(heroSet()[0].caption)}</p>
      </div>
    </section>
    <div class="cm-hero-spacer"></div>

    <!-- ЛИСТ (Вова 16.07, редизайн «як сучасний iOS-додаток»): тілесна картка
         на всю ширину, що НАЛЯГАЄ на фото (заокруглені верхні кути + глибока тінь
         угору). Усередині — язичок «ШО В СЕЛІ?» (випуклий виступ листа на фото)
         і всі блоки. Хореографія збережена: sec-head sticky → доїжджає до шапки,
         залипає і стає блюр-панеллю (--stuck), блоки пірнають під неї.
         Кнопки кабінету тут НЕМА — вона окремо прибита (.cm-acc-pin). -->
    <div class="cm-sheet">
    <div id="cm-sec-sentinel" aria-hidden="true"></div>
    <header class="cm-sec-head" id="cm-sec-head">
      <div class="cm-sec-head-in">
        <h2>ШО В СЕЛІ?</h2>
      </div>
    </header>

    <!-- Підзаголовок тепер У БЛОЦІ (Вова 16.07), не в язичку: перший рядок листа
         над ТАБЛО; скролиться разом з блоками. -->
    <p class="cm-sheet-sub">Ось що головне у нас сьогодні</p>

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

    <!-- Віджет Дошки (повна переробка 13.07, рішення Вови): шапка тепер
         усередині віджета (рендерить renderBoardBlock), стара «Дошка громади» прибрана. -->
    <section class="cm-block cm-block--board">
      <div id="cm-board-content" class="cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--event">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Найближчі події громади</h3>
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
    </div><!-- /.cm-sheet -->
  `;
}

// ── Точка входу ──────────────────────────────────────────────────────────────

let _greetingWired = false;
// Фрост-підкладку (wireHeroBlur, рішення Роми 08.07) видалено 16.07 (Вова,
// редизайн «лист»): непрозорий тілесний лист налягає на фото і повністю закривав
// би площину блюру — backdrop-filter працював би даремно (батарея/GPU).

// ── Фокус-скрол «ШО В СЕЛІ?» (Вова 15.07) ────────────────────────────────────
// Блок, чий центр ближче до центру екрана, — повний розмір + глибша тінь;
// сусіди делікатно менші (−5%) і трохи прозоріші. Безперервне відображення від
// відстані до центру (не перемикач) → блоки плавно «дихають» при скролі.
// Лише transform+opacity (композитор, нуль reflow); рахунок — один кадр на скрол
// (rAF-guard, passive). Вимикається при prefers-reduced-motion (доступність).
let _focusWired = false;
function initCenterFocus() {
  if (_focusWired) return;
  const main = document.querySelector('.app-main');
  if (!main) return;
  // Фокус-масштаб — це РУХ (вимикаємо при reduced-motion); прилипання заголовка
  // «ШО В СЕЛІ?» — стан розмітки (скляний фон = читабельність) — працює завжди.
  const allowMotion = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  _focusWired = true;

  let raf = null;
  const apply = () => {
    raf = null;
    if (main.dataset.tab !== 'community') return;   // ефект лише на Громаді
    const vh = main.clientHeight;
    const viewCenter = vh / 2;

    // «ШО В СЕЛІ?» прилипає? Блюр вмикаємо трохи РАНІШЕ за повне пришпилювання
    // (Вова 16.07): коли верх секції підходить до низу шапки (у межах ~50px) — тоді
    // язичок якраз починає заїжджати під шапку. Плавність дає CSS-transition блюру.
    const sec = document.getElementById('cm-sec-head');
    const hdr = document.querySelector('.app-header');
    if (sec) {
      // Фраза пришпилюється під шапкою; блюр вмикаємо за ~50px ДО того (раніше).
      const pinY = hdr ? hdr.getBoundingClientRect().bottom : 56;
      const secTop = sec.getBoundingClientRect().top;
      sec.classList.toggle('cm-sec-head--stuck', secTop <= pinY + 50);
    }
    if (!allowMotion) return;
    let best = null, bestDist = Infinity;
    document.querySelectorAll('#cm-content .cm-block').forEach(b => {
      const r = b.getBoundingClientRect();
      // Блок повністю поза екраном — скидаємо стилі й не рахуємо далі.
      if (r.bottom < -80 || r.top > vh + 80) {
        if (b.dataset.cf) { b.style.transform = ''; b.classList.remove('cm-block--focus'); delete b.dataset.cf; }
        return;
      }
      const blockCenter = (r.top + r.bottom) / 2;
      const dist = Math.abs(blockCenter - viewCenter);
      // Табло новин (перший блок): піднімаючись ЗНИЗУ до центру — не звужується
      // (одразу звичайний розмір, Вова 16.07); звужується лише коли пройшло центр
      // угору (ховається під шапку). Решта блоків — симетрично, як було.
      // scaleDist керує ЛИШЕ масштабом; справжня dist лишається для детекту фокуса,
      // щоб табло не «хапало» підсвітку сидячи внизу.
      const scaleDist = (b.id === 'cm-news-board' && blockCenter > viewCenter) ? 0 : dist;
      const t = Math.min(1, scaleDist / (vh * 0.55));    // 0 у центрі → 1 далеко
      // Лише масштаб + тінь фокуса. БЕЗ прозорості (виправлення Вови 16.07 —
      // блоки лишаються такими як є, не «вицвітають»).
      b.style.transform = `scale(${(1 - 0.05 * t).toFixed(4)})`;
      b.dataset.cf = '1';
      if (dist < bestDist) { bestDist = dist; best = b; }
    });
    document.querySelectorAll('#cm-content .cm-block--focus').forEach(b => { if (b !== best) b.classList.remove('cm-block--focus'); });
    if (best) best.classList.add('cm-block--focus');
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
  main.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  window.addEventListener('cstl-tab-changed', onScroll);   // повернулись на Громаду → перерахунок
  onScroll();   // початковий стан одразу після рендеру
}

export function initCommunity() {
  renderSkeleton();
  attachSwitchTabDelegation();
  startHeroRotator();
  initCenterFocus();          // фокус-скрол блоків «ШО В СЕЛІ?» (Вова 15.07)
  refreshAccountButtons();    // кнопка кабінету біля привітання: фото/іконка
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
