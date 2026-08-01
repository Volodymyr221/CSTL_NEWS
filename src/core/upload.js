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

import { compressImage, squareImageBlob } from './utils.js';
import { uploadPhotoToStorage } from './supabase.js';

// Повтор лише самого upload вже стиснутого Blob (для місць, які стискають самі —
// напр. прев'ю з локального URL перед завантаженням). retries=2 → до 3 спроб.
// ⚠️ `bucket` (01.08.2026): фото приватних чатів ідуть у ЗАКРИТЕ сховище
//    `chat-photos`, решта — у публічне. Успіх визначаємо по `path`, а НЕ по `url`:
//    у закритого бакета публічної адреси не існує взагалі, тому перевірка
//    `if (res.url)` вважала б успішне завантаження провалом і крутила б повтори.
export async function uploadBlobWithRetry(blob, folder = '', retries = 2, bucket = undefined) {
  let lastErr = '';
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await uploadPhotoToStorage(blob, folder, bucket);
    if (res.path) return { url: res.url, path: res.path, error: null };
    lastErr = res.error || 'upload';
    if (attempt < retries) await new Promise(r => setTimeout(r, 400 * (attempt + 1)));  // бекоф 0.4/0.8с
  }
  return { url: null, path: null, error: lastErr };
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
