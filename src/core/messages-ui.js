// src/core/messages-ui.js
// ГРУПИ + запрошення (майбутня вкладка «Чати», V2).
// ⚠️ Приватний чат Дошки (покупець↔продавець, 1-на-1) ПЕРЕНЕСЕНО у tabs/board-chat.js
// (рішення Вови 05.07) — це функція Дошки. Тут лишились лише групові чати.
// Спільна механіка (екрани, клавіатура, жести) — у chat-core.js.
//
// Екрани:
//   openGroupsList()   — список «Групи» + створення + вступ за посиланням
//   openGroupChat(g)   — груповий чат (v1: текст + realtime + імена)
//   openGroupManage(g) — керування групою (інвайти, заявки, учасники)
//   openInviteJoin(t)  — вступ за токеном запрошення (hash-routing #/join/)
//   initMessages()     — доведення відкладеного вступу (з app.js)

import { currentUserId, isLoggedIn, requireAuth, onAuthChange } from './auth.js';
import {
  fetchMyGroups, createGroup, createGroupInvite, getGroupByInvite, joinGroupByToken,
  leaveGroup, fetchGroupMembers, fetchGroupMessages, sendGroupMessage,
  subscribeGroupMessages, approveMember, rejectMember, transferGroupOwner,
} from './supabase.js';
import { escapeHtml, showToast, postTime } from './utils.js';
import { buildScreen, clockTime, threadListTime } from './chat-core.js';
import { ICONS } from './icons.js';

// Лінійні іконки груп (монохром, стиль чату — не Apple-емодзі)
// users — дедуп, спільна з board.js/admin.html, див. core/icons.js
const GR_SVG = {
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  users: ICONS.users,
};

// ── 4. Приватні групові чати (Етап 2) ──────────────────────────────────────
// Список «Групи» (з вкладки Чати) → груповий чат. Створення + вступ за посиланням.
// v1 чату: текст + realtime + імена відправників. Фото/відповіді/свайп — далі.
export function openGroupsList() {
  requireAuth('переглянути групи', async () => {
    const api = buildScreen(`
      <header class="pm-head pm-head--list">
        <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
        <div class="pm-head-titles"><div class="pm-head-name">Групи</div></div>
      </header>
      <div class="gr-actions">
        <button class="gr-act" type="button" data-gr-new><span class="gr-act-ic">＋</span> Створити групу</button>
        <button class="gr-act gr-act--ghost" type="button" data-gr-join><span class="gr-act-ic">${GR_SVG.link}</span> Вступ за посиланням</button>
      </div>
      <div class="pm-list" id="gr-list"><div class="pm-loading">Завантаження…</div></div>
    `, 'pm-screen--groups');

    const listEl = api.screen.querySelector('#gr-list');
    let groups = [];
    const groupRow = (g) => {
      const cover = g.avatar_emoji ? escapeHtml(g.avatar_emoji) : GR_SVG.users;
      const last = g.last_message_text ? escapeHtml(g.last_message_text) : 'Немає повідомлень';
      return `
        <button class="pm-thread gr-row" type="button" data-group="${g.id}">
          <span class="gr-avatar" style="${g.avatar_gradient ? `background:${escapeHtml(g.avatar_gradient)}` : ''}">${cover}</span>
          <div class="pm-thread-body">
            <div class="pm-thread-top">
              <span class="pm-thread-name">${escapeHtml(g.name)}</span>
              <span class="pm-thread-time">${g.last_message_at ? threadListTime(g.last_message_at) : ''}</span>
            </div>
            <div class="pm-thread-last">${last}</div>
          </div>
        </button>`;
    };
    const load = async () => {
      groups = await fetchMyGroups();
      if (api._closed) return;
      listEl.innerHTML = groups.length
        ? groups.map(groupRow).join('')
        : `<div class="pm-empty"><span class="pm-empty-ic">${ICONS.users}</span>У вас ще немає груп.<br>Створіть свою або приєднайтесь за посиланням.</div>`;
    };
    await load();

    api.screen.querySelector('[data-gr-new]')?.addEventListener('click', () => openCreateGroup(load));
    api.screen.querySelector('[data-gr-join]')?.addEventListener('click', () => promptJoinByLink(load));
    listEl.addEventListener('click', (e) => {
      const row = e.target.closest('[data-group]');
      if (!row) return;
      const g = groups.find(x => String(x.id) === row.dataset.group);
      if (g) openGroupChat(g);
    });
  });
}

// Створення групи — лаконічна форма (назва + опис + emoji-обкладинка)
function openCreateGroup(onDone) {
  const EMOJIS = ['👥', '🏘', '⚽', '🎓', '🚜', '⛪', '🛒', '🎣'];
  const api = buildScreen(`
    <header class="pm-head pm-head--list">
      <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
      <div class="pm-head-titles"><div class="pm-head-name">＋ Нова група</div></div>
    </header>
    <div class="gr-form">
      <label class="gr-label">Емодзі</label>
      <div class="gr-emoji-row" id="gr-emoji">${EMOJIS.map((e, i) => `<button type="button" class="gr-emoji${i === 0 ? ' active' : ''}" data-emoji="${e}">${e}</button>`).join('')}</div>
      <label class="gr-label" for="gr-name">Назва</label>
      <input class="gr-input" id="gr-name" type="text" maxlength="60" placeholder="Напр. Наша Мительне">
      <label class="gr-label" for="gr-desc">Опис <span class="gr-hint">(необов'язково)</span></label>
      <textarea class="gr-input" id="gr-desc" rows="3" maxlength="200" placeholder="Про що ця група?"></textarea>
      <button class="gr-submit" type="button" id="gr-create">Створити</button>
    </div>
  `, 'pm-screen--groups');

  let emoji = EMOJIS[0];
  api.screen.querySelector('#gr-emoji').addEventListener('click', (e) => {
    const b = e.target.closest('[data-emoji]'); if (!b) return;
    emoji = b.dataset.emoji;
    api.screen.querySelectorAll('.gr-emoji').forEach(x => x.classList.toggle('active', x === b));
  });
  api.screen.querySelector('#gr-create').addEventListener('click', async () => {
    const name = api.screen.querySelector('#gr-name').value.trim();
    const description = api.screen.querySelector('#gr-desc').value.trim();
    if (!name) { showToast('Введіть назву групи', 2500); return; }
    const btn = api.screen.querySelector('#gr-create');
    btn.disabled = true; btn.textContent = 'Створюємо…';
    const r = await createGroup({ name, description, emoji });
    if (r.ok) {
      showToast('✅ Групу створено', 2500);
      api.close();
      if (onDone) onDone();
    } else { showToast('Не вдалося створити: ' + (r.error || ''), 3500, 'error'); btn.disabled = false; btn.textContent = 'Створити'; }
  });
}

// Повне посилання-запрошення (з hash-routing — працює на GitHub Pages без 404)
function buildInviteUrl(token) {
  return `${location.origin}${location.pathname}#/join/${token}`;
}

// Вступ за посиланням — вставити посилання/токен вручну (fallback до hash-routing)
function promptJoinByLink(onDone) {
  const raw = prompt('Встав посилання-запрошення або код групи:');
  if (!raw) return;
  const m = String(raw).trim().match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!m) { showToast('Не схоже на дійсне посилання', 3000); return; }
  openInviteJoin(m[0], onDone);
}

const PENDING_INVITE_KEY = 'cstl-pending-invite';

// Вступ за токеном: прев'ю → підтвердження → приєднання (миттєво або заявка).
// Якщо НЕ залогінений — зберігаємо токен у localStorage і відкриваємо вхід; після
// авторизації (redirect Google повертає БЕЗ hash) consumePendingInvite() доведе вступ.
export function openInviteJoin(token, onDone) {
  if (!isLoggedIn()) {
    try { localStorage.setItem(PENDING_INVITE_KEY, token); } catch (_) {}
    requireAuth('приєднатись до групи', () => {});   // відкриває вхід
    return;
  }
  (async () => {
    const g = await getGroupByInvite(token);
    if (!g.ok) { showToast('Запрошення недійсне або застаріле', 3500); return; }
    const openGrp = async (gid) => {
      const grp = (await fetchMyGroups()).find(x => x.id === gid);
      if (grp) openGroupChat(grp); else openGroupsList();
    };
    if (g.my_status === 'member') { showToast('Ви вже в цій групі', 2500); openGrp(g.id); return; }
    const note = g.requires_approval ? '\n\nПісля вступу адмін має вас схвалити.' : '';
    if (!confirm(`Приєднатись до «${g.name}»? (${g.members} учасн.)${note}`)) return;
    const r = await joinGroupByToken(token);
    if (r.ok && r.status === 'member') { showToast('✅ Ви приєднались', 2500); openGrp(r.group_id || g.id); if (onDone) onDone(); }
    else if (r.ok && r.status === 'pending') { showToast('⏳ Заявку надіслано — чекайте схвалення адміна', 4200); }
    else showToast('Не вдалося приєднатись: ' + (r.error || ''), 3500, 'error');
  })();
}

// Доводить відкладений вступ (після авторизації або при старті, коли вже залогінений).
export function consumePendingInvite() {
  let t = null;
  try { t = localStorage.getItem(PENDING_INVITE_KEY); } catch (_) {}
  if (!t || !isLoggedIn()) return;
  try { localStorage.removeItem(PENDING_INVITE_KEY); } catch (_) {}
  openInviteJoin(t);
}

// Керування групою: запрошення (2 типи), заявки на схвалення, учасники, вихід
export function openGroupManage(group) {
  requireAuth('керувати групою', async () => {
    const me = currentUserId();
    const api = buildScreen(`
      <header class="pm-head pm-head--list">
        <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
        <div class="pm-head-titles"><div class="pm-head-name">Керування · ${escapeHtml(group.name)}</div></div>
      </header>
      <div class="gr-mng" id="gr-mng"><div class="pm-loading">Завантаження…</div></div>
    `, 'pm-screen--groups');
    const wrap = api.screen.querySelector('#gr-mng');

    const makeInvite = async (requiresApproval) => {
      const r = await createGroupInvite(group.id, requiresApproval);
      if (!r.ok) { showToast('Не вдалося створити посилання: ' + (r.error || ''), 3500, 'error'); return; }
      const url = buildInviteUrl(r.token);
      const label = requiresApproval ? 'зі схваленням адміна' : 'миттєвий вступ';
      if (navigator.share) {
        try { await navigator.share({ title: group.name, text: `Приєднуйся до «${group.name}» (${label})`, url }); return; } catch (_) {}
      }
      try { await navigator.clipboard.writeText(url); showToast(`🔗 Посилання (${label}) скопійовано`, 3000); }
      catch { prompt('Скопіюй посилання:', url); }
    };

    const render = async () => {
      const members = await fetchGroupMembers(group.id);
      if (api._closed) return;
      const myRole = (members.find(m => m.uid === me) || {}).role;
      const isAdmin = myRole === 'admin';
      const isOwner = group.owner_uid === me;
      const pending = members.filter(m => m.status === 'pending');
      const active  = members.filter(m => m.status === 'member');
      const nm = (uid) => { const mm = members.find(x => x.uid === uid); return escapeHtml((mm && mm.name) || 'Житель'); };

      wrap.innerHTML = `
        ${group.description ? `<p class="gr-mng-desc">${escapeHtml(group.description)}</p>` : ''}
        ${isAdmin ? `
          <div class="gr-mng-sec">
            <div class="gr-mng-h">Запросити</div>
            <button class="gr-act" type="button" data-inv="0"><span class="gr-act-ic">${GR_SVG.link}</span> Посилання — миттєвий вступ</button>
            <button class="gr-act gr-act--ghost" type="button" data-inv="1"><span class="gr-act-ic">${GR_SVG.link}</span> Посилання — зі схваленням</button>
          </div>` : ''}
        ${isAdmin && pending.length ? `
          <div class="gr-mng-sec">
            <div class="gr-mng-h">Заявки на вступ (${pending.length})</div>
            ${pending.map(m => `
              <div class="gr-mbr">
                <span class="gr-mbr-name">${nm(m.uid)}</span>
                <span class="gr-mbr-acts">
                  <button class="gr-mbr-ok" type="button" data-approve="${m.uid}">✓</button>
                  <button class="gr-mbr-no" type="button" data-reject="${m.uid}">${ICONS.close}</button>
                </span>
              </div>`).join('')}
          </div>` : ''}
        <div class="gr-mng-sec">
          <div class="gr-mng-h">Учасники (${active.length})</div>
          ${active.map(m => {
            const acts = [];
            if (isOwner && m.uid !== me) acts.push(`<button class="gr-mbr-ok" type="button" data-makeowner="${m.uid}">зробити власником</button>`);
            if (isAdmin && m.uid !== group.owner_uid && m.uid !== me) acts.push(`<button class="gr-mbr-no" type="button" data-reject="${m.uid}">видалити</button>`);
            const tag = m.uid === group.owner_uid ? ' <span class="gr-mbr-tag">власник</span>' : (m.role === 'admin' ? ' <span class="gr-mbr-tag">адмін</span>' : '');
            return `<div class="gr-mbr"><span class="gr-mbr-name">${nm(m.uid)}${tag}</span>${acts.length ? `<span class="gr-mbr-acts">${acts.join('')}</span>` : ''}</div>`;
          }).join('')}
        </div>
        ${!isOwner
          ? `<button class="gr-leave" type="button" data-leave>Вийти з групи</button>`
          : (active.length > 1
              ? `<p class="gr-hint" style="padding:0 4px">Ви власник. Щоб вийти — спершу передайте власника комусь із учасників (кнопка «зробити власником»).</p>`
              : `<p class="gr-hint" style="padding:0 4px">Ви власник єдиний у групі.</p>`)}
      `;
    };
    await render();

    wrap.addEventListener('click', async (e) => {
      const inv = e.target.closest('[data-inv]');
      if (inv) { makeInvite(inv.dataset.inv === '1'); return; }
      const ap = e.target.closest('[data-approve]');
      if (ap) { const r = await approveMember(group.id, ap.dataset.approve); if (r.ok) { showToast('✅ Схвалено', 2000); render(); } else showToast('Помилка: ' + (r.error || ''), 3000); return; }
      const rj = e.target.closest('[data-reject]');
      if (rj) { if (!confirm('Прибрати цього користувача?')) return; const r = await rejectMember(group.id, rj.dataset.reject); if (r.ok) { showToast('Готово', 2000); render(); } else showToast('Помилка: ' + (r.error || ''), 3000); return; }
      const mo = e.target.closest('[data-makeowner]');
      if (mo) {
        if (!confirm('Передати власника цьому учаснику? Ви станете звичайним адміном.')) return;
        const r = await transferGroupOwner(group.id, mo.dataset.makeowner);
        if (r.ok) { group.owner_uid = mo.dataset.makeowner; showToast('✅ Власника передано', 2500); render(); }
        else showToast('Помилка: ' + (r.error || ''), 3000);
        return;
      }
      if (e.target.closest('[data-leave]')) {
        if (!confirm('Вийти з групи?')) return;
        const r = await leaveGroup(group.id);
        if (r.ok) { showToast('Ви вийшли з групи', 2500); api.close(); }
        else showToast('Не вдалося вийти: ' + (r.error || ''), 3500, 'error');
      }
    });
  });
}

// Груповий чат (v1: текст + realtime + імена відправників)
export function openGroupChat(group) {
  requireAuth('відкрити груповий чат', async () => {
    const me = currentUserId();
    const api = buildScreen(`
      <header class="pm-head pm-head--chat">
        <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
        <span class="gr-avatar gr-avatar--head" style="${group.avatar_gradient ? `background:${escapeHtml(group.avatar_gradient)}` : ''}">${group.avatar_emoji ? escapeHtml(group.avatar_emoji) : GR_SVG.users}</span>
        <div class="pm-head-titles"><div class="pm-head-name">${escapeHtml(group.name)}</div></div>
        <button class="gr-manage-btn" type="button" data-gr-manage aria-label="Керування групою">${GR_SVG.gear}</button>
      </header>
      <div class="pm-stream" id="gr-stream"><div class="pm-loading">Завантаження…</div></div>
      <form class="pm-form" id="gr-form">
        <input class="pm-input" id="gr-msg" type="text" placeholder="Повідомлення у групу…" aria-label="Повідомлення" autocomplete="off">
        <button class="pm-send" type="submit" aria-label="Надіслати">↑</button>
      </form>
    `, 'pm-screen--chat');

    const streamEl = api.screen.querySelector('#gr-stream');
    const form = api.screen.querySelector('#gr-form');
    const input = api.screen.querySelector('#gr-msg');
    let messages = [];
    const ids = new Set();
    let names = new Map();

    const bubble = (m) => {
      const mine = m.sender_uid === me;
      const who = mine ? '' : `<span class="gr-sender">${escapeHtml(names.get(m.sender_uid) || 'Житель')}</span>`;
      const txtHtml = m.deleted_at ? `${ICONS.trash} видалено` : escapeHtml(m.text || '📷 Фото');
      return `<div class="pm-group ${mine ? 'pm-group--mine' : 'pm-group--other'}"><div class="pm-bubble">${who}<span class="pm-bubble-text">${txtHtml}</span><span class="pm-bubble-time">${clockTime(postTime(m))}</span></div></div>`;
    };
    const render = () => {
      streamEl.innerHTML = messages.length
        ? messages.map(bubble).join('')
        : `<div class="pm-empty pm-empty--chat"><span class="pm-empty-ic">👋</span>Почніть розмову в групі.</div>`;
      streamEl.scrollTop = streamEl.scrollHeight;
    };
    const addMsg = (m) => { if (m && !ids.has(m.id)) { ids.add(m.id); messages.push(m); } };

    // Імена учасників (денормалізовані в chat_group_members — не з profiles, бо RLS).
    const firstName = (n) => (String(n || '').trim().split(/\s+/)[0]) || 'Житель';
    const members = await fetchGroupMembers(group.id);
    names = new Map(members.map(m => [m.uid, firstName(m.name)]));
    (await fetchGroupMessages(group.id)).forEach(addMsg);
    if (api._closed) return;
    render();

    api.screen.querySelector('[data-gr-manage]')?.addEventListener('click', () => openGroupManage(group));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      const r = await sendGroupMessage({ groupId: group.id, senderUid: me, text });
      if (r.ok) { addMsg(r.message); render(); }
      else { showToast('Не вдалося надіслати: ' + (r.error || ''), 3000, 'error'); input.value = text; }
    });

    const unsub = subscribeGroupMessages(group.id, ({ type, row }) => {
      if (type === 'INSERT' && row) { addMsg(row); render(); }
      else if (type === 'UPDATE' && row) {
        const i = messages.findIndex(x => x.id === row.id);
        if (i >= 0) { messages[i] = row; render(); }
      }
    });
    api._cleanup.push(unsub);
  });
}

// ── Ініціалізація (з app.js): доведення відкладеного вступу за посиланням ──
export function initMessages() {
  consumePendingInvite();   // якщо токен запрошення лишився з минулого відкриття
  onAuthChange(() => {
    consumePendingInvite();   // після входу (redirect Google) — доводимо вступ за посиланням
  });
}
