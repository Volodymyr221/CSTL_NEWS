// Стенд: ВХІД ПОШТОЮ ОДНОРАЗОВИМ КОДОМ.
//
// 🗣️ ЗАМОВЛЕННЯ ВОВИ (29.08, дослівно): «якщо в людини немає Gmail, вона є якась
// інша пошта, вона може зареєструватись… коротше, ще через Facebook надо добавити
// і через іншу пошту, щоб просто людина могла зайти».
//
// 🔴 ЩО САМЕ СТЕРЕЖЕМО І ЧОМУ САМЕ ЦЕ.
// Вхід поштою тримається на трьох речах, і кожна ламається МОВЧКИ:
//
//   1. `shouldCreateUser: true` — без нього людина без Google отримує «користувача
//      не знайдено» і не має ЖОДНОГО способу завести акаунт. Тобто фіча є, а
//      користі нуль, і жодна помилка про це не скаже.
//   2. `type: 'email'` у звірці коду — з іншим типом код НІКОЛИ не підійде.
//   3. Порядок гілок у `netErrorText`. Supabase на невірний код відповідає
//      дослівно «Token has expired or is invalid» — зі словом `token`. Гілка
//      `/JWT|token|session/` зловила б це першою і сказала людині «Сеанс застарів —
//      увійди знову», тобто порадила б робити рівно те, що вона робить у цю
//      секунду. Це не косметика тексту: людина в цей момент КИДАЄ вхід.
//
// 📐 ТОМУ СТЕНД ВИКОНУЄ КОД, А НЕ ГРЕПАЄ ЙОГО. Регулярка не відрізнила б робочий
// виклик від написаного з помилкою — а саме така помилка й коштувала б Вові
// «кнопка є, а зайти не можу». Беремо СПРАВЖНІЙ `auth.js` і СПРАВЖНІЙ словник
// помилок із `supabase.js`, підсовуємо підроблену базу і дивимось, що вони роблять.
//
// 🔴 КОНТРОЛЬ: BUNDLE_REV=origin/main node tests/auth-email-code.mjs
// На коді до 29.08 перевірки мусять УПАСТИ — способу входу поштою там немає.
import { chromium } from 'playwright';
import { projectFile, launch } from './_lib.mjs';

const REV = process.env.BUNDLE_REV || '';
const res = [];
const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };

const auth = projectFile('src/core/auth.js', REV);
const ui   = projectFile('src/core/account-ui.js', REV);
const supa = projectFile('src/core/supabase.js', REV);

console.log(`\n── ВХІД ПОШТОЮ КОДОМ${REV ? `   (КОНТРОЛЬ на ${REV})` : ''}`);

// ── Частина 1: механізм на місці ────────────────────────────────────────────
ok('auth.js віддає обидва кроки входу поштою',
   /export async function sendEmailCode\(/.test(auth) && /export async function verifyEmailCode\(/.test(auth));
ok('екран входу бере їх із auth.js',
   /import \{[\s\S]{0,400}?sendEmailCode[\s\S]{0,200}?verifyEmailCode[\s\S]{0,200}?\} from '\.\/auth\.js'/.test(ui));
ok('на екрані входу Є кнопка пошти', /data-go="mail"/.test(ui));

// 🔑 Назва кнопки. «Gmail» звучить як «тільки для адрес на gmail.com» і САМА
// відсіювала людей з акаунтом Google на іншому домені — тобто кнопка працювала
// проти власної мети. Стережемо, щоб стара назва не повернулась копіпастом.
//
// 🛑 ДИВИМОСЬ НА КОД БЕЗ КОМЕНТАРІВ, І ЦЕ НЕ ПЕДАНТИЗМ. Перша редакція цієї
// перевірки впала на СПРАВНОМУ коді: у `account-ui.js` стара назва цитується в
// коментарі, який пояснює, чому її замінили. Тобто перевірка карала за те, що
// правку задокументували. У цьому репозиторії коментарі довгі й називають рівно
// те, що поруч написано кодом, — і саме на цьому вже спотикався сторож входу
// (25.08, чотири падіння поспіль через власну прозу).
const uiCode = ui.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok('кнопка названа «Google», а не «Gmail»',
   /Увійти з Google/.test(uiCode) && !/Увійти з Gmail/.test(uiCode));

// 🔑 Дрібниця, яка робить різницю між «сучасно» і «терпимо»: з цим атрибутом iOS
// сам пропонує код із листа над клавіатурою — один тап замість переписування.
ok('поле коду просить у системи код із листа', /autocomplete="one-time-code"/.test(ui));

// 🛑 Посилання з листа для встановленої PWA — пастка: воно відкриється в браузері,
// і сесія ляже НЕ туди, де людина її чекає. Тому головний шлях — код.
ok('головний шлях — код, а не посилання з листа',
   /verifyOtp\(/.test(auth) && /🛑 ЧОМУ КОД, А НЕ ПОСИЛАННЯ/.test(auth));

// ── Частина 1-БІС: ДВІ ВАДИ, ЗНАЙДЕНІ ВОВОЮ НА ЖИВОМУ ТЕЛЕФОНІ 30.08 ────────
//
// 🗣️ «Натиснув, ввів код, і вантажить вже 3 хв». На знімку одночасно: під полем
// «Код невірний або застарів» І кнопка «Перевіряю…» — два стани, які не можуть
// бути правдою разом.
//
// 🔴 Обидві вади ТИХІ: нічого не падає, у консолі порожньо, сервер відповів
// нормально. Побачити їх можна лише ВИКОНАВШИ обидва помічники.
const helpers = (ui.match(/export function singleFlight\([\s\S]*?\n\}/) || [''])[0]
              + '\n' + (ui.match(/export function setBusy\([\s\S]*?\n\}/) || [''])[0];

const scenePage = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<button id="b">Підтвердити</button>
<script type="module">
  ${helpers.replace(/^export /gm, '')}
  const out = {};
  const btn = document.getElementById('b');

  // 1️⃣ Кнопка мусить повернути СВІЙ напис, навіть якщо «зайнято» ставили двічі —
  //    саме так вона й залипала на «Перевіряю…» назавжди.
  setBusy(btn, true, 'Перевіряю…');
  setBusy(btn, true, 'Перевіряю…');      // другий вхід, поки перший ще в роботі
  setBusy(btn, false);
  out.написПовернувся = btn.textContent === 'Підтвердити';
  out.кнопкаЖива      = btn.disabled === false;

  // 2️⃣ Одноразовий код не сміє полетіти на сервер двічі: авто-звірка на шостій
  //    цифрі + тап «Підтвердити» = два виклики, і другий отримує «код невірний»
  //    про код, який щойно спожив перший.
  let викликів = 0;
  const повільна = () => new Promise(r => setTimeout(r, 60));
  const звірка = singleFlight(async () => { викликів++; await повільна(); return 'ok'; });
  const [a1, a2] = await Promise.all([звірка(), звірка()]);   // одночасно, як у житті
  out.лишеОдинВиклик = викликів === 1;
  out.дубльТихий     = a1 === 'ok' && a2 === undefined;

  // 🔑 І захист МУСИТЬ відпускати: після завершення наступна спроба проходить,
  //    інакше людина з першого разу помилилась — і більше не може ввести нічого.
  await звірка();
  out.післяЗавершенняПускає = викликів === 2;

  document.title = JSON.stringify(out);
<\/script></body></html>`;

{
  const browser = await launch(chromium);
  const p = await browser.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.setContent(scenePage);
  await p.waitForFunction(() => document.title.startsWith('{'), null, { timeout: 5000 }).catch(() => {});
  let o = {};
  try { o = JSON.parse(await p.title()); } catch {}
  await browser.close();
  if (errs.length) console.log('   ⚠️', errs.slice(0, 1).join(' | '));
  ok('🔴 кнопка повертає СВІЙ напис після двох «зайнято»', o.написПовернувся === true);
  ok('кнопка знову активна',                                o.кнопкаЖива === true);
  ok('🔴 одноразовий код летить на сервер РІВНО раз',        o.лишеОдинВиклик === true);
  ok('дубль відкидається тихо, без другої помилки',         o.дубльТихий === true);
  ok('після завершення наступна спроба проходить',          o.післяЗавершенняПускає === true);
}

// 🛑 І перевірка, що захист справді накладений на ВСІ три мережеві дії екрана:
// саме «десь забули» і є спосіб, яким ця вада повернеться.
for (const [назва, re] of [
  ['звірка коду',        /const doCheck = singleFlight\(/],
  ['надсилання коду',    /const doSend = singleFlight\(/],
  ['надіслати ще раз',   /resend\.addEventListener\('click', singleFlight\(/],
]) ok(`захист від дубля: ${назва}`, re.test(uiCode));

// ── Частина 2: код ВИКОНУЄТЬСЯ і робить те, що обіцяє ───────────────────────
// Вирізаємо імпорти і робимо модуль інлайновим — той самий прийом, що вже
// використовує `feed-auth-race.mjs` для гарантії «хто я».
const authInline = auth.replace(/^import .*$/gm, '').replace(/^export /gm, '');
// Словник помилок беремо ЖИВИЙ із supabase.js — саме його порядок гілок ми й
// перевіряємо. Підробити його тут означало б перевіряти власну копію.
const dict = (supa.match(/export function netErrorText\(err\)[\s\S]*?\n\}/) || [''])[0].replace(/^export /, '');

const page = `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module">
  const showToast = () => {};
  const sdkLoaded = () => true;
  const netCall = async () => ({ ok: true });
  const releasePushDevice = async () => {};
  const setAnalyticsUid = () => {};
  const isTransientError = () => false;
  ${dict}

  // Підроблена база: НЕ робить нічого, лише записує, з чим її покликали.
  const calls = [];
  const getSupabase = () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => {},
      signInWithOtp: async (a) => { calls.push(['otp', a]); return { error: null }; },
      // Підробка поводиться як справжній Supabase у випадку Вови: код лежить
      // під типом magiclink (акаунт уже існує), а на email сервер чесно каже
      // «не знайшов». Саме на цьому вхід і не працював.
      // (Зворотні лапки тут заборонені — увесь блок живе в шаблонному рядку.)
      verifyOtp: async (a) => {
        calls.push(['verify', a]);
        if (a.type === 'magiclink') return { error: null };
        return { error: { message: 'Token has expired or is invalid' } };
      },
    },
  });
  ${authInline}

  const out = {};
  // 1. Крива адреса не летить у мережу взагалі.
  const bad = await sendEmailCode('без-собаки');
  out.кривуНеШле = calls.length === 0 && bad.ok === false;

  // 2. Адреса нормалізується: інакше «Ivan@Mail.COM» і «ivan@mail.com» — два акаунти.
  await sendEmailCode('  Ivan@Mail.COM ');
  out.нормалізує = calls[0] && calls[0][1].email === 'ivan@mail.com';

  // 3. 🔴 Без цього людина без Google не може завести акаунт ніяк.
  out.створюєНового = !!(calls[0] && calls[0][1].options && calls[0][1].options.shouldCreateUser === true);

  // 4. Короткий код не летить у мережу (і людина одразу бачить, чому).
  const short = await verifyEmailCode('ivan@mail.com', '123');
  out.короткийНеШле = calls.filter(c => c[0] === 'verify').length === 0 && short.ok === false;

  // 5. Код чиститься від пробілів (їх лишає вставка з листа) і йде з типом 'email'.
  await verifyEmailCode('ivan@mail.com', ' 12 34 56 ');
  const v = calls.find(c => c[0] === 'verify');
  const verifies = calls.filter(c => c[0] === 'verify').map(c => c[1]);
  out.чиститьКод = !!(v && v[1].token === '123456');
  out.типEmail   = !!(v && v[1].type === 'email');       // перша спроба — саме email
  // ГОЛОВНЕ: код, який лежить під magiclink, МУСИТЬ підійти. Так поводиться
  // акаунт, що вже існує (у Вови — через Google), тобто більшість входів.
  out.типиПеребрані = verifies.map(x => x.type).join('>');
  out.існуючийЗайшов = out.чиститьКод && verifies.some(x => x.type === 'magiclink');


  // 6. 🔴 ГОЛОВНА ПЕРЕВІРКА КЛАСУ: помилка про КОД не сміє говорити про СЕАНС.
  out.кодНеПроСеанс = netErrorText({ message: 'Token has expired or is invalid' }) !== 'Сеанс застарів — увійди знову';
  out.кодПроКод     = /код/i.test(netErrorText({ code: 'otp_expired', message: 'x' }));
  out.лімітПроЧас   = /хвилин/i.test(netErrorText({ message: 'For security purposes, you can only request this after 41 seconds' }));
  // 🛑 І контроль на саму пастку: стара гілка мусить лишитись робочою для СПРАВЖНЬОГО
  // протермінованого сеансу — інакше ми полагодили б одне, зламавши сусіднє.
  out.сеансЩеПроСеанс = netErrorText({ message: 'JWT expired' }) === 'Сеанс застарів — увійди знову';

  document.title = JSON.stringify(out);
<\/script></body></html>`;

const browser = await launch(chromium);
const p = await browser.newPage();
const errors = [];
p.on('pageerror', e => errors.push(e.message));
await p.setContent(page);
await p.waitForFunction(() => document.title.startsWith('{'), null, { timeout: 5000 })
       .catch(() => {});
let out = {};
try { out = JSON.parse(await p.title()); } catch { /* лишиться порожнім → усе впаде */ }
await browser.close();

if (errors.length) console.log('   ⚠️ помилки сторінки:', errors.slice(0, 2).join(' | '));

ok('криву адресу НЕ шле в мережу',            out.кривуНеШле === true);
ok('адресу нормалізує (пробіли + регістр)',    out.нормалізує === true);
ok('🔴 заводить НОВОГО жителя (shouldCreateUser)', out.створюєНового === true);
ok('короткий код НЕ шле в мережу',             out.короткийНеШле === true);
ok('код чистить від пробілів',                 out.чиститьКод === true);
ok('перша спроба — тип email',                 out.типEmail === true);
ok('🔴 код існуючого акаунта (magiclink) ПІДХОДИТЬ', out.існуючийЗайшов === true,
   `спроби: ${out.типиПеребрані}`);
ok('🔴 помилка про КОД не каже «сеанс застарів»', out.кодНеПроСеанс === true);
ok('помилка про код говорить про код',         out.кодПроКод === true);
ok('ліміт надсилання говорить про час',        out.лімітПроЧас === true);
ok('справжній протермінований сеанс — як був',  out.сеансЩеПроСеанс === true);

const good = res.filter(Boolean).length;
console.log(`\n${good === res.length ? '✅' : '❌'} ${good}/${res.length} перевірок пройдено`);
process.exit(good === res.length ? 0 : 1);
