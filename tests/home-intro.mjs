// Стенд: ЗНАЙОМСТВО НА ПОРОЖНІЙ ГРОМАДІ (секція `#hm-intro`).
//
// 🔴 НАВІЩО ЗАВЕДЕНИЙ (27.09.2026). Оцінка готовності 26.09 назвала два пункти,
// які блокували запуск і виявились одним місцем: застосунок НІДЕ не казав
// людині, що він таке, а Громада на нульових даних ховала майже все і лишала
// привітання, погоду й два рядки «поки порожньо». `KURS.md` вимагає дослівно:
// «перший житель не сміє побачити порожню стрічку».
//
// 🔑 ЩО ТУТ СТЕРЕЖЕТЬСЯ — НЕ НАЯВНІСТЬ БЛОКУ, А ЙОГО УМОВА. Блок, який висить
// завжди, — це плашка, яку сотий раз гортає той, хто вже все зрозумів; блок,
// який не показується ніколи, — мертвий код. Тому перевірок ДВІ, і друга
// важливіша: коли в громаді зʼявився зміст, знайомство мусить ЗНИКНУТИ САМО.
//
// ⚠️ НОВИНИ НАВМИСНО НЕ ВВАЖАЮТЬСЯ ЗМІСТОМ, і саме це найлегше зламати
// наступною правкою. Новини привозить парсер — вони є завжди, і в день запуску
// теж. Якби вони рахувались, блок не показався б НІКОЛИ. Прогін 3 нижче міряє
// рівно це: новини є, змісту від жителів немає, знайомство мусить стояти.
//
// 🔴 КОНТРОЛЬ ЗАВЕДЕНИЙ ВІДРАЗУ, А НЕ ПОТІМ:
//     CSS_REV=origin/main BUNDLE_REV=origin/main node tests/home-intro.mjs
// На коді до 27.09 секції `#hm-intro` не існує зовсім, тож перші ж перевірки
// мусять почервоніти. ⚠️ Потрібні САМЕ ДВІ змінні: логіка живе в `bundle.js`,
// а висота й переноси кнопок — у `style/home.css`.
// 🔑 Без цього блоку «контроль» просто ігнорує змінні й ганяє свіжий код —
// це вже траплялось у `home-contacts` (29/29 на «старому» коді) і трапилось зі
// мною на першій редакції цього самого файла.
import { readdirSync } from 'fs';
import { join } from 'path';
import { chromium } from 'playwright';
import { launch, serve, reporter, ROOT, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const BUNDLE_REV = process.env.BUNDLE_REV || '';
const CSS_REV    = process.env.CSS_REV || '';

const дні = n => new Date(Date.now() - n * 864e5).toISOString();

const ОГОЛОШЕННЯ = [
  { id: 201, type: 'board', status: 'published', category: 'продам', owner_uid: 'u1',
    title: 'Продам картоплю', text: 'Сорт Белароса, самовивіз.',
    location: 'Олика', price: 12, photos: [], created_at: дні(1), published_at: дні(1) },
];

const { ok, done } = reporter();
const { url, stop } = await serve();
const b = await launch(chromium);

const errs = [];

// Один прогін = свіжий контекст: знайомство читає стан DOM, і залишки минулого
// прогону зробили б наступний нечесним.
// @param дія  необовʼязкова перевірка НА ЖИВІЙ сторінці, до закриття контексту:
//              зріз вище міряє розмітку, а дія — наслідок тапу.
async function прогін(tables, дія) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await mockSupabase(p, tables);
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  if (BUNDLE_REV) {
    const body = projectFile('bundle.js', BUNDLE_REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
  }
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  if (CSS_REV) {
    await p.evaluate(() => document.querySelectorAll('link[rel=stylesheet]').forEach(l => l.disabled = true));
    const css = readdirSync(join(ROOT, 'style')).filter(f => f.endsWith('.css'))
      .map(f => { try { return projectFile('style/' + f, CSS_REV); } catch { return ''; } }).join('\n');
    await p.addStyleTag({ content: css });
  }
  await p.evaluate(() => window.switchTab && window.switchTab('community'));
  // Чекаємо не на знайомство (його може й не бути — це й перевіряємо), а на те,
  // що блоки Громади вже відпрацювали: контейнер оголошень перестав бути скелетом.
  await p.waitForFunction(() => {
    const d = document.getElementById('cm-board-content');
    return d && !d.querySelector('.hm-sk-row');
  }, { timeout: 15000 }).catch(() => {});
  // Спостерігач перераховує стан на наступному кадрі — даємо йому цей кадр.
  await p.waitForTimeout(400);
  const зріз = await p.evaluate(() => {
    const sec = document.getElementById('hm-intro');
    const card = sec && sec.querySelector('.hm-intro');
    const acts = sec ? [...sec.querySelectorAll('.hm-intro-act')] : [];
    return {
      секціяЄ:   !!sec,
      видно:     !!(sec && !sec.hasAttribute('hidden')),
      заголовок: (card?.querySelector('.hm-intro-title')?.textContent || '').trim(),
      текст:     (card?.querySelector('.hm-intro-text')?.textContent || '').replace(/\s+/g, ' ').trim(),
      дії:       acts.map(x => `${x.textContent.trim()}→${x.dataset.switchTab}`),
      влазить:   acts.every(x => x.getBoundingClientRect().right <= window.innerWidth + 1),
      висота:    sec ? Math.round(sec.getBoundingClientRect().height) : 0,
      екран:     window.innerHeight,
      новин:     document.querySelectorAll('#cm-news-content .hm-card, #cm-news-content article').length,
    };
  });
  const наслідок = дія ? await дія(p) : null;
  await ctx.close();
  return { ...зріз, наслідок };
}

// ── ПРОГІН 1: громада порожня ────────────────────────────────────────────────
// 🔑 ТАП ПО ПЕРШІЙ ДІЇ МІРЯЄТЬСЯ ТУТ ЖЕ, а не окремим прогоном: знайомство
// показується лише на порожній громаді, тож інакше сцену треба було б ставити
// двічі. Міряємо НАСЛІДОК — чи справді відкрилась вкладка Автобусів, — а не
// наявність атрибута: атрибут `data-switch-tab` працює ЧУЖИМ делегуванням у
// `community.js`, яке слухає `#cm-content`. Якщо секцію колись перенесуть поза
// цей контейнер, атрибути лишаться на місці, а всі три кнопки стануть мертвими
// і цього ніхто не помітить. 🛑 Саме цей розрив між «написано» і «працює» тут
// і стережеться.
const порожня = await прогін({ posts: [], announcements: [] }, async (p) => {
  await p.evaluate(() => document.querySelector('.hm-intro-act')?.click());
  await p.waitForTimeout(500);
  return p.evaluate(() => {
    const стор = document.getElementById('page-buses');
    return { автобусиВидно: !!(стор && стор.offsetParent !== null) };
  });
});
ok('секція знайомства існує в розмітці', порожня.секціяЄ);
ok('🔴 на порожній громаді знайомство ВИДНО', порожня.видно);
ok('заголовок на місці', порожня.заголовок === 'Місцеве — в одному місці', порожня.заголовок);
ok('текст називає застосунок і громаду',
   порожня.текст.includes('CSTL LIFE') && порожня.текст.includes('Олицької'),
   порожня.текст.slice(0, 70));
ok('🔑 три дії, і кожна веде у свою вкладку',
   порожня.дії.length === 3
   && порожня.дії[0].endsWith('→buses')
   && порожня.дії[1].endsWith('→board')
   && порожня.дії[2].endsWith('→discussions'),
   порожня.дії.join(' · '));
ok('🛑 перша дія — автобуси (єдине, що працює при нулі користувачів)',
   порожня.дії[0] === 'Коли автобус→buses', порожня.дії[0]);
ok('кнопки не вилазять за екран', порожня.влазить);
ok('🔴 тап по першій дії СПРАВДІ відкриває Автобуси, а не лише має атрибут',
   порожня.наслідок?.автобусиВидно === true,
   порожня.наслідок?.автобусиВидно ? 'вкладка відкрилась' : 'кнопка мертва');
ok('блок не займає весь екран', порожня.висота > 0 && порожня.висота < порожня.екран * 0.6,
   `${порожня.висота}px при екрані ${порожня.екран}px`);

// ── ПРОГІН 2: в громаді зʼявився зміст ───────────────────────────────────────
// 🔑 ГОЛОВНА ПЕРЕВІРКА СТЕНДА. Одне оголошення — і знайомство мусить зникнути
// само, без жодного тапу й без перезапуску застосунку.
const зі_змістом = await прогін({ posts: ОГОЛОШЕННЯ, announcements: [] });
ok('🔴 зʼявилось оголошення — знайомство ЗНИКЛО', !зі_змістом.видно,
   зі_змістом.видно ? 'видно' : 'сховано');
ok('КОНТРОЛЬ: секція при цьому лишається в розмітці (сховано, а не знесено)',
   зі_змістом.секціяЄ);

// ── ПРОГІН 3: новини Є, змісту від жителів немає ─────────────────────────────
// 🛑 САМОКОНТРОЛЬ УМОВИ. Новини не мусять вважатись змістом громади — інакше
// блок не показався б ніколи. Перевіряємо на тій самій порожній базі, що прогін
// 1, але тепер дивимось І на новини: вони приїжджають із `data/articles.json`,
// тобто з файлу репозиторію, а не з підробленої бази.
ok('🔑 новини в цьому прогоні СПРАВДІ були', порожня.новин > 0, `${порожня.новин} карток`);
ok('🛑 і все одно знайомство стоїть — новини не зміст громади', порожня.видно);

ok('помилок у консолі нема', errs.length === 0, errs.slice(0, 2).join(' | '));

await b.close();
await stop();
done();
