// src/core/auth.js
// Авторизація жителя через Google (Supabase Auth) — Фаза Б.
// Це ЄДИНА «особистість» додатку: currentUserId() використовується скрізь
// (приватний чат, реакції/коментарі з власником, гейтинг дій) замість анонімних id.
//
// UI входу (екран «Приєднайтесь», Кабінет) — окремий шар, будується пізніше.
// Тут — лише логіка: вхід/вихід, поточний користувач, гейтинг, профіль.
//
// Етап 2: гейтинг увімкнено в діях (подача оголошення, реакції, коментарі,
// трек автобуса). requireAuth() для гостя показує тост + подію cstl-need-login.

import { getSupabase, sdkLoaded, netErrorText, netCall, releasePushDevice, setAnalyticsUid } from './supabase.js';
import { showToast } from './utils.js';

let _user = null;        // поточний користувач (або null якщо гість)
let _profileName = null; // кеш імені з профілю (для підпису коментарів) — без зайвих запитів
let _profileAvatar = null; // кеш URL аватара (Потік 12) — для мініатюри в шапці синхронно
const _listeners = [];   // підписники на зміну стану входу

export function currentUser()   { return _user; }
export function currentUserId() { return _user ? _user.id : null; }
export function isLoggedIn()     { return !!_user; }
// URL аватара поточного користувача (з кешу профілю) або '' якщо фото нема
export function currentAvatarUrl() { return _profileAvatar || ''; }

// Ім'я для відображення (коментарі тощо): профіль → Google-метадані → дефолт.
// Синхронно (без запиту в БД): кеш _profileName заповнюється у getProfile/saveProfile.
export function currentUserName() {
  if (_profileName) return _profileName;
  const m = _user && _user.user_metadata;
  return (m && (m.name || m.full_name)) || 'Житель';
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 «ХТО Я» — ФАКТ, А НЕ ПЕРЕГОНИ (25.08.2026)
//
// СКАРГИ ВОВИ, ЯКІ ВИЯВИЛИСЬ ОДНІЄЮ ВАДОЮ: у Стрічці не підсвічувався ЙОГО лайк ·
// зникало меню «⋯» на його ж спільнотах · зникав вибір «відповідати як спільнота».
// Дослівно: «я заходжу і я лайкав цей другий пост, але чомусь лайк мій не
// висвітлюється… ходжу по вкладках, повертаюся — і тоді вже підтягується».
//
// 🔑 ПРИЧИНА ОДНА, І ВОНА АРХІТЕКТУРНА: `initAuth()` кличеться без `await`, тобто
// відновлення сесії йде своїм ходом, а вкладки тим часом уже читають дані. Хто
// встиг раніше — той і виграв. `currentUserId()` тоді ще `null`, і застосунок
// чесно малює вигляд ГОСТЯ для залогіненої людини.
//
// 🛑 ЧОМУ ПІДПИСКИ НА ЗМІНУ ВХОДУ ЗАМАЛО. Вона лікує ПІСЛЯ ФАКТУ: спершу малюємо
// чуже, потім перемальовуємо своє. Людина встигає побачити неправду — власне це
// Вова й бачив. Додавати третього «лікаря» означало б латку на латці.
//
// ➡️ ТОМУ ГАРАНТІЯ ЖИВЕ ТУТ, В ОДНОМУ МІСЦІ: `authReady()` завершується, коли
// питання «хто я» вже має відповідь — байдуже яку (людина, гість або збій).
// Споживач чекає її РАЗ, до першого читання даних, і далі працює з фактом.
//
// ⚠️ МЕЖА ЧАСУ ОБОВʼЯЗКОВА. Без неї один завислий мережевий виклик заморозив би
// вкладку назавжди — рівно те, чим у цьому проєкті вже обпікались на
// `serviceWorker.ready` (він не падає, він ВИСНЕ). Краще показати вигляд гостя і
// виправитись через `onAuthChange`, ніж не показати нічого.
// 🔑 Саме тому обидва механізми лишаються і НЕ дублюють один одного:
//   authReady()    — щоб ПЕРШИЙ показ був правдивий (прибирає перегони);
//   onAuthChange() — щоб показ лишався правдивим, коли вхід реально змінився
//                    (людина увійшла або вийшла посеред сесії).
let _authSettled = false;
let _settle = null;
const _authReady = new Promise(r => { _settle = r; });

function settleAuth() {
  if (_authSettled) return;
  _authSettled = true;
  _settle();
}

export function authReady(timeoutMs = 2500) {
  if (_authSettled) return Promise.resolve();
  return Promise.race([
    _authReady,
    new Promise(r => setTimeout(r, timeoutMs)),
  ]);
}

// Підписка на зміну стану входу (повертає функцію відписки)
export function onAuthChange(cb) {
  _listeners.push(cb);
  return () => { const i = _listeners.indexOf(cb); if (i >= 0) _listeners.splice(i, 1); };
}
function emitAuthChange() {
  _listeners.forEach(cb => { try { cb(_user); } catch (_) {} });
}

// Прогрів профілю: тягне ім'я з таблиці profiles ОДРАЗУ при старті/вході,
// а не лише при відкритті кабінету. Без цього вітання «Добридень, Романе»
// не працювало до першого відкриття кабінету (баг, знайдений Ромою 08.07).
async function warmProfile() {
  if (!_user || _profileName) return;
  try {
    await getProfile();                    // заповнює кеш _profileName
    if (_profileName) emitAuthChange();    // → updateGreetingName() у Громаді
  } catch (_) { /* fail-soft: лишиться імʼя з Google/дефолт */ }
}

// 🔴 07.08 — ПЕРЕЧИТАТИ ВЛАСНИЙ ПРОФІЛЬ (потік «Живе оновлення публічних даних»).
//
// `warmProfile()` виходить одразу, якщо `_profileName` уже є (рядок 47) — для
// старту це правильно, але означає, що ВЛАСНЕ імʼя і фото теж заморожені на всю
// сесію. Змінив імʼя з іншого пристрою — на цьому вітання «Добридень, …»
// лишалось старим до повного перезапуску. Та сама хвороба, що з чужими
// профілями, тільки в іншому кеші; Вова просив закрити «комплексно» — закриваємо
// обидва.
//
// ⚠️ `onAuthChange` шлемо ЛИШЕ коли щось справді змінилось: на цю подію
// підписані перемальовки (привітання Громади, шапка), і смикати їх на кожне
// повернення на вкладку означало б рухати екран без причини.
export async function refreshOwnProfile() {
  if (!_user) return;
  const булоІмʼя = _profileName, булоФото = _profileAvatar;
  try { await getProfile(); } catch (_) { return; }   // fail-soft: лишається як було
  if (булоІмʼя !== _profileName || булоФото !== _profileAvatar) emitAuthChange();
}

// Ініціалізація при старті: відновити збережену сесію + слухати зміни.
// Безпечно за відсутності сесії (гість) — _user лишається null.
export async function initAuth() {
  const supa = getSupabase();
  // Бази немає взагалі (офлайн-збірка, впав скрипт) — питання «хто я» вже має
  // відповідь: гість. Не завершити гарантію тут означало б тримати вкладки на
  // межі часу дарма.
  if (!supa) { settleAuth(); return; }
  try {
    const { data } = await supa.auth.getSession();
    _user = data && data.session ? data.session.user : null;
    setAnalyticsUid(_user ? _user.id : null);   // діагностика має знати, у кого зламалось
    emitAuthChange();
    warmProfile();
  } catch (e) { console.warn('[auth] getSession:', e && e.message); }
  // 🔴 ЗАВЕРШУЄМО ГАРАНТІЮ І НА ЗБОЇ ТЕЖ — саме тому цей рядок стоїть ПІСЛЯ `catch`,
  // а не всередині `try`. «Не змогли дізнатись» — це теж відповідь на «хто я»
  // (гість), і чекати на неї далі нема сенсу. Якби рядок був у `try`, будь-яка
  // помилка мережі підвісила б кожного, хто чекає, аж до межі часу.
  settleAuth();
  supa.auth.onAuthStateChange((_event, session) => {
    _user = session ? session.user : null;
    setAnalyticsUid(_user ? _user.id : null);
    emitAuthChange();
    warmProfile();
  });
}

// 🔴 26.08 — ДВІ РІЗНІ ПРИЧИНИ ПЕРЕСТАЛИ ГОВОРИТИ ОДНИМИ СЛОВАМИ.
// 🗣️ Вова зі скріна: «Немає звʼязку з сервером» у Safari — при живому інтернеті,
// бо новини на тому ж екрані завантажились.
// 🛑 Тост брехав не навмисно: він казав про мережу, а бракувало ФАЙЛУ бібліотеки.
// Людина після такого шукає проблему в звʼязку і не знаходить — бо її там немає.
// 🔑 Той самий клас, що з журналом збоїв: «не сталося» і «сталося, але ми не
// побачили» мусять бути РІЗНІ повідомлення.
//
// 🔑 29.08 — ВИНЕСЕНО В ОДНЕ МІСЦЕ, бо способів входу стало три (Google, надсилання
// коду, звірка коду). Три копії цього блоку розійшлися б при першій же правці —
// рівно те, чим уже обпікались на словниках помилок (див. `netErrorText`).
// ⚠️ Повертає `null` і САМА показує пояснення: викликач лише виходить.
function supaForAuth() {
  const supa = getSupabase();
  if (supa) return supa;
  showToast(sdkLoaded()
    ? 'Сервер недоступний. Спробуй ще раз за хвилину'
    : 'Не завантажилась частина застосунку. Онови сторінку',
    4000, 'error');
  return null;
}

// Вхід через Google. Після редіректу назад Supabase сам підхопить сесію
// (detectSessionInUrl) і onAuthStateChange оновить _user.
export async function signInWithGoogle() {
  const supa = supaForAuth();
  if (!supa) return;
  const redirectTo = window.location.origin + window.location.pathname;
  // 🔴 24.08 — `prompt: 'select_account'`: ГОOGLE ЗАВЖДИ ПИТАЄ, ЯКИМ АКАУНТОМ ЗАЙТИ.
  //
  // Скарга Вови: «чому я ніколи не натискаю авторизуватися — мене зразу закидає
  // через пошту, якою я авторизовувався останній раз? Чому я не можу вибрати?»
  //
  // 🔑 Це не була наша поломка — це стандартна поведінка Google: коли в браузері
  // рівно ОДНА активна Google-сесія, він пропускає екран вибору і мовчки логінить
  // нею. Список показується лише якщо сесій кілька або жодної. Тобто перемкнути
  // акаунт можна було тільки вийшовши з Google у самому браузері — а Вова веде
  // проєкт із двох акаунтів і робить це постійно.
  //
  // ⚠️ Ціна рішення названа чесно: для жителя з одним акаунтом це +1 екран при
  // кожному вході. Прийнято свідомо — «Увійти з Google» без питання, ЯКИМ саме,
  // це рівно той клас поведінки, коли застосунок вирішує за людину мовчки.
  const { error } = await supa.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, queryParams: { prompt: 'select_account' } },
  });
  // Сира помилка входу («Load failed» тощо) людині нічого не пояснює — через словник.
  if (error) showToast(netErrorText(error), 4000, 'error');
}

// ═══════════════════════════════════════════════════════════════════════════
// 📘 ВХІД ЧЕРЕЗ FACEBOOK (29.08.2026) — КОД ГОТОВИЙ, ВИМИКАЧ ВИМКНЕНИЙ
//
// 🗣️ Вова: «в нас люди, більшість населення, сидить в Facebook… якщо упростити
// процес входу за допомогою Facebook, це б спростило для них процес реєстрації».
//
// 🔴 ЧОМУ ВИМИКАЧ, А НЕ ПРОСТО КНОПКА. Поки додаток у Meta не переведений у
// режим Live, Facebook пускає ЛИШЕ адміністраторів і тестувальників того додатка.
// Для жителя кнопка означала б помилку Facebook на весь екран — тобто кнопка,
// яка не працює. 🛑 «Декоративного в нас нічого не має бути, у нас все має бути
// робоче» (Вова, 24.08) — тому кнопки просто немає, поки немає дозволу.
//
// ➡️ ЩО ЗРОБИТИ, ЩОБ УВІМКНУТИ (по кроках — `docs/AUTH_EMAIL_SETUP.md`):
//   1. створити додаток у Meta for Developers, додати продукт Facebook Login;
//   2. вставити App ID і App Secret у Supabase → Authentication → Providers → Facebook;
//   3. перевести додаток Meta в Live (там Meta й попросить верифікацію);
//   4. поставити тут `true` — і кнопка зʼявиться.
//
// ⚠️ І ГОЛОВНЕ ПРО ДАНІ: Facebook ЧАСТО не віддає пошту (акаунт, заведений на
// номер телефону, або людина зняла галочку). Саме тому анкета вміє питати адресу
// окремо — див. `needEmail` в `account-ui.js`.
export const FACEBOOK_ENABLED = false;

export async function signInWithFacebook() {
  const supa = supaForAuth();
  if (!supa) return;
  const redirectTo = window.location.origin + window.location.pathname;
  // `public_profile,email` — це стандартний доступ, окремого дозволу Meta на нього
  // не треба. Пошта тут — прохання, а не гарантія: див. попередження вище.
  const { error } = await supa.auth.signInWithOAuth({
    provider: 'facebook',
    options: { redirectTo, scopes: 'public_profile,email' },
  });
  if (error) showToast(netErrorText(error), 4000, 'error');
}

// Якими способами людина може зайти в ЦЕЙ акаунт. Читається з живої сесії:
// `identities` веде сам Supabase, тож це факт, а не наше припущення.
// 🔑 Пошта рахується від `user.email`, а не від наявності identity: саме вона
// приймає код при вході, і саме її людина впізнає.
export function loginMethods() {
  const ids = (_user && Array.isArray(_user.identities)) ? _user.identities.map(i => i.provider) : [];
  return {
    google:   ids.includes('google'),
    facebook: ids.includes('facebook'),
    email:    !!(_user && _user.email),
    address:  (_user && _user.email) || '',
  };
}

// ── Додати пошту як спосіб входу (для акаунта, який зайшов без неї) ──────────
//
// 🗣️ Вова: «якщо користувач в особистому кабінеті вказав свою пошту і хоче зайти
// через пошту, воно також буде заходити на той самий акаунт. Суть однакова: це
// одна і та сама людина, один і той самий акаунт».
//
// ✅ Мета правильна — і саме так це й робиться. 🛑 Але звʼязує тільки
// ПІДТВЕРДЖЕНА адреса, і тому крок із кодом тут обовʼязковий. Інакше я вписую в
// СВОЄМУ профілі чужу адресу — і забираю чужий акаунт разом з оголошеннями,
// чатами й правами. Один код один раз закриває це повністю.
//
// 📐 Заміряно на живій базі 29.08: два акаунти вже мають ДВІ особистості
// (`email` + `google`) при ОДНІЙ адресі — тобто Supabase зводить їх в один
// акаунт сам, щойно адреса підтверджена. Ми лише даємо цій адресі зʼявитись.
export async function addEmailLogin(email) {
  const supa = supaForAuth();
  if (!supa) return { ok: false, error: 'Сервер недоступний' };
  const addr = normalizeEmail(email);
  if (!isValidEmail(addr)) return { ok: false, error: 'Перевір адресу пошти' };
  const { error } = await supa.auth.updateUser({ email: addr });
  if (error) {
    console.warn('[auth] addEmailLogin:', error.message);
    return { ok: false, error: netErrorText(error) };
  }
  return { ok: true };
}

// ⚠️ Тип тут `email_change`, а НЕ `email`: Supabase шле цей код іншим шаблоном і
// звіряє його іншим типом. З типом `email` код не підійшов би НІКОЛИ — і
// виглядало б це як «код невірний», хоча код правильний.
export async function confirmEmailLogin(email, code) {
  const supa = supaForAuth();
  if (!supa) return { ok: false, error: 'Сервер недоступний' };
  const token = String(code || '').replace(/\D/g, '');
  if (token.length < 6) return { ok: false, error: 'Код складається з 6 цифр' };
  const { error } = await supa.auth.verifyOtp({ email: normalizeEmail(email), token, type: 'email_change' });
  if (error) {
    console.warn('[auth] confirmEmailLogin:', error.message);
    return { ok: false, error: netErrorText(error) };
  }
  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════
// ✉️ ВХІД ПОШТОЮ ОДНОРАЗОВИМ КОДОМ (29.08.2026)
//
// 🗣️ ЗАМОВЛЕННЯ ВОВИ: «якщо в людини немає Gmail, вона є якась інша пошта…
// треба добавити ще через іншу пошту, щоб просто людина могла зайти».
//
// 🔑 ЧОМУ КОД, А НЕ ПРОСТО ПОЛЕ «ВВЕДІТЬ ПОШТУ». Вхід через Google — це Google
// каже нам «це точно вона, я перевірив». За адресою, вписаною руками, не ручається
// НІХТО: без доказу будь-хто вводить ЧУЖУ пошту і опиняється в чужому акаунті.
// Код у скриньку і є той доказ — єдиний, який ми можемо отримати самі.
//
// 🛑 ЧОМУ КОД, А НЕ ПОСИЛАННЯ З ЛИСТА (magic link). Застосунок у людини стоїть як
// PWA на головному екрані. Лист відкриється в браузері — і сесія опиниться В
// БРАУЗЕРІ, а у ВСТАНОВЛЕНОМУ додатку людина так і лишиться гостем, не розуміючи
// чому. Код вона переписує в тому самому екрані, де стоїть, і сесія лягає туди,
// де людина її чекає. `emailRedirectTo` лишаємо лише як запасний шлях для того,
// хто все-таки тапне посилання.
//
// ⚠️ ПАРОЛЯ НЕМАЄ НАВМИСНО. Пароль для нашої аудиторії — це «забув пароль»,
// «відновіть пароль» і врешті чужий папірець біля телефона. Код вводиться РАЗ НА
// ПРИСТРІЙ: далі сесію тримає Supabase (той самий refresh token, що й для Google),
// тож людина побачить його один раз, а не щоразу.
//
// 🔴 ЩО ПОТРІБНО В ПАНЕЛІ SUPABASE, ІНАКШЕ ПРИЙДЕ ПОСИЛАННЯ ЗАМІСТЬ КОДУ:
// у шаблонах листів (Authentication → Emails) «Magic Link» І «Confirm signup»
// мусять містити `{{ .Token }}`. Код генерується завжди — питання лише в тому, чи
// показує його лист. Повна інструкція — `docs/AUTH_EMAIL_SETUP.md`.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Нормалізація адреси в одному місці: обрізаємо пробіли (їх додає автопідстановка
// на iOS) і зводимо до нижнього регістру — інакше «Ivan@Mail.com» і «ivan@mail.com»
// виглядали б для людини однаково, а для бази це два різні акаунти.
export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}
export function isValidEmail(email) {
  return EMAIL_RE.test(normalizeEmail(email));
}

// Крок 1: надіслати код на пошту. shouldCreateUser: true — саме заради цього все
// й робиться: людина без Google має завести акаунт тут-таки, а не «зареєструйтесь
// деінде спочатку».
export async function sendEmailCode(email) {
  const supa = supaForAuth();
  if (!supa) return { ok: false, error: 'Сервер недоступний' };
  const addr = normalizeEmail(email);
  if (!isValidEmail(addr)) return { ok: false, error: 'Перевір адресу пошти' };
  const emailRedirectTo = window.location.origin + window.location.pathname;
  const { error } = await supa.auth.signInWithOtp({
    email: addr,
    options: { shouldCreateUser: true, emailRedirectTo },
  });
  if (error) {
    console.warn('[auth] sendEmailCode:', error.message);
    return { ok: false, error: netErrorText(error) };
  }
  return { ok: true };
}

// Крок 2: звірити код. Успіх → Supabase кладе сесію, `onAuthStateChange` (він уже
// підписаний в `initAuth`) сам оновить `_user` і розішле подію — тобто далі все
// працює тим самим шляхом, що й після Google. Окремого «увійти» тут не треба.
//
// 🔑 `type: 'email'` — саме той тип, яким звіряється код, надісланий `signInWithOtp`.
// 🔴 30.08 — ОДИН КОД, АЛЕ ДВА РІЗНІ ТИПИ. НАЙДОРОЖЧА ВАДА ЦЬОГО ПОТОКУ.
//
// 🗣️ Вова: «досі пише невірний код» — на свіжому коді, зі свіжого листа.
//
// 📐 ЩО ПОКАЗАЛА БАЗА (клієнт цього не бачить у принципі):
//     select token_type from auth.one_time_tokens → **recovery_token**
// А ми звіряли `type: 'email'`. Тип не збігся — і збіг НЕ МІГ статися ніколи.
//
// 🔑 ПРИЧИНА, І ВОНА НЕ ОЧЕВИДНА: Supabase кладе код у РІЗНІ комірки залежно від
// того, чи людина вже є в базі.
//   • акаунта ще немає → це підтвердження реєстрації → тип `email`;
//   • акаунт УЖЕ Є (у Вови він є через Google) → це magic-link → `magiclink`.
// Тобто мій `type: 'email'` працював би лише для НОВИХ людей, а для всіх, хто вже
// заходив, — не працював би ЖОДНОГО разу.
//
// 🛑 І найгірше в цій ваді: назовні вона виглядає як «людина ввела не той код».
// Помилка сервера дослівно та сама, що на протермінований код. Тобто застосунок
// знову звинувачував людину в тому, що зробив сам — третій раз за добу той самий
// клас (B-33). Побачити різницю можна було ЛИШЕ зазирнувши в `auth.one_time_tokens`.
//
// ➡️ КЛІЄНТ НЕ ЗНАЄ, чи людина нова: `signInWithOtp` цього не повідомляє. Тому
// пробуємо типи по черзі. ⚠️ Невдала спроба код НЕ споживає — сервер просто не
// знаходить збігу під тим типом, тож перебір безпечний для одноразового коду.
const OTP_TYPES = ['email', 'magiclink', 'signup'];

export async function verifyEmailCode(email, code) {
  const supa = supaForAuth();
  if (!supa) return { ok: false, error: 'Сервер недоступний' };
  const token = String(code || '').replace(/\D/g, '');   // людина вставляє код із пробілами
  if (token.length < 6) return { ok: false, error: 'Код складається з 6 цифр' };
  const addr = normalizeEmail(email);
  let last = null;
  for (const type of OTP_TYPES) {
    const { error } = await supa.auth.verifyOtp({ email: addr, token, type });
    if (!error) return { ok: true };
    last = error;
    // 🔑 Далі пробуємо ТІЛЬКИ якщо сервер сказав «не знайшов такого коду». Мережа
    // впала, ліміт, збій — це не «спробуй інший тип», і перебирати їх означало б
    // тричі повторити той самий провал і втроє довше тримати людину на екрані.
    if (!/token has expired or is invalid/i.test(String(error.message || ''))) break;
  }
  console.warn('[auth] verifyEmailCode:', last && last.message);
  return { ok: false, error: netErrorText(last) };
}

// 🔴 24.08 — ВИХІД ТЕПЕР ВІДВʼЯЗУЄ ПРИСТРІЙ ВІД АКАУНТА.
// Було: чистились лише памʼять і сесія Supabase, про базу тут не було жодного
// рядка. Наслідок Вова знайшов на проді: вийшов з «Олександра», зайшов
// «Володимиром» — а push і далі приходили на попередній акаунт. Заміряно: один
// endpoint під двома акаунтами одночасно.
// 🛑 Це не незручність, а витік — у тілі push лежить текст повідомлення.
//
// 🔑 ПОРЯДОК ТУТ НЕСУЧИЙ: спершу віддаємо пристрій, ПОТІМ виходимо. Після
// `auth.signOut()` токена вже немає, і RLS не пустить видалити навіть власний
// рядок — прибирання просто мовчки не відбулось би.
// ⚠️ Вихід має відбутись НАВІТЬ якщо мережі немає: помилка відвʼязування не
// зупиняє `signOut`. Другий рубіж на цей випадок стоїть у базі —
// `claim_push_device` забирає чужі рядки при наступному вході.
// 🔴 `getRegistration()`, А НЕ `ready` — І ЦЕ НЕ ПРИДИРКА ДО API.
// `navigator.serviceWorker.ready` означає «чекай, доки Service Worker стане
// активним», і якщо його немає, обіцянка НЕ ВИКОНУЄТЬСЯ НІКОЛИ: не
// відхиляється, а мовчки висить вічно. Перша редакція цього фікса саме так і
// вішала `signOut()` — людина тисне «Вийти», і не стається НІЧОГО.
// 🔑 Спіймав стенд `legal-privacy.mjs` («після видалення кабінет закривається»),
// і це НЕ тестовий випадок: так само поводиться перше відкриття до активації SW,
// приватний режим і будь-який збій реєстрації.
// 🛑 Другою спробою була стеля очікування 1.5с — вона теж хибна, тільки тихіше:
// півтори секунди на незмінному екрані після «Вийти» людина читає як «не
// спрацювало». `getRegistration()` відповідає ОДРАЗУ (undefined, якщо SW немає),
// тож ніякої штучної паузи не потрібно взагалі.
async function detachThisDevice() {
  try {
    if (!_user || !('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;                       // SW немає — відвʼязувати нічого
    const sub = await reg.pushManager.getSubscription();
    if (sub?.endpoint) await releasePushDevice(_user.id, sub.endpoint);
  } catch (e) {
    console.warn('[auth] detachThisDevice:', e && e.message);
  }
}

export async function signOut() {
  const supa = getSupabase();
  if (!supa) return;
  await detachThisDevice();
  await supa.auth.signOut();
  _user = null;
  setAnalyticsUid(null);
  _profileName = null;
  _profileAvatar = null;
  emitAuthChange();
}

// Єдина точка гейтингу (gating — обмеження дії для гостя).
// Залогінений → виконує дію. Гість → м'яко просить увійти + подія для UI-шару.
// Етап 2: підключено до дій (подача оголошення, реакції, коментарі, трек автобуса).
export function requireAuth(actionLabel, fn) {
  if (isLoggedIn()) { fn(); return true; }
  showToast('Щоб ' + actionLabel + ', увійдіть', 3500);
  document.dispatchEvent(new CustomEvent('cstl-need-login', { detail: { actionLabel } }));
  return false;
}

// ── Профіль жителя (таблиця profiles) ──
export async function getProfile() {
  const supa = getSupabase();
  if (!supa || !_user) return null;
  const { data, error } = await supa.from('profiles').select('*').eq('uid', _user.id).maybeSingle();
  if (error) { console.warn('[auth] getProfile:', error.message); return null; }
  if (data && data.name) _profileName = data.name;   // кеш для currentUserName()
  if (data && 'avatar_url' in data) _profileAvatar = data.avatar_url || null;   // кеш аватара
  return data;
}
// Приймає будь-які поля анкети. Стійкий до відсутніх колонок: якщо міграція
// розширених полів ще не застосована — зберігає хоча б ім'я+дату (fallback).
const PROFILE_FIELDS = ['name', 'birth_date', 'surname', 'phone', 'settlement', 'street', 'bio', 'avatar_url'];
export async function saveProfile(fields = {}) {
  const supa = getSupabase();
  if (!supa || !_user) return { ok: false, error: 'не залогінено' };
  // 🔴 29.08 — ПОШТА АКАУНТА ЛИШАЄТЬСЯ ДЖЕРЕЛОМ ПРАВДИ, ПОКИ ВОНА Є.
  // Вписана в анкеті адреса береться ЛИШЕ тоді, коли провайдер не дав жодної —
  // цей випадок приносить Facebook (акаунт, заведений на номер телефону).
  // 🛑 І вона лишається КОНТАКТОМ, а не способом увійти: адреса, вписана руками,
  // не доводить нічого. Вважати її «тим самим акаунтом» означало б віддати чужий
  // акаунт кожному, хто вгадає адресу. Звʼязує лише ПІДТВЕРДЖЕНА пошта —
  // тобто окремий вхід кодом, а не це поле.
  // 🔑 `email` навмисно НЕ в `PROFILE_FIELDS`: інакше цикл нижче перезаписав би
  // справжню пошту акаунта тим, що лежить у формі.
  const accountEmail = _user.email || (fields.email ? normalizeEmail(fields.email) : null);
  const row = { uid: _user.id, email: accountEmail };
  for (const k of PROFILE_FIELDS) if (k in fields) row[k] = fields[k] === '' ? null : fields[k];
  let partial = false;
  // Через ядро: анкета — це upsert по uid, тобто повтор при обриві дає той самий рядок.
  // Текст помилки людський (netErrorText), сирий — лише в консоль.
  let r = await netCall(() => supa.from('profiles').upsert(row, { onConflict: 'uid' }));
  let error = r.ok ? null : r.rawError;
  if (error && /column|schema/i.test(error.message || '')) {
    // Розширені колонки ще не додані (міграція profiles_extended не застосована) —
    // зберігаємо базове, щоб ім'я не губилось, і ЧЕСНО повертаємо partial:
    // раніше тут мовчки губилися село/прізвище/телефон із тостом «збережено».
    partial = true;
    const core = { uid: _user.id, email: accountEmail,
                   name: row.name ?? null, birth_date: row.birth_date ?? null };
    r = await netCall(() => supa.from('profiles').upsert(core, { onConflict: 'uid' }));
    error = r.ok ? null : r.rawError;
  }
  if (error) return { ok: false, error: r.error };   // r.error — уже людський текст
  if (row.name) _profileName = row.name;   // кеш для currentUserName()
  if (!partial && 'avatar_url' in row) _profileAvatar = row.avatar_url || null;   // кеш аватара
  return { ok: true, partial };
}
