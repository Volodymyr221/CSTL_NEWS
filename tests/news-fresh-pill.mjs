// Стенд: СВІЖІ НОВИНИ НЕ ПІДМІНЯЮТЬСЯ ПІД ПАЛЬЦЯМИ.
//
// ═════════════════════════════════════════════════════════════════════════════
// 🗣️ ЗВІДКИ ЦЕ (22.09.2026). Вова: «коли підтягнуло нормальний інтернет, то як
// застосунок обновиться до свіжої версії?» — і одразу далі: «Це найкраще
// технічне рішення для цього завдання? Як зробив би фейсбук/інстаграм?»
//
// 🔴 МОЯ ПЕРША ПРОПОЗИЦІЯ БУЛА ГІРША ЗА ТЕ, ЩО Є: «новини перемальовуються
// самі». Instagram так не робить — і не випадково: підміна вмісту посеред
// читання забирає місце, де людина була, і читається як збій, а не як турбота.
// Він показує пігулку «New posts», а стрибок робить людина.
//
// 🔑 ПРАВИЛО, ЯКЕ ТУТ СТЕРЕЖЕТЬСЯ:
//   • список угорі → підставляємо тихо (втрачати нема чого);
//   • людина прокрутила → пігулка, і рішення за нею; місце НЕ рухається.
//
// 📏 МІРЯЄМО НАСЛІДОК, А НЕ КОД: чи лишився на місці ТОЙ САМИЙ вузол картки і
// чи не зсунулась прокрутка. Перевіряти «чи викликали paint» означало б вірити
// власній вигадці про те, що людина відчує.
// ═════════════════════════════════════════════════════════════════════════════
import { chromium } from 'playwright';
import { chromiumPath, serve, reporter } from './_lib.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const exe = chromiumPath();
const browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
const помилки = [];
page.on('pageerror', e => помилки.push(String(e.message).slice(0, 90)));

await page.route('**://*.supabase.co/**', r => r.abort());
await page.route('**://api.open-meteo.com/**', r => r.abort());

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);

// ── Відкриваємо хаб новин тим самим шляхом, що й людина ────────────────────
const відкрито = await page.evaluate(() => {
  const кн = [...document.querySelectorAll('button, a')]
    .find(b => /усі новини/i.test(b.textContent || ''));
  if (!кн) return false;
  кн.click();
  return true;
});
ok('хаб новин відкривається кнопкою «Усі новини»', відкрито);
await page.waitForTimeout(1500);

const єХаб = await page.evaluate(() => !!document.querySelector('.nh-list'));
ok('список хаба намальований', єХаб);

// ── 1. СПИСОК УГОРІ → ТИХА ПІДМІНА, БЕЗ ПІГУЛКИ ───────────────────────────
{
  const р = await page.evaluate(async () => {
    const list = document.querySelector('.nh-list');
    list.scrollTop = 0;
    const перша = list.firstElementChild;
    перша.dataset.проба = '1';
    window.dispatchEvent(new CustomEvent('cstl-news-reloaded', { detail: { причина: 'стенд' } }));
    await new Promise(r => setTimeout(r, 900));
    return {
      стараКарткаНаМісці: !!перша.isConnected,
      пігулка: !!document.querySelector('.nh-fresh'),
      карток: list.children.length,
    };
  });
  ok('🔑 угорі списку свіже підставляється ТИХО (картки перемальовано)',
     р.стараКарткаНаМісці === false, р.стараКарткаНаМісці ? 'стара картка лишилась' : 'перемальовано');
  ok('🛑 і пігулки при цьому НЕ показуємо — пропонувати нічого, уже видно',
     р.пігулка === false);
  ok('список не спорожнів', р.карток > 0, String(р.карток));
}

// ── 2. 🔴 ЛЮДИНА ПРОКРУТИЛА → МІСЦЕ НЕ РУХАЄТЬСЯ, ЗʼЯВЛЯЄТЬСЯ ПІГУЛКА ──────
{
  const р = await page.evaluate(async () => {
    const list = document.querySelector('.nh-list');
    list.scrollTop = 400;
    await new Promise(r => setTimeout(r, 120));
    const було = list.scrollTop;
    const перша = list.firstElementChild;
    window.dispatchEvent(new CustomEvent('cstl-news-reloaded', { detail: { причина: 'стенд' } }));
    await new Promise(r => setTimeout(r, 900));
    return {
      було, стало: list.scrollTop,
      стараКарткаНаМісці: !!перша.isConnected,
      пігулка: document.querySelector('.nh-fresh')?.textContent || '',
    };
  });
  ok('🔴 прокрутку НЕ зсунуло', Math.abs(р.стало - р.було) < 4, `${р.було} → ${р.стало}`);
  ok('🔴 і вміст під пальцем НЕ підмінили',
     р.стараКарткаНаМісці === true, р.стараКарткаНаМісці ? 'на місці' : 'ПІДМІНИЛИ');
  ok('🔑 натомість зʼявилась пігулка з пропозицією',
     /свіж/i.test(р.пігулка), р.пігулка || '(немає)');
}

// ── 3. ТАП ПО ПІГУЛЦІ → ОНОВИЛОСЬ І ПІДНЯЛО ВГОРУ ─────────────────────────
{
  const р = await page.evaluate(async () => {
    const list = document.querySelector('.nh-list');
    const перша = list.firstElementChild;
    document.querySelector('.nh-fresh').click();
    await new Promise(r => setTimeout(r, 1200));
    return {
      пігулка: !!document.querySelector('.nh-fresh'),
      стараКарткаНаМісці: !!перша.isConnected,
      scrollTop: list.scrollTop,
    };
  });
  ok('🔑 після тапу список оновлено',
     р.стараКарткаНаМісці === false, р.стараКарткаНаМісці ? 'НЕ оновився' : 'оновлено');
  ok('і піднято вгору', р.scrollTop < 40, String(р.scrollTop));
  ok('пігулка зникла — своє відпрацювала', р.пігулка === false);
}

// ── 4. ДВІ ПОДІЇ ПІДРЯД → ОДНА ПІГУЛКА, А НЕ ЧЕРГА ────────────────────────
{
  const скільки = await page.evaluate(async () => {
    const list = document.querySelector('.nh-list');
    list.scrollTop = 400;
    await new Promise(r => setTimeout(r, 120));
    for (let i = 0; i < 3; i++) {
      window.dispatchEvent(new CustomEvent('cstl-news-reloaded', { detail: {} }));
      await new Promise(r => setTimeout(r, 150));
    }
    return document.querySelectorAll('.nh-fresh').length;
  });
  ok('🛑 три звістки підряд дають ОДНУ пігулку', скільки === 1, String(скільки));
}

ok('жодної помилки в консолі', помилки.length === 0, помилки.join(' · ').slice(0, 110) || '—');

await browser.close(); await stop();
done();
