// Стенд: ВИДАЛЕНЕ НЕ ЖИВЕ В АДМІНЦІ (07.11.2026).
//
// 🗣️ Вова: «питання я сам видалив, і воно досі в адмінці… не можу з ним нічого
// зробити». Адмін за RLS бачить і рядки з `deleted_at`, а помічники адмінки
// відсіювали лише ТИП — видалене автором питання стояло в черзі «без відповіді».
//
// 🔑 Стенд ВИКОНУЄ справжні помічники, вирізані з `admin.html` (тієї ревізії, що
// в `REV`), на прикладних даних — регулярка «є слово deleted_at» зеленіла б і над
// фільтром, поставленим не туди.
// Контроль: `REV=<коміт до правки> node tests/admin-deleted.mjs` → червоне.
import { reporter, projectFile } from './_lib.mjs';

const { ok, done } = reporter();
const admin = projectFile('admin.html', process.env.REV || '');

const від = admin.indexOf('const ЦЕ_ПИТАННЯ');
const до  = admin.indexOf('.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));', від);
ok('контроль: блок помічників знайдено в admin.html', від > 0 && до > від);
const блок = admin.slice(від, до) + '.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));';

const allPosts = [
  { id: 1, type: 'chat',  status: 'published', deleted_at: null },
  { id: 2, type: 'chat',  status: 'published', deleted_at: '2026-10-31T10:00:00Z' },   // видалив автор
  { id: 3, type: 'board', status: 'published', deleted_at: null },
  { id: 4, type: 'board', status: 'published', deleted_at: '2026-11-07T10:00:00Z' },   // сховане 07.11
  { id: 5, type: 'board', status: 'pending',   deleted_at: '2026-11-07T10:00:00Z' },
];
const comments = [
  { id: 10, post_id: 1, created_at: '2026-09-01', deleted_at: null },
  { id: 11, post_id: 1, created_at: '2026-09-02', deleted_at: '2026-09-03' },
];
const f = new Function('allPosts', 'comments', `${блок}
  return { питання: питання().map(p => p.id), оголошення: оголошення().map(p => p.id),
           відповіді: відповідіДо(1).map(c => c.id) };`);
const r = f(allPosts, comments);

ok('🔴 видалене автором питання НЕ в списку питань', JSON.stringify(r.питання) === '[1]', JSON.stringify(r.питання));
ok('🔴 сховані оголошення НЕ в списку оголошень', JSON.stringify(r.оголошення) === '[3]', JSON.stringify(r.оголошення));
ok('🔴 видалена відповідь не рахується', JSON.stringify(r.відповіді) === '[10]', JSON.stringify(r.відповіді));

// Черги модерації й «Опубліковані» будуються окремо — теж мусять відсіювати.
const черги = admin.slice(admin.indexOf('pendingPosts   = allPosts'), admin.indexOf('publishedPosts = allPosts') + 120);
ok('🔴 черга модерації й «Опубліковані» відсіюють видалене',
   /pendingPosts\s*=\s*allPosts\.filter\(p => живий\(p\)/.test(черги) && /publishedPosts\s*=\s*allPosts\.filter\(p => живий\(p\)/.test(черги));

// Фільтр відповідей марний, якщо поле не вантажиться: заглушка дані подавала сама,
// а справжній запит `comments` брав колонки БЕЗ deleted_at (спіймано 07.11 читанням).
ok('🔴 запит відповідей вантажить deleted_at (інакше фільтр нічого не бачить)',
   /from\('comments'\)\.select\('[^']*deleted_at[^']*'\)/.test(admin));

done();
