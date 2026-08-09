// Порівняння трьох редакцій знака в реальних кеглях. Запуск руками.
import { chromium } from 'playwright';
import { launch, projectFile } from '../_lib.mjs';
const css = projectFile('style/base.css');
const NEW = projectFile('src/core/supabase.js')
  .match(/return '<span class="cstl-verified"[\s\S]*?<\/span>';/)[0]
  .replace(/^return '/, '').replace(/';$/, '').replace(/'\s*\+\s*'/g, '');
// Старий: текстовий гліф у колі — те, що було на скріні Вови.
const OLD = '<span style="display:inline-flex;align-items:center;justify-content:center;'
  + 'width:.72em;height:.72em;margin-left:.28em;border-radius:50%;background:#1D74E8;'
  + 'color:#fff;font-size:max(.86em,11px);font-weight:800;line-height:1;vertical-align:-.08em">✓</span>';
const b = await launch(chromium);
const p = await (await b.newContext({ deviceScaleFactor: 3 })).newPage();
const row = (cls, txt) => `<div class="row ${cls}"><span class="lbl">старий</span> ${txt} ${OLD}
  <span class="lbl" style="margin-left:26px">новий</span> ${txt} ${NEW}</div>`;
await p.setContent(`<style>${css}
 body{font-family:-apple-system,system-ui,sans-serif;background:#E6E6E3;padding:16px;margin:0}
 .row{display:flex;align-items:center;margin:16px 0;font-weight:700}
 .lbl{font-size:11px;font-weight:600;color:#888;margin-right:8px}
 .big{font-size:23px}.mid{font-size:16px}.small{font-size:13px}
 .dark{background:#4A121C;color:#fff;padding:10px 14px;border-radius:8px}</style>
 ${row('big','Dmytro')}
 ${row('mid','Олександр Прендецький')}
 ${row('small','Олицька міська рада')}
 <div class="pm-head dark">${row('big','Dmytro')}</div>`);
await p.waitForTimeout(400);
await p.screenshot({ path: 'tests/tools/badge-compare.png' });
console.log('знімок: tests/tools/badge-compare.png');
await b.close();
