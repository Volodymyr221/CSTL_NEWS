// Стенд: СУХИЙ ПРОГІН ПОЛІТИКИ БЕЗПЕКИ.
//
// 🔴 ЗАРАДИ ЧОГО. Політика безпеки вмісту (CSP) звужує сторінку до переліку
// джерел, яким вона має право довіряти. Перелік у `security/csp.txt` зібраний
// ЧИТАННЯМ КОДУ, тобто майже напевно неповний — а неповна бойова політика
// ламає застосунок мовчки і в усіх одразу: зникають фото, не працює вхід.
// ➡️ Тому прогін тут: політика вмикається БОЙОВОЮ, але в лабораторії.
//
// 🛑 ЧОМУ НЕ «РЕЖИМ ЗВІТУ В index.html», ЯК ПЛАНУВАЛОСЬ. Заміряно 24.09:
//     `<meta … Content-Security-Policy-Report-Only>` → 0 порушень на підкинутий
//     чужий скрипт; той самий `<meta>` бойовим → `script-src-elem`.
// Тобто браузер режим звіту в `<meta>` ІГНОРУЄ (стандарт: report-only буває
// лише заголовком). Теґ у розмітці висів би як охорона, якої немає.
//
// ⚠️ МЕЖА ЧЕСНОСТІ. Стенд проходить сцену завантаження: він НЕ відкриває кожен
// екран, не програє відео, не шле push. «0 порушень» тут означає «на старті
// чисто», а не «можна вмикати бойовою».

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOT, launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();

const ПОЛІТИКА = readFileSync(join(ROOT, 'security/csp.txt'), 'utf-8')
  .split('\n').filter(р => р.trim() && !р.trim().startsWith('#'))
  .join(' ').replace(/\s+/g, ' ').trim();

ok('політику прочитано з одного джерела', /default-src/.test(ПОЛІТИКА) && ПОЛІТИКА.length > 200,
   `${ПОЛІТИКА.length} символів`);

// 🔑 Найдорожчий рядок усієї політики. Новини тягнуть світлини з чужих сайтів,
// частина досі на `http`. Звузити тут — лишити Новини без картинок, і зробити
// це можна лише випадково, не помітивши.
ok('картинки свідомо не звужені (інакше Новини осліпнуть)',
   /img-src[^;]*https:[^;]*http:/.test(ПОЛІТИКА));

// 🔴 У розмітці теґа бути НЕ МАЄ — ні бойового (ламає мовчки), ні в режимі
// звіту (браузер його ігнорує, тобто це охорона-примара).
// Коментарі відкидаємо: в `index.html` навмисно описано, ЧОМУ теґа немає, і
// той опис цитує саму назву. Стенд, який червоніє на пояснення, змусив би
// прибрати пояснення.
const HTML = projectFile('index.html').replace(/<!--[\s\S]*?-->/g, '');
ok('у index.html теґа CSP немає — політика поки лише в лабораторії',
   !/http-equiv="Content-Security-Policy/.test(HTML));

// 🔑 Протокол в адресах чужих скриптів — явний. Запис `//хост/файл` означає
// «тим самим протоколом, що й сторінка», і сухий прогін 24.09 показав, що так
// GoatCounter їде по http і політику порушує.
ok('чужі скрипти підключені явним https',
   !/<script[^>]*src="\/\//.test(HTML),
   (HTML.match(/<script[^>]*src="[^"]*"/g) || []).join(' · '));

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();

// Вставляємо політику в саму розмітку по дорозі до браузера: `addInitScript`
// спізнився б — CSP має бути в `<head>` ДО того, як почнеться розбір.
await p.route(u => u.href === url || u.href === url + '/' || u.href.endsWith('/index.html'),
  async route => {
    const r = await route.fetch();
    const тіло = (await r.text()).replace('<head>',
      `<head><meta http-equiv="Content-Security-Policy" content="${ПОЛІТИКА.replace(/"/g, '&quot;')}">`);
    await route.fulfill({ response: r, body: тіло, headers: { ...r.headers(), 'content-type': 'text/html; charset=utf-8' } });
  });

await p.addInitScript(() => {
  window.__csp = [];
  document.addEventListener('securitypolicyviolation', e => {
    window.__csp.push(`${e.violatedDirective} ← ${e.blockedURI}`);
  });
});

await mockSupabase(p, { pages: [], page_posts: [], posts: [] });
await p.route('**://api.open-meteo.com/**', r => r.abort());

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2000);

const порушення = await p.evaluate(() => window.__csp || []);

// 🛑 КОНТРОЛЬ ПЕРШОГО ПОРЯДКУ: спершу доводимо, що прилад ЖИВИЙ. Без цього
// «0 порушень» означало б лише «слухач не спрацював» — рівно та брехня, від
// якої весь цей файл. Саме на цьому контролі й упала перша редакція стенда,
// показавши, що режим звіту в `<meta>` не працює.
await p.evaluate(() => {
  const s = document.createElement('script');
  s.src = 'https://приклад.невідомий/шкідливий.js';
  document.head.appendChild(s);
});
await p.waitForTimeout(600);
const післяПідкидання = await p.evaluate(() => window.__csp || []);

ok('прилад живий: підкинутий чужий скрипт політика ловить',
   післяПідкидання.length > порушення.length,
   післяПідкидання.slice(порушення.length).join(' · ') || 'нічого');

ok('на старті застосунок політику не порушує',
   порушення.length === 0,
   порушення.join(' · ') || 'чисто');

await stop(); await b.close();
done();
