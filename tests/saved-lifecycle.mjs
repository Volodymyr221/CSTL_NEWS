// Стенд: ЖИТТЄВИЙ ЦИКЛ ЗБЕРЕЖЕНОГО — замовлення Вови 18.09.2026.
//
// 🗣️ «якщо я чи будь-який інший користувач натисну відстежувати щось… і воно
// видалилось з додатку, то воно має пропасти із збереження, тому що його вже не
// існує. А якщо… рейс скасований, то він має бути там, але так само з позначкою
// скасований… не то, що користувач зберіг якесь питання, і воно видалилось, і
// воно досі там, і користувач його не може не відкрити, не видалити збережене,
// не скасувати збереження, нічого».
//
// 🔑 ПРАВИЛО, ЯКЕ ЦЕЙ СТЕНД СТЕРЕЖЕ (одне на всі чотири типи):
//   Збережене зникає, лише коли зник САМ ПРЕДМЕТ.
//   Живий предмет зі зміненим СТАНОМ лишається, і стан написаний на картці.
//
// 📐 ЗАМІРЯНО НА ЖИВІЙ БАЗІ ПЕРЕД РОБОТОЮ: `saved_posts` мали 5 рядків, з них 2
// мертві — обидва на `post 90` («Тест», `type=chat`, видалене 09.09), і тримали
// їх ДВА різні акаунти: адмін і звичайна людина.
// 🔴 Саме тому симптом у них був РІЗНИЙ, а вада одна: політика читання пускає
// адміна до видаленого рядка, тож він бачив мертву картку, а звичайна людина не
// бачила нічого — картка тихо зникала, рядок лишався назавжди.
//
// 🛑 МЕЖІ ЦЬОГО СТЕНДА, НАЗВАНІ ЧЕСНО.
// Він доводить КЛІЄНТСЬКУ половину. Серверна доведена окремо — транзакціями з
// відкотом на живій базі (журнал `_session-log/vova-2026-09-18b.md`): під JWT
// обох акаунтів справжня `sync_saved_posts()` віддала
// `removed:[{kind:"chat",title:"Тест"}]` і порожні `items`, а `rollback` лишив
// таблицю недоторканою (5 рядків до і після).
// ⚠️ Заглушка `sync_saved_posts` у `_board-fixture.mjs` — ДЗЕРКАЛО серверного
// правила; вона навмисно так само сувора. Заглушка, добріша за прод, у цьому
// файлі вже тричі давала зелене над зламаним кодом (.eq 07.08, .single і .in 17.08).

import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const ts = Date.now() - 3 * 864e5;
const iso = t => new Date(t).toISOString();
const дата = зсув => new Date(Date.now() + зсув * 864e5).toISOString().slice(0, 10);
const ЗАВТРА = дата(1);
const ВЧОРА = дата(-1);

// 📐 Сцена покриває ВСІ п'ять станів одразу — інакше кожен окремо зеленів би на
// сцені, де інших не існує, а нам треба, щоб вони не плутались між собою.
const POSTS = [
  // живе оголошення — контроль «нічого зайвого не прибрали»
  { id: 8001, type: 'board', title: 'Продам дрова колоті', text: '.', status: 'published',
    ts, created_at: iso(ts), owner_uid: 'u2' },
  // 🔴 ВАДА ВОВИ: видалене питання, що лишалось у збережених назавжди
  { id: 8002, type: 'chat', title: '', text: 'Тест', status: 'published',
    ts, created_at: iso(ts), owner_uid: 'uid-a', deleted_at: iso(Date.now() - 864e5) },
  // автор ЗАВЕРШИВ оголошення → лишається з позначкою (рішення Вови: «Знято»)
  { id: 8003, type: 'board', title: 'Куплю велосипед дорослий', text: '.', status: 'closed',
    ts, created_at: iso(ts), owner_uid: 'u3' },
  // живе питання — на ньому перевіряємо, що тап веде в ПИТАННЯ, а не на Дошку
  { id: 8004, type: 'chat', title: '', text: 'Коли вивозять сміття з Жорнища?',
    status: 'published', ts, created_at: iso(ts), owner_uid: 'u4' },
];

// Стаття 9001 у файлі є; 9002 змита ротацією, але має знімок з адресою джерела;
// 9003 змита і БЕЗ адреси — вести нікуди, отже прибирається з повідомленням.
const ARTICLES = [
  { id: 9001, title: 'В Олиці відремонтували дорогу до замку', excerpt: '.', content: '.',
    geo: 'Громада', ts, sourceUrl: 'https://example.org/a9001' },
];

const SAVED_POSTS = [
  { uid: 'uid-a', post_id: 8001, snap_title: 'Продам дрова колоті', snap_kind: 'board' },
  { uid: 'uid-a', post_id: 8002, snap_title: 'Тест', snap_kind: 'chat' },
  { uid: 'uid-a', post_id: 8003, snap_title: 'Куплю велосипед дорослий', snap_kind: 'board' },
  { uid: 'uid-a', post_id: 8004, snap_title: 'Коли вивозять сміття з Жорнища?', snap_kind: 'chat' },
];
const SAVED_ARTICLES = [
  { uid: 'uid-a', article_id: 9001, created_at: iso(ts), snap_title: 'В Олиці відремонтували дорогу', snap_url: 'https://example.org/a9001' },
  { uid: 'uid-a', article_id: 9002, created_at: iso(ts), snap_title: 'Стара новина про ярмарок', snap_url: 'https://example.org/a9002' },
  { uid: 'uid-a', article_id: 9003, created_at: iso(ts), snap_title: 'Новина без джерела', snap_url: null },
];

// Розклад: два рейси на завтра (один скасований) + один учорашній, який мусить
// зникнути зі списку («Все що пройшло, прибрати» — Вова 18.09).
const SCHEDULE = {
  version: 2, source: 'stend', updatedAt: iso(Date.now()), carriers: {},
  days: {
    [ЗАВТРА]: { routes: [
      { id: 'r-alive', name: 'Олика Луцьк', carrier: 'c', bus: 'b', days: 'щодня',
        status: 'scheduled', stops: [{ name: 'Олика', km: 0 }, { name: 'Луцьк', km: 40 }],
        dep_time: '07:20', arr_time: '08:10' },
      { id: 'r-canc', name: 'Олика Ківерці', carrier: 'c', bus: 'b', days: 'щодня',
        status: 'cancelled', stops: [{ name: 'Олика', km: 0 }, { name: 'Ківерці', km: 20 }],
        dep_time: '09:00', arr_time: '09:30' },
    ] },
    [ВЧОРА]: { routes: [
      { id: 'r-past', name: 'Олика Рівне', carrier: 'c', bus: 'b', days: 'щодня',
        status: 'scheduled', stops: [{ name: 'Олика', km: 0 }, { name: 'Рівне', km: 50 }],
        dep_time: '06:00', arr_time: '07:00' },
    ] },
  },
};

const USER = { id: 'uid-a', email: 'a@example.com', user_metadata: { full_name: 'Володимир' } };

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();

// 🔴 КОНТРОЛЬ: BUNDLE_REV=origin/main node tests/saved-lifecycle.mjs
// На коді до 18.09 мусять почервоніти перевірки 2-6: там хаб брав збережене
// прямим `select … in(ids)`, тобто видалене просто не приходило (рядок лишався
// в базі назавжди), позначок стану не існувало, а тап завжди вів на Дошку.
const BUNDLE_REV = process.env.BUNDLE_REV || '';
if (BUNDLE_REV) {
  const old = projectFile('bundle.js', BUNDLE_REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
}

// 🛑 МУТАЦІЯ, а не друга ревізія: NEWS_BLIND=1 змушує `articles.json` віддати
// збій. Саме цим доводиться, що захист «не чистити за тишею» справді працює, а
// не просто написаний. Без мутації перевірка 7 зеленіла б і над кодом, який
// радісно стирає закладки при обриві мережі.
const NEWS_BLIND = process.env.NEWS_BLIND === '1';

await mockSupabase(p, {
  posts: POSTS,
  saved_posts: SAVED_POSTS,
  saved_articles: SAVED_ARTICLES,
  profiles: [],
}, { user: USER });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.route('**/data/articles.json*', r => NEWS_BLIND
  ? r.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' })
  : r.fulfill({ status: 200, contentType: 'application/json',
                headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(ARTICLES) }));
await p.route('**/data/schedule.json*', r => r.fulfill({ status: 200,
  contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify(SCHEDULE) }));

// Відстеження сіємо у сховище пристрою — це СЦЕНА, не доказ (урок 31.08 про
// посів, який «доводив» ваду, створену самим посівом).
await p.addInitScript(([з, в]) => localStorage.setItem('bus_track_v2:uid-a', JSON.stringify({
  routes: [
    { routeId: 'r-alive', trackDate: з, boardingStop: 'Олика', alightingStop: 'Луцьк',
      title: 'Олика → Луцьк', depTime: '07:20', arrTime: '08:10' },
    { routeId: 'r-canc', trackDate: з, boardingStop: 'Олика', alightingStop: 'Ківерці',
      title: 'Олика → Ківерці', depTime: '09:00', arrTime: '09:30' },
    { routeId: 'r-past', trackDate: в, boardingStop: 'Олика', alightingStop: 'Рівне',
      title: 'Олика → Рівне', depTime: '06:00', arrTime: '07:00' },
  ],
})), [ЗАВТРА, ВЧОРА]);

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(400);

const відкритиХаб = async () => {
  await p.evaluate(() => document.getElementById('saved-hub-btn')?.click());
  await p.waitForTimeout(1600);
};
const відкритиКатегорію = async (key) => {
  await p.evaluate(k => document.querySelector(`[data-shub-cat="${k}"]`)?.click(), key);
  await p.waitForTimeout(500);
};
const картки = () => p.evaluate(() => [...document.querySelectorAll('.shub-card')].map(c => ({
  text: c.querySelector('.shub-card-text')?.textContent.trim() || '',
  state: c.dataset.shubState || '',
  badge: c.querySelector('.shub-badge')?.textContent.trim() || '',
  url: c.dataset.shubUrl || '',
})));

await відкритиХаб();
ok('аркуш «Збережені» відкрився', await p.evaluate(() => !!document.querySelector('.shub-sheet')));

// ── 1. ПОВІДОМЛЕННЯ ПРО ПРИБРАНЕ НАЗИВАЄ ЗАПИС ─────────────────────────────
//
// 🗣️ Пряма вимога Вови: «не просто "запис прибрано", а щось типу "Оголошення
// «назва оголошення», яке ви зберегли, знято", чи видалено і тд».
// 🔑 Міряємо ТЕКСТ, який побачить людина, а не наявність вузла: порожній
// `.shub-notice` пройшов би перевірку «елемент є» і не сказав би нічого.
const повідомлення = await p.evaluate(() =>
  [...document.querySelectorAll('.shub-notice-list li')].map(li => li.textContent.trim()));

ok('🔴 прибране НАЗВАНЕ: «Питання «Тест», яке ви зберегли, видалено»',
   повідомлення.some(t => t.includes('Питання') && t.includes('«Тест»') && t.includes('видалено')),
   повідомлення.join(' | ') || '(повідомлення немає)');

// 🛑 Слово має бути ПРО СВІЙ ТИП. Саме цим і був баг: видалене ПИТАННЯ
// оголошувалось «оголошенням», бо тип на той момент уже втрачали.
ok('🛑 видалене питання НЕ назване «оголошенням»',
   !повідомлення.some(t => t.includes('«Тест»') && t.includes('Оголошення')),
   повідомлення.join(' | '));

// ── 2. МЕРТВОГО ЗАПИСУ В СПИСКУ НЕМАЄ ──────────────────────────────────────
await відкритиКатегорію('chats');
const питання = await картки();
ok('🔴 видалене питання зникло зі списку',
   !питання.some(c => c.text === 'Тест'), питання.map(c => c.text).join(' | '));
ok('живе питання лишилось на місці',
   питання.some(c => c.text.includes('Коли вивозять сміття')), питання.map(c => c.text).join(' | '));

// ── 3. ЖИВИЙ ПРЕДМЕТ ЗІ ЗМІНЕНИМ СТАНОМ ЛИШАЄТЬСЯ З ПОЗНАЧКОЮ ──────────────
//
// Рішення Вови на питання «оголошення, яке автор завершив — зникло чи стан?»:
// **«Знято»**, тобто лишається і підписується.
await p.evaluate(() => document.querySelector('[data-shub-back]')?.click());
await p.waitForTimeout(400);
await відкритиКатегорію('boards');
const оголошення = await картки();
const завершене = оголошення.find(c => c.text.includes('велосипед'));
ok('🔴 завершене оголошення ЛИШИЛОСЬ у збережених',
   !!завершене, оголошення.map(c => c.text).join(' | '));
ok('🔴 і має позначку «Знято»',
   завершене?.badge === 'Знято' && завершене?.state === 'closed',
   `badge=${завершене?.badge} state=${завершене?.state}`);
const живеОг = оголошення.find(c => c.text.includes('дрова'));
ok('живе оголошення позначки НЕ має (підпис нічого не додав би)',
   !!живеОг && живеОг.badge === '' && живеОг.state === 'alive', JSON.stringify(оголошення));

// ── 4. АВТОБУСИ: СКАСОВАНИЙ ЛИШАЄТЬСЯ З ПОЗНАЧКОЮ, МИНУЛИЙ ЗНИКАЄ ─────────
await p.evaluate(() => document.querySelector('[data-shub-back]')?.click());
await p.waitForTimeout(400);
await відкритиКатегорію('buses');
const рейси = await картки();
const скасований = рейси.find(c => c.text.includes('Ківерці'));
ok('🔴 скасований рейс ЛИШИВСЯ у збережених (пряме слово Вови)',
   !!скасований, рейси.map(c => c.text).join(' | '));
ok('🔴 і підписаний «Скасовано»',
   скасований?.badge === 'Скасовано' && скасований?.state === 'cancelled',
   `badge=${скасований?.badge} state=${скасований?.state}`);
ok('рейс, що вже поїхав, зі списку прибрано',
   !рейси.some(c => c.text.includes('Рівне')), рейси.map(c => c.text).join(' | '));
ok('майбутній рейс лишився без позначки',
   рейси.some(c => c.text.includes('Луцьк') && c.badge === ''), рейси.map(c => `${c.text}:${c.badge}`).join(' | '));

// ── 5. СТАТТЯ, ЗМИТА РОТАЦІЄЮ ──────────────────────────────────────────────
//
// 🔑 Рішення Вови («Окей» на пропозицію): картка зі знімком ЛИШАЄТЬСЯ і веде на
// оригінал — людина зберігала, щоб прочитати, і посилання це ще дає. Без адреси
// вести нікуди, отже предмет справді зник → прибирається і називається.
await p.evaluate(() => document.querySelector('[data-shub-back]')?.click());
await p.waitForTimeout(400);
// 🛑 Під мутацією NEWS_BLIND статей немає за визначенням — перевіряти тут
// нічого, і червоне над правильним кодом гірше за відсутність перевірки:
// наступного разу на нього просто не подивляться.
if (!NEWS_BLIND) {
  await відкритиКатегорію('articles');
  const статті = await картки();
  const змита = статті.find(c => c.text.includes('ярмарок'));
  ok('🔴 стаття, змита ротацією, ЛИШИЛАСЬ і веде на джерело',
     !!змита && змита.state === 'gone' && змита.url.startsWith('http'),
     JSON.stringify(статті));
  ok('і підписана «Немає у стрічці»', змита?.badge === 'Немає у стрічці', `badge=${змита?.badge}`);
  ok('стаття без адреси джерела прибрана і названа',
     !статті.some(c => c.text.includes('без джерела')), статті.map(c => c.text).join(' | '));

}

// ── 6. ТАП ВЕДЕ ТУДИ, ЩО ОБІЦЯЄ КАРТКА ─────────────────────────────────────
//
// 🔴 Це і є скарга Вови: «натискаю — то взагалі чомусь перекидає на дошку і пише
// що оголошення недоступне, чому на дошку якщо це питання не розумію».
//
// 🛑 ПЕРША РЕДАКЦІЯ ЦЬОГО БЛОКУ БУЛА БЕЗЗУБА, І ЦЕ ВАРТО ПРОЧИТАТИ ПЕРЕД ТИМ,
// ЯК ЙОГО ПРАВИТИ. Вона тапала по ЖИВОМУ питанню — а живий запис і старий код
// знаходив у себе в списку, сам бачив `type` і вів правильно. Тобто перевірка
// була зелена на обох ревізіях: вона стерегла те, що ніколи не ламалось.
// ➡️ Ламалась гілка «запису вже НЕМАЄ»: там тип був утрачений, і відповідь
// завжди виходила «оголошення» + Дошка. Саме її й треба міряти.
//
// 🔑 Вхід беремо deep-link зі СПОВІЩЕННЯ (`#/post/disc/<id>`) — це єдиний шлях,
// яким по мертвому запису ще можна тапнути: у хабі його вже прибрано. І це не
// штучна сцена: рівно так людина приходить із push про відповідь на питання,
// яке автор тим часом видалив.
// 🛑 Хаб спершу ЗАКРИВАЄМО. Перша редакція цього не робила, і наслідок був
// підступний: аркуш лишався відкритим на списку статей, а `openSavedHub()`
// має `if (_sheet) return` — тож наступний блок «відкривав» уже відкритий хаб,
// бачив старий екран і міряв не те, що заявляв.
await p.evaluate(() => document.querySelector('.shub-backdrop')?.click());
await p.waitForTimeout(500);
await p.evaluate(() => { location.hash = '#/post/disc/8002'; });
await p.waitForTimeout(1800);
const вкладка = await p.evaluate(() => document.querySelector('.app-main')?.dataset.tab || '');
const тост = await p.evaluate(() => document.querySelector('.toast')?.textContent.trim() || '');

ok('🔴 мертве ПИТАННЯ веде у «Питання», а не на Дошку',
   вкладка === 'discussions', `активна вкладка: ${вкладка}`);
ok('🔴 і сказано «питання», а не «оголошення»',
   /питання/i.test(тост) && !/оголошення/i.test(тост), `тост: ${тост || '(немає)'}`);

// Зустрічна межа: оголошення мусить і далі вести на Дошку. Без неї перевірка
// вище зеленіла б і над кодом, який усе підряд зве питанням.
await p.evaluate(() => { location.hash = '#/post/board/8009'; });
await p.waitForTimeout(1800);
const вкладка2 = await p.evaluate(() => document.querySelector('.app-main')?.dataset.tab || '');
const тост2 = await p.evaluate(() => document.querySelector('.toast')?.textContent.trim() || '');
ok('🛑 ЗУСТРІЧНА МЕЖА: мертве оголошення веде на Дошку і зветься оголошенням',
   вкладка2 === 'board' && /оголошення/i.test(тост2), `вкладка=${вкладка2} тост=${тост2 || '(немає)'}`);

// ── 7. 🛑 ГОЛОВНА ПЕРЕВІРКА: ТИША НЕ ДОРІВНЮЄ ВИДАЛЕННЮ ───────────────────
//
// Запускається лише в мутації `NEWS_BLIND=1`, де `articles.json` віддає 500.
// Тоді застосунок НЕ знає, чи статті ще існують, — і не сміє прибрати жодної.
// 🔴 Без цієї межі поганий інтернет стирав би людині закладки, і це було б
// гірше за початкову ваду: там запис лишався зайвим, тут зник би потрібний.
if (NEWS_BLIND) {
  const код = await p.evaluate(async () => {
    const r = await fetch('./data/articles.json').catch(() => null);
    return r ? r.status : 0;
  });
  ok('МУТАЦІЯ активна: файл новин справді не читається', код !== 200, `HTTP ${код}`);

  // 🛑 ВИПРАВЛЕННЯ ВЛАСНОЇ ПОМИЛКИ — ЧИТАЙ ПЕРЕД ТИМ, ЯК ЦЕ ПРАВИТИ.
  // Перша редакція міряла `.shub-notice-list` ОДРАЗУ після блоку 6, а там хаб
  // уже закритий (тап по картці його закриває). Вузлів немає → «жодної статті
  // не прибрано» виходило істинним ЗАВЖДИ. Доведено мутацією: зі знятим
  // захистом `newsLoadFailed()` стенд лишався 20/20, тобто стеріг порожнечу.
  // ➡️ Тому хаб відкривається ЗАНОВО і саме тут.
  await відкритиХаб();
  // 🔑 Спершу доводимо, що ПРИЛАД щось бачить. Без цього рядка «жодної статті не
  // прибрано» було б істинним і над закритим аркушем — а саме так перша редакція
  // і стерегла порожнечу (доведено мутацією: зі знятим захистом стенд лишався
  // 20/20). Порожній список повідомлень тут ЗАКОННИЙ: питання «Тест» прибрали ще
  // при першому відкритті, і вдруге про нього казати нема чого.
  const відкритий = await p.evaluate(() => !!document.querySelector('.shub-sheet'));
  ok('прилад бачить аркуш (інакше наступна перевірка міряла б порожнечу)', відкритий);

  const рядки = await p.evaluate(() =>
    [...document.querySelectorAll('.shub-notice-list li')].map(li => li.textContent.trim()));
  ok('🛑 при збої читання новин ЖОДНОЇ статті не прибрано',
     відкритий && !рядки.some(t => t.startsWith('Новина')),
     рядки.join(' | ') || '(повідомлень немає — нічого не прибрано)');
}

await stop();
await b.close();
done();
