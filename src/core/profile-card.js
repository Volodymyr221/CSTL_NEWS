// src/core/profile-card.js
// Картка профілю користувача — тап по будь-якому аватару (елемент з data-av-uid:
// обговорення .bd-avatar, приватні чати .pm-avatar) відкриває bottom-sheet
// з фото + публічною інфою. Фото можна збільшити (спільний lightbox).
//
// Дані — з вузького RPC get_public_profile (supabase.js fetchPublicProfile):
// лише несекретні поля (uid, name, avatar_url, settlement, trusted, created_at,
// bio, age). Телефон/email/точна дата народження НІКОЛИ сюди не потрапляють
// (вік — похідне число, не дата). Fail-soft: RPC ще нема / нема профілю →
// мінімальна картка (фото з кешу + імʼя).

import { openModal } from './modal.js';
import { fetchPublicProfile, cachedAvatar } from './supabase.js';
import { avatarCircle, escapeHtml, openPhotoLightbox } from './utils.js';
import { ICONS } from './icons.js';
import { MONTHS_GEN } from './chat-core.js';   // укр. місяці в родовому (реюз)

// Відмінок «років»: 1 рік / 2-4 роки / 5-20 років (виняток 11-14 → років).
function pluralYears(n) {
  const d = n % 10, h = n % 100;
  if (h >= 11 && h <= 14) return 'років';
  if (d === 1) return 'рік';
  if (d >= 2 && d <= 4) return 'роки';
  return 'років';
}
// «липня 2026» з дати реєстрації (created_at); порожньо якщо дата некоректна.
function joinDate(iso) {
  const dt = new Date(iso);
  const y = dt.getFullYear();
  if (isNaN(dt.getTime()) || y <= 2000) return '';
  return `${MONTHS_GEN[dt.getMonth()]} ${y}`;
}

function cardHtml(p) {
  const name = (p && p.name && p.name.trim()) ? p.name.trim() : 'Житель громади';
  const url  = (p && p.avatar_url) || cachedAvatar(p && p.uid) || '';
  const av   = avatarCircle({ name, url, cls: 'pcard-av' });   // фото або кольорова літера

  // Мета-лінія: 📍громада · N років (кожне опційне; нема обох → рядка нема).
  const bits = [];
  if (p && p.settlement) bits.push(`${ICONS.pin}<span>${escapeHtml(p.settlement)}</span>`);
  if (p && Number.isFinite(p.age) && p.age > 0) bits.push(`<span>${p.age} ${pluralYears(p.age)}</span>`);
  const meta = bits.length
    ? `<div class="pcard-meta">${bits.join('<span class="pcard-dot">·</span>')}</div>` : '';

  const badge = (p && p.trusted)
    ? `<div class="pcard-badge">${ICONS.check} Довірений автор</div>` : '';

  // «Про себе» — ЛИШЕ якщо користувач реально щось написав (порожнє → блока нема).
  const bioText = (p && p.bio && p.bio.trim()) ? p.bio.trim() : '';
  const bio = bioText
    ? `<div class="pcard-bio"><span class="pcard-bio-h">Про себе</span><p>${escapeHtml(bioText)}</p></div>` : '';

  const jd = (p && p.created_at) ? joinDate(p.created_at) : '';
  const since = jd ? `<div class="pcard-since">Учасник CSTL LIFE з ${jd}</div>` : '';

  return `
    <div class="pcard">
      <div class="pcard-avwrap" data-pcard-photo="${url ? escapeHtml(url) : ''}">${av}</div>
      <div class="pcard-name">${escapeHtml(name)}</div>
      ${meta}${badge}${bio}${since}
    </div>`;
}

// Відкрити картку профілю за uid.
export async function openProfileCard(uid) {
  if (!uid) return;
  const p = await fetchPublicProfile(uid);   // fail-soft → null
  openModal({
    variant: 'sheet',
    className: 'app-modal--top',   // поверх кабінету/чату (інакше ховається під ними)
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
    // У списку розмов рядок сам відкриває розмову — там картку не чіпаємо.
    if (e.target.closest('[data-thread]')) return;
    const uid = av.dataset.avUid;
    if (uid) openProfileCard(uid);
  });
}
