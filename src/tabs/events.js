import { escapeHtml, sharePost } from '../core/utils.js';
import { isLoggedIn, requireAuth } from '../core/auth.js';

// Категорії для фільтрів (categories for filters)
const CATEGORY_FILTERS = ['Всі', 'Свята', 'Культура', 'Спорт', 'Благодійність'];

// Кольори бейджів по категорії
const CATEGORY_COLORS = {
  'Культура':      '#722F37',
  'Kino_Castle':   '#722F37',
  'Спорт':         '#1565C0',
  'Благодійність': '#B45309',
  'Свято':         '#8B6F47',  // коричневий — нейтральний для свят (державних і релігійних)
};

// Назви місяців у родовому відмінку для повної дати
const MONTHS_FULL = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];

// Скорочення для днів тижня в календарній стрічці (Tier 5)
const WEEKDAYS_SHORT = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

// Кількість днів у календарній стрічці
const CALENDAR_DAYS = 21;

let allEvents = [];
let activeFilter = 'Всі';
let selectedDate = null;  // YYYY-MM-DD або null (всі дати)

// Локальний формат YYYY-MM-DD з Date (toISOString дає UTC, що зсуває день)
function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}


// Форматує повну дату: "3 травня 2026"
function formatFullDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

// Повертає колір бейджу для категорії
function catColor(category) {
  return CATEGORY_COLORS[category] || '#722F37';
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
    'PRODID:-//CSTL LIFE//UA',
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

// HTML картки «Шо в селі» — news-стиль рядка (мініатюра зліва + текст).
// Обкладинка: фото (звичайні події) АБО emoji+gradient (свята — Wikipedia
// блокує hotlinking, тому дизайнерський cover з великим emoji, ніяких 404).
// Клік по картці → openShotamModal (повне прочитання у статейній модалці).
function cardHtml(ev) {
  const catC = catColor(ev.category);

  let thumb;
  if (ev.image) {
    thumb = `<img class="news-card-row-img" src="${escapeHtml(ev.image)}" alt="" loading="lazy">`;
  } else {
    const grad = ev.cover_gradient || 'linear-gradient(135deg, #999 0%, #555 100%)';
    thumb = `<div class="news-card-row-img shotam-cover-thumb" style="background:${escapeHtml(grad)}">${ev.cover_emoji || '📅'}</div>`;
  }

  const when = ev.time
    ? `${formatFullDate(ev.date)}, ${ev.time}`
    : formatFullDate(ev.date);
  const loc = ev.location ? ` · ${escapeHtml(ev.location)}` : '';

  return `
    <article class="news-card-row" data-id="${ev.id}">
      ${thumb}
      <div class="news-card-row-body">
        <div class="news-card-meta">
          <span class="news-badge news-badge--cat" style="background:${catC}">${escapeHtml(ev.category)}</span>
        </div>
        <h2 class="news-card-row-title">${escapeHtml(ev.title)}</h2>
        ${ev.description ? `<p class="news-card-row-excerpt">${escapeHtml(ev.description)}</p>` : ''}
        <div class="news-card-row-footer">${escapeHtml(when)}${loc}</div>
      </div>
    </article>`;
}

// Повне прочитання картки «Шо в селі» — переюзуємо статейну модалку
// (#article-modal: свайп-закриття + хрестик уже готові в app.js/index.html).
function openShotamModal(id) {
  const ev = allEvents.find(e => e.id === id);
  if (!ev) return;

  const modal        = document.getElementById('article-modal');
  const modalContent = document.getElementById('article-modal-content');
  const modalMetaTags = document.getElementById('modalMetaTags');
  if (!modal || !modalContent) return;

  const catC = catColor(ev.category);
  if (modalMetaTags) {
    modalMetaTags.innerHTML = `<span class="news-card-category">${escapeHtml(ev.category)}</span>`;
  }

  // Обкладинка: фото АБО дизайнерський emoji+gradient cover
  let cover;
  if (ev.image) {
    cover = `<img class="article-img" src="${escapeHtml(ev.image)}" alt="">`;
  } else {
    const grad = ev.cover_gradient || 'linear-gradient(135deg, #999 0%, #555 100%)';
    cover = `<div class="shotam-modal-cover" style="background:${escapeHtml(grad)}"><span>${ev.cover_emoji || '📅'}</span></div>`;
  }

  const when = ev.time
    ? `${formatFullDate(ev.date)}, ${ev.time}`
    : formatFullDate(ev.date);
  const loc = ev.location ? ` · ${escapeHtml(ev.location)}` : '';

  const bodyHtml = (ev.description || '')
    .split(/\n\n+/).map(p => p.trim()).filter(Boolean)
    .map(p => `<p class="article-p">${escapeHtml(p)}</p>`).join('');

  modalContent.innerHTML = `
    <div class="article-modal-header">
      <h1 class="article-title">${escapeHtml(ev.title)}</h1>
      <div class="article-byline"><span>${escapeHtml(when)}${loc}</span></div>
    </div>
    ${cover}
    <div class="article-body">${bodyHtml}</div>
    <div class="article-source-row">
      <div class="article-source-actions">
        <button class="ev-ics-btn" type="button">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
          </svg>
          Створити нагадування
        </button>
        <button class="share-btn share-btn--inline" type="button" data-shotam-share>📤 Поділитись</button>
      </div>
    </div>`;

  // Нагадування (.ics) — гейтинг як у Подіях (лише залогінені)
  const icsBtn = modalContent.querySelector('.ev-ics-btn');
  if (icsBtn) icsBtn.addEventListener('click', () => {
    if (!isLoggedIn()) { requireAuth('створити нагадування', () => {}); return; }
    downloadIcs(ev);
  });

  // Поділитись — Web Share API + fallback на clipboard (sharePost)
  const shareBtn = modalContent.querySelector('[data-shotam-share]');
  if (shareBtn) shareBtn.addEventListener('click', () => {
    sharePost({
      title: ev.title,
      text:  `📅 ${ev.title}\n${when}${ev.location ? ' · ' + ev.location : ''}\n\n${ev.description || ''}`,
    });
  });

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.body.classList.add('modal-open');
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

// Календарна стрічка — наступні CALENDAR_DAYS днів з точками для днів з подіями
function renderCalendar() {
  const bar = document.getElementById('events-calendar');
  if (!bar) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Множина дат з реальними локальними подіями (виключаємо auto:true RSS-новини)
  const datesWithEvents = new Set();
  allEvents.forEach(e => {
    if (e.auto) return;
    datesWithEvents.add(e.date);
  });

  // 21 день вперед
  const days = [];
  for (let i = 0; i < CALENDAR_DAYS; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(d);
  }

  const allBtn = `
    <button class="cal-pill cal-pill--all${selectedDate === null ? ' active' : ''}" data-date="">
      <span class="cal-pill-label">Всі</span>
    </button>
  `;

  const daysHtml = days.map(d => {
    const ymdStr = ymd(d);
    const isToday  = ymdStr === ymd(today);
    const hasEv    = datesWithEvents.has(ymdStr);
    const isActive = ymdStr === selectedDate;
    return `
      <button class="cal-pill${isActive ? ' active' : ''}${isToday ? ' cal-pill--today' : ''}${hasEv ? ' cal-pill--has-events' : ''}" data-date="${ymdStr}">
        <span class="cal-pill-wd">${WEEKDAYS_SHORT[d.getDay()]}</span>
        <span class="cal-pill-num">${d.getDate()}</span>
        <span class="cal-pill-dot"></span>
      </button>
    `;
  }).join('');

  bar.innerHTML = allBtn + daysHtml;

  bar.querySelectorAll('.cal-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedDate = btn.dataset.date || null;
      renderCalendar();
      renderList();
    });
  });
}

// Спільний фільтр+сорт для hero і списку — щоб обидва завжди синхронні з фільтрами.
function getFiltered() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  return allEvents
    .filter(e => {
      if (e.auto) return false;  // RSS-новини не сюди — вкладка Події тільки для локальних подій
      const d = new Date(e.date + 'T00:00:00');
      if (d < now) return false;
      if (selectedDate && e.date !== selectedDate) return false;
      if (activeFilter === 'Всі') return true;
      // Чіп «Свята» (мн.) фільтрує по категорії «Свято» (однина)
      if (activeFilter === 'Свята') return e.category === 'Свято';
      return e.category === activeFilter;
    })
    .sort((a, b) => {
      // B-17 fix: при однаковій даті сортуємо за часом (раніше — у порядку JSON).
      const byDate = new Date(a.date) - new Date(b.date);
      if (byDate !== 0) return byDate;
      return (a.time || '').localeCompare(b.time || '');
    });
}

// Рендер списку відфільтрованих подій
function renderList() {
  const el = document.getElementById('events-list');
  if (!el) return;

  const list = getFiltered();

  if (!list.length) {
    const emptyMsg = selectedDate
      ? `На ${selectedDate.split('-').reverse().slice(0, 2).join('.')} подій немає`
      : 'Подій у цій категорії поки немає';
    el.innerHTML = `<div class="empty-state">${escapeHtml(emptyMsg)}</div>`;
    return;
  }

  el.innerHTML = list.map(cardHtml).join('');

  // Клік по картці → повне прочитання у статейній модалці
  el.querySelectorAll('.news-card-row').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.id);
      if (Number.isFinite(id)) openShotamModal(id);
    });
  });
}

// Биті зображення подій → брендовий плейсхолдер (як у Новинах, ПД-10).
// error НЕ спливає → слухаємо у фазі захоплення. Вішаємо ОДИН раз (в initEvents).
function handleEvImgError(e) {
  const img = e.target;
  if (!img || img.tagName !== 'IMG') return;
  const ph = document.createElement('div');
  ph.className = img.className + ' img-fallback';
  ph.textContent = '🏰';
  img.replaceWith(ph);
}

// Точка входу — ініціалізує модуль подій.
// Підвантажуємо подвійно: events.json (мероприємства) + holidays.json (свята).
// Тримаємо в окремих файлах щоб RSS-парсер не затирав свята.
export async function initEvents() {
  const el = document.getElementById('events-list');
  if (el) {
    renderSkeleton(el);
    el.addEventListener('error', handleEvImgError, true);  // один раз на контейнер
  }

  try {
    const [evRes, holRes] = await Promise.all([
      fetch('./data/events.json'),
      fetch('./data/holidays.json'),
    ]);
    const events   = await evRes.json();
    const holData  = await holRes.json();
    const holidays = (holData.holidays || []).map(h => ({ ...h, time: null, location: null }));
    allEvents = [...events, ...holidays];
  } catch {
    allEvents = [];
  }

  renderFilters();
  renderCalendar();
  renderList();
}
