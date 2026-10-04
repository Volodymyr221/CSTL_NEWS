# ЗАВДАННЯ ВОВІ — ручні кроки після сесії 02.10.2026

> Завдання · замовлення · черга · список · TODO · що не зроблено · руками
> (усі синоніми навмисно — урок `NEVYKONANI_ZAVDANNIA.md`)

🗣️ **Вова 02.10:** «Роби зараз те що ти можеш зробити сам, по черзі все і деплой,
далі те що я маю зробити руками я буду робити по черзі під твоєю інструкцією».

Нижче — **лише те, чого сесія зробити не може**, у порядку виконання. Після кожного
кроку напиши в чат «зробив N» — далі я перевіряю і веду до наступного.

---

## 1. ✅ ЗРОБЛЕНО 04.10 — секрет `SUPABASE_ACCESS_TOKEN`

> Ключ НОВОГО типу (з обмеженими правами): лише **Edge Functions · read-write**, лише проєкт Olyka Castle.
> ⏰ **Строк дії до 02.10.2027** (Supabase не дає більше року). До цієї дати
> створити новий і замінити секрет, інакше `functions-deploy.yml` знову впаде.

### (як було)

**Чому першим.** Воркфлов `Deploy Supabase Edge Functions` (автодеплой серверних
функцій із репозиторію) запускався **один раз, 25.09, і впав**: секрету немає.
Відтоді жодна правка функцій не доїхала в прод сама: ні ранкове зведення
(`send-digest-push`), ні стеля push (`send-page-push`), ні фікс push тип 4
(`send-unanswered-push`).

1. supabase.com → аватар угорі праворуч → **Account preferences → Access Tokens** →
   **Generate new token**, назва `github-functions-deploy`, скопіювати.
2. github.com/Volodymyr221/CSTL_NEWS → **Settings → Secrets and variables →
   Actions → New repository secret**. Name: `SUPABASE_ACCESS_TOKEN`, Secret: токен.
3. Поки НЕ запускати — спершу крок 2.

## 2. ✅ ЗРОБЛЕНО 04.10 — `send-digest-push` без перевірки токена входу (Вова: «Роби»)

Ранкове зведення кличе сама база (розклад `pg_cron`) з секретом у заголовку —
рівно як `send-page-push`, `send-answer-push`, `send-comment-push`,
`send-event-push`. Усім чотирьом у `supabase/config.toml` стоїть
`verify_jwt = false`, а зведенню рядка немає. Отже при деплої воно отримає типове
`true`, шлюз Supabase відповідатиме **401**, і зведення мовчатиме.

🛑 Цей рядок я **не можу дописати сам**: запобіжник сесії позначив його як
послаблення авторизації. Сама функція однаково перевіряє секрет
`x-cstl-push-secret` (рядок ~182 `index.ts`), тобто захищена так само, як сусіди.

➡️ Напиши **«дозволяю verify_jwt false для зведення»** — і я додам рядок, або
додай сам у кінець `supabase/config.toml`:
```
[functions.send-digest-push]
verify_jwt = false
```

## 3. ✅ ЗРОБЛЕНО 04.10 — три SQL-файли (усі Success; розклад дав cron id 14 і 16)

Відкрити файл на GitHub → кнопка **Raw** → виділити все → вставити в SQL Editor → Run.
1. `scripts/supabase_post_reads.sql` — «Прочитали N» під дописом.
2. `scripts/supabase_push_quota.sql` — стеля 3 push класу «громада» на добу.
3. `scripts/supabase_digest_push.sql` — ранкове зведення + розклад.

Кожен має закінчитись `Success`. Помилка — скинь мені текст дослівно.

## 4. ✅ ЗРОБЛЕНО 04.10 — деплой функцій (сам запустився мерджем #1232, усі 12 функцій `Deployed`)

GitHub → **Actions → Deploy Supabase Edge Functions → Run workflow** (гілка `main`).
Має стати зеленим. Червоне — скинь знімок кроку, що впав.

## 5. ✅ ЗРОБЛЕНО 04.10 — сухий прогін: `200`, `nothing happened` (за добу нових дописів не було — правильна тиша)

SQL Editor:
```
SELECT net.http_post(
  url := 'https://uabyfecseqnemvcqhdem.supabase.co/functions/v1/send-digest-push',
  headers := jsonb_build_object('Content-Type','application/json',
             'x-cstl-push-secret',(SELECT value FROM app_secrets WHERE name='page_push_secret')),
  body := '{"dry_run":true}'::jsonb);
```
За кілька секунд:
```
SELECT status_code, content FROM net._http_response ORDER BY id DESC LIMIT 1;
```
Чекаємо `200` і в тексті `kyiv_hour`. `401` — значить, крок 2 не доїхав.

## 6. ✅ ЗРОБЛЕНО 04.10 — два прогони бекапу; другий: `З кешу: 157 · завантажено: 0`

Actions → **DB Backup** → Run workflow. Двічі з перервою: другий прогін у кроці
«Фото зі сховища» має показати `завантажено: 0`.

## 7. Рішення, не робота (коли буде час)

| що | за замовчуванням |
|---|---|
| тариф Supabase (Disk IO) | глянути Usage — крива після 26.09 мала піти вниз |
| стеля `ГРОМАДА_НА_ДОБУ = 3` | лишаю 3 |
| вікно зведення 6:00–9:00 | лишаю |
| юрист на правові тексти | — |
| Android пальцем (онбординг, `beforeinstallprompt`) | — |
| **«відкривай»** — `DEV_LOCK = false` | твоє слово |
| код заслінки після гранту | змінити, коли заявку розглянуть |
