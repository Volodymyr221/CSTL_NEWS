// ЗОНД (тимчасовий, запускається руками): чому ВІДКРІПЛЕННЯ стрибає, а закріплення — ні.
// Геометрія: список спільноти, зверху закріплена картка. Рухаємо її вниз (відкріплення)
// і вгору (закріплення) з різних позицій прокрутки й дивимось на залишковий зсув.
import { chromium } from 'playwright';
import { launch, projectFile } from '../_lib.mjs';

const SRC = projectFile('src/tabs/feed.js');
const KEEP = SRC.slice(SRC.indexOf('function keepScroll'), SRC.indexOf('// Зібрати DOM-вузол картки'));

const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  #sc{height:700px;overflow-y:auto;overflow-anchor:none}
  article{background:#fff;border-bottom:1px solid #ccc}
</style></head><body><div id="sc"></div></body></html>`);

const probe = await page.evaluate(({ src }) => {
  const keepScroll = new Function(src + '\nreturn keepScroll;')();
  const sc = document.getElementById('sc');
  const H = [520, 300, 380, 260, 340, 300, 420, 280, 360, 300];   // висоти карток
  const build = () => { sc.innerHTML = H.map((h, i) =>
    `<article data-post="${i + 1}" style="height:${h}px">пост ${i + 1}</article>`).join(''); };

  const go = (kind, scrollTop) => {
    build(); sc.scrollTop = scrollTop;
    const top = () => sc.getBoundingClientRect().top;
    const moved = kind === 'unpin' ? '1' : '7';        // відкріплюємо верхню / закріплюємо сьому
    const watch = [...sc.querySelectorAll('[data-post]')]
      .find(c => c.getBoundingClientRect().bottom > top() + 1 && c.dataset.post !== moved);
    const id = watch.dataset.post;
    const posOf = () => sc.querySelector(`[data-post="${id}"]`).getBoundingClientRect().top - top();
    const before = posOf();
    keepScroll(sc, () => {
      const n = sc.querySelector(`[data-post="${moved}"]`);
      if (kind === 'unpin') sc.insertBefore(n, sc.children[5]);   // поїхала ВНИЗ (на своє місце за датою)
      else sc.insertBefore(n, sc.firstElementChild);              // поїхала ВГОРУ (закріплення)
    }, moved);
    return { kind, scrollTop, watch: id, before: Math.round(before), after: Math.round(posOf()),
             drift: Math.round(posOf() - before), scrollAfter: sc.scrollTop };
  };

  return [200, 400, 700, 1400, 2200].flatMap(st => [go('unpin', st), go('pin', st)]);
}, { src: KEEP });

for (const r of probe) {
  const mark = r.drift === 0 ? '✅' : '⚠️ ';
  console.log(`${mark} ${r.kind.padEnd(6)} scrollTop=${String(r.scrollTop).padStart(4)} → ${String(r.scrollAfter).padStart(4)} · дивимось на пост ${r.watch} · зсув ${r.drift}px`);
}
await browser.close();
