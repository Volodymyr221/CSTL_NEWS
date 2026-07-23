// src/core/board-shared.js
// СПІЛЬНИЙ шар Дошки (Потік 10, Д-5): стан закладок (savedIds) + кнопки
// «зберегти» 🔖 / «поділитись» — єдине, що реально використовують ОБИДВА
// типи карток: оголошення (board.js) і обговорення (board-discussions.js).
//
// ПРАВИЛО (проти циклічного імпорту): цей файл імпортує ЛИШЕ з core/* —
// ніколи з tabs/*. І board.js, і board-discussions.js імпортують ЗВІДСИ;
// назад — ніхто. (Цикл board.js↔board-chat.js↔community-modal.js вже існує
// в проекті; конст-імпорти через цикл ловлять TDZ — тому спільні константи
// живуть тут, поза циклом.)

import { escapeHtml, deepLink } from './utils.js';
import { currentUserId } from './auth.js';
import { addSavedPost, removeSavedPost } from './supabase.js';

// ── Іконки закладки/шер (спільні для карток оголошень і обговорень) ──────────
export const BOOKMARK_OUTLINE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
export const BOOKMARK_FILLED_SVG  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
export const SHARE_ICON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';

// ── Закладки: БД per-uid (saved_posts) — синхрон між пристроями ───────────────
// savedIds тримаємо в пам'яті (заповнює renderBoard() через setSavedIds з
// fetchSavedPostIds; вихід з акаунта скидає на порожній Set).

let savedIds = new Set();  // postId закладок ПОТОЧНОГО акаунта (з БД saved_posts)

export function getSavedIds() {
  return savedIds;
}
export function setSavedIds(next) {
  savedIds = next || new Set();
}
export function isSaved(postId) {
  return savedIds.has(postId);
}
// Оптимістично оновлюємо пам'ять + пишемо в БД. Гість сюди не доходить (гейт у кліку).
export function toggleSaved(postId) {
  const uid = currentUserId();
  if (!uid) return;
  if (savedIds.has(postId)) {
    savedIds.delete(postId);
    removeSavedPost(uid, postId);
  } else {
    savedIds.add(postId);
    addSavedPost(uid, postId);
  }
}

// ── Кнопки дій (share + bookmark) — рендеряться на картках обох типів ────────
// Реакції прибрано з Дошки повністю (рішення Вови 11.07 — на маркетплейсі не
// доречні; інтерес виражається кнопками 💬 написати / 🔖 зберегти).

export function saveBtnHtml(post) {
  const saved = isSaved(post.id);
  return `<button class="bd-icon-btn bd-bookmark${saved ? ' bd-bookmark--active' : ''}" type="button"
          data-save-id="${post.id}"
          aria-label="${saved ? 'Прибрати зі збережених' : 'Зберегти у Мої'}">
    ${saved ? BOOKMARK_FILLED_SVG : BOOKMARK_OUTLINE_SVG}
  </button>`;
}

export function shareBtnHtml(post) {
  // Ділимося ТІЛЬКИ посиланням (deep-link на елемент) — без тексту (рішення Вови 23.07).
  // Оголошення → #/post/board/<id>; обговорення → #/post/disc/<id> (handlePostHash у app.js).
  const source = post.type === 'chat' ? 'disc' : 'board';
  const shareTitle = post.type === 'chat'
    ? 'Обговорення з Дошки громади Олики'
    : 'Оголошення з Дошки громади Олики';
  return `<button class="bd-icon-btn bd-share-btn" type="button"
          data-share-board
          data-share-title="${escapeHtml(shareTitle)}"
          data-share-url="${escapeHtml(deepLink(source, post.id))}"
          aria-label="Поділитися">${SHARE_ICON_SVG}</button>`;
}
