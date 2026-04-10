# Стан сесії — CSTL NEWS

**Оновлено:** 2026-04-10

---

## Проект

| | |
|--|--|
| **URL** | https://volodymyr221.github.io/CSTL_NEWS/ |
| **Репозиторій** | https://github.com/Volodymyr221/CSTL_NEWS |
| **Гілка** | `claude/code-audit-review-wfuX7` |
| **Власник** | Вова Шевчук (Volodymyr221) |

---

## Поточний стан

**Сайт зараз зламаний** — в коміті `5763587 "Clean up: remove broken build workflows"` видалили `build.js`, `bundle.js` і `.github/workflows/deploy.yml`. Без `bundle.js` `index.html` нічого не підключає, жодна вкладка не працює.

**В процесі відновлення (Фаза 1 А+):**
- [x] Відновлено `build.js` (з коміта `5763587^`) — крок 1 виконано
- [ ] Відновити `bundle.js`
- [ ] Написати новий `deploy.yml` через офіційний GitHub Pages Deploy Action (нічого не комітить у main, деплоїть як artifact)
- [ ] Оновити `CACHE_NAME` і додати `logo.png` у `STATIC_ASSETS`

Коментар: попередня проблема B-01 ("non-fast-forward") виникала через те, що CI комітив `bundle.js` у main. А+ її оминає — CI збирає bundle у пам'яті і деплоїть артефактом, нічого не комітить.

---

## Що зроблено (хронологія)

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
| 🔴 Терміново | Виправити деплой (non-fast-forward помилка) |
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
