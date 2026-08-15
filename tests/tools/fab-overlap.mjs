// tests/tools/fab-overlap.mjs — КОНТРОЛЬНИЙ ДОСЛІД, не сторож.
//
// 🔴 ПИТАННЯ. Скарга Вови 15.08 (зі знімком): «іконка FAB розташована над
// таб-баром, але в нас є посередині іконка Громади. Коли FAB розгортається в
// Дошці, він попадає під цю іконку».
//
// FAB прибитий до ПРАВОГО краю (`right: 18px`) і росте ВЛІВО — бо `width: auto`
// і обгортає підпис. Підписи різної довжини:
//   «Запитати» (Питання) · «Подати оголошення» (Дошка) · «Повідомлення N».
// Центральна кнопка «Громада» стоїть посеред таб-бару і ВИСТУПАЄ вгору над ним.
// ➡️ Міряємо: чи перетинаються їхні прямокутники, і на скільки саме.
//
// 🔑 Міряємо ЖИВІ прямокутники (`getBoundingClientRect`), а не припущення з CSS:
// ширина кнопки залежить від тексту, шрифту і системного кегля.
import { chromium } from 'playwright';
import { launch, serve } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block', deviceScaleFactor: 3 });
const p = await ctx.newPage();
await mockSupabase(p, { posts: [], announcements: [] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url + '/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(400);
await p.evaluate(() => document.querySelectorAll('.splash,#splash').forEach(e => e.remove()));

async function measure(tab, label, forceUnread) {
  await p.evaluate(t => window.switchTab(t), tab);
  await p.waitForTimeout(300);
  // Прийняти гейт правил Дошки, якщо він показався (він `fixed` і перехоплює все).
  await p.evaluate(() => document.querySelector('.brules-ok')?.click());
  await p.waitForTimeout(200);

  if (forceUnread) {
    await p.evaluate(() => {
      const btn = document.getElementById('board-trigger');
      if (btn) btn.classList.add('has-unread');
    });
  }
  // Підказка грає САМА при першому вході на вкладку (420мс пауза + 440мс рух).
  await p.waitForTimeout(1200);
  // Якщо не зіграла (замок «раз на запуск» уже спрацював) — розгортаємо руками.
  // ⚠️ Для заміру ГЕОМЕТРІЇ це коректно: ми міряємо перекриття прямокутників,
  // а не логіку показу. Стан ставимо рівно той самий, що ставить `playAskHint`.
  const forced = await p.evaluate(l => {
    const btn = document.getElementById('board-trigger');
    if (!btn || btn.classList.contains('qa-fab-wide')) return false;
    const lab = btn.querySelector('.qa-fab-label');
    if (!lab) return false;
    if (!lab.textContent.trim()) lab.textContent = l;
    btn.style.setProperty('--qa-fab-w', (Math.ceil(lab.scrollWidth) + 6) + 'px');
    btn.classList.add('qa-fab-wide');
    return true;
  }, forceUnread ? 'Повідомлення 2' : (tab === 'board' ? 'Подати оголошення' : 'Запитати'));
  if (forced) await p.waitForTimeout(600);

  const r = await p.evaluate(() => {
    const fab = document.getElementById('board-trigger');
    const home = document.querySelector('.tab-item--home');
    if (!fab || !home) return null;
    const f = fab.getBoundingClientRect();
    const h = (home.querySelector('.tab-home-circle') || home).getBoundingClientRect();
    const wide = fab.classList.contains('qa-fab-wide');
    const txt = (fab.querySelector('.qa-fab-label')?.textContent || '').trim();
    // Іконка, яку видно, і її поворот.
    const ic = fab.querySelector(fab.classList.contains('has-unread')
      ? '.cm-board-trigger-msg svg' : '.cm-board-trigger-icon svg');
    return {
      wide, txt,
      fab: { left: Math.round(f.left), right: Math.round(f.right), top: Math.round(f.top), w: Math.round(f.width) },
      home: { left: Math.round(h.left), right: Math.round(h.right), top: Math.round(h.top) },
      overlapX: Math.round(Math.min(f.right, h.right) - Math.max(f.left, h.left)),
      overlapY: Math.round(Math.min(f.bottom, h.bottom) - Math.max(f.top, h.top)),
      iconTransform: ic ? getComputedStyle(ic).transform : 'нема',
    };
  });
  console.log(`\n── ${label}`);
  if (!r) { console.log('   не знайшов кнопку'); return null; }
  console.log(`   підпис: "${r.txt}"   розгорнуто: ${r.wide ? 'так' : '🔴 НІ (підказка не зіграла)'}`);
  console.log(`   FAB   left ${r.fab.left}  right ${r.fab.right}  ширина ${r.fab.w}  top ${r.fab.top}`);
  console.log(`   Громада left ${r.home.left}  right ${r.home.right}  top ${r.home.top}`);
  console.log(`   перекриття: по X ${r.overlapX}px · по Y ${r.overlapY}px  ` +
              `${r.overlapX > 0 && r.overlapY > 0 ? '🔴 НАКЛАДАЮТЬСЯ' : '✅ не перетинаються'}`);
  console.log(`   поворот іконки: ${r.iconTransform}`);
  return r;
}

console.log('🔬 ЧИ НАКЛАДАЄТЬСЯ РОЗГОРНУТИЙ FAB НА КНОПКУ «ГРОМАДА»');

await measure('discussions', 'Питання — «Запитати» (короткий підпис)');
await measure('board', 'Дошка — «Подати оголошення» (довгий підпис)');
await measure('board', 'Дошка з непрочитаними — «Повідомлення N»', true);

await b.close();
await stop();
