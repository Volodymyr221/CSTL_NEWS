// src/core/auth.js
// Авторизація жителя через Google (Supabase Auth) — Фаза Б.
// Це ЄДИНА «особистість» додатку: currentUserId() використовується скрізь
// (приватний чат, реакції/коментарі з власником, гейтинг дій) замість анонімних id.
//
// UI входу (екран «Приєднайтесь», Кабінет) — окремий шар, будується пізніше.
// Тут — лише логіка: вхід/вихід, поточний користувач, гейтинг, профіль.
//
// ⚠️ Етап 1 (фундамент): гейтинг ще НЕ ввімкнено в діях. requireAuth() готовий,
// але викликаємо його лише коли Google-провайдер налаштований (Етап 0) і вхід
// перевірено наживо. До того додаток поводиться як зараз (анонімно).

import { getSupabase } from './supabase.js';
import { showToast } from './utils.js';

let _user = null;        // поточний користувач (або null якщо гість)
const _listeners = [];   // підписники на зміну стану входу

export function currentUser()   { return _user; }
export function currentUserId() { return _user ? _user.id : null; }
export function isLoggedIn()     { return !!_user; }

// Підписка на зміну стану входу (повертає функцію відписки)
export function onAuthChange(cb) {
  _listeners.push(cb);
  return () => { const i = _listeners.indexOf(cb); if (i >= 0) _listeners.splice(i, 1); };
}
function emitAuthChange() {
  _listeners.forEach(cb => { try { cb(_user); } catch (_) {} });
}

// Ініціалізація при старті: відновити збережену сесію + слухати зміни.
// Безпечно за відсутності сесії (гість) — _user лишається null.
export async function initAuth() {
  const supa = getSupabase();
  if (!supa) return;
  try {
    const { data } = await supa.auth.getSession();
    _user = data && data.session ? data.session.user : null;
    emitAuthChange();
  } catch (e) { console.warn('[auth] getSession:', e && e.message); }
  supa.auth.onAuthStateChange((_event, session) => {
    _user = session ? session.user : null;
    emitAuthChange();
  });
}

// Вхід через Google. Після редіректу назад Supabase сам підхопить сесію
// (detectSessionInUrl) і onAuthStateChange оновить _user.
export async function signInWithGoogle() {
  const supa = getSupabase();
  if (!supa) { showToast('Немає звʼязку з сервером', 3000, 'error'); return; }
  const redirectTo = window.location.origin + window.location.pathname;
  const { error } = await supa.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
  if (error) showToast('Не вдалося увійти: ' + error.message, 4000, 'error');
}

export async function signOut() {
  const supa = getSupabase();
  if (!supa) return;
  await supa.auth.signOut();
  _user = null;
  emitAuthChange();
}

// Єдина точка гейтингу (gating — обмеження дії для гостя).
// Залогінений → виконує дію. Гість → м'яко просить увійти + подія для UI-шару.
// ⚠️ Поки НЕ підключений до дій (Етап 1). Підключимо в Етапі 2 після робочого входу.
export function requireAuth(actionLabel, fn) {
  if (isLoggedIn()) { fn(); return true; }
  showToast('Щоб ' + actionLabel + ', увійдіть', 3500);
  document.dispatchEvent(new CustomEvent('cstl-need-login', { detail: { actionLabel } }));
  return false;
}

// ── Профіль жителя (таблиця profiles) ──
export async function getProfile() {
  const supa = getSupabase();
  if (!supa || !_user) return null;
  const { data, error } = await supa.from('profiles').select('*').eq('uid', _user.id).maybeSingle();
  if (error) { console.warn('[auth] getProfile:', error.message); return null; }
  return data;
}
export async function saveProfile({ name, birth_date }) {
  const supa = getSupabase();
  if (!supa || !_user) return { ok: false, error: 'не залогінено' };
  const row = { uid: _user.id, name: name || null, email: _user.email || null, birth_date: birth_date || null };
  const { error } = await supa.from('profiles').upsert(row, { onConflict: 'uid' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
