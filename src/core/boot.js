// boot.js — ініціалізація PWA і Service Worker

import { logEvent, getAnonId, analyticsUid } from './supabase.js';
import { currentUserId } from './auth.js';

// PWA manifest — статичний у index.html (<link rel="manifest" href="manifest.json">).
// B-16 fix: прибрано динамічний Blob-manifest який дублювався і конфліктував
// зі статичним на iOS Safari (iOS краще бачить файл, не blob URL).

// Аналітика (Потік 6, byyou): 'appinstalled' — надійний сигнал РЕАЛЬНОГО
// встановлення PWA (на відміну від 'beforeinstallprompt', який лише означає
// «можна встановити», ще не факт встановлення).
function setupInstallTracking() {
  window.addEventListener('appinstalled', () => {
    logEvent(currentUserId() || getAnonId(), 'pwa_install');
  });
}

// === SERVICE WORKER (офлайн-кешування) ===
function setupSW() {
  if (!('serviceWorker' in navigator)) return;

  const hadController = !!navigator.serviceWorker.controller;
  let _reloading = false;
  let _swReg = null;

  const doReload = () => {
    if (_reloading) return;
    _reloading = true;
    window.location.replace(window.location.href);
  };

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    doReload();
  });

  // 🔴 17.09 — СЮДИ ЗАГЛЯНУЛИ ЧЕРЕЗ ЖУРНАЛ ЗБОЇВ. У гостя записалось
  // `promise: Failed to update a ServiceWorker… Operation has been aborted`.
  // `registration.update()` повертає обіцянку, а жоден із трьох викликів її не ловив.
  // Коли людина згортає застосунок рівно в цю мить, браузер обриває перевірку і
  // обіцянка падає — це штатний хід подій, а не поломка. Але без `catch` вона
  // летіла в `unhandledrejection` і сідала в журнал поряд із справжніми вадами.
  // ⚙️ Перевірка оновлення — справа best-effort: не вдалось зараз, спробуємо на
  //    наступне повернення на екран. Реагувати ні на що — звідси порожній catch.
  const перевіритиОновлення = () => { try { _swReg?.update()?.catch(() => {}); } catch (_) {} };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') перевіритиОновлення();
  });

  window.addEventListener('pageshow', e => {
    if (e.persisted) перевіритиОновлення();
  });

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then(reg => {
      _swReg = reg;
      перевіритиОновлення();
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'activated' && hadController) doReload();
        });
      });
    })
    .catch(() => {});
}

// ── 🔴 22.08 — ДРУГИЙ КОНТУР ДІАГНОСТИКИ: ПОМИЛКИ САМОГО ЗАСТОСУНКУ ─────────
//
// Перший контур (`logDbRefusal` у `core/supabase.js`) ловить те, що ВІДХИЛИЛА
// БАЗА. Але найчастіша скарга людини звучить інакше: «натиснув — і нічого», «біла
// сторінка». Це помилка JS у браузері, до бази вона взагалі не доходить, тож
// перший контур її не бачить.
//
// 🛑 ЧЕСНА МЕЖА, ЯКУ ТРЕБА ЗНАТИ: навіть удвох ці контури НЕ ловлять «мовчазний
// провал» — коли нічого не впало, просто нічого не сталося. Саме таким був баг
// капсули на дописі ШІ-агента (22.08): жодної помилки, просто порожньо. Такі
// вади ловлять лише стенди й живі люди. Не думати, що ми тепер бачимо все.
//
// 🔑 Пишемо ЧЕРЕЗ той самий `logEvent`, що й решта: вимикач статистики в кабінеті
// має глушити і це (людина, яка відкликала згоду, не лишає слідів жодного виду).
//
// ⚠️ ЗАПОБІЖНИК ВІД ПОТОПУ: одна зламана функція в циклі перемальовки здатна
// кинути сотні однакових помилок за секунду і залити таблицю. Тому: не більше
// 5 подій за сеанс і кожна СИГНАТУРА (текст+файл+рядок) лише раз. Нам треба
// знати, ЩО зламалось, а не скільки разів воно повторилось.
const _seenErrors = new Set();
let _errorsLogged = 0;

function reportJsError(kind, msg, src, line, col) {
  try {
    if (_errorsLogged >= 5) return;
    const текст = String(msg || '').slice(0, 160);
    if (!текст) return;
    // 🟢 17.09 — `Script error.` БЕЗ ФАЙЛУ І БЕЗ РЯДКА — ЦЕ НЕ НАША ПОМИЛКА.
    // Так браузер за стандартом позначає збій У ЧУЖОМУ скрипті (у нас це
    // GoatCounter): ні тексту, ні файлу, ні рядка — рівно нуль відомостей.
    // 5 таких записів за 30 днів стояли в журналі поряд із справжніми вадами і
    // забирали місце в стелі «5 подій за сеанс» — тобто шум не просто заважав,
    // а ВИТІСНЯВ те, що ми можемо полагодити.
    // 🛑 Єдиний спосіб побачити текст — `crossorigin` на чужому скрипті, а це
    //    ЗАБОРОНЕНО (`NOW.md` → НЕ ЧІПАТИ: аналітика мовчки помре). Отже запис
    //    недієвий за будовою — його місце не в журналі вад.
    // ⚠️ Фільтр ВУЗЬКИЙ: тільки цей точний текст і тільки без файлу/рядка.
    //    Будь-яка помилка з адресою доходить у журнал, як і досі.
    if (kind === 'error' && /^Script error\.?$/.test(текст) && !src && !line) return;
    // Файл лишаємо без домену — він в усіх однаковий і лише з'їдає місце.
    const файл = String(src || '').split('/').pop().slice(0, 40);
    const підпис = `${kind}|${текст}|${файл}:${line || 0}`;
    if (_seenErrors.has(підпис)) return;
    _seenErrors.add(підпис);
    _errorsLogged++;
    // 🔴 26.08 — акаунт, якщо він є (замовлення Вови: «позначай імʼя акаунта»).
    // `analyticsUid()` — місток із `core/supabase.js`, який наповнює `auth.js`; прямий
    // виклик `currentUserId()` тут дав би кільце імпортів.
    logEvent(analyticsUid() || getAnonId(), 'js_error', {
      meta: { kind, msg: текст, at: `${файл}:${line || 0}:${col || 0}` },
    });
  } catch (_) { /* діагностика не сміє стати другою помилкою */ }
}

function setupErrorTracking() {
  // Звичайна помилка виконання: «x is not a function», «Cannot read properties
  // of null» — рівно те, що бачить людина як «нічого не працює».
  window.addEventListener('error', (e) => {
    // Події від <img>/<script>, що не завантажились, теж приходять сюди, але в
    // них немає `message` — і це не поломка коду, а мережа. Пропускаємо.
    if (!e || !e.message) return;
    reportJsError('error', e.message, e.filename, e.lineno, e.colno);
  });
  // Обіцянка (Promise), що впала без обробника — найтихіший вид поломки:
  // консоль щось пише, а на екрані просто нічого не відбувається.
  window.addEventListener('unhandledrejection', (e) => {
    const r = e && e.reason;
    reportJsError('promise', (r && (r.message || r.error || r)) || 'unhandled', '', 0, 0);
  });
}

export function bootApp() {
  // Стоїть ПЕРШИМ: якщо впаде щось нижче, ми хочемо це побачити.
  try { setupErrorTracking(); } catch(e) {}
  try { setupSW(); } catch(e) {}
  try { setupInstallTracking(); } catch(e) {}
}
