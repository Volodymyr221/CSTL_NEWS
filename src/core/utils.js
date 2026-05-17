// Форматування часу: "щойно", "5 хв тому", "2 год тому", "12 квітня"
export function formatTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'щойно';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' хв тому';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' год тому';
  return new Date(ts).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
}

// Захист від XSS (підставлення шкідливого HTML коду)
export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
export function showToast(msg, duration = 3000) {
  let toast = document.getElementById('cstl-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'cstl-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), duration);
}
