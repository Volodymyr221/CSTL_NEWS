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

import { getSupabase, netErrorText, netCall, releasePushDevice } from './supabase.js';
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
    emitAuthChange();
    warmProfile();
  });
}

// Вхід через Google. Після редіректу назад Supabase сам підхопить сесію
// (detectSessionInUrl) і onAuthStateChange оновить _user.
export async function signInWithGoogle() {
  const supa = getSupabase();
  if (!supa) { showToast('Немає звʼязку з сервером', 3000, 'error'); return; }
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
  const row = { uid: _user.id, email: _user.email || null };
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
    const core = { uid: _user.id, email: _user.email || null,
                   name: row.name ?? null, birth_date: row.birth_date ?? null };
    r = await netCall(() => supa.from('profiles').upsert(core, { onConflict: 'uid' }));
    error = r.ok ? null : r.rawError;
  }
  if (error) return { ok: false, error: r.error };   // r.error — уже людський текст
  if (row.name) _profileName = row.name;   // кеш для currentUserName()
  if (!partial && 'avatar_url' in row) _profileAvatar = row.avatar_url || null;   // кеш аватара
  return { ok: true, partial };
}
