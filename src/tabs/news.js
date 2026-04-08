import { formatTime, escapeHtml } from '../core/utils.js';

let allArticles = [];
let activeGeo = 'Всі';
let activeTopic = 'Всі';

const GEO_FILTERS = ['Всі', 'Олика', 'Волинь', 'Україна', 'Світ'];
const TOPIC_FILTERS = ['Всі', 'Культура', 'Бізнес', 'Спорт', 'Технології', 'Здоров\'я', 'Екологія'];

export async function initNews() {
  try {
    const res = await fetch('./data/articles.json');
    allArticles = await res.json();
  } catch(e) {
    allArticles = [];
  }
  renderGeoFilters();
  renderTopicFilters();
  renderNews();
}

function renderGeoFilters() {
  const el = document.getElementById('geo-filters');
  if (!el) return;
  el.innerHTML = GEO_FILTERS.map(g => `
    <button class="chip ${g === activeGeo ? 'active' : ''}" onclick="setGeoFilter('${g}')">${g}</button>
  `).join('');
}

function renderTopicFilters() {
  const el = document.getElementById('topic-filters');
  if (!el) return;
  el.innerHTML = TOPIC_FILTERS.map(t => `
    <button class="chip ${t === activeTopic ? 'active' : ''}" onclick="setTopicFilter('${escapeHtml(t)}')">${escapeHtml(t)}</button>
  `).join('');
}

function getFiltered() {
  return allArticles.filter(a => {
    const geoOk = activeGeo === 'Всі' || a.geo === activeGeo;
    const topicOk = activeTopic === 'Всі' || a.category === activeTopic;
    return geoOk && topicOk;
  });
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
    <article class="news-card-featured ${hasImage ? '' : 'no-image'}" onclick="openArticle(${a.id})">
      ${hasImage ? `<img class="news-card-featured-img" src="${escapeHtml(a.image)}" alt="">` : ''}
      <div class="news-card-featured-overlay">
        <div class="news-card-meta">
          <span class="news-card-geo">${escapeHtml(a.geo)}</span>
          <span class="news-card-category">${escapeHtml(a.category)}</span>
          ${a.exclusive ? '<span class="exclusive-badge">Ексклюзив</span>' : ''}
        </div>
        <h2 class="news-card-featured-title">${escapeHtml(a.title)}</h2>
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

window.setTopicFilter = function(topic) {
  activeTopic = topic;
  renderTopicFilters();
  renderNews();
};

window.openArticle = function(id) {
  const article = allArticles.find(a => a.id === id);
  if (!article) return;

  const modal = document.getElementById('article-modal');
  const modalContent = document.getElementById('article-modal-content');
  if (!modal || !modalContent) return;

  modalContent.innerHTML = `
    <div class="article-modal-header">
      <div class="news-card-meta">
        <span class="news-card-geo">${escapeHtml(article.geo)}</span>
        <span class="news-card-category">${escapeHtml(article.category)}</span>
        ${article.exclusive ? '<span class="exclusive-badge">Ексклюзив</span>' : ''}
      </div>
      <h1 class="article-title">${escapeHtml(article.title)}</h1>
      <div class="article-byline">
        <span>${escapeHtml(article.source)}</span>
        <span>${formatTime(article.ts)}</span>
      </div>
    </div>
    ${article.image ? `<img class="article-img" src="${escapeHtml(article.image)}" alt="">` : ''}
    <div class="article-body">${escapeHtml(article.content)}</div>
    ${article.sourceUrl ? `<a class="article-source-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">Читати оригінал →</a>` : ''}
  `;

  modal.classList.add('open');
};
