// tests/fab-hint.mjs — ПІДКАЗКА КРУГЛОЇ КНОПКИ (FAB) НА ДОШЦІ, 11.08.2026.
//
// Замовлення Вови дослівно: «якщо користувач заходить, і в нього там зображається
// плюсик, то йому так само треба, щоб розгорталася ця іконка і писала "Подати
// оголошення". Але якщо користувачу прийшло повідомлення і він заходить на дошку,
// і там буде замість плюсика іконка повідомлення, то має розгортатися іконка
// повідомлення та писати "Повідомлення" і певна n-на кількість».
//
// 🔑 ЩО САМЕ МІРЯЄМО. Не наявність класів і не текст у файлі, а ЧОТИРИ наслідки:
//   1) без непрочитаних кнопка каже, що вона подає оголошення;
//   2) з непрочитаними — каже про повідомлення І показує число;
//   3) підказка грає РІВНО ОДИН раз за запуск (другий вхід — тиша);
//   4) зони незалежні: Дошка і Питання мають свої підказки, і показ однієї не
//      з'їдає іншу.
//
// 🔴 ЧОМУ ПУНКТ 2 ПЕРЕВІРЯЄ ЩЕ Й БЕЙДЖ. Число непрочитаних живе у ДВОХ місцях —
// у підписі й на кутовому кружечку кнопки. Поки кнопка розгорнута, вони стоять
// за 40px одне від одного, тобто те саме число надруковано двічі. Рівно цю
// помилку в цій же сесії виправляли в шапці «Питань» («без відповіді 4» у чіпі
// й у рядку під ним) — сторож стежить, щоб вона не завелась удруге.
//
// ⚠️ ЧИСЛО РАХУЄ РОЗМОВИ, А НЕ ОКРЕМІ ПОВІДОМЛЕННЯ (`_unreadChats = people.size`
// у `board-chat.js`, рішення 29.07 — щоб бейдж і список казали одне й те саме).
// Тому підпис «Повідомлення 2», а не «2 повідомлення»: друге стверджувало б те,
// чого ми не знаємо. Стенд навмисно НЕ вимагає слова «повідомлень» у множині.
//
// 🔴 КОНТРОЛЬ (обовʼязковий): на коді до цієї зміни стенд МУСИТЬ упасти —
//     BUNDLE_REV=origin/main CSS_REV=origin/main node tests/fab-hint.mjs
// Там кнопка Дошки не має підпису взагалі.

import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const BUNDLE_REV = process.env.BUNDLE_REV || '';
const CSS_REV    = process.env.CSS_REV    || '';

const t0 = Date.now() - 2 * 864e5;
const ОГОЛОШЕННЯ = [{
  id: 301, type: 'board', text: 'Продам велосипед у доброму стані', title: 'Велосипед',
  author: 'Іван', owner_uid: 'u-me', status: 'published', location: null, category: 'Продам',
  tags: [], photos: [], price: null, ts: t0,
  created_at: new Date(t0).toISOString(), published_at: new Date(t0).toISOString(),
}];

const { url, stop } = await serve();
const b = await launch(chromium);

// Одна сцена = один браузерний контекст: підказка грає ОДИН раз за запуск
// застосунку, тож «без непрочитаних» і «з непрочитаними» неможливо перевірити
// в одному вікні — друга сцена побачила б уже витрачений прапорець.
async function сцена({ непрочитані }) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  if (BUNDLE_REV) {
    const old = projectFile('bundle.js', BUNDLE_REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
  }
  if (CSS_REV) {
    const old = projectFile('style/board.css', CSS_REV);
    await p.route('**/style/board.css', r => r.fulfill({ contentType: 'text/css', body: old }));
  }
  // Непрочитане будуємо з тих самих таблиць, з яких його рахує застосунок:
  // `threads` (з ким розмова) + `messages` (чуже і непрочитане). Підробити саме
  // число не можна — воно виводиться тим самим кодом, що на проді.
  const таблиці = {
    posts: ОГОЛОШЕННЯ, comments: [], announcements: [],
    threads: непрочитані
      ? [{ id: 11, author_uid: 'u-other', buyer_uid: 'u-me', post_id: 301 }]
      : [],
    messages: непрочитані
      ? [{ id: 71, thread_id: 11, sender_uid: 'u-other', read_at: null,
           text: 'Добрий день, велосипед ще актуальний?',
           created_at: new Date(Date.now() - 36e5).toISOString() }]
      : [],
    thread_user_state: [],
  };
  await mockSupabase(p, таблиці, { user: { id: 'u-me', name: 'Я' } });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForTimeout(300);
  return { ctx, p };
}

// Зліпок кнопки: що написано, чи розгорнута, яка іконка видима, чи є бейдж.
const зняти = (p) => p.evaluate(() => {
  const btn = document.querySelector('#board-trigger');
  if (!btn) return null;
  const r = btn.getBoundingClientRect();
  const lab = btn.querySelector('.qa-fab-label');
  const badge = btn.querySelector('.board-trigger-badge');
  const видно = (n) => {
    if (!n) return false;
    const s = getComputedStyle(n);
    return s.display !== 'none' && s.visibility !== 'hidden' &&
           parseFloat(s.opacity) > 0.05 && n.getBoundingClientRect().width > 0;
  };
  return {
    ширина: Math.round(r.width), висота: Math.round(r.height),
    текст: (lab?.textContent || '').replace(/\s+/g, ' ').trim(),
    підписВидно: видно(lab),
    конверт: видно(btn.querySelector('.cm-board-trigger-msg')),
    плюс: видно(btn.querySelector('.cm-board-trigger-icon')),
    бейджВидно: видно(badge),
    бейджТекст: (badge?.textContent || '').trim(),
  };
});

// ── СЦЕНА 1. ДОШКА БЕЗ НЕПРОЧИТАНИХ ─────────────────────────────────────────
{
  const { ctx, p } = await сцена({ непрочитані: false });
  await p.evaluate(() => window.switchTab && window.switchTab('board'));
  await p.waitForTimeout(1300);                       // підказка вже розгорнута
  const підЧас = await зняти(p);
  ok('1а. на Дошці кнопка РОЗГОРТАЄТЬСЯ (ширша за круг)',
     !!підЧас && підЧас.ширина > підЧас.висота + 20,
     підЧас ? `${підЧас.ширина}×${підЧас.висота}px` : 'кнопки немає');
  ok('1б. 🔴 і каже «Подати оголошення»',
     !!підЧас && підЧас.підписВидно && /Подати оголошення/.test(підЧас.текст),
     підЧас ? `«${підЧас.текст}»` : '—');
  ok('1в. іконка — ПЛЮС, не конверт', !!підЧас && підЧас.плюс && !підЧас.конверт);

  await p.waitForTimeout(3200);                       // перечекати всю підказку
  const після = await зняти(p);
  ok('1г. 🔴 і згортається назад у круг',
     !!після && Math.abs(після.ширина - після.висота) <= 2,
     після ? `${після.ширина}×${після.висота}px` : '—');

  // Другий вхід за той самий запуск — підказки більше немає.
  await p.evaluate(() => window.switchTab && window.switchTab('community'));
  await p.waitForTimeout(400);
  await p.evaluate(() => window.switchTab && window.switchTab('board'));
  await p.waitForTimeout(1300);
  const вдруге = await зняти(p);
  ok('1д. 🔴 на ДРУГОМУ вході підказка вже не грає',
     !!вдруге && Math.abs(вдруге.ширина - вдруге.висота) <= 2,
     вдруге ? `${вдруге.ширина}×${вдруге.висота}px` : '—');

  // Зони незалежні: Питання мають СВІЙ прапорець і свою підказку.
  await p.evaluate(() => window.switchTab && window.switchTab('discussions'));
  await p.waitForTimeout(1300);
  const питання = await зняти(p);
  ok('1е. 🔑 у «Питаннях» підказка грає СВОЯ, попри вже показану на Дошці',
     !!питання && питання.ширина > питання.висота + 20 && /Запитати/.test(питання.текст),
     питання ? `${питання.ширина}px «${питання.текст}»` : '—');
  await ctx.close();
}

// ── СЦЕНА 2. ДОШКА З НЕПРОЧИТАНИМ ПОВІДОМЛЕННЯМ ─────────────────────────────
{
  const { ctx, p } = await сцена({ непрочитані: true });
  await p.evaluate(() => window.switchTab && window.switchTab('board'));
  await p.waitForTimeout(1300);
  const s = await зняти(p);
  ok('2а. кнопка розгорнулась', !!s && s.ширина > s.висота + 20,
     s ? `${s.ширина}×${s.висота}px` : 'кнопки немає');
  ok('2б. 🔴 іконка — КОНВЕРТ, а не плюс', !!s && s.конверт && !s.плюс,
     s ? `конверт=${s.конверт} плюс=${s.плюс}` : '—');
  ok('2в. 🔴 підпис каже про ПОВІДОМЛЕННЯ, а не про подачу оголошення',
     !!s && s.підписВидно && /Повідомлення/.test(s.текст) && !/Подати/.test(s.текст),
     s ? `«${s.текст}»` : '—');
  ok('2г. 🔴 у підписі стоїть ЧИСЛО непрочитаних',
     !!s && /\d/.test(s.текст), s ? `«${s.текст}»` : '—');
  // 🛑 Та сама помилка, яку щойно виправляли в шапці «Питань»: одне число двома
  // місцями за 40px. Поки кнопка розгорнута, кутовий бейдж мусить мовчати.
  ok('2д. 🛑 кутовий бейдж НЕ дублює це число, поки кнопка розгорнута',
     !!s && !s.бейджВидно, s ? `бейдж видно=${s.бейджВидно} («${s.бейджТекст}»)` : '—');

  await p.waitForTimeout(3200);
  const після = await зняти(p);
  ok('2е. після згортання кнопка знову круг', !!після && Math.abs(після.ширина - після.висота) <= 2,
     після ? `${після.ширина}×${після.висота}px` : '—');
  ok('2ж. 🔑 і бейдж із числом ПОВЕРТАЄТЬСЯ (він єдиний носій числа в згорнутому стані)',
     !!після && після.бейджВидно, після ? `«${після.бейджТекст}»` : '—');
  await ctx.close();
}

await stop();
await b.close();
done();
