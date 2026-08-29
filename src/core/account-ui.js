// src/core/account-ui.js
// UI-шар авторизації (Фаза Б): екрани «Приєднайтесь», «Доповніть профіль»,
// «Кабінет жителя» + іконка 👤 в шапці. Логіка входу — в auth.js, тут лише вигляд.
//
// М'яка модель (soft): вхід НЕ примусовий. Гість користується додатком як завжди;
// вхід пропонується контекстно (через подію cstl-need-login від requireAuth).

import { openLayer, closeLayer } from './layers.js';   // шари ↔ історія браузера (жест «назад»)
// netErrorText — єдиний словник людських формулювань помилок;
// analyticsEnabled/setAnalyticsEnabled — вимикач статистики (правова відповідність, 14.08);
// deleteMyAccount — RPC delete_my_account() (одна транзакція в базі).
// ⚠️ Коментарі стоять НАД блоком, а не в рядках із іменами: сторож
// `scripts/check-imports.js` розбирає імпорт регуляркою по комі, і коментар
// усередині дужок він читає як частину імені (спіймано 14.08 — збірка впала).
import {
  netErrorText,
  analyticsEnabled, setAnalyticsEnabled,
  deleteMyAccount,
  fetchNotifPrefs, saveNotifPref, seedNotifPrefs, NOTIF_TOPICS,
} from './supabase.js';
// sendEmailCode/verifyEmailCode + normalizeEmail/isValidEmail — вхід поштою
// одноразовим кодом (29.08): другий спосіб входу для тих, хто не має Google.
import {
  isLoggedIn, currentUser, onAuthChange,
  signInWithGoogle, signOut, getProfile, saveProfile, currentAvatarUrl,
  sendEmailCode, verifyEmailCode, normalizeEmail, isValidEmail,
} from './auth.js';
import { openThreadsList, openMyAds } from '../tabs/board-chat.js';
import { ICONS } from './icons.js';
import { openSavedHub } from './saved-hub.js';
import { SETTLEMENTS, OTHER_SETTLEMENT } from './settlements.js';
import { escapeHtml, showToast, avatarCircle } from './utils.js';
import { uploadAvatarPair } from './upload.js';   // дрібне+велике фото жителя за один захід
import { openModal as openModalPrimitive, closeModal as closeModalPrimitive } from './modal.js';

let _newUserChecked = false;  // чи вже перевіряли профіль на авто-показ (раз за сесію)

// ── Кнопки входу в кабінет ([data-account-btn]) ─────────────────
// Раніше була одна #account-btn у шапці; тепер кнопка живе біля привітання на
// Громаді (рішення Вови 15.07), а механізм узагальнено: оновлюємо ВСІ кнопки
// з атрибутом data-account-btn (кожна тримає свою дефолтну іконку в dataset).
export function refreshAccountButtons() {
  const av = isLoggedIn() ? currentAvatarUrl() : '';
  document.querySelectorAll('[data-account-btn]').forEach(btn => {
    if (!btn.dataset.defaultHtml) btn.dataset.defaultHtml = btn.innerHTML;   // зберегти дефолтну SVG-іконку
    // Є фото профілю → мініатюра-кружечок; інакше — дефолтна іконка користувача.
    btn.innerHTML = av
      ? `<span class="account-btn-av"><img src="${escapeHtml(av)}" alt="" loading="lazy"></span>`
      : btn.dataset.defaultHtml;
    btn.classList.toggle('account-btn--in', isLoggedIn());
    btn.classList.toggle('account-btn--av', !!av);
    btn.setAttribute('aria-label', isLoggedIn() ? 'Кабінет жителя' : 'Увійти');
  });
}
const updateHeaderBtn = refreshAccountButtons;   // внутрішні виклики нижче — як були

// ── Базова модалка (центрована картка) — тонка обгортка над спільним примітивом
// core/modal.js (Потік C1). Власна сигнатура openModal(innerHtml) → DOM-елемент
// лишається як є, щоб не чіпати виклики нижче (openJoin/openProfile).
function closeModal() {
  closeModalPrimitive();
}

function openModal(innerHtml) {
  const { el } = openModalPrimitive({ bodyHtml: innerHtml, variant: 'center' });
  return el;
}

// ── Екран 1: «Приєднайтесь» (гість) ──────────────────────────────
// reason — необов'язковий підпис чому варто увійти (з контекстного гейту).
//
// 🔴 29.08 — ДВА СПОСОБИ ВХОДУ ЗАМІСТЬ ОДНОГО (замовлення Вови).
// Було: одна кнопка «Увійти з Gmail». Хто не має акаунта Google — не мав ЖОДНОГО
// способу зайти, тобто для частини Олики застосунок був закритий назавжди.
//
// 🔑 НАЗВУ КНОПКИ ВИПРАВЛЕНО НА «Google», І ЦЕ НЕ КОСМЕТИКА. Акаунт Google буває
// на будь-якому домені (робоча пошта, власний домен) — і навпаки, «Gmail» звучить
// як «тільки для тих, у кого адреса на gmail.com». Кнопка САМА відсіювала людей,
// яким вона підходить.
//
// 🛑 ЧОМУ ЦЕ ОДНА КАРТКА НА ТРИ КРОКИ, А НЕ ТРИ МОДАЛКИ. Кожне відкриття модалки
// в примітиві закриває попередню (`core/modal.js`), тобто три модалки = три
// перемальовки з нуля і три анімації підряд. Людина при цьому лишається в одній
// думці — «я заходжу», — тож і картка мусить лишатись однією.
function openJoin(reason) {
  const sub = reason
    ? `Увійдіть, щоб ${escapeHtml(reason)}.`
    : 'Увійдіть, щоб подавати оголошення, писати й реагувати.';

  // 🔑 Беремо `close` самої картки, а не спільний `closeModal()`. Різниця стає
  // видимою рівно в одному місці — після вдалого входу: `onAuthChange` встигає
  // відкрити «Доповніть профіль», і спільний `closeModal()` закрив би ЙОГО, бо
  // закриває ту модалку, що активна ЗАРАЗ. Власний `close` знає лише свою і при
  // повторному виклику мовчки виходить.
  let timer = 0;
  const { el: wrap, close } = openModalPrimitive({
    bodyHtml: '', variant: 'center',
    onClose: () => { if (timer) clearInterval(timer); timer = 0; },
  });
  const body = wrap.querySelector('.app-modal-body');

  let addr = '';            // пошта, введена людиною (жива між кроками)
  let resendLeft = 0;       // скільки секунд лишилось до повторного надсилання

  const showErr = (text) => {
    const box = body.querySelector('.acc-err');
    if (!box) return;
    box.textContent = text || '';
    box.hidden = !text;
  };
  // Кнопка на час запиту: вимкнена + чесно каже, що саме відбувається.
  const busy = (btn, on, label) => {
    if (!btn) return;
    if (on) { btn.dataset.idle = btn.textContent; btn.textContent = label; }
    else if (btn.dataset.idle) { btn.textContent = btn.dataset.idle; }
    btn.disabled = on;
  };

  // ── Крок 1: вибір способу ──
  function stepStart() {
    body.innerHTML = `
      <div class="acc-emoji">👤</div>
      <h2 class="acc-title">Приєднайтесь до громади</h2>
      <p class="acc-sub">${sub}</p>
      <button class="acc-google" type="button" data-go="google">
        <span class="acc-g">G</span> Увійти з Google
      </button>
      <button class="acc-mail" type="button" data-go="mail">
        ${ICONS.mail} Увійти поштою
      </button>
      <button class="acc-skip" type="button" data-go="skip">Поки пропустити</button>`;
    body.querySelector('[data-go="google"]').addEventListener('click', () => signInWithGoogle());
    body.querySelector('[data-go="mail"]').addEventListener('click', stepEmail);
    body.querySelector('[data-go="skip"]').addEventListener('click', close);
  }

  // ── Крок 2: адреса ──
  // ⚠️ `autocapitalize/autocorrect/spellcheck` вимкнені навмисно: iOS інакше пише
  // адресу з великої літери й підкреслює її як помилку — обидва «виправлення»
  // людина мусила б скасовувати руками при кожному вході.
  function stepEmail() {
    body.innerHTML = `
      <div class="acc-emoji">✉️</div>
      <h2 class="acc-title">Вхід поштою</h2>
      <p class="acc-sub">Надішлемо код на вашу адресу. Пароль вигадувати не треба.</p>
      <input class="acc-input" type="email" inputmode="email" autocomplete="email"
             autocapitalize="off" autocorrect="off" spellcheck="false"
             placeholder="адреса@пошта.com" value="${escapeHtml(addr)}" data-f="email">
      <p class="acc-err" hidden></p>
      <button class="acc-primary" type="button" data-go="send">Надіслати код</button>
      <button class="acc-skip" type="button" data-go="back">← Інший спосіб</button>`;
    const input = body.querySelector('[data-f="email"]');
    const send  = body.querySelector('[data-go="send"]');
    input.focus();
    input.addEventListener('input', () => showErr(''));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });
    send.addEventListener('click', doSend);
    body.querySelector('[data-go="back"]').addEventListener('click', stepStart);

    async function doSend() {
      const value = normalizeEmail(input.value);
      if (!isValidEmail(value)) { showErr('Перевір адресу пошти'); input.focus(); return; }
      addr = value;
      showErr('');
      busy(send, true, 'Надсилаю…');
      const r = await sendEmailCode(addr);
      busy(send, false);
      if (!r.ok) { showErr(r.error); return; }
      stepCode();
    }
  }

  // ── Крок 3: код ──
  // 🔑 `autocomplete="one-time-code"` — саме завдяки цьому iOS сам пропонує код
  // із листа над клавіатурою, і людина вводить його одним тапом.
  function stepCode() {
    body.innerHTML = `
      <div class="acc-emoji">🔑</div>
      <h2 class="acc-title">Введіть код</h2>
      <p class="acc-sub">Надіслали 6 цифр на <b>${escapeHtml(addr)}</b>.<br>
        Лист іде до хвилини — гляньте й теку «Спам».</p>
      <input class="acc-input acc-code" type="text" inputmode="numeric" autocomplete="one-time-code"
             maxlength="6" placeholder="——————" data-f="code">
      <p class="acc-err" hidden></p>
      <button class="acc-primary" type="button" data-go="check">Підтвердити</button>
      <button class="acc-skip" type="button" data-go="resend"></button>
      <button class="acc-skip" type="button" data-go="edit">← Змінити пошту</button>`;
    const input  = body.querySelector('[data-f="code"]');
    const check  = body.querySelector('[data-go="check"]');
    const resend = body.querySelector('[data-go="resend"]');
    input.focus();
    body.querySelector('[data-go="edit"]').addEventListener('click', stepEmail);

    // Тільки цифри. Набрали шість — звіряємо самі, без зайвого тапу: код і так
    // однозначний, а зайвий тап тут це рівно та дрібниця, на якій люди спотикаються.
    input.addEventListener('input', () => {
      const only = input.value.replace(/\D/g, '').slice(0, 6);
      if (only !== input.value) input.value = only;
      showErr('');
      if (only.length === 6) doCheck();
    });
    check.addEventListener('click', doCheck);
    resend.addEventListener('click', async () => {
      if (resendLeft > 0) return;
      busy(resend, true, 'Надсилаю…');
      const r = await sendEmailCode(addr);
      busy(resend, false);
      if (!r.ok) { showErr(r.error); return; }
      showToast('Код надіслано ще раз', 2200);
      startCountdown();
    });
    startCountdown();

    // Повторне надсилання не раніше ніж через хвилину — стільки ж тримає й сам
    // Supabase. 🛑 Показуємо це числом, а не мовчазною відмовою: інакше людина
    // тисне кнопку, «нічого не стається», і вона йде з застосунку.
    function startCountdown() {
      resendLeft = 60;
      if (timer) clearInterval(timer);
      const tick = () => {
        if (!resend.isConnected) { clearInterval(timer); timer = 0; return; }
        resend.textContent = resendLeft > 0 ? `Надіслати ще раз (${resendLeft})` : 'Надіслати ще раз';
        resend.disabled = resendLeft > 0;
        if (resendLeft-- <= 0) { clearInterval(timer); timer = 0; }
      };
      tick();
      timer = setInterval(tick, 1000);
    }

    async function doCheck() {
      const code = input.value.replace(/\D/g, '');
      if (code.length < 6) { showErr('Код складається з 6 цифр'); return; }
      busy(check, true, 'Перевіряю…');
      const r = await verifyEmailCode(addr, code);
      busy(check, false);
      if (!r.ok) { showErr(r.error); input.select(); return; }
      close();                       // саме СВОЮ картку — див. коментар угорі
      showToast('Ви увійшли', 2200);
    }
  }

  stepStart();
}

// ── Екран 2: «Доповніть профіль» (раз, після першого входу) ───────
function openProfile() {
  const u = currentUser();
  if (!u) return;
  const defaultName = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '';
  const wrap = openModal(`
    <h2 class="acc-title">Раді вас бачити!</h2>
    <label class="acc-label">Ім'я</label>
    <input class="acc-input" id="acc-name" type="text" placeholder="Ваше ім'я" value="${escapeHtml(defaultName)}">
    <label class="acc-label">Дата народження</label>
    <input class="acc-input" id="acc-bdate" type="date" max="${new Date().toISOString().slice(0,10)}">
    <button class="acc-primary" type="button" id="acc-save">Зберегти</button>
    <button class="acc-skip" type="button" id="acc-later">Пізніше</button>`);

  const finish = async (withDate) => {
    const name = wrap.querySelector('#acc-name').value.trim();
    const bd   = wrap.querySelector('#acc-bdate').value;   // YYYY-MM-DD або ''
    const res  = await saveProfile({ name, birth_date: withDate ? bd : null });
    if (!res.ok) { showToast(netErrorText(res.error), 4000, 'error'); return; }
    closeModal();
    if (withDate) showToast('Профіль збережено', 2500);
  };
  // «Зберегти» — з датою; «Пізніше» — лише ім'я (щоб не питати щоразу).
  wrap.querySelector('#acc-save').addEventListener('click', () => finish(true));
  wrap.querySelector('#acc-later').addEventListener('click', () => finish(false));
}

// 🔴 24.08 — B-33: ТУМБЛЕРИ СТАЛИ РОБОЧИМИ, І НАБІР ЗМІНИВСЯ.
//
// Було чотири: «Автобуси · Світло · Новини · Дошка». Жоден нічого не вимикав
// (`notif_prefs` у `localStorage` не читався ніким), а два з них були гірші за
// просто неробочі: **«Світло» і «Новини» вимикали те, чого не існує** — таких
// push у проєкті немає взагалі. Людина тисне тумблер, нічого не приходить — і
// робить висновок, що вимикач працює. Вада з ФАЛЬШИВИМ ПІДТВЕРДЖЕННЯМ.
//
// 🛑 Тому обидва прибрані, а не «лишені на майбутнє»: тумблер під те, чого
// немає, — це та сама декорація, тільки з обіцянкою. Заведемо push про світло —
// повернемо тумблер РАЗОМ із ним.
//
// ✅ Лишились ті, під якими є справжній push, і доданий пʼятий — «Питання»
// (звірено по всіх сімох Edge Functions 24.08).
//
// 🛑 Приватних повідомлень і групового чату тут НЕМАЄ навмисно: це персональне
// звернення до конкретної людини, і воно не притишується — те саме правило, що
// вже діє всередині `send-answer-push` для «вам відповіли».
const NOTIF_KEYS = [
  { k: 'buses',     ic: ICONS.bus,     label: 'Автобуси', hint: 'Рейси, які ви відстежуєте' },
  { k: 'questions', ic: ICONS.message, label: 'Питання',  hint: 'Відповіді на ваші й позначені питання' },
  { k: 'board',     ic: ICONS.pin,     label: 'Дошка',    hint: 'Коментарі до ваших оголошень' },
  { k: 'feed',      ic: ICONS.bookmark, label: 'Стрічка', hint: 'Нові дописи сторінок і коментарі' },
];

// Локальний знімок — щоб екран малювався ОДРАЗУ, не чекаючи мережі.
// 🔑 Це не друге джерело правди, а кеш: істина в базі, сюди лише дублюється
// після кожної зміни. Без нього тумблери блимали б у стан «усе ввімкнено» на
// кожному відкритті кабінету.
function loadNotifPrefs(uid) {
  const out = {};
  NOTIF_KEYS.forEach(n => out[n.k] = true);   // за замовчуванням усе ввімкнено
  try {
    const raw = JSON.parse(localStorage.getItem('notif_prefs:' + uid) || '{}');
    NOTIF_KEYS.forEach(n => { if (n.k in raw) out[n.k] = !!raw[n.k]; });
  } catch { /* немає або зіпсовано — лишаємо дефолти */ }
  return out;
}
function saveNotifPrefs(uid, prefs) {
  try { localStorage.setItem('notif_prefs:' + uid, JSON.stringify(prefs)); } catch { /* ignore */ }
}

// Чи вже перенесли старий вибір із `localStorage` у базу (один раз на акаунт).
const SEEDED_KEY = (uid) => 'notif_seeded:' + uid;

// ── Екран 3: «Мій кабінет» — повноекранний, з анкетою ─────────────
// Кабінет — повноекранний ШАР (core/layers.js): системний жест «назад» і кнопка
// браузера закривають саме його, а не відкочують увесь додаток.
let _cabLayer = null;
function removeCabinet() {
  const c = document.getElementById('acc-cab');
  if (!c) return;
  c.classList.remove('open');
  document.body.classList.remove('modal-open');
  setTimeout(() => c.remove(), 240);
}
function closeCabinet() {
  if (_cabLayer) { closeLayer(_cabLayer); _cabLayer = null; return; }
  removeCabinet();
}

async function openAccount() {
  const u = currentUser();
  if (!u) return;
  const p = (await getProfile()) || {};
  const email = u.email || '';
  const gName = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '';
  const val = {
    name: p.name || gName || '',
    surname: p.surname || '',
    birth_date: p.birth_date || '',
    phone: p.phone || '',
    settlement: p.settlement || '',
    street: p.street || '',
    bio: p.bio || '',
    avatar_url: p.avatar_url || '',
  };
  const fullName = [val.name, val.surname].filter(Boolean).join(' ') || 'Житель';
  const place = val.settlement || 'Учасник спільноти';
  const prefs = loadNotifPrefs(u.id);
  const today = new Date().toISOString().slice(0, 10);
  // Репутація Дошки (Захід 2): 5 схвалених оголошень → автопублікація надалі.
  const trustHtml = p.trusted
    ? `<div class="acc-cab-trust acc-cab-trust--on">${ICONS.check} Довірений автор — оголошення публікуються одразу</div>`
    : `<div class="acc-cab-trust">${ICONS.star} ${p.approved_count || 0}/5 схвалень до автопублікації</div>`;

  // Рядок анкети (iOS-Settings): плитка-іконка · підпис+поле (inline-редагування)
  // · декоративна вектор-стрілка. Обгортка — <label>, тож тап у рядок фокусує поле.
  const field = (ic, label, control) => `
    <label class="acc-f">
      <span class="acc-f-ic">${ic}</span>
      <span class="acc-f-body"><span class="acc-f-lbl">${label}</span>${control}</span>
      <i class="acc-f-chev">${ICONS.chevronRight}</i>
    </label>`;
  // Рядок-навігація блоку «Моє»: іконка-плитка · назва+опис · стрілка.
  const navRow = (go, ic, name, desc) => `
    <button class="acc-cab-row" data-go="${go}" type="button">
      <span class="acc-cab-row-ic">${ic}</span>
      <span class="acc-cab-row-body"><span class="acc-cab-row-name">${name}</span><span class="acc-cab-row-desc">${desc}</span></span>
      <i>${ICONS.chevronRight}</i>
    </button>`;

  const cab = document.createElement('div');
  cab.id = 'acc-cab';
  cab.className = 'acc-cab';
  cab.innerHTML = `
    <div class="acc-cab-top">
      <button class="acc-cab-back" type="button" aria-label="Назад">${ICONS.back}</button>
      <b>Мій кабінет</b>
    </div>
    <div class="acc-cab-scroll">
      <div class="acc-cab-hero">
        <div class="acc-cab-avwrap">
          <div class="acc-cab-av" id="acc-hero-av">${avatarCircle({ name: fullName, url: val.avatar_url, cls: 'acc-av' })}</div>
          <button class="acc-cab-avcam" type="button" id="acc-av-btn" aria-label="Змінити фото">${ICONS.photo}</button>
          <input type="file" id="acc-av-file" accept="image/*" hidden>
        </div>
        <div class="acc-cab-hi">
          <div class="acc-cab-name" id="acc-hero-name">${escapeHtml(fullName)}</div>
          <div class="acc-cab-email">${escapeHtml(email)}</div>
          <div class="acc-cab-place" id="acc-hero-place">${escapeHtml(place)}</div>
          ${trustHtml}
        </div>
      </div>

      <div class="acc-cab-sec">
        <h3>Мої дані</h3>
        ${field(ICONS.user, "Ім'я", `<input id="cf-name" type="text" value="${escapeHtml(val.name)}" placeholder="Ваше ім'я">`)}
        ${field(ICONS.clipboard, 'Прізвище', `<input id="cf-surname" type="text" value="${escapeHtml(val.surname)}" placeholder="Прізвище">`)}
        ${field(ICONS.calendar, 'Дата народження', `<input id="cf-bdate" type="date" max="${today}" value="${escapeHtml(val.birth_date)}">`)}
        ${field(ICONS.phone, 'Телефон (для оголошень)', `<input id="cf-phone" type="tel" value="${escapeHtml(val.phone)}" placeholder="+380…">`)}
        ${field(ICONS.pin, 'Населений пункт', `<select id="cf-settlement">
            <option value="">— оберіть —</option>
            ${[...SETTLEMENTS, OTHER_SETTLEMENT].map(s => `<option ${val.settlement === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>`)}
        ${field(ICONS.home, "Вулиця (необов'язково)", `<input id="cf-street" type="text" value="${escapeHtml(val.street)}" placeholder="напр. вул. Замкова">`)}
        ${field(ICONS.fileText, 'Про себе', `<textarea id="cf-bio" rows="2" placeholder="Кілька слів…">${escapeHtml(val.bio)}</textarea>`)}
      </div>
      <button class="acc-cab-save" type="button" id="cf-save">Зберегти анкету</button>

      <div class="acc-cab-sec acc-cab-sec--rows">
        <h3>Моє</h3>
        ${navRow('myads', ICONS.megaphone, 'Мої оголошення', 'Перегляд і керування вашими оголошеннями')}
        ${navRow('saved', ICONS.bookmark, 'Збережені', 'Оголошення й статті, які ви зберегли')}
        ${navRow('msgs', ICONS.message, 'Повідомлення', 'Особисті чати з іншими жителями')}
      </div>

      <div class="acc-cab-sec acc-cab-sec--rows">
        <h3>Сповіщення</h3>
        ${NOTIF_KEYS.map(n => `
          <div class="acc-cab-row acc-cab-row--tog">
            <span class="acc-cab-row-ic">${n.ic}</span>
            <span class="acc-cab-row-body">
              <span class="acc-cab-row-name">${n.label}</span>
              <span class="acc-cab-row-desc">${n.hint}</span>
            </span>
            <button class="acc-tog${prefs[n.k] ? '' : ' off'}" data-notif="${n.k}" type="button"
                    role="switch" aria-checked="${prefs[n.k] ? 'true' : 'false'}"
                    aria-label="${n.label} — ${n.hint}"></button>
          </div>`).join('')}
      </div>

      <div class="acc-cab-sec acc-cab-sec--rows">
        <h3>Приватність і дані</h3>
        <div class="acc-cab-row acc-cab-row--tog">
          <span class="acc-cab-row-ic">${ICONS.shield}</span>
          <span class="acc-cab-row-body">
            <span class="acc-cab-row-name">Статистика користування</span>
            <span class="acc-cab-row-desc">Знеособлені події: які розділи відкривають і коли. Вимикається лише на цьому пристрої</span>
          </span>
          <button class="acc-tog${analyticsEnabled() ? '' : ' off'}" data-priv="analytics" type="button" aria-label="Статистика користування"></button>
        </div>
        <button class="acc-cab-row acc-cab-row--danger" id="cf-delete" type="button">
          <span class="acc-cab-row-ic">${ICONS.trash}</span>
          <span class="acc-cab-row-body">
            <span class="acc-cab-row-name">Видалити акаунт</span>
            <span class="acc-cab-row-desc">Назавжди, без можливості відновити</span>
          </span>
          <i>${ICONS.chevronRight}</i>
        </button>
      </div>

      <button class="acc-cab-logout" type="button" id="cf-logout">Вийти</button>
    </div>`;
  document.body.appendChild(cab);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => cab.classList.add('open'));
  // 19.08 — свайп назад «звідки завгодно» (див. `core/layers.js`).
  _cabLayer = openLayer(() => { _cabLayer = null; removeCabinet(); }, { el: cab });

  cab.querySelector('.acc-cab-back').addEventListener('click', closeCabinet);

  // ── Аватар: вибір фото → квадрат-ресайз → upload → зберегти avatar_url ──
  const avBtn = cab.querySelector('#acc-av-btn');
  const avFile = cab.querySelector('#acc-av-file');
  const avBox = cab.querySelector('#acc-hero-av');
  // Видалити своє фото → avatar_url:null, показати літеру-fallback скрізь.
  const removeAvatar = async () => {
    avBtn.disabled = true; avBox.classList.add('acc-av--loading');
    try {
      const res = await saveProfile({ avatar_url: null });
      if (!res.ok) throw new Error(res.error || 'save');
      val.avatar_url = '';
      avBox.innerHTML = avatarCircle({ name: cab.querySelector('#acc-hero-name').textContent, url: '', cls: 'acc-av' });
      updateHeaderBtn();                        // шапка → назад на дефолтну іконку
      showToast('Фото видалено', 2200);
    } catch (err) {
      // Текст уже людський (його дає netErrorText у saveProfile) — сирий сюди не доходить.
      showToast(err.message || 'Не вдалося видалити фото — спробуй ще раз', 4000, 'error');
    } finally {
      avBtn.disabled = false; avBox.classList.remove('acc-av--loading');
    }
  };
  // Меню камери: нема фото → одразу вибір файлу; є фото → «Змінити / Видалити».
  avBtn.addEventListener('click', () => {
    if (!val.avatar_url) { avFile.click(); return; }
    const menu = openModalPrimitive({
      variant: 'sheet',
      className: 'app-modal--top',   // поверх екрана кабінету (3100), інакше ховається під ним
      bodyHtml: `
        <div class="acc-avmenu">
          <button type="button" class="acc-avmenu-item" data-av-act="change">${ICONS.photo} Змінити фото</button>
          <button type="button" class="acc-avmenu-item acc-avmenu-item--danger" data-av-act="remove">${ICONS.trash} Видалити фото</button>
        </div>`,
    });
    menu.el.querySelector('[data-av-act="change"]').addEventListener('click', () => { closeModalPrimitive(); avFile.click(); });
    menu.el.querySelector('[data-av-act="remove"]').addEventListener('click', () => { closeModalPrimitive(); removeAvatar(); });
  });
  avFile.addEventListener('change', async () => {
    const file = avFile.files && avFile.files[0];
    avFile.value = '';                         // дозволити повторний вибір того ж файлу
    if (!file) return;
    avBtn.disabled = true; avBox.classList.add('acc-av--loading');
    try {
      // 🔵 23.08 — ДВІ версії за один захід: дрібна квадратна (кружечки в
      // списках) і велика в пропорціях оригіналу (картка жителя + фото на весь
      // екран). До цього був ОДИН файл 256×256 на всі місця, і в картці він
      // розтягувався до 4.5 раза — саме це Вова й побачив як «розмите,
      // піксельне». У базу йде адреса ДРІБНОЇ, велика лежить поруч (`@lg`).
      const { url, error } = await uploadAvatarPair(file);
      if (!url) throw new Error(error || 'upload');
      const res = await saveProfile({ avatar_url: url });
      if (!res.ok) throw new Error(res.error || 'save');
      val.avatar_url = url;
      avBox.innerHTML = avatarCircle({ name: cab.querySelector('#acc-hero-name').textContent, url, cls: 'acc-av' });
      updateHeaderBtn();                        // мініатюра в шапці одразу
      showToast('✅ Фото оновлено', 2200);
    } catch (err) {
      showToast(err.message || 'Не вдалося завантажити фото — спробуй ще раз', 4000, 'error');
    } finally {
      avBtn.disabled = false; avBox.classList.remove('acc-av--loading');
    }
  });

  // Збереження анкети
  cab.querySelector('#cf-save').addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Зберігаємо…';
    const fields = {
      name: cab.querySelector('#cf-name').value.trim(),
      surname: cab.querySelector('#cf-surname').value.trim(),
      birth_date: cab.querySelector('#cf-bdate').value || null,
      phone: cab.querySelector('#cf-phone').value.trim(),
      settlement: cab.querySelector('#cf-settlement').value,
      street: cab.querySelector('#cf-street').value.trim(),
      bio: cab.querySelector('#cf-bio').value.trim(),
    };
    const res = await saveProfile(fields);
    btn.disabled = false; btn.textContent = 'Зберегти анкету';
    if (!res.ok) { showToast(netErrorText(res.error), 4000, 'error'); return; }
    // Оновлюємо шапку кабінету наживо
    cab.querySelector('#acc-hero-name').textContent = [fields.name, fields.surname].filter(Boolean).join(' ') || 'Житель';
    cab.querySelector('#acc-hero-place').textContent = fields.settlement || 'Учасник спільноти';
    // ЧЕСНИЙ статус: partial = база ще без розширених колонок (село/прізвище/
    // телефон НЕ збереглись) — не брешемо «збережено», кажемо що саме сталося.
    if (res.partial) {
      showToast('Збережено імʼя і дату. Село й телефон — згодом', 5000, 'error');
    } else {
      showToast('✅ Анкету збережено', 2500);
    }
  });
  // Розділи «Моє»
  cab.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    const go = b.dataset.go;
    closeCabinet();
    if (go === 'myads') openMyAds();
    else if (go === 'msgs') openThreadsList();
    else if (go === 'saved') openSavedHub();   // хаб збережених (замість «незабаром»)
  }));
  // ── ТУМБЛЕРИ СПОВІЩЕНЬ (B-33, 24.08) ─────────────────────────────────────
  //
  // 🔑 Порядок: малюємо з локального знімка (миттєво) → підтягуємо істину з бази
  // → перемальовуємо, якщо розійшлось. Так екран не блимає і не бреше.
  cab.querySelectorAll('[data-notif]').forEach(t => t.addEventListener('click', async () => {
    const k = t.dataset.notif;
    const було = prefs[k];
    prefs[k] = !було;
    t.classList.toggle('off', !prefs[k]);
    t.setAttribute('aria-checked', prefs[k] ? 'true' : 'false');
    saveNotifPrefs(u.id, prefs);             // знімок — щоб екран пережив перезапуск
    const res = await saveNotifPref(u.id, k, prefs[k]);
    if (!res.ok) {
      // 🛑 ВІДКАТ ОБОВʼЯЗКОВИЙ. Тумблер, який показує «вимкнено», а в базі
      // лишився ввімкненим, — це рівно та сама брехня, від якої лікуємо B-33,
      // тільки тепер вона була б переконливішою: людина ж бачила, як він
      // клацнув.
      prefs[k] = було;
      t.classList.toggle('off', !prefs[k]);
      t.setAttribute('aria-checked', prefs[k] ? 'true' : 'false');
      saveNotifPrefs(u.id, prefs);
      showToast('Не вдалося зберегти налаштування — спробуйте ще раз', 3000, 'error');
    }
  }));

  // Істина з бази. Якщо рядка ще немає — переносимо туди те, що людина вже
  // вибрала на цьому пристрої (див. `seedNotifPrefs`), і тільки ОДИН раз.
  (async () => {
    const зБази = await fetchNotifPrefs(u.id);
    if (!зБази) {
      let вже = false;
      try { вже = !!localStorage.getItem(SEEDED_KEY(u.id)); } catch { /* ignore */ }
      if (!вже) {
        const r = await seedNotifPrefs(u.id, prefs);
        if (r.ok) { try { localStorage.setItem(SEEDED_KEY(u.id), '1'); } catch { /* ignore */ } }
      }
      return;
    }
    // Розійшлось — виграє база (вона одна на всі пристрої).
    let змінилось = false;
    NOTIF_KEYS.forEach(n => {
      const val = (n.k in зБази) ? !!зБази[n.k] : true;
      if (prefs[n.k] !== val) { prefs[n.k] = val; змінилось = true; }
      const el = cab.querySelector(`[data-notif="${n.k}"]`);
      if (el) { el.classList.toggle('off', !val); el.setAttribute('aria-checked', val ? 'true' : 'false'); }
    });
    if (змінилось) saveNotifPrefs(u.id, prefs);
  })();
  // Вимикач статистики. Пише в localStorage через дата-шар — діє з наступної події,
  // без перезапуску застосунку (сторож стоїть усередині самого `logEvent`).
  const privTog = cab.querySelector('[data-priv="analytics"]');
  privTog.addEventListener('click', () => {
    const on = privTog.classList.contains('off');    // був вимкнений → вмикаємо
    setAnalyticsEnabled(on);
    privTog.classList.toggle('off', !on);
    showToast(on ? 'Статистику увімкнено' : 'Статистику вимкнено на цьому пристрої', 2600);
  });

  // ── Видалення акаунта ────────────────────────────────────────────────────
  // 🔑 Модалка перелічує НЕ «ви впевнені?», а що саме зникне і що лишиться.
  // Людина має ухвалювати рішення, знаючи наслідок: найнесподіваніша його частина —
  // приватне листування, яке НЕ зникає у співрозмовника (воно дані обох).
  cab.querySelector('#cf-delete').addEventListener('click', () => {
    const m = openModalPrimitive({
      variant: 'center',
      className: 'app-modal--top',   // кабінет живе на 3100 — без цього модалка під ним
      bodyHtml: `
        <div class="acc-del">
          <h3 class="acc-del-h">Видалити акаунт?</h3>
          <p class="acc-del-p"><b>Буде стерто назавжди:</b> профіль і фото, ваші
          оголошення разом зі знімками, питання, коментарі, реакції, збережене
          та підписки на сповіщення.</p>
          <p class="acc-del-p"><b>Лишиться:</b> приватне листування у скриньці
          співрозмовника — воно є даними обох, — але вже без вашого імені.
          Розмови про ваші оголошення зникнуть разом з оголошеннями.</p>
          <p class="acc-del-p acc-del-p--warn">Відновити акаунт буде неможливо.</p>
          <div class="acc-del-btns">
            <button type="button" class="acc-del-cancel" data-del="no">Скасувати</button>
            <button type="button" class="acc-del-go" data-del="yes">Видалити назавжди</button>
          </div>
        </div>`,
    });
    m.el.querySelector('[data-del="no"]').addEventListener('click', () => closeModalPrimitive());
    m.el.querySelector('[data-del="yes"]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = 'Видаляємо…';
      const res = await deleteMyAccount();
      if (!res.ok) {
        btn.disabled = false; btn.textContent = 'Видалити назавжди';
        showToast(res.error || 'Не вдалося видалити — спробуй ще раз', 5000, 'error');
        return;
      }
      // Сесія вказує на людину, якої вже немає, — вийти ОБОВʼЯЗКОВО, інакше
      // застосунок далі ходив би в базу з мертвим токеном і сипав помилками.
      closeModalPrimitive();
      await signOut();
      closeCabinet();
      showToast('Акаунт видалено', 4000);
    });
  });

  cab.querySelector('#cf-logout').addEventListener('click', async () => {
    await signOut();
    closeCabinet();
    showToast('Ви вийшли', 2200);
  });
}

// Кнопка в шапці: гість → «Приєднайтесь», житель → «Кабінет».
function onHeaderClick() {
  if (isLoggedIn()) openAccount(); else openJoin();
}

// ── Ініціалізація (викликається з app.js) ────────────────────────
export function initAccountUI() {
  // Делегований клік: будь-яка кнопка [data-account-btn] (зараз — біля привітання
  // на Громаді; рендериться в community.js ПІСЛЯ цього init, делегування це покриває).
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-account-btn]')) onHeaderClick();
  });
  updateHeaderBtn();

  // Контекстний гейт: requireAuth() для гостя кидає цю подію → відкриваємо вхід.
  document.addEventListener('cstl-need-login', (e) => {
    if (isLoggedIn()) return;
    openJoin(e.detail && e.detail.actionLabel);
  });

  // Зміна стану входу: оновити іконку; новачка (немає профілю) — запросити доповнити.
  onAuthChange(async (user) => {
    updateHeaderBtn();
    if (!user || _newUserChecked) return;
    _newUserChecked = true;
    const profile = await getProfile();
    if (!profile) openProfile();   // перший вхід (рядка ще немає) → екран 2
  });
}
