// tests/board-card-accent.mjs — КАРТКА ДОШКИ: населений пункт багряний, закладка без овалу.
//
// НАВІЩО (замовлення Вови 27.08): «ціна зліва знизу бордова… а населений пункт сірий,
// і він зливається з описом — його теж треба бордовим, як ціну. І кнопка Зберегти
// зверху справа: значок в овальному обрамленні, обрамлення прибрати, лишити значок».
//
// 🔑 ЩО САМЕ МІРЯЄМО І ЧОМУ НЕ ТЕКСТ ФАЙЛУ.
// Обидва дефекти — це не «чого бракує в CSS», а «що лишилось від чужого правила».
// Локація мала свій сірий, а овал кнопки збирався з ЧОТИРЬОХ властивостей базового
// класу `.bd-icon-btn`, з яких скасовані були рівно дві. Тому grep по файлу тут
// нічого не доводить: він показав би `border: 0` і сказав «овалу немає», поки на
// екрані лишалась пляма. Питаємо браузер про ОБЧИСЛЕНИЙ стиль.
//
// 🔴 УРОК, ЗАРАДИ ЯКОГО ЦЕЙ СТОРОЖ І ЗАВЕДЕНО: «прибрав рамку і фон» ≠ «прибрав
// кружечок». `border-radius: 50%`, `box-shadow` і `backdrop-filter` пережили обидва
// скасування — саме розмиття й малювало видимий еліпс на білій картці.
//
// ⚠️ Контроль обовʼязковий: перевірка, яка не вміє впасти, нічого не стереже. Тому
// нижче та сама сцена міряється ще раз із НАКЛЕЄНИМ старим правилом — і мусить
// показати обидва дефекти.

import { chromium } from 'playwright';
import { launch, reporter, zoneCss, baseCss } from './_lib.mjs';

const { ok, done } = reporter();

const BASE_CSS = baseCss();
const ZONE_CSS = zoneCss();

// Пін — дослівно `PIN_ICON_SVG` із `src/tabs/board.js`. Важливий `stroke="currentColor"`:
// саме він робить іконку залежною від `color`, тож окремого правила для неї не треба.
const PIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const BOOKMARK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

// Розмітка — копія `renderBoardCard` (src/tabs/board.js). Корінь `#board-content`
// обовʼязковий: увесь новий вигляд картки scoped саме під нього.
const CARD = `
<div id="board-content" class="board-content">
  <article class="cm-board-note bd-card bd-card--board bd-ad" data-post-id="901">
    <div class="bd-ad-img bd-ad-img--mono"></div>
    <div class="bd-ad-body">
      <div class="bd-ad-meta">
        <span class="bd-ad-type cat-c-sell">ПРОДАМ</span>
        <span class="bd-ad-time">3 дні тому</span>
        <div class="bd-actions bd-actions--board-compact">
          <div class="bd-actions-extra">
            <button class="bd-icon-btn bd-bookmark" type="button" data-save-id="901"
                    aria-label="Зберегти у Мої">${BOOKMARK}</button>
            <button class="bd-icon-btn bd-share-btn" type="button">${BOOKMARK}</button>
          </div>
        </div>
      </div>
      <h3 class="bd-ad-title">ПРОДАМ БУДИНОК</h3>
      <p class="bd-ad-desc">Терміново продам будинок у гарному стані, торг можливий при огляді.</p>
      <div class="bd-ad-foot">
        <span class="bd-ad-loc">${PIN}Жорнище</span>
        <div class="cm-board-price">1500 грн</div>
      </div>
    </div>
  </article>
</div>`;

const page = (extra = '') => `<!doctype html><meta charset="utf-8">
<style>${BASE_CSS}\n${ZONE_CSS}\n${extra}</style>${CARD}`;

const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const pg = await ctx.newPage();

async function measure(html) {
  await pg.setContent(html);
  return pg.evaluate(() => {
    const cs = s => getComputedStyle(document.querySelector(s));
    const loc = cs('#board-content .bd-ad-loc');
    const pin = cs('#board-content .bd-ad-loc svg');
    const price = cs('#board-content .bd-ad .cm-board-price');
    const desc = cs('#board-content .bd-ad-desc');
    const bm = cs('#board-content .bd-ad .bd-bookmark');
    return {
      локація: loc.color,
      пін: pin.stroke,
      ціна: price.color,
      опис: desc.color,
      радіус: bm.borderTopLeftRadius,
      тінь: bm.boxShadow,
      розмиття: bm.backdropFilter || bm.webkitBackdropFilter || 'none',
      фон: bm.backgroundColor,
      рамка: parseFloat(bm.borderTopWidth) || 0,
      ширина: parseFloat(bm.width),
      висота: parseFloat(bm.height),
    };
  });
}

const m = await measure(page());

// ── 1. НАСЕЛЕНИЙ ПУНКТ — ТОГО САМОГО КОЛЬОРУ, ЩО Й ЦІНА ──────────────────────
// Критерій навмисно ВІДНОСНИЙ, а не «дорівнює #722F37»: Вова просив «як ціна», тож
// якщо колись переїде акцент бренду — обидва переїдуть разом, і сторож не збреше.
ok('локація того самого кольору, що й ціна', m.локація === m.ціна,
   `локація ${m.локація} · ціна ${m.ціна}`);
// Головна скарга була не «сірий», а «зливається з описом» — саме це й міряємо.
ok('локація НЕ зливається з описом', m.локація !== m.опис,
   `локація ${m.локація} · опис ${m.опис}`);
// Пін мусить іти за текстом сам, без власного правила: `stroke="currentColor"`.
ok('пін фарбується разом із текстом (currentColor)', m.пін === m.локація,
   `пін ${m.пін}`);

// ── 2. ЗАКЛАДКА — ГОЛИЙ ЗНАЧОК, БЕЗ ОБГОРТКИ ────────────────────────────────
// Чотири властивості, і жодної не досить окремо: овал тримали всі разом.
ok('немає скруглення (овалу)', parseFloat(m.радіус) === 0, `border-radius ${m.радіус}`);
ok('немає тіні', m.тінь === 'none', `box-shadow ${m.тінь}`);
ok('немає розмиття під кнопкою', m.розмиття === 'none', `backdrop-filter ${m.розмиття}`);
ok('немає рамки', m.рамка === 0, `border ${m.рамка}px`);
ok('немає заливки', /rgba\(0, 0, 0, 0\)|transparent/.test(m.фон), `background ${m.фон}`);
// 🔑 Прибираємо ВИГЛЯД, а не тап-ціль: 40×32 куплені окремим заміром 03.08 (маленька
// іконка не мусить означати маленьку кнопку). Якби разом з овалом поїхав і розмір —
// це була б втрата, а не полірування.
ok('тап-ціль лишилась 40×32', m.ширина === 40 && m.висота === 32,
   `${m.ширина}×${m.висота}`);

// ── 3. КОНТРОЛЬ: зі старим правилом стенд МУСИТЬ почервоніти ────────────────
// Наклеюємо рівно те, що було до правки: сірий на локації і повний набір овалу.
const СТАРЕ = `
#board-content .bd-ad-loc { color: #7A7A7A; }
#board-content .bd-ad .bd-bookmark {
  border-radius: 50%;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}`;
const c = await measure(page(СТАРЕ));
ok('КОНТРОЛЬ: старий CSS справді робив локацію сірою і НЕ як ціна',
   c.локація !== c.ціна && c.локація === 'rgb(122, 122, 122)', `${c.локація}`);
ok('КОНТРОЛЬ: старий CSS справді лишав овал (скруглення + тінь + розмиття)',
   parseFloat(c.радіус) > 0 && c.тінь !== 'none' && c.розмиття !== 'none',
   `радіус ${c.радіус} · тінь ${c.тінь !== 'none' ? 'є' : 'нема'} · розмиття ${c.розмиття}`);

await b.close();
done();
