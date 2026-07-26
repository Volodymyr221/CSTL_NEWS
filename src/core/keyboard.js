// ── Клавіатура на мобільних: єдине місце правди для всіх нижніх аркушів ──────────
//
// НАВІЩО ЦЕЙ ФАЙЛ (історія трьох невдалих спроб — читай перед правками):
//   Спроба 1 (#611): роздували padding-bottom аркуша. Не тримало: iOS підіймав УВЕСЬ
//     фіксований оверлей, бо оверлей прибитий до inset:0 РОЗМІТКИ сторінки.
//   Спроба 2 (#612): додали замок body. Хибна засновка «замок → offsetTop лишиться 0»:
//     Safari зсуває ВИДИМУ область (visual viewport) окремо від скролу документа.
//   Спроба 3 (#613): прибили оверлей до видимої області — правильний хід, але висоту
//     аркуша рахували як `82svh − kb`, де kb = innerHeight − vv.height. Три різні
//     системи координат (svh, innerHeight, visual viewport) в одній формулі — і будь-яка
//     розбіжність між ними (а на iOS вони не збігаються) зсуває верх.
//
// ЩО РОБИТЬ ЦЕЙ МОДУЛЬ ІНАКШЕ: не рахує нічого через одиниці CSS. Один раз ВИМІРЮЄ,
// де верх аркуша стоїть у спокої (top0), і далі тримає рівно цей інваріант:
//     висота аркуша = (висота видимої області) − top0
// Оверлей при цьому прибитий до видимої області (top/height з visualViewport), тож
// «видима область» — це буквально те, що користувач бачить між шапкою і клавіатурою.
// Верх не може зсунутись за побудовою: він = top0 у будь-якому стані клавіатури.
//
// Використовують: tabs/feed.js (коментарі). Чат і Обговорення мають власну робочу
// механіку (core/chat-core.js) — їх мігруємо ОКРЕМИМ кроком, після підтвердження
// на живому пристрої, щоб не ламати те, що працює.

// Чи ввімкнено діагностику: додати #kbdebug у адресу (або один раз виконати
// localStorage.setItem('kbdebug','1')). Показує живі числа поверх екрана —
// щоб не гадати про поведінку чужого пристрою, а бачити факти.
export function kbDebugOn() {
  try {
    return location.hash.includes('kbdebug') || localStorage.getItem('kbdebug') === '1';
  } catch { return false; }
}

// ── Замок ФОНУ: тримає сторінку позаду аркуша нерухомою ─────────────────────────
// 🔑 ЧОМУ ОКРЕМО ВІД lockBodyScroll (Вова 25.07: «задній фон катається»): у цьому
// застосунку сторінка скролиться НЕ через body — у `style/base.css` прямим текстом:
// «.app-main — справжній скролер (body заблокований overflow:hidden)». Тобто замок
// body фіксував те, що й так не рухається, і від автоскролу iOS не захищав узагалі:
// при фокусі в поле система прокручувала справжній скролер, і фон їхав під аркушем.
// Морозимо саме реальні скролери — і ЛИШЕ ті, що поза аркушем, щоб список коментарів
// усередині нього скролився як раніше.
// Два рівні: overflow:hidden (забороняє жест) + повернення scrollTop у слухачі
// (страховка від програмного автоскролу системи, який overflow не зупиняє).
const SCROLLERS = '.app-main, .fd-screen';
function freezeBackground(overlay) {
  const frozen = Array.from(document.querySelectorAll(SCROLLERS))
    .filter(el => !overlay.contains(el) && el.scrollHeight > el.clientHeight + 1)
    .map(el => {
      const top = el.scrollTop;
      const onScroll = () => { if (el.scrollTop !== top) el.scrollTop = top; };
      const prevOverflow = el.style.overflowY;
      el.addEventListener('scroll', onScroll);
      el.style.overflowY = 'hidden';
      el.scrollTop = top;              // overflow:hidden міг скинути позицію
      return { el, top, onScroll, prevOverflow };
    });

  // 🔑 ТРЕТІЙ СКРОЛЕР, ЯКОГО ТУТ БРАКУВАЛО — САМ ДОКУМЕНТ (скрін IMG_3632, живі числа
  // з айфона Вови: `ФОН зсув: app-main:+0`, тобто внутрішній скролер СТОЯВ, а
  // `scrollY=413` і `offTop=413` — поїхала вся сторінка).
  // Чому раніше не ловили: `body { overflow: hidden }` у base.css нібито робить документ
  // непрокручуваним — і у вкладці Safari так і є. Але у ВСТАНОВЛЕНОМУ додатку iOS
  // прокручує webview повз це правило, щоб показати поле вводу.
  // Знімаємо саму причину: не даємо сторінці поїхати. Тоді «спосіб Б» просто не виникає,
  // і фон стоїть без жодних контр-зсувів (їх довелось би вішати на .app-main, а це
  // ризик зробити його системою координат для fixed-нащадків).
  // ⚠️ Це НЕ покадрова компенсація жесту (та завжди дає дьоргання — урок 25.07):
  // системний автоскрол — разова подія, ми лише повертаємо її назад.
  const pageTop0 = window.scrollY || 0;

  // ── 🛑 НЕ ПРИБИРАТИ ЦЕЙ БЛОК. ІСТОРІЯ, ЯКА КОШТУВАЛА РЕГРЕСУ ────────────────────
  // 26.07 я додав його (PR #637) — Вова перевірив і сказав «ідеально, фіксуємо цей
  // варіант». Далі під час аудиту я вирішив, що це ДУБЛЬ `lockBodyScroll()`
  // (`core/sheet-motion.js`, викликається у `feed.js` при відкритті листа), і прибрав
  // (PR #638). На папері дубль. На айфоні — зламалось усе, що ми лагодили два дні:
  // «блимає, зміщується верхня частина, фон уже можна гортати».
  //
  // 🔑 ДЕ БУЛА ПОМИЛКА В МОЄМУ МІРКУВАННІ: я довів, що `body{position:fixed}` НЕ спиняє
  // прокрутку webview у standalone (числа зі скріна: замок стояв, а `scrollY` = 413).
  // З цього я зробив хибний висновок «отже він нічого не дає». Насправді він дає інше:
  // поки документ не прокручується, iOS не перемальовує `fixed`-шари із запізненням —
  // а саме це запізнення й видно як блимання та зсув затемнення.
  // ⚠️ І головне за правилом Вови: він просив ЗАФІКСУВАТИ той варіант, а я змінив те,
  // про що мене не просили. Чистота коду не варта зламаної фічі.
  //
  // Тримається сторожем `kb-guard.test.js` (реальні CSS+модуль+lockBodyScroll).
  const bodyStyle = document.body.style;
  const prevBody = {
    position: bodyStyle.position, top: bodyStyle.top, left: bodyStyle.left,
    right: bodyStyle.right, width: bodyStyle.width,
  };
  bodyStyle.position = 'fixed';
  bodyStyle.top = `${-pageTop0}px`;
  bodyStyle.left = '0';
  bodyStyle.right = '0';
  bodyStyle.width = '100%';

  const onPageScroll = () => {
    if ((window.scrollY || 0) !== pageTop0) window.scrollTo(0, pageTop0);
  };
  window.addEventListener('scroll', onPageScroll, { passive: true });

  return {
    unfreeze: () => {
      window.removeEventListener('scroll', onPageScroll);
      bodyStyle.position = prevBody.position; bodyStyle.top = prevBody.top;
      bodyStyle.left = prevBody.left; bodyStyle.right = prevBody.right;
      bodyStyle.width = prevBody.width;
      // Сторінка була прокручена до відкриття листа — повертаємо рівно туди.
      if (pageTop0) window.scrollTo(0, pageTop0);
      frozen.forEach(f => {
        f.el.removeEventListener('scroll', f.onScroll);
        f.el.style.overflowY = f.prevOverflow;
        f.el.scrollTop = f.top;        // повертаємо рівно туди, де людина читала
      });
    },
    // Для панелі діагностики: чи справді скролер стоїть. Якщо тут 0, а фон усе одно
    // видимо з'їхав — значить рухається не скролер, а вся видима область (зсув iOS),
    // і лікувати треба зовсім інше місце. Один скрін = однозначна відповідь.
    // Сторінка йде в той самий рядок окремим пунктом — саме вона і виявилась винною.
    drift: () => frozen.map(f => Math.round(f.el.scrollTop - f.top))
      .concat(Math.round((window.scrollY || 0) - pageTop0)),
    names: () => frozen.map(f => f.el.className.split(' ')[0] || f.el.tagName.toLowerCase())
      .concat('СТОРІНКА'),
  };
}

// ── Дотягнути рядок у видиму зону скролера ──────────────────────────────────────
// Використовує список коментарів: коли відповідаєш на коментар, який клавіатура
// закрила, його треба показати. Правило: рухаємо ЛИШЕ якщо рядок реально не видно —
// зайвий рух дратує сильніше за його відсутність. pad — запас, щоб рядок не липнув
// до краю. Повертає, наскільки прокрутили (0 — нічого не робили): зручно для тестів.
export function revealInScroller(scroller, el, pad = 12) {
  if (!scroller || !el) return 0;
  const sr = scroller.getBoundingClientRect(), er = el.getBoundingClientRect();
  const under = er.bottom - (sr.bottom - pad);   // заліз під низ
  const above = (sr.top + pad) - er.top;         // вийшов за верх
  if (under <= 0 && above <= 0) return 0;        // видно повністю
  const by = under > 0 ? under : -above;
  // Субпіксельний залишок після плавної прокрутки (частки пікселя) — не привід
  // смикати список ще раз. Поріг 1px: людина такого не бачить, а зайвий рух бачить.
  if (Math.abs(by) < 1) return 0;
  scroller.scrollBy({ top: by, behavior: 'smooth' });
  return by;
}

// Прив'язує нижній аркуш до клавіатури.
//   overlay — фіксований контейнер на весь екран, який модуль ПЕРЕСУВАЄ за видимою
//     областю (у Стрічці — прозорий `.fd-sheet-vp`).
//     🔴 ВІН МУСИТЬ БУТИ ПРОЗОРИЙ. Не давати сюди затемнення (`.fd-sheet-back`):
//     модуль рухає і стискає те, що йому дали, тож видимий задник почне їхати на
//     кожному кадрі появи клавіатури і закінчуватись на її межі. Саме цей баг Вова
//     і зловив 25.07 («задник скролиться… має бути статичний без дьоргання»).
//     Правило просте: рухаємо систему координат, а не те, що людина бачить.
//   sheet   — сам аркуш усередині нього (.fd-sheet), притиснутий донизу
//   input   — поле вводу (гейт: без фокуса клавіатуру не вважаємо відкритою)
//   minHeight — запобіжник: нижче цього аркуш не стискаємо (малий екран + велика
//     клавіатура). У цьому крайньому випадку верх свідомо зсунеться — інакше аркуша
//     не було б видно взагалі.
//   kbClass — клас, що вішається на аркуш, поки клавіатура відкрита (відступи).
//   onOpen — викликається ПІСЛЯ того, як аркуш перебудувався під клавіатуру. Саме тут
//     має жити «дотягнути потрібний рядок у видиму зону»: раніше цього моменту вміст
//     ще не стиснувся, і будь-який вимір видимості брехав би.
// Повертає функцію від'єднання — обов'язково викликати при закритті аркуша.
export function attachKeyboardSheet(overlay, sheet, { input, minHeight = 180, kbClass = '', onOpen } = {}) {
  const vv = window.visualViewport;
  const dbg = kbDebugOn() ? createDebugPanel() : null;
  // Фон морозимо ЗАВЖДИ, поки аркуш живий — навіть якщо visualViewport недоступний:
  // саме автоскрол фону, а не висота аркуша, найпомітніше псує враження.
  const bg = freezeBackground(overlay);
  const unfreeze = bg.unfreeze;
  if (!vv) return () => { unfreeze(); dbg?.remove(); };

  // h0 — висота видимої області без клавіатури (еталон, з яким порівнюємо далі).
  const h0 = vv.height;

  let raf = 0, focused = false, applied = false, wasOpen = false, top0 = null;

  // top0 — де верх аркуша стоїть у СПОКОЇ, у координатах видимої області.
  // ⚠️ ПАСТКА, В ЯКУ Я ВЖЕ НАСТУПИВ (Вова: «верх під'їжджає до шапки»): якщо міряти
  // в момент підключення, елемента може ще НЕ БУТИ в документі — браузер тоді віддає
  // нулі, top0 виходить 0, і аркуш розтягується на всю видиму область. Тому міряємо
  // ЛІНИВО і лише поки самі не чіпали розміри (`!applied`) — тоді вимір завжди
  // актуальний. Нулі не приймаємо: краще не робити нічого, ніж зробити за хибним.
  // clientHeight/offsetHeight — розкладка БЕЗ transform: аркуш може їхати анімацією
  // в'їзду (translateY), і getBoundingClientRect збрехав би.
  const measureTop0 = () => {
    const oh = overlay.clientHeight, sh = sheet.offsetHeight;
    if (!oh || !sh) return;                  // поза документом або ще без розкладки
    top0 = Math.max(0, oh - sh);
  };

  const apply = () => {
    if (!applied) measureTop0();             // поки не втручались — вимір дійсний

    // 🔑 ДВА РІЗНІ СПОСОБИ, ЯКИМИ iOS ЗВІЛЬНЯЄ МІСЦЕ ПІД КЛАВІАТУРУ (Вова, скрін IMG_3631):
    //   А) СТИСКАЄ видиму область → vv.height меншає. Так у вкладці Safari.
    //   Б) ПРОКРУЧУЄ весь webview угору, а vv.height НЕ МІНЯЄ. Так у ВСТАНОВЛЕНОМУ
    //      додатку (standalone) — саме там Вова і тестує.
    // Стара умова знала лише спосіб А (`h0 - vv.height > 80`). У способі Б вона давала 0,
    // модуль вважав, що клавіатури нема, і НЕ РОБИВ НІЧОГО — сторінка їхала вгору разом
    // з аркушем, шапкою листа і навіть панеллю діагностики. Це пояснює геть усе, що Вова
    // бачив: «все ховається за екран», зниклий верх листа і зниклу панель.
    const shrink = Math.max(0, h0 - vv.height);              // спосіб А
    const shift  = Math.max(0, vv.offsetTop, window.scrollY || 0);  // спосіб Б
    const kb = Math.max(shrink, shift);      // скільки місця з'їла клавіатура, як не міряй
    // «Відкрита» — фокус у полі І помітна реакція будь-яким зі способів.
    // Гейт фокуса лишається: vv.height буває «застряглим» після закриття клавіатури.
    const open = focused && kb > 80 && top0 !== null;
    if (open) {
      // Видима смуга, у якій нам можна малювати: від `shift` згори, висотою `h0 - kb`.
      // У способі А це те саме, що було (shift = vv.offsetTop, h0 - kb = vv.height) —
      // тобто перевірена поведінка не змінюється жодним пікселем.
      const top = shift;
      const height = Math.max(minHeight, h0 - kb);
      // 1) оверлей — рівно на видиму смугу, хай як Safari зсунув чи стиснув сторінку
      overlay.style.top    = top + 'px';
      overlay.style.left   = vv.offsetLeft + 'px';
      overlay.style.right  = 'auto';
      overlay.style.bottom = 'auto';
      overlay.style.width  = vv.width + 'px';
      overlay.style.height = height + 'px';
      // 2) аркуш — рівно від top0 до низу видимої смуги. Верх лишається на top0.
      sheet.style.height = Math.max(minHeight, height - top0) + 'px';
      applied = true;
    } else if (applied || !open) {
      overlay.style.top = ''; overlay.style.left = ''; overlay.style.right = '';
      overlay.style.bottom = ''; overlay.style.width = ''; overlay.style.height = '';
      sheet.style.height = '';
      applied = false;
    }
    if (kbClass) sheet.classList.toggle(kbClass, open);
    // Гачок — лише на ПЕРЕХІД у стан «клавіатура відкрита», не на кожен кадр.
    if (open && !wasOpen) { try { onOpen?.(); } catch (_) {} }
    wasOpen = open;
    dbg?.update({ open, kb, shrink, shift, top0, h0, vv, sheet, overlay, bg });
  };

  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
  const onFocus = () => { focused = true; schedule(); };
  const onBlur  = () => { focused = false; schedule(); };

  input?.addEventListener('focus', onFocus);
  input?.addEventListener('blur', onBlur);
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  if (dbg) schedule();   // у режимі діагностики показуємо числа одразу

  return () => {
    cancelAnimationFrame(raf);
    unfreeze();
    input?.removeEventListener('focus', onFocus);
    input?.removeEventListener('blur', onBlur);
    vv.removeEventListener('resize', schedule);
    vv.removeEventListener('scroll', schedule);
    overlay.style.top = ''; overlay.style.left = ''; overlay.style.right = '';
    overlay.style.bottom = ''; overlay.style.width = ''; overlay.style.height = '';
    sheet.style.height = '';
    if (kbClass) sheet.classList.remove(kbClass);
    dbg?.remove();
  };
}

// Панель діагностики: живі числа поверх усього. Потрібна щоб з ОДНОГО скріншота
// з чужого пристрою бачити реальний стан, а не будувати здогади.
function createDebugPanel() {
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99999;background:rgba(0,0,0,.82);' +
    'color:#0f0;font:11px/1.35 ui-monospace,Menlo,monospace;padding:6px 8px;border-radius:8px;' +
    'white-space:pre;pointer-events:none;max-width:92vw';
  document.body.appendChild(el);
  // ⚠️ ПАНЕЛЬ САМА ХОВАЛАСЬ ВІД ТОГО, ЩО МАЛА ДІАГНОСТУВАТИ (скрін IMG_3631 — панелі нема).
  // `fixed` прив'язаний до РОЗМІТКИ; коли iOS прокручує весь webview угору під клавіатуру,
  // панель їде разом з ним за верхній край екрана. Тепер тримаємо її на ВИДИМІЙ області.
  // Інструмент, який зникає саме тоді, коли потрібен, — не інструмент.
  const place = () => {
    const vv = window.visualViewport;
    if (!vv) return;
    el.style.top  = (vv.offsetTop + 6) + 'px';
    el.style.left = (vv.offsetLeft + 6) + 'px';
  };
  place();
  window.visualViewport?.addEventListener('resize', place);
  window.visualViewport?.addEventListener('scroll', place);
  window.addEventListener('scroll', place, { passive: true });
  const ver = document.querySelector('.deploy-stamp')?.textContent?.trim() || '(версії нема)';
  // Режим показу: у встановленому з головного екрана додатку (standalone) клавіатура
  // на iOS поводиться інакше, ніж у вкладці Safari — це важлива змінна діагнозу.
  const mode = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone
    ? 'ДОДАТОК (standalone)' : 'браузер';
  return {
    update({ open, kb, shrink, shift, top0, h0, vv, sheet, overlay, bg }) {
      const r = sheet.getBoundingClientRect();
      // 🔴 РЯДОК-ВІДПОВІДЬ на питання «чому фон з'їжджає»: якщо drift ≠ 0 — поїхав
      // САМ скролер (замок не тримає); якщо drift = 0, а offTop ≠ 0 — скролер стоїть,
      // а зсунулась уся видима область (iOS), і замок скролера тут безсилий.
      const drift = bg?.drift?.() ?? [];
      const names = bg?.names?.() ?? [];
      const bgLine = names.length
        ? names.map((n, i) => `${n}:${drift[i] >= 0 ? '+' : ''}${drift[i]}`).join(' ')
        : 'скролерів не знайдено';
      el.textContent =
        `${ver}  ·  ${mode}\n` +
        `клавіатура: ${open ? 'ВІДКРИТА' : 'закрита'}  kb=${Math.round(kb)}\n` +
        // Який спосіб застосував iOS: стиснув видиму область (А) чи прокрутив webview (Б).
        `спосіб: стиск=${Math.round(shrink ?? 0)} зсув=${Math.round(shift ?? 0)}\n` +
        `ФОН зсув: ${bgLine}\n` +
        `vv: h=${Math.round(vv.height)} offTop=${Math.round(vv.offsetTop)} pageTop=${Math.round(vv.pageTop)}\n` +
        `window: inner=${window.innerHeight} client=${document.documentElement.clientHeight}\n` +
        `scrollY=${Math.round(window.scrollY)}  h0=${Math.round(h0)}  top0=${Math.round(top0)}\n` +
        `аркуш: top=${Math.round(r.top)} h=${Math.round(r.height)}\n` +
        `оверлей: top=${overlay.style.top || '—'} h=${overlay.style.height || '—'}`;
    },
    remove() { el.remove(); },
  };
}
