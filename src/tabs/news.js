import { formatTime, escapeHtml, sharePost, showToast } from '../core/utils.js';
import { ICONS } from '../core/icons.js';

let allArticles = [];

// Батч 5.3: збереження статей (нове — раніше save для статей не існував).
// Зберігаємо лише id (не контент — контент завжди з data/articles.json, правило CLAUDE.md).
const SAVED_KEY = 'cstl_saved_articles';
export function getSavedArticleIds() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); } catch { return []; }
}
function toggleSavedArticle(id) {
  const ids = getSavedArticleIds();
  const idx = ids.indexOf(id);
  if (idx === -1) ids.push(id); else ids.splice(idx, 1);
  localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
  return idx === -1;   // true = щойно збережено
}

// Базові категорії (рішення Вови 21.07): лише 4. Кольори лишаємо тільки для них.
const CATEGORY_COLORS = {
  'Суспільство':  '#37474f',  // темно-сірий (новинний) — дефолт
  'Культура':     '#B45309',  // теракот
  'Спорт':        '#1565C0',  // синій
  'Економіка':    '#2E5E1F',  // зелений (гроші)
};
// Звід старих/AI-категорій до 4 базових (щоб бейдж мав колір і назву з набору).
const CATEGORY_ALIAS = {
  'Політика': 'Суспільство', 'Влада': 'Суспільство', 'Війна': 'Суспільство',
  'Технології': 'Суспільство', 'Природа': 'Суспільство', 'Освіта': 'Суспільство',
  'Здоровʼя': 'Суспільство', "Здоров'я": 'Суспільство',
  'Історія': 'Культура',
  'Бізнес': 'Економіка',
};
// Будь-яку категорію зводимо до однієї з 4 базових (невідому → Суспільство).
function normCategory(c) {
  return CATEGORY_ALIAS[c] || (CATEGORY_COLORS[c] ? c : 'Суспільство');
}

// Кольори гео-бейджів — звідки новина (наш бренд Олика — найвиразніший)
const GEO_COLORS = {
  'Громада': '#722F37',  // бордо — наш бренд (Олика + села громади)
  'Олика':   '#722F37',  // стара назва — лишаємо для сумісності
  'Волинь':  '#9e7508',  // золотий
  'Україна': '#0057B7',  // синій
  'Світ':    '#546e7a',  // нейтрально-сірий
  'Україна та Світ': '#0057B7',  // синій — злитий розділ (на випадок майбутнього geo)
};

function catColor(c) { return CATEGORY_COLORS[normCategory(c)] || '#546e7a'; }
function geoColor(g) { return GEO_COLORS[g]      || '#546e7a'; }

// Точка входу. Стрічка новин тепер живе блоком у вкладці Громада
// (renderCommunityNews), тому тут лише завантажуємо статті і вішаємо
// слухач модалки статті (модалку відкриває блок Громади через openArticle).
export async function initNews() {
  await ensureNewsLoaded();
  attachNewsListeners();
}

// Слухач модалки статті (плейсхолдер битих фото; share тепер через header-іконку в openArticle).
function attachNewsListeners() {
  const modal = document.getElementById('article-modal');
  if (modal) {
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

// Для хаба «Збережені» (Б5.4) — статті за списком id, у порядку id (найновіші збережені зверху).
export async function getArticlesByIds(ids) {
  await ensureNewsLoaded();
  return ids.map(id => allArticles.find(a => a.id === id)).filter(Boolean);
}

// HTML для двох кольорових бейджів (geo + category) — використовується у обох картках
function badgesHtml(a) {
  return `
    <span class="news-badge news-badge--geo" style="background:${geoColor(a.geo)}">${escapeHtml(a.geo)}</span>
    <span class="news-badge news-badge--cat" style="background:${catColor(a.category)}">${escapeHtml(normCategory(a.category))}</span>
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
      <span class="news-card-category">${escapeHtml(normCategory(article.category))}</span>
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
    ${article.author ? `
      <div class="article-author"><span class="article-author-ic">${ICONS.user}</span><strong>Автор:</strong> ${escapeHtml(article.author)}</div>
    ` : ''}
    <div class="article-body">${bodyHtml}</div>
    ${!article.exclusive && article.sourceUrl && !article.fullText && rawText.trim().length < 600 ? `
      <div class="article-short-note">
        Джерело надає лише анонс через RSS — повний текст на сайті видання.
        <a class="article-short-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">Читати повністю →</a>
      </div>
    ` : ''}
    <div class="article-source-row">
      <span class="article-source-author"><strong>Джерело:</strong><br>${escapeHtml(article.source)}</span>
      ${article.sourceUrl
        ? `<a class="article-source-link" href="${escapeHtml(article.sourceUrl)}" target="_blank" rel="noopener">Читати оригінал →</a>`
        : ''}
    </div>
  `;

  // Батч 5.3: іконки зверху модалки (спільні кнопки — onclick перезаписуємо щоразу).
  const shareBtn  = document.getElementById('modal-share-btn');
  const remindBtn = document.getElementById('modal-remind-btn');
  const saveBtn   = document.getElementById('modal-save-btn');
  // Векторні іконки замість емодзі (Вова 14.07) — з ICONS, у стилі додатку.
  if (shareBtn)  shareBtn.innerHTML  = ICONS.share;
  if (remindBtn) remindBtn.innerHTML = ICONS.bell;
  if (saveBtn)   saveBtn.innerHTML   = ICONS.bookmark;
  if (shareBtn) shareBtn.onclick = () => sharePost({
    title: article.title,
    text:  article.excerpt || '',
    url:   article.sourceUrl || location.href,
  });
  if (remindBtn) remindBtn.hidden = true;   // нагадування лише для подій/свят (events.js)
  if (saveBtn) {
    saveBtn.hidden = false;
    saveBtn.classList.toggle('modal-icon-btn--active', getSavedArticleIds().includes(article.id));
    saveBtn.onclick = () => {
      const nowSaved = toggleSavedArticle(article.id);
      saveBtn.classList.toggle('modal-icon-btn--active', nowSaved);
      showToast(nowSaved ? 'Статтю збережено' : 'Прибрано зі збережених');
    };
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  document.body.classList.add('modal-open');

  // Кожна стаття відкривається СПОЧАТКУ: контейнер скролу тримав позицію попередньої
  // (замінюємо лише вміст, scrollTop контейнера лишався) → скидаємо на 0 (Вова 21.07).
  const scrollBox = modal.querySelector('.article-modal-inner');
  if (scrollBox) {
    scrollBox.scrollTop = 0;
    requestAnimationFrame(() => { scrollBox.scrollTop = 0; });   // iOS: після layout
  }
};
