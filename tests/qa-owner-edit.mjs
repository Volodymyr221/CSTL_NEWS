// tests/qa-owner-edit.mjs — АВТОР РЕДАГУЄ Й ВИДАЛЯЄ СВОЄ ПИТАННЯ, 25.08.2026.
//
// 🔴 ЗАМОВЛЕННЯ ВОВИ: «Коли користувач написав питання, він його не може ні
// редагувати, ні видалити. Крім, може видалити тільки адмін з адмінки. Це
// потрібно виправити. Виправити технічно правильно.»
//
// 📐 ЗАМІРЯНО ПЕРЕД РОБОТОЮ, обидва рівні — це була не діра, а стан за
// замовчуванням:
//   • клієнт: у `posts` жодного `update`/`delete` у всьому застосунку;
//   • база: рівно дві політики запису, обидві `is_admin()`.
//
// 🔑 РІШЕННЯ ВОВИ 25.08 (їх два, і вони визначають, ЩО тут перевіряється):
//   • видалити можна ЗАВЖДИ, разом із відповідями;
//   • редагувати можна ЗАВЖДИ, з міткою «змінено».
//
// 🛑 ЩО ЦЕЙ СТЕНД ДОВОДИТЬ, А ЩО НІ. Він доводить, що КЛІЄНТ поводиться
// правильно: показує дії лише авторові, не дає порожнього тексту, малює мітку,
// прибирає видалене з екрана. Він НЕ доводить, що база відмовить зловмисникові
// — заглушка лише ПОВТОРЮЄ серверні відповіді, а не є сервером.
// ➡️ Серверна половина доведена окремо, транзакціями з відкотом на живій базі;
// числа й кроки — у кінці `scripts/supabase_question_owner_edit.sql`.
// Це та сама пара шарів, що в антиспамі: клієнт стримує, база вирішує.
//
// 🔴 КОНТРОЛЬ: BUNDLE_REV=origin/main node tests/qa-owner-edit.mjs
//    → падає: до 25.08 кнопки «⋯» не існувало взагалі.

import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const BUNDLE_REV = process.env.BUNDLE_REV || '';

const t0 = Date.now() - 3 * 864e5;
const пост = (id, owner, text) => ({
  id, type: 'chat', text, title: null, author: owner === 'u-me' ? 'Я' : 'Петро',
  owner_uid: owner, status: 'published', location: null, tags: [],
  ts: t0, created_at: new Date(t0).toISOString(), published_at: new Date(t0).toISOString(),
  edited_at: null, deleted_at: null,
});
const POSTS = [
  пост(801, 'u-me',    'Моє питання — його можна правити'),
  пост(802, 'u-petro', 'Чуже питання — руки геть'),
];
const COMMENTS = [
  { id: 9101, post_id: 801, author: 'Віктор', text: 'Перша відповідь', sender_uid: 'u-viktor',
    reply_to_id: null, created_at: new Date(t0 + 36e5).toISOString(), edited_at: null, deleted_at: null, client_tag: null },
  { id: 9102, post_id: 801, author: 'Олена', text: 'Друга відповідь', sender_uid: 'u-olena',
    reply_to_id: null, created_at: new Date(t0 + 40e5).toISOString(), edited_at: null, deleted_at: null, client_tag: null },
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
if (BUNDLE_REV) {
  const old = projectFile('bundle.js', BUNDLE_REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
}
await mockSupabase(p, { posts: POSTS, comments: COMMENTS, announcements: [],
                        reactions: [], saved_posts: [] },
                  { user: { id: 'u-me', name: 'Я' } });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(300);
await p.evaluate(() => window.switchTab && window.switchTab('discussions'));
await p.waitForTimeout(1500);

const відкрити = async (id) => {
  await p.evaluate((i) => document.querySelector(`.qa-row[data-post-id="${i}"]`)?.click(), id);
  await p.waitForTimeout(900);
};
const закрити = async () => {
  await p.evaluate(() => document.querySelector('.qa-screen .qa-back')?.click());
  await p.waitForTimeout(900);
};

console.log('\n── 1. Дії видно лише авторові ──');
await відкрити(801);
const своє = await p.evaluate(() => !!document.querySelector('[data-question-actions]'));
ok('1а. на СВОЄМУ питанні кнопка «⋯» є', своє);
await закрити();

await відкрити(802);
const чуже = await p.evaluate(() => !!document.querySelector('[data-question-actions]'));
// 🛑 Це не захист, а ввічливість: сервер відмовить у будь-якому разі. Але
// показати дію, якої немає, — це обіцянка, яку застосунок не виконає.
ok('1б. на ЧУЖОМУ кнопки немає', чуже === false);
await закрити();

console.log('\n── 2. Редагування ──');
await відкрити(801);
await p.evaluate(() => document.querySelector('[data-question-actions]')?.click());
await p.waitForTimeout(400);
const меню = await p.evaluate(() => [...document.querySelectorAll('.pm-actions [data-act]')].map(b => b.dataset.act));
ok('2а. в аркуші є «Редагувати» і «Видалити»',
   меню.includes('edit') && меню.includes('delete'), меню.join(','));

await p.evaluate(() => [...document.querySelectorAll('.pm-actions [data-act]')].find(b => b.dataset.act === 'edit')?.click());
await p.waitForTimeout(600);
const заповнено = await p.evaluate(() => document.querySelector('#disc-edit-text')?.value || '');
// 🔑 Порожня форма змусила б людину набирати питання заново — це не
// «редагування», а «напишіть ще раз».
ok('2б. поле відкрилось УЖЕ З ТЕКСТОМ питання', заповнено === 'Моє питання — його можна правити',
   `«${заповнено}»`);

// Порожній текст не зберігається. Перевіряємо ДО успішного шляху: якби
// збереження вже пройшло, сцена міряла б інший стан.
await p.evaluate(() => {
  const ta = document.querySelector('#disc-edit-text');
  if (ta) { ta.value = '   '; }
  document.querySelector('#disc-edit-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
});
await p.waitForTimeout(500);
const формаЖива = await p.evaluate(() => !!document.querySelector('#disc-edit-text'));
ok('2в. порожній текст НЕ зберігається — форма лишається відкритою', формаЖива);

await p.evaluate(() => {
  const ta = document.querySelector('#disc-edit-text');
  if (ta) ta.value = 'Виправлене питання';
  document.querySelector('#disc-edit-form')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
});
await p.waitForTimeout(900);
const наЕкрані = await p.evaluate(() => document.querySelector('.qa-question-text')?.textContent || '');
ok('2г. 🔴 текст на ВІДКРИТОМУ екрані оновився одразу', наЕкрані === 'Виправлене питання',
   `«${наЕкрані}»`);
const міткаЕкран = await p.evaluate(() => !!document.querySelector('.qa-question-by .qa-edited'));
ok('2д. поруч зʼявилась мітка «змінено»', міткаЕкран);

await закрити();
await p.waitForTimeout(900);
const картка = await p.evaluate(() => {
  const el = document.querySelector('.qa-row[data-post-id="801"]');
  return { текст: el?.querySelector('.qa-card-q')?.textContent || '', мітка: !!el?.querySelector('.qa-edited') };
});
ok('2е. у списку теж новий текст', картка.текст === 'Виправлене питання', `«${картка.текст}»`);
// 🔑 Саме мітка й робить вільне редагування безпечним: підмінити питання
// непомітно після відповідей не вийде. Без неї довелось би забороняти правку.
ok('2є. 🔴 і мітка «змінено» — на картці теж', картка.мітка);

console.log('\n── 3. Видалення ──');
await відкрити(801);
await p.evaluate(() => document.querySelector('[data-question-actions]')?.click());
await p.waitForTimeout(400);
await p.evaluate(() => [...document.querySelectorAll('.pm-actions [data-act]')].find(b => b.dataset.act === 'delete')?.click());
await p.waitForTimeout(400);

const попередження = await p.evaluate(() => document.querySelector('.pm-actions-note')?.textContent || '');
// 🛑 Один тап стирає роботу кількох сусідів — людина мусить знати це ДО тапу.
// «Ви впевнені?» не зупиняє; «разом із 2 відповідями» зупиняє.
ok('3а. 🔴 підтвердження називає ЧИСЛО відповідей, а не «ви впевнені?»',
   /2\s+відповід/.test(попередження), `«${попередження}»`);

await p.evaluate(() => [...document.querySelectorAll('.pm-actions [data-act]')].find(b => b.dataset.act === 'yes')?.click());
await p.waitForTimeout(1500);

const післяВидалення = await p.evaluate(() => ({
  екран:  !!document.querySelector('.qa-screen'),
  картка: !!document.querySelector('.qa-row[data-post-id="801"]'),
  чуже:   !!document.querySelector('.qa-row[data-post-id="802"]'),
}));
ok('3б. екран питання закрився сам', післяВидалення.екран === false);
ok('3в. 🔴 картка зникла зі списку', післяВидалення.картка === false);
// Контроль усередині сцени: якби зник ВЕСЬ список, перевірка 3в була б зеленою
// над «нічого не малюється» — тобто не доводила б нічого.
ok('3г. …а чуже питання лишилось на місці', післяВидалення.чуже === true);

await ctx.close(); await b.close(); await stop();
done();
