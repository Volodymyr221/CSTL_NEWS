import { formatTime, escapeHtml, sharePost } from '../core/utils.js';

let allArticles = [];
let activeGeo = 'Всі';

// ТЗ парсерів (рішення Роми+Вови 01.07): «Україна» + «Світ» злиті в один розділ
// «Україна та Світ». Дані лишаються з geo Україна/Світ окремо (без міграції) —
// чіп-фільтр показує обидва разом (див. getFiltered).
const UA_WORLD = 'Україна та Світ';
const GEO_FILTERS = ['Всі', 'Олика', 'Волинь', UA_WORLD];

// Кольори категорій — pill-бейдж на картці новини (Tier 6 — 17.05.2026)
const CATEGORY_COLORS = {
  'Суспільство':  '#37474f',  // темно-сірий (новинний)
  'Політика':     '#1a237e',  // navy
  'Війна':        '#722F37',  // бордо
  'Економіка':    '#2E5E1F',  // зелений (гроші)
  'Бізнес':       '#2E5E1F',  // зелений
  'Спорт':        '#1565C0',  // синій
  'Культура':     '#B45309',  // теракот
  'Технології':   '#455a64',  // сіро-синій
  'Здоровʼя':     '#C2185B',  // медичний
  'Освіта':       '#6a1b9a',  // фіолетовий
  'Природа':      '#2e7d32',  // природний зелений
  'Історія':      '#6d4c41',  // сепія-коричневий (історичні «історії Олики»)
};

// Кольори гео-бейджів — звідки новина (наш бренд Олика — найвиразніший)
const GEO_COLORS = {
  'Олика':   '#722F37',  // бордо — наш бренд
  'Волинь':  '#9e7508',  // золотий
  'Україна': '#0057B7',  // синій
  'Світ':    '#546e7a',  // нейтрально-сірий
  'Україна та Світ': '#0057B7',  // синій — злитий розділ (на випадок майбутнього geo)
};

function catColor(c) { return CATEGORY_COLORS[c] || '#546e7a'; }
function geoColor(g) { return GEO_COLORS[g]      || '#546e7a'; }

// Перемикач підрозділів вкладки Новини: 'news' | 'events'.
// Події переїхали сюди зі старої вкладки «Події» — рендеряться у власні id
// (#events-*), тут лише показуємо/ховаємо відповідний підрозділ.
export function showNewsSegment(seg) {
  const isEvents = seg === 'events';
  const paneNews = document.getElementById('news-seg-news');
  const paneEv   = document.getElementById('news-seg-events');
  if (paneNews) paneNews.style.display = isEvents ? 'none' : 'block';
  if (paneEv)   paneEv.style.display   = isEvents ? 'block' : 'none';
  document.querySelectorAll('.news-seg-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.newsSeg === seg));
}
// Доступ ззовні (напр. switchTab('events') перенаправляє сюди)
window.cstlShowNewsSegment = showNewsSegment;

export async function initNews() {
  try {
    const res = await fetch('./data/articles.json');
    allArticles = await res.json();
  } catch(e) {
    allArticles = [];
  }
  renderGeoFilters();
  renderNews();
  attachNewsListeners();
}

// B-15 fix: event delegation замість inline onclick (XSS hardening).
// Один listener на батьківському контейнері ловить клік на дочірніх .chip / .news-card-*.
function attachNewsListeners() {
  // Сегмент-перемикач Новини | Події
  document.querySelectorAll('.news-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => showNewsSegment(btn.dataset.newsSeg));
  });

  const filters = document.getElementById('geo-filters');
  if (filters) {
    filters.addEventListener('click', e => {
      const chip = e.target.closest('.chip[data-geo]');
      if (!chip) return;
      setGeoFilter(chip.dataset.geo);
    });
  }

  const list = document.getElementById('news-list');
  if (list) {
    list.addEventListener('click', e => {
      const card = e.target.closest('[data-article-id]');
      if (!card) return;
      const id = Number(card.dataset.articleId);
      if (Number.isFinite(id)) openArticle(id);
    });
  }

  // Кнопка 📤 «Поділитись» у модалці статті — Web Share API + fallback на clipboard.
  // Стратегія віральності з docs/COMMUNITY_BOARD_VISION.md.
  const modal = document.getElementById('article-modal');
  if (modal) {
    modal.addEventListener('click', e => {
      const btn = e.target.closest('[data-share-article]');
      if (!btn) return;
      sharePost({
        title: btn.dataset.shareTitle,
        text:  btn.dataset.shareText,
        url:   btn.dataset.shareUrl,
      });
    });
  }
}

function renderGeoFilters() {
  const el = document.getElementById('geo-filters');
  if (!el) return;
  el.innerHTML = GEO_FILTERS.map(g => `
    <button class="chip ${g === activeGeo ? 'active' : ''}" data-geo="${escapeHtml(g)}">${escapeHtml(g)}</button>
  `).join('');
}

function getFiltered() {
  // B-12 fix: сортуємо за ts (новіші зверху), щоб featured завжди була найсвіжіша.
  return allArticles
    .filter(a => {
      if (activeGeo === 'Всі') return true;
      // Злитий розділ: «Україна та Світ» показує обидва geo разом
      if (activeGeo === UA_WORLD) return a.geo === 'Україна' || a.geo === 'Світ';
      return a.geo === activeGeo;
    })
    .slice()
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

export function renderNews() {
  const el = document.getElementById('news-list');
  if (!el) return;

  const articles = getFiltered();

  if (articles.length === 0) {
    el.innerHTML = '<div class="empty-state">Новин за цим фільтром поки немає</div>';
    return;
  }

  el.innerHTML = articles.map((a, i) => i === 0 ? renderFeatured(a) : renderRow(a)).join('');
}

// HTML для двох кольорових бейджів (geo + category) — використовується у обох картках
function badgesHtml(a) {
  return `
    <span class="news-badge news-badge--geo" style="background:${geoColor(a.geo)}">${escapeHtml(a.geo)}</span>
    <span class="news-badge news-badge--cat" style="background:${catColor(a.category)}">${escapeHtml(a.category)}</span>
    ${a.exclusive ? '<span class="news-badge news-badge--excl">⭐ Ексклюзив</span>' : ''}
  `;
}

function renderFeatured(a) {
  const hasImage = !!a.image;
  return `
    <article class="news-card-featured ${hasImage ? '' : 'no-image'}${a.exclusive ? ' exclusive' : ''}" data-article-id="${a.id}">
      ${hasImage ? `<img class="news-card-featured-img" src="${escapeHtml(a.image)}" alt="" loading="lazy">` : ''}
      <div class="news-card-featured-overlay">
        <div class="news-card-meta">${badgesHtml(a)}</div>
        <h2 class="news-card-featured-title">${escapeHtml(a.title)}</h2>
        ${!hasImage && a.excerpt ? `<p class="news-card-featured-excerpt">${escapeHtml(a.excerpt)}</p>` : ''}
        <div class="news-card-featured-footer">${escapeHtml(a.source)} · ${formatTime(a.ts)}</div>
      </div>
    </article>
  `;
}

function renderRow(a) {
  return `
    <article class="news-card-row ${a.exclusive ? 'exclusive' : ''}" data-article-id="${a.id}">
      ${a.image ? `<img class="news-card-row-img" src="${escapeHtml(a.image)}" alt="" loading="lazy">` : ''}
      <div class="news-card-row-body">
        <div class="news-card-meta">${badgesHtml(a)}</div>
        <h2 class="news-card-row-title">${escapeHtml(a.title)}</h2>
        ${a.excerpt ? `<p class="news-card-row-excerpt">${escapeHtml(a.excerpt)}</p>` : ''}
        <div class="news-card-row-footer">${escapeHtml(a.source)} · ${formatTime(a.ts)}</div>
      </div>
    </article>
  `;
}

function setGeoFilter(geo) {
  activeGeo = geo;
  renderGeoFilters();
  renderNews();
}

// Декодує HTML entities (&laquo; → «) без ризику XSS через textarea
function decodeEntities(str) {
  const ta = document.createElement('textarea');
  ta.innerHTML = str || '';
  return ta.value;
}

// Рендерить текст статті: розбиває по \n\n → окремі <p> теги
function renderArticleBody(content) {
  const text = decodeEntities(content || '');
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(Boolean);
  if (!paragraphs.length) return '';
  return paragraphs.map(p => `<p class="article-p">${escapeHtml(p)}</p>`).join('');
}

function openArticle(id) {
  const article = allArticles.find(a => a.id === id);
  if (!article) return;

  const modal = document.getElementById('article-modal');
  const modalContent = document.getElementById('article-modal-content');
  const modalMetaTags = document.getElementById('modalMetaTags');
  if (!modal || !modalContent) return;

  const sourceHtml = article.sourceUrl
    ? `<a class="article-byline-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(article.source)}</a>`
    : `<span>${escapeHtml(article.source)}</span>`;

  // Беремо найдовший доступний текст, декодуємо HTML entities
  const rawText = (article.content && article.content.length > (article.excerpt || '').length)
    ? article.content
    : (article.excerpt || article.content || '');
  const bodyHtml = renderArticleBody(rawText);

  if (modalMetaTags) {
    modalMetaTags.innerHTML = `
      <span class="news-card-geo">${escapeHtml(article.geo)}</span>
      <span class="modal-meta-sep">•</span>
      <span class="news-card-category">${escapeHtml(article.category)}</span>
      ${article.exclusive ? '<span class="exclusive-badge">Ексклюзив</span>' : ''}
    `;
  }

  modalContent.innerHTML = `
    <div class="article-modal-header">
      <h1 class="article-title">${escapeHtml(article.title)}</h1>
      <div class="article-byline">
        ${sourceHtml}
        <span>${formatTime(article.ts)}</span>
      </div>
    </div>
    ${article.image ? `<img class="article-img" src="${escapeHtml(article.image)}" alt="">` : ''}
    <div class="article-body">${bodyHtml}</div>
    ${!article.exclusive && article.sourceUrl && rawText.trim().length < 600 ? `
      <div class="article-short-note">
        Джерело надає лише анонс через RSS — повний текст на сайті видання.
        <a class="article-short-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">Читати повністю →</a>
      </div>
    ` : ''}
    <div class="article-source-row">
      <span class="article-source-author"><strong>Автор публікації:</strong><br>${escapeHtml(article.source)}</span>
      <div class="article-source-actions">
        <button class="share-btn share-btn--inline" type="button"
                data-share-article
                data-share-title="${escapeHtml(article.title)}"
                data-share-text="${escapeHtml(article.excerpt || '')}"
                data-share-url="${escapeHtml(article.sourceUrl || location.href)}">
          📤 Поділитись
        </button>
        ${article.sourceUrl
          ? `<a class="article-source-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">Читати оригінал →</a>`
          : ''}
      </div>
    </div>
  `;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.body.classList.add('modal-open');
};
