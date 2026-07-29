// Стенд №22: ГРУПУВАННЯ РОЗМОВ (одна людина — один рядок).
//
// Проблема: `threads` ключований парою (оголошення, покупець), тому та сама людина,
// яка написала по двох оголошеннях, давала ДВА рядки у «Повідомленнях». Скарга Вови
// зі скріншотом: «Dmytro Vasylchuk» двічі в списку.
//
// ⚠️ Ганяємо СПРАВЖНІЙ код: блок `groupConversations` вирізається прямо з
// `src/core/chat-core.js` за маркерами [GROUP-START]/[GROUP-END]. Копії функції тут
// НЕМА — інакше стенд перевіряв би сам себе (ця пастка вже спрацьовувала в проєкті).
//
// 🔴 КОНТРОЛЬ обовʼязковий: перевіряємо ще й СТАРУ поведінку (рядок = тред) і
// вимагаємо, щоб вона давала ІНШЕ число. Без контролю стенд був би зелений навіть
// якби групування не працювало зовсім — рівно так уже брехав стенд футера картки.
import { readFileSync } from 'fs';
import { projectFile } from './_lib.mjs';

const SRC = projectFile('src/core/chat-core.js');
const mark = SRC.indexOf('[GROUP-START]');
const to   = SRC.indexOf('[GROUP-END]');
if (mark < 0 || to < 0) { console.log('❌ не знайшов блок groupConversations у chat-core.js'); process.exit(1); }
// ⚠️ Ріжемо від КІНЦЯ рядка з маркером: сам маркер стоїть усередині коментаря, і зріз
// рівно по ньому лишав «[GROUP-START] ───» голим кодом (спіймано на першому запуску).
const from  = SRC.indexOf('\n', mark) + 1;
const block = SRC.slice(from, to).replace(/^export /gm, '');
// ⚠️ ПЕРЕВІД РЯДКА ПЕРЕД `return` ОБОВʼЯЗКОВИЙ: блок закінчується рядком-коментарем
// `// ────`, і без \n `return` дописувався В ТОЙ САМИЙ коментар — функція мовчки
// виходила undefined. Друга пастка зрізу за маркерами, спіймана на запуску.
const groupConversations = new Function(`${block}\n; return groupConversations;`)();
if (typeof groupConversations !== 'function') { console.log('❌ зріз за маркерами не дав функцію'); process.exit(1); }

// ── Дані: я — продавець (ME). Дмитро написав по ДВОХ моїх оголошеннях. ──
const ME    = 'me-uid';
const DIMA  = 'dima-uid';
const ANDRIY = 'andriy-uid';

const th = (id, post_id, author_uid, buyer_uid, at, extra = {}) => ({
  id, post_id, author_uid, buyer_uid,
  author_name: author_uid === ME ? 'Володимир' : (author_uid === DIMA ? 'Dmytro' : 'Андрій'),
  buyer_name:  buyer_uid  === ME ? 'Володимир' : (buyer_uid  === DIMA ? 'Dmytro' : 'Андрій'),
  last_message_at: at, ...extra,
});

const threads = [
  th(1, 101, ME, DIMA,   '2026-07-29T19:19:00Z'),   // Дмитро — оголошення 101
  th(2, 102, ME, DIMA,   '2026-07-26T10:00:00Z'),   // Дмитро — оголошення 102 (те саме людина!)
  th(3, 101, ME, ANDRIY, '2026-07-28T12:00:00Z'),   // Андрій — оголошення 101
];
const unread = new Map([[1, 2], [2, 3], [3, 1]]);

let pass = 0, fail = 0;
const ok = (name, got, want) => {
  const good = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${good ? '✅' : '❌'} ${name}${good ? '' : `  очікував ${JSON.stringify(want)}, отримав ${JSON.stringify(got)}`}`);
  good ? pass++ : fail++;
};

const conv = groupConversations(threads, ME, unread);

ok('три треди → дві розмови', conv.length, 2);
ok('КОНТРОЛЬ: стара логіка дала б три рядки', threads.length, 3);
ok('перша розмова — Дмитро (найсвіжіше повідомлення)', conv[0].otherUid, DIMA);
ok('у Дмитра два контексти', conv[0].threads.length, 2);
ok('в Андрія один контекст', conv[1].threads.length, 1);
ok('непрочитані Дмитра = сума обох тредів', conv[0].unread, 5);
ok('непрочитані Андрія', conv[1].unread, 1);
ok('контексти всередині — найсвіжіший перший', conv[0].threads.map(t => t.id), [1, 2]);
ok('прев\'ю розмови = найсвіжіший тред', conv[0].last.id, 1);
ok('імʼя співрозмовника з боку продавця', conv[0].otherName, 'Dmytro');

// ── Я — ПОКУПЕЦЬ у тій самій парі: імʼя має братись з іншого боку ──
const asBuyer = groupConversations([th(4, 201, DIMA, ME, '2026-07-29T20:00:00Z')], ME, new Map());
ok('імʼя співрозмовника з боку покупця', asBuyer[0].otherName, 'Dmytro');
ok('uid співрозмовника з боку покупця', asBuyer[0].otherUid, DIMA);

// ── Змішана роль: Дмитро мій покупець І мій продавець → ОДНА розмова ──
const mixed = groupConversations([
  th(5, 301, ME, DIMA, '2026-07-29T10:00:00Z'),
  th(6, 302, DIMA, ME, '2026-07-29T11:00:00Z'),
], ME, new Map());
ok('продавець і покупець в одній особі → одна розмова', mixed.length, 1);
ok('обидві ролі потрапили в контексти', mixed[0].threads.length, 2);

// ── Порожній uid не злипається в одну розмову ──
const noUid = groupConversations([
  { id: 7, post_id: 401, author_uid: ME, buyer_uid: null, last_message_at: '2026-07-29T09:00:00Z' },
  { id: 8, post_id: 402, author_uid: ME, buyer_uid: null, last_message_at: '2026-07-29T08:00:00Z' },
], ME, new Map());
ok('два треди без uid покупця лишаються окремими', noUid.length, 2);

// ── Порожній вхід не падає ──
ok('порожній список', groupConversations([], ME).length, 0);
ok('null замість списку', groupConversations(null, ME).length, 0);

// ── Тред без часу не ламає сортування ──
const noTime = groupConversations([
  th(9, 501, ME, ANDRIY, null),
  th(10, 502, ME, DIMA, '2026-07-29T12:00:00Z'),
], ME, new Map());
ok('розмова з часом стоїть вище за розмову без часу', noTime[0].otherUid, DIMA);

// ⚠️ Формат підсумку СТРОГИЙ — `tests/run.mjs` шукає рівно «N/M перевірок пройдено».
// Інший текст → у зведенні буде «впав, не дійшовши до підсумку», хоч усе зелене.
console.log(`\n${fail ? '❌' : '✅'} ${pass}/${pass + fail} перевірок пройдено`);
process.exit(fail ? 1 : 0);
