// src/core/dev-lock.js
// ЗАСЛІНКА РОЗРОБКИ (dev lock — замок на час доробки).
//
// НАВІЩО (Вова 30.07): «сторінка буде заблюрена, закрита, буде писати що йдуть
// технічні розробки. Знизу буде поле, типу коду для розробника. Цей код я придумаю,
// і я буду його надавати тільки розрабам — щоб могли зайти тільки розраби.»
// Перша версія того ж дня пускала лише за поштою; ця додає ДРУГІ двері — код.
//
// ДВОЄ ДВЕРЕЙ, і це навмисно:
//   1. КОД для розробників — головний шлях. Вова придумує код і дає його руками.
//   2. ПОШТА власника (Google-вхід) — запасний шлях, щоб Вова не залежав від того,
//      чи згадав він код, і щоб не набирав його на телефоні щоразу.
// Обидва шляхи ведуть в одне: прапорець на пристрої, після якого замок більше не
// питає нічого (і працює без інтернету).
//
// ⚠️ ЧОГО ЦЯ ЗАСЛІНКА НЕ РОБИТЬ — сказано прямо, щоб на неї не покладались як на
// охорону. Сайт статичний (GitHub Pages), увесь код їде в браузер відвідувача. Тому:
//   • `data/*.json` лишається читабельним за прямою адресою — заслінка ховає
//     ДОДАТОК, а не дані;
//   • людина з інструментами розробника (devtools) обійде будь-яку клієнтську
//     перевірку — вона й так має весь код на руках;
//   • 🔴 КОРОТКИЙ КОД МОЖНА ПІДІБРАТИ. Хеш коду лежить у публічному `bundle.js`,
//     тож охочий переберe варіанти у себе на машині. Саме тому код проганяється
//     через PBKDF2 з 200 000 повторів (кожна спроба коштує часу, а не мікросекунди),
//     і саме тому код мусить бути ДОВГИМ і не словниковим. «1234» чи «cstl2026»
//     ламаються за хвилини навіть із PBKDF2; 12+ випадкових символів — ні.
// Закрити самі ДАНІ можна лише правилами RLS у Supabase. Це окрема робота.
// Чесна назва цього файлу: «додаток закритий для людей», не «дані засекречені».
//
// ЯК ЦЕ ПРАЦЮЄ
//   1. `DEV_LOCK = true` — один рубильник. Вова сказав «відкривай» → `false`,
//      і жодного іншого рядка міняти не треба.
//   2. У КОДІ ЛЕЖАТЬ ЛИШЕ ХЕШІ — і пошт, і коду. Репозиторій публічний: справжні
//      адреси й код у `bundle.js` побачив би будь-хто.
//   3. Після успішного входу — прапорець на пристрої (`localStorage`), інакше без
//      інтернету власний телефон замкнув би Вову назовні.
//      🔴 Прапорець ПАМʼЯТАЄ, ЯКИМИ дверима зайшли (`email` чи `code`). Це не
//      дрібниця: перевірка «а чи не забрали доступ» має сенс лише для пошти, і якби
//      вона діяла на всіх, то розробник, який зайшов кодом і залогінився своїм
//      Google-акаунтом, втратив би доступ у ту саму мить.
//   4. Заслінка ЗА ЗАМОВЧУВАННЯМ ЗАКРИТА: не вдалось перевірити — не пускаємо.
//   5. Підбір коду в самому застосунку гальмується: після 5 хибних спроб пауза
//      30с, далі вдвічі більше, до 5 хв. Від перебору в devtools це не рятує (див.
//      вище), але від «потикаю навмання» — так.
//
// ⚠️ ЧОМУ ЗАСЛІНКА НЕ ЧІПАЄ localhost/127.0.0.1: сенс замка — сховати ПУБЛІЧНИЙ
// деплой, а до локального сервера ніхто ззовні не дістанеться. Заразом це тримає
// стенди зеленими без «секретного обходу» в коді — а обхідний ключ був би справжньою
// дірою, бо жив би в `bundle.js` вічно.

import { currentUser, onAuthChange, signInWithGoogle, signOut } from './auth.js';
// Нормалізація і повільний хеш коду живуть окремо (`core/dev-code.js`) — той модуль
// нічого не імпортує, тому його підіймає живим і стенд, і інструмент підрахунку хешу.
// Тобто хеш рахує РІВНО той код, який його перевіряє.
import { normalizeDevCode, devCodeHash } from './dev-code.js';

// ── РУБИЛЬНИК ────────────────────────────────────────────────────────────────
export const DEV_LOCK = true;

// ── ДВЕРІ 1: КОД ДЛЯ РОЗРОБНИКІВ ─────────────────────────────────────────────
// Хеш PBKDF2-SHA256, 200 000 повторів, сіль нижче. Код нормалізується перед
// перевіркою: обрізаються краї, кілька пробілів схлопуються в один, регістр
// зводиться до нижнього (набирати на телефоні легше; за це «платимо» ентропією,
// тому код має бути довшим).
// 🔴 ПОРОЖНІЙ СПИСОК = двері «код» просто зачинені (пошта власника працює).
// Порахувати хеш свого коду — `node tests/tools/dev-code-hash.mjs 'мій-код'`.
// Той інструмент піднімає ЦЕЙ САМИЙ модуль `core/dev-code.js`, тому «порахували» і
// «перевіряємо» не можуть розійтись.
const ALLOWED_CODE_PBKDF2 = [
  // Код, який Вова видає розробникам (30.07). Регістр не має значення — нормалізація
  // зводить усе до нижнього, тож набирати можна як завгодно.
  // 🛑 САМ КОД ТУТ НЕ ПИШЕТЬСЯ. Ні в коментарі, ні поруч — інакше весь сенс хешування
  // зникає (репозиторій публічний). Цю помилку я вже зробив один раз у першій версії
  // цього рядка; сторож `tests/dev-lock.mjs` тепер її ловить механічно.
  // ⚠️ ЧЕСНО ПРО МІЦНІСТЬ чинного коду: він короткий і словниковий (9 символів після
  // нормалізації). Хеш лежить у публічному `bundle.js`, а словникові слова є в кожному
  // списку паролів — охочий із інструментами розробника відкриє його швидко. Для задачі
  // «щоб жителі не ходили по недоробленому» цього достатньо; Вові сказано прямо,
  // рішення його. Міцніше — заміна хеша одним рядком:
  //   node tests/tools/dev-code-hash.mjs 'новий-довгий-код'
  'd9c968e8a6c7813633ab2bf0f62ebd810a1fb8ccfded51717c318d5df59f8fb3',
];
// ⚠️ Сіль і кількість повторів PBKDF2 живуть у `core/dev-code.js` і ТІЛЬКИ там —
// друге значення тут завело б розходження, через яке хеш перестав би збігатись.

// ── ДВЕРІ 2: ПОШТА ВЛАСНИКА (хеші SHA-256, нижній регістр, без пробілів) ─────
// Порахувати: printf '%s' 'пошта@приклад.com' | shasum -a 256
const ALLOWED_EMAIL_SHA256 = [
  '432d8626c4bc43cfa9004246681f3260f0ebca8448313f225238670fd1b69379',   // головна пошта Вови
  '90507d9874c00f2208cbd84bb9391255f1e8ead2c1f6567b6ed8415eadeddece',   // другорядна пошта Вови
];

const DEVICE_KEY = 'cstl_dev_ok';       // 'email' | 'code' — ЯКИМИ дверима зайшли
const TRIES_KEY  = 'cstl_dev_tries';    // гальмо підбору: { n, until }
const TRIES_FREE = 5;                   // скільки спроб без паузи
const PAUSE_BASE = 30000;               // перша пауза, мс
const PAUSE_MAX  = 300000;              // стеля паузи, мс

let _gate = null;        // вузол заслінки в DOM
let _resolve = null;     // чим завершити очікування у passDevLock()

// Локальна розробка і стенди — замок вимкнений (див. пояснення в шапці файлу).
function isLocalHost() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

function hex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// SHA-256 у hex. `crypto.subtle` є лише в захищеному контексті (https або
// localhost) — якщо його немає, чесно віддаємо null і замок лишається.
async function sha256Hex(str) {
  if (!crypto || !crypto.subtle) return null;
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)));
}

// Повільний хеш коду (PBKDF2) і нормалізацію бере з `core/dev-code.js` —
// власної копії тут свідомо немає.
async function codeAllowed(raw) {
  if (!normalizeDevCode(raw) || !ALLOWED_CODE_PBKDF2.length) return false;
  const h = await devCodeHash(raw);
  return !!h && ALLOWED_CODE_PBKDF2.includes(h);
}

async function emailAllowed(email) {
  if (!email) return false;
  const h = await sha256Hex(String(email).trim().toLowerCase());
  return !!h && ALLOWED_EMAIL_SHA256.includes(h);
}

// ── Гальмо підбору ───────────────────────────────────────────────────────────
function triesState() {
  try { return JSON.parse(localStorage.getItem(TRIES_KEY) || '{}') || {}; } catch { return {}; }
}
function pauseLeft() {
  const { until } = triesState();
  return until && until > Date.now() ? Math.ceil((until - Date.now()) / 1000) : 0;
}
function noteWrongTry() {
  const st = triesState();
  const n = (st.n || 0) + 1;
  const over = n - TRIES_FREE;
  const until = over > 0 ? Date.now() + Math.min(PAUSE_BASE * Math.pow(2, over - 1), PAUSE_MAX) : 0;
  try { localStorage.setItem(TRIES_KEY, JSON.stringify({ n, until })); } catch (_) {}
  return pauseLeft();
}
function clearTries() { try { localStorage.removeItem(TRIES_KEY); } catch (_) {} }

// ── Заслінка (те, що бачить чужа людина) ─────────────────────────────────────
function buildGate() {
  const el = document.createElement('div');
  el.className = 'dev-lock';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  // Фон — заблюрене фото Олики з самого додатку (те саме, що в шапці Громади).
  // Свідомо НЕ справжній застосунок під блюром: щоб його розмити, його треба
  // спершу побудувати й завантажити дані — тоді «замок» став би лише картинкою,
  // яку прибирають одним рядком у devtools. Вигляд той самий, ціна нульова.
  el.innerHTML = `
    <div class="dev-lock-bg" aria-hidden="true"></div>
    <div class="dev-lock-in">
      <img class="dev-lock-logo" src="./logo.png" alt="">
      <div class="dev-lock-brand">CSTL LIFE</div>
      <h1 class="dev-lock-title">Йдуть технічні розробки</h1>
      <p class="dev-lock-text">Ми ще збираємо додаток для Олики.
        Скоро відкриємо для всіх — завітай трохи пізніше.</p>
      <form class="dev-lock-form" data-dl-form novalidate>
        <label class="dev-lock-label" for="dl-code">Код для розробників</label>
        <div class="dev-lock-row">
          <input class="dev-lock-input" id="dl-code" name="code" type="text"
                 inputmode="text" autocomplete="off" autocapitalize="off"
                 autocorrect="off" spellcheck="false" placeholder="Введіть код"
                 aria-describedby="dl-note">
          <button class="dev-lock-btn" type="submit" data-dl-submit>Увійти</button>
        </div>
      </form>
      <p class="dev-lock-note" id="dl-note" data-dl-note role="status" aria-live="polite" hidden></p>
      <button class="dev-lock-link" type="button" data-dl-login>Я власник — увійти через Google</button>
    </div>`;
  el.querySelector('[data-dl-login]').addEventListener('click', () => signInWithGoogle());
  el.querySelector('[data-dl-form]').addEventListener('submit', onSubmitCode);
  return el;
}

function note(text, kind) {
  if (!_gate) return;
  const n = _gate.querySelector('[data-dl-note]');
  if (!n) return;
  n.textContent = text || '';
  n.hidden = !text;
  n.classList.toggle('dev-lock-note--bad', kind === 'bad');
}

async function onSubmitCode(e) {
  e.preventDefault();
  if (!_gate) return;
  const input = _gate.querySelector('.dev-lock-input');
  const btn   = _gate.querySelector('[data-dl-submit]');
  const left  = pauseLeft();
  if (left) { note(`Занадто багато спроб. Спробуй через ${left} с.`, 'bad'); return; }
  if (!normalizeDevCode(input && input.value)) { note('Введи код.', 'bad'); return; }

  // PBKDF2 займає помітний час — інакше людина встигне натиснути тричі.
  if (btn) { btn.disabled = true; btn.textContent = 'Перевіряю…'; }
  note('');
  const okCode = await codeAllowed(input.value);
  if (btn) { btn.disabled = false; btn.textContent = 'Увійти'; }

  if (okCode) { clearTries(); unlock('code'); return; }
  const pause = noteWrongTry();
  note(pause ? `Код не той. Спробуй через ${pause} с.` : 'Код не той.', 'bad');
  if (_gate) _gate.querySelector('.dev-lock-in').classList.add('dev-lock-in--shake');
  setTimeout(() => {
    const box = _gate && _gate.querySelector('.dev-lock-in');
    if (box) box.classList.remove('dev-lock-in--shake');
  }, 420);
}

function showGate() {
  if (_gate) return;
  _gate = buildGate();
  document.body.appendChild(_gate);
  document.body.classList.add('dev-locked');
  // Заставку прибираємо самі: звичайне прибирання живе в кінці init() у app.js,
  // а ми туди не доходимо — інакше splash висів би поверх заслінки назавжди.
  const splash = document.getElementById('splash');
  if (splash) splash.remove();
}

function hideGate() {
  document.body.classList.remove('dev-locked');
  if (!_gate) return;
  _gate.remove();
  _gate = null;
}

// Єдиний вихід із заслінки: запамʼятати ЯКІ двері й пустити застосунок далі.
function unlock(door) {
  try { localStorage.setItem(DEVICE_KEY, door); } catch (_) {}
  hideGate();
  if (_resolve) { const r = _resolve; _resolve = null; r(true); }
}

// Пояснення для того, хто вже увійшов поштою, але доступу не має. Без цього людина
// тапала б «Увійти через Google» по колу і не розуміла, що вхід якраз відбувся.
function showEmailDenied(email) {
  if (!_gate) return;
  note(`${email} — ця пошта поки без доступу. Потрібен код розробника.`, 'bad');
  const btn = _gate.querySelector('[data-dl-login]');
  if (!btn) return;
  btn.textContent = 'Вийти з акаунта';
  btn.replaceWith(btn.cloneNode(true));                        // знімаємо старий слухач
  _gate.querySelector('[data-dl-login]').addEventListener('click', async () => {
    await signOut();
    location.reload();
  });
}

// ── Головна перевірка ────────────────────────────────────────────────────────
// true  → додаток можна будувати далі
// false → показана заслінка, застосунок НЕ будуємо
export async function passDevLock() {
  if (!DEV_LOCK || isLocalHost()) return true;

  const door = localStorage.getItem(DEVICE_KEY);
  if (door === 'code' || door === 'email' || door === '1') {   // '1' — прапорець першої версії
    // 🔴 Перевіряємо «а чи не забрали доступ» ЛИШЕ для тих, хто зайшов поштою.
    // Для дверей «код» цього робити не можна: розробник має право залогінитись
    // своїм Google-акаунтом, і його пошти в списку власника, звісно, немає.
    if (door !== 'code') {
      onAuthChange(async user => {
        if (!user) return;                                     // вийшов — прапорець лишаємо
        if (!(await emailAllowed(user.email))) localStorage.removeItem(DEVICE_KEY);
      });
    }
    return true;
  }

  // Хтось інший (або перший запуск на новому пристрої) — заслінка одразу,
  // ще до того як щось із застосунку намалюється.
  showGate();

  const check = async user => {
    const email = user && user.email;
    if (await emailAllowed(email)) { unlock('email'); return; }
    if (email) showEmailDenied(email);                         // увійшов, але не в списку
  };
  onAuthChange(check);
  check(currentUser());                                        // сесія могла відновитись раніше

  // Ніколи не завершуємо `false`-ом: поки доступу немає, застосунок просто не
  // будується, а заслінка лишається на екрані. Код або вхід відкриють її самі.
  return new Promise(resolve => { _resolve = resolve; });
}
