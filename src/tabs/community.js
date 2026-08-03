// src/tabs/community.js
// ГОЛОВНИЙ ЕКРАН «Громада» — каркас + привітання + диспетчер блоків.
//
// 🔴 ПЕРЕБУДОВАНО 03.08.2026 (потік /byyou «Громада як Home-екран»).
// Розбір із числами — `_ai-tools/AUDIT_GROMADA_2026-08.md`.
// Бекап попереднього вигляду — гілка `backup/community-pre-redesign-20260803`.
//
// ЩО БУЛО НЕ ТАК (заміряно 390×844, видима зона 731px):
//   • hero-фото 560px = 76.6% видимої зони + зона привітання 412px;
//   • перша реальна інформація (новини) починалась на 662px — НИЖЧЕ першого екрана;
//   • уся сторінка 2446px = 3.3 екрана прокрутки;
//   • липка панель «ШО В СЕЛІ?» (75px) лежала ПОВЕРХ карток;
//   • `initCenterFocus()` перераховував масштаб КОЖНОГО блока на кожному кадрі скролу.
// Тобто мета Вови «зрозуміти, що коїться, за 3-5 секунд» ламалась структурою,
// а не якістю карток — і поліпшенням карток не лікувалась.
//
// ЯК ЗАРАЗ: шапка ~200px (фото лишається, але фоном) → смуга «ЗАРАЗ» → збір →
// новини → події → оголошення → контакти. Згори те, що змінюється щодня і
// стосується мене; знизу те, що читають; у самому низу — довідкове.
//
// ⚠️ «ШО В СЕЛІ?» ЛИШИЛОСЬ. Це голос Вови, а не службовий заголовок. Знято лише
// ЛИПКІСТЬ (панель більше нічого не накриває) — на Дошці 28.07 я вже прибирав
// назву цілком «за Apple HIG», і 01.08 Вова це відкотив. Двічі той самий урок
// не проходимо.

import { escapeHtml, sunTimes } from '../core/utils.js';
import { isLoggedIn, currentUserName, onAuthChange } from '../core/auth.js';
import { refreshAccountButtons } from '../core/account-ui.js';
import { ICONS } from '../core/icons.js';   // спільні векторні іконки (шеврон у посиланнях секцій)
import {
  renderWeatherBlock,
  renderEventBlock,
  renderContactsBlock,
  renderCommunityNews,
} from './community-blocks.js';
import { renderHero } from './home-hero.js';
import { renderBentoTiles, initHomeBento } from './home-bento.js';

// ── Фото Олики ───────────────────────────────────────────────────────────────
// 🔴 03.08 (другий захід): фото БІЛЬШЕ НЕ БАНЕР І НЕ РОТАТОР.
//
// Слова Вови: «Не використовуй великі декоративні банери, які займають половину
// екрана». У варіанті 2 фото було тлом шапки на 200px і крутилось кожні 6с —
// тобто лишалось декорацією, просто меншою, ще й з таймером.
//
// Тепер фото працює ЛИШЕ як фолбек-тло головної плитки: коли в неї приїхала
// новина з власним фото — показуємо фото новини; коли ні — Олику. Тобто
// зображення завжди ПІД змістом і ніколи саме по собі.
// ⚠️ Вибір день/вечір за сходом-заходом сонця збережено (рішення Роми 08.07):
// вечірній набір вмикається за 2 години ДО заходу — золота година й сутінки
// виглядають як «вечір», а не як день.
const KOSTEL = 'Колегіальний костел Святої Трійці';
const EVENING_LEAD_MS = 2 * 60 * 60 * 1000;

function isDaytime(now = new Date()) {
  const t = sunTimes(now);
  if (!t) return true;                       // fail-soft: без розрахунку — день
  return now >= t.sunrise && now.getTime() < t.sunset.getTime() - EVENING_LEAD_MS;
}

// Одне фото на відкриття екрана (без таймера): який набір — вирішує сонце,
// який кадр — просте чергування за днем місяця, щоб не показувати завжди перший.
export function olykaPhoto() {
  const set = isDaytime() ? 'day' : 'evening';
  const n = (new Date().getDate() % 4) + 1;
  return { src: `./photos/olyka.${set}-${n}.jpg`, caption: KOSTEL };
}

// ── Привітання + дата ────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  let hello;
  if (h >= 5  && h < 11)      hello = 'Добрий ранок';
  else if (h >= 11 && h < 17) hello = 'Добридень';
  else if (h >= 17 && h < 22) hello = 'Добрий вечір';
  else                        hello = 'Доброї ночі';
  // Персоналізація: якщо людина вписала ім'я в кабінеті — вітаємо по імені.
  let who = 'громадо';
  if (isLoggedIn()) {
    const name = (currentUserName() || '').trim().split(/\s+/)[0];
    if (name && name !== 'Житель') who = name;
  }
  return { text: `${hello}, ${who}!` };
}

// Оновити вітання наживо, коли профіль/ім'я підвантажились (onAuthChange).
function updateGreetingName() {
  const el = document.querySelector('.hm-greet');
  if (el) el.textContent = getGreeting().text;
  fitGreeting();
}

// Привітання — ОДИН рядок (рішення Вови 15.07): міряємо реальну ширину тексту
// і зменшуємо шрифт від базового до мінімуму, поки не влізе (nowrap у CSS).
// Мінімум 19px — «щоб не здавалось маленьким»; довші імена все одно влазять.
// Стеля 17px (а не 27): привітання більше не герой екрана, а елемент рядка стану.
const GREET_FONT_MAX = 19, GREET_FONT_MIN = 14;
function fitGreeting() {
  const el = document.querySelector('.hm-greet');
  if (!el) return;
  let size = GREET_FONT_MAX;
  el.style.fontSize = size + 'px';
  // scrollWidth > clientWidth = текст обрізається → крок униз на 1px.
  while (size > GREET_FONT_MIN && el.scrollWidth > el.clientWidth) {
    size -= 1;
    el.style.fontSize = size + 'px';
  }
}

// Дата в рядку стану — КОРОТКА. Повний формат («понеділок · 3 серпня») у
// 84px не влазив і обрізався трьома крапками (знайдено скріншотом); а рядок
// стану має вміщати ще привітання й погоду.
function formatTodayHeader() {
  const d = new Date();
  // Повні назви повернулись: після розведення рядка на два рівні (04.08) дата
  // стоїть під привітанням і має всю ширину — скорочення більше не потрібні.
  const wd = ['неділя','понеділок','вівторок','середа','четвер','пʼятниця','субота'][d.getDay()];
  const m  = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'][d.getMonth()];
  return `${wd} · ${d.getDate()} ${m}`;
}

// ── Кістяк завантаження (skeleton) для горизонтальних стрічок ────────────────
// Сірий силует майбутнього вмісту замість слова «Завантаження…».
//
// НАВІЩО. До 03.08 усі шість блоків головної показували однаковий текст
// «Завантаження…» — тобто перший кадр після відкриття був стіною однакових слів,
// і людина не бачила, ЩО саме приїде. Кістяк каже те саме, але формою: видно,
// що буде рядок із фото ліворуч і двома рядками тексту.
//
// ⚠️ Розміри кістяка збігаються з розмірами справжніх карток (фото 64, рядки
// 13 і 11px) — інакше при появі даних сторінка смикнеться, і кістяк зробить
// гірше, ніж просто порожнє місце.
function skelRail(n) {
  return Array.from({ length: n }, () => `
    <div class="hm-skel hm-skel-tile" aria-hidden="true"></div>`).join('');
}

// ── Каркас екрана ────────────────────────────────────────────────────────────
//
// Порядок секцій — це і є вся інформаційна архітектура нового екрана:
//   ЗАРАЗ (моє, змінне) → ЗБІР (терміново, коли є) → НОВИНИ (головне) →
//   ПОДІЇ → ОГОЛОШЕННЯ → КОНТАКТИ (довідка).
// Кожна секція має ОДНУ причину існування; якщо блок нічого не каже — він себе
// не малює (порожні капсули, збір без кампанії, порожні секції).

function renderSkeleton() {
  const el = document.getElementById('cm-content');
  if (!el) return;
  // Один клас вмикає весь режим «зміст на фото». Знімеш його — екран повернеться
  // до світлого варіанта без жодних інших правок.
  // ⚠️ 04.08 — ВАРІАНТ D. Фото більше не тло екрана: воно живе ТІЛЬКИ в
  // головній плитці. Клас `hm-onphoto` (варіант B, PR #759) знято — CSS під
  // нього лишився цілим, повернути = дописати клас назад одним рядком.

  const greeting = getGreeting();
  const todayStr = formatTodayHeader();

  el.innerHTML = `
    <!-- РЯДОК СТАНУ. 56px замість шапки-банера на 200px.
         Слова Вови: «Не використовуй великі декоративні банери, які займають
         половину екрана». Тут немає жодного декоративного пікселя: аватар веде
         в кабінет, привітання персональне, погода — жива, дата — жива. -->
    <div class="hm-status">
      <button class="hm-status-acc" type="button" data-account-btn aria-label="Кабінет">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="12" cy="7.6" r="4.2"/><path d="M12 13.6c-4.5 0-8.2 2.9-8.2 6.6 0 .9.7 1.6 1.6 1.6h13.2c.9 0 1.6-.7 1.6-1.6 0-3.7-3.7-6.6-8.2-6.6z"/></svg>
      </button>
      <div class="hm-status-col">
        <h1 class="hm-greet">${escapeHtml(greeting.text)}</h1>
        <span class="hm-status-date">${escapeHtml(todayStr)}</span>
      </div>
      <button class="hm-wx" type="button" data-hm-weather hidden></button>
    </div>

    <div class="hm-body">
      <!-- 🔴 ВАРІАНТ G — «НОВИНИ НА ВЕСЬ ЕКРАН + ШУХЛЯДА» (04.08).
           Висновок із чотирьох заходів поспіль: Вова щоразу казав, що з усього
           екрана подобаються САМЕ новини («єдине, що з цього подобається — це
           як "Що нового", усі новини, як новини відображаються»), а решта
           щоразу заважала. G робить із цього висновок замість того, щоб додати
           ще один ряд плиток: головна = новини, все інше — у шухляді знизу,
           яку відкривають, коли треба. -->
      <section class="hm-sec hm-in" id="hm-news">
        <div class="hm-sec-head">
          <h3 class="hm-sec-title">Що нового</h3>
          <button class="hm-sec-link" type="button" data-cm-news-all>Усі новини${ICONS.chevronRight}</button>
        </div>
        <div class="hm-rail" id="cm-news-content">${skelRail(3)}</div>
      </section>

      <!-- Афіша лишається в потоці: подія — це теж «що відбувається», і вона
           поруч із новинами читається як продовження, а не як окремий прилад.
           Секція ховається цілком, якщо подій громади немає. -->
      <section class="hm-sec hm-in" id="hm-events">
        <div class="hm-sec-head">
          <h3 class="hm-sec-title">Афіша громади</h3>
          <button class="hm-sec-link" type="button" data-switch-tab="shotam">Афіша${ICONS.chevronRight}</button>
        </div>
        <div class="hm-rail" id="cm-event-content">${skelRail(3)}</div>
      </section>

      <!-- Головна плитка-слот переїхала В КІНЕЦЬ потоку і лишається ЛИШЕ для
           термінового: активний збір або подія сьогодні. Новини вона більше не
           показує — саме на це Вова скаржився («воно дублює новини»). -->
      <section id="hm-hero"></section>

      <div id="cm-contacts-content" hidden></div>
    </div>

    <!-- ШУХЛЯДА. Прибита над таб-баром. Згорнута — смужка з трьома фактами;
         розгорнута — плитки. Відкривається ТАПОМ, без жесту: власний свайп на
         цьому екрані конфліктував би з горизонтальними стрічками новин, а цей
         клас багів у проєкті вже коштував окремого блока роботи 02.08. -->
    <details class="hm-drawer" id="hm-drawer">
      <summary>
        <span class="hm-drawer-grip" aria-hidden="true"></span>
        <span class="hm-drawer-peek" id="hm-drawer-peek">Автобус · Дошка · Екстрені</span>
      </summary>
      <div class="hm-bento" id="hm-bento">
        <button class="hm-tile" id="hm-t-bus" type="button" hidden></button>
        <button class="hm-tile" id="hm-t-msg" type="button" hidden></button>
        <button class="hm-tile hm-tile--wide" id="hm-t-board" type="button" hidden></button>
        <button class="hm-tile hm-tile--wide" id="hm-t-tel" type="button" hidden></button>
      </div>
    </details>
  `;
}

// ── Точка входу ──────────────────────────────────────────────────────────────

let _greetingWired = false;
let _nowWired = false;

export function initCommunity() {
  renderSkeleton();
  attachSwitchTabDelegation();
  refreshAccountButtons();    // кнопка кабінету: фото профілю або іконка
  // Вітання персоналізується, коли профіль/ім'я підвантажились (вхід/зміна).
  if (!_greetingWired) { onAuthChange(updateGreetingName); _greetingWired = true; }
  updateGreetingName();
  // Кожен блок вантажить свої дані сам і оновлює свою секцію, коли готовий.
  // Помилка одного блоку не ламає інші (кожен має власний try/catch).
  // Смуга «ЗАРАЗ». Підписки на події заводимо один раз на життя застосунку
  // (`initHomeNow`), сам рендер — на кожне відкриття вкладки.
  if (!_nowWired) { initHomeBento(); _nowWired = true; }
  renderWeatherBlock();     // → кнопка погоди в рядку стану
  renderHero();             // → головна плитка-слот
  renderBentoTiles();       // → автобус · повідомлення · дошка
  renderEventBlock();       // → стрічка «Поруч»
  renderContactsBlock();    // → рядок телефонів
  renderCommunityNews();    // → стрічка «Що нового»
}

// B-21 fix: event delegation замість inline onclick="switchTab(...)" (XSS hardening).
// Один listener на #cm-content ловить click на будь-якому [data-switch-tab] всередині.
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
