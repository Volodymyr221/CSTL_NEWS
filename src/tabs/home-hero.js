// src/tabs/home-hero.js
// ГОЛОВНА ПЛИТКА головного екрана — СЛОТ, а не блок (03.08.2026, потік «ПУЛЬС»).
//
// 🔴 ГОЛОВНА ІДЕЯ ВСЬОГО РЕДИЗАЙНУ. Слова Вови: «Мені потрібне повне
// переосмислення Home Dashboard… Користувач повинен за 3 секунди побачити: що
// нового; що важливо; що поруч; що цікаво саме йому».
//
// У варіанті 2 (відхиленому) порядок блоків був СТАЛИЙ: новини → події →
// оголошення → телефони. Тобто в понеділок і в четвер, під час збору і без
// нього, за 10 хвилин до автобуса і опівночі — екран виглядав однаково.
// Це «набір віджетів», яким Вова і назвав сторінку.
//
// Тут інакше: плитка ОДНА, а що в ній лежить — вирішує пріоритет дня.
// Порядок пріоритету і є відповіддю на «що важливо»:
//
//   1. АКТИВНИЙ ЗБІР        — гроші людям, які їх зараз чекають; важливіше нема;
//   2. ПОДІЯ СЬОГОДНІ/ЗАВТРА — те, що можна пропустити назавжди, якщо не побачив;
//   3. МІСЦЕВА НОВИНА       — новина про Олику; заради неї застосунок і роблять;
//   4. АВТОБУС ЗА ≤30 ХВ    — коли нічого з попереднього нема, найкорисніше це;
//   5. ФОТО ОЛИКИ + вітання — порожній екран неприйнятний, але це вже не банер:
//                             плитка одна і невелика, а не пів сторінки.
//
// ⚠️ Пункт 5 — свідома межа. Це ЄДИНЕ місце, де на екрані лишається декоративне
// зображення, і воно з'являється тільки коли справді нема про що сказати.

import { escapeHtml } from '../core/utils.js';
import { ICONS } from '../core/icons.js';
import { olykaPhoto } from './community.js';
import { ensureNewsLoaded, articlesOfGroup, NEWS_GEO_GROUPS, openArticle } from './news.js';
import { openShotamModal } from './events.js';
import { openSavedRouteOnBuses, parseRouteEndpoints } from './buses.js';
import { getRouteState, getRouteTimings, formatCountdownUpper } from '../core/bus-schedule.js';

// Автобус потрапляє в ГОЛОВНУ плитку лише коли він от-от вирушає. 30 хв, а не
// 90 як у бенто-плитці: у головну він має право лише тоді, коли це справді
// найважливіше на екрані, тобто коли ще можна встигнути дійти.
const BUS_URGENT_MIN = 30;

// ── Кандидати ────────────────────────────────────────────────────────────────

async function fundCandidate() {
  try {
    const res = await fetch('./data/fundraisers.json', { cache: 'no-cache' });
    const data = await res.json();
    const items = (Array.isArray(data) ? data : (data.items || []))
      .filter(it => it && it.active !== false && it.title && it.org && it.url);
    const it = items[0];
    if (!it) return null;
    const pct = (typeof it.goal === 'number' && typeof it.raised === 'number' && it.goal > 0)
      ? Math.max(0, Math.min(100, Math.round((it.raised / it.goal) * 100)))
      : null;
    return {
      kind: 'fund', accent: true,
      label: 'Активний збір', icon: ICONS.community,
      title: it.title,
      sub: it.org,
      pct,
      cta: 'Підтримати',
      href: it.url,
    };
  } catch { return null; }
}

async function eventCandidate() {
  try {
    const res = await fetch('./data/events.json');
    const all = await res.json();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const soon = all
      .filter(e => !e.auto)
      .map(e => ({ e, d: new Date(e.date + 'T00:00:00') }))
      .filter(x => x.d >= today && Math.round((x.d - today) / 86400000) <= 1)
      .sort((a, b) => a.d - b.d)[0];
    if (!soon) return null;
    const diff = Math.round((soon.d - today) / 86400000);
    return {
      kind: 'event', accent: false, id: soon.e.id,
      label: diff === 0 ? 'Сьогодні в громаді' : 'Завтра в громаді',
      icon: ICONS.calendar,
      title: soon.e.title,
      sub: [soon.e.time, soon.e.location].filter(Boolean).join(' · '),
      photo: soon.e.image || null,
    };
  } catch { return null; }
}

async function newsCandidate() {
  try {
    const arts = await ensureNewsLoaded();
    // Саме ГРОМАДА, а не найсвіжіше взагалі: за темпом (Громада 0.26 статті на
    // день проти ~54 у Волині й Україні) головна плитка інакше показувала б
    // майже завжди не про Олику — а сенс застосунку саме в місцевому.
    const a = articlesOfGroup(arts, NEWS_GEO_GROUPS[0])[0];
    if (!a) return null;
    return {
      kind: 'news', accent: false, id: a.id,
      label: 'Новина громади', icon: ICONS.newspaper,
      title: a.title,
      sub: a.excerpt ? String(a.excerpt).slice(0, 90) : (a.source || ''),
      photo: a.image || null,
    };
  } catch { return null; }
}

async function busCandidate() {
  try {
    const res = await fetch('./data/schedule.json');
    const data = await res.json();
    const todayISO = new Date().toISOString().slice(0, 10);
    const routes = ((data.days?.[todayISO]?.routes) || data.routes || [])
      .filter(r => r.status !== 'cancelled');
    const pick = routes
      .map(r => ({ r, t: getRouteTimings(r) }))
      .filter(x => getRouteState(x.r) === 'waiting'
        && x.t.minsToDeparture !== null && x.t.minsToDeparture <= BUS_URGENT_MIN)
      .sort((a, b) => a.t.minsToDeparture - b.t.minsToDeparture)[0];
    if (!pick) return null;
    const [, to] = parseRouteEndpoints(pick.r.name || '');
    return {
      kind: 'bus', accent: false, routeId: pick.r.id, dateISO: todayISO,
      label: 'Автобус скоро', icon: ICONS.bus,
      title: `${to || pick.r.name} · ${formatCountdownUpper(pick.t.minsToDeparture).toLowerCase()}`,
      sub: 'Тап — відкрити рейс',
    };
  } catch { return null; }
}

function fallbackCandidate() {
  const ph = olykaPhoto();
  return {
    kind: 'idle', accent: false,
    label: 'Олика', icon: ICONS.home,
    title: 'Сьогодні в громаді тихо',
    sub: ph.caption,
    photo: ph.src,
  };
}

// ── Рендер ───────────────────────────────────────────────────────────────────

function heroHtml(c) {
  const bar = c.pct !== null && c.pct !== undefined ? `
    <div class="hm-hero-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
         aria-valuenow="${c.pct}" aria-label="Зібрано ${c.pct} відсотків">
      <span style="width:${c.pct}%"></span>
    </div>
    <div class="hm-hero-pct">${c.pct}% зібрано</div>` : '';

  const cta = c.cta
    ? `<a class="hm-hero-cta" href="${escapeHtml(c.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(c.cta)}</a>`
    : '';

  // Фото — ТЛО плитки, а не окремий елемент над текстом: інакше плитка знову
  // стала б «банер + підпис», тобто тим самим, від чого йдемо.
  const photo = c.photo
    ? `<div class="hm-hero-photo" style="background-image:url('${escapeHtml(c.photo)}')"></div>
       <div class="hm-hero-shade" aria-hidden="true"></div>`
    : '';

  return `
    <article class="hm-hero${c.accent ? ' hm-hero--accent' : ''}${c.photo ? ' hm-hero--photo' : ''}" data-hero="${c.kind}">
      ${photo}
      <div class="hm-hero-in">
        <span class="hm-hero-lab">${c.icon}${escapeHtml(c.label)}</span>
        <h2 class="hm-hero-title">${escapeHtml(c.title)}</h2>
        ${c.sub ? `<p class="hm-hero-sub">${escapeHtml(c.sub)}</p>` : ''}
        ${bar}
        ${cta}
      </div>
    </article>`;
}

let _current = null;

export async function renderHero() {
  const host = document.getElementById('hm-hero');
  if (!host) return;

  // Кістяк, поки кандидати їдуть: місце під плитку тримаємо одразу, інакше
  // решта екрана стрибне вниз, щойно вона з'явиться.
  host.innerHTML = '<div class="hm-skel hm-skel-hero" aria-hidden="true"></div>';

  // Порядок ВАЖЛИВИЙ і є самою логікою слота. Запити паралельні, вибір —
  // послідовний: перший непорожній кандидат виграє.
  // 🔴 ВАРІАНТ G (04.08): плитка більше НЕ показує новини.
  // Скарга Вови: «верхній віджет… воно дублює новини в загальному». У G новини
  // і так займають увесь екран, тож плитці лишається рівно те, чого в стрічці
  // немає і бути не може: активний ЗБІР і подія СЬОГОДНІ/ЗАВТРА.
  // Немає ні того, ні того — плитки немає ЗОВСІМ (не «фото Олики про запас»:
  // на екрані, який весь про зміст, декоративна плитка була б єдиним місцем
  // без змісту).
  const [fund, ev] = await Promise.all([fundCandidate(), eventCandidate()]);
  const c = fund || ev;
  if (!c) { host.innerHTML = ''; window.__cstlHeroArticleId = null; return; }

  // 🔴 04.08 (варіант D) — У ГОЛОВНОЇ ПЛИТКИ ЗАВЖДИ Є КАДР.
  // Фото пішло з тла екрана і лишилось тільки тут, тож плитка без знімка
  // виглядала б дірою на місці головного елемента. Своє фото має пріоритет
  // (новина, подія); нема свого — стає Олика.
  // ⚠️ Збір лишається БЕЗ фото навмисно: він акцентний (бордовий), і кадр під
  // текстом зробив би з прохання про допомогу рекламний банер.
  if (!c.photo && c.kind !== 'fund') c.photo = olykaPhoto().src;

  _current = c;
  // Стрічка «Що нового» читає це, щоб не показати ту саму новину вдруге
  // (скарга Вови 04.08: «воно дублює новини в загальному»). Через `window`, а не
  // імпортом, бо інакше `community-blocks` і `home-hero` імпортували б одне
  // одного по колу.
  window.__cstlHeroArticleId = c.kind === 'news' ? c.id : null;
  host.innerHTML = heroHtml(c);

  // Прапорець на елементі, а не в модулі: `initCommunity()` перебудовує
  // `#cm-content` цілком, тож хост щоразу новий вузол.
  if (!host.dataset.wired) {
    host.dataset.wired = '1';
    host.addEventListener('click', e => {
      if (e.target.closest('.hm-hero-cta')) return;   // посилання збору веде саме
      const c2 = _current;
      if (!c2) return;
      if (c2.kind === 'news')  return openArticle(c2.id);
      if (c2.kind === 'event') return openShotamModal(c2.id);
      if (c2.kind === 'bus') {
        window.switchTab?.('buses');
        return openSavedRouteOnBuses(c2.routeId, c2.dateISO, null, null);
      }
    });
  }
}
