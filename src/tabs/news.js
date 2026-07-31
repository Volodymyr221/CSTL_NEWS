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

// 🔴 31.07 (крок 2): `GEO_COLORS`, `geoColor()` і `catColor()` ВИДАЛЕНІ разом із
// заливкою міток. Вони фарбували пігулки бейджів інлайновим `style=`, а обидва
// екрани цю заливку однаково гасили (`background: none !important` у двох різних
// файлах) — тобто розмітка щоразу писала фарбу, яку ніхто не показував.
// Колір міток тепер один і йде токеном `--nc-accent` (`style/news-card.css`).
// Бордо бренду `#722F37` живе у `--news-accent` (`style/base.css`).

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

// До якого з трьох розділів належить стаття. Потрібно там, де поруч лежать новини
// з РІЗНИХ розділів і мітка має називати розділ, а не сире поле `geo`: у даних
// стоїть 'Олика' (стара назва Громади) або 'Світ', а читач знає три назви.
// 🛑 Копію не робити — це те саме місце правди, що `NEWS_GEO_GROUPS`.
export function geoGroupOf(a) {
  return NEWS_GEO_GROUPS.find(g => matchGeoGroup(a, g)) || null;
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

// HTML стрічки новин. Порожньо → плейсхолдер.
//
// 🔴 31.07 (крок 2 потоку /byyou): ОДИН компонент замість двох трактовок.
// `opts.variant` — 'row' (щільний рядок хаба, за замовчуванням) або 'mini'
// (компактна картка табла Громади). Форму варіанта задає `style/news-card.css`,
// екран-господар — лише кольорові токени своєї поверхні.
// ⚠️ Старе `opts.compact` більше не читається: воно означало «не роби першу
// картку великою», тобто описувало ВІДСУТНІСТЬ варіанта, а обидва живі виклики
// однаково передавали `true`. Велику першу тепер вішає хаб класом `.nc--lead`
// адресно — і лише коли в новини справді є фото.
export function newsCardsHtml(articles, opts = {}) {
  if (!articles || articles.length === 0) {
    return '<div class="empty-state">Новин за цим фільтром поки немає</div>';
  }
  return articles.map(a => renderCard(a, opts.variant || 'row')).join('');
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

// ⚠️ 31.07: інлайнових `style="background:…"` тут більше НЕМА, і це не косметика.
// Кольорова заливка міток була скасована на ОБОХ екранах ще 31.07 уранці, але
// скасована по-різному — двома правилами `background: none !important` у двох
// файлах. Тобто розмітка щоразу писала фарбу, а два різні CSS її гасили; варто
// було зʼявитись третьому екрану — і мітки знову стали б «цукерками».
// Тепер колір міток задає компонент через токен `--nc-accent`.
// 🛑 Наслідок: у мітки більше НЕМА власного кольору на рівні розмітки — усі три
// (гео, категорія, ексклюзив) беруть колір з поверхні. Це навмисно: різнокольорові
// мітки і були тим, що робило список строкатим.
function badgesHtml(a) {
  const cat = normCategory(a.category);
  return `
    <span class="nc-badge nc-badge--geo">${escapeHtml(a.geo)}</span>
    ${cat !== CATEGORY_DEFAULT
      ? `<span class="nc-badge nc-badge--cat">${escapeHtml(cat)}</span>`
      : ''}
    ${a.exclusive ? '<span class="nc-badge nc-badge--excl">⭐ Ексклюзив</span>' : ''}
    ${a.imageType === 'illustration' ? '<span class="nc-badge nc-badge--illus">🖼 Ілюстрація</span>' : ''}
  `;
}

// 🔴 ОДНА КАРТКА НОВИНИ НА ВЕСЬ ЗАСТОСУНОК (31.07, крок 2 потоку /byyou).
//
// Було ДВІ функції розмітки (`renderRow` + `renderFeatured`) і ДВА набори чужих
// перевизначень поверх них — 13 правил у `style/community.css` (табло Громади) і
// 20 у `style/news-hub.css` (хаб). Тобто одна й та сама новина малювалась різною
// мовою залежно від того, з якого екрана на неї дивишся. Вова: «карточки новин
// відображаються по-іншому ніж на сторінці новини… це дуже великий розгардіяш».
//
// Стало: одна функція, один набір класів `.nc-*`, варіант передається ЯВНО
// ('row' | 'mini'; 'lead' вішає хаб класом на першу картку з фото).
// Форма варіантів — `style/news-card.css`. Екран задає лише кольори поверхні.
//
// ⚠️ `data-article-id` НЕ чіпати: за ним відкривають статтю всі три делеговані
// слухачі (віджет, хаб, deep-link), і за ним же сторож `tests/dev-lock.mjs`
// визначає, що застосунок узагалі побудований.
// 🔴 ІЄРАРХІЯ «ЗВІДКИ → ЩО → КОЛИ» (31.07, крок 4). Скарга Вови: «тут все
// зливається… треба, щоб кожна новина несла якийсь сенс».
//
// 🔬 ЗАМІРЯНО, а не вгадано (`tests/tools/_measure-meta.mjs`, по 20 карток):
//   Волинь          — **19 з 20 = 95%** карток мали ПОРОЖНІЙ верхній рядок
//   Громада         — 11 з 20 = 55%
//   Україна та Світ — 0
// Причина не в дизайні, а в даних і двох чесних рішеннях, що зійшлись разом:
// гео-мітка знімається, коли повторює активну вкладку, а категорія не малюється,
// коли вона «Суспільство» (94.5% статей, баг B-28). У підсумку в «Волині» картка
// починалась одразу із заголовка — і список ставав суцільною стіною тексту.
//
// ➡️ Полагоджено ДЖЕРЕЛОМ: воно є в КОЖНОЇ статті і завжди щось означає («хто це
// каже»). Тепер джерело стоїть у верхньому рядку поруч із мітками, а час іде вниз
// окремо. Виходить рівно та тріада, якою будують картку Apple News і Google News:
// **звідки → що сталось → коли**. Порожнього рядка більше не буває в жодній картці.
// ⚠️ Джерело НЕ капсом: капс тут носять мітки розділів, і два капси поспіль знову
// злились би в один орнамент.
function renderCard(a, variant) {
  return `
    <article class="nc nc--${variant}${a.exclusive ? ' exclusive' : ''}" data-article-id="${a.id}">
      ${a.image ? `<img class="nc-img" src="${escapeHtml(a.image)}" alt="" loading="lazy">` : ''}
      <div class="nc-body">
        <div class="nc-meta">${badgesHtml(a)}<span class="nc-src">${escapeHtml(a.source)}</span></div>
        <h2 class="nc-title">${escapeHtml(a.title)}</h2>
        ${a.excerpt ? `<p class="nc-excerpt">${escapeHtml(a.excerpt)}</p>` : ''}
        <div class="nc-foot">${formatTime(a.ts)}</div>
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

  // 🔴 ОДНА МОВА НА ВСЬОМУ ШЛЯХУ (31.07, крок 7). Вова: «треба продумати детально
  // логіку… від самого початку, коли людина бачить табло, і до того як людина
  // заходить читати новину».
  // Мітки статті малюються ТИМИ САМИМИ класами `.nc-badge`, що й у картці, і за
  // тим самим правилом: категорія «Суспільство» не показується, бо її має 94.5%
  // статей (баг B-28) — інакше картка мовчала б, а стаття за один тап від неї
  // писала б «СУСПІЛЬСТВО», і це виглядало б як різні джерела правди.
  if (modalMetaTags) {
    const cat = normCategory(article.category);
    modalMetaTags.innerHTML = `
      <span class="nc-badge nc-badge--geo">${escapeHtml(article.geo)}</span>
      ${cat !== CATEGORY_DEFAULT ? `
        <span class="modal-meta-sep">•</span>
        <span class="nc-badge nc-badge--cat">${escapeHtml(cat)}</span>` : ''}
      ${article.exclusive ? '<span class="nc-badge nc-badge--excl">⭐ Ексклюзив</span>' : ''}
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
