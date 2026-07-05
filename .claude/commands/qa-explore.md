# /qa-explore — браузерний смоук-тест (CSTL)

## Що це
Claude сам збирає застосунок локально, запускає headless Chromium (Playwright) і проходить по екранах як живий юзер — ловить падіння, помилки консолі, биту верстку. Скріншоти + короткий звіт. Порт методології з NeverMind. НЕ замінює ручний iPhone-тест для iOS-специфіки.

## Рівні
Quick — головний екран + 1 зачеплена вкладка (дрібний фікс). Standard — усі зачеплені екрани + ключові дії/модалки (3-6). Exhaustive — усі вкладки, шлях юзера, перед великим релізом.

## Передумови
1. npm install (у devDependencies @playwright/test; браузер НЕ качається — у середовищі готовий Chromium, PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1).
2. Знайти готовий Chromium: ls /opt/pw-browsers/ — використати як executablePath. Якщо Playwright шукає інший шлях — симлінк як у NeverMind ($SP = твоя scratchpad-тека):
   mkdir -p $SP/pw-browsers/chromium_headless_shell-N/chrome-headless-shell-linux64
   ln -sfn /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell $SP/pw-browsers/chromium_headless_shell-N/chrome-headless-shell-linux64/chrome-headless-shell
   touch $SP/pw-browsers/chromium_headless_shell-N/INSTALLATION_COMPLETE

## Прогін
1. Зібрати + підняти локально (НЕ прод): node build.js ; python3 -m http.server 4173 &
2. Прочитати РЕАЛЬНИЙ код навігації (app.js / nav) — знайти функцію перемикання вкладок + список вкладок (Автобуси/Дошка/Події/Новини/Громада…). НЕ хардкодити — брати з коду.
3. Написати РАЗОВИЙ Playwright-скрипт у scratchpad (НЕ в репо), який: відкриває http://127.0.0.1:4173/ ; слухає pageerror + console.error весь час ; проходить по потрібних вкладках (за рівнем), скріншот до/після ; за потреби відкриває ключові модалки.
4. Зібрати помилки + скріншоти у scratchpad.

## Звіт
Один рядок: «🔍 Браузер-смоук [рівень]: N екранів · 0 падінь · консоль чиста · верстка ок». Проблемні скріншоти показати власнику. Перевірене позначити «✅ браузер-смоук».

## Fail-soft
Якщо Chromium не запускається в цьому середовищі — НЕ блокувати: звіт «браузер-смоук недоступний, зроблено node --check; перевір вручну на iPhone». Браузер-тест — помічник, не ворота.

## Межі
НЕ замінює ручний iPhone-тест: свайпи, гумове прокручування, PWA з домашнього екрана, реальні push — лишається на власнику.
