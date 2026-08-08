// Стенд №50: ЗАЛОГІНЕНА ПОЛОВИНА ДОШКИ — ПОДАЧА І «МОЇ ОГОЛОШЕННЯ».
//
// 🔴 ЧОМУ ЦЕЙ СТЕНД ІСНУЄ — і чому його не було раніше.
// Заглушка бази (`_board-fixture.mjs`) до 07.08 вміла лише «ніхто не ввійшов»
// (`getSession → null`). Тобто **вся половина Дошки за `isLoggedIn()` не була
// покрита нічим**: подача оголошення, «Мої оголошення», статуси, «Збережені»,
// листування. Аудит Дошки (07.08) чесно записав це як межу прогону — і рівно там,
// у непокритій половині, наступного дня знайшовся **B-30**: пункт FAB
// «Повідомлення» мовчки не відкривався, а всі 46 стендів були зелені.
//
// ➡️ Це друга половина знахідки **A-1** («сторожі стережуть вигляд, а не поведінку»).
// Перша половина — `tests/board-filters.mjs` (пошук, фільтри, порожні стани).
//
// ЩО МІРЯЄ:
//   1. валідація подачі — форма НЕ пускає порожнє оголошення в базу;
//   2. валідація називає ПЕРШУ незаповнену річ, а не «щось не так»;
//   3. «Мої оголошення» відкриваються і показують ЛИШЕ свої, розкладені по статусах;
//   4. чужого оголошення в «Моїх» немає (найдорожча помилка цього екрана).
//
// ⚠️ Міряємо НАСЛІДОК: що з'явилось на екрані і що пішло (чи не пішло) в базу —
// а не «клас застосовано» і не «функція існує в коді».
//
// 🔴 КОНТРОЛЬ: `BUNDLE_REV=<ревізія> node tests/board-owner.mjs`.
//
// ⚠️ `serviceWorkers: 'block'` — інакше запити йдуть через `sw.js` повз `page.route`.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';

const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Вова' } };
const NOW = new Date().toISOString();
const P = (id, owner, title, status = 'published') => ({
  id, type: 'board', category: 'продам', location: 'Олика', title,
  text: 'опис оголошення', price: '100', author: owner === ME.id ? 'Вова' : 'Сусід',
  owner_uid: owner, contact: '', photos: [], status,
  published_at: NOW, created_at: NOW,
});

// Двоє моїх (одне живе, одне завершене) і одне ЧУЖЕ — саме воно ловить
// найдорожчу помилку екрана «Мої оголошення».
const POSTS = [
  P('my-1', ME.id, 'МІЙ ВЕЛОСИПЕД'),
  P('my-2', ME.id, 'МОЇ ДРОВА', 'archived'),
  P('other-1', 'u-other', 'ЧУЖИЙ ПРИЧІП'),
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();

await mockSupabase(p,
  { posts: POSTS, threads: [], messages: [], thread_user_state: [], announcements: [] },
  { user: ME, profiles: [{ uid: ME.id, name: 'Вова', avatar_url: '' }] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
if (REV) {
  const body = projectFile('bundle.js', REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
}

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(200);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('.brules-ok')?.click());
await p.waitForTimeout(1200);

const відкритиFab = async (act) => {
  await p.evaluate(() => document.getElementById('board-trigger')?.click());
  await p.waitForTimeout(300);
  await p.evaluate((a) => document.querySelector(`#board-fab-menu [data-fab="${a}"]`)?.click(), act);
  await p.waitForTimeout(1300);
};
const тости = () => p.evaluate(() =>
  [...document.querySelectorAll('.toast')].map(t => t.textContent.trim()).filter(Boolean));

// ── 1. ПОДАЧА: форма не пускає порожнє ──────────────────────────────────────
await відкритиFab('post');
const формаЄ = await p.evaluate(() => !!document.getElementById('cm-board-modal-form'));
ok('сцена: модалка подачі відкрилась', формаЄ);

// Тиснемо «Опублікувати» на ПОРОЖНІЙ формі. Наслідок, який має побачити людина:
// оголошення не пішло, і їй сказали, чого саме бракує.
await p.evaluate(() => document.querySelector('.cm-board-submit')?.click());
await p.waitForTimeout(700);

const післяПорожньої = await p.evaluate(() => ({
  формаЩеВідкрита: !!document.getElementById('cm-board-modal-form'),
  тости: [...document.querySelectorAll('.toast')].map(t => t.textContent.trim()),
}));
ok('🔴 порожнє оголошення НЕ публікується (форма лишилась відкритою)',
   післяПорожньої.формаЩеВідкрита);
ok('🔴 людині сказано, ЧОГО бракує (а не «щось не так»)',
   післяПорожньої.тости.some(t => /категор/i.test(t)),
   післяПорожньої.тости.join(' | ') || '(тостів немає)');

// Обрали категорію → наступна незаповнена річ мусить назватись сама.
// ⚠️ Чекаємо ДОВГО (2.2с): `showToast` має ЧЕРГУ — друге повідомлення не з'явиться,
// поки перше не провисіло 1.5с. Перша версія стенда чекала 700мс, бачила ще СТАРИЙ
// тост «Оберіть категорію» і оголошувала фікс зламаним. Перевірка міряла не те, що
// думала, — той самий клас, від якого проєкт страждав уже девʼять разів.
const чіпОбрано = await p.evaluate(() => {
  const c = document.querySelector('#bm-chips [data-cat]');
  if (!c) return false;
  c.click();
  return c.classList.contains('active') || !!document.querySelector('#bm-chips .bm-chip.active');
});
ok('сцена: категорію обрано (чіп став активним)', чіпОбрано);

await p.waitForTimeout(400);
await p.evaluate(() => document.querySelector('.cm-board-submit')?.click());
await p.waitForTimeout(2200);
const другаПідказка = await тости();
ok('валідація веде по черзі: далі просить заголовок',
   другаПідказка.some(t => /заголов/i.test(t)),
   другаПідказка.join(' | ') || '(тостів немає)');

// Закрити модалку подачі ✕ (`core/modal.js`). Чернетка лишиться — це окремий
// стенд `board-draft`, сюди не лізе.
//
// ⚠️ ТУТ Я СПОЧАТКУ ПОМИЛИВСЯ, і помилка варта запису: перша версія закривала
// модалку через `history.back()`, бо так закриваються ПОВНОЕКРАННІ ШАРИ
// (`core/layers.js`). Але модалка подачі — не шар, а аркуш `core/modal.js`, і
// записи в історії в неї немає. Тому `history.back()` відмотував БРАУЗЕР зі
// сторінки застосунку: далі в пісочниці не було ні Дошки, ні FAB, і стенд
// повідомляв «екран "Мої оголошення" не відкрився» — правду про наслідок і
// брехню про причину. У застосунку ТРИ різні механізми закриття (шар · аркуш ·
// стаття), і плутати їх у стендах уже коштувало часу (див. `tests/README.md`).
await p.evaluate(() => document.querySelector('.app-modal-close')?.click());
await p.waitForTimeout(900);
const модалкаЗакрилась = await p.evaluate(() => !document.getElementById('cm-board-modal-form'));
ok('сцена: модалка подачі закрилась', модалкаЗакрилась);

// ── 2. «МОЇ ОГОЛОШЕННЯ»: лише свої, розкладені по статусах ──────────────────
await відкритиFab('mine');
const мої = await p.evaluate(() => {
  const scr = document.querySelector('.pm-screen');
  const текст = scr ? scr.innerText : '';
  return {
    екранЄ: !!scr,
    вкладки: [...document.querySelectorAll('.pm-ad-tab')].map(t => t.textContent.trim()),
    текст,
  };
});
ok('сцена: екран «Мої оголошення» відкрився', мої.екранЄ);

// ⚠️ ЧОМУ ОСТАННІ ТРИ — ПІД УМОВОЮ. Якщо екран не відкрився, перевірка «чужого
// оголошення тут немає» стає ЗЕЛЕНОЮ безкоштовно: на порожньому екрані немає
// нічого, зокрема й чужого. Саме так вона й засвітилась зеленим у першому прогоні
// цього стенда, поки екран не відкривався взагалі. Зелене з неправильної причини
// гірше за червоне — воно не просить нічого робити.
if (мої.екранЄ) {
  ok('є розкладка по статусах (Активні / На модерації / Архів)',
     мої.вкладки.length === 3 && /Активн/.test(мої.вкладки[0]),
     мої.вкладки.join(' · ') || '(вкладок немає)');
  ok('🔴 своє оголошення в списку є', /ВЕЛОСИПЕД/i.test(мої.текст),
     мої.текст.slice(0, 80).replace(/\s+/g, ' '));
  ok('🔴 ЧУЖОГО оголошення в «Моїх» немає', !/ПРИЧІП/i.test(мої.текст),
     /ПРИЧІП/i.test(мої.текст) ? 'чуже протекло!' : 'чисто');
} else {
  ok('🔴 сцена «Моїх оголошень» не зібралась — решту не міряю', false,
     'екран не відкрився, три перевірки нижче були б зеленими безпідставно');
}

await ctx.close(); await b.close(); await stop();
done();
