// src/core/consent.js — банер згоди з Політикою/Правилами (перший вхід).
// Закон хоче явну електронну згоду ПЕРЕД використанням. Показуємо один раз,
// відповідь зберігаємо в localStorage. Посилання відкриває правовий документ.
import { LEGAL_UPDATED } from './legal.js';

const KEY = 'cstl-legal-consent-v1';

export function initConsent() {
  try { if (localStorage.getItem(KEY)) return; } catch (_) { return; }
  const bar = document.createElement('div');
  bar.className = 'consent-bar';
  bar.innerHTML = `
    <div class="consent-text">Користуючись CSTL LIFE, ви погоджуєтесь з
      <a href="#" class="consent-link">Політикою конфіденційності та Правилами</a>.</div>
    <button class="consent-accept" type="button">Погоджуюсь</button>`;
  bar.querySelector('.consent-link').addEventListener('click', (e) => {
    e.preventDefault();
    document.dispatchEvent(new CustomEvent('cstl-open-legal'));
  });
  bar.querySelector('.consent-accept').addEventListener('click', () => {
    try { localStorage.setItem(KEY, LEGAL_UPDATED); } catch (_) {}
    bar.classList.remove('consent-bar--show');
    setTimeout(() => bar.remove(), 240);
  });
  document.body.appendChild(bar);
  requestAnimationFrame(() => bar.classList.add('consent-bar--show'));
}
