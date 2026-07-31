import { formatTime, escapeHtml, sharePost, showToast, deepLink } from '../core/utils.js';
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

// ── ГЕО-ГРУПИ: ОДНЕ МІСЦЕ ПРАВДИ (31.07) ────────────────────────────────────
// Три розділи, якими читач ділить новини. Переїхали сюди з `community-blocks.js`,
// бо з 31.07 користувачів ДВОЄ: віджет Громади і повноекранний хаб
// (`tabs/news-hub.js`). 🛑 Копію НЕ робити — у проєкті вже розходились дві копії
// списків антиспаму, і симптом тоді виглядав як баг продукту, а не як розсинхрон.
export const NEWS_GEO_GROUPS = ['Громада', 'Волинь', 'Україна та Світ'];

// Поле `geo` у даних дрібніше за групу: 'Олика' — стара назва Громади (лишилась у
// старих статтях), а 'Україна' і 'Світ' читач бачить одним розділом.
export function matchGeoGroup(a, group) {
  if (group === 'Громада')         return a.geo === 'Громада' || a.geo === 'Олика';
  if (group === 'Україна та Світ') return a.geo === 'Україна' || a.geo === 'Світ';
  return a.geo === group;
}

// Статті групи, найсвіжіші зверху. `slice()` — щоб не сортувати чужий масив на місці
// (`allArticles` спільний, і мовчазна перестановка вдарила б по інших читачах).
export function articlesOfGroup(arts, group) {
  return arts.filter(a => matchGeoGroup(a, group))
    .slice()
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

// ── «N НОВИХ» — ЧЕСНИЙ ЛІЧИЛЬНИК (31.07, крок 8) ────────────────────────────
// Заміняє напис «LIVE» і зелену крапку, що блимала вічно. Ті двоє БРЕХАЛИ: нічого
// живого у віджеті не було — новини тягне RSS раз на кілька годин, а анімація
// крутилась безперервно на кожному відкритті Громади.
//
// 🔴 НОВИЙ КЛЮЧ СХОВИЩА: `cstl_news_seen_ts` (localStorage). Тримає ОДНЕ число —
// час, коли людина востаннє відкривала хаб новин. Нічого особистого, зникає разом
// із даними сайту.
//
// ⚠️ Рахуємо ЛИШЕ Громаду — і це не спрощення, а єдиний спосіб зробити лічильник
// корисним. Заміряно: Громада дає ~0.26 статті на день, Волинь ~24, «Україна та
// Світ» ~30. Якби бейдж рахував усе, він показував би «54 нових» щоранку і за
// тиждень перетворився б на шум, який ніхто не читає.
const NEWS_SEEN_KEY = 'cstl_news_seen_ts';

export function newsSeenTs() {
  const v = Number(localStorage.getItem(NEWS_SEEN_KEY) || 0);
  return Number.isFinite(v) ? v : 0;
}

// Позначити новини переглянутими. Кличе хаб у момент відкриття.
export function markNewsSeen() {
  try { localStorage.setItem(NEWS_SEEN_KEY, String(Date.now())); } catch (_) {}
}

// Скільки статей Громади новіші за останній перегляд.
// ⚠️ ПЕРШИЙ ЗАПУСК віддає 0, а не «22 нових»: людина, яка вперше відкрила застосунок,
// нічого не пропускала — усе, що там є, для неї однаково нове. Показувати їй
// тривожне число за весь архів було б неправдою того самого ґатунку, що «LIVE».
// Тому позначку ставимо одразу і мовчки.
export function countNewCommunity(arts) {
  const seen = newsSeenTs();
  if (!seen) { markNewsSeen(); return 0; }
  return articlesOfGroup(arts, NEWS_GEO_GROUPS[0]).filter(a => (a.ts || 0) > seen).length;
}

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
//
// 🆕 31.07 ЕКСПОРТОВАНО. До цього обробник висів ЛИШЕ на модалці статті, тобто в
// самих СПИСКАХ новин бита картинка показувалась системною іконкою «зламане фото».
// Знайдено при підготовці варіантів редизайну: чужі RSS-джерела масово блокують
// «гарячі посилання», тож у стрічці це не рідкість, а звичайний стан. Тепер той
// самий обробник вішає і хаб — копії НЕ робимо.
export function handleImgError(e) {
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

// Deep-link (6b): відкрити статтю за id — перемкнути на «Новини» + дочекатись даних.
export async function openArticleById(id) {
  // Новини живуть блоком «Табло новин» у Громаді (окремої вкладки Новин нема).
  // 'news' у switchTab перенаправляється на 'shotam' (Стрічку) — тому фон deep-link
  // виходив Стрічкою. Вова: фон має бути Громада (де блок новин), а стаття — модалкою зверху.
  window.switchTab?.('community');
  await ensureNewsLoaded();
  openArticle(id);
}

// 🔴 КАТЕГОРІЙНИЙ БЕЙДЖ ПОКАЗУЄМО, ЛИШЕ КОЛИ ВІН ЩОСЬ КАЖЕ (31.07, крок 9, баг B-28).
//
// Заміряно по живих `data/articles.json` 31.07: **378 з 400 = 94.5%** статей мають
// категорію «Суспільство». Тобто на дев'яти картках з десяти бейдж писав те саме
// слово — займав рядок, вимагав кольору й уваги і не додавав НІЧОГО. Решта: Культура
// 6 · Спорт 6 · Історія 5 · Економіка 5.
//
// ⚠️ Це НЕ «прибрати бейдж», як стояло в плані кроку 9, і різниця важлива.
// Просте видалення знищило б і ті 5.5%, де категорія справді щось означає. Тому
// ховаємо саме ЗНАЧЕННЯ ЗА ЗАМОВЧУВАННЯМ: «Суспільство» — це те, що ставить
// класифікатор, коли не розпізнав тему, тобто по суті «категорії нема».
//
// 🔑 Побічна користь: коли B-28 полагодять у `scripts/parse_rss.py` і категорії
// почнуть розкладатись по чотирьох базових, бейджі повернуться САМІ, без правки
// цього коду. Показник шуму став показником сигналу.
// 🛑 Сам B-28 цим НЕ закритий — це лікування симптому. Корінь у класифікаторі.
const CATEGORY_DEFAULT = 'Суспільство';

function badgesHtml(a) {
  const cat = normCategory(a.category);
  return `
    <span class="news-badge news-badge--geo" style="background:${geoColor(a.geo)}">${escapeHtml(a.geo)}</span>
    ${cat !== CATEGORY_DEFAULT
      ? `<span class="news-badge news-badge--cat" style="background:${catColor(cat)}">${escapeHtml(cat)}</span>`
      : ''}
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

// Рендер тіла статті. Новий формат — БАГАТИЙ HTML (санітизований парсером:
// лише p/h3/ul/li/strong/em/br/blockquote, без атрибутів/скриптів) → рендеримо як
// є. Легасі-плоский текст (старі статті) → розбиваємо по \n\n на <p> з escapeHtml.
function renderArticleBody(content) {
  const raw = content || '';
  if (/<(p|h2|h3|ul|ol|li|strong|em|blockquote|br)\b/i.test(raw)) return raw;
  const text = decodeEntities(raw);
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
  // Ділимося посиланням У ЗАСТОСУНОК на цю статтю (#/post/news/<id>), не зовнішнім
  // джерелом — щоб людина відкрила статтю в CSTL (рішення Вови 23.07). Оригінал —
  // усередині статті («Читати оригінал»).
  if (shareBtn) shareBtn.onclick = () => sharePost({
    title: article.title,
    url:   deepLink('news', article.id),
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
