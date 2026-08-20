// Стенд: ВИДИМІСТЬ ДИТИНИ ВИВОДИТЬСЯ З ВИДИМОСТІ БАТЬКА.
//
// 🔴 20.08, аудит /byyou. Заміряно на живій базі очима СТОРОННЬОГО:
//   • 111 ВИДАЛЕНИХ коментарів спільнот читалися будь-ким;
//   • 14 відповідей під видаленими/неопублікованими постами — теж;
//   •  4 реакції під невидимими постами, 15 — під видаленими коментарями.
// Людина видаляла свій коментар, застосунок його більше не малював — а з бази
// він віддавався далі. Саме тому дірку не було видно очима: екран не брехав,
// брехав доступ.
//
// 🔑 КОРІНЬ БУВ НЕ В ОКРЕМИХ ПОЛІТИКАХ, А В ТОМУ, ЩО ЇХ НЕ ПОВʼЯЗАЛИ. Кожна
// дочірня таблиця відповідала на «чи можна читати цей рядок» САМОСТІЙНО (`true`
// або «чи ти залогінений»), тобто видимість коментаря нічого не знала про
// видимість поста. Поки нічого не видаляли — збігалось.
//
// 🛑 ЦЕЙ СТОРОЖ ОХОРОНЯЄ ПРАВИЛО, А НЕ ВИПАДОК: жодна дочірня таблиця не сміє
// вирішувати свою видимість сама. Нова таблиця з `using (true)` — це та сама
// дірка під іншою назвою, і вона має падати тут, а не через два місяці в базі.
import { projectFile, reporter } from './_lib.mjs';

const { ok, done } = reporter();
const sql = projectFile('scripts/supabase_visibility_model.sql');

// ── Три функції — по одній на сутність, і жодної копії правила ──────────────
for (const fn of ['post_visible', 'page_post_visible', 'page_comment_visible']) {
  ok(`функція «${fn}» визначена`, new RegExp(`create or replace function public\\.${fn}\\(`).test(sql));
}
// ⚠️ Урок 20.08, який коштував години: `set search_path = 'public, auth'` у
// ЛАПКАХ — це одна схема з назвою «public, auth», і функція падає з «relation
// admins does not exist». Пишемо без лапок, і стенд це стереже.
ok('🔴 search_path без лапок (у лапках це одна схема з комою в назві)',
   /set search_path = public, auth/.test(sql) && !/search_path = '/.test(sql));
ok('функції STABLE + SECURITY DEFINER (інакше політика впаде в рекурсію)',
   (sql.match(/language sql stable security definer/g) || []).length === 3);

// ── Кожна дитина питає БАТЬКА, а не вирішує сама ───────────────────────────
const діти = [
  ['comments',               'post_visible(post_id)'],
  ['reactions',              'post_visible(post_id)'],
  ['page_comments',          'page_comment_visible(id)'],
  ['page_reactions',         'page_post_visible(post_id)'],
  ['page_comment_reactions', 'page_comment_visible(comment_id)'],
];
for (const [табл, виклик] of діти) {
  const блок = sql.slice(sql.indexOf(`create policy`, sql.indexOf(`on public.${табл} for select`) - 400));
  ok(`🔴 «${табл}» виводить видимість із батька`, sql.includes(`public.${виклик}`), виклик);
}

// 🔑 Найпряміша перевірка правила: жодна з цих таблиць не сміє сказати «true».
const самовільні = діти.filter(([табл]) =>
  new RegExp(`on public\\.${табл} for select[\\s\\S]{0,120}?using \\(true\\)`).test(sql));
ok('🔴 жодна дочірня таблиця не читається беззастережно (`using (true)`)',
   самовільні.length === 0, самовільні.map(([т]) => т).join(', '));

// ── Батьки кличуть ТУ САМУ функцію — інакше правило живе у двох місцях ──────
// У проєкті дві копії одного правила вже коштували розсинхрону двох списків
// антиспаму і двох кривих анімації. Тут копія коштувала б дірки в доступі.
ok('🔴 політика posts кличе post_visible (правило не дублюється)',
   /create policy "posts read" on public\.posts for select using \(public\.post_visible\(id\)\)/.test(sql));
ok('🔴 політика page_posts кличе page_post_visible',
   /create policy "pposts read" on public\.page_posts for select using \(public\.page_post_visible\(id\)\)/.test(sql));
ok('старі розрізнені політики posts прибрані (їх замінила одна)',
   /drop policy if exists "Public can read published posts"/.test(sql)
   && /drop policy if exists "Owner reads own posts"/.test(sql));

// ── Адмін і редактор сторінки не мають осліпнути ───────────────────────────
ok('адмін бачить видалене (модерувати наосліп не можна)',
   /or public\.is_admin\(\)/.test(sql) && (sql.match(/is_admin\(\)/g) || []).length >= 3);
ok('редактор сторінки бачить свої неопубліковані пости',
   /public\.can_edit_page\(p\.page_id\)/.test(sql));

done();
