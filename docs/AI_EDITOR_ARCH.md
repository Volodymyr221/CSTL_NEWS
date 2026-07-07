# AI-Редактор CSTL — Архітектура

> Системна платформа-редактор: **ядро + плагіни**. Апгрейди довішуються як плагіни,
> ядро (`pipeline`) не змінюється. Замінює розкидану по `scripts/` логіку єдиним домом `editor/`.
>
> Схвалено Ромою 2026-07-07. Статус: Блок 1 (ядро + місія «Свята»).

---

## 1. Ідея

Один **AI-редактор**, що для кожної «місії» проганяє контент через конвеєр і **зберігає готову чернетку в кабінет Алли** (не авто-публікує). Алла переглядає, править, публікує (або ставить автопостинг на дату). Публікацію в git робить наявний `sync_cms.py`.

```
AI-редактор (пише) → cms_articles [draft]
        ↓
Алла в кабінеті: перегляд → правки → [ready] (або автопостинг на дату/час)
        ↓
sync_cms.py (наявний) → git → сайт
```

## 2. Конвеєр (pipeline)

Кожна місія проходить фіксовані стадії. Стадії — **плагіни за інтерфейсами**; ядро оркеструє, не знаючи конкретики.

```
Source → Reader → Filter → Writer → Image → Sink
(звідки) (читає)  (відсів) (пише)  (фото)  (куди)
```

| Стадія | Що робить | Інтерфейс | Плагіни (Блок 1) | Майбутнє |
|--------|-----------|-----------|------------------|----------|
| **Source** | звідки брати теми/матеріали | `sources/base.Source` | `calendar` (свята за 7 днів) | web_search, rss, telegram, facebook, vopas |
| **Reader** | дотягнути+очистити повний текст | `readers/base.Reader` | (свята — не треба; тонка обгортка) | `article` (реюз parse_rss fetch+clean) |
| **Filter** | відсів: дедуп, якість, SSRF | `filters/base.Filter` | `dedup`, `quality` (реюз) | семантичний дедуп (embeddings) |
| **Writer** | AI пише статтю + image_query (укр.) | `writers/base.Writer` | `ai_writer` (Anthropic) | стилі/тони, багатомовність |
| **Image** | підібрати фото | `images/base.ImageProvider` | `wikimedia`, `og` (реюз) | `flux` (генерація) |
| **Sink** | куди покласти чернетку | `sinks/base.Sink` | `cabinet` (Supabase draft), `queue` (файл-fallback) | telegram-draft, e-mail |

**Одиниця що тече конвеєром — `Draft`** (`core/models.py`): title, lead, content, category, geo, date, image, image_query, image_credit, source_urls, kind, status.

## 3. Розширюваність (чому «на перспективу»)

- **Новий конектор / провайдер фото / sink** = новий файл-плагін + 1 рядок у `core/registry.py`. Ядро не чіпається.
- **Місії — декларативні** (`editor/missions/*.yml`): яка Source, які Filter, який Image-провайдер, який Sink, параметри. Додати місію = додати yml, не код.
- **Реєстр плагінів** (`core/registry.py`) — маппінг `ім'я → клас`. Pipeline бере плагіни за іменами з конфіга місії.

## 4. Дерево

```
editor/
├── core/
│   ├── models.py      # Draft (dataclass) — одиниця конвеєра
│   ├── pipeline.py    # оркестратор стадій
│   ├── registry.py    # реєстр плагінів (ім'я→клас)
│   ├── config.py      # завантаження місій (yml)
│   └── spend.py       # лічильник витрат Anthropic (data/ai_spend.json)
├── sources/    base.py + calendar.py
├── readers/    base.py + article.py (обгортка parse_rss)
├── filters/    base.py + dedup.py + quality.py (реюз parse_rss)
├── images/     base.py + wikimedia.py + og.py (реюз)
├── writers/    base.py + ai_writer.py (Anthropic)
├── sinks/      base.py + cabinet.py (Supabase) + queue.py (файл-fallback)
├── missions/   holidays.yml (+ пізніше hromada.yml, volyn.yml)
└── run.py      # CLI: python -m editor.run --mission holidays [--dry-run] [--sink queue]
```

## 5. Sink-стратегія (розв'язання залежності від ключа)

`cabinet` (запис у `cms_articles status=draft` через Supabase REST, `SUPABASE_SERVICE_ROLE_KEY`) — **бойовий**. Контракт дзеркалить наявний `sync_cms.py` (headers `apikey`+`Bearer`, `/rest/v1/cms_articles`).

`queue` (запис у файл `data/editor_drafts.json`) — **fallback для тесту БЕЗ ключа Вови**. Обирається через `--sink queue` або якщо `SUPABASE_SERVICE_ROLE_KEY` порожній. Так увесь конвеєр перевіряється до того, як Вова вставить ключ.

## 6. Що НЕ ламаємо

- `parse_rss.py` (1402р, живий новинний бот) — **не переписуємо**, лише обгортаємо потрібні функції за інтерфейсами (`fetch_full_article`, `clean_article_text`, `is_dup_title`, `is_allowed_url`, `SAFE_OPENER`, `fetch_og_image`, `fetch_wikimedia_image`).
- `ai_news_agent.py` + новинний workflow — працюють далі. Міграція новин на `editor/` — окремими блоками пізніше.

## 7. Ключі / інфра (одноразово, Вова)

| Ключ | Куди | Для чого |
|------|------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub → Secrets → Actions | cabinet-sink пише чернетки |
| `SUPABASE_URL` (variable) | GitHub → Variables | адреса проекту (є дефолт) |
| SQL `supabase_editor_cabinet.sql` | Supabase SQL Editor | таблиця `cms_articles` + RLS |
| `ANTHROPIC_API_KEY` | GitHub Secret (є) | writer пише статті |

**НЕ потрібно:** Cloudflare/FLUX (фото шукаємо на Wikimedia, не генеруємо).

## 8. Дорожня карта блоків

- **Блок 1 (цей):** ядро + інтерфейси + док + місія «Свята» (пілот, чернетка→кабінет).
- **Блок 2:** кабінет — редагування чернеток + автопостинг на дату/час (Шо в селі + Новини-Громада).
- **Блок 3+:** мігрувати місії Новини/Волинь на `editor/` (обгорнути parse_rss) + семантичний дедуп; пенсія старих скриптів.
- **Далі (плагіни):** конектори (telegram/facebook), генерація фото (flux), нові sink-и.
