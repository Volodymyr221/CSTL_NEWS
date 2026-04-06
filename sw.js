// sw.js — CSTL NEWS Service Worker
// Кешує статичні файли для офлайн-роботи і швидкого завантаження

const CACHE_NAME = 'cstl-20260406-2200';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './bundle.js',
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

  // Файли даних (data/*.json) — спочатку мережа, потім кеш (завжди свіжі дані)
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

  // Зовнішні запити — тільки мережа
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // Статичні файли — спочатку кеш, потім мережа
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
