// tests/tools/tab-return-flash.mjs — КОНТРОЛЬНИЙ ДОСЛІД, не сторож.
//
// 🔴 ПИТАННЯ. Скарга Вови 15.08: «заходжу на стрічку, виходжу на іншу вкладку,
// заходжу знов — весь контент, вся сторінка ніби блимає, ніби перезавантажується.
// Так само у вкладці Дошка».
//
// Що знайдено читанням коду:
//   • «Стрічка» — `feed.js` слухає `cstl-tab-changed` і на КОЖНЕ повернення робить
//     `loadData().then(renderFeed)`, а `renderFeed()` це `listEl.innerHTML = …`,
//     тобто ПОВНА заміна всіх карток. Ні перевірки «чи дані взагалі змінились»,
//     ні паузи між оновленнями немає.
//   • «Дошка» — `refreshBoardKeepingPlace()` теж перемальовує список цілком
//     (`renderBodyOnly()`), тільки загорнуто в `keepScroll`, тож позиція тримається.
//
// ➡️ ЩО САМЕ МІРЯЄМО: скільки кадрів після перемальовки картинки НЕ намальовані.
// Це і є «блим» — не абстрактне «сіпнулось», а конкретні кадри, у яких на місці
// фотографій порожнеча. Порівнюємо ТРИ шляхи на однакових даних.
//
// 🔑 Міряємо `img.complete` + `naturalWidth`, а не «чи є вузол у DOM»: вузол
// з'являється миттєво, а от намальована картинка — ні, і саме її бачить око.
//
// 🔴 ПЕРША РЕДАКЦІЯ ЦЬОГО ПРИЛАДУ ЗБРЕХАЛА — 20-й випадок у проєкті. Вона брала
// картинки як `data:`-рядки, а такі декодуються СИНХРОННО: заміна `innerHTML`
// показала «0 кадрів без картинок», тобто «блиму немає» на коді, який блимає.
// У застосунку фотографії їдуть ПО МЕРЕЖІ (сховище Supabase), і саме там заміна
// вузла означає повторне завантаження. Тому тут картинки віддаються через
// перехоплений маршрут із затримкою — як у житті.
import { chromium } from 'playwright';
import { launch } from '../_lib.mjs';

// 12 карток із фото — приблизно те, що видно у «Стрічці» після завантаження.
const html = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  #list{padding:8px}
  .card{padding:10px;border-bottom:1px solid #eee}
  .card img{width:100%;height:120px;object-fit:cover;display:block}
</style>
<div id="list"></div>
<script>
const N = 12;
// Дані ті самі на всіх трьох шляхах — інакше порівняння нічого не варте.
const data = Array.from({length: N}, (_, i) => ({
  id: i,
  text: 'Допис номер ' + i,
  // Картинка-пустушка, унікальна за розміром: справжня мережа тут тільки заважала б.
  // ⚠️ АБСОЛЮТНИЙ URL обовʼязково: сторінка піднята через setContent, тобто стоїть
  // на about:blank — відносний шлях там не стає мережевим запитом і route його
  // не побачить (саме на цьому прилад упав за таймаутом).
  img: 'http://cstl.test/photo-' + i + '.svg'
}));
const cardHtml = p => '<div class="card" data-id="' + p.id + '"><img src="' + p.img + '"><div>' + p.text + '</div></div>';
const list = document.getElementById('list');

window.__paint = () => { list.innerHTML = data.map(cardHtml).join(''); };
window.__paint();

// ШЛЯХ 1 — як зараз: повна заміна innerHTML (renderFeed / renderBodyOnly).
window.__full = () => { list.innerHTML = data.map(cardHtml).join(''); };

// ШЛЯХ 2 — точкове оновлення: вузли лишаються, міняється лише текст, що змінився.
// (у застосунку для цього вже є patchPostCard / insertPostCard / removePostCard)
window.__patch = () => {
  data.forEach(p => {
    const el = list.querySelector('[data-id="' + p.id + '"]');
    if (!el) return;
    const t = el.querySelector('div');
    if (t.textContent !== p.text) t.textContent = p.text;
  });
};

// ШЛЯХ 3 — «дані ті самі, DOM не чіпаємо взагалі».
window.__skip = () => {};

// Скільки картинок ЗАРАЗ намальовано (те, що бачить око).
window.__drawn = () => [...list.querySelectorAll('img')]
  .filter(i => i.complete && i.naturalWidth > 0).length;
window.__nodes = () => list.querySelector('.card');
</script>`;

const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
// Фотографії з мережевою затримкою — 40мс, скромно як для мобільного інтернету.
await p.route('**/photo-*.svg', async r => {
  await new Promise(res => setTimeout(res, 40));
  r.fulfill({ contentType: 'image/svg+xml',
              body: '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="120"><rect width="100%" height="100%" fill="#ccc"/></svg>' });
});
await p.setContent(html);
await p.waitForTimeout(400);

async function measure(label, fn) {
  // Дочекатись повного спокою: усі картинки намальовані.
  await p.waitForFunction(() => window.__drawn() === 12, null, { timeout: 5000 });
  const before = await p.evaluate(() => window.__drawn());
  const nodeBefore = await p.evaluateHandle(() => window.__nodes());

  // Знімаємо стан по кадрах одразу після оновлення — саме тут живе «блим».
  const frames = await p.evaluate(async (name) => {
    const out = [];
    window[name]();
    for (let i = 0; i < 20; i++) {
      out.push(window.__drawn());
      await new Promise(r => requestAnimationFrame(r));
    }
    return out;
  }, fn);

  const nodeAfter = await p.evaluateHandle(() => window.__nodes());
  const same = await p.evaluate(([a, b]) => a === b, [nodeBefore, nodeAfter]);
  const blank = frames.filter(f => f < 12).length;

  console.log(`\n── ${label}`);
  console.log(`   намальовано картинок по кадрах: ${frames.join(', ')}  (з ${before})`);
  console.log(`   кадрів із неповною картинкою: ${blank}`);
  console.log(`   вузли карток ті самі: ${same ? 'так' : '🔴 ні — DOM перестворено'}`);
  return { blank, same };
}

console.log('🔬 ЧОМУ БЛИМАЄ ПРИ ПОВЕРНЕННІ НА ВКЛАДКУ');
console.log('   Дані на всіх трьох шляхах ОДНАКОВІ — міняється лише спосіб оновлення.');

const full  = await measure('ЯК ЗАРАЗ: повна заміна innerHTML (renderFeed)', '__full');
await p.evaluate(() => window.__paint()); await p.waitForTimeout(300);
const patch = await measure('точкове оновлення (вузли лишаються)', '__patch');
await p.evaluate(() => window.__paint()); await p.waitForTimeout(300);
const skip  = await measure('дані ті самі → DOM не чіпаємо', '__skip');

console.log('\n── ВИСНОВОК');
console.log(`   повна заміна:      ${full.blank} кадрів без картинок${full.same ? '' : ', DOM перестворено'}`);
console.log(`   точкове оновлення: ${patch.blank} кадрів`);
console.log(`   не чіпати:         ${skip.blank} кадрів`);

await b.close();
