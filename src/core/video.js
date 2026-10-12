// src/core/video.js — ВІДЕО В ДОПИСАХ СПІЛЬНОТ: підготовка і завантаження (12.10.2026).
//
// 🗣️ Вова: «добавити можливість публікації відео в вкладку «стрічка» в спільноти…
// щоб без лагів». Потік /byyou «відео», крок 3. Показ у стрічці — `feed.js`.
//
// 🔑 ЩО ТУТ І ЧОМУ ОКРЕМО ВІД feed.js:
//   • перевірка файлу ДО завантаження (розмір, тип) — відмова за секунду, а не після
//     хвилини завантаження, яку сховище однаково відкине;
//   • метадані (ширина, висота, тривалість) — стрічка резервує місце під ролик ще ДО
//     того, як він почне вантажитись, тож картки не стрибають (це половина «без лагів»);
//   • обкладинка — кадр із ролика, зроблений у браузері. Стрічка показує ЇЇ (≈50 КБ),
//     а сам ролик не тягне взагалі, доки його не почнуть дивитись (`preload="none"`).
//
// 🛑 ПЕРЕКОДУВАННЯ НЕМАЄ — і це свідомо. Стиснути відео в браузері можна лише
// ffmpeg.wasm (~30 МБ коду) або перезаписом кадрів у реальному часі; обидва шляхи на
// телефоні — хвилини з гарячим процесором. Тому межа — розмір файлу (50 МБ, стеля
// безкоштовного тарифу Supabase), а людині кажемо, як обрізати ролик у «Фото».

import { uploadVideoToStorage, uploadPhotoToStorage } from './supabase.js';

export const VIDEO_MAX_BYTES = 50 * 1024 * 1024;     // = file_size_limit сховища (0010)
export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm';
const POSTER_MAX_W = 960;                             // ширина обкладинки: картка ≤ 600 css-px × 1.6
const META_TIMEOUT_MS = 10000;

// «1:05», «12:30» — для мітки на ролику.
export function formatVideoDuration(sec) {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Людський текст, чому файл не підходить; '' — підходить.
export function videoFileProblem(file) {
  if (!file) return 'Файл не вибрано';
  if (!/^video\//.test(file.type || '') && !/\.(mp4|mov|m4v|webm)$/i.test(file.name || '')) {
    return 'Це не відео. Оберіть ролик у форматі MP4 або MOV.';
  }
  if (file.size > VIDEO_MAX_BYTES) {
    const мб = Math.round(file.size / 1048576);
    return `Відео завелике: ${мб} МБ, можна до 50 МБ (це приблизно хвилина з телефона). ` +
           'Обріжте його у «Фото»: відкрийте ролик → «Редагувати» → посуньте краї.';
  }
  return '';
}

// Метадані + кадр-обкладинка. Не кидає: чого не вдалось дістати — те null.
// 📐 Кадр беремо не з нульової секунди: у багатьох роликів вона чорна (затемнення
// на початку запису), і стрічка показала б чорний прямокутник.
export function readVideoMeta(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
    let done = false;
    const finish = (out) => {
      if (done) return; done = true;
      clearTimeout(timer);
      try { v.removeAttribute('src'); v.load(); } catch (_) {}
      URL.revokeObjectURL(url);
      resolve(out);
    };
    const timer = setTimeout(() => finish({ w: v.videoWidth || 0, h: v.videoHeight || 0, dur: v.duration || 0, poster: null }), META_TIMEOUT_MS);
    v.addEventListener('error', () => finish({ w: 0, h: 0, dur: 0, poster: null }), { once: true });
    v.addEventListener('loadedmetadata', () => {
      const dur = Number.isFinite(v.duration) ? v.duration : 0;
      const t = dur ? Math.min(0.6, dur / 3) : 0;
      // iOS віддає кадр для canvas лише після того, як дані справді завантажені
      // під цю позицію — тобто чекаємо `seeked`, а не одразу малюємо.
      v.addEventListener('seeked', () => {
        const w = v.videoWidth, h = v.videoHeight;
        if (!w || !h) return finish({ w, h, dur, poster: null });
        const k = Math.min(1, POSTER_MAX_W / w);
        const c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        try {
          c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
          c.toBlob(b => finish({ w, h, dur, poster: b || null }), 'image/jpeg', 0.8);
        } catch (_) { finish({ w, h, dur, poster: null }); }
      }, { once: true });
      try { v.currentTime = t || 0.001; } catch (_) { finish({ w: v.videoWidth, h: v.videoHeight, dur, poster: null }); }
    }, { once: true });
    v.src = url;
    try { v.load(); } catch (_) {}
  });
}

// Повне завантаження: ролик (з прогресом і одним повтором) + обкладинка.
// Повертає { ok, video: { url, poster, w, h, dur, size, mime } } або { ok:false, error }.
export async function uploadPostVideo(file, meta, pageId, onProgress = () => {}) {
  const problem = videoFileProblem(file);
  if (problem) return { ok: false, error: problem };
  let res = null;
  for (let спроба = 0; спроба < 2; спроба++) {
    res = await uploadVideoToStorage(file, pageId, p => onProgress(0.05 + p * 0.9));
    if (res.url) break;
    // Повторюємо ЛИШЕ обрив зв'язку/збій сервера. Відмову за правами чи розміром
    // повторювати марно — вона прийде знову, а людина чекатиме вдвічі довше.
    if (!(res.status === 0 || res.status >= 500)) break;
  }
  if (!res?.url) {
    const s = res?.status;
    const error = s === 413 ? 'Відео завелике для сховища (до 50 МБ).'
      : (s === 401 || s === 403) ? 'Немає прав додавати відео в цю спільноту.'
      : s === 415 || /mime|type/i.test(res?.error || '') ? 'Цей формат відео не підтримується. Потрібен MP4 або MOV.'
      : s === 0 ? 'Немає зв\'язку — відео не завантажилось. Спробуйте ще раз.'
      : 'Не вдалося завантажити відео. Спробуйте ще раз.';
    return { ok: false, error };
  }
  let poster = null;
  if (meta?.poster) {
    const up = await uploadPhotoToStorage(meta.poster, `video-posters/${pageId}/`);
    poster = up?.url || null;   // без обкладинки ролик однаково покажеться (темне тло + ▶)
  }
  onProgress(1);
  return { ok: true, video: {
    url: res.url, poster,
    w: Math.round(meta?.w || 0) || null, h: Math.round(meta?.h || 0) || null,
    dur: Math.round((meta?.dur || 0) * 10) / 10 || null,
    size: file.size, mime: file.type || null,
  } };
}
