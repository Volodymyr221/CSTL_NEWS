// Стенд: ІМʼЯ І СТРІЧКА ОНОВЛЮЮТЬСЯ БЕЗ ПЕРЕЗАПУСКУ ЗАСТОСУНКУ.
//
// 🔴 ЗАРАДИ ЧОГО — дві скарги Вови 17.09, дослівно:
//   1. «оновлюю якусь інформацію… імʼя чи фотографію, і виходжу на вкладку
//      Громада — зверху в привітанні, якщо я змінив імʼя, воно не відображається
//      зразу. Мені треба закрити застосунок і зайти знову».
//   2. «коли я новий пост викладаю, він мене відразу вибиває в стрічці, що я його
//      опублікував. Але віджет стрічки в громаді не оновлюється».
//
// 🔬 Причина в обох випадках та сама, і вона НЕ в даних: `saveProfile()` чесно
// оновлює і памʼять, і кеш на пристрої — дані свіжі одразу. Але ЕКРАН про це не
// дізнавався: привітання перемальовує `updateGreetingName()`, а її кликали лише на
// старті вкладки і на `onAuthChange` — зміна імені ж не є зміною входу.
//
// 🔑 ЩО МІРЯЄМО: текст НА ЕКРАНІ до і після події. Перевірка «слухач є в коді»
// пропустила б випадок «слухач висить, а функція нічого не міняє».
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';

const { ok, done } = reporter('live-profile-community');
const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(800);

// ── 1. ПРИВІТАННЯ ────────────────────────────────────────────────────────────
// Ставимо імʼя «руками» в той самий вузол, що малює застосунок, і дивимось, чи
// подія його перемалює. Так сцена не залежить від живого входу.
const було = await p.evaluate(() => {
  const el = document.querySelector('.hm-hi');
  if (el) el.textContent = 'Добрий день, СТАРЕ_ІМЯ';
  return el ? el.textContent : null;
});
ok('КОНТРОЛЬ: вузол привітання на екрані є', було === 'Добрий день, СТАРЕ_ІМЯ', String(було));

await p.evaluate(() => window.dispatchEvent(new CustomEvent('cstl-profile-updated',
  { detail: { name: 'НОВЕ_ІМЯ' } })));
await p.waitForTimeout(500);
const стало = await p.evaluate(() => document.querySelector('.hm-hi')?.textContent || '');
ok('🔴 ГОЛОВНЕ: після збереження профілю привітання перемалювалось САМЕ',
   стало !== 'Добрий день, СТАРЕ_ІМЯ', `було «Добрий день, СТАРЕ_ІМЯ» → стало «${стало}»`);

// 🛑 МУТАЦІЯ: чужа подія НЕ сміє перемальовувати — інакше перевірка вище зеленіла б
// на коді, що смикає екран від будь-чого.
await p.evaluate(() => {
  document.querySelector('.hm-hi').textContent = 'Добрий день, МІТКА';
  window.dispatchEvent(new CustomEvent('cstl-щось-інше'));
});
await p.waitForTimeout(400);
const післяЧужої = await p.evaluate(() => document.querySelector('.hm-hi')?.textContent || '');
ok('🛑 МУТАЦІЯ: стороння подія привітання НЕ чіпає',
   післяЧужої === 'Добрий день, МІТКА', післяЧужої);

// ── 2. ВІДЖЕТ СТРІЧКИ ────────────────────────────────────────────────────────
// Міряємо не картки (для них потрібна база), а САМ ФАКТ перемальовки: ставимо
// мітку в контейнер віджета і дивимось, чи її затерло новим рендером.
const єВіджет = await p.evaluate(() => !!document.getElementById('hm-feed'));
ok('КОНТРОЛЬ: контейнер віджета Стрічки на Громаді існує', єВіджет);

// 🛑 ЯК ТУТ ДОВОДИТЬСЯ ПЕРЕМАЛЬОВКА — І ЧОМУ НЕ ЧЕРЕЗ DOM.
// Дві спроби через розмітку провалились, і обидві повчальні:
//   1. мітка в тілі віджета — без живої бази `renderHomeFeed()` тіла не чіпає;
//   2. `sec.hidden` — теж ні: `window.supabase` у пісочниці є, тож функція йде
//      далі, у мережу, і завершується в `catch`, не лишаючи сліду в DOM.
// 🔑 Тому ловимо слід, який ця функція лишає ЗАВЖДИ, щойно її покликали: ПОХІД
// У БАЗУ. Рахуємо запити до `pages` — якщо після події їх побільшало, рендер
// відбувся. Цей слід не залежить ні від розмітки, ні від успіху мережі.
let запитівДоPages = 0;
await p.route('**/rest/v1/pages*', route => {
  запитівДоPages++;
  route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: '[]' });
});
await p.waitForTimeout(300);
const до = запитівДоPages;

await p.evaluate(() => window.dispatchEvent(new CustomEvent('cstl-feed-changed',
  { detail: { post_id: 1 } })));
await p.waitForTimeout(1500);
ok('🔴 віджет Стрічки ВІДПРАЦЮВАВ на подію «допис опубліковано»',
   запитівДоPages > до, `запитів до бази: ${до} → ${запитівДоPages}`);

// 🛑 МУТАЦІЯ: чужа подія віджет не чіпає — інакше перевірка вище зеленіла б на
// коді, що перемальовує від будь-чого.
const доЧужої = запитівДоPages;
await p.evaluate(() => window.dispatchEvent(new CustomEvent('cstl-щось-інше')));
await p.waitForTimeout(900);
ok('🛑 МУТАЦІЯ: стороння подія віджет НЕ перемальовує',
   запитівДоPages === доЧужої, `${доЧужої} → ${запитівДоPages}`);

// ── 3. ЛАНЦЮГ: saveProfile СПРАВДІ ШЛЕ ПОДІЮ ─────────────────────────────────
// ⚠️ Текстова перевірка, і це чесно позначено: живий `saveProfile` тут не
// викликати — він іде в базу. Але вона ловить найімовірніший розрив: подію
// прибрали з ядра, а слухачі лишились висіти.
import { readFileSync } from 'fs';
const auth = readFileSync(new URL('../src/core/auth.js', import.meta.url), 'utf-8');
ok('🔑 `saveProfile()` шле `cstl-profile-updated` (ланцюг не обірваний)',
   /cstl-profile-updated/.test(auth) && /saveProfile/.test(auth));

await b.close(); await stop();
done();
