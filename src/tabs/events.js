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

// Назви місяців у родовому відмінку для повної дати
const MONTHS_FULL = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];

let allEvents = [];
let activeFilter = 'Всі';
let cardObserver = null; // IntersectionObserver для авто-згортання (auto-collapse)

// Форматує повну дату: "3 травня 2026"
function formatFullDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

// Повертає колір бейджу для категорії
function catColor(category) {
  return CATEGORY_COLORS[category] || '#C41E3A';
}

// Генерує ICS-контент (iCalendar формат) для завантаження в рідний календар
function buildIcsContent(ev) {
  const pad = n => String(n).padStart(2, '0');
  const start = new Date(ev.date + 'T' + (ev.time || '09:00') + ':00');
  const end   = new Date(start.getTime() + 2 * 60 * 60 * 1000); // +2 години
  // Форматуємо як "floating time" — без Z, без таймзони — рідний Calendar використає локальний час
  const fmt = d =>
    `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  // Екрануємо спецсимволи ICS
  const esc = s => (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CSTL NEWS//UA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:cstlnews-${ev.id}-${ev.date}@cstlnews`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(ev.title)}`,
    `DESCRIPTION:${esc(ev.description)}`,
    `LOCATION:${esc(ev.location)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:Нагадування: ${esc(ev.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// Завантажує ICS-файл — відкриває рідний Calendar на iOS/Android
function downloadIcs(ev) {
  const ics  = buildIcsContent(ev);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = ev.title.replace(/[^\wА-ЯҐЄІЇа-яґєії\d ]/g, '_') + '.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
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

// HTML-шаблон картки події з розгортуваним детальним блоком
function cardHtml(ev) {
  const bg = catColor(ev.category);

  const coverBlock = ev.image ? `
    <div class="ev-card-cover">
      <img class="ev-card-img" src="${escapeHtml(ev.image)}" alt="" loading="lazy">
    </div>` : '';

  return `
    <div class="ev-card" data-id="${ev.id}" style="--cat-color:${bg}">
      ${coverBlock}
      <div class="ev-card-body">
        <div class="ev-card-badge ev-card-badge--inline" style="background:${bg}">
          ${escapeHtml(ev.category)}
        </div>
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
            ${escapeHtml(formatFullDate(ev.date))}, ${escapeHtml(ev.time)}
          </span>
        </div>
        <div class="ev-card-expand-hint">
          <span class="ev-expand-label">Детальніше</span>
          <span class="ev-expand-chevron">›</span>
        </div>
      </div>
      <div class="ev-card-detail">
        <div class="ev-detail-body">
          <p class="ev-detail-desc">${escapeHtml(ev.description)}</p>
          <button class="ev-ics-btn" type="button" data-id="${ev.id}">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="12" y1="14" x2="12" y2="18"/>
              <line x1="10" y1="16" x2="14" y2="16"/>
            </svg>
            Створити нагадування
          </button>
          <button class="ev-detail-close" type="button">Згорнути ↑</button>
        </div>
      </div>
    </div>`;
}

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

  // Скидаємо попередній observer перед новим рендером
  if (cardObserver) { cardObserver.disconnect(); cardObserver = null; }

  // IntersectionObserver — авто-згортає картку коли вона повністю виходить за межі екрану
  cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting && entry.target.classList.contains('expanded')) {
        entry.target.classList.remove('expanded');
      }
    });
  }, { threshold: 0 });

  el.querySelectorAll('.ev-card').forEach(card => {
    cardObserver.observe(card);

    card.addEventListener('click', (e) => {
      // Клік на "Згорнути"
      if (e.target.closest('.ev-detail-close')) {
        card.classList.remove('expanded');
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      // Клік на кнопку нагадування — обробляється окремим listener нижче
      if (e.target.closest('.ev-ics-btn')) return;

      card.classList.toggle('expanded');
    });
  });

  // Окремий listener для кнопки нагадування — зупиняємо bubble щоб не закрити картку
  el.querySelectorAll('.ev-ics-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ev = allEvents.find(ev => ev.id === Number(btn.dataset.id));
      if (ev) downloadIcs(ev);
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
