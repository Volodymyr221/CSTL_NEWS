// tests/board-card-row.mjs — КАРТКА ДОШКИ: локація напроти краю фото + опис.
//
// НАВІЩО (замовлення Вови 03.08, скрін IMG_3822): «карточки можна зробити більшими,
// населений пункт розташувати знизу, напроти нижнього краю фотографії… і добавити
// рядок чи два опису, щоб зразу було ясно».
//
// КОРІНЬ, заміряний ПЕРЕД правкою (390×844, `tests/tools/board-card-measure.mjs`):
//   висота картки                96px, усі однакові
//   фото                         76px, `align-self: flex-start` — приліплене до ВЕРХУ
//   низ фото проти низу локації  на **21-26px нижче**
//   опис на картці               немає
// Фото мало фіксовану висоту, а права колонка просто сипала текст згори вниз — їх не
// звʼязувало ніщо. Тому праворуч від низу фото лишалась мертва смуга.
//
// 🔑 ЩО МІРЯЄМО І ЧОМУ САМЕ ТАК.
// Не `align-self` і не наявність класу, а РІЗНИЦЮ КООРДИНАТ: низ фото мінус низ рядка
// локації. «Напроти краю» перекладається в число однозначно — 0. І перевіряємо це на
// картках РІЗНОЇ природи (з фото і без, з описом і без, з ціною і без): вирівнювання
// мусить триматись структурою, а не збігом довжин тексту. Саме тому старе рішення й
// ламалось — воно трималось на тому, що текст «десь так» дорівнював висоті фото.
//
// ⚠️ ПРАВИЛО ПРО ВИСОТУ ПЕРЕВЕРНУТО 03.08 — і це варто памʼятати, бо помилка була моя.
// Спершу я поставив усім карткам ОДНАКОВУ висоту (137px), вирівнявши по найвищій. Вова
// показав наслідок на живому екрані, обвівши порожнечу: заміряно **24-63px** мертвого
// місця між описом і рядком локації, а в картці без опису — 63px чистого нічого.
// Тобто я заплатив діркою в кожній короткій картці за акуратність у довгій.
// Тепер висота йде за вмістом, а сторож стежить за ПРОТИЛЕЖНИМ: щоб слаку не було.
// Розкид обмежений тим, що і назва, і опис обрізані двома рядками.

import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';

const { ok, done } = reporter();

const PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1600"><rect width="1200" height="1600" fill="#8a6"/></svg>');
const ts = Date.now() - 3 * 864e5;
const mk = (id, extra) => ({
  id, type: 'board', category: 'продам', title: 'Продаю машину',
  text: 'Терміново продам автомобіль у гарному стані, один власник, торг можливий при огляді.',
  photos: [], price: null, currency: 'UAH', location: 'Вся Олицька громада',
  author: 'Тест', owner_uid: 'u1', status: 'published', ts,
  created_at: new Date(ts).toISOString(), bumped_at: new Date(ts).toISOString(), ...extra,
});
// Чотири різні природи картки — саме на їхній різниці й вилазив розрив.
const POSTS = [
  mk(901, { title: 'Віддам собаку', category: 'віддам', text: 'Добрий спокійний пес шукає дім.' }),
  // Текст СЛОВО В СЛОВО дублює назву — опису бути не повинно (єдиний такий випадок
  // у живих даних: 1 із 18). Заразом це найкоротша можлива картка — перевірка підлоги.
  mk(902, { title: 'Куплю мотоцикл', category: 'куплю', text: 'Куплю мотоцикл', price_negotiable: true }),
  mk(903, { photos: [PHOTO], photo: PHOTO, price: 1500 }),
  mk(904, { title: 'ПРОДАМ БУДИНОК В ЖОРНИЩЕ ЗА ВИГІДНОЮ ЦІНОЮ ТЕРМІНОВО', photos: [PHOTO], photo: PHOTO,
            location: 'Жорнище', text: 'Шукаю будинок для купівлі. Розгляну пропозиції в місті або селі.' }),
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
await p.route('**://*.supabase.co/**', r => json(r, []));
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.route('**/data/community-board.json*', r => json(r, { posts: POSTS }));
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(300);

const cards = await p.evaluate(() => {
  const rc = e => e.getBoundingClientRect();
  return [...document.querySelectorAll('#board-content .bd-ad')].map(c => {
    const img = c.querySelector('.bd-ad-img'), foot = c.querySelector('.bd-ad-foot');
    const desc = c.querySelector('.bd-ad-desc');
    return {
      id: c.dataset.postId,
      висота: Math.round(rc(c).height),
      фото_висота: img ? Math.round(rc(img).height) : null,
      розрив: (img && foot) ? Math.round(rc(img).bottom - rc(foot).bottom) : null,
      опис: desc ? desc.textContent.trim() : null,
      рядків_опису: desc ? +getComputedStyle(desc).webkitLineClamp || 0 : 0,
      слак: (() => {
        const last = desc || c.querySelector('.bd-ad-title');
        return (last && foot) ? Math.round(rc(foot).top - rc(last).bottom) : null;
      })(),
      закладка: !!c.querySelector('.bd-bookmark'),
      накриває: (() => {
        const bm = c.querySelector('.bd-bookmark'), t = c.querySelector('.bd-ad-title');
        if (!bm || !t) return null;
        const a = rc(bm), b2 = rc(t);
        return !(a.bottom <= b2.top || a.top >= b2.bottom || a.right <= b2.left || a.left >= b2.right);
      })(),
    };
  });
});

ok('картки Дошки намалювались', cards.length === 4, `${cards.length}`);

// ── 1. ГОЛОВНЕ: низ фото = низ рядка локації, на КОЖНІЙ картці ───────────────
const worst = Math.max(...cards.map(c => Math.abs(c.розрив ?? 999)));
ok('локація стоїть напроти нижнього краю фото на ВСІХ картках', worst <= 1,
   `найбільший розрив ${worst}px · було 21-26px`);

// ── 2. НУЛЬ МЕРТВОГО МІСЦЯ — головна скарга Вови ────────────────────────────
const hs = cards.map(c => c.висота);
const slack = Math.max(...cards.map(c => c.слак ?? 0));
// Поріг 15px — не «щоб пройшло», а межа, за якою просвіт перестає читатись як відступ
// і починає читатись як діра. Було 24-63px, і саме це Вова обвів на скріні.
ok('між текстом і рядком локації немає порожнечі', slack <= 15,
   `найбільший слак ${slack}px · було 24-63px`);
// Розкид висот обмежений: і назва, і опис обрізані двома рядками, тож картка буває
// лише кількох висот — це не та «рвань», де висота стрибала від наявності фото.
// Розкид не довільний: обидва тексти обрізані двома рядками, тож стеля розкиду —
// це один рядок назви плюс один рядок опису ≈ 40px.
ok('розкид висот обмежений', Math.max(...hs) - Math.min(...hs) <= 45, hs.join(' / '));
// Нижня межа 96 — це висота, яку картка мала ДО перебудови: нова не має права стати
// тіснішою за стару, інакше «зробити картки більшими» не виконано.
ok('картка не менша за стару і не роздулась',
   Math.min(...hs) >= 96 && Math.max(...hs) <= 150, `${hs.join(' / ')} (було 96)`);

// ── 3. Опис є там, де він щось додає — і немає там, де дублює назву ─────────
const dog  = cards.find(c => c.id === '901');
const moto = cards.find(c => c.id === '902');
ok('опис показано, коли він додає зміст', !!dog.опис && /пес/.test(dog.опис), dog.опис || 'опису немає');
// Заміряно на живих даних: точний дубль — 1 оголошення з 18. Поріг «заголовок + менше
// 20 символів» пробували і ВІДКОТИЛИ: він прибирав опис у 7 із 18, а саме ці 20
// символів («у робочому стані») часто і є вся конкретика.
ok('опис НЕ показано, коли він дублює назву', moto.опис === null, moto.опис || '(немає — правильно)');
ok('опис обмежений двома рядками', dog.рядків_опису === 2, `${dog.рядків_опису}`);

// ── 4. Фото тягнеться рівно на висоту картки — не менше і НЕ БІЛЬШЕ ─────────
// ⚠️ Обидві межі важливі, і кожна вже ламалась:
//   • фіксована висота 76px → низ фото на 21-26px нижче за локацію;
//   • `align-self: stretch` без явної висоти → у картинки є ВЛАСНА пропорція, і кадр
//     1200×1600 при ширині 88 просив 117px у картці 113px, тобто вилазив на 24-29px.
const over = Math.max(...cards.map((c, i) => c.фото_висота - (hs[i] - 18)));
ok('фото не вилазить за межі картки', over <= 1, `перевищення ${over}px`);
// 76px — розмір, який фото мало до цієї перебудови і який Вова приймав місяцями.
// Нижче нього мініатюра перестає показувати, ЩО на кадрі.
ok('фото не схлопнулось у марку', Math.min(...cards.map(c => c.фото_висота)) >= 76,
   cards.map(c => c.фото_висота).join(' / '));

// ── 4б. Закладка є і НЕ НАКРИВАЄ заголовок ──────────────────────────────────
// Була абсолютною в кутку картки і смугою 6..46px накривала початок назви (28px).
ok('закладка є на кожній картці', cards.every(c => c.закладка), 'немає');
ok('закладка не перекриває заголовок', cards.every(c => c.накриває === false),
   cards.map(c => c.накриває).join(' / '));

// ── 5. КОНТРОЛЬ: доводимо, що вимір узагалі здатен побачити розрив ──────────
// Повертаємо старе правило (фіксована висота + приліплення до верху) і міряємо знову.
// Без цього «розрив 0» нічого не доводить: він міг би виходити сам собою.
await p.addStyleTag({ content: '#board-content .bd-ad-img { align-self: flex-start !important; height: 88px !important; min-height: 0 !important; }' });
await p.waitForTimeout(200);
const broken = await p.evaluate(() => {
  const rc = e => e.getBoundingClientRect();
  return [...document.querySelectorAll('#board-content .bd-ad')].map(c => {
    const img = c.querySelector('.bd-ad-img'), foot = c.querySelector('.bd-ad-foot');
    return (img && foot) ? Math.round(rc(img).bottom - rc(foot).bottom) : 0;
  });
});
const worstBroken = Math.max(...broken.map(Math.abs));
ok('контроль: старе правило СПРАВДІ дає розрив — отже вимір робочий',
   worstBroken >= 10, `${broken.join(' / ')}`);

await b.close();
stop();
done();
