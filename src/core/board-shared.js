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

// ── Заголовок картки оголошення ──────────────────────────────────────────────
// 🔑 ПЕРЕЇХАЛО СЮДИ 06.08 з `tabs/board.js`: споживачів стало двоє — список Дошки
// і картка профілю (`core/profile-card.js`), а `core` не має імпортувати з `tabs`.
//
// 🔴 ЧОМУ ЗАГОЛОВОК ВЗАГАЛІ РАХУЄТЬСЯ, А НЕ БЕРЕТЬСЯ ЯК `title || text`.
// Заміряно в живій базі: з 19 опублікованих оголошень **9 не мають назви взагалі**,
// і картка підставляла в заголовок УВЕСЬ текст, найдовший — 1296 символів. Поки
// заголовок був 14.5px і тихий, це просто обрізалось двома рядками. Коли він став
// капсом 16px/800 (03.08), той самий прийом дав би на пів списку стіну крику,
// обрізану посеред слова. Тому безназвене оголошення дістає заголовок З ТЕКСТУ —
// перше речення, — а решта тексту йде в опис під ним.
export const CARD_TITLE_MAX = 80;   // стеля поля вводу (`#bm-title maxlength="80"`) — та сама
// 🔴 Для ЗАГОЛОВКА, ВИТЯГНУТОГО З ТЕКСТУ, стеля інша — і ось чому.
// Заміряно: у два рядки капсом при 16px влазить ~34-40 символів. Якщо взяти з тексту
// цілих 80, клемп обріже показ на другому рядку, а опис під ним почнеться з 81-го
// символа — і шматок посередині не побачить НІХТО. На знімку це виглядало так:
// «ПРОДАМ КОРОВУ ТІЛЬНУ ТРЕТІМ ТЕЛЯМ СПОКІЙНА…» / «дзвоніть у будь-який час», а «дійна
// добре їсть ціна договірна» зникло між ними.
// Для НАПИСАНОЇ людиною назви такої проблеми немає: вона самостійна одиниця, а не
// початок абзацу, і обрізати її показом — нормально.
export const CARD_HEAD_MAX = 40;

// Обрізка по СЛОВУ, а не по символу: «ПРОДАМ БУДИНОК В ЖОРНИ…» читається, а
// «ПРОДАМ БУДИНОК В ЖОРН…» — ні. Ріжемо по пробілу, якщо він не надто рано (60% межі),
// інакше довге слово лишило б від заголовка недоречно короткий огризок.
export function clampChars(s, max) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp  = cut.lastIndexOf(' ');
  const body = sp > max * 0.6 ? cut.slice(0, sp) : cut;
  return body.replace(/[\s,;:.!?—–-]+$/u, '') + '…';
}

// Заголовок картки: назва, а якщо її немає — перше речення тексту.
// ⚠️ Регулярка навмисно вимагає, щоб речення ЗАКІНЧУВАЛОСЬ розділовим знаком або
// текстом: коли в перших 80 символах крапки немає, збігу не буде і ми чесно впадемо
// в обрізку по словах. Інакше «перше речення» на суцільному тексті без крапок
// віддавало б усі 1296 символів.
export function cardTitleText(p) {
  const title = (p.title || '').trim();
  if (title) return clampChars(title, CARD_TITLE_MAX);
  const text = (p.text || '').trim();
  if (!text) return '';
  const m = text.match(new RegExp(`^[^.!?\\n]{1,${CARD_HEAD_MAX}}(?=[.!?\\n]|$)`, 'u'));
  return clampChars((m ? m[0] : text).trim(), CARD_HEAD_MAX);
}

// ── «Востаннє відкривав Дошку» ───────────────────────────────────────────────
// 🔴 17.08 — ключ для капсули «НОВЕ» на Громаді. Тримає ОДНЕ число: коли людина
// востаннє заходила на вкладку Дошки. Нічого особистого, зникає з даними сайту.
//
// 🔑 Зроблено ТОЧНО ТАК САМО, як `cstl_news_seen_ts` у новинах, включно з
// поведінкою першого запуску: **перший раз віддає 0, а не «17 нових»**. Людина,
// яка щойно поставила застосунок, нічого не пропускала — для неї нове все, і
// тривожне число за весь архів Дошки було б неправдою того самого ґатунку, що
// «LIVE». Тому позначку ставимо одразу і мовчки.
//
// ⚠️ Живе в `core/`, а не в `tabs/board.js`, бо читає це Громада, а пише Дошка —
// а `core` не має імпортувати з `tabs` (правило проти циклу, див. шапку файла).
const BOARD_SEEN_KEY = 'cstl_board_seen_ts';

export function boardSeenTs() {
  const v = Number(localStorage.getItem(BOARD_SEEN_KEY) || 0);
  return Number.isFinite(v) ? v : 0;
}

export function markBoardSeen() {
  try { localStorage.setItem(BOARD_SEEN_KEY, String(Date.now())); } catch (_) {}
}

// ── КОЛИ Я ОСТАННІЙ РАЗ БУВ У ПИТАННЯХ (21.08) ───────────────────────────────
//
// 🔑 Третя позначка того самого ґатунку (Новини · Дошка · Питання) — і навмисно
// точно така сама, до поведінки першого запуску включно: **перший раз віддає 0**.
// Людина, яка щойно поставила застосунок, нічого не пропускала; «8 нових питань»
// за весь архів було б неправдою.
//
// 🛑 ЧОМУ ЧАС ВІЗИТУ, А НЕ «ЧИ ДОСКРОЛИВ ДО ПИТАННЯ». Порада рахувати реальне
// потрапляння в поле зору звучить точніше, але для восьми питань на одному
// екрані це різниця без різниці — зате новий стан, нове сховище і новий спосіб
// збрехати. Проєкт цю розвилку вже проходив на Дошці й обрав час візиту; друга
// модель «баченого» в тому самому застосунку розійшлася б із першою.
const CHAT_SEEN_KEY = 'cstl_chat_seen_ts';

export function chatSeenTs() {
  const v = Number(localStorage.getItem(CHAT_SEEN_KEY) || 0);
  return Number.isFinite(v) ? v : 0;
}

export function markChatSeen() {
  try { localStorage.setItem(CHAT_SEEN_KEY, String(Date.now())); } catch (_) {}
}

// ── КОЛИ Я ОСТАННІЙ РАЗ БУВ У СТРІЧЦІ (22.08) ────────────────────────────────
//
// 🔑 Четверта позначка того самого ґатунку (Новини · Дошка · Питання · Стрічка),
// і навмисно точно така сама, до поведінки першого запуску включно: **перший раз
// віддає 0**. Хто щойно поставив застосунок — нічого не пропускав.
//
// 🛑 ЧОМУ ЧАС ВІЗИТУ ВКЛАДКИ, А НЕ «ЧИ ВІДКРИВАВ ЛИСТ КОМЕНТАРІВ». Заперечення
// чесне: відкрити Стрічку і побачити коментарі під СВОЇМ дописом — не те саме,
// бо коментарі лежать усередині листа. Але проєкт цю саму розвилку вже проходив
// у Питаннях (там відкрити вкладку теж не означає відкрити своє питання) і
// свідомо обрав час візиту: друга модель «баченого» в тому самому застосунку
// розійшлася б із першою, а розходження двох лічильників тут уже коштувало
// бага B-27. Одна модель на чотири поверхні дорожча за точність в одній.
const FEED_SEEN_KEY = 'cstl_feed_seen_ts';

export function feedSeenTs() {
  const v = Number(localStorage.getItem(FEED_SEEN_KEY) || 0);
  return Number.isFinite(v) ? v : 0;
}

export function markFeedSeen() {
  try { localStorage.setItem(FEED_SEEN_KEY, String(Date.now())); } catch (_) {}
}

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

// ── Синхронізація ВИГЛЯДУ кнопок закладки з памʼяттю ─────────────────────────
//
// 🆕 23.08 — потрібна тому, що закладку тепер ставить не лише сам тап по ній:
// «Мене теж цікавить» у Питаннях кладе питання у «Збережені» (рішення Вови
// 23.08). Кнопка при цьому лишається на екрані намальованою по-старому, і без
// цієї функції людина бачила б порожню закладку над щойно збереженим питанням —
// тобто рівно те приховане зчеплення, проти якого Вова й заперечував.
//
// ⚠️ Свідомо НЕ зводимо сюди обробник кліку з `board.js`. Він робить більше:
// закриває зум-модалку оголошення і перемальовує стрічку «Мої», коли закладку
// знімають у вкладці «Збережені». Переписувати робочий обробник заради спільного
// вигляду — рівно те, від чого застерігає `HOT_RULES` №9. Тут лише ВИГЛЯД, і
// набір класів той самий, тож розходження неможливе.
export function syncSaveButtons(postId) {
  const saved = isSaved(postId);
  document.querySelectorAll(`[data-save-id="${postId}"]`).forEach((btn) => {
    btn.innerHTML = saved ? BOOKMARK_FILLED_SVG : BOOKMARK_OUTLINE_SVG;
    btn.classList.toggle('bd-bookmark--active', saved);
    // Кругла закладка поверх фото в модалці оголошення має власний клас стану.
    if (btn.classList.contains('cm-ad-round')) btn.classList.toggle('cm-ad-round--on', saved);
    btn.setAttribute('aria-label', saved ? 'Прибрати зі збережених' : 'Зберегти у Мої');
  });
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
