import { bootApp } from './core/boot.js';
import { initWeather } from './core/weather.js';
import { initCommunity } from './tabs/community.js';
import { initNews } from './tabs/news.js';
import { initEvents } from './tabs/events.js';
import { initBuses, initSavedRoutesHeader } from './tabs/buses.js';
import { initPower } from './tabs/power.js';
import { initBoard, openDiscussions } from './tabs/board.js';
import { initAuth } from './core/auth.js';
import { initAccountUI } from './core/account-ui.js';
import { initMessages, openThreadsList, openGroupsList, openInviteJoin } from './core/messages-ui.js';

// Поточна активна вкладка
let currentTab = 'community';

// Переключення між вкладками з плавною анімацією
window.switchTab = function(tab) {
  // «Події» переїхали у вкладку «Новини» як підрозділ. Перенаправляємо вхід
  // 'events' → 'news' + активуємо підрозділ. Прямий вхід 'news' → підрозділ Новини.
  let seg = null;
  if (tab === 'events') { seg = 'events'; tab = 'news'; }
  else if (tab === 'news') { seg = 'news'; }
  if (seg && typeof window.cstlShowNewsSegment === 'function') window.cstlShowNewsSegment(seg);

  if (tab === currentTab) return;

  const oldPage = document.getElementById(`page-${currentTab}`);
  const newPage = document.getElementById(`page-${tab}`);
  if (!oldPage || !newPage) return;

  const main = document.querySelector('.app-main');

  // Плавний fade перехід
  newPage.style.opacity = '0';
  newPage.style.display = 'block';

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      oldPage.style.opacity = '0';
      oldPage.style.transition = 'opacity 0.22s ease';
      newPage.style.transition = 'opacity 0.28s ease';
      newPage.style.opacity = '1';

      setTimeout(() => {
        oldPage.style.display = 'none';
        oldPage.style.opacity = '';
        oldPage.style.transition = '';
        newPage.style.transition = '';
        if (main) main.scrollTop = 0;
      }, 220);
    });
  });

  // Оновлюємо активний стан таб-бару
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`.tab-item[data-tab="${tab}"]`);
  if (activeTab) activeTab.classList.add('active');

  // Фон змінюється разом з анімацією — CSS transition 0.3s згладжує
  if (main) main.dataset.tab = tab;

  currentTab = tab;
  window.dispatchEvent(new CustomEvent('cstl-tab-changed'));
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
  let rafId = null;

  const reset = () => {
    inner.style.transition = '';
    inner.style.transform = '';
    inner.style.animation = '';
  };

  inner.addEventListener('touchstart', e => {
    startedOnHandle = handle && (e.target === handle || handle.contains(e.target));
    startedAtTop = inner.scrollTop <= 2;
    const canSwipe = startedOnHandle || startedAtTop;
    if (!canSwipe) {
      startY = e.touches[0].clientY;
      isSwiping = false;
      return;
    }

    inner.style.animation = 'none';
    inner.style.transition = 'none';
    inner.style.transform = 'translateY(0)';
    startY = e.touches[0].clientY;
    isSwiping = false;
  }, { passive: true });

  inner.addEventListener('touchmove', e => {
    if (!startedOnHandle) return;
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
    if (!startedOnHandle || !isSwiping) { if (startedOnHandle) reset(); return; }
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
  });

  inner.addEventListener('touchcancel', () => {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    startedOnHandle = false;
    isSwiping = false;
    inner.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
    inner.style.transform = 'translateY(0)';
    setTimeout(reset, 300);
  });
}

// Прихований доступ до адмінки: 5 тапів на лого «CSTL LIFE» у шапці
// протягом 2 секунд → відкривається ./admin.html у тій самій PWA.
// Адмін знає, звичайний юзер не зрозуміє.
function initAdminShortcut() {
  const logo = document.querySelector('.header-logo');
  if (!logo) return;
  let taps = [];
  logo.style.cursor = 'pointer';
  logo.addEventListener('click', () => {
    const now = Date.now();
    taps = taps.filter(t => now - t < 2000);
    taps.push(now);
    if (taps.length >= 5) {
      taps = [];
      window.location.href = './admin.html';
    }
  });
}

// Хаб «Чати» (Етап 2a — лаунчер): 3 входи переюзовують наявні екрани.
// Повідомлення → overlay-список; Обговорення → Дошка в режимі чату; Групи → скоро (Етап 2b).
function initChatsHub() {
  const page = document.getElementById('page-chats');
  if (!page) return;
  page.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-chats]');
    if (!btn) return;
    const k = btn.dataset.chats;
    if (k === 'messages')        openThreadsList();
    else if (k === 'discussions') openDiscussions();   // повноекранний overlay поверх «Чатів»
    else if (k === 'groups')      openGroupsList();
  });
}

// Hash-routing для інвайт-посилань груп: #/join/<token>. На GitHub Pages (статичний
// хостинг) звичайний шлях дав би 404 — тому вступ через hash. Після обробки чистимо hash.
function handleInviteHash() {
  const m = (location.hash || '').match(/^#\/join\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  openInviteJoin(m[1]);
}

// Ініціалізація при завантаженні сторінки
function init() {
  bootApp();
  initAuth();   // Фаза Б: відновити сесію входу (гість → no-op). Гейтинг ще вимкнено.
  initAccountUI();   // Фаза Б: іконка 👤 в шапці + екрани входу/Кабінету
  initMessages();    // Фаза Б: приватний чат — бейдж непрочитаних + realtime
  initModalSwipe();
  initWeather();
  initCommunity();
  initNews();
  initEvents();
  initBuses();
  initSavedRoutesHeader();   // іконка «Збережені рейси» в хедері (лише на Автобусах)
  initPower();

  // При запуску / поверненні застосунку на передній план — завжди Громада
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') window.switchTab('community');
  });
  initBoard();
  initChatsHub();
  initAdminShortcut();
  handleInviteHash();                              // вступ за посиланням при відкритті
  window.addEventListener('hashchange', handleInviteHash);

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
