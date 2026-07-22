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

// ── Стан ────────────────────────────────────────────────────────────────────
let pages = [];               // усі сторінки-канали
let posts = [];               // пости стрічки (усіх сторінок)
let reactionMap = new Map();  // post_id → { count, my }
let commentMap = new Map();   // post_id → comments[]
let myPageIds = new Set();    // сторінки де я можу писати (власник/адмін)
let mySubs = new Set();       // сторінки на які я підписаний (дзвіночок)
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
function postCardHtml(post) {
  const page = post.pages || {};
  const rx = reactionMap.get(post.id) || { count: 0, my: false };
  const cCount = (commentMap.get(post.id) || []).length;
  const authorName = post.author_uid ? liveName('', post.author_uid, '') : '';  // вже екранований
  const photo = post.image_url
    ? `<div class="fd-photo"><img src="${escapeHtml(post.image_url)}" alt="" loading="lazy"></div>` : '';
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
  if (!posts.length) {
    listEl.innerHTML = `<div class="fd-empty">Поки що тут порожньо.<br>Незабаром сторінки громади почнуть публікувати новини.</div>`;
    return;
  }
  listEl.innerHTML = posts.map(postCardHtml).join('');
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

// ── Коментарі (нижній лист) ─────────────────────────────────────────────────
function openComments(postId) {
  const list = commentMap.get(postId) || [];
  const rowsHtml = list.length ? list.map(c => {
    const nm = c.author_uid ? liveName('', c.author_uid, 'Житель') : 'Житель';  // вже екранований
    return `<div class="fd-com-row">
      <span class="fd-com-ava">${avatarHtml(cachedAvatar(c.author_uid), nm, 'fd-com-ava-img')}</span>
      <div class="fd-com-body"><span class="fd-com-name"${nameUid(c.author_uid)}>${nm}</span>
      <span class="fd-com-txt">${escapeHtml(c.text)}</span></div>
    </div>`;
  }).join('') : `<div class="fd-com-empty">Ще немає коментарів. Будьте першим!</div>`;

  const sheet = document.createElement('div');
  sheet.className = 'fd-sheet-back';
  sheet.innerHTML = `
    <div class="fd-sheet">
      <div class="fd-sheet-handle"></div>
      <div class="fd-sheet-title">Коментарі</div>
      <div class="fd-com-list">${rowsHtml}</div>
      <div class="fd-com-compose">
        <input class="fd-com-input" type="text" placeholder="Написати коментар…" maxlength="1000">
        <button class="fd-com-send" type="button">${IC_SEND}</button>
      </div>
    </div>`;
  const close = () => sheet.remove();
  sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
  const input = sheet.querySelector('.fd-com-input');
  const send = async () => {
    const text = input.value.trim();
    if (!text) return;
    if (!isLoggedIn()) { close(); requireAuth('залишити коментар', () => {}); return; }
    input.value = '';
    const res = await addPageComment(postId, currentUserId(), text);
    if (res.ok) {
      const arr = commentMap.get(postId) || [];
      arr.push(res.comment); commentMap.set(postId, arr);
      close(); openComments(postId);          // перемалювати з новим
      patchCommentCount(postId);
    } else { input.value = text; }
  };
  sheet.querySelector('.fd-com-send').addEventListener('click', send);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  document.body.appendChild(sheet);
  requestAnimationFrame(() => sheet.classList.add('open'));
}
function patchCommentCount(postId) {
  const n = (commentMap.get(postId) || []).length;
  document.querySelectorAll(`[data-comments="${postId}"] .fd-cnt`).forEach(el => el.textContent = n || '');
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
      <button class="fd-bell${subscribed ? ' fd-bell--on' : ''}" data-bell="${pageId}" type="button" aria-label="Сповіщення">
        ${subscribed ? IC_BELL_F : IC_BELL}
      </button>
      <div class="fd-banner">${page.banner_url ? `<img src="${escapeHtml(page.banner_url)}" alt="">` : ''}</div>
    </div>
    <div class="fd-screen-id">
      <span class="fd-screen-ava">${avatarHtml(page.avatar_url, page.name, 'fd-screen-ava-img')}</span>
      <div class="fd-screen-name">${escapeHtml(page.name)}</div>
      ${page.theme ? `<div class="fd-screen-theme">${escapeHtml(page.theme)}</div>` : ''}
    </div>
    ${canEdit ? `<button class="fd-compose-open" type="button">${IC_IMG}<span>Написати пост…</span></button>` : ''}
    <div class="fd-screen-list">${pagePosts.length
      ? pagePosts.map(postCardHtml).join('')
      : '<div class="fd-empty">Тут ще немає постів.</div>'}</div>`;

  screen.querySelector('.fd-screen-back').addEventListener('click', () => {
    screen.classList.remove('open');
    setTimeout(() => screen.remove(), 240);
  });
  const composeBtn = screen.querySelector('.fd-compose-open');
  if (composeBtn) composeBtn.addEventListener('click', () => openComposer(pageId));
  wireCards(screen);           // лайк/коментарі всередині екрана сторінки
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

// ── Композер: власник/адмін пише пост від імені сторінки ────────────────────
function openComposer(pageId) {
  const page = pages.find(p => p.id === pageId);
  if (!page) return;
  let imageBlob = null, imagePreview = null;

  const back = document.createElement('div');
  back.className = 'fd-sheet-back';
  back.innerHTML = `
    <div class="fd-sheet fd-composer">
      <div class="fd-sheet-handle"></div>
      <div class="fd-sheet-title">Новий пост · ${escapeHtml(page.name)}</div>
      <textarea class="fd-comp-text" placeholder="Що нового?" maxlength="4000" rows="5"></textarea>
      <div class="fd-comp-preview" hidden></div>
      <div class="fd-comp-bar">
        <label class="fd-comp-photo">${IC_IMG}<input type="file" accept="image/*" hidden></label>
        <button class="fd-comp-send" type="button">Опублікувати</button>
      </div>
    </div>`;
  const close = () => back.remove();
  back.addEventListener('click', e => { if (e.target === back) close(); });

  const fileInput = back.querySelector('input[type=file]');
  const preview = back.querySelector('.fd-comp-preview');
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    imageBlob = f;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    imagePreview = URL.createObjectURL(f);
    preview.hidden = false;
    preview.innerHTML = `<img src="${imagePreview}" alt="">`;
  });

  const sendBtn = back.querySelector('.fd-comp-send');
  sendBtn.addEventListener('click', async () => {
    const text = back.querySelector('.fd-comp-text').value.trim();
    if (!text) return;
    sendBtn.disabled = true; sendBtn.textContent = 'Публікую…';
    let imageUrl = null;
    if (imageBlob) {
      const up = await uploadPhotoToStorage(imageBlob, 'pages/');
      imageUrl = up.url;
    }
    const res = await createPagePost(pageId, currentUserId(), text, imageUrl);
    if (res.ok) {
      posts.unshift(res.post);
      close();
      // перемалювати відкритий екран сторінки і головну стрічку
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

// ── Делегування подій на картках (лайк/коментарі/відкрити сторінку) ─────────
function wireCards(root) {
  root.addEventListener('click', e => {
    const likeBtn = e.target.closest('[data-like]');
    if (likeBtn) { toggleLike(Number(likeBtn.dataset.like)); return; }
    const comBtn = e.target.closest('[data-comments]');
    if (comBtn) { openComments(Number(comBtn.dataset.comments)); return; }
    const openPage = e.target.closest('[data-open-page]');
    if (openPage) { openPageScreen(Number(openPage.dataset.openPage)); return; }
  });
}

// ── Точка входу ─────────────────────────────────────────────────────────────
export async function initFeed() {
  const root = document.getElementById('page-shotam');
  if (root && !root.dataset.fdWired) {
    wireCards(root);            // делегування один раз на контейнер вкладки
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
