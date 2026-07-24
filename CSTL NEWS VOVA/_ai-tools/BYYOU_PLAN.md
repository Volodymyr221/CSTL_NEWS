# BYYOU_PLAN — стан потоку /byyou (CSTL)

**Статус:** `active`

> Проєкт одноосібний (власник Вова). Коли стартує новий напівавтономний потік через `/byyou`,
> цей файл заповнюється планом (10-15 кроків) і статусом `active`/`paused`. Архіви завершених
> потоків — файли `BYYOU_ARCHIVE_*.md` у цій же папці.

---

**Гілка:** `claude/startuem-79wz8r`
**Ціль:** Надійне завантаження зображень скрізь (банер/аватар сторінки, фото постів/чату/оголошень, аватар профілю) — щоб жоден користувач у жодному місці не ловив «Load failed», незалежно від розміру/формату фото й віку спільноти.

**Корінь:** частина шляхів шле у сховище СИРИЙ файл (телефонне фото 3-5 МБ) без стиснення → `uploadPhotoToStorage` падає «Load failed». Стиснуті шляхи працюють. Рішення: ОДИН надійний хелпер (стиснення + послідовний upload + повтор при збої) і перевести на нього ВСІ місця.

### Кроки
| # | Крок | Файли | Стан |
|---|------|-------|------|
| 1 | Новий модуль `core/upload.js`: `uploadImageReliable(file,opts)` (стиснення+повтор) + `uploadBlobWithRetry(blob,folder)` (повтор для вже стиснутих) | `src/core/upload.js` | 🟢 |
| 2 | Банер сторінки: сире → `uploadImageReliable` + try/catch | `src/tabs/feed.js` | 🟢 |
| 3 | Аватар сторінки: сире → `uploadImageReliable` (square) | `src/tabs/feed.js` | 🟢 |
| 4 | Фото постів: inline compress+retry → `uploadImageReliable` (DRY) | `src/tabs/feed.js` | 🟢 |
| 5 | Фото приватного чату Дошки: сире → `uploadImageReliable` | `src/tabs/board-chat.js` | 🟢 |
| 6 | Фото оголошення: `uploadPhotoToStorage` → `uploadBlobWithRetry` (додати повтор) | `src/tabs/community-modal.js` | 🟢 |
| 7 | Аватар профілю: → `uploadImageReliable` (square, +повтор) | `src/core/account-ui.js` | 🟢 |
| 8 | Bump `CACHE_NAME` | `sw.js` | 🟢 |
| 9 | `node --check` усіх змінених + `node build.js` | — | 🟢 |
| 10 | Браузер-смоук `/qa-explore` (або fail-soft node --check) | — | 🟢 |
| 11 | Реліз-нотатки + смоук на iPhone: банер/аватар сторінки, фото поста, фото чату, фото оголошення, аватар профілю | — | 🟡 |

**Де зупинились:** план складено, чекаю «ок» на старті (Брама старту). Push заблоковано до слова «деплой».
