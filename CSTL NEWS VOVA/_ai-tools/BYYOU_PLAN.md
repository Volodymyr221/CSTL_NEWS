# BYYOU_PLAN — стан потоку /byyou (CSTL)

**Статус:** active
<!-- idle=вимкнено · active=потік іде (push-замок УВІМКНЕНО) · paused=пауза (продовжити /byyou) · done=завершено -->

**Ціль:** техборг навігації — прибрати мертвий код після «Шо в селі» (Н-9 частина): сегмент «Новини|Події», осиротілий рендер новин-табу, мертвий CSS.
**Власник:** Рома · **Гілка:** roma/nav-cleanup · **Rollback-tag:** byyou-start-nav-cleanup
**Зона:** ⚙️ Системне-інфра / Новини. Узгоджено з Ромою («зроби тех борг»).

## Кроки
| # | Крок | Стан | Коміт |
|---|------|------|-------|
| 1 | `news.js` — прибрати `showNewsSegment` + `window.cstlShowNewsSegment` + `.news-seg-btn` listener + осиротілі listener-и `#geo-filters`/`#news-list` у `attachNewsListeners` (лишити ТІЛЬКИ `#article-modal` share/img listener) | 🟢 | ☐ |
| 2 | `news.js` — прибрати осиротілий рендер новин-табу: `renderGeoFilters`, `renderNews`, `setGeoFilter`, `getFiltered`, `GEO_FILTERS`, `activeGeo`; trim `initNews` (без цих викликів). **Лишити:** `newsCardsHtml`/`renderFeatured`/`renderRow`/`badgesHtml`/`ensureNewsLoaded`/`openArticle`/`handleImgError`/`geoColor`/`catColor`/`*_COLORS`/`renderArticleBody` (юзає Громада+модалка) | 🟢 | ☐ |
| 3 | `filters.css` — прибрати `--news-seg-h`, `.news-seg`, `.news-seg-btn`, `.filters-bar`, `#news-seg-news`. **Лишити** `.chips-row`/`.chip` | 🟢 | ☐ |
| 4 | `events.css` — прибрати мертвий `.ev-card*` кластер (картка/cover/badge/body/акордеон/`.ev-detail-close`). **Лишити** `.ev-skeleton*`+keyframes, `.ev-ics-btn`, `.shotam-*`, `.events-*`, `.cal-*` | 🟢 | ☐ |
| 5 | `news.css` — прибрати осиротілий `.news-list` | 🟢 | ☐ |
| 6 | CACHE bump + `node build.js` + браузер-смоук (Громада новини + «Шо в селі» стрічка+модалка не зламані) + реліз-нотатки → брама деплою | 🟡 | ☐ |

## Оцінка обсягу
~6 кроків (src + css), з браузер-смоуком ≈ 20-25% вікна. Розбивати не треба.

## Ризик і як ловимо
Ризик — випадково прибрати живе (Громада-новини/модалка/«Шо в селі» юзають частину news.css/events.css/news.js). Ловимо: `node build.js` (check-imports) + браузер-смоук по Громаді+«Шо в селі»+модалці ПЕРЕД деплоєм.

## Де зупинились
Гілка `roma/nav-cleanup` від main. Кодом ще нічого — чекаю «ок» на брамі старту.

## Реліз-нотатки
- ЩО ЗМІНИЛОСЬ:
- ЩО МОЖЕ ЗЛАМАТИСЬ:
- ЩО ПЕРЕВІРИТИ:

## Історія
- ✅ 06.07: «Шо в селі» + фікс сміття (#211) · стартові скіли (#212). Деталі → SESSION_STATE_ROMA.
