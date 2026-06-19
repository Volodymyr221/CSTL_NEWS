// src/core/supabase.js
// Ініціалізація Supabase клієнта + хелпери для роботи з БД.
//
// SDK завантажується через CDN у index.html → доступний як window.supabase.
// Тут створюємо ОДИН екземпляр клієнта і експортуємо його + готові функції.
//
// Якщо URL/key не задані (наприклад при локальній розробці без БД) — клієнт
// створиться, але виклики будуть фейлитись. Тому є fallback на JSON у тих
// модулях що читають дошку.

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

// ── ПОСТИ ────────────────────────────────────────────────────────────────

// Усі опубліковані пости (для Дошки громади 2.0)
// Сортування за published_at DESC (нові зверху).
// Якщо БД недоступна або порожня — повертаємо null (caller fall back на JSON).
export async function fetchPublishedPosts() {
  if (!supa) return null;
  const { data, error } = await supa
    .from('posts')
    .select('*')
    .eq('status', 'published')
    .order('published_at', { ascending: false, nullsLast: true })
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

// Створити новий пост (з submit-форми). Завжди status='pending' → модератор.
// Повертає { ok: true } або { ok: false, error: 'текст' }.
export async function submitPost(payload) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  // Гарантуємо що статус pending незалежно від payload (захист від клієнтських помилок)
  const row = { ...payload, status: 'pending' };
  const { error } = await supa.from('posts').insert(row);
  if (error) {
    console.warn('[supabase] submitPost error:', error);
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
    .select('id, post_id, author, text, created_at')
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
export async function addComment(postId, author, text, senderUid) {
  if (!supa) return { ok: false, error: 'Supabase не підключений' };
  const row = { post_id: postId, author: author || null, text };
  if (senderUid) row.sender_uid = senderUid;
  const { data, error } = await supa.from('comments')
    .insert(row)
    .select()
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, comment: data };
}

// ── STORAGE: завантаження фото у bucket community-photos ─────────────────
// Раніше фото зберігались як base64 у posts.photos[] (TEXT[]) — кожне ~150KB
// тексту у БД, max 3 фото = 450KB на пост. При 100+ постах таблиця посту
// роздувалась. Тепер фото йдуть у Supabase Storage, у БД — тільки публічні
// URL (короткі рядки). Bucket створено у scripts/supabase_schema.sql.
//
// Аргумент: Blob (зазвичай 50-200KB після canvas-стиснення).
// Шлях у бакеті: <anonId>/<timestamp>-<random>.jpg (анонімні юзери розділяються).
// Повертає: { url, error }. url — публічний URL для <img src>.
export async function uploadPhotoToStorage(blob) {
  if (!supa) return { url: null, error: 'Supabase не підключений' };
  if (!blob) return { url: null, error: 'Порожній blob' };

  const ext  = (blob.type && blob.type.split('/')[1]) || 'jpg';
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${getAnonId()}/${Date.now()}-${rand}.${ext}`;

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

// ── ПРИВАТНИЙ ЧАТ (Фаза Б, Етап 4) ───────────────────────────────────────
// Усі функції приймають uid аргументом (не імпортуємо auth.js — циклічна
// залежність). RLS у БД все одно перевіряє auth.uid() на сервері.

// Мої оголошення (для «Мої оголошення» у Кабінеті) — усі статуси, нові зверху.
export async function fetchMyPosts(uid) {
  if (!supa || !uid) return [];
  const { data, error } = await supa.from('posts')
    .select('*').eq('owner_uid', uid).order('created_at', { ascending: false });
  if (error) { console.warn('[supabase] fetchMyPosts:', error.message); return []; }
  return data || [];
}

// Мої треди (вхідні + вихідні) з даними оголошення. Нові зверху.
export async function fetchMyThreads(uid) {
  if (!supa || !uid) return [];
  const { data, error } = await supa.from('threads')
    .select('*, post:posts(id, title, text, category, photos)')
    .or(`author_uid.eq.${uid},buyer_uid.eq.${uid}`)
    .order('last_message_at', { ascending: false });
  if (error) { console.warn('[supabase] fetchMyThreads:', error.message); return []; }
  return data || [];
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
export async function fetchMessages(threadId) {
  if (!supa) return [];
  const { data, error } = await supa.from('messages')
    .select('*').eq('thread_id', threadId).order('created_at', { ascending: true });
  if (error) { console.warn('[supabase] fetchMessages:', error.message); return []; }
  return data || [];
}

// Надіслати повідомлення + оновити час треда + штовхнути push отримувачу.
export async function sendMessage({ threadId, senderUid, text }) {
  if (!supa) return { ok: false, error: 'no-supa' };
  const { data, error } = await supa.from('messages')
    .insert({ thread_id: threadId, sender_uid: senderUid, text }).select().single();
  if (error) return { ok: false, error: error.message };
  // Оновлюємо час + прев'ю останнього повідомлення (для сортування й списку тредів)
  await supa.from('threads')
    .update({ last_message_at: new Date().toISOString(), last_message_text: text })
    .eq('id', threadId);
  // Push отримувачу (не блокуємо UI — помилка пуша не валить відправку)
  supa.functions.invoke('send-chat-push', { body: { message_id: data.id } })
    .catch(e => console.warn('[supabase] send-chat-push:', e?.message));
  return { ok: true, message: data };
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
  // Тягнемо непрочитані чужі повідомлення цих тредів і рахуємо на клієнті.
  const { data } = await supa.from('messages').select('thread_id')
    .in('thread_id', ids).neq('sender_uid', uid).is('read_at', null);
  for (const m of (data || [])) map.set(m.thread_id, (map.get(m.thread_id) || 0) + 1);
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

// Realtime: нові повідомлення в одному треді.
export function subscribeThreadMessages(threadId, onInsert) {
  if (!supa) return () => {};
  const ch = supa.channel(`thread-${threadId}`)
    .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `thread_id=eq.${threadId}` },
        payload => onInsert(payload.new))
    .subscribe();
  return () => supa.removeChannel(ch);
}

// Realtime: будь-яка зміна моїх тредів (для оновлення списку/бейджа).
export function subscribeMyThreads(onChange) {
  if (!supa) return () => {};
  const ch = supa.channel('my-threads')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, p => onChange(p))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'threads' },  p => onChange(p))
    .subscribe();
  return () => supa.removeChannel(ch);
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
export async function deletePushSubscription(endpoint, routeId, trackDate) {
  if (!supa) return;
  const { error } = await supa.from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('route_id', routeId)
    .eq('track_date', trackDate);
  if (error) console.warn('[supabase] deletePushSubscription:', error.message);
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
