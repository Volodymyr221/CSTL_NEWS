const L = {};
const bb = async (k, loc) => { const b = await loc.boundingBox().catch(() => null); L[k] = b && { x: b.x, y: b.y, w: b.width, h: b.height }; };
await ctx.grantPermissions(['notifications']).catch(() => {});
await кадр('F0', { tab: 'shotam' });
await bb('like1', p.locator('.fd-like:visible').first());
await bb('remind', p.locator('.fd-remind-btn:visible').first());
await bb('cbtn2', p.locator('.fd-cbtn:visible').nth(1));
await bb('circle2', p.locator('.fd-circle:visible').nth(1));
// лайк
await p.locator('.fd-like:visible').first().click({ force: true }); await p.waitForTimeout(700); await shot('F1-like');
// нагадати
await p.locator('.fd-remind-btn:visible').first().click({ force: true }); await p.waitForTimeout(1200); await shot('F2-remind'); await dump('after remind');
await p.waitForTimeout(3500); await shot('F2b');
// коментарі
await p.locator('.fd-cbtn:visible').nth(1).click({ force: true }); await p.waitForTimeout(1500); await shot('F3-comments'); await dump('comments');
await p.goBack().catch(() => {}); await p.waitForTimeout(1000);
await p.keyboard.press('Escape').catch(() => {}); await p.waitForTimeout(600); await shot('F3b-closed');
// спільнота
await p.locator('.fd-circle:visible').nth(1).click({ force: true }); await p.waitForTimeout(1600); await shot('F4-page'); await dump('page');
const fs = await import('fs'); fs.writeFileSync(OUT + '/taps.json', JSON.stringify(L, null, 1)); console.log(JSON.stringify(L));
