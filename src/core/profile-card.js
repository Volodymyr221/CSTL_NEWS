// src/core/profile-card.js
// Картка профілю користувача — тап по будь-якому аватару (елемент з data-av-uid:
// обговорення .bd-avatar, приватні чати .pm-avatar) відкриває bottom-sheet
// з фото + публічною інфою. Фото можна збільшити (спільний lightbox).
//
// Дані — з вузького RPC get_public_profile (supabase.js fetchPublicProfile):
// РІВНО 6 несекретних полів (uid, name, avatar_url, settlement, trusted,
// created_at). Телефон/email/дата народження НІКОЛИ сюди не потрапляють.
// Fail-soft: RPC ще нема / нема профілю → мінімальна картка (фото з кешу + імʼя).

import { openModal } from './modal.js';
import { fetchPublicProfile, cachedAvatar } from './supabase.js';
import { avatarCircle, escapeHtml, openPhotoLightbox } from './utils.js';
import { ICONS } from './icons.js';

function cardHtml(p) {
  const name = (p && p.name && p.name.trim()) ? p.name.trim() : 'Житель громади';
  const url  = (p && p.avatar_url) || cachedAvatar(p && p.uid) || '';
  const av   = avatarCircle({ name, url, cls: 'pcard-av' });   // фото або кольорова літера
  const loc = (p && p.settlement)
    ? `<div class="pcard-loc">${ICONS.pin}<span>${escapeHtml(p.settlement)}</span></div>` : '';
  const badge = (p && p.trusted)
    ? `<div class="pcard-badge">${ICONS.check} Довірений автор</div>` : '';
  let since = '';
  if (p && p.created_at) {
    const y = new Date(p.created_at).getFullYear();
    if (y > 2000) since = `<div class="pcard-since">У громаді з ${y}</div>`;
  }
  return `
    <div class="pcard">
      <div class="pcard-avwrap" data-pcard-photo="${url ? escapeHtml(url) : ''}">${av}</div>
      <div class="pcard-name">${escapeHtml(name)}</div>
      ${loc}${badge}${since}
    </div>`;
}

// Відкрити картку профілю за uid.
export async function openProfileCard(uid) {
  if (!uid) return;
  const p = await fetchPublicProfile(uid);   // fail-soft → null
  openModal({
    variant: 'sheet',
    bodyHtml: cardHtml(p || { uid }),
    onMount: (wrap) => {
      // Тап по фото → на весь екран (лише коли фото реально є).
      const avwrap = wrap.querySelector('.pcard-avwrap');
      const url = avwrap && avwrap.dataset.pcardPhoto;
      if (url) {
        avwrap.style.cursor = 'zoom-in';
        avwrap.addEventListener('click', () => openPhotoLightbox(url));
      }
    },
  });
}

// Один делегований слухач на document: клік по будь-якому кружечку з data-av-uid
// відкриває картку. Не множимо обробники на кожен рендер (проти дублів).
let _wired = false;
export function initProfileCardTaps() {
  if (_wired) return;
  _wired = true;
  document.addEventListener('click', (e) => {
    const av = e.target.closest('[data-av-uid]');
    if (!av) return;
    const uid = av.dataset.avUid;
    if (uid) openProfileCard(uid);
  });
}
