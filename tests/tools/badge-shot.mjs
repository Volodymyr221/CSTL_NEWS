// Інструмент: знімок значка верифікації у трьох реальних кеглях.
// Запуск руками: node tests/tools/badge-shot.mjs
import { chromium } from 'playwright';
import { launch, projectFile } from '../_lib.mjs';
const css = projectFile('style/base.css');
const mark = projectFile('src/core/supabase.js')
  .match(/return '<span class="cstl-verified"[\s\S]*?<\/span>';/)[0]
  .replace(/^return '/, '').replace(/';$/, '')
  .replace(/'\s*\+\s*'/g, '');
const b = await launch(chromium);
const p = await (await b.newContext({ deviceScaleFactor: 3 })).newPage();
await p.setContent(`<style>${css}
 body{font-family:-apple-system,system-ui,sans-serif;background:#E6E6E3;padding:18px;margin:0}
 .row{display:flex;align-items:center;margin:14px 0;font-weight:700}
 .big{font-size:23px}.mid{font-size:16px}.small{font-size:13px}
 .dark{background:#4A121C;color:#fff;padding:12px;border-radius:8px}</style>
 <div class="row big">Dmytro Vasylchuk ${mark}</div>
 <div class="row mid">Олександр Прендецький ${mark}</div>
 <div class="row small">Олицька міська рада ${mark}</div>
 <div class="pm-head dark"><div class="row big" style="margin:0">Dmytro Vasylchuk ${mark}</div></div>`);
await p.waitForTimeout(400);
await p.screenshot({ path: 'tests/tools/badge-shot.png' });
console.log('знімок: tests/tools/badge-shot.png');
await b.close();
