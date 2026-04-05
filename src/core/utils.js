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
