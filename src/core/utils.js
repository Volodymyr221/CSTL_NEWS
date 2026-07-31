// src/core/utils.js — спільні дрібні хелпери додатка.
import { openLayer, closeLayer } from './layers.js';   // шари ↔ історія браузера (жест «назад»)

// Форматування часу: "щойно", "5 хв тому", "2 год тому", "12 квітня"
// Приймає або number (мс), або ISO string ("2026-05-18T..."), або null.
export function formatTime(value) {
  if (!value) return 'недавно';
  const ts = typeof value === 'string' ? new Date(value).getTime() : value;
  if (!ts || isNaN(ts)) return 'недавно';
  const diff = Date.now() - ts;
  if (diff < 60000)    return 'щойно';
  if (diff < 3600000)  return Math.floor(diff / 60000) + ' хв тому';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' год тому';
  return new Date(ts).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

// Беремо найкращу дату посту: ts (legacy у JSON) → published_at → created_at.
// Для коментарів з БД — created_at; для JSON-демо — ts.
export function postTime(p) {
  if (!p) return null;
  return p.ts || p.published_at || p.created_at || null;
}

// Захист від XSS (підставлення шкідливого HTML коду).
// Екранує всі 5 небезпечних символів. Одинарна лапка ' → &#39; додана
// як захист на майбутнє (defense-in-depth) для атрибутів у одинарних лапках.
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Аватар-кружечок — СПІЛЬНИЙ хелпер (Потік 12). Є фото → <img>; немає → перша
// літера імені на кольоровому фоні (колір детермінований від імені), або 👤 для
// аноніма. Викликають: кабінет/шапка (свій), приватний чат `avatar()`,
// обговорення `authorAvatar()`. cls — базовий клас місця (pm-avatar / bd-avatar…),
// щоб успадкувати розмір/позицію з наявного CSS.
export function avatarCircle({ name, url, cls = 'pm-avatar', uid = '' } = {}) {
  // Потік 12 Б: data-av-uid — якір для прогресивної заміни літери на фото
  // (hydrateAvatars у supabase.js підтягне чуже фото по uid і замінить innerHTML).
  // data-av-circle — маркер що це СПРАВЖНІЙ аватар-кружечок (фіксованого розміру,
  // overflow:hidden). Гідрація фото йде ЛИШЕ по ньому: інші елементи-таргети тапу
  // (напр. контейнер імені `.pm-head-titles`) теж мають data-av-uid для відкриття
  // картки профілю, але фото в них вставляти НЕ можна — вони без розмірів, тому
  // <img> розтягувався б на весь екран (баг «квадратне фото», Вова 17.07).
  const idAttr = uid ? ` data-av-uid="${escapeHtml(String(uid))}" data-av-circle=""` : '';
  const safeUrl = url ? String(url).trim() : '';
  if (safeUrl) {
    return `<span class="${cls} ${cls}--img"${idAttr}><img src="${escapeHtml(safeUrl)}" alt="" loading="lazy"></span>`;
  }
  const a = String(name || '').trim();
  if (!a) return `<span class="${cls} ${cls}--anon"${idAttr}>👤</span>`;
  const letter = a.charAt(0).toUpperCase();
  const hue = (a.charCodeAt(0) * 47) % 360;
  return `<span class="${cls}" style="background:hsl(${hue}deg 62% 74%)"${idAttr}>${escapeHtml(letter)}</span>`;
}

// Фото → квадратний аватар (Потік 12): центр-кроп у квадрат + ресайз до size px,
// повертає JPEG-Blob (~15-40КБ). Окремо від compressImage (та прямокутна, для
// оголошень) — аватар мусить бути квадратним для кружечка. Promise<Blob>.
export function squareImageBlob(file, size = 256) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);        // сторона квадрата = менша
        const sx = (img.width  - side) / 2;                  // центрування кропу
        const sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, size, size);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', 0.82);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Textarea росте по контенту замість внутрішнього скролу. У bottom-sheet
// внутрішній скрол textarea конфліктує зі свайпом на iOS і ховає верх тексту —
// тому поле розширюється, а скролиться сам лист (sheet overflow-y:auto).
// Викликати ПІСЛЯ вставки в DOM (для префілу в режимі редагування).
export function autoGrowTextarea(el) {
  if (!el) return;
  const fit = () => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };
  el.style.overflowY = 'hidden';
  el.addEventListener('input', fit);
  requestAnimationFrame(fit);
}

// Стиснути фото на клієнті → JPEG-Blob. Спільна для Дошки (оголошення) і «Стрічки».
// Телефонні фото — 3-5 МБ; uploadPhotoToStorage очікує стиснутий Blob, інакше
// upload падає «Load failed» (розмір/мережа). maxDim/quality — під контекст.
export function compressImage(file, maxDim = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxDim)      { h = h * maxDim / w; w = maxDim; }
        else if (h >= w && h > maxDim) { w = w * maxDim / h; h = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(w);
        canvas.height = Math.round(h);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Форматування дати події: "12 квітня, субота"
export function formatEventDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', weekday: 'long' });
}

// 🆕 28.07 (потік 2 Дошки) — ЦІНА одним форматувальником на весь застосунок.
// Живе тут, а не в board.js, бо потрібна ДВОМ модулям: картці/модалці Дошки
// (`tabs/board.js`) і прев'ю форми подачі (`tabs/community-modal.js`). Пряме
// board.js ← community-modal.js неможливе — board.js уже імпортує форму, вийшло б
// коло імпортів; а копію робити не можна (у проєкті два списки антиспаму вже
// розійшлися саме так).
//
// Порожньо / не число / від'ємне → '' (рядок ціни просто не малюється: для
// «віддам»/«шукаю»/«загубилось» порожній слот у сітці не лишаємо — рішення Вови).
// ⚠️ 0 — це свідоме «Безкоштовно», а не «не вказано». Тому перевірка на null/'',
// а не на хибність значення: `if (!price)` з'їв би нуль.
// 🆕 28.07 — третій аргумент `negotiable` («Договірна»). Порядок саме такий, бо
// ЧИСЛО має пріоритет: так вирішує сервер (`if v_price is not null then v_negot := false`
// у `submit_board_post`), і клієнт мусить казати те саме — інакше картка написала б
// «Договірна» там, де в базі лежить конкретна сума.
const PRICE_SYMBOLS = { UAH: '₴', USD: '$', EUR: '€' };
export function formatPrice(price, currency, negotiable) {
  if (price == null || price === '') return negotiable ? 'Договірна' : '';
  const n = Number(price);
  if (!isFinite(n) || n < 0) return negotiable ? 'Договірна' : '';
  if (n === 0) return 'Безкоштовно';
  // toLocaleString('uk-UA') ставить між тисячами НЕРОЗРИВНИЙ пробіл — саме те, що
  // треба на вузькій картці: число не переноситься саме посеред себе.
  const sym = PRICE_SYMBOLS[currency || 'UAH'] || String(currency || '');
  return `${n.toLocaleString('uk-UA')} ${sym}`.trim();
}

// Доповнити число до 2 знаків ('5' → '05'). Використовується для часу, дат, ID.
export function pad(n) { return String(n).padStart(2, '0'); }

// Сьогоднішня дата у форматі 'YYYY-MM-DD' — ключ для розкладів і JSON-таблиць.
export function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Координати Олики (fallback якщо геолокація недоступна або відмовлена)
const OLYKA_COORDS = { lat: 50.7333, lon: 25.8167 };

// Кеш геолокації — щоб шапка і блок Громади не запитували двічі
let _coordsPromise = null;

// Повертає { lat, lon, city } — координати користувача або Олики як fallback.
// Кеш у межах сесії: перший виклик питає геолокацію, наступні беруть з пам'яті.
export function getCoords() {
  if (_coordsPromise) return _coordsPromise;
  _coordsPromise = new Promise(resolve => {
    if (!navigator.geolocation) {
      resolve({ ...OLYKA_COORDS, city: 'Олика' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude, city: null }),
      ()  => resolve({ ...OLYKA_COORDS, city: 'Олика' }),
      { timeout: 5000, maximumAge: 600000 }
    );
  });
  return _coordsPromise;
}

// Reverse geocoding через OpenStreetMap Nominatim — координати → назва міста
export async function getCityName(lat, lon) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`,
      { headers: { 'Accept-Language': 'uk' } }
    );
    const data = await res.json();
    return data.address?.city || data.address?.town || data.address?.village || 'Олика';
  } catch {
    return 'Олика';
  }
}

// Горизонтальний свайп на елементі. Викликає onLeft при свайпі вліво,
// onRight при свайпі вправо. Поріг 50px, врахування Y щоб не плутати зі скролом.
//
// 🔴 opts.edgeGuard (31.07) — СКІЛЬКИ ПІКСЕЛІВ ВІД ЛІВОГО КРАЮ ІГНОРУВАТИ.
// Без цього один рух пальця робить ДВІ речі: iOS обробляє свій системний жест
// «назад» (його не можна скасувати з коду — `preventDefault` на нього не діє), а ми
// тим часом кидаємо onRight. Рівно цей клас бага вже коштував проєкту двох ітерацій
// у «Стрічці» (скріни IMG_3557 / IMG_3559 — історія в шапці `core/layers.js`).
// Тому дотик, ЩО ПОЧАВСЯ в системній зоні, ми не обслуговуємо взагалі: він чужий.
// За замовчуванням 0 — стара поведінка не змінюється.
//
// ⚠️ До 31.07 ця функція не мала ЖОДНОГО виклику (імпорт у `community-blocks.js`
// стояв невикористаним). Перший справжній користувач — хаб новин; тому опція
// додана сюди, а не другою копією свайпу поруч (HOT_RULES №8).
export function attachSwipe(el, onLeft, onRight, opts = {}) {
  const edgeGuard = opts.edgeGuard || 0;
  let startX = null, startY = null;
  el.addEventListener('touchstart', e => {
    // Мультитач (пінч-зум) — не наш жест, і його дельта однаково була б сміттям.
    if (e.touches.length !== 1) { startX = null; return; }
    const t = e.touches[0];
    if (edgeGuard && t.clientX <= edgeGuard) { startX = null; return; }
    startX = t.clientX;
    startY = t.clientY;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if (startX == null) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    startX = null;
    // Тільки якщо горизонтальний рух більший за вертикальний (це не скрол)
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0 && onLeft)  onLeft();
      if (dx > 0 && onRight) onRight();
    }
  }, { passive: true });
}

// Deep-link на елемент застосунку: #/post/<source>/<id>.
// source: feed («Стрічка») · board (оголошення Дошки) · disc (Обговорення) · news (стаття).
// На GitHub Pages (статичний хостинг) роутинг через hash; обробка — handlePostHash у app.js.
export function deepLink(source, id) {
  return `${location.origin}${location.pathname}#/post/${source}/${id}`;
}

// Web Share API — поділитись ПОСИЛАННЯМ через рідне меню iOS/Android.
// iOS Safari відкриває меню з Viber/Telegram/Messenger/SMS одним тапом.
// Fallback: copy URL у clipboard + toast «Скопійовано».
// Рішення Вови (23.07): ділимося/копіюємо ТІЛЬКИ посилання — без дублювання тексту
// контенту (раніше text заповнював тіло повідомлення). Стратегія віральності —
// посилання веде людину в застосунок (docs/COMMUNITY_BOARD_VISION.md).
export async function sharePost({ title, url }) {
  const shareData = {
    title: title || 'CSTL LIFE',
    url:   url || location.href,
  };
  // iOS Safari + Chrome Android підтримують navigator.share()
  if (navigator.share) {
    try {
      await navigator.share(shareData);
      return true;
    } catch (err) {
      // AbortError = користувач закрив меню. Це не помилка.
      if (err && err.name === 'AbortError') return false;
      // Інша помилка → fallback на clipboard
    }
  }
  // Fallback: копія URL у буфер обміну
  try {
    await navigator.clipboard.writeText(shareData.url);
    showToast('Скопійовано посилання', 2500);
    return true;
  } catch {
    showToast('Не вдалось поділитись', 2500);
    return false;
  }
}

// Показати toast-повідомлення (маленьке сповіщення знизу екрану)
// type: '' (звичайне) або 'error' (червоне — для заборон/помилок)
// ── СИСТЕМНІ ПОВІДОМЛЕННЯ (toast) — один компонент на весь застосунок ──────────
// Кличеться 132 рази з усіх модулів. Сигнатура `(msg, duration, type)` НЕ змінена —
// лише `duration` тепер має значення «0 = порахуй сам за довжиною тексту» (раніше
// за замовчуванням стояло 3000). Жоден наявний виклик нуля не передає — звірено.
//
// 🔑 ЩО БУЛО НЕ ТАК (окрім CSS, див. style/base.css):
// один вузол і один таймер. Друге повідомлення МИТТЄВО затирало перше — його ніхто
// не встигав прочитати. При 132 викликах це трапляється регулярно (напр. невдале
// збереження одразу після успішного завантаження фото).
const TOAST_MIN = 2500;    // менше — не встигнеш прочитати навіть двох слів
const TOAST_MAX = 6000;    // більше — заважає, а не допомагає
const TOAST_READ = 1500;   // скільки повідомлення має провисіти, перш ніж його можна змінити
const TOAST_FADE = 220;    // тривалість згасання з CSS — щоб наступне не наїхало на попереднє

const toastQueue = [];
let toastCurrent = null;   // текст, що зараз на екрані (null = вільно)
let toastShownAt = 0;
let toastTimer = 0;

// Час показу за довжиною: три рядки за 3 секунди прочитати неможливо.
// Явно заданий `duration` завжди має пріоритет — код, який знає краще, лишається головним.
function toastDuration(text, explicit) {
  if (explicit > 0) return explicit;
  return Math.min(TOAST_MAX, Math.max(TOAST_MIN, 1200 + text.length * 55));
}

function toastNode() {
  let t = document.getElementById('cstl-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'cstl-toast';
    t.className = 'toast';   // без цього класу CSS .toast не діяв → тост опинявся у потоці сторінки (під модалками)
    // Для читача екрана: повідомлення оголошується, не перебиваючи поточну фразу.
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  return t;
}

function toastShow(item) {
  const t = toastNode();
  // 🆕 30.07 — НЕОБОВʼЯЗКОВА КНОПКА ДІЇ (для «Видалено · Скасувати»).
  // Чому тут, а не окремим компонентом: `showToast` — ЄДИНИЙ компонент системних
  // повідомлень на весь застосунок (132 виклики), і саме через дві копії в цьому
  // проєкті вже розходились списки антиспаму. Другий «снекбар» повторив би цю історію.
  // ⚠️ Шлях БЕЗ дії лишається байт-у-байт той самий (`textContent`), тож усі наявні
  // виклики не зачеплені — структура з двох вузлів будується лише коли дію передали.
  const act = item.action;
  if (act && act.label && typeof act.onClick === 'function') {
    t.textContent = '';
    const span = document.createElement('span');
    span.className = 'toast-text';
    span.textContent = item.msg;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-action';
    btn.textContent = act.label;
    btn.addEventListener('click', () => {
      try { act.onClick(); } catch (_) { /* fail-soft: тост не має валити застосунок */ }
      toastHide();
    });
    t.append(span, btn);
  } else {
    t.textContent = item.msg;
  }
  t.classList.toggle('toast--action', !!(act && act.label));
  t.classList.toggle('toast--error', item.type === 'error');
  toastCurrent = item.msg;
  toastShownAt = Date.now();
  // Наступним кадром — інакше на щойно створеному вузлі переходу не буде взагалі
  // (браузер не встигає зафіксувати початковий стан).
  requestAnimationFrame(() => t.classList.add('visible'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(toastHide, item.ms);
}

function toastHide() {
  clearTimeout(toastTimer);
  document.getElementById('cstl-toast')?.classList.remove('visible');
  toastCurrent = null;
  // Даємо згасанню доїхати, тоді показуємо наступне з черги.
  setTimeout(() => { const next = toastQueue.shift(); if (next) toastShow(next); }, TOAST_FADE);
}

// `action` (30.07) — необовʼязкова кнопка в тості: `{ label, onClick }`.
// Використання: незворотну дію показуємо як зроблену, а відкат даємо тут же
// (патерн «Видалено · Скасувати»). Без `action` поведінка не змінилась ніяк.
export function showToast(msg, duration = 0, type = '', action = null) {
  const text = String(msg ?? '').trim();
  if (!text) return;                       // порожній тост — це завжди помилка виклику
  const item = { msg: text, ms: toastDuration(text, duration), type, action };

  if (!toastCurrent) { toastShow(item); return; }
  if (toastCurrent === text) return;       // те саме вже висить — не блимаємо

  // Поточне ще не встигли прочитати → нове чекає. Встигли → міняємо одразу,
  // щоб черга не розтягувалась на десятки секунд.
  if (Date.now() - toastShownAt >= TOAST_READ) {
    toastQueue.length = 0;
    toastQueue.push(item);
    toastHide();
    return;
  }
  if (toastQueue.some(q => q.msg === text)) return;   // дубль у черзі не тримаємо
  if (toastQueue.length >= 2) toastQueue.shift();     // стеля: найсвіжіші важливіші
  toastQueue.push(item);
}

// Перегляд фото на весь екран (спільний lightbox — переюз `.pm-lightbox`).
// Раніше локальна копія жила в board-chat.js (openPhoto); винесено сюди, бо
// картку профілю (тап по аватару) теж треба вміти збільшувати.
export function openPhotoLightbox(url) {
  if (!url) return;
  const ov = document.createElement('div');
  ov.className = 'pm-lightbox';
  ov.innerHTML = `<img src="${escapeHtml(url)}" alt="фото">`;
  // Спільний механізм шарів (core/layers.js): жест «назад» закриває саме фото.
  const layer = openLayer(() => ov.remove());
  ov.addEventListener('click', () => closeLayer(layer));
  document.body.appendChild(ov);
}

// ── Фільтр матюків / образливих слів / спаму (клієнтський) ───────────────────
// Бувабельний (до Фази Б — серверний тригер). Мета: відсікати очевидні образи
// і флуд ще до публікації у чаті/постах. Списки легко доповнювати.

// Мапа латинських гомогліфів → кирилиця (щоб «xyй» теж ловилось)
const FILTER_HOMOGLYPHS = { a:'а', e:'е', o:'о', c:'с', x:'х', p:'р', y:'у', k:'к', i:'і', b:'б', m:'м', h:'н', t:'т' };

// Leet (цифри/символи → латинські літери): обходи «сук4», «b1yat», «п1зда», «x0й».
// '1' неоднозначна (i або l) — обробляється окремо двома варіантами в латинському проході.
const FILTER_LEET = { '0':'o', '3':'e', '4':'a', '5':'s', '6':'g', '7':'t', '8':'b', '9':'g', '@':'a', '$':'s', '!':'i', '|':'l', '+':'t' };
function deleet(s) { return String(s).replace(/[03456789@$!|+]/g, ch => FILTER_LEET[ch] || ch); }

// Нормалізація для КИРИЛІЧНОГО проходу: lowercase + leet + '1'→i + гомогліфи + схлоп повторів.
function normalizeForFilter(text) {
  return deleet(String(text || '').toLowerCase())
    .replace(/1/g, 'i')                             // у кир-проході 1→i (далі гомогліф i→і)
    .replace(/[a-z]/g, ch => FILTER_HOMOGLYPHS[ch] || ch)
    .replace(/(.)\1{2,}/g, '$1');                   // «хуууй» → «хуй»
}

// ⚠️ ЗВУЖЕНО 26.07 — рішення Вови: «Послаб фільтр тільки на прямі матюки».
// Прибрано ОБРАЗИ (ідіот, кретин, придурок, імбецил, дебіл, лох, дурак/дурень/дурний,
// тупий/тупиця, козел, даун, бовдур, скотина, гнида, тварюка, лошара, мразь, падло,
// сволота, педик) і ВУЛЬГАРИЗМИ (гівно, говно, срака, сраний, жопа, сцикло).
// Причина: це не матюки, а звичайна різкість у розмові — за них не варто мовчки
// відхиляти повідомлення жителя. Лишилось ядро обсценної лексики.
// Стеми перевірені щоб НЕ чіпати легальні: художник/худий/хустка/хутро/хуліган,
// мандарин/мандат, корабля, сучок, шлюб.
const PROFANITY_STEMS = [
  'хуй', 'хує', 'хуя', 'хуї', 'хуйл', 'хуєс',
  'пизд', 'пізд', 'бляд', 'блят',
  // 'еб' голим стемом НЕ можна: гомогліфи (e→е, b→б) роблять з ebook/ebay/ebola
  // «ебоок/ебау/ебола» → хибне блокування. Лише довші реальні форми.
  // 'єб'/'їб' безпечні — є/ї з латинських літер не виникають.
  'єб', 'їб', 'йоб', 'ебал', 'ебан', 'ебат', 'ебут', 'ебуч', 'ебну',
  'наєб', 'наеб', 'наїб', 'заєб', 'заїб',
  'виєб', 'виїб', 'доїб', 'уїб', 'уєб', 'уеб',
  'залуп', 'гандон', 'гондон', 'мудак', 'мудил',
  'підар', 'підор', 'пидор', 'пидар', 'наху', 'похуй',
  'дроч', 'сцук', 'курв', 'шлюх', 'шльондр',
  // ⚠️ було 'довбо'/'долбо' — блокувало легальне «довбати» («довбати стіну»).
  // Лишились повні форми, які без матюка не існують.
  'довбойоб', 'довбоєб', 'довбаєб', 'долбоеб', 'долбойоб',
];
// Ризиковані короткі — лише ПОВНИМ словом (prefix дав би хибу: «сукня», «корабля»…)
const PROFANITY_EXACT = new Set([
  'бля', 'сука', 'суки', 'суку', 'сучка', 'сучки', 'хер', 'манда', 'манди',
]);
// Ультра-безпечні стеми для «squashed» проходу (рознесене «х у й») — майже не трапляються всередині легальних слів
const PROFANITY_SQUASH = ['хуй', 'хуйл', 'пизд', 'пізд', 'єбал', 'їбал', 'йоб', 'бляд', 'блят', 'мудак', 'підор', 'пидор'];
// Трансліт латиницею + англ. — окремий прохід (leet + два варіанти '1').
// Стеми ДОВШІ, щоб не чіпати легальні англ. слова (не 'suk'/'ass'/'dick'/'cunt' prefix).
// ⚠️ ЗВУЖЕНО 26.07 разом із кириличним списком. Пішли образи й вульгаризми:
// durak, govno, gavno, mraz, nahren, retard, bastard, jackass, dumbass, douche,
// wanker, bollock, dickhead, whore, biatch.
// 🛑 nigger / nigga / faggot ЛИШЕНО СВІДОМО — це не «різкість у розмові», а мова
// ворожнечі; під правило «прибрати образи» вони не підпадають. Знімати — лише за
// прямим словом Вови.
const PROFANITY_LATIN = [
  // рос/укр трансліт
  'huy', 'hui', 'huil', 'huyl', 'huylo', 'huilo', 'huesos', 'xyu',
  'pizd', 'pizda', 'yeban', 'ebal', 'ebat', 'zaeb', 'doeb', 'vyeb',
  'blya', 'blyad', 'blyat', 'suka', 'suchka', 'suchara',
  'pidor', 'pidar', 'pidoras', 'mudak', 'mudil', 'zalupa', 'gandon', 'gondon',
  'dolboeb', 'dolbaeb', 'nahui', 'nahuy', 'nahyi',
  'pohui', 'pohuy', 'yoban', 'yobn',
  // англ.
  'fuck', 'fuk', 'fuq', 'shit', 'bullshit', 'bitch', 'asshole',
  'motherfuck', 'faggot', 'nigger', 'nigga',
];
// Для «squashed» латинського проходу (рознесене «b l y a t»): ЛИШЕ довгі транслітформи,
// безпечні як підрядок. БЕЗ англ./коротких (інакше «this hit»→«thishit»→shit; «rapid order»→pidor).
const PROFANITY_LATIN_SQUASH = ['blyat', 'pizda', 'nahui', 'pidoras', 'zalupa', 'dolboeb'];

// 🔴 ГОЛОВНИЙ ФІКС 26.07 — склеювати можна ЛИШЕ рознесені літери, а не весь текст.
//
// БУЛО: `norm.replace(/[^а-яіїєґa-z]/g, '')` — з тексту прибирались УСІ пробіли,
// коми й переноси рядків, після чого стеми шукались підрядком у злитому полотні.
// Задум був правильний (зловити обхід «х у й»), наслідок — ні: у злитому тексті
// шматками матюків стають звичайні слова. Пост Вови про туристичну Олику не
// публікувався через «...та ро[блят]ь усе...» — слово «роблять».
// Прогін 21 звичайної фрази ловив 15: роблять/люблять/зроблять («блят» усередині),
// «свій обовʼязок» / «який обрав» / «твій образ» / «стій обережно» (склейка «…й»+«об…»
// = «йоб»), «під орудою» / «під ореолом» («підор»), «купи здоровя» («пизд»).
//
// СТАЛО: склеюємо лише ЛАНЦЮЖКИ ОДИНОЧНИХ ЛІТЕР (мінімум три поспіль) — саме так
// виглядає обхід «х у й», «х-у-й», «б л я т ь». Звичайне слово довше за одну літеру,
// тож у ланцюжок не потрапляє і ні з чим не склеюється.
// ⚠️ Чому саме РІВНО одна літера, а не «до двох»: двобуквені фрагменти — це нормальні
// українські слова («об», «на», «за», «до», «як», «ти»), і склейка з ними знову дає
// хиби. Останню зловив корпус: у HTML-полі `content` апостроф записаний сутністю
// (`об&#x27;єднає`), уламки якої давали ланцюжок «й»+«об»+«х»+«т» → «йобхт».
// Мінімум три — бо найкоротший стем («хуй», «йоб») має три літери.
function spacedRuns(s, letters) {
  const runs = [];
  let chain = [];
  const flush = () => { if (chain.length >= 3) runs.push(chain.join('')); chain = []; };
  for (const part of s.split(letters)) {
    if (part.length === 1) chain.push(part);
    else flush();
  }
  flush();
  return runs;
}

// Легальні слова, які ПОЧИНАЮТЬСЯ з матюкового стему. Не вигадані — знайдені
// прогоном фільтра по живому корпусу (усі 400 статей `data/articles.json`, 26.07):
//   «підорлик»  — птах (малий підорлик, Aquila pomarina); стаття про орнітологів
//                 у нацпарку «Припʼять – Стохід» → ловився стемом 'підор';
//   «ЄБРР»      — Європейський банк реконструкції та розвитку; стаття про заміну
//                 теплових мереж Луцька → ловився стемом 'єб'.
// Обидва — саме та лексика, якою пише місцеве медіа, тож хиба була б регулярною.
const PROFANITY_ALLOW = ['підорлик', 'єбрр'];

// Апостроф — ЧАСТИНА українського слова («обʼєднає», «памʼять»), а не роздільник.
// Ловились усі чотири накреслення, бо люди й парсери пишуть їх урізнобіч.
// ⚠️ Знайдено тим самим прогоном по корпусу: «...триватиме два дні й обʼєднає...»
// розпадалось на «й» + «об» і склеювалось у «йоб». Прибираємо апостроф ДО розбиття:
// «обʼєднає» → «обєднає» (ціле слово, у ланцюжок не потрапляє), а спроба обійти
// фільтр через «хʼуʼй» навпаки схлопується в «хуй» і ловиться.
const FILTER_APOSTROPHE = /['’ʼ`´]/g;

// true якщо текст містить матюк
export function containsProfanity(text) {
  const norm = normalizeForFilter(text).replace(FILTER_APOSTROPHE, '');
  // 1) по словах (кирилиця + гомогліфи + leet)
  const words = norm.split(/[^а-яіїєґa-z]+/).filter(Boolean);
  for (const w of words) {
    if (PROFANITY_ALLOW.some(a => w.startsWith(a))) continue;   // легальний виняток
    if (PROFANITY_EXACT.has(w)) return true;
    if (PROFANITY_STEMS.some(s => w.startsWith(s))) return true;
  }
  // 2) рознесена кирилиця: «х у й» → «хуй». Звичайні слова сюди не потрапляють.
  for (const run of spacedRuns(norm, /[^а-яіїєґa-z]+/)) {
    if (PROFANITY_SQUASH.some(s => run.includes(s))) return true;
  }
  // 3) трансліт латиницею + leet. '1' неоднозначна → пробуємо i та l (blyat vs b1tch).
  const latinBase = deleet(String(text || '').toLowerCase().replace(/(.)\1{2,}/g, '$1'))
    .replace(FILTER_APOSTROPHE, '');
  for (const one of ['i', 'l']) {
    const v = latinBase.replace(/1/g, one);
    for (const w of v.split(/[^a-z]+/).filter(Boolean)) {
      if (PROFANITY_LATIN.some(s => w.startsWith(s))) return true;
    }
    // рознесена латиниця: «b l y a t» → «blyat»
    for (const run of spacedRuns(v, /[^a-z]+/)) {
      if (PROFANITY_LATIN_SQUASH.some(s => run.includes(s))) return true;
    }
  }
  return false;
}

// ── Схід/захід сонця (формула NOAA, спрощена) ────────────────────────────────
// Рахує сама щодня — жодних ручних оновлень «раз на 3 місяці». Точність ±3 хв,
// цього досить для перемикання фото день/вечір. Працює офлайн (чиста математика).
// За замовчуванням — координати Олики (50.717 пн.ш., 25.810 сх.д.).
export function sunTimes(date = new Date(), lat = 50.717, lon = 25.810) {
  const rad = Math.PI / 180;
  const doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000); // день року
  const decl = -23.44 * rad * Math.cos(2 * Math.PI / 365 * (doy + 10));           // деклінація Сонця
  // 90.833° — зеніт з урахуванням рефракції атмосфери і радіуса диска сонця
  const cosH = (Math.cos(90.833 * rad) - Math.sin(lat * rad) * Math.sin(decl))
             / (Math.cos(lat * rad) * Math.cos(decl));
  if (cosH < -1 || cosH > 1) return null;   // полярний день/ніч — не про Олику
  const H = Math.acos(cosH) / rad;          // пів-дуга світлового дня, у градусах
  const B = 2 * Math.PI * (doy - 81) / 364; // рівняння часу (хвилини)
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const noonMin = 720 - 4 * lon - eot;      // сонячний полудень, хвилини UTC
  const mk = m => {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCMinutes(Math.round(m));
    return d;
  };
  return { sunrise: mk(noonMin - 4 * H), sunset: mk(noonMin + 4 * H) };
}

// true якщо текст схожий на спам/беззмістовний набір (консервативно — щоб не блокувати «Ок»/«Так»)
export function looksLikeSpam(text) {
  const t = String(text || '').trim();
  // ⚠️ БУЛО «if (t.length === 1) return true» — знято 25.07 на вимогу Вови:
  // «навіть знак питання не можу надіслати». Один символ — це нормальна репліка
  // («?», «!», «+», «👍»), а не спам. Ловити треба безглуздий НАБІР, а не короткість.
  if (/(.)\1{5,}/.test(t)) return true;                  // символ повторено ≥6 разів
  const letters = t.replace(/[^а-яіїєґa-zА-ЯІЇЄҐA-Z]/g, '');
  if (letters.length >= 12 && !/[аеиіоуяюєїёauoiey]/i.test(letters)) return true; // довге без голосних = клавіатурний набір
  return false;
}

// ── localStorage (спільні читання/запис) ─────────────────────────────────────
export function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
export function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ── Антифлуд і дублі (per-device) ────────────────────────────────────────────
// Раніше ці три функції жили ВСЕРЕДИНІ board-discussions.js і були доступні
// лише Обговоренням. Через це коментарі «Стрічки» не мали ні захисту від дубля,
// ні від флуду — хоча код був написаний і працював поруч. Винесено сюди, щоб
// обидва місця користувались одним механізмом, а не двома копіями.
//
// ДВА ЛІЧИЛЬНИКИ, НАВМИСНО РІЗНІ ЗА ОХОПЛЕННЯМ:
//   times — швидкість письма, ОДНА на весь застосунок (інакше можна було б
//           флудити по 5 повідомлень у кожну тему окремо і не впертись у ліміт);
//   last  — останній текст, ОКРЕМО НА scope. «Дякую» під двома різними постами
//           стрічки — не дубль; те саме під тим самим постом — дубль.
// scope мусить збігатися з правилом на сервері, інакше людина побачить
// «надіслано», а база мовчки відхилить (Обговорення = один спільний scope,
// «Стрічка» = scope на пост — так само як у тригерах).
const LS_MSG_RATE = 'cstl-msg-rate-v1';   // { last: { scope: 'текст' }, times: [ts, …] }
// 8, а не 5 (послаблено 25.07): відповісти «дякую» п'ятьом людям поспіль — звичайна
// поведінка під популярним постом, і на шостій людина впиралась у стіну.
const FLOOD_MAX = 8;                      // максимум повідомлень
const FLOOD_WINDOW = 15000;               // за 15 секунд

// Старий формат зберігав last рядком (один глобальний). Читаємо обидва, щоб
// оновлення застосунку не спіткнулось об дані, які вже лежать на телефоні.
function lastMap(st) {
  return (st && st.last && typeof st.last === 'object') ? st.last : {};
}

// Чи це дубль попереднього надісланого в цьому ж місці
export function isDuplicateMsg(text, scope = 'default') {
  return lastMap(lsGet(LS_MSG_RATE, {}))[scope] === text;
}

// Чи людина пише занадто швидко (флуд) — рахується по всьому застосунку
export function isFlooding() {
  const now = Date.now();
  const times = (lsGet(LS_MSG_RATE, {}).times || []).filter(t => now - t < FLOOD_WINDOW);
  return times.length >= FLOOD_MAX;
}

// Зафіксувати що повідомлення надіслано (викликати ПІСЛЯ проходження перевірок)
export function recordSentMsg(text, scope = 'default') {
  const now = Date.now();
  const st = lsGet(LS_MSG_RATE, {});
  const times = (st.times || []).filter(t => now - t < FLOOD_WINDOW);
  times.push(now);
  const last = lastMap(st);
  last[scope] = text;
  lsSet(LS_MSG_RATE, { last, times });
}


// ── Середовище запуску (PWA / iOS) ───────────────────────────────────────────
// Спільне джерело правди: раніше ті самі перевірки дублювались у install-banner.js,
// а push.js їх взагалі не мав (через це дзвіночок мовчав на iPhone у Safari).

// Запущені як ВСТАНОВЛЕНИЙ додаток (з домашнього екрана), а не вкладка браузера?
// display-mode:standalone — стандарт; navigator.standalone — старий прапорець Safari iOS.
export function isStandalone() {
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
}

// iPhone/iPad? (iPadOS 13+ у UA прикидається Mac-ом — ловимо його за наявністю дотику)
export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua)
      || (/Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1);
}
