# vibe-audit у CSTL NEWS — що вже перевірено і що з цього шум

> 🔴 **Читай ЦЕ перед тим, як бігти лагодити знахідки сканера.** Прогін 28.08.2026
> дав **23 знахідки, з них справжніх — НУЛЬ**. Нижче заміряно, чому саме.
> Без цього файлу наступна сесія витратить годину на ту саму перевірку.

**Джерело:** https://github.com/haraldalder-vibemogger/vibe-audit (MIT, ika.explains).
Файли `SKILL.md`, `checklist.md`, `scripts/` — копія upstream **без правок**, щоб
оновлення робилось простим перекопіюванням. Наш досвід живе тільки в цьому файлі.

## Як запускати

```bash
python3 .claude/skills/vibe-audit/scripts/audit.py . --report /tmp/vibe-audit-report.md
```

🛑 **Звіт НЕ комітити** — пиши його поза репо (репозиторій публічний, а у звіті
цитуються рядки коду). Скрипт маскує секрети, але правило простіше за виняток.

## 📐 Постійні хибні спрацьовки саме в нашому проєкті

| знахідка | чому хибна | заміряно |
|---|---|---|
| 🔴 «Секрет в публичной env-переменной» ×4, `src/core/messages-ui.js` | шаблон шукає `VITE_…KEY`, а в слові `PENDING_IN·VITE_KEY` сидить підрядок **`VITE_KEY`**. У проєкті немає ні Vite, ні Next, ні CRA | 28.08 |
| 🟡 «Вызов LLM без max_tokens» ×8 | сканер дивиться ±300 символів навколо ПЕРШОЇ згадки «anthropic» у файлі — це шапка-докстрінг. Справжні виклики: `brand_writer:122`, `ai_writer:66`, `dedup:39`, `ai_news_agent:561`, `ai-analytics-summary:207` — `max_tokens` стоїть СКРІЗЬ | 28.08 |
| 🟡 CORS `*` ×10 в `supabase/functions/**` | шаблон Supabase. Не експлуатується: авторизація йде заголовком `Authorization`, не куками, тож чужий origin не дістане наш JWT із localStorage. Функції з вимкненим `verify_jwt` закриті секретом `x-cstl-push-secret` з `app_secrets` | 28.08 |
| 🟡 CORS `*` в `cloudflare/worker.js:70` | воркер — проксі РІВНО до одного хоста (`olytska-gromada.gov.ua`), решта відкидається. Анти-open-proxy вже в коді | 28.08 |

⚠️ **Якщо знахідок стало БІЛЬШЕ за ці — ось воно й є справжнє.** Перевіряй нову.

## 🔑 Чого сканер не бачить, а ми можемо перевірити

Сканер сам пише «RLS перевірити не можу». Ми можемо — через Supabase MCP.
Прогін 28.08 (advisors: 134 зауваження, 2 ERROR) і живі виклики від імені `anon`:

- **обидва ERROR — не витік:** `ads_public` і `page_reaction_counts` не містять ні
  автора, ні телефону, ні `user_id` (звірено по колонках);
- **2× «Function Search Path Mutable»** — обидві `prosecdef = false`, тобто
  SECURITY **INVOKER**; класична атака з підміною `search_path` до них не застосовна;
- **4× «RLS Enabled No Policy»** — наш навмисний патерн «доступ лише `service_role`»;
- **52 функції, доступні аноніму** — гейти тримають, перевірено викликом:
  `admin_find_uid_by_email` і `admin_create_community` → `NOT_ADMIN`;
  `is_admin()` / `has_editor_perm()` → `false`;
  `delete_my_post` / `bump_post` / `close_post` на ЧУЖОМУ пості → `not_owner`;
- **анонім читає 0 рядків** з `profiles`, `messages`, `ads`, `push_subscriptions`,
  `admins`, `cms_articles`; `chat_threads` відмовляє одразу.

⚠️ **Пастка, на яку я вже наступив:** `admin_profile_stats()` від аноніма НЕ падає —
виглядає як діра. Насправді віддає рядок `{"error": "not admin"}`. Гейт є, просто
відповідає ввічливо. **Міряй наслідок (що саме повернулось), а не факт «не впало».**

🔬 Як перевіряти від імені аноніма і нічого не зламати — у транзакції, що відкотиться:

```sql
do $$
declare r text; звіт text := '';
begin
  perform set_config('role','anon',true);
  perform set_config('request.jwt.claims','',true);
  begin select ФУНКЦІЯ()::text into r; звіт := звіт||' ПРОЙШЛО → '||left(r,60);
  exception when others then звіт := звіт||' ВІДМОВА ('||left(SQLERRM,40)||')'; end;
  raise exception 'РЕЗУЛЬТАТ%', звіт;   -- 🔑 виняток = відкат усього блоку
end $$;
```

## ⏳ Що лишається за Вовою

- `livecheck.py https://castlelife.org` — з мого середовища проксі не пускає (403).
  ⚠️ Ми на GitHub Pages: CSP і X-Frame-Options там не поставити без Cloudflare перед ним.
- `checklist.md` — spending limits в консолі Anthropic, 2FA, і головне:
  **тестове відновлення з бекапу** (бекап, який ніколи не відновлювали, — не бекап).

## ✅ Що вже добре і чіпати не треба

- `gitleaks.yml` у CI на кожен push і PR — справжніх ключів у репо немає;
- `db-backup.yml`: GPG AES256 паролем із секрету, незашифрований архів видаляється
  ДО вивантаження, дамп у репозиторій не комітиться ніколи.
