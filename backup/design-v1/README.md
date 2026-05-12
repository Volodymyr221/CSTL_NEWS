# Design v1 — снапшот станом на 12.05.2026

Цей каталог містить копії ключових файлів **перед** дизайн-патчем
(тіні замість рамок, кольорові іконки в заголовках, новий фон сторінки,
збільшені цифри).

## Як повернутись назад

```bash
cp "backup/design-v1/style.css" style.css
cp "backup/design-v1/community.js" src/tabs/community.js
cp "backup/design-v1/weather.js" src/core/weather.js
cp "backup/design-v1/index.html" index.html
node build.js
# bump CACHE_NAME у sw.js
git add -A && git commit -m "revert: повернення дизайну v1"
git push
```

Також локально створено git tag `design-v1` (на гілці робочій,
не запушено через мережу — додам пізніше).
