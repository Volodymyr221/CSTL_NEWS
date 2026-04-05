// boot.js — ініціалізація PWA і Service Worker

// === PWA MANIFEST (дозволяє встановити сайт на телефон як додаток) ===
function setupPWA() {
  const manifest = {
    name: 'CSTL NEWS',
    short_name: 'CSTL',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#C41E3A',
    icons: [{
      src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxOTIgMTkyIj48cmVjdCB3aWR0aD0iMTkyIiBoZWlnaHQ9IjE5MiIgcng9IjIwIiBmaWxsPSIjQzQxRTNBIi8+PHRleHQgeD0iOTYiIHk9IjExMCIgZm9udC1mYW1pbHk9Ikdlb3JnaWEsc2VyaWYiIGZvbnQtc2l6ZT0iNjAiIGZvbnQtd2VpZ2h0PSJib2xkIiBmaWxsPSJ3aGl0ZSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+QzwvdGV4dD48L3N2Zz4=',
      sizes: '192x192',
      type: 'image/svg+xml'
    }]
  };
  const blob = new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' });
  const link = document.createElement('link');
  link.rel = 'manifest';
  link.href = URL.createObjectURL(blob);
  document.head.appendChild(link);
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

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && _swReg) _swReg.update();
  });

  window.addEventListener('pageshow', e => {
    if (e.persisted && _swReg) _swReg.update();
  });

  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then(reg => {
      _swReg = reg;
      reg.update();
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

export function bootApp() {
  try { setupPWA(); } catch(e) {}
  try { setupSW(); } catch(e) {}
}
