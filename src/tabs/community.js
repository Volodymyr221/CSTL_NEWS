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
import {
  renderWeatherBlock,
  renderBusBlock,
  renderBoardBlock,
  renderEventBlock,
  renderContactsBlock,
  renderCommunityNews,
} from './community-blocks.js';
import { renderNowStrip, initHomeNow } from './home-now.js';

// ── Hero: 4 денних + 4 вечірніх фото Олики ───────────────────────────────────
// Набір обирається за сходом/заходом сонця (sunTimes — авто-розрахунок щодня).
// Ручного гортання НЕМАЄ (рішення Роми 08.07): без свайпу і крапок — лише авто.
//
// ⚠️ РОТАТОР СВІДОМО ЗБЕРЕЖЕНО, хоча аудит рахує автоматичні рухи шкодою.
// Аргумент був про ЧОТИРИ рухи наввипередки (фото + карусель Дошки + карусель
// Подій + фокус-скрол). Три з них цей потік знімає; фото лишається одне-єдине
// і працює як тло, а не як зміст. Прибирати його ніхто не просив (HOT_RULES №9).
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
    <img class="hm-top-img${i === 0 ? ' active' : ''}" src="${escapeHtml(it.src)}" alt="${escapeHtml(it.caption)}" loading="${i === 0 ? 'eager' : 'lazy'}">
  `).join('');
}

// Підпис фото (рішення Вови 20.07 — «підпис = що зображено») переїхав у нижній
// правий кут шапки дрібним кеглем. Рішення лишається чинним, змінилось лише місце.
function syncHeroCaption() {
  const sub = document.querySelector('.hm-top-cap');
  const it = heroSet()[_heroIndex];
  if (sub && it) sub.textContent = it.caption;
}

function showHeroSlide(idx) {
  const wrap = document.querySelector('.hm-top-photo');
  if (!wrap) return;
  const n = heroSet().length;
  _heroIndex = (idx + n) % n;
  wrap.querySelectorAll('.hm-top-img').forEach((img, i) => {
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
    const wrap = document.querySelector('.hm-top-photo');
    if (!wrap) { clearInterval(_heroInterval); _heroInterval = null; return; }
    // Згорнутий застосунок — не крутимо (той самий запобіжник, що в каруселі Дошки):
    // фонова вкладка все одно отримує таймери, і це просто витрата батареї.
    if (document.hidden) return;
    const day = isDaytime();
    if (day !== _heroIsDay) {
      _heroIsDay = day;
      _heroIndex = 0;
      wrap.innerHTML = heroImgsHtml();
      syncHeroCaption();
      return;
    }
    showHeroSlide(_heroIndex + 1);
  }, 6000);
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
const GREET_FONT_MAX = 27, GREET_FONT_MIN = 19;
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

function formatTodayHeader() {
  const d = new Date();
  const wd = ['неділя','понеділок','вівторок','середа','четвер','пʼятниця','субота'][d.getDay()];
  const m  = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'][d.getMonth()];
  return `${wd} · ${d.getDate()} ${m}`;
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

  const greeting = getGreeting();
  const todayStr = formatTodayHeader();

  el.innerHTML = `
    <!-- ШАПКА. Фото лишилось, але стало ТЛОМ висотою ~200px замість 560px
         самостійного блока. Уся текстова інформація — поверх нього. -->
    <header class="hm-top">
      <div class="hm-top-photo">${heroImgsHtml()}</div>
      <div class="hm-top-shade" aria-hidden="true"></div>

      <div class="hm-top-in">
        <div class="hm-top-row">
          <span class="hm-top-date">${escapeHtml(todayStr)}</span>
          <!-- Кнопка кабінету лишається в правому верхньому куті (хореографія
               Вови 16.07). Прибитим sticky-елементом вона більше НЕ є — на новій
               шапці нема чого «не дівати», екран під нею просто прокручується. -->
          <button class="hm-top-acc" type="button" data-account-btn aria-label="Кабінет">
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="7.6" r="4.2"/><path d="M12 13.6c-4.5 0-8.2 2.9-8.2 6.6 0 .9.7 1.6 1.6 1.6h13.2c.9 0 1.6-.7 1.6-1.6 0-3.7-3.7-6.6-8.2-6.6z"/></svg>
          </button>
        </div>

        <h1 class="hm-greet">${escapeHtml(greeting.text)}</h1>

        <!-- Погода. Крок 4 наповнить її даними; поки — місце й підпис фото. -->
        <div class="hm-top-foot">
          <button class="hm-wx" type="button" data-hm-weather hidden></button>
          <span class="hm-top-cap">${escapeHtml(heroSet()[0].caption)}</span>
        </div>
      </div>
    </header>

    <div class="hm-body">
      <!-- Голос Вови. НЕ липке: панель більше нічого не накриває. -->
      <div class="hm-hello">
        <h2 class="hm-hello-t">ШО В СЕЛІ?</h2>
        <p class="hm-hello-s">Ось що головне у нас сьогодні</p>
      </div>

      <!-- СМУГА «ЗАРАЗ» (крок 5): капсули з'являються лише коли є що сказати. -->
      <div class="hm-now" id="hm-now" hidden></div>

      <!-- ЗБІР (крок 7): порожній контейнер = блока на екрані немає взагалі. -->
      <section class="hm-fund-wrap" id="hm-fund"></section>

      <section class="hm-sec" id="hm-news">
        <div class="hm-sec-head">
          <h3 class="hm-sec-title">Головне</h3>
          <button class="hm-sec-link" type="button" data-cm-news-all>Усі новини</button>
        </div>
        <div id="cm-news-content"></div>
      </section>

      <section class="hm-sec" id="hm-events">
        <div class="hm-sec-head">
          <h3 class="hm-sec-title">Найближчі події</h3>
          <button class="hm-sec-link" type="button" data-switch-tab="shotam">Афіша</button>
        </div>
        <div id="cm-event-content"></div>
      </section>

      <section class="hm-sec" id="hm-board">
        <div class="hm-sec-head">
          <h3 class="hm-sec-title">Оголошення громади</h3>
          <button class="hm-sec-link" type="button" data-switch-tab="board">Уся дошка</button>
        </div>
        <div id="cm-board-content"></div>
      </section>

      <section class="hm-sec" id="hm-contacts">
        <div class="hm-sec-head">
          <h3 class="hm-sec-title">Корисні телефони</h3>
        </div>
        <div id="cm-contacts-content"></div>
      </section>

      <!-- Автобус переїхав у смугу «ЗАРАЗ» капсулою з відліком; повний розклад —
           на своїй вкладці. Контейнер лишається, бо renderBusBlock() наповнює
           саме його (крок 5 переносить вміст у капсулу). -->
      <div id="cm-bus-content" hidden></div>
      <!-- Погоді окремий контейнер більше не потрібен: renderWeatherBlock()
           наповнює кнопку .hm-wx у шапці, а весь прогноз живе в її модалці. -->
    </div>
  `;
}

// ── Точка входу ──────────────────────────────────────────────────────────────

let _greetingWired = false;
let _nowWired = false;

export function initCommunity() {
  renderSkeleton();
  attachSwitchTabDelegation();
  startHeroRotator();
  refreshAccountButtons();    // кнопка кабінету: фото профілю або іконка
  // Вітання персоналізується, коли профіль/ім'я підвантажились (вхід/зміна).
  if (!_greetingWired) { onAuthChange(updateGreetingName); _greetingWired = true; }
  updateGreetingName();
  // Кожен блок вантажить свої дані сам і оновлює свою секцію, коли готовий.
  // Помилка одного блоку не ламає інші (кожен має власний try/catch).
  // Смуга «ЗАРАЗ». Підписки на події заводимо один раз на життя застосунку
  // (`initHomeNow`), сам рендер — на кожне відкриття вкладки.
  if (!_nowWired) { initHomeNow(); _nowWired = true; }
  renderNowStrip();
  renderWeatherBlock();
  renderBusBlock();
  renderBoardBlock();
  renderEventBlock();
  renderContactsBlock();
  renderCommunityNews();
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
