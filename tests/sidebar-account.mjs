// Стенд: ПУНКТ БУРГЕР-МЕНЮ «ОСОБИСТИЙ КАБІНЕТ» СПРАВДІ ВІДКРИВАЄ КАБІНЕТ (B-31).
//
// 🔴 ЩО ЗЛАМАЛОСЬ І ЧОМУ БЕЗЗВУЧНО (знайдено аудитом `apple-design` 09.08).
// `src/core/sidebar.js` у гілці `kind === 'account'` клікав
// `document.getElementById('account-btn')`. Кнопки з таким id у застосунку вже
// немає — вона переїхала до привітання на Громаді й позначається атрибутом
// `[data-account-btn]`. `?.click()` на `null` не робить нічого і НЕ кидає
// помилку, тож пункт меню був мертвий тихо: ні екрана, ні тосту, ні червоного
// рядка в консолі. Саме тому баг прожив непоміченим.
//
// 🔑 ЯК ВІН УЗАГАЛІ ЗНАЙШОВСЯ — і чому цей стенд міряє САМЕ ПОВЕДІНКУ.
// Прилад аудиту заміряв екран «Особистий кабінет» і видав числа ОДИН-В-ОДИН з
// вкладкою Громада (78 тап-цілей, 130 матеріалів, 32 текстові вузли). Не «мало»
// і не «дивно» — а точнісінько ті самі. Це й виказало, що екран не відкривався
// зовсім. Перевірка, яка дивилась би на ТЕКСТ коду («чи є гілка account»),
// сказала б «усе гаразд» і до, і після поломки — рівно знахідка A-1 аудиту
// Дошки: сторожі стерегли вигляд, а не поведінку.
//
// ⚠️ `serviceWorkers: 'block'` — інакше запити йдуть через `sw.js` повз
// `page.route` (восьмий випадок брехливої перевірки в цьому проєкті).
//
// 🔴 КОНТРОЛЬ (обовʼязковий, інакше стенд нічого не доводить):
//     BUNDLE_REV=origin/main node tests/sidebar-account.mjs
// підсовує сторінці `bundle.js` ДО фіксу. Перевірка «кабінет відкрився з меню»
// мусить УПАСТИ, а «кабінет відкривається кнопкою» — лишитись зеленою: разом
// вони й доводять, що зламаний був саме шлях через меню, а не кабінет узагалі.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Вова' } };

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();
await mockSupabase(p,
  { posts: [], threads: [], messages: [], thread_user_state: [], announcements: [] },
  { user: ME, profiles: [{ uid: 'u-me', name: 'Вова', avatar_url: '' }] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
if (REV) {
  const body = projectFile('bundle.js', REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
}

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1800);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(400);

// Кабінет — це шар `#acc-cab` (`core/account-ui.js`). Міряємо його наявність,
// а не «щось змінилось на екрані».
const кабінетВідкритий = () => p.evaluate(() => !!document.getElementById('acc-cab'));
const закритиКабінет = async () => {
  await p.evaluate(() => document.querySelector('#acc-cab [data-cab-close], #acc-cab .acc-cab-close')?.click());
  await p.waitForTimeout(600);
  await p.evaluate(() => document.getElementById('acc-cab')?.remove());
  await p.waitForTimeout(200);
};

// ── Передумова: людина залогінена, інакше відкриється екран входу, а не кабінет ─
ok('передумова: житель залогінений',
   await p.evaluate(() => !!document.querySelector('.account-btn--in')));

// ── ГОЛОВНЕ: шлях через бургер-меню ─────────────────────────────────────────
await p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
await p.waitForTimeout(600);
ok('бургер-меню відкрилось і пункт «Особистий кабінет» у ньому є',
   await p.evaluate(() => !!document.querySelector('[data-nav="account"]')));

await p.evaluate(() => document.querySelector('[data-nav="account"]')?.click());
await p.waitForTimeout(1600);
const зМеню = await кабінетВідкритий();
ok('🔴 B-31: тап по пункту меню «Особистий кабінет» ВІДКРИВАЄ кабінет',
   зМеню, зМеню ? '#acc-cab на екрані' : 'нічого не сталось');

await закритиКабінет();

// ── Другий шлях мусить лишитись цілим (не зламали, поки лагодили перший) ────
await p.evaluate(() => document.querySelector('[data-account-btn]')?.click());
await p.waitForTimeout(1600);
const зКнопки = await кабінетВідкритий();
ok('кнопка біля привітання теж відкриває кабінет (регресу немає)',
   зКнопки, зКнопки ? '#acc-cab на екрані' : 'нічого не сталось');

// ── Сторож самої причини: id, якого вже немає, не має вернутись у код ───────
// Не «текст коду заради тексту»: саме звертання до неіснуючого id і було коренем,
// а мовчазність `?.click()` на `null` робить повторну поломку невидимою.
ok('у застосунку немає елемента з мертвим id `account-btn`',
   await p.evaluate(() => !document.getElementById('account-btn')));

await ctx.close(); await b.close(); await stop();
done();
