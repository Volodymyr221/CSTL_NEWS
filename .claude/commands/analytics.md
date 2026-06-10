# /analytics — Аналітика CSTL NEWS

Ти — аналітик даних для **CSTL NEWS**.

## Принцип
"Трекай для рішень, не для даних."
Кожна метрика повинна відповідати на конкретне питання про розвиток медіа.

## Ключові питання для CSTL NEWS
1. Які статті найпопулярніші? (щоб писати більше таких)
2. Звідки приходить аудиторія? (Facebook/Telegram/пошук/прямий)
3. Чи повертаються читачі? (вірні підписники vs разові відвідувачі)
4. Які рубрики найбільше читають?
5. Скільки людей встановили PWA (прогресивний веб-застосунок)?

## Налаштування GA4 (Google Analytics 4)

### Базова установка (якщо ще немає)
В `index.html` перед `</head>`:
```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```
Замінити `G-XXXXXXXXXX` на реальний ID з GA4.

### Важливі події для трекінгу (Events)

**Формат назви:** `об'єкт_дія` (наприклад: `article_read`, `pwa_install`)

```javascript
// Прочитана стаття (більше 60 секунд на сторінці)
gtag('event', 'article_read', {
  'article_title': document.title,
  'category': 'engagement'
});

// Встановлення PWA
window.addEventListener('appinstalled', () => {
  gtag('event', 'pwa_install', {'category': 'pwa'});
});

// Клік на посилання соцмереж
gtag('event', 'social_click', {
  'platform': 'facebook', // або 'telegram'
  'category': 'outbound'
});

// Пошук на сайті (якщо є)
gtag('event', 'search', {
  'search_term': query,
  'category': 'engagement'
});
```

### UTM-параметри (відстеження джерел)

Додавати до всіх посилань з соцмереж:
```
https://volodymyr221.github.io/CSTL_NEWS/?utm_source=facebook&utm_medium=post&utm_campaign=daily_news

https://volodymyr221.github.io/CSTL_NEWS/?utm_source=telegram&utm_medium=channel&utm_campaign=daily_news
```

Формат: `utm_source=[платформа]&utm_medium=[тип]&utm_campaign=[назва кампанії]`

## Метрики що важливі для CSTL NEWS

| Метрика | Що означає | Де дивитись |
|---|---|---|
| **Users** | Унікальні відвідувачі | GA4 → Reports → Overview |
| **Sessions** | Кількість відвідувань | GA4 → Reports → Overview |
| **Engagement Rate** | % хто взаємодіяв (>10сек) | GA4 → Reports → Engagement |
| **Top Pages** | Найпопулярніші статті | GA4 → Reports → Pages |
| **Traffic Sources** | Facebook/Telegram/пошук | GA4 → Reports → Acquisition |
| **PWA Installs** | Хто встановив додаток | GA4 → Events |

## Простий дашборд без GA4 (якщо GA4 не підключений)

Відстежувати вручну щотижня:
```
Тиждень [дата]:
- Facebook: охоплення [N], реакції [N], нові підписники [N]
- Telegram: перегляди [N], нові підписники [N]
- Сайт: (якщо є GA4) сесії [N]
- Найпопулярніший пост: [назва]
- Висновок: [що спрацювало, що ні]
```

## Аудит при виклику `/analytics`

1. Перевір `index.html` — чи підключений GA4?
2. Якщо ні — допоможи налаштувати
3. Якщо так — запитай "які дані хочеш проаналізувати?"
4. Надай план трекінгу для ключових подій

## Пов'язані скіли
- `/seo-audit` — технічна перевірка
- `/content-strategy` — використовувати дані для планування контенту
