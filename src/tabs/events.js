import { escapeHtml } from '../core/utils.js';

// Категорії для фільтрів (categories for filters)
const CATEGORY_FILTERS = ['Всі', 'Культура', 'Спорт', 'Благодійність'];

// Кольори бейджів по категорії
const CATEGORY_COLORS = {
  'Культура':      '#C41E3A',
  'Kino_Castle':   '#C41E3A',
  'Спорт':         '#1565C0',
  'Благодійність': '#B45309',
};

// Назви місяців для бейджу дати
const MONTHS_UK = ['СІЧ','ЛЮТ','БЕР','КВІ','ТРА','ЧЕР','ЛИП','СЕР','ВЕР','ЖОВ','ЛИС','ГРУ'];

let allEvents = [];
let activeFilter = 'Всі';

// Форматує дату у вигляд "20 КВІ" для бейджу
function formatBadgeDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_UK[d.getMonth()]}`;
}

// Повертає колір бейджу для категорії
function catColor(category) {
  return CATEGORY_COLORS[category] || '#C41E3A';
}

// Генерує посилання Google Calendar з усіма полями події
function buildCalendarUrl(ev) {
  const start = new Date(ev.date + 'T' + (ev.time || '00:00') + ':00');
  const end   = new Date(start.getTime() + 2 * 60 * 60 * 1000); // +2 години
  const fmt   = dt => dt.toISOString().replace(/[-:]/g, '').split('.')[0];
  const params = new URLSearchParams({
    action:   'TEMPLATE',
    text:     ev.title,
    dates:    `${fmt(start)}/${fmt(end)}`,
    details:  ev.description || '',
    location: ev.location || '',
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

// Скелетон (skeleton — сірі блоки що переливаються) під час завантаження
function renderSkeleton(el) {
  el.innerHTML = Array(3).fill(`
    <div class="ev-skeleton">
      <div class="ev-skel-img"></div>
      <div class="ev-skel-body">
        <div class="ev-skel-line w60"></div>
        <div class="ev-skel-line w100"></div>
        <div class="ev-skel-line w80"></div>
        <div class="ev-skel-line w40"></div>
      </div>
    </div>
  `).join('');
}

// HTML-шаблон картки події
function cardHtml(ev) {
  const bg     = catColor(ev.category);
  const cover  = ev.image
    ? `<img class="ev-card-img" src="${escapeHtml(ev.image)}" alt="" loading="lazy">`
    : `<div class="ev-card-img ev-card-img--ph"></div>`;

  return `
    <div class="ev-card" data-id="${ev.id}">
      <div class="ev-card-cover">
        ${cover}
        <div class="ev-card-badge" style="background:${bg}">
          ${escapeHtml(formatBadgeDate(ev.date))}
          <span class="ev-badge-dot">·</span>
          ${escapeHtml(ev.category)}
        </div>
      </div>
      <div class="ev-card-body">
        <h3 class="ev-card-title">${escapeHtml(ev.title)}</h3>
        <p class="ev-card-desc">${escapeHtml(ev.description)}</p>
        <div class="ev-card-meta">
          <span class="ev-meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            ${escapeHtml(ev.location)}
          </span>
          <span class="ev-meta-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
            ${escapeHtml(ev.time)}
          </span>
        </div>
      </div>
    </div>`;
}

// Відкриває модальне вікно з деталями події
function openEventModal(ev) {
  const bg    = catColor(ev.category);
  const cover = ev.image
    ? `<img class="ev-modal-img" src="${escapeHtml(ev.image)}" alt="">`
    : `<div class="ev-modal-img ev-modal-img--ph"></div>`;

  document.getElementById('event-modal-content').innerHTML = `
    <div class="ev-modal-cover">
      ${cover}
      <div class="ev-modal-badge" style="background:${bg}">
        ${escapeHtml(formatBadgeDate(ev.date))}
        <span class="ev-badge-dot">·</span>
        ${escapeHtml(ev.category)}
      </div>
    </div>
    <div class="ev-modal-body">
      <h2 class="ev-modal-title">${escapeHtml(ev.title)}</h2>
      <div class="ev-modal-meta">
        <div class="ev-meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          ${escapeHtml(ev.location)}
        </div>
        <div class="ev-meta-item">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          ${escapeHtml(ev.time)}, ${escapeHtml(formatBadgeDate(ev.date))}
        </div>
      </div>
      <p class="ev-modal-desc">${escapeHtml(ev.description)}</p>
      <a class="ev-cal-btn" href="${buildCalendarUrl(ev)}" target="_blank" rel="noopener">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
        </svg>
        Додати в Google Calendar
      </a>
    </div>`;

  document.getElementById('event-modal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

// Глобальна функція закриття модалки (викликається через onclick у HTML)
window.closeEventModal = function() {
  const m = document.getElementById('event-modal');
  if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
};

// Рендер чіпів фільтрів (filter chips)
function renderFilters() {
  const bar = document.getElementById('events-filters');
  if (!bar) return;
  bar.innerHTML = CATEGORY_FILTERS.map(f =>
    `<button class="chip${f === activeFilter ? ' active' : ''}" data-f="${escapeHtml(f)}">${escapeHtml(f)}</button>`
  ).join('');
  bar.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.f;
      renderFilters();
      renderList();
    });
  });
}

// Рендер списку відфільтрованих подій
function renderList() {
  const el = document.getElementById('events-list');
  if (!el) return;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const list = allEvents
    .filter(e => {
      const d = new Date(e.date + 'T00:00:00');
      if (d < now) return false;
      return activeFilter === 'Всі' || e.category === activeFilter;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (!list.length) {
    el.innerHTML = '<div class="empty-state">Подій у цій категорії поки немає</div>';
    return;
  }

  el.innerHTML = list.map(cardHtml).join('');
  el.querySelectorAll('.ev-card').forEach(card => {
    card.addEventListener('click', () => {
      const ev = allEvents.find(e => e.id === Number(card.dataset.id));
      if (ev) openEventModal(ev);
    });
  });
}

// Точка входу — ініціалізує модуль подій
export async function initEvents() {
  const el = document.getElementById('events-list');
  if (el) renderSkeleton(el);

  try {
    const res = await fetch('./data/events.json');
    allEvents  = await res.json();
  } catch {
    allEvents = [];
  }

  renderFilters();
  renderList();
}
