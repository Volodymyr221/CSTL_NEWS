// src/tabs/board-chat.js
// ПРИВАТНИЙ ЧАТ ДОШКИ: покупець ↔ продавець (1-на-1) — належить архітектурі Дошки.
// Перенесено з core/messages-ui.js (рішення Вови 05.07): комунікація покупець↔продавець —
// це функція Дошки; групи/обговорення (V2 Чати) лишились у messages-ui.js.
// Спільна механіка (екрани, клавіатура iOS, жести бульбашок) — у core/chat-core.js.
//
// Екрани (повноекранні sheets, морф знизу):
//   1. openChat(thread, post)  — розмова 1-на-1 (бульбашки + поле + realtime)
//   2. openThreadsList()       — «Повідомлення»: усі мої розмови
//   3. openMyAds()             — «Мої оголошення»: мої пости + вхідні розмови
//
// Вхідні точки:
//   startChatFromPost(post) — кнопка «Повідомлення» 💬 на оголошенні
//   openThreadsList()       — FAB «Повідомлення» / рядок Кабінету
//   openMyAds()             — FAB «Мої оголошення» / рядок Кабінету
//   initBoardChat()         — бейдж непрочитаних + push-пристрій + realtime (з app.js)
//
// Імена співрозмовників беремо з треда (author_name/buyer_name) — БД profiles
// приватна (RLS «лише свій профіль»), тож імена денормалізовані при створенні.

import {
  currentUserId, isLoggedIn, requireAuth, getProfile, onAuthChange,
} from '../core/auth.js';
import {
  getOrCreateThread, fetchMessages, sendMessage, markThreadRead,
  fetchMyThreads, fetchMyPosts, fetchUnreadByThread,
  fetchThreadStates, setThreadState, fetchThreadClearedAt,
  subscribeThreadMessages, subscribeMyThreads, saveUserPushDevice,
  editMessage, deleteMessage, uploadPhotoToStorage,
  bumpPost, closePost, deleteMyPost, restorePost, removeSavedPost,
  hydrateAvatars,
} from '../core/supabase.js';
import { COMMUNITY_ALL } from '../core/settlements.js';
import { openBoardModal } from './community-modal.js';
import { escapeHtml, showToast, postTime, containsProfanity, openPhotoLightbox } from '../core/utils.js';
import {
  ACT_ICONS, buildScreen, avatar, clockTime, dayLabel, threadListTime,
  setupKeyboardResize, setupBubbleGestures,
} from '../core/chat-core.js';
import { ensurePushSubscription } from '../core/push.js';
import { ICONS } from '../core/icons.js';   // спільні векторні іконки (заміна емодзі в меню картки)

const BUMP_COOLDOWN_MS = 3 * 60 * 60 * 1000;   // кулдаун підняття: 3 год

// Векторний олівець для FAB «Нове оголошення» — стандартний ICONS.pencil (той самий,
// що в меню картки й у FAB Дошки). Раніше тут була локальна копія з іншою формою
// (стара «M12 20h9…») — не збігалась зі стандартом, тому FAB виглядав неузгоджено (13.07).
const EDIT_ICON_SVG = ICONS.pencil;
// Закладки для екрана «Збережені» — мірор board.js:46-47 (bookmark лишається локально
// в board.js за задумом Потоку А; тут — своя копія, щоб уникнути циклічного імпорту).
const BOOKMARK_FILLED_SVG  = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
const BOOKMARK_OUTLINE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

// Ім'я співрозмовника у треді (з точки зору поточного користувача)
function otherName(thread) {
  const me = currentUserId();
  if (me && me === thread.author_uid) return thread.buyer_name || 'Покупець';
  return thread.author_name || 'Продавець';
}
// uid співрозмовника (Потік 12 Б: для його фото-аватара у кружечку)
function otherUid(thread) {
  const me = currentUserId();
  return (me && me === thread.author_uid) ? (thread.buyer_uid || '') : (thread.author_uid || '');
}

// Короткий заголовок оголошення треда
function threadPostTitle(thread) {
  const p = thread.post || {};
  return p.title || (p.text ? p.text.slice(0, 60) : 'Оголошення');
}

// ── 1. Екран розмови 1-на-1 ──────────────────────────────────────────────
let _chatUnsub = null;

export async function openChat(thread, post) {
  if (!isLoggedIn()) { requireAuth('відкрити чат', () => {}); return; }
  ensureChatPush();   // P-5: тап відкрити чат — реальний жест користувача, просимо дозвіл push
  const me = currentUserId();
  const p = post || thread.post || {};
  const title = p.title || (p.text ? p.text.slice(0, 60) : 'Оголошення');
  const partner = otherName(thread);
  const thumb = (p.photos && p.photos[0]) || '';
  const adAuthor = p.author ? String(p.author).trim() : '';
  const adContact = p.contact ? String(p.contact).trim() : '';
  const adIsPhone = adContact && /^[\+\d][\d\s\-()]{5,}$/.test(adContact);
  const adTel = adIsPhone ? adContact.replace(/[^\d+]/g, '') : '';

  const api = buildScreen(`
    <header class="pm-head pm-head--chat">
      <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
      ${avatar(partner, otherUid(thread))}
      <div class="pm-head-titles" data-av-uid="${escapeHtml(otherUid(thread))}" role="button">
        <div class="pm-head-name">${escapeHtml(partner)}</div>
      </div>
    </header>
    <div class="pm-ctx" data-pm-ctx role="button" aria-label="Переглянути оголошення">
      ${thumb
        ? `<span class="pm-ctx-thumb" style="background-image:url('${escapeHtml(thumb)}')"></span>`
        : `<span class="pm-ctx-thumb pm-ctx-thumb--none">🏷️</span>`}
      <span class="pm-ctx-body">
        <span class="pm-ctx-title">${escapeHtml(title)}</span>
        ${(p.location && p.location !== COMMUNITY_ALL) ? `<span class="pm-ctx-loc">📍 ${escapeHtml(p.location)}</span>` : ''}
        ${(adAuthor || adContact) ? `<span class="pm-ctx-contact">${adContact ? `<span class="pm-ctx-phone">${escapeHtml(adContact)}</span>` : ''}${adAuthor ? `${adContact ? ' — ' : ''}${escapeHtml(adAuthor)}` : ''}</span>` : ''}
        <span class="pm-ctx-link">Переглянути оголошення →</span>
      </span>
      ${adTel ? `<a class="pm-ctx-call" href="tel:${escapeHtml(adTel)}" aria-label="Подзвонити"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92z"/></svg></a>` : ''}
    </div>
    <div class="pm-stream" id="pm-stream">
      <div class="pm-loading">Завантаження…</div>
    </div>
    <button class="pm-scrolldown" id="pm-scrolldown" type="button" aria-label="До останнього повідомлення">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="pm-composebar" id="pm-composebar" hidden>
      <span class="pm-composebar-ic" id="pm-composebar-ic">${ACT_ICONS.reply}</span>
      <div class="pm-composebar-body">
        <span class="pm-composebar-title" id="pm-composebar-title"></span>
        <span class="pm-composebar-text" id="pm-composebar-text"></span>
      </div>
      <button class="pm-composebar-x" type="button" id="pm-composebar-x" aria-label="Скасувати">✕</button>
    </div>
    <form class="pm-form" id="pm-form">
      <button class="pm-attach" type="button" id="pm-attach" aria-label="Додати фото"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15l-5-5L5 21"/></svg></button>
      <input class="pm-file" id="pm-file" type="file" accept="image/*" hidden>
      <input class="pm-input" id="pm-input" type="text" placeholder="Написати повідомлення…"
             aria-label="Повідомлення" autocomplete="off">
      <button class="pm-send" type="submit" aria-label="Надіслати">↑</button>
    </form>
  `, 'pm-screen--chat');

  const streamEl = api.screen.querySelector('#pm-stream');
  const form     = api.screen.querySelector('#pm-form');
  const input    = api.screen.querySelector('#pm-input');
  const fileEl   = api.screen.querySelector('#pm-file');
  const barEl    = api.screen.querySelector('#pm-composebar');
  hydrateAvatars(api.screen);   // Потік 12 Б: фото співрозмовника у шапці чату

  let messages = [];
  let msgById  = new Map();
  let replyTo  = null;   // повідомлення на яке відповідаємо
  let editing  = null;   // повідомлення яке редагуємо

  // Бар «Відповідь / Редагування» над полем вводу
  const clearCompose = () => {
    replyTo = null; editing = null;
    barEl.hidden = true;
    input.placeholder = 'Написати повідомлення…';
  };
  const showCompose = (mode, m) => {
    const snippet = (m.deleted_at ? 'Видалене' : (m.text || '📷 Фото')).slice(0, 90);
    api.screen.querySelector('#pm-composebar-ic').innerHTML = mode === 'edit' ? ACT_ICONS.edit : ACT_ICONS.reply;
    api.screen.querySelector('#pm-composebar-title').textContent = mode === 'edit' ? 'РЕДАГУВАННЯ:' : 'ВІДПОВІДЬ:';
    api.screen.querySelector('#pm-composebar-text').textContent = snippet;
    barEl.hidden = false;
  };
  const startReply = (m) => { editing = null; replyTo = m; showCompose('reply', m); input.focus(); };
  const startEdit  = (m) => { replyTo = null; editing = m; showCompose('edit', m); input.value = m.text || ''; input.focus(); };

  // Перегляд фото на повний екран — спільний lightbox (utils.openPhotoLightbox).
  const openPhoto = openPhotoLightbox;

  // Рендер однієї бульбашки (цитата відповіді + фото + текст + час; видалене/редаговане)
  const renderBubble = (m) => {
    const enter = seen.has(msgKey(m)) ? '' : ' pm-bubble--enter';
    const tagAttr = ` data-tag="${m.client_tag || ''}"`;   // для пошуку optimistic-бульбашки
    if (m.deleted_at) {
      return `<div class="pm-bubble pm-bubble--deleted${enter}" data-msg="${m.id}"${tagAttr}><span class="pm-bubble-text">${ICONS.trash} Повідомлення видалено</span></div>`;
    }
    const reply = m.reply_to_id ? msgById.get(m.reply_to_id) : null;
    const replyHtml = reply
      ? `<span class="pm-quote" data-jump="${reply.id}">${escapeHtml((reply.deleted_at ? 'Видалене повідомлення' : (reply.text || '📷 Фото')).slice(0, 90))}</span>`
      : '';
    const photoHtml = m.photo_url
      ? `<img class="pm-bubble-photo" src="${escapeHtml(m.photo_url)}" alt="фото" data-photo="${escapeHtml(m.photo_url)}">`
      : '';
    const textHtml = m.text ? `<span class="pm-bubble-text">${escapeHtml(m.text)}</span>` : '';
    const edited = m.edited_at ? '<span class="pm-bubble-edited">змінено</span> ' : '';
    const photoCls = m.photo_url ? ' pm-bubble--photo' : '';   // тонкий ободок навколо фото
    return `<div class="pm-bubble${photoCls}${enter}" data-msg="${m.id}"${tagAttr}>${replyHtml}${photoHtml}${textHtml}<span class="pm-bubble-time">${edited}${clockTime(postTime(m))}</span></div>`;
  };
  const renderGroup = (g) =>
    `<div class="pm-group ${g.mine ? 'pm-group--mine' : 'pm-group--other'}">${g.msgs.map(renderBubble).join('')}</div>`;

  let streamLastDay = null;   // день останньої відмальованої бульбашки (для appendOne)

  const renderStream = () => {
    const stick = atBottom();          // чи були ми внизу ДО перемальовування
    const prevH = streamEl.scrollHeight;   // висота стрічки ДО перемальовування
    if (!messages.length) {
      streamEl.innerHTML = `
        <div class="pm-empty pm-empty--chat">
          <span class="pm-empty-ic">💬</span>
          <div class="pm-empty-sub">Поставте питання продавцю або уточніть деталі оголошення.</div>
          <div class="pm-quick">
            <button class="pm-quick-chip" type="button" data-quick="Яка ціна?">Яка ціна?</button>
            <button class="pm-quick-chip" type="button" data-quick="Чи актуально?">Чи актуально?</button>
            <button class="pm-quick-chip" type="button" data-quick="Де знаходиться?">Де знаходиться?</button>
            <button class="pm-quick-chip" type="button" data-quick="Можна фото?">Можна фото?</button>
          </div>
        </div>`;
      return;
    }
    msgById = new Map(messages.map(m => [m.id, m]));
    let html = '';
    let lastDay = null;
    let curGroup = null;
    const flush = () => { if (curGroup) { html += renderGroup(curGroup); curGroup = null; } };
    messages.forEach(m => {
      const ts = postTime(m);
      const day = new Date(ts).toDateString();
      if (day !== lastDay) { flush(); html += `<div class="pm-daysep"><span>${dayLabel(ts)}</span></div>`; lastDay = day; }
      const mine = m.sender_uid === me;
      if (curGroup && curGroup.mine === mine) curGroup.msgs.push(m);
      else { flush(); curGroup = { mine, msgs: [m] }; }
    });
    flush();
    streamLastDay = new Date(postTime(messages[messages.length - 1])).toDateString();
    // Read receipt під останнім МОЇМ повідомленням
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.sender_uid === me && !lastMsg.deleted_at) {
      html += `<div class="pm-receipt">${lastMsg.read_at ? 'Прочитано' : 'Надіслано'}</div>`;
    }
    streamEl.innerHTML = html;
    // Плавна поява без стрибка: бо innerHTML скидає scrollTop у 0, спершу
    // ВІДНОВЛЮЄМО попередній кадр (старий низ) БЕЗ анімації — щоб не «пролетіти»
    // крізь усю історію — і ТОДІ плавно докручуємо рівно на висоту нового
    // повідомлення (старе плавно вгору, нове рівномірно знизу).
    if (stick) {
      if (firstRender) {
        streamEl.scrollTop = streamEl.scrollHeight;            // перше відкриття — одразу внизу
      } else {
        streamEl.scrollTop = Math.max(0, prevH - streamEl.clientHeight);   // попередній кадр (без стрибка)
        requestAnimationFrame(() => scrollBottom(true));      // плавно лише дельта
      }
      streamEl.querySelectorAll('.pm-bubble-photo').forEach(img => {
        if (!img.complete) img.addEventListener('load', () => scrollBottom(!firstRender), { once: true });
      });
    }
    messages.forEach(m => seen.add(msgKey(m)));   // показані → анімація появи раз
    firstRender = false;
  };
  const scrollBottom = (smooth) => streamEl.scrollTo({ top: streamEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  // Чи стрічка прокручена до низу (з допуском) — щоб не «смикати» коли читаєш історію.
  const atBottom = () => (streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight) < 120;

  // Кнопка «вниз» (як у Telegram): зʼявляється коли прокрутив угору, тап → у кінець.
  const scrollDownBtn = api.screen.querySelector('#pm-scrolldown');
  const updateScrollBtn = () => scrollDownBtn?.classList.toggle('visible', !atBottom());
  streamEl.addEventListener('scroll', updateScrollBtn, { passive: true });
  scrollDownBtn?.addEventListener('click', () => scrollBottom(true));

  // Read receipt («Прочитано/Надіслано») під останнім МОЇМ повідомленням.
  const addReceiptIfNeeded = () => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.sender_uid === me && !lastMsg.deleted_at) {
      streamEl.insertAdjacentHTML('beforeend',
        `<div class="pm-receipt">${lastMsg.read_at ? 'Прочитано' : 'Надіслано'}</div>`);
    }
  };

  // Інкрементальна ВСТАВКА однієї нової бульбашки (без перебудови всієї стрічки →
  // решта DOM і фото не перемальовуються, тож НЕ блимає). Решта повідомлень на місці.
  const appendOne = (m) => {
    if (streamEl.querySelector('.pm-empty')) { renderStream(); return; }  // був empty-state
    const stick = atBottom();
    msgById.set(m.id, m);
    streamEl.querySelector('.pm-receipt')?.remove();
    const day = new Date(postTime(m)).toDateString();
    const newDay = day !== streamLastDay;
    if (newDay) {
      streamEl.insertAdjacentHTML('beforeend', `<div class="pm-daysep"><span>${dayLabel(postTime(m))}</span></div>`);
      streamLastDay = day;
    }
    const mine = m.sender_uid === me;
    const lastEl = streamEl.lastElementChild;   // після прибрання receipt останній — група
    const lastGroup = (!newDay && lastEl && lastEl.classList.contains('pm-group')) ? lastEl : null;
    if (lastGroup && lastGroup.classList.contains(mine ? 'pm-group--mine' : 'pm-group--other')) {
      lastGroup.insertAdjacentHTML('beforeend', renderBubble(m));
    } else {
      streamEl.insertAdjacentHTML('beforeend', renderGroup({ mine, msgs: [m] }));
    }
    seen.add(msgKey(m));
    addReceiptIfNeeded();
    if (stick) {
      scrollBottom(true);                       // DOM не скидався → плавно лише дельта
      const imgs = streamEl.querySelectorAll('.pm-bubble-photo');
      const last = imgs[imgs.length - 1];
      if (last && !last.complete) last.addEventListener('load', () => scrollBottom(true), { once: true });
    }
  };

  // Інкрементальна ЗАМІНА однієї бульбашки на місці (optimistic→real, edit, delete).
  // Знаходимо за реальним id або за data-tag (client_tag). Без чіпання решти стрічки.
  const replaceOne = (m) => {
    msgById.set(m.id, m);
    let el = streamEl.querySelector(`.pm-bubble[data-msg="${CSS.escape(String(m.id))}"]`);
    if (!el && m.client_tag) el = streamEl.querySelector(`.pm-bubble[data-tag="${CSS.escape(String(m.client_tag))}"]`);
    if (!el) { renderStream(); return; }        // не знайшли → запасний повний рендер
    el.outerHTML = renderBubble(m);
    streamEl.querySelector('.pm-receipt')?.remove();
    addReceiptIfNeeded();
  };

  // Тап по цитаті у відповіді → плавно прокрутити до оригіналу + одне «блимання».
  const jumpToMessage = (id) => {
    const el = streamEl.querySelector(`.pm-bubble[data-msg="${CSS.escape(String(id))}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('pm-bubble--flash');
    void el.offsetWidth;                 // reflow → анімація перезапускається щоразу
    el.classList.add('pm-bubble--flash');
    setTimeout(() => el.classList.remove('pm-bubble--flash'), 1100);
  };

  // Множина вже показаних повідомлень (за стабільним ключем) — щоб анімація появи
  // програвалась РІВНО раз на повідомлення, а не на кожне перемальовування.
  const seen = new Set();
  const msgKey = (m) => m.client_tag || m.id;
  let firstRender = true;

  // Єдина точка вставки/заміни повідомлення. Повертає 'add' | 'update' | 'same'
  // ('same' = нічого візуально не змінилось → не перемальовуємо, без мікро-ривків).
  // Дедуплікація за реальним id, а для своїх optimistic — за client_tag.
  const upsertMessage = (row) => {
    if (!row) return 'none';
    let idx = messages.findIndex(m => m.id === row.id);
    if (idx < 0 && row.client_tag) idx = messages.findIndex(m => m.client_tag && m.client_tag === row.client_tag);
    if (idx >= 0) {
      const o = messages[idx];
      const same = o.id === row.id && o.text === row.text && o.photo_url === row.photo_url
        && o.deleted_at === row.deleted_at && o.edited_at === row.edited_at && o.read_at === row.read_at;
      messages[idx] = row;
      return same ? 'same' : 'update';
    }
    messages.push(row);
    return 'add';
  };
  const newTag = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID() : ('t-' + Date.now() + '-' + Math.random().toString(16).slice(2));

  // Кнопка ↑ / Enter: редагування (якщо активне) або нове повідомлення
  const submitText = async () => {
    const text = input.value.trim();
    if (editing) {
      if (!text) return;
      if (containsProfanity(text)) { showToast('🚫 Повідомлення містить заборонені слова', 3500, 'error'); return; }
      const target = editing;
      input.value = ''; clearCompose();
      const idx = messages.findIndex(m => m.id === target.id);
      const prevMsg = idx >= 0 ? messages[idx] : null;   // знімок для відкату при провалі
      if (idx >= 0) { messages[idx] = { ...messages[idx], text, edited_at: new Date().toISOString() }; replaceOne(messages[idx]); }
      const res = await editMessage(target.id, text);
      if (!res.ok) {
        // Відкат: повертаємо оригінал на місце (БД не змінилась)
        const i = messages.findIndex(m => m.id === target.id);
        if (i >= 0 && prevMsg) { messages[i] = prevMsg; replaceOne(prevMsg); }
        showToast('❌ Не вдалося змінити: ' + (res.error || ''), 4000, 'error');
        return;
      }
      if (idx >= 0 && res.message) { messages[idx] = res.message; replaceOne(res.message); }
      return;
    }
    sendText(text);
  };

  // Надсилання тексту (з поля або з кнопки-питання)
  const sendText = async (raw) => {
    const text = (raw || '').trim();
    if (!text) return;
    if (containsProfanity(text)) { showToast('🚫 Повідомлення містить заборонені слова', 3500, 'error'); return; }
    const replyId = replyTo ? replyTo.id : null;
    input.value = ''; clearCompose();
    const tag = newTag();
    const temp = { id: 'tmp-' + Date.now(), client_tag: tag, thread_id: thread.id, sender_uid: me, text, reply_to_id: replyId, created_at: new Date().toISOString() };
    messages.push(temp);
    appendOne(temp);
    const res = await sendMessage({ threadId: thread.id, senderUid: me, text, replyToId: replyId, clientTag: tag });
    if (!res.ok) {
      messages = messages.filter(m => m.client_tag !== tag);
      renderStream();
      showToast('❌ Не вдалося надіслати: ' + (res.error || ''), 4000, 'error');
      input.value = text;
      return;
    }
    // Реконсиляція: realtime INSERT міг уже замінити tmp — upsert за id/client_tag
    // гарантує рівно одне повідомлення незалежно від порядку подій.
    upsertMessage(res.message);
    replaceOne(res.message);
  };

  // Надсилання фото (оптимістичний прев'ю → upload у Storage → insert)
  const sendPhoto = async (file) => {
    if (!file) return;
    const replyId = replyTo ? replyTo.id : null;
    clearCompose();
    const localUrl = URL.createObjectURL(file);
    const tag = newTag();
    const temp = { id: 'tmp-' + Date.now(), client_tag: tag, thread_id: thread.id, sender_uid: me, text: null, photo_url: localUrl, reply_to_id: replyId, created_at: new Date().toISOString() };
    messages.push(temp);
    appendOne(temp);
    const up = await uploadPhotoToStorage(file);
    if (!up.url) {
      messages = messages.filter(m => m.client_tag !== tag);
      renderStream();
      showToast('❌ Не вдалося завантажити фото: ' + (up.error || ''), 4000, 'error');
      return;
    }
    const res = await sendMessage({ threadId: thread.id, senderUid: me, photoUrl: up.url, replyToId: replyId, clientTag: tag });
    if (!res.ok) {
      URL.revokeObjectURL(localUrl);
      messages = messages.filter(m => m.client_tag !== tag);
      renderStream();
      showToast('❌ Не вдалося надіслати фото: ' + (res.error || ''), 4000, 'error');
      return;
    }
    // Передзавантажуємо фото зі Storage ПЕРЕД заміною — щоб локальне прев'ю не
    // зникало в порожнечу поки картинка вантажиться (інакше фото «пропадає»).
    await new Promise((resolve) => { const pre = new Image(); pre.onload = pre.onerror = resolve; pre.src = up.url; });
    if (api._closed) return;
    // Реконсиляція за id/client_tag — прибирає дубль «одне фото = два повідомлення».
    upsertMessage(res.message);
    replaceOne(res.message);
    URL.revokeObjectURL(localUrl);   // прев'ю вже не потрібне — Storage-фото на місці
  };

  // Меню дій над повідомленням (довге натискання / правий клік)
  const openMsgActions = (m) => {
    if (m.deleted_at) return;
    const mine = m.sender_uid === me;
    const sheet = document.createElement('div');
    sheet.className = 'pm-actions-back';
    sheet.innerHTML = `
      <div class="pm-actions">
        <button type="button" data-act="reply"><span class="pm-act-ic">${ACT_ICONS.reply}</span>Відповісти</button>
        ${m.text ? `<button type="button" data-act="copy"><span class="pm-act-ic">${ACT_ICONS.copy}</span>Копіювати</button>` : ''}
        ${mine && m.text ? `<button type="button" data-act="edit"><span class="pm-act-ic">${ACT_ICONS.edit}</span>Редагувати</button>` : ''}
        ${mine ? `<button type="button" data-act="delete" class="pm-actions-danger"><span class="pm-act-ic">${ACT_ICONS.delete}</span>Видалити</button>` : ''}
        <button type="button" data-act="cancel" class="pm-actions-cancel">Скасувати</button>
      </div>`;
    const close = () => sheet.remove();
    sheet.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) { if (e.target === sheet) close(); return; }
      close();
      const act = b.dataset.act;
      if (act === 'reply') startReply(m);
      else if (act === 'copy') { try { await navigator.clipboard.writeText(m.text || ''); showToast('Скопійовано'); } catch (_) {} }
      else if (act === 'edit') startEdit(m);
      else if (act === 'delete') {
        const idx = messages.findIndex(x => x.id === m.id);
        const prevMsg = idx >= 0 ? messages[idx] : null;   // знімок для відкату при провалі
        if (idx >= 0) { messages[idx] = { ...messages[idx], deleted_at: new Date().toISOString(), text: null, photo_url: null }; replaceOne(messages[idx]); }
        const res = await deleteMessage(m.id);
        if (!res.ok) {
          // Відкат: повертаємо повідомлення (у БД не видалилось)
          const i = messages.findIndex(x => x.id === m.id);
          if (i >= 0 && prevMsg) { messages[i] = prevMsg; replaceOne(prevMsg); }
          showToast('❌ Не вдалося видалити: ' + (res.error || ''), 4000, 'error');
        }
      }
    });
    api.screen.appendChild(sheet);
  };

  // Початкове завантаження. Якщо чат раніше «видаляли» (cleared_at) — показуємо
  // ЛИШЕ повідомлення після того моменту (чистий старт після повторного контакту).
  const clearedAt = await fetchThreadClearedAt(me, thread.id);
  if (api._closed) return api;
  messages = await fetchMessages(thread.id, clearedAt);
  if (api._closed) return api;
  messages.forEach(m => seen.add(msgKey(m)));   // історія НЕ анімується при відкритті
  renderStream();
  setTimeout(() => scrollBottom(false), 50);
  // Позначити вхідні прочитаними + оновити бейдж. _readThreads = оптимістично
  // (бейдж прибираємо одразу, не чекаючи БД — надійно навіть при затримці/збої).
  _readThreads.add(thread.id);
  markThreadRead(thread.id, me).finally(refreshUnreadBadge);

  // Realtime — нові / редаговані / видалені / прочитані повідомлення треда
  if (_chatUnsub) { try { _chatUnsub(); } catch (_) {} }
  const chatUnsub = subscribeThreadMessages(thread.id, ({ type, row }) => {
    if (!row) return;
    if (type === 'INSERT') {
      const st = upsertMessage(row);      // дедуплікація за id/client_tag (моє optimistic)
      if (st === 'add') appendOne(row);          // нове чуже → вставляємо одну бульбашку
      else if (st === 'update') replaceOne(row); // realtime випередив await → заміна на місці
      // 'same' = відлуння власного повідомлення → нічого не чіпаємо (без блимання)
      if (row.sender_uid !== me) { _readThreads.add(thread.id); markThreadRead(thread.id, me).finally(refreshUnreadBadge); }
    } else if (type === 'UPDATE') {
      const idx = messages.findIndex(m => m.id === row.id);
      if (idx >= 0) { messages[idx] = row; replaceOne(row); }
    }
  });
  _chatUnsub = chatUnsub;
  // Очищаємо САМЕ цю підписку (не module-level змінну) → надійно навіть якщо колись
  // відкриють інший чат поверх. Module-ref обнуляємо лише якщо він ще наш.
  api._cleanup.push(() => { try { chatUnsub(); } catch (_) {} if (_chatUnsub === chatUnsub) _chatUnsub = null; });
  api._cleanup.push(refreshUnreadBadge);

  // Поле / редагування + кнопки-питання + фото + перегляд фото
  form.addEventListener('submit', (e) => { e.preventDefault(); submitText(); });
  api.screen.querySelector('#pm-composebar-x')?.addEventListener('click', () => {
    if (editing) input.value = '';
    clearCompose();
  });
  const attachBtn = api.screen.querySelector('#pm-attach');
  // Не віддаємо фокус поля → клавіатура не ховається, бар не «зависає» в повітрі.
  attachBtn?.addEventListener('pointerdown', e => e.preventDefault());
  attachBtn?.addEventListener('mousedown', e => e.preventDefault());
  attachBtn?.addEventListener('click', () => { input.focus(); fileEl.click(); });
  fileEl.addEventListener('change', () => { if (fileEl.files && fileEl.files[0]) sendPhoto(fileEl.files[0]); fileEl.value = ''; });
  streamEl.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (q) { sendText(q.dataset.quick); return; }
    const jump = e.target.closest('[data-jump]');
    if (jump) { jumpToMessage(jump.dataset.jump); return; }
    const ph = e.target.closest('[data-photo]');
    if (ph) openPhoto(ph.dataset.photo);
  });
  // Свайп ВЛІВО по бульбашці → відповідь; довге натискання → меню дій
  setupBubbleGestures(streamEl, (id, kind) => {
    const m = msgById.get(Number(id)) || msgById.get(id);
    if (!m) return;
    if (kind === 'reply') startReply(m);
    else if (kind === 'menu') openMsgActions(m);
  });
  // «Переглянути оголошення» — закрити чат і відкрити модалку Дошки
  // «Переглянути оголошення» — модалка оголошення Дошки ПОВЕРХ чату (не закриваємо чат)
  api.screen.querySelector('[data-pm-ctx]')?.addEventListener('click', (e) => {
    if (e.target.closest('.pm-ctx-call')) return;   // дзвінок — не відкривати модалку
    window.dispatchEvent(new CustomEvent('cstl-open-ad', { detail: { post: p } }));
  });
  // Кнопка надсилання не забирає фокус (iOS клавіатура)
  api.screen.querySelector('.pm-send')?.addEventListener('pointerdown', e => e.preventDefault());

  api._cleanup.push(setupKeyboardResize(api.screen));   // real-time трекінг + очистка слухачів
  setTimeout(() => input.focus(), 250);
  return api;
}

// ── 2. Список «Повідомлення» ──────────────────────────────────────────────
export function openThreadsList() {
  requireAuth('переглянути повідомлення', async () => {
    const me = currentUserId();
    const api = buildScreen(`
      <header class="pm-head pm-head--list">
        <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
        <div class="pm-head-titles"><div class="pm-head-name pm-head-name--ico"><span class="pm-head-ic">${ICONS.message}</span>Повідомлення</div></div>
      </header>
      <div class="pm-list pm-list--threads" id="pm-list">
        <div class="pm-search">
          <span class="pm-search-ic" aria-hidden="true">${ICONS.search}</span>
          <input class="pm-search-input" id="pm-search" type="search"
                 placeholder="Пошук повідомлень" aria-label="Пошук повідомлень" autocomplete="off">
        </div>
        <div class="pm-chips" id="pm-chips" role="tablist">
          <button class="pm-chip pm-chip--active" type="button" data-filter="all">Усі</button>
          <button class="pm-chip" type="button" data-filter="unread">Непрочитані</button>
          <button class="pm-chip" type="button" data-filter="archive">Архів</button>
        </div>
        <div class="pm-threads" id="pm-threads"><div class="pm-loading">Завантаження…</div></div>
      </div>
    `, 'pm-screen--list');

    const threadsEl = api.screen.querySelector('#pm-threads');
    const searchEl  = api.screen.querySelector('#pm-search');
    const chipsEl   = api.screen.querySelector('#pm-chips');

    let [threads, unread, states] = await Promise.all([
      fetchMyThreads(me), fetchUnreadByThread(me), fetchThreadStates(me),
    ]);
    if (api._closed) return;

    // Іконки для свайп-дій картки розмови
    const ICON_ARCHIVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M9 13l3 3 3-3"/></svg>';
    const ICON_UNARCHIVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M9 15l3-3 3 3"/></svg>';
    const ICON_TRASH = ACT_ICONS.delete;

    // Без жодної розмови — ховаємо пошук+фільтри, лишаємо чистий empty state
    const applyEmptyState = () => {
      const show = threads.length ? '' : 'none';
      api.screen.querySelector('.pm-search').style.display = show;
      chipsEl.style.display = show;
    };
    applyEmptyState();

    let filter = 'all';   // all | unread
    let query  = '';

    const stOf = (id) => states.get(id) || {};
    const renderThreads = () => {
      const q = query.trim().toLowerCase();
      const list = threads.filter(t => {
        const s = stOf(t.id);
        // «Видалено» (cleared_at): ховаємо, ПОКИ нема нового повідомлення після видалення.
        // Прийшло нове (last_message_at пізніше) → чат знову зʼявляється (чистий).
        if (s.cleared_at && !(new Date(t.last_message_at) > new Date(s.cleared_at))) return false;
        if (filter === 'archive') { if (!s.archived) return false; }
        else if (s.archived) return false;                      // архівні не в «Усі»/«Непрочитані»
        if (filter === 'unread' && !(unread.get(t.id) > 0)) return false;
        if (!q) return true;
        const hay = `${otherName(t)} ${threadPostTitle(t)} ${t.last_message_text || ''}`.toLowerCase();
        return hay.includes(q);
      });
      if (!list.length) {
        threadsEl.innerHTML = (filter === 'archive')
          ? `<div class="pm-empty pm-empty--mini">Архів порожній</div>`
          : !threads.length
            ? `<div class="pm-empty pm-empty--threads">
                 <span class="pm-empty-ic">💬</span>
                 <div class="pm-empty-title">Ваші повідомлення</div>
                 <div class="pm-empty-sub">Тут зʼявляться ваші розмови з покупцями та продавцями з дошки.</div>
               </div>`
            : `<div class="pm-empty pm-empty--mini">Нічого не знайдено</div>`;
        return;
      }
      threadsEl.innerHTML = list.map(t => {
        const n = unread.get(t.id) || 0;
        const name = otherName(t);
        const preview = t.last_message_text || 'Розмову розпочато';
        const archived = !!stOf(t.id).archived;
        return `
          <div class="pm-thread-row" data-row="${t.id}">
            <div class="pm-thread-actions">
              <button class="pm-thread-act pm-thread-act--archive" type="button" data-archive="${t.id}" aria-label="${archived ? 'Розархівувати' : 'Архівувати'}">${archived ? ICON_UNARCHIVE : ICON_ARCHIVE}</button>
              <button class="pm-thread-act pm-thread-act--delete" type="button" data-delete="${t.id}" aria-label="Видалити">${ICON_TRASH}</button>
            </div>
            <button class="pm-thread ${n > 0 ? 'pm-thread--unread' : ''}" type="button" data-thread="${t.id}">
              ${avatar(name, otherUid(t))}
              <div class="pm-thread-body">
                <div class="pm-thread-top">
                  <span class="pm-thread-name">${escapeHtml(name)}</span>
                  <span class="pm-thread-time">${threadListTime(t.last_message_at)}</span>
                </div>
                <div class="pm-thread-post">${escapeHtml(threadPostTitle(t))}</div>
                <div class="pm-thread-last">${escapeHtml(preview)}</div>
              </div>
              ${n > 0 ? `<span class="pm-thread-meta"><span class="pm-thread-dot"></span><span class="pm-row-badge">${n}</span></span>` : ''}
            </button>
          </div>`;
      }).join('');
      hydrateAvatars(threadsEl);   // Потік 12 Б: фото співрозмовників у списку розмов
    };

    // F5: архівована розмова з новим НЕПРОЧИТАНИМ — авто-розархівувати. Інакше
    // глобальний бейдж рахує це непрочитане (незалежно від архіву), а список
    // ховає архівні з «Усі»/«Непрочитані» → «є непрочитане, але його ніде нема».
    // Нове вхідне повертає розмову в загальний список (як у месенджерах).
    const autoUnarchiveUnread = async () => {
      const toFix = threads.filter(t => (unread.get(t.id) > 0) && stOf(t.id).archived);
      for (const t of toFix) {
        const prev = states.get(t.id) || {};
        states.set(t.id, { ...prev, archived: false });
        setThreadState(me, t.id, { archived: false, hidden: !!prev.hidden, cleared_at: prev.cleared_at || null });
      }
    };

    await autoUnarchiveUnread();
    renderThreads();

    searchEl.addEventListener('input', () => { query = searchEl.value; renderThreads(); });
    chipsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      filter = btn.dataset.filter;
      chipsEl.querySelectorAll('.pm-chip').forEach(c => c.classList.toggle('pm-chip--active', c === btn));
      renderThreads();
    });
    // Свайп-вліво по картці розмови → виїжджають дві дії (архів + видалити) ззаду.
    let openRow = null, suppressClick = false;
    const closeOpenRow = () => {
      if (!openRow) return;
      const c = openRow.querySelector('.pm-thread');
      if (c) { c.style.transition = ''; c.style.removeProperty('transform'); }   // плавне закриття
      openRow.classList.remove('pm-thread-row--open');
      openRow = null;
    };
    let sX = 0, sY = 0, swCard = null, swRow = null, swLock = null;
    threadsEl.addEventListener('touchstart', (e) => {
      const c = e.target.closest('.pm-thread');
      if (!c) { swCard = null; return; }
      swCard = c; swRow = c.closest('.pm-thread-row'); swLock = null;
      sX = e.touches[0].clientX; sY = e.touches[0].clientY;
    }, { passive: true });
    threadsEl.addEventListener('touchmove', (e) => {
      if (!swCard) return;
      const dx = e.touches[0].clientX - sX, dy = e.touches[0].clientY - sY;
      if (!swLock && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) swLock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (swLock === 'h') {
        e.preventDefault();
        swCard.style.transition = 'none';   // реальний час — картка йде ЗА пальцем без анімації-затримки
        const base = (swRow === openRow) ? -140 : 0;
        const d = Math.max(Math.min(base + dx, 0), -140);
        swCard.style.transform = `translateX(${d}px)`;
      }
    }, { passive: false });
    threadsEl.addEventListener('touchend', (e) => {
      if (!swCard) return;
      const c = swCard, r = swRow, lock = swLock;
      swCard = null; swRow = null;
      if (lock !== 'h') return;
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 60);
      c.style.transition = '';   // повертаємо CSS-плавність (0.22s) лише для фінального «снапу»
      const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : sX) - sX;
      const wasOpen = (r === openRow);
      const open = wasOpen ? (dx < 60) : (dx < -70);
      if (open) {
        if (openRow && openRow !== r) closeOpenRow();
        c.style.transform = 'translateX(-140px)'; r.classList.add('pm-thread-row--open'); openRow = r;
      } else {
        c.style.transform = ''; r.classList.remove('pm-thread-row--open'); if (openRow === r) openRow = null;
      }
    }, { passive: false });

    // Зміна стану розмови (архів/приховано) — оптимістично + БД (повний стан → upsert).
    const applyThreadState = async (id, patch) => {
      const prev = { ...(states.get(id) || {}) };
      const merged = { ...prev, ...patch };   // зберігаємо cleared_at при архівуванні тощо
      states.set(id, merged);
      closeOpenRow();
      renderThreads();
      const res = await setThreadState(me, id, {
        archived: !!merged.archived, hidden: !!merged.hidden, cleared_at: merged.cleared_at || null,
      });
      if (!res.ok) { states.set(id, prev); renderThreads(); showToast('❌ Не вдалося: ' + (res.error || ''), 4000, 'error'); }
    };

    threadsEl.addEventListener('click', (e) => {
      const arch = e.target.closest('[data-archive]');
      if (arch) { const id = Number(arch.dataset.archive); applyThreadState(id, { archived: !(stOf(id).archived) }); return; }
      const del = e.target.closest('[data-delete]');
      if (del) { applyThreadState(Number(del.dataset.delete), { hidden: true, cleared_at: new Date().toISOString() }); return; }
      const btn = e.target.closest('[data-thread]');
      if (!btn) return;
      if (suppressClick) return;                 // щойно свайпнули — не відкривати чат
      if (openRow) { closeOpenRow(); return; }   // є відкрита картка → спершу закрити
      const t = threads.find(x => String(x.id) === btn.dataset.thread);
      if (t) openChat(t, t.post);
    });

    // Живий список: нове повідомлення → перезавантажуємо треди (порядок за
    // last_message_at — розмова підстрибує вгору) + непрочитані і перемальовуємо.
    // Окремий канал (не конфліктує з глобальним бейджем). Дебаунс проти сплесків.
    let refreshTimer = null;
    const refresh = async () => {
      const [t, u, s] = await Promise.all([fetchMyThreads(me), fetchUnreadByThread(me), fetchThreadStates(me)]);
      if (api._closed) return;
      threads = t; unread = u; states = s;
      await autoUnarchiveUnread();   // F5: нове вхідне повертає архівовану розмову у список
      applyEmptyState();
      renderThreads();
    };
    const unsub = subscribeMyThreads(() => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 250);
    }, 'pm-threads-list');
    // Push-сигнал (від SW через initBoardChat) — надійніший за realtime. Теж оновлює
    // список наживо: нове повідомлення/розмова підтягується без ручного оновлення.
    const onPushRefresh = () => { if (refreshTimer) clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 120); };
    window.addEventListener('cstl-chat-refresh', onPushRefresh);
    api._cleanup.push(() => {
      if (refreshTimer) clearTimeout(refreshTimer);
      unsub();
      window.removeEventListener('cstl-chat-refresh', onPushRefresh);
    });
  });
}

// ── 3. «Мої оголошення» (керування власними оголошеннями) ──────────────────
// Три вкладки: Активні (published) / На модерації (pending) / Архів (rejected+closed).
// Картка: фото/emoji + назва + мета(категорія·дата·статус) + бейдж звернень,
// кнопка «Підняти» (тільки published, кулдаун 3 год) + меню дій (⋯).
// Чати тут НЕ розкриваємо — бейдж веде у «Повідомлення».
const AD_STATUS = {
  published: { label: 'активне',      icon: ICONS.check, group: 'active'     },
  pending:   { label: 'на перевірці', icon: ICONS.clock, group: 'moderation' },
  closed:    { label: 'завершено',    icon: ICONS.check, group: 'archive'    },
  rejected:  { label: 'відхилено',    icon: ICONS.close, group: 'archive'    },
};

function adDate(p) {
  const ms = (p.bumped_at && new Date(p.bumped_at).getTime()) || p.ts
    || (p.published_at && new Date(p.published_at).getTime())
    || (p.created_at && new Date(p.created_at).getTime()) || 0;
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function bumpRow(p) {
  const last = p.bumped_at ? new Date(p.bumped_at).getTime() : 0;
  const leftMs = last + BUMP_COOLDOWN_MS - Date.now();
  if (leftMs > 0) {
    const h = Math.floor(leftMs / 3600000);
    const m = Math.max(1, Math.ceil((leftMs % 3600000) / 60000));
    const t = h > 0 ? `${h} год` : `${m} хв`;
    return `<button class="pm-ad-bump pm-ad-bump--wait" type="button" disabled><span class="pm-ad-bump-ic">${ICONS.clock}</span>Можна через ${t}</button>`;
  }
  return `<button class="pm-ad-bump" type="button" data-bump="${p.id}"><span class="pm-ad-bump-ic">${ICONS.arrowUp}</span>Підняти вгору</button>`;
}

export function openMyAds() {
  requireAuth('переглянути ваші оголошення', async () => {
    const me = currentUserId();
    const api = buildScreen(`
      <header class="pm-head pm-head--list">
        <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
        <div class="pm-head-titles"><div class="pm-head-name pm-head-name--ico"><span class="pm-head-ic">${ICONS.clipboard}</span>Мої оголошення</div></div>
      </header>
      <div class="pm-ad-tabs">
        <button class="pm-ad-tab active" type="button" data-filter="active">Активні</button>
        <button class="pm-ad-tab" type="button" data-filter="moderation">На модерації</button>
        <button class="pm-ad-tab" type="button" data-filter="archive">Архів</button>
      </div>
      <div class="pm-list" id="pm-ads"><div class="pm-loading">Завантаження…</div></div>
      <button class="pm-fab-ad" type="button" data-new-ad aria-label="Нове оголошення">${EDIT_ICON_SVG}</button>
    `, 'pm-screen--ads');

    const listEl = api.screen.querySelector('#pm-ads');
    let [posts, threads, unread] = await Promise.all([
      fetchMyPosts(me), fetchMyThreads(me), fetchUnreadByThread(me),
    ]);
    if (api._closed) return;

    // Звернення (треди де я продавець), згруповані за оголошенням
    const byPost = new Map();
    threads.filter(t => t.author_uid === me).forEach(t => {
      if (!byPost.has(t.post_id)) byPost.set(t.post_id, []);
      byPost.get(t.post_id).push(t);
    });
    const unreadFor = (postId) => (byPost.get(postId) || []).reduce((s, t) => s + (unread.get(t.id) || 0), 0);
    const threadsFor = (postId) => (byPost.get(postId) || []).length;

    let filter = 'active';

    // Іконки для свайп-дій картки оголошення (ті самі стилі, що у списку розмов)
    const ICON_DONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 0 1 0 8h-1"/></svg>';
    const ICON_TRASH = ACT_ICONS.delete;

    // Дії, що виїжджають при свайпі вліво (ззаду картки). Залежать від статусу:
    //  published → Завершити + Видалити; closed → Повернути + Видалити; решта → Видалити.
    function swipeActions(p) {
      const btns = [];
      if (p.status === 'published') {
        btns.push(`<button class="pm-ad-swipe-btn pm-ad-swipe-btn--done" type="button" data-act="close" data-id="${p.id}" aria-label="Завершити">${ICON_DONE}</button>`);
      } else if (p.status === 'closed') {
        btns.push(`<button class="pm-ad-swipe-btn pm-ad-swipe-btn--restore" type="button" data-act="restore" data-id="${p.id}" aria-label="Повернути">${ICON_BACK}</button>`);
      }
      btns.push(`<button class="pm-ad-swipe-btn pm-ad-swipe-btn--delete" type="button" data-act="delete" data-id="${p.id}" aria-label="Видалити">${ICON_TRASH}</button>`);
      return { html: `<div class="pm-ad-swipe">${btns.join('')}</div>`, openW: btns.length > 1 ? 134 : 70 };
    }

    function adCard(p) {
      const meta = AD_STATUS[p.status] || { label: p.status || '', icon: '', group: 'active' };
      const photo = Array.isArray(p.photos) ? p.photos.find(x => x) : null;
      const thumb = photo
        ? `<div class="pm-ad-thumb pm-ad-thumb--photo" style="background-image:url('${escapeHtml(photo)}')"></div>`
        : `<div class="pm-ad-thumb" style="background:${escapeHtml(p.cover_gradient || 'linear-gradient(135deg,#ece4d8,#dccfba)')}"><span class="pm-ad-thumb-ic">${p.cover_emoji ? escapeHtml(p.cover_emoji) : ICONS.clipboard}</span></div>`;
      const title = escapeHtml((p.title && p.title.trim()) || (p.text || '').trim().slice(0, 54) || 'Оголошення');
      const cat = p.category ? `${escapeHtml(p.category)} · ` : '';
      const isPublished = p.status === 'published';

      // Бейдж звернень + кнопка підняти — тільки для активних published
      let actionsRow = '';
      if (isPublished) {
        const tn = threadsFor(p.id), un = unreadFor(p.id);
        const badge = tn > 0
          ? `<button class="pm-ad-msgs" type="button" data-badge="1"><span class="pm-ad-msgs-ic">${ICONS.message}</span>${tn} ${tn === 1 ? 'звернення' : 'звернень'}${un > 0 ? `<span class="pm-ad-unread">${un}</span>` : ''}</button>`
          : `<span class="pm-ad-msgs pm-ad-msgs--none"><span class="pm-ad-msgs-ic">${ICONS.message}</span>Поки немає звернень</span>`;
        actionsRow = `<div class="pm-ad-actions">${badge}${bumpRow(p)}</div>`;
      }

      // Меню дій: «Редагувати» для активних/на модерації (Д-3); «Завершити» лише для
      // published; «Повернути» лише для closed; «Видалити» завжди.
      // Іконки — маленькі векторні (icons.js + локальний ICON_BACK), не емодзі.
      const canEdit = p.status === 'published' || p.status === 'pending';
      const mi = (act, icon, label, extra = '') =>
        `<button class="pm-ad-mi${extra}" type="button" data-act="${act}" data-id="${p.id}"><span class="pm-ad-mi-ic">${icon}</span>${label}</button>`;
      const menuItems = [
        canEdit ? mi('edit', ICONS.pencil, 'Редагувати') : '',
        isPublished ? mi('close', ICONS.check, 'Завершити') : '',
        p.status === 'closed' ? mi('restore', ICON_BACK, 'Повернути в активні') : '',
        mi('delete', ICONS.trash, 'Видалити', ' pm-ad-mi--danger'),
      ].join('');

      const sw = swipeActions(p);
      return `
        <div class="pm-ad-row" data-row="${p.id}" data-open-w="${sw.openW}">
          ${sw.html}
          <div class="pm-ad" data-ad="${p.id}">
            <div class="pm-ad-main" data-open-ad="${p.id}">
              ${thumb}
              <div class="pm-ad-info">
                <span class="pm-ad-title">${title}</span>
                <span class="pm-ad-meta">${cat}${adDate(p)} · <span class="pm-ad-status pm-ad-status--${escapeHtml(p.status || '')}"><span class="pm-ad-status-ic">${meta.icon}</span>${escapeHtml(meta.label)}</span></span>
              </div>
              <button class="pm-ad-more" type="button" data-menu="${p.id}" aria-label="Дії">⋯</button>
            </div>
            ${actionsRow}
            <div class="pm-ad-menu" id="pm-ad-menu-${p.id}" hidden>${menuItems}</div>
          </div>
        </div>`;
    }

    // Стан свайпу картки (рядок з відкритими діями)
    let openRow = null, suppressClick = false;
    const closeOpenRow = () => {
      if (!openRow) return;
      const c = openRow.querySelector('.pm-ad');
      if (c) { c.style.transition = ''; c.style.removeProperty('transform'); }
      openRow.classList.remove('pm-ad-row--open');
      openRow = null;
    };

    function render() {
      openRow = null;   // innerHTML перемальовується — стара відкрита картка зникає
      const list = posts.filter(p => (AD_STATUS[p.status]?.group || 'active') === filter);
      if (!list.length) {
        const empty = {
          active:     `<span class="pm-empty-ic">${ICONS.clipboard}</span>У вас ще немає активних оголошень.<br>Подайте перше — кнопка внизу.`,
          moderation: `<span class="pm-empty-ic">${ICONS.clock}</span>Немає оголошень на модерації.`,
          archive:    `<span class="pm-empty-ic">${ICONS.archive}</span>Архів порожній.`,
        };
        listEl.innerHTML = `<div class="pm-empty">${empty[filter] || empty.active}</div>`;
        return;
      }
      listEl.innerHTML = list.map(adCard).join('');
    }
    render();

    // Перемикання вкладок
    api.screen.querySelectorAll('.pm-ad-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.dataset.filter === filter) return;
        filter = tab.dataset.filter;
        api.screen.querySelectorAll('.pm-ad-tab').forEach(t => t.classList.toggle('active', t === tab));
        render();
      });
    });

    // Д-3: після збереження правок (editPost мутується на місці в модалці) — перемалювати.
    // Якщо статус став pending, картка автоматично переїде в таб «На модерації».
    const onPostUpdated = () => { if (!api._closed) render(); };
    window.addEventListener('cstl-post-updated', onPostUpdated);
    api._cleanup.push(() => window.removeEventListener('cstl-post-updated', onPostUpdated));

    // FAB → модалка нового оголошення (та сама що на Дошці)
    api.screen.querySelector('[data-new-ad]')?.addEventListener('click', () => openBoardModal());

    // Свайп вліво по картці → виїжджають дії (Завершити/Повернути + Видалити) ззаду.
    let sX = 0, sY = 0, swCard = null, swRow = null, swLock = null;
    const rowOpenW = (row) => Number(row?.dataset.openW) || 134;
    listEl.addEventListener('touchstart', (e) => {
      const c = e.target.closest('.pm-ad');
      if (!c) { swCard = null; return; }
      swCard = c; swRow = c.closest('.pm-ad-row'); swLock = null;
      sX = e.touches[0].clientX; sY = e.touches[0].clientY;
    }, { passive: true });
    listEl.addEventListener('touchmove', (e) => {
      if (!swCard) return;
      const dx = e.touches[0].clientX - sX, dy = e.touches[0].clientY - sY;
      if (!swLock && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) swLock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (swLock === 'h') {
        e.preventDefault();
        swCard.style.transition = 'none';
        const w = rowOpenW(swRow);
        const base = (swRow === openRow) ? -w : 0;
        const d = Math.max(Math.min(base + dx, 0), -w);
        swCard.style.transform = `translateX(${d}px)`;
      }
    }, { passive: false });
    listEl.addEventListener('touchend', (e) => {
      if (!swCard) return;
      const c = swCard, r = swRow, lock = swLock;
      swCard = null; swRow = null;
      if (lock !== 'h') return;
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 60);
      c.style.transition = '';
      const w = rowOpenW(r);
      const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : sX) - sX;
      const wasOpen = (r === openRow);
      const open = wasOpen ? (dx < 60) : (dx < -70);
      if (open) {
        if (openRow && openRow !== r) closeOpenRow();
        c.style.transform = `translateX(${-w}px)`; r.classList.add('pm-ad-row--open'); openRow = r;
      } else {
        c.style.transform = ''; r.classList.remove('pm-ad-row--open'); if (openRow === r) openRow = null;
      }
    }, { passive: false });

    // Синхронізуємо клас рядка з видимістю меню — рядок з відкритим меню
    // піднімається над сусідніми картками (інакше низ меню «Видалити» ховається
    // під наступною карткою: .pm-ad має власний stacking-контекст z-index:1).
    const syncMenuRow = (menu) => {
      const row = menu.closest('.pm-ad-row');
      if (row) row.classList.toggle('pm-ad-row--menu-open', !menu.hidden);
    };
    const closeMenus = (except) => api.screen.querySelectorAll('.pm-ad-menu').forEach(m => {
      if (m !== except) { m.hidden = true; syncMenuRow(m); }
    });

    // Делеговані дії по списку
    listEl.addEventListener('click', async (e) => {
      if (suppressClick) return;   // щойно був свайп — не реагуємо на синтетичний клік
      // Відкритий свайп-рядок: дозволяємо лише його дії, будь-який інший тап — закрити рядок
      if (openRow) {
        const actInOpen = e.target.closest('[data-act]');
        if (!actInOpen || !openRow.contains(actInOpen)) { closeOpenRow(); return; }
      }
      const menuBtn = e.target.closest('[data-menu]');
      if (menuBtn) {
        const menu = api.screen.querySelector(`#pm-ad-menu-${menuBtn.dataset.menu}`);
        closeMenus(menu);
        if (menu) { menu.hidden = !menu.hidden; syncMenuRow(menu); }
        return;
      }
      const bumpBtn = e.target.closest('[data-bump]');
      if (bumpBtn) {
        bumpBtn.disabled = true;
        const r = await bumpPost(Number(bumpBtn.dataset.bump));
        if (r.ok) {
          const p = posts.find(x => String(x.id) === bumpBtn.dataset.bump);
          if (p) p.bumped_at = r.bumped_at || new Date().toISOString();
          showToast('🔼 Оголошення піднято вгору', 2500);
          render();
        } else if (r.error === 'cooldown') {
          const h = Math.floor((r.seconds_left || 0) / 3600);
          const m = Math.max(1, Math.ceil(((r.seconds_left || 0) % 3600) / 60));
          showToast(`Підняти можна раз на 3 год. Спробуйте через ${h > 0 ? h + ' год' : m + ' хв'}.`, 3500);
          const p = posts.find(x => String(x.id) === bumpBtn.dataset.bump);
          if (p) p.bumped_at = new Date(Date.now() - (BUMP_COOLDOWN_MS - (r.seconds_left || 0) * 1000)).toISOString();
          render();
        } else {
          showToast('Не вдалося підняти. Спробуйте ще раз.', 3000);
          bumpBtn.disabled = false;
        }
        return;
      }
      const badgeBtn = e.target.closest('[data-badge]');
      if (badgeBtn) { openThreadsList(); return; }

      const act = e.target.closest('[data-act]');
      if (act) {
        closeMenus(null);
        const id = Number(act.dataset.id);
        if (act.dataset.act === 'edit') {
          const p = posts.find(x => x.id === id);
          if (p) openBoardModal({ editPost: p });   // Д-3: редагування; список оновиться по cstl-post-updated
          return;
        }
        if (act.dataset.act === 'close') {
          const r = await closePost(id);
          if (r.ok) {
            const p = posts.find(x => x.id === id);
            if (p) p.status = 'closed';
            showToast('Оголошення завершено — у Архіві', 2800);
            render();
            window.dispatchEvent(new Event('cstl-posts-changed'));   // дошка зникне зразу
          } else showToast('Не вдалося завершити. Спробуйте ще раз.', 3000);
        } else if (act.dataset.act === 'restore') {
          const r = await restorePost(id);
          if (r.ok) {
            const p = posts.find(x => x.id === id);
            if (p) p.status = 'published';   // bumped_at не змінився → той самий час підняття
            showToast('↩️ Оголошення повернуто в активні', 2800);
            render();
            window.dispatchEvent(new Event('cstl-posts-changed'));   // зразу зʼявиться на дошці
          } else if (r.error === 'not_restorable') {
            showToast('Повернути можна лише завершені оголошення', 3000);
          } else showToast('Не вдалося повернути. Спробуйте ще раз.', 3000);
        } else if (act.dataset.act === 'delete') {
          if (!confirm('Видалити оголошення назавжди? Розмови по ньому теж зникнуть.')) return;
          const r = await deleteMyPost(id);
          if (r.ok) {
            posts = posts.filter(x => x.id !== id);
            showToast('Оголошення видалено', 2500);
            render();
          } else showToast('Не вдалося видалити. Спробуйте ще раз.', 3000);
        }
        return;
      }

      // Тап по тілу картки → перегляд оголошення (модалка Дошки)
      const open = e.target.closest('[data-open-ad]');
      if (open) {
        const p = posts.find(x => String(x.id) === open.dataset.openAd);
        if (p) window.dispatchEvent(new CustomEvent('cstl-open-ad', { detail: { post: p } }));
      }
    });
    // Клік поза меню — закрити відкриті меню
    api.screen.addEventListener('click', (e) => {
      if (!e.target.closest('.pm-ad-menu') && !e.target.closest('[data-menu]')) closeMenus(null);
    });
  });
}

// ── «Збережені» — окремий екран (Д-27) ────────────────────────────────────
// Список збережених оголошень (закладки) у стилі «Мої оголошення» (pm-screen).
//   posts    — список постів (board.js фільтрує allPosts по savedIds);
//   opts.onRemove(id) — колбек board.js (оновити свій savedIds + іконку закладки).
// Тап по картці → cstl-open-ad (повне оголошення). Прибрати → закладка справа.
export function openSavedAds(posts, opts = {}) {
  let list = Array.isArray(posts) ? posts.slice() : [];

  const api = buildScreen(`
    <header class="pm-head pm-head--list">
      <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
      <div class="pm-head-titles"><div class="pm-head-name pm-head-name--ico"><span class="pm-head-ic">${BOOKMARK_FILLED_SVG}</span>Збережені</div></div>
    </header>
    <div class="pm-list" id="pm-saved"><div class="pm-loading">Завантаження…</div></div>
  `, 'pm-screen--saved');

  const listEl = api.screen.querySelector('#pm-saved');
  const locOf = (p) => (p.location && p.location !== COMMUNITY_ALL) ? p.location : '';

  function card(p) {
    const photo = Array.isArray(p.photos) ? p.photos.find(x => x) : null;
    const thumb = photo
      ? `<div class="pm-ad-thumb pm-ad-thumb--photo" style="background-image:url('${escapeHtml(photo)}')"></div>`
      : `<div class="pm-ad-thumb" style="background:linear-gradient(135deg,#ece4d8,#dccfba)"><span class="pm-ad-thumb-ic">${ICONS.clipboard}</span></div>`;
    const title = escapeHtml((p.title && p.title.trim()) || (p.text || '').trim().slice(0, 54) || 'Оголошення');
    const meta = [p.category, locOf(p), p.author].filter(Boolean).map(escapeHtml).join(' · ');
    return `
      <div class="pm-ad-row">
        <div class="pm-ad">
          <div class="pm-ad-main" data-open-ad="${p.id}">
            ${thumb}
            <div class="pm-ad-info">
              <span class="pm-ad-title">${title}</span>
              <span class="pm-ad-meta">${meta}</span>
            </div>
            <button class="pm-saved-remove" type="button" data-unsave="${p.id}" aria-label="Прибрати зі збережених">${BOOKMARK_FILLED_SVG}</button>
          </div>
        </div>
      </div>`;
  }

  function render() {
    if (!list.length) {
      listEl.innerHTML = `<div class="pm-empty"><span class="pm-empty-ic">${BOOKMARK_OUTLINE_SVG}</span>У збережених поки порожньо.<br>Натисніть закладку на оголошенні, щоб зберегти.</div>`;
      return;
    }
    listEl.innerHTML = list.map(card).join('');
  }
  render();

  listEl.addEventListener('click', async (e) => {
    const un = e.target.closest('[data-unsave]');
    if (un) {
      e.stopPropagation();
      const id = Number(un.dataset.unsave);
      const me = currentUserId();
      if (me) await removeSavedPost(me, id);
      list = list.filter(p => p.id !== id);
      opts.onRemove?.(id);
      render();
      showToast('Прибрано зі збережених', 2000);
      return;
    }
    const open = e.target.closest('[data-open-ad]');
    if (open) {
      const p = list.find(x => String(x.id) === open.dataset.openAd);
      if (p) window.dispatchEvent(new CustomEvent('cstl-open-ad', { detail: { post: p } }));
    }
  });
}

// ── Точка входу з оголошення: кнопка «Повідомлення» 💬 ────────────────────
export function startChatFromPost(post) {
  requireAuth('написати продавцю', async () => {
    const me = currentUserId();
    if (!post.owner_uid) {
      showToast('Автор не залишив акаунту — зателефонуйте за номером', 3500);
      return;
    }
    if (post.owner_uid === me) {
      showToast('Це ваше оголошення — звернення дивіться у «Мої оголошення»', 3500);
      return;
    }
    const myProfile = await getProfile();
    const myName = (myProfile && myProfile.name) || 'Житель';
    const res = await getOrCreateThread({
      postId: post.id, authorUid: post.owner_uid, buyerUid: me,
      authorName: post.author || 'Продавець', buyerName: myName,
    });
    if (!res.ok) { showToast('Не вдалося відкрити чат: ' + (res.error || ''), 4000, 'error'); return; }
    openChat(res.thread, post);
  });
}

// ── Бейдж непрочитаних: іконка акаунта (шапка) + FAB Дошки + пункт «Повідомлення» ──
// Число всюди однакове = кількість ЧАТІВ (розмов) з хоча б одним непрочитаним.
// _readThreads — треди, які ми ЩОЙНО прочитали (відкрили чат). Виключаємо їх з
// лічильника одразу, не чекаючи поки БД оновить read_at → бейдж зникає надійно.
const _readThreads = new Set();
export async function refreshUnreadBadge() {
  const accBtn   = document.getElementById('account-btn');
  const fabBadge = document.getElementById('board-trigger-badge');
  const msgBadge = document.getElementById('board-fab-msgs-badge');

  const hideAll = () => {
    accBtn?.querySelector('.account-unread')?.remove();
    if (fabBadge) { fabBadge.textContent = ''; fabBadge.style.display = 'none'; }
    if (msgBadge) { msgBadge.textContent = ''; msgBadge.style.display = 'none'; }
  };
  if (!isLoggedIn()) { hideAll(); return; }

  // Кількість розмов з непрочитаними = розмір Map<thread_id, count>
  const map = await fetchUnreadByThread(currentUserId());
  for (const id of _readThreads) map.delete(id);   // щойно прочитані не рахуємо
  const chats = map.size;
  if (chats <= 0) { hideAll(); return; }
  const label = chats > 99 ? '99+' : String(chats);

  if (accBtn) {
    let badge = accBtn.querySelector('.account-unread');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'account-unread';
      accBtn.appendChild(badge);
    }
    badge.textContent = label;
  }
  if (fabBadge) { fabBadge.textContent = label; fabBadge.style.display = 'block'; }
  if (msgBadge) { msgBadge.textContent = label; msgBadge.style.display = 'inline-block'; }
}

// ── Реєстрація push-пристрою під акаунт (пасивний ресинк, без запиту дозволу) ──
// Використовуємо НАЯВНУ браузерну підписку (її вже міг створити трекер автобусів).
// Якщо підписки ще немає — нічого не робимо (не нав'язуємо дозвіл при вході).
async function registerChatPushDevice() {
  try {
    if (!isLoggedIn()) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const j = sub.toJSON();
    await saveUserPushDevice({
      uid: currentUserId(), endpoint: j.endpoint, p256dh: j.keys.p256dh, auth_key: j.keys.auth,
    });
  } catch (e) { console.warn('[chat-push] register:', e && e.message); }
}

// ── P-5: активний запит push (на відміну від registerChatPushDevice вище, який
// лише пасивно ресинкає НАЯВНУ підписку). Хто ніколи не вмикав автобусні
// сповіщення — раніше НІКОЛИ не отримував запит дозволу для чату, бо той код
// теж чекав готову підписку замість створити нову. Викликається з жесту
// користувача (тап «відкрити чат» у openChat) — fire-and-forget, не блокує чат.
async function ensureChatPush() {
  if (!isLoggedIn()) return;
  try {
    const sub = await ensurePushSubscription();
    if (!sub) return;
    const j = sub.toJSON();
    await saveUserPushDevice({
      uid: currentUserId(), endpoint: j.endpoint, p256dh: j.keys.p256dh, auth_key: j.keys.auth,
    });
  } catch (e) { console.warn('[chat-push] ensure:', e && e.message); }
}

// ── P-9: відкрити конкретну розмову за id треда (з нотифікації/hash-роутингу) ──
export async function openThreadById(threadId) {
  if (!isLoggedIn() || threadId == null) return;
  const threads = await fetchMyThreads(currentUserId());
  const thread = threads.find(t => String(t.id) === String(threadId));
  if (thread) openChat(thread, thread.post);
}

// ── P-8: банер вхідного push (chat) коли застосунок у фокусі — раніше нічого
// візуально не показувалось, лише бейдж (легко пропустити). Тап → відкрити розмову.
let _chatBannerTimer = null;
function showChatPushBanner({ title, body, threadId }) {
  let el = document.getElementById('chat-push-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'chat-push-banner';
    el.className = 'chat-push-banner';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="cpb-title">${escapeHtml(title || 'Нове повідомлення')}</div><div class="cpb-body">${escapeHtml(body || '')}</div>`;
  el.onclick = () => { el.classList.remove('visible'); if (threadId != null) openThreadById(threadId); };
  requestAnimationFrame(() => el.classList.add('visible'));
  clearTimeout(_chatBannerTimer);
  _chatBannerTimer = setTimeout(() => el.classList.remove('visible'), 4500);
}

// ── Ініціалізація (з app.js): бейдж + realtime + реакція на вхід/вихід ─────
let _threadsUnsub = null;
export function initBoardChat() {
  refreshUnreadBadge();
  // SW повідомляє про вхідний push (надійніше за realtime, який буває пропускає
  // нові треди між акаунтами): оновлюємо бейдж + сигналимо відкритому списку розмов
  // оновитись наживо (подія 'cstl-chat-refresh') + банер якщо застосунок у фокусі (P-8)
  // + відкриває розмову якщо клікнули по системній нотифікації (P-9).
  if ('serviceWorker' in navigator && navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (!e.data) return;
      if (e.data.__cstl === 'push') {
        refreshUnreadBadge();
        window.dispatchEvent(new CustomEvent('cstl-chat-refresh'));
        if (e.data.pushType === 'chat' && document.visibilityState === 'visible') {
          showChatPushBanner({ title: e.data.title, body: e.data.body, threadId: e.data.threadId });
        }
      } else if (e.data.__cstl === 'notif-click' && e.data.threadId != null) {
        openThreadById(e.data.threadId);
      }
    });
  }
  onAuthChange(() => {
    refreshUnreadBadge();
    registerChatPushDevice();
    // realtime по всіх моїх тредах → оновлення бейджа в реальному часі
    if (_threadsUnsub) { try { _threadsUnsub(); } catch (_) {} _threadsUnsub = null; }
    if (isLoggedIn()) _threadsUnsub = subscribeMyThreads((p) => {
      // нове чуже повідомлення → тред знову непрочитаний (прибрати з локально-прочитаних)
      const row = p && p.new;
      if (row && row.thread_id != null && row.sender_uid && row.sender_uid !== currentUserId()) {
        _readThreads.delete(row.thread_id);
      }
      refreshUnreadBadge();
    });
  });
}
