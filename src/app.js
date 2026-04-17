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
  // Скидаємо inline стилі після свайпу
  const inner = document.querySelector('.article-modal-inner');
  if (inner) { inner.style.transform = ''; inner.style.transition = ''; inner.style.animation = ''; }
};

// Свайп вниз для закриття модалки
function initModalSwipe() {
  const inner = document.querySelector('.article-modal-inner');
  if (!inner) return;
  let startY = 0;
  let swiping = false;

  inner.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY;
    swiping = false;
  }, { passive: true });

  inner.addEventListener('touchmove', e => {
    const dy = e.touches[0].clientY - startY;
    if (inner.scrollTop <= 0 && dy > 5) {
      e.preventDefault();
      swiping = true;
      inner.style.animation = 'none';
      inner.style.transition = 'none';
      inner.style.transform = `translateY(${Math.max(0, dy)}px)`;
    }
  }, { passive: false });

  inner.addEventListener('touchend', e => {
    if (!swiping) return;
    swiping = false;
    const dy = e.changedTouches[0].clientY - startY;
    if (dy > 80) {
      inner.style.transition = 'transform 0.25s ease-in';
      inner.style.transform = 'translateY(100%)';
      setTimeout(window.closeArticleModal, 240);
    } else {
      inner.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
      inner.style.transform = 'translateY(0)';
      setTimeout(() => { inner.style.transition = ''; inner.style.animation = ''; }, 300);
    }
  });

  inner.addEventListener('touchcancel', () => {
    swiping = false;
    inner.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
    inner.style.transform = '';
    setTimeout(() => { inner.style.transition = ''; inner.style.animation = ''; }, 300);
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
