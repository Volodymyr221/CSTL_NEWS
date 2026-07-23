// src/core/install-banner.js
// Банер «Відкрий/встанови у додатку» — показується ЛИШЕ коли застосунок відкрито
// у браузері (НЕ в PWA). Мета: людина, що перейшла по deep-link у браузері (напр.
// з месенджера), легко потрапляє в PWA на головному екрані.
//
// ⚠️ Автоматично перекинути в PWA неможливо — Apple блокує це на iOS (PWA —
// ізольований контейнер, веб-URL завжди відкривається в браузері; Universal Links
// лише для нативних App Store додатків). Тому це ПІДКАЗКА, не перенаправлення:
//   • Android — нативне встановлення через beforeinstallprompt;
//   • iOS — інструкція «Поділитись ⎋ → На головний екран».

const SNOOZE_KEY  = 'cstl-install-snooze-v1';
const SNOOZE_DAYS = 7;

// Вже в PWA? (display-mode standalone — Android/desktop; navigator.standalone — iOS)
function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
}
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function snoozed() {
  try {
    const t = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    return t && (Date.now() - t) < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
  } catch { return false; }
}
function snooze() { try { localStorage.setItem(SNOOZE_KEY, String(Date.now())); } catch {} }

let deferredPrompt = null;   // Android beforeinstallprompt (відкладений нативний діалог)

export function initInstallBanner() {
  if (isStandalone()) return;   // вже в PWA (відкрито з іконки) — банер не потрібен

  // Android/desktop: сигнал «застосунок МОЖНА встановити» приходить ЛИШЕ якщо PWA
  // ще НЕ встановлена. Якщо вже встановлена — подія не приходить, банер не зʼявиться
  // (не набридаємо тим, у кого додаток є). Показуємо банер саме з цієї події.
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!snoozed()) setTimeout(() => showBanner(false), 1200);
  });

  // iOS: події beforeinstallprompt немає, і дізнатися з браузера чи встановлена PWA
  // НЕМОЖЛИВО (обмеження Apple). Показуємо коротку інструкцію-підказку. Кого відкрив
  // з іконки — вже відсіяно вгорі (standalone), тож набридання мінімальне.
  if (isIOS() && !snoozed()) setTimeout(() => showBanner(true), 2500);
}

function showBanner(iosMode) {
  if (isStandalone() || snoozed() || document.querySelector('.pwa-cta')) return;

  const el = document.createElement('div');
  el.className = 'pwa-cta';
  el.innerHTML = `
    <button class="pwa-cta-x" type="button" aria-label="Закрити">✕</button>
    <div class="pwa-cta-ic">📲</div>
    <div class="pwa-cta-txt">
      <b>Встанови CSTL Life на екран</b>
      <span>Швидший доступ з головного екрана</span>
    </div>
    <button class="pwa-cta-go" type="button">${iosMode ? 'Як встановити' : 'Встановити'}</button>
    <div class="pwa-cta-hint" hidden>Тапни <b>Поділитись&nbsp;⎋</b> унизу браузера → <b>«Додати на початковий екран»</b>.</div>`;

  el.querySelector('.pwa-cta-x').addEventListener('click', () => { snooze(); el.remove(); });

  el.querySelector('.pwa-cta-go').addEventListener('click', async () => {
    if (deferredPrompt) {                 // Android — нативне встановлення
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch {}
      deferredPrompt = null;
      snooze(); el.remove();
    } else if (iosMode) {                  // iOS — показати/сховати інструкцію
      const hint = el.querySelector('.pwa-cta-hint');
      hint.hidden = !hint.hidden;
    } else {                              // інше — просто сховати
      snooze(); el.remove();
    }
  });

  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('pwa-cta--in'));
}
