import { bootApp } from './core/boot.js';
import { initWeather } from './core/weather.js';
import { initCommunity } from './tabs/community.js';
import { initNews, openArticleById } from './tabs/news.js';
import { initFeed, focusFeedPost } from './tabs/feed.js';   // «Стрічка» (events.js лишається для Етапу 6 — Афіша громади)
import { initBuses, initSavedRoutesHeader } from './tabs/buses.js';
import { initPower } from './tabs/power.js';
import { initBoard, openBoardItemById } from './tabs/board.js';
import { initAuth, currentUserId } from './core/auth.js';
import { logEvent, getAnonId } from './core/supabase.js';
import { initAccountUI } from './core/account-ui.js';
import { initSidebar } from './core/sidebar.js';
import { initConsent } from './core/consent.js';
import { initMessages, openGroupsList, openInviteJoin } from './core/messages-ui.js';
import { initBoardChat, openThreadsList, openThreadById } from './tabs/board-chat.js';
import { initSavedHub } from './core/saved-hub.js';   // хаб «Збережені» в шапці (08.07)
import { initProfileCardTaps } from './core/profile-card.js';   // картка профілю по тапу на аватар

// Поточна активна вкладка
let currentTab = 'community';

// Аналітика (Потік 6, byyou): тип пристрою рахуємо один раз (не змінюється
// протягом сесії) — прикріплюємо до кожної події tab_view.
const _analyticsDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';

// Переключення між вкладками з плавною анімацією
window.switchTab = function(tab) {
  // Слот «Новини» став вкладкою «Шо в селі» (стрічка подій + свят). Новини живуть
  // окремим блоком у Громаді. Legacy-виклики 'news'/'events' (напр. з віджетів
  // Громади «Афіша →») перенаправляємо на 'shotam'.
  if (tab === 'news' || tab === 'events') tab = 'shotam';

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
  logEvent(currentUserId() || getAnonId(), 'tab_view', { tab, meta: { device: _analyticsDevice } });
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
    else if (k === 'discussions') window.switchTab('discussions');   // Обговорення = справжня вкладка
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

// P-9: холодний старт з нотифікації чату — sw.js кладе #/thread/<id> у clients.openWindow(),
// той самий hash-патерн що інвайти груп (GitHub Pages — статичний хостинг, без справжніх шляхів).
function handleThreadHash() {
  const m = (location.hash || '').match(/^#\/thread\/(\d+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  openThreadById(Number(m[1]));
}

// Deep-link на елемент: #/post/<source>/<id>. Крок 6a — `feed` («Стрічка»);
// 6b додає board (оголошення Дошки), disc (Обговорення), news (стаття Новин).
// Той самий hash-патерн (GitHub Pages — статичний хостинг, без справжніх шляхів).
function handlePostHash() {
  const m = (location.hash || '').match(/^#\/post\/(feed|board|disc|news)\/(\d+)/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const [, source, id] = m;
  const n = Number(id);
  if      (source === 'feed')              focusFeedPost(n);
  else if (source === 'board' || source === 'disc') openBoardItemById(n);
  else if (source === 'news')              openArticleById(n);
}

// Ініціалізація при завантаженні сторінки
function init() {
  bootApp();
  initAuth();   // Фаза Б: відновити сесію входу (гість → no-op). Гейтинг ще вимкнено.
  initAccountUI();   // Фаза Б: іконка 👤 в шапці + екрани входу/Кабінету
  initSidebar();     // Бічне меню (бургер зліва) + «Кабінет» лише для команди
  initConsent();     // Банер згоди з Політикою/Правилами (перший вхід)
  initMessages();    // Групи (V2 Чати): доведення відкладеного вступу за посиланням
  initBoardChat();   // Приватний чат Дошки: бейдж непрочитаних + push-пристрій + realtime
  initModalSwipe();
  initWeather();
  initCommunity();
  initNews();
  initFeed();            // «Стрічка» — сторінки-канали (замінила стрічку подій «Шо в селі»)
  initBuses();
  initSavedRoutesHeader();   // дані відстеження + банер (Б7.3: без окремої іконки — тепер через хаб)
  initSavedHub();            // хаб «Збережені» (іконка 🔖 в шапці)
  initPower();

  // Вкладку при згортанні/поверненні застосунку НЕ скидаємо (Вова 22.07): раніше
  // visibilitychange→switchTab('community') перекидав на Громаду щоразу при
  // поверненні з фону — навіть якщо сидів в Обговореннях з відкритою модалкою.
  // Скидання на головну лишається лише при СВІЖОМУ завантаженні/перезавантаженні
  // (currentTab за замовчуванням = 'community', сторінка community видима стартово).
  initBoard();
  initChatsHub();
  initProfileCardTaps();   // тап по аватару → картка профілю
  initAdminShortcut();
  handleInviteHash();                              // вступ за посиланням при відкритті
  window.addEventListener('hashchange', handleInviteHash);
  handleThreadHash();                              // P-9: холодний старт з нотифікації чату
  window.addEventListener('hashchange', handleThreadHash);
  handlePostHash();                                // deep-link на пост «Стрічки»
  window.addEventListener('hashchange', handlePostHash);

  // Аналітика: switchTab() рано виходить коли tab===currentTab, тому початковий
  // перегляд дефолтної вкладки (Громада, currentTab вже 'community') інакше
  // ніколи б не залогувався.
  logEvent(currentUserId() || getAnonId(), 'tab_view', { tab: currentTab, meta: { device: _analyticsDevice } });

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
