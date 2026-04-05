import { formatEventDate, escapeHtml } from '../core/utils.js';

let allEvents = [];

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

  el.innerHTML = upcoming.map(ev => `
    <div class="event-card">
      ${ev.image ? `<img class="event-card-img" src="${escapeHtml(ev.image)}" alt="">` : ''}
      <div class="event-card-body">
        <div class="event-card-date">${formatEventDate(ev.date)} · ${escapeHtml(ev.time)}</div>
        <h3 class="event-card-title">${escapeHtml(ev.title)}</h3>
        <p class="event-card-desc">${escapeHtml(ev.description)}</p>
        <div class="event-card-location">
          <span class="location-icon">📍</span> ${escapeHtml(ev.location)}
        </div>
      </div>
    </div>
  `).join('');
}
