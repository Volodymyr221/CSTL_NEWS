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
// 🔴 29.08 — ДВА БАНЕРИ НЕ ПОКАЗУЮТЬСЯ ОДНОЧАСНО.
// Скарга Вови зі скріна в браузері: внизу екрана стояли обидва — згода і
// «Встанови на екран». 📐 Заміряно по CSS: `.consent-bar` сидить на 10px від низу,
// `.pwa-cta` на 76px, тобто вони не перекриваються рівно доти, доки банер
// встановлення однорядковий. Розгорнув інструкцію — і він наїжджає на згоду.
// 🔑 Але справжня вада не в пікселях, а у ВИБОРІ: людина бачить дві дії одразу і
// не знає, котра перша. Тому лікуємо чергою, а не відступами.
// ➡️ `consentPending()` каже банеру встановлення, чи буде показана згода; подія
// `cstl-consent-accepted` каже, що черга дійшла до нього.
export function consentPending() {
  try { return localStorage.getItem(KEY) !== LEGAL_UPDATED; } catch (_) { return false; }
  // ⚠️ Кидок = сховище недоступне, і тоді `initConsent` теж виходить ні з чим:
  // банера згоди не буде, отже й чекати на нього не треба.
}

export function initConsent() {
  let seen = null;
  try { seen = localStorage.getItem(KEY); } catch (_) { return; }
  if (seen === LEGAL_UPDATED) return;

  const updated = !!seen;   // ключ є, але від старої редакції → це ОНОВЛЕННЯ

  // 🔴 ЗАТЕМНЕННЯ ПІД БАНЕРОМ (Вова 29.08). Діагноз його і він точний: банер
  // «зливається зі всією інформацією, не зрозуміло, що саме оце надо».
  // 🛑 АЛЕ ШАР ТУТ НАВМИСНО НЕ ЛОВИТЬ НАТИСКІВ — `notice-scrim--soft`. Наш власний
  // текст каже «**Користуючись** CSTL LIFE, ви погоджуєтесь»: згода дається фактом
  // користування, а не натиском кнопки. Заблокувати застосунок до натиску означало
  // б суперечити цьому тексту — тобто перетворити повідомлення на браму, не
  // змінивши жодного слова в ньому. Пряме рішення Вови: «залишаємо як зараз».
  // ⚠️ У банера ВСТАНОВЛЕННЯ шар протилежний (ловить і закриває) — там пропозиція
  // необовʼязкова, і тап повз неї є чесною відмовою.
  const шар = document.createElement('div');
  шар.className = 'notice-scrim notice-scrim--soft';

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
    шар.classList.remove('notice-scrim--in');
    setTimeout(() => { bar.remove(); шар.remove(); }, 240);
    // Черга рушила далі: банер встановлення чекає саме цієї події.
    document.dispatchEvent(new CustomEvent('cstl-consent-accepted'));
  });
  document.body.appendChild(шар);
  document.body.appendChild(bar);
  requestAnimationFrame(() => {
    шар.classList.add('notice-scrim--in');
    bar.classList.add('consent-bar--show');
  });
}
