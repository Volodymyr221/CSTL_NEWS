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
   /avaBtn\.classList\.toggle\('fd-com-myava--switch', мояКоманда\)/.test(feed)
   && /мояКоманда = !!сторінка && myPageIds\.has/.test(feed));
// 🔴 ГОЛОВНА ПЕРЕВІРКА ПІСЛЯ СКАРГИ ВОВИ 25.08 («поле вводу не піднімається
// доверху, воно зупиняється знизу»): вибір голосу НЕ сміє бути окремим поверхом
// у стосі під клавіатурою. Там на 390pt лишається ~172px на все.
ok('вибір голосу НЕ додає поверху в стос під клавіатурою',
   !/fd-com-as/.test(feed) && /data-com-as-toggle/.test(feed));
ok('не з команди — голос завжди особистий, хай що в памʼяті',
   /мояКоманда \? \(commentAsChoice\.get\(postId\) \?\? null\) : null/.test(feed));
ok('бейдж «Адмін» бере роль з БАЗИ, а не вгадує на клієнті',
   /rpc\('page_team_flags'/.test(supa));

console.log('\n── Б. ВИСОТА СТОСУ ПІД КЛАВІАТУРОЮ (справжній вимір на 390pt)');

// 🔴 ЗАРАДИ ЧОГО ЦЕЙ БЛОК. Скарга Вови 25.08: «поле вводу не піднімається доверху,
// воно зупиняється знизу». Перша редакція давала окремий рядок «Відповідати як»
// між смугою відповіді і полем — ТРЕТІЙ поверх у стосі, що стоїть під клавіатурою.
// На 390pt клавіатура забирає ~336px, тож кожен зайвий поверх там коштує найдорожче.
//
// 🔑 МІРЯЄМО НЕ «ЧИ ГАРНО», А РІВНО ОДНЕ ЧИСЛО: чи додає вибір голосу хоч піксель
// висоти. Дві однакові сцени, різниця рівно в тому, чи обличчя вміє перемикати.
// Якщо числа збігаються — фіча не займає місця, і повернутись скарга не може.
// 🛑 Так само важливо, ЩО ЦЕ НЕ ДОВОДИТЬ: iOS-клавіатуру Chromium не відтворює
// (HOT_RULES №9), тож зелений рядок тут не означає «на айфоні добре». Він означає
// вужче й чесніше: ми не додали жодного поверху в стос.

const css = projectFile('style/feed.css');       // розкладку міряємо ЗАВЖДИ на свіжій CSS
const ДОВГА = 'КЦ «ЦЕНТР КУЛЬТУРИ, СПОРТУ ТА ТУРИЗМУ ОЛИЦЬКОЇ МІСЬКОЇ РАДИ»';

const html = (перемикач) => `<!doctype html><html><head><meta charset="utf-8"><style>
 *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
 :root{--fd-surface:#fff;--fd-ink:#111;--fd-chip:#eee;--fd-accent:#722F37;
       --fd-muted:#888;--fd-line:#ddd;--fd-divider:#e5e5e5}
 body{width:390px;background:#fff}
 ${css}
</style></head><body>
 <div id="стос">
   <div class="fd-com-replybar"><span class="fd-com-replyto">Відповідь для Олександр</span><button class="fd-com-replyx">×</button></div>
   <div class="fd-com-compose">
     <button class="fd-com-ava fd-com-myava${перемикач ? ' fd-com-myava--switch fd-com-myava--page' : ''}" type="button" data-com-as-toggle></button>
     <input class="fd-com-input" placeholder="Відповідь від імені спільноти…">
     <button class="fd-com-send"></button>
   </div>
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
const заміряти = async (перемикач) => {
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.setContent(html(перемикач));
  await p.waitForTimeout(80);
  const g = await p.evaluate(() => {
    const r = (s) => { const e = document.querySelector(s); if (!e) return null;
      const b = e.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height) }; };
    // Кільце стану: `box-shadow` НЕ входить у getBoundingClientRect, тож міряємо
    // саме оголошену тінь — інакше перевірка була б сліпа до того, що міряє.
    const кільце = (() => { const e = document.querySelector('.fd-com-myava--page');
      if (!e) return { є: false, товщина: 0 };
      const sh = getComputedStyle(e).boxShadow || '';
      const м = sh.match(/(\d+(?:\.\d+)?)px\s*$/) || sh.match(/0px 0px 0px (\d+(?:\.\d+)?)px/);
      return { є: /rgb/.test(sh), товщина: м ? parseFloat(м[1]) : 0, текст: sh };
    })();
    const значок = (() => { const e = document.querySelector('.fd-com-myava--switch');
      if (!e) return { w: 0, знак: '' };
      const cs = getComputedStyle(e, '::after');
      return { w: parseFloat(cs.width) || 0, знак: decodeURIComponent(cs.backgroundImage || '') };
    })();
    const дотик = (() => { const e = document.querySelector('.fd-com-myava--switch');
      if (!e) return { w: 0, h: 0 };
      const b = e.getBoundingClientRect(); const cs = getComputedStyle(e, '::before');
      const inset = Math.abs(parseFloat(cs.inset) || 0);
      return { w: Math.round(b.width + inset * 2), h: Math.round(b.height + inset * 2) }; })();
    return { кільце, значок, дотик, стос: r('#стос'), обличчя: r('.fd-com-myava'), поле: r('.fd-com-input'),
             бейдж: r('.fd-com-badge'), імʼя: r('.fd-com-name'), час: r('.fd-com-time'),
             ширинаТіла: document.body.scrollWidth };
  });
  await p.close();
  return g;
};

const без = await заміряти(false);
const з   = await заміряти(true);
await b.close();

console.log(`   стос БЕЗ перемикача: ${без.стос.h}px  ·  З перемикачем: ${з.стос.h}px`);
console.log(`   обличчя: ${з.обличчя.h}px  ·  поле: ${з.поле.l}…${з.поле.r}`);
console.log(`   бейдж «Спільнота»: ${з.бейдж.l}…${з.бейдж.r}  ·  час: ${з.час.l}…${з.час.r}  ·  тіло ${з.ширинаТіла}px`);

// 🔴 ГОЛОВНЕ ЧИСЛО ЦЬОГО СТЕНДА.
ok('вибір голосу НЕ додає ЖОДНОГО пікселя висоти стосу',
   з.стос.h === без.стос.h, `${без.стос.h}px → ${з.стос.h}px`);
// Обличчя не сміє розпухнути від позначки: вона стоїть поверх (absolute).
// Ціль дотику мусить бути 44px (обличчя лише 34px) — і при цьому НЕ рости в стос.
ok('зона дотику перемикача ≥ 44px', з.дотик.h >= 44 && з.дотик.w >= 44,
   `${з.дотик.w}×${з.дотик.h}px при обличчі ${з.обличчя.h}px`);
ok('позначка перемикання не збільшує обличчя',
   з.обличчя.h === без.обличчя.h, `${без.обличчя.h}px → ${з.обличчя.h}px`);
// ── ТРИ РІЗНІ ЗАДАЧІ — ТРИ РІЗНІ ЗАСОБИ (26.08) ──────────────────────────────
// Скарга Вови: «стрілочку погано видно, взагалі не зрозуміло що там переключається
// акаунт». Розбито на три питання, бо в них різні відповіді:
//   ЩО ЗАРАЗ?     → кільце в кольорі бренду (видно периферійним зором)
//   ЦЕ КНОПКА?    → значок ⇄ (а не ▾: «вниз» читається як «розгорнути список»)
//   ВОНО Є?       → підказка рівно один раз (у коді, перевірка нижче)
ok('стан «говорю від спільноти» видно КІЛЬЦЕМ, а не лише значком',
   з.кільце.є && з.кільце.товщина >= 2, `товщина ${з.кільце.товщина}px`);
ok('кільце НЕ додає висоти (це тінь, а не рамка)',
   з.стос.h === без.стос.h, `${без.стос.h}px → ${з.стос.h}px`);
ok('значок ⇄ (двонаправлений), а не ▾',
   /polyline points='7 7 2 12 7 17'/.test(з.значок.знак) && !/polyline points='6 9 12 15 18 9'/.test(з.значок.знак));
ok('значок виріс до 16px (на 13px форми не було видно)',
   з.значок.w >= 16, `${з.значок.w}px`);
ok('підказка показується РІВНО ОДИН РАЗ і зʼїдає виняток приватного вікна',
   /cstl-voice-hint:\$\{myUid\}/.test(feed)
   && /localStorage\.setItem\(ключ, '1'\)/.test(feed)
   && /catch \(_\) \{ \/\* приватне вікно \*\/ \}/.test(feed));

ok('поле вводу лишилось на своєму місці', з.поле.l === без.поле.l && з.поле.r === без.поле.r,
   `${без.поле.l}…${без.поле.r} → ${з.поле.l}…${з.поле.r}`);
ok('сторінка не поїхала вбік', з.ширинаТіла <= 390, `${з.ширинаТіла}px`);
ok('бейдж стоїть у рядку імені, а не під ним', з.бейдж.l >= з.імʼя.l, `бейдж ${з.бейдж.l}, імʼя ${з.імʼя.l}`);
ok('час не виліз за екран поруч із бейджем', з.час.r <= 390, `${з.час.r}px`);

const bad = res.filter(r => !r).length;
console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
