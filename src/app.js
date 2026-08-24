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
import { attachSheetDismiss } from './core/sheet-motion.js';    // спільний свайп-закриття аркушів (15.08 — модалка статті теж на ньому)
import { initRefreshOnReturn, onReturn, forceReturnRefresh } from './core/refresh-on-return.js';   // «повернувся на вкладку → бачиш свіже» (07.08)
import { showToast } from './core/utils.js';                    // тост для перемикача діагностики
import { markSplashGone } from './core/splash.js';              // сигнал «заставка зійшла» для deep-link'ів (15.08)
import { healPushEndpoint, onPushEndpointChanged } from './core/push.js';   // ротація push-підписки (16.08)
import { migratePushEndpoint } from './core/supabase.js';                   // перенос підписок на нову адресу
import { guardAppRoot } from './core/layers.js';                // «назад» з кореня не вивалює в порожню вкладку (15.08)

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
// 🔴 08.08, ТРЕТЯ РЕДАКЦІЯ — ЗА РІВНІСТЮ КАДРІВ, А НЕ ЗА ВІДЧУТТЯМ.
// Вова: «зроби, щоб плавний скрол був максимально плавний і візуально технічно
// правильний, як це в Apple, в інстаграмі… зараз ніби не ривками, але складається
// відчуття перепадами».
// 📐 ЗАМІРЯНО покадрово (Chromium, 390×844, підйом з 1607px). Кадри йшли РІВНО по
//    17мс, жодного пропущеного — тобто «ривки» були не від втрачених кадрів.
//    Проблема в іншому: дельта на кадр стрибала
//      2 · 6 · 12 · 20 · 31 · 43 · 58 · 75 · 93 · 114 · 139 · 163 · **176** · 149 …
//    Пік 176px за кадр — це пʼята частина екрана за 1/60 секунди, та ще й після
//    старту в 2px. Око бачить не швидкість, а РІЗНИЦЮ між сусідніми кадрами, і саме
//    вона тут гуляла в 88 разів. Це і є «перепади».
// 🔑 Лікується не «ще плавнішою» кривою на слух, а вибором кривої з найменшим
//    відношенням піку до середнього. У easeInOutCubic воно ≈2.75, у синуса — π/2
//    (≈1.57), тобто майже вдвічі рівніше. Плюс довша тривалість зменшує середню
//    дельту, від якої той пік і рахується.
// ⏱ Тривалість тепер росте з відстанню помітніше (0.24 замість 0.11) і має вищу
//    стелю. Це свідомий розмін: доїзд на пів секунди довший, зате рух суцільний.
const UP_MIN_MS = 380;
const UP_MAX_MS = 900;

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

  const тривалість = Math.min(UP_MAX_MS, Math.max(UP_MIN_MS, 280 + старт * 0.24));
  const t0 = performance.now();
  // easeInOutSine: розгін і гальмування є, але найрівніші з можливих — пік швидкості
  // лише в π/2 рази вищий за середню (у кубічної було ≈2.75).
  const крива = (t) => 0.5 * (1 - Math.cos(Math.PI * t));

  const крок = (зараз) => {
    const t = Math.min(1, (зараз - t0) / тривалість);
    // ⚠️ БЕЗ `Math.round`: дробовий `scrollTop` браузер відмальовує з субпіксельною
    //    точністю. Округлення додавало власне тремтіння на повільних ділянках —
    //    два сусідні кадри могли дати однакове ціле, тобто видимий «застій».
    main.scrollTop = старт * (1 - крива(t));
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

  // 🔴 08.08 — ПЕРЕХІД МИТТЄВИЙ, БЕЗ ПЕРЕХРЕСНОГО ЗГАСАННЯ. І це фікс бага, а не смак.
  //
  // Скарга Вови: «натискаю на іншу сторінку — спочатку блимає верхня частина екрана,
  // потім перемикає. Це повинно вмикати іншу сторінку. Без блимання, без підтягування
  // доверху, без згасання».
  //
  // 🔑 ПРИЧИНА — МОЯ Ж ПОПЕРЕДНЯ ЗМІНА, і вона не була видна з коду.
  // Було так: нова сторінка отримувала `display:block` (прозора), стара лишалась
  // видимою ще 220мс на час згасання. Тобто ОБИДВІ сторінки одночасно стояли в
  // потоці, одна під одною — `#page-*` це звичайні блоки, а `.app-main` один
  // скролер на весь застосунок. І саме в цей момент код ставив `scrollTop`,
  // запамʼятаний для НОВОЇ вкладки. Але поки стара сторінка ще в потоці, нуль — це
  // верх СТАРОЇ сторінки. Людина бачила кадр чужої шапки, а за 220мс, коли стару
  // ховали, вміст стрибав на місце. Це і є «блимає верхня частина екрана».
  // ⚠️ Раніше цього не було лише тому, що скидання прокрутки стояло в
  //    `setTimeout(…, 220)` — тобто після приховування старої. Але саме той порядок
  //    давав інший дефект, на який Вова скаржився вранці (ривок при переході).
  //
  // ➡️ Тому обидві сторінки більше НІКОЛИ не стоять у потоці одночасно: ховаємо
  //    стару і показуємо нову в одному синхронному кроці, і лише тоді ставимо
  //    прокрутку. Браузер малює один кадр — уже правильний. Проміжного стану, який
  //    можна побачити, не існує в принципі, а не «він короткий».
  // 🛑 Не повертати згасання: воно вимагає тримати дві сторінки живими водночас, а
  //    з одним спільним скролером це знову зламає прокрутку. Хочеться анімації —
  //    вона має бути на `transform` накладених шарів, а не на `display`+`opacity`.
  oldPage.style.display = 'none';
  oldPage.style.opacity = '';
  oldPage.style.transition = '';
  newPage.style.display = 'block';
  newPage.style.opacity = '';
  newPage.style.transition = '';

  if (main) {
    _scrollByTab.set(currentTab, минуле);
    main.scrollTop = _scrollByTab.get(tab) || 0;   // перший вхід → 0
  }

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

// Свайп вниз для закриття модалки статті.
//
// 🔴 15.08 (plans/001) — ВЛАСНИЙ ЖЕСТ ЗНЯТО, поведінку віддано спільному
// `attachSheetDismiss()` із `core/sheet-motion.js`. Це було ОСТАННЄ місце в
// застосунку з самописним свайпом-закриттям; решта зон (`core/modal.js`,
// `saved-hub`, «Стрічка», Дошка, Питання) сидять на ньому з 10.08.
//
// Що саме полагодила заміна — чотири вади, кожна вимірна (повний розбір із
// цитатами старого коду — `plans/001-article-modal-shared-swipe.md`):
//   (а) крива закриття мала ПОВІЛЬНИЙ СТАРТ, тобто гальмувала рівно ту мить, на
//       яку людина дивиться. Та сама вада, що в банері автобусів (plans/002) і
//       в `style/buses.css`, звідки її прибрали 12.08.
//   (б) крива була вписана числом ДВІЧІ — а це рівно `SHEET_EASE` / токен
//       `--ease-drawer`; тепер береться з одного місця.
//   (в) поріг закриття був ТІЛЬКИ по відстані, тож швидкий короткий кидок —
//       головний жест на iPhone — модалку не закривав. Спільний `finishSwipe()`
//       рахує ще й швидкість пальця.
//   (г) таймер прибирання вузла був на 10мс КОРОТШИЙ за сам рух. Тепер час
//       доїзду рахує механізм і сам віддає його в `onDismiss(ms)`.
// Заразом зникла неоголошена змінна-прапорець «скрол на самому верху»: вона
// писалась у ГЛОБАЛЬНУ область, бо в `bundle.js` немає суворого режиму — помилки
// не було, і побачити її було нічим.
//
// 🛑 Контролі плану — це `grep` по цьому файлу (кривих і таймерів тут лишитись не
// має). Тому вади описані СЛОВАМИ: коментар, що цитує прибрану ваду дослівно,
// завалює перевірку на цю ваду. За сесію 15.08 я наступив на це тричі.
function initModalSwipe() {
  const inner = document.querySelector('.article-modal-inner');
  if (!inner) return;
  attachSheetDismiss({
    panel: inner,
    scroller: inner,          // у цієї модалки панель сама собі скролер
    backdrop: null,           // затемнення тут знімає closeArticleModal()
    onDismiss: (ms) => setTimeout(window.closeArticleModal, ms),
    headerZone: 64,           // смуга з рисочкою .modal-handle
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
  // 🛑 ПОРЯДОК КРИТИЧНИЙ І ДОВЕДЕНИЙ ВИМІРОМ: спершу прибираємо хеш, і лише
  // потім ставимо запобіжник. Перша редакція робила навпаки — `replaceState`
  // затирав щойно покладений запис (`{cstlRoot:1}` → `null`), а хеш лишався на
  // записі ПІД ним. Тому третій «назад» повертав `#/thread/<id>`, слухач
  // `hashchange` спрацьовував удруге і чат відкривався заново.
  // Заміряно приладом: стан `{cstlLayer:4}` замість кореня.
  history.replaceState(null, '', location.pathname + location.search);
  // Сеанс почався зі СПОВІЩЕННЯ: вкладка свіжа, позаду порожньо (див. layers.js).
  guardAppRoot();
  openThreadById(Number(m[1]));
}

// Deep-link на елемент: #/post/<source>/<id>. Крок 6a — `feed` («Стрічка»);
// 6b додає board (оголошення Дошки), disc (Обговорення), news (стаття Новин).
// Той самий hash-патерн (GitHub Pages — статичний хостинг, без справжніх шляхів).
function handlePostHash() {
  // ?c=<id> — сповіщення про коментар: відкрити не просто пост, а й лист коментарів
  // із підсвіченим рядком. Хвіст необовʼязковий, тож старі посилання працюють як досі.
  // `?c=` приймає або НОМЕР коментаря (підсвітити рядок), або `all` — «просто
  // відкрий лист» (зведене сповіщення «Ще N коментарів»: одного коментаря там нема).
  const m = (location.hash || '').match(/^#\/post\/(feed|board|disc|news)\/(\d+)(?:\?c=(\d+|all))?/);
  if (!m) return;
  history.replaceState(null, '', location.pathname + location.search);
  guardAppRoot();   // ⚠️ САМЕ ПІСЛЯ replaceState — див. пояснення в handleThreadHash
  const [, source, id, commentId] = m;
  const n = Number(id);
  if      (source === 'feed')              focusFeedPost(n, commentId === 'all' ? 'all' : (commentId ? Number(commentId) : null));
  // 🆕 23.08 — `?c=` тепер працює і для ПИТАНЬ: веде до тієї самої відповіді,
  // про яку прийшло сповіщення. Раніше хвіст тут розпізнавався, але мовчки
  // відкидався — тобто посилання доводило людину до питання й лишало шукати
  // репліку очима. `all` (зведене «N нових відповідей») якоря не має навмисно:
  // одного винуватця там немає, і підсвітити довелось би навмання.
  else if (source === 'board' || source === 'disc') {
    openBoardItemById(n, (commentId && commentId !== 'all') ? Number(commentId) : null);
  }
  else if (source === 'news')              openArticleById(n);
}

// Deep-link на ВКЛАДКУ ЦІЛКОМ: #/tab/<назва>.
//
// 🔴 Заведено 24.08 разом із типом 4 («у громаді питання без відповіді»).
// Доти deep-link умів вести ЛИШЕ в конкретний запис — і зведене сповіщення
// «5 питань чекають на відповідь» не мало куди вести чесно: відкривши одне з
// пʼяти, воно збрехало б про решту чотири. Це те саме правило, за яким 23.08
// зведене «N нових відповідей» отримало `?c=all`: **тап мусить вести туди, що
// обіцяє текст** (`HOT_RULES` №12).
//
// 🔑 Назви в посиланні КОРОТКІ й ті самі, що вже вживаються в `#/post/<source>/`
// (`disc`, `feed`, `board`), а не внутрішні імена вкладок (`discussions`,
// `shotam`). Одне слово в посиланні має означати одне й те саме скрізь, інакше
// наступного разу доведеться згадувати, яке з двох імен тут доречне.
// ⚠️ Невідома назва просто ігнорується: сповіщення, надіслане новішою версією
// функції, не мусить кидати помилку в старішому застосунку.
const TAB_BY_HASH = {
  disc: 'discussions', feed: 'shotam', board: 'board',
  community: 'community', buses: 'buses', power: 'power',
};
function handleTabHash() {
  const m = (location.hash || '').match(/^#\/tab\/([a-z]+)/);
  if (!m) return;
  const tab = TAB_BY_HASH[m[1]];
  history.replaceState(null, '', location.pathname + location.search);
  guardAppRoot();   // ⚠️ САМЕ ПІСЛЯ replaceState — див. пояснення в handleThreadHash
  if (tab) window.switchTab?.(tab);
}

// ── ЗАСТАВКА: ЗНИКАЄ, КОЛИ ЕКРАН ГОТОВИЙ, А НЕ ЗА РОЗКЛАДОМ (16.08) ──────────
//
// 🔴 БУЛО: `setTimeout(…, 3500)` + 600мс на згасання = **4.1 секунди БЕЗУМОВНО**,
// на кожному відкритті застосунку, кожного дня. Час не залежав ні від чого: дані
// могли приїхати за 200мс — людина однаково дивилась на логотип. Це найдорожча
// пауза в продукті, і вона була найпомітнішою саме для тих, хто заходить часто.
//
// 🔑 ЧОМУ ЦЕ БЕЗПЕЧНО ДЛЯ DEEP-LINK'ІВ (полагоджених 15.08). Вони чекають не на
// число 3500, а на СИГНАЛ `markSplashGone()` (`core/splash.js`). Тобто підсвітка
// коментаря і відкриття розмови однаково відбудуться ПІСЛЯ заставки — просто вона
// тепер зійде раніше. Правило «показова частина чекає заставку» не змінилось.
//
// ⏱ ДВІ МЕЖІ, і обидві потрібні:
//   MIN — інакше заставка блимне (з'явилась і зникла за 200мс = смикання, гірше
//         за саме очікування);
//   MAX — запобіжник: якщо перший кадр із якоїсь причини не настав, людина не
//         має лишитись перед логотипом назавжди. Це та сама стеля, що була.
// 🔑 Готовність міряємо ПОДВІЙНИМ `requestAnimationFrame`: перший кадр — коли
//    браузер прийняв побудований DOM, другий — коли він його справді намалював.
const SPLASH_MIN_MS = 700;
const SPLASH_MAX_MS = 3500;

function hideSplashWhenReady() {
  const splash = document.getElementById('splash');
  if (!splash) { markSplashGone(); return; }

  let done = false;
  const t0 = performance.now();
  const hide = () => {
    if (done) return;
    done = true;
    splash.style.transition = 'opacity 0.4s';
    splash.style.opacity = '0';
    setTimeout(() => { splash.remove(); markSplashGone(); }, 420);
  };

  const whenPainted = () => {
    const left = Math.max(0, SPLASH_MIN_MS - (performance.now() - t0));
    setTimeout(hide, left);
  };
  requestAnimationFrame(() => requestAnimationFrame(whenPainted));
  setTimeout(hide, SPLASH_MAX_MS);   // запобіжник, не основний шлях
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
  // 🔴 16.08 — АДРЕСА PUSH-ПІДПИСКИ САМОЛІКУЄТЬСЯ. Браузер час від часу
  // перевипускає підписку; стара адреса мертва, і сповіщення тихо перестають
  // приходити при увімкненому дзвіночку. Два рубежі: сигнал від `sw.js` (миттєво,
  // якщо застосунок відкритий) і звірка при старті (ловить ротацію, що сталась,
  // поки застосунок був закритий). Деталі — `core/push.js`.
  onPushEndpointChanged(() => currentUserId(), migratePushEndpoint);
  healPushEndpoint(currentUserId(), migratePushEndpoint);
  initAdminShortcut();     // 5 тапів по лічильнику версії → адмінка
  initKbDebugShortcut();   // 5 тапів по назві «CSTL LIFE» → діагностика клавіатури
  handleInviteHash();                            // вступ за посиланням при відкритті
  window.addEventListener('hashchange', handleInviteHash);
  handleThreadHash();                              // P-9: холодний старт з нотифікації чату
  window.addEventListener('hashchange', handleThreadHash);
  handlePostHash();                                // deep-link на пост «Стрічки»
  window.addEventListener('hashchange', handlePostHash);
  handleTabHash();                                 // deep-link на вкладку (тип 4)
  window.addEventListener('hashchange', handleTabHash);

  // Тап по системному сповіщенню, коли додаток УЖЕ відкритий. Холодний старт працював
  // (sw.js відкриває вікно на deep-link), а тут раніше вікно лише фокусувалось — і
  // користувач лишався там, де був. Тепер sw.js форвардить url → застосовуємо його як
  // hash і відкриваємо саме той елемент (пост «Стрічки», оголошення, стаття).
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', e => {
      const d = e.data;
      if (!d || d.__cstl !== 'notif-click') return;
      // 🔴 15.08 — ПРИВАТНЕ ЛИСТУВАННЯ ОБРОБЛЯЄМО ПЕРШИМ. Скарга Вови: «якщо
      // прийшло приватне повідомлення і я натискаю на сповіщення — мене має
      // перекидати прямо в той чат».
      // 🔑 Раніше воно НЕ працювало при ВІДКРИТОМУ застосунку, і відсіювалось аж
      // двічі: `send-chat-push` шле не `url`, а `thread_id`, тож умова `!d.url`
      // виходила одразу; а якби й дійшло, `url: './'` не містить `#`, і другий
      // рубіж (`indexOf('#') < 0`) відкинув би теж. При ХОЛОДНОМУ старті чат
      // відкривався правильно — там інша гілка (`#/thread/<id>` у `sw.js`), і
      // саме тому вада виглядала як «іноді працює».
      if (d.threadId != null) { openThreadById(Number(d.threadId)); return; }
      if (!d.url) return;
      const i = String(d.url).indexOf('#');
      if (i < 0) return;                           // url без deep-link — нічого відкривати
      location.hash = String(d.url).slice(i);
      handlePostHash();                            // ідемпотентно: сам чистить hash після відкриття
      // 🔑 І вкладка теж: зведене «N питань чекають» веде саме сюди, а не в
      // окремий запис. Обидва обробники самі виходять, якщо хеш не їхній, тож
      // порядок значення не має.
      handleTabHash();
    });
  }

  // Аналітика: switchTab() рано виходить коли tab===currentTab, тому початковий
  // перегляд дефолтної вкладки (Громада, currentTab вже 'community') інакше
  // ніколи б не залогувався.
  logEvent(currentUserId() || getAnonId(), 'tab_view', { tab: currentTab, meta: { device: _analyticsDevice } });

  // Splash screen — прибираємо після завантаження.
  // 🔴 15.08 — `markSplashGone()` НЕ косметика: на нього чекає показова частина
  // deep-link'ів (розмова зі сповіщення, підсвітка коментаря). Без сигналу вони
  // спрацьовували ПІД заставкою — див. `src/core/splash.js`.
  hideSplashWhenReady();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
