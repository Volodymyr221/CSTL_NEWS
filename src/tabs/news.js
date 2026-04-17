import { formatTime, escapeHtml } from '../core/utils.js';

let allArticles = [];
let activeGeo = 'Всі';

const GEO_FILTERS = ['Всі', 'Олика', 'Волинь', 'Україна', 'Світ'];

export async function initNews() {
  try {
    const res = await fetch('./data/articles.json');
    allArticles = await res.json();
  } catch(e) {
    allArticles = [];
  }
  renderGeoFilters();
  renderNews();
}

function renderGeoFilters() {
  const el = document.getElementById('geo-filters');
  if (!el) return;
  el.innerHTML = GEO_FILTERS.map(g => `
    <button class="chip ${g === activeGeo ? 'active' : ''}" onclick="setGeoFilter('${g}')">${g}</button>
  `).join('');
}

function getFiltered() {
  return allArticles.filter(a => activeGeo === 'Всі' || a.geo === activeGeo);
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

function renderFeatured(a) {
  const hasImage = !!a.image;
  return `
    <article class="news-card-featured ${hasImage ? '' : 'no-image'}${a.exclusive ? ' exclusive' : ''}" onclick="openArticle(${a.id})">
      ${hasImage ? `<img class="news-card-featured-img" src="${escapeHtml(a.image)}" alt="">` : ''}
      <div class="news-card-featured-overlay">
        <div class="news-card-meta">
          <span class="news-card-geo">${escapeHtml(a.geo)}</span>
          <span class="news-card-category">${escapeHtml(a.category)}</span>
          ${a.exclusive ? '<span class="exclusive-badge">Ексклюзив</span>' : ''}
        </div>
        <h2 class="news-card-featured-title">${escapeHtml(a.title)}</h2>
        ${!hasImage && a.excerpt ? `<p class="news-card-featured-excerpt">${escapeHtml(a.excerpt)}</p>` : ''}
        <div class="news-card-featured-footer">${escapeHtml(a.source)} · ${formatTime(a.ts)}</div>
      </div>
    </article>
  `;
}

function renderRow(a) {
  return `
    <article class="news-card-row ${a.exclusive ? 'exclusive' : ''}" onclick="openArticle(${a.id})">
      ${a.image ? `<img class="news-card-row-img" src="${escapeHtml(a.image)}" alt="">` : ''}
      <div class="news-card-row-body">
        <div class="news-card-meta">
          <span class="news-card-geo">${escapeHtml(a.geo)}</span>
          <span class="news-card-category">${escapeHtml(a.category)}</span>
          ${a.exclusive ? '<span class="exclusive-badge">Ексклюзив</span>' : ''}
        </div>
        <h2 class="news-card-row-title">${escapeHtml(a.title)}</h2>
        ${a.excerpt ? `<p class="news-card-row-excerpt">${escapeHtml(a.excerpt)}</p>` : ''}
        <div class="news-card-row-footer">${escapeHtml(a.source)} · ${formatTime(a.ts)}</div>
      </div>
    </article>
  `;
}

window.setGeoFilter = function(geo) {
  activeGeo = geo;
  renderGeoFilters();
  renderNews();
};

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

window.openArticle = function(id) {
  const article = allArticles.find(a => a.id === id);
  if (!article) return;

  const modal = document.getElementById('article-modal');
  const modalContent = document.getElementById('article-modal-content');
  if (!modal || !modalContent) return;

  const sourceHtml = article.sourceUrl
    ? `<a class="article-byline-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(article.source)}</a>`
    : `<span>${escapeHtml(article.source)}</span>`;

  const bodyHtml = renderArticleBody(article.content || article.excerpt || '');

  modalContent.innerHTML = `
    <div class="article-modal-header">
      <div class="news-card-meta">
        <span class="news-card-geo">${escapeHtml(article.geo)}</span>
        <span class="news-card-category">${escapeHtml(article.category)}</span>
        ${article.exclusive ? '<span class="exclusive-badge">Ексклюзив</span>' : ''}
      </div>
      <h1 class="article-title">${escapeHtml(article.title)}</h1>
      <div class="article-byline">
        ${sourceHtml}
        <span>${formatTime(article.ts)}</span>
      </div>
    </div>
    ${article.image ? `<img class="article-img" src="${escapeHtml(article.image)}" alt="">` : ''}
    <div class="article-body">${bodyHtml}</div>
    ${article.sourceUrl
      ? `<a class="article-source-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">Читати оригінал →</a>`
      : ''}
  `;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.body.classList.add('modal-open');
};
