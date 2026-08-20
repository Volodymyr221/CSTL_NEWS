// sw.js — CSTL LIFE Service Worker
// Кешує статичні файли для офлайн-роботи і швидкого завантаження

const CACHE_NAME = 'cstl-20260820-0946';

// Precache (попереднє кешування) — статичні файли які не змінюються часто
// index.html тут — як fallback для офлайну (на fetch використовується network-first)
const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './style/base.css',
  './style/filters.css',
  './style/news.css',
  './style/events.css',
  './style/buses.css',
  './style/power.css',
  './style/modal.css',
  './style/tabbar.css',
  './style/community.css',
  './style/board.css',         // 🆕 05.08 — стилі Дошки виділено з community.css
  './style/feed.css',
  './style/account.css',
  './style/messages.css',
  './style/sidebar.css',
  './style/home.css',          // 🆕 04.08 — головна як Home Dashboard
  './bundle.js',
  './logo.png',
  './icons/castle-icon.png',   // лого центральної кнопки ГРОМАДА — precache, щоб не зникало після bump CACHE
  './manifest.json',
  // 🔴 ЗНЯТО 28.07: './images/cork2.png' (2.9 МБ) — найважчий файл проєкту.
  // Чому це було дорого: CACHE_NAME міняється при КОЖНОМУ деплої коду, а install
  // качає весь цей список заново — тобто кожен телефон перевантажував 2.9 МБ фото
  // корка щоразу, навіть жодного разу не відкривши Дошку. Ще й через `Promise.all`
  // нижче падіння одного файлу валило установку цілком, тобто найважчий файл був
  // і найбільшим ризиком.
  // Тепер фото не просить жодне правило CSS: фон Дошки — нейтральний `--board-bg`,
  // а темний корок віджета Громади й прев'ю подачі малюється CSS-градієнтом (0 байт).
  // Сам файл лишається в репозиторії — видаляти без окремого слова Вови не можна.
];

// Встановлення: кешуємо статичні файли
// 🔴 16.08 — `Promise.all` → `allSettled`. Один недоступний файл зі списку валив
// установку кешу ЦІЛКОМ: офлайн не працював зовсім, і дізнатись про це не було як
// (помилка тонула всередині `waitUntil`). Тепер кожен файл відповідає лише за себе,
// а те, що не доїхало, чесно називається в консолі. Кеш із 21 файлу кращий за
// відсутній кеш через 22-й.
// ⚠️ `skipWaiting()` лишається безумовним — новий Service Worker має ставати
//    активним навіть коли якийсь файл не закешувався: код застосунку однаково
//    береться network-first.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(
        STATIC_ASSETS.map(url =>
          fetch(url, { cache: 'reload' }).then(r => {
            if (!r.ok) throw new Error(url + ' ' + r.status);
            return cache.put(url, r);
          })
        )
      ).then(results => {
        const failed = results
          .map((r, i) => (r.status === 'rejected' ? STATIC_ASSETS[i] : null))
          .filter(Boolean);
        if (failed.length) console.warn('[sw] не закешовано:', failed.join(', '));
      }))
      .then(() => self.skipWaiting())
  );
});

// Активація: видаляємо старі версії кешу
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Обробка запитів
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // HTML-сторінки (index.html, корінь, навігаційні запити) — network-first
  // Критично для лічильника версії: завжди показуємо свіжий штамп часу деплою.
  // Fallback на кеш тільки якщо мережі немає.
  const isHTML = e.request.mode === 'navigate' ||
                 url.pathname === '/' ||
                 url.pathname.endsWith('/') ||
                 url.pathname.endsWith('/index.html');
  if (isHTML) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return r;
        })
        .catch(() => caches.match(e.request).then(cached => cached || caches.match('./index.html')))
    );
    return;
  }

  // Файли даних (data/*.json) — network-first (завжди свіжі новини/розклад)
  if (url.pathname.includes('/data/')) {
    e.respondWith(
      fetch(e.request)
        .then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Зовнішні запити (погода, RSS і т.ін.) — тільки мережа
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // Код застосунку (bundle.js + *.css) — network-first.
  // Чому: на iOS PWA новий Service Worker активується із затримкою (часто аж після
  // повного перезапуску), тому cache-first віддавав старий код навіть коли версія
  // (index.html) вже свіжа. Network-first тягне свіжий код щоразу коли є мережа,
  // а кеш лишається запасним для офлайну. Прибирає «застряглий старий вигляд».
  const isAppCode = url.pathname.endsWith('.css') || url.pathname.endsWith('bundle.js');
  if (isAppCode) {
    e.respondWith(
      // { cache: 'reload' } — обходимо HTTP-кеш браузера (GitHub Pages віддає
      // CSS/JS з max-age ~10хв), інакше fetch повертав би застарілий код.
      fetch(e.request, { cache: 'reload' })
        .then(r => {
          if (r.ok) {
            const clone = r.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          }
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // Статичні файли (logo.png, manifest.json, images, тощо) — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => new Response('', { status: 503 }));
      // ↑ Раніше повертав index.html — для <img> це HTML замість картинки → «биті» фото.
      //   Тепер порожня відповідь: браузер показує стандартний плейсхолдер, не сторінку.
    })
  );
});

// ── Push-сповіщення (Level B — справжні сповіщення навіть при закритому додатку) ──

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        // Повідомити ВІДКРИТИЙ додаток про push → оновити список розмов/бейдж наживо +
        // показати in-app банер (P-8). title/body/threadId/groupId — раніше форвардили
        // лише pushType, банер не мав чим себе заповнити.
        // Realtime-підписка буває пропускає нові треди між акаунтами; push — надійний.
        list.forEach(c => { try { c.postMessage({
          __cstl: 'push', pushType: data.type || null,
          title: data.title || '', body: data.body || '',
          threadId: data.thread_id ?? null, groupId: data.group_id ?? null,
          // url — deep-link (напр. на новий пост «Стрічки»). Потрібен in-app банеру:
          // при відкритому додатку системне сповіщення НЕ показуємо (нижче), тож без
          // банера користувач не дізнався б про новий пост узагалі.
          url: data.url || null,
        }); } catch (_) {} });
        // App is in foreground — skip system notification, in-app banner handles it
        if (list.some(c => c.visibilityState === 'visible')) return;
        return self.registration.showNotification(data.title || 'CSTL LIFE', {
          body:               data.body  || '',
          icon:               './logo.png',
          badge:              './logo.png',
          tag:                data.tag   || 'bus-push',
          // threadId/groupId (P-9) — щоб клік по пуші відкрив САМЕ цю розмову, не просто застосунок.
          data:               {
            url: data.url || (data.type === 'chat' ? './' : './#buses'),
            threadId: data.thread_id ?? null, groupId: data.group_id ?? null,
          },
          requireInteraction: false,
        });
      })
  );
});

// ── Ротація push-підписки (16.08) ────────────────────────────────────────────
//
// 🔴 ЩО ЛІКУЄ. Браузер періодично перевипускає push-підписку (оновлення застосунку,
// чистка даних, службова ротація). Старий `endpoint` після цього мертвий: сервер
// отримає `410` і видалить рядок — а людина далі бачить увімкнений дзвіночок і
// **не отримує ЖОДНОГО сповіщення**. Мовчазна відмова, яку помічають на зупинці.
//
// 🔑 Тут ми лише ПЕРЕОФОРМЛЯЄМО підписку і будимо застосунок. Записати новий
// endpoint у базу Service Worker НЕ може: рядки захищені RLS (`user_uuid =
// auth.uid()`), а в SW немає сесії людини — тільки публічний ключ. Тому перенос
// робить сам застосунок під своєю сесією (`healPushEndpoint()` у `core/push.js`),
// а ми передаємо йому обидві адреси.
// ⚠️ Якщо жодної вкладки не відкрито, повідомлення нікому не дійде — тому
// `healPushEndpoint()` НЕ покладається на нього, а ще й звіряє адресу при кожному
// старті. Ця подія лише прискорює лікування, коли застосунок відкритий.
const SW_VAPID_KEY = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';

function swUrlBase64ToUint8Array(b64) {
  const pad  = '='.repeat((4 - b64.length % 4) % 4);
  const base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw  = atob(base);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

self.addEventListener('pushsubscriptionchange', e => {
  const oldEndpoint = e.oldSubscription?.endpoint || null;
  e.waitUntil((async () => {
    try {
      const sub = e.newSubscription || await self.registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: swUrlBase64ToUint8Array(SW_VAPID_KEY),
      });
      if (!sub) return;
      const j = sub.toJSON();
      const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach(c => { try { c.postMessage({
        __cstl: 'push-endpoint-changed',
        oldEndpoint,
        endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth_key: j.keys?.auth,
      }); } catch (_) {} });
    } catch (err) {
      console.warn('[sw] pushsubscriptionchange:', err && err.message);
    }
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const { threadId, groupId, url } = e.notification.data || {};
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        // Застосунок уже відкритий — фокусуємо і кажемо йому відкрити САМЕ цю розмову
        // (P-9: раніше просто фокусувало, thread_id ігнорувався).
        for (const c of list) {
          if ('focus' in c) {
            if (threadId != null || groupId != null || url) {
              // url — deep-link на конкретний елемент (#/post/feed/<id> тощо). Раніше
              // при ВІДКРИТОМУ додатку він ігнорувався: тап по сповіщенню про новий
              // пост лише фокусував вікно і лишав користувача там, де він був.
              try { c.postMessage({ __cstl: 'notif-click', threadId, groupId, url }); } catch (_) {}
            }
            return c.focus();
          }
        }
        // Холодний старт — передаємо thread_id через hash (як #/join/<uuid> для інвайтів),
        // app.js підхопить після завантаження.
        const coldUrl = threadId != null ? `./#/thread/${threadId}` : (url || './');
        return clients.openWindow(coldUrl);
      })
  );
});
