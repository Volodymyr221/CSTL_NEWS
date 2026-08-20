// Інструмент: МІРКА ВЕРТИКАЛЬНОГО РИТМУ ГОЛОВНОЇ.
//
// 🔑 Навіщо окремий інструмент. Скарга Вови 20.08 звучить як питання смаку
// («скляні міні заблизько до шапки, зливається»), але відповідь на неї — числа:
// скільки саме пікселів між блоками ЗАРАЗ і скільки стане після правки. Без
// заміру правка робиться на око і за тиждень повертається.
//
// Запуск: `node tests/tools/home-rhythm.mjs` (додай `--empty` — сцена без капсул).
import { chromium } from 'playwright';
import { chromiumPath, serve, projectFile } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const REV = process.env.BUNDLE_REV || '';
const ПОРОЖНЯ = process.argv.includes('--empty');
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });

// ── Сцена: 17 серпня 2026, 09:00 ────────────────────────────────────────────
const БАЗА = new Date('2026-08-17T09:00:00');
const СЬОГОДНІ = '2026-08-17';
const ЗАВТРА = '2026-08-18';
// Перший ранковий рейс наступного дня: виїзд із Луцька 06:40, через Олику 07:10.
// 🔑 Через Олику він іде ПІЗНІШЕ за виїзд — саме та форма живих даних, на якій
// колись і трималась вада «капсула показує час виїзду з чужого міста».
const РЕЙС_ЗАВТРА_РАНОК = {
  id: 'r_tomorrow', name: 'Луцьк Ківерці', status: 'scheduled', carrier: 'test_carrier',
  departure_time: '06:40', arrival_time: '07:40', duration_min: 60,
  stops: [{ name: 'Луцьк', km: 0 }, { name: 'Олика', km: 60 }, { name: 'Ківерці', km: 120 }],
};
const ВІЗИТ = new Date('2026-08-17T08:00:00').getTime();   // коли востаннє був на Дошці

const UID = 'uid-vova';
const USER = { id: UID, email: 'vova@example.com' };

// 🔴 ФІКСТУРА ПЕРЕПИСАНА 17.08 (вечір) ПІД ЖИВУ ФОРМУ ДАНИХ — і це головна
// причина, чому попередня редакція стенда пропустила справжню ваду.
// Було: маршрути починались в Олиці. У живому розкладі **жоден із 25 рейсів дня
// в Олиці не починається** — 23 стартують у Луцьку, 2 в Ківерцях, а через Олику
// проходять на 50-99 хвилин пізніше за виїзд. На тій фікстурі «час до виїзду» і
// «час до посадки в Олиці» збігались, тож перевірка була зелена над зламаним
// кодом: капсула показала Вові рейс, у маршруті якого Олики немає взагалі.
// ➡️ Заглушка мусить відтворювати ФОРМУ живих даних, а не зручну форму.
// (Той самий урок, що з полем `carrier` того ж дня — див. нижче.)
//
// ⚠️ `carrier` обовʼязковий: без нього картка рейсу падає на `.split` імені
// перевізника (спіймано першим прогоном цього стенда).
const ПЕРЕВІЗНИКИ = { test_carrier: { name: 'ТЕСТ-перевізник', phone: '0332 224 500' } };

// Виїзд із Луцька 09:10, Олика на 60-му км зі 120 → +30 хв = посадка 09:40,
// тобто через 40 хв від «зараз» (09:00). Різниця «виїзд ↔ посадка» = 30 хв, і
// саме її ловить стенд: помилковий відлік дав би 10 хв, а не 40.
// 🔑 Виїжджає ПІЗНІШЕ за обидва хибні рейси НАВМИСНО: стара логіка брала
// найраніший виїзд з усього розкладу, тож на цій фікстурі вона обирає саме
// хибний — і кожен сторож нижче кусає окремо, а не «за компанію».
const РЕЙС_БЛИЗЬКО = {
  id: 'r_soon', name: 'Луцьк Рівне', status: 'scheduled', carrier: 'test_carrier',
  departure_time: '09:10', arrival_time: '10:10', duration_min: 60,
  stops: [{ name: 'Луцьк', km: 0 }, { name: 'Олика', km: 60 }, { name: 'Рівне', km: 120 }],
};
// Далекий рейс через Олику — доводить стелю «ЗАРАЗ» (виїзд 19:30, Олика 20:00).
const РЕЙС_ДАЛЕКО = {
  id: 'r_far', name: 'Луцьк Ківерці', status: 'scheduled', carrier: 'test_carrier',
  departure_time: '19:30', arrival_time: '20:30', duration_min: 60,
  stops: [{ name: 'Луцьк', km: 0 }, { name: 'Олика', km: 60 }, { name: 'Ківерці', km: 120 }],
};
// 🔴 РЕЙС, ЯКИЙ ПОКАЗАЛА ЗЛАМАНА КАПСУЛА: Олики в маршруті НЕМАЄ. Виїжджає
// найраніше з усіх, тож стара логіка («найближчий рейс з усього розкладу»)
// обрала б саме його. Це і є контрольний зразок вади зі знімка Вови.
const РЕЙС_ПОВЗ = {
  id: 'r_past', name: 'Луцьк Клевань', status: 'scheduled', carrier: 'test_carrier',
  departure_time: '09:05', arrival_time: '09:50', duration_min: 45,
  stops: [{ name: 'Луцьк', km: 0 }, { name: 'Дерно', km: 30 }, { name: 'Клевань', km: 60 }],
};
// Рейс, до якого лишились ХВИЛИНИ (виїзд 09:05, Олика на половині шляху → 09:10).
// Потрібен ранжуванню: це єдиний кандидат, який просто зникає, якщо не встиг.
const РЕЙС_ОСЬ_ОСЬ = {
  id: 'r_now', name: 'Луцьк Ківерці', status: 'scheduled', carrier: 'test_carrier',
  departure_time: '09:05', arrival_time: '09:15', duration_min: 10,
  stops: [{ name: 'Луцьк', km: 0 }, { name: 'Олика', km: 60 }, { name: 'Ківерці', km: 120 }],
};
// Рейс, що в Олиці ЗАКІНЧУЄТЬСЯ — сісти на нього тут нікуди.
const РЕЙС_ДО_ОЛИКИ = {
  id: 'r_end', name: 'Луцьк Олика', status: 'scheduled', carrier: 'test_carrier',
  departure_time: '09:02', arrival_time: '09:40', duration_min: 38,
  stops: [{ name: 'Луцьк', km: 0 }, { name: 'Струмівка', km: 10 }, { name: 'Олика', km: 60 }],
};

// Питання громади = той самий `posts`, тип 'chat' (окремої таблиці немає).
// ⚠️ Текст питання лежить у полі `text`, а НЕ `title`: форма створення має рівно
// одне поле. Перша редакція фікстури клала його в `title` — і стенд перевіряв
// поле, якого в живих питаннях немає.
const питання = (id, o = {}) => ({
  id, type: 'chat', status: 'published', owner_uid: 'uid-susid',
  title: null, text: o.text || `Питання ${id}`, author: 'Сусід',
  created_at: o.created_at || '2026-08-17T08:30:00.000Z',
  ...o,
});

// Відповідь на питання — рядок таблиці `comments` (fetchAllComments).
const відповідь = (id, postId) => ({
  id, post_id: postId, text: 'відповідь', author_uid: 'uid-hto',
  created_at: '2026-08-17T08:45:00.000Z', deleted_at: null,
});

// Розмова приватного чату (таблиця `threads`). Імена в ній ДЕНОРМАЛІЗОВАНІ —
// `profiles` приватний, і капсула бере імʼя саме звідси.
// ⚠️ Фікстуру тредів даємо вже звужену під сцену: `.or()` у заглушці свідомо не
// фільтрує (емулювати мову фільтрів PostgREST = писати другу базу).
const розмова = (id, o = {}) => ({
  id, author_uid: UID, buyer_uid: 'uid-ivan',
  // Предмет розмови. У живій схемі це `threads.post_id` з `on delete cascade` —
  // саме тому «оголошення видалили» неможливий стан: розмова зникає разом із ним.
  post_id: 70,
  author_name: 'Вова', buyer_name: 'Іван',
  last_message_text: 'Скільки за плуг?',
  last_message_at: '2026-08-17T08:40:00.000Z',   // 20 хв тому — свіже
  ...o,
});
// Непрочитане повідомлення від співрозмовника. `read_at: null` — ознака
// непрочитаного; `.is()` у заглушці не фільтрує, тож прочитаних сюди не кладемо.
const повідомлення = (id, threadId, o = {}) => ({
  id, thread_id: threadId, sender_uid: 'uid-ivan', read_at: null,
  created_at: '2026-08-17T08:40:00.000Z', ...o,
});

const оголошення = (id, o = {}) => ({
  id, type: 'board', status: 'published', owner_uid: 'uid-hto',
  title: o.title || `Оголошення ${id}`, text: 'текст',
  location: o.location || 'Олика',
  created_at: o.created_at || '2026-08-17T08:30:00.000Z',
  ...o,
});

/**
 * Підняти сцену.
 * @param routes    що віддати замість `data/schedule.json`
 * @param posts     таблиця `posts` підробленої бази
 * @param user      залогінений житель або null
 * @param profiles  таблиця `profiles` (село в анкеті)
 * @param seen      значення `cstl_board_seen_ts` (null = ключа немає взагалі)
 * @param tracked   відстежувані рейси у памʼяті пристрою
 * @param threads   таблиця `threads` (розмови приватного чату)
 * @param messages  таблиця `messages` — ЛИШЕ непрочитані чужі (див. `повідомлення`)
 * @param ширина    ширина екрана в pt (390 — iPhone Вови; 320 — найвужчий живий)
 */
async function сцена({ routes = [РЕЙС_БЛИЗЬКО, РЕЙС_ДАЛЕКО], posts = [], user = null,
                       profiles = [], seen = ВІЗИТ, tracked = null, comments = [],
                       threads = [], messages = [], ширина = 390, завтра = null } = {}) {
  const ctx = await b.newContext({
    viewport: { width: ширина, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => {
    if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) {
      errs.push('console: ' + m.text().slice(0, 120));
    }
  });

  await p.clock.install({ time: БАЗА });
  await ctx.addInitScript(([seen, tracked, uid]) => {
    if (seen != null) localStorage.setItem('cstl_board_seen_ts', String(seen));
    if (tracked) localStorage.setItem('bus_track_v2:' + uid, JSON.stringify({ routes: tracked }));
  }, [seen, tracked, UID]);

  await mockSupabase(p, { posts, profiles, comments, threads, messages, thread_user_state: [] },
                     user ? { user } : {});
  await p.route('**/data/schedule.json*', r => r.fulfill({
    contentType: 'application/json',
    // ⚠️ `days` додаємо ЛИШЕ коли сцена просить завтрашній день. Інакше форма
    // відповіді лишається точно такою, як була до 20.08, і жодна зі старих
    // сцен не міняє поведінки через цю правку.
    body: JSON.stringify({ version: 2, updatedAt: '17.08.2026', updatedTime: '08:00',
                           carriers: ПЕРЕВІЗНИКИ, routes,
                           ...(завтра ? { days: { [СЬОГОДНІ]: { routes },
                                                  [ЗАВТРА]: { routes: завтра } } } : {}) }),
  }));
  await p.route('**://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.route('**://nominatim.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  // Контрольний прогін: підміняємо КОД, а не сам стенд (урок стенда зборів 17.08 —
  // `git stash` відкочував і перевірку теж, тобто стара перевірка міряла старий код).
  if (REV) {
    const body = projectFile('bundle.js', REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
  }

  await p.goto(url, { waitUntil: 'domcontentloaded' });
  // Годинник фіксований — час має ЙТИ далі від бази, інакше застосунок стоїть.
  await p.clock.resume();
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector('.consent-ok,[data-consent-ok],.consent-accept')?.click());
  await p.evaluate(() => window.switchTab && window.switchTab('community'));
  await p.waitForTimeout(2500);
  return { ctx, p, errs };
}


const п = await сцена(ПОРОЖНЯ
  ? { routes: [], posts: [], user: null }
  : { user: USER, posts: [], profiles: [] });

const міри = await п.p.evaluate(() => {
  // 🔑 Міряємо ВИДИМІ предмети, а не коробки з невидимими padding: око бачить
  // край скляної пігулки і букви «Новини», а не межу секції.
  const рамка = (s) => { const e = document.querySelector(s); if (!e) return null;
    const r = e.getBoundingClientRect(); return { верх: Math.round(r.top), низ: Math.round(r.bottom) }; };
  return {
    // 🔑 «Герой» — це БОРДОВА КАРТКА `.hm-top`, а не <header>: у секції-обгортці
    // є власні відступи, і міряти по ній означало б міряти невидиме.
    герой:  рамка('#page-community .hm-top') || рамка('#page-community header'),
    пігулка: рамка('.hm-cap2'),
    останняПігулка: (() => { const l=[...document.querySelectorAll('.hm-cap2')]; if(!l.length) return null;
      const r=l[l.length-1].getBoundingClientRect(); return { верх: Math.round(r.top), низ: Math.round(r.bottom) }; })(),
    заголовокНовин: рамка('#cm-news-board .hm-kicker'),
    смуга: рамка('#hm-caps'),
    капсХов: document.getElementById('hm-caps')?.hidden,
    скільки: document.querySelectorAll('.hm-cap2').length,
    // розклад проміжку по шарах — щоб правити причину, а не наслідок
    шари: (() => {
      const герой = document.querySelector('#page-community .hm-top')
                 || document.querySelector('#page-community header');
      const новини = document.querySelector('#cm-news-board');
      if (!герой || !новини) return null;
      const cs = getComputedStyle(новини);
      const між = [];
      let n = герой.nextElementSibling;
      while (n && n !== новини) {
        const r = n.getBoundingClientRect();
        між.push(`${n.id || n.className}: h=${Math.round(r.height)}${n.hidden ? ' (hidden)' : ''}`);
        n = n.nextElementSibling;
      }
      return { між, секціяPT: cs.paddingTop,
               кікерMT: getComputedStyle(новини.querySelector('.hm-sec-head') || новини).marginBottom,
               героюMB: getComputedStyle(герой).marginBottom };
    })(),
  };
});

const { герой, пігулка, останняПігулка, заголовокНовин, капсХов, скільки } = міри;
console.log('капсул на екрані:', скільки, капсХов ? '(смуга прихована)' : '');
console.log('─── видимі розриви (те, що бачить око) ───');
if (герой && пігулка && !капсХов)
  console.log('  низ героя → верх пігулки:      ', пігулка.верх - герой.низ, 'px');
if (останняПігулка && заголовокНовин && !капсХов)
  console.log('  низ пігулки → «Новини»:        ', заголовокНовин.верх - останняПігулка.низ, 'px');
if (герой && заголовокНовин && капсХов)
  console.log('  низ героя → «Новини» БЕЗ капсул:', заголовокНовин.верх - герой.низ, 'px');
if (міри.шари) console.log('  шари між ними:', JSON.stringify(міри.шари));

// Знімок за потреби: числа кажуть «збалансовано», але останнє слово за оком.
const ЗНІМОК = process.env.OUT;
if (ЗНІМОК) { await п.p.screenshot({ path: ЗНІМОК }); console.log('знімок:', ЗНІМОК); }

await b.close(); stop();
