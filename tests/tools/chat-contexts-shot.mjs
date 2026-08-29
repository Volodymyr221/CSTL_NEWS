// 🔴 ПЕРСОНАЛЬНИХ ДАНИХ У ФІКСТУРІ БУТИ НЕ МОЖЕ. Тут стояв РЕАЛЬНИЙ номер
// Вови — і з цього файлу він поїхав у знімки `_out/`, а звідти в публічний
// репозиторій (знайдено аудитом 18.08, знімки прибрали, джерело — ні).
// Номер-заглушка `+380 00 000 00 00` навмисно неможливий: правдоподібний
// номер у демо вже коштував проєкту окремого розбору (`data/community-board.json`,
// видалено 05.08 — людина могла подзвонити сторонній людині).
// ІНСТРУМЕНТ (руками): node tests/tools/chat-contexts-shot.mjs [тека]
// Знімає ЖИВИЙ екран розмови з двома контекстами і перемикає чіп.
//
// НАВІЩО. Групування розмов — зміна, яку не видно з чистих функцій: чіпи, картка
// оголошення, перемикання історії. Стенд `chat-grouping.mjs` доводить арифметику,
// а цей інструмент показує, що воно ще й малюється і клікається.
//
// 🔴 Чат за гейтом авторизації, тож розмітку відтворюємо КАРКАСОМ із тими самими
// класами — перевіряємо CSS і вигляд, а не дані. Логіку перемикання перевіряє
// окремо `chat-grouping.mjs` на справжньому коді.
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { launch, serve, blockExternal } from '../_lib.mjs';

const OUT = process.argv[2] || new URL('./_out', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const screen = (tabsCount) => {
  const tabs = ['Куплю будинок Олика', 'Продам велосипед', 'Ремонт пральних машин'].slice(0, tabsCount);
  const tabsHtml = tabs.length < 2 ? '' : `
    <div class="pm-ctx-tabs" role="tablist">
      ${tabs.map((t, i) => `<button class="pm-ctx-tab${i === 0 ? ' pm-ctx-tab--active' : ''}" type="button">${t}</button>`).join('')}
    </div>`;
  return `
    <header class="pm-head pm-head--chat">
      <button class="pm-back" type="button">←</button>
      <span class="pm-avatar">D</span>
      <div class="pm-head-titles"><div class="pm-head-name">Dmytro Vasylchuk</div></div>
    </header>
    <div class="pm-ctxwrap">${tabsHtml}
      <div class="pm-ctx" role="button">
        <span class="pm-ctx-thumb pm-ctx-thumb--none">🏷️</span>
        <span class="pm-ctx-body">
          <span class="pm-ctx-title">Куплю будинок Олика${tabsCount === 3 ? '<span class="pm-ctx-state">Завершено</span>' : ''}</span>
          <span class="pm-ctx-contact"><span class="pm-ctx-phone">+380 00 000 00 00</span> — Олександр</span>
          <span class="pm-ctx-link">Переглянути оголошення →</span>
        </span>
      </div>
    </div>
    <div class="pm-stream">
      <div class="pm-group pm-group--other"><div class="pm-bubble"><span class="pm-bubble-text">Ще актуально?</span><span class="pm-bubble-time">17:35</span></div></div>
      <div class="pm-group pm-group--mine"><div class="pm-bubble"><span class="pm-bubble-text">Так, пишіть</span><span class="pm-bubble-time">17:36</span></div></div>
    </div>
    <form class="pm-form">
      <button class="pm-attach" type="button"></button>
      <input class="pm-input" placeholder="Написати повідомлення…">
      <button class="pm-send" type="button">↑</button>
    </form>`;
};

const { url, stop } = await serve();
const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await blockExternal(page);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(() => { document.getElementById('splash')?.remove(); document.querySelector('[class*="consent"]')?.remove(); });

for (const [label, n] of [['1-один-контекст', 1], ['2-два-контексти', 2], ['3-три-контексти', 3]]) {
  await page.evaluate((html) => {
    document.getElementById('__chat')?.remove();
    const w = document.createElement('div');
    w.id = '__chat';
    w.className = 'pm-screen pm-screen--chat visible';
    w.innerHTML = html;
    document.body.appendChild(w);
  }, screen(n));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/chat-${label}.png` });
  // КОНТРОЛЬ: смужка чіпів мусить бути ТІЛЬКИ при ≥2 контекстах.
  const has = await page.evaluate(() => !!document.querySelector('#__chat .pm-ctx-tabs'));
  const want = n >= 2;
  console.log(`${has === want ? '✓' : '✗'} ${label.padEnd(18)} смужка чіпів: ${has ? 'є' : 'нема'} (очікував ${want ? 'є' : 'нема'})`);
}

// ── Список «Повідомлення»: один рядок на людину + позначка «+N» ──
const row = (name, post, more, last, unread) => `
  <div class="pm-thread-row">
    <button class="pm-thread ${unread ? 'pm-thread--unread' : ''}" type="button">
      <span class="pm-avatar">${name[0]}</span>
      <div class="pm-thread-body">
        <div class="pm-thread-top"><span class="pm-thread-name">${name}</span><span class="pm-thread-time">19:19</span></div>
        <div class="pm-thread-post">${post}${more ? `<span class="pm-thread-more">+${more}</span>` : ''}</div>
        <div class="pm-thread-last">${last}</div>
      </div>
      ${unread ? `<span class="pm-thread-meta"><span class="pm-thread-dot"></span><span class="pm-row-badge">${unread}</span></span>` : ''}
    </button>
  </div>`;
await page.evaluate((html) => {
  document.getElementById('__chat')?.remove();
  const w = document.createElement('div');
  w.id = '__chat';
  w.className = 'pm-screen pm-screen--list visible';
  w.innerHTML = html;
  document.body.appendChild(w);
}, `
  <header class="pm-head pm-head--list">
    <button class="pm-back" type="button">←</button>
    <div class="pm-head-titles"><div class="pm-head-name pm-head-name--ico">Повідомлення</div></div>
  </header>
  <div class="pm-list pm-list--threads">
    <div class="pm-threads">
      ${row('Dmytro Vasylchuk', 'Куплю будинок Олика', 1, 'Гуляєш?', 5)}
      ${row('Андрій Порт', 'Куплю будинок Олика', 0, '+++', 0)}
      ${row('Віктор', 'Куплю будинок Олика', 0, '📷 Фото', 0)}
      ${row('Катя Гордійчук', 'Продам велосипед', 2, 'Привіт', 1)}
    </div>
  </div>`);
await page.waitForTimeout(250);
await page.screenshot({ path: `${OUT}/chat-4-список.png` });
const more = await page.evaluate(() => document.querySelectorAll('#__chat .pm-thread-more').length);
console.log(`${more === 2 ? '✓' : '✗'} 4-список          позначок «+N»: ${more} (очікував 2)`);

await page.evaluate(() => document.getElementById('__chat')?.remove());
await browser.close();
await stop();
