# Стан сесії — CSTL NEWS

**Оновлено:** 2026-04-07

---

## Проект

| | |
|--|--|
| **URL** | https://vshevchukkk.github.io/CSTL_NEWS/ |
| **Репозиторій** | https://github.com/VShevchukkk/CSTL_NEWS |
| **Гілка** | `main` |
| **Власник** | Вова Шевчук (VShevchukkk) |

---

## Поточний стан

**MVP задеплоєно.** Анімація splash screen працює.

**Відома проблема:** Claude Code не може пушити напряму (git proxy 403) — поки не перепідключено GitHub під новим іменем `VShvchukkk`. Вова пушить вручну з Mac.

---

## Що зроблено (хронологія)

### Сесія 2 (07.04.2026)
- Додано анімацію splash screen: тінь від уявного світла (shadowSweep, textShadowSweep)
- Додано splashPop і splashFadeUp (@keyframes)
- Контент заставки піднято на 10px (padding-bottom: 150px)
- Кеш оновлено: cstl-20260407-1335
- Виявлено: Claude Code не може пушити (403) через зміну нікнейму — потрібно перепідключити GitHub

### Сесія 1 (06-07.04.2026)
- Обговорили концепцію проекту CSTL NEWS та екосистему Olyka Castle
- Визначили технічний стек: Vanilla JS, GitHub Pages, esbuild, PWA
- Визначили архітектуру: JSON файли як база даних, модульний src/
- Побудували MVP: 17 файлів, 4 вкладки (Новини/Події/Автобуси/Подати)
- Задеплоїли на GitHub Pages (старе посилання volodymyr221.github.io/CSTL_NEWS)
- Налаштували VS Code на Mac Воваа
- Клонували репозиторій на Desktop
- Вова змінив нікнейм GitHub на VShevchukkk
- Виявлено проблему з деплоєм після зміни нікнейму

---

## Відкриті задачі

| Пріоритет | Задача |
|-----------|--------|
| 🔴 Терміново | Перепідключити GitHub в Claude Code (claude.ai → Settings → GitHub) |
| 🟡 Важливо | Перевірити що vshevchukkk.github.io/CSTL_NEWS працює |
| 🟡 Важливо | Переглянути дизайн разом і покращити |
| 🟢 Планується | Замінити тестові статті на реальний контент |
| 🟢 Планується | Налаштувати push з VS Code (перший тест) |

---

## Технічні деталі

**Файл з помилкою:** `.github/workflows/deploy.yml`

**Суть помилки:** CI намагається push bundle.js в main, але main вже має новіші коміти → конфлікт

**Фікс:** додати `git pull --rebase origin main` перед `git push origin main` в deploy.yml

**Файл вже виправлено локально** (в /home/user/CSTL_NEWS на сервері Claude), але не запушено.

---

## Як запустити локально (на комп'ютері)

```bash
cd ~/Desktop/CSTL_NEWS
npm install        # встановити esbuild
node build.js      # зібрати bundle.js
# відкрити index.html в браузері
```

---

## Важливі рішення прийняті

1. **JSON файли замість localStorage** — статті в `data/articles.json`, не в браузері
2. **GitHub Actions** — автодеплой при будь-якому push в main
3. **Service Worker** — офлайн-кешування, різна стратегія для статичних файлів vs data/*.json
4. **Firebase пізніше** — для push-сповіщень і акаунтів (Фаза 3, не зараз)
