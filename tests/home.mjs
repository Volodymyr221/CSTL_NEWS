// Стенд №37: ГОЛОВНА СТОРІНКА — Home Dashboard («Громада»).
//
// Заведено 04.08.2026 разом із перебудовою головної (потік /byyou).
// ⚠️ Не «чи є класи в CSS», а чи ПРАЦЮЮТЬ переходи, якими людина користується
// щодня: погода → модалка по годинах, новина → стаття, «Усі новини» → хаб,
// кнопки секцій → свої вкладки.
//
// 🔴 ЗАРАДИ ЧОГО ВІН ІСНУЄ. Під час самої перебудови делегат кліків новин висів
// на класі `.cm-block--news`, який зник разом зі старою розміткою. Тап по новині
// перестав відкривати статтю — мовчки, без жодної помилки в консолі. Спіймав це
// не огляд коду і не скріншот, а стенд. Тому переходи перевіряються тапом.
//
// ⚠️ ПОГОДУ І НАЗВУ МІСТА ПІДМІНЯЄМО, а не глушимо: порожня шапка має іншу
// висоту, ніж заповнена, і половина перевірок стала б беззмістовною.
// ⚠️ `serviceWorkers: 'block'` — восьмий випадок брехливої перевірки (03.08):
// без цього запити йдуть повз `page.route` і підміна тихо не діє.
// ⚠️ Гейт правил Дошки (`.app-modal--brules`) блокуючий при першому вході —
// його треба ПРИЙНЯТИ, інакше він перехоплює всі наступні тапи.
// ⚠️ Чекаємо 7с перед перевірками: погода має фолбек на координати Олики через
// 4с (діалог геолокації в headless не відповідає ніколи).
import { chromium } from 'playwright';
import { chromiumPath, serve } from './_lib.mjs';
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep?{executablePath:ep}:{}) });
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0,120)); });
await p.route('**://*.supabase.co/**', r => r.abort());
await p.route('**://nominatim.openstreetmap.org/**', r => r.fulfill({contentType:'application/json',body:JSON.stringify({address:{village:'Олика'}})}));
const day=n=>Array.from({length:n},(_,i)=>new Date(Date.now()+i*864e5).toISOString().slice(0,10));
const hrs=day(1).flatMap(d=>Array.from({length:24},(_,h)=>`${d}T${String(h).padStart(2,'0')}:00`));
await p.route('**://api.open-meteo.com/**', r => r.fulfill({contentType:'application/json',body:JSON.stringify({
  utc_offset_seconds:10800, current:{temperature_2m:18.4,weather_code:3,apparent_temperature:17.2},
  hourly:{time:hrs,temperature_2m:hrs.map((_,i)=>14+(i%12)),precipitation_probability:hrs.map((_,i)=>(i*7)%100),weather_code:hrs.map(()=>3)},
  daily:{time:day(7),weather_code:[3,1,61,0,2,3,80],temperature_2m_max:[24,26,21,27,25,23,20],temperature_2m_min:[13,14,12,15,14,13,11]}})}));
await p.goto(url, { waitUntil:'domcontentloaded' });
await p.waitForTimeout(2000);
// приймаємо банер згоди — інакше він перехоплює тапи внизу
await p.evaluate(() => document.querySelector('.consent-ok, [data-consent-ok], .pwa-cta button')?.click());
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(7000);

const R=[]; const ok=(n,c,i='')=>{R.push(!!c);console.log(`${c?'✅':'❌'} ${n}${i?'  — '+i:''}`)};

// 1. Шапка
const head = await p.evaluate(() => {
  const t = document.querySelector('.hm-top');
  return { has:!!t, hi:document.querySelector('.hm-hi')?.textContent.trim(),
    wx:document.querySelector('.hm-wx-t')?.textContent.trim(),
    days:document.querySelectorAll('.hm-wx-day').length,
    ava:!!document.querySelector('.hm-ava[data-account-btn]') };
});
ok('шапка намальована', head.has);
ok('привітання є', !!head.hi, head.hi);
ok('погода в шапці', head.wx === '18°', head.wx);
ok('прогноз 7 днів', head.days === 7, String(head.days));
ok('кнопка кабінету на місці', head.ava);

// 2. Погода → модалка по годинах
await p.locator('.hm-wx-day').nth(0).click();
await p.waitForTimeout(700);
ok('тап по дню відкриває модалку погоди', await p.evaluate(()=>!!document.querySelector('.app-modal--weather')));
await p.evaluate(()=>document.querySelector('.app-modal-close')?.click());
await p.waitForTimeout(500);

// 3. Новина → стаття
await p.locator('#cm-news-board [data-article-id]').first().click();
await p.waitForTimeout(700);
ok('тап по новині відкриває статтю', await p.evaluate(()=>document.getElementById('article-modal')?.classList.contains('open')));
await p.evaluate(()=>window.closeArticleModal && window.closeArticleModal());
await p.waitForTimeout(500);

// 4. «Усі новини» → хаб
await p.locator('#cm-news-board [data-cm-news-all]').click();
await p.waitForTimeout(800);
ok('«Усі новини» відкриває хаб', await p.evaluate(()=>!!document.querySelector('.nh-screen')));
await p.goBack(); await p.waitForTimeout(700);
ok('назад повертає на Громаду', await p.evaluate(()=>document.querySelector('.app-main')?.dataset.tab==='community'));

// 5. Переходи по вкладках із секцій
// ⚠️ «Афіші» тут НЕМАЄ навмисно — див. окрему перевірку нижче.
for (const [sel,tab,name] of [['#hm-board .hm-more','board','Дошка'],['#hm-bus .hm-more','buses','Розклад']]) {
  await p.evaluate(()=>window.switchTab('community')); await p.waitForTimeout(400);
  const has = await p.evaluate(s=>!!document.querySelector(s), sel);
  if (!has) { ok(`кнопка «${name}» існує`, false); continue; }
  await p.locator(sel).click(); await p.waitForTimeout(700);
  // Гейт правил Дошки блокуючий при першому вході — приймаємо, інакше він
  // перехоплює всі наступні тапи (задокументовано в CLAUDE.md).
  await p.evaluate(()=>document.querySelector('.brules-ok, .app-modal--brules button')?.click());
  await p.waitForTimeout(400);
  ok(`«${name}» веде на вкладку ${tab}`, await p.evaluate(()=>document.querySelector('.app-main')?.dataset.tab)===tab);
}
await p.evaluate(()=>window.switchTab('community')); await p.waitForTimeout(500);

// 5.0 🔴 КАПСУЛИ-СТАТУСИ: ЖИВІ ЧИСЛА І ДИСЦИПЛІНОВАНИЙ РУХ.
// Компонент циклічно змінює повідомлення — тобто повертає на сторінку рух,
// якого ми щойно позбулись (було 4 автоматичні рухи, стало 0). Сторож стежить
// саме за тим, щоб цей рух лишався керованим, а числа — справжніми.
const caps = await p.evaluate(()=>{
  const box = document.getElementById('hm-caps');
  const list = [...document.querySelectorAll('.hm-cap2')];
  return {
    є: !!box, n: list.length,
    порожня: box && !box.hidden && list.length === 0,
    тексти: list.map(c => c.querySelector('.hm-cap2-v')?.textContent || ''),
    крапки: document.querySelectorAll('.hm-cap2-dots i').length,
    старі: !!document.getElementById('hm-now'),
  };
});
ok('старої смуги «Зараз» більше немає', !caps.старі);
ok('капсули намальовані', caps.n > 0, `${caps.n} шт`);
ok('🔴 порожньої коробки капсул не буває', !caps.порожня);
// Кожне повідомлення мусить містити ЧИСЛО — це статус, а не гасло.
ok('у кожній капсулі є число', caps.тексти.every(t => /\d/.test(t)), caps.тексти.join(' | '));
ok('крапки циклу намальовані', caps.крапки > 0, `${caps.крапки}`);

// Рух: текст мусить справді змінитись. Це наслідок, а не наявність setInterval.
const capBefore = await p.evaluate(()=>[...document.querySelectorAll('.hm-cap2-v')].map(v=>v.textContent));
await p.waitForTimeout(7200);
const capAfter = await p.evaluate(()=>[...document.querySelectorAll('.hm-cap2-v')].map(v=>v.textContent));
ok('🔴 цикл справді міняє повідомлення',
   capBefore.some((t,i)=>t !== capAfter[i]), `${capBefore.join('/')} → ${capAfter.join('/')}`);

// Запобіжник: капсули поза екраном мусять ставати на паузу.
await p.evaluate(()=>{ const m=document.querySelector('.app-main'); m.scrollTop = m.scrollHeight; });
await p.waitForTimeout(900);
const paused = await p.evaluate(()=>[...document.querySelectorAll('.hm-cap2')].map(c=>c.dataset.paused));
ok('🔴 поза екраном цикл спиняється', paused.every(v=>v==='1'), `paused: ${paused.join(',')}`);
await p.evaluate(()=>{ const m=document.querySelector('.app-main'); m.scrollTop = 0; });
await p.waitForTimeout(600);

// 5.1 🔴 СЕКЦІЇ ПОДІЙ НА ГОЛОВНІЙ НЕМАЄ (рішення Вови 04.08 «події прибрати»).
// Причина була не в даних: вести з неї не було куди — вкладки Подій у
// застосунку не існує, і кнопка «Афіша →» вела людину у Стрічку.
// Сторож не дає повернути секцію назад доти, доки не зʼявиться справжній екран.
const ev = await p.evaluate(()=>({
  sec: !!document.getElementById('hm-events'),
  cont: !!document.getElementById('cm-event-content'),
  afisha: [...document.querySelectorAll('#cm-content .hm-more')].some(b => /афіш/i.test(b.textContent)),
}));
ok('🔴 секції подій на головній немає', !ev.sec && !ev.cont);
ok('🔴 кнопки «Афіша», що вела у Стрічку, немає', !ev.afisha);

// 5.2 🔴 ФОТО НА ФОНІ НЕ НАКРИВАЄ ВМІСТ.
// Перша версія мала z-index: 0 — і фото лягло ПОВЕРХ усього непозиціонованого
// (шапка, назви секцій зникли). Міряємо НАСЛІДОК: що реально під пальцем у
// точці заголовка секції — текст чи фон.
const bgz = await p.evaluate(()=>{
  const bg = document.querySelector('.hm-bg');
  const k = document.querySelector('#cm-news-board .hm-kicker');
  const r = k.getBoundingClientRect();
  const at = document.elementFromPoint(r.left + 4, r.top + r.height/2);
  return { z: getComputedStyle(bg).zIndex, hitsBg: at === bg || bg.contains(at), tag: at?.className };
});
ok('🔴 фон лежить ПІД вмістом (z-index відʼємний)', bgz.z === '-1', `z-index: ${bgz.z}`);
ok('🔴 заголовок секції не накритий фоном', !bgz.hitsBg, `під пальцем: "${bgz.tag}"`);

// 6. Блоки наповнились
const filled = await p.evaluate(()=>{
  const t = id => (document.getElementById(id)?.textContent||'').trim();
  const sk = id => document.getElementById(id)?.querySelector('.hm-sk-row');
  return { news:t('cm-news-content').length,
    board:t('cm-board-content').length, bus:t('cm-bus-content').length, cont:t('cm-contacts-content').length,
    stuck:['cm-news-content','cm-board-content','cm-bus-content','cm-contacts-content'].filter(sk) };
});
ok('новини наповнились', filled.news>40, String(filled.news));
ok('оголошення наповнились', filled.board>10, String(filled.board));
ok('автобуси наповнились', filled.bus>10, String(filled.bus));
ok('контакти наповнились', filled.cont>10, String(filled.cont));
ok('жоден блок не завис на скелеті', filled.stuck.length===0, filled.stuck.join(', '));

ok('помилок у консолі нема', errs.length===0, errs.slice(0,3).join(' | '));
const bad = R.filter(r=>!r).length;
console.log(`\n${bad?'❌':'✅'} ${R.length-bad}/${R.length} перевірок пройдено`);
await b.close(); await stop();
process.exit(bad?1:0);
