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

// Прив'язує нижній аркуш до клавіатури.
//   overlay — фіксований контейнер на весь екран (.fd-sheet-back)
//   sheet   — сам аркуш усередині нього (.fd-sheet), притиснутий донизу
//   input   — поле вводу (гейт: без фокуса клавіатуру не вважаємо відкритою)
//   minHeight — запобіжник: нижче цього аркуш не стискаємо (малий екран + велика
//     клавіатура). У цьому крайньому випадку верх свідомо зсунеться — інакше аркуша
//     не було б видно взагалі.
//   kbClass — клас, що вішається на аркуш, поки клавіатура відкрита (відступи).
// Повертає функцію від'єднання — обов'язково викликати при закритті аркуша.
export function attachKeyboardSheet(overlay, sheet, { input, minHeight = 180, kbClass = '' } = {}) {
  const vv = window.visualViewport;
  const dbg = kbDebugOn() ? createDebugPanel() : null;
  if (!vv) return () => dbg?.remove();

  // top0 — де верх аркуша стоїть у СПОКОЇ, у координатах видимої області.
  // clientHeight/offsetHeight — розкладка БЕЗ transform: аркуш у цей момент може
  // їхати вгору анімацією в'їзду (translateY), і getBoundingClientRect збрехав би.
  const top0 = Math.max(0, overlay.clientHeight - sheet.offsetHeight);
  // h0 — висота видимої області без клавіатури (еталон, з яким порівнюємо далі).
  const h0 = vv.height;

  let raf = 0, focused = false, applied = false;

  const apply = () => {
    const kb = Math.max(0, h0 - vv.height);       // скільки з'їла клавіатура
    // «Відкрита» лише при фокусі в полі І помітному зменшенні (поріг 80px): без
    // гейта фокуса vv.height буває «застряглим» після закриття клавіатури.
    const open = focused && kb > 80;
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
  return {
    update({ open, kb, top0, h0, vv, sheet, overlay }) {
      const r = sheet.getBoundingClientRect();
      el.textContent =
        `${ver}\n` +
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
