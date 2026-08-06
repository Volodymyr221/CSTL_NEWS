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

export function getSupabase() {
  return supa;
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
export async function fetchAllComments() {
  if (!supa) return new Map();
  const { data, error } = await supa
    .from('comments')
    .select('id, post_id, author, text, created_at, sender_uid, reply_to_id, edited_at, deleted_at, client_tag')
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
// text='' бо колонка може бути NOT NULL; UI орієнтується на deleted_at.
export async function deleteComment(commentId) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const r = await netCall(() => supa.from('comments')
    .update({ deleted_at: new Date().toISOString(), text: '' })
    .eq('id', commentId).select().single());
  return r.ok ? { ok: true, comment: r.data } : { ok: false, error: r.error };
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

export async function uploadPhotoToStorage(blob, folder = '', bucket = PUBLIC_BUCKET) {
  if (!supa) return { url: null, path: null, error: 'Supabase не підключений' };
  if (!blob) return { url: null, path: null, error: 'Порожній blob' };

  const ext  = (blob.type && blob.type.split('/')[1]) || 'jpg';
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${folder}${getAnonId()}/${Date.now()}-${rand}.${ext}`;

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

// Синхронний доступ до кешу — для рендеру «зараз» (порожньо → літера-fallback).
export function cachedAvatar(uid) {
  return uid ? (_avatarCache.get(uid) || '') : '';
}

// Живе імʼя профілю за uid (порожньо → лишаємо вморожене імʼя з рядка).
export function cachedName(uid) {
  return uid ? (_nameCache.get(uid) || '') : '';
}

// Спільні хелпери гідрації імен (для board / board-discussions — щоб не дублювати).
// nameUid → атрибут-маркер, який hydrateNames знайде і підмінить на живе імʼя.
// liveName → одразу підставляє вже кешоване живе імʼя (щоб не мигало), інакше
// вморожений текст, інакше fallback ('Житель' в обговореннях / 'анонімно' на дошці).
export function nameUid(uid) {
  return uid ? ` data-name-uid="${escapeHtml(uid)}"` : '';
}
export function liveName(name, uid, fallback = 'Житель') {
  return escapeHtml(cachedName(uid) || name || fallback);
}

// Батч-підвантаження аватарів за списком uid. Тягне лише ще невідомі, заповнює кеш.
export async function fetchAvatars(uids) {
  const need = [...new Set(uids)].filter(u => u && !_avatarCache.has(u));
  if (!supa || !need.length) return;
  try {
    const { data, error } = await supa.rpc('get_avatars', { uids: need });
    if (error) { need.forEach(u => _avatarCache.set(u, '')); return; }  // RPC нема / помилка → fallback
    (data || []).forEach(r => { if (r && r.uid) { _avatarCache.set(r.uid, r.avatar_url || ''); if (r.name) _nameCache.set(r.uid, r.name); } });
    need.forEach(u => { if (!_avatarCache.has(u)) _avatarCache.set(u, ''); });  // негативи (нема профілю)
  } catch (_) { need.forEach(u => _avatarCache.set(u, '')); }
}

// Прогресивна гідрація: після вставки HTML знаходить АВАТАР-КРУЖЕЧКИ (маркер
// data-av-circle від avatarCircle), підтягує їхні фото і замінює літеру на <img>
// для тих, у кого фото є. Літера-first → фото-коли-готове (не блокує рендер;
// data-av-done проти повтору).
// ВАЖЛИВО: фільтр саме по [data-av-circle], а НЕ по [data-av-uid]. Останній мають
// також не-аватарні таргети тапу (напр. `.pm-head-titles` — ім'я в шапці чату для
// відкриття картки профілю); вставка <img> у них давала «квадратне фото» на весь
// екран, бо в них немає фіксованого розміру/overflow (баг, Вова 17.07).
export async function hydrateAvatars(root) {
  if (!root || !root.querySelectorAll) return;
  const els = [...root.querySelectorAll('[data-av-circle][data-av-uid]')].filter(e => !e.dataset.avDone);
  if (!els.length) return;
  await fetchAvatars(els.map(e => e.dataset.avUid));
  els.forEach(el => {
    el.dataset.avDone = '1';
    const url = cachedAvatar(el.dataset.avUid);
    if (!url) return;                       // фото нема → лишаємо літеру
    const base = el.classList[0];           // базовий клас місця (bd-avatar / pm-avatar)
    el.classList.add(base + '--img');
    el.style.background = 'none';
    el.innerHTML = `<img src="${escapeHtml(url)}" alt="" loading="lazy">`;
  });
}

// Прогресивна гідрація ІМЕН (близнюк hydrateAvatars): знаходить елементи з
// data-name-uid і підмінює вморожене імʼя (денормалізоване в рядок повідомлення)
// на ЖИВЕ імʼя з профілю за uid. Так перейменування акаунту відображається і на
// старих повідомленнях — усі репліки одного uid показують одне поточне імʼя.
// Той самий батч-RPC що аватари (get_avatars повертає name). Fail-soft: імені
// нема в кеші → лишаємо текст як був. data-name-done проти повтору.
export async function hydrateNames(root) {
  if (!root || !root.querySelectorAll) return;
  const els = [...root.querySelectorAll('[data-name-uid]')].filter(e => !e.dataset.nameDone);
  if (!els.length) return;
  await fetchAvatars(els.map(e => e.dataset.nameUid));
  els.forEach(el => {
    el.dataset.nameDone = '1';
    const nm = cachedName(el.dataset.nameUid);
    if (nm) el.textContent = nm;            // жива назва профілю перекриває вморожену
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

// Пари учасників по тредах → [{id, author_uid, buyer_uid}] БЕЗ join оголошень.
// 🔴 29.07: бейдж непрочитаних має рахувати РОЗМОВИ (людей), а не треди — інакше одна
// людина з двома оголошеннями давала б «2» на бейджі й ОДИН рядок у списку, тобто
// число нікуди не вело. Окрема легка вибірка, бо `fetchMyThreads` тягне ще й пости,
// а бейдж оновлюється часто (після кожного прочитання і кожного push).
export async function fetchThreadPairs(uid) {
  if (!supa || !uid) return [];
  const { data, error } = await supa.from('threads')
    .select('id, author_uid, buyer_uid')
    .or(`author_uid.eq.${uid},buyer_uid.eq.${uid}`);
  if (error) { console.warn('[supabase] fetchThreadPairs:', error.message); return []; }
  return data || [];
}

// Зберегти push-пристрій під акаунт (для чат-сповіщень).
export async function saveUserPushDevice({ uid, endpoint, p256dh, auth_key }) {
  if (!supa || !uid) return { ok: false };
  const r = await netCall(() => supa.from('user_push_devices')
    .upsert({ uid, endpoint, p256dh, auth_key }, { onConflict: 'uid,endpoint' }));
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

// Зберігає push-підписку у Supabase. При повторному виклику — upsert оновлює.
// payload: { user_uuid, endpoint, p256dh, auth_key, route_id, route_name,
//            boarding_stop, alighting_stop, track_date, dep_time }
// Це ВСТАВКА, але повтор тут безпечний — і не через звірку, а через саму базу:
// на рядок стоїть унікальність, тож друга спроба впаде у 23505, який ми й так
// вважаємо успіхом. Тобто дубля підписки не буде за побудовою.
// Чому це важливо: обрив саме тут = людина бачить увімкнений дзвіночок, а сервер
// про рейс не знає, і сповіщення не прийде. Тихий збій, який помічають надто пізно.
export async function savePushSubscription(payload) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const r = await netCall(() => supa.from('push_subscriptions').insert(payload));
  if (r.ok) return { ok: true };
  // 23505 = unique_violation (порушення унікальності) — підписка вже є, це нормально
  if (r.rawError?.code === '23505') return { ok: true };
  return { ok: false, error: r.error };
}

// Видаляє конкретний рядок підписки (при знятті відстеження рейсу).
// Повертає { ok } симетрично до savePushSubscription — щоб виклик міг
// зробити повтор і не лишити висячу серверну підписку при збої мережі.
export async function deletePushSubscription(endpoint, routeId, trackDate) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const r = await netCall(() => supa.from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
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
export function logEvent(visitorId, type, { tab = null, meta = null } = {}) {
  if (!supa || !visitorId) return;
  supa.from('analytics_events')
    .insert({ visitor_id: visitorId, event_type: type, tab, meta })
    .then(({ error }) => { if (error) console.warn('[supabase] logEvent:', error.message); });
}

// Агрегати для дашборду адмінки (лише is_admin() — див. RLS). period: кількість
// днів назад ('all' → без фільтру дат). Повертає null при помилці/непідключенні.
export async function fetchAnalyticsSummary(periodDays = 7) {
  if (!supa) return null;
  let q = supa.from('analytics_events').select('visitor_id, event_type, tab, meta, created_at');
  if (periodDays !== 'all') {
    const since = new Date(Date.now() - periodDays * 86400000).toISOString();
    q = q.gte('created_at', since);
  }
  const { data, error } = await q.limit(20000);
  if (error) {
    console.warn('[supabase] fetchAnalyticsSummary:', error.message);
    return null;
  }
  const rows = data || [];
  const uniqueVisitors = new Set(rows.map(r => r.visitor_id)).size;
  const byTab = {};
  const byDevice = {};
  const byHour = {};
  let pwaInstalls = 0;
  for (const r of rows) {
    if (r.event_type === 'tab_view' && r.tab) byTab[r.tab] = (byTab[r.tab] || 0) + 1;
    if (r.event_type === 'pwa_install') pwaInstalls++;
    const device = r.meta?.device;
    if (device) byDevice[device] = (byDevice[device] || 0) + 1;
    const hour = new Date(r.created_at).getHours();
    byHour[hour] = (byHour[hour] || 0) + 1;
  }
  return { totalEvents: rows.length, uniqueVisitors, byTab, byDevice, byHour, pwaInstalls };
}


// ============================================================================
// «СТРІЧКА» — сторінки-канали громади (pages / page_posts / page_reactions /
// page_comments / page_subscriptions). Дата-шар; RLS у scripts/supabase_pages.sql.
// ============================================================================

// Усі сторінки-канали (для кружечків + шапок карток).
export async function fetchPages() {
  if (!supa) return [];
  const { data, error } = await supa.from('pages')
    .select('id, name, theme, avatar_url, banner_url, is_system, sort_order')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) { console.warn('[supabase] fetchPages:', error.message); return []; }
  return data || [];
}

// Пости стрічки: усіх сторінок (pageId=null) або однієї. Невидалені, найсвіжіші.
// pages(name, avatar_url) — вкладений join за FK page_posts.page_id → pages.id.
export async function fetchPagePosts(pageId = null, limit = 60) {
  if (!supa) return [];
  let q = supa.from('page_posts')
    .select('id, page_id, author_uid, text, image_url, image_urls, show_author, event_date, event_time, event_location, created_at, pinned_at, pages(name, avatar_url)')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (pageId != null) q = q.eq('page_id', pageId);
  const { data, error } = await q;
  if (error) { console.warn('[supabase] fetchPagePosts:', error.message); return []; }
  return data || [];
}

// Лайки постів → Map post_id → { count, my }. userKey = uid або anonId.
export async function fetchPageReactions(userKey) {
  if (!supa) return new Map();
  const { data, error } = await supa.from('page_reactions').select('post_id, user_id');
  if (error) { console.warn('[supabase] fetchPageReactions:', error.message); return new Map(); }
  const map = new Map();
  for (const r of (data || [])) {
    if (!map.has(r.post_id)) map.set(r.post_id, { count: 0, my: false });
    const e = map.get(r.post_id); e.count++;
    if (r.user_id === userKey) e.my = true;
  }
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
const COMMENT_COLS = 'id, post_id, author_uid, text, created_at, deleted_at, parent_id, edited_at';
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

// replyToUid — кому адресована відповідь («Віктор,» на початку + сповіщення саме йому).
// Зберігаємо посилання на людину, а не текст: імʼя підставляється живим при показі.
// Підробити не вийде — RLS пускає лише того, хто вже писав під ЦИМ постом
// (scripts/supabase_comment_push.sql), інакше згадка стала б каналом для спаму.
export async function addPageComment(postId, uid, text, parentId = null, replyToUid = null) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  const base = { post_id: postId, author_uid: uid, text, parent_id: parentId };
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
const POST_COLS = 'id, page_id, author_uid, text, image_url, image_urls, show_author, event_date, event_time, event_location, created_at, pinned_at, pages(name, avatar_url)';

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
