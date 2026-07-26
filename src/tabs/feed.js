// src/tabs/feed.js — «СТРІЧКА»: сторінки-канали громади (мінісоцмережа).
// Екран 1 (головна стрічка): горизонтальні кружечки-канали + вертикальна стрічка
// постів усіх сторінок. Екран 2 (сторінка каналу): банер+аватар, пости каналу,
// дзвіночок (push-підписка), поле «написати пост» для власника/адміна.
//
// Дата-шар — у core/supabase.js (pages/page_posts/page_reactions/page_comments/
// page_subscriptions). Права доступу — RLS у scripts/supabase_pages.sql.

import { escapeHtml, showToast, deepLink, formatEventDate, todayKey, containsProfanity, autoGrowTextarea,
         looksLikeSpam, isDuplicateMsg, isFlooding, recordSentMsg } from '../core/utils.js';
import { currentUserId, isLoggedIn, requireAuth } from '../core/auth.js';
import {
  fetchAvatars, cachedName, cachedAvatar, liveName, nameUid,
  fetchPages, fetchPagePosts, fetchPageReactions, setPageReaction,
  fetchPageCommentCounts, fetchPostComments, fetchPostCommentCount, COMMENT_ROOTS_PAGE,
  addPageComment, editPageComment, deletePageComment, fetchMyEditablePageIds,
  fetchPageCommentReactions, setPageCommentReaction, subscribePageCommentReactions,
  createPagePost, updatePagePost, deletePagePost, fetchMySubscriptions, setPageSubscription,
  subscribePagePosts,
  updatePage, subscribePageComments, subscribePageReactions,
  saveUserPushDevice, notifyNewPagePost,
  fetchPageModerators, addPageModerator, removePageModerator, netErrorText,
} from '../core/supabase.js';
import { ensurePushSubscription, pushBlockedMsg } from '../core/push.js';
import { uploadImageReliable, uploadBlobWithRetry } from '../core/upload.js';   // стиснення+повтор — єдиний надійний шлях
import { openLayer, closeLayer } from '../core/layers.js'; // повноекранні шари ↔ історія браузера
import { openCropper } from '../core/cropper.js';         // рамка кадрування перед завантаженням // повноекранні шари ↔ історія браузера
import { createDragTracker, finishSwipe, sheetRemaining, createBackdropFade, lockBodyScroll } from '../core/sheet-motion.js'; // нативне завершення свайп-закриття + замок скролу під клавіатуру
import { attachKeyboardSheet, revealInScroller } from '../core/keyboard.js';   // аркуш під клавіатурою: верх стоїть, низ сідає на неї

// ── Іконки (вектор, у стилі додатку) ────────────────────────────────────────
const IC_HEART_O = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12.6l-7.5 7.4-7.5-7.4a5 5 0 0 1 7.1-7.1l.4.4.4-.4a5 5 0 0 1 7.1 7.1z"/></svg>';
const IC_HEART_F = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M19.5 12.6l-7.5 7.4-7.5-7.4a5 5 0 0 1 7.1-7.1l.4.4.4-.4a5 5 0 0 1 7.1 7.1z"/></svg>';
const IC_COMMENT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5 8.5 8.5 0 0 1 8.5 8.5z"/></svg>';
const IC_BELL   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/></svg>';
const IC_BELL_F = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M14.235 19c.865 0 1.322 1.024.745 1.668A3.992 3.992 0 0 1 12 22a3.992 3.992 0 0 1-2.98-1.332c-.552-.616-.158-1.579.634-1.661L10 19h4.235z"/><path d="M12 2c1.358 0 2.506.903 2.875 2.141l.046.171.008.043a8.013 8.013 0 0 1 4.024 6.069l.028.287L19 11v2.931l.021.136a3 3 0 0 0 1.143 1.847l.167.117.162.099c.86.487.56 1.766-.377 1.864L20 18H4c-1.028 0-1.387-1.364-.493-1.87a3 3 0 0 0 1.472-2.063L5 13.924V11c0-2.71 1.346-5.152 3.454-6.62A3.002 3.002 0 0 1 12 2z"/></svg>';
const IC_BACK   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6"/></svg>';
const IC_IMG    = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/></svg>';
const IC_SEND   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14l11 -11"/><path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5"/></svg>';
// Іконка «Поділитися» у стилі Facebook — СУЦІЛЬНА (залита) стрілка вправо з хвостиком-
// гачком донизу-вліво (як на фото від Вови). fill=currentColor тягне колір кнопки.
const IC_SHARE  = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="0.75" stroke-linejoin="round"><path d="M14 9V5.2c0 -.53 .64 -.8 1.02 -.42l7.2 7.2a.6 .6 0 0 1 0 .85l-7.2 7.2c-.38 .38 -1.02 .1 -1.02 -.42V16c-5 0 -8.5 1.6 -11 5.1 1 -5 4 -10 11 -11z"/></svg>';
const IC_CLOSE  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';
const IC_X      = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';
const IC_EDIT   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5 -10.5a2.83 2.83 0 0 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/></svg>';
const IC_CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h2l1 -2h8l1 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2"/><circle cx="12" cy="13" r="3"/></svg>';
const IC_USERS  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0 -3 -3.85"/></svg>';
const IC_DOTS   = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const IC_TRASH  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7V4a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/></svg>';

// ── Стан ────────────────────────────────────────────────────────────────────
let pages = [];               // усі сторінки-канали
let posts = [];               // пости стрічки (усіх сторінок)
let reactionMap = new Map();  // post_id → { count, my }
let commentMap = new Map();   // post_id → завантажені comments[] (лише для відкритих постів)
let commentCounts = new Map();// post_id → скільки коментарів усього (для лічильника під карткою)
let commentPaging = new Map();// post_id → { hasMore, oldestTs } — стан «Показати попередні»
let commentError = new Map(); // post_id → true, якщо остання спроба завантажити впала
let comReactMap = new Map();  // comment_id → { count, my } (лайки коментарів, фаза 3b)
let myPageIds = new Set();    // сторінки де я можу писати (власник/адмін)
let mySubs = new Set();       // сторінки на які я підписаний (дзвіночок)
let loaded = false;
// Пости, які приїхали живою синхронізацією, поки людина читає стрічку. У список їх НЕ
// вставляємо одразу: `renderFeed` перемальовує весь список (`innerHTML`), тобто вставка
// зверху зсунула б усе під пальцем — та сама сім'я дефекту, що HOT_RULES №10.
// Замість цього показуємо пігулку «↑ N нових публікацій» (як в Instagram і X), і людина
// сама вирішує, коли оновити. Пігулка з'являється миттєво, тобто «живо» — але керує
// моментом перемальовування людина, а не подія.
let pendingPosts = [];

// Ключ реакції = uid залогіненого. Лайк лише авторизованим (рішення Вови 22.07:
// анонімна реакція ламає ідентифікацію і статистику). Гість → null (жодна не «моя»).

// Місяці в РОДОВОМУ відмінку — «23 липня», а не «23 липень».
// Малими літерами (Вова 26.07: «зроби маленькими, приклад — 23 липня»). Спершу зробив
// великими, бо саме так він написав формат у першому проханні — виявилось, то був
// наголос, а не регістр. Дата — другорядний напис під назвою сторінки, великі літери
// тягли на себе увагу нарівні з нею.
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

// Відносний час: «щойно», «5 хв», «2 год», «вчора», далі — дата.
// longDate керує ЛИШЕ останньою сходинкою:
//   false (коментарі) → «12.07» — компактно, бо час стоїть в одному рядку з іменем;
//   true  (дата публікації поста) → «23 липня» (Вова 26.07).
// Один двигун із прапорцем, а не дві схожі функції — інакше вони розійдуться,
// як уже розходились клієнтський і серверний антиспам.
function relTime(iso, { longDate = false } = {}) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return 'щойно';
  if (diff < 3600) return `${Math.floor(diff / 60)} хв`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} год`;
  if (diff < 172800) return 'вчора';
  const d = new Date(t);
  if (!longDate) return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
  // День без нуля спереду: «3 липня» читається краще за «03 липня».
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  // Торішнє — з роком: інакше через рік «23 липня» вказувало б на зовсім інший пост.
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

// Аватар-кружечок: фото або кольорова заглушка з першою літерою.
function avatarHtml(url, name, cls) {
  const letter = escapeHtml((name || '?').trim().charAt(0).toUpperCase() || '?');
  if (url) return `<img class="${cls}" src="${escapeHtml(url)}" alt="" loading="lazy">`;
  return `<span class="${cls} ${cls}--ph">${letter}</span>`;
}

// ── Порядок спільнот у стрічці ──────────────────────────────────────────────
// Порядок кружечків задає адмінка (колонка pages.sort_order — розділ «Спільноти»,
// стрілки ⬆⬇). База вже віддає сторінки відсортованими (fetchPages: sort_order,
// потім created_at). Тут — підстрахувальний СТАБІЛЬНИЙ сорт на клієнті на випадок
// однакового sort_order (тоді зберігається порядок з бази — за датою/id).
// Раніше порядок був хардкодом (PINNED_PAGES) — прибрано, бо тепер керується з БД.
function orderPages(list) {
  return [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

// ── Завантаження даних ──────────────────────────────────────────────────────
async function loadData() {
  const [pg, ps, rx, cm, cr, mine, subs] = await Promise.all([
    fetchPages(),
    fetchPagePosts(null, 60),
    fetchPageReactions(currentUserId()),
    fetchPageCommentCounts(),
    fetchPageCommentReactions(currentUserId()),
    isLoggedIn() ? fetchMyEditablePageIds() : Promise.resolve(new Set()),
    isLoggedIn() ? fetchMySubscriptions()   : Promise.resolve(new Set()),
  ]);
  pages = orderPages(pg); posts = ps; reactionMap = rx; commentCounts = cm; comReactMap = cr; myPageIds = mine; mySubs = subs;
  // Самі коментарі не завантажені — вони тягнуться при відкритті листа. Скидаємо
  // кеш, щоб після оновлення стрічки не показати вчорашню гілку.
  commentMap = new Map(); commentPaging = new Map(); commentError = new Map();

  // Живі імена/аватари авторів-людей (для підпису «— Ім'я»).
  const uids = [...new Set(posts.map(p => p.author_uid).filter(Boolean))];
  if (uids.length) await fetchAvatars(uids);
  loaded = true;
}

// ── Рендер: кружечки-канали ─────────────────────────────────────────────────
function circlesHtml() {
  if (!pages.length) return '';
  return `<div class="fd-circles">${pages.map(p => `
    <button class="fd-circle" data-open-page="${p.id}" type="button">
      <span class="fd-circle-ring">${avatarHtml(p.avatar_url, p.name, 'fd-circle-ava')}</span>
      <span class="fd-circle-label">${escapeHtml(p.name)}</span>
    </button>`).join('')}</div>`;
}

// ── Рендер: картка поста ────────────────────────────────────────────────────
// Фото поста → масив URL (кілька фото). image_urls новий, image_url — легасі.
function postImages(post) {
  if (Array.isArray(post.image_urls) && post.image_urls.length) return post.image_urls;
  if (post.image_url) return [post.image_url];
  return [];
}

// Галерея: 1 фото — на всю ширину; 2+ — свайп-карусель (scroll-snap) + крапки + лічильник.
function galleryHtml(images, postId) {
  if (!images.length) return '';
  if (images.length === 1) {
    // Стабільна рамка 4:5 (портрет-максимум), cover — як Instagram: без полів,
    // рівний ритм стрічки. Повний кадр (без обрізки) — по тапу (openViewer, лайтбокс).
    return `<div class="fd-photo fd-photo--single" data-view="${postId}" data-idx="0"><img src="${escapeHtml(images[0])}" alt="" loading="lazy"></div>`;
  }
  const slides = images.map((u, i) =>
    `<div class="fd-gal-slide" data-view="${postId}" data-idx="${i}"><img src="${escapeHtml(u)}" alt="" loading="lazy"></div>`).join('');
  const dots = images.map((_, i) => `<span class="fd-gal-dot${i === 0 ? ' on' : ''}"></span>`).join('');
  return `<div class="fd-gallery" data-count="${images.length}">
    <div class="fd-gal-track">${slides}</div>
    <div class="fd-gal-count"><span class="fd-gal-cur">1</span>/${images.length}</div>
    <div class="fd-gal-dots">${dots}</div>
  </div>`;
}

// Пропорція фото у стрічці: РІДНА (як у файлі), але не вища за стелю 3:4.
// Читаємо справжній розмір кадру (naturalWidth/naturalHeight — пікселі самого файлу)
// і пишемо його у CSS-змінну --fd-ar на контейнері фото. Тому квадратні й ширші кадри
// показуються цілими на всю ширину (нічого не зрізається з боків), а дуже високі
// вертикальні обрізаються рамкою 3:4 (cover) — як було раніше.
const PHOTO_MIN_AR = 3 / 4;   // 0.75 — найвище (найвужче) що показуємо без обрізки

function applyPhotoRatio(box, img) {
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return;                                    // фото не завантажилось — лишається fallback 3/4
  box.style.setProperty('--fd-ar', (Math.max(w / h, PHOTO_MIN_AR)).toFixed(4));
}

// Для каруселі (2+ фото) беремо пропорцію ПЕРШОГО кадру — усі слайди однакової висоти.
function wirePhotoRatios(root) {
  root.querySelectorAll('.fd-photo--single, .fd-gallery').forEach(box => {
    if (box.dataset.arWired) return; box.dataset.arWired = '1';
    const img = box.querySelector('img');
    if (!img) return;
    if (img.complete) applyPhotoRatio(box, img);           // з кешу — розмір уже відомий
    else img.addEventListener('load', () => applyPhotoRatio(box, img), { once: true });
  });
}

// Оновлення крапок/лічильника каруселі при свайпі (+ пропорції фото постів).
function wireGalleries(root) {
  wirePhotoRatios(root);
  root.querySelectorAll('.fd-gallery').forEach(g => {
    if (g.dataset.wired) return; g.dataset.wired = '1';
    const track = g.querySelector('.fd-gal-track');
    const dots = g.querySelectorAll('.fd-gal-dot');
    const cur = g.querySelector('.fd-gal-cur');
    track.addEventListener('scroll', () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      dots.forEach((d, k) => d.classList.toggle('on', k === i));
      if (cur) cur.textContent = String(i + 1);
    }, { passive: true });
    // iOS Safari зі scroll-snap іноді ініціалізує трек не з першого кадру.
    // Спершу гарантовано стаємо на 1-й слайд (без snap), і аж наступним кадром
    // вмикаємо прилипання (.snap) — старт завжди 1/N, свайп працює як раніше.
    track.scrollLeft = 0;
    requestAnimationFrame(() => { track.scrollLeft = 0; track.classList.add('snap'); });
  });
}

// Повноекранний перегляд фото (свайп між усіма фото поста).
function openViewer(images, startIdx) {
  if (!images.length) return;
  const ov = document.createElement('div');
  ov.className = 'fd-viewer';
  ov.innerHTML = `
    <button class="fd-viewer-close" type="button">${IC_CLOSE}</button>
    <div class="fd-viewer-track">${images.map(u =>
      `<div class="fd-viewer-slide"><img src="${escapeHtml(u)}" alt=""></div>`).join('')}</div>`;
  // Той самий механізм, що й у решти шарів (core/layers.js): системний жест
  // «назад» і кнопка браузера закривають перегляд фото, а не відкочують додаток.
  const layer = openLayer(() => { ov.remove(); document.body.style.overflow = ''; });
  const close = () => closeLayer(layer);
  ov.querySelector('.fd-viewer-close').addEventListener('click', close);
  ov.addEventListener('click', e => { if (e.target === ov || e.target.classList.contains('fd-viewer-slide')) close(); });
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  const track = ov.querySelector('.fd-viewer-track');
  track.scrollLeft = (startIdx || 0) * track.clientWidth;   // відкрити на потрібному фото
}

// Свайп-вниз закриває нижній лист — той самий філ, що в core/modal.js: граб від
// шапки (перші ~64px) закриває ЗАВЖДИ; у тілі — лише коли скрол угорі (інакше це
// звичайний скрол). back = .fd-sheet-back; panel = .fd-sheet; scroller = елемент,
// що реально скролиться (для листа коментарів — сам список, інакше сам panel).
// grip — елемент, з якого ДОЗВОЛЕНО починати жест закриття. Якщо переданий, у решті
// аркуша свайп не працює взагалі: там лише прокрутка.
//
// 🔑 НАВІЩО (Вова 25.07, про лист коментарів): «свайпом і взагалі не міг закрити…
// тільки в рамках шапки, тобто де ця рисочка і зверху пише "7 коментарів"». Стара
// поведінка хапала жест із будь-якого місця, щойно список був прокручений догори
// (умова `scroller.scrollTop > 0` нижче) — а на верхівці списку людина опиняється
// постійно, тож кожен рух «прогорнути вгору» ризикував закрити весь лист.
//
// Для решти аркушів (пост, сторінка, композер) grip не передається — поведінка та сама,
// що була: там немає довгого списку, і закриття з будь-якого місця зручне.
function attachSheetSwipe(back, panel, scroller, doClose, { grip = null } = {}) {
  scroller = scroller || panel;
  const zone = grip || panel;          // де жест ПОЧИНАЄТЬСЯ і живуть слухачі
  let startY = 0, dragging = false, dy = 0, travel = 1;
  const drag = createDragTracker();   // швидкість пальця → нативне завершення жесту
  // Затемнення тут — САМ контейнер .fd-sheet-back, усередині якого лежить аркуш,
  // тож режим 'bg' (міняємо альфу кольору фону). Гасити прозорість не можна —
  // разом із фоном загас би й аркуш.
  const fade = createBackdropFade(back, 'bg');
  zone.addEventListener('touchstart', e => {
    const y = e.touches[0].clientY;
    if (!grip) {                                       // старий режим: увесь аркуш
      const inHeader = (y - panel.getBoundingClientRect().top) < 64;
      if (!inHeader && scroller.scrollTop > 0) return; // це скрол тіла, не закриття
    }
    startY = y; dragging = true; dy = 0;
    travel = Math.max(panel.offsetHeight || 1, 1);     // повний шлях аркуша — міряємо раз за жест
    drag.start(y);
  }, { passive: true });
  zone.addEventListener('touchmove', e => {
    if (!dragging) return;
    dy = e.touches[0].clientY - startY;
    if (dy <= 0) { panel.style.transform = ''; fade?.track(0); return; }   // тягнуть вгору — нативному скролу
    // Перевірка прокрутки потрібна лише в старому режимі: у шапці прокручувати нічого,
    // тож і віддавати жест нема кому.
    if (!grip && scroller.scrollTop > 0) {                   // ще прокручено — не хапаємо
      panel.style.transform = ''; fade?.track(0);
      startY = e.touches[0].clientY; drag.start(startY); dy = 0; return;
    }
    e.preventDefault();                                      // блокуємо нативний скрол поки тягнемо
    panel.style.transition = 'none';
    panel.style.transform = `translateY(${dy}px)`;
    fade?.track(dy / travel);                                // фон світлішає разом з рухом
    drag.move(e.touches[0].clientY);
  }, { passive: false });
  zone.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    // Доїзд рахує sheet-motion: кидок закриває навіть коротким рухом, а час
    // завершення пропорційний залишку шляху (не фіксовані 240мс).
    finishSwipe({
      panel, dy, velocity: drag.velocity,
      remaining: sheetRemaining(panel, dy),
      dismissTransform: 'translateY(100%)',
      onDismiss: (ms) => { back.classList.remove('open'); setTimeout(doClose, ms); },
      backdrop: fade,
    });
    dy = 0;
  });
}

// Плашка події на картці: «🗓 12 серпня, субота · 10:00 📍 місце» (якщо пост — подія).
function eventBadgeHtml(post) {
  if (!post.event_date) return '';
  const when = formatEventDate(post.event_date) + (post.event_time ? ` · ${escapeHtml(post.event_time)}` : '');
  const past = post.event_date < todayKey();   // подія в минулому — приглушена
  const loc  = post.event_location
    ? `<span class="fd-evb-loc">${escapeHtml(post.event_location)}</span>` : '';
  return `<div class="fd-evb${past ? ' fd-evb--past' : ''}">
    <span class="fd-evb-when">🗓 ${when}</span>${loc}</div>`;
}

function postCardHtml(post) {
  const page = post.pages || {};
  const rx = reactionMap.get(post.id) || { count: 0, my: false };
  // ⚠️ Саме commentCounts, а не довжина commentMap: у мапі лежать коментарі ЛИШЕ
  // тих постів, чий лист уже відкривали. Читання звідти гасило лічильник на всіх
  // картках (регрес 25.07 — Вова побачив порожню бульбашку одразу).
  const cCount = commentCounts.get(post.id) || 0;
  // Підпис автора-людини — лише якщо пост опубліковано «від себе». Пости від імені
  // спільноти виглядають суто офіційно, без особистого імені (вибір у композері).
  // show_author за замовчуванням true → старі пости виглядають як раніше.
  const authorName = (post.author_uid && post.show_author !== false)
    ? liveName('', post.author_uid, '') : '';  // вже екранований
  const imgs = postImages(post);
  const photo = galleryHtml(imgs, post.id);
  const hasPhoto = imgs.length > 0;
  const author = authorName
    ? `<div class="fd-author"${nameUid(post.author_uid)}>— ${authorName}</div>` : '';
  const canEditPost = myPageIds.has(post.page_id);   // «⋯» лише для своїх сторінок
  return `
    <article class="fd-card" data-post="${post.id}">
      <header class="fd-card-head${hasPhoto ? ' fd-card-head--onphoto' : ''}" data-open-page="${post.page_id}">
        <span class="fd-ava-wrap">${avatarHtml(page.avatar_url, page.name, 'fd-ava')}</span>
        <span class="fd-head-txt">
          <span class="fd-page-name">${escapeHtml(page.name || 'Сторінка')}</span>
          <span class="fd-time">${relTime(post.created_at, { longDate: true })}</span>
        </span>
        ${canEditPost ? `<button class="fd-card-menu" data-post-menu="${post.id}" type="button" aria-label="Меню поста">${IC_DOTS}</button>` : ''}
      </header>
      ${photo}
      <div class="fd-card-body${hasPhoto ? ' fd-card-body--onphoto' : ''}">
        ${eventBadgeHtml(post)}
        <div class="fd-text">${escapeHtml(post.text)}</div>
        ${author}
        <footer class="fd-actions">
          <button class="fd-like${rx.my ? ' fd-like--on' : ''}" data-like="${post.id}" type="button">
            <span class="fd-ic">${rx.my ? IC_HEART_F : IC_HEART_O}</span><span class="fd-cnt">${rx.count || ''}</span>
          </button>
          <button class="fd-cbtn" data-comments="${post.id}" type="button">
            <span class="fd-ic">${IC_COMMENT}</span><span class="fd-cnt">${cCount || ''}</span>
          </button>
          <button class="fd-share" data-share="${post.id}" type="button" aria-label="Поділитися постом">
            <span class="fd-ic">${IC_SHARE}</span>
          </button>
        </footer>
      </div>
    </article>`;
}

// Поділитися постом: системне «Поділитись» (Web Share) або копіювання лінка.
// Ділимося ТІЛЬКИ посиланням (deep-link #/post/feed/<id>) — без тексту поста
// (рішення Вови 23.07). handlePostHash у app.js відкриває саме цей пост.
async function sharePost(id) {
  const post = posts.find(p => p.id === id);
  const url = deepLink('feed', id);
  if (navigator.share) {
    try {
      await navigator.share({ title: post?.pages?.name || 'CSTL Life', url });
    } catch (_) { /* користувач скасував — нічого */ }
    return;
  }
  try { await navigator.clipboard.writeText(url); showToast('Посилання скопійовано'); }
  catch { prompt('Скопіюйте посилання:', url); }
}

// Відкрити пост за deep-link: перемкнути на «Стрічку», прокрутити до нього + підсвітити.
// Якщо поста ще нема в DOM (не долетів рендер / не в перших 60) — відкрити його сторінку.
// commentId — прийшли зі сповіщення про коментар: мало показати пост, треба ще й
// відкрити лист коментарів і підсвітити той самий рядок. Інакше людина тапає
// «Вам відповіли» і опиняється просто біля поста, шукаючи відповідь очима.
export async function focusFeedPost(id, commentId = null) {
  window.switchTab?.('shotam');
  if (!loaded) { await loadData(); renderFeed(); }
  let tries = 0;
  const tryFocus = () => {
    const el = document.querySelector(`#feed-list [data-post="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('fd-card--flash');
      setTimeout(() => el.classList.remove('fd-card--flash'), 1600);
      if (commentId) openComments(id, commentId);
      return;
    }
    if (++tries < 8) { requestAnimationFrame(tryFocus); return; }
    const post = posts.find(p => p.id === id);   // не в стрічці → відкрити сторінку каналу
    if (post) openPageScreen(post.page_id);
  };
  requestAnimationFrame(tryFocus);
}

// ── Рендер: головна стрічка (Екран 1) ───────────────────────────────────────
function renderFeed() {
  const circlesEl = document.getElementById('feed-circles');
  const listEl = document.getElementById('feed-list');
  if (circlesEl) { circlesEl.innerHTML = circlesHtml(); layoutCircles(); }
  if (!listEl) return;
  if (!posts.length) {
    listEl.innerHTML = `<div class="fd-empty">Поки що тут порожньо.<br>Незабаром сторінки громади почнуть публікувати новини.</div>`;
    return;
  }
  listEl.innerHTML = posts.map(postCardHtml).join('');
  wireGalleries(listEl);
}

// ── ЖИВА СИНХРОНІЗАЦІЯ САМИХ ПОСТІВ ────────────────────────────────────────────────
// Вова 26.07: «realtime має бути… між всіма, в яких зараз відкрита та чи інша модалка
// коментарів чи будь-яка інша сторінка взаємодії». Коментарі й лайки жили наживо давно,
// а самі пости — ні: новий пост зʼявлявся в інших лише після перезаходу на вкладку.
//
// Чому не вставляємо новий пост одразу в список — див. комент до `pendingPosts`.
// Редагування і видалення НАЯВНОГО поста застосовуємо одразу: там нема нового вмісту
// зверху, тобто нічого не зсувається над тим місцем, де людина читає.
function applyPostEvent(payload) {
  const row = payload.new || payload.old;
  if (!row || !row.id) return;

  // Мʼяке видалення (deleted_at) або справжній DELETE — прибираємо з екрана.
  if (payload.eventType === 'DELETE' || row.deleted_at) {
    const had = posts.some(p => p.id === row.id);
    posts = posts.filter(p => p.id !== row.id);
    pendingPosts = pendingPosts.filter(p => p.id !== row.id);
    if (had) renderFeed();
    renderNewPostsPill();
    return;
  }

  // Realtime не приєднує сторінку (`pages(...)`) — доповнюємо з уже завантаженого списку.
  // Сторінка невідома (щойно створена кимось іншим) → лишаємо без назви: пігулка все одно
  // покаже пост, а повне оновлення при тапі дотягне сторінки разом із постами.
  const page = pages.find(p => p.id === row.page_id);
  const enriched = { ...row, pages: page ? { name: page.name, avatar_url: page.avatar_url } : row.pages };

  const i = posts.findIndex(p => p.id === row.id);
  if (i >= 0) {                       // редагування поста, який уже на екрані
    posts[i] = enriched;
    renderFeed();
    return;
  }
  // Мій власний щойно надісланий пост уже додав композер — другий раз не показуємо.
  if (pendingPosts.some(p => p.id === row.id)) return;
  pendingPosts.push(enriched);
  renderNewPostsPill();
}

// Пігулка «↑ N нових публікацій» під топбаром кружечків. Тап → вливаємо накопичене у
// список, перемальовуємо і піднімаємо стрічку вгору.
function renderNewPostsPill() {
  const host = document.getElementById('page-shotam');
  if (!host) return;
  let pill = host.querySelector('.fd-newposts');
  if (!pendingPosts.length) { pill?.remove(); return; }
  if (!pill) {
    pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'fd-newposts';
    pill.addEventListener('click', async () => {
      // Серед накопиченого є пост зі СТОРІНКИ, якої ми не знаємо (її створили щойно) →
      // картка вийшла б без назви й аватара. У такому разі не зшиваємо локально, а
      // перечитуємо все: сторінки приїдуть разом із постами.
      const пачка = pendingPosts;            // спершу забираємо накопичене, ТОДІ чистимо —
      pendingPosts = [];                     // інакше пости зникли б, не доїхавши в список
      renderNewPostsPill();
      if (пачка.some(p => !p.pages || !p.pages.name)) {
        await loadData();                    // сторінка невідома → перечитуємо все
      } else {
        posts = [...пачка, ...posts]
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      }
      renderFeed();
      document.getElementById('feed-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    host.appendChild(pill);
  }
  const n = pendingPosts.length;
  const слово = n === 1 ? 'нова публікація' : (n < 5 ? 'нові публікації' : 'нових публікацій');
  pill.textContent = `↑ ${n} ${слово}`;
  positionNewPostsPill();
}

// Верх пігулки — від НИЖНЬОГО краю топбару кружечків. Окремою функцією, бо той самий
// перерахунок потрібен на кожному кадрі скролу (топбар стискається).
function positionNewPostsPill() {
  const pill = document.querySelector('#page-shotam .fd-newposts');
  if (!pill) return;
  const bar = document.querySelector('#page-shotam .fd-topbar');
  const bottom = bar ? bar.getBoundingClientRect().bottom : 72;
  pill.style.top = `${Math.max(8, bottom + 8)}px`;
}

// Розкладка кружечків-каналів: влазять у рядок → рівномірно по ширині (space-evenly,
// клас .is-fit); не влазять → горизонтальний скрол зліва (як сторіз). Замір натуральної
// ширини у скрол-режимі → overflow-safe (початок завжди досяжний). Викликається на
// рендер і на resize/поворот екрану.
function layoutCircles() {
  const el = document.querySelector('#feed-circles .fd-circles');
  if (!el) return;
  // ⚠️ Міряти ОБОВ'ЯЗКОВО у розгорнутому стані. Колонки реально звужуються при
  // згортанні, тож якщо міряти під час скролу вниз, смуга «вміститься» і розкладка
  // вибереться хибна. Глушимо ОБИДВІ фази: ширину дає --sh-tight, і забути її тут
  // означало б міряти вже стиснутий ряд.
  el.style.setProperty('--sh', '0');
  el.style.setProperty('--sh-tight', '0');
  el.classList.remove('is-fit');                        // міряємо натуральну ширину
  if (el.scrollWidth <= el.clientWidth + 1) el.classList.add('is-fit');
  planCollapsedPad(el);
  el.style.removeProperty('--sh');                      // повертаємо успадковані від топбару
  el.style.removeProperty('--sh-tight');
}

// Дві фази згортання топбару зі скролу (Вова 26.07, скрін IMG_3629):
//   спершу ВЕРТИКАЛЬНО згасають назви, і лише коли їх уже нема — кільця сходяться.
// Раніше обидва рухи йшли з одного числа, тобто одночасно, і сусідні назви
// налазили одна на одну (підпис 112px ширший за колонку 96px — він живе за рахунок
// проміжку, який у той самий момент зникав).
// Винесено окремою чистою функцією, щоб перевірятись тестом без браузера.
export const NAME_RANGE  = 60;   // px скролу на згасання назв (як було до поділу)
// Сходження кілець розтягнуто 60 → 180px (Вова 26.07: «кільця зашвидко сходяться,
// складається відчуття що вони дьоргаються… збільшити потребу для скролу»).
// Чому саме розтяг, а не згладжування: рух зчеплений зі скролом (scroll-linked), тобто
// кожен піксель пальця = крок кілець. За 60px кожен піксель давав ~0.57px зсуву колонки —
// на швидкому змаху це виглядало стрибком. За 180px крок утричі дрібніший, рух читається
// як плавний. Додавати анімацію не можна: вона б відв'язала кільця від пальця, а це
// вже окремий клас дьоргання (урок 24.07 про паузу між рухом і реакцією).
export const TIGHT_RANGE = 180;  // px скролу на сходження кілець, ПІСЛЯ назв
export function shrinkProgress(scrollTop, nameRange = NAME_RANGE, tightRange = TIGHT_RANGE) {
  const s = Math.max(0, scrollTop);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  return {
    name:  clamp01(s / nameRange),
    // Друга фаза стартує рівно там, де закінчилась перша — без паузи між ними
    // (пауза між рухом пальця і реакцією екрана вже читалась як ривок, 24.07).
    tight: clamp01((s - nameRange) / tightRange),
  };
}

// Наскільки розсунути бічні відступи смуги, коли назви згорнуті (Вова 25.07,
// скріни IMG_3570/3571): «остання іконка повинна мати такий самий відступ, як перша
// з лівої частини… а відступ між самими іконками рівномірний між усіма».
// Рахуємо ОДИН раз на рендер і поворот екрана — далі все робить CSS-розкладка.
// Якщо щільний ряд не вміщається — 0, тобто ряд від лівого краю і останні визирають.
const CIRCLE_RING = 62;   // діаметр кільця (.fd-circle-ring) = ширина колонки у згорнутому
const CIRCLE_PAD  = 16;   // базовий бічний відступ смуги
const CIRCLE_GAP  = 18;   // проміжок між колонками (.fd-circles gap)
function planCollapsedPad(el) {
  const n = el.querySelectorAll('.fd-circle').length;
  if (!n) return;
  // .is-fit — це space-evenly: воно вже саме дає однакові відступи з обох боків,
  // тож додаткове поле там лише подвоїло б центрування.
  const inner = el.clientWidth - CIRCLE_PAD * 2;
  const tight = n * CIRCLE_RING + (n - 1) * CIRCLE_GAP;
  const pad = (!el.classList.contains('is-fit') && tight <= inner) ? (inner - tight) / 2 : 0;
  el.style.setProperty('--fit-pad', `${pad.toFixed(1)}px`);
}

// ⛔ ВІДКОЧЕНО 25.07: спроба з'їжджати кружечки у щільний ряд при згортанні назв
// (PR #596/#597). Вигляд був правильний, але з'явився БАГ у КОЖНОГО користувача:
// коли згорнуті кільця відцентровані, вони стоять на місці не самі по собі — JS
// щокадру КОМПЕНСУЄ горизонтальне гортання смуги. Гортання малює композитор миттєво,
// а компенсація приходить на кадр пізніше → кожен кадр «поїхало → повернулось» =
// швидке дьоргання. Вова: «я їх хочу проскролити в різні сторони, вони починають
// дьоргатись дуже швидко… якщо це буде важко вирішити, то просто поверни назад».
// ⚠️ ЗАКОН, ЯКИЙ ТУТ ПІДТВЕРДИВСЯ ВДРУГЕ ЗА ДЕНЬ: JS не може точно за пікселем
// повторювати прокрутку — він завжди на крок позаду. Будь-яка компенсація прокрутки
// з JS дає дьоргання. Якщо повертатись до цієї ідеї — тільки СПРАВЖНЬОЮ зміною
// розкладки (ширина колонки від --sh), щоб браузер сам рахував і прокрутку, і позиції;
// але тоді треба окремо вирішити, як не стрибала justify-content і .is-fit.

// ── Лайк (тільки авторизованим) ─────────────────────────────────────────────
async function toggleLike(postId) {
  if (!isLoggedIn()) { requireAuth('вподобати пост', () => {}); return; }  // гейт входу
  const uid = currentUserId();
  const rx = reactionMap.get(postId) || { count: 0, my: false };
  const on = !rx.my;
  // Оптимістично
  reactionMap.set(postId, { count: Math.max(0, rx.count + (on ? 1 : -1)), my: on });
  patchLike(postId);
  const res = await setPageReaction(postId, uid, on);
  if (!res.ok) {  // відкат
    reactionMap.set(postId, rx);
    patchLike(postId);
  }
}

// Realtime: лайк/зняття ІНШОГО користувача → оновити лічильник наживо.
// Свою подію ігноруємо (уже враховано оптимістично) — без подвоєння.
function applyReactionEvent(payload) {
  const row = payload.new || payload.old;
  if (!row || row.post_id == null) return;
  if (row.user_id === currentUserId()) return;         // своя реакція — вже врахована
  const rx = reactionMap.get(row.post_id) || { count: 0, my: false };
  if (payload.eventType === 'INSERT') rx.count += 1;
  else if (payload.eventType === 'DELETE') rx.count = Math.max(0, rx.count - 1);
  else return;                                         // UPDATE (зміна emoji) — лічильник той самий
  reactionMap.set(row.post_id, rx);
  patchLike(row.post_id);
}
function patchLike(postId) {
  const rx = reactionMap.get(postId) || { count: 0, my: false };
  document.querySelectorAll(`[data-like="${postId}"]`).forEach(btn => {
    btn.classList.toggle('fd-like--on', rx.my);
    btn.querySelector('.fd-ic').innerHTML = rx.my ? IC_HEART_F : IC_HEART_O;
    btn.querySelector('.fd-cnt').textContent = rx.count || '';
  });
}

// ── Коментарі (нижній лист, стиль Instagram) — з живою синхронізацією ────────
// openCommentSheet — поточний відкритий лист (postId + вузли), щоб realtime міг
// перемальовувати його наживо. Один лист за раз.
let openCommentSheet = null;
let replyTarget = null;   // { parentId, name } — активна відповідь у відкритому листі
let editTarget = null;    // { id } — коментар, який зараз редагують (взаємовиключно з відповіддю)
// Гілки, у яких людина натиснула «Ще N відповідей». Тримаємо ТУТ, а не в DOM, бо
// список перемальовується цілком щоразу, коли приходить чужий коментар (realtime) —
// у DOM цей стан не пережив би перемалювання. Скидається при кожному відкритті листа:
// зайшов у коментарі — гілки знову згорнуті (як у Facebook/Instagram).
const expandedThreads = new Set();
// Скільки відповідей видно до згортання. Показуємо ПЕРШІ — розмова читається згори вниз.
// 25.07 було 2 («дві відповіді і далі ховаються вже наступні»); 26.07 Вова звузив до 1:
// «зменши показ відповіді на коментар до 1 коментаря, а далі якщо є то кнопка показати
// більше». Діє на обидва рівні — і на відповіді кореня, і на під-відповіді.
const REPLIES_VISIBLE = 1;

// Українська відміна: 1 коментар · 2-4 коментарі · 5+ коментарів.
function pluralComments(n) {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return 'коментар';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'коментарі';
  return 'коментарів';
}

// Помилка бази → людська підказка. ⚠️ ТУТ БУВ ДРУГИЙ СЛОВНИК тих самих формулювань,
// і саме через нього той самий збій мав два різні тексти залежно від того, звідки
// прийшов. Тепер формулювання одні — у `netErrorText` (core/supabase.js), а тут лишився
// лише коментарний відтінок фрази «не надіслано»: людина натискала «Надіслати», і про
// коментар їй сказати доречніше, ніж про абстрактний «текст».
// Дописуєш нове формулювання — дописуй у netErrorText, не тут.
function commentErrorText(err) {
  const human = netErrorText(err);
  return human === 'Не вдалося зберегти — спробуй ще раз'
    ? 'Коментар не надіслано — спробуй ще раз'
    : human;
}

// Рядок коментаря — три поверхи, як у Facebook і Instagram (звірено зі скрінами Вови
// IMG_3607/IMG_3608, 25.07):
//   1) імʼя жирним + час сірим ПОРУЧ
//   2) текст коментаря ОКРЕМИМ рядком під ними
//   3) «Відповісти» / «Видалити» знизу
// Праворуч — ♥ і лічильник під сердечком.
//
// ⚠️ РАНІШЕ ТУТ БУЛО ІНАКШЕ і в коментарі стояло «імʼя + текст в один абзац (як в
// Instagram)». Це застаріло: обидві мережі відтоді розвели імʼя і текст по різних
// рядках. Вова: «чому коментар знаходиться навпроти імені? Ми ж говорили, що зверху
// імʼя, під іменем коментар». Тримаємо як у зразку — не повертати «в один абзац».
// reply=true → вкладена відповідь.
// replyTo — до КОГО чіпляти нову відповідь на цей коментар. Рахує дерево (commentThreads),
// а не сам рядок: тільки там видно рівень. Для 3-го рівня це господар гілки, не сам
// коментар — так глибина зупиняється на трьох, як у Facebook.
function commentRowHtml(c, reply = false, replyTo = null) {
  const nm = c.author_uid ? liveName('', c.author_uid, 'Житель') : 'Житель';  // вже екранований
  const mine = c.author_uid && c.author_uid === currentUserId();
  const lr = comReactMap.get(c.id) || { count: 0, my: false };
  // data-av-uid на аватарі й імені → тап відкриває картку профілю (делегат
  // initProfileCardTaps у profile-card.js слухає [data-av-uid] на document).
  const av = c.author_uid ? ` data-av-uid="${escapeHtml(c.author_uid)}"` : '';
  // data-com-id — щоб було за що вхопитись підсвітці й підтягуванню (раніше рядок не
  // мав ідентифікатора взагалі). Клас --replying ставиться ТУТ, а не лише в DOM:
  // список перемальовується цілком щоразу, коли приходить чужий коментар (realtime),
  // і без цього підсвітка зникала б посеред набору відповіді.
  const replying = replyTarget && replyTarget.commentId === c.id ? ' fd-com-row--replying' : '';
  // Згадка адресата: «Віктор,» на початку відповіді — без собачки, клікабельна, у кольорі
  // бренду (рішення Вови 25.07). Тримаємо uid, а не текст: імʼя підставляється ЖИВИМ через
  // liveName, тож після перейменування старі відповіді показують нове імʼя, а підробити
  // згадку набором тексту неможливо. data-av-uid — той самий делегат, що відкриває картку
  // профілю з аватара й імені, тож нової механіки тапу не додається.
  const mention = c.reply_to_uid
    ? `<span class="fd-com-mention"${nameUid(c.reply_to_uid)} data-av-uid="${escapeHtml(c.reply_to_uid)}">${liveName('', c.reply_to_uid, 'Житель')}</span>, `
    : '';
  // «змінено» біля часу — як у Facebook. Позначку ставить БАЗА при правці тексту
  // (тригер page_comments_guard_update), тож підробити її з клієнта не вийде:
  // мовчки переписати вже прочитаний людьми коментар не можна.
  const edited = c.edited_at ? ` · <span class="fd-com-edited">змінено</span>` : '';
  return `<div class="fd-com-row${reply ? ' fd-com-row--reply' : ''}${replying}" data-com-id="${c.id}"${c.author_uid ? ` data-com-uid="${c.author_uid}"` : ''}>
      <span class="fd-com-ava"${av}>${avatarHtml(cachedAvatar(c.author_uid), nm, 'fd-com-ava-img')}</span>
      <div class="fd-com-body">
        <div class="fd-com-head"><span class="fd-com-name"${nameUid(c.author_uid)}${av}>${nm}</span><span class="fd-com-time">${relTime(c.created_at)}${edited}</span></div>
        <div class="fd-com-line"><span class="fd-com-txt">${mention}${escapeHtml(c.text)}</span></div>
        <div class="fd-com-meta"><button class="fd-com-reply" data-reply-parent="${replyTo || c.parent_id || c.id}" data-reply-id="${c.id}" data-reply-uid="${c.author_uid || ''}" type="button">Відповісти</button>${mine ? `<button class="fd-com-edit" data-edit-com="${c.id}" type="button">Редагувати</button><button class="fd-com-del" data-del-com="${c.id}" type="button">Видалити</button>` : ''}</div>
      </div>
      <div class="fd-com-likewrap">
        <button class="fd-com-like${lr.my ? ' fd-com-like--on' : ''}" data-com-like="${c.id}" type="button" aria-label="Вподобати коментар">${lr.my ? IC_HEART_F : IC_HEART_O}</button>
        <span class="fd-com-likecnt" data-com-likes="${c.id}">${lr.count || ''}</span>
      </div>
    </div>`;
}

// Українська відміна для кнопки згортання: 1 відповідь · 2-4 відповіді · 5+ відповідей.
function pluralReplies(n) {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return 'відповідь';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'відповіді';
  return 'відповідей';
}

// Розкласти плаский список коментарів на ГІЛКИ: кореневий + його відповіді (за часом).
// Раніше повертався плаский масив рядків; тепер потрібні саме гілки, бо лінія-з'єднувач
// малюється по межах гілки, а «Ще N відповідей» рахується в її середині.
//
// ⚠️ ПРАВИЛО «ОДНА СІТКА» (Вова, 25.07): «якщо видаляється головний коментар, а йому
// відповідало 10 користувачів, має видалитися вся сітка». Тому відповідь на видалений
// коментар НЕ показуємо — раніше вона виринала у стрічці як самостійний коментар, і це
// було протилежне правило. Основну роботу робить база (тригер каскадного мʼякого
// видалення, scripts/supabase_comment_cascade.sql) — сюди такі відповіді просто не
// доїжджають. Ця перевірка — другий рубіж на випадок гонки: realtime міг принести
// видалення кореня раніше, ніж відповідей, і тоді на секунду вигулькнув би «сирота».
// ТРИ РІВНІ, як у Facebook (Вова 26.07, скріни IMG_3607/IMG_3637/IMG_3638):
//   1 корінь → 2 відповідь → 3 відповідь на відповідь → ГЛИБШЕ НЕ ЗМІЩУЄМО.
// Усе, що глибше, «сідає» на третій рівень до свого предка, а звʼязок показує згадка
// імені. Вова: «У фейсбук не безкінечно зміщується» — і це не примха, а арифметика:
// екран 390px, кожен рівень з'їдає відступ, на четвертому тексту лишається ~200px.
function commentThreads(list) {
  const byId = new Map(list.map(c => [c.id, c]));

  // Ланцюг предків знизу вгору: [батько, дід, …, корінь]. `seen` — захист від
  // зациклення на випадок битих даних: краще обірвати ланцюг, ніж повісити застосунок.
  const ancestors = (c) => {
    const out = []; const seen = new Set([c.id]);
    let cur = byId.get(c.parent_id);
    while (cur && !seen.has(cur.id)) { seen.add(cur.id); out.push(cur); cur = cur.parent_id ? byId.get(cur.parent_id) : null; }
    return out;
  };

  const lvl2 = new Map();   // id кореня      → відповіді 2-го рівня
  const lvl3 = new Map();   // id відповіді 2 → відповіді 3-го рівня (і всі глибші)
  const roots = [];
  for (const c of list) {
    if (!c.parent_id) { roots.push(c); continue; }
    const anc = ancestors(c);
    if (!anc.length) continue;                       // батька нема (видалений) — сирота
    if (anc.length === 1) {                          // батько кореневий → ми 2-й рівень
      if (!lvl2.has(anc[0].id)) lvl2.set(anc[0].id, []);
      lvl2.get(anc[0].id).push(c);
    } else {                                         // глибше → чіпляємось до предка 2-го рівня
      const host = anc[anc.length - 2];              // передостанній у ланцюгу = 2-й рівень
      if (!lvl3.has(host.id)) lvl3.set(host.id, []);
      lvl3.get(host.id).push(c);
    }
  }
  return roots.map(r => ({
    root: r,
    replies: (lvl2.get(r.id) || []).map(x => ({ c: x, subs: lvl3.get(x.id) || [] })),
  }));
}

// Розмітка однієї гілки. Обгортка .fd-com-branch навколо КОЖНОЇ відповіді — не зайвий
// рівень, а вимушений: лінія-гачок малюється псевдоелементом ::before, а на самому
// рядку ::before уже зайнятий підсвіткою адресата (.fd-com-row--replying). Без обгортки
// одне затерло б інше — саме тому гілка і підсвітка живуть на різних елементах.
// Кнопка згортання/розгортання — однакова для будь-якого рівня (Вова обрав варіант «як
// у Facebook»: кожна гілка згортається САМА, а не вся розмова одним махом).
function collapseBtnHtml(hostId, hidden, expanded, total, sub) {
  const cls = `fd-com-branch${sub ? ' fd-com-branch--sub' : ''}`;
  if (hidden > 0) return `<div class="${cls}"><button class="fd-com-more" data-more-parent="${hostId}" type="button">Ще ${hidden} ${pluralReplies(hidden)}</button></div>`;
  if (expanded && total > REPLIES_VISIBLE) return `<div class="${cls}"><button class="fd-com-more" data-less-parent="${hostId}" type="button">Сховати відповіді</button></div>`;
  return '';
}

function threadHtml(t) {
  const rows = [commentRowHtml(t.root, false, t.root.id)];
  if (!t.replies.length) return `<div class="fd-com-thread">${rows.join('')}</div>`;

  const expanded = expandedThreads.has(t.root.id);
  const visible = expanded ? t.replies : t.replies.slice(0, REPLIES_VISIBLE);
  const hidden = t.replies.length - visible.length;

  const branches = visible.map(r => {
    // Відповідь 2-го рівня: відповідати на неї → 3-й рівень, тож ціль = вона сама.
    let inner = commentRowHtml(r.c, true, r.c.id);
    let hasSub = '';
    if (r.subs.length) {
      const subOpen = expandedThreads.has(r.c.id);
      const subVis = subOpen ? r.subs : r.subs.slice(0, REPLIES_VISIBLE);
      const subHid = r.subs.length - subVis.length;
      // 🔑 Ціль відповіді для 3-го рівня — НЕ сам коментар, а його господар (2-й рівень).
      // Інакше зʼявився б 4-й рівень, а ми його свідомо не робимо: хто кому відповів
      // покаже згадка імені, як у Facebook.
      const subRows = subVis.map(s => `<div class="fd-com-branch fd-com-branch--sub">${commentRowHtml(s, true, r.c.id)}</div>`);
      const btn = collapseBtnHtml(r.c.id, subHid, subOpen, r.subs.length, true);
      if (btn) subRows.push(btn);
      inner += `<div class="fd-com-replies fd-com-replies--sub">${subRows.join('')}</div>`;
      // --has-sub: стовбур уздовж ЦІЄЇ відповіді, щоб її власна підгілка мала до чого
      // чіплятись. ⚠️ Раніше цей самий клас продовжував ще й лінію БАТЬКА повз неї —
      // прибрано 26.07: саме те продовження зліплювало гілку з наступним кореневим
      // коментарем (скрін IMG_3651). Деталі — у style/feed.css біля правила.
      hasSub = ' fd-com-branch--has-sub';
    }
    return `<div class="fd-com-branch${hasSub}">${inner}</div>`;
  });

  const btn = collapseBtnHtml(t.root.id, hidden, expanded, t.replies.length, false);
  if (btn) branches.push(btn);
  // --branched вмикає стовбур уздовж кореневого коментаря. Клас, а не CSS :has(),
  // навмисно: :has() з'явився лише в iOS 15.4, а лінія має бути в усіх однаково.
  return `<div class="fd-com-thread fd-com-thread--branched">${rows.join('')}<div class="fd-com-replies">${branches.join('')}</div></div>`;
}

// Оновити ♥ і текст «N вподобань» конкретного коментаря (без перемалювання списку).
function patchCommentLike(id) {
  const lr = comReactMap.get(id) || { count: 0, my: false };
  document.querySelectorAll(`[data-com-like="${id}"]`).forEach(b => {
    b.classList.toggle('fd-com-like--on', lr.my);
    b.innerHTML = lr.my ? IC_HEART_F : IC_HEART_O;
  });
  document.querySelectorAll(`[data-com-likes="${id}"]`).forEach(el => {
    el.textContent = lr.count || '';   // лише число, під сердечком (як в Instagram)
  });
}

// Лайк коментаря — тільки авторизованим (як лайк поста).
async function toggleCommentLike(id) {
  if (!isLoggedIn()) { requireAuth('вподобати коментар', () => {}); return; }
  const uid = currentUserId();
  const lr = comReactMap.get(id) || { count: 0, my: false };
  const on = !lr.my;
  comReactMap.set(id, { count: Math.max(0, lr.count + (on ? 1 : -1)), my: on });
  patchCommentLike(id);
  const res = await setPageCommentReaction(id, uid, on);
  if (!res.ok) { comReactMap.set(id, lr); patchCommentLike(id); }   // відкат
}

// Realtime: лайк коментаря ІНШОГО користувача → оновити лічильник (свою ігноруємо).
function applyCommentReactionEvent(payload) {
  const row = payload.new || payload.old;
  if (!row || row.comment_id == null) return;
  if (row.user_id === currentUserId()) return;
  const lr = comReactMap.get(row.comment_id) || { count: 0, my: false };
  if (payload.eventType === 'INSERT') lr.count += 1;
  else if (payload.eventType === 'DELETE') lr.count = Math.max(0, lr.count - 1);
  else return;
  comReactMap.set(row.comment_id, lr);
  patchCommentLike(row.comment_id);
}

// Перемалювати відкритий лист: заголовок-лічильник + список (кореневі + відповіді).
function renderCommentSheet() {
  if (!openCommentSheet) return;
  const { postId, listEl, titleEl } = openCommentSheet;
  const list = commentMap.get(postId) || [];
  // У заголовку — УСЬОГО коментарів під постом, а не скільки завантажено:
  // при частковому завантаженні «3 коментарі» під постом, де їх 80, брехало б.
  const total = commentCounts.get(postId) ?? list.length;
  if (titleEl) titleEl.textContent = commentTitleText(total);

  // ⚠️ ТРИ РІЗНІ СТАНИ, які раніше зливались в один порожній список:
  //   є дані           → показуємо їх (навіть якщо остання спроба оновити впала);
  //   даних нема + збій → екран помилки з кнопкою;
  //   даних нема, збою нема → ще вантажиться.
  // «Порожньо» (перший коментар) — лише всередині першої гілки, коли дані ПРИЙШЛИ
  // і їх справді нуль. Без цього поділу обрив зв'язку показував «Ще немає
  // коментарів. Будьте першим!» — тобто під постом із 40 коментарями людина бачила,
  // що всі вони зникли, а вона перша.
  if (!commentMap.has(postId) && commentError.has(postId)) {
    listEl.innerHTML = `<div class="fd-com-empty">
        Не вдалося завантажити коментарі.<br>Перевір зв'язок.
        <button class="fd-com-retry" type="button" data-com-retry="${postId}">Спробувати ще раз</button>
      </div>`;
    return;
  }
  if (!commentMap.has(postId)) {                       // ще вантажиться
    listEl.innerHTML = `<div class="fd-com-empty">Завантаження…</div>`;
    return;
  }
  // «Показати попередні» — зверху, як у Facebook/Instagram: старіші домальовуються
  // над уже прочитаним, і місце, де людина читала, не стрибає.
  const more = commentPaging.get(postId)?.hasMore
    ? `<button class="fd-com-more fd-com-more--older" type="button" data-com-older="${postId}">Показати попередні коментарі</button>`
    : '';
  // Обгортка .fd-com-inner тримає колонку рядків і гарантує невеликий запас ходу
  // прокрутки навіть коли коментарів мало (див. коментар до неї у style/feed.css).
  listEl.innerHTML = list.length
    ? `<div class="fd-com-inner">${more}${commentThreads(list).map(threadHtml).join('')}</div>`
    : `<div class="fd-com-empty">Ще немає коментарів. Будьте першим!</div>`;
}

// Текст заголовка листа — ОДНА функція на два місця (заголовок і його оновлення ззовні).
// 🔑 Навіщо окремо: до 26.07 заголовок формувався тільки всередині renderCommentSheet,
// а число під карткою — у patchCommentCount. Два різні шляхи до двох чисел, які мусять
// бути однакові, — саме так вони й розходились (Вова: «зверху пише 6, а по факту 4»).
function commentTitleText(total) {
  return total ? `${total} ${pluralComments(total)}` : 'Коментарі';
}

// Показати число під карткою І в заголовку відкритого листа — завжди разом.
function patchCommentCount(postId) {
  const n = commentCounts.get(postId) || 0;
  document.querySelectorAll(`[data-comments="${postId}"] .fd-cnt`).forEach(el => el.textContent = n || '');
  // Заголовок листа тепер оновлюється тим самим викликом — розійтися вони більше
  // не можуть за побудовою, хоч би звідки прийшла зміна числа.
  if (openCommentSheet && openCommentSheet.postId === postId && openCommentSheet.titleEl) {
    openCommentSheet.titleEl.textContent = commentTitleText(n);
  }
}

// ── ЗВІРКА ЛІЧИЛЬНИКА З БАЗОЮ (Вова 26.07: «має оновлюватися в реальному режимі.
//    В кожного користувача») ──────────────────────────────────────────────────────
// Кроковий +1/−1 дає миттєвий відгук, але будь-який кроковий лічильник рано чи пізно
// розходиться з дійсністю: подія може загубитись при обриві звʼязку або прийти двічі,
// а видалення коментаря, якого ми не завантажували, взагалі нічого не відніме.
// Тому після кожної події про коментарі питаємо базу, скільки їх насправді.
// Затримка — щоб пачка подій (каскадне видалення гілки — це N подій поспіль) дала
// ОДИН запит, а не N. Патерн «спершу оптимістично, потім звірка».
const COUNT_SYNC_DELAY = 400;
const countSyncTimers = new Map();   // postId → таймер відкладеної звірки

function scheduleCountSync(postId) {
  if (postId == null) return;
  clearTimeout(countSyncTimers.get(postId));
  countSyncTimers.set(postId, setTimeout(async () => {
    countSyncTimers.delete(postId);
    const n = await fetchPostCommentCount(postId);
    if (n == null) return;                       // не змогли спитати — лишаємо як є
    if (commentCounts.get(postId) !== n) {
      commentCounts.set(postId, n);
      patchCommentCount(postId);
    }
    // Число розійшлося з тим, що реально лежить у пам'яті → ми пропустили подію.
    // Перевантажуємо список, але ЛИШЕ коли він завантажений повністю: при частковому
    // (є «Показати попередні») довжина законно менша за загальну, і звірка тут
    // ганяла б запити по колу.
    const arr = commentMap.get(postId);
    const partial = commentPaging.get(postId)?.hasMore;
    if (openCommentSheet?.postId === postId && arr && !partial && arr.length !== n) {
      loadComments(postId).then(ok => { if (ok !== false) renderCommentSheet(); });
    }
  }, COUNT_SYNC_DELAY));
}

// Лічильник під карткою ведемо кроком (+1/−1), а не довжиною завантаженого масиву:
// масив тепер буває частковим (сторінка коментарів), і його довжина ≠ усього.
function bumpCommentCount(postId, delta) {
  commentCounts.set(postId, Math.max(0, (commentCounts.get(postId) || 0) + delta));
  patchCommentCount(postId);
}

// Додати/оновити коментар у мапі (дедуп за id → без подвоєння від оптимістичного
// додавання + realtime-події), перемалювати відкритий лист і лічильник карток.
function applyCommentUpsert(c) {
  if (!c) return;
  if (c.deleted_at) { applyCommentRemove(c); return; }
  // Пост не відкривали — коментарів у пам'яті нема. Масив НЕ створюємо: інакше
  // вийшов би обрубок з одного коментаря, який при відкритті листа видали б за
  // всю розмову. Оновлюємо лише лічильник під карткою.
  if (!commentMap.has(c.post_id)) { bumpCommentCount(c.post_id, +1); return; }

  const arr = commentMap.get(c.post_id);
  const idx = arr.findIndex(x => x.id === c.id);
  if (idx >= 0) arr[idx] = c;                 // редагування наявного — лічильник не чіпаємо
  else { arr.push(c); bumpCommentCount(c.post_id, +1); }   // новий
  arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  commentMap.set(c.post_id, arr);
  // Автор ще не в кеші імен — дотягнути ім'я/аватар і перемалювати після цього.
  const fresh = [c.author_uid, c.reply_to_uid].filter(u => u && !cachedName(u));
  if (fresh.length) {
    fetchAvatars(fresh).then(() => {
      if (openCommentSheet && openCommentSheet.postId === c.post_id) renderCommentSheet();
    });
  }
  if (openCommentSheet && openCommentSheet.postId === c.post_id) renderCommentSheet();
}

function applyCommentRemove(c) {
  if (!c) return;
  const arr = commentMap.get(c.post_id);
  if (!arr) { bumpCommentCount(c.post_id, -1); return; }   // пост не відкритий — лише лічильник
  // Віднімаємо ЛИШЕ якщо коментар справді був у списку. Своє видалення прилітає
  // двічі — з нашого ж коду і луною з realtime; без цієї перевірки лічильник
  // з'їхав би на −1 за кожне власне видалення.
  if (!arr.some(x => x.id === c.id)) return;
  commentMap.set(c.post_id, arr.filter(x => x.id !== c.id));
  bumpCommentCount(c.post_id, -1);
  // Адресата відповіді видалили (сам автор або інший адмін) поки ми писали — режим
  // відповіді тихо скидаємо: підсвічувати нема що, і смуга «Відповідь для…» брехала б.
  if (replyTarget && replyTarget.commentId === c.id) openCommentSheet?.clearReply?.();
  if (openCommentSheet && openCommentSheet.postId === c.post_id) renderCommentSheet();
}

// Завантажити коментарі поста (перша сторінка або старіші за «Показати попередні»).
// older=true — домальовуємо старіші ЗВЕРХУ до вже показаних.
// Розмір сторінки можна тимчасово зменшити з адреси: `#compages=2`. Потрібно, щоб
// перевірити «Показати попередні коментарі» на живому телефоні — при звичайному
// порозі 30 і теперішніх ~7 коментарях кнопка просто не з'явиться. Той самий підхід,
// що вже є у `#kbdebug` (core/keyboard.js): діагностика вмикається адресою і НЕ
// змінює поведінку для решти людей.
function commentsPageSize() {
  const m = /compages=(\d+)/.exec(location.hash || '');
  const n = m ? Number(m[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : COMMENT_ROOTS_PAGE;
}

async function loadComments(postId, { older = false } = {}) {
  const prev = older ? (commentMap.get(postId) || []) : [];
  const beforeTs = older ? commentPaging.get(postId)?.oldestTs || null : null;
  // Перше відкриття — заразом звіряємо лічильник із базою (див. fetchPostCommentCount:
  // кроковий +1/−1 може розійтись, якщо realtime-подія загубилась або прийшла двічі).
  const [{ comments, hasMore, error }, trueCount] = await Promise.all([
    fetchPostComments(postId, { beforeTs, limit: commentsPageSize() }),
    older ? Promise.resolve(null) : fetchPostCommentCount(postId),
  ]);

  // Запит упав. Порожнім списком НЕ підміняємо (див. fetchPostComments) і вже
  // завантажене не витираємо: при обриві зв'язку на дозавантаженні старіших те, що
  // людина вже читала, має лишитись на екрані.
  if (error) {
    // Екран помилки — ЛИШЕ коли показати нема чого. Якщо коментарі вже на екрані
    // (дозавантаження старіших або повторне відкриття поста), перекривати їх
    // помилкою гірше, ніж лишити прочитане на місці й сказати про збій тостом.
    if (older || commentMap.has(postId)) showToast('Не вдалося завантажити — перевір зв\'язок', 3500, 'error');
    else commentError.set(postId, true);
    return false;
  }
  commentError.delete(postId);
  if (trueCount != null) commentCounts.set(postId, trueCount);

  // Дедуп за id: поки тривав запит, realtime міг уже покласти сюди свіжий коментар.
  const seen = new Set(prev.map(c => c.id));
  const merged = [...comments.filter(c => !seen.has(c.id)), ...prev]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  commentMap.set(postId, merged);

  // oldestTs рахуємо по КОРЕНЕВИХ — сторінка міряється ними, і час відповіді
  // (вона завжди новіша за свій корінь) зрушив би межу не туди.
  const roots = merged.filter(c => !c.parent_id);
  commentPaging.set(postId, {
    hasMore,
    oldestTs: roots.length ? roots[0].created_at : null,
  });

  // Імена/аватари авторів цієї порції — інакше рядки покажуть «Житель».
  const uids = [...new Set(merged.flatMap(c => [c.author_uid, c.reply_to_uid]))]
    .filter(u => u && !cachedName(u));
  if (uids.length) await fetchAvatars(uids);
  return true;
}

// focusCommentId — прийшли зі сповіщення: після відкриття підсвітити і дотягнути
// саме той коментар (сама підсвітка — той самий клас, що й у режимі відповіді).
function openComments(postId, focusCommentId = null) {
  const myUid = currentUserId();
  const myAva = avatarHtml(cachedAvatar(myUid), cachedName(myUid) || 'Я', 'fd-com-ava-img');
  const sheet = document.createElement('div');
  // --kbsafe + внутрішній .fd-sheet-vp: затемнення і система координат — різні шари.
  // Рухається лише прозорий vp; затемнення статичне і лежить під клавіатурою.
  // Чому саме тут, а не в решті листів: тільки цей лист має поле вводу, тобто
  // тільки він живе під клавіатурою. Деталі — коментар у style/feed.css.
  sheet.className = 'fd-sheet-back fd-sheet-back--kbsafe';
  sheet.innerHTML = `
    <div class="fd-sheet-vp">
      <div class="fd-sheet fd-com-sheet">
        <div class="fd-com-grip">
          <div class="fd-sheet-handle"></div>
          <div class="fd-sheet-title fd-com-title">Коментарі</div>
        </div>
        <div class="fd-com-list"></div>
        <div class="fd-com-replybar" hidden><span class="fd-com-replyto"></span><button class="fd-com-replyx" type="button" aria-label="Скасувати відповідь">${IC_X}</button></div>
        <div class="fd-com-compose">
          <span class="fd-com-ava fd-com-myava">${myAva}</span>
          <input class="fd-com-input" type="text" placeholder="Додати коментар…" maxlength="1000">
          <button class="fd-com-send" type="button">${IC_SEND}</button>
        </div>
      </div>
    </div>`;
  const listEl = sheet.querySelector('.fd-com-list');
  const titleEl = sheet.querySelector('.fd-com-title');
  const replyBar = sheet.querySelector('.fd-com-replybar');
  const replyTo = sheet.querySelector('.fd-com-replyto');
  replyTarget = null;
  expandedThreads.clear();   // нове відкриття листа — гілки знову згорнуті (як у FB/IG)
  openCommentSheet = { postId, back: sheet, listEl, titleEl };
  renderCommentSheet();      // спершу «Завантаження…» — коментарів у пам'яті ще нема

  // Коментарі тягнемо САМЕ ЗАРАЗ, а не при завантаженні стрічки: лист відкривають
  // для одного поста, і немає сенсу возити з собою розмови всіх інших.
  loadComments(postId).then(() => {
    if (!openCommentSheet || openCommentSheet.postId !== postId) return;   // лист уже закрили
    // ⚠️ Розкриваємо гілку ПІСЛЯ clear() і ПІСЛЯ завантаження — інакше очищення
    // затерло б її, а до завантаження шукати не було б у чому. Потрібний коментар
    // може лежати під «Ще N», і тоді підсвічувати й гортати не було б до чого.
    if (focusCommentId) {
      const target = (commentMap.get(postId) || []).find(c => c.id === focusCommentId);
      if (target?.parent_id) expandedThreads.add(target.parent_id);
    }
    renderCommentSheet();
    // Прийшли зі сповіщення — показати саме той коментар. Клас підсвітки той самий,
    // що й у режимі відповіді, тож нового вигляду не вигадуємо. Знімаємо через 2.4с:
    // це підказка «ось воно», а не стан — залишена назавжди, вона плутала б із
    // режимом відповіді. Клас чіпляємо до DOM напряму, без replyTarget: людина ще
    // нічого не пише.
    if (focusCommentId) requestAnimationFrame(() => {
      const rowEl = listEl.querySelector(`[data-com-id="${focusCommentId}"]`);
      if (!rowEl) return;
      rowEl.classList.add('fd-com-row--replying');
      revealInScroller(listEl, rowEl, 12);
      setTimeout(() => rowEl.classList.remove('fd-com-row--replying'), 2400);
    });
  });

  // ── Клавіатура: уся механіка живе у core/keyboard.js (спільна для всіх аркушів) ──
  // Там же — історія трьох невдалих спроб і чому цей підхід інший: він нічого не
  // рахує через svh/innerHeight, а ВИМІРЮЄ, де верх аркуша стоїть у спокої, і тримає
  // цей вимір як інваріант. Замок скролу лишаємо — він гасить смикання документа.
  const comSheet = sheet.querySelector('.fd-com-sheet');
  const kbInput = sheet.querySelector('.fd-com-input');
  const unlockScroll = lockBodyScroll();
  // ⚠️ Саме підключення — НИЖЧЕ, після appendChild: модулю треба міряти реальну
  // розкладку, а поза документом браузер віддає нулі (та сама пастка, що у свайпу).
  let detachKb = () => {};

  // Підсвітка адресата: знімаємо з усіх, ставимо потрібному. Через DOM, а не
  // перемалюванням списку — інакше збився б скрол просто від тапу «Відповісти».
  const paintReply = () => {
    listEl.querySelectorAll('.fd-com-row--replying').forEach(r => r.classList.remove('fd-com-row--replying'));
    if (!replyTarget) return;
    listEl.querySelector(`[data-com-id="${replyTarget.commentId}"]`)?.classList.add('fd-com-row--replying');
  };
  // Підтягнути адресата у видиму зону — ТІЛЬКИ якщо його не видно (зайвий рух гірший
  // за його відсутність). Міряємо в межах самого списку: клавіатура його вже стиснула,
  // тож «видима зона» = висота списку. Запас 12px, щоб рядок не липнув до краю.
  const revealRow = (id) => revealInScroller(listEl, listEl.querySelector(`[data-com-id="${id}"]`));
  const revealReply = () => { if (replyTarget) revealRow(replyTarget.commentId); };
  // Вихід із режиму відповіді АБО правки — одна кнопка ✕ на тій самій смузі.
  // Окремої смуги для правки не заводив: це той самий за змістом стан «зараз пишу
  // не новий коментар, а щось конкретне», і два схожі елементи поруч плутали б.
  const input0 = () => sheet.querySelector('.fd-com-input');
  const clearReply = () => {
    replyTarget = null; replyBar.hidden = true; paintReply();
    if (editTarget) {                       // виходимо з правки — повертаємо порожнє поле
      editTarget = null;
      const el = input0(); if (el) { el.value = ''; el.placeholder = 'Додати коментар…'; }
    }
  };
  if (openCommentSheet) openCommentSheet.clearReply = clearReply;   // щоб realtime міг скинути режим

  // Увійти в режим правки свого коментаря: текст лягає в поле, смуга показує
  // «Редагування», ✕ скасовує. Кнопка надсилання та сама — вона вже означає
  // «підтвердити те, що в полі».
  const startEdit = (id) => {
    const c = (commentMap.get(postId) || []).find(x => x.id === id);
    if (!c) return;
    replyTarget = null; paintReply();       // правка і відповідь — взаємовиключні
    editTarget = { id };
    replyTo.textContent = 'Редагування коментаря';
    replyBar.hidden = false;
    const el = input0();
    if (el) { el.value = c.text; el.placeholder = 'Змініть текст…'; el.focus(); }
    requestAnimationFrame(() => revealRow(id));
  };
  const setReply = (parentId, name, commentId, uid) => {
    replyTarget = { parentId, name, commentId, uid };
    replyTo.textContent = `Відповідь для ${name}`;
    replyBar.hidden = false;
    paintReply();
    sheet.querySelector('.fd-com-input')?.focus();
    // Перший прохід — поки клавіатура ще їде; другий (після її появи) робить
    // onKeyboard нижче, коли список уже стиснувся до реального розміру.
    requestAnimationFrame(revealReply);
  };
  // Окремий гачок на перемалювання НЕ потрібен: клас підсвітки ставить сам
  // commentRowHtml за станом replyTarget, тож він відновлюється разом зі списком.
  sheet.querySelector('.fd-com-replyx').addEventListener('click', clearReply);
  // Імена учасників розмови (і авторів, і АДРЕСАТІВ відповідей — без других згадка
  // «Віктор,» показувала б «Житель») тягне loadComments разом із самою порцією:
  // окремий прохід тут дублював би той самий запит.

  // Свій аватар/ім'я для компоузера могли бути не в кеші — дотягнути й оновити.
  if (myUid && !cachedName(myUid)) fetchAvatars([myUid]).then(() => {
    const el = sheet.querySelector('.fd-com-myava');
    if (el) el.innerHTML = avatarHtml(cachedAvatar(myUid), cachedName(myUid) || 'Я', 'fd-com-ava-img');
  });

  const close = () => {
    detachKb();       // зняти слухачі клавіатури і повернути оверлею/аркушу CSS-розкладку
    unlockScroll();   // повернути скрол сторінки (body був зафіксований під клавіатуру)
    sheet.remove();
    if (openCommentSheet && openCommentSheet.back === sheet) openCommentSheet = null;
  };
  // Тап повз аркуш закриває лист.
  // 🔴 РЕГРЕС, ЯКИЙ Я САМ І ЗРОБИВ (PR #631, знайдено аудитом 26.07): раніше умова була
  // тільки `e.target === sheet`. Але після розчеплення шарів затемнення накрив прозорий
  // `.fd-sheet-vp` (fixed, inset:0) — і тап у затемнення почав потрапляти ВЖЕ В НЬОГО.
  // Умова переставала виконуватись, лист не закривався. Доведено:
  // `document.elementFromPoint` у затемненні повертав `fd-sheet-vp`, обробник мовчав.
  // Тому перевіряємо ОБИДВА шари: візуальний задник і шар-координати.
  const vpEl = sheet.querySelector('.fd-sheet-vp');
  sheet.addEventListener('click', e => { if (e.target === sheet || e.target === vpEl) close(); });

  // Розгорнути гілку («Ще N відповідей»).
  //   1) scrollTop знімаємо і повертаємо. ⚠️ Чесно: це СТРАХОВКА, а не рушій фіксу —
  //      заміряно, що при заміні innerHTML браузер утримує позицію сам, поки вміст
  //      лише росте (а тут він лише росте). Потрібна вона на випадок, коли між двома
  //      рендерами realtime щось видалив і стара позиція вийшла за новий максимум.
  //      Головне ж тут інше: нові рядки вставляються НИЖЧЕ кнопки, тому все, що вище
  //      неї, фізично не може зрушити — саме це й перевіряє тест.
  //   2) щойно показані рядки м'яко проявляються: порівнюємо набір id ДО і ПІСЛЯ
  //      і вішаємо клас лише на нові. Анімувати висоту списку НЕ можна — саме вона
  //      дає ривок прокрутки, через який ми вже відкочували роботу 25.07.
  const expandThread = (rootId) => {
    const st = listEl.scrollTop;
    const before = new Set([...listEl.querySelectorAll('[data-com-id]')].map(el => el.dataset.comId));
    expandedThreads.add(rootId);
    renderCommentSheet();
    listEl.scrollTop = st;
    listEl.querySelectorAll('[data-com-id]').forEach(el => {
      if (!before.has(el.dataset.comId)) el.closest('.fd-com-branch')?.classList.add('fd-com-branch--in');
    });
  };

  // Згорнути гілку («Сховати відповіді»). ⚠️ ТУТ утримання позиції справді необхідне,
  // на відміну від розгортання: вміст МЕНШАЄ, тож стара прокрутка виходить за новий
  // максимум — браузер зрізає її сам, і список смикається.
  //
  // 🔑 Тримаємось за САМУ КНОПКУ, а не за корінь гілки. Спершу пробував корінь — і це
  // не працює за побудовою: кнопка стоїть у кінці гілки, тож людина прокрутила донизу,
  // а після згортання прокрутці просто НЕМА КУДИ рухатись, щоб повернути далекий корінь
  // на місце (заміряно: лишалась розбіжність 464px). Кнопка ж — це те місце, де щойно
  // був палець, і саме її природно лишити під ним.
  //
  // Другий рубіж — revealInScroller: якщо прокрутка вперлась у межу і кнопка все одно
  // виїхала, підтягуємо її у видиму зону. Інакше людина натисла б «Сховати» і не
  // побачила результату своєї дії.
  const collapseThread = (rootId) => {
    const before = listEl.querySelector(`[data-less-parent="${rootId}"]`)?.getBoundingClientRect().top;
    expandedThreads.delete(rootId);
    renderCommentSheet();
    const after = listEl.querySelector(`[data-more-parent="${rootId}"]`);
    if (before == null || !after) return;
    const delta = after.getBoundingClientRect().top - before;
    if (Math.abs(delta) >= 1) listEl.scrollTop += delta;
    revealInScroller(listEl, after);
  };

  // «Показати попередні коментарі» — домалювати старішу сторінку ЗВЕРХУ.
  // Тримаємось за перший видимий рядок: нові вставляються над ним, і без цього
  // список стрибнув би рівно на висоту дозавантаженого (та сама механіка, що у
  // collapseThread — міряємо ДО і ПІСЛЯ та компенсуємо різницю прокруткою).
  const loadOlder = async (btn) => {
    const anchor = listEl.querySelector('[data-com-id]');
    const anchorId = anchor?.dataset.comId;
    const before = anchor?.getBoundingClientRect().top;
    btn.disabled = true; btn.textContent = 'Завантаження…';
    await loadComments(openCommentSheet.postId, { older: true });
    if (!openCommentSheet) return;
    renderCommentSheet();
    const after = anchorId && listEl.querySelector(`[data-com-id="${anchorId}"]`);
    if (after && before != null) {
      const delta = after.getBoundingClientRect().top - before;
      if (Math.abs(delta) >= 1) listEl.scrollTop += delta;
    }
  };

  // Дії в листі: лайк (♥) + «Відповісти» + «Ще N» / «Сховати відповіді» + видалення свого.
  listEl.addEventListener('click', async e => {
    const retry = e.target.closest('[data-com-retry]');
    if (retry) {
      const id = Number(retry.dataset.comRetry);
      commentError.delete(id);
      renderCommentSheet();                    // «Завантаження…» замість помилки
      await loadComments(id);
      if (openCommentSheet && openCommentSheet.postId === id) renderCommentSheet();
      return;
    }
    const older = e.target.closest('[data-com-older]');
    if (older) { await loadOlder(older); return; }
    const like = e.target.closest('[data-com-like]');
    if (like) { toggleCommentLike(Number(like.dataset.comLike)); return; }
    const more = e.target.closest('[data-more-parent]');
    if (more) { expandThread(Number(more.dataset.moreParent)); return; }
    const less = e.target.closest('[data-less-parent]');
    if (less) { collapseThread(Number(less.dataset.lessParent)); return; }
    const rep = e.target.closest('[data-reply-parent]');
    if (rep) {
      const uid = rep.dataset.replyUid;
      // parent — корінь гілки (відповіді у 2 рівні), commentId — САМЕ той рядок, на
      // якому натиснули: підсвічувати треба його, а не корінь.
      setReply(Number(rep.dataset.replyParent), (uid && cachedName(uid)) || 'Житель', Number(rep.dataset.replyId), uid || null);
      return;
    }
    const ed = e.target.closest('[data-edit-com]');
    if (ed) { startEdit(Number(ed.dataset.editCom)); return; }
    const del = e.target.closest('[data-del-com]');
    if (!del) return;
    const id = Number(del.dataset.delCom);
    if (!confirm('Видалити коментар?')) return;
    const res = await deletePageComment(id);
    if (res.ok) applyCommentRemove({ id, post_id: postId });   // realtime теж прийде — дедуп
    else showToast(res.error || 'Не вдалося видалити — спробуй ще раз', 4000, 'error');
  });

  const input = sheet.querySelector('.fd-com-input');
  const sendBtn = sheet.querySelector('.fd-com-send');
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;

    // ── Режим ПРАВКИ ─────────────────────────────────────────────────────────
    // Перевірки на матюк і сміттєвий набір лишаються (сервер їх теж проганяє при
    // редагуванні — інакше правка була б обхідним шляхом). А от дубль і флуд тут
    // НЕ рахуємо: виправити описку — не «написати те саме вдруге», і лічильник
    // швидкості за це карати не має.
    if (editTarget) {
      if (containsProfanity(text)) { showToast('🚫 Коментар містить заборонені слова', 3500, 'error'); return; }
      if (looksLikeSpam(text))     { showToast('🚫 Коментар схожий на спам', 4000, 'error'); return; }
      const id = editTarget.id;
      sendBtn.disabled = true;
      const res = await editPageComment(id, text);
      sendBtn.disabled = false;
      if (res.ok) {
        applyCommentUpsert(res.comment);   // realtime продублює — дедуп за id
        clearReply();                      // вийти з правки + очистити поле
        requestAnimationFrame(() => revealRow(id));
      } else {
        showToast(commentErrorText(res.error), 4000, 'error');
      }
      return;
    }

    const parentId = replyTarget ? replyTarget.parentId : null;
    // Кому адресована відповідь. Собі самому згадку не ставимо — вона виглядала б безглуздо
    // («Віктор, …» у відповіді самого Віктора) і породила б сповіщення самому собі.
    const replyToUid = replyTarget && replyTarget.uid && replyTarget.uid !== currentUserId()
      ? replyTarget.uid : null;
    // Фільтр матюків / спаму / дубля / флуду — блокуємо ДО відправки, тими самими
    // перевірками що й Обговорення (core/utils.js).
    //
    // scope дубля — ПОСТ + АДРЕСАТ. Вова 25.07: «якщо я відповідаю одній людині на
    // коментар "дякую" і другій людині хочу теж написати "дякую" то не можу, бо це
    // спам розцінюється». Подякувати двом різним людям — нормальна поведінка;
    // спам — це те саме слово ТІЙ САМІЙ людині вдруге.
    // Рівно так само рахує серверний тригер trg_page_comments_antispam; якщо ці
    // два правила розійдуться, людина побачить «надіслано», а база відхилить.
    if (containsProfanity(text)) { showToast('🚫 Коментар містить заборонені слова', 3500, 'error'); return; }
    if (looksLikeSpam(text))     { showToast('🚫 Коментар схожий на спам і не надісланий', 4000, 'error'); return; }
    const rateScope = `feed:${postId}:${replyToUid || 'root'}`;
    if (isDuplicateMsg(text, rateScope)) { showToast('Ви щойно це написали', 3000); return; }
    if (isFlooding())                    { showToast('Занадто швидко — зачекайте кілька секунд', 3500); return; }
    if (!isLoggedIn()) { close(); requireAuth('залишити коментар', () => {}); return; }
    sendBtn.disabled = true;
    const res = await addPageComment(postId, currentUserId(), text, parentId, replyToUid);
    sendBtn.disabled = false;
    if (res.ok) {
      // Лічильник флуду ведемо ЛИШЕ після успішної відправки — інакше невдала
      // спроба (пропав інтернет) з'їдала б ліміт людині ні за що.
      recordSentMsg(text, rateScope);
      // Відповів у згорнуту гілку — розгортаємо її ДО перемалювання, інакше власна
      // відповідь сховалась би під «Ще N», і вийшло б «я написав, а нічого не з'явилось».
      if (parentId) expandedThreads.add(parentId);
      applyCommentUpsert(res.comment);   // одразу показати свій (realtime продублює — дедуп)
      input.value = '';
      clearReply();
      input.focus();                     // клавіатура лишається відкритою (як в Instagram)
      requestAnimationFrame(() => revealRow(res.comment?.id));   // показати щойно надіслане
    } else if (res.gone) {
      // Батьківський коментар видалили, поки людина писала відповідь (реальний випадок
      // Вови 26.07: видалив коментар, а через 7 секунд відповів під нього — і саме так
      // народився невидимий коментар, через який лічильник казав «2», а в листі був один).
      // Мало сказати «уже видалено» — треба показати дійсність: скидаємо режим відповіді
      // й перезавантажуємо лист, щоб зниклий коментар зник і з екрана.
      showToast('Цей коментар уже видалено', 3500, 'error');
      clearReply();
      const ok = await loadComments(postId);
      if (ok !== false) renderCommentSheet();   // той самий патерн, що на «Показати попередні»
    } else {
      // Сервер — другий рубіж (хтось міг обійти клієнта через API, або списки
      // слів на двох рівнях розійшлись). Показуємо людську підказку, а не сирий
      // текст помилки бази: «antispam: нецензурна лексика» нікому нічого не каже.
      showToast(commentErrorText(res.error), 4000, 'error');   // без тихого провалу
    }
  };
  // 🔑 ПЕРШИЙ ТАП ПО «НАДІСЛАТИ» З'ЇДАВСЯ (Вова 26.07): «написав повідомлення і натискаю
  // надіслати, воно не надсилає, а відразу згортає клавіатуру; потім у закритому режимі
  // натискаю ще раз — і воно надсилає».
  // МЕХАНІКА (та сама сім'я, що HOT_RULES №10, тільки навпаки — розкладку рухає не наш
  // прогноз, а втрата фокуса): палець торкається кнопки → браузер знімає фокус з поля →
  // `blur` → клавіатура починає ховатись → аркуш розтягується назад на всю висоту →
  // кнопка їде вниз з-під пальця. Коли браузер рахує ціль для `click`, кнопки там уже
  // немає, і `send` не викликається. Другий тап працює, бо клавіатури вже нема і ніщо
  // не рухається.
  // ЛІКУЄМО ПРИЧИНУ: не даємо полю втратити фокус. `preventDefault` на `pointerdown`
  // скасовує саме перенесення фокуса (типова дія вказівника), а `click` після цього
  // приходить як звичайно — і приходить у кнопку, бо ніщо не зрушило.
  // Чому не «надсилати прямо на pointerdown»: тоді повідомлення пішло б ще до того, як
  // людина відпустила палець, тобто скасувати рух, повівши пальцем убік, стало б неможливо.
  sendBtn.addEventListener('pointerdown', e => e.preventDefault());
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  // Спершу в DOM, ТОДІ дротуємо жест: обробники читають реальні стилі елемента, а поза
  // документом браузер віддає порожнечу (через це фон спалахував чорним — див. sheet-motion.js).
  document.body.appendChild(sheet);
  // Свайп-закриття ТІЛЬКИ за шапку (рисочка + «7 коментарів»). Усередині списку
  // жест не існує — там лише прокрутка (Вова 25.07).
  const gripEl = sheet.querySelector('.fd-com-grip');
  attachSheetSwipe(sheet, comSheet, listEl, close, { grip: gripEl });
  // Шапка лежить ПОВЕРХ списку (щоб коментарі їхали під неї), тож у списку треба
  // звільнити під неї місце зверху. Висоту саме ВИМІРЮЄМО, а не прописуємо числом:
  // вона залежить від шрифту й міжрядкового інтервалу пристрою, і будь-яка формула
  // рано чи пізно розійшлась би з дійсністю (той самий принцип, що в core/keyboard.js).
  const padTop = () => {
    const h = gripEl.offsetHeight;
    if (h) listEl.style.paddingTop = `${h + 12}px`;   // 12px — рідний верхній відступ списку
  };
  padTop();
  // Заголовок міняється («Коментарі» → «7 коментарів») і в 1-2 слова може перенестись
  // на другий рядок — тоді висота шапки інша. Стежимо, а не міряємо один раз.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(padTop).observe(gripEl);
  // ⚠️ Першим аргументом — ПРОЗОРИЙ .fd-sheet-vp, а НЕ затемнення. Модуль рухає те,
  // що йому дали; дай йому затемнення — і воно поїде разом з клавіатурою (баг Вови 25.07).
  detachKb = attachKeyboardSheet(sheet.querySelector('.fd-sheet-vp'), comSheet, {   // клавіатура: тільки після DOM
    // kbClass тягне за собою і підкладку під системну панель iOS — вона зроблена
    // тінню самого аркуша (`.fd-com-sheet--kb`), тож окремий клас на оверлей не потрібен.
    input: kbInput, minHeight: 180, kbClass: 'fd-com-sheet--kb',
    // Закриває зону під низом аркуша, крізь яку просвічувала сторінка (Вова 26.07,
    // скрін IMG_3645). Деталі — у `.fd-sheet-vp--kb::after` у style/feed.css.
    overlayClass: 'fd-sheet-vp--kb',
    // Клавіатура доїхала і список стиснувся до реального розміру — аж тепер видно,
    // чи адресат лишився за кадром. Раніше цього моменту міряти нема сенсу.
    onOpen: revealReply,
  });
  requestAnimationFrame(() => sheet.classList.add('open'));

  // (підсвітка коментаря зі сповіщення — вище, у колбеку loadComments: до
  //  завантаження списку підсвічувати не було б чого)
}

// ── Екран сторінки (Екран 2) ────────────────────────────────────────────────
// Список постів каналу для сегмента «Дописи | Події».
// posts  — усі пости каналу (за свіжістю, як стрічка).
// events — лише пости-події, майбутні (event_date ≥ сьогодні), за датою зростання.
function screenListHtml(tab, pagePosts) {
  if (tab === 'events') {
    const today = todayKey();
    const evs = pagePosts
      .filter(p => p.event_date && p.event_date >= today)
      .sort((a, b) => a.event_date.localeCompare(b.event_date));
    return evs.length
      ? evs.map(postCardHtml).join('')
      : '<div class="fd-empty">Ще немає запланованих подій.</div>';
  }
  return pagePosts.length
    ? pagePosts.map(postCardHtml).join('')
    : '<div class="fd-empty">Тут ще немає постів.</div>';
}

// reopen=true — екран переоткривають одразу після того, як його прибрали з DOM вручну
// (опублікували пост / зберегли сторінку / видалили пост). Тоді запис в історії вже є,
// і новий додавати не треба — інакше вони б накопичувались і жест «назад» довелося б
// робити двічі. Див. core/layers.js.
async function openPageScreen(pageId, reopen = false) {
  const page = pages.find(p => p.id === pageId);
  if (!page) return;
  const canEdit = myPageIds.has(pageId);
  const subscribed = mySubs.has(pageId);
  const pagePosts = posts.filter(p => p.page_id === pageId);

  const screen = document.createElement('div');
  screen.className = 'fd-screen';
  screen.innerHTML = `
    <!-- 🔑 УСІ ТРИ КНОПКИ ШАПКИ — В ОДНОМУ ЛИПКОМУ БАРІ (Вова 25.07, вибір після IMG_3578).
         Раніше «⋯» жила в банері, а її меню — окремо, і після переводу банера в sticky вони
         роз'їхались: кнопка лишалась прибитою вгорі, а меню їхало вниз екрана. Тепер «⋯»
         стоїть поруч із «назад» і дзвіночком, а меню — тут же: вони фізично не можуть
         розійтися, і блок з аватаркою їх не накриває (бар малюється поверх нього).
         Тому НЕ ПОТРІБНІ ні згасання іконки, ні окреме правило «зникни, коли меню наїхало» —
         причина зникла, а не наслідки залатані. Лишилось одне правило: скрол закриває меню
         (див. нижче), щоб воно не висіло, коли користувач поїхав читати пости. -->
    <div class="fd-screen-fixedbar">
      <button class="fd-screen-back" type="button">${IC_BACK}</button>
      <button class="fd-bell${bellClass(pageId)}" data-bell="${pageId}" type="button" aria-label="Сповіщення">
        ${subscribed ? IC_BELL_F : IC_BELL}
      </button>
      ${canEdit ? `<button class="fd-screen-menu" type="button" aria-label="Меню сторінки">${IC_DOTS}</button>
      <div class="fd-screen-menu-pop" hidden>
        <button class="fd-screen-menu-item" data-edit-page="${pageId}" type="button">${IC_EDIT}Редагувати сторінку</button>
        <button class="fd-screen-menu-item" data-team-page="${pageId}" type="button">${IC_USERS}Команда сторінки</button>
      </div>` : ''}
    </div>
    <div class="fd-screen-top">
      <div class="fd-banner${page.banner_url ? ' fd-banner--view' : ''}">${page.banner_url ? `<img src="${escapeHtml(page.banner_url)}" alt="">` : ''}</div>
    </div>
    <div class="fd-screen-body">
      <div class="fd-screen-id">
        <span class="fd-screen-ava-wrap">
          <span class="fd-screen-ava${page.avatar_url ? ' fd-screen-ava--view' : ''}">${avatarHtml(page.avatar_url, page.name, 'fd-screen-ava-img')}</span>
        </span>
      </div>
      <div class="fd-screen-title">
        <!-- Скло-блюр окремим елементом (а не ::before): щоб JS писав його прозорість
             ПРЯМО, без CSS-змінної. Змінна знецінювала стилі всієї гілки на кожен
             кадр скролу — саме це й давало мікроривки. -->
        <i class="fd-screen-glass" aria-hidden="true"></i>
        <div class="fd-screen-title-in">
          <div class="fd-screen-name">${escapeHtml(page.name)}</div>
          ${page.theme ? `<div class="fd-screen-theme">${escapeHtml(page.theme)}</div>` : ''}
        </div>
      </div>
      <div class="fd-screen-tabs">
        <button class="fd-sctab is-on" data-sctab="posts"  type="button">Дописи</button>
        <button class="fd-sctab"       data-sctab="events" type="button">Події</button>
      </div>
      ${canEdit ? `<button class="fd-compose-open" type="button">${IC_IMG}<span>Написати пост…</span></button>` : ''}
      <div class="fd-screen-list">${screenListHtml('posts', pagePosts)}</div>
    </div>`;

  // Екран — повноекранний ШАР, підключений до історії браузера (core/layers.js).
  // Завдяки цьому системний жест «назад» від лівого краю на iPhone закриває САМЕ цей
  // екран, а не відкочує весь додаток на попередню вкладку (баг зі скріна IMG_3557).
  // reuseEntry — коли екран переоткривається після збереження сторінки: попередній
  // прибрано з DOM вручну, тож новий запис в історію не додаємо.
  // ЖЕСТ «НАЗАД» ОБСЛУГОВУЄ СИСТЕМА (див. core/layers.js). Власного свайпу тут НЕМА
  // навмисно: iOS однаково малює свою анімацію переходу, і два рухи накладались.
  // close — миттєве прибирання (систему вже відпрацювала анімацію);
  // animateOut — плавне зникнення для натискання КНОПКИ «назад», де анімації нема.
  const layer = openLayer(
    () => screen.remove(),
    {
      reuseEntry: reopen,
      animateOut: () => screen.classList.remove('open'),
    },
  );
  const closeScreen = () => closeLayer(layer, { animate: 240 });   // кнопка — з анімацією
  screen.querySelector('.fd-screen-back').addEventListener('click', closeScreen);
  const composeBtn = screen.querySelector('.fd-compose-open');
  if (composeBtn) composeBtn.addEventListener('click', () => openComposer(pageId));
  screen.querySelectorAll('[data-team-page]').forEach(b =>
    b.addEventListener('click', () => openPageTeam(pageId)));
  screen.querySelectorAll('[data-edit-page]').forEach(b =>
    b.addEventListener('click', () => openPageEditor(pageId)));
  wireCards(screen);           // лайк/коментарі всередині екрана сторінки
  wireGalleries(screen);       // каруселі фото в постах сторінки
  screen.querySelector('.fd-bell')?.addEventListener('click', () => toggleBell(pageId, screen));

  // Сегмент «Дописи | Події» — перемикає список у межах екрана каналу.
  screen.querySelectorAll('.fd-sctab').forEach(tab =>
    tab.addEventListener('click', () => {
      screen.querySelectorAll('.fd-sctab').forEach(t => t.classList.toggle('is-on', t === tab));
      const list = screen.querySelector('.fd-screen-list');
      list.innerHTML = screenListHtml(tab.dataset.sctab, pagePosts);
      wireCards(screen); wireGalleries(screen);
    }));

  // Перегляд фото банера/аватара на весь екран (для всіх; реюз openViewer).
  if (page.banner_url) screen.querySelector('.fd-banner--view')
    ?.addEventListener('click', () => openViewer([page.banner_url], 0));
  if (page.avatar_url) screen.querySelector('.fd-screen-ava--view')
    ?.addEventListener('click', () => openViewer([page.avatar_url], 0));

  // Меню «⋯» (лише адмін): відкрити/закрити; клік поза меню або по пункту — закриває.
  const menuBtn = screen.querySelector('.fd-screen-menu');
  const menuPop = screen.querySelector('.fd-screen-menu-pop');
  if (menuBtn && menuPop) {
    let openedAt = 0;   // scrollTop у момент відкриття — від нього рахуємо «користувач поїхав»
    menuBtn.addEventListener('click', e => {
      e.stopPropagation();
      menuPop.hidden = !menuPop.hidden;
      openedAt = screen.scrollTop;
    });
    screen.addEventListener('click', () => { if (!menuPop.hidden) menuPop.hidden = true; });
    // Скрол закриває меню (Вова 25.07: «щоб при скролі повернення назад воно не вісіло»).
    // Поріг 6px, а не будь-який рух: меню відкривається пальцем, і випадкове тремтіння на
    // 1-2px під час тапу не має його гасити. Перевірка дешева — одне порівняння чисел,
    // жодних вимірювань розкладки на кадр.
    screen.addEventListener('scroll', () => {
      if (menuPop.hidden) return;
      if (Math.abs(screen.scrollTop - openedAt) > 6) menuPop.hidden = true;
    }, { passive: true });
  }

  // Sticky-заголовок (iOS-стиль): та сама назва+опис при скролі доходить доверху,
  // ЗМЕНШУЄТЬСЯ і фіксується на рівні іконок; під нею проявляється скло-блюр (низ згасає).
  // --p (0..1): 0 у спокої, 1 коли назва пінається. scroll-linked, rAF.
  const title = screen.querySelector('.fd-screen-title');
  if (title) {
    let tRaf = 0, pinAt = 0;
    const RANGE = 60;                                 // 60px плавного згортання
    const SETTLE = 0;                                 // згортання завершується РІВНО в момент піну
                                                      // (p=1 при scrollTop=pinAt): останнє зменшення
                                                      // збігається з тим, як назва стає нерухомою вгорі.
                                                      // Дьоргання нема бо висота розчеплена (transform, не потік).
    const titleIn = title.querySelector('.fd-screen-title-in');
    const glass   = title.querySelector('.fd-screen-glass');
    // «⋯» згасає РАЗОМ із приходом назви у шапку (Вова 25.07: «вона займає місце у верхній
    // шапці, треба щоб назва спільноти заміняла його або щоб воно пропадало»). Беремо той
    // самий прогрес p, що вже рахується для назви — тож вони не можуть розсинхронізуватись,
    // і жодного нового обробника скролу чи заміру на кадр не додається.
    const dots = screen.querySelector('.fd-screen-menu');
    let pinScale = 0.78;   // цільовий масштаб у піні — рахує measurePin(), не кадр
    let tyMax = 8;         // на скільки текст опускається у піні (safe-area + 8), теж наперед
    let lastP = -1;        // останній записаний прогрес — щоб не писати те саме двічі
    // Поріг піну міряємо ОДИН раз (не щокадру getBoundingClientRect — то reflow і сіпання):
    // scroll-позиція, де верх назви дійде до верху екрана.
    // Заразом віддаємо склу реальну висоту заголовка (--fd-th): у довгих назв це 3 рядки
    // замість 2, і без цього скло не дотягувалось — опис випадав з-під блюру (IMG_3564).
    // offsetHeight = висота В ПОТОЦІ, на неї scale не впливає, тож міряти можна будь-коли.
    // Наскільки зменшувати назву у піні — рахуємо ДИНАМІЧНО (Вова 24.07, IMG_3568).
    // Було жорстко 0.78 для всіх: коротка «OLYKA CASTLE» стискалась так само сильно, як
    // довжелезна назва, хоч місця мала вдосталь. Тепер зменшуємо рівно настільки, щоб
    // текст влізав між іконками «назад»/«дзвіночок» — і не більше.
    // 12 (відступ іконки від краю) + 38 (сама іконка) + 18 (повітря між текстом і кружечком).
    // Повітря було 8px — на довгій назві літери майже торкались кружечків (Вова, IMG_3569:
    // «краї надпису заблизько розташовані до іконок»). 18px — межа, далі якої назва не лізе.
    const ICON_ZONE = 68;
    const PIN_MAX   = 0.86;   // стеля зменшення (Вова: «зменши цей стандарт» — було 0.90)
    const PIN_MIN   = 0.70;   // дрібніше — вже погано читається
    // Ширина найширшого РЯДКА (не коробки): рядок може бути коротшим за доступну ширину,
    // і тоді стискати його нема потреби. Range дає геометрію по рядках.
    const widestLine = (el) => {
      if (!el) return 0;
      const r = document.createRange();
      r.selectNodeContents(el);
      return [...r.getClientRects()].reduce((w, x) => Math.max(w, x.width), 0);
    };
    const measurePin = () => {
      if (!titleIn) return;
      // Рядки міряються у ЕКРАННИХ координатах, тобто вже із застосованим зменшенням.
      // Тому на час заміру знімаємо його і одразу повертаємо — в межах одного кадру,
      // на екрані не видно. Робиться лише при відкритті сторінки і при повороті.
      const prevT = titleIn.style.transform;
      titleIn.style.transform = 'none';
      const w = Math.max(widestLine(title.querySelector('.fd-screen-name')),
                         widestLine(title.querySelector('.fd-screen-theme')));
      titleIn.style.transform = prevT;
      const avail = Math.max(window.innerWidth - ICON_ZONE * 2, 1);
      const fit = w > 0 ? avail / w : PIN_MAX;
      pinScale = Math.min(PIN_MAX, Math.max(PIN_MIN, fit));
      title.style.setProperty('--fd-pin-s', pinScale.toFixed(3));   // висоту скла рахує CSS — рідко, не на кадр
    };
    // ⛔ Спробу перевести це на scroll-driven animation відкочено 25.07 — вона зсувала
    // МІСЦЕ зменшення (стискалось раніше, ніж заголовок доїжджав доверху). Прогрес знову
    // рахує JS: той самий діапазон, останнє зменшення рівно в момент піну.
    const measure = () => {
      pinAt = title.getBoundingClientRect().top - screen.getBoundingClientRect().top + screen.scrollTop;
      measurePin();   // спершу масштаб — від нього залежить і висота скла нижче
      if (titleIn) title.style.setProperty('--fd-th', `${titleIn.offsetHeight}px`);
      // Безпечну зону читаємо з уже застосованого стилю кнопки «назад»
      // (top: 10px + env(safe-area-inset-top)) — щоб на кадрі не розв'язувати env().
      const back = screen.querySelector('.fd-screen-back');
      const topPx = back ? parseFloat(getComputedStyle(back).top) : 10;
      tyMax = (Number.isFinite(topPx) ? topPx - 10 : 0) + 8;
      lastP = -1;   // сталі змінились (поворот екрана) → наступний кадр мусить перезаписати
    };
    // 🔑 НА КАДР — МІНІМУМ РОБОТИ (Вова 25.07: «ще ніби ривками»). Було: запис CSS-змінної
    // --p, від якої залежали і transform, і прозорість скла → браузер щокадру знецінював
    // стилі всієї гілки заголовка і наново розв'язував env() + два calc(). Стало: усе
    // стале пораховано наперед (tyMax, pinScale), а на кадр — два прямі записи в елементи,
    // обидва з тих, що малює відеокарта (зсув+масштаб і прозорість). Плюс якщо прогрес
    // не змінився (а поза 60-піксельним відрізком він завжди рівно 0 або 1) — не пишемо
    // взагалі. Поведінка та сама: ті самі числа, той самий момент фіксу.
    const applyTitle = () => {
      tRaf = 0;
      const p = Math.min(1, Math.max(0, (screen.scrollTop - (pinAt - RANGE - SETTLE)) / RANGE));  // лише scrollTop — дешево
      if (p === lastP) return;            // нічого не змінилось — не чіпаємо стилі
      lastP = p;
      if (titleIn) {
        titleIn.style.transform =
          `translate3d(0, ${(tyMax * p).toFixed(2)}px, 0) scale(${(1 - (1 - pinScale) * p).toFixed(4)})`;
      }
      if (glass) glass.style.opacity = p.toFixed(3);
      if (dots) {
        dots.style.opacity = (1 - p).toFixed(3);
        // Прозора кнопка все одно ловила б тапи — тому в піні її ще й вимикаємо.
        // Поріг 0.99, а не 1: на дробових прогресах (0.997) вона вже невидима.
        dots.style.pointerEvents = p > 0.99 ? 'none' : '';
      }
    };
    const onTitle = () => { if (!tRaf) tRaf = requestAnimationFrame(applyTitle); };
    screen.addEventListener('scroll', onTitle, { passive: true });
    window.addEventListener('resize', () => { measure(); onTitle(); });
    requestAnimationFrame(() => { measure(); applyTitle(); });
  }

  document.body.appendChild(screen);
  requestAnimationFrame(() => screen.classList.add('open'));
}

// Свайп-назад власними руками ПРИБРАНО 24.07 (скрін IMG_3559): жест від лівого краю —
// системний, iOS малює свою анімацію переходу, і наше перетягування накладалось згори
// (їхали два екрани). Тепер жест повністю обслуговує система через історію браузера —
// див. core/layers.js. Кнопка «назад» закриває з власною анімацією (animateOut).

// ── Чесний дзвіночок: три стани ──────────────────────────────────────────────
// 🔔 порожній  — не підписаний;
// 🔔 залитий   — підписаний, сповіщення реально дійдуть;
// ⚠️ бурштин   — підписаний, АЛЕ сповіщення НЕ дійдуть (нема дозволу / пристрій не вміє).
// Третій стан головний: раніше дзвіночок горів «увімкнено» навіть коли дозволу нема —
// користувач був певен що підписався, а не приходило нічого.
function bellClass(pageId) {
  if (!mySubs.has(pageId)) return '';
  return pushBlockedMsg() ? ' fd-bell--on fd-bell--warn' : ' fd-bell--on';
}
function paintBell(btn, pageId) {
  if (!btn) return;
  btn.className = `fd-bell${bellClass(pageId)}`;
  btn.innerHTML = mySubs.has(pageId) ? IC_BELL_F : IC_BELL;
  const why = mySubs.has(pageId) ? pushBlockedMsg() : null;
  btn.setAttribute('aria-label', why ? `Сповіщення: ${why}` : 'Сповіщення');
}

async function toggleBell(pageId, screen) {
  if (!isLoggedIn()) { requireAuth('увімкнути сповіщення', () => {}); return; }
  const on = !mySubs.has(pageId);

  // 🔑 ПОРЯДОК КРИТИЧНИЙ. Дозвіл на сповіщення запитуємо ПЕРШИМ — ще до будь-якого
  // await (запис у базу тощо). Браузер (особливо Safari/iOS) відкриває вікно дозволу
  // ЛИШЕ поки триває «жест користувача» — тобто прямо в обробнику тапу. Якщо перед
  // запитом дочекатись мережі, жест уже «згорів» і вікно не з'явиться взагалі —
  // саме тому раніше на iPhone нічого не приходило. registerFeedPushDevice()
  // викликаємо синхронно (без await перед ним) і чекаємо на результат уже після.
  const devicePromise = on ? registerFeedPushDevice() : null;

  if (on) mySubs.add(pageId); else mySubs.delete(pageId);
  const btn = screen.querySelector('.fd-bell');
  paintBell(btn, pageId);
  const res = await setPageSubscription(pageId, currentUserId(), on);
  if (!res.ok) {                       // відкат
    if (on) mySubs.delete(pageId); else mySubs.add(pageId);
    paintBell(btn, pageId);
    showToast('Не вдалося зберегти — спробуй ще раз');
    return;
  }
  // Підписка в базі збережена. Дивимось, чим закінчилась реєстрація пристрою.
  // Якщо push недоступний — кажемо чесно і лишаємо дзвіночок у стані ⚠️. Саму підписку
  // НЕ скасовуємо: щойно користувач дозволить сповіщення, вони почнуть приходити
  // (self-heal при старті перереєструє пристрій — крок 4).
  if (devicePromise) {
    const okDevice = await devicePromise;
    paintBell(btn, pageId);            // дозвіл міг щойно змінитись → перемалювати
    if (!okDevice) showToast(pushBlockedMsg() || 'Не вдалося увімкнути сповіщення — спробуй ще раз');
    else showToast('Сповіщення увімкнено');
  }
}

// Дозвіл на сповіщення + збереження push-пристрою під акаунт (сповіщення «Стрічки»).
// ⚠️ Викликати ЛИШЕ синхронно з обробника тапу (див. коментар у toggleBell) —
// інакше вікно дозволу не з'явиться на iOS. Реюз патерну чатів (P-5).
async function registerFeedPushDevice() {
  try {
    const sub = await ensurePushSubscription();
    if (!sub) return false;            // ЧОМУ саме — повідомляє викликач (єдине місце тостів)
    const j = sub.toJSON();
    await saveUserPushDevice({
      uid:      currentUserId(),
      endpoint: sub.endpoint,
      p256dh:   j.keys?.p256dh,
      auth_key: j.keys?.auth,
    });
    return true;
  } catch (e) { console.warn('[feed] registerFeedPushDevice:', e && e.message); return false; }
}

// ── Self-heal push-пристрою (крок 4) ─────────────────────────────────────────
// ПРОБЛЕМА: пристрій реєструвався ЛИШЕ в мить натискання дзвіночка. Тому сповіщення
// тихо вмирали у трьох звичайних життєвих випадках:
//   1) увімкнув дзвіночок на телефоні → на планшеті/іншому браузері пристрій не
//      зареєстрований, там не приходить нічого;
//   2) браузер періодично ПРОТЕРМІНОВУЄ push-підписку (endpoint змінюється) — старий
//      запис у базі стає мертвим, новий ніхто не створює → тиша назавжди;
//   3) хто підписався до появи Етапу 5 — має підписку в базі, але жодного пристрою.
// РІШЕННЯ: при кожному старті, якщо користувач має хоч одну підписку І дозвіл уже
// надано — тихо переконатись що підписка браузера жива, і зберегти її під акаунт.
// Дозвіл НЕ питаємо (він уже є) → жодних вікон і нав'язування; повний no-op для тих,
// хто дзвіночком не користується.
async function healFeedPushDevice() {
  try {
    if (!isLoggedIn() || !mySubs.size) return;
    if (pushBlockedMsg()) return;                       // недоступно/відмовлено — не смикаємо
    if (Notification.permission !== 'granted') return;  // дозвіл питає лише тап по дзвіночку
    await registerFeedPushDevice();
  } catch (e) { console.warn('[feed] healFeedPushDevice:', e && e.message); }
}

// ── Команда сторінки: власник + модератори (крок 5 потоку 24.07) ────────────
// Модератор може писати й редагувати пости сторінки, але додавати інших людей —
// ні: це право лише власника (перевірка на сервері, RPC can_manage_page).
// Додаємо за поштою: людина мусить хоч раз зайти в додаток через Google, інакше
// її акаунта ще не існує і сервер відповість «not_found».
function openPageTeam(pageId) {
  const page = pages.find(p => p.id === pageId);
  if (!page) return;

  const back = document.createElement('div');
  back.className = 'fd-sheet-back';
  back.innerHTML = `
    <div class="fd-sheet">
      <div class="fd-sheet-handle"></div>
      <div class="fd-sheet-title">Команда сторінки</div>
      <div class="fd-team-list">Завантажую…</div>
      <div class="fd-edit-field">
        <div class="fd-edit-label">Додати модератора за поштою</div>
        <div class="fd-team-add">
          <input class="fd-edit-input" data-email type="email" inputmode="email"
                 autocapitalize="off" autocorrect="off" placeholder="ім'я@gmail.com">
          <button class="fd-team-add-btn" type="button">Додати</button>
        </div>
        <div class="fd-team-hint">Права отримує лише той, хто вже має акаунт: людина має хоча б раз зайти в додаток через Google.</div>
      </div>
    </div>`;
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) close(); });

  const listEl = back.querySelector('.fd-team-list');
  const render = (rows) => {
    if (!rows.length) {
      listEl.innerHTML = '<div class="fd-team-empty">Керувати командою може лише власник сторінки.</div>';
      return;
    }
    listEl.innerHTML = rows.map(r => `
      <div class="fd-team-row">
        <div class="fd-team-who">
          <b>${escapeHtml(r.name || 'Без імені')}</b>
          <span>${escapeHtml(r.email || '')}</span>
        </div>
        <span class="fd-team-role">${r.role === 'owner' ? 'Власник' : 'Модератор'}</span>
        ${r.role === 'owner' ? '' : `<button class="fd-team-del" data-del="${escapeHtml(r.uid)}" type="button" aria-label="Прибрати">${IC_X}</button>`}
      </div>`).join('');
  };

  const reload = async () => render(await fetchPageModerators(pageId));
  reload();

  // Прибрати модератора (власника прибрати не можна — захист на сервері).
  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    if (!confirm('Прибрати цю людину зі сторінки?')) return;
    btn.disabled = true;
    const res = await removePageModerator(pageId, btn.dataset.del);
    if (res === 'ok') { showToast('Прибрано'); reload(); }
    else if (res === 'owner_protected') { btn.disabled = false; showToast('Власника сторінки прибрати не можна'); }
    else { btn.disabled = false; showToast('Не вдалося — спробуй ще раз'); }
  });

  const emailEl = back.querySelector('[data-email]');
  const addBtn = back.querySelector('.fd-team-add-btn');
  addBtn.addEventListener('click', async () => {
    const email = emailEl.value.trim();
    if (!email || !email.includes('@')) { showToast('Введи пошту повністю'); emailEl.focus(); return; }
    addBtn.disabled = true; addBtn.textContent = 'Додаю…';
    const res = await addPageModerator(pageId, email);
    addBtn.disabled = false; addBtn.textContent = 'Додати';
    if (res === 'ok')            { emailEl.value = ''; showToast('Модератора додано'); reload(); }
    else if (res === 'not_found') showToast('Акаунта з такою поштою ще немає — хай людина спершу зайде через Google');
    else if (res === 'already')  { emailEl.value = ''; showToast('Ця людина вже в команді сторінки'); }
    else if (res === 'bad_email') showToast('Перевір пошту — здається, у ній помилка');
    else showToast('Не вдалося додати — спробуй ще раз');
  });

  document.body.appendChild(back);   // спершу в DOM — тоді жест (див. sheet-motion.js)
  attachSheetSwipe(back, back.querySelector('.fd-sheet'), back.querySelector('.fd-sheet'), close);
  requestAnimationFrame(() => back.classList.add('open'));
}

// ── Композер: власник/адмін пише АБО редагує пост сторінки (кілька фото) ─────
// editPost заданий → режим редагування: префіл тексту + наявні фото, «Зберегти».
const MAX_PHOTOS = 10;
function openComposer(pageId, editPost = null) {
  const page = pages.find(p => p.id === pageId);
  if (!page) return;
  const edit = !!editPost;
  let existing = edit ? postImages(editPost).slice() : [];  // URL-и наявних фото (редагування)
  let files = [];               // масив File нових фото
  let previewUrls = [];         // objectURL-и для прев'ю нових (звільняємо при видаленні)
  const CTA = edit ? 'Зберегти' : 'Опублікувати';
  // Тип поста: допис або подія. Редагування події (є event_date) → одразу «Подія».
  let postType = (edit && editPost.event_date) ? 'event' : 'post';
  // Від чийого імені публікуємо. За замовчуванням — від СПІЛЬНОТИ (офіційний голос
  // сторінки, як у Facebook). «Від себе» лишає під текстом підпис автора-людини.
  // При редагуванні беремо те, що вже стоїть у поста.
  let showAuthor = edit ? (editPost.show_author !== false) : false;

  const back = document.createElement('div');
  back.className = 'fd-sheet-back';
  back.innerHTML = `
    <div class="fd-sheet fd-composer">
      <div class="fd-sheet-handle"></div>
      <div class="fd-sheet-title">${edit ? 'Редагувати' : 'Новий пост'} · ${escapeHtml(page.name)}</div>
      <div class="fd-comp-type">
        <button class="fd-comp-type-btn${postType === 'post'  ? ' is-on' : ''}" data-type="post"  type="button">Допис</button>
        <button class="fd-comp-type-btn${postType === 'event' ? ' is-on' : ''}" data-type="event" type="button">Подія</button>
      </div>
      <textarea class="fd-comp-text" placeholder="Що нового?" maxlength="4000" rows="5">${edit ? escapeHtml(editPost.text || '') : ''}</textarea>
      <div class="fd-comp-event"${postType === 'event' ? '' : ' hidden'}>
        <label class="fd-comp-field"><span class="fd-comp-flab">📅 Дата події</span>
          <input class="fd-comp-date" type="date" value="${edit ? escapeHtml(editPost.event_date || '') : ''}"></label>
        <label class="fd-comp-field"><span class="fd-comp-flab">🕐 Час (необовʼязково)</span>
          <input class="fd-comp-etime" type="time" value="${edit ? escapeHtml(editPost.event_time || '') : ''}"></label>
        <label class="fd-comp-field"><span class="fd-comp-flab">📍 Місце (необовʼязково)</span>
          <input class="fd-comp-eloc" type="text" maxlength="120" placeholder="Напр. Центральна площа, Олика" value="${edit ? escapeHtml(editPost.event_location || '') : ''}"></label>
      </div>
      <div class="fd-comp-thumbs" hidden></div>
      <div class="fd-comp-as">
        <div class="fd-comp-as-label">Публікувати як</div>
        <button class="fd-comp-as-btn${showAuthor ? '' : ' is-on'}" data-as="page" type="button">
          <span class="fd-comp-as-dot"></span><span class="fd-comp-as-txt">${escapeHtml(page.name || 'Спільнота')}</span></button>
        <button class="fd-comp-as-btn${showAuthor ? ' is-on' : ''}" data-as="me" type="button">
          <span class="fd-comp-as-dot"></span><span class="fd-comp-as-txt">Від себе</span></button>
      </div>
      <div class="fd-comp-bar">
        <label class="fd-comp-photo">${IC_IMG}<input type="file" accept="image/*" multiple hidden></label>
        <button class="fd-comp-send" type="button">${CTA}</button>
      </div>
    </div>`;
  const close = () => { previewUrls.forEach(u => URL.revokeObjectURL(u)); back.remove(); };
  back.addEventListener('click', e => { if (e.target === back) close(); });

  // Перемикач Допис/Подія — показує/ховає блок полів події.
  const eventBox = back.querySelector('.fd-comp-event');
  back.querySelectorAll('.fd-comp-type-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      postType = btn.dataset.type;
      back.querySelectorAll('.fd-comp-type-btn').forEach(b => b.classList.toggle('is-on', b === btn));
      eventBox.hidden = postType !== 'event';
    }));

  const fileInput = back.querySelector('input[type=file]');
  // Перемикач «від спільноти / від себе»
  back.querySelectorAll('.fd-comp-as-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      showAuthor = btn.dataset.as === 'me';
      back.querySelectorAll('.fd-comp-as-btn').forEach(b => b.classList.toggle('is-on', b === btn));
    }));

  const thumbs = back.querySelector('.fd-comp-thumbs');
  const renderThumbs = () => {
    if (!existing.length && !files.length) { thumbs.hidden = true; thumbs.innerHTML = ''; return; }
    thumbs.hidden = false;
    const exHtml = existing.map((u, i) =>
      `<div class="fd-comp-thumb"><img src="${escapeHtml(u)}" alt="">
        <button class="fd-comp-thumb-x" data-rmex="${i}" type="button">${IC_X}</button></div>`).join('');
    const nwHtml = files.map((f, i) =>
      `<div class="fd-comp-thumb"><img src="${previewUrls[i]}" alt="">
        <button class="fd-comp-thumb-x" data-rm="${i}" type="button">${IC_X}</button></div>`).join('');
    thumbs.innerHTML = exHtml + nwHtml;
  };
  fileInput.addEventListener('change', () => {
    for (const f of fileInput.files) {
      if (existing.length + files.length >= MAX_PHOTOS) break;
      files.push(f); previewUrls.push(URL.createObjectURL(f));
    }
    fileInput.value = '';       // щоб те саме фото можна було додати знову
    renderThumbs();
  });
  thumbs.addEventListener('click', e => {
    const rmEx = e.target.closest('[data-rmex]');
    if (rmEx) { existing.splice(Number(rmEx.dataset.rmex), 1); renderThumbs(); return; }
    const x = e.target.closest('[data-rm]'); if (!x) return;
    const i = Number(x.dataset.rm);
    URL.revokeObjectURL(previewUrls[i]);
    files.splice(i, 1); previewUrls.splice(i, 1);
    renderThumbs();
  });
  renderThumbs();               // показати наявні фото одразу в режимі редагування

  const sendBtn = back.querySelector('.fd-comp-send');
  sendBtn.addEventListener('click', async () => {
    const text = back.querySelector('.fd-comp-text').value.trim();
    // Подія: зібрати дату/час/місце. Дата — обовʼязкова; час і місце — опційні.
    // Якщо тип «Допис» — усі event-поля null (при редагуванні це знімає подію).
    const eventFields = { event_date: null, event_time: null, event_location: null };
    if (postType === 'event') {
      const d = back.querySelector('.fd-comp-date').value;
      if (!d) { showToast('Вкажи дату події'); return; }
      eventFields.event_date     = d;
      eventFields.event_time     = back.querySelector('.fd-comp-etime').value || null;
      eventFields.event_location = back.querySelector('.fd-comp-eloc').value.trim() || null;
    }
    if (!text && !existing.length && !files.length) return;
    if (text && containsProfanity(text)) { showToast('🚫 Пост містить заборонені слова', 3500, 'error'); return; }
    // Офлайн видно ще ДО спроби — не мучимо людину очікуванням заради відомого результату.
    if (navigator.onLine === false) {
      showToast('Немає інтернету — текст збережено у формі, спробуй пізніше', 4000, 'error');
      return;
    }
    sendBtn.disabled = true; sendBtn.textContent = edit ? 'Зберігаю…' : 'Публікую…';

    // ⚠️ try/finally: кнопка оживає ЗАВЖДИ. Раніше при несподіваному виняткові вона
    // лишалась «Зберігаю…» назавжди, і форма ставала непрацездатною (Вова, IMG_3635).
    try {
      // Завантажуємо нові фото ПОСЛІДОВНО (по одному), не паралельно: на iOS PWA
      // кілька одночасних upload у сховище падають «Load failed». Стиснення+повтор — у хелпері.
      let newUrls = [];
      if (files.length) {
        const failed = [];
        for (const f of files) {
          const up = await uploadImageReliable(f, { folder: 'pages/', maxDim: 1600, quality: 0.82 });
          if (up.url) newUrls.push(up.url);
          else failed.push(up.error || 'upload');
        }
        if (failed.length) {
          // Тост, а не alert(): alert блокує малювання, і кнопка встигала «застигнути»
          // у стані «Зберігаю…» ще до того, як браузер намалює її новий текст.
          showToast(`Не завантажилось фото (${failed.length}) — спробуй ще раз`, 4000, 'error');
          return;
        }
      }
      const finalUrls = [...existing, ...newUrls];   // наявні (залишені) + нові
      const res = edit
        ? await updatePagePost(editPost.id, { text: text || '', image_urls: finalUrls, image_url: finalUrls[0] || null, show_author: showAuthor, ...eventFields })
        : await createPagePost(pageId, currentUserId(), text || '', finalUrls, eventFields, showAuthor);
      if (res.ok) {
        if (edit) { const i = posts.findIndex(p => p.id === editPost.id); if (i >= 0) posts[i] = res.post; }
        else { posts.unshift(res.post); notifyNewPagePost(res.post.id); }   // push підписникам (лише новий пост)
        close();
        document.querySelectorAll('.fd-screen').forEach(s => s.remove());
        renderFeed();
        openPageScreen(pageId, true);   // переоткриття — запис в історії вже є
      } else {
        // Текст і фото лишаються у формі — людина просто тисне ще раз.
        showToast(res.error || 'Не вдалося зберегти — спробуй ще раз', 4000, 'error');
      }
    } finally {
      // Форму могли вже закрити (успіх) — тоді кнопки в документі нема, і це не помилка.
      if (sendBtn.isConnected) { sendBtn.disabled = false; sendBtn.textContent = CTA; }
    }
  });

  document.body.appendChild(back);   // спершу в DOM — тоді жест (див. sheet-motion.js)
  attachSheetSwipe(back, back.querySelector('.fd-sheet'), back.querySelector('.fd-sheet'), close);   // свайп-закриття
  autoGrowTextarea(back.querySelector('.fd-comp-text'));   // поле росте по тексту (скрол — сам лист)
  requestAnimationFrame(() => back.classList.add('open'));
}

// ── Редактор сторінки: банер + аватар + опис (власник/адмін) ────────────────
function openPageEditor(pageId) {
  const page = pages.find(p => p.id === pageId);
  if (!page) return;
  let bannerBlob = null, avatarBlob = null;

  const back = document.createElement('div');
  back.className = 'fd-sheet-back';
  back.innerHTML = `
    <div class="fd-sheet">
      <div class="fd-sheet-handle"></div>
      <div class="fd-sheet-title">Редагувати сторінку</div>
      <div class="fd-edit-field">
        <div class="fd-edit-label">Назва</div>
        <input class="fd-edit-input" data-name value="${escapeHtml(page.name || '')}" maxlength="120" placeholder="Назва спільноти">
      </div>
      <div class="fd-edit-field">
        <div class="fd-edit-label">Банер (широка шапка)</div>
        <label class="fd-edit-banner">${page.banner_url ? `<img src="${escapeHtml(page.banner_url)}" alt="">` : ''}${IC_CAMERA}<input type="file" accept="image/*" hidden data-b></label>
      </div>
      <div class="fd-edit-field">
        <div class="fd-edit-label">Аватар</div>
        <label class="fd-edit-avatar">${page.avatar_url ? `<img src="${escapeHtml(page.avatar_url)}" alt="">` : ''}${IC_CAMERA}<input type="file" accept="image/*" hidden data-a></label>
      </div>
      <div class="fd-edit-field">
        <div class="fd-edit-label">Тема / опис</div>
        <input class="fd-edit-input" data-theme value="${escapeHtml(page.theme || '')}" maxlength="80" placeholder="напр. Культура, Туризм">
      </div>
      <button class="fd-edit-save" type="button">Зберегти</button>
    </div>`;
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) close(); });

  const setPreview = (label, file) => {
    label.querySelector('img')?.remove();
    const img = document.createElement('img'); img.src = URL.createObjectURL(file); label.prepend(img);
  };
  const bInput = back.querySelector('[data-b]');
  const aInput = back.querySelector('[data-a]');
  // Після вибору фото — рамка кадрування: користувач сам наводить, що буде видно.
  // Пропорція 2.3:1 = реальна форма банера (.fd-screen-top: 168px висоти на всю ширину),
  // тож у рамці видно рівно те, що потім покажеться на сторінці. Аватар — кругла 1:1.
  // Скасував кадрування → нічого не міняємо (поле лишається як було).
  bInput.addEventListener('change', async () => {
    const f = bInput.files?.[0]; bInput.value = '';        // щоб те саме фото можна було обрати ще раз
    if (!f) return;
    const cropped = await openCropper(f, { aspect: 2.3, title: 'Банер сторінки' });
    if (!cropped) return;
    bannerBlob = cropped; setPreview(back.querySelector('.fd-edit-banner'), cropped);
  });
  aInput.addEventListener('change', async () => {
    const f = aInput.files?.[0]; aInput.value = '';
    if (!f) return;
    const cropped = await openCropper(f, { aspect: 1, round: true, title: 'Аватар спільноти' });
    if (!cropped) return;
    avatarBlob = cropped; setPreview(back.querySelector('.fd-edit-avatar'), cropped);
  });

  const saveBtn = back.querySelector('.fd-edit-save');
  saveBtn.addEventListener('click', async () => {
    if (navigator.onLine === false) { showToast('Немає інтернету — спробуй пізніше', 4000, 'error'); return; }
    saveBtn.disabled = true; saveBtn.textContent = 'Зберігаю…';
    try {
      const patch = {};
      if (bannerBlob) {
        // Сире телефонне фото падало «Load failed» — тепер стиснення+повтор через хелпер.
        // Кадр уже обрізаний і стиснений кроппером (JPEG) → вантажимо як готовий blob.
        const up = await uploadBlobWithRetry(bannerBlob, 'pages/');
        if (!up.url) { showToast('Банер не завантажився — спробуй ще раз', 4000, 'error'); return; }
        patch.banner_url = up.url;
      }
      if (avatarBlob) {
        const up = await uploadBlobWithRetry(avatarBlob, 'pages/');
        if (!up.url) { showToast('Аватар не завантажився — спробуй ще раз', 4000, 'error'); return; }
        patch.avatar_url = up.url;
      }
      const name = back.querySelector('[data-name]').value.trim();
      if (name && name !== page.name) patch.name = name;      // порожню назву не приймаємо
      const theme = back.querySelector('[data-theme]').value.trim();
      if (theme !== (page.theme || '')) patch.theme = theme;
      if (!Object.keys(patch).length) { close(); return; }

      const res = await updatePage(pageId, patch);
      if (res.ok) {
        Object.assign(page, res.page);                         // оновити кеш сторінки
        posts.forEach(p => { if (p.page_id === pageId && p.pages) { p.pages.avatar_url = page.avatar_url; p.pages.name = page.name; } });
        close();
        document.querySelectorAll('.fd-screen').forEach(s => s.remove());
        renderFeed();
        openPageScreen(pageId, true);   // переоткриття — запис в історії вже є
      } else {
        showToast(res.error || 'Не вдалося зберегти — спробуй ще раз', 4000, 'error');
      }
    } finally {
      if (saveBtn.isConnected) { saveBtn.disabled = false; saveBtn.textContent = 'Зберегти'; }
    }
  });

  document.body.appendChild(back);   // спершу в DOM — тоді жест (див. sheet-motion.js)
  attachSheetSwipe(back, back.querySelector('.fd-sheet'), back.querySelector('.fd-sheet'), close);   // свайп-закриття
  requestAnimationFrame(() => back.classList.add('open'));
}

// ── Меню поста «⋯» (власник/адмін сторінки): Редагувати / Видалити ───────────
function openPostMenu(postId) {
  const post = posts.find(p => p.id === postId);
  if (!post) return;
  const back = document.createElement('div');
  back.className = 'fd-sheet-back';
  back.innerHTML = `
    <div class="fd-sheet fd-postmenu">
      <div class="fd-sheet-handle"></div>
      <button class="fd-postmenu-item" data-act="edit" type="button">${IC_EDIT}Редагувати</button>
      <button class="fd-postmenu-item fd-postmenu-item--danger" data-act="del" type="button">${IC_TRASH}Видалити</button>
    </div>`;
  const close = () => back.remove();
  back.addEventListener('click', async e => {
    if (e.target === back) { close(); return; }
    const item = e.target.closest('[data-act]');
    if (!item) return;
    if (item.dataset.act === 'edit') { close(); openComposer(post.page_id, post); return; }
    // Видалення
    if (!confirm('Видалити пост?')) return;
    const res = await deletePagePost(postId);
    if (!res.ok) { showToast(res.error || 'Не вдалося видалити — спробуй ще раз', 4000, 'error'); return; }
    const hadScreen = !!document.querySelector('.fd-screen');
    posts = posts.filter(p => p.id !== postId);
    close();
    document.querySelectorAll('.fd-screen').forEach(s => s.remove());
    renderFeed();
    if (hadScreen) openPageScreen(post.page_id, true);   // переоткриття — запис в історії вже є
  });
  document.body.appendChild(back);   // спершу в DOM — тоді жест (див. sheet-motion.js)
  attachSheetSwipe(back, back.querySelector('.fd-sheet'), back.querySelector('.fd-sheet'), close);   // свайп-закриття
  requestAnimationFrame(() => back.classList.add('open'));
}

// ── Делегування подій на картках (лайк/коментарі/відкрити сторінку) ─────────
function wireCards(root) {
  root.addEventListener('click', e => {
    const menuBtn = e.target.closest('[data-post-menu]');   // «⋯» поста — перед open-page
    if (menuBtn) { openPostMenu(Number(menuBtn.dataset.postMenu)); return; }
    const likeBtn = e.target.closest('[data-like]');
    if (likeBtn) { toggleLike(Number(likeBtn.dataset.like)); return; }
    const comBtn = e.target.closest('[data-comments]');
    if (comBtn) { openComments(Number(comBtn.dataset.comments)); return; }
    const shareBtn = e.target.closest('[data-share]');
    if (shareBtn) { sharePost(Number(shareBtn.dataset.share)); return; }
    const view = e.target.closest('[data-view]');
    if (view) {                                  // тап по фото → повноекранний перегляд
      const post = posts.find(p => p.id === Number(view.dataset.view));
      if (post) openViewer(postImages(post), Number(view.dataset.idx) || 0);
      return;
    }
    const openPage = e.target.closest('[data-open-page]');
    if (openPage) { openPageScreen(Number(openPage.dataset.openPage)); return; }
  });
}

// ── Точка входу ─────────────────────────────────────────────────────────────
export async function initFeed() {
  const root = document.getElementById('page-shotam');
  if (root && !root.dataset.fdWired) {
    wireCards(root);            // делегування один раз на контейнер вкладки
    // Переміряти розкладку кружечків при зміні ширини екрана (поворот тощо).
    window.addEventListener('resize', layoutCircles);

    // Стискання топбару при скролі стрічки вниз: дві CSS-змінні (--sh, --sh-tight),
    // рахує shrinkProgress(), зчеплено зі скролом (scroll-linked).
    // Той самий патерн що на Громаді: слухач на .app-main + rAF-троттлінг.
    const main = document.querySelector('.app-main');
    const bar = root.querySelector('.fd-topbar');
    if (main && bar) {
      // Мертвої зони НЕМА (Вова 24.07): раніше перші 50px скролу нічого не
      // відбувалось, і аж потім назви різко згорталися за 40px. Пауза роз'єднувала
      // рух пальця і реакцію екрана — на телефоні це читалось як сильний ривок
      // («виходить нелогічний»). Тепер згортання зчеплене зі скролом з першого
      // пікселя, а діапазон розтягнуто 40→60px, щоб зміна була плавнішою.
      // ДВІ ФАЗИ (Вова 26.07): 0→60px згасають назви, 60→120px сходяться кільця.
      // Математика — у чистій shrinkProgress() вище (перевіряється тестом без браузера).
      let shRaf = 0;
      const applyShrink = () => {
        shRaf = 0;
        const p = shrinkProgress(main.scrollTop);
        bar.style.setProperty('--sh', p.name.toFixed(3));
        bar.style.setProperty('--sh-tight', p.tight.toFixed(3));
        // Пігулка «нові публікації» стоїть під топбаром, а топбар при скролі стає
        // нижчим — тому її верх перераховуємо тут же, а не окремим слухачем скролу.
        positionNewPostsPill();
      };
      const onShrink = () => { if (!shRaf) shRaf = requestAnimationFrame(applyShrink); };
      main.addEventListener('scroll', onShrink, { passive: true });
      window.addEventListener('cstl-tab-changed', onShrink);   // повернулись на Стрічку → перерахунок
      onShrink();
    }

    // Жива синхронізація коментарів: коментар будь-кого зʼявляється у всіх наживо
    // (відкритий лист перемальовується, лічильник картки оновлюється). Один раз.
    subscribePageComments(payload => {
      const t = payload.eventType;
      if (t === 'DELETE') applyCommentRemove(payload.old);
      else applyCommentUpsert(payload.new);   // INSERT + UPDATE (deleted_at → remove усередині)
      // …і одразу ставимо в чергу звірку з базою: кроковий +1/−1 вище дає миттєвий
      // відгук, а через мить приходить правда і мовчки її підтверджує або виправляє.
      // Так число однакове в УСІХ, навіть якщо чиясь подія загубилась дорогою.
      scheduleCountSync((payload.new || payload.old)?.post_id);
    });

    // Жива синхронізація САМИХ ПОСТІВ (новий/змінений/видалений) — у всіх, хто дивиться.
    subscribePagePosts(applyPostEvent);
    // Жива синхронізація лайків: лічильник ❤️ оновлюється у всіх наживо.
    subscribePageReactions(applyReactionEvent);
    // Жива синхронізація лайків КОМЕНТАРІВ (фаза 3b).
    subscribePageCommentReactions(applyCommentReactionEvent);

    root.dataset.fdWired = '1';
  }
  await loadData();
  renderFeed();
  healFeedPushDevice();     // тихо полагодити push-пристрій, якщо є підписки (див. нижче)

  // Перезавантаження при поверненні на вкладку (напр. після входу — з'явиться
  // композер/дзвіночок, оновляться мої лайки/підписки).
  window.addEventListener('cstl-tab-changed', () => {
    if (document.querySelector('.tab-item[data-tab="shotam"].active')) {
      loadData().then(renderFeed);
    }
  });
}
