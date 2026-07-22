// src/tabs/feed.js — «СТРІЧКА»: сторінки-канали громади (мінісоцмережа).
// Екран 1 (головна стрічка): горизонтальні кружечки-канали + вертикальна стрічка
// постів усіх сторінок. Екран 2 (сторінка каналу): банер+аватар, пости каналу,
// дзвіночок (push-підписка), поле «написати пост» для власника/адміна.
//
// Дата-шар — у core/supabase.js (pages/page_posts/page_reactions/page_comments/
// page_subscriptions). Права доступу — RLS у scripts/supabase_pages.sql.

import { escapeHtml } from '../core/utils.js';
import { currentUserId, isLoggedIn, requireAuth } from '../core/auth.js';
import {
  getAnonId, fetchAvatars, cachedName, cachedAvatar, liveName, nameUid,
  uploadPhotoToStorage,
  fetchPages, fetchPagePosts, fetchPageReactions, setPageReaction,
  fetchPageComments, addPageComment, fetchMyEditablePageIds,
  createPagePost, deletePagePost, fetchMySubscriptions, setPageSubscription,
  updatePage, subscribePageComments,
} from '../core/supabase.js';

// ── Іконки (вектор, у стилі додатку) ────────────────────────────────────────
const IC_HEART_O = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12.6l-7.5 7.4-7.5-7.4a5 5 0 0 1 7.1-7.1l.4.4.4-.4a5 5 0 0 1 7.1 7.1z"/></svg>';
const IC_HEART_F = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M19.5 12.6l-7.5 7.4-7.5-7.4a5 5 0 0 1 7.1-7.1l.4.4.4-.4a5 5 0 0 1 7.1 7.1z"/></svg>';
const IC_COMMENT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 8.5-8.5 8.5 8.5 0 0 1 8.5 8.5z"/></svg>';
const IC_BELL   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6"/><path d="M9 17v1a3 3 0 0 0 6 0v-1"/></svg>';
const IC_BELL_F = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"><path d="M14.235 19c.865 0 1.322 1.024.745 1.668A3.992 3.992 0 0 1 12 22a3.992 3.992 0 0 1-2.98-1.332c-.552-.616-.158-1.579.634-1.661L10 19h4.235z"/><path d="M12 2c1.358 0 2.506.903 2.875 2.141l.046.171.008.043a8.013 8.013 0 0 1 4.024 6.069l.028.287L19 11v2.931l.021.136a3 3 0 0 0 1.143 1.847l.167.117.162.099c.86.487.56 1.766-.377 1.864L20 18H4c-1.028 0-1.387-1.364-.493-1.87a3 3 0 0 0 1.472-2.063L5 13.924V11c0-2.71 1.346-5.152 3.454-6.62A3.002 3.002 0 0 1 12 2z"/></svg>';
const IC_BACK   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6"/></svg>';
const IC_IMG    = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12z"/><path d="M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5"/><path d="M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3"/></svg>';
const IC_SEND   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14l11 -11"/><path d="M21 3l-6.5 18a.55 .55 0 0 1 -1 0l-3.5 -7l-7 -3.5a.55 .55 0 0 1 0 -1l18 -6.5"/></svg>';
const IC_CLOSE  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';
const IC_X      = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';
const IC_EDIT   = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5 -10.5a2.83 2.83 0 0 0 -4 -4l-10.5 10.5v4"/><path d="M13.5 6.5l4 4"/></svg>';
const IC_CAMERA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h2l1 -2h8l1 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-9a2 2 0 0 1 2 -2"/><circle cx="12" cy="13" r="3"/></svg>';

// ── Стан ────────────────────────────────────────────────────────────────────
let pages = [];               // усі сторінки-канали
let posts = [];               // пости стрічки (усіх сторінок)
let reactionMap = new Map();  // post_id → { count, my }
let commentMap = new Map();   // post_id → comments[]
let myPageIds = new Set();    // сторінки де я можу писати (власник/адмін)
let mySubs = new Set();       // сторінки на які я підписаний (дзвіночок)
let feedSearch = '';          // рядок пошуку у стрічці
let loaded = false;

// Ключ реакції: uid залогіненого або анонімний clientId (як у Дошці).
function userKey() { return currentUserId() || getAnonId(); }

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
  const key = userKey();
  const [pg, ps, rx, cm, mine, subs] = await Promise.all([
    fetchPages(),
    fetchPagePosts(null, 60),
    fetchPageReactions(key),
    fetchPageComments(),
    isLoggedIn() ? fetchMyEditablePageIds() : Promise.resolve(new Set()),
    isLoggedIn() ? fetchMySubscriptions()   : Promise.resolve(new Set()),
  ]);
  pages = pg; posts = ps; reactionMap = rx; commentMap = cm; myPageIds = mine; mySubs = subs;

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
    return `<div class="fd-photo" data-view="${postId}" data-idx="0"><img src="${escapeHtml(images[0])}" alt="" loading="lazy"></div>`;
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

function postCardHtml(post) {
  const page = post.pages || {};
  const rx = reactionMap.get(post.id) || { count: 0, my: false };
  const cCount = (commentMap.get(post.id) || []).length;
  const authorName = post.author_uid ? liveName('', post.author_uid, '') : '';  // вже екранований
  const photo = galleryHtml(postImages(post), post.id);
  const author = authorName
    ? `<div class="fd-author"${nameUid(post.author_uid)}>— ${authorName}</div>` : '';
  return `
    <article class="fd-card" data-post="${post.id}">
      <header class="fd-card-head" data-open-page="${post.page_id}">
        <span class="fd-ava-wrap">${avatarHtml(page.avatar_url, page.name, 'fd-ava')}</span>
        <span class="fd-head-txt">
          <span class="fd-page-name">${escapeHtml(page.name || 'Сторінка')}</span>
          <span class="fd-time">${relTime(post.created_at)}</span>
        </span>
      </header>
      ${photo}
      <div class="fd-text">${escapeHtml(post.text)}</div>
      ${author}
      <footer class="fd-actions">
        <button class="fd-like${rx.my ? ' fd-like--on' : ''}" data-like="${post.id}" type="button">
          <span class="fd-ic">${rx.my ? IC_HEART_F : IC_HEART_O}</span><span class="fd-cnt">${rx.count || ''}</span>
        </button>
        <button class="fd-cbtn" data-comments="${post.id}" type="button">
          <span class="fd-ic">${IC_COMMENT}</span><span class="fd-cnt">${cCount || ''}</span>
        </button>
      </footer>
    </article>`;
}

// ── Рендер: головна стрічка (Екран 1) ───────────────────────────────────────
function renderFeed() {
  const circlesEl = document.getElementById('feed-circles');
  const listEl = document.getElementById('feed-list');
  if (circlesEl) circlesEl.innerHTML = circlesHtml();
  if (!listEl) return;
  const q = feedSearch.trim().toLowerCase();
  const shown = q
    ? posts.filter(p => ((p.pages?.name || '') + ' ' + (p.text || '')).toLowerCase().includes(q))
    : posts;
  if (!shown.length) {
    listEl.innerHTML = q
      ? `<div class="fd-empty">Нічого не знайдено за запитом «${escapeHtml(feedSearch.trim())}».</div>`
      : `<div class="fd-empty">Поки що тут порожньо.<br>Незабаром сторінки громади почнуть публікувати новини.</div>`;
    return;
  }
  listEl.innerHTML = shown.map(postCardHtml).join('');
  wireGalleries(listEl);
}

// ── Лайк ────────────────────────────────────────────────────────────────────
async function toggleLike(postId) {
  const rx = reactionMap.get(postId) || { count: 0, my: false };
  const on = !rx.my;
  // Оптимістично
  reactionMap.set(postId, { count: Math.max(0, rx.count + (on ? 1 : -1)), my: on });
  patchLike(postId);
  const res = await setPageReaction(postId, userKey(), on);
  if (!res.ok) {  // відкат
    reactionMap.set(postId, rx);
    patchLike(postId);
  }
}
function patchLike(postId) {
  const rx = reactionMap.get(postId) || { count: 0, my: false };
  document.querySelectorAll(`[data-like="${postId}"]`).forEach(btn => {
    btn.classList.toggle('fd-like--on', rx.my);
    btn.querySelector('.fd-ic').innerHTML = rx.my ? IC_HEART_F : IC_HEART_O;
    btn.querySelector('.fd-cnt').textContent = rx.count || '';
  });
}

// ── Коментарі (нижній лист) — з живою синхронізацією ─────────────────────────
// openCommentSheet — поточний відкритий лист (postId + вузли), щоб realtime міг
// перемальовувати його наживо. Один лист за раз.
let openCommentSheet = null;

function commentRowHtml(c) {
  const nm = c.author_uid ? liveName('', c.author_uid, 'Житель') : 'Житель';  // вже екранований
  return `<div class="fd-com-row">
      <span class="fd-com-ava">${avatarHtml(cachedAvatar(c.author_uid), nm, 'fd-com-ava-img')}</span>
      <div class="fd-com-body"><span class="fd-com-name"${nameUid(c.author_uid)}>${nm}</span>
      <span class="fd-com-txt">${escapeHtml(c.text)}</span></div>
    </div>`;
}

function renderCommentList(postId, listEl) {
  const list = commentMap.get(postId) || [];
  listEl.innerHTML = list.length
    ? list.map(commentRowHtml).join('')
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
      if (openCommentSheet && openCommentSheet.postId === c.post_id)
        renderCommentList(c.post_id, openCommentSheet.listEl);
    });
  }
  if (openCommentSheet && openCommentSheet.postId === c.post_id)
    renderCommentList(c.post_id, openCommentSheet.listEl);
  patchCommentCount(c.post_id);
}

function applyCommentRemove(c) {
  if (!c) return;
  const arr = commentMap.get(c.post_id);
  if (!arr) return;
  commentMap.set(c.post_id, arr.filter(x => x.id !== c.id));
  if (openCommentSheet && openCommentSheet.postId === c.post_id)
    renderCommentList(c.post_id, openCommentSheet.listEl);
  patchCommentCount(c.post_id);
}

function openComments(postId) {
  const sheet = document.createElement('div');
  sheet.className = 'fd-sheet-back';
  sheet.innerHTML = `
    <div class="fd-sheet">
      <div class="fd-sheet-handle"></div>
      <div class="fd-sheet-title">Коментарі</div>
      <div class="fd-com-list"></div>
      <div class="fd-com-compose">
        <input class="fd-com-input" type="text" placeholder="Написати коментар…" maxlength="1000">
        <button class="fd-com-send" type="button">${IC_SEND}</button>
      </div>
    </div>`;
  const listEl = sheet.querySelector('.fd-com-list');
  renderCommentList(postId, listEl);
  openCommentSheet = { postId, back: sheet, listEl };

  const close = () => {
    sheet.remove();
    if (openCommentSheet && openCommentSheet.back === sheet) openCommentSheet = null;
  };
  sheet.addEventListener('click', e => { if (e.target === sheet) close(); });

  const input = sheet.querySelector('.fd-com-input');
  const sendBtn = sheet.querySelector('.fd-com-send');
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    if (!isLoggedIn()) { close(); requireAuth('залишити коментар', () => {}); return; }
    sendBtn.disabled = true;
    const res = await addPageComment(postId, currentUserId(), text);
    sendBtn.disabled = false;
    if (res.ok) {
      applyCommentUpsert(res.comment);   // одразу показати свій (realtime продублює — дедуп)
      input.value = '';
      input.focus();
    } else {
      alert('Коментар не надіслано: ' + (res.error || 'невідома помилка'));  // без тихого провалу
    }
  };
  sendBtn.addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });

  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
}

// ── Екран сторінки (Екран 2) ────────────────────────────────────────────────
async function openPageScreen(pageId) {
  const page = pages.find(p => p.id === pageId);
  if (!page) return;
  const canEdit = myPageIds.has(pageId);
  const subscribed = mySubs.has(pageId);
  const pagePosts = posts.filter(p => p.page_id === pageId);

  const screen = document.createElement('div');
  screen.className = 'fd-screen';
  screen.innerHTML = `
    <div class="fd-screen-top">
      <button class="fd-screen-back" type="button">${IC_BACK}</button>
      ${canEdit ? `<button class="fd-banner-edit" data-edit-page="${pageId}" type="button" aria-label="Змінити банер">${IC_CAMERA}</button>` : ''}
      <button class="fd-bell${subscribed ? ' fd-bell--on' : ''}" data-bell="${pageId}" type="button" aria-label="Сповіщення">
        ${subscribed ? IC_BELL_F : IC_BELL}
      </button>
      <div class="fd-banner">${page.banner_url ? `<img src="${escapeHtml(page.banner_url)}" alt="">` : ''}</div>
    </div>
    <div class="fd-screen-body">
      <div class="fd-screen-id">
        <span class="fd-screen-ava-wrap">
          <span class="fd-screen-ava">${avatarHtml(page.avatar_url, page.name, 'fd-screen-ava-img')}</span>
          ${canEdit ? `<button class="fd-ava-edit" data-edit-page="${pageId}" type="button" aria-label="Змінити аватар">${IC_CAMERA}</button>` : ''}
        </span>
        <div class="fd-screen-name">${escapeHtml(page.name)}</div>
        ${page.theme ? `<div class="fd-screen-theme">${escapeHtml(page.theme)}</div>` : ''}
        ${canEdit ? `<div><button class="fd-screen-edit" data-edit-page="${pageId}" type="button">${IC_EDIT}Редагувати сторінку</button></div>` : ''}
      </div>
      ${canEdit ? `<button class="fd-compose-open" type="button">${IC_IMG}<span>Написати пост…</span></button>` : ''}
      <div class="fd-screen-list">${pagePosts.length
        ? pagePosts.map(postCardHtml).join('')
        : '<div class="fd-empty">Тут ще немає постів.</div>'}</div>
    </div>`;

  screen.querySelector('.fd-screen-back').addEventListener('click', () => {
    screen.classList.remove('open');
    setTimeout(() => screen.remove(), 240);
  });
  const composeBtn = screen.querySelector('.fd-compose-open');
  if (composeBtn) composeBtn.addEventListener('click', () => openComposer(pageId));
  screen.querySelectorAll('[data-edit-page]').forEach(b =>
    b.addEventListener('click', () => openPageEditor(pageId)));
  wireCards(screen);           // лайк/коментарі всередині екрана сторінки
  wireGalleries(screen);       // каруселі фото в постах сторінки
  screen.querySelector('.fd-bell')?.addEventListener('click', () => toggleBell(pageId, screen));

  document.body.appendChild(screen);
  requestAnimationFrame(() => screen.classList.add('open'));
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
  }
}

// ── Композер: власник/адмін пише пост від імені сторінки (кілька фото) ───────
const MAX_PHOTOS = 10;
function openComposer(pageId) {
  const page = pages.find(p => p.id === pageId);
  if (!page) return;
  let files = [];               // масив File (кілька фото, як у FB/IG)
  let previewUrls = [];         // objectURL-и для прев'ю (звільняємо при видаленні)

  const back = document.createElement('div');
  back.className = 'fd-sheet-back';
  back.innerHTML = `
    <div class="fd-sheet fd-composer">
      <div class="fd-sheet-handle"></div>
      <div class="fd-sheet-title">Новий пост · ${escapeHtml(page.name)}</div>
      <textarea class="fd-comp-text" placeholder="Що нового?" maxlength="4000" rows="5"></textarea>
      <div class="fd-comp-thumbs" hidden></div>
      <div class="fd-comp-bar">
        <label class="fd-comp-photo">${IC_IMG}<input type="file" accept="image/*" multiple hidden></label>
        <button class="fd-comp-send" type="button">Опублікувати</button>
      </div>
    </div>`;
  const close = () => { previewUrls.forEach(u => URL.revokeObjectURL(u)); back.remove(); };
  back.addEventListener('click', e => { if (e.target === back) close(); });

  const fileInput = back.querySelector('input[type=file]');
  const thumbs = back.querySelector('.fd-comp-thumbs');
  const renderThumbs = () => {
    if (!files.length) { thumbs.hidden = true; thumbs.innerHTML = ''; return; }
    thumbs.hidden = false;
    thumbs.innerHTML = files.map((f, i) =>
      `<div class="fd-comp-thumb"><img src="${previewUrls[i]}" alt="">
        <button class="fd-comp-thumb-x" data-rm="${i}" type="button">${IC_X}</button></div>`).join('');
  };
  fileInput.addEventListener('change', () => {
    for (const f of fileInput.files) {
      if (files.length >= MAX_PHOTOS) break;
      files.push(f); previewUrls.push(URL.createObjectURL(f));
    }
    fileInput.value = '';       // щоб те саме фото можна було додати знову
    renderThumbs();
  });
  thumbs.addEventListener('click', e => {
    const x = e.target.closest('[data-rm]'); if (!x) return;
    const i = Number(x.dataset.rm);
    URL.revokeObjectURL(previewUrls[i]);
    files.splice(i, 1); previewUrls.splice(i, 1);
    renderThumbs();
  });

  const sendBtn = back.querySelector('.fd-comp-send');
  sendBtn.addEventListener('click', async () => {
    const text = back.querySelector('.fd-comp-text').value.trim();
    if (!text && !files.length) return;
    sendBtn.disabled = true; sendBtn.textContent = 'Публікую…';

    // Завантажуємо усі фото; помилки НЕ ковтаємо — показуємо.
    let urls = [];
    if (files.length) {
      const ups = await Promise.all(files.map(f => uploadPhotoToStorage(f, 'pages/')));
      urls = ups.map(u => u.url).filter(Boolean);
      const failed = ups.length - urls.length;
      if (failed > 0) {
        sendBtn.disabled = false; sendBtn.textContent = 'Опублікувати';
        const firstErr = ups.find(u => !u.url)?.error || '';
        alert(`Не вдалося завантажити ${failed} фото: ${firstErr}\nСпробуй ще раз.`);
        return;
      }
    }
    const res = await createPagePost(pageId, currentUserId(), text || '', urls);
    if (res.ok) {
      posts.unshift(res.post);
      close();
      document.querySelectorAll('.fd-screen').forEach(s => s.remove());
      renderFeed();
      openPageScreen(pageId);
    } else {
      sendBtn.disabled = false; sendBtn.textContent = 'Опублікувати';
      alert('Не вдалося опублікувати: ' + (res.error || ''));
    }
  });

  document.body.appendChild(back);
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

  document.body.appendChild(back);
  requestAnimationFrame(() => back.classList.add('open'));
}

// ── Делегування подій на картках (лайк/коментарі/відкрити сторінку) ─────────
function wireCards(root) {
  root.addEventListener('click', e => {
    const likeBtn = e.target.closest('[data-like]');
    if (likeBtn) { toggleLike(Number(likeBtn.dataset.like)); return; }
    const comBtn = e.target.closest('[data-comments]');
    if (comBtn) { openComments(Number(comBtn.dataset.comments)); return; }
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
    // Пошук у стрічці: кнопка розгортає поле; ввід фільтрує пости наживо.
    const sBtn = document.getElementById('feed-search-btn');
    const sBar = document.getElementById('feed-search');
    const sInp = document.getElementById('feed-search-input');
    sBtn?.addEventListener('click', () => {
      const show = sBar.hidden;
      sBar.hidden = !show;
      if (show) sInp.focus();
      else { sInp.value = ''; feedSearch = ''; renderFeed(); }
    });
    sInp?.addEventListener('input', () => { feedSearch = sInp.value; renderFeed(); });

    // Жива синхронізація коментарів: коментар будь-кого зʼявляється у всіх наживо
    // (відкритий лист перемальовується, лічильник картки оновлюється). Один раз.
    subscribePageComments(payload => {
      const t = payload.eventType;
      if (t === 'DELETE') applyCommentRemove(payload.old);
      else applyCommentUpsert(payload.new);   // INSERT + UPDATE (deleted_at → remove усередині)
    });

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
