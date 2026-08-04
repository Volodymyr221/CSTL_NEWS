// src/tabs/home-feed.js — БЛОК «ЖИТТЯ ГРОМАДИ» на головній (дайджест Стрічки).
//
// Замовлення Вови (04.08): «Є стрічка — там зовсім інша логіка, там логіка
// стрічки як в інстаграмі та фейсбуці. Під неї теж треба продумати якийсь
// віджет, такий дайджест.» Далі, після першої версії: «придумати блок під стрічку».
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ЧОМУ ПЕРША ВЕРСІЯ БУЛА НЕ ТА
// Спершу я зробив два рядки «аватар · автор · текст» — тобто ТУ САМУ форму, що
// новини й оголошення. На сторінці виходило три однакові секції списків підряд,
// і Стрічка серед них не читалась як щось інше. А вона й СПРАВДІ інша: це не
// стрічка заголовків, це люди і канали.
//
// 🔑 ЩО ТУТ ЗАМІСТЬ ЦЬОГО — ДВА ЯРУСИ
//   1. РЯД КРУЖЕЧКІВ каналів — рівно те, що людина бачить угорі самої Стрічки.
//      Впізнаваність безкоштовна: той самий кружечок означає той самий канал.
//      Канал із новим дописом має бордове кільце — так само, як «є нове».
//   2. ОСТАННІЙ ДОПИС карткою — з фото на всю ширину, якщо воно є.
//      Одна публікація, показана добре, каже про життя громади більше, ніж три
//      обрізані рядки.
//
// 📐 Кружечків до 6 і БЕЗ горизонтальної прокрутки: вкладені скролери на
// головній ми прибирали двічі (новини 31.07, оголошення 04.08) — заводити
// третій заради краси не будемо. Не влізло — не показуємо.
//
// ⚠️ Порожньо, немає бази або мережа впала → секції немає ЗОВСІМ. Порожній блок
// «життя громади» без жодного допису каже гірше, ніж його відсутність.

import { escapeHtml, formatTime } from '../core/utils.js';
import { fetchPages, fetchPagePosts, isSupabaseReady } from '../core/supabase.js';

const MAX_CIRCLES = 6;
// Скільки годин допис вважається «новим» — рівно доба. Кільце на кружечку має
// означати «зайди подивись», а не світитись тижнями.
const FRESH_H = 24;

function initial(name) {
  const n = (name || '').trim();
  return n ? n[0].toUpperCase() : '•';
}

// Текст допису для картки: два-три рядки, обрізані по межі слова.
function preview(text) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 150) return t;
  const cut = t.slice(0, 150);
  const sp = cut.lastIndexOf(' ');
  return (sp > 90 ? cut.slice(0, sp) : cut) + '…';
}

function circleHtml(page, fresh) {
  const name = page.name || 'Канал';
  const inner = page.avatar_url
    ? `<img src="${escapeHtml(page.avatar_url)}" alt="" loading="lazy">`
    : `<span class="hm-fd-c-tx">${escapeHtml(initial(name))}</span>`;
  return `
    <span class="hm-fd-c${fresh ? ' hm-fd-c--new' : ''}">
      <span class="hm-fd-c-ring"><span class="hm-fd-c-av">${inner}</span></span>
      <span class="hm-fd-c-name">${escapeHtml(name)}</span>
    </span>`;
}

function postHtml(p) {
  const page = p.pages || {};
  const name = page.name || 'Громада';
  const txt = preview(p.text);
  const img = p.image_url || (Array.isArray(p.image_urls) ? p.image_urls[0] : null);
  const ava = page.avatar_url
    ? `<img src="${escapeHtml(page.avatar_url)}" alt="">`
    : `<span class="hm-fd-p-tx">${escapeHtml(initial(name))}</span>`;

  return `
    <article class="hm-card hm-card--tap hm-fd-post">
      <span class="hm-fd-p-head">
        <span class="hm-fd-p-av">${ava}</span>
        <span class="hm-fd-p-who">
          <span class="hm-fd-p-name">${escapeHtml(name)}</span>
          <span class="hm-fd-p-when">${escapeHtml(formatTime(p.created_at))}</span>
        </span>
      </span>
      ${txt ? `<span class="hm-fd-p-txt">${escapeHtml(txt)}</span>` : ''}
      ${img ? `<span class="hm-fd-p-img"><img src="${escapeHtml(img)}" alt="" loading="lazy"></span>` : ''}
    </article>`;
}

export async function renderHomeFeed() {
  const sec = document.getElementById('hm-feed');
  const body = document.getElementById('hm-feed-body');
  if (!sec || !body) return;

  if (!isSupabaseReady()) { sec.hidden = true; return; }

  try {
    // Один запит на канали і один на пости — більше головній не потрібно.
    // Пости беремо з запасом (12), щоб порахувати, у яких каналів є свіже.
    const [pages, posts] = await Promise.all([
      fetchPages(),
      fetchPagePosts(null, 12),
    ]);
    if (!posts.length) { sec.hidden = true; body.innerHTML = ''; return; }

    // Які канали писали за останню добу — саме вони отримають кільце.
    const freshBy = new Set();
    const edge = Date.now() - FRESH_H * 3600 * 1000;
    for (const p of posts) {
      if (new Date(p.created_at).getTime() >= edge) freshBy.add(p.page_id);
    }

    // Порядок кружечків: спершу ті, у кого є нове (заради цього людина й
    // дивиться), далі решта у своєму порядку сортування.
    const ordered = [...pages].sort((a, b) => (freshBy.has(b.id) ? 1 : 0) - (freshBy.has(a.id) ? 1 : 0));
    const circles = ordered.slice(0, MAX_CIRCLES);

    sec.hidden = false;
    body.innerHTML =
      (circles.length ? `<div class="hm-fd-circles">${circles.map(pg => circleHtml(pg, freshBy.has(pg.id))).join('')}</div>` : '') +
      postHtml(posts[0]);
    body.classList.add('hm-appear');
  } catch {
    sec.hidden = true;
    body.innerHTML = '';
  }

  if (!sec.dataset.wired) {
    sec.dataset.wired = '1';
    // Тап у будь-яке місце блока → Стрічка. Глибокого переходу «саме цей пост»
    // немає навмисно: він у Стрічці однаково перший, а окремий маршрут означав
    // би другу логіку відкриття поста поруч із наявною.
    sec.addEventListener('click', () => {
      if (typeof window.switchTab === 'function') window.switchTab('shotam');
    });
  }
}
