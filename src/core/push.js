// src/core/push.js
// Спільна логіка Web Push (VAPID) — раніше жила лише у buses.js (трекер рейсів),
// Б8.1 виносить сюди щоб board-chat.js (P-5) міг перевикористати без дублювання.

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
