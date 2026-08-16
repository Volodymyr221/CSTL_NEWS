// src/core/push.js
// Спільна логіка Web Push (VAPID) — раніше жила лише у buses.js (трекер рейсів),
// Б8.1 виносить сюди щоб board-chat.js (P-5) міг перевикористати без дублювання.

import { isIOS, isStandalone } from './utils.js';

export const VAPID_PUBLIC_KEY = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';

// Перетворює VAPID public key з Base64url у Uint8Array для pushManager.subscribe()
export function urlBase64ToUint8Array(b64) {
  const pad  = '='.repeat((4 - b64.length % 4) % 4);
  const base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw  = atob(base);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Чи здатний цей пристрій/браузер взагалі показувати push (iOS-PWA, дозвіл тощо).
export function isPushCapable() {
  return ('Notification' in window) && ('serviceWorker' in navigator) && ('PushManager' in window);
}

// Чому сповіщення НЕ зможуть прийти — текст людською мовою, або null якщо все гаразд.
// Спільне для дзвіночка Автобусів і дзвіночка сторінок «Стрічки»: стан дзвіночка має
// бути чесний скрізь однаково — краще показати ⚠️ і пояснити, ніж вдавати що працює.
export function pushBlockedMsg() {
  // Обмеження Apple: у Safari-вкладці web-push не існує взагалі — лише у встановленій
  // PWA (iOS 16.4+). Без цієї перевірки користувач тапає дзвіночок, нічого не відбувається
  // і причина невідома. Ставимо ПЕРШОЮ: на iOS у вкладці навіть `Notification` часто нема,
  // тож загальне «недоступні на цьому пристрої» ввело б в оману (пристрій якраз уміє).
  if (isIOS() && !isStandalone()) {
    return 'На iPhone сповіщення працюють лише у встановленому додатку: «Поділитися» → «На екран Домів»';
  }
  if (!isPushCapable()) return 'Сповіщення недоступні на цьому пристрої';
  if (Notification.permission === 'denied') return 'Сповіщення вимкнені в налаштуваннях телефону — увімкни їх для CSTL LIFE';
  return null;
}

// Порівнює два ключі застосунку (applicationServerKey) побайтно.
// Потрібно щоб виявити стару підписку зі старим VAPID-ключем після ротації.
function pushKeysEqual(a, b) {
  if (!a || !b) return false;
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  if (ua.length !== ub.length) return false;
  for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return false;
  return true;
}

// Запитує дозвіл на сповіщення (якщо ще не питали) і повертає РЕАЛЬНУ підписку браузера
// (перевикористовує наявну або створює нову; при зміні VAPID-ключа — переп'ідписує).
// Повертає null якщо недоступно/відмовлено. Куди зберегти підписку — вирішує викликач
// (buses.js → push_subscriptions по рейсу, board-chat.js → saveUserPushDevice по uid).
export async function ensurePushSubscription() {
  if (!isPushCapable()) return null;
  try {
    let perm = Notification.permission;
    if (perm === 'denied') return null;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') return null;

    const reg    = await navigator.serviceWorker.ready;
    const appKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const existingKey = sub.options && sub.options.applicationServerKey;
      if (existingKey && !pushKeysEqual(existingKey, appKey)) {
        await sub.unsubscribe();
        sub = null;
      }
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: appKey,
      });
    }
    return sub;
  } catch (e) {
    console.warn('[push] ensurePushSubscription:', e && e.message);
    return null;
  }
}

// ── САМОЛІКУВАННЯ АДРЕСИ ПІДПИСКИ (16.08) ────────────────────────────────────
//
// 🔴 ВАДА, ВІД ЯКОЇ ЗАВЕДЕНО. Браузер час від часу перевипускає push-підписку.
// Стара адреса (`endpoint`) стає мертвою: сервер при відправленні отримує `410`
// і ВИДАЛЯЄ рядок — а в застосунку дзвіночок далі показує «увімкнено». Людина
// впевнена, що її попередять про автобус, і не отримує НІЧОГО. Мовчазна відмова.
//
// 🔑 ДВА РУБЕЖІ, і потрібні обидва:
//   (1) подія `pushsubscriptionchange` у `sw.js` — спрацьовує ТОЧНО в момент
//       ротації, але лише якщо є кому її прийняти (відкрита вкладка);
//   (2) ця звірка при кожному старті — ловить те, що сталось, поки застосунок
//       був закритий. Саме тоді ротація і відбувається найчастіше.
// ⚠️ Памʼятаємо адресу в `localStorage`, бо порівнювати нема з чим інакше:
//    браузер не каже «я змінив підписку», він просто віддає іншу.
const ENDPOINT_KEY = 'cstl_push_endpoint';

export async function healPushEndpoint(uid, migrate) {
  if (!uid || !isPushCapable() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;                       // підписки нема — лікувати нічого
    const now = sub.endpoint;
    const was = localStorage.getItem(ENDPOINT_KEY);
    if (was && was !== now) {
      const j = sub.toJSON();
      await migrate(uid, was, { endpoint: now, p256dh: j.keys?.p256dh, auth_key: j.keys?.auth });
    }
    if (was !== now) localStorage.setItem(ENDPOINT_KEY, now);
  } catch (e) {
    console.warn('[push] healPushEndpoint:', e && e.message);
  }
}

// Приймає сигнал ротації від Service Worker (миттєвий шлях, рубіж 1).
export function onPushEndpointChanged(uid, migrate) {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', async e => {
    const d = e.data;
    if (!d || d.__cstl !== 'push-endpoint-changed') return;
    const id = uid();
    if (!id || !d.endpoint) return;
    if (d.oldEndpoint && d.oldEndpoint !== d.endpoint) {
      await migrate(id, d.oldEndpoint, { endpoint: d.endpoint, p256dh: d.p256dh, auth_key: d.auth_key });
    }
    try { localStorage.setItem(ENDPOINT_KEY, d.endpoint); } catch (_) {}
  });
}
