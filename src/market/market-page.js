// src/market/market-page.js
// Логіка пробної сторінки МАРКЕТ (макет Вови від 01.08.2026).
//
// Три екрани, перемикаються через hash (адресний рядок) — тому системна
// кнопка «назад» у браузері працює сама собою, окремої історії не тримаємо:
//   #            → стрічка маркета (публікації всіх бізнесів)
//   #/biz/<id>   → сторінка бізнесу (Публікації · Товари · Інформація · Відгуки)
//   #/post/<id>  → окрема публікація (акція) з кнопкою «Замовити зараз»
//
// ⚠️ Сторінка НАВМИСНО не імпортує нічого з `src/core` і не входить у bundle.js —
// це ізольований експеримент, який фізично не може зламати бойові вкладки.

import { BUSINESSES, FILTERS, businessById, allPosts, postById } from './market-data.js';
import { BRIDGE_CONFIG, buildOrder, sendOrder } from './order-bridge.js';

const $ = sel => document.querySelector(sel);

// ── СТАН ────────────────────────────────────────────────────────────────────
// cart — мапа «id товару → кількість», привʼязана до ОДНОГО бізнесу:
// замовлення з двох закладів одразу — це вже два курʼєри, для проби зайве.
let currentBiz  = null;
let currentTab  = 'items';        // активний таб сторінки бізнесу
let cart        = new Map();
let filterId    = 'all';
let query       = '';
let payment     = 'cash';

// ── СТАРТ ───────────────────────────────────────────────────────────────────
export function initMarket() {
  showBridgeMode();
  wireSheet();
  window.addEventListener('hashchange', route);
  route();
}

function route() {
  const h = location.hash;
  let m;
  if ((m = h.match(/^#\/biz\/([\w-]+)/)) && businessById(m[1]))   renderBusiness(businessById(m[1]));
  else if ((m = h.match(/^#\/post\/([\w-]+)/)) && postById(m[1]))  renderPost(postById(m[1]));
  else renderFeed();
  window.scrollTo(0, 0);
}

// ── СМУЖКА РЕЖИМУ МОСТУ ─────────────────────────────────────────────────────
// На пробній сторінці завжди має бути видно, КУДИ піде замовлення — інакше
// при перевірці неможливо відрізнити «не дійшло» від «пішло не туди».
function showBridgeMode() {
  const box = $('#mk-mode');
  if (!box) return;
  const mode = BRIDGE_CONFIG.mode;
  const where = mode === 'webhook'  ? (BRIDGE_CONFIG.webhook.url  || '⚠️ адреса не вписана')
              : mode === 'supabase' ? (BRIDGE_CONFIG.supabase.url || '⚠️ проєкт не вписаний')
              : 'цей браузер — вкладка courier.html';
  box.innerHTML = `<span>🔌</span><span><b>Тестовий режим.</b> Міст замовлень: <code>${esc(mode)}</code> → ${esc(where)}</span>`;
}

// ═══ ЕКРАН 1: СТРІЧКА МАРКЕТА ══════════════════════════════════════════════
function renderFeed() {
  currentBiz = null;
  cart = new Map();
  updateBar();

  $('#mk-head').innerHTML = `
    <div>
      <div class="mk-top__t">МАРКЕТ</div>
      <div class="mk-top__s">Бізнес-стрічка громади</div>
    </div>
    <div class="mk-top__sp"></div>
    <button class="mk-switch" type="button" id="mk-switch" aria-label="Перемкнути розділ">🛍️</button>`;
  $('#mk-switch').onclick = () =>
    alert('Перемикач МАРКЕТ ⇄ БАЗАР — наступний крок. Зараз перевіряємо потік замовлення.');

  $('#mk-view').innerHTML = `
    <div class="mk-search">
      <input id="mk-q" type="search" placeholder="Пошук бізнесів, послуг або акцій" value="${esc(query)}">
    </div>

    <div class="mk-chips">
      ${FILTERS.map(f => `
        <button class="mk-chip" type="button" data-filter="${esc(f.id)}"
                aria-pressed="${f.id === filterId}">${esc(f.label)}</button>`).join('')}
    </div>

    <div class="mk-circles">
      ${BUSINESSES.map(b => `
        <button class="mk-circle" type="button" data-biz="${esc(b.id)}">
          <span class="mk-circle__ring" style="background:${esc(b.logoBg)}">${b.logo}</span>
          <span class="mk-circle__name">${esc(b.name)}</span>
        </button>`).join('')}
    </div>

    <div id="mk-posts"></div>

    <a class="mk-backhome" href="index.html">← Повернутися до Castle Life</a>`;

  renderPosts();

  $('#mk-q').oninput = e => { query = e.target.value; renderPosts(); };
  $('#mk-view').querySelectorAll('[data-filter]').forEach(el => {
    el.onclick = () => {
      filterId = el.dataset.filter;
      $('#mk-view').querySelectorAll('[data-filter]').forEach(x =>
        x.setAttribute('aria-pressed', String(x.dataset.filter === filterId)));
      renderPosts();
    };
  });
  wireBizLinks($('#mk-view'));
}

function renderPosts() {
  const f = FILTERS.find(x => x.id === filterId) || FILTERS[0];
  const q = query.trim().toLowerCase();

  const list = allPosts().filter(p => {
    if (!f.test(p, p.biz)) return false;
    if (!q) return true;
    return [p.title, p.text, p.biz.name, p.biz.category].join(' ').toLowerCase().includes(q);
  });

  const box = $('#mk-posts');
  if (!list.length) {
    box.innerHTML = `<div class="mk-note">Нічого не знайшли.<br>Спробуйте інший фільтр або запит.</div>`;
    return;
  }

  box.innerHTML = list.map(p => `
    <article class="mk-post">
      <div class="mk-post__head">
        <span class="mk-ava" style="background:${esc(p.biz.logoBg)}">${p.biz.logo}</span>
        <span class="mk-post__who">
          <span class="mk-post__name">${esc(p.biz.name)}${p.biz.verified ? '<span class="mk-verified">✔</span>' : ''}</span>
          <span class="mk-post__meta">${esc(p.time)} · Олика</span>
        </span>
        <button class="mk-post__dots" type="button" aria-label="Ще">⋯</button>
      </div>

      <button class="mk-art" type="button" data-post="${esc(p.id)}" style="background:${esc(p.art.bg)};width:100%">
        ${artHtml(p)}
        <span class="mk-badge ${badgeClass(p.badge)}">${esc(p.badge)}</span>
        <span class="mk-art__shade"></span>
        <span class="mk-art__cap">
          <span class="mk-art__title" style="display:block">${esc(p.title)}</span>
          <span class="mk-art__text" style="display:block">${esc(p.text)}</span>
        </span>
      </button>

      <div class="mk-post__body">
        <button class="mk-cta" type="button" data-order="${esc(p.biz.id)}">${esc(p.cta)}</button>
      </div>

      <div class="mk-post__bar">
        <span class="mk-heart">❤ ${p.likes}</span>
        <span>💬 ${p.comments}</span>
        <span class="mk-save">🔖</span>
      </div>
    </article>`).join('');

  wireBizLinks(box);
}

// ═══ ЕКРАН 2: СТОРІНКА БІЗНЕСУ ═════════════════════════════════════════════
const TABS = [
  { id: 'posts', label: 'Публікації' },
  { id: 'items', label: 'Товари' },
  { id: 'info',  label: 'Інформація' },
  { id: 'revs',  label: 'Відгуки' },
];

function renderBusiness(biz) {
  if (currentBiz?.id !== biz.id) { cart = new Map(); currentTab = 'items'; }
  currentBiz = biz;

  $('#mk-head').innerHTML = `
    <button class="mk-icon-btn" id="mk-back" type="button" aria-label="Назад">‹</button>
    <div class="mk-top__sp"></div>
    <button class="mk-icon-btn" type="button" aria-label="Ще">⋯</button>`;
  $('#mk-back').onclick = () => { location.hash = ''; };

  $('#mk-view').innerHTML = `
    <div class="mk-bizhead">
      <div class="mk-bizhead__logo" style="background:${esc(biz.logoBg)}">${biz.logo}</div>
      <div class="mk-bizhead__name">${esc(biz.name)}${biz.verified ? '<span class="mk-verified">✔</span>' : ''}</div>
      <div class="mk-bizhead__rate">
        <span class="mk-stars">${stars(biz.rating)}</span>
        ${biz.rating} (${biz.reviews}) · ${esc(biz.category)}
      </div>
      <div class="mk-bizhead__open">
        ${biz.openNow ? '<span class="mk-open">Відчинено зараз</span>' : '<span class="mk-closed">Зачинено</span>'}
        · ${esc(biz.hours)}
      </div>
    </div>

    <div class="mk-acts">
      <button class="mk-act" type="button" data-soon="Написати">${IC.chat}<span>Написати</span></button>
      <a class="mk-act" href="tel:${esc(biz.phone)}">${IC.phone}<span>Подзвонити</span></a>
      <button class="mk-act" type="button" data-soon="Маршрут">${IC.route}<span>Маршрут</span></button>
      <button class="mk-act" type="button" data-soon="Зберегти">${IC.save}<span>Зберегти</span></button>
    </div>

    <div class="mk-tabs">
      ${TABS.map(t => `
        <button class="mk-tab" type="button" data-tab="${t.id}"
                aria-pressed="${t.id === currentTab}">${t.label}</button>`).join('')}
    </div>

    <div id="mk-tabbody"></div>

    <a class="mk-backhome" href="index.html" style="margin-top:16px">← Повернутися до Castle Life</a>`;

  $('#mk-view').querySelectorAll('[data-tab]').forEach(el => {
    el.onclick = () => {
      currentTab = el.dataset.tab;
      $('#mk-view').querySelectorAll('[data-tab]').forEach(x =>
        x.setAttribute('aria-pressed', String(x.dataset.tab === currentTab)));
      renderTabBody();
    };
  });
  $('#mk-view').querySelectorAll('[data-soon]').forEach(el => {
    el.onclick = () => alert(`«${el.dataset.soon}» — у бойовій версії. Зараз перевіряємо потік замовлення.`);
  });

  renderTabBody();
  updateBar();
}

function renderTabBody() {
  const biz = currentBiz;
  const box = $('#mk-tabbody');

  if (currentTab === 'items') {
    if (!biz.items.length) { box.innerHTML = `<div class="mk-note">Товарів поки нема.</div>`; return; }
    box.innerHTML = `
      <div class="mk-items">
        ${biz.items.map(it => `
          <div class="mk-item">
            <div class="mk-item__body">
              <div class="mk-item__title">${esc(it.title)}</div>
              ${it.desc ? `<div class="mk-item__desc">${esc(it.desc)}</div>` : ''}
              <div class="mk-item__price">${it.price} ₴ <span>/ ${esc(it.unit)}</span></div>
            </div>
            <div class="mk-qty ${cart.get(it.id) ? '' : 'mk-qty--empty'}" data-qty="${esc(it.id)}">
              <button class="mk-qty__btn mk-qty__minus" type="button" data-dec="${esc(it.id)}" aria-label="Менше">−</button>
              <span class="mk-qty__val">${cart.get(it.id) || 0}</span>
              <button class="mk-qty__btn" type="button" data-inc="${esc(it.id)}" aria-label="Більше">+</button>
            </div>
          </div>`).join('')}
      </div>`;
    box.querySelectorAll('[data-inc]').forEach(b => b.onclick = () => changeQty(b.dataset.inc, +1));
    box.querySelectorAll('[data-dec]').forEach(b => b.onclick = () => changeQty(b.dataset.dec, -1));
    return;
  }

  if (currentTab === 'posts') {
    box.innerHTML = biz.posts.map(p => `
      <article class="mk-post">
        <div class="mk-post__head">
          <span class="mk-ava" style="background:${esc(biz.logoBg)}">${biz.logo}</span>
          <span class="mk-post__who">
            <span class="mk-post__name">${esc(biz.name)}</span>
            <span class="mk-post__meta">${esc(p.time)}</span>
          </span>
        </div>
        <button class="mk-art" type="button" data-post="${esc(p.id)}" style="background:${esc(p.art.bg)};width:100%">
          ${artHtml(p)}
          <span class="mk-badge ${badgeClass(p.badge)}">${esc(p.badge)}</span>
          <span class="mk-art__shade"></span>
          <span class="mk-art__cap">
            <span class="mk-art__title" style="display:block">${esc(p.title)}</span>
            <span class="mk-art__text" style="display:block">${esc(p.text)}</span>
          </span>
        </button>
        <div class="mk-post__bar">
          <span class="mk-heart">❤ ${p.likes}</span><span>💬 ${p.comments}</span><span class="mk-save">🔖</span>
        </div>
      </article>`).join('');
    wireBizLinks(box);
    return;
  }

  if (currentTab === 'info') {
    box.innerHTML = `
      <div class="mk-about">
        <div class="mk-about__t">Про бізнес</div>
        <div class="mk-about__p">${esc(biz.about)}</div>
        <div class="mk-about__row">🕘 <span>${esc(biz.hours)}
          ${biz.openNow ? '<span class="mk-open">· Відчинено зараз</span>' : '<span class="mk-closed">· Зачинено</span>'}</span></div>
        <div class="mk-about__row">📍 <span>${esc(biz.address)}</span></div>
        <div class="mk-about__row">📞 <span><a href="tel:${esc(biz.phone)}">${esc(biz.phone)}</a></span></div>
        ${biz.delivery ? `<div class="mk-about__row">🛵 <span>Доставка ${biz.delivery} ₴${
          biz.freeFrom ? `, безкоштовно від ${biz.freeFrom} ₴` : ''}</span></div>` : ''}
        <div class="mk-map">📍</div>
      </div>`;
    return;
  }

  box.innerHTML = `<div class="mk-note">Відгуки — у бойовій версії.<br>Рейтинг ${biz.rating} з ${biz.reviews} оцінок.</div>`;
}

// ═══ ЕКРАН 3: ОКРЕМА ПУБЛІКАЦІЯ ════════════════════════════════════════════
function renderPost(p) {
  const biz = p.biz;
  currentBiz = biz;

  $('#mk-head').innerHTML = `
    <button class="mk-icon-btn" id="mk-back" type="button" aria-label="Назад">‹</button>
    <div class="mk-top__sp"></div>
    <button class="mk-icon-btn" type="button" aria-label="Зберегти">🔖</button>
    <button class="mk-icon-btn" type="button" aria-label="Поділитися">↗</button>`;
  $('#mk-back').onclick = () => history.back();

  $('#mk-view').innerHTML = `
    <div class="mk-post__head" style="padding:0 0 12px">
      <span class="mk-ava" style="background:${esc(biz.logoBg)}">${biz.logo}</span>
      <span class="mk-post__who">
        <span class="mk-post__name">${esc(biz.name)}${biz.verified ? '<span class="mk-verified">✔</span>' : ''}</span>
        <span class="mk-post__meta">${esc(p.time)} · Олика</span>
      </span>
    </div>

    <div class="mk-art" style="background:${esc(p.art.bg)};border-radius:16px;overflow:hidden">
      ${artHtml(p)}
      <span class="mk-badge ${badgeClass(p.badge)}">${esc(p.badge)}</span>
    </div>

    <h1 class="mk-detail__title">${esc(p.title)}</h1>
    <p class="mk-detail__text">${esc(p.text)}</p>

    ${p.bullets?.length ? `<ul class="mk-bullets">${p.bullets.map(b => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}

    <button class="mk-cta" type="button" data-order="${esc(biz.id)}" style="margin-top:16px">
      ${esc(p.cta)} зараз
    </button>

    <div class="mk-post__bar" style="border-top:1px solid var(--mk-line);border-bottom:1px solid var(--mk-line);margin:16px 0">
      <span class="mk-heart">❤ ${p.likes}</span><span>💬 ${p.comments}</span><span class="mk-save">↗</span>
    </div>

    <div class="mk-about">
      <div class="mk-about__t">Про бізнес</div>
      <div class="mk-about__p">${esc(biz.about)}</div>
      <div class="mk-about__row">🕘 <span>${esc(biz.hours)}
        ${biz.openNow ? '<span class="mk-open">· Відчинено зараз</span>' : '<span class="mk-closed">· Зачинено</span>'}</span></div>
      <div class="mk-about__row">📍 <span>${esc(biz.address)}</span></div>
      <div class="mk-map">📍</div>
    </div>

    <a class="mk-backhome" href="index.html" style="margin-top:16px">← Повернутися до Castle Life</a>`;

  wireBizLinks($('#mk-view'));
  updateBar();
}

// ── СПІЛЬНІ ОБРОБНИКИ ───────────────────────────────────────────────────────
// Одне місце на всі три екрани: тап по бізнесу / по «фото» / по кнопці дії.
function wireBizLinks(root) {
  root.querySelectorAll('[data-biz]').forEach(el => {
    el.onclick = () => { location.hash = `#/biz/${el.dataset.biz}`; };
  });
  root.querySelectorAll('[data-post]').forEach(el => {
    el.onclick = () => { location.hash = `#/post/${el.dataset.post}`; };
  });
  // «Замовити» / «Записатися» / «Переглянути» → сторінка бізнесу, таб «Товари».
  root.querySelectorAll('[data-order]').forEach(el => {
    el.onclick = () => { currentTab = 'items'; location.hash = `#/biz/${el.dataset.order}`; };
  });
}

// ── КОШИК ───────────────────────────────────────────────────────────────────
// Точково перемальовуємо ОДИН лічильник, а не весь список — інакше при
// кожному «+» сторінка стрибала б на початок.
function changeQty(itemId, delta) {
  const n = Math.max(0, (cart.get(itemId) || 0) + delta);
  if (n === 0) cart.delete(itemId); else cart.set(itemId, n);

  const box = $(`[data-qty="${CSS.escape(itemId)}"]`);
  if (box) {
    box.querySelector('.mk-qty__val').textContent = String(n);
    box.classList.toggle('mk-qty--empty', n === 0);
  }
  updateBar();
}

function cartLines() {
  if (!currentBiz) return [];
  return [...cart.entries()].map(([id, qty]) => {
    const it = currentBiz.items.find(x => x.id === id);
    return { id, title: it.title, price: it.price, unit: it.unit, qty };
  });
}

const cartSum = () => cartLines().reduce((s, l) => s + l.price * l.qty, 0);

// Доставка безкоштовна від певної суми — це видно і в панелі, і в чеку.
function deliveryFee() {
  if (!currentBiz?.delivery) return 0;
  if (currentBiz.freeFrom && cartSum() >= currentBiz.freeFrom) return 0;
  return currentBiz.delivery;
}

function updateBar() {
  const bar = $('#mk-bar');
  const lines = cartLines();
  const sum = cartSum();
  const count = lines.reduce((s, l) => s + l.qty, 0);
  bar.classList.toggle('mk-bar--on', count > 0);
  if (!count) return;

  const min = currentBiz.minOrder || 0;
  const enough = sum >= min;
  const fee = deliveryFee();
  $('#mk-bar-sum').innerHTML = enough
    ? `<b>${sum} ₴</b><small>${count} ${plural(count, 'позиція', 'позиції', 'позицій')} · ${
        fee ? `+ доставка ${fee} ₴` : 'доставка безкоштовна'}</small>`
    : `<b>${sum} ₴</b><small>ще ${min - sum} ₴ до мінімального замовлення</small>`;
  $('#mk-bar-btn').disabled = !enough;
}

// ── ЛИСТ ОФОРМЛЕННЯ ─────────────────────────────────────────────────────────
function wireSheet() {
  $('#mk-bar-btn').onclick = openSheet;
  $('#mk-sheet-back').onclick = closeSheet;
  $('#mk-submit').onclick = submit;

  document.querySelectorAll('[data-pay]').forEach(b => {
    b.onclick = () => {
      payment = b.dataset.pay;
      document.querySelectorAll('[data-pay]').forEach(x =>
        x.setAttribute('aria-pressed', String(x.dataset.pay === payment)));
    };
  });

  // Імʼя/телефон/адреса памʼятаються між пробами — щоб не набирати щоразу.
  ['name', 'phone', 'address'].forEach(k => {
    const el = $(`#f-${k}`);
    el.value = localStorage.getItem(`cstl_mk_${k}`) || '';
    el.oninput = () => localStorage.setItem(`cstl_mk_${k}`, el.value);
  });
}

function openSheet() {
  const lines = cartLines();
  const sum = cartSum();
  const fee = deliveryFee();
  $('#mk-lines').innerHTML = `
    ${lines.map(l => `
      <div class="mk-line">
        <span>${esc(l.title)} <span class="mk-line--muted">× ${l.qty}</span></span>
        <span>${l.price * l.qty} ₴</span>
      </div>`).join('')}
    <div class="mk-line mk-line--muted"><span>Доставка</span><span>${fee ? `${fee} ₴` : 'безкоштовно'}</span></div>
    <div class="mk-line mk-line--total"><span>До сплати</span><span>${sum + fee} ₴</span></div>`;
  $('#mk-sheet-sub').textContent = `${currentBiz.name} · ${currentBiz.address}`;
  $('#mk-err').hidden = true;
  $('#mk-sheet-back').classList.add('mk-sheet-back--on');
  $('#mk-sheet').classList.add('mk-sheet--on');
}

function closeSheet() {
  $('#mk-sheet-back').classList.remove('mk-sheet-back--on');
  $('#mk-sheet').classList.remove('mk-sheet--on');
}

// ── ВІДПРАВКА ЗАМОВЛЕННЯ ────────────────────────────────────────────────────
async function submit() {
  const name    = $('#f-name').value.trim();
  const phone   = $('#f-phone').value.trim();
  const address = $('#f-address').value.trim();
  const comment = $('#f-comment').value.trim();

  // Перевірка (validation). Телефон — за ним курʼєр дзвонитиме; без нього
  // і без адреси замовлення марне, тому це єдині жорсткі поля.
  const digits = phone.replace(/\D/g, '');
  const bad = [];
  if (name.length < 2)    bad.push('name');
  if (digits.length < 9)  bad.push('phone');
  if (address.length < 3) bad.push('address');

  ['name', 'phone', 'address'].forEach(k =>
    $(`#f-${k}`).closest('.mk-field').classList.toggle('mk-field--err', bad.includes(k)));

  if (bad.length) {
    showErr('Заповніть імʼя, телефон і адресу — курʼєру треба знати, куди їхати і кому дзвонити.');
    return;
  }

  const btn = $('#mk-submit');
  btn.disabled = true;
  btn.textContent = 'Відправляю…';

  const order = buildOrder({
    business: currentBiz,
    customer: { name, phone, address, comment },
    items: cartLines(),
    delivery: deliveryFee(),
    payment,
  });

  const res = await sendOrder(order);

  btn.disabled = false;
  btn.textContent = 'Замовити';

  if (!res.ok) {
    showErr(`Не вдалося передати замовлення курʼєру (режим «${res.mode}»). ${res.error}`);
    return;
  }
  renderDone(order, res.mode);
}

function showErr(text) {
  const box = $('#mk-err');
  box.textContent = text;
  box.hidden = false;
}

function renderDone(order, mode) {
  const where = mode === 'local'
    ? 'Відкрий вкладку «Курʼєр» — воно вже там.'
    : 'Замовлення передано в додаток курʼєра.';
  $('#mk-sheet').innerHTML = `
    <div class="mk-sheet__grip"></div>
    <div class="mk-done">
      <div class="mk-done__ico">✅</div>
      <div class="mk-done__t">Замовлення прийнято</div>
      <div class="mk-done__s">${esc(where)}<br>Курʼєр зателефонує на ${esc(order.customer.phone)}.</div>
      <div class="mk-done__id">${esc(order.id)}</div>
    </div>
    <div style="display:flex;gap:8px;margin-top:20px">
      <a class="mk-btn mk-btn--ghost" href="courier.html" target="_blank"
         style="flex:1;text-align:center;text-decoration:none">Екран курʼєра</a>
      <button class="mk-btn" id="mk-done-ok" type="button" style="flex:1">Готово</button>
    </div>`;
  $('#mk-done-ok').onclick = () => {
    closeSheet();
    setTimeout(() => { location.hash = ''; location.reload(); }, 260);
  };
}

// ── ДРІБНИЦІ ────────────────────────────────────────────────────────────────
// «Фото» публікації: якщо колись зʼявиться справжній знімок (`p.photo`) —
// він перекриє градієнт; поки що показуємо велику емодзі.
function artHtml(p) {
  return p.photo
    ? `<img src="${esc(p.photo)}" alt="${esc(p.title)}">`
    : `<span>${p.art.emoji}</span>`;
}

function badgeClass(badge) {
  return badge === 'АКЦІЯ' ? 'mk-badge--sale'
       : badge === 'НОВИНКА' ? 'mk-badge--new'
       : 'mk-badge--serv';
}

function stars(r) {
  const full = Math.round(r);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

const IC = {
  chat:  svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  phone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2z"/>'),
  route: svg('<circle cx="12" cy="10" r="3"/><path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/>'),
  save:  svg('<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>'),
};
function svg(inner) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Українська множина: 1 позиція / 2-4 позиції / 5+ позицій.
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
