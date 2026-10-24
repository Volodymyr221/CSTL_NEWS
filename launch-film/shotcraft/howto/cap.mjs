const L = {};
const bb = async (k, loc) => { const b = await loc.boundingBox(); L[k] = b && { x: b.x, y: b.y, w: b.width, h: b.height }; };
await кадр('A0');
await bb('tabBoard', p.locator('.tab-item:has-text("Дошка")'));
await кадр('A1', { tab: 'board' });
await bb('trigger', p.locator('#board-trigger'));
await p.locator('#board-trigger').click({ force: true }); await p.waitForTimeout(800); await shot('A2');
await bb('fabPost', p.locator('.board-fab-item:has-text("Подати оголошення")'));
await p.locator('.board-fab-item:has-text("Подати оголошення")').click({ force: true }); await p.waitForTimeout(1300); await shot('A3');
await bb('chip', p.locator('.bm-chip:has-text("Продам")'));
await p.locator('.bm-chip:has-text("Продам")').click(); await p.waitForTimeout(500); await shot('A4');
await bb('title', p.locator('#bm-title'));
await p.locator('#bm-title').click(); await p.waitForTimeout(200);
const TITLE = 'Дитячий велосипед, 16 дюймів';
for (let i = 0; i < TITLE.length; i++) { await p.keyboard.type(TITLE[i]); await p.waitForTimeout(60); await shot('T' + (i + 1)); }
const price = p.locator('input[placeholder*="2500"]');
await bb('price', price); await price.click(); await p.waitForTimeout(200);
const PR = '1500';
for (let i = 0; i < PR.length; i++) { await p.keyboard.type(PR[i]); await p.waitForTimeout(80); await shot('P' + (i + 1)); }
await bb('text', p.locator('#bm-text'));
await p.locator('#bm-text').click(); await p.waitForTimeout(200);
const DESC = ['У гарному стані, ', 'катався один сезон. ', 'Є додаткові колеса.'];
for (let i = 0; i < DESC.length; i++) { await p.keyboard.type(DESC[i]); await p.waitForTimeout(200); await shot('D' + (i + 1)); }
await p.evaluate(() => document.activeElement && document.activeElement.blur()); await p.waitForTimeout(300);
// прокрутка аркуша — кадри на кількох глибинах для склейки
const geo = await p.evaluate(() => { const sh = document.querySelector('.app-modal-sheet'); const hd = document.querySelector('.cm-board-modal-head'); return { sheetTop: sh.getBoundingClientRect().top, headBottom: hd.getBoundingClientRect().bottom, max: sh.scrollHeight - sh.clientHeight }; });
L.geo = geo; L.scrolls = [];
for (const s of [0, 300, 600, 900, 99999]) {
  const real = await p.evaluate(s => { const sh = document.querySelector('.app-modal-sheet'); sh.scrollTop = s; sh.dispatchEvent(new Event('scroll')); return sh.scrollTop; }, s);
  await p.waitForTimeout(350); await shot('S' + real); L.scrolls.push(real);
}
L.geo2 = await p.evaluate(() => { const hd = document.querySelector('.cm-board-modal-head'); return { headBottom: hd.getBoundingClientRect().bottom }; });
await bb('submit', p.locator('.cm-board-submit'));
await p.locator('.cm-board-submit').click({ force: true }); await p.waitForTimeout(1000); await shot('A9');
await p.waitForTimeout(3500);
// ── частина Б: написати автору ──
await p.evaluate(() => document.querySelectorAll('.toast, .app-toast').forEach(e => e.remove()));
await p.waitForTimeout(500); await shot('B0');
const card = p.locator('.bd-card:visible').first(); await bb('card', card);
await card.click(); await p.waitForTimeout(1300); await shot('B1');
await bb('write', p.locator('[data-open-chat]:visible').first());
await p.locator('[data-open-chat]:visible').first().click({ force: true }); await p.waitForTimeout(1800); await shot('B2');
await bb('qchip', p.locator('.pm-quick-chip:has-text("Чи актуально?")'));
await p.locator('.pm-quick-chip:has-text("Чи актуально?")').click({ force: true }); await p.waitForTimeout(1200); await shot('B3');
await bb('send', p.locator('.pm-send'));
const fs = await import('fs'); fs.writeFileSync(OUT + '/taps.json', JSON.stringify(L, null, 1));
console.log(JSON.stringify(L));
