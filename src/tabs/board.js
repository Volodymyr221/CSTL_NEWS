// src/tabs/board.js
// Вкладка «Дошка громади 2.0» — спільний рендер-конвеєр (шапка/фільтри/FAB/
// список) + все про ОГОЛОШЕННЯ (стікери, зум-модалка, лайтбокс).
//
// Типи постів:
//   board = оголошення (продам/куплю/...) — стікер на корку (цей файл)
//   chat  = обговорення — двигун винесено у board-discussions.js (Потік 10, Д-5);
//           звідти імпортуються картка/модалка/FAB-дії/realtime. Зворотних
//           імпортів НЕМА (дані передаються через initDiscussionsEngine /
//           setDiscussionsData / подію 'cstl-posts-changed').
// Спільне обох типів (закладки, кнопки зберегти/шер) — core/board-shared.js.

import { escapeHtml, formatTime, sharePost, postTime, showToast, formatPrice } from '../core/utils.js';
import { openBoardModal } from './community-modal.js';
// Таксономія категорій (колір/іконка/назва) — спільний модуль. CATS — список
// конкретних категорій для меню фільтра; ALL_ICON — іконка «Всі» (лійка).
import { catColor, catIcon, catShort, BOARD_CATEGORIES as CATS, ALL_ICON } from '../core/board-categories.js';
import { startChatFromPost, openMyAds, openThreadsList, openSavedAds, refreshUnreadBadge } from './board-chat.js';
import { requireAuth, isLoggedIn, currentUserId, onAuthChange } from '../core/auth.js';
import {
  fetchPublishedPosts, fetchPublishedAnnouncements, isSupabaseReady, subscribePosts,
  fetchAllComments,
  fetchAllReactions, getAnonId,
  fetchSavedPostIds, hydrateNames, nameUid, liveName,
} from '../core/supabase.js';
import { SETTLEMENTS, COMMUNITY_ALL, COMMUNITY_ALL_LABEL } from '../core/settlements.js';
import { createDragTracker, finishSwipe, centeredRemaining, createBackdropFade } from '../core/sheet-motion.js'; // нативне завершення свайп-закриття
import { ICONS } from '../core/icons.js';
// Той самий якір прокрутки, що й у «Стрічці» — щоб оновлення списку не смикало екран.
import { keepScroll } from '../core/list-patch.js';
import {
  BOOKMARK_OUTLINE_SVG, BOOKMARK_FILLED_SVG,
  getSavedIds, setSavedIds, isSaved, toggleSaved, saveBtnHtml, shareBtnHtml,
} from '../core/board-shared.js';
import {
  initDiscussionsEngine, setDiscussionsData, renderChatCard, openChatModal,
  openDiscussionCompose, openMyDiscussions, openSavedDiscussions,
  handleLikeClick, attachDiscussionsDelegation, attachDiscussionsRealtime,
  handleDiscussionsAuthChange,
} from './board-discussions.js';

// Д-10/Д-12: локація вважається «загальногромадською» (видима скрізь) якщо
// порожня/null або дорівнює COMMUNITY_ALL. Конкретний НП — лише свій фільтр.
function isCommunityWide(loc) {
  return !loc || loc === COMMUNITY_ALL;
}

// Українська відміна слова «оголошення» для лічильника (Д-11).
function pluralAds(n) {
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return 'оголошення';
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'оголошення';
  return 'оголошень';
}

// ── Конфігурація ─────────────────────────────────────────────────────────────

// SVG-іконки для дій у картках і кнопках. Закладка/шер — з board-shared.js
// (спільні з картками обговорень); іконки обговорень — у board-discussions.js.
const PHONE_ICON_SVG = ICONS.phone; // дедуп — раніше локальна копія, ідентична community-blocks.js CONTACT_ICONS.default
const MSG_ICON_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
// Пін локації (векторний, у стилі інших іконок додатку) — для фільтра НП.
const PIN_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
// Д-19: показ локації на картці/зум-модалці. null/порожньо (старі пости — будуть
// видалені) → нічого; COMMUNITY_ALL → «Олицька громада» (COMMUNITY_ALL_LABEL);
// конкретний НП → його назву. Guard прибрано ЛИШЕ для показу — фільтр не чіпаємо.
function renderLoc(loc, extraClass = '') {
  if (!loc) return '';
  const label = loc === COMMUNITY_ALL ? COMMUNITY_ALL_LABEL : loc;
  // ⚠️ Назва загорнута у ВЛАСНИЙ span, а не лежить голим текстом: інакше довгу назву
  // не обрізати трикрапкою — у flex-контейнері голий текст стає анонімним елементом,
  // до якого `text-overflow` не застосовується.
  return `<span class="cm-board-loc${extraClass ? ' ' + extraClass : ''}">${PIN_ICON_SVG}<span class="cm-board-loc-t">${escapeHtml(label)}</span></span>`;
}
// Контакт оголошення: телефон розпізнаємо ОДНИМ правилом на весь модуль (картка,
// модалка, майбутні місця) — щоб копії не розійшлись, як колись розійшлись два
// списки антиспаму.
function phoneOf(p) {
  const contact = p && p.contact ? String(p.contact).trim() : '';
  const isPhone = contact && /^[\+\d][\d\s\-\(\)]{5,}$/.test(contact);
  return isPhone ? contact.replace(/[^\d+]/g, '') : '';
}

// Ціна оголошення (потік 2 Дошки, 28.07). Сам формат — у `core/utils.js`
// (`formatPrice`), спільний із прев'ю форми подачі. Тут лише розмітка Дошки.
// Порожньо → рядка НЕМА зовсім: для «віддам»/«шукаю»/«загубилось» ціна безглузда,
// а порожній слот у сітці лишати не можна (рішення Вови).
// ❌ РІШЕННЯ ВОВИ 28.07 — для категорії «Віддам» рядок «Безкоштовно» НЕ дописуємо.
// Дослівно: «Не треба, буде дублювати». Пігулка категорії вгорі картки вже каже
// «Віддам», тобто другий напис говорив би про те саме іншими словами.
// ⚠️ Не «плутати з недоглядом»: у самій RPC є коментар «показ "Безкоштовно" — справа
// клієнта», тож спокуса дописати сюди гілку по категорії виникне знову. Не дописувати.
// «Безкоштовно» лишається лише там, де людина СВІДОМО поставила ціну 0 у категорії,
// де ціна взагалі буває (Продам / Послуги / Куплю) — там це справжня інформація.
function renderPrice(p) {
  const t = p ? formatPrice(p.price, p.currency, p.price_negotiable) : '';
  if (!t) return '';
  // «Договірна»/«Безкоштовно» — це слова, а не сума: трохи менші, щоб не важили як цифра.
  const isWord = !/\d/.test(t);
  return `<div class="cm-board-price${isWord ? ' cm-board-price--word' : ''}">${escapeHtml(t)}</div>`;
}

// Футер картки/зум-модалки (рішення Вови): БЕЗ номера телефону (персональні дані +
// дублює кнопку дзвінка). Ім'я+час справа.
// 🆕 28.07 (потік 2): кнопки 📞/💬 з КАРТКИ прибрано — вони були 34px (менше за
// мінімум Apple HIG 44px), конкурували з тапом «відкрити оголошення» і робили картки
// нерівними (де є телефон — дві кнопки, де нема — одна). Контакт тепер живе в модалці
// однією широкою кнопкою (renderContactBar). Прапорець `actions` лишає стару поведінку
// доступною, якщо колись знадобиться.
// 🆕 28.07 (потік /byyou) — ПЕРШИЙ РЯДОК ФУТЕРА РІЗНИЙ на картці й у модалці:
//   • КАРТКА (`onCard`) — населений пункт. Рішення Вови: «назву населеного пункту
//     перемістити на місце імені, а імʼя забрати з картки, залишити тільки в модалці».
//     Причина продуктова: у стрічці оголошень людині важливо ДЕ, а не ХТО.
//   • МОДАЛКА — імʼя автора, як було. Локацію там НЕ повторюємо: у модалці вона вже
//     стоїть у липкій шапці (`renderAdModal` → `.cm-board-modal-subhead`), і другий
//     такий самий рядок був би дублем.
function renderCardFoot(p, { actions = false, onCard = false } = {}) {
  const tel = actions ? phoneOf(p) : '';
  const lead = onCard
    ? renderLoc(p.location, 'cm-board-loc--foot')
    : `<span class="cm-board-author cm-board-author--card">— <span${nameUid(p.owner_uid)}>${liveName(p.author, p.owner_uid, 'анонімно')}</span></span>`;
  return `
      <div class="cm-board-foot${onCard ? ' cm-board-foot--card' : ''}">
        ${actions ? `<div class="cm-board-foot-actions">
          ${tel ? `<a class="cm-board-call" href="tel:${escapeHtml(tel)}" aria-label="Подзвонити">${PHONE_ICON_SVG}</a>` : ''}
          <button class="cm-board-msg-btn" data-open-chat aria-label="Повідомлення">${MSG_ICON_SVG}</button>
        </div>` : ''}
        <div class="cm-board-foot-who">
          ${lead}
          <span class="cm-board-time">${renderPostTime(p)}</span>
        </div>
      </div>`;
}

// Контакт у зум-модалці: одна широка кнопка «Написати» (внутрішній чат) + дзвінок
// окремою квадратною кнопкою, якщо контакт розпізнано як телефон. Обидві 44px —
// мінімальна тап-ціль за Apple HIG. Клас/атрибут `data-open-chat` той самий, що був
// на картці, тож делегований обробник (document-level) працює без змін.
function renderContactBar(p) {
  const tel = phoneOf(p);
  return `
      <div class="cm-board-contact-bar">
        ${tel ? `<a class="cm-board-call" href="tel:${escapeHtml(tel)}" aria-label="Подзвонити">${PHONE_ICON_SVG}</a>` : ''}
        <button class="cm-board-write-btn" type="button" data-open-chat>${MSG_ICON_SVG}<span>Написати</span></button>
      </div>`;
}
// Стрілка вгору (векторна) — мітка «піднято» біля дати.
const BUMP_ICON_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6"/><path d="M6 12l6-6 6 6"/></svg>';
// Дата на картці/модалці: якщо оголошення підняли — показуємо СВІЖИЙ час підняття
// з міткою «🔼 піднято …» (щоб верхня позиція узгоджувалась із показаною датою —
// раніше сортування йшло за bumped_at, а дата показувала стару ts → «26 червня вгорі»).
// Чи оголошення РЕАЛЬНО піднімали (≥1 раз). На створенні RPC ставить
// bumped_at == published_at == ts (усі now()), тож наявність bumped_at ще НЕ означає
// підйом. Реальний підйом (bumpPost) робить bumped_at помітно пізнішим за час публікації.
function wasBumped(p) {
  if (!p || !p.bumped_at) return false;
  const bumpMs = new Date(p.bumped_at).getTime();
  const t = postTime(p);   // ts || published_at || created_at
  const origMs = typeof t === 'number' ? t : (t ? new Date(t).getTime() : 0);
  if (!bumpMs || !origMs) return false;
  return bumpMs - origMs > 60000;   // >1 хв пізніше публікації = реально піднято
}

function renderPostTime(p) {
  if (wasBumped(p)) {
    // Реально підняте: свіжий час у ТОМУ Ж стилі що звичайна дата + стрілка-позначка «підняте».
    return `<span class="cm-board-bumped">${BUMP_ICON_SVG}${formatTime(p.bumped_at)}</span>`;
  }
  return formatTime(postTime(p));
}
// Векторні іконки для пунктів FAB-меню (у стилі MSG_ICON — лінійні, currentColor)
const EDIT_ICON_SVG = ICONS.pencil; // дедуп — раніше локальна копія, community-modal.js PENCIL_ICON_SVG мірорила цю ж
const MYADS_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/></svg>';

// ── Стан (зберігається в межах сесії) ────────────────────────────────────────

let allPosts       = [];   // [{id, type, ...}]
// Жива підписка помітила зміну оголошень, але перемальовувати НЕ час (людина гортає
// список або взагалі на іншій вкладці). Перемалюємо, коли це безпечно — при вході на
// Дошку або коли людина повернеться вгору списку.
let _boardStale    = false;
let allAnnouncements = []; // офіційні з announcements
let activeType     = 'board';
let activeCategory = 'all';
let activeLocation = COMMUNITY_ALL;   // Д-12: фільтр за НП; дефолт «вся громада» = усі
let searchQuery    = '';

// Коментарі/лайки обговорень — стан у board-discussions.js (setDiscussionsData
// з renderBoard нижче). Закладки (savedIds) — стан у core/board-shared.js.

// BOARD-стікер: дії збереження+поділитися (реакції прибрано). На картці CSS може
// ховати `.bd-actions-extra`, у zoom-modal — показувати.
function boardActionsHtml(post) {
  return `
    <div class="bd-actions bd-actions--board-compact">
      <div class="bd-actions-extra">
        ${saveBtnHtml(post)}
        ${shareBtnHtml(post)}
      </div>
    </div>
  `;
}

// ── Картки за типом ──────────────────────────────────────────────────────────

// BOARD: стікер на корку (з збереженням і поділитися)
// 🆕 28.07 (потік 2): картка більше НЕ показує опис — 4 рядки прев'ю з'їдали пів картки
// і не допомагали вибирати (рішення Вови). Лишились: фото · категорія+локація · ціна ·
// заголовок · автор+час. Повний опис читається в модалці (тап по картці).
// ⚠️ Виняток — старі пости БЕЗ заголовка (Д-16 зробив його обов'язковим лише 08.07):
// у них замість заголовка показуємо текст, інакше картка була б порожньою.
function renderBoardCard(p) {
  const tilt = 0; // картки рівні (без нахилу) — рішення Вови 20.06
  const photo = (Array.isArray(p.photos) && p.photos[0]) || p.photo;
  const photoHtml = photo
    ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${escapeHtml(photo)}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'"></div>`
    : '';
  return `
    <article class="cm-board-note bd-card bd-card--board${photo ? ' cm-board-note--has-photo' : ''}" style="--tilt:${tilt}deg" data-post-id="${p.id}">
      <span class="cm-board-pin"></span>
      ${photoHtml}
      <span class="cm-board-cat cm-board-cat--${escapeHtml(catColor(p.category))}">${catIcon(p.category)} ${escapeHtml(catShort(p.category))}</span>
      ${renderPrice(p)}
      ${p.title
        ? `<h3 class="cm-board-title">${escapeHtml(p.title)}</h3>`
        : `<p class="cm-board-text">${escapeHtml(p.text)}</p>`}
      ${renderCardFoot(p, { onCard: true })}
      ${boardActionsHtml(p)}
    </article>
  `;
}

// BOARD: вміст зум-модалки оголошення — будується З ДАНИХ поста (не клон картки).
// Фото flush зверху (без відʼємного margin → не обрізається скролом), нижче —
// прокручуване тіло з категорією, заголовком, повним описом, контактом і діями.
// Дії (зберегти/шер/контакт) — ті самі хелпери, що й на картці → делеговані
// обробники працюють без змін.
function renderAdModal(p) {
  const photos = Array.isArray(p.photos) ? p.photos.filter(Boolean) : (p.photo ? [p.photo] : []);
  const hasPhoto = photos.length > 0;
  const multi = photos.length > 1;
  // Фото фіксованого розміру (4:3) + категорія/заголовок + текст — УСЕ в одному скролі (без JS-стискання).
  // Так скрол ідеально плавний (рідний, без смикань/просвічування/застрягання). Фото гортається разом з текстом.
  const photoHtml = hasPhoto ? `
    <div class="cm-board-modal-photo">
      <div class="cm-board-modal-gallery"${multi ? ' data-multi' : ''}>
        ${photos.map((ph, i) => `<div class="cm-board-modal-slide"><img src="${escapeHtml(ph)}" alt="" data-photo-full="${escapeHtml(ph)}" data-photo-idx="${i}" loading="lazy" onerror="this.closest('.cm-board-modal-slide').style.display='none'"></div>`).join('')}
      </div>
      ${multi ? `<div class="cm-board-modal-dots">${photos.map((_, i) => `<span class="cm-board-modal-dot${i === 0 ? ' active' : ''}"></span>`).join('')}</div>` : ''}
    </div>` : '';
  return `
    <div class="cm-board-modal-bar">
      <span class="cm-board-modal-grip"></span>
    </div>
    <div class="cm-board-modal-scrollarea">
      ${photoHtml}
      <div class="cm-board-modal-subhead">
        <span class="cm-board-cat cm-board-cat--${escapeHtml(catColor(p.category))}">${catIcon(p.category)} ${escapeHtml(catShort(p.category))}</span>
        ${renderLoc(p.location)}
        ${renderPrice(p)}
        ${p.title ? `<h3 class="cm-board-title">${escapeHtml(p.title)}</h3>` : ''}
      </div>
      <div class="cm-board-modal-content">
        <p class="cm-board-text">${escapeHtml(p.text)}</p>
      </div>
    </div>
    <div class="cm-board-modal-foot">
      ${renderCardFoot(p)}
      ${boardActionsHtml(p)}
      ${renderContactBar(p)}
    </div>
  `;
}

// 🆕 28.07 — ТІНЬ ПІД ЛИПКИМ БЛОКОМ (категорія · ціна · заголовок) З'ЯВЛЯЄТЬСЯ ПЛАВНО.
// Скарга Вови: «зараз вона виглядає негарно» — тінь малювалась ЗАВЖДИ, навіть коли під
// блоком нічого не проїжджає і відділяти нема чого. Має наростати рівно тоді, коли блок
// уперся у верх і текст поїхав під нього.
// Той самий висновок, що й Д-17 для шапки форми подачі («лінія зайва, поки не скролили»),
// тільки з плавним згасанням: сам перехід робить CSS (`transition` на `.is-stuck`),
// JS лише каже «блок прилип» / «відлип».
//
// ⚠️ ДВІ умови, а не одна. Перевірка «блок уперся у верх скролера» сама по собі бреше,
// коли у оголошення НЕМА фото: тоді блок стоїть угорі від самого початку, тобто «прилип»
// уже при нульовій прокрутці — і тінь показалась би одразу, тобто рівно той баг, який
// лагодимо. Тому додаємо scrollTop > 2: тінь є лише коли реально прокрутили.
function attachSubheadShadow(modal) {
  const scroller = modal.querySelector('.cm-board-modal-scrollarea');
  const head = modal.querySelector('.cm-board-modal-subhead');
  if (!scroller || !head) return;
  const sync = () => {
    // top:-1px у sticky → у прилиплому стані різниця ≈ −1, тому поріг 1, а не 0.
    const reachedTop = head.getBoundingClientRect().top - scroller.getBoundingClientRect().top <= 1;
    head.classList.toggle('is-stuck', scroller.scrollTop > 2 && reachedTop);
  };
  sync();
  scroller.addEventListener('scroll', () => requestAnimationFrame(sync), { passive: true });
}

// Повноекранний перегляд фото зі свайпом між кадрами. Відкривається тапом по фото
// в галереї модалки. Закриття: ✕, тап по фону, свайп вниз.
function openPhotoLightbox(photos, startIdx) {
  if (!photos || !photos.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'cm-photo-lightbox';
  wrap.innerHTML = `
    <button class="cm-photo-lightbox-close" type="button" aria-label="Закрити">✕</button>
    <div class="cm-photo-lightbox-track">
      ${photos.map(ph => `<div class="cm-photo-lightbox-slide"><img src="${escapeHtml(ph)}" alt=""></div>`).join('')}
    </div>
    ${photos.length > 1 ? '<div class="cm-photo-lightbox-count"></div>' : ''}`;
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  const track = wrap.querySelector('.cm-photo-lightbox-track');
  const countEl = wrap.querySelector('.cm-photo-lightbox-count');
  const updateCount = () => {
    if (!countEl || !track.clientWidth) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    countEl.textContent = `${i + 1} / ${photos.length}`;
  };
  requestAnimationFrame(() => {
    track.scrollLeft = (startIdx || 0) * track.clientWidth;
    updateCount();
    wrap.classList.add('open');
  });
  track.addEventListener('scroll', () => requestAnimationFrame(updateCount), { passive: true });
  const close = () => {
    wrap.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(() => wrap.remove(), 200);
  };
  wrap.querySelector('.cm-photo-lightbox-close').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
}


// OFFICIAL: офіційне оголошення сільради (для табу «Усі»)
function renderOfficialCard(a) {
  const tilt = 0; // картки рівні (без нахилу) — рішення Вови 20.06
  return `
    <article class="cm-board-note bd-card bd-card--official cm-board-note--official" style="--tilt:${tilt}deg">
      <span class="cm-board-pin cm-board-pin--gold"></span>
      <span class="cm-board-cat cm-board-cat--official">🏛️ ОФІЦІЙНО</span>
      <h4 class="cm-board-official-title">${escapeHtml(a.title)}</h4>
      <p class="cm-board-text">${escapeHtml(a.body)}</p>
      <div class="cm-board-footer">
        <span class="cm-board-author">— ${escapeHtml(a.author || '—')}</span>
        <span class="cm-board-time">${formatTime(postTime(a))}</span>
      </div>
    </article>
  `;
}

function renderCard(post) {
  if (post.type === 'chat') return renderChatCard(post);
  return renderBoardCard(post);
}

// FAB — ДВІ незалежні кнопки: Дошка (оголошення) і Обговорення (свій набір дій).
// Спільна лише speed-dial-механіка (id board-fab/board-trigger + клас .open),
// щоб toggleFab/closeFab працювали. Розмітка/меню/іконка — різні за вкладкою.
function renderFab() {
  if (discOpen) {
    // Обговорення: червоний круг з білим плюсом + своє меню.
    return `
    <div class="board-fab" id="board-fab">
      <div class="board-fab-backdrop" id="board-fab-backdrop" aria-hidden="true"></div>
      <div class="board-fab-menu" id="board-fab-menu">
        <button class="board-fab-item" data-fab="disc-create" type="button">
          <span class="board-fab-label">Створити обговорення</span>
          <span class="board-fab-ic">${EDIT_ICON_SVG}</span>
        </button>
        <button class="board-fab-item" data-fab="disc-mine" type="button">
          <span class="board-fab-label">Мої обговорення</span>
          <span class="board-fab-ic">${MYADS_ICON_SVG}</span>
        </button>
        <button class="board-fab-item" data-fab="disc-saved" type="button">
          <span class="board-fab-label">Збережені</span>
          <span class="board-fab-ic">${BOOKMARK_OUTLINE_SVG}</span>
        </button>
      </div>
      <button class="cm-board-trigger board-trigger--fixed" id="board-trigger" type="button" aria-label="Обговорення" aria-expanded="false">
        <span class="cm-board-trigger-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></span>
        <span class="cm-board-trigger-close" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>
      </button>
    </div>`;
  }
  // Дошка (без змін — оголошення/мої/повідомлення/збережені).
  return `
    <div class="board-fab" id="board-fab">
      <div class="board-fab-backdrop" id="board-fab-backdrop" aria-hidden="true"></div>
      <div class="board-fab-menu" id="board-fab-menu">
        <button class="board-fab-item" data-fab="post" type="button">
          <span class="board-fab-label">Подати оголошення</span>
          <span class="board-fab-ic">${EDIT_ICON_SVG}</span>
        </button>
        <button class="board-fab-item" data-fab="mine" type="button">
          <span class="board-fab-label">Мої оголошення</span>
          <span class="board-fab-ic">${MYADS_ICON_SVG}</span>
        </button>
        <button class="board-fab-item" data-fab="messages" type="button">
          <span class="board-fab-label">Повідомлення<span class="board-fab-msgs-badge" id="board-fab-msgs-badge"></span></span>
          <span class="board-fab-ic">${MSG_ICON_SVG}</span>
        </button>
        <button class="board-fab-item" data-fab="saved" type="button">
          <span class="board-fab-label">Збережені</span>
          <span class="board-fab-ic">${BOOKMARK_OUTLINE_SVG}</span>
        </button>
      </div>
      <button class="cm-board-trigger board-trigger--fixed" id="board-trigger" type="button" aria-label="Дії" aria-expanded="false">
        <span class="cm-board-trigger-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
        <span class="cm-board-trigger-close" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>
        <span class="cm-board-trigger-text">Подати оголошення</span>
        <span class="board-trigger-badge" id="board-trigger-badge"></span>
      </button>
    </div>`;
}

// ── Фільтрація і пошук ───────────────────────────────────────────────────────

// opts.ignoreLocation — пропустити фільтр локації (для fallback «вся громада»
// коли в обраному НП немає власних оголошень, Вова 11.07).
function getFilteredPosts(opts = {}) {
  const q = searchQuery.trim().toLowerCase();
  const savedIds = activeType === 'saved' ? getSavedIds() : null;

  return allPosts.filter(p => {
    // Фільтр по типу
    if (activeType === 'saved') {
      // Таб «Збережені» ДОШКИ = лише оголошення: збережені ОБГОВОРЕННЯ мають
      // свою кімнату на вкладці Обговорення (розділення — рішення Роми 08.07).
      if (!savedIds.has(p.id) || p.type === 'chat') return false;
    } else if (p.type !== activeType) {
      return false;
    }
    // Фільтр по категорії — тільки для board. Кожна категорія = одна конкретна
    // (куплю/продам/віддам/шукаю/послуга/знайдено/загубилось); 'all' = усі.
    if (activeType === 'board' && activeCategory !== 'all') {
      if (p.category !== activeCategory) return false;
    }
    // Фільтр по локації (Д-12) — тільки board. Конкретний НП показує свої пости
    // + загальногромадські (COMMUNITY_ALL/порожні/старі) — вони релевантні скрізь.
    if (activeType === 'board' && activeLocation !== COMMUNITY_ALL && !opts.ignoreLocation) {
      if (p.location !== activeLocation && !isCommunityWide(p.location)) return false;
    }
    // Пошук — text + tags + author + title
    if (q) {
      const hay = [
        p.text, p.title, p.author,
        ...(p.tags || []),
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

// Кількість для лічильника шапки Дошки. Коли обраний конкретний НП і в ньому
// НЕМАЄ власних оголошень — рахуємо як загальногромадський перегляд (усі НП),
// бо саме стільки карток тоді реально показує renderBody (консистентність
// лічильника з видимими картками, Вова 11.07).
function getBoardDisplayCount() {
  if (activeType !== 'board' || activeLocation === COMMUNITY_ALL) return getFilteredPosts().length;
  const narrow = getFilteredPosts();
  const hasOwn = narrow.some(p => p.location === activeLocation);
  return hasOwn ? narrow.length : getFilteredPosts({ ignoreLocation: true }).length;
}


// ── Рендеринг панелі ─────────────────────────────────────────────────────────

function renderHeader() {
  // Перемикач Дошка|Обговорення прибрано (Етап 1 крок 2b): Дошка = чистий маркетплейс.
  // «Обговорення» відкриваються з вкладки «Чати» (режим activeType='chat') і мають
  // власну шапку з кнопкою «← назад» (веде у вкладку Чати). «Збережені» — з FAB-підменю.
  // Обговорення — головна сторінка вкладки, тому кнопки «← назад» НЕМА (нікуди виходити).
  // Обговорення (варіант C, Вова 21.07): заголовок «ОБГОВОРЕННЯ» прибрано — він
  // ДУБЛЮВАВ таб-бар знизу (там та сама назва підсвічена). Лишаємо лише пошук →
  // чистіше + більше місця під картки. Висоту шапки міряє syncBoardBodyOffset
  // (CSS-fallback #disc-content .bd-body теж зменшено під нову висоту).
  const discHead = '';

  const showCategories = activeType === 'board';
  // Кнопка-фільтр категорій (зліва від пошуку) + випадне меню. Іконка кнопки =
  // іконка активної категорії (для 'all' — лійка), у семантичному кольорі. Тап →
  // меню зі списком усіх категорій; вибір закриває меню й фільтрує (див. обробники).
  const activeIcon = activeCategory === 'all' ? ALL_ICON : catIcon(activeCategory);
  const activeColorCls = activeCategory === 'all' ? '' : 'cat-c-' + catColor(activeCategory);
  const CARET_SVG = '<svg class="bd-cat-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  const menuItem = (id, icon, color, label) => `
    <button class="bd-cat-mi${id === activeCategory ? ' active' : ''}" type="button" role="menuitem" data-bd-cat="${id}">
      <span class="bd-cat-mi-ico ${color ? 'cat-c-' + color : ''}">${icon}</span>
      <span class="bd-cat-mi-label">${escapeHtml(label)}</span>
    </button>`;
  const catFilterHtml = showCategories ? `
    <div class="bd-cat-filter-wrap">
      <button class="bd-cat-filter" id="bd-cat-filter" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Фільтр за категорією">
        <span class="bd-cat-filter-ico ${activeColorCls}">${activeIcon}</span>
        ${CARET_SVG}
      </button>
      <div class="bd-cat-menu" id="bd-cat-menu" role="menu" hidden>
        ${menuItem('all', ALL_ICON, '', 'Всі')}
        ${CATS.map(c => menuItem(c.id, c.icon, c.color, c.label)).join('')}
      </div>
    </div>
  ` : '';

  // Д-11 + Д-12: шапка Дошки — рядок «лічильник (зліва) + фільтр локації (справа)».
  // Лічильник рахує поточний відфільтрований список.
  //
  // 🔴 28.07 — ВИДИМИЙ ЗАГОЛОВОК «ДОШКА ОГОЛОШЕНЬ» ПРИБРАНО (рішення Вови).
  // Чому це правильно, а не «втрата назви»:
  //   • «Де я» вже кажуть ДВА джерела — таб-бар (пункт «ДОШКА» підсвічений бордовим)
  //     і плейсхолдер пошуку «Пошук по дошці…». Третя копія тієї самої назви — це те,
  //     що Apple HIG зве redundant navigation title. Той самий аргумент уже застосовано
  //     21.07, коли прибрали заголовок «ОБГОВОРЕННЯ» (дублював таб-бар).
  //   • Заголовок НЕ пояснював, що тут можна робити — він лише називав. «Що тут і для
  //     чого» — це онбординг (перше знайомство), і його місце — порожній стан і
  //     одноразова підказка, а не плашка, яку сотий раз прогортає той, хто вже все знає.
  //   • Звільнилось ~46px висоти екрана в кожному кадрі скролу.
  // Назвою екрана стає рядок, який і так був і при цьому КОРИСНИЙ:
  // «15 оголошень · Олицька громада» — відповідає і «де я», і «скільки тут», і «яка
  // локація». Замість декоративної назви — робоча.
  // ⚠️ Заголовок лишається для ЧИТАЧА ЕКРАНА (`.sr-only`, base.css): сторінка зовсім
  // без <h2> — це втрата орієнтації для незрячого, а тут візуальне рішення не мусить
  // ламати доступність.
  const count = showCategories ? getBoardDisplayCount() : 0;
  const titlebarHtml = showCategories ? `
    <div class="bd-titlebar">
      <h2 class="sr-only">Дошка оголошень</h2>
      <div class="bd-subrow">
        <span class="bd-count" id="bd-count">${count} ${pluralAds(count)}</span>
        <div class="bd-loc-filter">
          <button class="bd-loc-btn" id="bd-loc-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Фільтр за населеним пунктом">
            <span class="bd-loc-icon" aria-hidden="true">${PIN_ICON_SVG}</span>
            <span class="bd-loc-label">${escapeHtml(activeLocation === COMMUNITY_ALL ? COMMUNITY_ALL_LABEL : activeLocation)}</span>
            <svg class="bd-loc-caret" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="bd-loc-menu" id="bd-loc-menu" role="menu" hidden>
            <button class="bd-loc-mi${activeLocation === COMMUNITY_ALL ? ' active' : ''}" type="button" role="menuitem" data-bd-loc="${escapeHtml(COMMUNITY_ALL)}">${escapeHtml(COMMUNITY_ALL_LABEL)}</button>
            ${SETTLEMENTS.map(s => `<button class="bd-loc-mi${activeLocation === s ? ' active' : ''}" type="button" role="menuitem" data-bd-loc="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join('')}
          </div>
        </div>
      </div>
    </div>
  ` : '';

  return `
    <div class="bd-controls">
      ${discHead}
      ${titlebarHtml}
      <div class="bd-search-row">
        ${catFilterHtml}
        <div class="bd-search">
          <span class="bd-search-icon">${ICONS.search}</span>
          <input class="bd-search-input" id="bd-search-input" type="search"
                 placeholder="${activeType === 'chat' ? 'Пошук в обговореннях...' : activeType === 'saved' ? 'Пошук у збережених...' : 'Пошук по дошці...'}" value="${escapeHtml(searchQuery)}">
          ${searchQuery ? '<button class="bd-search-clear" type="button" id="bd-search-clear">✕</button>' : ''}
        </div>
      </div>
    </div>
  `;
}

// Оновити лічильник оголошень у шапці без повного ре-рендеру (Д-11).
// Викликається після фільтрів (пошук/локація), коли header не перебудовується.
function updateAdCount() {
  const el = document.getElementById('bd-count');
  if (!el || activeType !== 'board') return;
  const n = getBoardDisplayCount();
  el.textContent = `${n} ${pluralAds(n)}`;
}

function renderBody() {
  const filtered = getFilteredPosts();

  if (!filtered.length) {
    const msg = activeType === 'saved'
      ? 'У «Збережених» поки нічого. Натисніть закладку на пості щоб зберегти.'
      : searchQuery
      ? `За запитом «${escapeHtml(searchQuery)}» нічого не знайдено`
      : 'У цій категорії поки порожньо';
    return `<div class="bd-empty">${msg}</div>`;
  }

  // Порядок: спершу bumped_at (підняте власником угору), далі ts/published_at.
  const rankTs = (x) =>
    (x.bumped_at && new Date(x.bumped_at).getTime()) ||
    x.ts || (x.published_at && new Date(x.published_at).getTime()) || 0;
  const sorted = [...filtered].sort((a, b) => rankTs(b) - rankTs(a));

  if (activeType === 'board') {
    // Один корк-борд (2 колонки-масонрі) зі списку карток.
    const corkboard = (list) => {
      const left  = list.filter((_, i) => i % 2 === 0).map(renderBoardCard).join('');
      const right = list.filter((_, i) => i % 2 === 1).map(renderBoardCard).join('');
      return `<div class="cm-board-corkboard board-corkboard--full"><div class="cm-board-col">${left}</div><div class="cm-board-col">${right}</div></div>`;
    };
    // Фільтр по конкретному НП (Д-12+) → ДВІ групи: спершу оголошення цього НП,
    // нижче — загальногромадські («Олицька громада»). Дефолт «Уся громада» — один список.
    if (activeLocation !== COMMUNITY_ALL) {
      const npGroup = sorted.filter(p => p.location === activeLocation);
      // Друга група: якщо в НП Є власні оголошення — лише загальногромадські
      // (вузько, як і було). Якщо НЕМАЄ — ВСЯ громада (усі НП разом), той самий
      // набір що й у дефолтному перегляді «Олицька громада» без фільтра —
      // не лише позначені як «вся громада» (Вова 11.07, знайдений баг: раніше
      // тут губились пости інших конкретних НП, напр. Жорнище).
      const wideGroup = npGroup.length
        ? sorted.filter(p => isCommunityWide(p.location))
        : [...getFilteredPosts({ ignoreLocation: true })].sort((a, b) => rankTs(b) - rankTs(a));
      const section = (title, list) => list.length
        ? `<h3 class="bd-group-title">${escapeHtml(title)}</h3>${corkboard(list)}`
        : '';
      // Немає оголошень у КОНКРЕТНОМУ НП (напр. «Олика») — не мовчки перескакувати
      // одразу на загальногромадські, а показати явне повідомлення (Вова 11.07).
      const npEmptyMsg = !npGroup.length
        ? `<div class="bd-group-empty">В розділі «${escapeHtml(activeLocation)}» оголошень не знайдено<span class="bd-group-empty-hint">Перегляньте всі оголошення громади</span></div>`
        : '';
      return `
        <div class="board-backdrop" id="board-backdrop"></div>
        ${section(activeLocation, npGroup)}
        ${npEmptyMsg}
        ${section(COMMUNITY_ALL_LABEL, wideGroup)}
      `;
    }
    return `
      <div class="board-backdrop" id="board-backdrop"></div>
      ${corkboard(sorted)}
    `;
  }

  // chat / saved — вертикальна стрічка карток.
  // #board-backdrop рендеримо і тут, щоб у «Збережених» працювала зум-модалка
  // оголошення (initBoardNoteExpand виходить рано, якщо backdrop відсутній).
  return `
    <div class="board-backdrop" id="board-backdrop"></div>
    <div class="bd-stream">${sorted.map(renderCard).join('')}</div>`;
}

// Перечитати дані Дошки з бази (без жодного рендера). Винесено з `renderBoard`, щоб
// «мʼяке» оновлення могло взяти свіжі дані й перемалювати ЛИШЕ список, не чіпаючи шапку
// й не будуючи вкладку заново.
// Повертає true, якщо дані прийшли з бази.
async function loadBoardData() {
  if (!isSupabaseReady()) return false;
  const uid = currentUserId();
  const [posts, anns, comments, saved, reactions] = await Promise.all([
    fetchPublishedPosts(),
    fetchPublishedAnnouncements(),
    fetchAllComments(),
    uid ? fetchSavedPostIds(uid) : Promise.resolve(new Set()),
    fetchAllReactions(uid || getAnonId()),
  ]);
  if (posts === null) return false;
  allPosts         = posts;
  allAnnouncements = anns || [];
  setDiscussionsData(comments, reactions);   // стан обговорень живе у board-discussions.js
  setSavedIds(saved);                        // закладки — у board-shared.js
  return true;
}

// 🔑 МʼЯКЕ ОНОВЛЕННЯ ПІСЛЯ ВЛАСНОЇ ДІЇ (завершив / повернув / видалив / опублікував).
// Було: `renderBoard()` — перечитати все і зібрати ВКЛАДКУ заново. Через це екран
// стрибав на початок, як це було у «Стрічці» до 27.07.
// Стало: дані перечитуємо (стан на сервері справді змінився), але перемальовуємо лише
// список і всередині `keepScroll` — id карток ті самі, тож якір знаходить свою картку
// після перемальовки і повертає екран рівно туди, де він був.
//
// ⚠️ Чому не точковий патч однієї картки, як у «Стрічці»: Дошка — це корок у ДВІ
// колонки, і картки розкладені по них за парністю (`i % 2`). Тобто поява чи зникнення
// однієї картки законно перекладає всі наступні — патчити одну там нема сенсу.
// Позицію це не псує: якір рахує по тій картці, яку людина бачить, а не по індексу.
async function refreshBoardKeepingPlace() {
  const el = getBoardRoot();
  const body = document.getElementById('bd-body');
  const ok = await loadBoardData();
  if (!ok || !el || !body) { renderBoard(); return; }   // не змогли мʼяко — звичайним шляхом
  keepScroll(document.querySelector('.app-main'), () => renderBodyOnly(), null, 'data-post-id');
}

export async function renderBoard() {
  const el = getBoardRoot();
  if (!el) return;

  // 1. Supabase: пости + анонси + коментарі + закладки + реакції(лайки) паралельно.
  // Саме читання — у `loadBoardData()` (спільне з мʼяким оновленням, щоб не тримати
  // два однакові запити в різних місцях).
  if (await loadBoardData()) { renderAll(el); return; }

  // 2. Fallback: JSON (поки БД порожня або немає мережі — показуємо демо-дані)
  try {
    const [boardRes, communityRes] = await Promise.all([
      fetch('./data/community-board.json'),
      fetch('./data/community.json'),
    ]);
    const boardData     = await boardRes.json();
    const communityData = await communityRes.json();
    allPosts         = boardData.posts || [];
    allAnnouncements = communityData.announcements || [];
    setDiscussionsData(new Map());   // fallback скидає лише коментарі (як і до розділення)
  } catch {
    el.innerHTML = '<div class="empty-state">Дошка тимчасово недоступна</div>';
    return;
  }

  renderAll(el);
}

// Перерендер тільки контейнера дошки (без перезавантаження даних).
// Корінь (#board-content / #disc-content) визначається getBoardRoot() за станом overlay.
function renderAll() {
  const el = getBoardRoot();
  if (!el) return;
  const hasCork = activeType === 'board';
  // 28.07: у Дошки прибрано ЗАТЕМНЕНІ КРАЇ (`.board-vignette` — градієнти
  // rgba(0,0,0,0.58) по 140px згори і знизу). Вони були частиною «темного корка» і
  // на новому світло-сірому фоні читались би як дві брудні смуги через екран.
  // ⚠️ Клас у CSS ЛИШАЄТЬСЯ — його вживають Обговорення (гілка else нижче), а їхній
  // теплий беж я свідомо не чіпаю (правило «не чіпати те, про що не просили»).
  el.innerHTML = `
    ${hasCork ? `
      <div class="board-bg" aria-hidden="true"></div>
    ` : `
      <div class="board-vignette board-vignette--top" aria-hidden="true"></div>
    `}
    ${renderHeader()}
    <div class="bd-body" id="bd-body">${renderBody()}</div>
    ${renderFab()}
  `;

  hydrateNames(el);   // синк живих імен профілю (за uid) у картках обговорень

  el.style.backgroundImage = '';
  el.style.backgroundSize  = '';
  el.style.backgroundPosition = '';

  // FAB-підменю (speed-dial): тап по кнопці розкриває дії; повторний/фон — закриває.
  const fab     = document.getElementById('board-fab');
  const fabBtn  = document.getElementById('board-trigger');
  const fabBack = document.getElementById('board-fab-backdrop');
  const closeFab = () => {
    if (!fab) return;
    fab.classList.remove('open');
    fabBtn?.setAttribute('aria-expanded', 'false');
  };
  const toggleFab = () => {
    if (!fab) return;
    const open = fab.classList.toggle('open');
    fabBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  fabBtn?.addEventListener('click', toggleFab);
  fabBack?.addEventListener('click', closeFab);
  refreshUnreadBadge();   // заповнити бейдж непрочитаних на свіжому FAB (після рендеру Дошки)
  fab?.querySelectorAll('.board-fab-item').forEach(item => {
    item.addEventListener('click', () => {
      const act = item.dataset.fab;
      closeFab();
      // ── Дії ОБГОВОРЕНЬ (окремий FAB, лише коли discOpen) ──
      if (act === 'disc-create') { requireAuth('створити обговорення', openDiscussionCompose); return; }
      if (act === 'disc-mine')   { requireAuth('мої обговорення', openMyDiscussions); return; }
      if (act === 'disc-saved')  { requireAuth('збережені обговорення', openSavedDiscussions); return; }
      // ── Дії ДОШКИ ──
      // Усі три дії — лише для залогінених (Етап 2). Гостю requireAuth()
      // покаже тост і запропонує увійти (подія cstl-need-login → екран входу).
      if (act === 'post') { requireAuth('подати оголошення', openBoardModal); return; }
      if (act === 'saved') { requireAuth('переглянути збережені', () => {
        // Д-27: «Збережені» — окремий екран (pm-screen), як «Мої оголошення».
        // Список = published-оголошення з закладок (обговорення мають свою кімнату).
        const saved = getSavedIds();
        const list = allPosts.filter(p => saved.has(p.id) && p.type !== 'chat');
        openSavedAds(list, {
          // Прибрали зі збережених на екрані → синхронізуємо стан дошки:
          // оновлюємо savedIds і, якщо картка видима на дошці, іконку закладки.
          onRemove: (id) => {
            getSavedIds().delete(id);
            const btn = document.querySelector(`[data-save-id="${id}"]`);
            if (btn) {
              btn.innerHTML = BOOKMARK_OUTLINE_SVG;
              btn.classList.remove('bd-bookmark--active');
              btn.setAttribute('aria-label', 'Зберегти у Мої');
            }
          },
        });
      }); return; }
      if (act === 'messages') { openThreadsList(); return; }   // requireAuth усередині
      if (act === 'mine') openMyAds();        // requireAuth усередині openMyAds
    });
  });

  // Пошук
  const searchInput = document.getElementById('bd-search-input');
  if (searchInput) {
    let debounce = null;
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value;
      clearTimeout(debounce);
      debounce = setTimeout(() => renderBodyOnly(el), 180);
    });
  }
  document.getElementById('bd-search-clear')?.addEventListener('click', () => {
    searchQuery = '';
    renderAll(el);
  });


  // Фільтри Дошки (категорії + локація) — обидва кастомні меню в стилі додатку
  // (не нативний select). Кнопка відкриває/закриває СВОЄ меню, взаємовиключно
  // (відкриття одного закриває інше); вибір пункту застосовує фільтр → renderAll
  // перебудовує шапку (меню відроджується закритим, кнопка показує новий стан).
  const wireMenuButton = (btnId, menuId, onPick) => {
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId);
    if (!btn || !menu) return;
    btn.addEventListener('click', e => {
      e.stopPropagation();   // щоб document-listener (закриття по кліку повз) не спрацював одразу
      const wasHidden = menu.hasAttribute('hidden');
      closeBoardMenus();     // закрити обидва (взаємовиключність)
      if (wasHidden) {       // було закрите → відкрити
        menu.removeAttribute('hidden');
        btn.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
    menu.querySelectorAll('[data-bd-cat], [data-bd-loc]').forEach(mi => {
      mi.addEventListener('click', () => { onPick(mi); renderAll(); });
    });
  };
  wireMenuButton('bd-cat-filter', 'bd-cat-menu', mi => { activeCategory = mi.dataset.bdCat; });
  wireMenuButton('bd-loc-btn',    'bd-loc-menu', mi => { activeLocation = mi.dataset.bdLoc; });

  // Закриття меню по кліку повз / Escape / скролу — document-рівень, ОДИН раз (guard).
  if (!_boardMenusWired) {
    _boardMenusWired = true;
    document.addEventListener('click', e => {
      if (e.target.closest('.bd-cat-filter-wrap') || e.target.closest('.bd-loc-filter')) return;
      closeBoardMenus();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeBoardMenus(); });
    document.querySelector('.app-main')?.addEventListener('scroll', closeBoardMenus, { passive: true });
  }

  // Кнопки виклика — окремий handler (capture щоб клік не лизнув на стікер)
  el.querySelectorAll('.cm-board-call').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); }, { capture: true });
  });

  // Zoom-перегляд тільки для board-стікерів
  initBoardNoteExpand(el);

  // Відступ тіла = реальна висота шапки (щоб картки не залазили під неї). Через rAF —
  // щоб вимір відбувся після того як браузер порахував layout свіжої розмітки.
  requestAnimationFrame(() => { syncBoardBodyOffset(); fitBoardAuthors(); });
}

function renderBodyOnly() {
  const el = getBoardRoot();
  if (!el) return;
  const body = document.getElementById('bd-body');
  if (!body) return renderAll();
  body.innerHTML = renderBody();
  updateAdCount();   // Д-11: лічильник у шапці синхронний з відфільтрованим списком
  // Перепідключаємо handlers для cm-board-call всередині нового HTML
  body.querySelectorAll('.cm-board-call').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); }, { capture: true });
  });
  initBoardNoteExpand(el);
  requestAnimationFrame(fitBoardAuthors);
}

// Zoom-перегляд стікера через окрему модалку (тільки board)
let _boardCollapseRef = null;   // покажчик на актуальний collapse (оновлюється при кожному init)
let _boardTabHookSet = false;   // слухач зміни вкладки вішаємо лише раз
// Відкрити модалку оголошення ПОЗА Дошкою (напр. з приватного чату), без картки-джерела.
// Самодостатня: власна підкладка + той самий renderAdModal + галерея + свайп-закрити.
// z-index інлайном вище за чат (.pm-screen=2401), щоб лягти ПОВЕРХ нього.
// Дротування дзеркалить expand() (свідоме дрібне дублювання — щоб не чіпати робочу Дошку).
export function openAdModalStandalone(post) {
  if (!post) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'board-backdrop';
  backdrop.style.zIndex = '2599';
  const modal = document.createElement('article');
  modal.className = 'cm-board-note cm-board-modal-note cm-board-modal--sheet';
  modal.style.zIndex = '2600';
  if (post.id != null) modal.dataset.postId = post.id;
  modal.innerHTML = renderAdModal(post);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  document.body.classList.add('cm-zoom-open');
  hydrateNames(modal);   // живе імʼя автора оголошення за uid
  attachSubheadShadow(modal);   // тінь під липким блоком — лише коли текст пішов під нього

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    modal.classList.remove('visible');
    backdrop.classList.remove('visible');
    document.body.classList.remove('cm-zoom-open');
    setTimeout(() => { modal.remove(); backdrop.remove(); }, 240);
  };
  backdrop.addEventListener('click', close);

  // Галерея фото: тап → повний екран; крапки оновлюються при свайпі
  const gallery = modal.querySelector('.cm-board-modal-gallery');
  if (gallery) {
    const photoUrls = [...gallery.querySelectorAll('[data-photo-full]')].map(im => im.dataset.photoFull);
    gallery.querySelectorAll('img[data-photo-idx]').forEach(im => {
      im.addEventListener('click', e => { e.stopPropagation(); openPhotoLightbox(photoUrls, Number(im.dataset.photoIdx) || 0); });
    });
    const dots = modal.querySelectorAll('.cm-board-modal-dot');
    if (dots.length) {
      gallery.addEventListener('scroll', () => {
        const i = gallery.clientWidth ? Math.round(gallery.scrollLeft / gallery.clientWidth) : 0;
        dots.forEach((d, di) => d.classList.toggle('active', di === i));
      }, { passive: true });
    }
  }

  // Свайп вниз → закрити (грип або скролер угорі); горизонталь = свайп галереї
  const area = modal.querySelector('.cm-board-modal-scrollarea');
  const scroller = area || modal;
  const grip = modal.querySelector('.cm-board-modal-bar');
  let sY = 0, sX = 0, canSwipe = false, swiping = false, travel = 1;
  const drag = createDragTracker();   // швидкість пальця → нативне завершення жесту
  const fade = createBackdropFade(backdrop);   // затемнення світлішає разом з рухом
  modal.addEventListener('touchstart', e => {
    const onGrip = grip && (e.target === grip || grip.contains(e.target));
    canSwipe = onGrip || scroller.scrollTop <= 2;
    sY = e.touches[0].clientY; sX = e.touches[0].clientX; swiping = false;
    travel = centeredRemaining(modal);   // шлях до нижнього краю — міряємо раз за жест
    drag.start(sY);
    if (canSwipe) modal.style.transition = 'none';
  }, { passive: true });
  modal.addEventListener('touchmove', e => {
    if (!canSwipe) return;
    const dy = e.touches[0].clientY - sY;
    const dx = e.touches[0].clientX - sX;
    if (!swiping && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) { canSwipe = false; return; }
    if (dy > 0) { e.preventDefault(); swiping = true; modal.style.transform = `translate(-50%, calc(-50% + ${dy}px)) scale(1)`; fade?.track(dy / travel); }
    else if (swiping) { modal.style.transform = 'translate(-50%, -50%) scale(1)'; fade?.track(0); }
    drag.move(e.touches[0].clientY);
  }, { passive: false });
  modal.addEventListener('touchend', e => {
    if (!canSwipe) return;
    const dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : sY) - sY;
    // Летить донизу за пальцем, а не замирає на місці: close() лише знімає .visible
    // (згасання), а куди їхати — домальовує інлайн transform із sheet-motion.
    finishSwipe({
      panel: modal, dy: swiping ? dy : 0, velocity: drag.velocity,
      remaining: centeredRemaining(modal),
      dismissTransform: `translate(-50%, calc(-50% + ${Math.round(dy + centeredRemaining(modal))}px)) scale(1)`,
      onDismiss: () => close(),
      backdrop: fade,
    });
    swiping = false; canSwipe = false;
  }, { passive: true });

  requestAnimationFrame(() => { backdrop.classList.add('visible'); modal.classList.add('visible'); });
}

function initBoardNoteExpand(root) {
  const backdrop = root.querySelector('#board-backdrop');
  if (!backdrop) return;

  let activeNote = null;
  let activeModal = null;
  let isAnimating = false;
  const DURATION = 240;

  const expand = (note) => {
    if (isAnimating || activeNote) return;
    isAnimating = true;

    const modal = document.createElement('article');
    modal.className = note.className + ' cm-board-modal-note';
    // Будуємо модалку З ДАНИХ поста (а не клон HTML картки) — фото flush зверху,
    // повний текст, чорний колір, без обрізки фото скролом. Fallback на клон якщо
    // пост раптом не знайдено (officials виключені, тож для оголошень не трапляється).
    const post = allPosts.find(x => String(x.id) === note.dataset.postId);
    if (note.dataset.postId) modal.dataset.postId = note.dataset.postId;  // для кнопки «Повідомлення»
    modal.innerHTML = post
      ? renderAdModal(post)
      : `<div class="cm-board-modal-scrollarea"><div class="cm-board-modal-content">${note.innerHTML}</div></div>`;
    document.body.appendChild(modal);
    document.body.classList.add('cm-zoom-open');   // блокуємо скрол фону (.app-main)
    hydrateNames(modal);   // живе імʼя автора оголошення за uid
    attachSubheadShadow(modal);   // тінь під липким блоком — лише коли текст пішов під нього

    modal.querySelectorAll('.cm-board-call').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); }, { capture: true });
    });

    // Галерея фото: тап по фото → повноекранний перегляд; крапки+лічильник оновлюються при свайпі
    const gallery = modal.querySelector('.cm-board-modal-gallery');
    if (gallery) {
      const photoUrls = [...gallery.querySelectorAll('[data-photo-full]')].map(im => im.dataset.photoFull);
      gallery.querySelectorAll('img[data-photo-idx]').forEach(im => {
        im.addEventListener('click', e => {
          e.stopPropagation();
          openPhotoLightbox(photoUrls, Number(im.dataset.photoIdx) || 0);
        });
      });
      const dots = modal.querySelectorAll('.cm-board-modal-dot');
      if (dots.length) {
        gallery.addEventListener('scroll', () => {
          const i = gallery.clientWidth ? Math.round(gallery.scrollLeft / gallery.clientWidth) : 0;
          dots.forEach((d, di) => d.classList.toggle('active', di === i));
        }, { passive: true });
      }
    }

    const area = modal.querySelector('.cm-board-modal-scrollarea');

    // Свайп вниз → закрити (перевірений патерн як у модалці статей: рішення на touchstart).
    // Дозволяємо коли жест почався НА СМУЖЦІ-РУЧЦІ (.cm-board-modal-bar) — працює ЗАВЖДИ, навіть
    // коли опис прокручено; АБО коли скролер угорі (scrollTop<=2). Горизонталь = свайп галереї.
    const scroller = area || modal;
    const grip = modal.querySelector('.cm-board-modal-bar');
    let sY = 0, sX = 0, canSwipe = false, swiping = false, travel = 1;
    const drag = createDragTracker();   // швидкість пальця → нативне завершення жесту
    const fade = createBackdropFade(backdrop);   // затемнення світлішає разом з рухом
    modal.addEventListener('touchstart', e => {
      const onGrip = grip && (e.target === grip || grip.contains(e.target));
      canSwipe = onGrip || scroller.scrollTop <= 2;
      sY = e.touches[0].clientY;
      sX = e.touches[0].clientX;
      swiping = false;
      travel = centeredRemaining(modal);   // шлях до нижнього краю — міряємо раз за жест
      drag.start(sY);
      if (canSwipe) modal.style.transition = 'none';
    }, { passive: true });
    modal.addEventListener('touchmove', e => {
      if (!canSwipe) return;
      const dy = e.touches[0].clientY - sY;
      const dx = e.touches[0].clientX - sX;
      // Перший рух горизонтальний → це свайп галереї, не закриття
      if (!swiping && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) { canSwipe = false; return; }
      if (dy > 0) {
        e.preventDefault();
        swiping = true;
        modal.style.transform = `translate(-50%, calc(-50% + ${dy}px)) scale(1)`;
        fade?.track(dy / travel);            // фон світлішає разом з рухом
      } else if (swiping) {
        modal.style.transform = 'translate(-50%, -50%) scale(1)';
        fade?.track(0);
      }
      drag.move(e.touches[0].clientY);
    }, { passive: false });
    modal.addEventListener('touchend', e => {
      if (!canSwipe) return;
      const dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : sY) - sY;
      // Летить донизу за пальцем, а не замирає на місці: collapse() лише знімає
      // .visible (згасання), а куди їхати — домальовує інлайн transform.
      finishSwipe({
        panel: modal, dy: swiping ? dy : 0, velocity: drag.velocity,
        remaining: centeredRemaining(modal),
        dismissTransform: `translate(-50%, calc(-50% + ${Math.round(dy + centeredRemaining(modal))}px)) scale(1)`,
        onDismiss: () => collapse(),
        backdrop: fade,
      });
      swiping = false; canSwipe = false;
    }, { passive: true });

    activeNote = note;
    activeModal = modal;

    note.classList.add('cm-board-note--hidden');

    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
      modal.classList.add('visible');
    });

    setTimeout(() => { isAnimating = false; }, DURATION);
  };

  const collapse = () => {
    if (!activeNote || !activeModal || isAnimating) return;
    isAnimating = true;

    const note = activeNote;
    const modal = activeModal;

    modal.classList.remove('visible');
    backdrop.classList.remove('visible');
    note.classList.remove('cm-board-note--hidden');
    document.body.classList.remove('cm-zoom-open');   // розблоковуємо скрол фону

    setTimeout(() => {
      modal.remove();
      activeNote = null;
      activeModal = null;
      isAnimating = false;
    }, DURATION);
  };

  // Тільки cm-board-note (стікери) розгортаються — chat/greeting не клонуються
  root.querySelectorAll('.cm-board-note:not(.cm-board-note--official):not(.cm-board-modal-note)').forEach(note => {
    note.addEventListener('click', e => {
      e.stopPropagation();
      if (isAnimating) return;
      if (!activeNote) expand(note);
    });
  });

  backdrop.addEventListener('click', collapse);

  // Перемикання на будь-яку іншу вкладку меню → закрити модалку (вона лише для Дошки).
  _boardCollapseRef = collapse;
  if (!_boardTabHookSet) {
    _boardTabHookSet = true;
    window.addEventListener('cstl-tab-changed', () => { if (_boardCollapseRef) _boardCollapseRef(); });
  }
}

// ── Document-level listener для збереженого + share ─────────────────────────
// Один раз при initBoard. Працює і для оригінальних, і для клонів у zoom-модалці.
// Submit-слухач форми коментаря — у board-discussions.js (attachDiscussionsDelegation).

let _delegationAttached = false;
function attachBoardDelegation() {
  if (_delegationAttached) return;
  _delegationAttached = true;

  document.addEventListener('click', e => {
    // Тап по картці обговорення → повноекранна модалка-чат
    const chatCard = e.target.closest('[data-chat-open]');
    if (chatCard && !e.target.closest('.bd-chat-modal')
        && !e.target.closest('[data-save-id]') && !e.target.closest('[data-share-board]')
        && !e.target.closest('[data-like-id]')) {
      const id = Number(chatCard.dataset.chatOpen);
      const post = allPosts.find(p => p.id === id);
      if (post) openChatModal(post);
      return;
    }

    // Кнопка «Повідомлення» 💬 — приватний чат з автором оголошення
    const msgBtn = e.target.closest('[data-open-chat]');
    if (msgBtn) {
      e.stopPropagation();
      const holder = msgBtn.closest('[data-post-id]');
      const id = holder ? Number(holder.dataset.postId) : null;
      const post = id != null ? allPosts.find(p => p.id === id) : null;
      if (post) startChatFromPost(post);
      else showToast('Не вдалося відкрити чат', 2500);
      return;
    }

    // Усе всередині inline-форми коментарів — не пропускаємо до zoom-модалки
    // (форма має data-comment-form="<id>" і знаходиться у CHAT-картці, не у board)
    if (e.target.closest('[data-comment-form]') || e.target.closest('[data-comment-input]')) {
      e.stopPropagation();
      return;
    }

    // Зберегти / прибрати закладку
    const saveBtn = e.target.closest('[data-save-id]');
    if (saveBtn) {
      e.stopPropagation();
      // Гейтинг (Етап 2): зберігати у «Мої» (закладки) — лише залогінені.
      if (!isLoggedIn()) { requireAuth('зберігати оголошення', () => {}); return; }
      const id = Number(saveBtn.dataset.saveId);
      toggleSaved(id);
      const nowSaved = isSaved(id);
      saveBtn.innerHTML = nowSaved ? BOOKMARK_FILLED_SVG : BOOKMARK_OUTLINE_SVG;
      saveBtn.classList.toggle('bd-bookmark--active', nowSaved);
      saveBtn.setAttribute('aria-label', nowSaved ? 'Прибрати зі збережених' : 'Зберегти у Мої');
      // Якщо у табі «Мої» прибираємо — закрити відкриту зум-модалку (клік по backdrop
      // → collapse) і перерендерити стрічку (картка зникає)
      if (activeType === 'saved' && !nowSaved) {
        document.querySelector('#board-backdrop.visible')?.click();
        renderBodyOnly();
      }
      return;
    }

    // Лайк теми обговорення — логіка (optimistic + відкат) у board-discussions.js
    const likeBtn = e.target.closest('[data-like-id]');
    if (likeBtn) {
      e.stopPropagation();
      handleLikeClick(likeBtn);
      return;
    }

    // Share — SVG-кнопка зі стрілкою
    const shareBtn = e.target.closest('[data-share-board]');
    if (shareBtn) {
      e.stopPropagation();
      sharePost({
        title: shareBtn.dataset.shareTitle,
        url:   shareBtn.dataset.shareUrl,
      });
      return;
    }
  }, { capture: true });
}

// Realtime коментарів/лайків обговорень — у board-discussions.js
// (attachDiscussionsRealtime, викликається з initBoard нижче).

// ── «Обговорення» як повноекранний overlay поверх вкладки «Чати» (варіант Б) ──
// Той самий рушій board.js (картки/коментарі/realtime) рендериться у
// #disc-content замість сторінки Дошки. Таб-бар лишається на «Чати».
let discOpen = false;

// Корінь рендера Дошки: відкритий overlay → #disc-content, інакше → #board-content.
// Щоб не було ДУБЛІВ id (bd-body/board-fab/...) — контент тримаємо лише в одному
// корені за раз (openDiscussions чистить board-content, closeDiscussions відновлює).
function getBoardRoot() {
  return discOpen
    ? document.getElementById('disc-content')
    : document.getElementById('board-content');
}

// Обговорення тепер СПРАВЖНЯ сторінка (#page-discussions .page) — її показує/ховає
// window.switchTab('discussions'). Ці дві функції лише РЕНДЕРЯТЬ контент у потрібний
// корінь; викликаються слухачем cstl-tab-changed при вході/виході на вкладку.
// (Повне розчеплення стану/id від Дошки — Потік 2.)
export function openDiscussions() {
  // Прибрати контент Дошки, поки активні Обговорення (спільні id #board-* — Потік 2).
  const boardEl = document.getElementById('board-content');
  if (boardEl) boardEl.innerHTML = '';
  discOpen = true;
  activeType = 'chat';
  activeCategory = 'all';
  searchQuery = '';
  // Дані вже в пам'яті (initBoard→renderBoard при старті) — рендеримо миттєво.
  if (allPosts && allPosts.length) renderAll();
  else renderBoard();
}

export function closeDiscussions() {
  discOpen = false;
  activeType = 'board';
  activeCategory = 'all';
  searchQuery = '';
  // Очистити #disc-content (спільні id з Дошкою) СИНХРОННО, потім відновити Дошку
  // в #board-content. Порядок важливий — жодного вікна з дубль-id (лікує F1 на закритті).
  const c = document.getElementById('disc-content');
  if (c) c.innerHTML = '';
  renderAll();
}

// Зовнішнє переключення активного типу (для CTA з міні-блока Дошки на Громаді).
// type: 'all' | 'board' | 'chat' | 'greeting' | 'saved'
export function setBoardActiveType(type) {
  if (!type) return;
  if (type === 'chat') { window.switchTab('discussions'); return; }   // Обговорення → вкладка
  activeType = type;
  activeCategory = 'all';
  searchQuery = '';
  renderAll();
}

// Відкрити чат обговорення за id поста — для хаба «Збережені» в шапці.
// Якщо дошка ще не рендерилась (allPosts порожній) — спершу тягнемо дані.
export async function openChatById(postId) {
  if (!allPosts.length) { try { await renderBoard(); } catch (_) { /* fail-soft */ } }
  const post = allPosts.find(p => p.id === postId);
  if (post) openChatModal(post);
}

// Deep-link (6b): відкрити елемент Дошки за id — оголошення АБО обговорення.
// Сам визначає тип поста (chat → Обговорення-чат, інше → модалка оголошення) і
// перемикає на потрібну вкладку. Холодний старт — дочекатись даних (await renderBoard).
export async function openBoardItemById(postId) {
  if (!allPosts.length) { try { await renderBoard(); } catch (_) { /* fail-soft */ } }
  const post = allPosts.find(p => p.id === postId);
  if (!post) return;
  if (post.type === 'chat') { window.switchTab?.('discussions'); openChatModal(post); }
  else                      { window.switchTab?.('board');       openAdModalStandalone(post); }
}

// Відступ тіла Дошки = реальна висота «прибитої» шапки (.bd-controls), щоб картки
// не залазили під неї. Раніше це було магічне число в CSS (padding-top), яке «пливло»
// щоразу як у шапку щось додавали (Д-11 його зламав, додавши заголовок). Тепер міряємо
// висоту в рантаймі → self-correcting: хоч би що додали в шапку, картки сядуть рівно під нею.
const BOARD_BODY_GAP = 12;   // зазор між нижнім краєм шапки і верхом коркової панелі
function syncBoardBodyOffset() {
  const root = getBoardRoot();
  // Рахуємо для БУДЬ-ЯКОГО типу (board/chat/saved) — міряємо реальну висоту .bd-controls.
  // Раніше було тільки board → у Обговореннях лишався запасний CSS-відступ 140px, хоча
  // їхня шапка нижча (нема titlebar+чіпів) → картки сиділи задалеко від пошуку (Вова 14.07).
  if (!root) return;
  const controls = root.querySelector('.bd-controls');
  const body = root.querySelector('.bd-body');
  if (!controls || !body) return;
  // Міряємо лише коли шапка РОЗГОРНУТА.
  // 🔄 Уточнено 28.07: після переходу згортання на `transform` (див. блок «ЗГОРТАННЯ
  // ШАПКИ ДОШКИ» у `style/community.css`) `offsetHeight` у згорнутому стані вже НЕ
  // занижений — `transform` не змінює розмірів у розкладці, лише малювання. Тобто цей
  // ранній вихід більше не рятує від стрибка (стрибка більше нема за побудовою), він
  // просто економить зайвий перемір. Лишаю навмисно: якщо колись хтось повернеться до
  // згортання через висоту, перевірка знову стане запобіжником.
  if (controls.classList.contains('bd-controls--collapsed')) return;
  const h = controls.offsetHeight;
  if (h > 0) body.style.paddingTop = (h + BOARD_BODY_GAP) + 'px';   // h=0 → вкладка схована, лишаємо CSS-запас
}

// Динамічний розмір імені автора у футері картки (рішення Вови): коротке ім'я —
// більше (до MAX, добре видно), довге — зменшується рівно доки не влізе в ОДИН рядок
// у ДОСТУПНЕ місце (ширина футера − кнопки − gap; до MIN); якщо й на MIN не влазить —
// трикрапка (CSS). Реальну ширину гліфів міряємо через Range.getBoundingClientRect()
// — не залежить від контейнера/overflow (scrollWidth/max-content у flex тут брешуть).
function fitBoardAuthors() {
  const MAX = 12.5, MIN = 6.5, STEP = 0.5, PAD = 4;
  const range = document.createRange();
  // 🔴 28.07 (/byyou, крок 4) — ЛИШЕ ФУТЕРИ КАРТОК, і це важливо.
  // Раніше добір ішов по ВСІХ `.cm-board-foot`, тобто зачіпав і зум-модалку. А модалці
  // це шкодить: там імені задано 13px у CSS, і функція мовчки перебивала його інлайновим
  // стилем ≤12.5px — досить було живому оновленню списку (`renderBodyOnly`) статись, поки
  // модалка відкрита. Дефект був невидимий, бо збіг лише за 0.5px і лише інколи.
  // ⚠️ Після переїзду НП у футер (крок 1) на картках імені НЕМА зовсім, тож зараз цикл
  // не робить нічого. Функцію НЕ видаляю без слова Вови (HOT_RULES №9) — вона знадобиться,
  // якщо ім'я колись повернуть на картку. Але шкодити модалці вона більше не може.
  document.querySelectorAll('.cm-board-foot--card').forEach(foot => {
    if (!foot.clientWidth) return;            // схований — пропускаємо (перерахуємо при вході на вкладку)
    const nameEl = foot.querySelector('.cm-board-foot-who .cm-board-author--card');
    const actions = foot.querySelector('.cm-board-foot-actions');
    if (!nameEl) return;
    const fcs = getComputedStyle(foot);
    const gap = parseFloat(fcs.columnGap) || parseFloat(fcs.gap) || 0;
    const avail = foot.clientWidth - (actions ? actions.offsetWidth : 0) - gap - PAD;
    let size = MAX;
    nameEl.style.fontSize = size + 'px';
    range.selectNodeContents(nameEl);
    while (size > MIN && range.getBoundingClientRect().width > avail) {
      size -= STEP;
      nameEl.style.fontSize = size + 'px';
      range.selectNodeContents(nameEl);       // переміряти гліфи після зміни шрифту
    }
  });
}

// Закрити обидва меню-фільтри Дошки (категорії + локація).
let _boardMenusWired = false;
function closeBoardMenus() {
  [['bd-cat-menu', 'bd-cat-filter'], ['bd-loc-menu', 'bd-loc-btn']].forEach(([menuId, btnId]) => {
    document.getElementById(menuId)?.setAttribute('hidden', '');
    const b = document.getElementById(btnId);
    if (b) { b.classList.remove('open'); b.setAttribute('aria-expanded', 'false'); }
  });
}

// Авто-ховання шапки Дошки при скролі. Слухач на .app-main (справжній скролер),
// rAF-throttle (як hero-blur у community.js). Ховаємо назву+категорії лише коли
// прогорнули «через деякий час» (THRESHOLD) і напрямок — вниз; вгору → показуємо.
let _headerCollapseWired = false;
function setupHeaderCollapse() {
  if (_headerCollapseWired) return;
  const main = document.querySelector('.app-main');
  if (!main) return;
  _headerCollapseWired = true;
  // Скільки треба проскролити У НАПРЯМКУ щоб перемкнути шапку (накопичувально —
  // рахуємо пройдений шлях від зміни напрямку, а не миттєвий рух). Більше = пізніше
  // реагує, плавніше. При зміні напрямку протилежний лічильник скидається (гістерезис —
  // немає смикання на межі). Числа підбираються за відчуттям на телефоні.
  //
  // 🔄 ПЕРЕБАЛАНСОВАНО 28.07, і асиметрія тепер ОБЕРНЕНА. До цього ховалась лише
  // декоративна назва «ДОШКА ОГОЛОШЕНЬ», тому й було 80 сховати / 320 повернути:
  // назву не шкода забрати рано, а повертати її сенсу мало.
  // Тепер ховається ВСЯ шапка — разом із пошуком і фільтрами, тобто з робочим
  // інструментом. Отже:
  //   • ховати ПОЗЖЕ (110, не 80) — випадковий короткий рух пальцем не має забирати
  //     пошук з-під носа;
  //   • повертати ШВИДКО (70, не 320) — рух угору майже завжди означає «хочу
  //     назад / хочу шукати», і 320px там читались би як «шапка застрягла».
  // Це патерн Twitter/Instagram: приховування навмисне, повернення миттєве.
  const TOP_ZONE   = 90;   // біля самого верху шапка завжди повна (не чіпаємо) — розгортання одразу
  const HIDE_AFTER = 110;  // px донизу від зміни напрямку → СХОВАТИ шапку цілком
  const SHOW_AFTER = 70;   // px вгору від зміни напрямку → ПОВЕРНУТИ шапку
  let lastY = main.scrollTop;
  let accDown = 0, accUp = 0;   // накопичений шлях у кожному напрямку
  let collapsed = false;
  let ticking = false;
  const setCollapsed = (v) => {
    if (v === collapsed) return;   // не чіпаємо клас якщо стан не змінився → без миготіння
    collapsed = v;
    getBoardRoot()?.querySelector('.bd-controls')?.classList.toggle('bd-controls--collapsed', v);
  };
  const apply = () => {
    ticking = false;
    if (main.dataset.tab !== 'board') return;   // тільки вкладка Дошка
    const y = main.scrollTop;
    const dy = y - lastY;
    lastY = y;
    if (y <= TOP_ZONE) { setCollapsed(false); accDown = accUp = 0; return; }  // верх — завжди повна
    if (dy > 0) {                 // рух вниз
      accDown += dy; accUp = 0;   // зміна напрямку скидає протилежний лічильник
      if (accDown >= HIDE_AFTER) setCollapsed(true);
    } else if (dy < 0) {          // рух вгору
      accUp -= dy; accDown = 0;
      if (accUp >= SHOW_AFTER) setCollapsed(false);
    }
  };
  main.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(apply); }
  }, { passive: true });
  // Зміна розміру екрана (поворот, зміна вікна) → перерахувати відступ тіла під шапку.
  window.addEventListener('resize', () => requestAnimationFrame(() => { syncBoardBodyOffset(); fitBoardAuthors(); }), { passive: true });
}

export function initBoard() {
  // Двигун Обговорень: доступ до постів (ін'єкція — board.js лишається власником
  // стану allPosts), слухач форми коментаря, realtime-підписки.
  initDiscussionsEngine({ getPosts: () => allPosts });
  attachDiscussionsDelegation();
  attachDiscussionsRealtime();
  attachBoardDelegation();
  renderBoard();
  // Відкрити модалку оголошення з чату («Переглянути оголошення →» в розмові)
  window.addEventListener('cstl-open-ad', (e) => {
    const p = e.detail && e.detail.post;
    if (p) openAdModalStandalone(p);
  });
  // Зміна статусу власних постів («Мої оголошення»: завершити/повернути/видалити)
  // і публікація нового — зміна має бути видима одразу, без перезапуску застосунку.
  // ⚠️ Саме `refreshBoardKeepingPlace`, а не `renderBoard`: друге збирає вкладку заново
  // і кидає на початок списку (та сама скарга, що була у «Стрічці» 27.07).
  window.addEventListener('cstl-posts-changed', () => refreshBoardKeepingPlace());

  // ── ЖИВА СИНХРОНІЗАЦІЯ ОГОЛОШЕНЬ (Вова 26.07) ──────────────────────────────────
  // Досі підписки на `posts` не було: нове оголошення сусіда зʼявлялось лише після
  // перезаходу на вкладку. `cstl-posts-changed` вище — подія ОДНОГО пристрою (мої власні
  // дії), вона нікуди не летить.
  //
  // ⚠️ Чому не перемальовуємо одразу на кожну подію: `renderBoard()` перезавантажує і
  // перемальовує весь список. Якщо людина саме гортає оголошення — список стрибне під
  // пальцем (та сама сім'я, що HOT_RULES №10). Тому:
  //   • Дошка не активна → лише позначка «дані змінились», перемалюємо при вході;
  //   • активна і людина ВГОРІ списку (нічого не читає всередині) → одразу;
  //   • активна, але прогорнута → чекаємо, поки повернеться вгору або вийде з вкладки.
  if (isSupabaseReady()) {
    subscribePosts(() => {
      const main = document.querySelector('.app-main');
      const onBoard = main?.dataset.tab === 'board';
      if (onBoard && (main?.scrollTop || 0) < 120) renderBoard();
      else _boardStale = true;
    });
    // Повернення вгору — момент, коли перемалювати безпечно.
    document.querySelector('.app-main')?.addEventListener('scroll', () => {
      const main = document.querySelector('.app-main');
      if (!_boardStale || main?.dataset.tab !== 'board') return;
      if ((main.scrollTop || 0) < 120) { _boardStale = false; renderBoard(); }
    }, { passive: true });
  }
  // Обговорення — справжня сторінка: рендеримо її контент при ВХОДІ на вкладку
  // і відновлюємо Дошку при ВИХОДІ (board.js поки рендерить обидві; розділ — Потік 2).
  window.addEventListener('cstl-tab-changed', () => {
    const tab = document.querySelector('.app-main')?.dataset.tab;
    if (tab === 'discussions' && !discOpen) openDiscussions();
    else if (tab !== 'discussions' && discOpen) closeDiscussions();
    // Д-12: фільтр локації скидається на «Уся громада» при кожному вході на Дошку.
    if (tab === 'board' && activeLocation !== COMMUNITY_ALL) {
      activeLocation = COMMUNITY_ALL;
      renderAll();
    }
    // Поки нас не було, хтось подав/змінив оголошення (жива підписка це помітила) —
    // вхід на вкладку і є безпечний момент показати свіже.
    if (tab === 'board' && _boardStale) { _boardStale = false; renderBoard(); }
    // Відступ під шапку: при ВХОДІ на Дошку вкладка щойно стала видимою, тому
    // тепер .bd-controls має реальну висоту (на старті вона була схована → offsetHeight=0
    // → вимір не спрацьовував). Міряємо тут. rAF — дочекатись layout після показу.
    if (tab === 'board') requestAnimationFrame(() => { syncBoardBodyOffset(); fitBoardAuthors(); });
  });
  // Авто-ховання шапки при скролі Дошки (гортаєш вниз — ховаються назва+категорії;
  // вгору — з'являються). Лічильник/локація + пошук лишаються закріпленими.
  setupHeaderCollapse();
  // Вхід/вихід → перезавантажити дошку: закладки, підсвітку «моє», таб «Збережені».
  onAuthChange(() => {
    if (!isLoggedIn()) {
      setSavedIds(new Set());
      if (activeType === 'saved') activeType = 'board';   // персональний таб зник
    }
    renderBoard();
    // Відкрита модалка чату обговорення: перезібрати низ (форма/кнопка входу) —
    // логіка у board-discussions.js (перевіряє чи модалка відкрита).
    handleDiscussionsAuthChange();
  });
}
