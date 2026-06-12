// sw.js — CSTL LIFE Service Worker
// Кешує статичні файли для офлайн-роботи і швидкого завантаження

const CACHE_NAME = 'cstl-20260612-2023';

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
  './bundle.js',
  './logo.png',
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

  // Статичні файли (style.css, bundle.js, logo.png, тощо) — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});

// ── Push-сповіщення (Level B — справжні сповіщення навіть при закритому додатку) ──

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        // App is in foreground — skip system notification, in-app banner handles it
        if (list.some(c => c.visibilityState === 'visible')) return;
        return self.registration.showNotification(data.title || 'CSTL LIFE', {
          body:               data.body  || '',
          icon:               './logo.png',
          badge:              './logo.png',
          tag:                data.tag   || 'bus-push',
          data:               { url: './#buses' },
          requireInteraction: false,
        });
      })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        for (const c of list) {
          if ('focus' in c) return c.focus();
        }
        return clients.openWindow(e.notification.data?.url || './');
      })
  );
});