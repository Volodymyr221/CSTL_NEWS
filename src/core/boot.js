// boot.js — ініціалізація PWA і Service Worker

// PWA manifest — статичний у index.html (<link rel="manifest" href="manifest.json">).
// B-16 fix: прибрано динамічний Blob-manifest який дублювався і конфліктував
// зі статичним на iOS Safari (iOS краще бачить файл, не blob URL).

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
  try { setupSW(); } catch(e) {}
}
