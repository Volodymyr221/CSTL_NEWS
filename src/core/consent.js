// src/core/consent.js — банер згоди з Політикою/Правилами (перший вхід).
// Закон хоче явну електронну згоду ПЕРЕД використанням. Показуємо один раз,
// відповідь зберігаємо в localStorage. Посилання відкриває правовий документ.
import { LEGAL_UPDATED } from './legal.js';

const KEY = 'cstl-legal-consent-v1';

// 🔴 14.08 — ЗГОДА ПРИВʼЯЗАНА ДО РЕДАКЦІЇ, А НЕ ДО ФАКТУ «КОЛИСЬ ТИКНУВ».
// Було: банер показувався, доки ключа немає, — і людина, що погодилась із
// редакцією 07.07, лишалась «згодною» з будь-яким майбутнім текстом, хоч би що
// в нього дописали. Значення ключа вже й тоді зберігало дату редакції (`LEGAL_UPDATED`),
// але ЧИТАВ його ніхто — тобто дані для перевірки були, а перевірки не було.
// Тепер розходження дат = питаємо знову, іншим текстом (людина вже знайома з
// Порталом, їй треба сказати не «ось правила», а «правила змінились»).
// ⚠️ Наслідок, який треба памʼятати: підняв `LEGAL_UPDATED` — банер побачать УСІ.
// Тому дату міняємо разом зі змістовною правкою, а не через одруківку.
export function initConsent() {
  let seen = null;
  try { seen = localStorage.getItem(KEY); } catch (_) { return; }
  if (seen === LEGAL_UPDATED) return;

  const updated = !!seen;   // ключ є, але від старої редакції → це ОНОВЛЕННЯ
  const bar = document.createElement('div');
  bar.className = 'consent-bar';
  bar.innerHTML = `
    <div class="consent-text">${updated
      ? `Ми оновили <a href="#" class="consent-link">Політику конфіденційності та Правила</a>.
         Продовжуючи, ви приймаєте нову редакцію.`
      : `Користуючись CSTL LIFE, ви погоджуєтесь з
         <a href="#" class="consent-link">Політикою конфіденційності та Правилами</a>.`}</div>
    <button class="consent-accept" type="button">${updated ? 'Зрозуміло' : 'Погоджуюсь'}</button>`;
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
