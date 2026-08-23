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

import { openModal, closeModal } from './modal.js';
import { fetchPublicProfile, fetchAuthorAds, cachedAvatar, nameSlotStatic } from './supabase.js';
import { avatarCircle, escapeHtml, openPhotoLightbox, formatPrice } from './utils.js';
import { ICONS } from './icons.js';
import { MONTHS_GEN } from './chat-core.js';   // укр. місяці в родовому (реюз)
import { cardTitleText } from './board-shared.js';   // той самий заголовок, що на Дошці
import { catIcon, catColor } from './board-categories.js';

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
  // 🛑 09.08 — ВІК СЮДИ НЕ ПРИХОДИТЬ І ЦЕ НАВМИСНО, не недогляд.
  // `get_public_profile` свідомо не віддає `age` (рішення Вови 09.08). Причини —
  // у шапці `scripts/supabase_official_badge.sql`; коротко: дату народження люди
  // вписували у форму, яка не попереджала про публічність, а в застосунку є
  // приватний чат і можуть бути неповнолітні. Гілка нижче лишена робочою на
  // випадок, якщо колись зʼявиться явне питання у формі профілю — тоді досить
  // повернути поле в RPC. **Не «лагодити» це, дописуючи age в SQL.**
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

  // 🔵 09.08 (потік 3) — СИНЯ ГАЛОЧКА «ОФІЦІЙНИЙ АКАУНТ», поруч з іменем.
  // 🛑 Це НЕ те саме, що бейдж «Довірений автор» вище: той малюється за `trusted`
  // («підтверджений житель», дає автопублікацію без модерації) і його ставить не
  // людина і не адмін вручну. Галочка ж означає «це справді та публічна особа»
  // і ставиться руками з адмінки (`admin_set_official`). Два різні твердження —
  // два різні знаки; звести їх в один означало б збрехати про статус людини.
  // ⚠️ `=== true`: поки міграцію не накотили, поле приходить `undefined` і знака
  // просто немає — картка виглядає точно як зараз.
  // ⚠️ Розмітка знака береться зі спільної функції, а не пишеться тут своя копія.
  // Картка профілю — єдине місце, де галочка НЕ їде гідрацією: вона малюється з
  // відповіді `get_public_profile` ще до того, як вузол потрапить у документ.
  // Але сам ЗНАК мусить бути фізично тим самим, що й скрізь — інакше два майже
  // однакові кола розійшлись би розміром при першій же правці стилю.
  // 🔵 23.08 — і не лише знак, а й ГНІЗДО навколо нього (`nameSlotStatic`):
  // саме гніздо тримає розмір «у кегль імені» і єдиний механізм вирівнювання.
  return `
    <div class="pcard">
      <div class="pcard-avwrap" data-pcard-photo="${url ? escapeHtml(url) : ''}">${av}</div>
      <div class="pcard-name">${nameSlotStatic(escapeHtml(name), p && p.official === true)}</div>
      ${meta}${badge}${bio}${since}
      <div class="pcard-ads" data-pcard-ads hidden></div>
    </div>`;
}

// ── ОГОЛОШЕННЯ АВТОРА ────────────────────────────────────────────────────────
// 🆕 06.08, замовлення Вови: «при відкритті модалки перегляду акаунту треба
// додати туди оголошення і всі оголошення автора, але щоб це було компактно».
//
// 🔑 ТРИ РІШЕННЯ, ЯКІ ВАРТО ПАМʼЯТАТИ.
//
// 1. **Список приїжджає ПІСЛЯ показу картки, окремим запитом.** Картка профілю
//    відкривається з тапу по аватару де завгодно — з чату, з обговорення, зі
//    сторінки оголошення. Чекати на другий запит, щоб показати перший екран,
//    означало б платити затримкою скрізь заради секції, якої в багатьох людей
//    просто немає. Тому блок стоїть у розмітці порожній і `hidden`, а `hidden`
//    знімається лише коли є що показати — висота не стрибає на порожньому місці.
//
// 2. **Показуємо 3, решту — за кнопкою, у тій самій картці.** Окремого екрана
//    «всі оголошення автора» свідомо НЕ заводимо: у нас 19 оголошень на всю
//    Дошку, рекорд в однієї людини — 7. Екран заради семи рядків це навігація
//    заради навігації, а нова сторінка ще й забрала б жест «назад» у картки.
//
// 3. **Заголовок рядка — той самий `cardTitleText`, що на Дошці.** 9 із 19
//    оголошень назви не мають; без цієї функції в рядок ліз би весь текст
//    (рекорд — 1296 символів). Копію не робимо — функція живе в `board-shared.js`.
function adRowHtml(p) {
  const photo = (Array.isArray(p.photos) && p.photos.find(x => x)) || p.photo || '';
  const title = cardTitleText(p) || 'Оголошення';
  const price = formatPrice(p.price, p.currency, p.price_negotiable);
  const cover = photo
    ? `<span class="pcard-ad-ph" style="background-image:url('${escapeHtml(photo)}')"></span>`
    // Без фото — іконка КАТЕГОРІЇ, а не універсальна «немає зображення»:
    // кошик/ключ/шестигранник кажуть, що це за оголошення, ще до читання назви.
    // Ті самі іконки носить список Дошки — людина впізнає їх, а не розгадує.
    // ⚠️ Колір — КЛАСОМ `cat-c-*`, а не інлайн-стилем: `catColor()` віддає ІМʼЯ
    // токена ('white', 'amber'), а не CSS-колір. `style="color:white"` дав би
    // білу іконку на білому тлі — зникла б рівно там, де вона й потрібна.
    : `<span class="pcard-ad-ph pcard-ad-ph--none cat-c-${escapeHtml(catColor(p.category))}">${catIcon(p.category)}</span>`;
  return `
    <button class="pcard-ad" type="button" data-pcard-ad="${escapeHtml(String(p.id))}">
      ${cover}
      <span class="pcard-ad-body">
        <span class="pcard-ad-title">${escapeHtml(title)}</span>
        ${price ? `<span class="pcard-ad-price">${escapeHtml(price)}</span>` : ''}
      </span>
    </button>`;
}

const ADS_VISIBLE = 3;   // скільки видно до натиску «Показати всі»

function paintAds(box, ads, expanded) {
  const show = expanded ? ads : ads.slice(0, ADS_VISIBLE);
  const more = ads.length - show.length;
  box.innerHTML = `
    <div class="pcard-ads-h">Оголошення${ads.length > 1 ? ` · ${ads.length}` : ''}</div>
    ${show.map(adRowHtml).join('')}
    ${more > 0 ? `<button class="pcard-ads-more" type="button" data-pcard-ads-more>Показати всі ${ads.length}</button>` : ''}`;
  box.hidden = false;
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

      // Оголошення автора — другим, тихим запитом (див. розбір при `adRowHtml`).
      const box = wrap.querySelector('[data-pcard-ads]');
      if (!box) return;
      let ads = [], expanded = false;
      fetchAuthorAds(uid).then(list => {
        // ⚠️ `isConnected` — картку могли встигнути закрити, поки йшов запит.
        if (!box.isConnected || !list.length) return;
        ads = list;
        paintAds(box, ads, expanded);
      });

      // Делегування: розмітку всередині `box` перемальовує `paintAds`, тож
      // слухачі на самих кнопках не пережили б натиск «Показати всі».
      box.addEventListener('click', (e) => {
        if (e.target.closest('[data-pcard-ads-more]')) {
          expanded = true;
          paintAds(box, ads, expanded);
          return;
        }
        const row = e.target.closest('[data-pcard-ad]');
        if (!row) return;
        const post = ads.find(x => String(x.id) === row.dataset.pcardAd);
        if (!post) return;
        // 🔑 Спершу закриваємо картку, потім відкриваємо оголошення. Інакше
        // сторінка оголошення лягла б ПІД карткою профілю (`app-modal--top`),
        // і людина побачила б чужий профіль поверх щойно відкритого оголошення.
        closeModal();
        window.dispatchEvent(new CustomEvent('cstl-open-ad', { detail: { post } }));
      });
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
