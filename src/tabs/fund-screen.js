// src/tabs/fund-screen.js — повноекранний розділ «ЗБОРИ» + заявка від жителя.
//
// Замовлення Вови 17.08: «продумати в бургер-меню вкладку в правильній
// підкатегорії… людина клацає туди, зможе звʼязатися з підтримкою та
// запропонувати опублікувати збір».
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔑 ОДИН ПУНКТ МЕНЮ, А НЕ ДВА («Актуальні збори» + «Подати збір»)
//
// Вова назвав два, я запропонував один і лишив рішення за собою («роби як
// краще»). Аргументи, які його перевісили:
//   • у меню вже 14 пунктів, і два рядки на одну тему роблять його довшим, не
//     додаючи інформації;
//   • 🔴 ДІЯ МАЄ СТОЯТИ ТАМ, ДЕ ЛЮДИНА ВЖЕ БАЧИТЬ ПРИКЛАД. Відкривши «Збори»,
//     вона бачить, як виглядають чинні збори, і аж тоді кнопку «Запропонувати
//     збір» — тобто розуміє, що саме подає. Окремий пункт меню вів би в порожню
//     форму без контексту;
//   • це той самий патерн, що вже діє в «Мої оголошення» і «Збережені»: розділ,
//     а всередині дія.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ЧОМУ ФОРМА, А НЕ «НАПИШІТЬ НАМ У ПІДТРИМКУ»
//
// Вільний лист довелось би розбирати руками і перепитувати те, чого людина не
// написала. Головне ж інше: **поля форми — РІВНО ТІ САМІ, що й у самого збору**
// (`scripts/supabase_fundraisers.sql`). Тому схвалення в адмінці це ОДНА кнопка,
// а не переписування. Якби поля різнились, адмін щоразу набирав би все заново —
// і рано чи пізно зʼявилась би друкарська помилка В ПОСИЛАННІ НА ЧУЖУ БАНКУ,
// найдорожча помилка, яка тут можлива.
//
// 🛑 ЗАЯВКА ≠ ПУБЛІКАЦІЯ. Нічого не зʼявляється на головній автоматично: рядок
// лягає зі статусом «нова», Вова телефонує, і лише тоді збір створюється. Це
// сказано людині прямо у формі — обіцяти «опублікуємо» ми не можемо й не будемо.
//
// ⚠️ ГЕЙТ ВХОДУ. Заявку подає лише залогінений, і це не бюрократія: анонімна
// заявка на збір коштів — відкритий канал для шахрая, і немає з ким звʼязатись.
// Стоїть двома рубежами (тут і в RLS бази), бо клієнтську перевірку обходять.

import { openLayer, closeLayer } from '../core/layers.js';
import { openModal, closeModal } from '../core/modal.js';
import { escapeHtml, showToast } from '../core/utils.js';
import { ICONS } from '../core/icons.js';
import { loadFundraisers, fundCardHtml, wireFundOpen } from './home-fund.js';
import { submitFundraiserRequest, fetchMyFundraiserRequests } from '../core/supabase.js';
import { isLoggedIn, requireAuth } from '../core/auth.js';

const IC_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6l6 6"/></svg>';

// Відкритий екран — щоб другий тап по пункту меню не наплодив других.
let _screen = null;

const REQ_STATUS = {
  new:       { t: 'На розгляді',  c: 'wait' },
  contacted: { t: 'Ми звʼязались', c: 'wait' },
  approved:  { t: 'Опубліковано',  c: 'ok' },
  rejected:  { t: 'Відхилено',     c: 'no' },
};

export function isFundScreenOpen() { return !!_screen; }

export async function openFundScreen() {
  if (_screen) return;

  const screen = document.createElement('div');
  screen.className = 'fs-screen';
  screen.innerHTML = `
    <div class="fs-bar">
      <button class="fs-back" aria-label="Назад">${IC_BACK}</button>
      <h2 class="fs-title">Збори</h2>
    </div>
    <div class="fs-body">
      <p class="fs-lead">
        Тут збори, які веде громада. Гроші йдуть напряму на банку організатора —
        застосунок їх не приймає і не зберігає.
      </p>
      <div class="fs-list" id="fs-list"><div class="fs-empty">Завантаження…</div></div>
      <button class="fs-cta" id="fs-propose">
        <span class="fs-cta-ic" aria-hidden="true">${ICONS.megaphone}</span>
        Запропонувати збір
      </button>
      <p class="fs-hint">Ми звʼяжемось із вами і перевіримо збір перед публікацією.</p>
      <div id="fs-mine"></div>
    </div>`;
  document.body.appendChild(screen);
  document.body.classList.add('fs-open');

  // Шар історії — закриття системним жестом «назад». Власного свайпу тут НЕМА
  // навмисно: iOS малює свою анімацію, і два рухи накладались (розбір у шапці
  // `core/layers.js`).
  const layer = openLayer(
    () => { screen.remove(); document.body.classList.remove('fs-open'); _screen = null; },
    { animateOut: () => screen.classList.remove('open') },
  );
  _screen = { screen, layer };
  screen.querySelector('.fs-back').addEventListener('click', () => closeLayer(layer, { animate: 240 }));
  requestAnimationFrame(() => screen.classList.add('open'));

  screen.querySelector('#fs-propose').addEventListener('click', () => {
    // 🔑 `requireAuth` показує звичний екран входу застосунку, а не власний текст:
    // другий спосіб запросити людину увійти = другий вигляд того самого моменту.
    if (!isLoggedIn()) return requireAuth('щоб запропонувати збір');
    openProposeSheet();
  });

  await paintList(screen);
  await paintMine(screen);
}

async function paintList(screen) {
  const box = screen.querySelector('#fs-list');
  if (!box) return;
  const items = await loadFundraisers();
  // ⚠️ Екран міг закритись, поки їхали дані. Без цієї перевірки ми писали б у
  // вузол, якого вже немає в документі, — тихо і без помилки.
  if (!box.isConnected) return;
  box.innerHTML = items.length
    ? items.map(fundCardHtml).join('')
    // Порожній стан ТУТ доречний, на відміну від головної: людина прийшла в
    // розділ навмисно, і «нічого немає» — це відповідь на її питання.
    : '<div class="fs-empty">Зараз активних зборів немає.</div>';
  // Той самий делегат, що на головній — картка відкривається тапом і тут.
  // 🛑 Другу копію обробника НЕ пишемо: одна поведінка картки на весь застосунок.
  wireFundOpen(box);
}

// Мої заявки. 🔴 Людина мусить бачити, що сталося з її зверненням — інакше воно
// зникає в порожнечу, і наступного разу вона просто не звертається.
async function paintMine(screen) {
  const box = screen.querySelector('#fs-mine');
  if (!box || !isLoggedIn()) return;
  const mine = await fetchMyFundraiserRequests();
  if (!box.isConnected || !Array.isArray(mine) || !mine.length) return;
  box.innerHTML = `
    <h3 class="fs-sub">Мої заявки</h3>
    ${mine.map(r => {
      const s = REQ_STATUS[r.status] || REQ_STATUS.new;
      return `
      <div class="fs-req">
        <span class="fs-req-t">${escapeHtml(r.title)}</span>
        <span class="fs-req-s fs-req-s--${s.c}">${s.t}</span>
      </div>`;
    }).join('')}`;
}

// ── ФОРМА ЗАЯВКИ ────────────────────────────────────────────────────────────
//
// 📐 ПОРЯДОК ПОЛІВ — ВІД НАЙЛЕГШОГО ДО НАЙВАЖЧОГО, і це не косметика: людина,
// яка вже вписала назву й себе, доводить форму до кінця значно частіше, ніж та,
// що на першому кроці впирається в «посилання на банку». Обовʼязкові — чотири
// (назва · хто збирає · банка · телефон); решта допомагає, але не блокує.
function proposeFormHtml() {
  return `
    <p class="fsf-lead">
      Заповніть коротко — ми передзвонимо, уточнимо деталі й перевіримо збір.
      <b>Заявка не публікується автоматично.</b>
    </p>
    <label class="fsf-l">Назва збору<span class="fsf-req">*</span>
      <input class="fsf-i" id="fsf-title" maxlength="120" placeholder="Наприклад: дрони для 14 ОМБр">
    </label>
    <label class="fsf-l">Хто збирає<span class="fsf-req">*</span>
      <input class="fsf-i" id="fsf-org" maxlength="80" placeholder="Людина або організація">
    </label>
    <label class="fsf-l">Посилання на банку<span class="fsf-req">*</span>
      <input class="fsf-i" id="fsf-url" type="url" inputmode="url" placeholder="https://send.monobank.ua/jar/...">
    </label>
    <label class="fsf-l">Про що збір
      <textarea class="fsf-i fsf-ta" id="fsf-note" maxlength="400" rows="3"
                placeholder="Кілька речень: на що потрібні кошти"></textarea>
    </label>
    <div class="fsf-row">
      <label class="fsf-l">Ціль, ₴
        <input class="fsf-i" id="fsf-goal" type="number" inputmode="numeric" min="1" placeholder="Не обовʼязково">
      </label>
      <label class="fsf-l">Категорія
        <select class="fsf-i" id="fsf-kind">
          <option value="community">Для громади</option>
          <option value="military">Для захисників</option>
          <option value="humanitarian">Гуманітарний</option>
        </select>
      </label>
    </div>
    <div class="fsf-row">
      <label class="fsf-l">Ваше імʼя<span class="fsf-req">*</span>
        <input class="fsf-i" id="fsf-name" maxlength="80" placeholder="Як до вас звертатись">
      </label>
      <label class="fsf-l">Телефон<span class="fsf-req">*</span>
        <input class="fsf-i" id="fsf-phone" type="tel" inputmode="tel" maxlength="30" placeholder="+380…">
      </label>
    </div>
    <!-- 🔴 МЕЖА ВІДПОВІДАЛЬНОСТІ, названа прямо. Та сама мова, що в блоці
         безпеки Дошки: платформа не є стороною збору. Це не юридична формальність
         — людина, яка подає збір, мусить розуміти, що відповідає за нього вона. -->
    <label class="fsf-agree">
      <input type="checkbox" id="fsf-ok">
      <span>Підтверджую, що дані правдиві, і що за збір відповідаю я.
      CSTL LIFE не збирає й не зберігає кошти.</span>
    </label>
    <button class="fsf-send" id="fsf-send">Надіслати заявку</button>`;
}

function openProposeSheet() {
  openModal({
    title: 'Запропонувати збір',
    className: 'app-modal--fundreq',
    bodyHtml: proposeFormHtml(),
    onMount(root) {
      const btn = root.querySelector('#fsf-send');
      const v = id => (root.querySelector('#' + id)?.value || '').trim();

      btn.addEventListener('click', async () => {
        const дані = {
          title: v('fsf-title'), org: v('fsf-org'), url: v('fsf-url'),
          note: v('fsf-note') || null,
          goal: v('fsf-goal') ? Number(v('fsf-goal')) : null,
          kind: v('fsf-kind') || 'community',
          contact_name: v('fsf-name'), contact_phone: v('fsf-phone'),
        };
        // ⚠️ Перевіряємо ПО ОДНІЙ і кажемо, чого саме бракує. «Заповніть усі
        // поля» змушує людину шукати самій — а тут вона й так робить послугу.
        if (!дані.title) return showToast('Вкажіть назву збору');
        if (!дані.org)   return showToast('Вкажіть, хто збирає');
        if (!/^https:\/\//i.test(дані.url)) return showToast('Посилання має починатися з https://');
        if (!дані.contact_name)  return showToast('Вкажіть, як до вас звертатись');
        if (дані.contact_phone.length < 5) return showToast('Вкажіть телефон для звʼязку');
        if (!root.querySelector('#fsf-ok')?.checked) return showToast('Підтвердьте відповідальність за збір');

        btn.disabled = true;
        btn.textContent = 'Надсилаємо…';
        const r = await submitFundraiserRequest(дані);
        if (!r.ok) {
          btn.disabled = false; btn.textContent = 'Надіслати заявку';
          return showToast(r.error || 'Не вдалося надіслати', 4000);
        }
        closeModal();
        showToast('Заявку надіслано. Ми звʼяжемось із вами найближчим часом.', 5000);
        if (_screen) await paintMine(_screen.screen);
      });
    },
  });
}
