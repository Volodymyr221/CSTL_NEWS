// Стенд: ІМʼЯ **І ПРІЗВИЩЕ** ТАМ, ДЕ ЦЕ ДОЦІЛЬНО.
//
// 🗣️ ЗАМОВЛЕННЯ ВОВИ (04.09.2026, дослівно): «при коментуванні постів автор пише
// просто імʼя, а треба, щоб писав імʼя та прізвище. Тобто так само, коли натискає
// на будь-якого жителя, пише його тільки імʼя, а має писати імʼя та прізвище.
// Так само, коли якийсь автор публікує від себе пост в стрічку… Де це доцільно.
// А в більшості випадків це доцільно».
//
// 🔴 ЩО НАСПРАВДІ ЛАМАЛОСЬ — І ЧОМУ ЦЕ НЕ БУЛО КОСМЕТИКОЮ.
// `profiles.surname` існує з липня, але ЖОДЕН публічний RPC його не віддавав:
// `get_avatars` (на ньому тримається `hydrateNames()` — усі підписи застосунку)
// і `get_public_profile` (картка жителя) селектили лише `p.name`. Прізвище
// фізично не могло потрапити на екран, скільки не прав розмітку.
//
// 🔴 І ДАНІ РОЗІЙШЛИСЬ НА ДВА ФОРМАТИ (заміряно 04.09 на 14 рядках): у 8 старих
// профілів прізвище лежало ВСЕРЕДИНІ `name` одним рядком, у 4 нових — окремо в
// `surname`. Тобто прізвище губилось двома різними способами залежно від віку
// профілю: у нових — бо RPC мовчав, у старих — бо клієнт різав до першого слова.
// Полагоджено міграцією `surname_split_and_public_rpc`
// (дзеркало — `scripts/supabase_full_name.sql`).
//
// 📐 ЩО МІРЯЄМО І ЧОМУ САМЕ ТАК. Головна частина стенда — не регулярки, а
// ВИКОНАННЯ справжніх `core/utils.js` і `core/supabase.js` із підробленою базою:
// регулярка не відрізнила б робочу склейку від написаної з помилкою, а саме така
// помилка й повернула б скаргу Вови. Той самий прийом, що в `feed-auth-race`.
//
// 🔴 КОНТРОЛЬ: BUNDLE_REV=origin/main node tests/full-name.mjs
// На коді до фіксу мусять УПАСТИ всі перевірки виконання (`fullName` там немає
// взагалі) і перевірки ланцюга кешу.
import { chromium } from 'playwright';
import { projectFile, launch, reporter } from './_lib.mjs';

const REV = process.env.BUNDLE_REV || '';
const { ok, done } = reporter();

const utils = projectFile('src/core/utils.js', REV);
const supabase = projectFile('src/core/supabase.js', REV);

console.log(`\n── ІМʼЯ + ПРІЗВИЩЕ${REV ? `   (КОНТРОЛЬ на ${REV})` : ''}`);

// ── ЧАСТИНА 1. Склейка ОДНА на застосунок ────────────────────────────────────
// 🔑 Правило №8 проєкту (не плодити дублі) тут не косметичне: склейку незалежно
// потребують три шляхи — кеш чужих імен, моє власне імʼя і картка жителя. Три
// копії одного правила в цьому проєкті вже розходились чотири рази.
ok('`fullName` живе в core/utils.js (спільний хелпер)',
   /export function fullName\(/.test(utils));
ok('`firstNameOf` там само — для двох тісних місць',
   /export function firstNameOf\(/.test(utils));

// 🛑 Правило КЛАСУ, а не одного файлу: ніхто не має права склеювати імʼя руками.
// Саме такий рукописний `[name, surname].join(' ')` жив у кабінеті у ДВОХ
// екземплярах — і один з них уже розходився з іншим за поведінкою на порожньому
// прізвищі.
const РУЧНА_СКЛЕЙКА = /\[\s*[\w.]*\bname\b[^\]]*,\s*[\w.]*\bsurname\b[^\]]*\]\s*\.filter\(Boolean\)\s*\.join\(' '\)/;
const винні = [];
for (const ф of ['src/core/account-ui.js', 'src/core/profile-card.js',
                 'src/core/supabase.js', 'src/core/auth.js',
                 'src/tabs/community-modal.js', 'src/tabs/feed.js']) {
  let код; try { код = projectFile(ф, REV); } catch (_) { continue; }
  if (РУЧНА_СКЛЕЙКА.test(код)) винні.push(ф.split('/').pop());
}
ok('ніде немає РУЧНОЇ склейки імені в обхід `fullName()`',
   винні.length === 0, винні.length ? винні.join(', ') : 'усі через спільну');

// ── ЧАСТИНА 2. Клієнт бере прізвище з відповіді бази ─────────────────────────
ok('`fetchAvatars` кладе в кеш ПОВНЕ імʼя',
   /_nameCache\.set\(r\.uid, fullName\(r\.name, r\.surname\)\)/.test(supabase));
ok('`getProfile` тримає повне імʼя для `currentUserName()`',
   /_profileName = fullName\(data\.name, data\.surname\)/
     .test(projectFile('src/core/auth.js', REV)));

// 🛑 Два місця, які СВІДОМО лишились короткими (рішення Вови 04.09). Стережемо
// саме їх: без цього рядка наступна сесія «доведе правило до кінця» і зробить
// звертання казенним — «Доброго дня, Володимире Шевчук».
const community = projectFile('src/tabs/community.js', REV);
ok('привітання Громади — СВІДОМО лише імʼя',
   /firstNameOf\(currentUserName\(\)\)/.test(community));
ok('і причина записана поруч, а не лише в чаті',
   /СВІДОМО лише імʼя|звучить казенно/i.test(community));

// ── ЧАСТИНА 3. SQL-дзеркало не розходиться з тим, що накачено ────────────────
// ⚠️ Урок 04.09: `supabase_public_profile.sql` у репо описував функцію з полем
// `age` і БЕЗ `official`, а на проді все навпаки. Файл у репозиторії розійшовся
// з тим, що реально виконується, і мовчки.
let sql = ''; try { sql = projectFile('scripts/supabase_full_name.sql', REV); } catch (_) {}
ok('SQL-дзеркало міграції лежить у репо', sql.length > 0);
ok('`get_avatars` у дзеркалі віддає surname',
   /create function public\.get_avatars[\s\S]*?p\.surname/.test(sql));
ok('`get_public_profile` у дзеркалі віддає surname',
   /create function public\.get_public_profile[\s\S]*?p\.surname/.test(sql));
ok('розділення старого формату ідемпотентне (не може подвоїти)',
   /coalesce\(btrim\(surname\), ''\) = ''/.test(sql));

// ── ЧАСТИНА 4 (ГОЛОВНА). ВИКОНУЄМО СПРАВЖНІЙ КОД ────────────────────────────
// Беремо `utils.js` і `supabase.js` ТІЄЇ САМОЇ ревізії, підсовуємо підроблену
// базу і дивимось, що реально опиниться на екрані. Контрольний прогін мусить
// падати саме тут — інакше це «контроль, який не може впасти» (у цьому проєкті
// таке вже траплялось 17.08 і 04.09).
const інлайн = (src) => src.replace(/^import .*$/gm, '').replace(/^export /gm, '');

const сцена = `<!doctype html><html><head><meta charset="utf-8"></head>
<body>
  <div id="сцена">
    <span data-name-uid="u-1">вморожене</span>
    <span data-name-uid="u-1" data-name-short="">вморожене</span>
    <span data-name-uid="u-2">вморожене</span>
  </div>
<script type="module">
  // Заглушки того, що utils.js бере зі своїх сусідів (жест «назад» і гомогліфи).
  const openLayer = () => ({}); const closeLayer = () => {};
  const FILTER_HOMOGLYPHS = {};
  // Підроблена база: RPC віддає рівно те, що віддає прод після міграції.
  window.supabase = { createClient: () => ({
    rpc: async (name, args) => name === 'get_avatars'
      ? { data: [
          { uid: 'u-1', name: 'Володимир', surname: 'Шевчук', avatar_url: '', official: false },
          { uid: 'u-2', name: 'Оксана',    surname: '',        avatar_url: '', official: false },
        ], error: null }
      : { data: null, error: null },
    auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  }) };
  ${інлайн(utils)}
  ${інлайн(supabase)}
  window.__зміряти = async () => {
    const out = {};
    // Чисті функції — на крайніх випадках, а не на одному щасливому.
    out.обидва   = typeof fullName === 'function' ? fullName('Володимир', 'Шевчук') : null;
    out.безПрізв = typeof fullName === 'function' ? fullName('Оксана', '') : null;
    out.безІмені = typeof fullName === 'function' ? fullName('', 'Шевчук') : null;
    out.пробіли  = typeof fullName === 'function' ? fullName('  Володимир  ', '  Шевчук ') : null;
    out.перше    = typeof firstNameOf === 'function' ? firstNameOf('Володимир Шевчук') : null;
    // Ланцюг: RPC → кеш → підпис на екрані.
    await fetchAvatars(['u-1', 'u-2']);
    out.кеш1 = cachedName('u-1');
    out.кеш2 = cachedName('u-2');
    await hydrateNames(document.getElementById('сцена'));
    const вузли = [...document.querySelectorAll('#сцена [data-name-uid]')];
    out.напис = вузли.map(e => e.textContent);
    return out;
  };
</script></body></html>`;

const b = await launch(chromium);
const p = await b.newPage();
await p.setContent(сцена);
await p.waitForTimeout(400);
// На старому коді модуль упаде ще на `fullName is not defined` — це очікуваний
// результат КОНТРОЛЮ, а не збій стенда, тож ловимо і віддаємо порожнечу.
const m = await p.evaluate(async () => {
  try { return window.__зміряти ? await window.__зміряти() : null; } catch (e) { return null; }
});
await b.close();

const є = m || {};
ok('склейка: імʼя + прізвище', є.обидва === 'Володимир Шевчук', String(є.обидва));
ok('порожнє прізвище НЕ дає хвостового пробілу', є.безПрізв === 'Оксана', JSON.stringify(є.безПрізв));
ok('саме прізвище без імені теж читається', є.безІмені === 'Шевчук', String(є.безІмені));
ok('зайві пробіли обрізаються', є.пробіли === 'Володимир Шевчук', String(є.пробіли));
ok('`firstNameOf` дає перше слово', є.перше === 'Володимир', String(є.перше));
ok('кеш імен тримає ПОВНЕ імʼя', є.кеш1 === 'Володимир Шевчук', String(є.кеш1));
ok('людина без прізвища — просто імʼя', є.кеш2 === 'Оксана', String(є.кеш2));
// 🔑 Це і є та сама скарга Вови, зведена до одного рядка: підпис на екрані.
ok('підпис на екрані став «Імʼя Прізвище»',
   є.напис && є.напис[0] === 'Володимир Шевчук', JSON.stringify(є.напис && є.напис[0]));
ok('`data-name-short` і далі ріже до імені (тісні місця цілі)',
   є.напис && є.напис[1] === 'Володимир', JSON.stringify(є.напис && є.напис[1]));
ok('людина без прізвища не отримує зайвого пробілу на екрані',
   є.напис && є.напис[2] === 'Оксана', JSON.stringify(є.напис && є.напис[2]));

done();
