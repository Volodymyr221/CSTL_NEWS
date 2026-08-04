// src/tabs/home-fund.js — блок «АКТУАЛЬНІ ЗБОРИ» на головній.
//
// Замовлення Вови (04.08): збори для військових · гуманітарні · благодійні
// ініціативи громади. Має бути помітним, викликати довіру, **не виглядати
// рекламою**, і зникати, коли зборів немає.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔑 ЯК ТУТ ЗРОБЛЕНО ДОВІРУ (і чому саме так)
//
// Довіру дає **перевірюваність**, а не гучність. Тому:
//   • помітність дає МІСЦЕ (одразу під смугою «Зараз»), а не колір і не рамка —
//     кричущий банер у стрічці громади читається як реклама, і це рівно те,
//     чого Вова просив уникнути;
//   • поверхня — звичайна біла картка, як у новин і оголошень. Бордовим
//     позначені лише смужка прогресу і сума: акцент на ЧИСЛІ, а не на блоці;
//   • **обовʼязково видно, ХТО збирає** (`org`) і **куди веде посилання** (`url`).
//
// 🔴 ЗАПИС БЕЗ `org` АБО БЕЗ `url` НЕ МАЛЮЄТЬСЯ ВЗАГАЛІ.
// Це не валідація «про всяк випадок»: збір без названого відповідального —
// саме те, як виглядає шахрайський допис. Краще не показати нічого, ніж
// показати анонімний збір на головній сторінці громади.
//
// 📦 ДАНІ: `data/fundraisers.json` у git (рішення 03.08, підтверджене 04.08).
// Редагується через GitHub UI, деплоїться разом із сайтом, бекенду не потребує.
// ⚠️ Форма запису навмисно проста і пласка, щоб переїзд у Supabase (якщо Вова
// захоче редагувати збори з адмінки) не зачепив цей файл: зміниться лише
// джерело в `loadFundraisers()`, а розмітка й правила лишаться ті самі.
//
//   { "id", "title", "org", "url",
//     "goal": число ₴ | null, "raised": число ₴ | null,
//     "kind": "military" | "humanitarian" | "community",
//     "until": "РРРР-ММ-ДД" | null,   // після цієї дати збір сам зникає
//     "active": true }
//
// Порожній `items: []` → блока немає. Файл із помилкою → блока немає (і жодного
// «щось пішло не так» на головній: збори — не те, через що варто лякати людину).

import { escapeHtml } from '../core/utils.js';

const KIND_ICON = {
  military:     '🪖',
  humanitarian: '🤝',
  community:    '🏘️',
};

// Формат суми: «64 200 ₴» — нерозривні пробіли, щоб число не переносилось.
function money(n) {
  if (!Number.isFinite(n)) return null;
  // `toLocaleString('uk-UA')` ставить між тисячами НЕРОЗРИВНИЙ пробіл — число
  // не переноситься саме посеред себе (той самий прийом, що у `formatPrice`).
  // ⚠️ Не беремо саму `formatPrice`: вона має семантику ЦІНИ і віддає
  // «Безкоштовно» на нулі — для «0 ₴ зібрано» це неправильні слова.
  return `${Math.round(n).toLocaleString('uk-UA')} ₴`;
}

async function loadFundraisers() {
  try {
    const res = await fetch('./data/fundraisers.json', { cache: 'no-cache' });
    if (!res.ok) return [];
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || []);
    const todayISO = new Date().toISOString().slice(0, 10);
    return items.filter(it =>
      it && it.active !== false &&
      it.title && it.org && it.url &&              // 🔴 без відповідального і посилання — не показуємо
      (!it.until || it.until >= todayISO)          // прострочений збір зникає сам
    );
  } catch {
    return [];
  }
}

function fundCardHtml(it) {
  const icon = KIND_ICON[it.kind] || KIND_ICON.community;
  const goal = money(it.goal);
  const raised = money(it.raised);
  // Смужка прогресу — лише коли є обидва числа. Смужка без цілі нічого не
  // означає, а «зібрано 0%» на видноті демотивує сам збір.
  const hasBar = Number.isFinite(it.goal) && Number.isFinite(it.raised) && it.goal > 0;
  const pct = hasBar ? Math.max(0, Math.min(100, Math.round(it.raised / it.goal * 100))) : 0;

  return `
    <a class="hm-card hm-fund" href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">
      <div class="hm-fund-top">
        <span class="hm-fund-ic" aria-hidden="true">${icon}</span>
        <span class="hm-fund-txt">
          <span class="hm-title hm-fund-ttl">${escapeHtml(it.title)}</span>
          <span class="hm-quiet hm-fund-org">${escapeHtml(it.org)}</span>
        </span>
      </div>
      ${hasBar ? `
      <div class="hm-fund-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <i style="width:${pct}%"></i>
      </div>
      <div class="hm-fund-nums">
        <span><b>${raised}</b> зібрано</span>
        <span>ціль ${goal}</span>
      </div>` : ''}
    </a>`;
}

export async function renderHomeFund() {
  const sec = document.getElementById('hm-fund');
  const body = document.getElementById('hm-fund-body');
  if (!sec || !body) return;

  const items = await loadFundraisers();
  if (!items.length) {
    // Немає зборів → секції немає ЗОВСІМ. Не «порожній стан», не заглушка:
    // блок про допомогу, який показує «зборів немає», займає місце й нічого не дає.
    sec.hidden = true;
    body.innerHTML = '';
    return;
  }

  // На головній — один збір (найперший активний). Решта живуть за «Усі →»,
  // коли їх стане більше одного: показувати три збори одночасно означає
  // змусити людину вибирати, кому допомогти, — і вона не вибере жодного.
  const [first] = items;
  sec.hidden = false;
  body.innerHTML = fundCardHtml(first);
  body.classList.add('hm-appear');

  // Кнопка «Усі →» зʼявляється лише коли зборів справді більше одного.
  const head = sec.querySelector('.hm-sec-head');
  const old = head && head.querySelector('.hm-more');
  if (head && items.length > 1 && !old) {
    head.insertAdjacentHTML('beforeend',
      `<a class="hm-more" href="${escapeHtml(items[0].url)}" target="_blank" rel="noopener noreferrer">Усі →</a>`);
  }
}
