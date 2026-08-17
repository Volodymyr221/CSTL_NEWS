// Стенд: КАПСУЛИ ГРОМАДИ — три ролі МОЄ · ЗАРАЗ · НОВЕ (17.08.2026).
//
// 🔴 ЗАРАДИ ЧОГО ВІН ІСНУЄ. Капсули перебудовано з «розділів зі статистикою» на
// три РОЛІ, і всі нові вади цієї конструкції мовчазні:
//   • роль показала чуже — «МОЄ» з оголошенням сусіда;
//   • роль показала порожнечу замість того, щоб зникнути;
//   • ЗАРАЗ порахував час до виїзду з ПОЧАТКОВОЇ зупинки, а не до посадки на
//     своїй (людина приходить на пів години раніше й не розуміє чому);
//   • НОВЕ рахує від початку доби, а не від останнього візиту;
//   • тап веде «в розділ» замість конкретного обʼєкта.
// Жодну з них не видно ні на знімку, ні в коді — лише проходженням сцени.
//
// 🔑 ГОДИННИК ЗАФІКСОВАНО (`clock.install`), і це не перестраховка. Половина
// перевірок тут — про ЧАС ДО РЕЙСУ, а розклад ми підміняємо своїм. Без фіксації
// стенд між 21:55 і 23:55 бачив би «рейс о 20:00 уже минув» і червонів би на
// цілком робочому коді — тобто був би сторожем, який бреше 8% доби.
//
// ⚠️ Підміняємо ту саму дорогу, якою ходить застосунок: `mockSupabase` віддає
// власну `window.supabase` замість бібліотеки з CDN, розклад — через `p.route`
// на `data/schedule.json`.
import { chromium } from 'playwright';
import { chromiumPath, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });

// ── Сцена: 17 серпня 2026, 09:00 ────────────────────────────────────────────
const БАЗА = new Date('2026-08-17T09:00:00');
const СЬОГОДНІ = '2026-08-17';
const ВІЗИТ = new Date('2026-08-17T08:00:00').getTime();   // коли востаннє був на Дошці

const UID = 'uid-vova';
const USER = { id: UID, email: 'vova@example.com' };

// Рейс через 40 хв і рейс через 11 годин. Другий існує, щоб довести стелю
// «ЗАРАЗ»: далекий рейс — це не «зараз», і капсули він давати не має.
// ⚠️ `carrier` обовʼязковий: без нього картка рейсу падає на `.split` імені
// перевізника (спіймано першим прогоном цього стенда). Заглушка мусить давати
// рівно ті поля, що дає живий парсер, інакше вона ламає не те, що перевіряє.
const ПЕРЕВІЗНИКИ = { test_carrier: { name: 'ТЕСТ-перевізник', phone: '0332 224 500' } };
const РЕЙС_БЛИЗЬКО = {
  id: 'r_soon', name: 'Олика Луцьк', status: 'scheduled', carrier: 'test_carrier',
  departure_time: '09:40', arrival_time: '10:20', duration_min: 40,
  stops: [{ name: 'Олика', km: 0 }, { name: 'Луцьк', km: 40 }],
};
const РЕЙС_ДАЛЕКО = {
  id: 'r_far', name: 'Олика Ківерці', status: 'scheduled', carrier: 'test_carrier',
  departure_time: '20:00', arrival_time: '20:40', duration_min: 40,
  stops: [{ name: 'Олика', km: 0 }, { name: 'Ківерці', km: 40 }],
};

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
 */
async function сцена({ routes = [РЕЙС_БЛИЗЬКО, РЕЙС_ДАЛЕКО], posts = [], user = null,
                       profiles = [], seen = ВІЗИТ, tracked = null } = {}) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
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

  await mockSupabase(p, { posts, profiles }, user ? { user } : {});
  await p.route('**/data/schedule.json*', r => r.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ version: 2, updatedAt: '17.08.2026', updatedTime: '08:00',
                           carriers: ПЕРЕВІЗНИКИ, routes }),
  }));
  await p.route('**://api.open-meteo.com/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
  await p.route('**://nominatim.openstreetmap.org/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));

  await p.goto(url, { waitUntil: 'domcontentloaded' });
  // Годинник фіксований — час має ЙТИ далі від бази, інакше застосунок стоїть.
  await p.clock.resume();
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector('.consent-ok,[data-consent-ok],.consent-accept')?.click());
  await p.evaluate(() => window.switchTab && window.switchTab('community'));
  await p.waitForTimeout(2500);
  return { ctx, p, errs };
}

// Що зараз намальовано у смузі капсул.
const капсули = p => p.evaluate(() => {
  const box = document.getElementById('hm-caps');
  const list = [...document.querySelectorAll('.hm-cap2')];
  return {
    коробка: !!box,
    прихована: !box || box.hidden,
    порожняКоробка: !!box && !box.hidden && list.length === 0,
    n: list.length,
    ролі: list.map(c => c.querySelector('.hm-cap2-k')?.textContent.trim() || ''),
    тексти: list.map(c => c.querySelector('.hm-cap2-v')?.textContent.trim() || ''),
    крапки: document.querySelectorAll('.hm-cap2-dots, .hm-cap2-dots i').length,
    кнопки: list.filter(c => c.tagName === 'BUTTON').length,
    вектор: list.filter(c => c.querySelector('.hm-cap2-ic svg')).length,
    // Текст не має вилазити за капсулу: у рядок тепер потрапляє назва оголошення.
    вилазить: list.filter(c => {
      const v = c.querySelector('.hm-cap2-v');
      return v && v.getBoundingClientRect().right > c.getBoundingClientRect().right + 0.5;
    }).length,
  };
});

// ── СЦЕНА 1: ГІСТЬ. Є близький рейс і три нових оголошення ──────────────────
{
  const s = await сцена({
    posts: [оголошення(1), оголошення(2), оголошення(3), оголошення(4, { created_at: '2026-08-17T07:00:00.000Z' })],
  });
  const c = await капсули(s.p);

  ok('🔴 гість бачить осмислені капсули (не порожню смугу)', c.n === 2, `${c.n} шт: ${c.тексти.join(' | ')}`);
  ok('🔴 ролі саме ЗАРАЗ → НОВЕ (МОЄ гостю недоступне)',
     c.ролі.join('→') === 'ЗАРАЗ→НОВЕ', c.ролі.join('→'));
  // 🔑 40 хв — це час до посадки в ОЛИЦІ, і рахується він від `departure_time`
  // саме тієї зупинки, а не від виїзду з початкової.
  ok('🔴 ЗАРАЗ показує напрямок і час до рейсу',
     c.тексти[0] === 'Луцьк · через 40 хв', c.тексти[0]);
  // Четверте оголошення створене О 07:00 — ДО останнього візиту (08:00), і в
  // «нових» його бути не має. Саме тут ловиться «рахуємо від початку доби».
  ok('🔴 НОВЕ рахує від останнього візиту, а не від початку доби',
     c.тексти[1] === '3 нові оголошення', c.тексти[1]);
  ok('🔴 капсула «Новини» не дублює блок новин нижче',
     !c.ролі.includes('НОВИНИ') && !/публікац/i.test(c.тексти.join(' ')));
  ok('🔴 лічильника непрочитаних повідомлень у капсулах немає (він уже на FAB)',
     !/повідомл/i.test(c.тексти.join(' ')), c.тексти.join(' | '));
  ok('🔴 гостя не кличуть увійти прямо з капсули',
     !/увійд|увійти|зареєстр/i.test(c.тексти.join(' ')));
  ok('капсули лишились кнопками', c.кнопки === c.n);
  ok('іконки капсул векторні (правило Вови 05.08)', c.вектор === c.n, `${c.вектор}/${c.n}`);
  ok('текст не вилазить за капсулу', c.вилазить === 0);

  // 🔴 СТАТИКА. Було: текст мінявся кожні 5.2 с. Рішення Вови 17.08 — прибрати.
  // ⚠️ Чекаємо 8с — довше за колишній цикл разом із розбіжкою старту (5.2+1.4×2),
  // інакше перевірка була б зеленою просто тому, що не дочекалась.
  ok('🔴 крапок циклу в розмітці не лишилось', c.крапки === 0, `${c.крапки}`);
  const до = c.тексти;
  await s.p.waitForTimeout(8000);
  const після = (await капсули(s.p)).тексти;
  ok('🔴 текст капсул НЕ змінюється сам собою (ротацію знято)',
     до.join('|') === після.join('|'), `${до.join('/')} → ${після.join('/')}`);

  ok('помилок у консолі немає (гість)', s.errs.length === 0, s.errs.slice(0, 2).join(' | '));
  await s.ctx.close();
}

// ── СЦЕНА 2: ЗАЛОГІНЕНИЙ. Відхилене + на модерації, село в анкеті ───────────
{
  const s = await сцена({
    user: USER,
    profiles: [{ uid: UID, name: 'Вова', settlement: 'Олика' }],
    posts: [
      оголошення(10, { owner_uid: UID, status: 'rejected',  title: 'Плуг МТЗ' }),
      оголошення(11, { owner_uid: UID, status: 'pending',   title: 'Коса ручна' }),
      оголошення(12, { location: 'Олика' }),
      оголошення(13, { location: 'Дерно' }),          // чуже село — не рахуємо
      оголошення(14, { location: 'Вся Олицька громада' }),  // на всю громаду — рахуємо
    ],
  });
  const c = await капсули(s.p);

  ok('🔴 усі три ролі на місці', c.n === 3, `${c.n} шт: ${c.тексти.join(' | ')}`);
  ok('🔴 порядок ролей МОЄ → ЗАРАЗ → НОВЕ',
     c.ролі.join('→') === 'МОЄ→ЗАРАЗ→НОВЕ', c.ролі.join('→'));
  // 🔑 Відхилене важливіше за те, що ще розглядають: там від людини чекають дії.
  ok('🔴 МОЄ показує ВІДХИЛЕНЕ, а не «на модерації»',
     /^Відхилено · /.test(c.тексти[0]), c.тексти[0]);
  ok('🔴 МОЄ називає САМЕ оголошення, а не число',
     c.тексти[0] === 'Відхилено · Плуг МТЗ', c.тексти[0]);
  // Дерно відсіяно, загальногромадське лишилось → 2.
  ok('🔴 НОВЕ звужене селом з анкети (чуже село не рахується)',
     c.тексти[2] === 'Олика · 2 нові оголошення', c.тексти[2]);

  // Тап по МОЄ → «Мої оголошення», а не «кудись у Дошку».
  // 🛑 Спершу перевіряємо, що капсула взагалі є. Playwright чекав би її 30с і
  // вбивав прогін TimeoutError — на КОНТРОЛЬНОМУ прогоні (код без цієї роботи)
  // сторож помирав би зі стеком замість чесного «N/35». Той самий урок, що у
  // стенді зборів 17.08: перевірка мусить ЗВІТУВАТИ про провал, а не падати.
  const єМоє = await s.p.evaluate(() => !!document.querySelector('.hm-cap2[data-cap="mine"]'));
  if (єМоє) { await s.p.locator('.hm-cap2[data-cap="mine"]').click(); await s.p.waitForTimeout(1200); }
  const екран = !єМоє ? '' : await s.p.evaluate(() => {
    const s2 = document.querySelector('.pm-screen--ads');
    return s2 ? s2.textContent.slice(0, 200) : '';
  });
  ok('🔴 тап по МОЄ веде в «Мої оголошення»', /мої оголошення/i.test(екран),
     екран ? екран.slice(0, 60) : 'екрана немає');

  ok('помилок у консолі немає (залогінений)', s.errs.length === 0, s.errs.slice(0, 2).join(' | '));
  await s.ctx.close();
}

// ── СЦЕНА 3: ОДНЕ НОВЕ ОГОЛОШЕННЯ → тап відкриває САМЕ ЙОГО ─────────────────
{
  const s = await сцена({ posts: [оголошення(21, { title: 'Віддам кошенят' })] });
  const c = await капсули(s.p);
  ok('🔴 одне нове — капсула називає його, а не «1 нове оголошення»',
     c.тексти[1] === 'Віддам кошенят', c.тексти[1]);

  const єНове = await s.p.evaluate(() => !!document.querySelector('.hm-cap2[data-cap="new"]'));
  if (єНове) { await s.p.locator('.hm-cap2[data-cap="new"]').click(); await s.p.waitForTimeout(1200); }
  const модалка = !єНове ? '' : await s.p.evaluate(() => {
    const m = document.querySelector('.cm-ad-screen');
    return m ? m.textContent.slice(0, 300) : '';
  });
  ok('🔴 тап веде в КОНКРЕТНЕ оголошення, а не «в розділ»',
     /Віддам кошенят/.test(модалка), модалка ? модалка.slice(0, 60) : 'модалки немає');

  ok('помилок у консолі немає (одне нове)', s.errs.length === 0, s.errs.slice(0, 2).join(' | '));
  await s.ctx.close();
}

// ── СЦЕНА 4: ТИХИЙ ДЕНЬ — рахувати нічого ───────────────────────────────────
{
  const s = await сцена({ routes: [РЕЙС_ДАЛЕКО], posts: [] });
  const c = await капсули(s.p);
  ok('🔴 далекий рейс (11 год) — це не «ЗАРАЗ»', !c.ролі.includes('ЗАРАЗ'), c.ролі.join(','));
  ok('🔴 тихого дня капсул немає зовсім', c.n === 0, `${c.n} шт`);
  ok('🔴 порожньої коробки не буває — смуга прихована', c.прихована && !c.порожняКоробка);
  ok('помилок у консолі немає (тихий день)', s.errs.length === 0, s.errs.slice(0, 2).join(' | '));
  await s.ctx.close();
}

// ── СЦЕНА 5: ПЕРШИЙ ЗАПУСК — нічого не пропущено ────────────────────────────
{
  const s = await сцена({ seen: null, posts: [оголошення(31), оголошення(32)] });
  const c = await капсули(s.p);
  // 🔑 Той, хто щойно поставив застосунок, нічого не пропускав. Показати йому
  // «2 нових» за весь архів Дошки було б неправдою того ж ґатунку, що «LIVE».
  ok('🔴 першого запуску «нових» не показуємо', !c.ролі.includes('НОВЕ'), c.ролі.join(','));
  const позначка = await s.p.evaluate(() => localStorage.getItem('cstl_board_seen_ts'));
  ok('🔴 але позначку ставимо одразу — назавтра лічильник запрацює',
     !!позначка && Number(позначка) > 0, String(позначка));
  ok('помилок у консолі немає (перший запуск)', s.errs.length === 0, s.errs.slice(0, 2).join(' | '));
  await s.ctx.close();
}

// ── СЦЕНА 6: ВІДСТЕЖУВАНИЙ РЕЙС — стеля часу на нього не діє ────────────────
{
  const s = await сцена({
    user: USER, routes: [РЕЙС_ДАЛЕКО], posts: [],
    tracked: [{
      routeId: 'r_far', trackDate: СЬОГОДНІ, boardingStop: 'Олика',
      alightingStop: 'Ківерці', title: 'Олика → Ківерці', depTime: '20:00', notify: true,
    }],
  });
  const c = await капсули(s.p);
  // 🔑 Той самий рейс, який у сцені 4 капсули НЕ дав. Різниця одна: людина сама
  // натиснула «відстежувати». Ховати його до останніх двох годин означало б
  // проігнорувати її явну дію.
  ok('🔴 відстежуваний рейс показуємо попри стелю «ЗАРАЗ»',
     c.ролі.includes('ЗАРАЗ'), c.ролі.join(','));
  ok('🔴 і показуємо саме його напрямок', /^Ківерці · через 11 год/.test(c.тексти[0] || ''), c.тексти[0]);

  const єЗараз = await s.p.evaluate(() => !!document.querySelector('.hm-cap2[data-cap="now"]'));
  if (єЗараз) { await s.p.locator('.hm-cap2[data-cap="now"]').click(); await s.p.waitForTimeout(1500); }
  const вкладка = !єЗараз ? {} : await s.p.evaluate(() => ({
    tab: document.querySelector('.app-main')?.dataset.tab,
    підсвічено: !!document.querySelector('[data-route-id="r_far"]'),
  }));
  ok('🔴 тап веде в Розклад', вкладка.tab === 'buses', String(вкладка.tab));
  ok('🔴 і саме до цього рейсу', вкладка.підсвічено === true);

  ok('помилок у консолі немає (відстеження)', s.errs.length === 0, s.errs.slice(0, 2).join(' | '));
  await s.ctx.close();
}

await b.close();
await stop();
done();
