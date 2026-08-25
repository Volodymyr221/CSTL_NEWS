// Стенд: ВІДПОВІДЬ ВІД ІМЕНІ СПІЛЬНОТИ У «СТРІЧЦІ» (25.08.2026).
//
// 🔴 ЗАМОВЛЕННЯ ВОВИ: пости йдуть від імені спільноти, а коментар адміна — від його
// особистого акаунта. Треба дати вибір: відповідати як спільнота або як я.
//
// 🔑 ЩО САМЕ ТУТ МІРЯЄТЬСЯ І ЧОМУ ЦЕ НЕ «ЧИ Є ФУНКЦІЯ».
// Дві частини, бо ризики різні за природою:
//   А) ВИТІК — перевірки на джерелі. Рядок спільноти навмисно не називає людину,
//      тож жоден інший шлях не сміє назвати її замість нього: ні згадка «Володимир,»
//      у відповіді, ні заголовок push на замкненому телефоні. Це не косметика — це
//      те, заради чого фіча взагалі має сенс.
//   Б) РОЗКЛАДКА — справжній вимір у браузері на 390pt. Назви спільнот тут довгі
//      («КЦ «ЦЕНТР КУЛЬТУРИ, СПОРТУ ТА ТУРИЗМУ ОЛИЦЬКОЇ МІСЬКОЇ РАДИ»»), і
//      перемикач стоїть ПІД клавіатурою, де місця найменше.
//
// 🔴 КОНТРОЛЬ: BUNDLE_REV=origin/main node tests/comment-as-page.mjs
// На коді до цього потоку перевірки частини А мусять УПАСТИ. Якщо вони зелені й
// там — вони міряють не те (у проєкті це вже траплялось: «показує всі три» було
// істинним на старому коді).
import { chromium } from 'playwright';
import { launch, projectFile } from './_lib.mjs';

const REV = process.env.BUNDLE_REV || '';
const res = [];
const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };

const feed  = projectFile('src/tabs/feed.js', REV);
const supa  = projectFile('src/core/supabase.js', REV);
const push  = projectFile('supabase/functions/send-comment-push/index.ts', REV);
let sql = ''; try { sql = projectFile('scripts/supabase_comment_as_page.sql', REV); } catch { sql = ''; }

console.log(`\n── А. ВИТІК І ЛАНЦЮГ${REV ? `   (КОНТРОЛЬ на ${REV})` : ''}`);

// 1. Голос доїжджає до бази. Без цього перемикач був би декоративним —
//    а «декоративного в нас нічого не має бути» (Вова, B-33).
ok('addPageComment приймає голос і кладе його у вставку',
   /addPageComment\([^)]*asPageId/.test(supa) && /as_page_id:\s*asPageId|base\.as_page_id\s*=\s*asPageId/.test(supa));
ok('лист надсилає голос разом з коментарем',
   /addPageComment\(postId, currentUserId\(\), text, parentId, replyToUid, asPageId\(\)\)/.test(feed));

// 2. 🔴 ГОЛОВНЕ. Відповідь НА коментар спільноти не сміє нести uid його автора:
//    `reply_to_uid` малюється на екрані як «Володимир,» — тобто звичайний шлях
//    назвав би вголос саме ту людину, яку рядок навмисно не називає.
ok('рядок спільноти НЕ віддає uid автора в data-reply-uid',
   /data-reply-uid="\$\{asPage \? '' : \(c\.author_uid \|\| ''\)\}"/.test(feed));

// 3. Той самий витік, але дорожчий: push читають на замкненому телефоні,
//    де екрана з підписом «OLYKA CASTLE» перед очима немає взагалі.
ok('push бере як імʼя НАЗВУ СПІЛЬНОТИ, коли голос не особистий',
   /as_page_id/.test(push) && /voiceName\s*=\s*asPage\s*\?\s*pageName/.test(push));
ok('заголовок push для спільноти БЕЗРОДОВИЙ («Відповідь від X»)',
   /asPage \? `Відповідь від \$\{voiceName\}`/.test(push));

// 4. Голос заморожено: інакше є тихий шлях «написав особисто → прочитали →
//    перемкнув на спільноту», про який позначка «змінено» нічого не скаже.
ok('тригер бази морозить as_page_id при правці',
   /new\.as_page_id\s+is distinct from\s+old\.as_page_id/.test(sql));
ok('говорити від імені спільноти можна лише під ЇЇ постом',
   /as_page_id = \(select pp\.page_id from public\.page_posts pp where pp\.id = post_id\)/.test(sql));

// 4-БІС. Найтихіший зі шляхів витоку: сторінки нема в памʼяті → `find` віддає
//    undefined → рядок мовчки малюється як ОСОБИСТИЙ, тобто називає адміна.
//    Ловиться лише на очі, і то не завжди — тому окрема перевірка.
ok('нема сторінки в памʼяті → все одно «Спільнота», а не імʼя людини',
   /pages\.find\(p => p\.id === c\.as_page_id\) \|\| \{ name: 'Спільнота'/.test(feed));

// 5. Бейджі — це відповідь на «наскільки це офіційно».
ok('є обидва бейджі: «Спільнота» і «Адмін»',
   /fd-com-badge--page">Спільнота</.test(feed) && /fd-com-badge">Адмін</.test(feed));

// 6. Перемикач бачить ЛИШЕ команда сторінки. Кнопка, яка завжди падає помилкою
//    прав, гірша за її відсутність — це вже коштувало проєкту разу 24.07, коли
//    глобальному адміну малювали композер на ВСІХ сторінках.
ok('перемикач схований від усіх, крім команди сторінки',
   /asRow\.hidden = !мояКоманда/.test(feed) && /мояКоманда = !!сторінка && myPageIds\.has/.test(feed));
ok('не з команди — голос завжди особистий, хай що в памʼяті',
   /мояКоманда \? \(commentAsChoice\.get\(postId\) \?\? null\) : null/.test(feed));
ok('бейдж «Адмін» бере роль з БАЗИ, а не вгадує на клієнті',
   /rpc\('page_team_flags'/.test(supa));

console.log('\n── Б. РОЗКЛАДКА НА 390pt (справжній вимір)');

const css = projectFile('style/feed.css');       // розкладку міряємо ЗАВЖДИ на свіжій CSS
const ДОВГА = 'КЦ «ЦЕНТР КУЛЬТУРИ, СПОРТУ ТА ТУРИЗМУ ОЛИЦЬКОЇ МІСЬКОЇ РАДИ»';

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
 *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
 :root{--fd-surface:#fff;--fd-ink:#111;--fd-chip:#eee;--fd-accent:#722F37;
       --fd-muted:#888;--fd-line:#ddd;--fd-divider:#e5e5e5}
 body{width:390px;background:#fff}
 ${css}
</style></head><body>
 <div class="fd-com-as">
   <span class="fd-com-as-lab">Відповідати як</span>
   <button class="fd-com-as-btn is-on" data-com-as="me"><span class="fd-com-as-dot"></span><span class="fd-com-as-txt">Від себе</span></button>
   <button class="fd-com-as-btn" data-com-as="page"><span class="fd-com-as-dot"></span><span class="fd-com-as-txt">${ДОВГА}</span></button>
 </div>
 <div class="fd-com-row" data-com-id="1">
   <span class="fd-com-ava"></span>
   <div class="fd-com-body">
     <div class="fd-com-head"><span class="fd-com-name">${ДОВГА}</span><span class="fd-com-badge fd-com-badge--page">Спільнота</span><span class="fd-com-time">2 хв</span></div>
     <div class="fd-com-line"><span class="fd-com-txt">О 10:00 біля центрального входу.</span></div>
   </div>
 </div>
</body></html>`;

const b = await launch(chromium);
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.setContent(html);
await p.waitForTimeout(80);

const g = await p.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null;
    const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height) }; };
  return {
    рядок: r('.fd-com-as'), я: r('[data-com-as="me"]'), спільнота: r('[data-com-as="page"]'),
    кружечок: r('[data-com-as="page"] .fd-com-as-dot'),
    бейдж: r('.fd-com-badge'), імʼя: r('.fd-com-name'), час: r('.fd-com-time'),
    ширинаТіла: document.body.scrollWidth,
  };
});

console.log(`   перемикач: висота ${g.рядок.h}px · «Від себе» ${g.я.l}…${g.я.r} · спільнота ${g.спільнота.l}…${g.спільнота.r}`);
console.log(`   бейдж «Спільнота»: ${g.бейдж.l}…${g.бейдж.r}  ·  час: ${g.час.l}…${g.час.r}  ·  тіло ${g.ширинаТіла}px`);

// 🔑 Друга кнопка — це і є вся фіча. Якщо довга назва виштовхнула її за екран,
// перемкнутись на голос спільноти неможливо взагалі.
ok('кнопка спільноти ПОВНІСТЮ на екрані попри довжелезну назву',
   g.спільнота.r <= 390, `правий край ${g.спільнота.r}px`);
ok('кнопка «Від себе» не стиснулась у ніщо', g.я.r - g.я.l >= 80, `ширина ${g.я.r - g.я.l}px`);
// Кружечок і Є відповідь «хто зараз говорить» — обрізати можна текст, але не його.
ok('кружечок стану видимий (обрізається лише текст)',
   g.кружечок && g.кружечок.r <= 390 && g.кружечок.r - g.кружечок.l >= 8);
ok('сторінка не поїхала вбік', g.ширинаТіла <= 390, `${g.ширинаТіла}px`);
// Рядок стоїть ПІД клавіатурою — кожні 4px висоти там видно.
ok('перемикач не з\'їдає висоту (≤ 44px)', g.рядок.h <= 44, `${g.рядок.h}px`);
ok('бейдж стоїть у рядку імені, а не під ним', g.бейдж.l >= g.імʼя.l, `бейдж ${g.бейдж.l}, імʼя ${g.імʼя.l}`);
ok('час не виліз за екран поруч із бейджем', g.час.r <= 390, `${g.час.r}px`);

await p.close(); await b.close();

const bad = res.filter(r => !r).length;
console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
