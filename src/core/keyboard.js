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
  return () => frozen.forEach(f => {
    f.el.removeEventListener('scroll', f.onScroll);
    f.el.style.overflowY = f.prevOverflow;
    f.el.scrollTop = f.top;            // повертаємо рівно туди, де людина читала
  });
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
//   overlay — фіксований контейнер на весь екран (.fd-sheet-back)
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
  const unfreeze = freezeBackground(overlay);
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
    const kb = Math.max(0, h0 - vv.height);  // скільки з'їла клавіатура
    // «Відкрита» лише при фокусі в полі І помітному зменшенні (поріг 80px): без
    // гейта фокуса vv.height буває «застряглим» після закриття клавіатури.
    const open = focused && kb > 80 && top0 !== null;
    if (open) {
      // 1) оверлей — рівно на видиму область, хай як Safari зсунув сторінку
      overlay.style.top    = vv.offsetTop + 'px';
      overlay.style.left   = vv.offsetLeft + 'px';
      overlay.style.right  = 'auto';
      overlay.style.bottom = 'auto';
      overlay.style.width  = vv.width + 'px';
      overlay.style.height = vv.height + 'px';
      // 2) аркуш — рівно від top0 до низу видимої області. Верх лишається на top0.
      sheet.style.height = Math.max(minHeight, vv.height - top0) + 'px';
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
    dbg?.update({ open, kb, top0, h0, vv, sheet, overlay });
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
  const ver = document.querySelector('.deploy-stamp')?.textContent?.trim() || '(версії нема)';
  // Режим показу: у встановленому з головного екрана додатку (standalone) клавіатура
  // на iOS поводиться інакше, ніж у вкладці Safari — це важлива змінна діагнозу.
  const mode = window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone
    ? 'ДОДАТОК (standalone)' : 'браузер';
  return {
    update({ open, kb, top0, h0, vv, sheet, overlay }) {
      const r = sheet.getBoundingClientRect();
      el.textContent =
        `${ver}  ·  ${mode}\n` +
        `клавіатура: ${open ? 'ВІДКРИТА' : 'закрита'}  kb=${Math.round(kb)}\n` +
        `vv: h=${Math.round(vv.height)} offTop=${Math.round(vv.offsetTop)} pageTop=${Math.round(vv.pageTop)}\n` +
        `window: inner=${window.innerHeight} client=${document.documentElement.clientHeight}\n` +
        `scrollY=${Math.round(window.scrollY)}  h0=${Math.round(h0)}  top0=${Math.round(top0)}\n` +
        `аркуш: top=${Math.round(r.top)} h=${Math.round(r.height)}\n` +
        `оверлей: top=${overlay.style.top || '—'} h=${overlay.style.height || '—'}`;
    },
    remove() { el.remove(); },
  };
}
