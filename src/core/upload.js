// upload.js — надійне завантаження зображень у сховище (єдина точка для всього застосунку).
//
// НАВІЩО: телефонні фото — 3-5 МБ (а формат iPhone .heic). Якщо їх слати у сховище
// СИРИМИ, запит падає «Load failed» (розмір/мережа/формат). Раніше частина місць
// (банер/аватар сторінки, фото приватного чату) слала сире → користувач не міг
// завантажити. Тут ОДИН надійний шлях: стиснення (→ JPEG, канвас нормалізує і .heic)
// + послідовний upload + повтор при тимчасовому збої мережі. Усі місця завантаження
// (feed, board-chat, community-modal, account-ui) ходять через нього.
//
// ⚠️ Завантажувати ПОСЛІДОВНО (не паралельно): на iOS PWA кілька одночасних upload
//    у сховище стабільно падають «Load failed». Кілька фото — цикл await по одному.

import { compressImage, squareImageBlob, avatarPairBlobs } from './utils.js';
import { uploadPhotoToStorage, largePhotoUrl } from './supabase.js';

// Повтор лише самого upload вже стиснутого Blob (для місць, які стискають самі —
// напр. прев'ю з локального URL перед завантаженням). retries=2 → до 3 спроб.
// ⚠️ `bucket` (01.08.2026): фото приватних чатів ідуть у ЗАКРИТЕ сховище
//    `chat-photos`, решта — у публічне. Успіх визначаємо по `path`, а НЕ по `url`:
//    у закритого бакета публічної адреси не існує взагалі, тому перевірка
//    `if (res.url)` вважала б успішне завантаження провалом і крутила б повтори.
export async function uploadBlobWithRetry(blob, folder = '', retries = 2, bucket = undefined, explicitPath = '') {
  let lastErr = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await uploadPhotoToStorage(blob, folder, bucket, explicitPath);
    if (res.path) return { url: res.url, path: res.path, error: null };
    lastErr = res.error || 'upload';
    if (attempt < retries) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));  // бекоф 0.4/0.8с
  }
  return { url: null, path: null, error: lastErr };
}

// ── ФОТО ЖИТЕЛЯ: дрібне + велике за один захід (23.08) ──────────────────────
//
// Замовлення Вови: у картці жителя фото було «дуже неякісне, розмите,
// піксельне». Причина — один файл 256×256 на два різні за розміром місця
// (кружечок картки просить 360 точок, фото на весь екран — до 1651). Повний
// розбір і всі заміри — у `utils.js`, функція `avatarPairBlobs`.
//
// Повертає адресу ДРІБНОГО — саме вона йде в `profiles.avatar_url` і саме її
// читають усі наявні списки. Велике лежить поруч під іменем із суфіксом `@lg`.
//
// ⚠️ ПОРЯДОК ВАЖЛИВИЙ, і він не випадковий: спершу дрібне. Його адреса — та
// єдина, що потрапляє в базу, тож поки воно не лягло, робити нема чого. Велике
// йде другим і має право не долетіти: тоді в людини просто лишається сьогоднішня
// поведінка (картка візьме дрібне), а не зламаний аватар.
// 🔑 Послідовно, не паралельно — на iOS PWA два одночасні upload у сховище
// стабільно падають «Load failed» (той самий урок, що в шапці цього файлу).
export async function uploadAvatarPair(file, { folder = 'avatars/', retries = 2 } = {}) {
  if (!file) return { url: null, error: 'нема файлу' };

  let pair;
  try {
    pair = await avatarPairBlobs(file);
  } catch (e) {
    return { url: null, error: (e && e.message) || 'не вдалося обробити фото' };
  }

  const small = await uploadBlobWithRetry(pair.small, folder, retries);
  if (!small.path) return { url: null, error: small.error };

  // Велике — ПОРУЧ із дрібним, під передбачуваним іменем. Помилку ковтаємо
  // свідомо: аватар уже поставлено, а без великого картка працює як раніше.
  await uploadBlobWithRetry(pair.large, folder, retries, undefined, largePhotoUrl(small.path));

  return { url: small.url, error: null };
}

// Повний надійний шлях для СИРОГО файлу з <input type=file>: стиснути + upload з повтором.
// opts:
//   folder  — префікс у бакеті ('pages/', 'avatars/', '' = корінь)
//   square  — true → квадратний center-crop (для аватарів), інакше прямокутне стиснення
//   maxDim  — макс. сторона (px). Прямокутне: 1600 фото/1600 банер/800 оголошення; квадрат: розмір сторони
//   quality — якість JPEG (0..1), лише для прямокутного
//   retries — скільки повторів upload при збої (дефолт 2)
//   bucket  — сховище: не вказано = публічне; 'chat-photos' = закрите (приватні чати)
// Повертає { url, path, error }. Для закритого бакета `url` порожній —
// користуйся `path`, посилання підписується в момент показу (supabase.js).
export async function uploadImageReliable(file, { folder = '', square = false, maxDim = 1600, quality = 0.82, retries = 2, bucket = undefined } = {}) {
  if (!file) return { url: null, path: null, error: 'нема файлу' };
  let blob;
  try {
    blob = square ? await squareImageBlob(file, maxDim) : await compressImage(file, maxDim, quality);
  } catch (e) {
    // img.onerror (напр. непідтримуваний формат) або toBlob failed
    return { url: null, path: null, error: (e && e.message) || 'не вдалося обробити фото' };
  }
  return uploadBlobWithRetry(blob, folder, retries, bucket);
}
