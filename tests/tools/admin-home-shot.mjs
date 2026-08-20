// Інструмент: знімок ГОЛОВНОГО ЕКРАНА адмінки на телефоні.
//
// 🔑 Навіщо окремий інструмент, а не стенд: стенд відповідає «чи не зламали», а
// це питання «чи добре виглядає» — на нього відповідає око, і відповідь потрібна
// ДО того, як зміна поїде на прод.
//
// ⚠️ Supabase підмінений цілком: справжнього входу тут немає і не треба —
// перебудовано лише ВХІДНИЙ екран, а він малюється з локальних масивів.
import { chromium } from '@playwright/test';
// 🔑 Браузер піднімаємо тим самим шляхом, що й усі стенди (`tests/_lib.mjs`):
// у цьому середовищі стоїть окрема збірка, і прямий `chromium.launch()` падає
// на «Executable doesn't exist».
import { launch } from '../_lib.mjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT  = process.env.OUT || '/tmp/admin-home.png';
const ПОРОЖНЯ = process.argv.includes('--empty');   // сцена «усе розібрано»

const сервер = createServer((req, res) => {
  const шлях = join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html');
  if (!existsSync(шлях)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': шлях.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  res.end(readFileSync(шлях));
});
await new Promise(r => сервер.listen(0, r));
const порт = сервер.address().port;

const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();

// Підміна бібліотеки Supabase — до будь-якого скрипта сторінки.
await p.addInitScript(([порожня]) => {
  const рядки = порожня ? [] : [{}, {}, {}];
  const відповідь = (data) => Promise.resolve({ data, error: null });
  const запит = (data) => {
    const o = { select: () => o, eq: () => o, order: () => o, limit: () => o, maybeSingle: () => відповідь(null),
                then: (f) => відповідь(data).then(f) };
    return o;
  };
  window.supabase = {
    createClient: () => ({
      auth: {
        getSession: () => відповідь({ session: { user: { id: 'u1', email: 'vova@example.com' } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: () => відповідь(null),
      },
      from: (табл) => {
        if (табл === 'admins') return запит([{ email: 'vova@example.com', name: 'Вова', created_at: '2026-05-17' }]);
        if (табл === 'posts')  return запит(порожня ? [] : рядки);
        if (табл === 'ad_reports') return запит(порожня ? [] : [{ status: 'new' }, { status: 'new' }]);
        if (табл === 'fundraiser_requests') return запит(порожня ? [] : [{ status: 'new' }]);
        if (табл === 'cms_articles') return запит(порожня ? [] : [{ status: 'draft' }, { status: 'draft' }, { status: 'draft' }, { status: 'draft' }]);
        return запит([]);
      },
      rpc: (name) => {
        if (name === 'admin_list_access') {
          return відповідь(порожня ? [] : [
            { вид: 'admin',  uid: 'u1', email: 'vova@example.com', name: 'Вова', created_at: '2026-05-17', last_seen_at: '2026-08-20' },
            { вид: 'editor', uid: 'u2', email: 'old@example.com',  name: 'Стара редакторка', created_at: '2026-07-09', last_seen_at: null,
              can_create: true, can_publish: true, can_events: false },
          ]);
        }
        return відповідь(null);
      },
    }),
  };
}, [ПОРОЖНЯ]);

await p.route('**cdn.jsdelivr.net/**', r => r.fulfill({ contentType: 'text/javascript', body: '/* підмінено */' }));
await p.goto(`http://127.0.0.1:${порт}/admin.html`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.tile-grid, .queue', { timeout: 8000 }).catch(() => {});
await p.waitForTimeout(400);
await p.screenshot({ path: OUT, fullPage: true });
console.log('знімок:', OUT);
await b.close(); сервер.close();
