// Стенд: ЧИТАННЯ ВИМІРНЕ (21.09.2026).
//
// 🔴 ЗАРАДИ ЧОГО. Курс (`CSTL NEWS VOVA/KURS.md`) стоїть на звичці жителя і на
// віддачі адміну спільноти. 📐 Заміряно 20.09: застосунок писав девʼять подій,
// найдокладніша — «відкрив вкладку». Тобто ОБИДВІ половини цілі не мали чим
// підтвердитись, а адміну спільноти не було чим показати, що його читають.
//
// 🔑 ЩО САМЕ ТУТ СТЕРЕЖЕТЬСЯ — НЕ «ЧИ Є ВИКЛИК У КОДІ», А ЧИ ДОЛІТАЄ ПОДІЯ.
// Перевірка на текст коду зеленіла б над зламаним спостерігачем: виклик стоїть,
// а `IntersectionObserver` не дійшов до карток (вкладка схована, поріг не
// досягнутий, список перемальований). Тому міряємо `window.__cstlInserted` —
// те, що застосунок СПРАВДІ поклав у базу.
//
// 🧪 ДОВЕДЕНО МУТАЦІЯМИ (прогони, не припущення):
//   1. поріг показу знято (`ПОРІГ_МС = 0`) → 9/10, падає «прокрутка навиліт»;
//   3. знято ОБИДВА пояси дедупу (Set + `io.unobserve`) → 9/10, 3 події стали 6.
// 🔴 І ЧЕСНО ПРО МУТАЦІЮ 2, бо вона найцінніша з трьох: знято ЛИШЕ дедуп-Set —
// стенд лишився ЗЕЛЕНИМ. Тобто перевірка нижче стереже НАСЛІДОК («повторний
// показ не дає нових подій»), який тримається насамперед на `io.unobserve`;
// Set страхує вужчий випадок — перестворення вузлів списку. Заявляти, що цей
// стенд стереже Set, було б неправдою, і саме такі заяви вже коштували проєкту
// довіри до сторожів (`HOT_RULES` — «прилад бреше частіше за код»).
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';

const Я = { id: 'uid-me', email: 'me@example.com', user_metadata: { full_name: 'Вова' } };
const ЗАРАЗ = Date.now();

const допис = (i) => ({
  id: 500 + i, page_id: 4, author: 'Олицька міська рада', author_uid: 'u-page',
  text: `Допис спільноти номер ${i} — кілька слів, щоб картка мала висоту.`,
  photos: [], created_at: new Date(ЗАРАЗ - i * 6e4).toISOString(),
  ts: ЗАРАЗ - i * 6e4, status: 'published',
});

async function сцена() {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  if (REV) {
    const old = projectFile('bundle.js', REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
  }
  await mockSupabase(p, {
    posts: [], announcements: [], profiles: [],
    page_posts: [допис(1), допис(2), допис(3)],
    pages: [{ id: 4, name: 'Олицька міська рада', verified: true }],
  }, { user: Я });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForTimeout(600);
  return { ctx, p };
}

// Які події аналітики застосунок поклав у базу.
const події = (p, тип) => p.evaluate((t) => (window.__cstlInserted || [])
  .filter(r => r.table === 'analytics_events' && r.row && r.row.event_type === t)
  .map(r => r.row), тип);

const { url, stop } = await serve();
const b = await launch(chromium);

// ── 1. 🔴 ДОПИС, ЩО ПОБУВ НА ЕКРАНІ, РАХУЄТЬСЯ ПРОЧИТАНИМ ──────────────────
//
// 🛑 Це головна перевірка файлу, і вона про Стрічку не випадково: там текст
// видно ПРЯМО в списку, відкривати нема чого. Міряли б тапами — Стрічка давала
// б нуль при живих читачах.
{
  const { ctx, p } = await сцена();
  await p.evaluate(() => window.switchTab?.('shotam'));
  await p.waitForTimeout(2200);              // поріг 1с + запас на малювання

  const seen = await події(p, 'content_seen');
  ok('🔴 картка Стрічки, що побула на екрані, дала подію читання',
     seen.length > 0, `подій: ${seen.length}`);

  const мета = seen[0] && seen[0].meta;
  ok('🔑 подія каже ЩО САМЕ прочитали (вид + номер)',
     !!мета && мета.kind === 'feed_post' && мета.id != null,
     JSON.stringify(мета || null));

  // 🛑 ЗУСТРІЧНА МЕЖА ДО ПРИВАТНОСТІ. «Прочитали 40 людей» — так, «прочитав
  // Сергій» — ніколи. Тут доводимо, що в події немає ні імені, ні тексту:
  // самі лише вид і номер. Інакше журнал читань став би журналом людей.
  const зайве = seen.filter(e => JSON.stringify(e.meta || {}).match(/Вова|Олицька|Допис спільноти/));
  ok('🛑 у події НЕМАЄ ні імен, ні тексту — лише вид і номер',
     зайве.length === 0, зайве.length ? JSON.stringify(зайве[0].meta) : 'чисто');

  await ctx.close();
}

// ── 2. 🔴 ОДНА ПОДІЯ НА МАТЕРІАЛ ЗА СЕАНС ──────────────────────────────────
//
// Людина гортає стрічку вгору-вниз десятки разів. Без дедупу ми писали б рядок
// на кожен прохід — і роздута база, і брехливе число («прочитали 300 разів» від
// трьох людей). Завищене число гірше за відсутнє: на ньому автор ухвалює
// рішення, писати йому далі чи ні.
{
  const { ctx, p } = await сцена();
  await p.evaluate(() => window.switchTab?.('shotam'));
  await p.waitForTimeout(2200);
  const перший = (await події(p, 'content_seen')).length;

  // Гортаємо туди-сюди: ті самі картки проходять через екран ще двічі.
  for (let i = 0; i < 3; i++) {
    await p.evaluate(() => { const m = document.querySelector('.app-main'); if (m) m.scrollTop = 2000; });
    await p.waitForTimeout(400);
    await p.evaluate(() => { const m = document.querySelector('.app-main'); if (m) m.scrollTop = 0; });
    await p.waitForTimeout(400);
  }

  // 🔴 І ГОЛОВНЕ — ПЕРЕМАЛЬОВКА СПИСКУ. Без неї ця перевірка БРЕХАЛА, і це
  // спіймано мутацією 21.09: я зняв дедуп-Set, а стенд лишився зеленим. Причина
  // в тому, що після запису події спостерігач сам відпускає картку
  // (`io.unobserve`), тож просте гортання не дало б другої події НАВІТЬ без
  // дедупу — тобто перевірка міряла не той механізм, який заявляла.
  // 🔑 Перемальовка створює НОВІ вузли, їх спостерігають заново — і тоді єдине,
  // що стоїть між нами і подвійним рахунком, це саме Set. А перемальовка тут не
  // вигадана: список Стрічки перемальовується сам (час на картці «5 хв» → «6 хв»)
  // і при кожному поверненні на вкладку.
  await p.evaluate(() => window.switchTab?.('community'));
  await p.waitForTimeout(500);
  await p.evaluate(() => window.switchTab?.('shotam'));
  await p.waitForTimeout(2200);
  const другий = (await події(p, 'content_seen')).length;

  ok('🔴 повторний показ тих самих карток (і після перемальовки) НЕ дає нових подій',
     другий === перший, `було ${перший}, стало ${другий}`);
  // Зустрічна межа: якщо подій нема ВЗАГАЛІ, рівність вище істинна над порожнечею.
  ok('прилад бачив хоч одну подію (інакше рівність нічого не варта)',
     перший > 0, `${перший}`);

  await ctx.close();
}

// ── 3. 🛑 ПРОКРУТКА НАВИЛІТ НЕ РАХУЄТЬСЯ ЧИТАННЯМ ──────────────────────────
//
// Поріг 1с існує саме проти маху пальцем. Без нього швидкий пролід зарахував би
// двадцять «прочитань» за секунду.
{
  const { ctx, p } = await сцена();
  await p.evaluate(() => window.switchTab?.('shotam'));
  await p.waitForTimeout(150);               // майже одразу гортаємо геть
  await p.evaluate(() => { const m = document.querySelector('.app-main'); if (m) m.scrollTop = 4000; });
  await p.waitForTimeout(250);
  const хапливо = (await події(p, 'content_seen')).length;
  ok('🛑 картка, яку проминули за чверть секунди, НЕ рахується прочитаною',
     хапливо === 0, `подій: ${хапливо}`);
  await ctx.close();
}

// ── 4. 🔴 НОВИНА: ТУТ МІРЯЄМО ТАП, А НЕ ПОКАЗ ──────────────────────────────
//
// Інша поверхня — інша подія. У Новинах картка показує лише заголовок, тож
// «прочитав» це намір: людина відкрила статтю окремим екраном.
// ⚠️ Окремої вкладки «Новини» в таб-барі НЕМАЄ — статті живуть у віджеті на
// Громаді і в повноекранному хабі поверх неї. Тому тапаємо там, де тапає
// людина: по картці віджета (`community-blocks.js:1914` ловить
// `[data-article-id]` і кличе `openArticle`).
{
  const { ctx, p } = await сцена();
  await p.waitForTimeout(1800);              // віджет чекає на `articles.json`

  const доТапу = (await події(p, 'content_open')).length;
  const тапнув = await p.evaluate(() => {
    const c = document.querySelector('[data-article-id]');
    if (!c) return false;
    c.click();
    return true;
  });
  await p.waitForTimeout(700);
  const післяТапу = await події(p, 'content_open');

  ok('прилад знайшов картку новини (інакше перевірка нижче порожня)', тапнув);
  ok('🔴 відкрита стаття дала подію читання',
     тапнув && післяТапу.length > доТапу,
     `було ${доТапу}, стало ${післяТапу.length}`);
  ok('🔑 і вона підписана як новина',
     !тапнув || (післяТапу[0] && післяТапу[0].meta && післяТапу[0].meta.kind === 'news'),
     JSON.stringify((післяТапу[0] || {}).meta || null));

  await ctx.close();
}

// ── 5. 🛑 ВИМИКАЧ СТАТИСТИКИ ГЛУШИТЬ І ЦІ ПОДІЇ ────────────────────────────
//
// 🔑 Сторож стоїть усередині `logEvent`, тож формально перевіряти нема чого —
// але саме такі «формально очевидні» місця і ламаються тихо, коли хтось напише
// власний виклик повз `logEvent`. Людина вимкнула статистику в кабінеті —
// значить вимкнула ВСЮ, без винятків для нових подій.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  if (REV) {
    const old = projectFile('bundle.js', REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
  }
  await p.addInitScript(() => { try { localStorage.setItem('cstl-analytics-off', '1'); } catch (_) {} });
  await mockSupabase(p, {
    posts: [], announcements: [], profiles: [],
    page_posts: [допис(1), допис(2), допис(3)],
    pages: [{ id: 4, name: 'Олицька міська рада', verified: true }],
  }, { user: Я });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.evaluate(() => window.switchTab?.('shotam'));
  await p.waitForTimeout(2200);

  const мовчить = (await події(p, 'content_seen')).length;
  ok('🛑 при вимкненій статистиці подій читання НЕМАЄ',
     мовчить === 0, `подій: ${мовчить}`);
  await ctx.close();
}

await stop();
await b.close();
done();
