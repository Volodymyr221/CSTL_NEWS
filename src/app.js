import { bootApp } from './core/boot.js';
import { initWeather } from './core/weather.js';
import { initNews } from './tabs/news.js';
import { initEvents } from './tabs/events.js';
import { initBuses } from './tabs/buses.js';
import { initPower } from './tabs/power.js';

// Поточна активна вкладка
let currentTab = 'news';

// Переключення між вкладками з плавною анімацією
window.switchTab = function(tab) {
  if (tab === currentTab) return;

  const oldPage = document.getElementById(`page-${currentTab}`);
  const newPage = document.getElementById(`page-${tab}`);
  if (!oldPage || !newPage) return;

  // Плавний fade перехід
  newPage.style.opacity = '0';
  newPage.style.display = 'block';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      oldPage.style.opacity = '0';
      oldPage.style.transition = 'opacity 0.18s ease';
      newPage.style.transition = 'opacity 0.22s ease';
      newPage.style.opacity = '1';

      setTimeout(() => {
        oldPage.style.display = 'none';
        oldPage.style.opacity = '';
        oldPage.style.transition = '';
        newPage.style.transition = '';
      }, 220);
    });
  });

  // Оновлюємо активний стан таб-бару
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.tab-item[data-tab="${tab}"]`);
  if (activeTab) activeTab.classList.add('active');

  currentTab = tab;
};

// Закрити модальне вікно статті
window.closeArticleModal = function() {
  const modal = document.getElementById('article-modal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
  document.body.classList.remove('modal-open');
  const inner = document.querySelector('.article-modal-inner');
  if (inner) { inner.style.transform = ''; inner.style.transition = ''; inner.style.animation = ''; }
  const metaTags = document.getElementById('modalMetaTags');
  if (metaTags) metaTags.innerHTML = '';
};

// Свайп вниз для закриття модалки
function initModalSwipe() {
  const inner = document.querySelector('.article-modal-inner');
  if (!inner) return;
  const handle = inner.querySelector('.modal-handle');
  let startY = 0;
  let isSwiping = false;
  let startedOnHandle = false;
  let startedAtTop = false;
  let rafId = null;

  const reset = () => {
    inner.style.transition = '';
    inner.style.transform = '';
    inner.style.animation = '';
  };

  inner.addEventListener('touchstart', e => {
    startedOnHandle = handle && (e.target === handle || handle.contains(e.target));
    startedAtTop = inner.scrollTop <= 0;
    const canSwipe = startedOnHandle || startedAtTop;
    if (!canSwipe) return;
    // Зупиняємо будь-яку анімацію одразу — щоб палець одразу "підхопив" панель
    inner.style.animation = 'none';
    inner.style.transition = 'none';
    inner.style.transform = 'translateY(0)';
    startY = e.touches[0].clientY;
    isSwiping = false;
  }, { passive: true });

  inner.addEventListener('touchmove', e => {
    if (!startedOnHandle && !startedAtTop) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) {
      e.preventDefault();
      isSwiping = true;
      // requestAnimationFrame — плавне оновлення 60fps без ривків
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        inner.style.transform = `translateY(${dy}px)`;
        rafId = null;
      });
    }
  }, { passive: false });

  inner.addEventListener('touchend', e => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if ((!startedOnHandle && !startedAtTop) || !isSwiping) {
      if (startedOnHandle || startedAtTop) reset();
      startedOnHandle = false;
      startedAtTop = false;
      return;
    }
    isSwiping = false;
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 80) {
      inner.style.transition = 'transform 0.25s ease-in';
      inner.style.transform = 'translateY(100%)';
      setTimeout(window.closeArticleModal, 240);
    } else {
      inner.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
      inner.style.transform = 'translateY(0)';
      setTimeout(reset, 300);
    }
    startedOnHandle = false;
    startedAtTop = false;
  });

  inner.addEventListener('touchcancel', () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    startedOnHandle = false;
    startedAtTop = false;
    isSwiping = false;
    inner.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
    inner.style.transform = 'translateY(0)';
    setTimeout(reset, 300);
  });
}

// Ініціалізація при завантаженні сторінки
function init() {
  bootApp();
  initModalSwipe();
  initWeather();
  initNews();
  initEvents();
  initBuses();
  initPower();

  // Splash screen — прибираємо після завантаження
  setTimeout(() => {
    const splash = document.getElementById('splash');
    if (splash) {
      splash.style.opacity = '0';
      splash.style.transition = 'opacity 0.4s';
      setTimeout(() => splash.remove(), 600);
    }
  }, 3500);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
