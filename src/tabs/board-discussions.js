// src/tabs/board-discussions.js
// ДВИГУН «ОБГОВОРЕНЬ» (груповий чат тем, type:'chat') — винесено з board.js
// (Потік 10, Д-5, 12.07). Тут: картка теми (renderChatCard), повноекранна
// модалка-чат (openChatModal), лайки ❤️, коментарі (optimistic + realtime),
// bottom-sheets «Мої / Збережені / Створити обговорення».
//
// АРХІТЕКТУРА (проти циклічного імпорту — TDZ-баг такого роду вже був у
// openDiscSheet, Потік C2): цей файл НЕ імпортує з board.js. Зв'язок:
//   • дані Дошки (allPosts) — через initDiscussionsEngine({ getPosts })
//     (ін'єкція з initBoard, board.js лишається власником стану);
//   • коментарі/лайки — setDiscussionsData() з renderBoard();
//   • «перезавантаж дошку» після створення обговорення — подія
//     'cstl-posts-changed' (initBoard вже слухає), НЕ прямий renderBoard();
//   • закладки (savedIds) — спільний core/board-shared.js.
// board.js імпортує ЗВІДСИ (один напрямок): renderChatCard, openChatModal,
// FAB-дії, handleLikeClick, attach*-ініціалізатори, handleDiscussionsAuthChange.

import { escapeHtml, formatTime, postTime, showToast, containsProfanity, looksLikeSpam, avatarCircle, autoGrowTextarea,
         lsGet, lsSet, isDuplicateMsg, isFlooding, recordSentMsg } from '../core/utils.js';
import { requireAuth, isLoggedIn, currentUserId, currentUserName } from '../core/auth.js';
import {
  isSupabaseReady,
  fetchAllComments, addComment, editComment, deleteComment,
  subscribeComments,
  fetchAllReactions, setReaction, subscribeReactions, getAnonId,
  submitDiscussion, cachedAvatar, hydrateAvatars, hydrateNames, nameUid, liveName,
} from '../core/supabase.js';
import { ACT_ICONS } from '../core/chat-core.js';
import { openModal as openModalPrimitive } from '../core/modal.js';
import { getSavedIds, saveBtnHtml } from '../core/board-shared.js';
import { openLayer, closeLayer } from '../core/layers.js';   // повноекранний шар + системний жест «назад»
import { keepScroll } from '../core/list-patch.js';          // якір прокрутки (спільний з Дошкою і «Стрічкою»)

// ── Доступ до постів Дошки (ін'єкція з board.js — стан лишається там) ────────
let _getPosts = () => [];
export function initDiscussionsEngine({ getPosts }) {
  if (getPosts) _getPosts = getPosts;
}

// ── Іконки (лише обговорення) ────────────────────────────────────────────────
const COMMENT_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
// ⚠️ 11.08 — `USERS_ICON_SVG` (👥 учасники) прибрано разом із лічильником учасників
// на картці: «скільки людей у розмові» — метрика чату, у Q&A вона нічого не вирішує.
// Разом із ним пішов і імпорт `ICONS` — другого споживача в цьому файлі не було.
// Шеврон «›» у рядку питання. 🔑 Не текстовий гліф, а вектор: текстовий «›»
// тонший за решту знаків екрана і сидить не по центру рядка (той самий висновок,
// що вже записаний для `.cm-ad-author-go`). Для аудиторії 60+ ця стрілка —
// головний сигнал «сюди можна натиснути».
const CHEVRON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
const HEART_OUTLINE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
const HEART_FILLED_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';

// ── Стан (зберігається в межах сесії) ────────────────────────────────────────

// Коментарі — централізовано у Map<postId, ...>. Завантажується з Supabase у
// renderBoard() (board.js) через setDiscussionsData, оновлюється при кліках
// через optimistic update.
let commentsByPost  = new Map();  // postId → [{id, author, text, created_at}]

// Лайки Обговорень (Д-задача 3) — реюз наявного дата-шару reactions (setReaction/
// fetchAllReactions/subscribeReactions у supabase.js), той самий що раніше живив
// реакції оголошень (прибрані з Дошки 11.07, Д-13) — тут інша концепція: одна
// емоція ❤️ = «лайк» теми обговорення, не набір реакцій.
const LIKE_EMOJI = '❤️';
let reactionsByPost = new Map();  // postId → { counts:{emoji:count}, my: emoji|null }

// Заповнення стану з renderBoard() (board.js). reactions опційний — fallback-шлях
// (JSON без БД) скидає лише коментарі, як і до розділення файлів.
export function setDiscussionsData(comments, reactions) {
  if (comments)  commentsByPost  = comments;
  if (reactions) reactionsByPost = reactions;
}

function getLikeCount(postId) {
  return reactionsByPost.get(postId)?.counts?.[LIKE_EMOJI] || 0;
}
function isLikedByMe(postId) {
  return reactionsByPost.get(postId)?.my === LIKE_EMOJI;
}
// Вміст кнопки «Мене теж цікавить» (той самий рядок реакції в базі — див.
// `qaInterestHtml`). Окремою функцією, бо `handleLikeClick` перемальовує лише
// нутрощі кнопки, не саму кнопку — інакше делегований обробник втратив би вузол.
function likeBtnInner(postId) {
  const on = isLikedByMe(postId);
  const n  = getLikeCount(postId);
  return `${on ? HEART_FILLED_SVG : HEART_OUTLINE_SVG}
          <span class="qa-interest-label">Мене теж цікавить</span>
          ${n ? `<span class="qa-interest-n">${n}</span>` : ''}`;
}

// ── localStorage (per-device) — лише час перегляду тем; закладки тепер у БД ──

const LS_CHAT_SEEN = 'cstl-chat-seen-v1';  // { postId: timestamp останнього перегляду теми (ms) }

// lsGet/lsSet тепер спільні (core/utils.js) — ними користується і антифлуд «Стрічки».

// ── Коментарі (з Supabase, in-memory map) ───────────────────────────────────

function getComments(postId) {
  return commentsByPost.get(postId) || [];
}
// Невидалені повідомлення (для лічильників/прев'ю/учасників) — видалені не рахуємо.
function activeComments(postId) {
  return getComments(postId).filter(c => !c.deleted_at);
}

// Чи це моє повідомлення (для right-вирівнювання у чаті) — за sender_uid з БД,
// тільки коли залогінений (account-bound, синхрон між пристроями).
function isMyComment(c) {
  const uid = currentUserId();
  return !!uid && c.sender_uid === uid;
}

// ⚠️ 11.08 — ТУТ ЖИЛИ `clockTime` (час `HH:MM`) І `chatDayLabel` («Сьогодні/Вчора»).
// Обидві прибрані разом із бульбашками: це годинникова вісь розмови. Q&A стоїть на
// вісі «давно / нещодавно», і її дає спільний `formatTime` з `core/utils.js`
// («2 год тому» / «9 серпня») — власного форматувальника дати тут більше немає.

// 🔴 ЧАС У МІЛІСЕКУНДАХ — обовʼязково перед будь-яким порівнянням.
// Коментарі приходять із `created_at` як ISO-РЯДОК (`fetchAllComments` у supabase.js),
// а межа перегляду (`getChatSeen`) — ЧИСЛО. Пряме `рядок > число` у JS дає
// `Number(ISO)` = NaN, тобто умова ЗАВЖДИ false. Перевірено в node:
//   '2026-07-30T07:00:00.000Z' > Date.now()  →  false
// Саме через це роздільник «Нові повідомлення» не зʼявлявся НІКОЛИ (баг, знайдений
// 30.07 при роботі над крапкою вкладки; виправлено того ж дня за словом Вови «так»).
function tsMs(v) {
  if (!v) return 0;
  return typeof v === 'number' ? v : (new Date(v).getTime() || 0);
}

// Час останнього перегляду питання (per-device). ⚠️ Роздільника «Нові повідомлення»
// в екрані більше немає (чат-механіка), але сама межа ПОТРІБНА далі: на ній
// тримається крапка «є нове» біля іконки вкладки (`unseenDiscussionsCount`).
function getChatSeen(postId) {
  const m = lsGet(LS_CHAT_SEEN, {});
  return m[String(postId)] || 0;
}
function setChatSeen(postId, ts) {
  const m = lsGet(LS_CHAT_SEEN, {});
  m[String(postId)] = ts;
  lsSet(LS_CHAT_SEEN, m);
}

// ── Антиспам/антифлуд для коментарів чату (per-device) ──────────────────────
// Механізм переїхав у core/utils.js (спільний зі «Стрічкою»). Тут лишається
// лише scope: для Обговорень він ОДИН на всі теми — рівно як було раніше і як
// рахує серверний тригер comments_antispam (останнє повідомлення автора взагалі,
// без прив'язки до теми). Розійтись цим двом не можна.
const RATE_SCOPE = 'disc';

// Відмінювання «відповідь / відповіді / відповідей» за числом (1 / 2-4 / 5+, з
// урахуванням 11-14). ⚠️ Заступило `msgWord` («повідомлення») — слова «повідомлення»
// в цій зоні більше немає ніде, і це навмисно: воно й тягло за собою месенджер.
function answerWord(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'відповідь';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'відповіді';
  return 'відповідей';
}

// 🔑 ЧАС ОСТАННЬОЇ ВІДПОВІДІ — сортування списку питань рахує КЛІЄНТ, і на це є
// причина, а не лінощі. У Q&A список має стояти за живістю («де щойно відповіли»),
// а не за датою створення. Природним місцем для цього був би `posts.bumped_at`,
// АЛЕ політика бази `posts UPDATE` дозволена лише `is_admin()` (заміряно
// `pg_policies` 11.08) — тобто ні автор, ні той, хто відповідає, підняти запис не
// можуть, і поле лишається порожнім назавжди. Рахувати тут — безкоштовно:
// коментарі всіх тем уже лежать у памʼяті (`setDiscussionsData` ← `fetchAllComments`),
// другого джерела правди не заводимо і в мережу не ходимо.
// Скільки живих відповідей має питання. Експортовано, бо на це число спираються
// ДВА місця поза цим файлом: чіп «Без відповіді» і його лічильник у шапці вкладки
// (`board.js`). Другого підрахунку не заводимо — два лічильники того самого вже
// розходились у проєкті (баг B-27).
export function answersCount(postId) {
  return activeComments(postId).length;
}

export function lastAnswerTs(postId) {
  let max = 0;
  for (const c of activeComments(postId)) {
    const t = tsMs(postTime(c));
    if (t > max) max = t;
  }
  return max;
}

// ── Утиліти ──────────────────────────────────────────────────────────────────

// Аватарка автора в обговоренні: фото профілю (крос-юзер, по uid) або перша
// літера імені / 👤 для аноніма. Потік 12 Б: делегуємо у спільний avatarCircle;
// uid → data-av-uid, hydrateAvatars підмінить літеру на фото коли підтягнеться.
function authorAvatar(author, uid) {
  return avatarCircle({ name: author, url: cachedAvatar(uid), uid: uid || '', cls: 'bd-avatar' });
}

// ── ВІДПОВІДІ НА ПИТАННЯ ─────────────────────────────────────────────────────
//
// 🔴 11.08 — ПЕРЕПИСАНО З «БУЛЬБАШОК ЧАТУ» НА «СПИСОК ВІДПОВІДЕЙ».
//
// Що саме знято і чому — це не косметика, а зняття чотирьох НЕЗАЛЕЖНИХ сигналів,
// кожен з яких сам по собі каже людині «ти в месенджері»:
//   1. `.pm-bubble` з вирівнюванням «мої справа / чужі зліва» — найсильніший
//      візуальний маркер месенджера у світі; жоден Q&A ним не користується;
//   2. час `HH:MM` (`clockTime`) — годинникова вісь. Q&A живе на вісі
//      «давно / нещодавно», тому тут `formatTime` («2 год тому» / «9 серпня»);
//   3. роздільники днів «Сьогодні / Вчора» (`pm-daysep`) — розмітка розмови;
//   4. роздільник «Нові повідомлення» і пігулка «↓ N нових» — механіка догортання
//      чату. У Q&A людина читає ЗВЕРХУ (спершу питання), а не «з місця, де спинилась».
//
// 🔑 Вкладеність замість цитати. Наявний `reply_to_id` не змінює свого значення в
// базі — змінюється лише те, як він МАЛЮЄТЬСЯ: був цитатою всередині бульбашки,
// став відступом під батьківською відповіддю. Глибина ДВА рівні, як у «Стрічці»:
// відповідь на відповідь — це ще Q&A, третій рівень — це вже розмова.
// ⚠️ Заміряно 11.08: `reply_to_id` заповнений у 1 коментарі з 54, тобто механізм
// існував, але не мав видимої ролі. Тепер вона в нього є.
//
// Контейнер зберігає `data-comments-for` — на нього спираються realtime і
// оптимістична вставка (`rerenderCommentsBlock`), і ЦЕ НЕ ЧІПАЄМО.
function answersHtml(post) {
  const all = getComments(post.id);
  const items = all.filter(c => !c.deleted_at);
  if (!items.length) {
    return `<div class="qa-answers" data-comments-for="${post.id}">
      <div class="qa-empty">
        <span class="qa-empty-icon">${COMMENT_ICON_SVG}</span>
        <span class="qa-empty-title">Ще ніхто не відповів</span>
        <span class="qa-empty-sub">Знаєте відповідь? Напишіть — сусіди чекають.</span>
      </div>
    </div>`;
  }

  // Корені та вкладені. Відповідь вважаємо вкладеною, лише якщо її батько ЖИВИЙ і
  // сам є коренем — інакше вона осиротіла б і зникла з екрана назовсім (у
  // «Стрічці» саме сироти колись давали розбіжність лічильника, баг B-27).
  const liveIds = new Set(items.map(c => c.id));
  const isRoot = (c) => !c.reply_to_id || !liveIds.has(c.reply_to_id);
  const roots = items.filter(isRoot);
  const subsOf = new Map();
  for (const c of items) {
    if (isRoot(c)) continue;
    let parent = c.reply_to_id;
    // Батько сам вкладений → піднімаємо відповідь до його кореня (стеля — 2 рівні).
    const pNode = all.find(x => x.id === parent);
    if (pNode && pNode.reply_to_id && liveIds.has(pNode.reply_to_id)) parent = pNode.reply_to_id;
    if (!subsOf.has(parent)) subsOf.set(parent, []);
    subsOf.get(parent).push(c);
  }

  const answer = (c, sub) => {
    const author = c.author || 'Житель';
    const edited = c.edited_at ? '<span class="qa-answer-edited">змінено</span>' : '';
    // «Відповісти» лише на КОРЕНЕВІЙ — інакше з другого рівня росло б дерево,
    // і Q&A перетворилось би на ту саму розмову, від якої ми відходимо.
    const replyBtn = sub ? '' :
      `<button class="qa-answer-reply" type="button" data-answer-reply="${c.id}">${ACT_ICONS.reply}Відповісти</button>`;
    return `
      <article class="qa-answer${sub ? ' qa-answer--sub' : ''}" data-msg="${c.id}" data-tag="${c.client_tag || ''}">
        <div class="qa-answer-head">
          ${authorAvatar(author, c.sender_uid)}
          <span class="qa-answer-name"${nameUid(c.sender_uid)}>${liveName(author, c.sender_uid)}</span>
          <span class="qa-answer-when">${formatTime(postTime(c))}</span>
          ${edited}
          <button class="qa-answer-more" type="button" data-answer-menu="${c.id}" aria-label="Дії">⋯</button>
        </div>
        <p class="qa-answer-text">${escapeHtml(c.text)}</p>
        ${replyBtn}
      </article>`;
  };

  const html = roots.map(r => {
    const subs = (subsOf.get(r.id) || []).map(s => answer(s, true)).join('');
    return answer(r, false) + (subs ? `<div class="qa-answer-subs">${subs}</div>` : '');
  }).join('');

  return `<div class="qa-answers" data-comments-for="${post.id}">${html}</div>`;
}

// Показати щойно надіслану відповідь. 🔑 Кличемо ЛИШЕ після ВЛАСНОЇ дії (надіслав,
// змінив), а не на кожне перемальовування: у чаті автоскрол донизу правильний, бо
// низ = «зараз», а в Q&A низ = «найдавніша прочитана відповідь», і смикати туди
// людину, яка читає згори, означало б забрати в неї місце в тексті.
function scrollToMyAnswer() {
  const body = document.querySelector('.qa-body');
  if (!body) return;
  const answers = body.querySelectorAll('.qa-answer');
  const last = answers[answers.length - 1];
  if (last) last.scrollIntoView({ block: 'center', behavior: 'smooth' });
  else body.scrollTop = body.scrollHeight;
}

// Оновити лічильник відповідей у заголовку секції відкритого питання
function updateChatHeaderCount(postId) {
  if (postId !== _chatOpenPostId) return;
  const el = document.getElementById('qa-answers-count');
  if (el) {
    const n = activeComments(postId).length;
    el.textContent = n ? `${n} ${answerWord(n)}` : 'Відповіді';
  }
}

// ── ПОВНОЕКРАННИЙ ЕКРАН ПИТАННЯ ──────────────────────────────────────────────
//
// 🔴 11.08 — БУЛА МОДАЛКА, СТАВ ШАР (`core/layers.js`).
//
// Чому не «просто перефарбувати модалку»: модальне вікно поверх сторінки — це
// патерн «щось вискочило, зараз закрию». Питання з відповідями — це МІСЦЕ, куди
// людина приходить читати; місце має бути екраном.
//
// 🔑 Закриття віддано СИСТЕМНОМУ жесту iPhone через `openLayer`. Власного
// свайпу-закриття тут більше немає — з ним пішли ~50 рядків (`createDragTracker`,
// `finishSwipe`, `centeredRemaining`, `createBackdropFade` і три слухачі `touch*`).
// Це не спрощення заради спрощення: у `core/layers.js` і в `CLAUDE.md` стоїть пряма
// заборона писати власний свайп для повноекранного шару — 02.08 два рухи (наш і
// системний) накладались, і Вова описав це як «дьоргається». Готове рішення вже є.
let _chatModalEl = null;
let _chatViewportHandler = null;
let _chatOpenPostId = null;      // id відкритого питання
let _qaLayer = null;             // запис у core/layers.js (системний жест «назад»)
function onChatEsc(e) { if (e.key === 'Escape') closeChatModal(); }

// ── ОБГОВОРЕННЯ: створення + кімнати «Мої» / «Збережені» (окремий FAB) ─────────

// Легкий bottom-sheet для дій Обговорень — тонка обгортка над спільним примітивом
// core/modal.js (Потік C2). Сигнатура (opts.title/bodyHtml/onMount(sheet,close), повертає
// close) лишена незмінною — 4 виклики нижче не чіпав.
function openDiscSheet(opts) {
  const bodyHtml = `<div class="disc-sheet-title">${escapeHtml(opts.title)}</div>${opts.bodyHtml}`;
  // onMount виконується СИНХРОННО всередині openModalPrimitive(), до завершення
  // деструктуризації нижче — пряме читання `close` тут ловить temporal dead zone.
  // Обгортка-стрілка відкладає читання до реального виклику (завжди пізніше, асинхронно).
  let close;
  ({ close } = openModalPrimitive({
    bodyHtml,
    variant: 'sheet',
    className: 'app-modal--disc',
    onMount: (wrap) => opts.onMount?.(wrap, () => close()),
    onClose: opts.onClose,
  }));
  return close;
}

// Клавіатура на iOS PWA (аркуш «Створити обговорення») — той самий debounce-патерн,
// що й applyKb у openChatModal: слухаємо visualViewport, при відкритій клавіатурі
// стискаємо .app-modal (position:fixed;inset:0) під видиму область, щоб форма
// лишалась над клавіатурою, а не переставала бути видною знизу. Повертає cleanup.
function attachSheetKeyboardFix(wrap, input) {
  const vv = window.visualViewport;
  const fullH = window.innerHeight;
  const applyKb = () => {
    const visH = vv ? vv.height : window.innerHeight;
    const open = visH < fullH - 80;
    if (open) {
      wrap.style.top = (vv ? vv.offsetTop : 0) + 'px';
      wrap.style.height = (vv ? vv.height : window.innerHeight) + 'px';
      wrap.style.bottom = 'auto';
    } else {
      wrap.style.top = '';
      wrap.style.height = '';
      wrap.style.bottom = '';
    }
  };
  let kbTimer = null;
  const handler = () => { clearTimeout(kbTimer); kbTimer = setTimeout(applyKb, 80); };
  window.addEventListener('resize', handler);
  vv?.addEventListener('resize', handler);
  vv?.addEventListener('scroll', handler);
  input?.addEventListener('focus', handler);
  input?.addEventListener('blur', handler);
  return () => {
    clearTimeout(kbTimer);
    window.removeEventListener('resize', handler);
    vv?.removeEventListener('resize', handler);
    vv?.removeEventListener('scroll', handler);
    input?.removeEventListener('focus', handler);
    input?.removeEventListener('blur', handler);
  };
}

// Список питань (Мої / Збережені) — реюз renderQuestionCard; тап відкриває питання
// через наявну делегацію document-рівня ([data-question-open]).
// ⚠️ `.map(renderQuestionCard)` кликати НЕ можна: `map` передає другим аргументом
// індекс, і будь-який майбутній другий параметр картки мовчки став би прапорцем
// (ця пастка вже спрацьовувала у «Стрічці» — `postCardHtml` з `onPage`).
function openDiscussionList(title, posts) {
  const body = posts.length
    ? posts.map(p => renderQuestionCard(p)).join('')
    : '<div class="disc-sheet-empty">Поки порожньо</div>';
  openDiscSheet({ title, bodyHtml: `<div class="disc-sheet-list">${body}</div>` });
}

export function openMyDiscussions() {
  const uid = currentUserId();
  const mine = _getPosts().filter(p => p.type === 'chat' && p.owner_uid && p.owner_uid === uid);
  openDiscussionList('Мої питання', mine);
}

export function openSavedDiscussions() {
  const saved = getSavedIds();
  const list = _getPosts().filter(p => p.type === 'chat' && saved.has(p.id));
  openDiscussionList('Збережені питання', list);
}

// Аркуш створення ПИТАННЯ → submitDiscussion → одразу published (без модерації).
//
// 🔴 11.08 — БУЛО «Створити обговорення» / «Тема обговорення» / «Про що поговоримо?».
// Кожен із цих написів вимагав від людини вигадати ТЕМУ — тобто спершу проявити
// креативність, і тільки потім скористатись функцією. Питання вигадувати не треба:
// воно вже є в голові, з ним людина і прийшла. Це не зміна тону, а зняття бар'єра
// на вході в єдину дію вкладки.
//
// 🛑 Полів свідомо ОДНЕ. Категорія, локація, фото — кожне з них ще один бар'єр, а
// в аудиторії 40-70+ форма на три поля відсіює більше людей, ніж додає користі.
// Подати питання має бути ШВИДШЕ, ніж подати оголошення на Дошці (там полів багато
// — і там це виправдано, бо йдеться про річ і гроші).
export function openDiscussionCompose() {
  const form = `
    <form class="disc-compose" id="disc-compose-form">
      <label class="disc-compose-label" for="disc-compose-topic">Що ви хочете дізнатись?</label>
      <textarea id="disc-compose-topic" class="disc-compose-input" rows="3"
                placeholder="Напишіть питання…" maxlength="300"></textarea>
      <p class="disc-compose-hint">Наприклад: «Коли ремонтуватимуть дорогу в Митильному?»</p>
      <button type="submit" class="disc-compose-submit">Запитати громаду</button>
      <p class="disc-compose-note">Питання побачать жителі громади одразу. Матюки та образи блокуються автоматично.</p>
    </form>`;
  let detachKb = null;
  openDiscSheet({
    title: 'Запитати громаду',
    bodyHtml: form,
    // Автофокус прибрано (клавіатура раніше вилітала одразу, поки аркуш ще не
    // доїхав знизу, і перекривала форму) — клавіатура тепер лише по тапу в поле.
    // detachKb — зсуває аркуш над клавіатурою, коли вона таки відкриється.
    onMount: (sheet, close) => {
      const ta = sheet.querySelector('#disc-compose-topic');
      autoGrowTextarea(ta);   // поле теми росте по тексту (скрол — сам лист)
      detachKb = attachSheetKeyboardFix(sheet, ta);
      sheet.querySelector('#disc-compose-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = (ta?.value || '').trim();
        if (!text) { showToast('Напишіть своє питання', 2500); ta?.focus(); return; }
        if (containsProfanity(text)) { showToast('🚫 Питання містить заборонені слова', 4000, 'error'); return; }
        const btn = sheet.querySelector('.disc-compose-submit');
        if (btn) { btn.disabled = true; btn.textContent = 'Надсилаємо…'; }
        const payload = {
          text,
          author: currentUserName() || 'Житель',
          owner_uid: currentUserId() || null,
          tags: [],
        };
        if (isSupabaseReady()) {
          const res = await submitDiscussion(payload);   // одразу published (без модерації)
          if (!res.ok) {
            if (btn) { btn.disabled = false; btn.textContent = 'Запитати громаду'; }
            showToast('Помилка: ' + (res.error || 'не вдалось'), 4000, 'error');
            return;
          }
        }
        close();
        showToast('Питання опубліковано — чекайте на відповіді', 3500);
        // Перезавантажити стрічку (нове обговорення одразу видно) — через подію,
        // initBoard (board.js) її вже слухає → renderBoard(). Прямий виклик
        // renderBoard() звідси створив би циклічний імпорт board.js↔цей файл.
        window.dispatchEvent(new CustomEvent('cstl-posts-changed'));
      });
    },
    onClose: () => { detachKb?.(); detachKb = null; },
  });
}

// Кнопка «Мене теж цікавить» — та сама реакція, що раніше була ❤️ на картці.
// 🔑 У БАЗІ ЗНАЧЕННЯ ЛИШАЄТЬСЯ `❤️` (`LIKE_EMOJI`) — міняється лише підпис та іконка.
// Якби ми завели новий код емоції, наявні реакції (заміряно 11.08: 9 рядків на
// темах) перестали б рахуватись і для людини це виглядало б як «лайки пропали».
function qaInterestHtml(postId) {
  const on = isLikedByMe(postId);
  const n  = getLikeCount(postId);
  return `
    <button class="qa-interest${on ? ' qa-interest--on' : ''}" type="button"
            data-like-id="${postId}"
            aria-pressed="${on ? 'true' : 'false'}"
            aria-label="${on ? 'Прибрати позначку «мене теж цікавить»' : 'Мене теж цікавить'}">
      ${on ? HEART_FILLED_SVG : HEART_OUTLINE_SVG}
      <span class="qa-interest-label">Мене теж цікавить</span>
      ${n ? `<span class="qa-interest-n">${n}</span>` : ''}
    </button>`;
}

// Шапка екрана питання. 🔑 ПРОЗОРА, зі скляним розмиттям — контент їде ПІД нею.
// Було: суцільна бордова плита на всю ширину. Різниця не декоративна: непрозора
// смуга ЗАБИРАЄ висоту назавжди, скляна — лише накриває, тож питання починається
// одразу під статус-баром і читається як заголовок сторінки, а не як вміст
// коробки. Це та сама відмова від «кольорових плит», що і в списку.
function qaHeadHtml(post) {
  return `
    <header class="qa-head">
      <button class="qa-back" type="button" aria-label="Назад">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>
      </button>
      <span class="qa-head-title">Питання</span>
      ${saveBtnHtml(post)}
    </header>`;
}

// ⚠️ Імена `openChatModal` / `closeChatModal` збережені навмисно: на них зав'язані
// ЧОТИРИ зовнішні точки (`board.js` делегація і deep-link, `core/saved-hub.js`
// `openChatById`, `handleDiscussionsAuthChange`). Перейменування дало б широкий diff
// без жодної користі для людини — а користь має бути в тому, що вона бачить.
export function openChatModal(post) {
  if (_chatModalEl) return;
  _chatOpenPostId = post.id;

  const screen = document.createElement('div');
  screen.className = 'qa-screen';
  const n = activeComments(post.id).length;
  screen.innerHTML = `
    ${qaHeadHtml(post)}

    <div class="qa-body">
      <section class="qa-question">
        <h1 class="qa-question-text">${escapeHtml(post.text)}</h1>
        <div class="qa-question-by">
          ${authorAvatar(post.author, post.owner_uid)}
          <span class="qa-question-name"${nameUid(post.owner_uid)}>${liveName(post.author, post.owner_uid)}</span>
          <span class="qa-card-dot" aria-hidden="true">·</span>
          <span class="qa-question-when">${formatTime(postTime(post))}</span>
        </div>
        ${qaInterestHtml(post.id)}
      </section>

      <h2 class="qa-answers-title" id="qa-answers-count">${n ? `${n} ${answerWord(n)}` : 'Відповіді'}</h2>
      ${answersHtml(post)}
    </div>

    <div class="pm-composebar qa-composebar" id="bd-compose" hidden>
      <span class="pm-composebar-ic" id="bd-compose-ic">${ACT_ICONS.reply}</span>
      <div class="pm-composebar-body">
        <span class="pm-composebar-title" id="bd-compose-title"></span>
        <span class="pm-composebar-text" id="bd-compose-text"></span>
      </div>
      <button class="pm-composebar-x" type="button" id="bd-compose-x" aria-label="Скасувати">✕</button>
    </div>

    ${isLoggedIn() ? `
    <form class="qa-form" data-comment-form="${post.id}">
      <input class="qa-input" type="text" placeholder="Ваша відповідь…"
             aria-label="Ваша відповідь" data-comment-input="${post.id}">
      <button class="qa-send" type="submit">Надіслати</button>
    </form>` : `
    <button class="qa-login-cta" type="button" id="bd-chat-login">Увійдіть, щоб відповісти</button>`}
  `;

  document.body.appendChild(screen);
  document.body.classList.add('modal-open');
  _chatModalEl = screen;
  hydrateAvatars(screen);   // чужі фото профілю
  hydrateNames(screen);     // живі імена за uid

  requestAnimationFrame(() => screen.classList.add('visible'));

  // 🔴 Закриття — через core/layers.js. Запис в історії робить системний жест
  // «назад від лівого краю» рідним способом закрити екран; кнопка ← іде ТИМ САМИМ
  // шляхом (`closeLayer`), інакше в історії лишився б порожній запис і наступний
  // жест зʼїв би його вхолосту.
  _qaLayer = openLayer(() => finishCloseQuestion(), {
    animateOut: (done) => { screen.classList.remove('visible'); setTimeout(done, 220); },
  });
  screen.querySelector('.qa-back')?.addEventListener('click', () => closeLayer(_qaLayer, { animate: true }));
  screen.querySelector('#bd-chat-login')?.addEventListener('click',
    () => requireAuth('відповідати на питання', () => {}));
  document.addEventListener('keydown', onChatEsc);

  // Кнопка надсилання не має забирати фокус з поля (інакше iOS ховає клавіатуру)
  screen.querySelector('.qa-send')?.addEventListener('pointerdown', e => e.preventDefault());

  // Дії над відповіддю — ЯВНІ КНОПКИ, а не жести. Було: свайп-вліво = відповісти,
  // довге натискання = меню (`setupBubbleGestures`). Приховані жести — мова
  // месенджера, і для аудиторії 60+ вони означають «функції немає»: про них ніде
  // не написано. Тепер «Відповісти» видно текстом, решта — під «⋯».
  _discReplyTo = null; _discEditing = null;
  const bodyEl = screen.querySelector('.qa-body');
  bodyEl?.addEventListener('click', (e) => {
    const r = e.target.closest('[data-answer-reply]');
    if (r) { const c = findDiscComment(r.dataset.answerReply); if (c) startDiscReply(c); return; }
    const m = e.target.closest('[data-answer-menu]');
    if (m) { const c = findDiscComment(m.dataset.answerMenu); if (c) openDiscActions(c); }
  });
  screen.querySelector('#bd-compose-x')?.addEventListener('click', () => {
    const input = screen.querySelector('[data-comment-input]');
    if (_discEditing && input) input.value = '';   // скасування редагування — чистимо поле
    clearDiscCompose();
  });

  // Клавіатура на iOS PWA шле зливу подій під час анімації — щоб екран НЕ смикався,
  // збираємо їх через debounce (один виклик після паузи). Патерн ПЕРЕНЕСЕНО без
  // змін із модалки: він відпрацьований, і переписувати його «заодно» означало б
  // тягнути ризик у крок, який про інше.
  // 🛑 `core/keyboard.js` тут НЕ задіяний і не змінюється — це зона підвищеної
  // обережності (HOT_RULES №9), у ній два фікси вже провалились поспіль.
  const vv = window.visualViewport;
  const input = screen.querySelector('.qa-input');
  const fullH = window.innerHeight;
  const applyKb = () => {
    const visH = vv ? vv.height : window.innerHeight;
    const open = visH < fullH - 80;
    if (open) {
      screen.classList.add('qa-screen--kb');
      screen.style.top = (vv ? vv.offsetTop : 0) + 'px';
      screen.style.height = ((vv ? vv.height : window.innerHeight) - 4) + 'px';
      screen.style.bottom = 'auto';
    } else {
      screen.classList.remove('qa-screen--kb');
      screen.style.top = '';
      screen.style.height = '';
      screen.style.bottom = '';
    }
  };
  let kbTimer = null;
  _chatViewportHandler = () => { clearTimeout(kbTimer); kbTimer = setTimeout(applyKb, 80); };
  window.addEventListener('resize', _chatViewportHandler);
  vv?.addEventListener('resize', _chatViewportHandler);
  vv?.addEventListener('scroll', _chatViewportHandler);
  input?.addEventListener('focus', _chatViewportHandler);
  input?.addEventListener('blur',  _chatViewportHandler);
}

// Закриття «з інтерфейсу» — завжди через шар, щоб історія і екран не розʼїхались.
export function closeChatModal() {
  if (!_chatModalEl) return;
  if (_qaLayer) closeLayer(_qaLayer, { animate: true });
  else finishCloseQuestion();
}

// Власне прибирання екрана. Кличе ЛИШЕ core/layers.js (або closeChatModal, коли
// шару чомусь немає) — тому весь демонтаж зібраний в одному місці.
function finishCloseQuestion() {
  const screen = _chatModalEl;
  if (!screen) return;
  if (_chatOpenPostId != null) {
    // Межа «прочитано» лишається — на ній тримається крапка «є нове» в таб-барі
    // (`unseenDiscussionsCount`). Роздільник «Нові повідомлення» в самому екрані
    // знято як чат-механіку, але сам факт «я тут був» потрібен далі.
    setChatSeen(_chatOpenPostId, Date.now());
    window.dispatchEvent(new CustomEvent('cstl-disc-seen'));
  }
  _chatOpenPostId = null;
  _chatModalEl = null;
  _qaLayer = null;
  clearDiscCompose();
  screen.classList.remove('visible');
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onChatEsc);
  if (_chatViewportHandler) {
    window.removeEventListener('resize', _chatViewportHandler);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', _chatViewportHandler);
      window.visualViewport.removeEventListener('scroll', _chatViewportHandler);
    }
    _chatViewportHandler = null;
  }
  setTimeout(() => screen.remove(), 240);
}

// Оновити картку питання у списку (кількість відповідей + час останньої).
// ⚠️ Селектор тримається за `[data-question-open]`, а не за клас: клас — це вигляд,
// атрибут — це роль. Стенд `board-cream.mjs` уже падав від того, що тримався за
// імʼя файлу, а не за поведінку.
function refreshChatCardPreview(postId) {
  const card = document.querySelector(`[data-question-open="${postId}"]`);
  if (!card) return;
  const post = _getPosts().find(p => p.id === postId);
  if (post) card.outerHTML = renderQuestionCard(post);
}

// ── Перемальовування списку відповідей + reply/edit/delete ───────────────────
// `scroll` — прокрутити до щойно доданої відповіді. Ставимо ЛИШЕ на власну дію:
// при чужій (realtime) смикати екран не можна, людина в цей момент читає.
function rerenderCommentsBlock(postId, { scroll = false } = {}) {
  const wrap = document.querySelector(`[data-comments-for="${postId}"]`);
  if (!wrap) return;
  const post = _getPosts().find(p => p.id === postId);
  if (!post) return;
  wrap.outerHTML = answersHtml(post);
  const fresh = document.querySelector(`[data-comments-for="${postId}"]`);
  hydrateAvatars(fresh);   // Потік 12 Б
  hydrateNames(fresh);     // синк живих імен
  updateChatHeaderCount(postId);
  refreshChatCardPreview(postId);
  if (scroll) scrollToMyAnswer();
}

let _discReplyTo = null;   // коментар на який відповідаємо
let _discEditing = null;   // коментар який редагуємо

function findDiscComment(id) {
  return (getComments(_chatOpenPostId) || []).find(c => String(c.id) === String(id)) || null;
}
function showDiscCompose(title, text, mode) {
  const bar = document.getElementById('bd-compose'); if (!bar) return;
  const ic = document.getElementById('bd-compose-ic'); if (ic) ic.innerHTML = mode === 'edit' ? ACT_ICONS.edit : ACT_ICONS.reply;
  const t  = document.getElementById('bd-compose-title'); if (t) t.textContent = title;
  const x  = document.getElementById('bd-compose-text');  if (x) x.textContent = (text || '').slice(0, 90);
  bar.hidden = false;
  _chatModalEl?.querySelector('[data-comment-input]')?.focus();
}
function clearDiscCompose() {
  _discReplyTo = null; _discEditing = null;
  const bar = document.getElementById('bd-compose'); if (bar) bar.hidden = true;
}
function startDiscReply(c) {
  _discEditing = null; _discReplyTo = c;
  showDiscCompose('ВІДПОВІДЬ:', c.text || '', 'reply');
}
function startDiscEdit(c) {
  _discReplyTo = null; _discEditing = c;
  showDiscCompose('РЕДАГУВАННЯ:', c.text || '', 'edit');
  const input = _chatModalEl?.querySelector('[data-comment-input]');
  if (input) { input.value = c.text || ''; input.focus(); }
}
function openDiscActions(c) {
  if (c.deleted_at) return;
  const mine = isMyComment(c);
  const sheet = document.createElement('div');
  sheet.className = 'pm-actions-back';
  sheet.innerHTML = `
    <div class="pm-actions">
      <button type="button" data-act="reply"><span class="pm-act-ic">${ACT_ICONS.reply}</span>Відповісти</button>
      ${c.text ? `<button type="button" data-act="copy"><span class="pm-act-ic">${ACT_ICONS.copy}</span>Копіювати</button>` : ''}
      ${mine && c.text ? `<button type="button" data-act="edit"><span class="pm-act-ic">${ACT_ICONS.edit}</span>Редагувати</button>` : ''}
      ${mine ? `<button type="button" data-act="delete" class="pm-actions-danger"><span class="pm-act-ic">${ACT_ICONS.delete}</span>Видалити</button>` : ''}
      <button type="button" data-act="cancel" class="pm-actions-cancel">Скасувати</button>
    </div>`;
  const close = () => sheet.remove();
  sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) { if (e.target === sheet) close(); return; }
    close();
    const act = b.dataset.act;
    if (act === 'reply') startDiscReply(c);
    else if (act === 'copy') { try { await navigator.clipboard.writeText(c.text || ''); showToast('Скопійовано'); } catch (_) {} }
    else if (act === 'edit') startDiscEdit(c);
    else if (act === 'delete') doDiscDelete(c);
  });
  (_chatModalEl || document.body).appendChild(sheet);
}
async function doDiscDelete(c) {
  const postId = c.post_id;
  const list = commentsByPost.get(postId) || [];
  const idx = list.findIndex(x => x.id === c.id);
  const prev = idx >= 0 ? list[idx] : null;
  if (idx >= 0) {
    list[idx] = { ...list[idx], deleted_at: new Date().toISOString(), text: '' };
    commentsByPost.set(postId, list);
    rerenderCommentsBlock(postId);
  }
  const res = await deleteComment(c.id);
  if (!res.ok) {
    const l = commentsByPost.get(postId) || [];
    const i = l.findIndex(x => x.id === c.id);
    if (i >= 0 && prev) { l[i] = prev; commentsByPost.set(postId, l); rerenderCommentsBlock(postId); }
    showToast('❌ Не вдалося видалити: ' + (res.error || ''), 4000, 'error');
  }
}

// ── Скільки обговорень мають НОВЕ для мене (для крапки в таб-барі, 30.07) ─────
// Вова: «легеньку позначку біля іконки вкладки… бо важко замітити що тобі писали».
//
// Рахуємо ЛОКАЛЬНО і без мережі: коментарі всіх тем уже завантажені
// (`setDiscussionsData` ← `fetchAllComments`), а межа «останній перегляд» лежить у
// `localStorage` (`getChatSeen`) — той самий механізм, що малює роздільник
// «Нові повідомлення» в самій темі. Другого джерела правди не заводимо.
//
// ⚠️ ЧАС НОРМАЛІЗУЄМО ЯВНО. Коментарі приходять із `created_at` як ISO-РЯДОК
// (`fetchAllComments` у supabase.js), а `getChatSeen` віддає ЧИСЛО (мс). Пряме
// `рядок > число` у JS дає `Number(ISO)` = NaN, тобто ЗАВЖДИ false — перевірено:
//   '2026-07-30T07:00:00.000Z' > Date.now()  →  false
// 🔴 І це ж порівняння без нормалізації стоїть у `chatMessagesHtml` (рядок ~211,
// `t > dividerTs`) — тобто роздільник «Нові повідомлення» там, найпевніше, не
// зʼявляється НІКОЛИ. Я це НЕ чіпаю (HOT_RULES №9 — не лізти в те, про що не
// просили), але кажу прямо: це окремий баг, чекає слова Вови.
//
// Своє повідомлення новим не рахуємо — інакше крапка горіла б від власного тексту.
export function unseenDiscussionsCount() {
  const posts = (_getPosts?.() || []).filter(p => p && p.type === 'chat');
  let n = 0;
  for (const p of posts) {
    const seen = getChatSeen(p.id);
    if (!seen) continue;   // ніколи не відкривав — не кричимо «нове» про всю історію
    const fresh = activeComments(p.id).some(c => !isMyComment(c) && tsMs(postTime(c)) > seen);
    if (fresh) n++;
  }
  return n;
}

// ── Картка ПИТАННЯ ───────────────────────────────────────────────────────────
//
// 🔴 11.08 — ПЕРЕПИСАНО З «КАРТКИ ТЕМИ ЧАТУ» НА «КАРТКУ ПИТАННЯ» (замовлення Вови).
//
// Що було і чому пішло. Стара картка показувала: тему · `💬 N повідомлень` ·
// `👥 N учасників` · **два останні повідомлення з іменами й часом** · ❤️ · автора.
// Рядок із двома останніми повідомленнями — це розмітка списку чатів
// (Viber/Telegram), і саме він, а не колір, казав людині «тут месенджер». Разом із
// ним пішов лічильник учасників: «скільки людей у розмові» — метрика чату; у Q&A
// людина вирішує «відкривати чи ні» за іншим набором.
//
// Що лишилось — рівно те, що потрібно для цього рішення:
//   ЩО ЗАПИТАЛИ (домінує) · ХТО і КОЛИ · ЧИ Є ВІДПОВІДІ · КОЛИ ОСТАННЯ.
//
// 🔑 Стан «без відповіді» — це НЕ порожній лічильник, а ЗАКЛИК. Єдиний спосіб
// оживити Q&A у громаді на 11 профілів — показати тому, хто знає відповідь, де
// він потрібен. Тому замість «💬 0 відповідей» (тиха нуль-метрика) стоїть
// «Ще ніхто не відповів» і картка отримує власну позначку `qa-card--unanswered`.
//
// ⚠️ ❤️ з КАРТКИ прибрано свідомо: у списку воно додавало шум і чат-семантику.
// Сама реакція не зникла — вона переїхала ВСЕРЕДИНУ питання як «Мене теж цікавить»
// (див. `openQuestionScreen`), і в базі лишається тим самим рядком з `❤️`, тож
// наявні реакції не пропали.
// 🔴 11.08, ДРУГА РЕДАКЦІЯ. Перша була відхилена Вовою («фейсбук 2006»), і прилад
// `tests/tools/qa-audit.mjs` показав, чому саме: 67 ліній у першому екрані і 8
// кольорів тексту. Картка вносила в це три борги: власну рамку, ВНУТРІШНЮ
// роздільну лінію під метаданими і бордовий колір на лічильнику відповідей.
//
// Що змінилось і чому:
//   • метадані звелись в ОДИН рядок «Олена · 2 год · 2 відповіді» — роздільна
//     лінія була потрібна лише тому, що рядків було два;
//   • лічильник відповідей більше НЕ бордовий: акцентний колір належить ДІЯМ,
//     а «скільки відповідей» — це метадані. Бордовим лишився тільки стан
//     «Ще ніхто не відповів», бо це заклик, тобто заклик до дії;
//   • закладка переїхала праворуч від питання: у рядку метаданих вона робила
//     цей рядок клікабельним на всю ширину і плутала ціль тапу.
export function renderQuestionCard(p) {
  const відповіді = activeComments(p.id);
  const n = відповіді.length;   // видалені не рахуємо

  // 🔑 ПЕРША ВІДПОВІДЬ ПРЯМО В СПИСКУ — головна зміна редакції 3.
  // Питання в цій громаді практичні: «чи працює амбулаторія», «коли концерт».
  // На них є коротка конкретна відповідь, і людині потрібна САМЕ ВОНА, а не
  // подорож у другий екран. Один рядок цитати відповідає на питання ще у списку.
  // ⚠️ Це НЕ повернення прев'ю чату, від якого пішли: там було ДВА останні
  // повідомлення з іменами й часом (розмітка списку розмов), тут — ОДНА перша
  // відповідь по суті. Різниця в тому, що показує рядок: хід розмови проти
  // відповіді на питання.
  // 🔑 Саме ПЕРША, а не остання: у Q&A перша відповідь майже завжди і є
  // відповіддю, а остання — це хвіст уточнень.
  // ⚠️ РЕДАКЦІЯ 4 — ЦИТАТА БЕЗ СІРОЇ ПІДКЛАДКИ, ОДИН РЯДОК.
  // У редакції 3 відповідь лежала в сірому прямокутнику, і це виявилось головним
  // джерелом «зливається»: підкладка мала контраст до білого **1.16**, а лінія
  // між питаннями — **1.24**. Тобто два РІЗНИХ за сенсом елементи (межа між
  // питаннями і блок відповіді) читались однаковим тоном, і око бачило суцільну
  // сіру масу замість структури. Тепер відповідь — просто тихий текст в один
  // рядок: вона додає користі й не створює «картку всередині картки».
  const перша = відповіді[0];
  const цитата = перша
    ? `<p class="qa-row-answer"><span class="qa-row-answer-who"${nameUid(перша.sender_uid)}>${liveName(перша.author || 'Житель', перша.sender_uid)}:</span> ${escapeHtml(перша.text)}</p>`
    : '';

  // 🔑 МЕТАДАНІ У ДВА РЯДКИ, а не в один. «Володимир · 8 липня · потрібна
  // відповідь» одним рядком змішує дві різні речі: ХТО і КОЛИ (довідка) та СТАН
  // питання (заклик). Розділені, вони читаються миттєво — особливо в 60+.
  const мітка = n
    ? `<p class="qa-row-n">${n} ${answerWord(n)}</p>`
    : '<p class="qa-row-n qa-row-n--none">Потрібна відповідь</p>';

  return `
    <article class="qa-row${n ? '' : ' qa-row--unanswered'}"
             data-post-id="${p.id}" data-question-open="${p.id}">
      <div class="qa-row-body">
        <h3 class="qa-card-q">${escapeHtml(p.text)}</h3>
        <p class="qa-card-meta">
          <span class="qa-card-name"${nameUid(p.owner_uid)}>${liveName(p.author, p.owner_uid)}</span>
          <span class="qa-card-dot" aria-hidden="true">·</span>
          <span class="qa-card-when">${formatTime(postTime(p))}</span>
        </p>
        ${мітка}
        ${цитата}
      </div>
      <span class="qa-row-go" aria-hidden="true">${CHEVRON_SVG}</span>
    </article>
  `;
}

// ── «Мене теж цікавить» (клік з document-делегації board.js) ─────────────────
// Тогл через наявний дата-шар reactions, optimistic + відкат.
// 🔑 У БАЗІ ЛИШАЄТЬСЯ ТА САМА ЕМОЦІЯ `❤️` — змінився лише СЕНС у поводженні з нею:
// лайк теми («мені подобається») перетворився на сигнал попиту («я теж хочу знати»),
// що для питання єдине осмислене: лайкати чуже незнання нема чого. Новий код емоції
// знецінив би 9 наявних реакцій, і для людини це виглядало б як «усе пропало».
export function handleLikeClick(likeBtn) {
  const id = Number(likeBtn.dataset.likeId);
  requireAuth('позначити питання', async () => {
    const uid = currentUserId();
    const wasLiked = isLikedByMe(id);
    const entry = reactionsByPost.get(id) || { counts: {}, my: null };
    entry.counts[LIKE_EMOJI] = Math.max(0, (entry.counts[LIKE_EMOJI] || 0) + (wasLiked ? -1 : 1));
    entry.my = wasLiked ? null : LIKE_EMOJI;
    reactionsByPost.set(id, entry);
    likeBtn.innerHTML = likeBtnInner(id);
    likeBtn.classList.toggle('qa-interest--on', !wasLiked);
    likeBtn.setAttribute('aria-pressed', wasLiked ? 'false' : 'true');
    likeBtn.setAttribute('aria-label', wasLiked ? 'Мене теж цікавить' : 'Прибрати позначку «мене теж цікавить»');
    const res = await setReaction(id, uid, wasLiked ? null : LIKE_EMOJI);
    if (!res.ok) {
      // Відкат при помилці мережі/RLS
      entry.counts[LIKE_EMOJI] = Math.max(0, (entry.counts[LIKE_EMOJI] || 0) + (wasLiked ? 1 : -1));
      entry.my = wasLiked ? LIKE_EMOJI : null;
      reactionsByPost.set(id, entry);
      likeBtn.innerHTML = likeBtnInner(id);
      likeBtn.classList.toggle('qa-interest--on', wasLiked);
      likeBtn.setAttribute('aria-pressed', wasLiked ? 'true' : 'false');
      likeBtn.setAttribute('aria-label', wasLiked ? 'Прибрати позначку «мене теж цікавить»' : 'Мене теж цікавить');
      showToast('Не вдалося зберегти позначку', 2500, 'error');
    }
  });
}

// ── Document-level listener надсилання коментаря ─────────────────────────────
// Один раз при initBoard (board.js викликає attachDiscussionsDelegation).
// Форми [data-comment-form] існують лише в модалці чату обговорення.

let _delegationAttached = false;
export function attachDiscussionsDelegation() {
  if (_delegationAttached) return;
  _delegationAttached = true;

  // Submit inline-форми коментаря:
  // 1. Миттєво додаємо у in-memory map і ререндеримо (optimistic)
  // 2. Паралельно POST у Supabase
  // 3. Якщо помилка — повертаємо назад
  document.addEventListener('submit', async e => {
    const form = e.target.closest('[data-comment-form]');
    if (!form) return;
    e.preventDefault();
    e.stopPropagation();
    const postId = Number(form.dataset.commentForm);
    const input  = form.querySelector('[data-comment-input]');
    const text   = (input?.value || '').trim();
    if (!text) { input?.focus(); return; }

    // Гейтинг (Етап 2): коментувати можуть лише залогінені жителі.
    if (!isLoggedIn()) { requireAuth('залишити коментар', () => {}); return; }

    // Фільтр матюків / спаму / флуду — блокуємо ДО відправки
    if (containsProfanity(text)) { showToast('🚫 Повідомлення містить заборонені слова і не надіслане', 4500, 'error'); return; }
    if (looksLikeSpam(text))     { showToast('🚫 Повідомлення схоже на спам і не надіслане', 4000, 'error'); return; }
    if (isDuplicateMsg(text, RATE_SCOPE)) { showToast('Ви щойно це написали', 3000); return; }
    if (isFlooding())                     { showToast('Занадто швидко — зачекайте кілька секунд', 3500); return; }
    recordSentMsg(text, RATE_SCOPE);

    // П7 — режим РЕДАГУВАННЯ: міняємо існуючий коментар (оптимістично + відкат)
    if (_discEditing && _discEditing.post_id === postId) {
      const target = _discEditing;
      const l0 = commentsByPost.get(postId) || [];
      const i0 = l0.findIndex(c => c.id === target.id);
      const prev0 = i0 >= 0 ? l0[i0] : null;
      if (i0 >= 0) { l0[i0] = { ...l0[i0], text, edited_at: new Date().toISOString() }; commentsByPost.set(postId, l0); }
      if (input) input.value = '';
      clearDiscCompose();
      rerenderCommentsBlock(postId);
      const res = await editComment(target.id, text);
      if (!res.ok) {
        const l = commentsByPost.get(postId) || []; const i = l.findIndex(c => c.id === target.id);
        if (i >= 0 && prev0) { l[i] = prev0; commentsByPost.set(postId, l); rerenderCommentsBlock(postId); }
        showToast('❌ Не вдалося змінити: ' + (res.error || ''), 4000, 'error');
      } else if (res.comment) {
        const l = commentsByPost.get(postId) || []; const i = l.findIndex(c => c.id === target.id);
        if (i >= 0) { l[i] = res.comment; commentsByPost.set(postId, l); rerenderCommentsBlock(postId); }
      }
      return;
    }

    // Відповідь (П7): на яке повідомлення відповідаємо (якщо активний reply-режим)
    const replyId = (_discReplyTo && _discReplyTo.post_id === postId) ? _discReplyTo.id : null;

    // Optimistic: миттєво у DOM
    const myName = currentUserName();
    const tempComment = {
      id: 'temp-' + Date.now(),
      post_id: postId,
      author: myName,
      text,
      created_at: new Date().toISOString(),
      sender_uid: currentUserId(),   // → isMyComment() підсвітить як мій одразу
      reply_to_id: replyId,
    };
    const list = commentsByPost.get(postId) || [];
    list.push(tempComment);
    commentsByPost.set(postId, list);
    if (input) input.value = '';
    clearDiscCompose();
    // `scroll: true` — це ВЛАСНА дія: людина щойно відповіла і має побачити свою
    // відповідь. На чужі (realtime) прокрутка не ставиться, див. onCommentRealtimeEvent.
    rerenderCommentsBlock(postId, { scroll: true });
    input?.focus();   // лишаємо фокус → клавіатура не ховається після надсилання

    // POST у Supabase
    if (isSupabaseReady()) {
      // clientTag — клієнтський ключ (uuid), який дає базі впізнати ЦЕЙ коментар.
      // Без нього повтор при обриві зв'язку заборонений: не було б чим відрізнити
      // «не доїхало» від «доїхало, а відповідь загубилась» → міг з'явитись дубль.
      const tag = (crypto.randomUUID && crypto.randomUUID()) || String(Date.now()) + Math.random().toString(36).slice(2);
      const result = await addComment(postId, myName, text, currentUserId(), { replyToId: replyId, clientTag: tag });
      if (!result.ok) {
        // Помилка — забираємо optimistic коментар
        const filtered = (commentsByPost.get(postId) || []).filter(c => c.id !== tempComment.id);
        commentsByPost.set(postId, filtered);
        rerenderCommentsBlock(postId);
        showToast(result.error || 'Не вдалося надіслати — спробуй ще раз', 4000, 'error');
      } else if (result.comment) {
        // Заміняємо temp-коментар на справжній (з реальним id з БД)
        const updated = (commentsByPost.get(postId) || []).map(c =>
          c.id === tempComment.id ? result.comment : c
        );
        commentsByPost.set(postId, updated);
        rerenderCommentsBlock(postId);
      }
    }
  });
}

// ── Realtime — підписки чіпляємо ОДИН раз при initBoard (board.js викликає). ──
// При подіях БД перерахуємо in-memory map і точково перерендеримо DOM-елементи.

// Чужа відповідь прийшла наживо. 🔑 У Q&A вона просто зʼявляється на своєму місці —
// БЕЗ автоскролу і без пігулки «↓ N нових». Обидві механіки були правильні для чату
// (там низ = «зараз») і шкідливі тут: людина читає згори, і смикати її вниз означало б
// забрати місце в тексті. Позицію тримає якір прокрутки.
function onCommentRealtimeEvent(payload) {
  const postId = (payload.new || payload.old || {}).post_id;
  if (!postId) return;
  fetchAllComments().then(fresh => {
    commentsByPost = fresh;
    const body = document.querySelector('.qa-body');
    if (body && document.querySelector(`[data-comments-for="${postId}"]`)) {
      keepScroll(body, () => rerenderCommentsBlock(postId), null, 'data-msg');
    } else {
      refreshChatCardPreview(postId);
    }
  });
}

// Лайки Обговорень — той самий рефетч-і-перемалюй підхід, що й коментарі.
function onReactionRealtimeEvent(payload) {
  const postId = (payload.new || payload.old || {}).post_id;
  if (!postId) return;
  const uid = currentUserId();
  fetchAllReactions(uid || getAnonId()).then(fresh => {
    reactionsByPost = fresh;
    refreshChatCardPreview(postId);
  });
}

let _realtimeAttached = false;
export function attachDiscussionsRealtime() {
  if (_realtimeAttached || !isSupabaseReady()) return;
  _realtimeAttached = true;
  subscribeComments((payload) => {
    onCommentRealtimeEvent(payload);
    // 30.07: живий вхідний коментар → перемалювати крапку вкладки (та сама подія).
    window.dispatchEvent(new CustomEvent('cstl-disc-seen'));
  });
  subscribeReactions(onReactionRealtimeEvent);
}

// ── Вхід/вихід з акаунта (виклик з onAuthChange у initBoard) ─────────────────
// Відкрита модалка чату рендерить низ (форма/кнопка входу) один раз при відкритті.
// Гість натиснув «Увійдіть, щоб писати» → увійшов → перезбираємо модалку,
// щоб зʼявилось поле вводу (інакше кнопка-глухий кут лишалась назавжди).
export function handleDiscussionsAuthChange() {
  if (_chatOpenPostId != null) {
    const post = _getPosts().find(p => p.id === _chatOpenPostId);
    closeChatModal();
    if (post) openChatModal(post);
  }
}
