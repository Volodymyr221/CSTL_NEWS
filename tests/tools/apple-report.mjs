// tests/tools/apple-report.mjs — РОЗБІР сирих даних `apple-audit`.
//
// Прилад (`apple-audit.mjs`) знімає числа. Цей файл їх ЧИТАЄ і зводить у
// відповіді на конкретні § скіла `apple-design`. Поділ навмисний: зняття даних
// довге (обхід 14 екранів у браузері), а розбір хочеться переганяти десятки
// разів, не чекаючи прогону.
//
// Запуск:
//   node tests/tools/apple-report.mjs feedback   # §1 відгук + §10 жести
//   node tests/tools/apple-report.mjs motion     # §3 перериваність + §4 пружини
//   node tests/tools/apple-report.mjs material   # §12 матеріали й глибина
//   node tests/tools/apple-report.mjs a11y       # §14 три prefers-*
//   node tests/tools/apple-report.mjs type       # §15 типографіка
//
// ⚠️ Тут НЕМА жодного власного виміру — лише агрегація знятого. Якщо число
// виглядає дивним, шукати причину треба в приладі, а не тут.

import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOT } from '../_lib.mjs';

const RAW = JSON.parse(readFileSync(join(ROOT, 'CSTL NEWS VOVA', '_ai-tools', 'APPLE_AUDIT_RAW.json'), 'utf8'));
const екрани = Object.entries(RAW.екрани);
const ЩО = (process.argv[2] || 'feedback').replace(/^--/, '');

// Родина вузла — щоб не сипати сотнями окремих рядків. `.bd-chip.active` і
// `.bd-chip` це одна родина; нас цікавить конструкція, а не її стан.
const родина = (в) => {
  const cls = (в.match(/\.[a-z0-9_-]+/gi) || [])[0];
  return cls || в.split(/[#.]/)[0];
};
const табл = (мапа, скільки = 18) => Object.entries(мапа)
  .sort((a, b) => b[1] - a[1]).slice(0, скільки)
  .map(([k, v]) => `   ${String(v).padStart(4)}  ${k}`).join('\n');

// ── §1 ВІДГУК + §10 ЖЕСТИ ───────────────────────────────────────────────────
if (ЩО === 'feedback') {
  console.log('§1 ВІДГУК НА НАТИСК + §10 ЖЕСТИ\n' + '='.repeat(60));
  let всього = 0, безActive = 0, малі = 0, німі = 0;
  const родиниБезActive = {}, родиниМалі = {}, найменші = [];

  for (const [екран, д] of екрани) {
    const ц = д.цілі;
    const bA = ц.filter(c => !c.active).length;
    const м  = ц.filter(c => c.ш < 44 || c.в < 44).length;
    // «Німа» ціль = і правила :active немає, І рідне підсвічування вимкнене
    // (`-webkit-tap-highlight-color` прозорий). Тобто на натиск не стається
    // РІВНО НІЧОГО — це і є провал §1 у чистому вигляді.
    const н = ц.filter(c => !c.active && /rgba\([^)]*,\s*0\)/.test(c.tapHighlight)).length;
    всього += ц.length; безActive += bA; малі += м; німі += н;
    console.log(`${екран.padEnd(28)} цілей ${String(ц.length).padStart(4)} · без :active ${String(bA).padStart(4)}` +
                ` (${Math.round(bA / ц.length * 100)}%) · <44px ${String(м).padStart(4)} (${Math.round(м / ц.length * 100)}%) · німих ${н}`);
    for (const c of ц) {
      if (!c.active) родиниБезActive[родина(c.вузол)] = (родиниБезActive[родина(c.вузол)] || 0) + 1;
      if (c.ш < 44 || c.в < 44) {
        родиниМалі[родина(c.вузол)] = (родиниМалі[родина(c.вузол)] || 0) + 1;
        найменші.push({ п: Math.min(c.ш, c.в), вузол: c.вузол, текст: c.текст, ш: c.ш, в: c.в, екран });
      }
    }
  }
  console.log(`\nРАЗОМ по 14 екранах: цілей ${всього} · без :active ${безActive} (${Math.round(безActive / всього * 100)}%)` +
              ` · менших за 44px ${малі} (${Math.round(малі / всього * 100)}%) · німих ${німі}`);

  console.log('\n── Родини БЕЗ правила :active (топ) ──');
  console.log(табл(родиниБезActive));
  console.log('\n── Родини з тап-ціллю менше 44px (топ) ──');
  console.log(табл(родиниМалі));

  console.log('\n── Найдрібніші тап-цілі (унікальні) ──');
  const бачив = new Set();
  найменші.sort((a, b) => a.п - b.п);
  let n = 0;
  for (const c of найменші) {
    if (бачив.has(c.вузол) || n >= 14) continue;
    бачив.add(c.вузол); n++;
    console.log(`   ${String(c.ш).padStart(3)}×${String(c.в).toString().padEnd(3)}  ${c.вузол}  «${c.текст}»  [${c.екран}]`);
  }

  // §10: `touch-action` — чи не забрано в браузера можливість вести жест.
  const touch = {};
  for (const [, д] of екрани) for (const c of д.цілі) touch[c.touchAction] = (touch[c.touchAction] || 0) + 1;
  console.log('\n── touch-action на клікабельних вузлах ──');
  console.log(табл(touch, 6));
}

// ── §3 ПЕРЕРИВАНІСТЬ + §4 ПРУЖИНИ ───────────────────────────────────────────
if (ЩО === 'motion') {
  console.log('§3 ПЕРЕРИВАНІСТЬ + §4 ПРУЖИНИ\n' + '='.repeat(60));
  const криві = {}, тривалості = {}, властивості = {}, довгі = [];
  const бачив = new Set();
  for (const [екран, д] of екрани) {
    for (const t of д.переходи) {
      const ключ = t.вузол + '|' + t.властивість + '|' + t.тривалість;
      if (бачив.has(ключ)) continue;
      бачив.add(ключ);
      криві[t.крива] = (криві[t.крива] || 0) + 1;
      тривалості[t.тривалість] = (тривалості[t.тривалість] || 0) + 1;
      for (const p of t.властивість.split(',').map(s => s.trim())) властивості[p] = (властивості[p] || 0) + 1;
      const мс = Math.max(...t.тривалість.split(',').map(s => parseFloat(s) * 1000));
      if (мс >= 300) довгі.push({ мс, вузол: t.вузол, власт: t.властивість, крива: t.крива, екран });
    }
  }
  console.log('\n── Криві переходів (унікальні вузол+властивість) ──');
  console.log(табл(криві, 12));
  console.log('\n── Тривалості ──');
  console.log(табл(тривалості, 14));
  console.log('\n── Що саме анімується ──');
  console.log(табл(властивості, 16));
  console.log('\n── Переходи від 300мс (кандидати на «не перервеш пальцем») ──');
  довгі.sort((a, b) => b.мс - a.мс);
  const бачив2 = new Set();
  let n = 0;
  for (const d of довгі) {
    if (бачив2.has(d.вузол) || n >= 20) continue;
    бачив2.add(d.вузол); n++;
    console.log(`   ${String(Math.round(d.мс)).padStart(5)}мс  ${d.вузол}  [${d.власт}]  ${d.крива}`);
  }
  const анім = {};
  for (const [, д] of екрани) for (const a of д.анімації) анім[`${a.назва} ${a.тривалість} ×${a.повтори}`] = (анім[`${a.назва} ${a.тривалість} ×${a.повтори}`] || 0) + 1;
  console.log('\n── @keyframes-анімації (§14: нескінченні — окремий ризик) ──');
  console.log(табл(анім, 12) || '   (немає)');
}

// ── §12 МАТЕРІАЛИ Й ГЛИБИНА ─────────────────────────────────────────────────
if (ЩО === 'material') {
  console.log('§12 МАТЕРІАЛИ Й ГЛИБИНА\n' + '='.repeat(60));
  const склоНаСклі = new Map(), блюри = {};
  let зіСклом = 0, прозорих = 0;
  for (const [екран, д] of екрани) {
    for (const m of д.матеріали) {
      if (m.blur) { зіСклом++; блюри[m.blur] = (блюри[m.blur] || 0) + 1; } else прозорих++;
      if (m.склоПоверхСкла && !склоНаСклі.has(m.вузол + '<' + m.склоПоверхСкла))
        склоНаСклі.set(m.вузол + '<' + m.склоПоверхСкла, { m, екран });
    }
  }
  console.log(`поверхонь зі склом (backdrop-filter): ${зіСклом} · просто прозорих: ${прозорих}`);
  console.log('\n── Сила блюру ──');
  console.log(табл(блюри, 12));
  console.log(`\n── 🔴 СКЛО ПОВЕРХ СКЛА (скіл: «ніколи не клади світле скло на світле») — ${склоНаСклі.size} пар ──`);
  let n = 0;
  for (const [ключ, { m, екран }] of склоНаСклі) {
    if (n++ >= 18) break;
    console.log(`   ${ключ.split('<')[0]}\n      під ним: ${m.склоПоверхСкла}  ·  тло ${m.тло}  ·  blur ${m.blur || '—'}  [${екран}]`);
  }
}

// ── §14 ДОСТУПНІСТЬ ─────────────────────────────────────────────────────────
if (ЩО === 'a11y') {
  console.log('§14 ДОСТУПНІСТЬ — три prefers-*\n' + '='.repeat(60));
  console.log('Δ = скільки вузлів змінили обчислені стилі. «шум» = те саме порівняння');
  console.log('стану З САМИМ СОБОЮ. Δ ≤ шум читати як «підтримки немає».\n');
  let провалів = 0;
  for (const [екран, д] of екрани) {
    const p = д.prefers || {};
    const ряд = ['reduced-motion', 'reduced-transparency', 'contrast'].map(k => {
      const δ = p[k]?.змінилось ?? '?';
      const живе = typeof δ === 'number' && δ > (p.шум || 0);
      if (!живе) провалів++;
      return `${k.padEnd(22)} Δ${String(δ).padStart(3)} ${живе ? '✅' : '❌'}`;
    });
    console.log(`${екран}\n   шум ${p.шум}\n   ${ряд.join('\n   ')}`);
  }
  console.log(`\nПровалів (Δ не перевищує шум) — ${провалів} з ${екрани.length * 3}`);
}

// ── §15 ТИПОГРАФІКА ─────────────────────────────────────────────────────────
if (ЩО === 'type') {
  console.log('§15 ТИПОГРАФІКА — tracking і leading по кеглях\n' + '='.repeat(60));
  console.log('Скіл: tracking РОЗМІР-СПЕЦИФІЧНИЙ. Велике — тісніше (відʼємне),');
  console.log('дрібне — трохи вільніше. Одне значення на всі кеглі неправильне десь.\n');
  const поКеглю = new Map();
  const шрифти = {};
  for (const [, д] of екрани) for (const t of д.типографіка) {
    const k = t.кегль;
    if (!поКеглю.has(k)) поКеглю.set(k, { n: 0, tr: new Map(), lead: [] });
    const b = поКеглю.get(k);
    b.n++;
    const em = +(t.tracking / t.кегль).toFixed(3);
    b.tr.set(em, (b.tr.get(em) || 0) + 1);
    if (typeof t.leading === 'number') b.lead.push(t.leading);
    шрифти[t.шрифт] = (шрифти[t.шрифт] || 0) + 1;
  }
  console.log('кегль   вузлів  tracking (em → скільки вузлів)                leading сер.');
  for (const [к, b] of [...поКеглю.entries()].sort((a, b) => b[0] - a[0])) {
    const tr = [...b.tr.entries()].sort((x, y) => y[1] - x[1]).slice(0, 3)
      .map(([em, n]) => `${em >= 0 ? '+' : ''}${em}em×${n}`).join(' ');
    const lead = b.lead.length ? (b.lead.reduce((s, x) => s + x, 0) / b.lead.length).toFixed(2) : '—';
    console.log(`${String(к).padStart(5)}px ${String(b.n).padStart(6)}  ${tr.padEnd(44)} ${lead}`);
  }
  console.log('\n── Сімейства шрифтів ──');
  console.log(табл(шрифти, 8));
}
