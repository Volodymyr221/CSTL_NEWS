// scripts/gen_privacy.mjs — генерує ПУБЛІЧНУ сторінку `privacy.html` із того самого
// джерела, що показує застосунок (`src/core/legal.js`).
//
// 🔴 НАВІЩО ЦЕ ВЗАГАЛІ ПОТРІБНО. Google Play вимагає **посилання** на політику
// конфіденційності, яке можна відкрити ззовні застосунку. У нас політика жила
// ЛИШЕ всередині додатка (модалка з `LEGAL_DOC_HTML`) — тобто URL, який можна
// вставити в Play Console, не існувало.
//
// 🛑 ЧОМУ ГЕНЕРАЦІЯ, А НЕ ДРУГИЙ ФАЙЛ З ТЕКСТОМ. Копія юридичного тексту — це
// найгірший вид дубля: вона розходиться мовчки, і в якийсь момент у застосунку
// одна редакція, а на публічній сторінці інша. Для документа, під яким людина
// ставить згоду, це не косметика. Тому текст один, а сторінок дві.
// (HOT_RULES №8 — не плодити дублі; тут ціна дубля вища за звичайну.)
//
// Запускається з `build.js` — так само, як `check-imports.js`, тобто сторінка
// перегенерується при кожній збірці й не може відстати від коду.
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { LEGAL_DOC_HTML, LEGAL_UPDATED } from '../src/core/legal.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Стилі свідомо мінімальні й вбудовані: сторінку читатимуть і юрист, і модератор
// Google, і житель із телефона — жоден із них не має чекати на завантаження
// зовнішнього CSS. Класи (`legal-h`, `legal-upd`, `legal-toc`) ті самі, що в
// застосунку, тому й описані тут — стилі застосунку сюди не приїжджають.
const СТОРІНКА = `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#4A121C">
<meta name="description" content="Політика конфіденційності та Правила користування CSTL LIFE — застосунку громади Олики">
<title>Політика конфіденційності — CSTL LIFE</title>
<link rel="apple-touch-icon" href="icons/icon-192.png">
<style>
  :root { --red: #4A121C; --ink: #1a1a1a; --quiet: #6b6b6b; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font: 400 16px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    color: var(--ink); background: #fff;
    max-width: 720px; margin: 0 auto; padding: 28px 20px 72px;
  }
  header { border-bottom: 1px solid #e6e2d8; padding-bottom: 18px; margin-bottom: 24px; }
  .brand { font: 800 20px/1.2 Georgia, 'Times New Roman', serif; color: var(--red); letter-spacing: .02em; }
  .brand span { color: var(--ink); }
  .back { display: inline-block; margin-top: 10px; font-size: 14px; color: var(--red); }
  h1 { font-size: 22px; line-height: 1.25; margin: 14px 0 4px; }
  .legal-h { font-size: 19px; line-height: 1.3; margin: 28px 0 6px; color: var(--red); }
  .legal-upd { font-size: 13px; color: var(--quiet); margin-bottom: 12px; }
  .legal-toc { display: flex; flex-wrap: wrap; gap: 10px 18px; margin: 8px 0 20px; }
  .legal-toc a { font-size: 14px; color: var(--red); }
  p, li { margin: 8px 0; }
  ul, ol { padding-left: 22px; }
  b { font-weight: 700; }
  a { color: var(--red); }
  footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e6e2d8;
           font-size: 13px; color: var(--quiet); }
</style>
</head>
<body>
<header>
  <div class="brand">CSTL <span>LIFE</span></div>
  <h1>Політика конфіденційності та Правила користування</h1>
  <a class="back" href="./">← До застосунку</a>
</header>

${LEGAL_DOC_HTML}

<footer>
  Редакція від ${LEGAL_UPDATED}. Цей документ ідентичний тому, що показує застосунок
  у розділі «Політика і приватність» — обидві сторінки складаються з одного джерела.
  <br>Питання: <a href="mailto:privacy@castlelife.org">privacy@castlelife.org</a>
</footer>
</body>
</html>
`;

writeFileSync(join(ROOT, 'privacy.html'), СТОРІНКА, 'utf-8');
console.log(`✓ privacy.html згенеровано з src/core/legal.js (редакція ${LEGAL_UPDATED})`);
