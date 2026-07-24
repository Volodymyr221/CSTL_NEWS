// src/tabs/feed.js — «СТРІЧКА»: сторінки-канали громади (мінісоцмережа).
// Екран 1 (головна стрічка): горизонтальні кружечки-канали + вертикальна стрічка
// постів усіх сторінок. Екран 2 (сторінка каналу): банер+аватар, пости каналу,
// дзвіночок (push-підписка), поле «написати пост» для власника/адміна.
//
// Дата-шар — у core/supabase.js (pages/page_posts/page_reactions/page_comments/
// page_subscriptions). Права доступу — RLS у scripts/supabase_pages.sql.

import { escapeHtml, showToast, deepLink, formatEventDate, todayKey, compressImage, containsProfanity, autoGrowTextarea } from '../core/utils.js';
import { currentUserId, isLoggedIn, requireAuth } from '../core/auth.js';
import {
  fetchAvatars, cachedName, cachedAvatar, liveName, nameUid,
  uploadPhotoToStorage,
  fetchPages, fetchPagePosts, fetchPageReactions, setPageReaction,
  fetchPageComments, addPageComment, deletePageComment, fetchMyEditablePageIds,
  fetchPageCommentReactions, setPageCommentReaction, subscribePageCommentReactions,
  createPagePost, updatePagePost, deletePagePost, fetchMySubscriptions, setPageSubscription,
  updatePage, subscribePageComments, subscribePageReactions,
  saveUserPushDevice, notifyNewPagePost,
} from '../core/supabase.js';
import { ensurePushSubscription } from '../core/push.js';

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
const IC_DOTS   = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>';
const IC_TRASH  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2 -2l1 -12"/><path d="M9 7V4a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v3"/></svg>';

// ── Стан ────────────────────────────────────────────────────────────────────
let pages = [];               // усі сторінки-канали
let posts = [];               // пости стрічки (усіх сторінок)
let reactionMap = new Map();  // post_id → { count, my }
let commentMap = new Map();   // post_id → comments[]
let comReactMap = new Map();  // comment_id → { count, my } (лайки коментарів, фаза 3b)
let myPageIds = new Set();    // сторінки де я можу писати (власник/адмін)
let mySubs = new Set();       // сторінки на які я підписаний (дзвіночок)
let loaded = false;

// Ключ реакції = uid залогіненого. Лайк лише авторизованим (рішення Вови 22.07:
// анонімна реакція ламає ідентифікацію і статистику). Гість → null (жодна не «моя»).

// Відносний час: «щойно», «5 хв», «2 год», «вчора», «12.07».
function relTime(iso) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.floor((Date.now() - t) / 1000);
  if (diff < 60) return 'щойно';
  if (diff < 3600) return `${Math.floor(diff / 60)} хв`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} год`;
  if (diff < 172800) return 'вчора';
  const d = new Date(t);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Аватар-кружечок: фото або кольорова заглушка з першою літерою.
function avatarHtml(url, name, cls) {
  const letter = escapeHtml((name || '?').trim().charAt(0).toUpperCase() || '?');
  if (url) return `<img class="${cls}" src="${escapeHtml(url)}" alt="" loading="lazy">`;
  return `<span class="${cls} ${cls}--ph">${letter}</span>`;
}

// ── Завантаження даних ──────────────────────────────────────────────────────
async function loadData() {
  const [pg, ps, rx, cm, cr, mine, subs] = await Promise.all([
    fetchPages(),
    fetchPagePosts(null, 60),
    fetchPageReactions(currentUserId()),
    fetchPageComments(),
    fetchPageCommentReactions(currentUserId()),
    isLoggedIn() ? fetchMyEditablePageIds() : Promise.resolve(new Set()),
    isLoggedIn() ? fetchMySubscriptions()   : Promise.resolve(new Set()),
  ]);
  pages = pg; posts = ps; reactionMap = rx; commentMap = cm; comReactMap = cr; myPageIds = mine; mySubs = subs;

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

// Оновлення крапок/лічильника каруселі при свайпі.
function wireGalleries(root) {
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
  const close = () => { ov.remove(); document.body.style.overflow = ''; };
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
function attachSheetSwipe(back, panel, scroller, doClose) {
  scroller = scroller || panel;
  let startY = 0, dragging = false, dy = 0;
  panel.addEventListener('touchstart', e => {
    const y = e.touches[0].clientY;
    const inHeader = (y - panel.getBoundingClientRect().top) < 64;
    if (!inHeader && scroller.scrollTop > 0) return;   // це скрол тіла, не закриття
    startY = y; dragging = true; dy = 0;
  }, { passive: true });
  panel.addEventListener('touchmove', e => {
    if (!dragging) return;
    dy = e.touches[0].clientY - startY;
    if (dy <= 0) { panel.style.transform = ''; return; }     // тягнуть вгору — нативному скролу
    if (scroller.scrollTop > 0) {                            // ще прокручено — не хапаємо
      panel.style.transform = ''; startY = e.touches[0].clientY; dy = 0; return;
    }
    e.preventDefault();                                      // блокуємо нативний скрол поки тягнемо
    panel.style.transition = 'none';
    panel.style.transform = `translateY(${dy}px)`;
  }, { passive: false });
  panel.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    panel.style.transition = '';                            // повертаємо CSS-анімацію (плавно)
    if (dy > 90) { panel.style.transform = 'translateY(100%)'; back.classList.remove('open'); setTimeout(doClose, 240); }
    else panel.style.transform = '';                        // не дотягнув — плавно назад
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
  const cCount = (commentMap.get(post.id) || []).length;
  const authorName = post.author_uid ? liveName('', post.author_uid, '') : '';  // вже екранований
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
          <span class="fd-time">${relTime(post.created_at)}</span>
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
export async function focusFeedPost(id) {
  window.switchTab?.('shotam');
  if (!loaded) { await loadData(); renderFeed(); }
  let tries = 0;
  const tryFocus = () => {
    const el = document.querySelector(`#feed-list [data-post="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('fd-card--flash');
      setTimeout(() => el.classList.remove('fd-card--flash'), 1600);
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

// Розкладка кружечків-каналів: влазять у рядок → рівномірно по ширині (space-evenly,
// клас .is-fit); не влазять → горизонтальний скрол зліва (як сторіз). Замір натуральної
// ширини у скрол-режимі → overflow-safe (початок завжди досяжний). Викликається на
// рендер і на resize/поворот екрану.
function layoutCircles() {
  const el = document.querySelector('#feed-circles .fd-circles');
  if (!el) return;
  el.classList.remove('is-fit');                        // міряємо натуральну ширину
  if (el.scrollWidth <= el.clientWidth + 1) el.classList.add('is-fit');
}

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

// Українська відміна: 1 коментар · 2-4 коментарі · 5+ коментарів.
function pluralComments(n) {
  const d = n % 10, h = n % 100;
  if (d === 1 && h !== 11) return 'коментар';
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return 'коментарі';
  return 'коментарів';
}

// Рядок коментаря у стилі Instagram: аватар · (імʼя жирним + текст в один абзац) ·
// мета-рядок (час · «Відповісти» · «Видалити» на своєму) · праворуч ♥ і лічильник
// ПІД сердечком (як в Instagram). reply=true → вкладена відповідь (відступ).
// Відповідь чіпляється до кореневого коментаря (parent_id||id) — 2 рівні.
function commentRowHtml(c, reply = false) {
  const nm = c.author_uid ? liveName('', c.author_uid, 'Житель') : 'Житель';  // вже екранований
  const mine = c.author_uid && c.author_uid === currentUserId();
  const lr = comReactMap.get(c.id) || { count: 0, my: false };
  return `<div class="fd-com-row${reply ? ' fd-com-row--reply' : ''}"${c.author_uid ? ` data-com-uid="${c.author_uid}"` : ''}>
      <span class="fd-com-ava">${avatarHtml(cachedAvatar(c.author_uid), nm, 'fd-com-ava-img')}</span>
      <div class="fd-com-body">
        <div class="fd-com-line"><span class="fd-com-name"${nameUid(c.author_uid)}>${nm}</span> <span class="fd-com-txt">${escapeHtml(c.text)}</span></div>
        <div class="fd-com-meta"><span class="fd-com-time">${relTime(c.created_at)}</span><button class="fd-com-reply" data-reply-parent="${c.parent_id || c.id}" data-reply-uid="${c.author_uid || ''}" type="button">Відповісти</button>${mine ? `<button class="fd-com-del" data-del-com="${c.id}" type="button">Видалити</button>` : ''}</div>
      </div>
      <div class="fd-com-likewrap">
        <button class="fd-com-like${lr.my ? ' fd-com-like--on' : ''}" data-com-like="${c.id}" type="button" aria-label="Вподобати коментар">${lr.my ? IC_HEART_F : IC_HEART_O}</button>
        <span class="fd-com-likecnt" data-com-likes="${c.id}">${lr.count || ''}</span>
      </div>
    </div>`;
}

// Впорядкувати коментарі у 2 рівні: кожен кореневий → одразу його відповіді (за часом).
// Сироти (батька видалено/нема) показуємо як кореневі, щоб не зникали.
function orderedComments(list) {
  const repliesByParent = new Map();
  for (const c of list) if (c.parent_id) {
    if (!repliesByParent.has(c.parent_id)) repliesByParent.set(c.parent_id, []);
    repliesByParent.get(c.parent_id).push(c);
  }
  const out = [];
  for (const c of list) if (!c.parent_id) {
    out.push({ c, reply: false });
    for (const r of (repliesByParent.get(c.id) || [])) out.push({ c: r, reply: true });
  }
  const shown = new Set(out.map(o => o.c.id));
  for (const c of list) if (!shown.has(c.id)) out.push({ c, reply: false });  // сироти
  return out;
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
  if (titleEl) titleEl.textContent = list.length ? `${list.length} ${pluralComments(list.length)}` : 'Коментарі';
  listEl.innerHTML = list.length
    ? orderedComments(list).map(o => commentRowHtml(o.c, o.reply)).join('')
    : `<div class="fd-com-empty">Ще немає коментарів. Будьте першим!</div>`;
}

function patchCommentCount(postId) {
  const n = (commentMap.get(postId) || []).length;
  document.querySelectorAll(`[data-comments="${postId}"] .fd-cnt`).forEach(el => el.textContent = n || '');
}

// Додати/оновити коментар у мапі (дедуп за id → без подвоєння від оптимістичного
// додавання + realtime-події), перемалювати відкритий лист і лічильник карток.
function applyCommentUpsert(c) {
  if (!c) return;
  if (c.deleted_at) { applyCommentRemove(c); return; }
  const arr = commentMap.get(c.post_id) || [];
  const idx = arr.findIndex(x => x.id === c.id);
  if (idx >= 0) arr[idx] = c;                 // редагування наявного
  else arr.push(c);                           // новий
  arr.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  commentMap.set(c.post_id, arr);
  // Автор ще не в кеші імен — дотягнути ім'я/аватар і перемалювати після цього.
  if (c.author_uid && !cachedName(c.author_uid)) {
    fetchAvatars([c.author_uid]).then(() => {
      if (openCommentSheet && openCommentSheet.postId === c.post_id) renderCommentSheet();
    });
  }
  if (openCommentSheet && openCommentSheet.postId === c.post_id) renderCommentSheet();
  patchCommentCount(c.post_id);
}

function applyCommentRemove(c) {
  if (!c) return;
  const arr = commentMap.get(c.post_id);
  if (!arr) return;
  commentMap.set(c.post_id, arr.filter(x => x.id !== c.id));
  if (openCommentSheet && openCommentSheet.postId === c.post_id) renderCommentSheet();
  patchCommentCount(c.post_id);
}

function openComments(postId) {
  const myUid = currentUserId();
  const myAva = avatarHtml(cachedAvatar(myUid), cachedName(myUid) || 'Я', 'fd-com-ava-img');
  const sheet = document.createElement('div');
  sheet.className = 'fd-sheet-back';
  sheet.innerHTML = `
    <div class="fd-sheet fd-com-sheet">
      <div class="fd-sheet-handle"></div>
      <div class="fd-sheet-title fd-com-title">Коментарі</div>
      <div class="fd-com-list"></div>
      <div class="fd-com-replybar" hidden><span class="fd-com-replyto"></span><button class="fd-com-replyx" type="button" aria-label="Скасувати відповідь">${IC_X}</button></div>
      <div class="fd-com-compose">
        <span class="fd-com-ava fd-com-myava">${myAva}</span>
        <input class="fd-com-input" type="text" placeholder="Додати коментар…" maxlength="1000">
        <button class="fd-com-send" type="button">${IC_SEND}</button>
      </div>
    </div>`;
  const listEl = sheet.querySelector('.fd-com-list');
  const titleEl = sheet.querySelector('.fd-com-title');
  const replyBar = sheet.querySelector('.fd-com-replybar');
  const replyTo = sheet.querySelector('.fd-com-replyto');
  replyTarget = null;
  openCommentSheet = { postId, back: sheet, listEl, titleEl };
  renderCommentSheet();

  const clearReply = () => { replyTarget = null; replyBar.hidden = true; };
  const setReply = (parentId, name) => {
    replyTarget = { parentId, name };
    replyTo.textContent = `Відповідь для ${name}`;
    replyBar.hidden = false;
    sheet.querySelector('.fd-com-input')?.focus();
  };
  sheet.querySelector('.fd-com-replyx').addEventListener('click', clearReply);
  // Свій аватар/ім'я для компоузера могли бути не в кеші — дотягнути й оновити.
  if (myUid && !cachedName(myUid)) fetchAvatars([myUid]).then(() => {
    const el = sheet.querySelector('.fd-com-myava');
    if (el) el.innerHTML = avatarHtml(cachedAvatar(myUid), cachedName(myUid) || 'Я', 'fd-com-ava-img');
  });

  const close = () => {
    sheet.remove();
    if (openCommentSheet && openCommentSheet.back === sheet) openCommentSheet = null;
  };
  sheet.addEventListener('click', e => { if (e.target === sheet) close(); });

  // Дії в листі: лайк коментаря (♥) + «Відповісти» + видалення свого.
  listEl.addEventListener('click', async e => {
    const like = e.target.closest('[data-com-like]');
    if (like) { toggleCommentLike(Number(like.dataset.comLike)); return; }
    const rep = e.target.closest('[data-reply-parent]');
    if (rep) {
      const uid = rep.dataset.replyUid;
      setReply(Number(rep.dataset.replyParent), (uid && cachedName(uid)) || 'Житель');
      return;
    }
    const del = e.target.closest('[data-del-com]');
    if (!del) return;
    const id = Number(del.dataset.delCom);
    if (!confirm('Видалити коментар?')) return;
    const res = await deletePageComment(id);
    if (res.ok) applyCommentRemove({ id, post_id: postId });   // realtime теж прийде — дедуп
    else alert('Не вдалося видалити: ' + (res.error || ''));
  });

  const input = sheet.querySelector('.fd-com-input');
  const sendBtn = sheet.querySelector('.fd-com-send');
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    if (containsProfanity(text)) { showToast('🚫 Коментар містить заборонені слова', 3500, 'error'); return; }
    if (!isLoggedIn()) { close(); requireAuth('залишити коментар', () => {}); return; }
    sendBtn.disabled = true;
    const parentId = replyTarget ? replyTarget.parentId : null;
    const res = await addPageComment(postId, currentUserId(), text, parentId);
    sendBtn.disabled = false;
    if (res.ok) {
      applyCommentUpsert(res.comment);   // одразу показати свій (realtime продублює — дедуп)
      input.value = '';
      clearReply();
      input.focus();
    } else {
      alert('Коментар не надіслано: ' + (res.error || 'невідома помилка'));  // без тихого провалу
    }
  };
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  attachSheetSwipe(sheet, sheet.querySelector('.fd-sheet'), listEl, close);   // свайп-закриття
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
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

async function openPageScreen(pageId) {
  const page = pages.find(p => p.id === pageId);
  if (!page) return;
  const canEdit = myPageIds.has(pageId);
  const subscribed = mySubs.has(pageId);
  const pagePosts = posts.filter(p => p.page_id === pageId);

  const screen = document.createElement('div');
  screen.className = 'fd-screen';
  screen.innerHTML = `
    <div class="fd-screen-fixedbar">
      <button class="fd-screen-back" type="button">${IC_BACK}</button>
      <button class="fd-bell${subscribed ? ' fd-bell--on' : ''}" data-bell="${pageId}" type="button" aria-label="Сповіщення">
        ${subscribed ? IC_BELL_F : IC_BELL}
      </button>
    </div>
    <div class="fd-screen-top">
      ${canEdit ? `<button class="fd-screen-menu" type="button" aria-label="Меню сторінки">${IC_DOTS}</button>` : ''}
      <div class="fd-banner${page.banner_url ? ' fd-banner--view' : ''}">${page.banner_url ? `<img src="${escapeHtml(page.banner_url)}" alt="">` : ''}</div>
      ${canEdit ? `<div class="fd-screen-menu-pop" hidden><button class="fd-screen-menu-item" data-edit-page="${pageId}" type="button">${IC_EDIT}Редагувати сторінку</button></div>` : ''}
    </div>
    <div class="fd-screen-body">
      <div class="fd-screen-id">
        <span class="fd-screen-ava-wrap">
          <span class="fd-screen-ava${page.avatar_url ? ' fd-screen-ava--view' : ''}">${avatarHtml(page.avatar_url, page.name, 'fd-screen-ava-img')}</span>
        </span>
      </div>
      <div class="fd-screen-title">
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

  const closeScreen = () => { screen.classList.remove('open'); setTimeout(() => screen.remove(), 240); };
  screen.querySelector('.fd-screen-back').addEventListener('click', closeScreen);
  attachScreenSwipeBack(screen, closeScreen);   // свайп-назад від лівого краю (як Telegram/iOS)
  const composeBtn = screen.querySelector('.fd-compose-open');
  if (composeBtn) composeBtn.addEventListener('click', () => openComposer(pageId));
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
    menuBtn.addEventListener('click', e => { e.stopPropagation(); menuPop.hidden = !menuPop.hidden; });
    screen.addEventListener('click', () => { if (!menuPop.hidden) menuPop.hidden = true; });
  }

  // Sticky-заголовок (iOS-стиль): та сама назва+опис при скролі доходить доверху,
  // ЗМЕНШУЄТЬСЯ і фіксується на рівні іконок; під нею проявляється скло-блюр (низ згасає).
  // --p (0..1): 0 у спокої, 1 коли назва пінається. scroll-linked, rAF.
  const title = screen.querySelector('.fd-screen-title');
  if (title) {
    let tRaf = 0, pinAt = 0;
    const RANGE = 60;                                 // 60px плавного згортання
    const SETTLE = 24;                                // згортання завершується за 24px ДО піну →
                                                      // заголовок пінається вже у фінальній формі,
                                                      // ріст висоти не триває під час прилипання (без дьоргання нижніх блоків).
    // Поріг піну міряємо ОДИН раз (не щокадру getBoundingClientRect — то reflow і сіпання):
    // scroll-позиція, де верх назви дійде до верху екрана.
    const measure = () => { pinAt = title.getBoundingClientRect().top - screen.getBoundingClientRect().top + screen.scrollTop; };
    const applyTitle = () => {
      tRaf = 0;
      const p = Math.min(1, Math.max(0, (screen.scrollTop - (pinAt - RANGE - SETTLE)) / RANGE));  // лише scrollTop — дешево
      title.style.setProperty('--p', p.toFixed(3));
    };
    const onTitle = () => { if (!tRaf) tRaf = requestAnimationFrame(applyTitle); };
    screen.addEventListener('scroll', onTitle, { passive: true });
    window.addEventListener('resize', () => { measure(); onTitle(); });
    requestAnimationFrame(() => { measure(); applyTitle(); });
  }

  document.body.appendChild(screen);
  requestAnimationFrame(() => screen.classList.add('open'));
}

// Свайп-назад від ЛІВОГО краю (як Telegram/iOS): тягнеш екран вправо → закриття;
// менше третини ширини — снап назад. Під час перетягування transition вимкнено (йде
// за пальцем, без сіпання), на відпусканні — CSS-плавність. Тінь ліворуч (CSS box-shadow
// на .fd-screen) показує, що екран поверх попередньої сторінки.
function attachScreenSwipeBack(screen, close) {
  let sx = 0, sy = 0, dragging = false, lock = null;
  const winW = () => window.innerWidth || screen.clientWidth || 360;
  screen.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (t.clientX > 24) { dragging = false; return; }   // лише від самого лівого краю
    sx = t.clientX; sy = t.clientY; dragging = true; lock = null;
  }, { passive: true });
  screen.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (!lock && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) lock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
    if (lock === 'v') { dragging = false; screen.style.transition = ''; screen.style.transform = ''; return; }
    if (lock === 'h' && dx > 0) {
      e.preventDefault();
      screen.style.transition = 'none';
      screen.style.transform = `translateX(${dx}px)`;
    }
  }, { passive: false });
  screen.addEventListener('touchend', (e) => {
    if (!dragging) return;
    dragging = false;
    if (lock !== 'h') { screen.style.transition = ''; screen.style.transform = ''; return; }
    const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : sx) - sx;
    screen.style.transition = '';   // повернути CSS-плавність (transform 0.24s)
    if (dx > winW() * 0.33) {
      screen.style.transform = 'translateX(100%)';   // доїхати вправо → закрити
      close();
    } else {
      screen.style.transform = '';   // снап назад до translateX(0) (.open)
    }
  }, { passive: false });
}

async function toggleBell(pageId, screen) {
  if (!isLoggedIn()) { requireAuth('увімкнути сповіщення', () => {}); return; }
  const on = !mySubs.has(pageId);
  if (on) mySubs.add(pageId); else mySubs.delete(pageId);
  const btn = screen.querySelector('.fd-bell');
  if (btn) { btn.classList.toggle('fd-bell--on', on); btn.innerHTML = on ? IC_BELL_F : IC_BELL; }
  const res = await setPageSubscription(pageId, currentUserId(), on);
  if (!res.ok) {                       // відкат
    if (on) mySubs.delete(pageId); else mySubs.add(pageId);
    if (btn) { btn.classList.toggle('fd-bell--on', !on); btn.innerHTML = !on ? IC_BELL_F : IC_BELL; }
    return;
  }
  // Увімкнули дзвіночок → зареєструвати push-пристрій, щоб Edge-функція мала куди слати.
  // Реюз патерну чатів (P-5): дозвіл + браузер-підписка → user_push_devices за uid.
  if (on) registerFeedPushDevice();
}

// Запит дозволу на сповіщення + збереження push-пристрою під акаунт (для сповіщень «Стрічки»).
// Fire-and-forget: підписка в БД уже є; якщо push недоступний/відмовлено — тихо (тост-натяк).
async function registerFeedPushDevice() {
  try {
    const sub = await ensurePushSubscription();
    if (!sub) { showToast('Сповіщення вимкнено у браузері — дозволь у налаштуваннях'); return; }
    const j = sub.toJSON();
    await saveUserPushDevice({
      uid:      currentUserId(),
      endpoint: sub.endpoint,
      p256dh:   j.keys?.p256dh,
      auth_key: j.keys?.auth,
    });
  } catch (e) { console.warn('[feed] registerFeedPushDevice:', e && e.message); }
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
    sendBtn.disabled = true; sendBtn.textContent = edit ? 'Зберігаю…' : 'Публікую…';

    // Завантажуємо нові фото ПОСЛІДОВНО (по одному), не паралельно: на iOS PWA
    // кілька одночасних upload у сховище падають «Load failed». Кожне фото
    // стискаємо (телефонні 3-5 МБ) + один повтор при збої мережі. Кількість — до MAX_PHOTOS.
    let newUrls = [];
    if (files.length) {
      const failed = [];
      for (const f of files) {
        let url = null;
        for (let attempt = 0; attempt < 2 && !url; attempt++) {
          try {
            const blob = await compressImage(f, 1600, 0.82);   // більший розмір/якість для повного показу
            const res  = await uploadPhotoToStorage(blob, 'pages/');
            if (res.url) url = res.url;
            else if (attempt === 1) failed.push(res.error || 'upload');
          } catch (e) {
            if (attempt === 1) failed.push((e && e.message) || 'стиснення не вдалося');
          }
        }
        if (url) newUrls.push(url);
      }
      if (failed.length) {
        sendBtn.disabled = false; sendBtn.textContent = CTA;
        alert(`Не вдалося завантажити ${failed.length} фото: ${failed[0]}\nСпробуй ще раз.`);
        return;
      }
    }
    const finalUrls = [...existing, ...newUrls];   // наявні (залишені) + нові
    const res = edit
      ? await updatePagePost(editPost.id, { text: text || '', image_urls: finalUrls, image_url: finalUrls[0] || null, ...eventFields })
      : await createPagePost(pageId, currentUserId(), text || '', finalUrls, eventFields);
    if (res.ok) {
      if (edit) { const i = posts.findIndex(p => p.id === editPost.id); if (i >= 0) posts[i] = res.post; }
      else { posts.unshift(res.post); notifyNewPagePost(res.post.id); }   // push підписникам (лише новий пост)
      close();
      document.querySelectorAll('.fd-screen').forEach(s => s.remove());
      renderFeed();
      openPageScreen(pageId);
    } else {
      sendBtn.disabled = false; sendBtn.textContent = CTA;
      alert((edit ? 'Не вдалося зберегти: ' : 'Не вдалося опублікувати: ') + (res.error || ''));
    }
  });

  attachSheetSwipe(back, back.querySelector('.fd-sheet'), back.querySelector('.fd-sheet'), close);   // свайп-закриття
  document.body.appendChild(back);
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
  bInput.addEventListener('change', () => { const f = bInput.files?.[0]; if (f) { bannerBlob = f; setPreview(back.querySelector('.fd-edit-banner'), f); } });
  aInput.addEventListener('change', () => { const f = aInput.files?.[0]; if (f) { avatarBlob = f; setPreview(back.querySelector('.fd-edit-avatar'), f); } });

  const saveBtn = back.querySelector('.fd-edit-save');
  saveBtn.addEventListener('click', async () => {
    saveBtn.disabled = true; saveBtn.textContent = 'Зберігаю…';
    const patch = {};
    if (bannerBlob) {
      const up = await uploadPhotoToStorage(bannerBlob, 'pages/');
      if (!up.url) { saveBtn.disabled = false; saveBtn.textContent = 'Зберегти'; alert('Банер не завантажився: ' + (up.error || '')); return; }
      patch.banner_url = up.url;
    }
    if (avatarBlob) {
      const up = await uploadPhotoToStorage(avatarBlob, 'pages/');
      if (!up.url) { saveBtn.disabled = false; saveBtn.textContent = 'Зберегти'; alert('Аватар не завантажився: ' + (up.error || '')); return; }
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
      openPageScreen(pageId);
    } else {
      saveBtn.disabled = false; saveBtn.textContent = 'Зберегти';
      alert('Не вдалося зберегти: ' + (res.error || ''));
    }
  });

  attachSheetSwipe(back, back.querySelector('.fd-sheet'), back.querySelector('.fd-sheet'), close);   // свайп-закриття
  document.body.appendChild(back);
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
    if (!res.ok) { alert('Не вдалося видалити: ' + (res.error || '')); return; }
    const hadScreen = !!document.querySelector('.fd-screen');
    posts = posts.filter(p => p.id !== postId);
    close();
    document.querySelectorAll('.fd-screen').forEach(s => s.remove());
    renderFeed();
    if (hadScreen) openPageScreen(post.page_id);
  });
  attachSheetSwipe(back, back.querySelector('.fd-sheet'), back.querySelector('.fd-sheet'), close);   // свайп-закриття
  document.body.appendChild(back);
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

    // Стискання топбару при скролі стрічки вниз: прогрес 0..1 на перших SHRINK_RANGE
    // пікселів → CSS-змінна --sh (кільця/відступи меншають плавно, scroll-linked).
    // Той самий патерн що на Громаді: слухач на .app-main + rAF-троттлінг.
    const main = document.querySelector('.app-main');
    const bar = root.querySelector('.fd-topbar');
    if (main && bar) {
      const SHRINK_START = 50;   // мертва зона: перші 50px скролу назви ще стоять повністю
      const SHRINK_RANGE = 40;   // далі на 40px плавно згортаються (50→90px)
      let shRaf = 0;
      const applyShrink = () => {
        shRaf = 0;
        const p = Math.min(1, Math.max(0, (main.scrollTop - SHRINK_START) / SHRINK_RANGE));
        bar.style.setProperty('--sh', p.toFixed(3));
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
    });

    // Жива синхронізація лайків: лічильник ❤️ оновлюється у всіх наживо.
    subscribePageReactions(applyReactionEvent);
    // Жива синхронізація лайків КОМЕНТАРІВ (фаза 3b).
    subscribePageCommentReactions(applyCommentReactionEvent);

    root.dataset.fdWired = '1';
  }
  await loadData();
  renderFeed();

  // Перезавантаження при поверненні на вкладку (напр. після входу — з'явиться
  // композер/дзвіночок, оновляться мої лайки/підписки).
  window.addEventListener('cstl-tab-changed', () => {
    if (document.querySelector('.tab-item[data-tab="shotam"].active')) {
      loadData().then(renderFeed);
    }
  });
}
