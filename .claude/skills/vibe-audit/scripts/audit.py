#!/usr/bin/env python3
"""
audit.py — аудит безопасности вайбкод-проекта. Только чтение, ничего не меняет.

Запуск:  python3 audit.py /путь/к/проекту [--report report.md]
Выход:   консольная сводка + Markdown-отчёт с severity и фиксами.
Коды выхода: 0 чисто, 1 есть warning, 2 есть critical.
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

SKIP_DIRS = {".git", "node_modules", ".next", "dist", "build", ".venv", "venv",
             "__pycache__", ".cache", "vendor", "Pods", ".dart_tool", "coverage"}
TEXT_EXT = {".js", ".jsx", ".ts", ".tsx", ".py", ".rb", ".php", ".go", ".java",
            ".kt", ".swift", ".vue", ".svelte", ".html", ".css", ".json", ".yml",
            ".yaml", ".toml", ".env", ".sh", ".sql", ".md", ".txt", ".cfg", ".ini"}
MAX_FILE = 1_000_000  # 1MB

# (id, severity, человекочитаемое имя, regex)
# Порядок важен: более специфичные паттерны идут ПЕРЕД общими, дедуп по (файл,строка,значение)
# оставляет первое совпадение — то есть самое специфичное.
SECRET_PATTERNS = [
    ("anthropic_key", "critical", "Anthropic API key", re.compile(r"\bsk-ant-[A-Za-z0-9_-]{20,}\b")),
    ("stripe_live", "critical", "Stripe live key", re.compile(r"\bsk_live_[A-Za-z0-9]{20,}\b")),
    ("aws_key", "critical", "AWS Access Key", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("openai_key", "critical", "OpenAI API key", re.compile(r"\bsk-(?!ant-)[A-Za-z0-9_-]{20,}\b")),
    ("github_token", "critical", "GitHub token", re.compile(r"\bgh[pousr]_[A-Za-z0-9]{36,}\b")),
    ("slack_token", "critical", "Slack token", re.compile(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b")),
    ("supabase_service", "critical", "Supabase service_role JWT",
     re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{10,}")),
    ("private_key", "critical", "Приватный ключ (PEM)",
     re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----")),
    ("telegram_bot", "critical", "Telegram bot token", re.compile(r"\b\d{8,10}:[A-Za-z0-9_-]{35}\b")),
    ("generic_assign", "warning", "Похоже на захардкоженный секрет",
     re.compile(r"""(?i)\b(api[_-]?key|secret|password|token)\b\s*[:=]\s*["'][^"'\s]{16,}["']""")),
]

# файлы, где секретам "можно" (примеры и локи)
SECRET_OK_FILES = re.compile(r"(\.example|\.sample|\.test\.|_test\.|\.lock$|package-lock\.json$|\.md$)")

CLIENT_HINTS = re.compile(r"(src|app|pages|components|public|client)")
CLIENT_API_CALLS = re.compile(r"""https?://api\.(openai|anthropic|stripe)\.com""")

CONFIG_CHECKS = [
    ("cors_star", "warning", "CORS открыт для всех (*)",
     re.compile(r"""(?i)(Access-Control-Allow-Origin["'\s:,=>]+\*|cors\(\s*\{\s*origin\s*:\s*["']\*|CORS_ORIGIN\s*=\s*\*)"""),
     "Ограничь origin списком своих доменов."),
    ("debug_on", "warning", "Debug-режим в коде",
     re.compile(r"(debug\s*=\s*True|app\.run\(.*debug\s*=\s*True|DEBUG\s*=\s*True)"),
     "Выключи debug в проде: он раскрывает стектрейсы и внутренности."),
    ("eval_use", "warning", "eval() на данных",
     re.compile(r"""(?<!['"\w.])eval\s*\("""),
     "eval на пользовательском вводе = исполнение чужого кода. Замени на безопасный парсинг."),
    ("sql_fstring", "warning", "SQL через f-строку/конкатенацию",
     re.compile(r"""(?i)(execute|query)\s*\(\s*f["'].*(SELECT|INSERT|UPDATE|DELETE).*\{"""),
     "Используй параметризованные запросы, иначе SQL-инъекция."),
    ("jwt_none", "critical", "JWT c alg:none",
     re.compile(r"""["']alg["']\s*:\s*["']none["']"""),
     "Никогда не принимай alg:none — подпись обязана проверяться."),
]


def iter_files(root: Path):
    for p in root.rglob("*"):
        if any(part in SKIP_DIRS for part in p.parts):
            continue
        if p.is_file() and (p.suffix.lower() in TEXT_EXT or p.name.startswith(".env")):
            try:
                if p.stat().st_size > MAX_FILE:
                    continue
                yield p, p.read_text(encoding="utf-8", errors="ignore")
            except OSError:
                continue


def mask(s: str) -> str:
    """Никогда не печатаем секрет целиком."""
    s = s.strip().strip("\"'")
    return s[:6] + "…" + s[-2:] if len(s) > 10 else "***"


def line_of(text: str, pos: int) -> int:
    return text.count("\n", 0, pos) + 1


def git_tracked_set(root):
    """Множество файлов под контролем git (относительные пути). None, если не git-репо."""
    if not (root / ".git").exists():
        return None
    try:
        out = subprocess.run(["git", "-C", str(root), "ls-files"],
                             capture_output=True, text=True, timeout=30).stdout
        return set(out.splitlines())
    except Exception:
        return None


def check_secrets(root, findings):
    tracked = git_tracked_set(root)
    for path, text in iter_files(root):
        rel = str(path.relative_to(root))
        allow_soft = bool(SECRET_OK_FILES.search(rel))
        # .env, который НЕ закоммичен — норма (секреты и должны жить локально в .env).
        # Отдельно .env-в-git ловит check_git_env как critical.
        is_env = Path(rel).name.startswith(".env")
        if is_env and tracked is not None and rel not in tracked:
            continue
        claimed = set()
        for pid, sev, title, rx in SECRET_PATTERNS:
            for m in rx.finditer(text):
                if allow_soft:
                    continue
                ln = line_of(text, m.start())
                if pid == "generic_assign" and ln in claimed:
                    continue
                if pid != "generic_assign":
                    claimed.add(ln)
                note = " (git не найден — если .env не коммитится, это норма)" if (is_env and tracked is None) else ""
                findings.append({
                    "id": pid, "severity": sev, "title": title,
                    "where": f"{rel}:{ln}",
                    "detail": f"найдено: `{mask(m.group(0))}`{note}",
                    "fix": "Убери из кода, положи в переменную окружения/секрет-менеджер и ПЕРЕВЫПУСТИ ключ — он уже скомпрометирован, если попадал в git.",
                })


def check_git_env(root, findings):
    git = root / ".git"
    if not git.exists():
        return
    try:
        out = subprocess.run(["git", "-C", str(root), "ls-files"],
                             capture_output=True, text=True, timeout=30).stdout
    except Exception:
        return
    tracked = out.splitlines()
    for f in tracked:
        name = Path(f).name
        if name.startswith(".env") and not name.endswith((".example", ".sample")):
            findings.append({
                "id": "env_in_git", "severity": "critical", "title": ".env закоммичен в git",
                "where": f, "detail": "файл с секретами отслеживается git",
                "fix": "git rm --cached " + f + "; добавь .env* в .gitignore; перевыпусти все ключи из файла; для чистки истории — git filter-repo.",
            })
    gi = root / ".gitignore"
    gi_text = gi.read_text(errors="ignore") if gi.exists() else ""
    if ".env" not in gi_text:
        findings.append({
            "id": "gitignore_env", "severity": "warning", "title": ".env не в .gitignore",
            "where": ".gitignore", "detail": "рано или поздно кто-то закоммитит секреты",
            "fix": "Добавь строки: .env и .env.*",
        })


def check_client_exposure(root, findings):
    for path, text in iter_files(root):
        rel = str(path.relative_to(root))
        if not CLIENT_HINTS.search(rel) or path.suffix not in {".js", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".html"}:
            continue
        for m in CLIENT_API_CALLS.finditer(text):
            findings.append({
                "id": "client_api", "severity": "critical", "title": "Платный API вызывается из клиента",
                "where": f"{rel}:{line_of(text, m.start())}",
                "detail": f"прямой вызов {m.group(0)} из фронтенда — ключ виден любому в DevTools",
                "fix": "Вынеси вызов на свой бэкенд/edge-функцию; ключ живёт только на сервере.",
            })
        for m in re.finditer(r"(NEXT_PUBLIC_|VITE_|REACT_APP_)[A-Z_]*(SECRET|KEY|TOKEN|PASSWORD)", text):
            findings.append({
                "id": "public_env_secret", "severity": "critical", "title": "Секрет в публичной env-переменной",
                "where": f"{rel}:{line_of(text, m.start())}",
                "detail": f"{m.group(0)} — префикс делает переменную частью клиентского бандла",
                "fix": "Публичные префиксы (NEXT_PUBLIC_/VITE_/REACT_APP_) только для несекретных значений. Секрет — на сервер.",
            })


def _line_is_comment_or_pattern(text, pos):
    """Грубая эвристика: находка внутри комментария или определения regex — не считаем."""
    line_start = text.rfind("\n", 0, pos) + 1
    line_end = text.find("\n", pos)
    line = text[line_start: line_end if line_end != -1 else len(text)]
    stripped = line.lstrip()
    if stripped.startswith(("#", "//", "*", "/*", "<!--")):
        return True
    if "re.compile" in line or "re.search" in line or "re.finditer" in line:
        return True
    return False


def check_config(root, findings):
    for path, text in iter_files(root):
        rel = str(path.relative_to(root))
        if rel.endswith(".md"):
            continue
        for pid, sev, title, rx, fix in CONFIG_CHECKS:
            for m in rx.finditer(text):
                if _line_is_comment_or_pattern(text, m.start()):
                    continue
                findings.append({
                    "id": pid, "severity": sev, "title": title,
                    "where": f"{rel}:{line_of(text, m.start())}",
                    "detail": "", "fix": fix,
                })


def check_deps(root, findings):
    if (root / "package.json").exists():
        try:
            r = subprocess.run(["npm", "audit", "--json"], cwd=root,
                               capture_output=True, text=True, timeout=120)
            data = json.loads(r.stdout or "{}")
            meta = (data.get("metadata") or {}).get("vulnerabilities") or {}
            crit, high = meta.get("critical", 0), meta.get("high", 0)
            if crit or high:
                findings.append({
                    "id": "npm_vulns", "severity": "critical" if crit else "warning",
                    "title": "Уязвимые npm-зависимости",
                    "where": "package.json",
                    "detail": f"critical: {crit}, high: {high}",
                    "fix": "npm audit fix; что не чинится — обнови мажорно или замени пакет.",
                })
        except Exception:
            findings.append({"id": "npm_skip", "severity": "info", "title": "npm audit не запустился",
                             "where": "package.json", "detail": "нет npm или нет сети",
                             "fix": "Запусти npm audit локально."})
    if (root / "requirements.txt").exists() or (root / "pyproject.toml").exists():
        findings.append({"id": "py_deps", "severity": "info", "title": "Проверь python-зависимости",
                         "where": "requirements.txt / pyproject.toml",
                         "detail": "автопроверка не встроена, чтобы не тянуть зависимости",
                         "fix": "pip install pip-audit && pip-audit"})


def check_platform_flags(root, findings):
    text_all = ""
    for path, text in iter_files(root):
        if path.suffix in {".ts", ".js", ".sql", ".toml", ".json"}:
            text_all += text[:5000]
    if "supabase" in text_all.lower():
        findings.append({
            "id": "supabase_rls", "severity": "info", "title": "Supabase: проверь RLS",
            "where": "проект использует Supabase",
            "detail": "снаружи скрипт это проверить не может",
            "fix": "В каждой таблице: RLS enabled + политики. Быстрый чек: Dashboard → Advisors → Security.",
        })
    if re.search(r"firebase|firestore", text_all, re.I):
        findings.append({
            "id": "firebase_rules", "severity": "info", "title": "Firebase: проверь security rules",
            "where": "проект использует Firebase",
            "detail": "правила по умолчанию из туториалов часто allow read, write: if true",
            "fix": "Прогони firebase emulators + правила без анонимного полного доступа.",
        })


def check_rate_limit_and_ai(root, findings):
    """Блок 1: rate limit на чувствительных роутах + AI cost bomb."""
    joined = ""
    files_text = {}
    for path, text in iter_files(root):
        if path.suffix in {".js", ".jsx", ".ts", ".tsx", ".py"}:
            files_text[str(path.relative_to(root))] = text
            joined += text.lower()

    has_ratelimit = any(k in joined for k in
                        ["express-rate-limit", "ratelimit", "rate_limit", "slowapi",
                         "@upstash/ratelimit", "limiter", "throttle"])
    # чувствительные роуты
    sensitive = re.compile(r"""(?i)['"`/](login|signin|sign-in|signup|sign-up|register|reset-password|forgot|verify|otp)['"`/]""")
    for rel, text in files_text.items():
        if sensitive.search(text) and not has_ratelimit:
            m = sensitive.search(text)
            findings.append({
                "id": "no_ratelimit_auth", "severity": "warning",
                "title": "Auth-роут без rate limit",
                "where": f"{rel}:{line_of(text, m.start())}",
                "detail": "в проекте не найдено ни одной библиотеки rate-limiting",
                "fix": "Добавь лимит на login/signup/reset (express-rate-limit, slowapi, @upstash/ratelimit). Иначе — брутфорс и спам кодов.",
            })
            break

    # AI cost bomb: вызов LLM API без max_tokens рядом
    ai_call = re.compile(r"""(?i)(openai|anthropic|\.chat\.completions|messages\.create|generateContent)""")
    for rel, text in files_text.items():
        for m in ai_call.finditer(text):
            if _line_is_comment_or_pattern(text, m.start()):
                continue
            window = text[max(0, m.start()-300): m.end()+300]
            if "max_tokens" not in window and "maxtokens" not in window.lower() and "max_output" not in window.lower():
                findings.append({
                    "id": "ai_no_maxtokens", "severity": "warning",
                    "title": "Вызов LLM без лимита max_tokens",
                    "where": f"{rel}:{line_of(text, m.start())}",
                    "detail": "запрос к платному AI-API без ограничения длины ответа",
                    "fix": "Задай max_tokens и лимит длины входа. Без авторизации на этом роуте — любой сожжёт твой баланс.",
                })
                break
    # LLM-эндпоинт, открытый без явной проверки авторизации
    for rel, text in files_text.items():
        if ai_call.search(text) and re.search(r"""(?i)(app\.(post|get)|router\.(post|get)|@app\.(post|get)|export .*handler)""", text):
            if not re.search(r"""(?i)(auth|verifytoken|requireuser|getsession|middleware|authorize|jwt)""", text):
                findings.append({
                    "id": "ai_open_endpoint", "severity": "critical",
                    "title": "AI-эндпоинт без проверки авторизации",
                    "where": rel,
                    "detail": "роут вызывает платный LLM и не видно проверки, кто это",
                    "fix": "Закрой эндпоинт авторизацией + лимитом запросов на пользователя. Это самый частый способ слить бюджет вайбкод-проекта.",
                })
                break


def check_authz(root, findings):
    """Блок 2: права/авторизация — эвристики, помечаем как 'на проверку'."""
    for path, text in iter_files(root):
        rel = str(path.relative_to(root))
        if path.suffix not in {".js", ".jsx", ".ts", ".tsx", ".py"}:
            continue
        # роль из тела запроса
        for m in re.finditer(r"""(?i)(req\.body\.role|body\.role|request\.json.*role|data\.role|params\.role)""", text):
            findings.append({
                "id": "role_from_client", "severity": "warning",
                "title": "Роль берётся из запроса клиента",
                "where": f"{rel}:{line_of(text, m.start())}",
                "detail": "клиент может прислать role: admin",
                "fix": "Роль читай из проверенной сессии/токена на сервере, не из тела запроса.",
            })
        # IDOR: id ресурса из query/params без явной проверки владельца
        if re.search(r"""(?i)(req\.(query|params)\.(id|user_?id|account)|params\.get\(['"]id)""", text):
            if not re.search(r"""(?i)(owner|belongs|user_?id\s*==|\.eq\(.user|where.*user|current_?user)""", text):
                m = re.search(r"""(?i)(req\.(query|params)\.(id|user_?id|account))""", text)
                findings.append({
                    "id": "idor_suspect", "severity": "info",
                    "title": "На проверку: доступ к ресурсу по id из запроса",
                    "where": f"{rel}:{line_of(text, m.start())}" if m else rel,
                    "detail": "не видно проверки, что ресурс принадлежит текущему пользователю (возможен IDOR)",
                    "fix": "Убедись, что запрос фильтруется по владельцу: WHERE user_id = current_user, а не только по присланному id.",
                })
        # JWT без проверки expiry
        if re.search(r"jwt\.(decode|verify)", text, re.I) and "expiresin" not in text.lower() and "exp" not in text.lower() and re.search(r"ignoreexpiration\s*:\s*true", text, re.I):
            m = re.search(r"ignoreexpiration", text, re.I)
            findings.append({
                "id": "jwt_no_exp", "severity": "warning", "title": "JWT принимается без проверки срока",
                "where": f"{rel}:{line_of(text, m.start())}",
                "detail": "ignoreExpiration: true",
                "fix": "Не отключай проверку exp — украденный токен будет жить вечно.",
            })


def check_platform_configs(root, findings):
    """Блок 3: реальные конфиг-файлы платформ."""
    # Firebase/Firestore rules
    for rules_name in ["firestore.rules", "storage.rules", "database.rules.json"]:
        rf = root / rules_name
        if rf.exists():
            rtext = rf.read_text(errors="ignore")
            if re.search(r"""allow\s+(read|write|read,\s*write)\s*:\s*if\s+true""", rtext) or re.search(r'"\.(read|write)"\s*:\s*true', rtext):
                findings.append({
                    "id": "firebase_open", "severity": "critical",
                    "title": f"Firebase: открытые правила в {rules_name}",
                    "where": rules_name,
                    "detail": "allow read/write: if true — база открыта всему интернету",
                    "fix": "Закрой правила: доступ только аутентифицированным и только к своим данным (request.auth.uid == resource.data.owner).",
                })
    # docker-compose: дефолтные пароли и порт базы наружу
    seen_compose = set()
    for comp in list(root.glob("docker-compose*.y*ml")) + list(root.glob("**/docker-compose*.y*ml")):
        if comp in seen_compose:
            continue
        seen_compose.add(comp)
        try:
            ct = comp.read_text(errors="ignore")
        except OSError:
            continue
        rel = str(comp.relative_to(root))
        if re.search(r"""(?i)(POSTGRES_PASSWORD|MYSQL_ROOT_PASSWORD|MONGO_INITDB_ROOT_PASSWORD)\s*[:=]\s*(postgres|root|password|admin|123|example)\b""", ct):
            findings.append({
                "id": "default_db_pass", "severity": "critical", "title": "Дефолтный пароль БД в docker-compose",
                "where": rel, "detail": "пароль вида postgres/root/password",
                "fix": "Смени на сгенерированный секрет, подставляй через env, не коммить его.",
            })
        if re.search(r"""(?m)^\s*-\s*["']?(5432|3306|27017|6379):(5432|3306|27017|6379)""", ct):
            findings.append({
                "id": "db_port_exposed", "severity": "warning", "title": "Порт БД проброшен наружу",
                "where": rel, "detail": "база доступна с хоста/интернета",
                "fix": "Не публикуй порт БД наружу; в проде БД доступна только внутренней сети.",
            })


SEV_ORDER = {"critical": 0, "warning": 1, "info": 2}
SEV_ICON = {"critical": "🔴", "warning": "🟡", "info": "🔵"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path", help="корень проекта")
    ap.add_argument("--report", default="vibe-audit-report.md")
    args = ap.parse_args()
    root = Path(args.path).resolve()
    if not root.is_dir():
        sys.exit(f"Нет такой папки: {root}")

    findings = []
    for check in (check_secrets, check_git_env, check_client_exposure,
                  check_config, check_deps, check_platform_flags,
                  check_rate_limit_and_ai, check_authz, check_platform_configs):
        try:
            check(root, findings)
        except Exception as e:
            findings.append({"id": "check_error", "severity": "info",
                             "title": f"Проверка {check.__name__} упала",
                             "where": "-", "detail": str(e)[:200], "fix": "Сообщи в Issues."})

    findings.sort(key=lambda f: SEV_ORDER.get(f["severity"], 9))
    counts = {s: sum(1 for f in findings if f["severity"] == s) for s in SEV_ORDER}

    lines = [f"# 🩺 vibe-audit: {root.name}", "",
             f"**Итог: {len(findings)} находок — "
             f"🔴 {counts['critical']} критичных, 🟡 {counts['warning']} важных, 🔵 {counts['info']} на проверку**", ""]
    for f in findings:
        lines.append(f"## {SEV_ICON[f['severity']]} {f['title']}")
        lines.append(f"- Где: `{f['where']}`")
        if f["detail"]:
            lines.append(f"- Детали: {f['detail']}")
        lines.append(f"- Как чинить: {f['fix']}")
        lines.append("")
    if not findings:
        lines.append("Чисто. Либо проект образцовый, либо проверь, ту ли папку указал 🙂")
    Path(args.report).write_text("\n".join(lines), encoding="utf-8")

    print(f"🩺 vibe-audit: {len(findings)} находок "
          f"(🔴 {counts['critical']} / 🟡 {counts['warning']} / 🔵 {counts['info']})")
    print(f"Отчёт: {args.report}")
    sys.exit(2 if counts["critical"] else (1 if counts["warning"] else 0))


if __name__ == "__main__":
    main()
