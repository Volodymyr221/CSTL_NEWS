import { bootApp } from './core/boot.js';
import { initWeather } from './core/weather.js';
import { initCommunity } from './tabs/community.js';
import { initNews, openArticleById } from './tabs/news.js';
import { initFeed, focusFeedPost } from './tabs/feed.js';   // «Стрічка» (events.js лишається для Етапу 6 — Афіша громади)
import { initBuses, initSavedRoutesHeader } from './tabs/buses.js';
import { initPower } from './tabs/power.js';
import { initBoard, openBoardItemById } from './tabs/board.js';
import { initAuth, currentUserId, refreshOwnProfile } from './core/auth.js';
import { passDevLock } from './core/dev-lock.js';   // заслінка «Додаток у розробці» (замок на час доробки)
import { logEvent, getAnonId } from './core/supabase.js';
import { initAccountUI } from './core/account-ui.js';
import { initSidebar } from './core/sidebar.js';
import { initConsent } from './core/consent.js';
import { initInstallBanner } from './core/install-banner.js';
import { initMessages, openGroupsList, openInviteJoin } from './core/messages-ui.js';
import { initBoardChat, openThreadsList, openThreadById } from './tabs/board-chat.js';
import { initSavedHub } from './core/saved-hub.js';   // хаб «Збережені» в шапці (08.07)
import { initProfileCardTaps } from './core/profile-card.js';   // картка профілю по тапу на аватар
import { initRefreshOnReturn, onReturn, forceReturnRefresh } from './core/refresh-on-return.js';   // «повернувся на вкладку → бачиш свіже» (07.08)
import { showToast } from './core/utils.js';                    // тост для перемикача діагностики

// Поточна активна вкладка
let currentTab = 'community';

// Аналітика (Потік 6, byyou): тип пристрою рахуємо один раз (не змінюється
// протягом сесії) — прикріплюємо до кожної події tab_view.
const _analyticsDevice = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';

// 🔴 08.08 — ЗАПАМʼЯТАНА ПРОКРУТКА КОЖНОЇ ВКЛАДКИ (див. пояснення у `switchTab`).
// Ключ — імʼя вкладки, значення — `scrollTop` на момент виходу з неї.
// ⚠️ У памʼяті, а не в `sessionStorage`: це стан ОДНОГО сеансу роботи, і переживати
// перезапуск застосунку він не має — свіжий старт має починатись згори.
const _scrollByTab = new Map();

// 🔴 08.08, друга редакція — ПІДЙОМ ДОВЕРХУ З РОЗГОНОМ.
//
// Перша редакція мала поріг: ближче двох екранів — плавно, далі — миттєвий стрибок.
// Вова подивився на живому екрані і відхилив: *«щоб воно не різко так пропало і
// зʼявилося, а щоб плавно проскролювалось до верху… треба створити відчуття плавного
// піднімання доверху, що воно там починає піднімати і набирає швидкість. Так це в
// інстаграмі і всіх інших соцмережах»*. Тобто важлива не швидкість доїзду, а те, що
// рух ВИДНО — він і є відповіддю застосунку на тап.
//
// 🔑 ЧОМУ ВЛАСНА АНІМАЦІЯ, А НЕ `behavior: 'smooth'`. Рідний плавний скрол має
// незмінну криву і тривалість, яку задає браузер: на 3000px він повзе помітно довше,
// ніж на 300px, і жодного «набирає швидкість» у ньому немає — навпаки, він гальмує
// майже одразу. Тут крива наша: старт мʼякий, середина найшвидша, доїзд угору —
// сповільнення. Це рівно те, що описав Вова, і те, що роблять стрічки соцмереж.
//
// ⏱ Тривалість росте з відстанню, але має стелю: 3000px не мають їхати вчетверо
// довше за 750px, інакше «швидко нагору» перестає бути швидко. Нижня межа тримає
// рух помітним навіть на коротких відстанях (інакше 200px зникли б за один кадр і
// знову читались би як стрибок).
const UP_MIN_MS = 300;
const UP_MAX_MS = 620;

// ⚠️ Повага до системного налаштування «зменшити рух» (iOS: Доступність → Рух).
// Людині, яка його ввімкнула, анімація може бути фізично неприємна — для неї
// переносимось миттєво. Це не «менш якісний варіант», а інший правильний.
function reducedMotion() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

let _upAnim = null;
function stopScrollUp() {
  if (_upAnim) { cancelAnimationFrame(_upAnim); _upAnim = null; }
}

function animateScrollUp(main) {
  const старт = main.scrollTop;
  if (старт <= 0) return;
  stopScrollUp();                       // другий тап підхоплює рух, а не бʼється з ним
  if (reducedMotion()) { main.scrollTop = 0; return; }

  const тривалість = Math.min(UP_MAX_MS, Math.max(UP_MIN_MS, 260 + старт * 0.11));
  const t0 = performance.now();
  // easeInOutCubic: мʼякий старт → розгін → мʼяке приземлення вгорі.
  const крива = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  const крок = (зараз) => {
    const t = Math.min(1, (зараз - t0) / тривалість);
    main.scrollTop = Math.round(старт * (1 - крива(t)));
    _upAnim = t < 1 ? requestAnimationFrame(крок) : null;
  };
  _upAnim = requestAnimationFrame(крок);
}

// 🛑 ПАЛЕЦЬ ЗАВЖДИ ГОЛОВНІШИЙ ЗА АНІМАЦІЮ. Торкнувся екрана під час підйому —
// підйом спиняється негайно. Без цього застосунок «тягнув би вгору» проти руки,
// і це відчувалось би як зависання, а не як плавність.
// Слухачі ставимо ОДИН раз на вікно (не з рендера) — інакше вони накопичувались би.
['touchstart', 'wheel', 'pointerdown'].forEach(ev =>
  window.addEventListener(ev, stopScrollUp, { passive: true }));

// Повторний тап по активній вкладці: вгору + легке оновлення даних.
function scrollTabToTop() {
  const main = document.querySelector('.app-main');
  if (!main) return;
  if (main.scrollTop > 0) {
    animateScrollUp(main);
    _scrollByTab.set(currentTab, 0);
  }
  // 🔑 «Легке оновлення» — це НЕ новий механізм. Той самий примітив, що працює при
  // поверненні на вкладку (`core/refresh-on-return.js`): перечитує дані на місці, без
  // перезавантаження сторінки і без блимання, і має власний поріг проти шквалу.
  // Тап по активній вкладці — просто ще один законний привід його покликати.
  forceReturnRefresh();
}

// Переключення між вкладками з плавною анімацією
window.switchTab = function(tab) {
  // Слот «Новини» став вкладкою «Шо в селі» (стрічка подій + свят). Новини живуть
  // окремим блоком у Громаді. Legacy-виклики 'news'/'events' (напр. з віджетів
  // Громади «Афіша →») перенаправляємо на 'shotam'.
  if (tab === 'news' || tab === 'events') tab = 'shotam';

  // 🔴 08.08 — ПОВТОРНИЙ ТАП ПО АКТИВНІЙ ВКЛАДЦІ = ВГОРУ + ЛЕГКЕ ОНОВЛЕННЯ.
  // Замовлення Вови: «прокрутив вниз до самого низу і хоче швидко повернутися наверх,
  // щоб пальцем не скролити — може ще раз натиснути на стрічку, як це в Instagram».
  // Було: `if (tab === currentTab) return` — тап по активній вкладці не робив НІЧОГО.
  if (tab === currentTab) { scrollTabToTop(); return; }

  const oldPage = document.getElementById(`page-${currentTab}`);
  const newPage = document.getElementById(`page-${tab}`);
  if (!oldPage || !newPage) return;

  // 🛑 Підйом угору, якщо він саме триває, спиняємо ДО зміни вкладки: інакше його
  // кадри писали б `scrollTop` уже НОВІЙ сторінці й затирали її власне зміщення.
  // Вкладка при цьому запамʼятає те місце, де її справді лишили.
  stopScrollUp();

  const main = document.querySelector('.app-main');

  // 🔴 08.08 — ПРОКРУТКА У КОЖНОЇ ВКЛАДКИ СВОЯ.
  //
  // Скарга Вови: «прокрутив дві повних сторінки на Дошці, переходжу на Громаду — і
  // такий самий діапазон прокруту зразу відображається на Громаді, а потім різко
  // переключається на початок».
  //
  // 🔑 Причина не в тому, що сторінки «синхронізовані», а в тому, що сторінка ОДНА:
  // `.app-main` — єдиний скролер застосунку (`style/base.css`), усі `#page-*` лежать
  // усередині нього. Прокрутка не «передається» між вкладками — вона фізично та сама.
  // А ривок давало те, що скидання `scrollTop = 0` стояло в `setTimeout(…, 220)`, тобто
  // ПІСЛЯ того, як нова вкладка вже намальована: спершу кадр на чужому зміщенні, за
  // 220мс — стрибок угору.
  //
  // Лікуємо не скиданням раніше (тоді вкладка просто завжди починалась би згори, і
  // повернення на Дошку губило б місце), а ПАМʼЯТТЮ на вкладку: йдемо — запамʼятали,
  // входимо — поставили її власне зміщення ще ДО першого кадру.
  // ⚠️ Запамʼятовуємо ДО показу нової сторінки, а ставимо ПІСЛЯ: поки нова сторінка
  // ще прихована, скролер не має її висоти, і задане зміщення браузер обрізав би по
  // старій межі. Порядок «зберегли → показали → поставили» — єдиний, за якого обидві
  // величини правдиві.
  const минуле = main ? main.scrollTop : 0;

  // Плавний fade перехід
  newPage.style.opacity = '0';
  newPage.style.display = 'block';

  if (main) {
    _scrollByTab.set(currentTab, минуле);
    main.scrollTop = _scrollByTab.get(tab) || 0;   // перший вхід → 0
  }

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

// ── Два приховані входи в шапці (обидва — 5 тапів протягом 2 секунд) ──────────
// Знає адмін, звичайний користувач не здогадається.
// Спільний рахувальник 5 тапів (обидва приховані входи в шапці користуються ним).
// Було двома майже однаковими копіями — злито в одну, щоб не розходились (HOT_RULE 8).
// Вікно 2с: тапи, розсунуті в часі, не накопичуються у випадкове спрацювання.
function onFiveTaps(el, action) {
  if (!el) return;
  let taps = [];
  el.style.cursor = 'pointer';
  el.addEventListener('click', () => {
    const now = Date.now();
    taps = taps.filter(t => now - t < 2000);
    taps.push(now);
    if (taps.length < 5) return;
    taps = [];
    action();
  });
}

// Перемикач режиму діагностики клавіатури — 5 тапів по НАЗВІ ДОДАТКУ «CSTL LIFE»
// (шапка, зліва). Місце обрав Вова 26.07: «забери адмінку з тапу по назві додатку
// зверху зліва в шапці та додай туди оці п'ять тапів щоб включити оцю діагностику».
// НАВІЩО жест узагалі: `#kbdebug` в адресі працює лише у вкладці Safari, а тестування
// йде у ВСТАНОВЛЕНОМУ додатку, де адресного рядка нема — і саме там клавіатура
// поводиться інакше. Без цього діагностику на реальному місці не ввімкнути.
function initKbDebugShortcut() {
  onFiveTaps(document.querySelector('.header-logo'), () => {
    const on = localStorage.getItem('kbdebug') === '1';
    if (on) localStorage.removeItem('kbdebug'); else localStorage.setItem('kbdebug', '1');
    showToast(on ? 'Діагностика клавіатури ВИМКНЕНА' : 'Діагностика клавіатури УВІМКНЕНА — відкрий коментарі', 3500);
  });
}

// Вхід в адмінку переїхав з лого на ЛІЧИЛЬНИК ВЕРСІЇ (`.deploy-stamp` — сірий напис
// по центру шапки). Вова просив звільнити лого під діагностику; сам вхід прибирати
// не просив, а без нього адмінка стала б недосяжною у встановленому додатку (там
// нема адресного рядка, щоб набрати ./admin.html руками). Тож не видалив, а переставив.
function initAdminShortcut() {
  onFiveTaps(document.querySelector('.deploy-stamp'), () => {
    window.location.href = './admin.html';
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
  // ?c=<id> — сповіщення про коментар: відкрити не просто пост, а й лист коментарів
  // із підсвіченим рядком. Хвіст необовʼязковий, тож старі посилання працюють як досі.
  const m = (location.hash || '').match(/^#\/post\/(feed|board|disc|news)\/(\d+)(?:\?c=(\d+))?/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  const [, source, id, commentId] = m;
  const n = Number(id);
  if      (source === 'feed')              focusFeedPost(n, commentId ? Number(commentId) : null);
  else if (source === 'board' || source === 'disc') openBoardItemById(n);
  else if (source === 'news')              openArticleById(n);
}

// Ініціалізація при завантаженні сторінки
async function init() {
  bootApp();
  initAuth();   // Фаза Б: відновити сесію входу (гість → no-op). Гейтинг ще вимкнено.

  // 🔴 ЗАСЛІНКА РОЗРОБКИ (Вова 30.07) — стоїть ТУТ і не нижче.
  // Чому саме після initAuth() і до всього іншого: заслінці потрібна відновлена
  // сесія входу (щоб знати пошту), але жоден екран застосунку не має встигнути
  // намалюватись — інакше чужа людина побачила б Громаду під заслінкою у момент
  // завантаження. Поки доступу немає, `passDevLock()` не завершується взагалі:
  // ми просто не доходимо до решти init(), а на екрані лишається заслінка.
  // Знімається одним рядком — `DEV_LOCK = false` у core/dev-lock.js.
  if (!await passDevLock()) return;

  initAccountUI();   // Фаза Б: іконка 👤 в шапці + екрани входу/Кабінету
  initSidebar();     // Бічне меню (бургер зліва) + «Кабінет» лише для команди
  initConsent();     // Банер згоди з Політикою/Правилами (перший вхід)
  initInstallBanner();   // Банер «Відкрий/встанови у додатку» — лише в браузері (не в PWA)
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
  // 🔴 07.08 — САМООНОВЛЕННЯ ПУБЛІЧНИХ ДАНИХ. Кличеться БЕЗ умов і після всіх
  // init-ів зон: базовий контракт (свіжі імена й фото при поверненні) має діяти
  // навіть там, де зона нічого свого не підписала. Зонна робота — через
  // `onReturn(...)` у самих зонах, а не списком тут.
  initRefreshOnReturn();
  // Власний профіль — окремий кеш в `auth.js`, тож окрема підписка.
  onReturn('', () => refreshOwnProfile());
  initAdminShortcut();     // 5 тапів по лічильнику версії → адмінка
  initKbDebugShortcut();   // 5 тапів по назві «CSTL LIFE» → діагностика клавіатури
  handleInviteHash();                            // вступ за посиланням при відкритті
  window.addEventListener('hashchange', handleInviteHash);
  handleThreadHash();                              // P-9: холодний старт з нотифікації чату
  window.addEventListener('hashchange', handleThreadHash);
  handlePostHash();                                // deep-link на пост «Стрічки»
  window.addEventListener('hashchange', handlePostHash);

  // Тап по системному сповіщенню, коли додаток УЖЕ відкритий. Холодний старт працював
  // (sw.js відкриває вікно на deep-link), а тут раніше вікно лише фокусувалось — і
  // користувач лишався там, де був. Тепер sw.js форвардить url → застосовуємо його як
  // hash і відкриваємо саме той елемент (пост «Стрічки», оголошення, стаття).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', e => {
      const d = e.data;
      if (!d || d.__cstl !== 'notif-click' || !d.url) return;
      const i = String(d.url).indexOf('#');
      if (i < 0) return;                           // url без deep-link — нічого відкривати
      location.hash = String(d.url).slice(i);
      handlePostHash();                            // ідемпотентно: сам чистить hash після відкриття
    });
  }

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
