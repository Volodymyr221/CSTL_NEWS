import { bootApp } from './core/boot.js';
import { initNews } from './tabs/news.js';
import { initEvents } from './tabs/events.js';
import { initBuses } from './tabs/buses.js';
import { initSubmit } from './tabs/submit.js';

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
};

// Ініціалізація при завантаженні сторінки
function init() {
  bootApp();
  initNews();
  initEvents();
  initBuses();
  initSubmit();

  // Splash screen — прибираємо після завантаження
  setTimeout(() => {
    const splash = document.getElementById('splash');
    if (splash) {
      splash.style.opacity = '0';
      splash.style.transition = 'opacity 0.4s';
      setTimeout(() => splash.remove(), 600);
    }
  }, 4500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
