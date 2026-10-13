// Стенд: ВІДЕО В СТРІЧЦІ — картка, «без лагів», перегляд (12.10.2026).
//
// 🗣️ Вова: «добавити можливість публікації відео… продумати детальне відображення…
// щоб без лагів». Реалізація — `core/video-feed.js` (+ `videoBlockHtml` у картці).
//
// 🔑 СПРАВЖНІ ролики (VP9, згенеровані ffmpeg у tests/fixtures), справжній застосунок,
// мок Supabase. Міряємо НАСЛІДКИ, а не розмітку:
//   • до появи на екрані ролик не тягне ЖОДНОГО байта (запитів до файлу = 0);
//   • місце під ролик — у його пропорції ще до завантаження (картки не стрибають);
//   • грає рівно один, видимий, без звуку; поза екраном / під аркушем — пауза;
//   • Save-Data — без автоплею, ролик стартує за тапом;
//   • тап — на весь екран зі звуком; ✕ — назад;
//   • зламаний файл — обкладинка + «Відкрити відео», а не чорний прямокутник.
// 🛑 Контроль усередині сцени: допис із ФОТО не отримує плеєра.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter('feed-video');
const { url, stop } = await serve();
const b = await launch(chromium);

const iso = m => new Date(Date.now() - m * 60000).toISOString();
const V = f => `${url}/tests/fixtures/${f}`;
const POSTER = `${url}/images/volleyball.jpg`;
const pages = [{ id: 1, name: 'Olyka Castle', sort_order: 1 }];
const base = (id, mins, extra) => ({ id, page_id: 1, author: 'x', author_uid: 'u', text: `Допис ${id}`,
  image_urls: [], photos: [], created_at: iso(mins), status: 'published', pages: { name: 'Olyka Castle', avatar_url: null }, ...extra });
const page_posts = [
  base(801, 5,  { video: { url: V('video-wide.webm'), poster: POSTER, w: 640, h: 360, dur: 3, mime: 'video/webm' } }),
  base(802, 10, { image_urls: [`${url}/images/volleyball.jpg`] }),
  base(803, 15, { text: 'Довгий текст. '.repeat(60) }),
  base(804, 20, { video: { url: V('video-tall.webm'), poster: POSTER, w: 360, h: 640, dur: 3, mime: 'video/webm' } }),
  base(805, 25, { text: 'Ще текст. '.repeat(60) }),
  base(806, 30, { video: { url: V('video-broken.mp4'), poster: POSTER, w: 640, h: 360, dur: 5, mime: 'video/mp4' } }),
];

async function сцена({ saveData = false } = {}) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.addInitScript((sd) => {
    try { localStorage.setItem('cstl-legal-consent-v1', '05.10.2026'); } catch (_) {}
    if (sd) Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true });
  }, saveData);
  const p = await ctx.newPage();
  const запити = [];
  p.on('request', r => { if (/\/tests\/fixtures\/video-/.test(r.url())) запити.push(r.url()); });
  await mockSupabase(p, { posts: [], pages, page_posts }, {});
  await p.goto(url + '/index.html');
  await p.waitForTimeout(3000);
  await p.getByText('Поки пропустити').click({ timeout: 500 }).catch(() => {});
  await p.evaluate(() => window.switchTab('shotam'));
  await p.waitForTimeout(800);
  return { p, ctx, запити };
}
const стан = (p) => p.evaluate(() => [...document.querySelectorAll('.fd-video')].map(box => {
  const v = box.querySelector('video');
  return { id: box.dataset.video, грає: !v.paused, src: !!v.getAttribute('src'), muted: v.muted,
    preload: v.preload, ar: +(box.getBoundingClientRect().width / box.getBoundingClientRect().height).toFixed(2),
    err: box.classList.contains('is-err') };
}));
const до = (p, id) => p.evaluate(i => document.querySelector(`.fd-video[data-video="${i}"]`)?.scrollIntoView({ block: 'center' }), id);

// ── 1. Звичайна сцена ────────────────────────────────────────────────────────
{
  const { p, ctx, запити } = await сцена();
  // Відкотити на самий верх і зупинити все, що встигло: міряємо «до появи на екрані».
  const перший = await стан(p);
  ok('сцена: три ролики в стрічці', перший.length === 3, JSON.stringify(перший.map(x => x.id)));
  ok('🛑 контроль: допис із фото — без плеєра', await p.evaluate(() => !document.querySelector('.fd-card[data-post="802"] .fd-video') && !!document.querySelector('.fd-card[data-post="802"] .fd-photo')));
  ok('🔴 місце під широкий ролик — 16:9 ще до завантаження', Math.abs(перший.find(x => x.id === '801').ar - 1.78) < 0.03, JSON.stringify(перший));
  ok('🔴 вертикальний ролик обмежено рамкою 4:5 (не на два екрани)', Math.abs(перший.find(x => x.id === '804').ar - 0.8) < 0.03, JSON.stringify(перший));
  ok('preload="none" у кожного ролика', перший.every(x => x.preload === 'none'));
  ok('🔴 ролики поза екраном не тягнуть жодного байта', !перший.find(x => x.id === '804').src && !запити.some(u => /tall|broken/.test(u)), запити.join(' '));

  await до(p, 801); await p.waitForTimeout(900);
  let s = await стан(p);
  ok('🔴 видимий ролик грає сам, БЕЗ звуку', s.find(x => x.id === '801').грає && s.find(x => x.id === '801').muted, JSON.stringify(s));
  // 📐 ВИДИМІСТЬ, а не атрибут: [hidden] перебивається будь-яким display у CSS, і саме
  // так 13.10 напис «не відтворюється» стояв на справному ролику (стенд дивився на атрибут).
  const напис = await p.evaluate(() => getComputedStyle(document.querySelector('.fd-video[data-video="801"] .fd-vid-err')).display);
  ok('🔴 на справному ролику напису «не відтворюється» НЕ видно', напис === 'none', напис);

  await до(p, 804); await p.waitForTimeout(900);
  s = await стан(p);
  ok('🔴 прокрутив до другого — перший на паузі, грає лише другий', !s.find(x => x.id === '801').грає && s.find(x => x.id === '804').грає && s.filter(x => x.грає).length === 1, JSON.stringify(s));

  // Аркуш коментарів поверх — пауза.
  await p.evaluate(() => document.querySelector('.fd-card[data-post="804"] [data-comments]')?.click());
  await p.waitForTimeout(700);
  s = await стан(p);
  ok('під аркушем коментарів ролик стоїть', s.every(x => !x.грає), JSON.stringify(s));
  await p.keyboard.press('Escape'); await p.waitForTimeout(800);
  s = await стан(p);
  ok('аркуш закрито — ролик грає далі', s.find(x => x.id === '804').грає, JSON.stringify(s));

  // Кнопка звуку.
  await p.evaluate(() => document.querySelector('.fd-video[data-video="804"] [data-vid-sound]').click());
  await p.waitForTimeout(200);
  s = await стан(p);
  ok('кнопка звуку вмикає звук у цьому ролику', !s.find(x => x.id === '804').muted, JSON.stringify(s));

  // Тап — на весь екран.
  await p.evaluate(() => document.querySelector('.fd-video[data-video="804"] video').click());
  await p.waitForTimeout(700);
  const вікно = await p.evaluate(() => { const v = document.querySelector('.fd-vviewer video'); return v ? { є: true, muted: v.muted, controls: v.controls } : { є: false }; });
  ok('🔴 тап відкриває ролик на весь екран зі звуком і керуванням', вікно.є && !вікно.muted && вікно.controls, JSON.stringify(вікно));
  s = await стан(p);
  ok('…і ролик у картці при цьому на паузі (не два звуки)', s.every(x => !x.грає), JSON.stringify(s));
  await p.click('.fd-vviewer .fd-viewer-close'); await p.waitForTimeout(700);
  ok('✕ закриває перегляд', await p.evaluate(() => !document.querySelector('.fd-vviewer')));

  // Зламаний файл.
  await до(p, 806); await p.waitForTimeout(1500);
  const err = await p.evaluate(() => { const box = document.querySelector('.fd-video[data-video="806"]');
    const e = box.querySelector('.fd-vid-err');
    return { err: box.classList.contains('is-err'), link: getComputedStyle(e).display !== 'none' && !!e.querySelector('a') }; });
  ok('🔴 ролик, що не відтворюється, — обкладинка + «Відкрити відео»', err.err && err.link, JSON.stringify(err));
  await ctx.close();
}

// ── 2. Економія трафіку ──────────────────────────────────────────────────────
{
  const { p, ctx, запити } = await сцена({ saveData: true });
  await до(p, 801); await p.waitForTimeout(900);
  let s = await стан(p);
  ok('🔴 Save-Data: видимий ролик НЕ грає сам і не вантажиться', !s.find(x => x.id === '801').грає && !запити.length, `${JSON.stringify(s)} · запитів ${запити.length}`);
  await p.evaluate(() => document.querySelector('.fd-video[data-video="801"] video').click());
  await p.waitForTimeout(900);
  s = await стан(p);
  ok('Save-Data: тап запускає ролик прямо в картці', s.find(x => x.id === '801').грає && !(await p.evaluate(() => !!document.querySelector('.fd-vviewer'))), JSON.stringify(s));
  await ctx.close();
}

await b.close(); await stop();
done();
