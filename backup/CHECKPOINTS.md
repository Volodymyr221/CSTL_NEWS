# CHECKPOINTS.md — точки збереження для відкату

> Локальні git tags не push'аться через проксі CCR (403). Список SHA нижче — як reference у будь-якій сесії.

---

## Як зробити відкат

**Один коміт назад (чисто, з історією):**
```bash
git revert <SHA>           # створює новий коміт що скасовує зміни
git push origin claude/...  # auto-merge задеплоїть
```

**На конкретну точку (видаляє все після):**
```bash
git reset --hard <SHA>     # ⚠️ деструктивно — стирає всі коміти після SHA
git push --force origin claude/...  # ⚠️ перезаписує гілку
```

**З backup-папки (повний відкат файлів):**
```bash
cp backup/design-v1/style.css style.css
cp backup/design-v1/community.js src/tabs/community.js
# і т.д.
```

---

## Ключові SHA (точки після кожного Tier)

| Tag (локальний) | SHA | Опис |
|-----------------|-----|------|
| `design-v1` | (старий) | Початковий стан до D2 «Поле» (білі картки, гострі рамки) |
| (немає) | `48545d5` | До початку Tier 0 — D2 Громади тільки, інші вкладки на білому |
| `tier-0-baseline` | `5c9bb6c` | **Tier 0** завершено: бежевий фон + прибрано tab-headers + м'які тіні на 4 вкладках |
| `tier-1-light` | `0e89d9f` | **Tier 1** завершено: Світло — hero-таймер з прогрес-кільцем + горизонтальна стрічка 24 годин + 2 pills (село + вулиця) + help-модалка «як дізнатись чергу» |
| `tier-2-buses` | `aa3994d` | **Tier 2** завершено: Автобуси — hero-картка з прогрес-баром відліку + компактний список рейсів (60-70px замість 120px) |
| `buses-gray-v1` | `a47ff79` | **Автобуси сірий стиль** (05-06.06.2026): фон #F0F2F5, порожній стан з бордовим текстом + radial-gradient, кнопка над заголовком, таббар з тінню з усіх боків |

---

## Файлові snapshots (у git, не SHA)

| Папка/файл | Що містить |
|-----------|------------|
| `backup/design-v1/` | Початковий стан 12.05 — `style.css`, `community.js`, `index.html`, `weather.js`, README |
| `backup/design-v2-pre-D2/` | Стан перед D2 «Поле» 12.05 — `style.css`, `community.js`, `index.html` |
| `backup/style-D2-pre-split.css` | Повний `style.css` 2426р до розбиття на 8 модулів |
| `backup/community-pre-split.js` | `community.js` 643р до розбиття на 3 файли |

---

## Конкретні приклади відкату

**Прибрати Tier 2 (Автобуси), залишити Tier 1 (Світло):**
```bash
git revert aa3994d
git push origin claude/startup-ui-module-GWlEk
```

**Повернутись до стану перед Tier 1 (Світло мав вертикальну таблицю):**
```bash
git reset --hard 5c9bb6c
git push --force origin claude/startup-ui-module-GWlEk
```

**Повний відкат до D2 Громади тільки (всі вкладки на білому з рамками):**
```bash
git reset --hard 48545d5
git push --force origin claude/startup-ui-module-GWlEk
```

**Найперший стан (до всіх редизайнів):**
```bash
cp backup/design-v1/style.css style.css
cp backup/design-v1/community.js src/tabs/community.js
cp backup/design-v1/index.html index.html
cp backup/design-v1/weather.js src/core/weather.js
node build.js
# CACHE_NAME bump у sw.js
git add -A && git commit -m "revert: повернення до design-v1"
git push
```

---

## Як додати нову checkpoint після кожного Tier

1. Коміт з Tier завершений → знайти SHA через `git log --oneline -3`
2. Додати рядок у таблицю «Ключові SHA» вище
3. Локально (опційно): `git tag tier-X-name <SHA>`
4. Закомітити цей файл
