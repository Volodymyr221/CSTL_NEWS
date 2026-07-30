// src/core/dev-lock.js
// ЗАСЛІНКА РОЗРОБКИ (dev lock — замок на час доробки).
//
// НАВІЩО (Вова 30.07): «щоб коли інші користувачі відкривають додаток, їм вибивало
// що додаток знаходиться в процесі розробки. І він був доступний тільки мені —
// моїй головній пошті і моїй другорядній пошті. Щоб більше нікому не був доступний,
// поки я не скажу це зробити.»
//
// ⚠️ ЧОГО ЦЯ ЗАСЛІНКА НЕ РОБИТЬ — сказано прямо, щоб ніхто не покладався на неї як
// на охорону. Сайт статичний (GitHub Pages), увесь код їде в браузер відвідувача.
// Тому:
//   • `data/*.json` лишається читабельним за прямою адресою — заслінка ховає
//     ДОДАТОК, а не дані;
//   • людина з інструментами розробника (devtools) обійде будь-яку клієнтську
//     перевірку — вона й так уже має весь код на руках.
// Закрити самі ДАНІ можна лише правилами RLS у Supabase + перенесенням
// `articles.json` під захист. Це окрема робота, тут її немає.
// Тобто чесна назва цього файлу: «додаток закритий для людей», не «дані засекречені».
//
// ЯК ЦЕ ПРАЦЮЄ
//   1. `DEV_LOCK = true` — один рубильник. Вова сказав «відкривай» → ставимо `false`,
//      і жодного іншого рядка міняти не треба.
//   2. Пускаємо за поштою Google-акаунта (Supabase Auth). Саме за поштою, а не за
//      пристроєм: перевстановив додаток чи змінив телефон — доступ лишився.
//   3. 🔴 У КОДІ ЛЕЖАТЬ НЕ ПОШТИ, А ЇХНІ ХЕШІ (SHA-256 — односторонній відпечаток:
//      з пошти хеш порахувати можна, з хеша пошту — ні). Репозиторій публічний,
//      тож справжні адреси в `bundle.js` побачив би будь-хто. Хеш цього не дає.
//   4. Після першої успішної перевірки ставимо прапорець на пристрої
//      (`localStorage`) — інакше без інтернету власний телефон замкнув би Вову
//      назовні. Прапорець перевіряється заново при кожному вході в мережі.
//   5. Заслінка ЗА ЗАМОВЧУВАННЯМ ЗАКРИТА: не вдалось перевірити — не пускаємо.
//      Помилка мусить падати в бік замка, бо намір саме такий.
//
// ⚠️ ЧОМУ ЗАСЛІНКА НЕ ЧІПАЄ localhost/127.0.0.1: сенс замка — сховати ПУБЛІЧНИЙ
// деплой від чужих людей, а до локального сервера ніхто ззовні не дістанеться.
// Заразом це тримає стенди зеленими без жодного «секретного обходу» в коді —
// а обхідний ключ був би справжньою дірою, бо жив би у `bundle.js` вічно.

import { currentUser, onAuthChange, signInWithGoogle, signOut } from './auth.js';

// ── РУБИЛЬНИК ────────────────────────────────────────────────────────────────
export const DEV_LOCK = true;

// ── СПИСОК ДОПУЩЕНИХ (хеші SHA-256 від пошти в нижньому регістрі, без пробілів) ──
// 🔴 ПОРОЖНІЙ СПИСОК = НЕ ПУСКАЄ НІКОГО, включно з Вовою. Заповнити ПЕРЕД деплоєм.
// Порахувати хеш, не показуючи пошту нікому (у терміналі Mac):
//   printf '%s' 'пошта@приклад.com' | shasum -a 256
const ALLOWED_EMAIL_SHA256 = [
  '432d8626c4bc43cfa9004246681f3260f0ebca8448313f225238670fd1b69379',   // головна пошта Вови
  '90507d9874c00f2208cbd84bb9391255f1e8ead2c1f6567b6ed8415eadeddece',   // другорядна пошта Вови
];

const DEVICE_KEY = 'cstl_dev_ok';   // прапорець «цей пристрій уже підтверджено»

let _gate = null;        // вузол заслінки в DOM
let _resolve = null;     // чим завершити очікування у passDevLock()

// Локальна розробка і стенди — замок вимкнений (див. пояснення в шапці файлу).
function isLocalHost() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1';
}

// SHA-256 у hex. `crypto.subtle` є лише в захищеному контексті (https або
// localhost) — якщо його раптом немає, чесно віддаємо null і замок лишається.
async function sha256Hex(str) {
  if (!crypto || !crypto.subtle) return null;
  const bytes = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function emailAllowed(email) {
  if (!email) return false;
  const hash = await sha256Hex(String(email).trim().toLowerCase());
  if (!hash) return false;
  return ALLOWED_EMAIL_SHA256.includes(hash);
}

// ── Заслінка (те, що бачить чужа людина) ─────────────────────────────────────
function buildGate() {
  const el = document.createElement('div');
  el.className = 'dev-lock';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.innerHTML = `
    <div class="dev-lock-in">
      <img class="dev-lock-logo" src="logo.png" alt="">
      <div class="dev-lock-brand">CSTL LIFE</div>
      <h1 class="dev-lock-title">Додаток у розробці</h1>
      <p class="dev-lock-text">Ми ще збираємо CSTL LIFE для Олики.
        Скоро відкриємо для всіх — завітай трохи пізніше.</p>
      <div class="dev-lock-actions">
        <button class="dev-lock-btn" type="button" data-dl-login>Увійти</button>
      </div>
      <p class="dev-lock-note" data-dl-note hidden></p>
    </div>`;
  el.querySelector('[data-dl-login]').addEventListener('click', () => signInWithGoogle());
  return el;
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

// Пояснення для того, хто вже увійшов, але доступу не має. Без цього людина
// тапала б «Увійти» по колу і не розуміла, що вхід якраз відбувся.
function showDenied(email) {
  if (!_gate) return;
  const note = _gate.querySelector('[data-dl-note]');
  const btn  = _gate.querySelector('[data-dl-login]');
  if (note) {
    note.textContent = `${email} — ця пошта поки без доступу.`;
    note.hidden = false;
  }
  if (btn) {
    btn.textContent = 'Вийти';
    btn.replaceWith(btn.cloneNode(true));                     // знімаємо старий слухач
    _gate.querySelector('[data-dl-login]').addEventListener('click', async () => {
      await signOut();
      location.reload();
    });
  }
}

// ── Головна перевірка ────────────────────────────────────────────────────────
// true  → додаток можна будувати далі
// false → показана заслінка, застосунок НЕ будуємо
export async function passDevLock() {
  if (!DEV_LOCK || isLocalHost()) return true;

  // Пристрій уже підтверджений — пускаємо одразу (працює й без мережі).
  // Але перевіряємо ще раз, коли сесія відновиться: якщо доступ забрали,
  // прапорець знімаємо і наступне відкриття буде вже під замком.
  if (localStorage.getItem(DEVICE_KEY) === '1') {
    onAuthChange(async user => {
      if (!user) return;                                       // вийшов — прапорець лишаємо
      if (!(await emailAllowed(user.email))) localStorage.removeItem(DEVICE_KEY);
    });
    return true;
  }

  // Хтось інший (або перший запуск на новому пристрої) — заслінка одразу,
  // ще до того як щось із застосунку намалюється.
  showGate();

  const check = async user => {
    const email = user && user.email;
    if (await emailAllowed(email)) {
      localStorage.setItem(DEVICE_KEY, '1');
      hideGate();
      if (_resolve) { const r = _resolve; _resolve = null; r(true); }
      return;
    }
    if (email) showDenied(email);                              // увійшов, але не в списку
  };

  onAuthChange(check);
  check(currentUser());                                        // сесія могла відновитись раніше

  // Ніколи не завершуємо `false`-ом: поки доступу немає, застосунок просто не
  // будується, а заслінка лишається на екрані. Вхід відкриє її через onAuthChange.
  return new Promise(resolve => { _resolve = resolve; });
}
