// src/core/supabase.js
// Ініціалізація Supabase клієнта + хелпери для роботи з БД.
//
// SDK завантажується через CDN у index.html → доступний як window.supabase.
// Тут створюємо ОДИН екземпляр клієнта і експортуємо його + готові функції.
//
// Якщо URL/key не задані (наприклад при локальній розробці без БД) — клієнт
// створиться, але виклики будуть фейлитись. Тому є fallback на JSON у тих
// модулях що читають дошку.

import { escapeHtml } from './utils.js';   // для hydrateAvatars (безпечний <img src>)

// ⚙️ КОНФІГ — ті самі що в admin.html (Project Settings → API):
const SUPABASE_URL      = 'https://uabyfecseqnemvcqhdem.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_sbV0XNktCiTK0iA4659P9g_Y3sT0mDv';

// Створюємо клієнт. Якщо CDN не завантажився (offline / поганий зв'язок) —
// supa буде null, виклики безпечно повернуть null.
let supa = null;
if (typeof window !== 'undefined' && window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
  supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // Фаза Б: тримаємо сесію входу між запусками + ловимо її після повернення
    // з Google OAuth (редірект назад містить токен у URL). Без цього Google-вхід
    // не зберігається. persistSession — пам'ятати вхід; detectSessionInUrl —
    // підхопити токен з URL після редіректу; autoRefreshToken — продовжувати сесію.
    auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
  });
}

// 🔴 26.08 — ЛІНИВЕ СТВОРЕННЯ, А НЕ «ОДИН РАЗ І НАЗАВЖДИ».
// 🗣️ Вова зі скріна (Safari, 22:42): «Немає звʼязку з сервером» при спробі входу.
// 🛑 Клієнт створювався РІВНО ОДИН РАЗ — у мить завантаження цього модуля. Якщо
// `window.supabase` тоді ще не було (сторонній скрипт не доїхав), `supa` лишався `null`
// НАЗАВЖДИ: жоден пізніший виклик його вже не створював, і застосунок мовчки жив без
// бази до перезавантаження сторінки.
// 🔑 Тепер спроба повторюється при кожному зверненні, поки не вдасться. Це дешево
// (одна перевірка `window.supabase`) і рятує випадок, коли SDK доїхав із запізненням.
// ⚠️ Головну причину це не лікує — її вилікувано перенесенням SDK на свій домен
// (`vendor/`, див. `index.html`). Тут — другий рубіж, на випадок будь-якої іншої
// затримки: перший рубіж може впасти, і тоді має спрацювати другий.
function створити() {
  if (supa) return supa;
  if (typeof window === 'undefined' || !window.supabase) return null;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, detectSessionInUrl: true, autoRefreshToken: true },
  });
  return supa;
}

export function getSupabase() {
  return supa || створити();
}

// 🔑 Чи існує сам SDK — окреме питання від «чи є звʼязок». Раніше екран не вмів їх
// розрізнити й на обидва казав «Немає звʼязку з сервером», хоча в одному випадку мережа
// цілком жива, а бракує файлу бібліотеки. Різні причини мусять давати різні слова —
// інакше людина шукає проблему не там.
export function sdkLoaded() {
  return typeof window !== 'undefined' && !!window.supabase;
}

// 🔴 16.08 — UID З ЖИВОЇ СЕСІЇ, А НЕ З ПАМʼЯТІ МОДУЛЯ.
//
// ЩО ЦЕ ЛІКУЄ (скарга Вови зі знімка: «Не вдалося увімкнути сповіщення»,
// і водночас банер «СПОВІЩЕННЯ ПРО РЕЙС АКТИВОВАНО»). У логах бази лежало
// `new row violates row-level security policy for table "push_subscriptions"`.
//
// 🔑 Корінь — РОЗХОДЖЕННЯ ДВОХ ДЖЕРЕЛ ПРАВДИ про те, хто ти:
//   • клієнт брав `user_uuid` з `currentUserId()` — це кеш у памʼяті модуля
//     (`_user`), який живе, поки відкритий застосунок;
//   • база звіряє записане значення з `auth.uid()` — тобто з ТОКЕНОМ самого
//     запиту.
// Щойно токен протух (для PWA на телефоні це звичайна річ після сну), кеш ще
// каже «залогінений», а запит іде вже без чинного токена: `auth.uid()` порожній,
// умова `user_uuid = auth.uid()` хибна — і база відхиляє рядок. Зовні це «чомусь
// не вмикається», без жодної підказки.
// ⚠️ Друга половина тієї самої вади — фолбек `currentUserId() || getAnonId()` у
//    місці виклику: анонімний id **ніколи** не дорівнює `auth.uid()`, тобто такий
//    запис приречений за побудовою. Прибрано разом із цим.
// ✅ `getSession()` віддає ЖИВУ сесію і сам оновлює токен, якщо той протух, —
//    тому взятий звідси `id` за визначенням дорівнює тому `auth.uid()`, з яким
//    прийде запит. Немає сесії → повертаємо null, і викликач чесно каже про це,
//    замість писати рядок, який база однаково відкине.
export async function freshUserId() {
  if (!supa) return null;
  try {
    const { data } = await supa.auth.getSession();
    return data?.session?.user?.id || null;
  } catch (e) {
    console.warn('[auth] freshUserId:', e && e.message);
    return null;
  }
}

export function isSupabaseReady() {
  return supa !== null;
}

// ── КОМАНДА / КОНСОЛЬ ────────────────────────────────────────────────────
// Чи поточний користувач — член команди (адмін АБО редактор). SERVER-authoritative:
// викликає security-definer is_team_member() у БД — гість/чужий отримає false,
// підмінити з клієнта не можна (таблиці editor_users/admins під RLS).
// Використовує сайдбар, щоб показати «Кабінет» лише команді.
export async function isTeamMember() {
  if (!supa) return false;
  try {
    const { data, error } = await supa.rpc('is_team_member');
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

// ── ПОСТИ ────────────────────────────────────────────────────────────────

// Усі опубліковані пости (для Дошки громади 2.0)
// Сортування за bumped_at DESC (підняті/свіжі зверху; bumped_at заповнено для всіх).
// Якщо БД недоступна або порожня — повертаємо null (caller fall back на JSON).
export async function fetchPublishedPosts() {
  if (!supa) return null;
  const { data, error } = await supa
    .from('posts')
    .select('*')
    .eq('status', 'published')
    .order('bumped_at', { ascending: false, nullsLast: true })
    .limit(200);
  if (error) {
    console.warn('[supabase] fetchPublishedPosts error:', error.message);
    return null;
  }
  return data;
}

// Один пост за id (для модалки коментарів — потім, у Спринт 4)
export async function fetchPostById(id) {
  if (!supa) return null;
  const { data, error } = await supa
    .from('posts')
    .select('*')
    .eq('id', id)
    .single();
  if (error) return null;
  return data;
}

// Створити новий пост (з submit-форми) через RPC submit_board_post.
// Сервер сам вирішує статус: довірений автор (5+ схвалених) → 'published'
// одразу, решта → 'pending' на модерацію. Плюс серверний рейт-ліміт
// (обмеження частоти — 3 пости/хв). payload.status/owner_uid ігноруються,
// форсуються сервером (scripts/supabase_reputation.sql).
// Повертає { ok:true, status:'pending'|'published' } або { ok:false, error }.
export async function submitPost(payload) {
  if (!supa) return { ok: false, error: 'Немає з\'єднання з базою' };
  // netCall оголошено нижче у файлі — це нормально: оголошення функції піднімається
  // (hoisting), а виклик стається вже під час роботи, коли весь модуль завантажений.
  const r = await netCall(() => supa.rpc('submit_board_post', { payload }));
  if (!r.ok) return { ok: false, error: r.error };
  // Сервер може відповісти «ok:false» ЗМІСТОВНО (антиспам, ліміт) — це не мережа.
  if (r.data && r.data.ok === false) return { ok: false, error: netErrorText(r.data.error) };
  return { ok: true, status: (r.data && r.data.status) || 'pending' };
}

// ОБГОВОРЕННЯ (type='chat') — БЕЗ людської модерації: публікуємо одразу.
// Пропускає RLS-політика «залогінений може створити обговорення» (лише
// authenticated + owner_uid = auth.uid()). Матюки блокуються на клієнті.
// Потребує scripts/supabase_discussions_open.sql (запускає Вова один раз).
export async function submitDiscussion(payload) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  const nowIso = new Date().toISOString();
  const row = { ...payload, type: 'chat', status: 'published',
                published_at: nowIso, bumped_at: nowIso };
  // Вставка БЕЗ клієнтського ключа (у `posts` його немає) → повтор не робимо:
  // дубль обговорення в стрічці гірший за «спробуй ще раз». Текст — людський.
  const r = await netInsert(() => supa.from('posts').insert(row));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// ── СКАРГИ НА ОГОЛОШЕННЯ ────────────────────────────────────────────────
// 🔴 02.08 — до цього кнопка «Поскаржитися» показувала тост і НЕ ПИСАЛА НІКУДИ.
// Тобто застосунок обіцяв дію, якої не існувало: людина вважала, що поскаржилась,
// і більше не писала Вові напряму. Це гірше за відсутню кнопку.
//
// ⚠️ Клієнт шле РІВНО ТРИ поля: `post_id`, `reason`, `details`. Усе інше —
// хто поскаржився, хто автор оголошення, як воно називалось — заповнює ТРИГЕР у
// базі (`scripts/supabase_ad_reports.sql`). Причина не зручність: якби знімок робив
// клієнт, зловмисник надіслав би чужий `post_owner_uid` і підставив би людину.
//
// Повертає { ok:true } або { ok:false, error } з ЛЮДСЬКИМ текстом — база кидає
// свої повідомлення українською («Не можна поскаржитись на власне оголошення»,
// «Забагато скарг за добу»), і саме їх варто показати, а не «помилка 400».
// ⚠️ База кидає МАШИННІ КОДИ (`report_self`, `report_flood`…), а не готовий текст.
// Причина: людські формулювання в проєкті живуть в ОДНОМУ місці (`netErrorText`), і
// якби база слала українську фразу, вона стала б другою копією словника — а дві копії
// в цьому проєкті вже розходились тричі. Заразом `netErrorText` не поглинає їх у
// загальне «не вдалося зберегти», як сталося б із довільним текстом.
const REPORT_ERRORS = {
  report_auth:    'Щоб поскаржитись, треба увійти',
  report_no_post: 'Оголошення вже видалено',
  report_self:    'Це твоє власне оголошення',
  report_flood:   'Забагато скарг за добу — спробуй завтра',
};

export async function submitAdReport(postId, reason, details) {
  if (!supa) return { ok: false, error: 'Немає з\'єднання з базою' };
  const r = await netCall(() => supa.from('ad_reports').insert({
    post_id: postId, reason, details: details || null,
  }));
  if (r.ok) return { ok: true };
  // `raw` — технічний текст від бази; `error` — уже людський від `netErrorText`.
  const raw = String(r.raw || '');
  const code = Object.keys(REPORT_ERRORS).find(k => raw.includes(k));
  if (code) return { ok: false, error: REPORT_ERRORS[code] };
  // Унікальність (post_id, reporter_uid) — людина вже скаржилась на це оголошення.
  if (/duplicate|unique/i.test(raw)) {
    return { ok: false, error: 'Ти вже скаржився на це оголошення' };
  }
  return { ok: false, error: r.error };
}

// ── ТЕЛЕФОН З ОГОЛОШЕННЯ — ПО ЗАПИТУ ────────────────────────────────────
//
// 🔴 09.08 (потік 2, крок 10). Дошка читає пости через `select('*')`, тобто
// колонка `contact` приїжджає в кожній вибірці: заміряно на живій базі —
// **4 телефони з 11 опублікованих оголошень качались усім**, включно з
// незалогіненим, одним запитом і не відкриваючи жодного оголошення.
// Тепер номер віддає RPC `get_post_contact` (`scripts/supabase_post_contact.sql`):
// лише авторизованому, з журналом і стелею 30 номерів на годину.
//
// ⚠️ Порядок розгортання навмисний: спершу RPC (адитивна, нічого не ламає) і цей
// код, і лише ПОТІМ — закриття самої колонки (частина Б тієї ж міграції). Інакше
// був би проміжок, коли номер уже не приходить, а попросити його ще нема як.
const CONTACT_ERRORS = {
  contact_auth:    'Щоб побачити номер, треба увійти',
  contact_flood:   'Забагато номерів за годину — спробуй пізніше',
  contact_no_post: 'Оголошення вже недоступне',
};

// → { ok: true, contact: '+380…' | null } або { ok: false, error: 'людський текст' }
// `contact: null` — телефон не вказаний узагалі, це НЕ помилка.
export async function fetchPostContact(postId) {
  if (!supa) return { ok: false, error: 'Немає з\'єднання з базою' };
  const r = await netCall(() => supa.rpc('get_post_contact', { p_post_id: postId }));
  if (r.ok) return { ok: true, contact: r.data ?? null };
  // ⚠️ Машинний код шукаємо і в `raw`, і в `error`: `netCall` пропускає сирий
  // текст бази в `raw`, а `error` уже перекладений на людську мову — покластись
  // лише на друге означало б втратити код і показати загальне «щось пішло не так».
  const hay = `${r.raw || ''} ${r.error || ''}`;
  const code = Object.keys(CONTACT_ERRORS).find(k => hay.includes(k));
  return { ok: false, error: code ? CONTACT_ERRORS[code] : r.error };
}

// ── ОФІЦІЙНІ ОГОЛОШЕННЯ ─────────────────────────────────────────────────

export async function fetchPublishedAnnouncements() {
  if (!supa) return null;
  const { data, error } = await supa
    .from('announcements')
    .select('*')
    .eq('status', 'published')
    .order('pinned', { ascending: false })
    .order('published_at', { ascending: false, nullsLast: true })
    .limit(50);
  if (error) {
    console.warn('[supabase] fetchPublishedAnnouncements error:', error.message);
    return null;
  }
  return data;
}

// ── ЗБОРИ КОШТІВ ────────────────────────────────────────────────────────
//
// 🔴 ПЕРЕЇЗД 17.08: збори жили у файлі `data/fundraisers.json` у git, тепер — у
// базі. Причина не «так сучасніше»: адмінка (`admin.html`) пише в Supabase і
// НЕ МОЖЕ писати в git, бо для цього їй потрібен був би ключ запису в
// репозиторій — а він лежав би у браузері, тобто у всіх на видноті. Без бази
// збори лишились би тим, що вміє редагувати лише Вова через GitHub.
//
// ⚠️ ЦІНА ПЕРЕЇЗДУ, НАЗВАНА ЧЕСНО: файл лежав у кеші Service Worker, тобто блок
// працював офлайн. Тепер без мережі зборів не буде — `null` і секція зникає.
// Це прийнятно саме тут: збір це ДІЯ (перейти на банку), а дія однаково вимагає
// мережі. Показувати кнопку, яка нікуди не веде, було б гірше.
//
// 🔑 Віддаємо `null` при збої і `[]` при порожній базі — це РІЗНІ речі, і
// віджет поводиться з ними однаково лише випадково. Плутати їх не можна: колись
// зʼявиться «не вдалося завантажити», і тоді різниця стане видимою.
export async function fetchFundraisers() {
  if (!supa) return null;
  const { data, error } = await supa
    .from('fundraisers')
    .select('id, title, org, url, goal, photo, note, kind, until, place, verified, active, sort_order')
    // `active` фільтрує і RLS-політика — тут це не дубль, а економія: без умови
    // сервер однаково віддав би лише активні, але порахував би зайве.
    .eq('active', true)
    // Ручний порядок першим: адмін має могти підняти терміновий збір угору.
    // Далі — за датою кінця (найтерміновіший перший), решту сортує сам віджет.
    .order('sort_order', { ascending: false })
    .order('until', { ascending: true, nullsLast: true })
    .limit(20);
  if (error) {
    console.warn('[supabase] fetchFundraisers error:', error.message);
    return null;
  }
  return data;
}

// Заявка від жителя. 🔴 Повертає МАШИННИЙ код помилки нагору, а не готовий
// текст: «ви вже подали три заявки за добу» і «перевірте посилання» — різні
// поради, і склеювати їх у «щось пішло не так» означає лишити людину без
// підказки саме там, де вона намагається попросити про допомогу.
export const FUND_REQ_ERRORS = {
  freq_flood: 'Ви вже подали три заявки за добу. Ми відповімо на попередні — зачекайте, будь ласка.',
  freq_url_https: 'Посилання на банку має починатися з https://',
  freq_title_ok: 'Назва збору — від 3 до 120 символів.',
  freq_org_ok: 'Вкажіть, хто збирає — від 2 до 80 символів.',
  freq_phone_ok: 'Перевірте номер телефону.',
  freq_name_ok: 'Вкажіть контактну особу.',
  freq_goal_ok: 'Ціль має бути додатнім числом.',
  freq_note_ok: 'Опис задовгий — до 400 символів.',
};

export async function submitFundraiserRequest(payload) {
  if (!supa) return { ok: false, error: 'Немає звʼязку з сервером.' };
  const uid = await freshUserId();
  // 🔴 Гейт входу стоїть і тут, і в базі. Тут — щоб людина побачила зрозуміле
  // «увійдіть», а не сирий текст політики доступу.
  if (!uid) return { ok: false, error: 'Щоб подати збір, увійдіть у застосунок.' };

  const r = await netCall(() => supa.from('fundraiser_requests').insert({ ...payload, author_uid: uid }));
  if (r.ok) return { ok: true };
  const hay = `${r.raw || ''} ${r.error || ''}`;
  const code = Object.keys(FUND_REQ_ERRORS).find(k => hay.includes(k));
  return { ok: false, error: code ? FUND_REQ_ERRORS[code] : r.error };
}

// Свої заявки — щоб людина бачила, що з її зверненням (RLS віддає лише свої).
export async function fetchMyFundraiserRequests() {
  if (!supa) return null;
  const uid = await freshUserId();
  if (!uid) return [];
  const { data, error } = await supa
    .from('fundraiser_requests')
    .select('id, title, status, created_at')
    .eq('author_uid', uid)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) { console.warn('[supabase] fetchMyFundraiserRequests:', error.message); return null; }
  return data;
}

// ── АНОНІМНИЙ ID для реакцій (поки немає auth у звичайних юзерів) ─────────
const ANON_ID_KEY = 'cstl-anon-id';
export function getAnonId() {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = crypto.randomUUID
        ? crypto.randomUUID()
        : 'anon-' + Math.random().toString(36).slice(2) + '-' + Date.now();
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    return 'anon-fallback';
  }
}

// ── РЕАКЦІЇ ──────────────────────────────────────────────────────────────

// Усі реакції на всі опубліковані пости.
// Повертає Map<post_id, { counts: {emoji: count}, my: emoji|null }>.
export async function fetchAllReactions(anonId) {
  if (!supa) return new Map();
  const { data, error } = await supa.from('reactions').select('post_id, user_id, emoji');
  if (error) {
    console.warn('[supabase] fetchAllReactions error:', error.message);
    return new Map();
  }
  const map = new Map();
  for (const r of (data || [])) {
    if (!map.has(r.post_id)) map.set(r.post_id, { counts: {}, my: null });
    const e = map.get(r.post_id);
    e.counts[r.emoji] = (e.counts[r.emoji] || 0) + 1;
    if (r.user_id === anonId) e.my = r.emoji;
  }
  return map;
}

// Поставити / змінити / зняти свою реакцію. emoji = null → знімаємо.
// userId — uid залогіненого жителя (auth.uid()). Після RLS-перепису Етапу 3
// політика вимагає user_id = auth.uid()::text, тож реагувати може лише акаунт.
export async function setReaction(postId, userId, emoji) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  // Реакція — ідемпотентна (зняти/поставити дає той самий результат), тож повтор
  // при обриві безпечний. Текст помилки людський, але викликач її зазвичай не
  // показує: смітити тостом через лайк — гірше за тихий відкат галочки.
  if (emoji == null) {
    const r = await netCall(() => supa.from('reactions')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId));
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
  // upsert через onConflict (post_id, user_id) — або INSERT, або UPDATE emoji
  const r = await netCall(() => supa.from('reactions')
    .upsert({ post_id: postId, user_id: userId, emoji }, { onConflict: 'post_id,user_id' }));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// ── КОМЕНТАРІ ────────────────────────────────────────────────────────────

// Усі коментарі усіх постів — Map<post_id, comments[]>.
// ⚠️ 24.08 — доданий явний `.is('deleted_at', null)`. До міграції
// `soft_delete_visibility_own_comments` видалені відсікала САМА політика
// читання, тож запит міг про них не думати. Тепер автор бачить свої видалені
// (без цього видалення взагалі не працювало — розбір у
// `scripts/supabase_soft_delete_visibility.sql`), і без цього рядка вони
// приїжджали б у клієнт марно.
// 🔑 На екран це не впливало б і без фільтра — усі лічильники Питань ідуть
// через `activeComments()`, який відсіює видалені. Йдеться саме про трафік:
// просимо те, що показуємо.
export async function fetchAllComments() {
  if (!supa) return new Map();
  const { data, error } = await supa
    .from('comments')
    .select('id, post_id, author, text, created_at, sender_uid, reply_to_id, edited_at, deleted_at, client_tag')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) {
    console.warn('[supabase] fetchAllComments error:', error.message);
    return new Map();
  }
  const map = new Map();
  for (const c of (data || [])) {
    if (!map.has(c.post_id)) map.set(c.post_id, []);
    map.get(c.post_id).push(c);
  }
  return map;
}

// senderUid — uid автора (auth.uid()). Обов'язковий після RLS-перепису Етапу 3
// (політика "Auth post comment" вимагає sender_uid = auth.uid()).
export async function addComment(postId, author, text, senderUid, { replyToId = null, clientTag = null } = {}) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  const row = { post_id: postId, author: author || null, text };
  if (senderUid) row.sender_uid = senderUid;
  if (replyToId) row.reply_to_id = replyToId;
  if (clientTag) row.client_tag = clientTag;
  // Як і в чаті: повтор лише зі звіркою за client_tag, інакше під обговоренням
  // з'явиться два однакові коментарі.
  const r = await netInsert(() => supa.from('comments').insert(row).select().single(), {
    verify: clientTag
      ? () => supa.from('comments').select('*').eq('post_id', postId).eq('client_tag', clientTag).maybeSingle()
      : null,
  });
  return r.ok ? { ok: true, comment: r.data } : { ok: false, error: r.error };
}

// Редагування свого коментаря «Обговорень» (текст + позначка edited_at)
export async function editComment(commentId, text) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const r = await netCall(() => supa.from('comments')
    .update({ text, edited_at: new Date().toISOString() })
    .eq('id', commentId).select().single());
  return r.ok ? { ok: true, comment: r.data } : { ok: false, error: r.error };
}

// М'яке видалення коментаря (лишаємо рядок, ставимо deleted_at → плейсхолдер у UI).
//
// 🔴 24.08 — ЗВІДСИ ПРИБРАНО `text: ''`, І ЦЕ ВИПРАВЛЕННЯ БАГА, ЯКИЙ ЗНАЙШОВ
// ВОВА НА ПРОДІ: «написав відповідь на питання і не можу видалити», тост
// «❌ Не вдалося видалити: Текст порожній».
//
// 🔑 Ланцюг був такий. На `comments` у базі стоїть тригер
// `trg_comments_guard_update_antispam` (BEFORE UPDATE, накочено міграцією
// `comment_edit_support_and_antispam_on_update` 25.07). Він каже:
//     if new.text is distinct from old.text then  → прогнати антиспам
// Ми міняли текст на порожній → тригер бачив «текст змінився» → антиспам
// законно відповідав «порожній коментар» → весь UPDATE відкочувався.
// Тобто **видалення не відрізнялось від правки тексту**.
//
// ⚠️ Старий коментар тут пояснював `text: ''` тим, що «колонка може бути NOT
// NULL». Це хибний аргумент, і він же тримав ваду: `NOT NULL` забороняє
// записати NULL, а НЕ передати поле взагалі. Звірено з базою 24.08:
// `comments.text` справді `NOT NULL` — і саме тому поле треба просто НЕ
// ЧІПАТИ, а не затирати порожнім рядком.
//
// 🔑 Тепер однаково зі «Стрічкою»: `deletePageComment` завжди слав лише
// `deleted_at`, і тому там видалення працювало. Різниця між двома поверхнями
// і була всією вадою — той самий клас, що ловився 22-24.08 тричі поспіль.
// 🛑 База теж полагоджена (`scripts/supabase_comment_delete_antispam.sql`):
// покладатись лише на клієнта не можна — його можна обійти, і наступний виклик
// повторив би це мовчки.
export async function deleteComment(commentId) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const r = await netCall(() => supa.from('comments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId).select().single());
  return r.ok ? { ok: true, comment: r.data } : { ok: false, error: r.error };
}

// ── ВЛАСНЕ ПИТАННЯ: РЕДАГУВАТИ Й ВИДАЛИТИ (25.08) ────────────────────────────
//
// Слово Вови: «Коли користувач написав питання, він його не може ні редагувати,
// ні видалити… Це потрібно виправити. Виправити технічно правильно.»
//
// 📐 Заміряно перед роботою: у `posts` не було ЖОДНОГО `update`/`delete` з
// клієнта, а в базі — рівно дві політики запису, обидві `is_admin()`. Заборона
// була станом за замовчуванням, а не випадковою дірою.
//
// 🔑 ЧОМУ RPC, А НЕ ПРЯМИЙ `.update()`. Це вже усталений спосіб цього проєкту —
// так само редагується оголошення (`update_board_post`). Причина не в смаку:
// політика `using (owner_uid = auth.uid())` дозволила б авторові змінити
// БУДЬ-ЯКЕ поле рядка — `status` ('rejected' → 'published', тобто обійти
// модерацію), `type` ('chat' → 'board': питання публікується саме, оголошення
// проходить перевірку), `owner_uid`. Це рівно клас вади B-23. RPC пише лише ті
// колонки, які перелічені в його тілі, і майбутня колонка туди не потрапить.
//
// 🛑 Перевірки НЕ ДУБЛЮЄМО на клієнті: «це моє?», «це питання?», «не порожнє?»
// і антиспам живуть у самій функції. Друга копія розійшлася б із першою, а
// вирішує однаково лише та, що в базі, — клієнт можна обійти.
export async function updateQuestion(postId, text) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const r = await netCall(() => supa.rpc('update_question', { p_id: postId, p_text: text }));
  if (!r.ok) return { ok: false, error: r.error };
  return r.data?.ok ? { ok: true, editedAt: r.data.edited_at } : { ok: false, error: r.data?.error || 'Не вдалося' };
}

export async function deleteQuestion(postId) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const r = await netCall(() => supa.rpc('delete_question', { p_id: postId }));
  if (!r.ok) return { ok: false, error: r.error };
  return r.data?.ok ? { ok: true } : { ok: false, error: r.data?.error || 'Не вдалося' };
}

// ── STORAGE: завантаження фото у bucket community-photos ─────────────────
// Раніше фото зберігались як base64 у posts.photos[] (TEXT[]) — кожне ~150KB
// тексту у БД, max 3 фото = 450KB на пост. При 100+ постах таблиця посту
// роздувалась. Тепер фото йдуть у Supabase Storage, у БД — тільки публічні
// URL (короткі рядки). Bucket створено у scripts/supabase_schema.sql.
//
// Аргумент: Blob (зазвичай 50-200KB після canvas-стиснення).
// folder — необовʼязковий префікс у бакеті (напр. 'avatars/' для фото профілю,
// Потік 12) — тримає аватари окремо від фото оголошень. Дефолт '' = як раніше.
// Шлях у бакеті: [folder]<anonId>/<timestamp>-<random>.jpg (анонімні юзери розділяються).
// Повертає: { url, error }. url — публічний URL для <img src>.
// 🔒 ДВА СХОВИЩА, А НЕ ОДНЕ (01.08.2026, аудит безпеки).
//   `community-photos` — ПУБЛІЧНЕ: оголошення, пости Стрічки, аватари, банери.
//                        Те, що й так бачить кожен відвідувач.
//   `chat-photos`      — ЗАКРИТЕ: фото з приватних переписок. Читати може лише
//                        учасник тієї розмови, і тільки за тимчасовим посиланням.
// Чому розділили: до цього фото особистих чатів лежали в публічному бакеті —
// текст повідомлення RLS захищала, а файл був доступний за прямим посиланням.
export const PUBLIC_BUCKET = 'community-photos';
export const CHAT_BUCKET   = 'chat-photos';

// Скільки живе тимчасове посилання на фото чату. 12 годин — щоб відкрита
// розмова не «згасла» серед дня, але посилання не жило вічно, якщо його
// комусь переслали.
const CHAT_URL_TTL = 12 * 3600;

// `explicitPath` (23.08) — покласти файл ПОРУЧ із уже завантаженим, під заданим
// іменем. Потрібен рівно одному місцю: парі фото жителя (дрібне для кружечків +
// велике для картки), де другий файл мусить лежати за передбачуваною адресою —
// інакше його не знайти, бо в `profiles` одне поле `avatar_url`, а додати друге
// означало б міграцію бази. Не передано → ім'я генерується як раніше, тобто
// жоден наявний виклик не змінює поведінки.
export async function uploadPhotoToStorage(blob, folder = '', bucket = PUBLIC_BUCKET, explicitPath = '') {
  if (!supa) return { url: null, path: null, error: 'Supabase не підключений' };
  if (!blob) return { url: null, path: null, error: 'Порожній blob' };

  const ext  = (blob.type && blob.type.split('/')[1]) || 'jpg';
  const rand = Math.random().toString(36).slice(2, 10);
  const path = explicitPath || `${folder}${getAnonId()}/${Date.now()}-${rand}.${ext}`;

  const { error: uploadError } = await supa.storage
    .from(bucket)
    .upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      cacheControl: '31536000',  // 1 рік — фото незмінне
      upsert: false,
    });

  if (uploadError) {
    console.warn('[supabase] uploadPhotoToStorage error:', uploadError.message);
    // Людський текст, а не технічний: цей рядок доходить до тоста в кабінеті й
    // у композері. Повтор тут не наш клопіт — його вже робить core/upload.js.
    return { url: null, path: null, error: netErrorText(uploadError) };
  }

  // У закритого бакета публічної адреси НЕ ІСНУЄ — назовні віддаємо шлях,
  // а посилання підписуємо в момент показу (signChatPhotos нижче).
  if (bucket !== PUBLIC_BUCKET) return { url: null, path, error: null };

  const { data } = supa.storage.from(bucket).getPublicUrl(path);
  return { url: data?.publicUrl || null, path, error: null };
}

// ── ВЕЛИКА ВЕРСІЯ ФОТО ЖИТЕЛЯ: домовленість про імʼя (23.08) ────────────────
//
// 🔑 Чому домовленість про імʼя, а не друге поле в базі. `profiles` віддається
// назовні вузьким RPC `get_public_profile`, який повертає РІВНО 6 несекретних
// полів; додати сьоме означало б міграцію бази і зміну того RPC. Домовленість
// про імʼя дає те саме безкоштовно: адреса великого файлу ОДНОЗНАЧНО виводиться
// з адреси дрібного, тому зберігати треба лише одну.
//
// ⚠️ У базу пишемо адресу ДРІБНОГО. Це не випадковість: його читають усі
// списки, кружечки, чати й коментарі — тобто весь наявний код працює далі без
// жодної правки, а велике фото просить рівно те місце, якому воно потрібне.
//
// 🛑 Для аватарів, завантажених ДО 23.08, великої версії не існує — там буде
// 404. Це передбачено: картка ловить помилку і лишається на дрібному, тобто
// виглядає рівно як сьогодні. Мовчазного провалу немає — є чесний відкат.
const LARGE_PHOTO_SUFFIX = '@lg';
export function largePhotoUrl(url) {
  const s = String(url || '');
  if (!s) return '';
  // Розширення + необовʼязковий «хвіст» запиту (`?token=…` у підписаних адресах).
  return s.replace(/(\.[a-z0-9]+)(\?.*)?$/i, `${LARGE_PHOTO_SUFFIX}$1$2`);
}

// ── ФОТО ПРИВАТНИХ ЧАТІВ: шлях → тимчасове посилання ──────────────────────
// Підписуємо в ОДНОМУ місці — шарі даних, а не в рендері. Рендер бульбашок у
// board-chat.js синхронний (склеює HTML рядками), і робити його асинхронним
// заради картинки означало б переписати найгарячіший екран застосунку.
//
// ⚠️ СТАРІ Й НОВІ ЗАПИСИ ЖИВУТЬ РАЗОМ. До 01.08 у `photo_url` лежала повна
//    публічна адреса (`https://…`), тепер — шлях у закритому бакеті
//    (`<thread_id>/<anon>/<час>-<rand>.jpg`). Тому ознака проста й надійна:
//    починається з http(s) → давнє посилання, віддаємо як є; інакше — підписуємо.
//    Завдяки цьому 23 наявні фото продовжують показуватись без міграції.
const _chatUrlCache = new Map();   // шлях -> { url, exp }

function isLegacyPhotoUrl(v) { return typeof v === 'string' && /^https?:\/\//i.test(v); }

export async function signChatPhotos(rows) {
  if (!supa || !Array.isArray(rows) || !rows.length) return rows;

  const now = Date.now();
  const need = [];
  for (const r of rows) {
    const p = r && r.photo_url;
    if (!p || isLegacyPhotoUrl(p)) continue;
    const hit = _chatUrlCache.get(p);
    if (hit && hit.exp > now) continue;
    if (!need.includes(p)) need.push(p);
  }

  if (need.length) {
    try {
      const { data, error } = await supa.storage.from(CHAT_BUCKET)
        .createSignedUrls(need, CHAT_URL_TTL);
      if (error) console.warn('[supabase] signChatPhotos:', error.message);
      for (const it of (data || [])) {
        if (it && it.signedUrl && !it.error) {
          // Кеш на 80% строку: щоб посилання не протухло просто в руках.
          _chatUrlCache.set(it.path, { url: it.signedUrl, exp: now + CHAT_URL_TTL * 800 });
        }
      }
    } catch (e) {
      console.warn('[supabase] signChatPhotos:', e && e.message);
    }
  }

  // Підміняємо КОПІЮ рядка, не чіпаючи оригінал: `photo_path` лишається
  // справжнім шляхом, бо саме його треба буде підписати наступного разу.
  return rows.map((r) => {
    const p = r && r.photo_url;
    if (!p || isLegacyPhotoUrl(p)) return r;
    const hit = _chatUrlCache.get(p);
    return hit ? { ...r, photo_url: hit.url, photo_path: p } : r;
  });
}

// ── АВАТАРИ КОРИСТУВАЧІВ, крос-юзер (Потік 12 Інкремент Б) ────────────────
// Показ ЧУЖОГО фото профілю у кружечках (обговорення, приватні чати).
// RLS профілю — «own read» (кожен читає лише свій рядок) → чужий avatar_url
// напряму не видно. Тому публічний SECURITY DEFINER RPC get_avatars(uids)
// повертає ЛИШЕ (uid, name, avatar_url) — безпечно, без phone/birth_date.
// Батч-кеш Map<uid,url>: '' = фото нема / ще не знаємо (негативи теж кешуємо,
// щоб не бити RPC повторно). Fail-soft: якщо RPC ще нема (SQL не застосовано)
// або помилка — усе лишається на літері-fallback, як було до Потоку 12.
const _avatarCache = new Map();   // uid -> url ('' = нема фото)
const _nameCache   = new Map();   // uid -> живе імʼя профілю (той самий RPC get_avatars)
// 🔵 09.08 — uid -> офіційний акаунт (синя галочка). Їде тим самим батч-запитом,
// що імʼя і фото, і живе за тими самими правилами свіжості. Окремого запиту НЕ
// заводимо: галочка потрібна рівно там, де вже показується імʼя.
const _officialCache = new Map();

// 🔴 07.08 — СТРОК ПРИДАТНОСТІ. До цього дня обидві Map жили ВІЧНО.
//
// Скарга Вови: «зайшов з другого акаунту і змінив імʼя та встановив фото, але
// мені не оновило це відразу в додатку, приходиться закрити додаток повністю і
// зайти». Корінь був саме тут: `fetchAvatars` брав лише ще НЕВІДОМІ uid, тож
// дізнались імʼя один раз — тримали до кінця життя вкладки. Повне закриття
// застосунку скидало памʼять, і це був ЄДИНИЙ спосіб побачити свіже.
//
// 🔑 Чому TTL, а не «перечитувати щоразу»: один екран Стрічки згадує десятки
// різних uid, і запит на кожен рендер перетворив би прокрутку на шквал у базу.
// TTL дає просте правило — у межах кількох хвилин показуємо кешоване, далі
// перепитуємо. Явна інвалідація (`invalidateProfiles`) додає другий, ДЕШЕВИЙ
// привід: людина повернулась на вкладку.
//
// ⚠️ Негативи (`''` = профілю немає / RPC не відповів) живуть ВТРИЧІ менше.
// Інакше одна невдала відповідь мережі замикала б людину без фото на 5 хвилин,
// хоча фото в неї є.
const PROFILE_TTL     = 5 * 60 * 1000;   // 5 хв — знайдений профіль
const PROFILE_TTL_NEG = 90 * 1000;       // 1.5 хв — «нічого не знайшли»
const _profileAt = new Map();            // uid -> коли записали (мс)
const _inflight  = new Map();            // uid -> запит, який зараз у польоті

// Покоління кешу. Росте на кожній інвалідації; `hydrateNames`/`hydrateAvatars`
// звіряють його з позначкою на вузлі, тому свіжий кеш доїжджає й до ВЖЕ
// намальованого екрана (до 07.08 вузол позначався `data-*-done` один раз
// назавжди — і навіть оновлений кеш нікуди не потрапляв).
let _profileGen = 1;
export function profileGen() { return _profileGen; }

function profileFresh(uid) {
  if (!_avatarCache.has(uid)) return false;
  const at = _profileAt.get(uid) || 0;
  const ttl = _avatarCache.get(uid) ? PROFILE_TTL : PROFILE_TTL_NEG;
  return (Date.now() - at) < ttl;
}

// 🔑 ОДНЕ МІСЦЕ, ЯКЕ КАЖЕ «ЗАБУДЬ, ЩО ЗНАВ ПРО ЛЮДЕЙ».
// Кличе `core/refresh-on-return.js` при поверненні на вкладку. Сам по собі
// виклик у мережу НЕ ходить — лише знімає свіжість; піде наступна гідрація.
export function invalidateProfiles() {
  _profileAt.clear();
  _profileGen++;
}

// Синхронний доступ до кешу — для рендеру «зараз» (порожньо → літера-fallback).
export function cachedAvatar(uid) {
  return uid ? (_avatarCache.get(uid) || '') : '';
}

// Живе імʼя профілю за uid (порожньо → лишаємо вморожене імʼя з рядка).
export function cachedName(uid) {
  return uid ? (_nameCache.get(uid) || '') : '';
}

// 🔵 ОФІЦІЙНА ГАЛОЧКА — ОДИН ЗНАК НА ВЕСЬ ЗАСТОСУНОК (09.08).
//
// 🔴 ЗАМОВЛЕННЯ ВОВИ, дослівно: *«якщо вона є, вона має відображатися ВСЮДИ де
// пише ім'я користувача… бо хтось може зареєструватися під таким іменем, а
// користувачі можуть просто прочитати, але не тапнути і не відкрити картку»*.
// Тобто галочка в картці профілю сама по собі не працює: підробку помічають у
// списку розмов і в шапці чату, куди ніхто не «заходить» окремо.
//
// 🔑 Чому це живе в дата-шарі, а не в кожній вкладці: у застосунку вже є ОДНЕ
// місце правди про імена — кожна поверхня несе `data-name-uid`, а `hydrateNames`
// підставляє живе імʼя (див. `core/refresh-on-return.js`). Галочка їде тим самим
// шляхом, тож нові екрани отримають її задарма, а розійтись копіям нема де.
export function cachedOfficial(uid) {
  return uid ? _officialCache.get(uid) === true : false;
}

// Розмітка знака. Береться і гідрацією, і екранами, які малюють імʼя без uid
// (напр. назва спільноти) — щоб знак усюди був фізично однаковий.
//
// 🔴 09.08 — ПЕРЕРОБЛЕНО ПІСЛЯ СКАРГИ ВОВИ: *«вона якась така незрозуміла геть…
// галочка за кружечка взагалі незрозуміло»*.
// Було: текстовий символ «✓» у синьому колі. Чому це не читалось — не смак, а
// три конкретні речі: (1) «✓» це ГЛІФ ШРИФТУ, тобто його товщина й нахил різні
// на кожному пристрої, а в системному шрифті iOS він тонкий і сидить не по
// центру кола; (2) на 15px гліф лишався ~7px і зливався в пляму; (3) рівне коло
// без зубців не читається як «верифіковано» — воно схоже на просту крапку.
//
// 🔄 ДРУГА РЕДАКЦІЯ ФОРМИ, ТОГО САМОГО ДНЯ. Спершу я зробив **зубчасте** коло
// (силует Twitter/Meta) — Вова подивився наживо і сказав: *«ось галочка яка була
// раніше, вона і то була краща ніж ця що зараз»*, показавши знімок із ГЛАДКИМ
// синім колом. Форму повернуто.
// 🔑 Але повертаємо саме ФОРМУ, а не спосіб малювання: галочка лишається
// векторним шляхом, а не символом «✓». Це і було справжньою вадою першої
// редакції — гліф залежить від шрифту, і саме тому знак зливався в дрібних
// місцях (список розмов, 13px), хоча в картці профілю на 16px виглядав добре.
// Тобто скарга «незрозуміла» і скарга «зубці гірші» не суперечать одна одній:
// перша була про дрібні місця, друга — про форму.
// 📐 Коло r=11 при полі 24×24 (майже на весь viewBox — знак і так маленький,
// поле по краях лише марнувало б піксели). Галочка — суцільна фігура з рівною
// товщиною; ширші плечі, ніж у гліфа, тому вона лишається читабельною і на 13px.
// ⚠️ `aria-label` обовʼязковий: читач екрана промовчав би про сам знак, тобто
// незрячий користувач не дізнався б головного — що акаунт офіційний.
export function officialMarkHtml() {
  return '<span class="cstl-verified" role="img" aria-label="Офіційний акаунт" title="Офіційний акаунт">'
    + '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<circle class="cstl-verified-bg" cx="12" cy="12" r="11"/>'
    + '<path class="cstl-verified-tick" d="M10.35 17.1 L5.5 12.25 L7.6 10.15 L10.35 12.9 L16.4 6.85 L18.5 8.95 Z"/>'
    + '</svg></span>';
}

// Поставити/зняти знак ПОРУЧ із вузлом імені.
// 🔑 Знак — СУСІД, а не вміст вузла. Причина не стильова: `hydrateNames` оновлює
// живе імʼя через `textContent`, і знак, покладений усередину, стирався б на
// кожному оновленні профілю. Сусіда `textContent` не чіпає.
export function markOfficial(nameEl, uid) {
  if (!nameEl) return;
  const on = cachedOfficial(uid);
  const next = nameEl.nextElementSibling;
  const has = next && next.classList && next.classList.contains('cstl-verified');
  if (on && !has) nameEl.insertAdjacentHTML('afterend', officialMarkHtml());
  else if (!on && has) next.remove();   // галочку зняли в адмінці — знімаємо й тут
}

// Спільні хелпери гідрації імен (для board / board-discussions — щоб не дублювати).
// nameUid → атрибут-маркер, який hydrateNames знайде і підмінить на живе імʼя.
// liveName → одразу підставляє вже кешоване живе імʼя (щоб не мигало), інакше
// вморожений текст, інакше fallback ('Житель' в обговореннях / 'анонімно' на дошці).
export function nameUid(uid, { short = false } = {}) {
  if (!uid) return '';
  // 🆕 23.08 — `short` просить показувати ЛИШЕ ІМʼЯ, без прізвища.
  // 📐 Заміряно на живій базі: 7 профілів із 12 записані як «Імʼя Прізвище»
  // (найдовше повне — 16 символів, найдовше саме імʼя — 9). Тобто в тісних
  // місцях повне імʼя не вміщається БІЛЬШОСТІ людей, а не поодиноким.
  // 🛑 Прапорець потрібен саме тут, а не в місці виклику: `hydrateNames()`
  // нижче робить `el.textContent = nm`, тобто ЗАМІНЮЄ вміст живим імʼям —
  // будь-яке скорочення, зроблене при малюванні, воно б стерло, щойно приїде
  // профіль. Вада виглядала б як «імʼя іноді вилазить», що шукається найгірше.
  return ` data-name-uid="${escapeHtml(uid)}"${short ? ' data-name-short=""' : ''}`;
}
export function liveName(name, uid, fallback = 'Житель') {
  return escapeHtml(cachedName(uid) || name || fallback);
}
// Те саме, але лише перше слово — для тісних рядків (цитата відповіді в картці).
// ⚠️ Скорочуємо ДО `escapeHtml`, а не після: екранування може перетворити один
// символ на послідовність (`&` → `&amp;`), і різати вже екранований рядок —
// вірний спосіб колись отримати на екрані половину такої послідовності.
export function liveFirstName(name, uid, fallback = 'Житель') {
  const повне = (cachedName(uid) || name || fallback).trim();
  return escapeHtml(повне.split(/\s+/)[0] || fallback);
}

// 🔵 ГНІЗДО ІМЕНІ — ОДНА ОБГОРТКА НА ВСІ ПОВЕРХНІ (23.08).
//
// 🔴 Скарга Вови: «галочка десь знизу, десь зверху, і не в розмір імені».
// Вада була структурна й ОДНАКОВА в усіх семи місцях, тому лікується тут, а не
// латками по екранах.
//
// **Чому так було.** Знак ставиться СУСІДОМ вузла імені (`markOfficial` вище —
// і це правильно, бо `hydrateNames` пише живе імʼя через `textContent`, який
// стер би вкладений знак). Але сусід живе в контейнері БАТЬКА, тож підкорявся
// батьковим правилам, а не імені. Звідси обидві половини скарги:
//   • «не в розмір» — `0.82em` рахується від кегля ВЛАСНОГО елемента, а той
//     успадковував кегль батька. Імʼя ж має свій: 17px у автора оголошення,
//     16px у шапці чату і списку розмов, 15px у Питаннях, 14px у коментарі.
//     Знак виходив пропорційним чому завгодно, тільки не імені поруч.
//   • «десь знизу, десь зверху» — знак вирівнювали ДВА РІЗНІ механізми.
//     `vertical-align` діє лише в текстовому рядку, а в пʼяти місцях із семи
//     батько — `display: flex`, де `vertical-align` ігнорується ЦІЛКОМ і
//     вирівнює `align-items` батька (десь `baseline`, десь `center`).
//   • у двох місцях було відверто зламано: `.cm-ad-author-info` має
//     `flex-direction: column`, тож знак ставав ОКРЕМИМ РЯДКОМ під іменем, а в
//     списку розмов ставав третім елементом у `justify-content: space-between`
//     і розкидав час.
//
// **Що робить гніздо.** Кладе імʼя і знак в один інлайновий бокс ВСЕРЕДИНІ
// елемента, який несе кегль. Тоді:
//   • `em` знака береться від кегля імені — бо гніздо стоїть під ним ✅
//   • вирівнює РІВНО ОДИН механізм (`align-items: center` гнізда) ✅
//   • для батьківського flex гніздо невидиме: назовні той самий один елемент,
//     що й був, тож `space-between`, `gap` і `baseline` працюють як раніше ✅
//   • `textContent` пише у ВНУТРІШНІЙ вузол, знак — його сусід усередині
//     гнізда, тобто механізм `markOfficial` лишається незмінним ✅
//
// ⚠️ Трикрапка на довгих іменах переїжджає на `.cstl-name-txt` (див. `base.css`):
// обрізатись має ТЕКСТ, а знак лишатись видимим. Обрізана позначка офіційності
// гірша за обрізане імʼя — вона єдина відрізняє справжній акаунт від підробки.
//
// `extraAttrs` — атрибути, що мусять лишитись на самому вузлі імені (напр.
// `data-av-uid` там, де тап саме по імені відкриває картку профілю).
export function nameSlot(uid, text, extraAttrs = '') {
  return '<span class="cstl-name"><span class="cstl-name-txt"'
    + nameUid(uid) + extraAttrs + '>' + text + '</span></span>';
}

// Те саме гніздо для ДВОХ місць, куди знак приходить не гідрацією, а вже
// готовим прапорцем: шапка сторінки спільноти (`page.official`) і картка
// профілю (`get_public_profile`). Гідрації там немає — але геометрія мусить
// бути та сама, інакше знак у шапці спільноти знову жив би за іншими
// правилами, ніж усі решта. Саме через такі «майже однакові» копії знак і
// розʼїхався першого разу.
export function nameSlotStatic(text, official) {
  return '<span class="cstl-name"><span class="cstl-name-txt">' + text + '</span>'
    + (official ? officialMarkHtml() : '') + '</span>';
}

// Батч-підвантаження аватарів за списком uid. Тягне лише ще невідомі, заповнює кеш.
export async function fetchAvatars(uids) {
  // ⚠️ 07.08: умова була `!_avatarCache.has(u)` — «знаємо взагалі?». Стала
  // `!profileFresh(u)` — «знаємо СВІЖЕ?». Одне слово різниці, і саме воно
  // тримало старе імʼя до перезапуску застосунку.
  const uniq = [...new Set(uids)].filter(Boolean);
  // 🔑 ЗЛИТТЯ ЗАПИТІВ У ПОЛЬОТІ (07.08). `hydrateNames` і `hydrateAvatars`
  // майже завжди кличуться ПАРОЮ і по тих самих людях (див. `board-chat.js`,
  // `feed.js`, `board-discussions.js`) — а що перша ще не встигла відповісти,
  // друга бачила кеш порожнім і слала ДРУГИЙ запит про те саме. Тобто кожен
  // екран із людьми ходив у базу двічі. Заміряно стендом `live-profile`:
  // 2 виклики `get_avatars` там, де потрібен один.
  const wait = uniq.map(u => _inflight.get(u)).filter(Boolean);
  const need = uniq.filter(u => !profileFresh(u) && !_inflight.has(u));
  if (!supa || (!need.length && !wait.length)) return;
  const stamp = (u) => _profileAt.set(u, Date.now());

  if (need.length) {
    const pr = (async () => {
      try {
        const { data, error } = await supa.rpc('get_avatars', { uids: need });
        // RPC нема / помилка → лишаємо те, що вже знали (а не затираємо порожнім:
        // одна невдала відповідь мережі не має стирати з екрана правильне фото).
        if (error) { need.forEach(u => { if (!_avatarCache.has(u)) _avatarCache.set(u, ''); stamp(u); }); return; }
        (data || []).forEach(r => {
          if (!r || !r.uid) return;
          _avatarCache.set(r.uid, r.avatar_url || '');
          // ⚠️ Порожнє імʼя НЕ затирає відоме: у профілі можна стерти імʼя, і тоді
          // чесніше лишити попереднє, ніж показати порожнечу замість людини.
          if (r.name) _nameCache.set(r.uid, r.name);
          // ⚠️ `=== true`, а не «щось істинне»: поки міграцію не накотили, поля в
          // відповіді немає взагалі (`undefined`) — і галочки просто не буде.
          // Записуємо лише коли поле реально приїхало, інакше стара, правильна
          // позначка стерлась би на першій же відповіді без цього поля.
          if (r.official !== undefined) _officialCache.set(r.uid, r.official === true);
          stamp(r.uid);
        });
        need.forEach(u => { if (!_avatarCache.has(u)) _avatarCache.set(u, ''); stamp(u); });  // негативи
      } catch (_) { need.forEach(u => { if (!_avatarCache.has(u)) _avatarCache.set(u, ''); stamp(u); }); }
    })();
    need.forEach(u => _inflight.set(u, pr));
    wait.push(pr);
  }
  // ⚠️ Прибирати з реєстру ОБОВʼЯЗКОВО і в разі помилки — інакше один збій
  // мережі назавжди позначив би людину як «уже питаємо» і її профіль не
  // оновився б більше ніколи.
  try { await Promise.all(wait); } catch (_) { /* fail-soft */ }
  need.forEach(u => _inflight.delete(u));
}

// Прогресивна гідрація: після вставки HTML знаходить АВАТАР-КРУЖЕЧКИ (маркер
// data-av-circle від avatarCircle), підтягує їхні фото і замінює літеру на <img>
// для тих, у кого фото є. Літера-first → фото-коли-готове (не блокує рендер;
// data-av-gen проти зайвого повтору в межах одного покоління кешу).
// ВАЖЛИВО: фільтр саме по [data-av-circle], а НЕ по [data-av-uid]. Останній мають
// також не-аватарні таргети тапу (напр. `.pm-head-titles` — ім'я в шапці чату для
// відкриття картки профілю); вставка <img> у них давала «квадратне фото» на весь
// екран, бо в них немає фіксованого розміру/overflow (баг, Вова 17.07).
// ⚠️ 07.08: позначка `data-av-done="1"` (один раз назавжди) стала `data-av-gen`
// із номером ПОКОЛІННЯ кешу. Після `invalidateProfiles()` покоління росте, тож
// уже намальований екран гідрується ще раз і показує свіже фото. Зі старою
// позначкою оновлений кеш до відкритого екрана не доходив узагалі.
export async function hydrateAvatars(root) {
  if (!root || !root.querySelectorAll) return;
  const gen = String(_profileGen);
  const els = [...root.querySelectorAll('[data-av-circle][data-av-uid]')].filter(e => e.dataset.avGen !== gen);
  if (!els.length) return;
  await fetchAvatars(els.map(e => e.dataset.avUid));
  els.forEach(el => {
    el.dataset.avGen = gen;
    const url = cachedAvatar(el.dataset.avUid);
    if (!url) return;                       // фото нема → лишаємо як є (див. нижче)
    const img = el.querySelector('img');
    // Те саме фото вже стоїть — не перемальовуємо. Інакше кожне повернення на
    // вкладку перезавантажувало б ту саму картинку і кружечки блимали б.
    if (img && img.getAttribute('src') === url) return;
    const base = el.classList[0];           // базовий клас місця (bd-avatar / pm-avatar)
    el.classList.add(base + '--img');
    el.style.background = 'none';
    el.innerHTML = `<img src="${escapeHtml(url)}" alt="" loading="lazy">`;
  });
}
// 🛑 ЧОГО ЦЕ СВІДОМО НЕ РОБИТЬ: не повертає літеру назад, якщо людина ФОТО
// ПРИБРАЛА. Щоб намалювати літеру правильно, потрібні колір за іменем і клас
// `--anon` — тобто копія `avatarCircle()` з `core/utils.js`. Копія того самого
// в цьому проєкті вже двічі розходилась (два списки антиспаму, дві розмітки
// пункту FAB), і платити цим за рідкісний випадок не варто. Замовлення Вови —
// «поставив фото → видно одразу», і саме це закрито. Знадобиться зняття фото —
// робити через `avatarCircle`, а не другою реалізацією тут.

// Прогресивна гідрація ІМЕН (близнюк hydrateAvatars): знаходить елементи з
// data-name-uid і підмінює вморожене імʼя (денормалізоване в рядок повідомлення)
// на ЖИВЕ імʼя з профілю за uid. Так перейменування акаунту відображається і на
// старих повідомленнях — усі репліки одного uid показують одне поточне імʼя.
// Той самий батч-RPC що аватари (get_avatars повертає name). Fail-soft: імені
// нема в кеші → лишаємо текст як був. data-name-gen проти зайвого повтору.
// ⚠️ 07.08: `data-name-done` (одноразово) → `data-name-gen` із номером покоління
// кешу, з тієї самої причини, що в `hydrateAvatars`.
export async function hydrateNames(root) {
  if (!root || !root.querySelectorAll) return;
  const gen = String(_profileGen);
  const els = [...root.querySelectorAll('[data-name-uid]')].filter(e => e.dataset.nameGen !== gen);
  if (!els.length) return;
  await fetchAvatars(els.map(e => e.dataset.nameUid));
  els.forEach(el => {
    el.dataset.nameGen = gen;
    const uid = el.dataset.nameUid;
    const nm = cachedName(uid);
    // `data-name-short` — показати лише імʼя (без прізвища). Ставить `nameUid(uid,
    // { short: true })`; потрібен там, де рядок тісний і повне імʼя обрізалось би
    // трьома крапками посеред прізвища.
    const показ = (nm && el.hasAttribute('data-name-short')) ? (nm.trim().split(/\s+/)[0] || nm) : nm;
    if (показ && el.textContent !== показ) el.textContent = показ;   // жива назва перекриває вморожену
    // 🔵 Галочка їде разом з іменем — тим самим проходом, по тих самих вузлах.
    // Саме це і робить її «всюди, де видно імʼя» без правок у кожному екрані.
    markOfficial(el, uid);
  });
}

// Публічний профіль для картки (тап по аватару). Окремий вузький RPC
// get_public_profile — SECURITY DEFINER, віддає РІВНО 6 несекретних полів
// (uid, name, avatar_url, settlement, trusted, created_at). НІКОЛИ phone/email/
// birth_date/bio. Fail-soft: RPC ще нема / помилка / нема профілю → null.
export async function fetchPublicProfile(uid) {
  if (!supa || !uid) return null;
  try {
    const { data, error } = await supa.rpc('get_public_profile', { p_uid: uid });
    if (error) return null;
    return (Array.isArray(data) ? data[0] : data) || null;
  } catch (_) { return null; }
}

// ── ВИДАЛЕННЯ АКАУНТА (14.08, правова відповідність) ──────────────────────
// Один виклик `delete_my_account()` — SECURITY DEFINER у базі
// (`scripts/supabase_delete_account.sql`). 🔑 Чому вся робота ТАМ, а не тут:
// видалення торкається ~15 таблиць і сховища, і зробити його з клієнта означало б
// послати 15 запитів, кожен зі своїм шансом обірватись посередині — людина
// лишилась би з наполовину видаленим акаунтом. У базі це ОДНА транзакція: або
// все, або нічого. Плюс частину рядків RLS клієнтові чіпати й не дозволила б.
//
// ⚠️ Повторів навмисно НЕМА (`retries: 0`). Дія незворотна: якщо відповідь
// загубилась у мережі вже ПІСЛЯ виконання, другий виклик прийде від людини,
// якої вже немає (`not_authenticated`) і показав би помилку на успішному
// видаленні. Краще один раз і чесний результат.
export async function deleteMyAccount() {
  if (!supa) return { ok: false, error: 'Немає зв\'язку із сервером' };
  const r = await netCall(() => supa.rpc('delete_my_account'), { retries: 0 });
  if (!r.ok) return { ok: false, error: r.error, raw: r.raw };
  return { ok: true };
}

// ── ПРИВАТНИЙ ЧАТ (Фаза Б, Етап 4) ───────────────────────────────────────
// Усі функції приймають uid аргументом (не імпортуємо auth.js — циклічна
// залежність). RLS у БД все одно перевіряє auth.uid() на сервері.

// 🆕 06.08 — ОГОЛОШЕННЯ ЧУЖОГО АВТОРА (для картки профілю).
//
// ⚠️ Це НЕ `fetchMyPosts` з іншим uid, і копією його робити не можна: той віддає
// УСІ статуси (включно з `pending` і `rejected`), бо показує людині її власну
// кухню. Тут аудиторія протилежна — сторонній глядач, — і побачити чуже
// оголошення «на модерації» він не має права. Тому `status = 'published'`
// прибито в самому запиті, а не у виклику: фільтр, який легко забути передати,
// рано чи пізно забувають.
//
// 🔴 `select('*')`, А НЕ ПЕРЕЛІК КОЛОНОК — І ЦЕ ВИПРАВЛЕННЯ ПОМИЛКИ 06.08.
// Перша версія перелічувала поля поіменно заради економії трафіку, і серед них
// був `author_name` — колонки, якої в `posts` НЕМАЄ (вона є лише в `threads`).
// Назву я взяв із власної тестової фікстури, а не з живої схеми. Наслідок:
// PostgREST відхиляв увесь запит, функція чесно віддавала `[]`, і секція
// оголошень у картці профілю просто не малювалась — мовчки, без жодної ознаки
// поломки. Знайшов Вова, а не стенд.
//
// ⚠️ Стенд цього НЕ ЛОВИВ і не міг: підроблена база (`tests/_board-fixture.mjs`)
// ігнорує `.select()` і віддає рядки цілком. Тобто перелік колонок — це та
// частина запиту, яку в нас НІЧИМ перевірити, і саме тому її тут більше немає.
// 🔑 Правило з цього: поки фікстура не розуміє `select`, усі запити до `posts`
// беруть `*` — так само, як `fetchPublishedPosts` і `fetchMyPosts`, які працюють
// роками. Економія трафіку не варта запиту, який ламається мовчки.
export async function fetchAuthorAds(uid, limit = 12) {
  if (!supa || !uid) return [];
  const { data, error } = await supa.from('posts')
    .select('*')
    .eq('owner_uid', uid)
    .eq('status', 'published')
    .eq('type', 'board')
    .order('bumped_at', { ascending: false, nullsLast: true })
    .limit(limit);
  if (error) { console.warn('[supabase] fetchAuthorAds:', error.message); return []; }
  return data || [];
}

// Мої оголошення (для «Мої оголошення» у Кабінеті) — усі статуси, нові зверху.
export async function fetchMyPosts(uid) {
  if (!supa || !uid) return [];
  // ЛИШЕ оголошення (не type='chat'): обговорення мають свій екран «Мої обговорення»
  // на вкладці Обговорення. Без фільтра обговорення просочувались у «Мої оголошення»
  // (баг, знайдений Ромою 08.07). neq — щоб старі пости без type не зникли.
  const { data, error } = await supa.from('posts')
    .select('*').eq('owner_uid', uid).neq('type', 'chat')
    .order('created_at', { ascending: false });
  if (error) { console.warn('[supabase] fetchMyPosts:', error.message); return []; }
  return data || [];
}

// Підняти власний опублікований пост угору стрічки (кулдаун 3 год — на сервері).
// Повертає { ok:true, bumped_at } або { ok:false, error, seconds_left? }.
// ⚠️ Єдиний з чотирьох, де повтор має нюанс: якщо перша спроба доїхала, а відповідь
// загубилась, друга впаде у серверний кулдаун 3 год і людина побачить «зачекай». Пост
// при цьому піднято, і список це покаже — тобто гірше, ніж ідеально, але не втрата дії.
export async function bumpPost(postId) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const r = await netCall(() => supa.rpc('bump_post', { p_id: postId }));
  if (!r.ok) return { ok: false, error: r.error };
  return r.data || { ok: false, error: 'no_data' };
}

// Завершити власний пост (status=closed → зникає з дошки, лишається в архіві).
export async function closePost(postId) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const r = await netCall(() => supa.rpc('close_post', { p_id: postId }));
  if (!r.ok) return { ok: false, error: r.error };
  return r.data || { ok: false, error: 'no_data' };
}

// Видалити власний пост (CASCADE прибере треди/коментарі/реакції/закладки).
export async function deleteMyPost(postId) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const r = await netCall(() => supa.rpc('delete_my_post', { p_id: postId }));
  if (!r.ok) return { ok: false, error: r.error };
  return r.data || { ok: false, error: 'no_data' };
}

// Повернути завершене оголошення в активні (closed → published).
// bumped_at не змінюється → той самий час підняття/кулдауну, що був до завершення.
export async function restorePost(postId) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const r = await netCall(() => supa.rpc('restore_post', { p_id: postId }));
  if (!r.ok) return { ok: false, error: r.error };
  return r.data || { ok: false, error: 'no_data' };
}

// Д-3: редагувати власне оголошення через RPC update_board_post (SECURITY DEFINER,
// перевірка owner_uid = auth.uid() на сервері — базова RLS дозволяє UPDATE лише
// адмінам). Статус за довірою: trusted-published лишається published, звичайний
// published → pending (повторна модерація). Потребує scripts/supabase_board_edit.sql.
// Повертає { ok:true, status } або { ok:false, error }.
export async function updateBoardPost(postId, payload) {
  if (!supa) return { ok: false, error: 'Немає з\'єднання з базою' };
  const r = await netCall(() => supa.rpc('update_board_post', { p_id: postId, payload }));
  if (!r.ok) return { ok: false, error: r.error };
  if (r.data && r.data.ok === false) return { ok: false, error: netErrorText(r.data.error) };
  return { ok: true, status: (r.data && r.data.status) || 'pending' };
}

// ── Приватні групові чати (Етап 2) ───────────────────────────────────────
// Мої групи (RLS повертає лише ті, де я учасник/власник). Нові зверху за останнім повідомленням.
export async function fetchMyGroups() {
  if (!supa) return [];
  const { data, error } = await supa.from('chat_groups').select('*')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) { console.warn('[supabase] fetchMyGroups:', error.message); return []; }
  return data || [];
}

// Створення групи — вставка без клієнтського ключа → без повтору (інакше дві однакові
// групи, і людина не зрозуміє, у котру з них запрошувати).
export async function createGroup({ name, description = null, type = 'locality', emoji = null, gradient = null }) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const r = await netInsert(() => supa.rpc('create_group', {
    p_name: name, p_description: description, p_type: type, p_emoji: emoji, p_gradient: gradient,
  }));
  return r.ok ? { ok: true, id: r.data } : { ok: false, error: r.error };
}

// requiresApproval: true → посилання зі схваленням адміна; false → миттєвий вступ
// Теж вставка: повтор видав би ДРУГЕ посилання-запрошення. Перше при цьому лишилось би
// живим — тобто по репозиторію гуляли б два токени на одну групу. Не повторюємо.
export async function createGroupInvite(groupId, requiresApproval = false) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const r = await netInsert(() => supa.rpc('create_group_invite', { p_gid: groupId, p_requires_approval: requiresApproval }));
  return r.ok ? { ok: true, token: r.data } : { ok: false, error: r.error };
}

export async function getGroupByInvite(token) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const r = await netCall(() => supa.rpc('get_group_by_invite', { p_token: token }), { timeout: NET_TIMEOUT });
  if (!r.ok) return { ok: false, error: r.error };
  return r.data || { ok: false, error: 'no_data' };
}

// Далі — дії, що ВСТАНОВЛЮЮТЬ стан (вступив / вийшов / схвалено / відхилено / новий
// власник). Повтор дає той самий результат, тому він безпечний: сервер на другий раз
// або зробить те саме, або скаже «вже так» — дубля сутності не з'явиться.
export async function joinGroupByToken(token) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const r = await netCall(() => supa.rpc('join_group_by_token', { p_token: token }));
  if (!r.ok) return { ok: false, error: r.error };
  return r.data || { ok: false, error: 'no_data' };
}

export async function leaveGroup(groupId) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const r = await netCall(() => supa.rpc('leave_group', { p_gid: groupId }));
  if (!r.ok) return { ok: false, error: r.error };
  return r.data || { ok: false, error: 'no_data' };
}

export async function approveMember(groupId, uid) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const r = await netCall(() => supa.rpc('approve_member', { p_gid: groupId, p_uid: uid }));
  if (!r.ok) return { ok: false, error: r.error };
  return r.data || { ok: false, error: 'no_data' };
}

export async function rejectMember(groupId, uid) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const r = await netCall(() => supa.rpc('reject_member', { p_gid: groupId, p_uid: uid }));
  if (!r.ok) return { ok: false, error: r.error };
  return r.data || { ok: false, error: 'no_data' };
}

// Передати власника групи іншому учаснику (потім старий власник може вийти)
export async function transferGroupOwner(groupId, uid) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const r = await netCall(() => supa.rpc('transfer_group_owner', { p_gid: groupId, p_uid: uid }));
  if (!r.ok) return { ok: false, error: r.error };
  return r.data || { ok: false, error: 'no_data' };
}

// Учасники групи (RLS: бачить лише учасник). Імена резолвимо окремо через fetchProfileNames.
export async function fetchGroupMembers(groupId) {
  if (!supa) return [];
  const { data, error } = await supa.from('chat_group_members').select('*').eq('group_id', groupId);
  if (error) { console.warn('[supabase] fetchGroupMembers:', error.message); return []; }
  return data || [];
}

// Імена за списком uid → Map<uid, name> (для підпису відправників у груповому чаті)
export async function fetchProfileNames(uids) {
  if (!supa || !uids || !uids.length) return new Map();
  const { data, error } = await supa.from('profiles').select('uid, name').in('uid', uids);
  if (error) { console.warn('[supabase] fetchProfileNames:', error.message); return new Map(); }
  return new Map((data || []).map(p => [p.uid, p.name]));
}

export async function fetchGroupMessages(groupId, sinceTs = null) {
  if (!supa) return [];
  let q = supa.from('chat_group_messages').select('*').eq('group_id', groupId);
  if (sinceTs) q = q.gt('created_at', sinceTs);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) { console.warn('[supabase] fetchGroupMessages:', error.message); return []; }
  return data || [];
}

export async function sendGroupMessage({ groupId, senderUid, text, photoUrl = null, replyToId = null, clientTag = null }) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const row = { group_id: groupId, sender_uid: senderUid, text: text || null };
  if (photoUrl) row.photo_url = photoUrl;
  if (replyToId) row.reply_to_id = replyToId;
  if (clientTag) row.client_tag = clientTag;
  const r = await netInsert(() => supa.from('chat_group_messages').insert(row).select().single(), {
    verify: clientTag
      ? () => supa.from('chat_group_messages').select('*').eq('group_id', groupId).eq('client_tag', clientTag).maybeSingle()
      : null,
  });
  if (!r.ok) return { ok: false, error: r.error };
  // Push усім учасникам групи ≠ відправник (не блокуємо UI — помилка пуша не валить відправку)
  supa.functions.invoke('send-group-push', { body: { message_id: r.data.id } })
    .catch(e => console.warn('[supabase] send-group-push:', e?.message));
  return { ok: true, message: r.data };
}

export async function editGroupMessage(messageId, text) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const r = await netCall(() => supa.from('chat_group_messages')
    .update({ text, edited_at: new Date().toISOString() })
    .eq('id', messageId).select().single());
  return r.ok ? { ok: true, message: r.data } : { ok: false, error: r.error };
}

export async function deleteGroupMessage(messageId) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const r = await netCall(() => supa.from('chat_group_messages')
    .update({ deleted_at: new Date().toISOString(), text: null, photo_url: null })
    .eq('id', messageId).select().single());
  return r.ok ? { ok: true, message: r.data } : { ok: false, error: r.error };
}

export function subscribeGroupMessages(groupId, onChange) {
  if (!supa) return () => {};
  const ch = supa.channel(`group-${groupId}`)
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chat_group_messages', filter: `group_id=eq.${groupId}` },
        payload => onChange({ type: payload.eventType, row: payload.new || payload.old }))
    .subscribe();
  return () => supa.removeChannel(ch);
}

// Мої треди (вхідні + вихідні) з даними оголошення. Нові зверху.
export async function fetchMyThreads(uid) {
  if (!supa || !uid) return [];
  const { data, error } = await supa.from('threads')
    // `status` потрібен, щоб картка оголошення в чаті могла показати «Завершено»
    // (29.07, контексти розмови). Порожній join = оголошення видалили → «недоступне».
    .select('*, post:posts(id, title, text, category, photos, author, contact, location, status, published_at, created_at)')
    .or(`author_uid.eq.${uid},buyer_uid.eq.${uid}`)
    .order('last_message_at', { ascending: false });
  if (error) { console.warn('[supabase] fetchMyThreads:', error.message); return []; }
  return data || [];
}

// Per-user стан розмов (архів / приховано) → Map<thread_id, {archived, hidden}>.
export async function fetchThreadStates(uid) {
  const map = new Map();
  if (!supa || !uid) return map;
  const { data, error } = await supa.from('thread_user_state')
    .select('thread_id, archived, hidden, cleared_at').eq('uid', uid);
  if (error) { console.warn('[supabase] fetchThreadStates:', error.message); return map; }
  for (const r of (data || [])) map.set(r.thread_id, { archived: !!r.archived, hidden: !!r.hidden, cleared_at: r.cleared_at || null });
  return map;
}

// Оновити стан розмови (upsert по (uid, thread_id)). patch = { archived?, hidden? }.
export async function setThreadState(uid, threadId, patch) {
  if (!supa || !uid) return { ok: false, error: 'no-supa' };
  const row = { uid, thread_id: threadId, updated_at: new Date().toISOString(), ...patch };
  const r = await netCall(() => supa.from('thread_user_state').upsert(row, { onConflict: 'uid,thread_id' }));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// Знайти або створити тред покупця на оголошенні. authorUid = власник посту.
// authorName/buyerName зберігаємо денормалізовано (profiles приватний — див. SQL).
export async function getOrCreateThread({ postId, authorUid, buyerUid, authorName, buyerName }) {
  if (!supa) return { ok: false, error: 'no-supa' };
  // Вставка тут безпечна для повтору БЕЗ client_tag: у пари (пост, покупець) тред
  // рівно один, і звірка — це той самий пошук, що вже стоїть першим рядком.
  const find = () => supa.from('threads')
    .select('*').eq('post_id', postId).eq('buyer_uid', buyerUid).maybeSingle();
  const found = await netCall(find, { retries: 1, timeout: NET_TIMEOUT });
  if (found.ok && found.data) return { ok: true, thread: found.data };
  const r = await netInsert(() => supa.from('threads')
    .insert({
      post_id: postId, author_uid: authorUid, buyer_uid: buyerUid,
      author_name: authorName || null, buyer_name: buyerName || null,
    })
    .select().single(), { verify: find });
  return r.ok ? { ok: true, thread: r.data } : { ok: false, error: r.error };
}

// Повідомлення треда (старі → нові).
export async function fetchMessages(threadId, sinceTs = null) {
  if (!supa) return [];
  let q = supa.from('messages').select('*').eq('thread_id', threadId);
  if (sinceTs) q = q.gt('created_at', sinceTs);   // «чистий» вид після видалення (cleared_at)
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) { console.warn('[supabase] fetchMessages:', error.message); return []; }
  // Фото приватного чату лежать у ЗАКРИТОМУ бакеті — тут шлях стає тимчасовим
  // посиланням. Давні записи (повна https-адреса) проходять наскрізь без змін.
  return await signChatPhotos(data || []);
}

// cleared_at цього користувача для треда (момент «видалення») або null.
export async function fetchThreadClearedAt(uid, threadId) {
  if (!supa || !uid) return null;
  const { data } = await supa.from('thread_user_state')
    .select('cleared_at').eq('uid', uid).eq('thread_id', threadId).maybeSingle();
  return data?.cleared_at || null;
}

// Надіслати повідомлення + оновити час треда + штовхнути push отримувачу.
// Таймаут для мережевих викликів — щоб помилка зв'язку приходила швидко,
// а не висіла поки браузер довго чекає відповіді (важливо для відкату B).
const NET_TIMEOUT = 6000;
// Запис у базу терпить довше за читання: людина щойно натиснула «Зберегти», і краще
// почекати зайву секунду, ніж показати помилку на живому, але повільному зв'язку.
const WRITE_TIMEOUT = 12000;
function withTimeout(thenable, ms = NET_TIMEOUT) {
  return Promise.race([
    Promise.resolve(thenable),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Немає зв\'язку')), ms)),
  ]);
}

// ── ЯДРО НАДІЙНОГО ЗАПИСУ (Вова 26.07, скрін IMG_3635) ──────────────────────────
// Привід: під час дзвінка мережа просіла, збереження поста впало, і людина побачила
// «TypeError: Load failed» — а кнопка застрягла на «Зберігаю…».
//
// 🔑 ГОЛОВНА ДУМКА: обрив зв'язку — не помилка користувача і не привід здаватись
// з першої спроби. Для ФОТО у проєкті це вже вирішено (`core/upload.js`: стиснення +
// послідовно + повтор із бекофом), а на записи в базу механізм просто не поширили.
// Тут — та сама ідея, одним місцем для всіх записів.
//
// Повторюємо ЛИШЕ тимчасове (обрив, таймаут, 5xx, 429). Змістовне — права, валідація,
// антиспам — повторювати безглуздо: відповідь буде та сама, а людина чекатиме втричі довше.

// `Load failed` — так про обірваний запит каже Safari, `Failed to fetch` — Chrome.
// Обидва означають одне: запит НЕ ДОЇХАВ. Це не помилка даних.
function isTransientError(err) {
  const msg = String(err?.message || err || '');
  const status = Number(err?.status || err?.statusCode || 0);
  if (status === 429 || (status >= 500 && status < 600)) return true;
  return /load failed|failed to fetch|networkerror|network ?error|немає зв|timeout|timed out|aborted|ERR_NETWORK/i.test(msg);
}

// Один словник людських формулювань. Технічний текст не показуємо НІКОЛИ —
// він нічого не пояснює людині й лише лякає.
export function netErrorText(err) {
  const msg = String(err?.message || err || '');
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    return 'Немає інтернету — перевір зв\'язок і спробуй ще раз';
  if (isTransientError(err))              return 'Слабкий зв\'язок — спробуй ще раз';
  if (/permission|denied|policy|row-level|RLS/i.test(msg)) return 'Недостатньо прав для цієї дії';
  if (/duplicate|unique/i.test(msg))      return 'Це вже збережено';
  if (/JWT|token|session/i.test(msg))     return 'Сеанс застарів — увійди знову';
  // Відповідь під коментар, який тим часом видалили. База відхиляє це тригером
  // `page_comments_antispam` (міграція `forbid_reply_under_deleted_parent`, 26.07) —
  // саме так народжувався «сирота»: живий коментар, якого екран показати не може,
  // через що картка писала «2 коментарі», а в листі був один.
  if (/parent_deleted/i.test(msg))        return 'Цей коментар уже видалено';
  if (/нецензурн|заборонен/i.test(msg))   return '🚫 Текст містить заборонені слова';
  // Доменні відповіді серверного антиспаму (тригери `*_antispam` у базі). Були
  // окремим словником у `feed.js` — через це той самий збій мав два різні тексти,
  // і при переході коментарів на ядро точне формулювання підмінялось загальним.
  if (/повтори символів|беззмістовн/i.test(msg)) return '🚫 Текст схожий на спам';
  if (/щойно це написали/i.test(msg))     return 'Ви щойно це написали';
  if (/порожній/i.test(msg))              return 'Текст порожній';
  if (/занадто швидко|rate/i.test(msg))   return 'Занадто швидко — зачекай кілька секунд';
  return 'Не вдалося зберегти — спробуй ще раз';
}

// fn — функція, що ПОВЕРТАЄ новий запит. Саме функція, а не готовий запит:
// конструктор запиту Supabase одноразовий, повторно його «запустити» не можна.
// Повертає { ok, data, error } — error уже ЛЮДСЬКИЙ, raw — технічний (для консолі).
// ── 🔴 22.08 — СЛІД ВІД ЗБОЮ, ЯКИЙ ВІДХИЛИЛА БАЗА ───────────────────────────
//
// 🔑 ЩО САМЕ ПИШЕМО І ЧОМУ НЕ ВСЕ ПІДРЯД. Пишемо лише **не-transient** відмови,
// тобто ті, де база сказала змістовне «ні»: RLS не пустила (42501), порушено
// унікальність (23505), тригер відхилив текст. Це завжди означає ПОЛОМКУ АБО
// ПРАВИЛО, тобто те, що ми маємо побачити.
// 🛑 Обриви звʼязку, таймаути й «людина в тунелі» сюди НЕ пишемо: їх буде
// тисячі, вони не наша поломка, і вони втопили б справжні сигнали. Саме тому
// фільтр — `transient === false`, а не «будь-яка помилка».
//
// ⚠️ ВМІСТ НЕ ПИШЕМО НІКОЛИ — ні тексту коментаря, ні повідомлення, ні телефону.
// Лишається код помилки і перші 160 символів технічного тексту бази (він сам
// називає таблицю: «violates row-level security policy for table page_comments»).
// Цього досить, щоб упізнати ваду, і замало, щоб дізнатись щось про людину.
//
// 🔑 Стоїть В ЯДРІ, а не у викликачів: точок запису в базу десятки, і кожна нова
// неминуче забула б діагностику — рівно так само, як забула б перевірку
// `analyticsEnabled()` (та сама причина описана у `logEvent`).
// 🔴 26.08 — МІСТОК ДЛЯ «ХТО» В ДІАГНОСТИЦІ.
// Замовлення Вови: «позначай імʼя акаунта, на якому це сталося… якщо воно сталося в
// двох акаунтів, то ще імʼя акаунта».
// 🛑 Це СКАСОВУЄ попереднє рішення, і воно було свідоме: нижче в `logDbRefusal` стояло
// «пишемо випадковий номер пристрою, а не акаунт… прив'язка до акаунта нічого не додала б
// до діагнозу і зробила б журнал збоїв журналом людей». Аргумент чинний, але власник
// вирішив інакше: без імені він не може відтворити ваду і переслати її на виправлення.
// 📐 Заміряно, чому це не косметика: у ВСІХ збоїв у базі стоїть `акаунтів: 0` — тобто
// імені там не було з чого взяти взагалі.
//
// 🔑 ЧОМУ МІСТОК, А НЕ ПРЯМИЙ ВИКЛИК `currentUserId()`: вона живе в `auth.js`, а той сам
// імпортує цей файл — вийшло б кільце імпортів. Тому `auth.js` ШТОВХАЄ сюди uid при
// кожній зміні входу; потік односторонній і кільця не утворює.
let _analyticsUid = null;
export function setAnalyticsUid(uid) { _analyticsUid = uid || null; }
export function analyticsUid() { return _analyticsUid; }

function logDbRefusal(err) {
  try {
    if (!err || isTransientError(err)) return;      // обрив мережі — не наша поломка
    const code = String(err.code || err.status || '').slice(0, 12);
    const msg  = String(err.message || err || '').slice(0, 160);
    if (!code && !msg) return;
    // 🔴 26.08 — ПИШЕМО АКАУНТ, ЯКЩО ВІН Є (замовлення Вови, див. `setAnalyticsUid`).
    // Раніше тут завжди стояв номер пристрою, і в журналі збоїв не було ЖОДНОГО імені —
    // тобто «у кого саме зламалось» дізнатись було неможливо.
    // ⚠️ У гостя `_analyticsUid` порожній, і тоді все лишається як було: номер пристрою.
    // Через `logEvent`, щоб вимикач статистики в кабінеті діяв і тут: хто
    // відкликав згоду, не лишає слідів ЖОДНОГО виду, навіть технічних.
    logEvent(_analyticsUid || getAnonId(), 'db_refusal', { meta: { code, msg } });
  } catch (_) { /* діагностика не сміє зламати дію, заради якої її кличуть */ }
}

export async function netCall(fn, { retries = 2, timeout = WRITE_TIMEOUT } = {}) {
  let last = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { data, error } = await withTimeout(fn(), timeout);
      if (!error) return { ok: true, data, error: null };
      last = error;
      if (!isTransientError(error)) break;          // змістовна — повтор не допоможе
    } catch (e) {
      last = e;
      if (!isTransientError(e)) break;
    }
    // Бекоф 0.5с / 1.0с — як в upload.js: короткий обрив за цей час зазвичай минає.
    if (attempt < retries) await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
  }
  const raw = String(last?.message || last || '');
  if (raw) console.warn('[netCall]', raw);          // технічне — у консоль, не людині
  // 🔴 22.08 — ЗБІЙ, ЯКИЙ БАЗА ВІДХИЛИЛА, ТЕПЕР ЛИШАЄ СЛІД. Заведено після того, як
  // RLS дві доби мовчки ламала КОЖЕН коментар Стрічки, а дізнались ми про це лише
  // тому, що Вова випадково спробував із другого акаунта і надіслав знімок.
  // Слова Вови: «це такі речі, які будуть траплятись у користувачів, це проблема,
  // тому що ми це не зможемо побачити».
  logDbRefusal(last);
  // transient кажемо назовні: для ВСТАВКИ це різниця між «можна спробувати ще раз»
  // і «база нас відхилила» (див. netInsert нижче).
  // rawError — сам обʼєкт помилки. Потрібен тим викликам, які дивляться на КОД
  // (напр. «немає такої колонки», 42703): по тексту це вгадування, по коду — факт.
  return { ok: false, data: null, error: netErrorText(last), raw, rawError: last, transient: isTransientError(last) };
}

// ── ВСТАВКА — окремий випадок, повтор тут НЕ безпечний ───────────────────────
// 🔑 ГОЛОВНА ДУМКА: обрив зв'язку буває двох видів, і на вигляд вони однакові.
// (1) запит НЕ доїхав до бази — повтор безпечний і потрібний;
// (2) запит доїхав, база записала, а ВІДПОВІДЬ загубилась по дорозі назад —
//     повтор створить ДРУГИЙ коментар / ДРУГЕ повідомлення / ДРУГИЙ пост.
// Клієнт відрізнити (1) від (2) не може. Тому питаємо базу: «цей рядок уже там?».
//
// verify — функція, що повертає запит-пошук за КЛІЄНТСЬКИМ ключем (`client_tag`,
// uuid від клієнта). Немає ключа — немає чим звіряти → повтору не робимо взагалі:
// краще «спробуй ще раз» людині, ніж тихий дубль у стрічці.
//
// Якщо звірка сама не доїхала — теж НЕ повторюємо. Не знаємо стану = не пишемо.
export async function netInsert(fn, { verify = null, retries = 2, timeout = WRITE_TIMEOUT } = {}) {
  let last = await netCall(fn, { retries: 0, timeout });
  if (last.ok || !last.transient || !verify) return last;

  for (let attempt = 1; attempt <= retries; attempt++) {
    await new Promise(r => setTimeout(r, 500 * attempt));
    const chk = await netCall(verify, { retries: 1, timeout: NET_TIMEOUT });
    if (!chk.ok) return last;                       // не змогли перевірити — не дублюємо
    if (chk.data) return { ok: true, data: chk.data, error: null, recovered: true };
    last = await netCall(fn, { retries: 0, timeout });
    if (last.ok || !last.transient) return last;
  }
  return last;
}

export async function sendMessage({ threadId, senderUid, text, photoUrl = null, replyToId = null, clientTag = null }) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const row = { thread_id: threadId, sender_uid: senderUid, text: text || null };
  if (photoUrl) row.photo_url = photoUrl;
  if (replyToId) row.reply_to_id = replyToId;
  if (clientTag) row.client_tag = clientTag;
  // Повтор при обриві — лише зі звіркою за client_tag, інакше людина отримає
  // ДВА однакові повідомлення в розмові (див. netInsert).
  const r = await netInsert(() => supa.from('messages').insert(row).select().single(), {
    verify: clientTag
      ? () => supa.from('messages').select('*').eq('thread_id', threadId).eq('client_tag', clientTag).maybeSingle()
      : null,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const data = r.data;
  // Час+прев'ю треда тепер ставить тригер trg_touch_thread у БД (надійно).
  // Лишаємо клієнтський апдейт як підстраховку (ідемпотентно, не шкодить).
  // Свідомо БЕЗ повтору: правду тут пише тригер, а зайві 1.5с бекофу на слабкому
  // зв'язку відчувались би як «повідомлення довго надсилається» вже ПІСЛЯ успіху.
  const preview = text || (photoUrl ? '📷 Фото' : '');
  await supa.from('threads')
    .update({ last_message_at: new Date().toISOString(), last_message_text: preview })
    .eq('id', threadId);
  // Push отримувачу (не блокуємо UI — помилка пуша не валить відправку)
  supa.functions.invoke('send-chat-push', { body: { message_id: data.id } })
    .catch(e => console.warn('[supabase] send-chat-push:', e?.message));
  // Повертаємо рядок уже з тимчасовим посиланням: board-chat.js цим рядком
  // ЗАМІНЮЄ оптимістичну бульбашку, і без підпису щойно надіслане власне фото
  // зникло б у порожню рамку одразу після відправки.
  const [signed] = await signChatPhotos([data]);
  return { ok: true, message: signed || data };
}

// Редагування свого повідомлення (текст + позначка edited_at)
export async function editMessage(messageId, text) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const r = await netCall(() => supa.from('messages')
    .update({ text, edited_at: new Date().toISOString() })
    .eq('id', messageId).select().single());
  return r.ok ? { ok: true, message: r.data } : { ok: false, error: r.error };
}

// М'яке видалення (soft-delete): лишаємо рядок, прибираємо вміст → плейсхолдер у UI
export async function deleteMessage(messageId) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const r = await netCall(() => supa.from('messages')
    .update({ deleted_at: new Date().toISOString(), text: null, photo_url: null })
    .eq('id', messageId).select().single());
  return r.ok ? { ok: true, message: r.data } : { ok: false, error: r.error };
}

// Позначити вхідні повідомлення треда прочитаними (read_at).
// Тихий запис: людині про нього не кажемо (вона не просила «позначити прочитаним»,
// це побічна дія відкриття розмови). Але повтор потрібен — інакше при кліпанні
// мережі бейдж непрочитаних лишається висіти на порожній розмові.
export async function markThreadRead(threadId, uid) {
  if (!supa || !uid) return;
  await netCall(() => supa.from('messages').update({ read_at: new Date().toISOString() })
    .eq('thread_id', threadId).neq('sender_uid', uid).is('read_at', null));
}

// Скільки непрочитаних повідомлень адресовано мені (для бейджа).
export async function fetchUnreadCount(uid) {
  if (!supa || !uid) return 0;
  // Беремо id моїх тредів, тоді рахуємо чужі непрочитані в них.
  const { data: th } = await supa.from('threads').select('id')
    .or(`author_uid.eq.${uid},buyer_uid.eq.${uid}`);
  const ids = (th || []).map(t => t.id);
  if (!ids.length) return 0;
  const { count } = await supa.from('messages')
    .select('id', { count: 'exact', head: true })
    .in('thread_id', ids).neq('sender_uid', uid).is('read_at', null);
  return count || 0;
}

// Непрочитані по кожному треду → Map<thread_id, count> (для бейджів у списку).
export async function fetchUnreadByThread(uid) {
  const map = new Map();
  if (!supa || !uid) return map;
  const { data: th } = await supa.from('threads').select('id')
    .or(`author_uid.eq.${uid},buyer_uid.eq.${uid}`);
  const ids = (th || []).map(t => t.id);
  if (!ids.length) return map;
  // cleared_at цього юзера по тредах (момент «видалення») — непрочитані рахуємо лише ПІСЛЯ неї.
  const { data: states } = await supa.from('thread_user_state')
    .select('thread_id, cleared_at').eq('uid', uid).not('cleared_at', 'is', null);
  const clearedMap = new Map((states || []).map(s => [s.thread_id, s.cleared_at]));
  // Тягнемо непрочитані чужі повідомлення цих тредів і рахуємо на клієнті (з урахуванням cleared_at).
  const { data } = await supa.from('messages').select('thread_id, created_at')
    .in('thread_id', ids).neq('sender_uid', uid).is('read_at', null);
  for (const m of (data || [])) {
    const cl = clearedMap.get(m.thread_id);
    if (cl && new Date(m.created_at) <= new Date(cl)) continue;   // повідомлення до видалення — не рахуємо
    map.set(m.thread_id, (map.get(m.thread_id) || 0) + 1);
  }
  return map;
}

// Пари учасників по тредах → [{id, author_uid, buyer_uid, …прев'ю}] БЕЗ join оголошень.
// 🔴 29.07: бейдж непрочитаних має рахувати РОЗМОВИ (людей), а не треди — інакше одна
// людина з двома оголошеннями давала б «2» на бейджі й ОДИН рядок у списку, тобто
// число нікуди не вело. Окрема легка вибірка, бо `fetchMyThreads` тягне ще й пости,
// а бейдж оновлюється часто (після кожного прочитання і кожного push).
//
// 🆕 17.08 — ДОДАНО ЧОТИРИ ПОЛЯ ТІЄЇ САМОЇ ТАБЛИЦІ (`last_message_text`,
// `last_message_at`, `author_name`, `buyer_name`) під капсулу «ПОВІДОМЛЕННЯ» на
// головній. 🔑 Саме сюди, а не другим запитом: капсулі потрібні рівно ті треди,
// які цей виклик уже тягне, і другий похід у мережу дав би ДРУГЕ джерело правди
// про непрочитане — те, що вже розходилось у B-27. Обіцянка «без join оголошень»
// не порушена: усі чотири колонки лежать у самій `threads`, зайвої таблиці нема.
export async function fetchThreadPairs(uid) {
  if (!supa || !uid) return [];
  const { data, error } = await supa.from('threads')
    .select('id, post_id, author_uid, buyer_uid, last_message_text, last_message_at, author_name, buyer_name')
    .or(`author_uid.eq.${uid},buyer_uid.eq.${uid}`);
  if (error) { console.warn('[supabase] fetchThreadPairs:', error.message); return []; }
  return data || [];
}

// Коротко про оголошення: назва і стан. Для капсули «ПОВІДОМЛЕННЯ» на головній —
// вона мусить сказати, ПРО ЯКЕ оголошення розмова (скарга Вови 17.08: «неясно, що
// це за повідомлення, з якого оголошення»).
// 🔑 Окремий легкий запит, а не join у `fetchThreadPairs`: той кличеться на кожне
// повернення у вкладку (бейджі), а назва потрібна лише коли розмова РІВНО одна.
// ⚠️ Може віддати `null` цілком законно: RLS пускає до чужого поста лише коли він
// `published`. Якщо продавець ЗАВЕРШИВ своє оголошення, покупець назви вже не
// побачить — капсула тоді просто не показує контекст, а не бреше вигаданим.
export async function fetchPostBrief(postId) {
  if (!supa || postId == null) return null;
  const { data, error } = await supa.from('posts')
    .select('id, title, text, status').eq('id', postId).maybeSingle();
  if (error) { console.warn('[supabase] fetchPostBrief:', error.message); return null; }
  return data || null;
}

// Зберегти push-пристрій під акаунт (для чат-сповіщень).
//
// 🔴 24.08 — ТЕПЕР ЦЕ ЗАХОПЛЕННЯ, А НЕ ПРОСТО ЗАПИС.
// Було: звичайний `upsert` під свій `uid`. А `unique (uid, endpoint)` вважає
// «той самий телефон під двома акаунтами» цілком законною парою рядків — тож
// після виходу з одного акаунта й входу в інший push летіли ОБОМ. Заміряно на
// живій базі: один endpoint під «Володимиром» (26.07) і «Олександром» (24.08
// 08:09 UTC — рівно коли Вова перемикався). Саме на це він і скаржився.
// 🔑 `claim_push_device` в одній транзакції прибирає чужі рядки з цим endpoint і
// кладе свій. Одна транзакція, а не два запити: між ними було б вікно, у якому
// пристрій не належить нікому і сповіщення губляться.
// ⚠️ Прибирання чужого тут безпечне: `endpoint` — ~200 випадкових символів від
// Apple/Google, і прочитати чужий неможливо (політика пускає лише до своїх
// рядків). Назвати те, чого не бачиш, не вийде. Подробиці й доказ —
// `scripts/supabase_account_scoped_state.sql`.
export async function saveUserPushDevice({ uid, endpoint, p256dh, auth_key }) {
  if (!supa || !uid) return { ok: false };
  const r = await netCall(() => supa.rpc('claim_push_device', {
    p_endpoint: endpoint, p_p256dh: p256dh, p_auth_key: auth_key,
  }));
  return r.ok ? { ok: true } : { ok: false };
}

// 🔴 24.08 — ВІДВʼЯЗАТИ ПРИСТРІЙ ПРИ ВИХОДІ З АКАУНТА.
// Друга половина того самого фікса. `claim_push_device` рятує наступний вхід, а
// це — проміжок МІЖ входами: людина вийшла і сидить гостем, а сповіщення
// попереднього акаунта далі приходять на екран.
// ⚠️ Кличеться ДО `supa.auth.signOut()`: після виходу токена вже немає, і RLS
// не пустить видалити навіть власний рядок.
// 🛑 Помилку тут НЕ роздуваємо в тост: людина натиснула «Вийти», і вихід має
// відбутись навіть без мережі. Слід лишається в консолі й у журналі збоїв.
export async function releasePushDevice(uid, endpoint) {
  if (!supa || !uid || !endpoint) return { ok: false };
  const r = await netCall(() => supa.from('user_push_devices')
    .delete().eq('uid', uid).eq('endpoint', endpoint));
  if (!r.ok) console.warn('[supabase] releasePushDevice:', r.error);
  return r.ok ? { ok: true } : { ok: false };
}

// Realtime: будь-яка зміна повідомлень одного треда (нові / редагування / видалення / прочитано).
// onChange({ type: 'INSERT'|'UPDATE'|'DELETE', row }).
export function subscribeThreadMessages(threadId, onChange) {
  if (!supa) return () => {};
  const ch = supa.channel(`thread-${threadId}`)
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
        // Realtime приносить СИРИЙ рядок з бази, тобто у photo_url буде шлях, а
        // не посилання. Підписуємо тут — інакше фото від співрозмовника
        // приходило б порожньою рамкою, поки чат не перезавантажать.
        async (payload) => {
          const raw = payload.new || payload.old;
          const [row] = await signChatPhotos([raw]);
          onChange({ type: payload.eventType, row: row || raw });
        })
    .subscribe();
  return () => supa.removeChannel(ch);
}

// Realtime: будь-яка зміна моїх тредів (для оновлення списку/бейджа).
export function subscribeMyThreads(onChange, channelName = 'my-threads') {
  if (!supa) return () => {};
  const ch = supa.channel(channelName)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, p => onChange(p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'threads' },  p => onChange(p))
    .subscribe();
  return () => supa.removeChannel(ch);
}

// ── ЗБЕРЕЖЕНІ ОГОЛОШЕННЯ (закладки) — per-uid у БД (синхрон між пристроями) ──
// Таблиця saved_posts(uid, post_id) + RLS «лише свої». Анонім → нічого.

export async function fetchSavedPostIds(uid) {
  const set = new Set();
  if (!supa || !uid) return set;
  const { data, error } = await supa.from('saved_posts').select('post_id').eq('uid', uid);
  if (error) { console.warn('[supabase] fetchSavedPostIds:', error.message); return set; }
  for (const r of (data || [])) set.add(r.post_id);
  return set;
}

// Закладки — тихі й ідемпотентні: повтор дає той самий стан, а тост через закладку
// людині не потрібен (викликач сам відкочує іконку, якщо не вийшло).
export async function addSavedPost(uid, postId) {
  if (!supa || !uid) return { ok: false };
  const r = await netCall(() => supa.from('saved_posts')
    .upsert({ uid, post_id: postId }, { onConflict: 'uid,post_id' }));
  return r.ok ? { ok: true } : { ok: false };
}

export async function removeSavedPost(uid, postId) {
  if (!supa || !uid) return { ok: false };
  const r = await netCall(() => supa.from('saved_posts').delete().eq('uid', uid).eq('post_id', postId));
  return r.ok ? { ok: true } : { ok: false };
}

// ── ЗБЕРЕЖЕНІ СТАТТІ — 24.08 ПЕРЕЇХАЛИ З ПРИСТРОЮ В АКАУНТ ──────────────────
//
// 🔴 Було: ключ `cstl_saved_articles` у `localStorage`, без жодної згадки про
// людину. Доведено стендом `tests/account-scope.mjs` у живому браузері: акаунт Б
// бачив статтю, збережену акаунтом А, і гість бачив її теж.
// 🔑 Ліки не вигадані: у тому ж аркуші «Збережені» поруч лежать ОГОЛОШЕННЯ, і
// вони не протікали — бо живуть у `saved_posts` з `uid`. Тому статті зведено до
// того самого зразка, а не до нового.
// ⚠️ Зберігаємо лише НОМЕР статті — контент завжди з `data/articles.json`
// (правило `CLAUDE.md`); саме тому в таблиці немає зовнішнього ключа.

export async function fetchSavedArticleIds(uid) {
  const set = new Set();
  if (!supa || !uid) return set;
  const { data, error } = await supa.from('saved_articles')
    .select('article_id').eq('uid', uid).order('created_at', { ascending: false });
  if (error) { console.warn('[supabase] fetchSavedArticleIds:', error.message); return set; }
  for (const r of (data || [])) set.add(r.article_id);
  return set;
}

export async function addSavedArticle(uid, articleId) {
  if (!supa || !uid) return { ok: false };
  const r = await netCall(() => supa.from('saved_articles')
    .upsert({ uid, article_id: articleId }, { onConflict: 'uid,article_id' }));
  return r.ok ? { ok: true } : { ok: false };
}

export async function removeSavedArticle(uid, articleId) {
  if (!supa || !uid) return { ok: false };
  const r = await netCall(() => supa.from('saved_articles')
    .delete().eq('uid', uid).eq('article_id', articleId));
  return r.ok ? { ok: true } : { ok: false };
}

// Разове перенесення того, що людина зберегла ДО переїзду.
//
// 🔑 Мовчки нічого не викидаємо: у Вови й перших людей у сховищі вже лежать
// закладки, і «полагодили, а твої збережені зникли» — гірше за сам баг.
// ⚠️ Переносимо на ПЕРШИЙ акаунт, який зайшов на цьому пристрої після оновлення,
// і одразу стираємо локальний ключ — інакше ті самі статті приїхали б і
// ДРУГОМУ акаунту, тобто витік, який ми лікуємо, просто переїхав би в базу.
// Той самий прийом уже застосовано до згоди з правилами Дошки (`board.js`).
export async function seedSavedArticles(uid, ids) {
  if (!supa || !uid || !ids?.length) return { ok: true, moved: 0 };
  const rows = ids.map(id => ({ uid, article_id: id }));
  const r = await netCall(() => supa.from('saved_articles')
    .upsert(rows, { onConflict: 'uid,article_id' }));
  return r.ok ? { ok: true, moved: rows.length } : { ok: false, moved: 0 };
}

// ── МІТКИ «ЩО Я ВЖЕ БАЧИВ» — СИНХРОН МІЖ ПРИСТРОЯМИ (24.08) ─────────────────
//
// Питання Вови: «А не можна щоб синхронізація була з акаунтом, тобто якщо
// прочитаю з телефону і зайду з компʼютера, то і там буде рівно те саме
// прочитано?» Можна — і це те, що тут зроблено.
//
// 🔑 ЧОМУ ЗАПИС ЧЕРЕЗ ФУНКЦІЮ, А НЕ ЗВИЧАЙНИЙ `upsert`. Два правила неможливо
// виконати з клієнта: мітка мусить рухатись ТІЛЬКИ ВПЕРЕД (`greatest`), і час
// мусить брати СЕРВЕР. Годинник телефона може відставати або бігти вперед; мітка
// «з майбутнього» назавжди заблокувала б правду. Подробиці й доказ —
// `scripts/supabase_seen_marks.sql`.
//
// ⚠️ Читання лишається звичайним `select` — тут нічого захищати, RLS уже пускає
// лише до своїх рядків.

export async function fetchSeenMarks(uid) {
  const out = {};
  if (!supa || !uid) return out;
  const { data, error } = await supa.from('user_seen_marks').select('scope, seen_at').eq('uid', uid);
  if (error) { console.warn('[supabase] fetchSeenMarks:', error.message); return out; }
  for (const r of (data || [])) out[r.scope] = Date.parse(r.seen_at) || 0;
  return out;
}

export async function markSeenRemote(scope) {
  if (!supa) return { ok: false };
  const r = await netCall(() => supa.rpc('mark_seen', { p_scope: scope }));
  return r.ok ? { ok: true, ts: Date.parse(r.data) || 0 } : { ok: false };
}

// Перенести мітку, яка вже лежить на цьому пристрої. Єдине місце, де час шле
// клієнт — і саме тому в базі стоїть стеля `least(p_seen_at, now())`.
export async function seedSeenRemote(scope, ts) {
  if (!supa || !ts) return { ok: false };
  const r = await netCall(() => supa.rpc('seed_seen', {
    p_scope: scope, p_seen_at: new Date(ts).toISOString(),
  }));
  return r.ok ? { ok: true, ts: Date.parse(r.data) || 0 } : { ok: false };
}

// Мітки ТЕМ (Питання): тут одного числа замало — теми читаються вибірково.
export async function fetchSeenThreads(uid) {
  const out = {};
  if (!supa || !uid) return out;
  const { data, error } = await supa.from('user_seen_threads').select('post_id, seen_at').eq('uid', uid);
  if (error) { console.warn('[supabase] fetchSeenThreads:', error.message); return out; }
  for (const r of (data || [])) out[r.post_id] = Date.parse(r.seen_at) || 0;
  return out;
}

export async function markThreadSeenRemote(postId) {
  if (!supa || postId == null) return { ok: false };
  const r = await netCall(() => supa.rpc('mark_thread_seen', { p_post_id: postId }));
  return r.ok ? { ok: true, ts: Date.parse(r.data) || 0 } : { ok: false };
}

// ── НАЛАШТУВАННЯ СПОВІЩЕНЬ (B-33, 24.08) ────────────────────────────────────
//
// 🔴 Досі вони жили в `localStorage` і не читались НІКИМ — ні застосунком, ні
// Edge Functions. Тобто чотири тумблери в кабінеті були декоративні. Тепер
// джерело одне — таблиця `notif_prefs`, і його читають ті самі функції, що
// надсилають push.
//
// 🔑 Чому саме в базу: push прив'язаний до АКАУНТА (`user_push_devices.uid`),
// отже і вимикач мусить бути акаунтним. У `localStorage` він був на пристрої —
// вимкнув на телефоні, а на компʼютері й далі приходить.

// Теми, які реально відповідають наявним push (звірено 24.08 по всіх сімох
// функціях). 🛑 Ключа під те, чого не існує, тут бути не може — саме це й було
// суттю B-33.
export const NOTIF_TOPICS = ['buses', 'board', 'questions', 'feed'];

export async function fetchNotifPrefs(uid) {
  if (!supa || !uid) return null;
  const { data, error } = await supa
    .from('notif_prefs').select('buses, board, questions, feed').eq('uid', uid).maybeSingle();
  if (error) { console.warn('[supabase] fetchNotifPrefs:', error.message); return null; }
  return data || null;   // null = рядка ще немає (людина не міняла нічого)
}

// Зберегти ОДИН перемикач. `upsert` — бо рядок може ще не існувати.
// ⚠️ БЕЗ `.select()` НАВМИСНО: `.upsert().select()` це `INSERT … RETURNING`, а
// він мусить ще й ПРОЧИТАТИ вставлений рядок через SELECT-політику. Саме на
// цьому двічі горів проєкт (правило №11-БІС: `push_subscriptions` 16.08 і
// `page_comments` 22.08). Повертати нам тут нема чого — стан ми й так знаємо.
export async function saveNotifPref(uid, topic, enabled) {
  if (!supa || !uid) return { ok: false };
  if (!NOTIF_TOPICS.includes(topic)) return { ok: false };
  const r = await netCall(() => supa.from('notif_prefs')
    .upsert({ uid, [topic]: !!enabled, updated_at: new Date().toISOString() },
            { onConflict: 'uid' }));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// Первинне заповнення з того, що людина вже вибирала НА ЦЬОМУ ПРИСТРОЇ.
// 🔑 Навіщо: до 24.08 вибір лежав у `localStorage`, і просто викинути його
// означало б мовчки ввімкнути назад те, що людина вимикала. Переносимо один
// раз — далі джерело тільки база.
export async function seedNotifPrefs(uid, fromLocal) {
  if (!supa || !uid || !fromLocal) return { ok: false };
  const рядок = { uid, updated_at: new Date().toISOString() };
  for (const t of NOTIF_TOPICS) if (t in fromLocal) рядок[t] = !!fromLocal[t];
  const r = await netCall(() => supa.from('notif_prefs').upsert(рядок, { onConflict: 'uid' }));
  return r.ok ? { ok: true } : { ok: false };
}

// ── ВІДСТЕЖУВАНІ РЕЙСИ — гідрація з push_subscriptions (синхрон між пристроями) ──
// Push уже per-uid у БД. Для показу на ІНШОМУ пристрої читаємо підписки акаунта
// (сьогодні+майбутні) і реконструюємо записи trackedRoutes для hero/модалки.
export async function fetchTrackedRoutesFromDB(uid, todayISO) {
  if (!supa || !uid) return [];
  const { data, error } = await supa.from('push_subscriptions')
    .select('route_id, route_name, boarding_stop, alighting_stop, track_date, dep_time, notified_dep, notified_warning, notified_canc')
    .eq('user_uuid', uid)
    .gte('track_date', todayISO);
  if (error) { console.warn('[supabase] fetchTrackedRoutesFromDB:', error.message); return []; }
  // Унікалізуємо за (route_id, track_date, boarding, alighting) — у БД на пристрій
  // може бути кілька рядків з тим самим рейсом (різні endpoint).
  const seen = new Set();
  const out = [];
  for (const r of (data || [])) {
    const key = `${r.route_id}|${r.track_date}|${r.boarding_stop || ''}|${r.alighting_stop || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      routeId:         r.route_id,
      trackDate:       r.track_date,
      boardingStop:    r.boarding_stop  || null,
      alightingStop:   r.alighting_stop || null,
      depTime:         r.dep_time || '',
      title:           r.route_name || '',
      notify:          true,
      notifiedDep:     !!r.notified_dep,
      notifiedWarning: !!r.notified_warning,
      notifiedCanc:    !!r.notified_canc,
      notifiedBoard:   false,
      notifiedFuture:  true,   // не показувати повторний банер «майбутній» на новому пристрої
    });
  }
  return out;
}

// ── REALTIME — підписка на зміни таблиць ─────────────────────────────────
// Викликає callback при INSERT/UPDATE/DELETE у відповідній таблиці.
// Повертає функцію-unsubscribe.

// ── PUSH-ПІДПИСКИ (Level B — Web Push для Автобусів) ─────────────────────────

// Зберігає push-підписку у Supabase.
// payload: { user_uuid, endpoint, p256dh, auth_key, route_id, route_name,
//            boarding_stop, alighting_stop, track_date, dep_time }
//
// 🔴 16.08 — БУЛО `insert`, СТАЛО `upsert`, І ЦЕ БУВ ТИХИЙ БАГ.
// Старий код на 23505 (unique_violation) відповідав `{ ok: true }` і НІЧОГО не
// оновлював. Унікальність тут — `(endpoint, route_id, track_date)`, тобто **без
// зупинок** (звірено з живою базою: індекс `push_subs_unique`). Наслідок:
//   відстежив ОЛИКА→ЛУЦЬК → отримав «за 15 хв» (`notified_warning = true`) →
//   скасував → відстежив ТОЙ САМИЙ рейс того ж дня з іншої зупинки
//   → у базі лишались СТАРІ зупинки і СТАРІ прапорці → попередження не приходило
//   ВЗАГАЛІ, або називало чужу зупинку.
// ⚠️ Сам файл схеми (`scripts/supabase_push_schema.sql:36`) уже обіцяв «upsert
//    оновлює дані (dep_time, зупинки)» — тобто намір був записаний, а код його не
//    виконував. Розходження документа з кодом і зробило ваду невидимою.
// 🔑 Прапорці «вже надіслано» скидаємо ЯВНО: повторне відстеження — це нова
//    домовленість із людиною, і всі сповіщення по ній мають прийти заново.
//    PostgREST оновлює лише передані колонки, тож без цього рядка вони б лишились.
// Чому це важливо: обрив саме тут = людина бачить увімкнений дзвіночок, а сервер
// про рейс не знає, і сповіщення не прийде. Тихий збій, який помічають надто пізно.
export async function savePushSubscription(payload, { resetNotified = false } = {}) {
  if (!supa) return { ok: false, error: 'no-supa' };
  // ⚠️ `resetNotified` НЕ можна тримати завжди увімкненим — і це не дрібниця.
  // Ту саму функцію кличе `selfHealPushSubscriptions()` при КОЖНОМУ відкритті
  // вкладки Автобуси. Якби скидання йшло безумовно, вийшло б так: людині прийшло
  // «автобус через 15 хв», вона відкрила застосунок подивитись — прапорці
  // обнулились, і наступної хвилини те саме попередження прилетіло ЗНОВУ, і так
  // до кінця вікна. Скидання доречне лише там, де людина СВІДОМО підписується
  // наново (кнопка «Відстежувати», дзвіночок), бо це нова домовленість.
  const row = { ...payload };
  if (resetNotified) {
    row.notified_dep     = false;
    row.notified_warning = false;
    row.notified_canc    = false;
    row.notified_start   = false;
  }
  const r = await netCall(() => supa.from('push_subscriptions')
    .upsert(row, { onConflict: 'endpoint,route_id,track_date' }));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// 🔴 16.08 — ПЕРЕНОС ПІДПИСОК НА НОВУ АДРЕСУ (ротація push-підписки браузером).
// Обидві таблиці, що зберігають `endpoint`, лікуються ОДНИМ місцем: автобусні
// рейси (`push_subscriptions`) і пристрої для чату/коментарів/сторінок
// (`user_push_devices`). Без цього стара адреса лишалась у базі мертвою, сервер
// отримував 410 і видаляв рядок — людина тихо переставала отримувати сповіщення.
// ⚠️ На `push_subscriptions` стоїть унікальність `(endpoint, route_id, track_date)`.
// Якщо рядок під НОВОЮ адресою вже створений (напр. людина встигла відстежити
// рейс наново), UPDATE впаде у 23505 — тоді старий рядок просто видаляємо, бо
// свіжий уже є і він правдивіший. Ковтати помилку мовчки не можна: це саме той
// клас тихих збоїв, від якого вся ця робота.
export async function migratePushEndpoint(uid, oldEndpoint, sub) {
  if (!supa || !uid || !oldEndpoint || !sub?.endpoint) return { ok: false, error: 'bad-args' };
  if (oldEndpoint === sub.endpoint) return { ok: true, moved: 0 };
  const fields = { endpoint: sub.endpoint, p256dh: sub.p256dh, auth_key: sub.auth_key };

  const routes = await netCall(() => supa.from('push_subscriptions')
    .update(fields).eq('user_uuid', uid).eq('endpoint', oldEndpoint));
  if (!routes.ok && routes.rawError?.code === '23505') {
    await netCall(() => supa.from('push_subscriptions')
      .delete().eq('user_uuid', uid).eq('endpoint', oldEndpoint));
  }

  const devices = await netCall(() => supa.from('user_push_devices')
    .update(fields).eq('uid', uid).eq('endpoint', oldEndpoint));
  if (!devices.ok && devices.rawError?.code === '23505') {
    await netCall(() => supa.from('user_push_devices')
      .delete().eq('uid', uid).eq('endpoint', oldEndpoint));
  }
  return { ok: true };
}

// Знімає підписку на рейс (при знятті відстеження).
//
// 🔴 16.08 — ФІЛЬТР БУВ ПО `endpoint`, СТАВ ПО `user_uuid`.
// `endpoint` — адреса push-підписки САМЕ ЦЬОГО браузера, а список відстежуваних
// рейсів гідрується з бази **по акаунту** (`fetchTrackedRoutesFromDB`, фільтр
// `user_uuid`). Через цю асиметрію жив відтворюваний сценарій:
//   відстежив рейс на телефоні → відкрив застосунок на планшеті (рейс підтягнувся)
//   → натиснув «скасувати» на планшеті → DELETE не зачіпав ЖОДНОГО рядка (endpoint
//   інший), але повертав успіх → інтерфейс казав «скасовано», **push однаково
//   прилітав на телефон**, а наступний вхід повертав рейс у список.
// ✅ RLS це дозволяє і не послаблюється: політика `push_delete` вимагає
//    `user_uuid = auth.uid()::text`, тобто стерти можна лише СВОЇ рядки — просто
//    тепер усі свої, на всіх пристроях. Так і має бути: «скасувати відстеження» —
//    це рішення людини про РЕЙС, а не про конкретний браузер.
export async function deletePushSubscription(uid, routeId, trackDate) {
  if (!supa) return { ok: false, error: 'no-supa' };
  if (!uid)  return { ok: false, error: 'no-uid' };
  const r = await netCall(() => supa.from('push_subscriptions')
    .delete()
    .eq('user_uuid', uid)
    .eq('route_id', routeId)
    .eq('track_date', trackDate));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// ── REALTIME ─────────────────────────────────────────────────────────────────

export function subscribeReactions(onChange) {
  if (!supa) return () => {};
  const ch = supa.channel('reactions-watch')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'reactions' },
        payload => onChange(payload))
    .subscribe();
  return () => supa.removeChannel(ch);
}

// ДОШКА: жива підписка на самі оголошення (`posts`). Досі її не було — нове оголошення
// зʼявлялось у інших лише після перезаходу на вкладку.
// ⚠️ Тут проходять УСІ зміни таблиці, включно з `pending` (оголошення на модерації) і
// `type='chat'` (обговорення). Що показувати — вирішує Дошка, а не підписка: вона лише
// каже «дані змінились». Інакше правила видимості жили б у двох місцях.
export function subscribePosts(onChange) {
  if (!supa) return () => {};
  const ch = supa.channel('board-posts-watch')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'posts' },
        payload => onChange(payload))
    .subscribe();
  return () => supa.removeChannel(ch);
}

export function subscribeComments(onChange) {
  if (!supa) return () => {};
  const ch = supa.channel('comments-watch')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'comments' },
        payload => onChange(payload))
    .subscribe();
  return () => supa.removeChannel(ch);
}

// «СТРІЧКА»: жива підписка на коментарі постів-сторінок (публічно для всіх —
// коментар будь-кого зʼявляється у всіх наживо). Таблиця вже в publication
// supabase_realtime (scripts/supabase_pages.sql).
export function subscribePageComments(onChange) {
  if (!supa) return () => {};
  const ch = supa.channel('page-comments-watch')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'page_comments' },
        payload => onChange(payload))
    .subscribe();
  return () => supa.removeChannel(ch);
}

// «СТРІЧКА»: жива підписка на самі ПОСТИ (Вова 26.07: «realtime має бути… між всіма, в яких
// зараз відкрита та чи інша модалка коментарів чи будь-яка інша сторінка взаємодії»).
// Досі підписки на пости не було взагалі: новий пост зʼявлявся в інших лише після
// перезаходу на вкладку. `cstl-posts-changed` — подія ОДНОГО пристрою, вона нікуди не летить.
//
// ⚠️ Realtime віддає рядок таблиці БЕЗ приєднаної сторінки (`pages(name, avatar_url)`) —
// приєднання в підписках не буває. Тому назву й аватар сторінки викликач бере з уже
// завантаженого списку сторінок (див. applyPostEvent у feed.js).
// Видалення поста в застосунку мʼяке (`deleted_at`), тобто приходить як UPDATE з повним
// рядком — окремої обробки DELETE не потребує.
export function subscribePagePosts(onChange) {
  if (!supa) return () => {};
  const ch = supa.channel('page-posts-watch')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'page_posts' },
        payload => onChange(payload))
    .subscribe();
  return () => supa.removeChannel(ch);
}

// «СТРІЧКА»: жива підписка на лайки постів (лічильник оновлюється у всіх наживо).
// DELETE-подія віддає post_id/user_id лише якщо таблиця має REPLICA IDENTITY FULL
// (scripts/supabase_pages_reactions_auth.sql) — інакше зняття лайка не синхронізується.
export function subscribePageReactions(onChange) {
  if (!supa) return () => {};
  const ch = supa.channel('page-reactions-watch')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'page_reactions' },
        payload => onChange(payload))
    .subscribe();
  return () => supa.removeChannel(ch);
}

// ── АНАЛІТИКА (Потік 6, byyou) ──────────────────────────────────────────────
// Власна статистика (без Google Analytics/Plausible) — сирі події у
// analytics_events (scripts/supabase_analytics.sql), агрегати рахує адмінка.
// visitorId — currentUserId() (акаунт) або getAnonId() (гість), рахує викликач
// (той самий патерн що fetchAllReactions(uid || getAnonId())).

// Записати подію. Fire-and-forget — НЕ блокує UI і НЕ кидає помилку викликачу
// (аналітика ніколи не має зламати реальну дію користувача).
// 🛑 СВІДОМО без ядра netCall/netInsert (не «недогляд», не чіпати без прохання):
// це аналітика. Людині вона нічого не показує, тож людський текст помилки ні до чого,
// а повтор при обриві накрутив би подію двічі й перекосив статистику в адмінці.
// Ціна втраченої події при обриві — нуль; ціна дубля — брехлива цифра.
// 🔴 ВИМИКАЧ СТАТИСТИКИ (14.08, правова відповідність). Правова підстава обробки
// в нас — ЗГОДА (ст. 11 ЗУ №2297-VI), а згода без можливості її відкликати згодою
// не є. Пункт «Статистика користування» в кабінеті пише сюди.
//
// 🔑 Чому localStorage, а не колонка в профілі: вимикач мусить діяти й у ГОСТЯ
// (він теж потрапляє в статистику — під випадковим номером пристрою), а в гостя
// рядка профілю не існує. Плюс подія пишеться fire-and-forget на кожному переході
// між вкладками — зчитування з мережі перед кожним записом коштувало б дорожче за
// саму подію.
// ⚠️ Наслідок, який треба знати: вимикач живе НА ПРИСТРОЇ. Другий телефон того
// самого акаунта треба вимкнути окремо — так і написано в кабінеті.
const ANALYTICS_OFF_KEY = 'cstl-analytics-off';

export function analyticsEnabled() {
  try { return localStorage.getItem(ANALYTICS_OFF_KEY) !== '1'; } catch (_) { return true; }
}

export function setAnalyticsEnabled(on) {
  try {
    if (on) localStorage.removeItem(ANALYTICS_OFF_KEY);
    else    localStorage.setItem(ANALYTICS_OFF_KEY, '1');
  } catch (_) {}
}

// 🔴 26.08 — ОДИН ЗАХІД У ЗАСТОСУНОК = ОДНА СЕСІЯ.
// Живе в `sessionStorage`, а не в `localStorage`, і це головне рішення: саме
// `sessionStorage` обнуляється, коли людина закриває застосунок, і переживає
// перемикання вкладок усередині — тобто його час життя збігається з тим, що людина
// називає «зайшов». `localStorage` дав би одну вічну «сесію» на пристрій.
// ⚠️ На iOS у PWA `sessionStorage` переживає згортання застосунку — тобто повернення
// через годину лишиться ТІЄЮ САМОЮ сесією. Це відоме звуження: чесніше показувати
// трохи менше сесій, ніж рахувати кожне визирання в екран за новий захід.
const SESSION_ID_KEY = 'cstl-analytics-session';

function currentSessionId() {
  try {
    let id = sessionStorage.getItem(SESSION_ID_KEY);
    if (!id) {
      id = crypto.randomUUID ? crypto.randomUUID() : 'sess-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      sessionStorage.setItem(SESSION_ID_KEY, id);
    }
    return id;
  } catch { return null; }
}

export function logEvent(visitorId, type, { tab = null, meta = null } = {}) {
  if (!supa || !visitorId) return;
  // Сторож стоїть ТУТ, а не у викликачів: точок виклику вже три (дві у `app.js`,
  // одна в `boot.js`), і четверта неминуче забула б перевірку.
  if (!analyticsEnabled()) return;

  // 🔴 26.08 — «ХТО» РОЗДІЛЕНО НА ДВА ПОЛЯ, І ЦЕ НЕ КОСМЕТИКА.
  // Раніше в `visitor_id` лягало `currentUserId() || getAnonId()`, тобто в одну колонку
  // йшли і UUID акаунта, і випадковий id гостя. Наслідок, заміряний на живій базі:
  // одна людина до входу і після входу давала ДВА «унікальні», а 736 «унікальних»
  // насправді були 11 акаунтів + 725 анонімних пристроїв (з них 628 з однією подією).
  // 🔑 `user_id` тепер ЄДИНА чесна одиниця «людина»; `anon_id` — окремо, для гостя.
  // 🛑 `visitor_id` пишемо як писали: на ньому тримається журнал збоїв («скільки різних
  // пристроїв зачепило»), і ламати робочу діагностику заради чистоти схеми не можна.
  // 🛑 РОЗРІЗНЯЄМО ПОРІВНЯННЯМ З `getAnonId()`, А НЕ ВИКЛИКОМ `currentUserId()`.
  // Спокуса була покликати `currentUserId()` прямо тут — але вона живе в `auth.js`, а
  // `auth.js` уже імпортує цей файл: вийшло б кільце імпортів. Заразом це зберігає
  // домовленість, записану поруч рядком вище: «хто саме» вирішує ВИКЛИКАЧ, а `logEvent`
  // лише розкладає це по колонках.
  // ⚠️ Порівняння надійне саме тому, що `getAnonId()` — єдине джерело анонімного id у
  // застосунку: усе, що НЕ дорівнює йому, прийшло з `currentUserId()`.
  const анонім = visitorId === getAnonId();
  const uid = анонім ? null : visitorId;
  supa.from('analytics_events')
    .insert({
      visitor_id: visitorId,
      user_id: uid || null,
      anon_id: анонім ? visitorId : null,
      session_id: currentSessionId(),
      event_type: type, tab, meta,
    })
    .then(({ error }) => { if (error) console.warn('[supabase] logEvent:', error.message); });
}

// 🗑 `fetchAnalyticsSummary()` ПРИБРАНА 26.08 (вечір) — мертвий код і водночас пастка.
// Вона тягнула сирі події в браузер (`.limit(20000)`) і рахувала їх тут, тобто несла в
// собі рівно ту стелю `db-max-rows` (1000), через яку екран показував «35 унікальних»
// замість 736. Адмінка на неї вже не спиралась (рахує `admin_analytics_overview()`), і
// жоден інший файл її не імпортував — але лишити її означало б тримати напоготові
// готовий спосіб повернути ту саму брехню наступним дотиком.


// ============================================================================
// «СТРІЧКА» — сторінки-канали громади (pages / page_posts / page_reactions /
// page_comments / page_subscriptions). Дата-шар; RLS у scripts/supabase_pages.sql.
// ============================================================================

// Усі сторінки-канали (для кружечків + шапок карток).
export async function fetchPages() {
  if (!supa) return [];
  const { data, error } = await supa.from('pages')
    // ⚠️ `official` (09.08) — синя галочка спільноти. Якщо колонки ще немає,
    // PostgREST відповість помилкою на ВЕСЬ запит і Стрічка лишиться порожньою,
    // тому нижче стоїть запасний шлях без цього поля.
    .select('id, name, theme, avatar_url, banner_url, is_system, sort_order, official')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) {
    // 🔑 Запасний шлях, а не «про всяк випадок»: код і міграція доїжджають окремо
    // (той самий урок, що з бургер-меню 09.08 — новий скрипт і старий CSS).
    // Без нього одне відсутнє поле лишило б людину БЕЗ УСІЄЇ Стрічки.
    const legacy = await supa.from('pages')
      .select('id, name, theme, avatar_url, banner_url, is_system, sort_order')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (legacy.error) { console.warn('[supabase] fetchPages:', legacy.error.message); return []; }
    return legacy.data || [];
  }
  return data || [];
}

// Пости стрічки: усіх сторінок (pageId=null) або однієї. Невидалені, найсвіжіші.
// pages(name, avatar_url) — вкладений join за FK page_posts.page_id → pages.id.
export async function fetchPagePosts(pageId = null, limit = 60) {
  if (!supa) return [];
  // 🔴 20.08 — `status = 'published'`. З появою ШІ-агента спільноти пости мають
  // стан: чернетку, яку Вова ще не вичитав, читач бачити не має.
  // 🛑 Це ДРУГА лінія, а не єдина: головна стоїть у політиці читання самої бази
  // (`scripts/supabase_page_post_drafts.sql`) — навіть якщо цей фільтр колись
  // загубиться при правці, чужу чернетку база все одно не віддасть.
  // ⚠️ У запасному запиті нижче фільтра НЕМАЄ навмисно: він існує на випадок, що
  // міграція ще не накотилась, і `status` там ще не існує. Додати фільтр туди
  // означало б поміняти «нема галочки» на «порожня Стрічка» — ціна незрівнянна.
  let q = supa.from('page_posts')
    .select('id, page_id, author_uid, text, image_url, image_urls, show_author, event_date, event_time, event_location, created_at, pinned_at, pages(name, avatar_url, official)')
    .is('deleted_at', null)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (pageId != null) q = q.eq('page_id', pageId);
  const { data, error } = await q;
  if (error) {
    // Той самий запобіжник, що у `fetchPages`: без нього відсутня колонка
    // `official` (міграція ще не накотилась) залишила б Стрічку ПОРОЖНЬОЮ —
    // ціна незрівнянно більша за відсутню галочку.
    let q2 = supa.from('page_posts')
      .select('id, page_id, author_uid, text, image_url, image_urls, show_author, event_date, event_time, event_location, created_at, pinned_at, pages(name, avatar_url)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (pageId != null) q2 = q2.eq('page_id', pageId);
    const legacy = await q2;
    if (legacy.error) { console.warn('[supabase] fetchPagePosts:', legacy.error.message); return []; }
    return legacy.data || [];
  }
  return data || [];
}

// ── ОСТАННІЙ ДОПИС КОЖНОЇ СПІЛЬНОТИ (25.08) ─────────────────────────────────
// Для віджета Стрічки на Громаді: ряд спільнот упорядкований за тим, ХТО ПИСАВ
// ОСТАННІМ, і під кожною — саме її останній допис.
//
// 🔴 ЧОМУ НЕ `fetchPagePosts(null, N)`, ЯК БУЛО ДО ЦЬОГО.
// Той запит бере N найсвіжіших постів УСІЄЇ стрічки, а не по одному з кожної
// спільноти. Досить одній активній спільноті написати N разів поспіль — і у
// вибірці не лишиться нікого іншого, тобто віджет «спільноти громади» покаже
// одну спільноту. Сьогодні цього не видно (постів мало), на живих даних вилізе
// в перший же активний день — а виглядатиме як «віджет чомусь завис».
//
// 🔑 ДВА ЗАПИТИ, І ДРУГИЙ ДЕШЕВИЙ.
//   1. ЗОНД — тільки `id, page_id, created_at`. Три маленькі поля, тож навіть
//      кілька сотень рядків важать копійки. З нього видно ТОЧНИЙ порядок
//      спільнот за свіжістю і id потрібних дописів.
//   2. ДОБІРКА — повні дані рівно тих кількох дописів, які підуть на екран.
// Альтернатива «один запит на спільноту» дала б стільки походів у мережу,
// скільки спільнот, і на головній це найдорожче місце.
//
// ⚠️ Порядок рахуємо САМІ, а не покладаємось на `.order()` бази: групування по
// спільнотах усе одно відбувається тут, і два джерела порядку рано чи пізно
// розійшлись би. Заразом це робить функцію придатною для стенда, де заглушка
// нічого не сортує.
export async function fetchLatestPostPerPage(maxPages = 6, scan = 300) {
  if (!supa) return [];

  // 1. Зонд. Фільтри ті самі, що у `fetchPagePosts`: невидалені й опубліковані —
  // інакше в порядок спільнот пролізла б чужа чернетка ШІ-агента.
  const probe = await supa.from('page_posts')
    .select('id, page_id, created_at')
    .is('deleted_at', null)
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(scan);
  if (probe.error) { console.warn('[supabase] fetchLatestPostPerPage:', probe.error.message); return []; }

  const rows = (probe.data || []).filter(r => r && r.page_id != null && r.created_at);
  const ts = r => new Date(r.created_at).getTime();

  // Останній допис кожної спільноти. Проходимо весь зонд і лишаємо найсвіжіший
  // рядок на кожен `page_id` — це не залежить від того, чи база вже впорядкувала.
  const latest = new Map();
  for (const r of rows) {
    const was = latest.get(r.page_id);
    if (!was || ts(r) > ts(was)) latest.set(r.page_id, r);
  }

  const top = [...latest.values()].sort((a, b) => ts(b) - ts(a)).slice(0, maxPages);
  if (!top.length) return [];

  // 2. Добірка. `.in('id', …)` — рівно ті дописи, що підуть на екран.
  const ids = top.map(r => r.id);
  let picked = await supa.from('page_posts').select(POST_COLS_OFFICIAL).in('id', ids);
  if (picked.error) {
    // Той самий запобіжник, що у `fetchPagePosts`: відсутня колонка `official`
    // (міграція ще не накотилась) не сміє лишити віджет порожнім.
    picked = await supa.from('page_posts').select(POST_COLS).in('id', ids);
    if (picked.error) { console.warn('[supabase] fetchLatestPostPerPage:', picked.error.message); return []; }
  }

  // Порядок віддаємо СВІЙ — за свіжістю, а не той, у якому база повернула рядки.
  const byId = new Map((picked.data || []).map(r => [String(r.id), r]));
  return top.map(r => byId.get(String(r.id))).filter(Boolean);
}

// ── ЧЕРНЕТКИ ШІ-АГЕНТА СПІЛЬНОТИ (20.08) ────────────────────────────────────
// Агент пише пости зі `status = 'draft'`, і читач їх не бачить: так каже політика
// читання бази. Ця функція дістає їх для того, хто МАЄ право їх вичитувати.
// 🔑 Окремих перевірок «а чи він адмін» тут немає навмисно — їх робить сама база
// (`can_edit_page`). Клієнт, який спитав чужі чернетки, отримає порожній список,
// а не чужий текст. Перевіряти двічі означало б мати два джерела правди про
// доступ, і рано чи пізно вони розійдуться.
export async function fetchPageDrafts(limit = 20) {
  if (!supa) return [];
  const { data, error } = await supa.from('page_posts')
    .select(POST_COLS)
    .is('deleted_at', null)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    // Колонки ще немає (міграція не накотилась) — це не привід шуміти в консоль
    // людині, яка просто відкрила Стрічку.
    if (!/column .*status/i.test(error.message || '')) {
      console.warn('[supabase] fetchPageDrafts:', error.message);
    }
    return [];
  }
  return data || [];
}

// Опублікувати чернетку. ⚠️ Разом зі станом оновлюємо `created_at`: пост має
// стати вгорі стрічки в момент ПУБЛІКАЦІЇ, а не тоді, коли його написав агент.
// Інакше текст, який пролежав чернеткою три дні, вийшов би одразу похованим під
// свіжими постами — і виглядало б це як «опублікував, а його немає».
export async function publishPagePost(postId) {
  if (!supa) return { ok: false, error: 'Немає з\'єднання з базою' };
  const patch = { status: 'published', created_at: new Date().toISOString() };
  const r = await netCall(() => supa.from('page_posts').update(patch).eq('id', postId).select(POST_COLS).single());
  if (r.error) return { ok: false, error: r.error.message };
  return { ok: true, post: r.data };
}

// Лайки постів → Map post_id → { count, my }. userKey = uid залогіненого або null.
//
// 🔴 09.08 (потік 2, крок 9) — ДВА ДЖЕРЕЛА, БО ГІСТЬ БІЛЬШЕ НЕ БАЧИТЬ РЯДКІВ.
// Раніше тут був один запит `select('post_id, user_id')`, і політика читання
// `USING (true)` віддавала повні рядки будь-кому — тобто з публічним ключем із
// `bundle.js` можна було зібрати, хто саме що лайкнув (заміряно на живій базі:
// 11 рядків, 5 унікальних uid). Після міграції
// `scripts/supabase_page_reactions_guest.sql` рядки бачить лише авторизований, а
// гість бере ЧИСЛА з подання `page_reaction_counts` (uid у ньому немає взагалі).
//
// ⚠️ ЗАПАСНИЙ ШЛЯХ ОБОВʼЯЗКОВИЙ, і не «про всяк випадок»: цей код потрапляє на
// сайт окремим деплоєм, а міграція накочується руками — тобто вони НЕОДМІННО
// якийсь час житимуть у різних станах, у будь-якому порядку. Без запасного
// шляху одна з половин показала б 0 лайків усюди. Той самий прийом уже
// застосований у проєкті для колонки `reply_to_uid` (див. COMMENT_COLS нижче).
export async function fetchPageReactions(userKey) {
  if (!supa) return new Map();
  const map = new Map();
  const bump = (postId, mine) => {
    if (!map.has(postId)) map.set(postId, { count: 0, my: false });
    const e = map.get(postId);
    e.count++;
    if (mine) e.my = true;
  };

  // Гість: лише кількості. Якщо подання ще не накотили — пробуємо стару дорогу.
  if (!userKey) {
    const { data, error } = await supa.from('page_reaction_counts').select('post_id, cnt');
    if (!error) {
      for (const r of (data || [])) map.set(r.post_id, { count: r.cnt || 0, my: false });
      return map;
    }
    const legacy = await supa.from('page_reactions').select('post_id');
    if (legacy.error) { console.warn('[supabase] fetchPageReactions (гість):', legacy.error.message); return map; }
    for (const r of (legacy.data || [])) bump(r.post_id, false);
    return map;
  }

  // Залогінений: рядки видно, тож одного запиту вистачає і на число, і на «мій лайк».
  const { data, error } = await supa.from('page_reactions').select('post_id, user_id');
  if (error) { console.warn('[supabase] fetchPageReactions:', error.message); return map; }
  for (const r of (data || [])) bump(r.post_id, r.user_id === userKey);
  return map;
}

// Поставити/зняти лайк ❤️ (on=true → додати, false → зняти).
export async function setPageReaction(postId, userKey, on) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  if (!on) {
    const r = await netCall(() => supa.from('page_reactions').delete()
      .eq('post_id', postId).eq('user_id', userKey));
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
  const r = await netCall(() => supa.from('page_reactions')
    .upsert({ post_id: postId, user_id: userKey, emoji: '❤️' }, { onConflict: 'post_id,user_id' }));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// Коментарі постів → Map post_id → comments[] (невидалені, за часом).
// ⚠️ РОЗГОРТАННЯ БЕЗ ПРОСТОЮ: колонку reply_to_uid додає окрема міграція
// (scripts/supabase_comment_push.sql), і код може опинитись на сайті РАНІШЕ за неї.
// Тоді запит із цією колонкою впав би і зник би ВЕСЬ список коментарів. Тому пробуємо
// з колонкою, а на «немає такої колонки» повторюємо без неї — згадок просто не буде,
// доки міграцію не накатано. Прибрати цей запасний шлях можна після накатування.
// 🔑 `as_page_id` (25.08) — ВІД ЧИЙОГО ІМЕНІ звучить коментар: null = від людини,
// інакше = від спільноти. `author_uid` при цьому ЗАВЖДИ лишається людиною, яка
// написала: на ньому тримаються модерація, антиспам, згадки, капсули і push.
// ⚠️ ЗАПАСНОГО ШЛЯХУ ДЛЯ ЦІЄЇ КОЛОНКИ НЕМА, і це навмисно: міграція
// `page_comments_as_page_identity` накатана В БАЗУ ПЕРШОЮ, ще до того, як цей код
// поїхав на сайт. Порядок протилежний до випадку `reply_to_uid`, де код міг
// випередити міграцію — тут випередити нема чого.
const COMMENT_COLS = 'id, post_id, author_uid, text, created_at, deleted_at, parent_id, edited_at, as_page_id';
function noSuchColumn(error) {
  return error && (error.code === '42703' || /reply_to_uid/.test(error.message || ''));
}

// Скільки коментарів під кожним постом — САМІ ЧИСЛА, без текстів.
// Раніше стрічка при кожному відкритті тягнула УСІ коментарі УСІХ постів одним
// запитом лише заради лічильника «N коментарів» під карткою. При 37 коментарях
// це непомітно, при кількох тисячах — сотні кілобайт мобільним інтернетом на
// ровному місці. Тепер: список стрічки → числа (рядок на пост), самі коментарі
// → тільки коли людина відкрила лист (як в Instagram).
export async function fetchPageCommentCounts() {
  if (!supa) return new Map();
  const { data, error } = await supa.from('page_comment_counts').select('post_id, n');
  if (error) { console.warn('[supabase] fetchPageCommentCounts:', error.message); return new Map(); }
  return new Map((data || []).map(r => [r.post_id, r.n]));
}

// Правдиве число коментарів ОДНОГО поста. Лічильник під карткою ведеться кроком
// (+1 на новий, −1 на видалений), а будь-який кроковий лічильник рано чи пізно
// може розійтись із дійсністю — realtime здатен принести подію двічі або не
// принести взагалі, якщо на мить пропав зв'язок. Тому при кожному відкритті листа
// число звіряється з базою: дрейф не накопичується, а сам зникає.
export async function fetchPostCommentCount(postId) {
  if (!supa) return null;
  const { data, error } = await supa.from('page_comment_counts')
    .select('n').eq('post_id', postId).maybeSingle();
  if (error) { console.warn('[supabase] fetchPostCommentCount:', error.message); return null; }
  return data ? data.n : 0;   // немає рядка = під постом немає живих коментарів
}

// Скільки кореневих коментарів тягнемо за раз. Гілка відповідей завжди йде
// ЦІЛОЮ разом зі своїм коренем — інакше «Ще N відповідей» рахувало б неправду.
export const COMMENT_ROOTS_PAGE = 30;

// Коментарі ОДНОГО поста, сторінками по кореневих.
// beforeTs — час найстарішого вже завантаженого кореня («Показати попередні»).
// Повертає { comments, hasMore } — comments уже відсортовані від старіших до
// новіших, тобто в тому порядку, в якому їх малює лист.
// ⚠️ Повертає `error`, а НЕ порожній список: порожньо і «не змогли завантажити» —
// це різні речі, і плутати їх не можна. Порожній список малюється як «Ще немає
// коментарів. Будьте першим!», тож обрив зв'язку на секунду виглядав би для людини
// як зникнення всіх 40 коментарів під постом сільради.
export async function fetchPostComments(postId, { beforeTs = null, limit = COMMENT_ROOTS_PAGE } = {}) {
  if (!supa) return { comments: [], hasMore: false, error: 'Supabase не підключений' };
  const cols = `${COMMENT_COLS}, reply_to_uid`;

  // +1 понад ліміт — дешевий спосіб дізнатись, чи є ще старіші, без окремого count.
  const rootsQ = (c) => {
    let q = supa.from('page_comments').select(c)
      .eq('post_id', postId).is('deleted_at', null).is('parent_id', null)
      .order('created_at', { ascending: false }).limit(limit + 1);
    if (beforeTs) q = q.lt('created_at', beforeTs);
    return q;
  };
  // Читання теж через ядро: коментарі — не дрібниця, а вміст екрана. Одна невдала
  // спроба на слабкому зв'язку раніше давала «не вдалося завантажити» замість
  // 40 коментарів під постом сільради. Повтор читання безпечний за визначенням.
  let rr = await netCall(() => rootsQ(cols), { timeout: NET_TIMEOUT });
  if (noSuchColumn(rr.rawError)) rr = await netCall(() => rootsQ(COMMENT_COLS), { timeout: NET_TIMEOUT });
  if (!rr.ok) return { comments: [], hasMore: false, error: rr.error };
  let roots = rr.data;

  roots = roots || [];
  const hasMore = roots.length > limit;
  if (hasMore) roots = roots.slice(0, limit);
  if (!roots.length) return { comments: [], hasMore: false };

  // ── Відповіді — ВГЛИБ, а не лише перший рівень ──────────────────────────────────
  // 🔴 БАГ, ЯКИЙ ЖИВ ТУТ (Вова 26.07, скріни IMG_3652-3654): запит брав відповіді,
  // чий батько є КОРЕНЕВИМ (`in('parent_id', ids)`), тобто вантажив рівно ДРУГИЙ рівень.
  // Показ коментарів ми того ж дня зробили трирівневим — а завантаження лишилось
  // дворівневим. Наслідок на живому пості: у базі 6 коментарів, на екрані 4;
  // відповідь на відповідь було видно ЛИШЕ тому, хто саме сидів у застосунку і кому
  // її принесла жива синхронізація. Вова написав «?», оновив сторінку — і воно зникло.
  // Тому спускаємось по гілці, доки знаходяться нові: кожен крок — це відповіді на
  // тих, кого щойно дістали.
  // ⚠️ Глибина обмежена навмисно: показ усе одно зводить усе глибше третього рівня до
  // предка 2-го рівня (`commentThreads` у feed.js), а обмеження — це ще й запобіжник
  // від нескінченного циклу на битих даних (батько сам собі предок).
  const MAX_REPLY_DEPTH = 8;
  const replies = [];
  const seen = new Set(roots.map(r => r.id));
  let frontier = roots.map(r => r.id);
  let repCols = cols;
  for (let depth = 0; depth < MAX_REPLY_DEPTH && frontier.length; depth++) {
    const repQ = (c) => supa.from('page_comments').select(c)
      .eq('post_id', postId).is('deleted_at', null).in('parent_id', frontier);
    let rep = await netCall(() => repQ(repCols), { timeout: NET_TIMEOUT });
    // Розгортання без простою: поки міграції `reply_to_uid` немає — тягнемо без неї.
    // Запам'ятовуємо вибір, щоб не бити в ту саму стіну на кожному наступному рівні.
    if (noSuchColumn(rep.rawError)) { repCols = COMMENT_COLS; rep = await netCall(() => repQ(repCols), { timeout: NET_TIMEOUT }); }
    // Відповіді теж вважаємо помилкою, а не «їх просто нема»: показати коріння без
    // гілок — це та сама брехня, тільки тихіша (людина подумає, що їй не відповіли).
    if (!rep.ok) return { comments: [], hasMore: false, error: rep.error };
    // Дедуп за id — і водночас захист від зациклення: те, що вже бачили, не стає
    // новим рубежем, тож цикл гарантовано завершується.
    const fresh = (rep.data || []).filter(r => !seen.has(r.id));
    fresh.forEach(r => seen.add(r.id));
    replies.push(...fresh);
    frontier = fresh.map(r => r.id);
  }

  const comments = [...roots, ...replies]
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  return { comments, hasMore };
}

// ── НОВЕ ПІД МОЇМ У СТРІЧЦІ (22.08) — для капсули на Громаді ─────────────────
//
// 🔴 ЗАВЕДЕНО ТОМУ, ЩО ВСЕРЕДИНІ ЗАСТОСУНКУ ЦЬОГО НЕ КАЗАВ НІХТО. У Стрічці є
// push про коментарі (`send-comment-push`) і є дзвіночок — але дзвіночок це
// ПІДПИСКА на сповіщення, а не список непрочитаного. Тобто людина, яка push не
// дозволила або просто його змахнула, не мала ЖОДНОЇ поверхні, що каже «під
// вашим дописом відповіли». Капсула стала першою.
//
// 🔑 ДВА ДЖЕРЕЛА, ОДИН ЗАПИТ КОЖНЕ — і обидва проходять правило №12 «я створив»:
//   1. коментар під МОЇМ дописом;
//   2. відповідь, адресована особисто мені (`reply_to_uid`), хоч би під чиїм.
// Друге потрібне саме тому, що коментувати чужий допис — теж моя дія: без нього
// найчастіший випадок звичайного жителя (він не веде сторінки, але пише під
// чужими) не давав би капсули ніколи.
//
// ⚠️ Свої коментарі не рахуємо: автор, що сам себе доповнив, відповіді не
// отримав. Це не дрібниця — саме автор допису найчастіше і дописує.
//
// 🛑 ЗАПИТУЄМО ПО СПИСКУ МОЇХ ДОПИСІВ, а не «усі свіжі коментарі + фільтр у
// клієнті». Другий шлях виглядає простішим рівно доти, доки коментарів за період
// менше за ліміт: як тільки їх стане більше, обрізка тихо з'їсть саме мої, і
// капсула мовчки перестане з'являтись — той самий клас мовчазної вади, від якої
// лікували капсулу «ДОДОМУ» (HOT_RULES №12).
export async function fetchMyFeedReplies(uid, sinceMs) {
  if (!supa || !uid) return null;
  const sinceIso = new Date(sinceMs).toISOString();

  // 🔴 22.08, ДРУГИЙ ЗАХІД — «МІЙ ДОПИС» ЦЕ НЕ ЛИШЕ ТОЙ, ДЕ Я АВТОР.
  //
  // Скарга Вови: під дописом, який написав ШІ-агент, а він лише опублікував,
  // push приходив, а капсули не було. Причина: у таких дописів `author_uid`
  // ПОРОЖНІЙ (їх створює не людина), а `send-comment-push` шле не авторові, а
  // РЕДАКТОРАМ СТОРІНКИ. Тобто дві поверхні відповідали на різні питання про ту
  // саму подію: push — «хто відповідає за сторінку», капсула — «хто написав».
  // 🔑 Слова Вови: «це ж одне ціле». Тому капсула тепер питає ТЕ САМЕ, ЩО PUSH:
  // мій допис = я автор **або** я редактор цієї сторінки.
  // ⚠️ Це не послаблення правила №12 «я створив»: опублікувати текст під своїм
  // брендом — така сама моя дія, як написати його руками.
  let myPages = [];
  const pa = await netCall(
    () => supa.from('page_admins').select('page_id').eq('uid', uid),
    { timeout: NET_TIMEOUT },
  );
  // Не змогли дізнатись сторінки — не привід мовчати зовсім: гілка «я автор»
  // однаково працює. Часткова відповідь краща за жодної.
  if (pa.ok) myPages = (pa.data || []).map(r => r.page_id);

  // Мої дописи. `status` фільтруємо із запобіжником — тим самим, що у
  // `fetchPagePosts`: якщо міграція чернеток ще не накотилась, колонки немає, і
  // без відкату запит упав би цілком.
  // 🛑 `.or()` тут НЕ використовуємо: у PostgREST він не приймає `in.(…)` поруч
  // із `is.null` без екранування, і одна помилка синтаксису тихо віддала б
  // ПОРОЖНЬО. Два окремі запити коштують дешевше за мовчазну відмову.
  const myQ = (withStatus, byPages) => {
    let q = supa.from('page_posts').select('id, text, page_id')
      .is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(100);
    q = byPages ? q.in('page_id', myPages) : q.eq('author_uid', uid);
    if (withStatus) q = q.eq('status', 'published');
    return q;
  };
  const тягни = async (byPages) => {
    let r = await netCall(() => myQ(true, byPages), { timeout: NET_TIMEOUT });
    if (noSuchColumn(r.rawError)) r = await netCall(() => myQ(false, byPages), { timeout: NET_TIMEOUT });
    return r;
  };

  const заходи = [тягни(false)];
  if (myPages.length) заходи.push(тягни(true));
  const частини = await Promise.all(заходи);
  if (частини.every(r => !r.ok)) return null;   // «не знаємо» ≠ «нічого немає»

  // Дедуп за id: допис на моїй сторінці, де я ще й автор, приходить двічі.
  const мапаДописів = new Map();
  for (const r of частини) {
    if (!r.ok) continue;
    for (const p of (r.data || [])) if (!мапаДописів.has(p.id)) мапаДописів.set(p.id, p);
  }
  const myPosts = [...мапаДописів.values()];
  const myIds = myPosts.map(p => p.id);

  // Колонки `reply_to_uid` може не бути (та сама міграція, що у `fetchPostComments`).
  // Тоді джерело 2 просто мовчить, а джерело 1 працює — часткова відповідь тут
  // краща за жодної.
  const cols = 'id, post_id, author_uid, text, created_at, reply_to_uid';
  const свіжі = (q) => q.is('deleted_at', null).gt('created_at', sinceIso)
    .neq('author_uid', uid).order('created_at', { ascending: false }).limit(200);

  const запити = [];
  if (myIds.length) {
    запити.push(netCall(
      () => свіжі(supa.from('page_comments').select(cols).in('post_id', myIds)),
      { timeout: NET_TIMEOUT },
    ));
  }
  запити.push(netCall(
    () => свіжі(supa.from('page_comments').select(cols).eq('reply_to_uid', uid)),
    { timeout: NET_TIMEOUT },
  ));

  const відповіді = await Promise.all(запити);
  // Жодне джерело не відповіло — це «не знаємо», а не «нічого немає». Порожній
  // результат тут показав би людині тишу там, де насправді збій мережі.
  if (відповіді.every(r => !r.ok)) return null;

  // Дедуп за id: відповідь мені під МОЇМ же дописом приходить обома запитами.
  const усі = new Map();
  for (const r of відповіді) {
    if (!r.ok) continue;
    for (const c of (r.data || [])) {
      if (c && c.id != null && !усі.has(c.id)) усі.set(c.id, c);
    }
  }
  return { myPosts, comments: [...усі.values()] };
}

// replyToUid — кому адресована відповідь («Віктор,» на початку + сповіщення саме йому).
// Зберігаємо посилання на людину, а не текст: імʼя підставляється живим при показі.
// Підробити не вийде — RLS пускає лише того, хто вже писав під ЦИМ постом
// (scripts/supabase_comment_push.sql), інакше згадка стала б каналом для спаму.
// asPageId — від чийого імені надсилаємо: null = від себе, id сторінки = від спільноти.
// 🛑 Право сюди НЕ перевіряємо навмисно. Його перевіряє політика вставки
// (`can_edit_page(as_page_id)` + «as_page_id = page_id цього поста»), тобто одне
// джерело правди. Клієнтська перевірка стала б другою копією правила, а копії
// розходяться — у проєкті це вже коштувало двох списків антиспаму.
export async function addPageComment(postId, uid, text, parentId = null, replyToUid = null, asPageId = null) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  const base = { post_id: postId, author_uid: uid, text, parent_id: parentId };
  if (asPageId != null) base.as_page_id = asPageId;
  const send = (row) => supa.from('page_comments').insert(row).select().single();
  // ⚠️ У `page_comments` клієнтського ключа (`client_tag`) НЕМА — на відміну від чату,
  // груп і коментарів Дошки. Тобто звіряти нічим, і повтор дав би другий однаковий
  // коментар під постом. Тому рівно одна спроба + людський текст. Ключ у цій таблиці —
  // окремий захід (потребує міграції бази, тобто рук Вови).
  let r = await netInsert(() => send(replyToUid ? { ...base, reply_to_uid: replyToUid } : base));
  // Те саме розгортання без простою, що у fetchPostComments: поки міграції немає,
  // відповідь має надсилатись — просто без згадки. Інакше кнопка «Відповісти» була б
  // зламана в усіх до моменту, поки Вова накатає SQL.
  if (replyToUid && noSuchColumn(r.rawError)) r = await netInsert(() => send(base));
  if (r.ok) return { ok: true, comment: r.data };
  // `gone` — окремий випадок, а не просто помилка: батьківський коментар зник, поки
  // людина писала відповідь. Викликачу цього замало знати текстом — йому треба
  // перемалювати гілку, інакше людина далі дивиться на коментар, якого вже немає.
  const gone = /parent_deleted/i.test(String(r.rawError?.message || r.raw || ''));
  return { ok: false, error: r.error, gone };
}

// Правка свого коментаря. Шлемо ЛИШЕ текст: позначку «змінено» (edited_at) ставить
// сама база у тригері page_comments_guard_update — тож підробити «не редаговано»
// неможливо, а клієнту нема чого про неї знати. Там же текст проганяється через
// антиспам: до 25.07 редагування було обхідним шляхом для матюків.
export async function editPageComment(commentId, text) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  const r = await netCall(() => supa.from('page_comments')
    .update({ text }).eq('id', commentId).select(`${COMMENT_COLS}, reply_to_uid`).single());
  return r.ok ? { ok: true, comment: r.data } : { ok: false, error: r.error };
}

// Мʼяке видалення свого коментаря (RLS pcom update — автор або адмін сторінки).
export async function deletePageComment(commentId) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  const r = await netCall(() => supa.from('page_comments')
    .update({ deleted_at: new Date().toISOString() }).eq('id', commentId));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// Лайки коментарів → Map comment_id → { count, my }. userKey = uid (тільки авторизовані).
// scripts/supabase_page_comment_reactions.sql.
export async function fetchPageCommentReactions(userKey) {
  if (!supa) return new Map();
  const { data, error } = await supa.from('page_comment_reactions').select('comment_id, user_id');
  if (error) { console.warn('[supabase] fetchPageCommentReactions:', error.message); return new Map(); }
  const map = new Map();
  for (const r of (data || [])) {
    if (!map.has(r.comment_id)) map.set(r.comment_id, { count: 0, my: false });
    const e = map.get(r.comment_id); e.count++;
    if (r.user_id === userKey) e.my = true;
  }
  return map;
}

// Поставити/зняти лайк коментаря (on=true → додати).
export async function setPageCommentReaction(commentId, uid, on) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  if (!on) {
    const r = await netCall(() => supa.from('page_comment_reactions').delete()
      .eq('comment_id', commentId).eq('user_id', uid));
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
  const r = await netCall(() => supa.from('page_comment_reactions')
    .upsert({ comment_id: commentId, user_id: uid }, { onConflict: 'comment_id,user_id' }));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// Жива підписка на лайки коментарів (лічильник оновлюється у всіх наживо).
export function subscribePageCommentReactions(onChange) {
  if (!supa) return () => {};
  const ch = supa.channel('page-comment-reactions-watch')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'page_comment_reactions' },
        payload => onChange(payload))
    .subscribe();
  return () => supa.removeChannel(ch);
}

// ── ХТО З ЦИХ ЛЮДЕЙ У КОМАНДІ СТОРІНКИ (25.08) — для бейджа «Адмін» ─────────
//
// 🔴 НАВІЩО ОКРЕМИЙ ШЛЯХ. Політика `page_admins` віддає лише ВЛАСНИЙ рядок
// (`uid = auth.uid() or is_admin()`), а `list_page_moderators()` вимагає власника
// сторінки. Тобто намалювати «Адмін» біля чужого імені не було з чого взагалі —
// читач не може дізнатись, хто веде спільноту.
//
// 🔑 Політику НЕ відкриваємо: `using (true)` віддало б команду будь-якої сторінки
// одним запитом. Замість цього функція бази відповідає на вузьке питання — «хто
// з ЦИХ людей у команді». Спитати можна лише про тих, хто вже є на екрані;
// вивантажити список цілком — не можна. Той самий підхід, що з лайками постів
// 09.08, де гість дістав ЧИСЛА замість рядків із чужими uid.
//
// ⚠️ Чесно: це підвищена планка, а не стіна. Хто активно коментує — того можна
// перевірити. Але одним запитом команду не забрати, і зріз у 200 uid у самій
// функції не дає перебирати базу пачками.
//
// 🛑 UUID-ФІЛЬТР ОБОВʼЯЗКОВИЙ (те саме правило, що для `.in('uid', …)`): аргумент
// оголошено як `uuid[]`, і один сторонній рядок у масиві поклав би ВЕСЬ запит —
// тобто бейджі зникли б у всіх через один битий запис.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function fetchPageTeam(pageId, uids) {
  if (!supa || pageId == null) return new Set();
  const clean = [...new Set((uids || []).filter(u => typeof u === 'string' && UUID_RE.test(u)))];
  if (!clean.length) return new Set();
  const { data, error } = await supa.rpc('page_team_flags', { p_page_id: pageId, p_uids: clean });
  // Бейдж — це прикраса поверх імені, а не вміст екрана: не змогли спитати —
  // показуємо коментарі без бейджів, а не порожній лист.
  if (error) { console.warn('[supabase] page_team_flags:', error.message); return new Set(); }
  return new Set((data || []).map(r => (typeof r === 'string' ? r : r.page_team_flags || r.uid)));
}

// Мої сторінки (де я власник/адмін) → Set page_id — для показу поля «написати пост».
export async function fetchMyEditablePageIds() {
  if (!supa) return new Set();
  const { data, error } = await supa.from('page_admins').select('page_id');
  if (error) { console.warn('[supabase] page_admins:', error.message); return new Set(); }
  return new Set((data || []).map(r => r.page_id));
}

// Створити пост сторінки (від імені сторінки; author_uid = людина-автор для підпису).
// imageUrls — масив URL-ів фото (кілька фото як у FB/IG). image_url лишаємо для
// зворотної сумісності (перше фото), щоб старий рендер теж бачив.
// event — опційно { event_date, event_time, event_location }: якщо є event_date,
// пост стає ПОДІЄЮ (таб «Події» на каналі + плашка на картці). Порожні → null.
// showAuthor — від чийого імені пост: true = під текстом видно підпис автора-людини,
// false = суто від імені спільноти (вибір у композері, крок 6).
// ⬇️ Записи «Стрічки» ходять через netCall: обрив зв'язку → тихий повтор, а людині
//    у будь-якому разі — людський текст. Поля `select` не міняв.
const POST_COLS = 'id, page_id, author_uid, text, image_url, image_urls, show_author, event_date, event_time, event_location, created_at, pinned_at, status, pages(name, avatar_url)';
// Те саме плюс синя галочка спільноти. Окремим рядком, а не аргументом: у місцях,
// де колонки `official` може ще не бути, потрібен запасний запит БЕЗ неї, і два
// готові рядки читаються краще за складання select-а на льоту.
const POST_COLS_OFFICIAL = 'id, page_id, author_uid, text, image_url, image_urls, show_author, event_date, event_time, event_location, created_at, pinned_at, status, pages(name, avatar_url, official)';

export async function createPagePost(pageId, uid, text, imageUrls = [], event = {}, showAuthor = true) {
  if (!supa) return { ok: false, error: 'Немає з\'єднання з базою' };
  const arr = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : (imageUrls ? [imageUrls] : []);
  const row = {
    page_id: pageId, author_uid: uid, text, image_urls: arr, image_url: arr[0] || null,
    show_author: showAuthor !== false,
    event_date:     event.event_date     || null,
    event_time:     event.event_time     || null,
    event_location: event.event_location || null,
  };
  // ⚠️ Було `netCall` (з повтором) — а це ВСТАВКА без клієнтського ключа. Тобто при
  // обриві на зворотному шляху міг з'явитись ДРУГИЙ пост на сторінці. `netInsert` без
  // `verify` робить рівно одну спробу і дає людський текст.
  const r = await netInsert(() => supa.from('page_posts').insert(row).select(POST_COLS).single());
  return r.ok ? { ok: true, post: r.data } : { ok: false, error: r.error };
}

// Оновити пост (текст/фото) — власник/адмін сторінки (RLS pposts update = can_edit_page).
export async function updatePagePost(postId, patch) {
  if (!supa) return { ok: false, error: 'Немає з\'єднання з базою' };
  const r = await netCall(() => supa.from('page_posts').update(patch).eq('id', postId).select(POST_COLS).single());
  return r.ok ? { ok: true, post: r.data } : { ok: false, error: r.error };
}

// Закріпити / відкріпити пост УСЕРЕДИНІ його спільноти (рішення Вови 27.07).
// Права окремо не перевіряємо — це робить RLS: політика `pposts update` пускає лише
// туди, де `can_edit_page(page_id)`. Тобто закріпити щось у ЧУЖІЙ спільноті неможливо
// навіть в обхід застосунку, і клієнтська перевірка була б лише другою копією правила.
// Порядок серед закріплених дає сам час: свіжіше закріплення — вище.
export async function setPagePostPinned(postId, pinned) {
  if (!supa) return { ok: false, error: 'Немає з\'єднання з базою' };
  const r = await netCall(() => supa.from('page_posts')
    .update({ pinned_at: pinned ? new Date().toISOString() : null })
    .eq('id', postId).select(POST_COLS).single());
  return r.ok ? { ok: true, post: r.data } : { ok: false, error: r.error };
}

// М'яке видалення поста (власник/адмін сторінки).
export async function deletePagePost(postId) {
  if (!supa) return { ok: false, error: 'Немає з\'єднання з базою' };
  const r = await netCall(() => supa.from('page_posts')
    .update({ deleted_at: new Date().toISOString() }).eq('id', postId));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// Оновити сторінку (аватар/банер/тема) — власник/адмін (RLS pages update).
export async function updatePage(pageId, patch) {
  if (!supa) return { ok: false, error: 'Немає з\'єднання з базою' };
  const r = await netCall(() => supa.from('pages').update(patch).eq('id', pageId)
    .select('id, name, theme, avatar_url, banner_url, is_system').single());
  return r.ok ? { ok: true, page: r.data } : { ok: false, error: r.error };
}

// Дзвіночок: мої підписки → Set page_id.
export async function fetchMySubscriptions() {
  if (!supa) return new Set();
  const { data, error } = await supa.from('page_subscriptions').select('page_id');
  if (error) return new Set();
  return new Set((data || []).map(r => r.page_id));
}
export async function setPageSubscription(pageId, uid, on) {
  if (!supa) return { ok: false };
  if (!on) {
    const r = await netCall(() => supa.from('page_subscriptions').delete()
      .eq('page_id', pageId).eq('uid', uid));
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }
  const r = await netCall(() => supa.from('page_subscriptions')
    .upsert({ page_id: pageId, uid }, { onConflict: 'page_id,uid' }));
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

// Push підписникам сторінки про новий пост (Edge Function send-page-push).
//
// ⚠️ Це ПІДСТРАХОВКА, а не основний шлях. Основний — тригер бази `trg_notify_new_page_post`
// (scripts/supabase_page_push.sql): він спрацьовує на самій вставці поста, тож сповіщення
// йде навіть коли браузер автора закрився / впала мережа / пост створено з адмінки.
// Обидва шляхи ведуть в одну функцію, а журнал `page_push_log` не дає надіслати дубль:
// хто прийшов другим — тихо виходить. Тому лишаємо обидва — це дешева надлишковість.
//
// Публікацію не блокує (fire-and-forget), але результат більше не мовчить: раніше
// провал бачив лише той, хто відкрив консоль, і «сповіщення не прийшло» неможливо
// було відрізнити від «функція взагалі не задеплоєна».
export function notifyNewPagePost(postId) {
  if (!supa || !postId) return;
  supa.functions.invoke('send-page-push', { body: { post_id: postId } })
    .then(({ data, error }) => {
      if (error) { console.warn('[push] send-page-push помилка:', error.message); return; }
      // reason:'already sent' — нормально: тригер бази нас випередив.
      console.info('[push] send-page-push:', JSON.stringify(data));
    })
    .catch(e => console.warn('[push] send-page-push впала:', e?.message));
}

// ── Команда сторінки «Стрічки»: власник + модератори (крок 5 потоку 24.07) ───
// Усі три — RPC із перевіркою прав НА СЕРВЕРІ (scripts/supabase_page_moderators.sql):
// керувати може лише власник сторінки або глобальний адмін. Клієнту не довіряємо.

// Список команди. Повертає [] якщо прав нема (сервер кине помилку — глушимо тихо).
export async function fetchPageModerators(pageId) {
  if (!supa) return [];
  const { data, error } = await supa.rpc('list_page_moderators', { p_page_id: pageId });
  if (error) { console.warn('[supabase] list_page_moderators:', error.message); return []; }
  return data || [];
}

// Додати за поштою. Сервер відповідає одним із:
//   'ok'        — людину додано в команду;
//   'not_found' — акаунта з такою поштою ще немає (права даємо лише зареєстрованим);
//   'already'   — вона вже в команді цієї сторінки;
//   'bad_email' — пошта введена неправильно;
//   'error'     — технічний збій (деталі в консолі).
export async function addPageModerator(pageId, email) {
  if (!supa) return 'error';
  // Встановлення стану — повтор безпечний: той самий модератор двічі не додасться.
  const r = await netCall(() => supa.rpc('add_page_moderator', { p_page_id: pageId, p_email: email }));
  return r.ok ? (r.data || 'error') : 'error';
}

// Прибрати зі сторінки. 'ok' | 'owner_protected' (власника прибрати не можна) | 'error'.
export async function removePageModerator(pageId, uid) {
  if (!supa) return 'error';
  const r = await netCall(() => supa.rpc('remove_page_moderator', { p_page_id: pageId, p_uid: uid }));
  return r.ok ? (r.data || 'error') : 'error';
}
