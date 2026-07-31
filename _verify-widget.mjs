// Крок 6: віджет без вкладеного скролера. Міряємо ГОЛОВНЕ число потоку —
// висоту блока і скільки екрана він з'їдає — плюс контроль по інших віджетах.
import { chromium } from 'playwright';
import { chromiumPath, serve } from './tests/_lib.mjs';

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
await page.route('**://*.supabase.co/**', r => r.abort());
await page.route('**://api.open-meteo.com/**', r => r.abort());
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(1500);

const m = await page.evaluate(() => {
  const nested = root => [...root.querySelectorAll('*')].filter(n => {
    const o = getComputedStyle(n).overflowY;
    return (o === 'auto' || o === 'scroll') && n.scrollHeight > n.clientHeight + 1;
  }).map(n => n.className);
  const news = document.querySelector('.cm-block--news');
  const view = 844 - 56 - 57;                    // екран мінус шапка і таб-бар
  const blocks = {};
  document.querySelectorAll('#cm-content .cm-block').forEach(b => {
    const key = [...b.classList].find(c => c.startsWith('cm-block--')) || b.id || '?';
    blocks[key] = { h: Math.round(b.getBoundingClientRect().height), scrollers: nested(b).length };
  });
  return {
    newsH: Math.round(news.getBoundingClientRect().height),
    newsPctOfView: Math.round(news.getBoundingClientRect().height / view * 1000) / 10,
    newsNestedScrollers: nested(news),
    cards: news.querySelectorAll('[data-article-id]').length,
    imgs: news.querySelectorAll('img').length,
    chipsLeft: news.querySelectorAll('.cm-news-chip, .cm-news-filters').length,
    feedLeft: news.querySelectorAll('.cm-news-feed').length,
    headerIsButton: news.querySelector('.cm-news-board-bar').tagName,
    allBtn: !!news.querySelector('[data-cm-news-all]'),
    blocks,
  };
});
console.log(JSON.stringify(m, null, 2));
await page.screenshot({ path: '_out-widget.png' });

// Тап по віджету → хаб
await page.locator('.cm-news-board-bar').click();
await page.waitForTimeout(700);
console.log('тап по шапці → хаб:', await page.evaluate(() => !!document.querySelector('.nh-screen')));
await page.goBack(); await page.waitForTimeout(500);
// Тап по «Усі новини» → хаб
await page.locator('[data-cm-news-all]').click();
await page.waitForTimeout(700);
console.log('тап по «Усі новини» → хаб:', await page.evaluate(() => !!document.querySelector('.nh-screen')));
await page.goBack(); await page.waitForTimeout(500);
// Тап по КАРТЦІ → стаття, а не хаб
await page.locator('.cm-block--news [data-article-id]').first().click();
await page.waitForTimeout(700);
console.log('тап по картці → стаття:', await page.evaluate(() => ({
  hub: !!document.querySelector('.nh-screen'),
  articleOpen: !!document.querySelector('#article-modal.open, #article-modal.show, #article-modal[style*="display: block"]'),
  modalClass: (document.getElementById('article-modal') || {}).className,
})));

console.log(errs.length ? '❌ ' + errs.join('\n') : '✅ pageerror нема');
await browser.close();
await stop();
