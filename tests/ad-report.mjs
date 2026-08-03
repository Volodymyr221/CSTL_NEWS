// tests/ad-report.mjs — СКАРГА НА ОГОЛОШЕННЯ: кнопка, що нарешті кудись пише.
//
// НАВІЩО (замовлення Вови 02.08): «продумати логічну функцію цієї кнопки… можливо
// й описати проблему, і куди надходить це оскарження для нас… хто поскаржився, його
// причина, на яке оголошення, хто автор цього оголошення».
//
// ЩО БУЛО: обробник кликав `showToast('Дякуємо. Ми перевіримо це оголошення.')` — і все.
// Тобто застосунок ОБІЦЯВ дію, якої не існувало. Це гірше за відсутню кнопку: людина
// вважала, що поскаржилась, і більше не писала Вові напряму.
//
// 🔑 ЩО МІРЯЄМО — ПОВЕДІНКУ ЛИСТА, а не наявність коду. Мережу до Supabase стенд
// перехоплює: справжня вставка потребувала б живого акаунта й засмічувала б прод
// тестовими скаргами. Тому перевіряємо те, що бачить і робить людина:
//   • лист відкривається і пропонує ЗАКРИТИЙ список причин;
//   • без вибраної причини надіслати НЕ МОЖНА (кнопка вимкнена);
//   • «Інше» без опису теж не приймається — і людина дізнається про це ДО надсилання;
//   • у запит іде рівно те, що ввела людина, і НІЧОГО зайвого (знімок робить база);
//   • помилка НЕ закриває лист — інакше довелось би починати спочатку.
//
// ⚠️ Окремо сторожимо DRY: список причин мусить збігатися з тим, що приймає база
// (`ad_reports_reason_chk` у scripts/supabase_ad_reports.sql). Розходження цих двох
// копій дало б «надіслано» на екрані й мовчазну відмову в базі — рівно та хвороба,
// яку проєкт уже проходив зі списками антиспаму.

import { chromium } from 'playwright';
import { launch, serve, projectFile, reporter } from './_lib.mjs';

const { ok, done } = reporter();

const ts = Date.now() - 3 * 864e5;
const POSTS = [
  { id: 901, type: 'board', category: 'продам', title: 'ПРОДАМ БУДИНОК',
    text: 'Опис оголошення.', photos: [], price: null, price_negotiable: true, currency: 'UAH',
    location: 'Жорнище', author: 'Тест', author_name: 'Тест', owner_uid: 'u1',
    status: 'published', ts, created_at: new Date(ts).toISOString(), bumped_at: new Date(ts).toISOString() },
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

// ⚠️ ПОРЯДОК МАРШРУТІВ ВАЖЛИВИЙ: Playwright перевіряє їх У ЗВОРОТНОМУ порядку —
// останній зареєстрований виграє. Спершу загальний «усе інше», ПОТІМ точковий на
// скарги, інакше загальний перехоплював би вставку й повертав 200, а стенд бачив би
// «запит не пішов» на цілком робочому коді. Це вже було: перша версія стенда
// зареєструвала їх навпаки і сама себе завалила.
await p.route('**://*.supabase.co/**', r => json(r, []));

// Перехоплюємо ВСТАВКУ скарги і запамʼятовуємо тіло запиту — саме воно і є
// «що застосунок надіслав». Відповідь задаємо самі, щоб перевірити обидві гілки.
let sent = null;
let replyFail = false;
await p.route('**://*.supabase.co/rest/v1/ad_reports*', async r => {
  try { sent = JSON.parse(r.request().postData() || 'null'); } catch { sent = null; }
  if (replyFail) {
    return r.fulfill({ status: 400, contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ message: 'report_self' }) });
  }
  return r.fulfill({ status: 201, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: '[]' });
});
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.route('**/data/community-board.json*', r => json(r, { posts: POSTS }));

// ── ЧОМУ ТУТ ПІДСТАВНИЙ КЛІЄНТ SUPABASE ─────────────────────────────────────
// Застосунок бере `supabase-js` з CDN (`index.html`), а в середовищі стендів мережі
// назовні НЕМАЄ — заміряно: `curl` до jsdelivr повертає 000. Через це `window.supabase`
// не існує, клієнт не створюється, і будь-яка дія «для залогінених» упирається в
// «увійдіть» ще до форми. Тобто без підстановки цей стенд не міг би перевірити НІЧОГО
// зі скарги.
//
// 🔑 Підстановка НАВМИСНО вузька і чесна:
//   • `auth` віддає сесію — рівно щоб пройти `requireAuth`;
//   • `from(...).insert(...)` робить СПРАВЖНІЙ `fetch` на той самий шлях, що й бойовий
//     клієнт, — тому тіло запиту ловить `p.route` нижче, і ми міряємо те, що застосунок
//     реально надіслав би, а не те, що ми собі уявили;
//   • `select` з таблиці `posts` віддає ТІ САМІ оголошення, що й фікстура, — тобто
//     Дошка малюється з даних, а не з порожнечі. ⚠️ Перша версія підстановки віддавала
//     порожньо на все, і Дошка лишалась без карток: щойно `supa` перестав бути `null`,
//     застосунок пішов шляхом бази замість запасного JSON. Стенд це одразу зловив
//     першим же рядком — тому «оголошення відкрилось» стоїть саме там.
// ⚠️ Живе ЛИШЕ у стенді. У застосунку немає жодного рядка, який би про неї знав.
await ctx.addInitScript((posts) => {
  const thenable = (value) => {
    const o = {
      select: () => thenable(value), eq: () => thenable(value), neq: () => thenable(value),
      order: () => thenable(value), limit: () => thenable(value), in: () => thenable(value),
      single: () => thenable({ data: null, error: null }),
      then: (res) => Promise.resolve(value).then(res),
    };
    return o;
  };
  const session = {
    access_token: 'stand', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'stand',
    user: { id: 'u-stand', email: 'stand@example.com', user_metadata: { full_name: 'Стенд' } },
  };
  window.supabase = {
    createClient: (baseUrl) => ({
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        getUser:    async () => ({ data: { user: session.user }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithOAuth: async () => ({ data: null, error: null }),
        signOut: async () => ({ error: null }),
      },
      from: (table) => Object.assign(thenable({ data: table === 'posts' ? posts : [], error: null }), {
        insert: async (row) => {
          const r = await fetch(`${baseUrl}/rest/v1/${table}`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify(row),
          });
          if (!r.ok) {
            let m = '';
            try { m = (await r.json()).message || ''; } catch (_) {}
            return { data: null, error: { message: m || ('HTTP ' + r.status) } };
          }
          return { data: [], error: null };
        },
        update: () => thenable({ data: [], error: null }),
        delete: () => thenable({ data: [], error: null }),
      }),
      rpc: async () => ({ data: null, error: null }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
      storage: { from: () => ({ upload: async () => ({ data: null, error: null }) }) },
    }),
  };
}, POSTS);

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(250);

const openAd = async id => {
  const hit = await p.evaluate(pid => {
    const el = document.querySelector(`#board-content [data-post-id="${pid}"]`);
    if (!el) return false;
    el.scrollIntoView({ block: 'center' }); el.click(); return true;
  }, id);
  await p.waitForTimeout(750);
  return hit;
};

ok('оголошення відкрилось', await openAd(901));

// ── 1. Кнопка більше не бреше ────────────────────────────────────────────────
const src = projectFile('src/tabs/board.js');
ok('кнопка більше не показує самий лише тост',
   !/data-ad-report[^]{0,200}Дякуємо\. Ми перевіримо/.test(src), 'тост-заглушка ще в коді');

await p.evaluate(() => document.querySelector('[data-ad-report]')?.click());
await p.waitForTimeout(500);
const sheet = await p.evaluate(() => {
  const w = document.querySelector('.app-modal--report');
  if (!w) return null;
  return {
    причин: w.querySelectorAll('input[name="ad-report-reason"]').length,
    коди: [...w.querySelectorAll('input[name="ad-report-reason"]')].map(i => i.value),
    опис_є: !!w.querySelector('.ad-rep-text'),
    кнопка_вимкнена: !!w.querySelector('.ad-rep-send')?.disabled,
  };
});
ok('лист скарги відкрився', !!sheet, sheet ? '' : 'листа немає');
ok('причини — закритий список із шести', sheet?.причин === 6, `${sheet?.причин}`);
// Без причини скарга не каже нічого — надіслати не можна.
ok('без вибраної причини надіслати НЕ МОЖНА', sheet?.кнопка_вимкнена === true);
ok('поле опису є', sheet?.опис_є === true);

// ── 2. «Інше» вимагає опису — і людина дізнається про це ДО надсилання ──────
const otherState = await p.evaluate(async () => {
  const w = document.querySelector('.app-modal--report');
  const other = w.querySelector('input[value="other"]');
  other.checked = true; other.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  const send = w.querySelector('.ad-rep-send');
  const before = send.disabled;
  const area = w.querySelector('.ad-rep-text');
  const hint = area.placeholder;
  area.value = 'Просить передоплату на картку';
  area.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 60));
  return { до: before, після: send.disabled, підказка: hint };
});
ok('«Інше» без опису надіслати не можна', otherState.до === true);
ok('підказка каже, що опис обовʼязковий', /обовʼязково/.test(otherState.підказка), otherState.підказка);
ok('з описом «Інше» стає доступним', otherState.після === false);

// ── 3. Що саме йде в базу ────────────────────────────────────────────────────
await p.evaluate(() => document.querySelector('.ad-rep-send')?.click());
await p.waitForTimeout(700);
ok('запит на вставку скарги пішов', !!sent, JSON.stringify(sent));
const row = Array.isArray(sent) ? sent[0] : sent;
ok('у запиті є оголошення, причина й опис',
   row && Number(row.post_id) === 901 && row.reason === 'other' && /передоплату/.test(row.details || ''),
   JSON.stringify(row));
// 🔴 ГОЛОВНЕ ПРАВИЛО БЕЗПЕКИ: знімок робить БАЗА. Якби клієнт слав `post_owner_uid`,
// зловмисник підставив би будь-кого — скарга стала б інструментом наклепу.
ok('клієнт НЕ шле знімок автора й імен',
   row && !('post_owner_uid' in row) && !('reporter_uid' in row) &&
   !('post_owner_name' in row) && !('reporter_name' in row) && !('status' in row),
   Object.keys(row || {}).join(', '));

ok('після успіху лист закрився',
   await p.evaluate(() => !document.querySelector('.app-modal--report')));

// ── 4. Помилка НЕ закриває лист ──────────────────────────────────────────────
// Інакше людина втратила б набраний опис і починала все спочатку.
replyFail = true;
await p.evaluate(() => document.querySelector('[data-ad-report]')?.click());
await p.waitForTimeout(450);
await p.evaluate(async () => {
  const w = document.querySelector('.app-modal--report');
  const r = w.querySelector('input[value="scam"]');
  r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r2 => setTimeout(r2, 60));
  w.querySelector('.ad-rep-send').click();
});
await p.waitForTimeout(900);
const afterFail = await p.evaluate(() => {
  const w = document.querySelector('.app-modal--report');
  return { лист: !!w, кнопка: w?.querySelector('.ad-rep-send')?.textContent.trim(),
           вимкнена: !!w?.querySelector('.ad-rep-send')?.disabled };
});
ok('після помилки лист лишився відкритим', afterFail.лист === true);
ok('кнопку повернуто в робочий стан', afterFail.вимкнена === false, afterFail.кнопка);

// ── 5. DRY: список причин у коді = список, який приймає база ────────────────
const sql = projectFile('scripts/supabase_ad_reports.sql');
const inSql = (sql.match(/reason in \(([^)]*)\)/) || [])[1] || '';
const sqlCodes = [...inSql.matchAll(/'([a-z_]+)'/g)].map(m => m[1]).sort();
const uiCodes = (sheet?.коди || []).slice().sort();
ok('причини в коді й у базі — той самий набір',
   sqlCodes.length === 6 && JSON.stringify(sqlCodes) === JSON.stringify(uiCodes),
   `база: ${sqlCodes.join(',')} · екран: ${uiCodes.join(',')}`);

await b.close();
stop();
done();
