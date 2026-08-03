// src/tabs/home-fund.js
// БЛОК «АКТУАЛЬНІ ЗБОРИ» на головному екрані (03.08.2026, потік /byyou).
//
// Замовлення Вови: «Передбач окремий інформаційний блок "Актуальні збори"…
// відображати активні збори для військових або інші важливі благодійні збори
// громади. Продумай його UX так, щоб: він добре помічався; не виглядав як
// реклама; викликав довіру; легко оновлювався; за відсутності активних зборів
// блок автоматично приховувався або займав мінімум місця.»
//
// ── ЧОТИРИ ВИМОГИ І ЯК КОЖНА ЗАКРИТА ────────────────────────────────────────
// «Помічався»    — блок стоїть ДРУГИМ на екрані, одразу під смугою «ЗАРАЗ», ще
//                  до новин. Помітність дає МІСЦЕ, а не колір: кричущий банер
//                  привертає увагу один раз, а потім його починають прокручувати
//                  не читаючи (сліпота до банерів).
// «Не як реклама»— немає жодного прийому реклами: ні великої кнопки-заклику на
//                  всю ширину, ні відліку «лишилось 2 дні!», ні контрастного
//                  фону. Це картка в тій самій системі, що новини й оголошення.
// «Довіра»       — блок називає ІМЕНА і ЧИСЛА: хто збирає, хто підтвердив,
//                  скільки з якої цілі, куди веде посилання. Анонімний збір
//                  «допоможіть ЗСУ» без організатора не має тут як зʼявитись —
//                  без `title`, `org` і `url` запис просто не малюється.
// «Оновлювався»  — `data/fundraisers.json` у git (рішення Вови 03.08, варіант А):
//                  правиш через GitHub UI, як `data/curated.json`. Деплой сам.
//
// ⚠️ ПОРОЖНІЙ СПИСОК = БЛОКА НЕМАЄ ЗОВСІМ. Не «блок з написом", не згорнутий
// рядок — контейнер лишається порожнім, а `.hm-fund-wrap:empty { display:none }`
// прибирає і його відступ. Інакше в ритмі секцій висіла б дірка 22px у місяці,
// коли зборів немає.
//
// ── СТРУКТУРА ЗАПИСУ ────────────────────────────────────────────────────────
//   {
//     "id": "fpv-14ombr",              // унікальний, для ключа
//     "active": true,                  // false → не малюємо (історію не стираємо)
//     "title": "На FPV-дрони для 14 ОМБр",
//     "org": "Волонтерська група «Олика допомагає»",   // ХТО збирає — обовʼязково
//     "verifiedBy": "Олицька громада", // хто підтвердив (необовʼязково)
//     "goal": 50000,                   // ціль, грн (необовʼязково — буває «без цілі»)
//     "raised": 31200,                 // зібрано, грн (необовʼязково)
//     "deadline": "2026-08-20",        // необовʼязково
//     "note": "Один рядок про суть",   // необовʼязково
//     "url": "https://send.monobank.ua/jar/…"   // куди веде «Підтримати» — обовʼязково
//   }
//
// ⚠️ ПЕРЕЇЗД У SUPABASE, якщо колись знадобиться оновлювати з телефона: міняється
// РІВНО одна функція — `loadFundraisers()`. Форма запису і весь рендер лишаються
// як є; саме тому вони й розділені.

import { escapeHtml } from '../core/utils.js';
import { ICONS } from '../core/icons.js';

const SRC = './data/fundraisers.json';

// Скільки зборів показуємо одночасно. Два — межа, за якою блок перестає бути
// «ось що зараз важливо» і стає списком. Третій і далі є в даних, але на головну
// не потрапляють: головна не каталог.
const MAX_SHOWN = 2;

async function loadFundraisers() {
  try {
    const res = await fetch(SRC, { cache: 'no-cache' });
    const data = await res.json();
    const items = Array.isArray(data) ? data : (data.items || []);
    return items.filter(isPublishable);
  } catch {
    return [];   // немає файлу / мережі → блока просто немає, помилку не показуємо
  }
}

// 🔴 Сторож довіри. Запис без організатора або без посилання НЕ малюється —
// це не «валідація формату», а правило: людину не можна просити дати гроші
// невідомо кому. Краще порожній блок, ніж анонімний збір на головній.
function isPublishable(it) {
  return !!(it && it.active !== false && it.title && it.org && it.url);
}

// «31 200 ₴» — нерозривні пробіли між розрядами, щоб сума не рвалась на два рядки.
function money(n) {
  if (typeof n !== 'number' || !isFinite(n)) return '';
  return new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 }).format(n) + ' ₴';
}

// Прогрес рахуємо лише коли є ОБИДВА числа і ціль додатна. Смуга «0%» при
// невідомій цілі казала б неправду — краще показати саму зібрану суму.
function progressOf(it) {
  const { goal, raised } = it;
  if (typeof goal !== 'number' || typeof raised !== 'number' || goal <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((raised / goal) * 100)));
}

function cardHtml(it) {
  const pct = progressOf(it);
  const done = pct !== null && pct >= 100;

  // Рядок сум. Без цілі — лише зібране; без обох чисел — рядка немає взагалі.
  let sums = '';
  if (pct !== null) {
    sums = `<span class="hm-fund-raised">${money(it.raised)}</span>
            <span class="hm-fund-goal">з ${money(it.goal)}</span>
            <span class="hm-fund-pct">${pct}%</span>`;
  } else if (typeof it.raised === 'number') {
    sums = `<span class="hm-fund-raised">${money(it.raised)}</span>
            <span class="hm-fund-goal">зібрано</span>`;
  }

  const bar = pct !== null ? `
    <div class="hm-fund-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
         aria-valuenow="${pct}" aria-label="Зібрано ${pct} відсотків">
      <span style="width:${pct}%"></span>
    </div>` : '';

  return `
    <article class="hm-card hm-fund" data-fund="${escapeHtml(String(it.id || it.title))}">
      <div class="hm-fund-in">
        <div class="hm-fund-head">
          <!-- Векторна іконка, а не емодзі 🎗: емодзі малює ШРИФТ ПРИСТРОЮ, і
               на частині систем стрічка виходить монохромним контуром або не
               виходить зовсім. Проєкт уже переводив емодзі на ICONS з тієї
               самої причини. -->
          <span class="hm-fund-mark" aria-hidden="true">${ICONS.community}</span>
          <h4 class="hm-fund-title">${escapeHtml(it.title)}</h4>
        </div>

        <p class="hm-fund-org">${escapeHtml(it.org)}${
          it.verifiedBy ? ` · <span class="hm-fund-ver">підтверджує ${escapeHtml(it.verifiedBy)}</span>` : ''
        }</p>

        ${it.note ? `<p class="hm-fund-note">${escapeHtml(it.note)}</p>` : ''}

        ${sums ? `<div class="hm-fund-sums">${sums}</div>` : ''}
        ${bar}

        <a class="hm-fund-cta" href="${escapeHtml(it.url)}" target="_blank" rel="noopener noreferrer">
          ${done ? 'Ціль зібрано — деталі' : 'Підтримати'}
        </a>
        <p class="hm-fund-fine">Кошти йдуть напряму організатору. CSTL LIFE не збирає і не зберігає гроші.</p>
      </div>
    </article>`;
}

export async function renderFundBlock() {
  const host = document.getElementById('hm-fund');
  if (!host) return;

  const items = (await loadFundraisers()).slice(0, MAX_SHOWN);
  if (!items.length) { host.innerHTML = ''; return; }   // блока немає — і відступу теж

  host.innerHTML = `
    <div class="hm-sec">
      <div class="hm-sec-head">
        <h3 class="hm-sec-title">Актуальні збори</h3>
      </div>
      ${items.map(cardHtml).join('')}
    </div>`;
}
