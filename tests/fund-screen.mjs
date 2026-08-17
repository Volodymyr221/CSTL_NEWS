// Стенд: РОЗДІЛ «ЗБОРИ» — меню → екран → заявка (17.08.2026).
//
// 🔴 ЗАРАДИ ЧОГО ВІН ІСНУЄ. Тут ідеться про ЧУЖІ ГРОШІ, і найгірші вади цього
// розділу мовчазні: форма, що надсилає порожню заявку; гейт входу, який
// перестав пускати або, навпаки, перестав тримати; поле, яке зникло з форми і
// доїхало в адмінку без телефона. Жодну з них не видно ні на знімку, ні в коді —
// лише проходженням шляху цілком.
//
// ⚠️ Перевіряємо ПОВЕДІНКУ, а не наявність класів: «пункт у меню є» нічого не
// вартий, якщо тап не відкриває екран, а «форма намальована» — якщо кнопка
// надсилає порожнечу.
//
// 🔑 Сцена йде ДВІЧІ — гостем і залогіненим. Половина цього розділу живе за
// `isLoggedIn()`, і поки стенд ходив би лише одним із двох станів, друга
// половина лишалась би без жодної перевірки. Рівно так у проєкті вже ховався
// баг B-30 (пункт «Повідомлення» мовчки не відкривався при 46 зелених стендах).
import { chromium } from 'playwright';
import { chromiumPath, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });

const FUND = [{
  id: 1, title: 'Дрони для 14 ОМБр', org: 'Волонтерський штаб Олики',
  url: 'https://send.monobank.ua/jar/A', goal: 250000, photo: './photos/olyka.day-3.jpg',
  note: 'Збір на чотири дрони.', kind: 'military', until: '2026-09-30',
  place: 'Олика', verified: true, active: true, sort_order: 0,
}];

async function сцена(user) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await mockSupabase(p, { fundraisers: FUND, fundraiser_requests: [] }, user ? { user } : {});
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(6000);
  await p.evaluate(() => document.querySelector('.consent-ok,[data-consent-ok],.consent-accept')?.click());
  return { ctx, p, errs };
}

// ── 1. МЕНЮ ────────────────────────────────────────────────────────────────
const гість = await сцена(null);
await гість.p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
await гість.p.waitForTimeout(700);

const пункт = await гість.p.evaluate(() => {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return null;
  const усі = [...nav.querySelectorAll('[data-nav]')];
  const el = усі.find(e => /Збори/.test(e.textContent || ''));
  if (!el) return { немає: true };
  // Група = найближчий попередній підпис секції в порядку документа.
  const все = [...nav.querySelectorAll('*')];
  let гурт = '—';
  for (let k = все.indexOf(el); k >= 0; k--) {
    const c = все[k].className;
    if (typeof c === 'string' && /cap/i.test(c)) { гурт = все[k].textContent.trim(); break; }
  }
  return { гурт, вектор: !!el.querySelector('svg'), підпис: el.textContent.trim().split('\n')[0] };
});
ok('🔴 пункт «Збори» є в бургер-меню', пункт && !пункт.немає);
// 🔑 Саме «Розділи», а не «Моє»: до зборів приходять ДИВИТИСЬ контент громади, а
// не керувати своїм. Помилкова група — це не косметика: вона змінює те, чого
// людина очікує за пунктом.
ok('🔴 пункт стоїть у групі «Розділи»', пункт?.гурт === 'Розділи', `група: ${пункт?.гурт}`);
ok('іконка векторна (правило Вови 05.08)', пункт?.вектор === true);

// 🛑 РАННІЙ ВИХІД, А НЕ ПАДІННЯ ВИНЯТКОМ. Без пункту меню весь дальший шлях
// недосяжний, і кожен наступний крок кинув би помилку Node — прогін помирав би
// зі стеком замість чесного «N/23». Спіймано на власному контрольному прогоні
// (код ДО розділу): сторож мусить ЗВІТУВАТИ про провал, а не падати, інакше на
// контролі не видно, скільки саме перевірок він ловить.
if (!пункт || пункт.немає) {
  ok('🛑 далі перевіряти нічого: без пункту меню розділ недосяжний', false);
  await гість.ctx.close(); await b.close(); await stop(); done();
}

// ── 2. ГЕЙТ ВХОДУ ──────────────────────────────────────────────────────────
await гість.p.evaluate(() => {
  const el = [...document.querySelectorAll('#sidebar-nav [data-nav]')].find(e => /Збори/.test(e.textContent || ''));
  el?.click();
});
await гість.p.waitForTimeout(900);
const екранГостя = await гість.p.evaluate(() => !!document.querySelector('.fs-screen'));
ok('гість бачить сам розділ (збори — публічні)', екранГостя);

await гість.p.evaluate(() => document.getElementById('fs-propose')?.click());
await гість.p.waitForTimeout(800);
const гейт = await гість.p.evaluate(() => ({
  формаВідкрилась: !!document.querySelector('.app-modal--fundreq'),
  щосьЗʼявилось: !!document.querySelector('.app-modal, .acc-screen, .auth-screen, .toast'),
}));
// 🔴 ГОЛОВНА ПЕРЕВІРКА ГЕЙТА. Анонімна заявка на збір коштів — відкритий канал
// для шахрая, і немає з ким звʼязатись. Форма НЕ МАЄ відкриватись гостю.
ok('🔴 гостю форма заявки НЕ відкривається', гейт.формаВідкрилась === false);
ok('гостю показано, що робити (вхід або підказка)', гейт.щосьЗʼявилось === true);
await гість.ctx.close();

// ── 3. ЕКРАН І ФОРМА ДЛЯ ЗАЛОГІНЕНОГО ──────────────────────────────────────
const свій = await сцена({ id: 'u1', email: 'test@example.com' });
await свій.p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
await свій.p.waitForTimeout(700);
await свій.p.evaluate(() => {
  const el = [...document.querySelectorAll('#sidebar-nav [data-nav]')].find(e => /Збори/.test(e.textContent || ''));
  el?.click();
});
await свій.p.waitForTimeout(1200);

const екран = await свій.p.evaluate(() => {
  const s = document.querySelector('.fs-screen');
  if (!s) return null;
  const r = s.getBoundingClientRect();
  const cta = s.querySelector('#fs-propose');
  const cr = cta && cta.getBoundingClientRect();
  return {
    відкрито: s.classList.contains('open'),
    наВесьЕкран: Math.round(r.width) === window.innerWidth && Math.round(r.left) === 0,
    карток: s.querySelectorAll('.hm-fund').length,
    межа: /не приймає/i.test(s.textContent),
    висотаКнопки: cr ? Math.round(cr.height) : 0,
    кнопкаВМежах: cr ? cr.right <= r.right + 1 && cr.left >= r.left - 1 : null,
  };
});
ok('🔴 тап по пункту відкриває повноекранний розділ', !!екран?.відкрито && екран.наВесьЕкран);
ok('збори на екрані намальовані', (екран?.карток ?? 0) === FUND.length, `карток: ${екран?.карток}`);
// 🔴 Найважливіше речення екрана про гроші: платформа не є стороною збору.
ok('🔴 сказано, що застосунок кошти НЕ приймає', екран?.межа === true);
ok('кнопка дії не менша за норму Apple HIG (44px)', (екран?.висотаКнопки ?? 0) >= 44, `${екран?.висотаКнопки}px`);
ok('кнопка не вилазить за екран', екран?.кнопкаВМежах === true);

await свій.p.evaluate(() => document.getElementById('fs-propose')?.click());
await свій.p.waitForTimeout(800);
const форма = await свій.p.evaluate(() => {
  const m = document.querySelector('.app-modal--fundreq');
  if (!m) return null;
  const треба = ['fsf-title','fsf-org','fsf-url','fsf-note','fsf-goal','fsf-kind','fsf-name','fsf-phone','fsf-ok','fsf-send'];
  const i = m.querySelector('#fsf-title');
  const mr = m.getBoundingClientRect();
  const поля = [...m.querySelectorAll('input,textarea,select')];
  return {
    бракує: треба.filter(id => !m.querySelector('#' + id)),
    дрібніПоля: поля.filter(e => e.type !== 'checkbox' && parseFloat(getComputedStyle(e).fontSize) < 16).length,
    полеВМежах: i ? i.getBoundingClientRect().right <= mr.right + 1 : null,
    сказаноПроМодерацію: /не публікується автоматично/i.test(m.textContent),
    сказаноПроВідповідальність: /відповідаю я/i.test(m.textContent),
  };
});
ok('🔴 форма заявки відкрилась залогіненому', !!форма);
// 🔑 Поля форми = поля збору. Зникле поле не зламає екран — воно просто доїде в
// адмінку порожнім, і Вова не матиме телефона, щоб передзвонити.
ok('🔴 у формі є всі поля', форма && !форма.бракує.length, `бракує: ${форма?.бракує.join(', ') || '—'}`);
// 🔴 Нижче 16px iOS сам зумить сторінку при фокусі — той самий клас вади, через
// який 16.08 повертали заборону масштабування.
ok('🔴 жодне поле не дрібніше за 16px', форма?.дрібніПоля === 0, `дрібних: ${форма?.дрібніПоля}`);
ok('поля не вилазять за аркуш', форма?.полеВМежах === true);
ok('🔴 сказано, що заявка НЕ публікується автоматично', форма?.сказаноПроМодерацію === true);
ok('🔴 названо межу відповідальності', форма?.сказаноПроВідповідальність === true);

// ── 4. ФОРМА НЕ НАДСИЛАЄ ПОРОЖНЄ ───────────────────────────────────────────
//
// 🔴 ТОСТИ В ЦЬОМУ ПРОЄКТІ СТОЯТЬ У ЧЕРЗІ (`showToast`, 27.07): друге
// повідомлення НЕ затирає перше, поки те не провисіло щонайменше 1.5с, а час
// показу рахується за довжиною тексту (2.5-6с). Тому «клікнув → зачекав 600мс →
// прочитав `.toast`» дає ПОПЕРЕДНІЙ текст, і перевірка звинувачує справний код.
// Спіймано на собі: дві перевірки внизу червоніли, показуючи тост від першої
// спроби.
// ➡️ Чекаємо ПОЯВИ потрібного тексту, а не фіксовану паузу. Та сама сімʼя
// уроків, що «те, що згасає, міряй подією, а не числом» (16.08).
const чекатиТост = async (re, ms = 9000) => {
  try {
    await свій.p.waitForFunction(
      (rx) => new RegExp(rx, 'i').test(document.querySelector('.toast')?.textContent || ''),
      re.source, { timeout: ms });
  } catch (_) { /* не дочекались — віддамо, що є, і перевірка це покаже */ }
  return свій.p.evaluate(() => document.querySelector('.toast')?.textContent?.trim() || '');
};

await свій.p.evaluate(() => document.getElementById('fsf-send')?.click());
const т1 = await чекатиТост(/назв/);
// ⚠️ Міряємо не «тост зʼявився», а чи він КАЖЕ, ЧОГО БРАКУЄ. «Заповніть усі
// поля» змушує людину шукати самій — а вона й так робить послугу громаді.
ok('🔴 порожня форма не надсилається і тост називає, чого бракує',
   /назв/i.test(т1), `тост: «${т1}»`);

await свій.p.evaluate(() => {
  const v = (id, val) => { const e = document.getElementById(id); if (e) e.value = val; };
  v('fsf-title', 'Тестовий збір'); v('fsf-org', 'Тестова організація');
  v('fsf-url', 'http://send.monobank.ua/jar/A');       // 🔴 навмисно НЕ https
  v('fsf-name', 'Іван'); v('fsf-phone', '0501112233');
  document.getElementById('fsf-ok').checked = true;
  document.getElementById('fsf-send').click();
});
const т2 = await чекатиТост(/https/);
// 🔴 Посилання про гроші не йде по http — і зупиняє це клієнт, не лише база.
ok('🔴 http-посилання відхилено з поясненням', /https/i.test(т2), `тост: «${т2}»`);

await свій.p.evaluate(() => {
  document.getElementById('fsf-url').value = 'https://send.monobank.ua/jar/A';
  document.getElementById('fsf-ok').checked = false;
  document.getElementById('fsf-send').click();
});
const т3 = await чекатиТост(/відповідальн/);
ok('🔴 без підтвердження відповідальності не надсилається',
   /відповідальн/i.test(т3), `тост: «${т3}»`);

// ── 5. СИСТЕМНИЙ «НАЗАД» ───────────────────────────────────────────────────
// 🔑 Закриття віддано `core/layers.js`, тобто історії браузера. Перевіряємо
// саме `goBack()` сторінки, а не `history.back()` зсередини `evaluate`: другий
// не встигає відпустити замок прокрутки (записаний урок проєкту).
await свій.p.evaluate(() => document.querySelector('.app-modal-close')?.click());
await свій.p.waitForTimeout(600);
await свій.p.goBack();
await свій.p.waitForTimeout(700);
const післяНазад = await свій.p.evaluate(() => ({
  екранЗник: !document.querySelector('.fs-screen'),
  класЗнято: !document.body.classList.contains('fs-open'),
}));
ok('🔴 системний «назад» закриває розділ', післяНазад.екранЗник);
ok('клас на body знято (прокрутка вкладки повернулась)', післяНазад.класЗнято);

ok('помилок у консолі нема', свій.errs.length === 0, свій.errs.slice(0, 2).join(' · '));

await свій.ctx.close();
await b.close();
await stop();
done();
