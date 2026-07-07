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

// Форматування дати події: "12 квітня, субота"
export function formatEventDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', weekday: 'long' });
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
export function attachSwipe(el, onLeft, onRight) {
  let startX = null, startY = null;
  el.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
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

// Web Share API — поділитись контентом через рідне меню iOS/Android.
// iOS Safari відкриває меню з Viber/Telegram/Messenger/SMS одним тапом.
// Fallback: copy URL у clipboard + toast «Скопійовано».
// Стратегія віральності з docs/COMMUNITY_BOARD_VISION.md.
export async function sharePost({ title, text, url }) {
  const shareData = {
    title: title || 'CSTL LIFE',
    text:  text || '',
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
export function showToast(msg, duration = 3000, type = '') {
  let toast = document.getElementById('cstl-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cstl-toast';
    toast.className = 'toast';   // без цього класу CSS .toast не діяв → тост опинявся у потоці сторінки (під модалками)
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.toggle('toast--error', type === 'error');
  toast.classList.add('visible');
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove('visible'), duration);
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

// Сильні стеми — блокуємо слово якщо воно ПОЧИНАЄТЬСЯ з них.
// Перевірені щоб НЕ чіпати легальні: художник/худий/хустка/хутро/хуліган,
// мандарин/мандат, педикюр, тупіт, корабля, сучок, гнідий, ідіома, шлюб, лоша.
const PROFANITY_STEMS = [
  // нецензурні (укр + рос)
  'хуй', 'хує', 'хуя', 'хуї', 'хуйл', 'хуєс',
  'пизд', 'пізд', 'бляд', 'блят',
  'єб', 'еб', 'їб', 'йоб', 'наєб', 'наеб', 'наїб', 'заєб', 'заїб',
  'виєб', 'виїб', 'доїб', 'уїб', 'уєб', 'уеб',
  'залуп', 'гандон', 'гондон', 'мудак', 'мудил',
  'підар', 'підор', 'пидор', 'пидар', 'наху', 'похуй',
  'дроч', 'сцук', 'сцикл', 'курв', 'сволоч', 'гівн', 'говн',
  'срак', 'сран', 'жоп', 'мраз', 'шлюх', 'шльондр', 'падл',
  'довбо', 'долбо', 'скотин', 'тварюк', 'козлин', 'лошар',
  // образи
  'ідіот', 'кретин', 'придур', 'імбецил', 'дебіл', 'дебил', 'дибіл', 'дибил',
];
// Ризиковані короткі — лише ПОВНИМ словом (prefix дав би хибу: «сукня», «корабля», «педикюр»…)
const PROFANITY_EXACT = new Set([
  'бля', 'сука', 'суки', 'суку', 'сучка', 'сучки', 'хер',
  'лох', 'лоха', 'лохи', 'манда', 'манди',
  'педик', 'педики', 'педік', 'педіки', 'пєдік', 'пєдик', 'пєдики',
  'гнида', 'гниди', 'дурак', 'дурень', 'дурний', 'дурна', 'дурне', 'дурні',
  'тупий', 'тупа', 'тупе', 'тупиця', 'тупиці', 'козел', 'козли',
  'даун', 'бовдур', 'скот',
]);
// Ультра-безпечні стеми для «squashed» проходу (рознесене «х у й») — майже не трапляються всередині легальних слів
const PROFANITY_SQUASH = ['хуй', 'хуйл', 'пизд', 'пізд', 'єбал', 'їбал', 'йоб', 'бляд', 'блят', 'мудак', 'підор', 'пидор'];
// Трансліт латиницею + англ. — окремий прохід (leet + два варіанти '1').
// Стеми ДОВШІ, щоб не чіпати легальні англ. слова (не 'suk'/'ass'/'dick'/'cunt' prefix).
const PROFANITY_LATIN = [
  // рос/укр трансліт
  'huy', 'hui', 'huil', 'huyl', 'huylo', 'huilo', 'huesos', 'xyu',
  'pizd', 'pizda', 'yeban', 'ebal', 'ebat', 'zaeb', 'doeb', 'vyeb',
  'blya', 'blyad', 'blyat', 'suka', 'suchka', 'suchara',
  'pidor', 'pidar', 'pidoras', 'mudak', 'mudil', 'zalupa', 'gandon', 'gondon',
  'dolboeb', 'dolbaeb', 'mraz', 'nahui', 'nahuy', 'nahyi', 'nahren',
  'pohui', 'pohuy', 'yoban', 'yobn', 'govno', 'gavno', 'durak',
  // англ.
  'fuck', 'fuk', 'fuq', 'shit', 'bullshit', 'bitch', 'biatch', 'asshole',
  'motherfuck', 'faggot', 'nigger', 'nigga', 'whore', 'wanker', 'bollock',
  'dickhead', 'jackass', 'dumbass', 'retard', 'bastard', 'douche',
];
// Для «squashed» латинського проходу (рознесене «b l y a t»): ЛИШЕ довгі транслітформи,
// безпечні як підрядок. БЕЗ англ./коротких (інакше «this hit»→«thishit»→shit; «rapid order»→pidor).
const PROFANITY_LATIN_SQUASH = ['blyat', 'pizda', 'nahui', 'pidoras', 'zalupa', 'dolboeb'];

// true якщо текст містить матюк/образу
export function containsProfanity(text) {
  const norm = normalizeForFilter(text);
  // 1) по словах (кирилиця + гомогліфи + leet)
  const words = norm.split(/[^а-яіїєґ'a-z]+/).filter(Boolean);
  for (const w of words) {
    if (PROFANITY_EXACT.has(w)) return true;
    if (PROFANITY_STEMS.some(s => w.startsWith(s))) return true;
  }
  // 2) «squashed» кирилиця — прибрати все крім літер, шукати ультра-безпечні стеми
  const squashed = norm.replace(/[^а-яіїєґa-z]/g, '');
  if (PROFANITY_SQUASH.some(s => squashed.includes(s))) return true;
  // 3) трансліт латиницею + leet. '1' неоднозначна → пробуємо i та l (blyat vs b1tch).
  const latinBase = deleet(String(text || '').toLowerCase().replace(/(.)\1{2,}/g, '$1'));
  for (const one of ['i', 'l']) {
    const v = latinBase.replace(/1/g, one);
    for (const w of v.split(/[^a-z]+/).filter(Boolean)) {
      if (PROFANITY_LATIN.some(s => w.startsWith(s))) return true;
    }
    if (PROFANITY_LATIN_SQUASH.some(s => v.replace(/[^a-z]/g, '').includes(s))) return true;
  }
  return false;
}

// true якщо текст схожий на спам/беззмістовний набір (консервативно — щоб не блокувати «Ок»/«Так»)
export function looksLikeSpam(text) {
  const t = String(text || '').trim();
  if (t.length === 1) return true;                       // одна літера
  if (/(.)\1{5,}/.test(t)) return true;                  // символ повторено ≥6 разів
  const letters = t.replace(/[^а-яіїєґa-zА-ЯІЇЄҐA-Z]/g, '');
  if (letters.length >= 12 && !/[аеиіоуяюєїёauoiey]/i.test(letters)) return true; // довге без голосних = клавіатурний набір
  return false;
}

