// Стенд: КАБІНЕТ — ФОТО СТАТТІ МОЖНА ПРИБРАТИ (12.10.2026).
//
// 🗣️ Вова: «Агент написав статтю і вставив фото, я натиснув в адмінці редагувати і
// не можу видалити це фото». Поле «Фото (обкладинка)» вміло лише ЗАМІНИТИ знімок.
// Тепер під прев'ю — «🗑 Прибрати фото» (`артОбкладинка`, admin.html).
//
// 🔑 Міряємо не наявність кнопки, а СТАН чернетки після тапу: саме `d.image` піде в
// базу при збереженні (`read()` → `...d`). Разом із фото мусить зникнути й підпис
// автора знімка, інакше під статтею лишилось би «Фото: …» без фото.
// 🛑 Контроль: стаття БЕЗ фото — кнопки нема (нічого прибирати).
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';

const { ok, done } = reporter('admin-article-photo');
const { url, stop } = await serve();
const b = await launch(chromium);
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })).newPage();
await p.goto(url.replace(/\/$/, '') + '/admin.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);

// Малюємо форму напряму: вхід адміна в пісочниці не пройти (той самий прийом, що admin-agents).
const намалювати = (img) => p.evaluate((img) => {
  document.getElementById('проба')?.remove();
  const el = document.createElement('div'); el.id = 'проба'; document.body.appendChild(el);
  articleDraft = { title: 'Тест', excerpt: '', content: 'Текст', category: '', geo: 'Громада', type: 'news',
    status: 'draft', image: img, image_type: img ? 'source' : 'none', image_credit: img ? 'Фото: архів' : null };
  renderArticleForm(el);
}, img);

await намалювати('https://example.com/scan.jpg');
const до = await p.evaluate(() => ({ кнопка: !!document.querySelector('#af-photo-remove'), фото: !!document.querySelector('#af-preview img') }));
ok('🔴 у статті з фото є кнопка «Прибрати фото»', до.кнопка && до.фото, JSON.stringify(до));

await p.click('#af-photo-remove');
const після = await p.evaluate(() => ({ image: articleDraft.image, type: articleDraft.image_type, credit: articleDraft.image_credit,
  фото: !!document.querySelector('#af-preview img'), кнопка: !!document.querySelector('#af-photo-remove') }));
ok('🔴 після тапу фото знято з чернетки (піде в базу як «без фото»)', після.image === null && після.type === 'none', JSON.stringify(після));
ok('…разом із підписом автора знімка', після.credit === null, JSON.stringify(після));
ok('прев\'ю й кнопка зникли', !після.фото && !після.кнопка, JSON.stringify(після));

await намалювати(null);
const без = await p.evaluate(() => !!document.querySelector('#af-photo-remove'));
ok('🛑 контроль: стаття без фото — кнопки нема', !без, String(без));

await b.close(); await stop();
done();
