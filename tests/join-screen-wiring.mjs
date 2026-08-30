// Стенд: ЕКРАН ВХОДУ СПРАВДІ ЗІБРАНИЙ — КНОПКИ ЖИВІ.
//
// 🗣️ ВОВА, 30.08: «не натискається кнопка "Надіслати код" та "Інший спосіб"».
//
// 🔴 ЧОМУ ЦЕЙ СТЕНД ЗАВЕДЕНО І ЧОМУ РЕШТА ЙОГО НЕ ЗАМІНЯЄ.
// Того дня екран входу ламався ДВІЧІ, і обидва рази — тихо:
//
//   1. Звірка коду йшла двічі й спалювала одноразовий код людини;
//   2. `const doSend` опинився НИЖЧЕ за рядок, який вішає його на кнопку.
//      `const` до свого рядка не існує, тож рядок кидав помилку, `stepEmail()`
//      обривався на ньому — і НІЧОГО нижче не підключалось. Мертвими ставали
//      відразу дві кнопки.
//
// 🛑 ГОЛОВНИЙ УРОК: усі наявні сторожі міряли ПОМІЧНИКИ ОКРЕМО (`singleFlight`,
// `setBusy`, `birthDateFrom`) — і кожен був зелений, поки екран не відкривався
// зовсім. Помічник може бути ідеальним, а екран — не зібраним.
// ➡️ Тому цей стенд не перевіряє жодної функції окремо. Він БУДУЄ картку входу
// справжнім кодом `account-ui.js` і ТИСНЕ кнопки, як палець.
//
// ⚠️ `node scripts/check-syntax.mjs` цього НЕ ловить: код синтаксично бездоганний.
// Помилка живе в ПОРЯДКУ виконання, і видно її лише коли екран будується.
//
// 🔴 КОНТРОЛЬ: BUNDLE_REV=<коміт із вадою> node tests/join-screen-wiring.mjs
import { chromium } from 'playwright';
import { projectFile, launch } from './_lib.mjs';

const REV = process.env.BUNDLE_REV || '';
const res = [];
const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };

const ui   = projectFile('src/core/account-ui.js', REV);
const auth = projectFile('src/core/auth.js', REV);
// Справжні перевірки адреси — щоб стенд не мав власної, добрішої копії.
// 🔴 30.08 — ДОВЖИНУ КОДУ СТЕНД БЕРЕ З КОДУ, А НЕ ЗНАЄ НАПАМʼЯТЬ.
// Вада, яку знайшов Вова: у листі приходило ВІСІМ цифр, а поле стояло
// `maxlength="6"` і мовчки відрізало решту — на сервер летіли перші шість.
// Код був правильний завжди, застосунок сам його калічив.
// 🛑 Якби стенд тримав власну шістку, він лишався б зеленим над цією вадою
// назавжди — і саме так вада прожила чотири кола розслідування.
const OTP_LEN  = Number((auth.match(/export const OTP_LENGTH = (\d+)/) || [])[1] || 0);
const OTP_MAXV = Number((auth.match(/export const OTP_MAX = (\d+)/) || [])[1] || 0);
// 🔴 30.08 — ПОЛЕ НЕ СМІЄ ОБРІЗАТИ ВВЕДЕНЕ. Саме обрізання й було коренем: у листі
// приходило вісім цифр, поле брало шість, і на сервер летів огризок. Стеля мусить
// бути ВИЩОЮ за очікувану довжину — тоді розбіг налаштувань нікого не замикає.
ok('стеля поля вища за довжину коду', OTP_MAXV > OTP_LEN, `${OTP_LEN} цифр, стеля ${OTP_MAXV}`);
ok('довжина коду названа однією константою', OTP_LEN >= 4 && OTP_LEN <= 10, `OTP_LENGTH = ${OTP_LEN}`);
// 🔑 І жодного місця, де довжина прибита цвяхами повз константу.
{
  const uiOnly = ui.replace(/^\s*\/\/.*$/gm, '');
  ok('поле коду не тримає власної довжини',
     !/maxlength="\d/.test(uiOnly) && !/slice\(0, \d\)/.test(uiOnly));
  // 🔑 І зріз іде по СТЕЛІ, а не по очікуваній довжині — інакше поле знову різало б.
  ok('зріз по стелі, а не по довжині коду',
     !/slice\(0, OTP_LENGTH\)/.test(uiOnly) && /slice\(0, OTP_MAX\)/.test(uiOnly));
}

const emailHelpers = ['normalizeEmail', 'isValidEmail']
  .map(n => (auth.match(new RegExp('export function ' + n + '\\([\\s\\S]*?\\n\\}')) || [''])[0].replace(/^export /, ''))
  .join('\n')
  // `EMAIL_RE` живе поза цими функціями — беремо його теж, інакше стенд упаде
  // на першій же перевірці адреси.
  + '\n' + (auth.match(/^const EMAIL_RE = .*$/m) || [''])[0];

console.log(`\n── ЕКРАН ВХОДУ ЗІБРАНИЙ${REV ? `   (КОНТРОЛЬ на ${REV})` : ''}`);

// ⚠️ Імпорти в цьому файлі БАГАТОРЯДКОВІ. Знімати їх порядково (`^import .*$`)
// не можна: лишаються голі імена зі списку, і сцена падає на них, а не на
// застосунку. Тому вирізаємо весь оператор — від `import` до `from '…';`.
const inline = ui
  .replace(/^import[\s\S]*?from\s+'[^']+';\s*$/gm, '')
  .replace(/^export /gm, '');

const page = `<!doctype html><html><head><meta charset="utf-8"></head><body><script type="module">
  const журнал = { надіслано: [], звірено: [], помилки: [] };
  window.onerror = (m) => { журнал.помилки.push(String(m)); };

  // ── Заглушки всього, що екран входу імпортує ──
  const ICONS = new Proxy({}, { get: () => '<svg></svg>' });
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const showToast = () => {};
  const netErrorText = (e) => String(e || 'помилка');
  const analyticsEnabled = () => true, setAnalyticsEnabled = () => {};
  const deleteMyAccount = async () => ({});
  const fetchNotifPrefs = async () => ({}), saveNotifPref = async () => {}, seedNotifPrefs = async () => {};
  const NOTIF_TOPICS = [];
  const openLayer = () => {}, closeLayer = () => {};
  const openThreadsList = () => {}, openMyAds = () => {}, openSavedHub = () => {};
  const SETTLEMENTS = [], OTHER_SETTLEMENT = 'Інше';
  const avatarCircle = () => '', uploadAvatarPair = async () => ({});
  // 🔴 Підміняємо «хто я» так, щоб можна було ПЕРЕМИКАТИ людей — саме на перемиканні
  // анкета новачка й зникала: прапорець «уже питали» був один на весь запуск.
  let _хто = null, _профілі = {};
  const isLoggedIn = () => !!_хто, currentUser = () => _хто;
  let _слухач = () => {};
  const onAuthChange = (cb) => { _слухач = cb; };
  const currentAvatarUrl = () => '';
  const getProfile = async () => (_хто ? (_профілі[_хто.id] || null) : null);
  const saveProfile = async () => ({ ok: true });
  window.__увійти = async (id, маєПрофіль) => {
    _хто = { id, email: id + '@x.z', user_metadata: {} };
    if (маєПрофіль) _профілі[id] = { name: 'Хтось' };
    await _слухач(_хто);
  };
  window.__вийти = async () => { _хто = null; await _слухач(null); };
  const signOut = async () => {}, signInWithGoogle = () => {}, signInWithFacebook = () => {};
  const FACEBOOK_ENABLED = false;
  const OTP_LENGTH = ${OTP_LEN};        // справжнє значення з auth.js, не вигадане
  const OTP_MAX = ${OTP_MAXV};
  const loginMethods = () => ({ google: true, facebook: false, email: true, address: 'x@y.z' });
  const addEmailLogin = async () => ({ ok: true }), confirmEmailLogin = async () => ({ ok: true });
  ${emailHelpers}

  // Ці дві — те, заради чого стенд існує: міряємо, чи ДІЙШОВ до них тап.
  const sendEmailCode   = async (addr) => { журнал.надіслано.push(addr); return { ok: true }; };
  // 🔑 Звірка навмисно ВІДМОВЛЯЄ: при вдалій картка правильно закривається, і
  // кнопки «Змінити пошту» / «Інший спосіб» перевіряти було б уже ні на чому.
  // Саме ці дві й померли 30.08, тож сцена мусить лишити екран відкритим.
  const verifyEmailCode = async (addr, code) => {
    журнал.звірено.push(code);
    return { ok: false, error: 'код невірний' };
  };

  // Найпростіша модалка з тим самим контрактом, що й справжня: тіло + close.
  let closed = 0;
  const openModalPrimitive = ({ bodyHtml = '' }) => {
    const wrap = document.createElement('div');
    wrap.className = 'app-modal';
    wrap.innerHTML = '<div class="app-modal-body">' + bodyHtml + '</div>';
    document.body.appendChild(wrap);
    return { el: wrap, close: () => { closed++; wrap.remove(); } };
  };
  const closeModalPrimitive = () => {};

  ${inline}

  const тап = (sel) => { const b = document.querySelector(sel); if (b) b.click(); return !!b; };
  const пауза = () => new Promise(r => setTimeout(r, 30));
  const out = {};
  try {
    initAccountUI();
    document.dispatchEvent(new CustomEvent('cstl-need-login', { detail: {} }));
    await пауза();
    out.карткаВідкрилась = !!document.querySelector('.app-modal-body .acc-google');

    // 1. Перехід на крок пошти.
    out.кнопкаПоштиЄ = тап('[data-go="mail"]');
    await пауза();
    out.крокПошти = !!document.querySelector('[data-f="email"]');

    // 2. 🔴 ГОЛОВНЕ: тап по «Надіслати код» доходить до мережі.
    const поле = document.querySelector('[data-f="email"]');
    if (поле) { поле.value = 'test@example.com'; }
    тап('[data-go="send"]');
    await пауза();
    out.надіслалиКод = журнал.надіслано.join(',');

    // 3. Після надсилання екран показує крок коду.
    out.крокКоду = !!document.querySelector('[data-f="code"]');

    // 4. Авто-звірка на шостій цифрі — і РІВНО один виклик.
    const поле2 = document.querySelector('[data-f="code"]');
    if (поле2) {
      // 🔴 Вводимо код ДОВШИЙ за очікуваний — рівно випадок Вови (у листі 8, чекали 6).
      поле2.value = '${'1'.repeat(OTP_LEN + 2)}';
      поле2.dispatchEvent(new Event('input', { bubbles: true }));
      тап('[data-go="check"]');            // палець тисне ще й кнопку
    }
    await пауза();
    await new Promise(r => setTimeout(r, 450));   // чекаємо паузу автозвірки
    out.звірок = журнал.звірено.length;
    out.кодЦілий = журнал.звірено[0] === '${'1'.repeat(OTP_LEN + 2)}';
    out.помилкаПідПолем = (document.querySelector('.acc-err')?.textContent || '').length > 0;

    // 5. «Змінити пошту» жива.
    out.назадДоПошти = тап('[data-go="edit"]');
    await пауза();
    out.повернулисьНаПошту = !!document.querySelector('[data-f="email"]');

    // 6. І «Інший спосіб» — та сама кнопка, що померла разом із «Надіслати код».
    тап('[data-go="back"]');
    await пауза();
    out.іншийСпосіб = !!document.querySelector('.acc-google');

    // 6-БІС. 🔴 АНКЕТА НОВАЧКА ПРИ ПЕРЕМИКАННІ АКАУНТА (вада 30.08).
    // Вова зайшов Google (анкети не треба — профіль є), вийшов, зайшов НОВОЮ
    // поштою — і анкета не відкрилась, бо прапорець «уже питали» стояв на весь
    // запуск. Імʼя лишилось «Житель»: вхід поштою метаданих імені не дає.
    document.querySelectorAll('.app-modal').forEach(m => m.remove());
    await window.__увійти('стара-людина', true);    // профіль Є — анкети бути не має
    await new Promise(r => setTimeout(r, 60));
    out.анкетаДляСтарого = !!document.querySelector('#acc-name');

    await window.__вийти();
    document.querySelectorAll('.app-modal').forEach(m => m.remove());
    await window.__увійти('новий-житель', false);   // профілю НЕМА — анкета мусить бути
    await new Promise(r => setTimeout(r, 60));
    out.анкетаДляНового = !!document.querySelector('#acc-name');

  } catch (e) {
    журнал.помилки.push(String(e && e.message || e));
  }
  out.помилки = журнал.помилки.slice(0, 2).join(' | ');
  document.title = JSON.stringify(out);
<\/script></body></html>`;

const browser = await launch(chromium);
const p = await browser.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.setContent(page);
await p.waitForFunction(() => document.title.startsWith('{'), null, { timeout: 8000 }).catch(() => {});
let out = {};
try { out = JSON.parse(await p.title()); } catch {}
await browser.close();
if (errs.length) console.log('   ⚠️ помилки сторінки:', errs.slice(0, 2).join(' | '));
if (out.помилки) console.log('   ⚠️ у сцені:', out.помилки);

ok('картка входу відкривається',                 out.карткаВідкрилась === true);
ok('кнопка «Увійти поштою» на місці',            out.кнопкаПоштиЄ === true);
ok('тап веде на крок з адресою',                 out.крокПошти === true);
ok('🔴 «Надіслати код» ДОХОДИТЬ до мережі',       out.надіслалиКод === 'test@example.com', `надіслано: «${out.надіслалиКод}»`);
ok('після надсилання видно крок коду',           out.крокКоду === true);
ok('🔴 звірка йде РІВНО раз (авто + тап)',        out.звірок === 1, `звірок: ${out.звірок}`);
ok('🔴 довший код доходить ЦІЛИМ, не обрізаним',  out.кодЦілий === true, `надіслано: «${(out.кодЦілий ? 'цілий' : 'обрізаний')}»`);
ok('невдалий код показує помилку під полем',      out.помилкаПідПолем === true);
ok('«Змінити пошту» жива',                       out.назадДоПошти === true);
ok('повертає на крок з адресою',                 out.повернулисьНаПошту === true);
ok('у того, хто вже має профіль, анкети НЕМА', out.анкетаДляСтарого === false);
ok('🔴 новому жителю анкета ВІДКРИВАЄТЬСЯ навіть після зміни акаунта',
   out.анкетаДляНового === true);
ok('🔴 «Інший спосіб» жива',                      out.іншийСпосіб === true);
ok('екран будується без помилок',                !out.помилки, out.помилки || 'помилок немає');

const good = res.filter(Boolean).length;
console.log(`\n${good === res.length ? '✅' : '❌'} ${good}/${res.length} перевірок пройдено`);
process.exit(good === res.length ? 0 : 1);
