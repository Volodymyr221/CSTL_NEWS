#!/usr/bin/env python3
"""
livecheck.py — проверка ТВОЕГО задеплоенного сайта на типовые публичные утечки.

Делает только обычные безобидные GET-запросы (как браузер): читает security-заголовки,
куки, и проверяет, не отдаются ли наружу файлы, которых там быть не должно (.env, .git).
НЕ атакует, не брутфорсит, не фаззит. Аналог securityheaders.com + пары ручных проверок.

⚠️ Запускай ТОЛЬКО против своего домена. Скрипт требует подтверждения владения.

Запуск:
  python3 livecheck.py https://мой-сайт.com
  python3 livecheck.py https://мой-сайт.com --yes-i-own-this   # пропустить вопрос
"""

import argparse
import sys
import urllib.request
import urllib.error
from http.cookiejar import CookieJar

# только эти пути, только GET, только чтение. Ничего разрушительного.
LEAK_PATHS = [
    (".env", "critical", "Файл .env читается из интернета — секреты доступны всем"),
    (".git/config", "critical", "Папка .git отдаётся наружу — весь исходник и история качаются"),
    (".git/HEAD", "critical", "Папка .git доступна — репозиторий можно склонировать с сервера"),
    ("config.json", "warning", "config.json отдаётся публично — проверь, что там нет секретов"),
    ("backup.sql", "critical", "Дамп базы лежит в открытом доступе"),
    (".DS_Store", "info", ".DS_Store виден — по нему видно структуру папок"),
    ("phpinfo.php", "warning", "phpinfo раскрывает конфигурацию сервера"),
    (".env.local", "critical", "Файл .env.local читается из интернета"),
]

SECURITY_HEADERS = [
    ("content-security-policy", "warning", "Нет Content-Security-Policy",
     "Защита от XSS/инъекций. Добавь CSP-заголовок."),
    ("strict-transport-security", "warning", "Нет HSTS",
     "Strict-Transport-Security заставляет браузер всегда ходить по HTTPS."),
    ("x-frame-options", "info", "Нет X-Frame-Options",
     "Защита от кликджекинга (встраивание твоего сайта в чужой iframe)."),
    ("x-content-type-options", "info", "Нет X-Content-Type-Options",
     "nosniff мешает браузеру угадывать MIME-типы."),
]

UA = "vibe-audit-livecheck/1.1 (+https://github.com/haraldalder-vibemogger/vibe-audit)"


def fetch(url, method="GET", timeout=10):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": UA})
    jar = CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    resp = opener.open(req, timeout=timeout)
    body = resp.read(2048)  # только начало, нам не нужно тело целиком
    # final_url отличается от запрошенного => был редирект (файл, скорее всего, не отдаётся)
    return resp.getcode(), dict(resp.headers), body, jar, resp.geturl()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url", help="URL ТВОЕГО сайта (https://...)")
    ap.add_argument("--yes-i-own-this", action="store_true", help="пропустить подтверждение владения")
    ap.add_argument("--report", default="livecheck-report.md")
    args = ap.parse_args()

    url = args.url.rstrip("/")
    if not url.startswith(("http://", "https://")):
        sys.exit("URL должен начинаться с http:// или https://")

    if not args.yes_i_own_this:
        print(f"\n⚠️  Ты собираешься проверить: {url}")
        print("Запускай это ТОЛЬКО против сайта, которым владеешь ты.")
        ans = input("Это твой сайт? (yes/no): ").strip().lower()
        if ans not in ("yes", "y", "да", "д"):
            sys.exit("Отменено. Проверяй только свои домены.")

    findings = []

    # 1. базовый запрос: заголовки и куки
    try:
        code, headers, _, jar, _final = fetch(url)
    except urllib.error.URLError as e:
        sys.exit(f"Не удалось открыть {url}: {e}")
    except Exception as e:
        sys.exit(f"Ошибка запроса: {e}")

    hlower = {k.lower(): v for k, v in headers.items()}
    for hkey, sev, title, fix in SECURITY_HEADERS:
        if hkey not in hlower:
            findings.append((sev, title, url, fix))

    # раскрытие сервера
    for leaky_h in ("server", "x-powered-by"):
        if leaky_h in hlower:
            findings.append(("info", f"Заголовок {leaky_h} раскрывает стек: {hlower[leaky_h][:40]}",
                             url, "Скрой версию сервера/фреймворка — она подсказывает известные уязвимости."))

    # куки без флагов
    for cookie in jar:
        flags_missing = []
        if not cookie.secure:
            flags_missing.append("Secure")
        if not cookie.has_nonstandard_attr("HttpOnly") and not cookie.has_nonstandard_attr("httponly"):
            flags_missing.append("HttpOnly")
        if flags_missing:
            findings.append(("warning", f"Кука '{cookie.name}' без флагов: {', '.join(flags_missing)}",
                             url, "HttpOnly прячет куку от JS (защита от XSS-кражи), Secure — только по HTTPS."))

    # 2. проверка публично доступных файлов (только GET, только чтение)
    for path, sev, desc in LEAK_PATHS:
        target = f"{url}/{path}"
        try:
            code, fhead, body, _, final_url = fetch(target)
            if code != 200 or not body.strip():
                continue
            # редирект на другой путь => файл НЕ отдаётся (частый ложный плюс на SPA)
            if final_url.rstrip("/") != target.rstrip("/"):
                continue
            # если вернулся HTML вместо сырого файла — это тоже catch-all роут, не утечка
            ctype = fhead.get("Content-Type", "").lower()
            starts_html = body.lstrip()[:14].lower().startswith((b"<!doctype", b"<html"))
            if "text/html" in ctype or starts_html:
                continue
            findings.append((sev, desc, target, "Закрой доступ на уровне сервера/CDN; убери файл из веб-корня."))
        except urllib.error.HTTPError:
            pass  # 403/404 — это хорошо, файл закрыт
        except Exception:
            pass

    # отчёт
    icon = {"critical": "🔴", "warning": "🟡", "info": "🔵"}
    order = {"critical": 0, "warning": 1, "info": 2}
    findings.sort(key=lambda f: order[f[0]])
    counts = {s: sum(1 for f in findings if f[0] == s) for s in order}

    lines = [f"# 🌐 vibe-audit livecheck: {url}", "",
             f"**{len(findings)} находок — 🔴 {counts['critical']} / 🟡 {counts['warning']} / 🔵 {counts['info']}**",
             "", "_Только внешние GET-запросы. Это не пентест — внутреннюю логику так не проверить._", ""]
    for sev, title, where, fix in findings:
        lines.append(f"## {icon[sev]} {title}")
        lines.append(f"- URL: {where}")
        lines.append(f"- Как чинить: {fix}")
        lines.append("")
    if not findings:
        lines.append("Внешних утечек не видно. Хороший знак, но внутреннюю логику это не проверяет.")

    with open(args.report, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print(f"\n🌐 livecheck: {len(findings)} находок "
          f"(🔴 {counts['critical']} / 🟡 {counts['warning']} / 🔵 {counts['info']})")
    print(f"Отчёт: {args.report}")
    sys.exit(2 if counts["critical"] else (1 if counts["warning"] else 0))


if __name__ == "__main__":
    main()
