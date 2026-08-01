// src/market/order-bridge.js
// ─────────────────────────────────────────────────────────────────────────────
// МІСТ ЗАМОВЛЕНЬ (order bridge — «міст», прошарок що передає замовлення
// з маркета в додаток курʼєра).
//
// 🔑 ГОЛОВНА ІДЕЯ: сторінка маркета НІЧОГО не знає про те, куди летить
// замовлення. Вона кличе одну функцію `sendOrder(order)`. Куди саме воно
// піде — вирішує КОНФІГ нижче. Тому підключити додаток Діми = змінити
// `MODE` і вписати адресу, БЕЗ переробки сторінки.
//
// Три режими (mode — «режим»):
//   'local'    — замовлення лягає в localStorage (сховище браузера) і
//                миттєво летить у BroadcastChannel (канал між вкладками
//                одного браузера). Це режим ПЕРЕВІРКИ ПОТОКУ: відкрив
//                market.html і courier.html у двох вкладках — замовлення
//                зʼявляється в другій за секунду. Backend (сервер) не потрібен.
//   'webhook'  — POST-запит (HTTP-виклик) на будь-яку адресу: сервер Діми,
//                n8n, Make, бот Telegram, Google Apps Script. Найшвидший
//                спосіб підключити ЧУЖИЙ додаток.
//   'supabase' — вставка рядка в таблицю Supabase (база даних) додатка Діми.
//                Найкращий варіант якщо його додаток теж на Supabase:
//                курʼєр отримає замовлення через realtime (живе оновлення),
//                без опитування сервера.
//
// ⚠️ Це ПРОБНА (test) інфраструктура. У бойовий маркет піде окрема схема
// в БД з RLS (row level security — правила доступу до рядків), бо тут
// замовлення поки нічим не захищене.
// ─────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// ⚙️ КОНФІГ — ЄДИНЕ МІСЦЕ, ЯКЕ ТРЕБА ЧІПАТИ ЩОБ ПІДКЛЮЧИТИ ДОДАТОК ДІМИ
// ═══════════════════════════════════════════════════════════════════════════
export const BRIDGE_CONFIG = {
  // 'local' | 'webhook' | 'supabase'
  mode: 'local',

  webhook: {
    // Приклад: 'https://api.dima-courier.app/orders'
    // або вебхук n8n / Telegram-бот / Apps Script — будь-що що приймає POST.
    url: '',
    // Додаткові заголовки (headers) — якщо додаток Діми просить ключ доступу.
    // Приклад: { 'Authorization': 'Bearer xxx' } або { 'x-api-key': 'xxx' }
    headers: {},
  },

  supabase: {
    // Дані з проєкту Діми: Project Settings → API
    url: '',        // 'https://xxxxx.supabase.co'
    anonKey: '',    // публічний (anon / publishable) ключ
    table: 'orders',
    // Мапа полів (field map — «як наші назви полів звуться в його таблиці»).
    // Ліворуч — наше поле, праворуч — колонка в таблиці Діми.
    // Якщо його колонки звуться інакше — правити ТІЛЬКИ тут.
    columns: {
      id: 'id',
      created_at: 'created_at',
      business_name: 'business_name',
      business_address: 'business_address',
      customer_name: 'customer_name',
      customer_phone: 'customer_phone',
      customer_address: 'customer_address',
      comment: 'comment',
      items: 'items',            // JSON-масив позицій
      total: 'total',
      payment: 'payment',
      status: 'status',
    },
  },
};

// Ключі сховища й канал — спільні для market.html і courier.html.
export const STORE_KEY = 'cstl_market_orders_v1';
export const CHANNEL   = 'cstl-courier-orders';

// ── СХЕМА ЗАМОВЛЕННЯ (order schema) ─────────────────────────────────────────
// Це КОНТРАКТ (contract — домовленість про формат) між маркетом і курʼєром.
// Саме цей JSON треба показати Дімі: якщо його додаток вміє прийняти такий
// обʼєкт — підключення зводиться до вписування адреси у конфіг вище.
//
// {
//   id:          'ORD-250801-4821',      // людиночитний номер
//   created_at:  '2026-08-01T12:30:00.000Z',
//   source:      'cstl-market',          // хто прислав
//   status:      'new',                  // new → accepted → picked → delivered
//   business:  { id, name, address, phone },
//   customer:  { name, phone, address, comment },
//   items:     [ { id, title, price, qty } ],
//   subtotal:    240,                    // сума товарів, грн
//   delivery:    30,                     // доставка, грн
//   total:       270,                    // до сплати, грн
//   payment:     'cash' | 'card'
// }

// ── ГЕНЕРАТОР НОМЕРА ────────────────────────────────────────────────────────
// Формат ORD-ДДММ-XXXX. Випадкові 4 цифри, а не лічильник — бо лічильник
// довелось би десь зберігати, а номер тут потрібен лише щоб Вова і курʼєр
// бачили одне й те саме число на двох екранах.
function makeOrderId() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const rnd = String(Math.floor(1000 + Math.random() * 9000));
  return `ORD-${dd}${mm}-${rnd}`;
}

// ── СКЛАДАННЯ ЗАМОВЛЕННЯ ────────────────────────────────────────────────────
// Приймає «сирі» дані з форми, віддає готовий обʼєкт за схемою вище.
export function buildOrder({ business, customer, items, delivery = 0, payment = 'cash' }) {
  const list = items.map(it => ({
    id: it.id,
    title: it.title,
    price: Number(it.price) || 0,
    qty: Number(it.qty) || 0,
  }));
  const subtotal = list.reduce((s, it) => s + it.price * it.qty, 0);
  return {
    id: makeOrderId(),
    created_at: new Date().toISOString(),
    source: 'cstl-market',
    status: 'new',
    business: {
      id: business.id,
      name: business.name,
      address: business.address,
      phone: business.phone,
    },
    customer: {
      name: (customer.name || '').trim(),
      phone: (customer.phone || '').trim(),
      address: (customer.address || '').trim(),
      comment: (customer.comment || '').trim(),
    },
    items: list,
    subtotal,
    delivery: Number(delivery) || 0,
    total: subtotal + (Number(delivery) || 0),
    payment,
  };
}

// ── ВІДПРАВКА ───────────────────────────────────────────────────────────────
// Повертає { ok, mode, error }. Ніколи не кидає виняток (throw) — сторінка
// маркета має показати людині зрозумілий текст, а не впасти.
export async function sendOrder(order) {
  const mode = BRIDGE_CONFIG.mode;
  try {
    if (mode === 'webhook')  { await sendWebhook(order);  return { ok: true, mode }; }
    if (mode === 'supabase') { await sendSupabase(order); return { ok: true, mode }; }
    sendLocal(order);
    return { ok: true, mode: 'local' };
  } catch (err) {
    return { ok: false, mode, error: err?.message || String(err) };
  }
}

// ── РЕЖИМ 1: LOCAL (перевірка потоку без сервера) ───────────────────────────
// Пишемо в localStorage + сигналимо в BroadcastChannel.
// Чому ОБИДВА, а не щось одне:
//   • BroadcastChannel доставляє миттєво, але нічого не зберігає — вкладка
//     курʼєра, відкрита ПІЗНІШЕ, не побачила б замовлення взагалі;
//   • localStorage зберігає, але подія `storage` в тій самій вкладці не
//     спрацьовує і на iOS ловиться не завжди надійно.
// Разом вони дають і миттєвість, і історію.
export function sendLocal(order) {
  const all = readLocalOrders();
  all.unshift(order);
  localStorage.setItem(STORE_KEY, JSON.stringify(all.slice(0, 100)));
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage({ type: 'new-order', order });
    ch.close();
  } catch { /* BroadcastChannel нема (старий Safari) — виживе на storage-події */ }
}

export function readLocalOrders() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function writeLocalOrders(list) {
  localStorage.setItem(STORE_KEY, JSON.stringify(list.slice(0, 100)));
  try {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage({ type: 'orders-changed' });
    ch.close();
  } catch { /* нема каналу — інша вкладка оновиться при наступному відкритті */ }
}

// ── РЕЖИМ 2: WEBHOOK (додаток Діми з власним API) ───────────────────────────
async function sendWebhook(order) {
  const { url, headers } = BRIDGE_CONFIG.webhook;
  if (!url) throw new Error('BRIDGE_CONFIG.webhook.url порожній — впиши адресу додатка курʼєра');
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
    body: JSON.stringify(order),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Сервер курʼєра відповів ${res.status}. ${text.slice(0, 200)}`);
  }
  // Копію лишаємо і локально — щоб макет курʼєра поруч показував те саме,
  // і щоб при розборі «дійшло / не дійшло» було з чим звіряти.
  sendLocal(order);
}

// ── РЕЖИМ 3: SUPABASE (додаток Діми на Supabase) ────────────────────────────
// Пишемо через REST (PostgREST) напряму — щоб не тягнути SDK на пробну сторінку.
async function sendSupabase(order) {
  const cfg = BRIDGE_CONFIG.supabase;
  if (!cfg.url || !cfg.anonKey) {
    throw new Error('BRIDGE_CONFIG.supabase.url / anonKey порожні — впиши дані проєкту курʼєра');
  }
  const c = cfg.columns;
  const row = {
    [c.id]: order.id,
    [c.created_at]: order.created_at,
    [c.business_name]: order.business.name,
    [c.business_address]: order.business.address,
    [c.customer_name]: order.customer.name,
    [c.customer_phone]: order.customer.phone,
    [c.customer_address]: order.customer.address,
    [c.comment]: order.customer.comment,
    [c.items]: order.items,
    [c.total]: order.total,
    [c.payment]: order.payment,
    [c.status]: order.status,
  };
  const res = await fetch(`${cfg.url}/rest/v1/${cfg.table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.anonKey}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase курʼєра відповів ${res.status}. ${text.slice(0, 300)}`);
  }
  sendLocal(order);
}

// ── ПІДПИСКА (для екрана курʼєра) ───────────────────────────────────────────
// Кличе `cb()` щоразу коли зʼявилось нове замовлення. Повертає функцію
// відписки (unsubscribe) — щоб при закритті екрана не лишався висіти слухач.
export function subscribeOrders(cb) {
  let ch = null;
  try {
    ch = new BroadcastChannel(CHANNEL);
    ch.onmessage = () => cb();
  } catch { /* нема каналу — лишається storage-подія нижче */ }

  // `storage` спрацьовує в ІНШИХ вкладках того самого браузера — страховка
  // на випадок коли BroadcastChannel недоступний.
  const onStorage = e => { if (e.key === STORE_KEY) cb(); };
  window.addEventListener('storage', onStorage);

  return () => {
    try { ch?.close(); } catch { /* вже закритий */ }
    window.removeEventListener('storage', onStorage);
  };
}
