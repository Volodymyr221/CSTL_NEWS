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

// ── Декодує HTML entities з RSS (напр. &laquo; → «) без ризику XSS ──
function decodeEntities(str) {
  const ta = document.createElement('textarea');
  ta.innerHTML = str || '';
  return ta.value;
}

// ── Витягує чистий HTML статті з HTML-сторінки ──────────────────────
function extractArticleHtml(htmlStr, sourceUrl) {
  const doc = new DOMParser().parseFromString(htmlStr, 'text/html');

  // Видаляємо шум: рекламу, скрипти, соцмережі
  [
    'script', 'style', 'iframe', 'form', 'button', 'input',
    '[class*="advert"]', '[class*="ad-"]', '[id*="advert"]', '[id*="google_ad"]',
    '[class*="banner"]', '[class*="social"]', '[class*="share"]',
    '[class*="related"]', '[class*="recommend"]', '[class*="comments"]',
    '[class*="subscribe"]', '[class*="newsletter"]',
    'nav', 'footer', '.sidebar', 'aside',
  ].forEach(sel => {
    try { doc.querySelectorAll(sel).forEach(el => el.remove()); } catch {}
  });

  // Специфічні селектори для відомих джерел
  let articleEl = null;
  try {
    const host = new URL(sourceUrl).hostname;
    const map = {
      'pravda.com.ua':   '.post_text',
      'ukrinform.ua':    '.newsText',
      'suspilne.media':  '.article-body, [class*="article__content"]',
      'volynpost.com':   '.article-body, .node__content',
      'konkurent.ua':    '.article-text, [class*="article-body"]',
    };
    for (const [h, sel] of Object.entries(map)) {
      if (host.includes(h)) { articleEl = doc.querySelector(sel); break; }
    }
  } catch {}

  // Загальний fallback
  if (!articleEl) {
    articleEl = doc.querySelector(
      '[itemprop="articleBody"], article, [class*="article-body"], ' +
      '[class*="article__body"], [class*="post-content"], [class*="entry-content"]'
    );
  }
  if (!articleEl) return null;

  const parts = [];
  articleEl.querySelectorAll('p, h2, h3, h4, blockquote, figure, img').forEach(node => {
    const tag = node.tagName;

    if (tag === 'FIGURE' || tag === 'IMG') {
      const img = tag === 'FIGURE' ? node.querySelector('img') : node;
      if (!img) return;
      const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
      if (!src || src.length < 10) return;
      // Пропускаємо піксельні трекінгові зображення
      const w = +(img.getAttribute('width') || 200);
      const h = +(img.getAttribute('height') || 200);
      if (w < 50 || h < 50) return;
      const alt     = img.getAttribute('alt') || '';
      const caption = tag === 'FIGURE' ? (node.querySelector('figcaption')?.textContent?.trim() || '') : '';
      parts.push(
        `<figure class="article-figure">` +
        `<img class="article-img-inline" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy">` +
        (caption ? `<figcaption class="article-caption">${escapeHtml(caption)}</figcaption>` : '') +
        `</figure>`
      );
      return;
    }

    const text = node.textContent.trim();
    if (!text || text.length < 5) return;

    if (tag === 'H2' || tag === 'H3' || tag === 'H4') {
      parts.push(`<h3 class="article-h3">${escapeHtml(text)}</h3>`);
    } else if (tag === 'BLOCKQUOTE') {
      parts.push(`<blockquote class="article-quote">${escapeHtml(text)}</blockquote>`);
    } else {
      parts.push(`<p class="article-p">${escapeHtml(text)}</p>`);
    }
  });

  return parts.length ? parts.join('') : null;
}

// ── Завантажує повну статтю через CORS proxy ─────────────────────────
async function fetchFullArticle(url, bodyEl, sourceName) {
  const PROXY = 'https://api.allorigins.win/get?url=';
  try {
    const signal = typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(10000) : undefined;
    const res = await fetch(PROXY + encodeURIComponent(url), { signal });
    const { contents } = await res.json();
    const html = extractArticleHtml(contents, url);
    if (html && bodyEl) {
      bodyEl.innerHTML =
        html +
        (sourceName ? `<p class="article-source-note">${escapeHtml(sourceName)}</p>` : '');
      return;
    }
  } catch {}
  // Якщо не вдалося — прибираємо індикатор завантаження
  bodyEl?.querySelector('.article-loading')?.remove();
}

// ── Відкриває модалку статті ─────────────────────────────────────────
window.openArticle = async function(id) {
  const article = allArticles.find(a => a.id === id);
  if (!article) return;

  const modal = document.getElementById('article-modal');
  const modalContent = document.getElementById('article-modal-content');
  if (!modal || !modalContent) return;

  // Клікабельне джерело
  const sourceHtml = article.sourceUrl
    ? `<a class="article-byline-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(article.source)}</a>`
    : `<span>${escapeHtml(article.source)}</span>`;

  // Excerpt з декодованими entities — показуємо одразу поки грузиться повна стаття
  const excerptText = decodeEntities(article.content || article.excerpt || '');

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
    <div id="article-body-content" class="article-body">
      <p class="article-p">${escapeHtml(excerptText)}</p>
      ${article.sourceUrl ? '<div class="article-loading">Завантаження повної статті…</div>' : ''}
    </div>
    ${article.sourceUrl
      ? `<a class="article-source-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">Читати оригінал →</a>`
      : ''}
  `;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden'; // задній фон не скролиться

  // Завантажуємо повну статтю асинхронно
  if (article.sourceUrl) {
    const bodyEl = document.getElementById('article-body-content');
    await fetchFullArticle(article.sourceUrl, bodyEl, article.source);
  }
};
