// sw.js — CSTL LIFE Service Worker
// Кешує статичні файли для офлайн-роботи і швидкого завантаження

const CACHE_NAME = 'cstl-20260723-2101';

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
  './style/feed.css',
  './style/account.css',
  './style/messages.css',
  './style/sidebar.css',
  './bundle.js',
  './logo.png',
  './icons/castle-icon.png',   // лого центральної кнопки ГРОМАДА — precache, щоб не зникало після bump CACHE
  './manifest.json',
  './images/cork2.png',
];

// Встановлення: кешуємо статичні файли
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        STATIC_ASSETS.map(url =>
          fetch(url, { cache: 'reload' }).then(r => {
            if (!r.ok) throw new Error(url + ' ' + r.status);
            return cache.put(url, r);
          })
        )
      ))
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
            if (threadId != null || groupId != null) {
              try { c.postMessage({ __cstl: 'notif-click', threadId, groupId }); } catch (_) {}
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
