// Стенд: ОНОВЛЕННЯ — ПРАПОРЦІ ФІЧ І РЕЖИМ «ЯК ЖИТЕЛЬ» (19.09.2026).
//
// 🗣️ Замовлення Вови: «як робити покращення застосунку… щоб не бачили
// користувачі. І тільки після того, як погодиться… випускати його в прод. Але…
// щоб я міг протестити і побачити його В РАМКАХ ДОДАТКУ». Перемикач «дивитись
// як житель» — «Одразу».
//
// 🔑 ЩО САМЕ СТЕРЕЖЕ ЦЕЙ ФАЙЛ (і чого свідомо не стереже):
// він міряє КЛІЄНТСЬКИЙ бік — кого що бачить і чи можна вийти з режиму жителя.
// Серверні межі доведені окремо, транзакціями з відкотом на живій базі
// (журнал 18.09«b», розділ 19.09): адмін застосунку має `updates` = view, і всі
// три спроби (увімкнути колу, випустити всім, додати тестера) відмовляють.
//
// 🛑 І МЕЖА, ЯКОЇ ТУТ НЕМАЄ НАВМИСНО: прапорець — це ПОКАЗ, а не право. Людина
// з devtools виставить собі будь-що. Тому стенд не вдає, ніби перевіряє захист:
// захист живе в RLS, а тут перевіряється те, що бачить око.

import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();

// Сцена: три фічі в усіх трьох станах одразу — інакше кожна перевірялась би
// там, де інших не існує, і вони не могли б переплутатись між собою.
const FEATURES = [
  { key: 'f_off',    label: 'Вимкнена',  stage: 'off'    },
  { key: 'f_circle', label: 'Лише колу', stage: 'circle' },
  { key: 'f_all',    label: 'Усім',      stage: 'all'    },
];

const У_КОЛІ   = { id: 'uid-circle',   email: 'circle@example.com',   user_metadata: { full_name: 'Тестувальник' } };
const ПОЗА_КОЛОМ = { id: 'uid-plain', email: 'plain@example.com',    user_metadata: { full_name: 'Житель' } };

const BUNDLE_REV = process.env.BUNDLE_REV || '';
// 🛑 МУТАЦІЯ: MUT_NO_ESCAPE=1 прибирає `asResident()` з умови показу пункту
// «Дивитись як житель». Саме нею доводиться, що перевірка «з режиму можна
// вийти» справді вміє впасти, а не зеленіє ні над чим.
const MUT_NO_ESCAPE = process.env.MUT_NO_ESCAPE === '1';

const { url, stop } = await serve();
const b = await launch(chromium);

async function сцена(user, { режимЖителя = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  if (BUNDLE_REV) {
    const old = projectFile('bundle.js', BUNDLE_REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
  }
  if (MUT_NO_ESCAPE) {
    // Мутант: умова показу пункту втрачає другу половину (`|| asResident()`).
    await p.route('**/bundle.js', async (r) => {
      const res = await r.fetch();
      let body = await res.text();
      body = body.replace(/inTestCircle\(\)\s*\|\|\s*asResident\(\)/g, 'inTestCircle()');
      r.fulfill({ contentType: 'application/javascript', body });
    });
  }
  await mockSupabase(p, {
    posts: [], announcements: [], profiles: [],
    app_features: FEATURES,
    feature_testers: [{ uid: 'uid-circle' }],
  }, { user });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  if (режимЖителя) await p.addInitScript(() => localStorage.setItem('cstl_as_resident', '1'));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForTimeout(500);
  return { ctx, p };
}

// Що застосунок вважає ввімкненим для цієї людини. 🔑 Питаємо ЧЕРЕЗ ту саму
// заглушку бази, якою живе застосунок, а не через власну копію правила:
// друга копія розійшлася б із першою, і стенд зеленів би над розходженням.
const станФіч = (p) => p.evaluate(async () => {
  const supa = window.supabase?.createClient?.();
  const r = await supa.rpc('my_features');
  return (r.data && r.data.features) || {};
});

// ── 1. ХТО В КОЛІ ─────────────────────────────────────────────────────────
{
  const { ctx, p } = await сцена(У_КОЛІ);
  const f = await станФіч(p);
  ok('🔴 «лише колу» — людина в колі БАЧИТЬ', f.f_circle?.on === true, JSON.stringify(f.f_circle));
  ok('«усім» — бачить', f.f_all?.on === true, JSON.stringify(f.f_all));
  ok('🛑 «вимкнено» — НЕ бачить навіть той, хто в колі',
     f.f_off?.on === false, JSON.stringify(f.f_off));
  await ctx.close();
}

// ── 2. ЗВИЧАЙНИЙ ЖИТЕЛЬ ───────────────────────────────────────────────────
//
// 🔑 Це і є суть замовлення: те, що тестується, для громади не існує.
{
  const { ctx, p } = await сцена(ПОЗА_КОЛОМ);
  const f = await станФіч(p);
  ok('🔴 «лише колу» — сторонній НЕ бачить', f.f_circle?.on === false, JSON.stringify(f.f_circle));
  ok('«усім» — бачить і він', f.f_all?.on === true, JSON.stringify(f.f_all));

  // Зустрічна межа: пункт меню «Дивитись як житель» не сміє показуватись тому,
  // кого в колі немає — він нічого для нього не означає.
  await p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
  await p.waitForTimeout(700);
  const видно = await p.evaluate(() => {
    const el = document.querySelector('[data-nav="as-resident"]');
    return !!el && !el.hidden;
  });
  ok('🛑 сторонньому пункт «Дивитись як житель» НЕ показано', видно === false);
  await ctx.close();
}

// ── 3. РЕЖИМ «ЯК ЖИТЕЛЬ» ──────────────────────────────────────────────────
//
// 🗣️ Рішення Вови: закласти «Одразу».
// 🔑 Перевіряємо НАСЛІДОК (що застосунок вважає ввімкненим), а не наявність
// ключа в сховищі: ключ можна записати і не читати ніде, і перевірка на нього
// зеленіла б над мертвим кодом.
{
  const { ctx, p } = await сцена(У_КОЛІ, { режимЖителя: true });
  const бачить = await p.evaluate(() => ({
    circle: window.__cstlFeatureOn ? window.__cstlFeatureOn('f_circle') : null,
    all:    window.__cstlFeatureOn ? window.__cstlFeatureOn('f_all')    : null,
  }));
  ok('🔴 у режимі жителя «лише колу» СХОВАНО навіть від того, хто в колі',
     бачить.circle === false, JSON.stringify(бачить));
  ok('а «усім» лишається видимим', бачить.all === true, JSON.stringify(бачить));

  // Пункт на місці — з нього ж і вимикають режим.
  await p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
  await p.waitForTimeout(700);
  const вихід = await p.evaluate(() => {
    const el = document.querySelector('[data-nav="as-resident"]');
    if (!el || el.hidden) return null;
    return el.querySelector('.sidebar-item-label')?.textContent.trim() || '';
  });
  ok('з режиму жителя видно вихід', вихід !== null, вихід || 'пункт зник');
  ok('і підпис каже, що режим увімкнено',
     /вийти/i.test(вихід || ''), `підпис: ${вихід}`);
  await ctx.close();
}

// ── 4. 🛑 ПАСТКА, ЗАРАДИ ЯКОЇ ІСНУЄ `|| asResident()` ────────────────────
//
// 🔴 ЦЕЙ БЛОК — ВИПРАВЛЕННЯ МОЄЇ ВЛАСНОЇ ПОМИЛКИ, І ЙОГО ВАРТО ПРОЧИТАТИ ПЕРЕД
// ТИМ, ЯК ЩОСЬ ТУТ МІНЯТИ.
// Перша редакція стенда перевіряла вихід із режиму на людині, яка В КОЛІ, і
// твердила в коментарі, що без запобіжника вона «лишилась би замкненою».
// Мутація джерела (прибрати `|| asResident()`, перезібрати) показала, що це
// НЕПРАВДА: `inTestCircle()` читає серверне «я в колі», а воно від режиму
// перегляду не залежить — тож пункт лишався на місці й без запобіжника.
// Тобто коментар описував небезпеку, якої в тій сцені не існує, а перевірка
// була зелена на обох ревізіях.
//
// ✅ Справжня пастка інша: людину ПРИБРАЛИ з кола, поки вона сидить у режимі
// жителя. Тоді `inTestCircle()` чесно віддає false, і без `|| asResident()`
// пункт зникає РАЗОМ з єдиним способом вимкнути режим — людина лишається в
// урізаній картинці без жодної підказки, чому вона така.
{
  const { ctx, p } = await сцена(ПОЗА_КОЛОМ, { режимЖителя: true });
  await p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
  await p.waitForTimeout(700);
  const вихід = await p.evaluate(() => {
    const el = document.querySelector('[data-nav="as-resident"]');
    if (!el || el.hidden) return null;
    return el.querySelector('.sidebar-item-label')?.textContent.trim() || '';
  });
  ok('🔴 прибрали з кола, а людина в режимі жителя — ВИХІД ЛИШАЄТЬСЯ',
     вихід !== null && /вийти/i.test(вихід),
     вихід === null ? 'пункт зник — людина замкнена в режимі' : `підпис: ${вихід}`);
  await ctx.close();
}

// ── 5. 🔴 МИТЬ ВИПУСКУ: ФІЧ ЩЕ НЕМА, А СИСТЕМА МУСИТЬ ПРАЦЮВАТИ ───────────
//
// 📐 Заміряно на живій базі перед деплоєм: `app_features` — **0 рядків**.
// Це не крайній випадок, а ПЕРШИЙ стан системи: перша фіча зʼявиться разом із
// першим оновленням, тобто ПІСЛЯ того, як Вова вперше відкриє розділ.
// 🔴 Перша редакція виводила «я в колі» із самих фіч — і в цю мить показувала
// власникові, що він не в колі. Пункт «Дивитись як житель» не малювався, і
// систему, замовлену щоб «протестити В РАМКАХ ДОДАТКУ», не було чим перевірити.
// ➡️ Тому членство в колі їде окремим полем, а стенд стереже саме порожню базу.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  if (BUNDLE_REV) {
    const old = projectFile('bundle.js', BUNDLE_REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
  }
  await mockSupabase(p, {
    posts: [], announcements: [], profiles: [],
    app_features: [],                                  // ← жодної фічі, як у проді 19.09
    feature_testers: [{ uid: 'uid-circle' }],
  }, { user: У_КОЛІ });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
  await p.waitForTimeout(700);
  const підпис = await p.evaluate(() => {
    const el = document.querySelector('[data-nav="as-resident"]');
    if (!el || el.hidden) return null;
    return el.querySelector('.sidebar-item-label')?.textContent.trim() || '';
  });
  ok('🔴 фіч ЩЕ НЕМА, але людина в колі БАЧИТЬ перемикач режиму жителя',
     підпис !== null && /житель/i.test(підпис),
     підпис === null ? 'пункт не показано — систему нічим перевірити' : `підпис: ${підпис}`);
  await ctx.close();
}

// Зустрічна межа тієї ж порожньої бази: сторонній однаково нічого не бачить.
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  if (BUNDLE_REV) {
    const old = projectFile('bundle.js', BUNDLE_REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
  }
  await mockSupabase(p, {
    posts: [], announcements: [], profiles: [],
    app_features: [], feature_testers: [{ uid: 'uid-circle' }],
  }, { user: ПОЗА_КОЛОМ });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForTimeout(500);
  await p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
  await p.waitForTimeout(700);
  const видно = await p.evaluate(() => {
    const el = document.querySelector('[data-nav="as-resident"]');
    return !!el && !el.hidden;
  });
  ok('🛑 і при цьому сторонньому перемикач НЕ показано', видно === false);
  await ctx.close();
}

await stop();
await b.close();
done();
