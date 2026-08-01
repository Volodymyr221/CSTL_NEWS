// src/market/courier-page.js
// МАКЕТ ЕКРАНА КУРʼЄРА (mock — підробка справжнього додатка Діми).
//
// Навіщо він потрібен, якщо додаток вже є в Діми:
//   1. поки додаток не підключений, потік «замовлення → курʼєр» треба на чомусь
//      перевірити — тут він працює вже зараз, без жодного сервера;
//   2. після підключення справжнього додатка цей екран лишається ЕТАЛОНОМ:
//      видно, який саме JSON пішов з маркета, тож якщо в Діми не зʼявилось —
//      одразу ясно, на чиєму боці проблема.
//
// Читає ті самі localStorage + BroadcastChannel, що пише order-bridge.js.

import { readLocalOrders, writeLocalOrders, subscribeOrders } from './order-bridge.js';

const $ = sel => document.querySelector(sel);

// Які замовлення ми вже показували — щоб підсвітити тільки НОВІ і не гудіти
// сигналом на кожну перемальовку списку.
let seen = new Set();

export function initCourier() {
  render(true);
  subscribeOrders(() => render(false));

  $('#cr-clear').onclick = () => {
    if (!confirm('Прибрати всі замовлення з цього екрана? (це лише проба, дані локальні)')) return;
    writeLocalOrders([]);
    seen = new Set();
    render(true);
  };
  $('#cr-refresh').onclick = () => render(false);
}

function render(firstTime) {
  const orders = readLocalOrders();
  const box = $('#cr-list');

  if (!orders.length) {
    box.innerHTML = `
      <div class="cr-empty">
        <div class="cr-empty__ico">🛵</div>
        <div class="cr-empty__t">Замовлень поки нема.<br>
          Відкрий <b>market.html</b>, зайди в картку бізнесу<br>і зроби замовлення —
          воно зʼявиться тут за секунду.</div>
      </div>`;
    $('#cr-count').textContent = 'очікую замовлення';
    return;
  }

  // Нові = ті, яких не було в попередньому показі. На першому завантаженні
  // нічого не «нове» — інакше при кожному відкритті екран блимав би сигналом.
  const fresh = orders.filter(o => !seen.has(o.id));
  orders.forEach(o => seen.add(o.id));

  box.innerHTML = orders.map(o => orderHtml(o, !firstTime && fresh.some(f => f.id === o.id))).join('');
  $('#cr-count').textContent =
    `${orders.length} ${plural(orders.length, 'замовлення', 'замовлення', 'замовлень')} · звʼязок активний`;

  box.querySelectorAll('[data-adv]').forEach(b => {
    b.onclick = () => advance(b.dataset.adv);
  });
  box.querySelectorAll('[data-json]').forEach(b => {
    b.onclick = () => {
      const pre = b.parentElement.parentElement.querySelector('.cr-json');
      pre.hidden = !pre.hidden;
      b.textContent = pre.hidden ? 'Показати JSON' : 'Сховати JSON';
    };
  });

  if (!firstTime && fresh.length) notify(fresh[0]);
}

// ── КАРТКА ЗАМОВЛЕННЯ ───────────────────────────────────────────────────────
const STATUS = {
  new:       { label: 'Нове',        next: 'accepted',  btn: 'Прийняти замовлення' },
  accepted:  { label: 'Прийнято',    next: 'picked',    btn: 'Забрав у закладі' },
  picked:    { label: 'Везу',        next: 'delivered', btn: 'Доставлено' },
  delivered: { label: 'Доставлено',  next: null,        btn: null },
};

function orderHtml(o, isFresh) {
  const st = STATUS[o.status] || STATUS.new;
  return `
    <div class="cr-order${isFresh ? ' cr-order--new' : ''}">
      <div class="cr-order__top">
        <span class="cr-order__id">${esc(o.id)}</span>
        <span class="cr-badge cr-badge--${esc(o.status)}">${esc(st.label)}</span>
        <span class="cr-order__time">${timeOf(o.created_at)}</span>
      </div>

      <div class="cr-route">
        <div class="cr-route__line">
          <span class="cr-route__pin"></span>
          <span class="cr-route__bar"></span>
          <span class="cr-route__pin2"></span>
        </div>
        <div class="cr-route__pts">
          <div class="cr-pt">
            <div class="cr-pt__lbl">Забрати</div>
            <div class="cr-pt__main">${esc(o.business.name)}</div>
            <div class="cr-pt__sub">${esc(o.business.address)} · ${esc(o.business.phone)}</div>
          </div>
          <div class="cr-pt">
            <div class="cr-pt__lbl">Привезти</div>
            <div class="cr-pt__main">${esc(o.customer.address)}</div>
            <div class="cr-pt__sub">${esc(o.customer.name)} · <a href="tel:${esc(o.customer.phone)}">${esc(o.customer.phone)}</a></div>
          </div>
        </div>
      </div>

      <div class="cr-items">
        ${o.items.map(i => `
          <div class="cr-items__row">
            <span>${esc(i.title)} × ${i.qty}</span>
            <span>${i.price * i.qty} ₴</span>
          </div>`).join('')}
      </div>

      ${o.customer.comment ? `<div class="cr-note">💬 ${esc(o.customer.comment)}</div>` : ''}

      <div class="cr-money">
        <b>${o.total} ₴</b>
        <small>товари ${o.subtotal} ₴ + доставка ${o.delivery} ₴ · ${o.payment === 'card' ? 'картка' : 'готівка'}</small>
      </div>

      <div class="cr-actions">
        ${st.next
          ? `<button class="mk-btn" type="button" data-adv="${esc(o.id)}">${esc(st.btn)}</button>`
          : `<button class="mk-btn mk-btn--ghost" type="button" disabled>Замовлення закрите</button>`}
        <button class="mk-btn mk-btn--ghost" type="button" data-json="1" style="flex:0 0 auto">Показати JSON</button>
      </div>
      <pre class="cr-json" hidden>${esc(JSON.stringify(o, null, 2))}</pre>
    </div>`;
}

// Перевести замовлення на наступний статус.
function advance(id) {
  const list = readLocalOrders();
  const o = list.find(x => x.id === id);
  if (!o) return;
  const next = (STATUS[o.status] || STATUS.new).next;
  if (!next) return;
  o.status = next;
  writeLocalOrders(list);
  render(true);   // firstTime=true — це НАША дія, сигналити про неї не треба
}

// ── СИГНАЛ ПРО НОВЕ ЗАМОВЛЕННЯ ──────────────────────────────────────────────
// Вібрація + короткий звук через WebAudio (готового файлу не тягнемо, щоб
// пробна сторінка лишалась з двох файлів). На iOS звук зіграє лише після
// першого дотику до екрана — це обмеження браузера, не помилка.
function notify(order) {
  const toast = $('#cr-toast');
  toast.textContent = `🛵 Нове замовлення ${order.id} · ${order.total} ₴`;
  toast.classList.add('cr-toast--on');
  setTimeout(() => toast.classList.remove('cr-toast--on'), 3200);

  try { navigator.vibrate?.([120, 60, 120]); } catch { /* десктоп — вібрації нема */ }

  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1180, ctx.currentTime + 0.13);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(); osc.stop(ctx.currentTime + 0.34);
    setTimeout(() => ctx.close(), 600);
  } catch { /* браузер не дав звук — вистачить тоста і вібрації */ }
}

// ── ДРІБНИЦІ ────────────────────────────────────────────────────────────────
function timeOf(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
