// src/core/cropper.js
// Рамка кадрування фото перед завантаженням (банер сторінки, аватар).
//
// НАВІЩО: банер показується широкою смугою (~2,3:1). Раніше будь-яке фото просто
// заливалось у цю смугу через `object-fit: cover` — і квадратне фото різалось по
// боках навмання: користувач не міг обрати, ЩО саме буде видно. Тепер він сам
// наводить кадр: тягне фото пальцем і масштабує щипком, у рамці — рівно те, що
// буде на банері.
//
// ЯК ПРАЦЮЄ: фото малюється в canvas (полотні) з поточним зсувом і масштабом,
// обрізається рівно по рамці й віддається як JPEG-blob. Тобто вантажиться вже
// готовий кадр — файл менший, і вигляд однаковий на всіх екранах.
//
// Використання:
//   const blob = await openCropper(file, { aspect: 2.3, title: 'Банер сторінки' });
//   if (blob) → завантажувати; null → користувач скасував.

import { openLayer, closeLayer } from './layers.js';   // шари ↔ історія браузера

const OUT_MAX_W = 1600;        // ширина результату (висота — з пропорції)

// Читає File у HTMLImageElement (щоб знати справжній розмір і малювати в canvas).
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Не вдалося прочитати фото')); };
    img.src = url;
  });
}

export function openCropper(file, opts = {}) {
  const aspect = opts.aspect || 1;          // ширина ÷ висота рамки
  const round  = !!opts.round;              // кругла рамка (аватар)
  const title  = opts.title || 'Кадрування';

  return new Promise(async (resolve) => {
    let img;
    try { img = await loadImage(file); }
    catch { resolve(null); return; }

    const back = document.createElement('div');
    back.className = 'crop-back';
    back.innerHTML = `
      <div class="crop-top">
        <button class="crop-cancel" type="button">Скасувати</button>
        <span class="crop-title">${title}</span>
        <button class="crop-done" type="button">Готово</button>
      </div>
      <div class="crop-stage">
        <canvas class="crop-canvas"></canvas>
        <div class="crop-frame${round ? ' crop-frame--round' : ''}"></div>
      </div>
      <div class="crop-bottom">
        <span class="crop-hint">Пересувай фото пальцем · щипок або повзунок — масштаб</span>
        <input class="crop-zoom" type="range" min="1" max="4" step="0.01" value="1">
      </div>`;
    document.body.appendChild(back);
    document.body.classList.add('modal-open');

    const stage  = back.querySelector('.crop-stage');
    const frame  = back.querySelector('.crop-frame');
    const canvas = back.querySelector('.crop-canvas');
    const zoomEl = back.querySelector('.crop-zoom');
    const ctx = canvas.getContext('2d');

    // Геометрія рамки: вписуємо потрібну пропорцію в доступну область.
    let fw = 0, fh = 0, fx = 0, fy = 0;      // рамка в координатах сцени
    let scale = 1, minScale = 1, tx = 0, ty = 0;   // поточний стан фото

    function layout() {
      const sw = stage.clientWidth, sh = stage.clientHeight;
      canvas.width  = Math.round(sw * (window.devicePixelRatio || 1));
      canvas.height = Math.round(sh * (window.devicePixelRatio || 1));
      canvas.style.width = sw + 'px'; canvas.style.height = sh + 'px';

      const pad = 16;
      fw = Math.min(sw - pad * 2, (sh - pad * 2) * aspect);
      fh = fw / aspect;
      fx = (sw - fw) / 2; fy = (sh - fh) / 2;
      frame.style.width = fw + 'px'; frame.style.height = fh + 'px';
      frame.style.left = fx + 'px';  frame.style.top = fy + 'px';

      // Мінімальний масштаб — щоб фото ГАРАНТОВАНО покривало рамку (без порожнеч).
      minScale = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
      if (scale < minScale) scale = minScale;
      zoomEl.min = String(minScale);
      zoomEl.max = String(minScale * 4);
      zoomEl.value = String(scale);
      clampAndDraw();
    }

    // Не даємо витягнути фото за межі рамки — у кадрі завжди тільки фото.
    function clamp() {
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      const minX = fx + fw - w, maxX = fx;
      const minY = fy + fh - h, maxY = fy;
      tx = Math.min(maxX, Math.max(minX, tx));
      ty = Math.min(maxY, Math.max(minY, ty));
    }

    function draw() {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, tx, ty, img.naturalWidth * scale, img.naturalHeight * scale);
    }
    const clampAndDraw = () => { clamp(); draw(); };

    // Старт: фото по центру рамки, масштаб «покрити».
    function center() {
      scale = Math.max(fw / img.naturalWidth, fh / img.naturalHeight);
      tx = fx + (fw - img.naturalWidth * scale) / 2;
      ty = fy + (fh - img.naturalHeight * scale) / 2;
    }

    // ── Жести: один палець — зсув, два — масштаб ──
    let dragging = false, lastX = 0, lastY = 0, pinchDist = 0, pinchScale = 1;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    stage.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        dragging = true; lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        dragging = false; pinchDist = dist(e.touches); pinchScale = scale;
      }
    }, { passive: true });

    stage.addEventListener('touchmove', (e) => {
      e.preventDefault();                       // інакше сторінка скролиться під пальцем
      if (e.touches.length === 2 && pinchDist > 0) {
        const k = dist(e.touches) / pinchDist;
        const next = Math.min(minScale * 4, Math.max(minScale, pinchScale * k));
        // Масштабуємо навколо центру рамки — кадр не «тікає» вбік.
        const cx = fx + fw / 2, cy = fy + fh / 2;
        tx = cx - (cx - tx) * (next / scale);
        ty = cy - (cy - ty) * (next / scale);
        scale = next;
        zoomEl.value = String(scale);
        clampAndDraw();
        return;
      }
      if (!dragging || !e.touches.length) return;
      const t = e.touches[0];
      tx += t.clientX - lastX; ty += t.clientY - lastY;
      lastX = t.clientX; lastY = t.clientY;
      clampAndDraw();
    }, { passive: false });

    stage.addEventListener('touchend', () => { dragging = false; pinchDist = 0; }, { passive: true });

    zoomEl.addEventListener('input', () => {
      const next = Number(zoomEl.value) || minScale;
      const cx = fx + fw / 2, cy = fy + fh / 2;
      tx = cx - (cx - tx) * (next / scale);
      ty = cy - (cy - ty) * (next / scale);
      scale = next;
      clampAndDraw();
    });

    // Кроппер — теж повноекранний ШАР: жест «назад» = «Скасувати», а не вихід із додатка.
    let done = false;
    const cropLayer = openLayer(() => { if (!done) finish(null); });
    const finish = (blob) => {
      if (done) return;
      done = true;
      closeLayer(cropLayer);
      back.remove();
      document.body.classList.remove('modal-open');
      window.removeEventListener('resize', layout);
      resolve(blob);
    };

    back.querySelector('.crop-cancel').addEventListener('click', () => finish(null));
    back.querySelector('.crop-done').addEventListener('click', () => {
      // Переводимо рамку з екранних координат у координати оригіналу і ріжемо.
      const sx = (fx - tx) / scale, sy = (fy - ty) / scale;
      const sw = fw / scale,        sh = fh / scale;
      const outW = Math.min(OUT_MAX_W, Math.round(sw));
      const outH = Math.round(outW / aspect);
      const out = document.createElement('canvas');
      out.width = outW; out.height = outH;
      out.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
      out.toBlob(b => finish(b), 'image/jpeg', 0.88);
    });

    window.addEventListener('resize', layout);
    requestAnimationFrame(() => { layout(); center(); clampAndDraw(); });
  });
}
