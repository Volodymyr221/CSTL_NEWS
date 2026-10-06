// launch-film/shoot.mjs — ЗНІМАЄ СПРАВЖНІ ЕКРАНИ «Громади» ДЛЯ РОЛИКА ЗАПУСКУ.
//
// 🔴 НАВІЩО ОКРЕМИЙ ПРИЛАД, А НЕ МАЛЮВАННЯ ІНТЕРФЕЙСУ РУКАМИ.
// Замовлення Вови на ролик (28.09) містило вимогу великими літерами: «Keep the
// phone screens pixel-accurate. Do not recreate the interface from memory.»
// Намальований «схожий» інтерфейс — це брехня в рекламі: людина ставить додаток
// і бачить інше. Тому екрани в ролику — знімки СПРАВЖНЬОГО застосунку з цього ж
// репозиторію, зроблені тим самим браузером, що й усі 180 стендів.
//
// 🔑 ПЕРЕВИКОРИСТОВУЄ ІНФРАСТРУКТУРУ СТЕНДІВ (`tests/_lib.mjs`,
// `tests/_board-fixture.mjs`). Це не економія рядків: сервер, пошук браузера і
// підроблена база вже вилизані десятками падінь. Своя копія розійшлася б із
// ними за перший же місяць — саме так у цьому проєкті вже губились стенди.
//
// ⚠️ ЩО ПІДМІНЯЄТЬСЯ І ЧОМУ ЦЕ ЧЕСНО:
//   • заслінка розробки — прапорець `cstl_dev_ok` (інакше видно лише блюр);
//   • погода — Open-Meteo з пісочниці недосяжний, без неї віджет малює помилку;
//   • Supabase — те саме, недосяжний; беремо ту саму заглушку, що й стенди.
// 🛑 Верстка, шрифти, кольори, відступи НЕ чіпаються ЖОДНОЮ мірою. Підмінені
// лише дані, які й так приходять із мережі.
//
// Запуск:  node launch-film/shoot.mjs
// Вихід:   launch-film/shots/*.png  (1170×2532, тобто iPhone 390×844 ×3)

import { chromium } from 'playwright';
import { launch, serve } from '../tests/_lib.mjs';
import { mockSupabase } from '../tests/_board-fixture.mjs';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const ТУТ = dirname(fileURLToPath(import.meta.url));
const OUT = join(ТУТ, 'shots');
mkdirSync(OUT, { recursive: true });

const ряд = (n, v) => Array.from({ length: n }, (_, i) => v(i));

// Погода навмисно НЕ ідеальна: 18° і легка хмарність — правдоподібний вересень
// на Волині. Рекламний «+28 сонячно» одразу читається як вигадка.
const ПОГОДА = {
  current: { temperature_2m: 18.2, apparent_temperature: 17.4, weather_code: 1 },
  daily: {
    time: ряд(7, i => new Date(Date.now() + i * 864e5).toISOString().slice(0, 10)),
    weather_code: [1, 2, 3, 61, 2, 0, 1],
    temperature_2m_max: [18, 17, 15, 14, 16, 19, 20],
    temperature_2m_min: [9, 8, 7, 8, 9, 10, 11],
  },
  hourly: {
    time: ряд(24, i => new Date(Date.now() + i * 36e5).toISOString().slice(0, 13) + ':00'),
    temperature_2m: ряд(24, i => 14 + (i % 7)),
    precipitation_probability: ряд(24, () => 10),
    weather_code: ряд(24, () => 1),
  },
};

// ── ВМІСТ ДЛЯ ЕКРАНІВ ────────────────────────────────────────────────────────
//
// 🔴 ЧЕСНО ПРО ЦІ ДАНІ. Запуску ще не було, тож Дошка, Питання і Стрічка в
// живій базі ПОРОЖНІ — там рівно те, що встиг покласти Вова і кілька знайомих.
// Порожній екран у рекламі не показує, що вміє застосунок, тому вміст тут
// написаний — але написаний так, як реально виглядатиме Олика: ті самі села
// громади, ті самі побутові справи, без цін «від виробника» і без вигаданих
// можливостей. Жодного інтерфейсу це не домальовує: картки малює сам застосунок.
// 🛑 Якщо колись знадобиться показати справжній вміст — прибрати цей блок і
// дати заглушці порожні таблиці; екрани намалюються з живої бази.
const днів = n => new Date(Date.now() - n * 864e5).toISOString();

const ОГОЛОШЕННЯ = [
  { id: 801, type: 'board', category: 'продам', title: 'Картопля домашня, врожай цього року',
    text: 'Біла, велика, з власного городу. Є мішками і відрами. Самовивіз.',
    price: 12, currency: 'UAH', location: 'Олика', author: 'Ніна', owner_uid: 'u2' },
  { id: 802, type: 'board', category: 'послуги', title: 'Ремонт покрівлі, бригада з Олики',
    text: 'Металочерепиця, профнастил, ремонт старого даху. Виїзд по громаді.',
    price: null, price_negotiable: true, location: 'Олицька громада', author: 'Сергій', owner_uid: 'u3' },
  { id: 803, type: 'board', category: 'віддам', title: 'Віддам кошенят у добрі руки',
    text: 'Двоє, привчені до лотка. Вік два місяці.',
    price: null, location: 'Пильгани', author: 'Оксана', owner_uid: 'u4' },
  { id: 804, type: 'board', category: 'куплю', title: 'Куплю дрова колоті',
    text: 'Потрібно кубів п’ять на зиму. Розгляну пропозиції по громаді.',
    price: null, price_negotiable: true, location: 'Метельне', author: 'Андрій', owner_uid: 'u5' },
].map((o, i) => ({ photos: [], status: 'published', ts: Date.parse(днів(i + 1)),
  created_at: днів(i + 1), bumped_at: днів(i + 1), ...o }));

// ⚠️ Картка Питання бере заголовок із `text`, а не з `title` (спіймано на
// прогоні: у кадр пішло «Назбиралась ціла коробка…» замість самого питання).
// Тому питання стоїть саме в `text`.
const ПИТАННЯ = [
  { id: 851, type: 'chat', title: 'Освітлення на Замковій',
    text: 'Коли відновлять вуличне освітлення на Замковій?', author: 'Марія', owner_uid: 'u6' },
  { id: 852, type: 'chat', title: 'Батарейки',
    text: 'Де в громаді можна здати старі батарейки?', author: 'Тарас', owner_uid: 'u7' },
  { id: 853, type: 'chat', title: 'Автобус у неділю',
    text: 'Чи ходить автобус на Луцьк у неділю зранку?', author: 'Ірина', owner_uid: 'u8' },
].map((o, i) => ({ photos: [], status: 'published', ts: Date.parse(днів(i)),
  created_at: днів(i), bumped_at: днів(i), ...o }));

const СТОРІНКИ = [
  { id: 11, name: 'Олицька громада', avatar_url: '', official: true },
  { id: 12, name: 'Олицький ліцей', avatar_url: '', official: true },
];
const ПОСТИ_СТРІЧКИ = [
  { id: 951, page_id: 11, text: 'У середу з 9:00 до 15:00 не буде води на вулицях Замковій і Першотравневій — планова заміна засувки.',
    pages: СТОРІНКИ[0] },
  { id: 952, page_id: 12, text: 'Дякуємо всім, хто прийшов на толоку біля стадіону. За три години зробили більше, ніж планували.',
    pages: СТОРІНКИ[1] },
  { id: 953, page_id: 11, text: 'Нагадуємо: прийом громадян у сільраді — вівторок і четвер, з 10:00.',
    pages: СТОРІНКИ[0] },
].map((o, i) => ({ image_url: null, image_urls: [], show_author: false, status: 'published',
  deleted_at: null, to_news: true, author_uid: null, pinned_at: null,
  event_date: null, event_time: null, event_location: null, created_at: днів(i), ...o }));

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  serviceWorkers: 'block', locale: 'uk-UA',
});
const p = await ctx.newPage();

// Заслінка розробки. Прапорець ставиться ДО завантаження сторінки — так само,
// як у стенді `tests/dev-lock.mjs`.
await p.addInitScript(() => { try { localStorage.setItem('cstl_dev_ok', 'code'); } catch (_) {} });

await mockSupabase(p, {
  posts: [...ОГОЛОШЕННЯ, ...ПИТАННЯ],
  pages: СТОРІНКИ, page_posts: ПОСТИ_СТРІЧКИ,
  page_reactions: [], page_comments: [], page_subs: [],
  threads: [], messages: [], thread_user_state: [], announcements: [], comments: [],
}, { profiles: [
  { uid: 'u2', name: 'Ніна', avatar_url: '' }, { uid: 'u3', name: 'Сергій', avatar_url: '' },
  { uid: 'u4', name: 'Оксана', avatar_url: '' }, { uid: 'u5', name: 'Андрій', avatar_url: '' },
  { uid: 'u6', name: 'Марія', avatar_url: '' }, { uid: 'u7', name: 'Тарас', avatar_url: '' },
  { uid: 'u8', name: 'Ірина', avatar_url: '' },
] });
await p.route('**://api.open-meteo.com/**', r =>
  r.fulfill({ contentType: 'application/json', body: JSON.stringify(ПОГОДА) }));

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);

// Згода на правила. Без цього плашка перекриває нижню третину КОЖНОГО кадру.
const згода = p.locator('.consent-accept');
if (await згода.count()) { await згода.click(); await p.waitForTimeout(600); }

// 🔑 Анімації глушимо НА ЧАС ЗНІМКА. Інакше кадр ловить елемент посеред
// власного появлення — напівпрозорим і зсунутим. У ролику це виглядало б як
// брак рендера, хоч насправді застосунок працює правильно.
await p.addStyleTag({ content: `*, *::before, *::after {
  animation-duration: 0s !important; animation-delay: 0s !important;
  transition-duration: 0s !important; transition-delay: 0s !important; }` });

// 🔴 Лист «Правила безпечного користування дошкою» відкривається при першому
// вході на Дошку і лишається поверх УСІХ наступних кадрів (спіймано на першому
// ж прогоні: він перекрив Автобуси). Закриваємо тією самою кнопкою, що й людина.
const закритиЛисти = async () => {
  // ⚠️ Закриваємо ТОЧКОВО, по тексту кнопки. Перша редакція мала в переліку ще
  // `.sheet-close` і `[data-close]` — і на Автобусах вона влучила у щось, що
  // ВІДКРИЛО вікно входу через Google. Кадр пішов із чужим модальним вікном
  // поверх розкладу. Широкий добірник у «прибиральнику» шкідливіший за
  // невидалений лист: він не закриває, а натискає навмання.
  for (const текст of ['Ознайомився та продовжити', 'Поки пропустити']) {
    const л = p.locator(`button:has-text("${текст}")`).first();
    if (await л.count() && await л.isVisible().catch(() => false)) {
      await л.click({ timeout: 2000 }).catch(() => {});
      await p.waitForTimeout(400);
    }
  }
};

const кадр = async (імя, opts = {}) => {
  const { tab, scroll = 0, wait = 1400 } = opts;
  if (tab) {
    await p.evaluate(t => window.switchTab(t), tab);
    await p.waitForTimeout(wait);
    await закритиЛисти();
  }
  await p.evaluate(y => {
    const м = document.querySelector('.app-main');
    (м && м.scrollHeight > м.clientHeight ? м : window).scrollTo({ top: y, behavior: 'instant' });
  }, scroll);
  await p.waitForTimeout(500);
  await p.screenshot({ path: join(OUT, `${імя}.png`) });
  console.log(`  знято ${імя}.png`);
};

console.log('── знімаю екрани «Громади» ──');
await кадр('01-громада');
await кадр('02-громада-нижче', { scroll: 700 });
await кадр('03-стрічка', { tab: 'shotam' });
await кадр('04-питання', { tab: 'discussions' });
await кадр('05-дошка', { tab: 'board' });
await кадр('06-автобуси', { tab: 'buses' });

await stop(); await b.close();
console.log('── готово ──');
