import { formatTime, escapeHtml, sharePost } from '../core/utils.js';

let allArticles = [];

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
  'Громада': '#722F37',  // бордо — наш бренд (Олика + села громади)
  'Олика':   '#722F37',  // стара назва — лишаємо для сумісності
  'Волинь':  '#9e7508',  // золотий
  'Україна': '#0057B7',  // синій
  'Світ':    '#546e7a',  // нейтрально-сірий
  'Україна та Світ': '#0057B7',  // синій — злитий розділ (на випадок майбутнього geo)
};

function catColor(c) { return CATEGORY_COLORS[c] || '#546e7a'; }
function geoColor(g) { return GEO_COLORS[g]      || '#546e7a'; }

// Точка входу. Стрічка новин тепер живе блоком у вкладці Громада
// (renderCommunityNews), тому тут лише завантажуємо статті і вішаємо
// слухач модалки статті (модалку відкриває блок Громади через openArticle).
export async function initNews() {
  await ensureNewsLoaded();
  attachNewsListeners();
}

// Слухач модалки статті (share + плейсхолдер битих фото).
function attachNewsListeners() {
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
    // Биті зображення у модалці статті → плейсхолдер
    modal.addEventListener('error', handleImgError, true);
  }
}

// Фото-плейсхолдер: якщо зовнішнє зображення не завантажилось (Конкурент та ін.
// часто блокують хотлінк) — замінюємо биту картинку на брендовий плейсхолдер
// замість системного «?». error НЕ спливає, тому слухаємо у фазі захоплення.
function handleImgError(e) {
  const img = e.target;
  if (!img || img.tagName !== 'IMG') return;
  const ph = document.createElement('div');
  ph.className = img.className + ' img-fallback';
  ph.textContent = '🏰';
  img.replaceWith(ph);
}

// HTML стрічки: перша картка — featured, решта — рядки. Порожньо → плейсхолдер.
// Експортовано для перевикористання у блоці новин вкладки «Громада» (05.07).
// opts.compact = true → усі картки рядками (без великої featured) для блока Громади.
export function newsCardsHtml(articles, opts = {}) {
  if (!articles || articles.length === 0) {
    return '<div class="empty-state">Новин за цим фільтром поки немає</div>';
  }
  if (opts.compact) return articles.map(renderRow).join('');
  return articles.map((a, i) => i === 0 ? renderFeatured(a) : renderRow(a)).join('');
}

// Завантажує статті раз і віддає масив (для блоку Громади, щоб openArticle їх бачив).
export async function ensureNewsLoaded() {
  if (!allArticles.length) {
    try {
      const res = await fetch('./data/articles.json');
      allArticles = await res.json();
    } catch (e) {
      allArticles = [];
    }
  }
  return allArticles;
}

// HTML для двох кольорових бейджів (geo + category) — використовується у обох картках
function badgesHtml(a) {
  return `
    <span class="news-badge news-badge--geo" style="background:${geoColor(a.geo)}">${escapeHtml(a.geo)}</span>
    <span class="news-badge news-badge--cat" style="background:${catColor(a.category)}">${escapeHtml(a.category)}</span>
    ${a.exclusive ? '<span class="news-badge news-badge--excl">⭐ Ексклюзив</span>' : ''}
    ${a.imageType === 'illustration' ? '<span class="news-badge news-badge--illus">🖼 Ілюстрація</span>' : ''}
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

export function openArticle(id) {
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
    ${article.image && (article.imageType === 'illustration' || article.imageCredit) ? `
      <div class="article-img-caption">
        ${article.imageType === 'illustration' ? '<strong>Ілюстрація.</strong> ' : ''}${article.imageCredit ? 'Фото: ' + escapeHtml(article.imageCredit) : ''}
      </div>` : ''}
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
