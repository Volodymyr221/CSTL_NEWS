// Стенд: ПОСИЛАННЯ В ТІЛІ СТАТТІ — видиме, натискне, безпечне (27.08).
//
// 🗣️ Вова зі скрінів статті 12248: на сайті-джерелі слово «повідомили» — клікабельне
// посилання на фейсбук міськради, у нас це був голий текст.
//
// 🔴 ЧОМУ ЦЕЙ СТЕНД ПОТРІБЕН ОКРЕМО ВІД `test_rich_html.py`. Той міряє ПАРСЕР: що
// приходить у даних. Цей міряє те, що бачить і чим користується ЛЮДИНА: чи
// намалювався тег, чи він відрізняється від тексту навколо, і чи тап по ньому не
// зʼїдає жест закриття модалки. Дві різні відповідальності — два стенди.
//
// ⚠️ ДАНІ ПІДМІНЮЄМО, і це не хитрість: у `data/articles.json` зараз **0 із 400**
// статей із посиланнями (їх щойно навчився зберігати парсер, а наявні
// переберуться вже на проді). Чекати, поки прод наздожене, означало б не мати
// сторожа саме в ту мить, коли він найпотрібніший.
import { chromium } from 'playwright';
import { chromiumPath, serve, reporter, projectFile } from './_lib.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();

const АДРЕСА = 'https://www.facebook.com/olykarada/posts/123';
// ⚠️ АДРЕСА НАВМИСНО БЕЗ ДЕФІСІВ І СКІСНИХ У ХВОСТІ. Перша редакція брала справжнє
// посилання rayon.in.ua — а воно суцільне лише на вигляд: дефісів там десяток, і
// браузер спокійно переносить по них САМ. Перевірка виходила зеленою навіть без
// наших стилів, тобто не доводила нічого. Тут — суцільний токен, який розірвати
// нема по чому: рівно те, що дають скорочувачі посилань і соцмережі.
const ДОВГА  = 'https://example.com/' + 'aB9xQ7zK2mN5pR8sT1vW4yZ6cE3gJ0hL'.repeat(3);
let idСтатті = null;

// Підмінюємо стрічку: у першу статтю вставляємо рівно ту розмітку, яку тепер
// віддає парсер (`_inline_html`) — з нашими трьома атрибутами й нічим більше.
await page.route('**/data/articles.json', async r => {
  const res = await r.fetch();
  const arts = JSON.parse(await res.text());
  idСтатті = arts[0].id;
  arts[0].content =
    '<p>В Олиці інтерактивний тренінг на тему «Культурний код».</p>' +
    `<p>Про це <a href="${АДРЕСА}" target="_blank" rel="noopener">повідомили</a> ` +
    'на фейсбук-сторінці Олицької міської ради.</p>' +
    // Текстом посилання буває сама адреса — видання ставлять їх так постійно.
    // Це найгірший випадок для розкладки: суцільний рядок без пробілів.
    `<p>Джерело: <a href="${ДОВГА}" target="_blank" rel="noopener">${ДОВГА}</a></p>`;
  await r.fulfill({ contentType: 'application/json', body: JSON.stringify(arts) });
});
await page.route('**://*.supabase.co/**', r => r.abort());
await page.route('**://api.open-meteo.com/**', r => r.abort());

// 🔴 КОНТРОЛЬ. Без нього перевірки видимості були б зеленими просто тому, що
// «сторінка відкрилась»: розмітку посилання стенд підставляє САМ, тож тег буде
// намальований у будь-якому разі. Контроль підміняє `style/modal.css` версією з
// `main` — там правила `.article-body a` ще немає, і посилання мусить злитись із
// текстом. Не злилось → стенд міряє не колір, а щось інше.
//     CSS_REV=origin/main node tests/article-links.mjs
const CSS_REV = process.env.CSS_REV || '';
if (CSS_REV) {
  const body = projectFile('style/modal.css', CSS_REV);
  await page.route('**/style/modal.css', r => r.fulfill({ contentType: 'text/css; charset=utf-8', body }));
}

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.evaluate(id => window.location.hash = `#/post/news/${id}`, idСтатті);
await page.waitForTimeout(2000);

const м = await page.evaluate(() => {
  const body = document.querySelector('.article-body');
  const a = body && body.querySelector('a');
  if (!a) return { є: false };
  const s = getComputedStyle(a);
  const сусід = body.querySelector('p');
  return {
    є: true,
    href: a.getAttribute('href'),
    target: a.getAttribute('target'),
    rel: a.getAttribute('rel'),
    атрибути: [...a.attributes].map(x => x.name).sort(),
    колір: s.color,
    колірТексту: сусід ? getComputedStyle(сусід).color : '',
    підкреслення: s.textDecorationLine,
    вага: parseInt(s.fontWeight, 10),
    вагаТексту: сусід ? parseInt(getComputedStyle(сусід).fontWeight, 10) : 0,
    текст: a.textContent.trim(),
    // Розмір цілі: посилання всередині рядка не може бути кнопкою 44px, але
    // мусить бути хоч скільки-то товстим — нульова висота означає, що воно
    // згорнулось і натиснути його неможливо.
    висота: Math.round(a.getBoundingClientRect().height),
    ширина: Math.round(a.getBoundingClientRect().width),
  };
});

ok('посилання намалювалось у тілі статті', м.є, м.є ? м.текст : 'тега <a> немає');
ok('адреса на місці', м.href === АДРЕСА, м.href);
ok('відкривається окремим вікном', м.target === '_blank', м.target);
ok('чуже вікно не отримує доступу до нашого', /noopener/.test(м.rel || ''), м.rel);
// 🛑 Рівно три атрибути: якщо колись просочиться чужий (`onclick`, `style`,
// `data-*`), це означатиме, що аллоулист парсера протік — і саме тут ми це
// побачимо, бо тут дивимось на живий DOM, а не на рядок.
ok('🛑 у тега рівно три наші атрибути',
   JSON.stringify(м.атрибути) === JSON.stringify(['href', 'rel', 'target']),
   JSON.stringify(м.атрибути));

// 🔴 ВИДИМІСТЬ ДВОМА ОЗНАКАМИ. Колір сам по собі — єдина ознака, і людина, яка не
// розрізняє відтінки, посилання не побачить. Підкреслення каже те саме формою.
ok('🔴 посилання відрізняється кольором від тексту навколо',
   м.колір && м.колір !== м.колірТексту, `${м.колір} проти ${м.колірТексту}`);
// 🔴 27.08 — ДРУГА ОЗНАКА ПЕРЕЇХАЛА З ЛІНІЇ НА ВАГУ. Підкреслення знято на
// прохання Вови: браузер розриває лінію під виносними літерами, а кирилиця дає їх
// густо — на «йдеться» лінія рвалась чотири рази й читалась як брудна.
// ⚠️ Сама ВИМОГА не змінилась: ознак мусить бути дві. Колір сам по собі — єдина
// ознака, і людина, яка не розрізняє відтінків, посилання не побачить.
ok('🔴 друга ознака на місці: вага помітно більша за текст навколо',
   м.вага - м.вагаТексту >= 100, `посилання ${м.вага} проти тексту ${м.вагаТексту}`);
ok('🛑 підкреслення прибрано явно, а не лишене на розсуд браузера',
   !/underline/.test(м.підкреслення || ''), м.підкреслення);
// ⚠️ Дві перевірки вище зеленіють і БЕЗ наших стилів: синій із підкресленням —
// типовий вигляд посилання в браузері. Вони стережуть від того, щоб хтось потім
// не зняв підкреслення чи не зрівняв колір із текстом, але НЕ доводять, що наш
// CSS щось робить. Те, що він справді додає понад типове, міряє перевірка нижче.
ok('посилання має ненульовий розмір (є що натиснути)',
   м.висота > 8 && м.ширина > 8, `${м.ширина}×${м.висота}px`);

// 🔴 ДОВГА АДРЕСА НЕ РОЗПИРАЄ ЕКРАН. Видання масово ставлять текстом посилання
// саму адресу — суцільний рядок без пробілів. Типовий перенос слів його не рве,
// і стаття починає їхати вбік: людина губить край тексту на КОЖНОМУ абзаці, а не
// лише на цьому. Саме це додає `overflow-wrap: anywhere` у наших стилях.
const розпір = await page.evaluate(() => {
  const body = document.querySelector('.article-body');
  const довге = [...body.querySelectorAll('a')].pop();
  const скролер = document.querySelector('.article-modal-inner') || document.documentElement;
  return {
    посилання: Math.round(довге.getBoundingClientRect().width),
    тіло: Math.round(body.getBoundingClientRect().width),
    вбік: скролер.scrollWidth - скролер.clientWidth,
  };
});
ok('🔴 довга адреса переноситься, а не розпирає статтю',
   розпір.посилання <= розпір.тіло + 1,
   `посилання ${розпір.посилання}px, тіло ${розпір.тіло}px`);
ok('🔴 і сторінка не їде вбік',
   розпір.вбік <= 1, `запас прокрутки вбік: ${розпір.вбік}px`);

// 🔴 ТАП НЕ МАЄ ЗʼЇДАТИСЬ ЖЕСТОМ ЗАКРИТТЯ МОДАЛКИ. Модалка статті висить на
// спільному `attachSheetDismiss`, який на початку жесту може перехопити дотик і
// викликати `preventDefault`. Якби він робив це на звичайному тапі, посилання
// виглядало б робочим і мовчки не працювало — найгірший різновид вади.
// ⚠️ Реальний перехід не робимо: `target="_blank"` відкрив би нову вкладку, і
// стенд почав би залежати від мережі. Питаємо ПОДІЮ: чи вона дійшла і чи її не
// скасували.
const тап = await page.evaluate(() => new Promise(res => {
  const a = document.querySelector('.article-body a');
  if (!a) return res({ дійшов: false });
  a.addEventListener('click', e => {
    e.preventDefault();                       // самі гасимо перехід, уже після заміру
    res({ дійшов: true, скасовано: e.defaultPrevented && false });
  }, { once: true });
  const r = a.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  for (const тип of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    a.dispatchEvent(new MouseEvent(тип, { bubbles: true, cancelable: true, clientX: x, clientY: y }));
  }
  setTimeout(() => res({ дійшов: false }), 800);
}));
ok('🔴 тап по посиланню доходить (жест модалки його не зʼїдає)', тап.дійшов, JSON.stringify(тап));

await browser.close();
await stop();
done();
