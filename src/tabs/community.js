// src/tabs/community.js
// ГОЛОВНА СТОРІНКА — Home Dashboard («Громада»).
//
// 🔴 ПЕРЕБУДОВАНО 04.08.2026 (потік /byyou, замовлення Вови). Було: фото костелу
// 560px = 76.6% видимої зони, привітання 412px, липка панель «ШО В СЕЛІ?» поверх
// карток, довідник телефонів 420px, ЧОТИРИ автоматичні рухи одночасно.
// Перша реальна інформація починалась на 606px — НИЖЧЕ першого екрана.
// Заміряно `tests/tools/home-audit.mjs`, розбір — `_ai-tools/AUDIT_GROMADA_2026-08.md`.
//
// ─────────────────────────────────────────────────────────────────────────────
// ПРИНЦИП: ТРИ ТЕМПИ, а не набір віджетів. Розмір блока = частота потреби.
//
//   ЗАРАЗ     щогодини → шапка (дата · привітання · погода · аватар) + капсули
//   СЬОГОДНІ  щодня    → збір · стрічка громади · новини · оголошення
//   ЗАВЖДИ    довідка  → телефони одним рядком + розкриття
//
// 🗑 СЕКЦІЇ «ПОДІЇ» НА ГОЛОВНІЙ БІЛЬШЕ НЕМАЄ (рішення Вови 04.08: «події
// прибрати»). Причина не в даних, а в тому, що вести з неї не було куди:
// вкладки Подій у застосунку не існує, і кнопка «Афіша →» вела у Стрічку.
// ⚠️ Функція renderEventBlock і картка події (openShotamModal) у
// community-blocks.js ЛИШИЛИСЬ — вони знадобляться, якщо екран Подій зроблять.
// Просто ніхто їх не кличе.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔑 ЧОМУ ШАПКА БОРДОВА (вибір Вови 04.08 з трьох макетів — варіант «Б»)
// Три варіанти верху показувались знімками ДО написання коду
// (`tests/tools/_mockups/home-variants.html`): А — тиха шапка без фото,
// Б — бордова, В — фото-смуга 168px. Вова вибрав Б.
// ⚠️ Це не «прибрали фото щоб було модно»: 03.08 обидві крайності вже
// відхилялись — «фото тлом усієї сторінки» (PR #759) і «фото лише в плитці»
// (PR #762). Бордова площина дає характер БЕЗ витрат висоти, і це та сама мова,
// що у віджеті автобусів, який Вова назвав вдалим.
//
// 🌤 ПОГОДА ПЕРЕЇХАЛА В ШАПКУ. Була ПЕРЕДОСТАННІМ блоком, початок на 1839px —
// щоб побачити температуру, треба було прогорнути 2.5 екрана (а з шапки
// застосунку погоду прибрали ще 08.07, тобто вгорі її не було НІДЕ).
// ⚠️ Нічого не втрачено: `renderWeatherBlock()` як і раніше наповнює кеш
// `_wxData`, ряд 7 днів лишився, тап по дню відкриває ту саму
// `openWeatherDayModal(i)`. Змінилась лише подача.
//
// 🛑 ЩО ПРИБРАНО І ЧОМУ (це прибирає 3 з 4 автоматичних рухів сторінки):
//   • hero-ротатор 4 фото / 6с — фото костелу більше не займає перший екран;
//   • `initCenterFocus()` — масштабував КОЖЕН блок за відстанню до центру
//     (scale 1 → 0.95). На 50+ це ускладнює прицілювання пальцем по картці,
//     що «дихає»; разом із трьома каруселями давало відчуття, що сторінка
//     ніколи не стоїть на місці;
//   • липка панель «ШО В СЕЛІ?» — 75px лежали ПОВЕРХ карток на всіх чотирьох
//     контрольних знімках 03.08.
//
// ✅ ЩО НЕ ЧІПАЛИ (вимога Вови «не ламай бізнес-логіку»): id контейнерів блоків
// (`cm-news-content`, `cm-board-content`, `cm-event-content`, `cm-bus-content`,
// `cm-weather-content`, `cm-contacts-content`) — render-функції в
// `community-blocks.js` шукають саме їх; кнопка кабінету `[data-account-btn]`;
// делегування `[data-switch-tab]`.

import { escapeHtml } from '../core/utils.js';
import { isLoggedIn, currentUserName, onAuthChange } from '../core/auth.js';
import { refreshAccountButtons } from '../core/account-ui.js';
import { renderHomeNow } from './home-now.js';
import { renderHomeFund } from './home-fund.js';
import { renderHomeFeed } from './home-feed.js';
import {
  renderWeatherBlock,
  renderBusBlock,
  renderBoardBlock,
  renderContactsBlock,
  renderCommunityNews,
} from './community-blocks.js';

// ── Привітання ───────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  let hello;
  if (h >= 5  && h < 11)      hello = 'Добрий ранок';
  else if (h >= 11 && h < 17) hello = 'Добридень';
  else if (h >= 17 && h < 22) hello = 'Добрий вечір';
  else                        hello = 'Доброї ночі';
  // Персоналізація: ім'я з кабінету. Гість — «громадо» (не «Житель»: це
  // технічна заглушка профілю, людині вона нічого не каже).
  let who = 'громадо';
  if (isLoggedIn()) {
    const name = (currentUserName() || '').trim().split(/\s+/)[0];
    if (name && name !== 'Житель') who = name;
  }
  return `${hello}, ${who}`;
}

// Ім'я підвантажується асинхронно (профіль) — оновлюємо текст на місці.
function updateGreetingName() {
  const el = document.querySelector('.hm-hi');
  if (el) el.textContent = getGreeting();
}

function formatToday() {
  const d = new Date();
  const wd = ['неділя','понеділок','вівторок','середа','четвер','пʼятниця','субота'][d.getDay()];
  const m  = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'][d.getMonth()];
  return `${wd} · ${d.getDate()} ${m}`;
}

// Ініціал для аватара-заглушки. `refreshAccountButtons()` замінить на фото,
// якщо воно є, — тут лише те, що видно до її відпрацювання.
function avatarInitial() {
  if (!isLoggedIn()) return '';
  const n = (currentUserName() || '').trim();
  return n && n !== 'Житель' ? n[0].toUpperCase() : '';
}

// ── Каркас ───────────────────────────────────────────────────────────────────
// Порядок секцій = порядок спадання частоти потреби:
//   шапка (щогодини) → «Зараз» (щогодини) → збір → новини → події →
//   оголошення (щодня) → телефони (довідка).

function renderSkeleton() {
  const el = document.getElementById('cm-content');
  if (!el) return;
  el.classList.add('hm');

  el.innerHTML = `
    <!-- ══ ФОТО НА ФОНІ (варіант «Д», вибір Вови 04.08) ═══════════════════════
         Зафіксоване позаду всього; контент їде поверх. Вуаль і розмиття — у
         style/home.css, там же пояснено, чому текст ніколи не лежить на
         голому фото. aria-hidden — це декорація, читачу екрана вона не потрібна. -->
    <div class="hm-bg" aria-hidden="true">
      <img src="./photos/olyka.day-1.jpg" alt="">
    </div>

    <!-- ══ ШАПКА: ЗАРАЗ ══════════════════════════════════════════════════════
         Одна бордова площина: дата · привітання · аватар · погода · 7 днів.
         Аватар усередині потоку шапки, а не прибитий поверх контенту, як було
         (.cm-acc-pin): прибита кнопка накривала картки на всьому скролі. -->
    <header class="hm-top">
      <div class="hm-top-row">
        <div class="hm-top-col">
          <div class="hm-date">${escapeHtml(formatToday())}</div>
          <h1 class="hm-hi">${escapeHtml(getGreeting())}</h1>
        </div>
        <button class="hm-ava" type="button" data-account-btn aria-label="Кабінет">
          <span class="hm-ava-txt">${escapeHtml(avatarInitial())}</span>
          <svg class="hm-ava-ic" viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="12" cy="7.6" r="4.2"/><path d="M12 13.6c-4.5 0-8.2 2.9-8.2 6.6 0 .9.7 1.6 1.6 1.6h13.2c.9 0 1.6-.7 1.6-1.6 0-3.7-3.7-6.6-8.2-6.6z"/></svg>
        </button>
      </div>
      <!-- Погоду малює renderWeatherBlock() — id збережено навмисно, щоб кеш
           _wxData і модалка по годинах лишились тими самими. -->
      <div id="cm-weather-content" class="hm-wx hm-wx--loading">
        <div class="hm-wx-sk"></div>
      </div>
    </header>

    <!-- ══ СМУГА «ЗАРАЗ» ═══════════════════════════════════════════════════════
         Капсули: найближчий автобус · непрочитані · мої оголошення.
         🔴 Малюється, ЛИШЕ якщо є що сказати — «0 непрочитаних» не інформація.
         Порожньо → секції немає зовсім (не порожня смуга висотою 50px). -->
    <div id="hm-now" class="hm-now" hidden></div>

    <!-- ══ ЗБІР ════════════════════════════════════════════════════════════════
         Немає активних зборів → секції немає ЗОВСІМ (вимога Вови). -->
    <section id="hm-fund" class="hm-sec" hidden>
      <div class="hm-sec-head">
        <h2 class="hm-kicker">Актуальний збір</h2>
      </div>
      <div id="hm-fund-body"></div>
    </section>

    <!-- ══ У СТРІЧЦІ ГРОМАДИ ═══════════════════════════════════════════════════
         🆕 04.08. Дайджест Стрічки — головного соціального майданчика
         застосунку. До цього з головної НЕ БУЛО ВИДНО, що там узагалі щось
         відбувається. Порожньо або немає бази → секції немає зовсім. -->
    <section id="hm-feed" class="hm-sec" hidden>
      <div class="hm-sec-head">
        <h2 class="hm-kicker">У стрічці громади</h2>
        <button class="hm-more" type="button" data-switch-tab="shotam">Стрічка →</button>
      </div>
      <div id="hm-feed-body" class="hm-list"></div>
    </section>

    <!-- ══ НОВИНИ ══════════════════════════════════════════════════════════════
         Головна точка входу до новин: окремої вкладки «Новини» немає.
         «Усі новини» → наявний openNewsHub БЕЗ зміни його логіки. -->
    <section id="cm-news-board" class="hm-sec">
      <div class="hm-sec-head">
        <h2 class="hm-kicker">Новини</h2>
        <button class="hm-more" type="button" data-cm-news-all>Усі новини →</button>
      </div>
      <div id="cm-news-content" class="hm-list">
        ${skeletonRows(3)}
      </div>
      <div id="cm-news-controls" hidden></div>
    </section>

    <!-- ══ ОГОЛОШЕННЯ ══════════════════════════════════════════════════════════ -->
    <section class="hm-sec" id="hm-board">
      <div class="hm-sec-head">
        <h2 class="hm-kicker">Оголошення</h2>
        <button class="hm-more" type="button" data-switch-tab="board">Дошка →</button>
      </div>
      <div id="cm-board-content" class="hm-list">${skeletonRows(3)}</div>
    </section>

    <!-- ══ АВТОБУСИ ════════════════════════════════════════════════════════════ -->
    <section class="hm-sec" id="hm-bus">
      <div class="hm-sec-head">
        <h2 class="hm-kicker">Автобуси</h2>
        <button class="hm-more" type="button" data-switch-tab="buses">Розклад →</button>
      </div>
      <div id="cm-bus-content" class="hm-list">${skeletonRows(1)}</div>
    </section>

    <!-- ══ ТЕЛЕФОНИ (довідка) ══════════════════════════════════════════════════
         Було 420px = 57.5% видимої зони на статичний довідник, потрібний
         кілька разів на рік. Стало: екстрені на видноті + решта під розкриттям. -->
    <section class="hm-sec" id="cm-contacts">
      <div class="hm-sec-head">
        <h2 class="hm-kicker">Телефони громади</h2>
      </div>
      <div id="cm-contacts-content" class="hm-list">${skeletonRows(1)}</div>
    </section>
  `;
}

// Скелет рядка = форма того, що прийде (фото 64px + три смужки тексту).
// ⚠️ Розміри мусять збігатися з реальною карткою, інакше при появі даних
// сторінка сіпнеться — а це рівно те, від чого ми йдемо.
function skeletonRows(n) {
  const row = `
    <div class="hm-card hm-sk-row" aria-hidden="true">
      <div class="hm-sk hm-sk-ph"></div>
      <div class="hm-sk-lines">
        <div class="hm-sk hm-sk-l1"></div>
        <div class="hm-sk hm-sk-l2"></div>
        <div class="hm-sk hm-sk-l3"></div>
      </div>
    </div>`;
  return row.repeat(n);
}

// ── Точка входу ──────────────────────────────────────────────────────────────

let _greetingWired = false;

export function initCommunity() {
  renderSkeleton();
  attachSwitchTabDelegation();
  refreshAccountButtons();
  if (!_greetingWired) { onAuthChange(updateGreetingName); _greetingWired = true; }
  updateGreetingName();

  // Блоки вантажаться паралельно — кожен оновлює свою секцію, коли готовий.
  // Помилка одного не ламає інші (кожен має власний catch).
  renderWeatherBlock();     // → шапка (і наповнює кеш _wxData для модалки)
  renderHomeNow();          // → смуга «Зараз»
  renderHomeFund();         // → збір (порожньо = секція лишається hidden)
  renderHomeFeed();         // → дайджест Стрічки (порожньо = секція hidden)
  renderCommunityNews();
  renderBoardBlock();
  renderBusBlock();
  renderContactsBlock();
}

// B-21 fix: делегування замість inline onclick (XSS hardening). Один слухач на
// #cm-content ловить click на будь-якому [data-switch-tab] всередині блоків.
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
