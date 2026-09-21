// Стенд: СХВАЛЕНА ЗАЯВКА, ЗА ЯКОЮ ЗБОРУ ВЖЕ НЕМАЄ.
//
// 🔴 ЗАРАДИ ЧОГО (скарга Вови 21.09). «В мене є тестовий збір, він пише що
// схвалений, але я його не бачу, але він в адмінці схвалений і видалити я його
// не можу.»
//
// 📐 ЗАМІРЯНО В ЖИВІЙ БАЗІ ТОГО Ж ДНЯ, і виявилось, що заявка не зламана:
//   • `fundraiser_requests` — 1 рядок: `status='approved'`, `fundraiser_id=NULL`;
//   • `fundraisers` — 0 рядків, але лічильник таблиці вже видав 5 номерів,
//     тобто збори СТВОРЮВАЛИСЬ і були видалені кнопкою «🗑 Видалити»;
//   • звʼязок описано як `on delete set null` — база чесно обнулила посилання.
// Збрехала адмінка: вона читала лише `status` і малювала «✓ Схвалено — збір #—»,
// де прочерк і був тим самим NULL. Кнопок на такій картці не лишалось ЖОДНОЇ —
// ні видалити, ні опублікувати знову. Заявка ставала вічною.
//
// 🔑 ЩО МІРЯЄМО. Не наявність рядків у файлі, а ЩО МАЛЮЄ `renderFundraisers`
// на трьох різних заявках і ПРО ЩО ПИТАЄ перед видаленням. Дані підставляємо
// самі, мережі стенд не чіпає.
//
// 🛑 Розділ живе всередині `<script>` в `admin.html` (адмінка навмисно одним
// файлом, без збірки), тому беремо його в справжньому браузері з живої
// сторінки, а не копіюємо розмітку в стенд.
import { chromium } from '@playwright/test';
import { launch, reporter, serve } from './_lib.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const b = await launch(chromium);
const p = await b.newPage();
const помилки = [];
p.on('pageerror', e => помилки.push(e.message));
await p.goto(url + '/admin.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(400);

// Три заявки — рівно три стани, які розрізняє картка.
const ЗАЯВКИ = [
  { id: 8, title: 'Дрони для 14Об', org: 'Світлана Хамейко', url: 'https://send.monobank.ua/jar/x',
    goal: 50000, kind: 'military', note: null, place: null, until: null,
    contact_name: 'Світлана', contact_phone: '0507580955', author_name: 'Володимир',
    status: 'approved', fundraiser_id: null, admin_note: null, created_at: '2026-08-17T08:27:39Z' },
  { id: 9, title: 'Живий збір', org: 'Громада', url: 'https://send.monobank.ua/jar/y',
    goal: 1000, kind: 'community', note: null, place: null, until: null,
    contact_name: 'Оксана', contact_phone: '0501112233', author_name: 'Оксана',
    status: 'approved', fundraiser_id: 7, admin_note: null, created_at: '2026-08-18T08:00:00Z' },
  { id: 10, title: 'Нова заявка', org: 'Микола', url: 'https://send.monobank.ua/jar/z',
    goal: null, kind: 'community', note: null, place: null, until: null,
    contact_name: 'Микола', contact_phone: '0503334455', author_name: 'Микола',
    status: 'new', fundraiser_id: null, admin_note: null, created_at: '2026-09-20T08:00:00Z' }
];

const намалювати = (фільтр) => p.evaluate(({ дані, фільтр }) => {
  fundRequests = дані.map(x => ({ ...x }));
  fundraisers  = [{ id: 7, title: 'Живий збір', org: 'Громада', url: 'https://send.monobank.ua/jar/y',
                    goal: 1000, kind: 'community', active: true, verified: false,
                    photo: null, until: null, sort_order: 0, created_at: '2026-08-18T08:00:00Z' }];
  fundReqFilter = фільтр;
  const майданчик = document.createElement('div');
  майданчик.style.width = '390px';
  document.body.appendChild(майданчик);
  майданчик.id = 'стенд-збори';
  renderFundraisers(майданчик);
  const карток = [...майданчик.querySelectorAll('article.card')];
  const заявка = карток[0];
  return {
    html: заявка ? заявка.innerHTML : '',
    текст: заявка ? заявка.innerText : '',
    схвалити: !!заявка?.querySelector('[data-freq-approve]'),
    видалити: !!заявка?.querySelector('[data-freq-delete]'),
    звʼязались: !!заявка?.querySelector('[data-freq-contacted]'),
    відхилити: !!заявка?.querySelector('[data-freq-reject]'),
    підписСхвалити: заявка?.querySelector('[data-freq-approve]')?.textContent.trim() || '',
  };
}, { дані: ЗАЯВКИ, фільтр });

// ── 1. СИРОТА: КАРТКА КАЖЕ ПРАВДУ І МАЄ ЩО НАТИСНУТИ ───────────────────────
const сирота = await намалювати('approved');

ok('🔴 картка прямо каже, що збору немає, а не просто «Схвалено»',
   /збору немає/i.test(сирота.текст), сирота.текст.split('\n')[0] || '—');
ok('🛑 старої брехні «збір #—» на екрані більше немає',
   !/збір #—/.test(сирота.html) && !/#\s*—/.test(сирота.текст));
ok('🔴 зʼявилась дія: опублікувати збір знову',
   сирота.схвалити && /знову/i.test(сирота.підписСхвалити), сирота.підписСхвалити || '—');
ok('🔴 і заявку нарешті можна видалити', сирота.видалити);
ok('людина бачить, що дані й контакт заявника не пропали',
   /0507580955/.test(сирота.текст) && /Світлана/.test(сирота.текст));

// ── 2. ЖИВИЙ ЗБІР: НОМЕР НА МІСЦІ, ПОВТОРНО НЕ ПУБЛІКУЄМО ──────────────────
const живий = await p.evaluate(() => {
  const майданчики = [...document.querySelectorAll('#стенд-збори')];
  const el = майданчики[майданчики.length - 1];
  const заявка = [...el.querySelectorAll('article.card')][1];
  return { текст: заявка.innerText,
           схвалити: !!заявка.querySelector('[data-freq-approve]'),
           видалити: !!заявка.querySelector('[data-freq-delete]') };
});
ok('у схваленої заявки з живим збором видно НОМЕР збору',
   /збір #7/.test(живий.текст), живий.текст.split('\n').pop());
// 🛑 І НЕ навпаки: попередження про видалений збір на живій заявці було б такою
//    самою брехнею, лише в інший бік. Саме тут ловиться спроба розрізняти стани
//    за одним `status` — тоді ця перевірка червоніє.
ok('🛑 і жодного слова про «збору немає» там, де збір є',
   !/збору немає/i.test(живий.текст), живий.текст.split('\n')[0]);
ok('🔑 кнопки «схвалити» в неї немає — другий такий самий збір на головній не потрібен',
   !живий.схвалити);
ok('але видалити її теж можна', живий.видалити);

// ── 3. НОВА ЗАЯВКА: СТАРИЙ НАБІР ДІЙ ЦІЛИЙ ─────────────────────────────────
const нова = await намалювати('new');
ok('нова заявка зберегла всі попередні дії (схвалити · звʼязались · відхилити)',
   нова.схвалити && нова.звʼязались && нова.відхилити);
ok('і додатково — видалення', нова.видалити);

// ── 4. ПРО ЩО ПИТАЮТЬ ПЕРЕД ДІЄЮ ───────────────────────────────────────────
// ⚠️ Разом із заявкою зникає ЄДИНИЙ запис контакту людини. Питання мусить
//    називати наслідок, а не «ви впевнені?».
const питання = await p.evaluate(({ дані }) => {
  fundRequests = дані.map(x => ({ ...x }));
  const зібрані = [];
  const справжній = window.confirm;
  window.confirm = m => { зібрані.push(m); return false; };   // false — дію не виконуємо
  const el = document.createElement('div'); document.body.appendChild(el);
  fundReqFilter = 'approved';
  renderFundraisers(el);
  const картки = [...el.querySelectorAll('article.card')];
  картки[0].querySelector('[data-freq-delete]').click();      // сирота
  const видаленняСироти = зібрані.pop() || '';
  картки[0].querySelector('[data-freq-approve]').click();     // повторна публікація
  const повторна = зібрані.pop() || '';
  картки[1].querySelector('[data-freq-delete]').click();      // заявка з живим збором
  const видаленняЖивої = зібрані.pop() || '';
  el.querySelector('[data-fund-delete]').click();             // видалення самого збору
  const видаленняЗбору = зібрані.pop() || '';
  el.remove(); window.confirm = справжній;
  return { видаленняСироти, повторна, видаленняЖивої, видаленняЗбору };
}, { дані: ЗАЯВКИ });

ok('🔴 перед видаленням заявки названо наслідок — зникне контакт заявника',
   /контакт/i.test(питання.видаленняСироти) && /0507580955/.test(питання.видаленняСироти),
   питання.видаленняСироти.slice(0, 70));
ok('якщо за заявкою стоїть живий збір — сказано, що він ЗАЛИШИТЬСЯ',
   /ЗАЛИШИТЬСЯ/.test(питання.видаленняЖивої) && /#7/.test(питання.видаленняЖивої),
   питання.видаленняЖивої.split('\n').pop().slice(0, 70));
ok('повторна публікація питає інакше, ніж перше схвалення',
   /знову/i.test(питання.повторна) && !/перевірено/.test(питання.повторна),
   питання.повторна.split('\n')[0]);
ok('🔴 видаляючи ЗБІР, адмін попереджений, що заявка лишиться без нього',
   /заявк/i.test(питання.видаленняЗбору) && /Живий збір/.test(питання.видаленняЗбору),
   питання.видаленняЗбору.split('\n').pop().slice(0, 80));

// ── 5. ВИДАЛЕННЯ СПРАВДІ ЙДЕ В БАЗУ, І САМЕ ЗА ТИМ НОМЕРОМ ─────────────────
const запит = await p.evaluate(({ дані }) => {
  fundRequests = дані.map(x => ({ ...x }));
  const слід = {};
  const справжняFrom = supa.from, справжнійConfirm = window.confirm;
  const справжнійLoad = window.loadAll, справжнійRender = window.renderApp;
  window.confirm = () => true;
  window.loadAll = async () => {}; window.renderApp = () => {};
  supa.from = (таблиця) => ({ delete: () => ({ eq: async (кол, знач) => {
    Object.assign(слід, { таблиця, кол, знач }); return { error: null };
  } }) });
  const el = document.createElement('div'); document.body.appendChild(el);
  fundReqFilter = 'approved';
  renderFundraisers(el);
  el.querySelector('[data-freq-delete]').click();
  return new Promise(r => setTimeout(() => {
    el.remove(); supa.from = справжняFrom; window.confirm = справжнійConfirm;
    window.loadAll = справжнійLoad; window.renderApp = справжнійRender;
    r(слід);
  }, 120));
}, { дані: ЗАЯВКИ });

ok('🔑 видалення йде в `fundraiser_requests` за `id` саме цієї заявки',
   запит.таблиця === 'fundraiser_requests' && запит.кол === 'id' && запит.знач === 8,
   `${запит.таблиця}.${запит.кол}=${запит.знач}`);

// ── 6. КОНТРОЛЬ: СТЕНД МУСИТЬ УМІТИ ВПАСТИ ─────────────────────────────────
// Якби картка лишилась старою, перші чотири перевірки почервоніли б: у тій
// розмітці немає ні слів про видалений збір, ні кнопки видалення заявки.
const стара = '<div class="card-actions"><span style="font-size:13px;color:#2a7">✓ Схвалено — збір #—</span></div>';
ok('КОНТРОЛЬ: стара розмітка справді не пройшла б перевірок вище',
   /збір #—/.test(стара) && !/збору немає/.test(стара) && !/data-freq-delete/.test(стара));
// 🛑 Другий контроль — на СВІЙ ЖЕ спосіб міряти: ознака сироти це ПАРА полів.
// Якби я розрізняв стани лише за `status`, живий збір і сирота були б однакові.
const заОднимСтатусом = await p.evaluate(() =>
  осиротіла({ status: 'approved', fundraiser_id: null }) === true &&
  осиротіла({ status: 'approved', fundraiser_id: 7 })    === false &&
  осиротіла({ status: 'new',      fundraiser_id: null }) === false);
ok('КОНТРОЛЬ: сироту впізнають ДВА поля разом, а не сам статус', заОднимСтатусом);

ok('жодної помилки в консолі адмінки', помилки.length === 0, помилки.join(' · ').slice(0, 120) || '—');

await b.close(); await stop();
done();
