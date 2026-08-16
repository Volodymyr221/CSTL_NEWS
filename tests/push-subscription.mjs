// tests/push-subscription.mjs
// СТОРОЖ ЖИТТЄВОГО ЦИКЛУ PUSH-ПІДПИСКИ (16.08.2026)
//
// 🔴 НАВІЩО ЗАВЕДЕНО. Аудит 16.08 знайшов ЧОТИРИ місця, де сповіщення тихо не
// приходять, і всі чотири жили при **80 зелених стендах**. Причина проста:
// сторожі проєкту стерегли вигляд, розкладку і рух, а життєвий цикл підписки
// (створення → повторне відстеження → скасування → ротація адреси) не перевіряв
// НІХТО. Кожна з тих вад мовчазна за природою: людина бачить увімкнений дзвіночок
// і просто не отримує сповіщення.
//
// 🔑 ЧОМУ ЦЕ ТЕКСТОВИЙ СТОРОЖ, А НЕ БРАУЗЕРНИЙ. Тут немає чого «побачити»: усе
// відбувається між клієнтом і базою. Браузерний стенд довелось би вчити підробляти
// pushManager, Notification.permission і PostgREST — тобто перевіряв би він
// підробку, а не код. Натомість цей бере ЖИВИЙ текст модулів і доводить, що
// конкретні рішення на місці. Межі методу названі чесно в кінці файлу.
//
// Контроль: `BUNDLE_REV=origin/main~8 node tests/push-subscription.mjs` має
// ПАДАТИ на коді до фіксу — інакше сторож нічого не стереже.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REV = process.env.BUNDLE_REV || '';

function read(rel) {
  if (REV) {
    try { return execSync(`git show ${REV}:${rel}`, { cwd: ROOT, encoding: 'utf8' }); }
    catch { return ''; }
  }
  return readFileSync(join(ROOT, rel), 'utf8');
}

const supabase = read('src/core/supabase.js');
const buses    = read('src/tabs/buses.js');
const sw       = read('sw.js');
const push     = read('src/core/push.js');
const busFn    = read('supabase/functions/send-bus-push/index.ts');

let pass = 0, fail = 0;
const ok  = (name) => { pass++; console.log(`  ✅ ${name}`); };
const bad = (name, why) => { fail++; console.log(`  ❌ ${name} — ${why}`); };
const check = (name, cond, why) => cond ? ok(name) : bad(name, why);

console.log('\n── Повторне відстеження не лишає старих даних ──');

// A1. Головне: insert → upsert. Саме insert давав «23505 = вважаємо успіхом» і
// мовчки лишав у базі старі зупинки та старі прапорці «вже надіслано».
const saveFn = supabase.match(/export async function savePushSubscription[\s\S]*?\n}/);
check('savePushSubscription використовує upsert',
  !!saveFn && /\.upsert\(/.test(saveFn[0]),
  'підписка зберігається через insert — повторне відстеження не оновить зупинки й прапорці');

check('upsert знає ключ конфлікту (endpoint,route_id,track_date)',
  !!saveFn && /onConflict:\s*'endpoint,route_id,track_date'/.test(saveFn[0]),
  'без onConflict upsert поводиться як insert і падає на унікальності');

// Прапорці мусять скидатись ЯВНО: PostgREST оновлює лише передані колонки, тож
// без цього повторна підписка успадкувала б «вже надіслано» від попередньої.
check('прапорці notified_* скидаються при збереженні',
  !!saveFn && ['notified_dep', 'notified_warning', 'notified_canc', 'notified_start']
    .every(f => new RegExp(`${f}:\\s*false`).test(saveFn[0])),
  'старі «вже надіслано» переживуть повторне відстеження — попередження не прийде');

check('23505 більше не видається за успіх',
  !!saveFn && !/23505/.test(saveFn[0]),
  'гілка «вже є → ok» лишилась: саме вона ховала невдале оновлення');

console.log('\n── Скасування діє на акаунт, а не на один браузер ──');

// A2. Гідрація тягне рейси по user_uuid, тому й видалення мусить бути по ньому:
// інакше «скасував на планшеті» не чіпає рядок телефона.
const delFn = supabase.match(/export async function deletePushSubscription[\s\S]*?\n}/);
check('deletePushSubscription фільтрує по user_uuid',
  !!delFn && /\.eq\('user_uuid'/.test(delFn[0]),
  'видалення по endpoint: скасування з іншого пристрою не спрацює, а рейс повернеться гідрацією');

check('deletePushSubscription більше не фільтрує по endpoint',
  !!delFn && !/\.eq\('endpoint'/.test(delFn[0]),
  'лишився фільтр по endpoint — та сама вада');

check('порожній uid відсікається до запиту',
  !!delFn && /if\s*\(!uid\)/.test(delFn[0]),
  'без uid запит зняв би підписки за іншим фільтром або мовчки нічого');

check('unsubscribeFromPush більше не виходить, коли браузерної підписки немає',
  !/const sub = await reg\.pushManager\.getSubscription\(\);[\s\S]{0,200}if \(!sub\) return;/.test(buses),
  'при втраченій підписці серверний рядок лишався жити — сповіщення про скасований рейс');

console.log('\n── Подвійний тап не лишає висячої підписки ──');

// A3. Черга на рейс: інакше DELETE міг випередити UPSERT.
check('операції підписки серіалізовані чергою',
  /_pushOpQueue/.test(buses) && /function queuePushOp/.test(buses),
  'без черги швидке «увімкнув-вимкнув» лишає рядок у базі після скасування');

check('черга ключується рейсом і датою',
  /pushOpKey\s*=\s*\(routeId,\s*trackDate\)/.test(buses),
  'спільна черга на всі рейси змусила б різні рейси чекати один одного');

check('обидві операції проходять через чергу',
  /function subscribeToPush\([\s\S]{0,300}queuePushOp/.test(buses) &&
  /function unsubscribeFromPush\([\s\S]{0,200}queuePushOp/.test(buses),
  'якщо через чергу йде лише одна з операцій, порядок усе одно не гарантований');

console.log('\n── Ротація адреси підписки ──');

// A4. Без цього підписка мовчки вмирає: сервер отримає 410 і видалить рядок.
check('sw.js обробляє pushsubscriptionchange',
  /addEventListener\('pushsubscriptionchange'/.test(sw),
  'ротацію підписки ніхто не помітить — сповіщення просто перестануть приходити');

check('sw.js передає застосунку стару і нову адресу',
  /push-endpoint-changed/.test(sw) && /oldEndpoint/.test(sw),
  'без старої адреси перенести рядки в базі неможливо');

check('клієнт звіряє адресу при старті, а не лише за подією',
  /export async function healPushEndpoint/.test(push) && /localStorage\.getItem\(ENDPOINT_KEY\)/.test(push),
  'ротація при закритому застосунку лишиться непоміченою: подію нікому прийняти');

check('перенос торкається ОБОХ таблиць із endpoint',
  /migratePushEndpoint[\s\S]*?push_subscriptions[\s\S]*?user_push_devices/.test(supabase),
  'полікувати лише автобуси означає лишити чат і коментарі без сповіщень');

console.log('\n── Попередження про автобус ──');

// A5. Дірка 2..12 хв: хто підписався пізно, не отримував нічого до відправлення.
const warnWindow = busFn.match(/notified_warning && minsLeft >= (\d+) && minsLeft <= (\d+)/);
check('вікно попередження починається від 2 хв, а не від 13',
  !!warnWindow && Number(warnWindow[1]) <= 2,
  `нижня межа ${warnWindow ? warnWindow[1] : '?'} — пізня підписка лишається без попередження`);

check('тег сповіщення розрізняє дату і сегмент',
  /function busTag/.test(busFn) && /track_date/.test(busFn.match(/function busTag[\s\S]*?\n}/)?.[0] || ''),
  'однаковий тег: друге сповіщення затирає перше (Web Push замінює за tag)');

check('розклад береться з бойового домену',
  /SCHEDULE_URL\s*=\s*'https:\/\/castlelife\.org/.test(busFn),
  'адреса розкладу вказує на старе дзеркало');

check('збій завантаження розкладу видно у відповіді функції',
  /scheduleOk/.test(busFn),
  'мовчазний збій: скасовані рейси перестають виявлятись і про це ніхто не дізнається');

console.log(`\n${fail ? '❌' : '✅'} ${pass}/${pass + fail} перевірок пройдено`);

// 🛑 МЕЖІ ЦЬОГО СТОРОЖА, названі чесно (урок проєкту: «зелений текстовий сторож
// над зламаною поведінкою», 15.08). Він доводить, що РІШЕННЯ на місці, і НЕ
// доводить, що сповіщення долетіло до телефона. Живий ланцюг «тригер → функція →
// пристрій» перевіряється лише на проді, пальцем. Тому:
//   • тут немає жодної перевірки виду «сповіщення прийшло»;
//   • зміну поведінки в базі (RLS, cron) цей файл теж не бачить.
process.exit(fail ? 1 : 0);
