import { escapeHtml } from '../core/utils.js';

let scheduleData = null;
let activeRouteId = null;

export async function initBuses() {
  try {
    const res = await fetch('./data/schedule.json');
    scheduleData = await res.json();
  } catch(e) {
    scheduleData = null;
  }
  renderBuses();
}

function getNextDeparture(departures) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const dep of departures) {
    const [h, m] = dep.time.split(':').map(Number);
    const depMinutes = h * 60 + m;
    if (depMinutes > currentMinutes) {
      const diff = depMinutes - currentMinutes;
      if (diff < 60) return `через ${diff} хв`;
      return `через ${Math.floor(diff / 60)} год ${diff % 60} хв`;
    }
  }
  return 'завтра';
}

export function renderBuses() {
  const el = document.getElementById('buses-content');
  if (!el) return;

  if (!scheduleData) {
    el.innerHTML = '<div class="empty-state">Розклад тимчасово недоступний</div>';
    return;
  }

  const { routes, updatedAt, source } = scheduleData;

  if (!activeRouteId) activeRouteId = routes[0]?.id;

  const activeRoute = routes.find(r => r.id === activeRouteId) || routes[0];

  el.innerHTML = `
    <div class="buses-updated">
      Оновлено: ${escapeHtml(updatedAt)} · ${escapeHtml(source)}
    </div>

    <div class="route-tabs">
      ${routes.map(r => `
        <button class="route-tab ${r.id === activeRouteId ? 'active' : ''}"
                onclick="setActiveRoute('${r.id}')">
          ${escapeHtml(r.name)}
        </button>
      `).join('')}
    </div>

    ${activeRoute ? `
      <div class="route-info">
        ${activeRoute.via ? `<div class="route-via">через ${escapeHtml(activeRoute.via)}</div>` : ''}
        <div class="next-departure">
          Наступний рейс: <strong>${getNextDeparture(activeRoute.departures)}</strong>
        </div>
      </div>

      <div class="departures-list">
        ${activeRoute.departures.map(dep => {
          const [h, m] = dep.time.split(':').map(Number);
          const now = new Date();
          const isPast = (h * 60 + m) < (now.getHours() * 60 + now.getMinutes());
          return `
            <div class="departure-row ${isPast ? 'past' : ''}">
              <span class="departure-time">${escapeHtml(dep.time)}</span>
              <span class="departure-days">${escapeHtml(dep.days)}</span>
              <span class="departure-status">${isPast ? 'відправився' : 'очікується'}</span>
            </div>
          `;
        }).join('')}
      </div>
    ` : ''}
  `;
}

window.setActiveRoute = function(routeId) {
  activeRouteId = routeId;
  renderBuses();
};
