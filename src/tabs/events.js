import { formatEventDate, escapeHtml } from '../core/utils.js';

let allEvents = [];

// Кольори акцентів для кожної категорії (category — тематична група події)
const CATEGORY_COLORS = {
  'Культура':  '#9b59b6',
  'Спорт':     '#2ecc71',
  'Громада':   '#A31D1D',
  'Для дітей': '#f1c40f',
};

export async function initEvents() {
  try {
    const res = await fetch('./data/events.json');
    allEvents = await res.json();
  } catch(e) {
    allEvents = [];
  }
  renderEvents();
}

export function renderEvents() {
  const el = document.getElementById('events-list');
  if (!el) return;

  const now = new Date();
  const upcoming = allEvents
    .filter(e => new Date(e.date) >= new Date(now.toDateString()))
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  if (upcoming.length === 0) {
    el.innerHTML = '<div class="empty-state">Найближчих подій поки немає</div>';
    return;
  }

  el.innerHTML = upcoming.map(ev => renderEventCard(ev)).join('');
}

function renderEventCard(ev) {
  const color = CATEGORY_COLORS[ev.category] || '#888';
  // box-shadow inset (тінь всередину) — створює кольорову смугу зліва без впливу на розмір картки
  return `
    <div class="event-card" style="box-shadow: inset 3px 0 0 0 ${color}" onclick="openEvent(${ev.id})">
      ${ev.image ? `<img class="event-card-img" src="${escapeHtml(ev.image)}" alt="">` : ''}
      <div class="event-card-body">
        <span class="event-category-tag" style="color:${color}">${escapeHtml(ev.category || '')}</span>
        <div class="event-card-date">${formatEventDate(ev.date)} · ${escapeHtml(ev.time)}</div>
        <h3 class="event-card-title">${escapeHtml(ev.title)}</h3>
        <p class="event-card-desc">${escapeHtml(ev.description)}</p>
        <div class="event-card-location">
          <span class="location-icon">📍</span> ${escapeHtml(ev.location)}
        </div>
      </div>
    </div>
  `;
}

// Відкрити модальне вікно з повною інформацією про подію
window.openEvent = function(id) {
  const ev = allEvents.find(e => e.id === id);
  if (!ev) return;

  const color = CATEGORY_COLORS[ev.category] || '#888';
  const modal = document.getElementById('article-modal');
  const content = document.getElementById('article-modal-content');
  if (!modal || !content) return;

  content.innerHTML = `
    <div class="article-modal-header">
      <span class="event-category-tag" style="color:${color}">${escapeHtml(ev.category || '')}</span>
      <h1 class="article-title">${escapeHtml(ev.title)}</h1>
      <div class="article-byline" style="flex-direction:column; gap:6px">
        <span>📅 ${formatEventDate(ev.date)} · ${escapeHtml(ev.time)}</span>
        <span>📍 ${escapeHtml(ev.location)}</span>
      </div>
    </div>
    <div class="article-body">${escapeHtml(ev.description)}</div>
  `;

  modal.classList.add('open');
};
