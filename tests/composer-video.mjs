// Стенд: КОМПОЗЕР — ВІДЕО В ДОПИСІ (12.10.2026).
//
// 🗣️ Вова: «добавити можливість публікації відео в вкладку «стрічка» в спільноти».
// Реалізація — `openComposer` (feed.js) + `core/video.js` + `uploadVideoToStorage`.
//
// 🔑 Справжній застосунок, редактор сторінки, справжній ролик (VP9 з tests/fixtures).
// Сховище перехоплюємо мережевим маршрутом — і бачимо, ЩО САМЕ застосунок туди шле.
// Міряємо наслідки:
//   • після вибору — прев'ю з кадром-обкладинкою і тривалістю, ✕ прибирає;
//   • фото і відео разом не можна (у дописі або одне, або друге);
//   • завеликий файл відкидається ДО завантаження, з поясненням;
//   • ролик іде в теку СВОЄЇ сторінки (на ній тримається право бази);
//   • у базу йде `video` з розмірами й тривалістю — стрічка резервує місце;
//   • відмова сховища — людський текст, форма лишається.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, truncateSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ROOT, launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter('composer-video');
const { url, stop } = await serve();
const b = await launch(chromium);

const ME = 'u-me';
const pages = [{ id: 1, name: 'Olyka Castle', sort_order: 1 }];
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  try { localStorage.setItem('cstl-legal-consent-v1', '05.10.2026'); } catch (_) {}
  // Тости йдуть ЧЕРГОЮ (core/utils.js): наступний з'являється, коли згасне попередній.
  // Тому збираємо КОЖЕН показаний текст за весь прогін, а не дивимось на екран у мить.
  window.__тости = [];
  // ⚠️ Спостерігача вішаємо після розбору сторінки: на мить init-скрипту
  // documentElement ще може не бути, і observe() мовчки падав би.
  document.addEventListener('DOMContentLoaded', () => new MutationObserver(() => {
    const t = document.getElementById('cstl-toast');
    const txt = t && t.textContent.trim();
    if (txt && window.__тости[window.__тости.length - 1] !== txt) window.__тости.push(txt);
  }).observe(document.body, { subtree: true, childList: true, characterData: true }));
});
const p = await ctx.newPage();
// Один наявний допис: заглушка на insert().select().single() віддає рядок таблиці
// (справжня база — щойно вставлений). Без нього «успіх» виглядав би як збій.
const наявний = { id: 900, page_id: 1, author_uid: ME, text: 'Старий допис', image_urls: [], created_at: new Date(Date.now() - 864e5).toISOString(), status: 'published', pages: { name: 'Olyka Castle', avatar_url: null } };
await mockSupabase(p, { posts: [], pages, page_posts: [наявний], page_admins: [{ page_id: 1, uid: ME, user_uid: ME }] }, {
  user: { id: ME, email: 'me@example.com', user_metadata: { name: 'Вова' } },
  profiles: [{ uid: ME, name: 'Вова', avatar_url: '' }] });
// Сховище: записуємо, куди і що прийшло; режим відповіді перемикаємо зі стенда.
const завантаження = [];
let відповідь = { status: 200, body: '{"Key":"ok"}' };
await p.route('**/storage/v1/object/community-videos/**', async r => {
  завантаження.push({ url: r.request().url(), type: r.request().headers()['content-type'], auth: r.request().headers()['authorization'] });
  await r.fulfill({ status: відповідь.status, contentType: 'application/json', body: відповідь.body });
});
await p.goto(url + '/index.html');
await p.waitForTimeout(3500);
await p.getByText('Поки пропустити').click({ timeout: 500 }).catch(() => {});
await p.evaluate(() => window.switchTab('shotam'));
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('[data-open-page="1"]')?.click());
await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('.fd-compose-open')?.click());
await p.waitForTimeout(800);
ok('сцена: композер відкрито редактором сторінки', await p.evaluate(() => !!document.querySelector('.fd-composer .fd-comp-vinput')));

const VIDEO = readFileSync(`${ROOT}/tests/fixtures/video-wide.webm`);
const вибрати = (sel, files) => p.setInputFiles(sel, files);

// 1. Завеликий файл — відмова до завантаження.
// Порожній («розріджений») файл на 51 МБ: місця на диску не займає, але розмір — справжній.
const ВЕЛИКИЙ = join(tmpdir(), 'cstl-big-video.mp4');
truncateSync(writeFileSync(ВЕЛИКИЙ, '') || ВЕЛИКИЙ, 51 * 1024 * 1024);
await вибрати('.fd-comp-vinput', ВЕЛИКИЙ);
await p.waitForTimeout(400);
const тост = (frag) => p.evaluate(f => window.__тости.some(t => t.includes(f)), frag);
const великий = { прев: await p.evaluate(() => !document.querySelector('.fd-comp-video').hidden), тост: await тост('Відео завелике') };
ok('🔴 файл понад 50 МБ відкинуто ДО завантаження, з поясненням', !великий.прев && великий.тост && !завантаження.length, JSON.stringify(великий));

// 2. Нормальний ролик — прев'ю з обкладинкою і тривалістю.
await вибрати('.fd-comp-vinput', { name: 'clip.webm', mimeType: 'video/webm', buffer: VIDEO });
await p.waitForFunction(() => document.querySelector('.fd-comp-vprev img'), null, { timeout: 8000 }).catch(() => {});
const прев = await p.evaluate(() => ({ img: !!document.querySelector('.fd-comp-vprev img'), dur: document.querySelector('.fd-comp-vprev .fd-vid-dur')?.textContent || '' }));
ok('🔴 прев\'ю: кадр-обкладинка з ролика і тривалість', прев.img && прев.dur === '0:03', JSON.stringify(прев));

// 3. Фото поверх відео — не можна.
await вибрати('.fd-comp-photo:not(.fd-comp-vbtn) input', `${ROOT}/images/volleyball.jpg`);
await p.waitForTimeout(400);
await p.waitForFunction(() => window.__тости.some(t => t.includes('вже є відео')), null, { timeout: 15000 }).catch(() => {});
const разом = { мініатюр: await p.evaluate(() => document.querySelectorAll('.fd-comp-thumb').length), тост: await тост('вже є відео') };
ok('фото і відео разом не додаються (пояснення в тості)', разом.мініатюр === 0 && разом.тост, JSON.stringify(разом));

// 4. Відмова сховища — людський текст, нічого не опубліковано.
відповідь = { status: 403, body: '{"message":"new row violates row-level security policy"}' };
await p.fill('.fd-comp-text', 'Відео з Олики');
await p.click('.fd-comp-send');
await p.waitForFunction(() => window.__тости.some(t => t.includes('Немає прав')), null, { timeout: 15000 }).catch(() => {});
const відмова = { ...(await p.evaluate(() => ({ форма: !!document.querySelector('.fd-composer'),
  вставок: (window.__cstlInserted || []).filter(x => x.table === 'page_posts').length }))), тост: await тост('Немає прав додавати відео') };
ok('🔴 сховище відмовило → «Немає прав…», форма лишилась, допис НЕ створено', відмова.форма && відмова.тост && відмова.вставок === 0, JSON.stringify(відмова));

// 5. Успіх.
відповідь = { status: 200, body: '{"Key":"ok"}' };
завантаження.length = 0;
await p.click('.fd-comp-send');
await p.waitForFunction(() => !document.querySelector('.fd-composer'), null, { timeout: 8000 }).catch(() => {});
const рядок = await p.evaluate(() => (window.__cstlInserted || []).filter(x => x.table === 'page_posts').pop()?.row || null);
ok('🔴 ролик пішов у теку СВОЄЇ сторінки, з токеном і правильним типом',
   завантаження.length === 1 && /community-videos\/1\//.test(завантаження[0].url) && завантаження[0].type === 'video/webm' && /Bearer test-token/.test(завантаження[0].auth),
   JSON.stringify(завантаження));
ok('🔴 у базу пішов допис із video: адреса, 640×360, 3 с', рядок && рядок.video && /community-videos\/1\//.test(рядок.video.url) &&
   рядок.video.w === 640 && рядок.video.h === 360 && Math.abs(рядок.video.dur - 3) < 0.6 && рядок.text === 'Відео з Олики', JSON.stringify(рядок));
ok('після успіху композер закрито', await p.evaluate(() => !document.querySelector('.fd-composer')), JSON.stringify(await p.evaluate(() => window.__тости)));

try { unlinkSync(ВЕЛИКИЙ); } catch (_) {}
await b.close(); await stop();
done();
