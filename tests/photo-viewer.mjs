// Стенд: ОДИН ПЕРЕГЛЯД ФОТО НА ЗАСТОСУНОК — ЗУМ І СВАЙП, ЯКИЙ НЕ СМИКАЄТЬСЯ.
//
// 🗣️ ЗАМОВЛЕННЯ ВОВИ (04.09.2026, дослівно): «треба додати можливість нормально
// зумити будь-які фото в застосунку… і закривати свайпом вверх-вниз. Але не так,
// щоб при маленькому русі воно дергане і закрилося. Як звичайно в застосунку, як
// у Фейсбуці це працює, чи в Телеграмі… не тільки в оголошенні, а там будь-які
// фото, які надсилаються в приватні повідомлення, чи в постах, чи будь це
// аватарка якогось жителя».
//
// 🔴 ЩО БУЛО. Три РІЗНІ переглядачі, жоден без зуму: `fd-viewer` (Стрічка,
// статті), `pm-lightbox` (приватні повідомлення, аватар у картці жителя),
// `cm-photo-lightbox` (оголошення Дошки). Дві функції звались ОДНАКОВО —
// `openPhotoLightbox` — і були різним кодом.
//
// 📐 ЩО МІРЯЄМО І ЧОМУ САМЕ ТАК. «Не смикається» — властивість ПОВЕДІНКИ, і
// регулярка по коду її не бачить: поріг можна написати і переплутати знак. Тому
// стенд ВИКОНУЄ справжній `core/photo-viewer.js` і проводить по ньому справжні
// послідовності `touchstart → touchmove → touchend`. Три сценарії відповідають
// трьом реченням замовлення: малий рух НЕ закриває · далекий закриває · різкий
// кидок закриває.
//
// 🔴 КОНТРОЛЬ: BUNDLE_REV=origin/main node tests/photo-viewer.mjs
// На коді до зведення мусять упасти всі перевірки жестів (там немає ні зуму, ні
// свайпу) і перевірка «переглядач один».
import { chromium } from 'playwright';
import { projectFile, launch, reporter } from './_lib.mjs';

const REV = process.env.BUNDLE_REV || '';
const { ok, done } = reporter();

const viewer = projectFile('src/core/photo-viewer.js', REV);
const feedCss = projectFile('style/feed.css', REV);

console.log(`\n── ПЕРЕГЛЯД ФОТО: ЗУМ І СВАЙП${REV ? `   (КОНТРОЛЬ на ${REV})` : ''}`);

// ── ЧАСТИНА 1. ПЕРЕГЛЯДАЧ ОДИН ───────────────────────────────────────────────
// 🛑 Правило КЛАСУ, і воно тут головне. Замовлення «будь-які фото» закривається
// зведенням, а не трьома правками: три реалізації дали б три різні зуми.
const дублі = [];
for (const [ф, ознака] of [
  ['src/core/utils.js', /export function openPhotoLightbox\(/],
  ['src/tabs/board.js', /^function openPhotoLightbox\(/m],
]) {
  let код; try { код = projectFile(ф, REV); } catch (_) { continue; }
  if (ознака.test(код)) дублі.push(ф.split('/').pop());
}
ok('другого переглядача фото в проєкті НЕМАЄ',
   дублі.length === 0, дублі.length ? 'ще живі: ' + дублі.join(', ') : 'один на застосунок');

// Усі чотири поверхні кличуть саме спільний.
for (const [ф, підпис] of [
  ['src/tabs/feed.js', 'Стрічка'],
  ['src/tabs/news.js', 'фото в статті'],
  ['src/tabs/board.js', 'оголошення Дошки'],
  ['src/tabs/board-chat.js', 'приватні повідомлення'],
  ['src/core/profile-card.js', 'аватар жителя'],
]) {
  let код = ''; try { код = projectFile(ф, REV); } catch (_) {}
  ok(`${підпис} — через спільний переглядач`, /openPhotoViewer/.test(код));
}

// 🔴 z-index: узято НАЙВИЩИЙ із трьох зведених (3600), інакше повертається баг
// 02.08 — фото малювалось ПІД аркушем оголошення.
const z = (feedCss.match(/\.fd-viewer \{[^}]*z-index:\s*(\d+)/) || [])[1];
ok('перегляд лягає поверх картки жителя і чату', Number(z) >= 3600, `z-index: ${z}`);

// ── ЧАСТИНА 2 (ГОЛОВНА). ВИКОНУЄМО ЖЕСТИ ────────────────────────────────────
const інлайн = (src) => src.replace(/^import .*$/gm, '').replace(/^export /gm, '');

const сцена = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body { margin:0; height:100%; }
  ${feedCss.replace(/<\/script>/gi, '')}
</style></head><body><script type="module">
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  // Заглушка шарів: тримає обробник закриття, щоб стенд бачив САМ ФАКТ закриття.
  let _закрити = null;
  const openLayer = (cb) => { _закрити = cb; return { id: 1 }; };
  const closeLayer = () => { window.__закрито = true; if (_закрити) _закрити(); };
  ${інлайн(viewer)}

  // 1×1 прозорий PNG — щоб не ходити в мережу і не чекати завантаження.
  const ФОТО = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAoMBgDTD2qgAAAAASUVORK5CYII=';

  const торкання = (el, x, y, id = 0) => new Touch({
    identifier: id, target: el, clientX: x, clientY: y, pageX: x, pageY: y });
  const подія = (el, тип, точки) => el.dispatchEvent(new TouchEvent(тип, {
    bubbles: true, cancelable: true, touches: точки, targetTouches: точки, changedTouches: точки }));

  window.__відкрити = (скільки = 1) => {
    window.__закрито = false;
    document.querySelectorAll('.fd-viewer').forEach(n => n.remove());
    openPhotoViewer(Array(скільки).fill(ФОТО), 0);
    return !!document.querySelector('.fd-viewer');
  };

  // Протяжка вниз за N кроків із заданою паузою — саме так, як веде палець.
  window.__свайп = async (шлях, крокМс) => {
    const track = document.querySelector('.fd-viewer-track');
    const t = (x, y) => [торкання(track, x, y)];
    подія(track, 'touchstart', t(160, 300));
    for (let i = 1; i <= 6; i++) {
      подія(track, 'touchmove', t(160, 300 + шлях * i / 6));
      if (крокМс) await new Promise(r => setTimeout(r, крокМс));
    }
    подія(track, 'touchend', []);
    await new Promise(r => setTimeout(r, 260));
    return window.__закрито === true;
  };

  window.__щипок = async () => {
    const track = document.querySelector('.fd-viewer-track');
    подія(track, 'touchstart', [торкання(track, 140, 300, 1), торкання(track, 180, 300, 2)]);
    for (let i = 1; i <= 4; i++) {
      const d = 20 + i * 25;
      подія(track, 'touchmove', [торкання(track, 160 - d, 300, 1), торкання(track, 160 + d, 300, 2)]);
    }
    подія(track, 'touchend', []);
    await new Promise(r => setTimeout(r, 60));
    const slide = document.querySelector('.fd-viewer-slide');
    return {
      масштаб: slide && slide.__zoom ? slide.__zoom.s : null,
      замкнено: !!document.querySelector('.fd-viewer-track--locked'),
      клас: !!(slide && slide.classList.contains('fd-viewer-slide--zoomed')),
    };
  };

  window.__зсувФото = () => {
    const img = document.querySelector('.fd-viewer-slide img');
    return img ? img.style.transform : '';
  };
  window.__лічильник = () => {
    const c = document.querySelector('.fd-viewer-count');
    return c ? c.textContent : null;
  };
  window.__готово = true;
</script></body></html>`;

const b = await launch(chromium);
const p = await b.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
await p.setContent(сцена);
await p.waitForTimeout(400);

const живий = await p.evaluate(() => window.__готово === true);
ok('модуль переглядача виконується', живий);

const прогнати = async (fn, ...арг) => {
  try { return await p.evaluate(fn, арг); } catch (_) { return null; }
};

// Відкриття
const відкрився = await прогнати(() => window.__відкрити ? window.__відкрити(1) : false);
ok('перегляд відкривається', відкрився === true);

// 🛑 СЦЕНАРІЙ 1 — «не так, щоб при маленькому русі воно дергане і закрилося».
const малий = await прогнати(async () => {
  window.__відкрити(1);
  return await window.__свайп(28, 0);
});
ok('малий рух (28px) НЕ закриває', малий === false, `закрито: ${малий}`);

// І фото мусить ПОВЕРНУТИСЬ на місце, а не лишитись зсунутим.
const повернулось = await прогнати(() => {
  const t = window.__зсувФото();
  return /translate3d\(0px, 0px, 0px\)|scale\(1\)/.test(t) || t === '';
});
ok('після недотягнутого свайпу фото повертається на місце', повернулось === true);

// 🛑 СЦЕНАРІЙ 2 — далекий свідомий рух закриває.
const далекий = await прогнати(async () => {
  window.__відкрити(1);
  return await window.__свайп(150, 0);
});
ok('далекий свайп (150px) закриває', далекий === true);

// 🛑 СЦЕНАРІЙ 3 — короткий РІЗКИЙ кидок теж закриває, хоч шлях і малий.
// Без цього порога довелось би тягнути фото пів екрана — не як у Телеграмі.
const кидок = await прогнати(async () => {
  window.__відкрити(1);
  return await window.__свайп(70, 0);   // 6 кроків без пауз = дуже швидко
});
ok('різкий кидок закриває навіть на малому шляху', кидок === true);

// 🛑 СЦЕНАРІЙ 4 — той самий шлях, але ПОВІЛЬНО, не закриває.
// 🔑 Саме ця пара (3 і 4) доводить, що поріг швидкості справді працює, а не
// «закриває все підряд»: шлях однаковий, різна лише швидкість.
const повільний = await прогнати(async () => {
  window.__відкрити(1);
  return await window.__свайп(70, 40);   // ~240мс на 70px ≈ 0.29 px/ms
});
ok('той самий шлях ПОВІЛЬНО — не закриває', повільний === false, `закрито: ${повільний}`);

// ── ЗУМ ─────────────────────────────────────────────────────────────────────
const щипок = await прогнати(async () => {
  window.__відкрити(1);
  return await window.__щипок();
});
ok('щипок збільшує фото', щипок && щипок.масштаб > 1.05, `масштаб: ${щипок && щипок.масштаб}`);
ok('поки наближено — гортання між кадрами замкнене', !!(щипок && щипок.замкнено));
ok('наближений кадр помічений класом (padding знімається)', !!(щипок && щипок.клас));

// 🔑 Після зуму вертикальний рух — це ПАНОРАМА, а не закриття. Інакше людина,
// роздивляючись збільшене фото, випадково закривала б перегляд.
const післяЗуму = await прогнати(async () => {
  window.__відкрити(1);
  await window.__щипок();
  return await window.__свайп(150, 0);
});
ok('на наближеному фото свайп НЕ закриває (це панорама)',
   післяЗуму === false, `закрито: ${післяЗуму}`);

// Лічильник кадрів — він переїхав із `cm-photo-lightbox`, де був єдиною
// підказкою «фото кілька». Втратити його при зведенні було б регресом.
const лічильник = await прогнати(() => { window.__відкрити(3); return window.__лічильник(); });
ok('галерея показує лічильник кадрів', лічильник === '1 / 3', String(лічильник));
const одне = await прогнати(() => { window.__відкрити(1); return window.__лічильник(); });
ok('на одному фото лічильника немає', одне === null, String(одне));

await b.close();
done();
