// Стенд: ПЕРШИЙ ЕКРАН ПІСЛЯ ВХОДУ («Раді вас бачити»).
//
// 🗣️ ЗАМОВЛЕННЯ ВОВИ (29.08): «там є ім'я і прізвище, так, але чи можна зробити
// автозаповнення?… Дата народження — вона є, але її треба так, щоб цю карусель
// вибору дати народження було легко вибрати, а не гортати по місяцях там до
// 1994 року».
//
// 🔴 ЩО СТЕРЕЖЕМО І ЧОМУ САМЕ ЦЕ.
//
//   1. **Прізвище окремим полем.** У кабінеті воно вже було окремо, а на ПЕРШОМУ
//      екрані весь рядок від Google лягав в одне поле «Імʼя» — тобто прізвище
//      або губилось, або назавжди лишалось приклеєним до імені. Це єдине місце
//      в застосунку, де так було.
//   2. **Дата НЕ календарем.** `input type="date"` на iPhone відкривається на
//      поточному місяці: до року народження — десятки гортань. Стережемо, щоб
//      календар не повернувся «бо простіше».
//   3. **Розбір імені виконується, а не описується.** Заміряно по 13 акаунтах:
//      Google віддає лише `full_name` одним рядком, окремих полів немає. Тож
//      поділ по першому пробілу — єдине, що в нас є, і він мусить бути правильним
//      на подвійних прізвищах і на однослівному імені.
//   4. **«31 лютого» не доходить до бази.** Три списки дозволяють набрати
//      неіснуючу дату вільно; база відхилила б її помилкою, яку людина не
//      зрозуміє. Ловимо на місці.
//
// 🔴 КОНТРОЛЬ: BUNDLE_REV=origin/main node tests/profile-first-screen.mjs
// На коді до 29.08 перевірки 1-4 мусять УПАСТИ.
import { chromium } from 'playwright';
import { projectFile, launch } from './_lib.mjs';

const REV = process.env.BUNDLE_REV || '';
const res = [];
const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };

const ui = projectFile('src/core/account-ui.js', REV);
// Дивимось на КОД без коментарів: у цьому репозиторії коментарі довгі й називають
// рівно те, що поруч написано кодом (на цьому вже спотикались сторожі 25.08).
const code = ui.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
// Тіло саме першого екрана: сусідні екрани (Кабінет) мають свої поля з тими
// самими іменами, і без цього звуження перевірка міряла б не те місце.
const screen = (code.match(/function openProfile\(\)[\s\S]*?\n\}/) || [''])[0];

console.log(`\n── ПЕРШИЙ ЕКРАН ПІСЛЯ ВХОДУ${REV ? `   (КОНТРОЛЬ на ${REV})` : ''}`);

ok('імʼя і прізвище — ДВА окремі поля',
   /id="acc-name"/.test(screen) && /id="acc-surname"/.test(screen));
ok('прізвище справді зберігається',
   /surname[^\n]*querySelector\('#acc-surname'\)|surname\s*=\s*wrap\.querySelector\('#acc-surname'\)/.test(screen));
ok('дата — три списки, а не календар',
   /id="acc-dd"/.test(screen) && /id="acc-mm"/.test(screen) && /id="acc-yy"/.test(screen));
ok('🛑 календар НЕ повернувся', !/type="date"/.test(screen));
ok('є підпис, НАВІЩО дата', /привітати/.test(screen));
// 🔑 Гілка на майбутній Facebook: акаунт без пошти. Стережемо, щоб її не прибрали
// як «мертвий код» — сьогодні вона справді не виконується, бо Google і вхід кодом
// адресу дають завжди.
ok('є гілка для акаунта БЕЗ пошти (Facebook)', /needEmail/.test(screen));

// ── Виконуємо справжні функції розбору ──────────────────────────────────────
const split = (code.match(/function splitProviderName\([\s\S]*?\n\}/) || [''])[0];
const bday  = (code.match(/function birthDateFrom\([\s\S]*?\n\}/) || [''])[0];

const page = `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module">
  ${split}
  ${bday}
  const out = {};
  const s = (m) => { try { return splitProviderName(m); } catch { return {}; } };
  const b = (d, m, y) => { try { return birthDateFrom(d, m, y); } catch { return {}; } };

  // Те, що реально приходить від Google: один рядок.
  out.двоскладове   = JSON.stringify(s({ full_name: 'Володимир Шевчук' })) === JSON.stringify({ name: 'Володимир', surname: 'Шевчук' });
  // Подвійне прізвище: усе після ПЕРШОГО пробілу — прізвище.
  out.подвійне      = s({ full_name: 'Марія Ковальчук-Гринь Друга' }).surname === 'Ковальчук-Гринь Друга';
  // Одне слово: імʼя є, прізвища немає — і поле лишається порожнім, а не «—».
  out.односкладове  = s({ full_name: 'Оксана' }).name === 'Оксана' && s({ full_name: 'Оксана' }).surname === '';
  // Порожні метадані не мають кидати помилку — людина просто заповнить сама.
  out.порожнє       = s({}).name === '' && s({}).surname === '';
  // Якщо провайдер дав окремі поля (Facebook їх має) — вони точніші за будь-який поділ.
  out.окреміПоля    = s({ given_name: 'Ігор', family_name: 'Гончар', full_name: 'ne vazhlyvo' }).surname === 'Гончар';

  out.датаПравильна = b('7', '3', '1994').value === '1994-03-07';
  out.лютий31       = b('31', '2', '1994').ok === false;
  out.частково      = b('7', '', '1994').ok === false;
  out.порожняДата   = b('', '', '').ok === true && b('', '', '').value === null;
  out.майбутнє      = b('1', '1', String(new Date().getFullYear() + 1)).ok === false;

  document.title = JSON.stringify(out);
<\/script></body></html>`;

const browser = await launch(chromium);
const p = await browser.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));
await p.setContent(page);
await p.waitForFunction(() => document.title.startsWith('{'), null, { timeout: 5000 }).catch(() => {});
let out = {};
try { out = JSON.parse(await p.title()); } catch { /* лишиться порожнім → усе впаде */ }
await browser.close();
if (errors.length) console.log('   ⚠️ помилки сторінки:', errors.slice(0, 2).join(' | '));

ok('«Імʼя Прізвище» ділиться правильно',   out.двоскладове === true);
ok('подвійне прізвище не обрізається',      out.подвійне === true);
ok('одне слово → лише імʼя',                out.односкладове === true);
ok('порожні метадані не ламають екран',     out.порожнє === true);
ok('окремі поля провайдера мають перевагу', out.окреміПоля === true);
ok('дата збирається у формат бази',         out.датаПравильна === true);
ok('🛑 «31 лютого» не доходить до бази',     out.лютий31 === true);
ok('два списки з трьох — не «майже дата»',  out.частково === true);
ok('порожня дата — це нормально',           out.порожняДата === true);
ok('дата з майбутнього відхиляється',       out.майбутнє === true);

const good = res.filter(Boolean).length;
console.log(`\n${good === res.length ? '✅' : '❌'} ${good}/${res.length} перевірок пройдено`);
process.exit(good === res.length ? 0 : 1);
