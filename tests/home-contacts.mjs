// Стенд: ТЕЛЕФОНИ ГРОМАДИ (`tabs/home-contacts.js`, секція `#cm-contacts`).
//
// 🔴 НАВІЩО ЗАВЕДЕНИЙ (31.08.2026). Блок жив із 04.08 і власного стенда НЕ МАВ:
// `grep hm-ct- tests/` давав лише побіжні рядки в `home.mjs`, і жоден із них не
// стеріг ні порядку секцій, ні того, чим намальовані значки. Тобто три речі, на
// які поскаржився Вова, могли повернутись мовчки.
//
// 🔑 ЩО САМЕ ВІН СТЕРЕЖЕ — ТРИ ЗАМОВЛЕННЯ ВОВИ, дослівно:
//   1. «телефони громади мають бути ЗВЕРХУ, а екстрені знизу».
//   2. «мені не подобається, що вони в списках, в таких категоріях» — при
//      чотирьох контактах заголовків категорій бути не повинно.
//   3. «іконки у вигляді смайлів… а ми домовились що емодзі не буде» — у
//      розмітці блока не сміє лишитись жодного емодзі.
//
// ⚠️ ЧОМУ ПЕРЕВІРКА ЕМОДЗІ ДИВИТЬСЯ НА ЖИВИЙ DOM, А НЕ НА ТЕКСТ ФАЙЛУ.
// Текстовий `grep` по `home-contacts.js` зеленітиме завжди: у шапці файлу
// емодзі лишились НАВМИСНО — в описі того, що прибрали. Сторож, який читає
// вихідний код, тут або бреше, або змушує викинути пояснення. Тому міряємо те,
// що бачить людина: вміст вузлів на екрані.
import { chromium } from 'playwright';
import { launch, serve, blockExternal, reporter } from './_lib.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const browser = await launch(chromium);
const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
await blockExternal(p);

const errs = [];
p.on('pageerror', e => errs.push(String(e)));

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForSelector('#cm-contacts-content .hm-ct', { timeout: 15000 });
await p.waitForTimeout(300);

const зріз = await p.evaluate(() => {
  const c = document.getElementById('cm-contacts-content');
  const root = c;
  const вузли = [...c.querySelectorAll('.hm-ct, .hm-sos-b')];
  const контакти = [...c.querySelectorAll('.hm-ct')];

  // Емодзі шукаємо у ТЕКСТІ вузлів. Діапазони — символи-піктограми і
  // варіаційний селектор; літери, цифри й пунктуація сюди не потрапляють.
  const ЕМОДЗІ = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;
  const текст = c.innerText || '';

  return {
    контактів: контакти.length,
    груп: c.querySelectorAll('.hm-cgrp').length,
    екстрених: c.querySelectorAll('.hm-sos-b').length,
    // Порядок читаємо з DOM: CSS міг би намалювати навпаки.
    громадаПерша: (() => {
      const пг = вузли.findIndex(n => n.classList.contains('hm-ct'));
      const пе = вузли.findIndex(n => n.classList.contains('hm-sos-b'));
      return пг !== -1 && пе !== -1 && пг < пе;
    })(),
    емодзіВТексті: (текст.match(ЕМОДЗІ) || [])[0] || '',
    // Кожен контакт мусить мати ВЕКТОРНИЙ значок.
    зіЗначком: контакти.filter(n => n.querySelector('.hm-ct-ic svg')).length,
    // Кнопки швидких дій теж мають бути векторні, а не гліфи «⧉» / «📍».
    діїВектор: [...c.querySelectorAll('.hm-ct-act')].every(b => !!b.querySelector('svg')),
    дій: c.querySelectorAll('.hm-ct-act').length,
    // Ціль пальця: 44px за посібником Apple.
    цілі44: [...c.querySelectorAll('.hm-ct-act')].every(b => b.getBoundingClientRect().width >= 43),
    // Значок не сміє стискатись у смужку при довгій назві.
    значкиЦілі: [...c.querySelectorAll('.hm-ct-ic')].every(n => n.getBoundingClientRect().width >= 33),
    // Тап по контакту веде в дзвінок.
    telУсі: contactsTel(c),
    // 🔴 01.09 — ДРУГИЙ НОМЕР (замовлення Вови «давай два, але компактне і не
    // таке широке»). Стережемо три речі, і кожна куплена заміром:
    //   • ширина карток НЕ змінилась (другий номер іде вниз, а не поруч);
    //   • цифри другого номера стоять РІВНО під першим — перша редакція мала
    //     значок трубки, і він вирівнювався сам, а цифри зʼїжджали на 18px;
    //   • ціль пальця ≥ 34px — перший замір дав 22px.
    другий: (() => {
      const a = root.querySelector('.hm-ct-alt');
      if (!a) return null;
      const картка = a.closest('.hm-ct');
      const перший = картка.querySelector('.hm-ct-phone');
      const rng = document.createRange(); rng.selectNodeContents(a.lastChild);
      return {
        tel: (a.getAttribute('href') || '').startsWith('tel:'),
        висота: Math.round(a.getBoundingClientRect().height),
        рівно: Math.round(rng.getBoundingClientRect().left)
             === Math.round(перший.getBoundingClientRect().left),
      };
    })(),
    ширинаОднакова: (() => {
      const ш = [...root.querySelectorAll('.hm-ct')]
        .map(x => Math.round(x.getBoundingClientRect().width));
      return new Set(ш).size === 1;
    })(),
    // Нічого не вилазить за правий край екрана.
    влазить: [...c.querySelectorAll('.hm-ct, .hm-sos-b')]
      .every(n => n.getBoundingClientRect().right <= window.innerWidth + 1),
  };

  function contactsTel(root) {
    const посилання = [...root.querySelectorAll('.hm-ct-main')];
    return посилання.length > 0 && посилання.every(a => (a.getAttribute('href') || '').startsWith('tel:'));
  }
});

ok('контакти громади намальовані', зріз.контактів >= 4, `${зріз.контактів}`);
ok('екстрені служби намальовані', зріз.екстрених >= 3, `${зріз.екстрених} плиток`);
ok('🔴 №1 — телефони громади СТОЯТЬ ПЕРЕД екстреними', зріз.громадаПерша);
ok('🔴 №2 — при малій кількості груп немає (пласко)',
   зріз.контактів < 9 ? зріз.груп === 0 : зріз.груп > 0,
   `${зріз.контактів} контактів / ${зріз.груп} груп`);
ok('🔴 №3 — у блоці НЕМАЄ жодного емодзі', зріз.емодзіВТексті === '',
   зріз.емодзіВТексті ? `знайдено «${зріз.емодзіВТексті}»` : 'чисто');
ok('кожен контакт має векторний значок', зріз.зіЗначком === зріз.контактів,
   `${зріз.зіЗначком}/${зріз.контактів}`);
ok('швидкі дії — вектор, не гліфи', зріз.діїВектор && зріз.дій > 0, `${зріз.дій} кнопок`);
ok('ціль пальця дій ≥ 44px', зріз.цілі44);
ok('значок не стискається (34px)', зріз.значкиЦілі);
ok('тап по контакту веде в дзвінок', зріз.telУсі);
ok('нічого не вилазить за екран', зріз.влазить);
ok('🔴 другий номер ЦНАПу намальовано', !!зріз.другий);
ok('другий номер веде в дзвінок', зріз.другий?.tel);
ok('🔴 цифри другого РІВНО під першим', зріз.другий?.рівно);
ok('ціль пальця другого ≥ 34px', (зріз.другий?.висота || 0) >= 34, `${зріз.другий?.висота}px`);
ok('🔴 ширина карток НЕ змінилась (номер пішов вниз, не вбік)', зріз.ширинаОднакова);

ok('помилок у консолі нема', errs.length === 0, errs.slice(0, 2).join(' | '));

await browser.close();
await stop();
done();
