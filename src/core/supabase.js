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
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  const { data, error } = await supa.rpc('submit_board_post', { payload });
  if (error) {
    console.warn('[supabase] submitPost error:', error);
    return { ok: false, error: error.message };
  }
  if (data && data.ok === false) {
    return { ok: false, error: data.error || 'не вдалось надіслати' };
  }
  return { ok: true, status: (data && data.status) || 'pending' };
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
  const { error } = await supa.from('posts').insert(row);
  if (error) {
    console.warn('[supabase] submitDiscussion error:', error);
    return { ok: false, error: error.message };
  }
  return { ok: true };
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
  if (emoji == null) {
    const { error } = await supa.from('reactions')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }
  // upsert через onConflict (post_id, user_id) — або INSERT, або UPDATE emoji
  const { error } = await supa.from('reactions')
    .upsert({ post_id: postId, user_id: userId, emoji }, { onConflict: 'post_id,user_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
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
  try {
    const { data, error } = await withTimeout(supa.from('comments').insert(row).select().single());
    if (error) return { ok: false, error: error.message };
    return { ok: true, comment: data };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Редагування свого коментаря «Обговорень» (текст + позначка edited_at)
export async function editComment(commentId, text) {
  if (!supa) return { ok: false, error: 'no-supa' };
  try {
    const { data, error } = await withTimeout(supa.from('comments')
      .update({ text, edited_at: new Date().toISOString() })
      .eq('id', commentId).select().single());
    if (error) return { ok: false, error: error.message };
    return { ok: true, comment: data };
  } catch (e) { return { ok: false, error: e.message }; }
}

// М'яке видалення коментаря (лишаємо рядок, ставимо deleted_at → плейсхолдер у UI).
// text='' бо колонка може бути NOT NULL; UI орієнтується на deleted_at.
export async function deleteComment(commentId) {
  if (!supa) return { ok: false, error: 'no-supa' };
  try {
    const { data, error } = await withTimeout(supa.from('comments')
      .update({ deleted_at: new Date().toISOString(), text: '' })
      .eq('id', commentId).select().single());
    if (error) return { ok: false, error: error.message };
    return { ok: true, comment: data };
  } catch (e) { return { ok: false, error: e.message }; }
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
export async function uploadPhotoToStorage(blob, folder = '') {
  if (!supa) return { url: null, error: 'Supabase не підключений' };
  if (!blob) return { url: null, error: 'Порожній blob' };

  const ext  = (blob.type && blob.type.split('/')[1]) || 'jpg';
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${folder}${getAnonId()}/${Date.now()}-${rand}.${ext}`;

  const { error: uploadError } = await supa.storage
    .from('community-photos')
    .upload(path, blob, {
      contentType: blob.type || 'image/jpeg',
      cacheControl: '31536000',  // 1 рік — фото незмінне
      upsert: false,
    });

  if (uploadError) {
    console.warn('[supabase] uploadPhotoToStorage error:', uploadError.message);
    return { url: null, error: uploadError.message };
  }

  const { data } = supa.storage.from('community-photos').getPublicUrl(path);
  return { url: data?.publicUrl || null, error: null };
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
export async function bumpPost(postId) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const { data, error } = await supa.rpc('bump_post', { p_id: postId });
  if (error) { console.warn('[supabase] bumpPost:', error.message); return { ok: false, error: error.message }; }
  return data || { ok: false, error: 'no_data' };
}

// Завершити власний пост (status=closed → зникає з дошки, лишається в архіві).
export async function closePost(postId) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const { data, error } = await supa.rpc('close_post', { p_id: postId });
  if (error) { console.warn('[supabase] closePost:', error.message); return { ok: false, error: error.message }; }
  return data || { ok: false, error: 'no_data' };
}

// Видалити власний пост (CASCADE прибере треди/коментарі/реакції/закладки).
export async function deleteMyPost(postId) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const { data, error } = await supa.rpc('delete_my_post', { p_id: postId });
  if (error) { console.warn('[supabase] deleteMyPost:', error.message); return { ok: false, error: error.message }; }
  return data || { ok: false, error: 'no_data' };
}

// Повернути завершене оголошення в активні (closed → published).
// bumped_at не змінюється → той самий час підняття/кулдауну, що був до завершення.
export async function restorePost(postId) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const { data, error } = await supa.rpc('restore_post', { p_id: postId });
  if (error) { console.warn('[supabase] restorePost:', error.message); return { ok: false, error: error.message }; }
  return data || { ok: false, error: 'no_data' };
}

// Д-3: редагувати власне оголошення через RPC update_board_post (SECURITY DEFINER,
// перевірка owner_uid = auth.uid() на сервері — базова RLS дозволяє UPDATE лише
// адмінам). Статус за довірою: trusted-published лишається published, звичайний
// published → pending (повторна модерація). Потребує scripts/supabase_board_edit.sql.
// Повертає { ok:true, status } або { ok:false, error }.
export async function updateBoardPost(postId, payload) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  const { data, error } = await supa.rpc('update_board_post', { p_id: postId, payload });
  if (error) {
    console.warn('[supabase] updateBoardPost error:', error);
    return { ok: false, error: error.message };
  }
  if (data && data.ok === false) {
    return { ok: false, error: data.error || 'не вдалось зберегти' };
  }
  return { ok: true, status: (data && data.status) || 'pending' };
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

export async function createGroup({ name, description = null, type = 'locality', emoji = null, gradient = null }) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const { data, error } = await supa.rpc('create_group', {
    p_name: name, p_description: description, p_type: type, p_emoji: emoji, p_gradient: gradient,
  });
  if (error) { console.warn('[supabase] createGroup:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, id: data };
}

// requiresApproval: true → посилання зі схваленням адміна; false → миттєвий вступ
export async function createGroupInvite(groupId, requiresApproval = false) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const { data, error } = await supa.rpc('create_group_invite', { p_gid: groupId, p_requires_approval: requiresApproval });
  if (error) { console.warn('[supabase] createGroupInvite:', error.message); return { ok: false, error: error.message }; }
  return { ok: true, token: data };
}

export async function getGroupByInvite(token) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const { data, error } = await supa.rpc('get_group_by_invite', { p_token: token });
  if (error) { console.warn('[supabase] getGroupByInvite:', error.message); return { ok: false, error: error.message }; }
  return data || { ok: false, error: 'no_data' };
}

export async function joinGroupByToken(token) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const { data, error } = await supa.rpc('join_group_by_token', { p_token: token });
  if (error) { console.warn('[supabase] joinGroupByToken:', error.message); return { ok: false, error: error.message }; }
  return data || { ok: false, error: 'no_data' };
}

export async function leaveGroup(groupId) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const { data, error } = await supa.rpc('leave_group', { p_gid: groupId });
  if (error) { console.warn('[supabase] leaveGroup:', error.message); return { ok: false, error: error.message }; }
  return data || { ok: false, error: 'no_data' };
}

export async function approveMember(groupId, uid) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const { data, error } = await supa.rpc('approve_member', { p_gid: groupId, p_uid: uid });
  if (error) { console.warn('[supabase] approveMember:', error.message); return { ok: false, error: error.message }; }
  return data || { ok: false, error: 'no_data' };
}

export async function rejectMember(groupId, uid) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const { data, error } = await supa.rpc('reject_member', { p_gid: groupId, p_uid: uid });
  if (error) { console.warn('[supabase] rejectMember:', error.message); return { ok: false, error: error.message }; }
  return data || { ok: false, error: 'no_data' };
}

// Передати власника групи іншому учаснику (потім старий власник може вийти)
export async function transferGroupOwner(groupId, uid) {
  if (!supa) return { ok: false, error: 'no_supa' };
  const { data, error } = await supa.rpc('transfer_group_owner', { p_gid: groupId, p_uid: uid });
  if (error) { console.warn('[supabase] transferGroupOwner:', error.message); return { ok: false, error: error.message }; }
  return data || { ok: false, error: 'no_data' };
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
  try {
    const { data, error } = await withTimeout(supa.from('chat_group_messages').insert(row).select().single());
    if (error) return { ok: false, error: error.message };
    // Push усім учасникам групи ≠ відправник (не блокуємо UI — помилка пуша не валить відправку)
    supa.functions.invoke('send-group-push', { body: { message_id: data.id } })
      .catch(e => console.warn('[supabase] send-group-push:', e?.message));
    return { ok: true, message: data };
  } catch (e) { return { ok: false, error: (e && e.message) || 'timeout' }; }
}

export async function editGroupMessage(messageId, text) {
  if (!supa) return { ok: false, error: 'no-supa' };
  try {
    const { data, error } = await withTimeout(supa.from('chat_group_messages')
      .update({ text, edited_at: new Date().toISOString() })
      .eq('id', messageId).select().single());
    if (error) return { ok: false, error: error.message };
    return { ok: true, message: data };
  } catch (e) { return { ok: false, error: (e && e.message) || 'timeout' }; }
}

export async function deleteGroupMessage(messageId) {
  if (!supa) return { ok: false, error: 'no-supa' };
  try {
    const { data, error } = await withTimeout(supa.from('chat_group_messages')
      .update({ deleted_at: new Date().toISOString(), text: null, photo_url: null })
      .eq('id', messageId).select().single());
    if (error) return { ok: false, error: error.message };
    return { ok: true, message: data };
  } catch (e) { return { ok: false, error: (e && e.message) || 'timeout' }; }
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
    .select('*, post:posts(id, title, text, category, photos, author, contact, location, published_at, created_at)')
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
  try {
    const { error } = await withTimeout(
      supa.from('thread_user_state').upsert(row, { onConflict: 'uid,thread_id' })
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Знайти або створити тред покупця на оголошенні. authorUid = власник посту.
// authorName/buyerName зберігаємо денормалізовано (profiles приватний — див. SQL).
export async function getOrCreateThread({ postId, authorUid, buyerUid, authorName, buyerName }) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const { data: existing } = await supa.from('threads')
    .select('*').eq('post_id', postId).eq('buyer_uid', buyerUid).maybeSingle();
  if (existing) return { ok: true, thread: existing };
  const { data, error } = await supa.from('threads')
    .insert({
      post_id: postId, author_uid: authorUid, buyer_uid: buyerUid,
      author_name: authorName || null, buyer_name: buyerName || null,
    })
    .select().single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, thread: data };
}

// Повідомлення треда (старі → нові).
export async function fetchMessages(threadId, sinceTs = null) {
  if (!supa) return [];
  let q = supa.from('messages').select('*').eq('thread_id', threadId);
  if (sinceTs) q = q.gt('created_at', sinceTs);   // «чистий» вид після видалення (cleared_at)
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) { console.warn('[supabase] fetchMessages:', error.message); return []; }
  return data || [];
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
function withTimeout(thenable, ms = NET_TIMEOUT) {
  return Promise.race([
    Promise.resolve(thenable),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Немає зв\'язку')), ms)),
  ]);
}

export async function sendMessage({ threadId, senderUid, text, photoUrl = null, replyToId = null, clientTag = null }) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const row = { thread_id: threadId, sender_uid: senderUid, text: text || null };
  if (photoUrl) row.photo_url = photoUrl;
  if (replyToId) row.reply_to_id = replyToId;
  if (clientTag) row.client_tag = clientTag;
  let data, error;
  try {
    ({ data, error } = await withTimeout(supa.from('messages').insert(row).select().single()));
  } catch (e) { return { ok: false, error: e.message }; }
  if (error) return { ok: false, error: error.message };
  // Час+прев'ю треда тепер ставить тригер trg_touch_thread у БД (надійно).
  // Лишаємо клієнтський апдейт як підстраховку (ідемпотентно, не шкодить).
  const preview = text || (photoUrl ? '📷 Фото' : '');
  await supa.from('threads')
    .update({ last_message_at: new Date().toISOString(), last_message_text: preview })
    .eq('id', threadId);
  // Push отримувачу (не блокуємо UI — помилка пуша не валить відправку)
  supa.functions.invoke('send-chat-push', { body: { message_id: data.id } })
    .catch(e => console.warn('[supabase] send-chat-push:', e?.message));
  return { ok: true, message: data };
}

// Редагування свого повідомлення (текст + позначка edited_at)
export async function editMessage(messageId, text) {
  if (!supa) return { ok: false, error: 'no-supa' };
  try {
    const { data, error } = await withTimeout(supa.from('messages')
      .update({ text, edited_at: new Date().toISOString() })
      .eq('id', messageId).select().single());
    if (error) return { ok: false, error: error.message };
    return { ok: true, message: data };
  } catch (e) { return { ok: false, error: e.message }; }
}

// М'яке видалення (soft-delete): лишаємо рядок, прибираємо вміст → плейсхолдер у UI
export async function deleteMessage(messageId) {
  if (!supa) return { ok: false, error: 'no-supa' };
  try {
    const { data, error } = await withTimeout(supa.from('messages')
      .update({ deleted_at: new Date().toISOString(), text: null, photo_url: null })
      .eq('id', messageId).select().single());
    if (error) return { ok: false, error: error.message };
    return { ok: true, message: data };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Позначити вхідні повідомлення треда прочитаними (read_at).
export async function markThreadRead(threadId, uid) {
  if (!supa || !uid) return;
  await supa.from('messages').update({ read_at: new Date().toISOString() })
    .eq('thread_id', threadId).neq('sender_uid', uid).is('read_at', null);
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

// Зберегти push-пристрій під акаунт (для чат-сповіщень).
export async function saveUserPushDevice({ uid, endpoint, p256dh, auth_key }) {
  if (!supa || !uid) return { ok: false };
  const { error } = await supa.from('user_push_devices')
    .upsert({ uid, endpoint, p256dh, auth_key }, { onConflict: 'uid,endpoint' });
  if (error) { console.warn('[supabase] saveUserPushDevice:', error.message); return { ok: false }; }
  return { ok: true };
}

// Realtime: будь-яка зміна повідомлень одного треда (нові / редагування / видалення / прочитано).
// onChange({ type: 'INSERT'|'UPDATE'|'DELETE', row }).
export function subscribeThreadMessages(threadId, onChange) {
  if (!supa) return () => {};
  const ch = supa.channel(`thread-${threadId}`)
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
        payload => onChange({ type: payload.eventType, row: payload.new || payload.old }))
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

export async function addSavedPost(uid, postId) {
  if (!supa || !uid) return { ok: false };
  const { error } = await supa.from('saved_posts')
    .upsert({ uid, post_id: postId }, { onConflict: 'uid,post_id' });
  if (error) { console.warn('[supabase] addSavedPost:', error.message); return { ok: false }; }
  return { ok: true };
}

export async function removeSavedPost(uid, postId) {
  if (!supa || !uid) return { ok: false };
  const { error } = await supa.from('saved_posts').delete().eq('uid', uid).eq('post_id', postId);
  if (error) { console.warn('[supabase] removeSavedPost:', error.message); return { ok: false }; }
  return { ok: true };
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
export async function savePushSubscription(payload) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const { error } = await supa.from('push_subscriptions').insert(payload);
  if (error) {
    // 23505 = unique_violation (порушення унікальності) — підписка вже є, це нормально
    if (error.code === '23505') return { ok: true };
    console.warn('[supabase] savePushSubscription:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// Видаляє конкретний рядок підписки (при знятті відстеження рейсу).
// Повертає { ok } симетрично до savePushSubscription — щоб виклик міг
// зробити повтор і не лишити висячу серверну підписку при збої мережі.
export async function deletePushSubscription(endpoint, routeId, trackDate) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const { error } = await supa.from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('route_id', routeId)
    .eq('track_date', trackDate);
  if (error) {
    console.warn('[supabase] deletePushSubscription:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
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

export function subscribeComments(onChange) {
  if (!supa) return () => {};
  const ch = supa.channel('comments-watch')
    .on('postgres_changes',
        { event: '*', schema: 'public', table: 'comments' },
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
    .select('id, name, theme, avatar_url, banner_url, is_system')
    .order('created_at', { ascending: true });
  if (error) { console.warn('[supabase] fetchPages:', error.message); return []; }
  return data || [];
}

// Пости стрічки: усіх сторінок (pageId=null) або однієї. Невидалені, найсвіжіші.
// pages(name, avatar_url) — вкладений join за FK page_posts.page_id → pages.id.
export async function fetchPagePosts(pageId = null, limit = 60) {
  if (!supa) return [];
  let q = supa.from('page_posts')
    .select('id, page_id, author_uid, text, image_url, image_urls, created_at, pages(name, avatar_url)')
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
    const { error } = await supa.from('page_reactions').delete()
      .eq('post_id', postId).eq('user_id', userKey);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const { error } = await supa.from('page_reactions')
    .upsert({ post_id: postId, user_id: userKey, emoji: '❤️' }, { onConflict: 'post_id,user_id' });
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Коментарі постів → Map post_id → comments[] (невидалені, за часом).
export async function fetchPageComments() {
  if (!supa) return new Map();
  const { data, error } = await supa.from('page_comments')
    .select('id, post_id, author_uid, text, created_at, deleted_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  if (error) { console.warn('[supabase] fetchPageComments:', error.message); return new Map(); }
  const map = new Map();
  for (const c of (data || [])) {
    if (!map.has(c.post_id)) map.set(c.post_id, []);
    map.get(c.post_id).push(c);
  }
  return map;
}

export async function addPageComment(postId, uid, text) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  const { data, error } = await supa.from('page_comments')
    .insert({ post_id: postId, author_uid: uid, text }).select().single();
  return error ? { ok: false, error: error.message } : { ok: true, comment: data };
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
export async function createPagePost(pageId, uid, text, imageUrls = []) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  const arr = Array.isArray(imageUrls) ? imageUrls.filter(Boolean) : (imageUrls ? [imageUrls] : []);
  const { data, error } = await supa.from('page_posts')
    .insert({ page_id: pageId, author_uid: uid, text, image_urls: arr, image_url: arr[0] || null })
    .select('id, page_id, author_uid, text, image_url, image_urls, created_at, pages(name, avatar_url)')
    .single();
  return error ? { ok: false, error: error.message } : { ok: true, post: data };
}

// М'яке видалення поста (власник/адмін сторінки).
export async function deletePagePost(postId) {
  if (!supa) return { ok: false };
  const { error } = await supa.from('page_posts')
    .update({ deleted_at: new Date().toISOString() }).eq('id', postId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

// Оновити сторінку (аватар/банер/тема) — власник/адмін (RLS pages update).
export async function updatePage(pageId, patch) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  const { data, error } = await supa.from('pages')
    .update(patch).eq('id', pageId)
    .select('id, name, theme, avatar_url, banner_url, is_system').single();
  return error ? { ok: false, error: error.message } : { ok: true, page: data };
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
    const { error } = await supa.from('page_subscriptions').delete()
      .eq('page_id', pageId).eq('uid', uid);
    return error ? { ok: false, error: error.message } : { ok: true };
  }
  const { error } = await supa.from('page_subscriptions')
    .upsert({ page_id: pageId, uid }, { onConflict: 'page_id,uid' });
  return error ? { ok: false, error: error.message } : { ok: true };
}
