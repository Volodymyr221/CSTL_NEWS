// Стенд: ВІДЖЕТ ОГОЛОШЕНЬ НА ГРОМАДІ (секція `#hm-board`).
//
// 🔴 НАВІЩО ЗАВЕДЕНИЙ (31.08.2026). Замовлення Вови: «самі карточки зробити
// такими, як в вкладці Дошка, типу з описом, з датою, без збереження, але з
// локацією, датою, фото». До цього дня віджет мав ВЛАСНУ вузьку розмітку
// (`bwRowHtml`) без опису, і стерегти її не було чим — `grep hm-ad-` по tests/
// давав нуль.
//
// 🔑 ГОЛОВНЕ, ЩО ВІН СТЕРЕЖЕ, — ЩО КАРТКА ЛИШАЄТЬСЯ СПІЛЬНОЮ З ДОШКОЮ.
// Тепер обидві поверхні малює `renderBoardCard()` з `board.js`. Якщо хтось
// колись знову заведе тут «свою маленьку картку», перевірки нижче почервоніють:
// вони питають саме класи Дошки (`.bd-ad`, `.bd-ad-desc`, `.bd-ad-loc`).
//
// ⚠️ СЦЕНА НАВМИСНО РІЗНОРІДНА: одне оголошення без фото (щоб перевірити
// плейсхолдер-іконку), одне без опису, одне без ціни. Рівна сцена з трьох
// однакових карток зеленіла б і на коді, який мовчки губить порожні поля.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const дні = n => new Date(Date.now() - n * 864e5).toISOString();

// 🔑 П'ять оголошень із РІЗНИМИ датами — це і є перевірка «хаотичного порядку»
// (слова Вови: «десь там 3 серпня, десь 9, десь 12»). Віджет бере три з п'яти
// випадково, тож і набір, і порядок від прогону до прогону різні.
const POSTS = [
  { id: 101, type: 'board', status: 'published', category: 'продам', owner_uid: 'u1',
    title: 'Продам велосипед', text: 'Гірський, стан хороший, майже не їздив. Торг доречний.',
    location: 'Олика', price: 4500, photos: ['./logo.png'], created_at: дні(1), published_at: дні(1) },
  { id: 102, type: 'board', status: 'published', category: 'куплю', owner_uid: 'u1',
    title: 'Куплю дрова', text: 'Дуб або граб, самовивіз.',
    location: 'Метельне', photos: [], created_at: дні(9), published_at: дні(9) },
  { id: 103, type: 'board', status: 'published', category: 'послуга', owner_uid: 'u2',
    title: 'Ремонт пральних машин', text: '', // без опису — навмисно
    location: 'Олика', photos: ['./logo.png'], created_at: дні(12), published_at: дні(12) },
  { id: 104, type: 'board', status: 'published', category: 'віддам', owner_uid: 'u2',
    title: 'Віддам кошенят', text: 'Двоє, до добрих рук.',
    location: 'Ставок', photos: [], created_at: дні(20), published_at: дні(20) },
  { id: 105, type: 'board', status: 'published', category: 'шукаю', owner_uid: 'u3',
    title: 'Шукаю роботу', text: 'Будівельні роботи, досвід 10 років.',
    location: 'Олика', photos: [], created_at: дні(28), published_at: дні(28) },
];

const { ok, done } = reporter();
const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));

await mockSupabase(p, { posts: POSTS, announcements: [] });
await p.route('**://api.open-meteo.com/**', r => r.abort());

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForSelector('#cm-board-content .bd-ad', { timeout: 15000 });
await p.waitForTimeout(400);

const зріз = await p.evaluate(() => {
  const c = document.getElementById('cm-board-content');
  const cards = [...c.querySelectorAll('.bd-ad')];
  const заголовок = document.querySelector('#hm-board .hm-kicker');
  return {
    карток: cards.length,
    заголовок: (заголовок?.textContent || '').trim(),
    // Картка Дошки, а не власна: питаємо саме класи Дошки.
    класДошки: cards.every(x => x.classList.contains('bd-card')),
    зОписом:   cards.filter(x => x.querySelector('.bd-ad-desc')).length,
    зЛокацією: cards.filter(x => x.querySelector('.bd-ad-loc')).length,
    зЧасом:    cards.filter(x => x.querySelector('.bd-ad-time')).length,
    зКартинкою: cards.filter(x => x.querySelector('.bd-ad-img')).length,
    // 🔴 Замовлення «без збереження»: жодної кнопки дій на Громаді.
    зДіями: cards.filter(x => x.querySelector('.bd-actions')).length,
    закладок: c.querySelectorAll('[data-save], .bd-save').length,
    // Тап мусить знаходити оголошення за тим самим атрибутом, що на Дошці.
    зId: cards.filter(x => x.dataset.postId).length,
    влазить: cards.every(x => x.getBoundingClientRect().right <= window.innerWidth + 1),
  };
});

ok('віджет показує три оголошення', зріз.карток === 3, `${зріз.карток}`);
ok('🔴 заголовок секції — «Оголошення громади»', зріз.заголовок === 'Оголошення громади', зріз.заголовок);
ok('🔴 картка СПІЛЬНА з Дошкою (клас bd-card)', зріз.класДошки);
ok('🔴 опис показується', зріз.зОписом >= 1, `${зріз.зОписом}/${зріз.карток}`);
ok('локація показується', зріз.зЛокацією === зріз.карток, `${зріз.зЛокацією}/${зріз.карток}`);
ok('дата показується', зріз.зЧасом === зріз.карток, `${зріз.зЧасом}/${зріз.карток}`);
ok('фото або іконка категорії є завжди', зріз.зКартинкою === зріз.карток, `${зріз.зКартинкою}/${зріз.карток}`);
ok('🔴 «без збереження» — кнопок дій немає', зріз.зДіями === 0 && зріз.закладок === 0,
   `дій ${зріз.зДіями}, закладок ${зріз.закладок}`);
ok('картка підписана data-post-id (тап знайде оголошення)', зріз.зId === зріз.карток);
ok('картки не вилазять за екран', зріз.влазить);
ok('помилок у консолі нема', errs.length === 0, errs.slice(0, 2).join(' | '));

await b.close();
await stop();
done();
