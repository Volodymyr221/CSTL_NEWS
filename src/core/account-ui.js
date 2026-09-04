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
  sendEmailCode, verifyEmailCode, normalizeEmail, isValidEmail, OTP_LENGTH, OTP_MAX,
  signInWithFacebook, FACEBOOK_ENABLED, loginMethods, addEmailLogin, confirmEmailLogin,
} from './auth.js';
import { openThreadsList, openMyAds } from '../tabs/board-chat.js';
import { ICONS } from './icons.js';
import { openSavedHub } from './saved-hub.js';
import { SETTLEMENTS, OTHER_SETTLEMENT } from './settlements.js';
import { escapeHtml, showToast, avatarCircle, fullName } from './utils.js';
import { uploadAvatarPair } from './upload.js';   // дрібне+велике фото жителя за один захід
import { openModal as openModalPrimitive, closeModal as closeModalPrimitive } from './modal.js';

// 🔴 30.08 — ПЕРЕВІРКА «ЦЕ НОВИЙ ЖИТЕЛЬ?» ПРИВʼЯЗАНА ДО ЛЮДИНИ, А НЕ ДО ЗАПУСКУ.
//
// 🗣️ Вова: «Я увійшов під іншою поштою, ну і що? Де анкета для нового користувача?
// В мене пише імʼя — житель».
//
// 🔑 Було `let _newUserChecked = false` — «раз за сесію». Прапорець піднімався на
// ПЕРШОМУ ж вході і більше не опускався. Вова зайшов Google (прапорець став),
// вийшов, зайшов новою поштою — і обробник вийшов на першому ж рядку. Анкета
// «Раді вас бачити» не відкрилась НІКОЛИ, а імʼя лишилось «Житель», бо вхід
// поштою метаданих імені не дає взагалі.
//
// 🛑 Це не рідкісний випадок: Вова веде кілька тестових профілів і перемикає їх
// постійно (`ВОВА_ПРОФІЛЬ.md`), а прапорець про це не знав. Заміряно на живій базі:
// акаунт створено 07:46:17, вхід 07:46:47, рядка в `profiles` немає — тобто анкету
// БУЛО кому показати, і вона просто не відкрилась.
//
// ➡️ Тепер памʼятаємо, ЯКУ САМЕ людину вже питали. Вихід скидає памʼять: якщо
// анкету так і не заповнили, наступний вхід запитає знову — і це правильно.
let _profileAskedFor = null;   // uid людини, якій уже показували анкету новачка

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 30.08 — ДВІ ВАДИ ВХОДУ ПОШТОЮ, ЗНАЙДЕНІ ВОВОЮ НА ЖИВОМУ ТЕЛЕФОНІ
//
// 🗣️ «Натиснув, ввів код, і вантажить вже 3 хв». На знімку одночасно: під полем
// «Код невірний або застарів», а кнопка каже «Перевіряю…». Два стани, які не
// можуть бути правдою разом — і саме ця пара показала обидві вади.
//
// 1️⃣ **КНОПКА БРЕХАЛА.** `busy()` при вмиканні запамʼятовував поточний напис як
//    «спокійний». Якщо він спрацьовував ДРУГИЙ раз, поки кнопка вже в роботі, то
//    запамʼятовував «Перевіряю…» — і потім «відновлював» його назавжди. Запит
//    давно повернувся, а кнопка ще хвилини казала, що працює.
//    ➡️ Лікується одним рядком: спокійний напис зберігається РІВНО ОДИН раз.
//
// 2️⃣ 🔴 **ГІРША: ЗВІРКА ЗАПУСКАЛАСЬ ДВІЧІ.** Код звірявся сам на шостій цифрі
//    (зручність) І по тапу «Підтвердити». Одноразовий код тим і одноразовий: перший
//    виклик його СПОЖИВАЄ, другий отримує «Token has expired or is invalid».
//    🛑 Тобто застосунок спалював код людини і показував це як ЇЇ помилку — той
//    самий клас, що «фальшиве підтвердження» у вимикачах (B-33): екран звинувачує
//    людину в тому, що зробив сам.
//    ⚠️ Вимкнути авто-звірку було б хибним лікуванням: вона знімає зайвий тап і
//    працює. Лікуємо ПРИЧИНУ — два входи в ту саму дію.
//
// 🔑 `singleFlight` тримає це правило в ОДНОМУ місці й на рівні модуля — щоб
// сторож міг його ВИКОНАТИ, а не грепнути, і щоб наступна кнопка з мережевим
// викликом отримала захист даром, а не переписувала його заново.
export function singleFlight(fn) {
  let inFlight = false;
  return async (...args) => {
    if (inFlight) return undefined;         // дубль тихо відкидаємо — він не подія
    inFlight = true;
    try { return await fn(...args); }
    finally { inFlight = false; }
  };
}

// Кнопка на час запиту: вимкнена + чесно каже, що саме відбувається.
// 🔴 `!= null` — саме «вже зберігали?», а не «непорожнє». Порожній напис теж
// законний стан, і перевірка на правдивість зробила б із нього «не зберігали».
export function setBusy(btn, on, label) {
  if (!btn) return;
  if (on) {
    if (btn.dataset.idle == null) btn.dataset.idle = btn.textContent;
    btn.textContent = label;
  } else if (btn.dataset.idle != null) {
    btn.textContent = btn.dataset.idle;
  }
  btn.disabled = on;
}

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
  const busy = (btn, on, label) => setBusy(btn, on, label);

  // ── Крок 1: вибір способу ──
  function stepStart() {
    body.innerHTML = `
      <div class="acc-emoji">👤</div>
      <h2 class="acc-title">Приєднайтесь до громади</h2>
      <p class="acc-sub">${sub}</p>
      <button class="acc-google" type="button" data-go="google">
        <span class="acc-g">G</span> Увійти з Google
      </button>
      ${FACEBOOK_ENABLED ? `
      <button class="acc-fb" type="button" data-go="facebook">
        <span class="acc-f">f</span> Увійти з Facebook
      </button>` : ''}
      <button class="acc-mail" type="button" data-go="mail">
        ${ICONS.mail} Увійти поштою
      </button>
      <button class="acc-skip" type="button" data-go="skip">Поки пропустити</button>`;
    body.querySelector('[data-go="google"]').addEventListener('click', () => signInWithGoogle());
    body.querySelector('[data-go="facebook"]')?.addEventListener('click', () => signInWithFacebook());
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
    // 🔴 30.08 — ВИЗНАЧЕННЯ СТОЇТЬ ВИЩЕ ЗА СЛУХАЧІВ, І ЦЕ НЕ СТИЛЬ, А ВИМОГА.
    // Спершу тут була `async function doSend()` унизу — оголошення функції
    // піднімається, тож порядок не важив. Коли я загорнув її в `singleFlight`,
    // вона стала `const` — а `const` до свого рядка НЕ ІСНУЄ. Рядок
    // `send.addEventListener('click', doSend)` кидав помилку, `stepEmail()`
    // обривався на ньому, і НІЧОГО нижче не підключалось: мертвими ставали
    // обидві кнопки — і «Надіслати код», і «Інший спосіб».
    // 🛑 Знайшов Вова пальцем; жоден сторож цього не бачив, бо всі вони міряли
    // помічники ОКРЕМО, а зламалась ЗБІРКА екрана. Тому нижче доданий стенд,
    // який справді відкриває картку і тисне кнопки.
    const doSend = singleFlight(async () => {
      const value = normalizeEmail(input.value);
      if (!isValidEmail(value)) { showErr('Перевір адресу пошти'); input.focus(); return; }
      addr = value;
      showErr('');
      busy(send, true, 'Надсилаю…');
      const r = await sendEmailCode(addr);
      busy(send, false);
      // 🔑 «Зачекай N секунд» означає, що лист із робочим кодом УЖЕ надіслано.
      // Тримати людину на екрані адреси було б приховуванням того, що в неї є.
      if (!r.ok && r.rateLimited) {
        showErr('');
        stepCode(r.retryAfter);
        showToast('Код уже надіслано — перевір пошту', 3000);
        return;
      }
      if (!r.ok) { showErr(r.error); return; }
      stepCode();
    });

    input.focus();
    input.addEventListener('input', () => showErr(''));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSend(); });
    send.addEventListener('click', doSend);
    body.querySelector('[data-go="back"]').addEventListener('click', stepStart);
  }

  // ── Крок 3: код ──
  // 🔑 `autocomplete="one-time-code"` — саме завдяки цьому iOS сам пропонує код
  // із листа над клавіатурою, і людина вводить його одним тапом.
  function stepCode(waitLeft = 60) {
    body.innerHTML = `
      <div class="acc-emoji">🔑</div>
      <h2 class="acc-title">Введіть код</h2>
      <p class="acc-sub">Надіслали код на <b>${escapeHtml(addr)}</b> — ${OTP_LENGTH} цифр.<br>
        Лист іде до хвилини — гляньте й теку «Спам».</p>
      <input class="acc-input acc-code" type="text" inputmode="numeric" autocomplete="one-time-code"
             maxlength="${OTP_MAX}" placeholder="${'—'.repeat(OTP_LENGTH)}" data-f="code">
      <p class="acc-err" hidden></p>
      <button class="acc-primary" type="button" data-go="check">Підтвердити</button>
      <button class="acc-skip" type="button" data-go="resend"></button>
      <button class="acc-skip" type="button" data-go="edit">← Змінити пошту</button>`;
    const input  = body.querySelector('[data-f="code"]');
    const check  = body.querySelector('[data-go="check"]');
    let autoTimer = 0;
    const resend = body.querySelector('[data-go="resend"]');
    input.focus();

    // Тільки цифри. Набрали шість — звіряємо самі, без зайвого тапу: код і так
    // однозначний, а зайвий тап тут це рівно та дрібниця, на якій люди спотикаються.
    resend.addEventListener('click', singleFlight(async () => {
      if (resendLeft > 0) return;
      busy(resend, true, 'Надсилаю…');
      const r = await sendEmailCode(addr);
      busy(resend, false);
      if (!r.ok) { showErr(r.error); return; }
      showToast('Код надіслано ще раз', 2200);
      startCountdown();
    }));

    // Повторне надсилання не раніше ніж через хвилину — стільки ж тримає й сам
    // Supabase. 🛑 Показуємо це числом, а не мовчазною відмовою: інакше людина
    // тисне кнопку, «нічого не стається», і вона йде з застосунку.
    function startCountdown(secs = 60) {
      resendLeft = Math.max(0, Math.round(secs));
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

    // 🔴 ГОЛОВНЕ МІСЦЕ ВАДИ 30.08: сюди ведуть ДВА входи — авто-звірка на шостій
    // цифрі й тап «Підтвердити». Код одноразовий, тож другий виклик отримував
    // «код невірний» про КОД, який щойно спожив перший.
    const doCheck = singleFlight(async () => {
      // 🔑 Тап СКАСОВУЄ відкладену автозвірку. Без цього рядка тап і пауза дають
      // два послідовні виклики — а `singleFlight` їх не ловить, бо другий стартує
      // ПІСЛЯ завершення першого. Другий отримав би «код невірний» про код, який
      // щойно спожив перший: рівно та вада 30.08, лише іншим шляхом.
      if (autoTimer) { clearTimeout(autoTimer); autoTimer = 0; }
      const code = input.value.replace(/\D/g, '');
      if (code.length < OTP_LENGTH) { showErr(`Код складається з ${OTP_LENGTH} цифр`); return; }
      busy(check, true, 'Перевіряю…');
      const r = await verifyEmailCode(addr, code);
      busy(check, false);
      if (!r.ok) { showErr(r.error); input.select(); return; }
      close();                       // саме СВОЮ картку — див. коментар угорі
      showToast('Ви увійшли', 2200);
    });

    // Слухачі — ПІСЛЯ визначення `doCheck` (та сама причина, що в `stepEmail`).
    body.querySelector('[data-go="edit"]').addEventListener('click', stepEmail);
    input.addEventListener('input', () => {
      const only = input.value.replace(/\D/g, '').slice(0, OTP_MAX);
      if (only !== input.value) input.value = only;
      showErr('');
      // 🔑 Автозвірка з ПАУЗОЮ, а не на точній довжині. Дві причини, обидві з
      // 30.08: якщо в Supabase раптом стоїть інше число, звірка на точній довжині
      // або не спрацює зовсім, або вистрелить ОГРИЗКОМ коду посеред набору. Пауза
      // означає «людина дописала» — і тоді байдуже, шість там цифр чи вісім.
      if (autoTimer) clearTimeout(autoTimer);
      if (only.length >= OTP_LENGTH) autoTimer = setTimeout(doCheck, 350);
    });
    check.addEventListener('click', doCheck);
    startCountdown(waitLeft);
  }

  stepStart();
}

// ── Екран 2: «Доповніть профіль» (раз, після першого входу) ───────
//
// 🔴 29.08 — ТРИ ЗМІНИ, КОЖНА ЗА ПРЯМИМ ЗАМОВЛЕННЯМ ВОВИ.
//
// 1️⃣ **ІМʼЯ І ПРІЗВИЩЕ ОКРЕМО.** Було одне поле «Імʼя», куди лягав увесь рядок
//    від Google. У кабінеті поля вже РОЗДІЛЕНІ (`#cf-name` / `#cf-surname`), і в
//    базі колонка `surname` є з липня — тобто перший екран був єдиним місцем, де
//    прізвище губилось, і людині доводилось розбирати це руками пізніше.
//
// 2️⃣ **ПІДСТАВЛЯЄМО, АЛЕ НЕ ПЕРЕПИСУЄМО.** 📐 Заміряно по 13 акаунтах у базі:
//    Google віддає `full_name` ОДНИМ рядком — ключів `given_name`/`family_name`
//    у метаданих НЕМАЄ ЖОДНОГО. Тому ділимо по першому пробілу: у 12 із 13 рядок
//    саме з двох слів. Тринадцятий і будь-який інший виняток людина виправляє
//    одним тапом — поля лишаються звичайними полями.
//    🛑 **ЛАТИНИЦЮ В КИРИЛИЦЮ АВТОМАТИЧНО НЕ ПЕРЕКЛАДАЄМО** (5 із 13 імен
//    приходять латиницею). «Ihor/Igor», «Honchar/Gonchar», «Illia/Ilya» машина
//    плутає регулярно, а мовчки переписане ПРІЗВИЩЕ — це образа, яку людина
//    побачить уже під своїм коментарем. Показати і дати виправити чесніше, ніж
//    вгадати. Якщо провайдер колись дасть окремі поля (Facebook їх має) —
//    беремо їх, вони точніші за будь-який поділ.
//
// 3️⃣ **ДАТА — ТРИ СПИСКИ, А НЕ КАЛЕНДАР.** 🗣️ Вова: «щоб цю карусель вибору дати
//    народження було легко вибрати, а не гортати по місяцях там до 1994 року».
//    Він має рацію буквально: `input type="date"` на iPhone відкривається на
//    ПОТОЧНОМУ місяці, і до 1994-го це десятки гортань. Три списки — три тапи,
//    рік одразу списком. Так само зроблено в самому Facebook при реєстрації.
//
// ⚠️ І підпис, НАВІЩО дата. Раніше вона питалась без жодного пояснення — це
// найчастіша причина, чому люди не заповнюють такі поля: незрозуміло, хто і
// нащо це питає.
const MONTHS_UA = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
                   'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

// Розбір імені з метаданих провайдера. Окремі поля — якщо їх дали; інакше поділ
// по ПЕРШОМУ пробілу (усе після нього — прізвище, бо подвійні прізвища бувають,
// а подвійні імена в наших краях майже ні).
function splitProviderName(meta = {}) {
  const given  = String(meta.given_name || meta.first_name || '').trim();
  const family = String(meta.family_name || meta.last_name || '').trim();
  if (given || family) return { name: given, surname: family };
  const full = String(meta.full_name || meta.name || '').trim().replace(/\s+/g, ' ');
  if (!full) return { name: '', surname: '' };
  const i = full.indexOf(' ');
  return i < 0 ? { name: full, surname: '' }
               : { name: full.slice(0, i), surname: full.slice(i + 1) };
}

// Дата збирається лише з ТРЬОХ заповнених списків. Два з трьох — це не «майже
// дата», а недороблений вибір, і мовчки викидати його не можна: людина думає,
// що дату ввела.
// ⚠️ Перевіряємо ще й ІСНУВАННЯ дня: «31 лютого» три списки дозволяють набрати
// вільно, а база відхилила б такий рядок помилкою, якої людина не зрозуміє.
// 🔑 Стоїть на рівні модуля, а не всередині екрана, рівно щоб сторож міг це
// ВИКОНАТИ, а не грепнути: перевірка, яку не можна запустити, доводить лише те,
// що потрібний текст десь написаний.
function birthDateFrom(d, m, y) {
  if (!d && !m && !y) return { ok: true, value: null };            // не заповнювали — це нормально
  if (!d || !m || !y)  return { ok: false, error: 'Оберіть день, місяць і рік' };
  const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const dt = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(dt.getTime()) || dt.getUTCDate() !== Number(d))
    return { ok: false, error: 'Такої дати немає' };
  if (dt.getTime() > Date.now()) return { ok: false, error: 'Дата ще не настала' };
  return { ok: true, value: iso };
}

// ── Розділ Кабінету «Вхід в акаунт» (29.08) ──────────────────────
//
// 🔑 НАВІЩО ВІН ВЗАГАЛІ. Способів входу стало більше одного, і людина мусить
// бачити, ЧИМ саме вона заходить у цей акаунт — інакше при зміні телефона вона
// не знає, що натискати, і заводить другий акаунт замість того, щоб зайти в свій.
// Це найпоширеніший спосіб «загубити» акаунт у застосунках із кількома входами.
//
// 🛑 Показуємо ФАКТ, а не обіцянку: `identities` веде сам Supabase.
function loginSectionHtml() {
  const lm = loginMethods();
  const badge = (t) => `<span class="acc-cab-row-ic acc-lg-badge">${t}</span>`;
  const row = (ic, name, desc) => `
    <div class="acc-cab-row acc-cab-row--static">
      ${ic}
      <span class="acc-cab-row-body">
        <span class="acc-cab-row-name">${name}</span>
        <span class="acc-cab-row-desc">${desc}</span>
      </span>
    </div>`;
  return `
    <div class="acc-cab-sec acc-cab-sec--rows">
      <h3>Вхід в акаунт</h3>
      ${lm.google ? row(badge('G'), 'Google', 'Підключено') : ''}
      ${lm.facebook ? row(badge('f'), 'Facebook', 'Підключено') : ''}
      ${lm.email
        ? row(`<span class="acc-cab-row-ic">${ICONS.mail}</span>`, 'Пошта',
              `Код приходить на ${escapeHtml(lm.address)}`)
        : `
      <button class="acc-cab-row" type="button" id="cf-addmail">
        <span class="acc-cab-row-ic">${ICONS.mail}</span>
        <span class="acc-cab-row-body">
          <span class="acc-cab-row-name">Додати пошту для входу</span>
          <span class="acc-cab-row-desc">Щоб заходити ще й кодом на пошту — у цей самий акаунт</span>
        </span>
        <i>${ICONS.chevronRight}</i>
      </button>
      <div class="acc-lg-add" id="cf-addmail-box" hidden>
        <input class="acc-input" id="cf-addmail-email" type="email" inputmode="email" autocomplete="email"
               autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="адреса@пошта.com">
        <input class="acc-input acc-code" id="cf-addmail-code" type="text" inputmode="numeric"
               autocomplete="one-time-code" maxlength="${OTP_MAX}" placeholder="${'—'.repeat(OTP_LENGTH)}" hidden>
        <p class="acc-err" id="cf-addmail-err" hidden></p>
        <button class="acc-primary" type="button" id="cf-addmail-go">Надіслати код</button>
      </div>`}
    </div>`;
}

// Обробники розділу входу. Виділені окремо, бо розділ малюється не завжди:
// у людини з поштою кнопки «додати» немає взагалі.
//
// 🛑 ПОТІК ЖИВЕ ПРЯМО В КАБІНЕТІ, А НЕ В МОДАЛЦІ ЗВЕРХУ. Кабінет — це власна
// повноекранна панель, і вона сама ставить `modal-open` на `body`. Модалка
// поверх нього зняла б цей клас при своєму закритті — тобто прокрутка сторінки
// під кабінетом ожила б, а кабінет лишився б відкритим. Рівно той клас вади, на
// якому проєкт уже обпікався з замком прокрутки (HOT_RULES №9).
function attachLoginSection(cab) {
  const open = cab.querySelector('#cf-addmail');
  if (!open) return;                                  // пошта вже є — розділ статичний
  const box   = cab.querySelector('#cf-addmail-box');
  const email = cab.querySelector('#cf-addmail-email');
  const code  = cab.querySelector('#cf-addmail-code');
  const err   = cab.querySelector('#cf-addmail-err');
  const go    = cab.querySelector('#cf-addmail-go');
  let sent = '';                                      // адреса, на яку вже пішов код

  const showErr = (t) => { err.textContent = t || ''; err.hidden = !t; };
  open.addEventListener('click', () => {
    box.hidden = !box.hidden;
    if (!box.hidden) email.focus();
  });
  code.addEventListener('input', () => {
    const only = code.value.replace(/\D/g, '').slice(0, OTP_MAX);
    if (only !== code.value) code.value = only;
    showErr('');
  });

  go.addEventListener('click', async () => {
    showErr('');
    go.disabled = true;
    try {
      if (!sent) {
        const r = await addEmailLogin(email.value);
        if (!r.ok) { showErr(r.error); return; }
        sent = normalizeEmail(email.value);
        email.disabled = true;
        code.hidden = false;
        go.textContent = 'Підтвердити';
        showToast('Код надіслано на пошту', 2600);
        code.focus();
        return;
      }
      const r = await confirmEmailLogin(sent, code.value);
      if (!r.ok) { showErr(r.error); return; }
      box.hidden = true;
      showToast('Пошту привʼязано — тепер можна заходити й кодом', 3200);
      // Розділ перемальовується наступним відкриттям кабінету: сесія вже несе
      // нову адресу, тож рядок стане статичним сам, без окремої домальовки.
    } finally { go.disabled = false; }
  });
}

function openProfile() {
  const u = currentUser();
  if (!u) return;
  const guess = splitProviderName(u.user_metadata || {});
  const year  = new Date().getFullYear();
  // 🔑 Пошту питаємо ЛИШЕ якщо провайдер її не дав. Сьогодні такого не буває
  // (Google і вхід кодом дають адресу завжди), але Facebook віддає акаунт без
  // пошти регулярно — хто реєструвався там по номеру телефону. Гілка стоїть
  // наперед, щоб перший такий житель не впорався в порожнє місце.
  // 🛑 Ця адреса — КОНТАКТ, а не спосіб входу: вписане руками не доводить нічого.
  const needEmail = !u.email;

  const opts = (arr, val = '') => arr.map(o =>
    `<option value="${o.v}"${o.v === val ? ' selected' : ''}>${escapeHtml(o.t)}</option>`).join('');
  const days   = [{ v: '', t: 'День' }].concat(Array.from({ length: 31 }, (_, i) => ({ v: String(i + 1), t: String(i + 1) })));
  const months = [{ v: '', t: 'Місяць' }].concat(MONTHS_UA.map((m, i) => ({ v: String(i + 1), t: m })));
  const years  = [{ v: '', t: 'Рік' }].concat(Array.from({ length: 100 }, (_, i) => ({ v: String(year - i), t: String(year - i) })));

  const wrap = openModal(`
    <h2 class="acc-title">Раді вас бачити!</h2>
    <p class="acc-sub">Як вас підписувати в громаді?</p>
    <label class="acc-label" for="acc-name">Ім'я</label>
    <input class="acc-input" id="acc-name" type="text" autocomplete="given-name"
           placeholder="Ім'я" value="${escapeHtml(guess.name)}">
    <label class="acc-label" for="acc-surname">Прізвище</label>
    <input class="acc-input" id="acc-surname" type="text" autocomplete="family-name"
           placeholder="Прізвище" value="${escapeHtml(guess.surname)}">
    ${needEmail ? `
    <label class="acc-label" for="acc-email">Пошта для зв'язку</label>
    <input class="acc-input" id="acc-email" type="email" inputmode="email" autocomplete="email"
           autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="адреса@пошта.com">` : ''}
    <label class="acc-label">Дата народження <span class="acc-opt">— щоб привітати вас у ваш день</span></label>
    <div class="acc-dob">
      <select class="acc-input acc-select" id="acc-dd" aria-label="День">${opts(days)}</select>
      <select class="acc-input acc-select" id="acc-mm" aria-label="Місяць">${opts(months)}</select>
      <select class="acc-input acc-select" id="acc-yy" aria-label="Рік">${opts(years)}</select>
    </div>
    <p class="acc-err" hidden></p>
    <button class="acc-primary" type="button" id="acc-save">Зберегти</button>
    <button class="acc-skip" type="button" id="acc-later">Пізніше</button>`);

  const showErr = (t) => {
    const box = wrap.querySelector('.acc-err');
    box.textContent = t || ''; box.hidden = !t;
  };

  const readDate = () => birthDateFrom(
    wrap.querySelector('#acc-dd').value,
    wrap.querySelector('#acc-mm').value,
    wrap.querySelector('#acc-yy').value);

  const finish = async (withDate) => {
    const name    = wrap.querySelector('#acc-name').value.trim();
    const surname = wrap.querySelector('#acc-surname').value.trim();
    const fields  = { name, surname };
    if (withDate) {
      const d = readDate();
      if (!d.ok) { showErr(d.error); return; }
      fields.birth_date = d.value;
      if (needEmail) {
        const box = wrap.querySelector('#acc-email');
        const addr = normalizeEmail(box ? box.value : '');
        if (addr && !isValidEmail(addr)) { showErr('Перевір адресу пошти'); return; }
        if (addr) fields.email = addr;
      }
    }
    showErr('');
    const res = await saveProfile(fields);
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
  // 🗓 04.09 — ОКРЕМИЙ ВІД «СТРІЧКИ», і це не дрібниця. «Стрічка» — про НОВІ
  // дописи, тобто про шум, який людина може не хотіти. Нагадування про подію
  // вона попросила САМА, натиснувши «Нагадати». Змішати їх в одному вимикачі
  // означало б, що вимикаючи шум, вона мовчки втрачає те, що сама ввімкнула.
  // ⚠️ Підпис навмисно каже «які ви позначили» — щоб було видно, що це не
  // розсилка спільнот, а власний вибір.
  { k: 'events',    ic: ICONS.calendar, label: 'Події',
    hint: 'Нагадування про події, які ви позначили' },
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
  const повнеІмʼя = fullName(val.name, val.surname) || 'Житель';
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
          <div class="acc-cab-av" id="acc-hero-av">${avatarCircle({ name: повнеІмʼя, url: val.avatar_url, cls: 'acc-av' })}</div>
          <button class="acc-cab-avcam" type="button" id="acc-av-btn" aria-label="Змінити фото">${ICONS.photo}</button>
          <input type="file" id="acc-av-file" accept="image/*" hidden>
        </div>
        <div class="acc-cab-hi">
          <div class="acc-cab-name" id="acc-hero-name">${escapeHtml(повнеІмʼя)}</div>
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

      ${loginSectionHtml()}

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
    cab.querySelector('#acc-hero-name').textContent = fullName(fields.name, fields.surname) || 'Житель';
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

  attachLoginSection(cab);   // розділ «Вхід в акаунт» (привʼязка пошти)

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
    // Вийшли — забуваємо, кого питали: наступний вхід почнеться з чистого аркуша.
    if (!user) { _profileAskedFor = null; return; }
    if (_profileAskedFor === user.id) return;   // цю людину вже питали цього запуску
    _profileAskedFor = user.id;
    const profile = await getProfile();
    if (!profile) openProfile();   // перший вхід (рядка ще немає) → екран 2
  });
}
