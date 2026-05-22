#!/usr/bin/env python3
"""CSTL NEWS — Тест доступу до VOPAS перед написанням повноцінного парсера.

Запуск:
  python scripts/test_vopas_access.py          # локально
  Або через GitHub Action .github/workflows/test-vopas.yml (workflow_dispatch).

Що робить:
  1. GET кілька варіантів пошуку (Луцьк→Олика, Луцьк→Личани, Ківерці→Носовичі)
  2. Тестує 2 User-Agent: Chrome desktop і Mobile Safari
  3. Перевіряє статус, розмір відповіді, наявність ключових слів
     («ЗНАЙДЕНО РЕЙСІВ», час, ціна) — чи реально HTML містить розклад
  4. Зберігає сирий HTML першого успішного запиту → артефакт GitHub Actions
  5. Друкує summary з оцінкою чи варто йти у повний парсер

Можливі результати:
  ✅ OK     — HTML містить рейси → можна писати парсер на BeautifulSoup
  ⚠️ BLOCK  — 403/Cloudflare/captcha → треба проксі (Cloudflare Worker)
  ❌ EMPTY  — HTML порожній/SPA → треба headless або шукати JSON API
"""

import datetime
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# Маршрутні пари для перевірки (легко розширити — додай у список нову пару)
TEST_PAIRS = [
    ("Луцьк",  "Олика"),
    ("Луцьк",  "Личани"),
    ("Ківерці", "Носовичі"),
]

USER_AGENTS = {
    "chrome_desktop": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "mobile_safari": (
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) "
        "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1"
    ),
}

# Ключові слова які мають бути в HTML якщо рейси реально завантажились
# (україномовний сайт vopas.com.ua — рендерить дані сервером, не SPA)
EXPECTED_KEYWORDS = [
    "РЕЙСІВ",         # "ЗНАЙДЕНО РЕЙСІВ: 14"
    "Відправлення",   # шапка таблиці кожної картки
    "Перевізник",     # шапка таблиці
    "грн",            # ціна рейсу
]

# Regex для пошуку часу у форматі "HH:MM" (хочемо хоч 5 збігів — інакше HTML без розкладу)
TIME_RE = re.compile(r"\b([01]?\d|2[0-3]):[0-5]\d\b")


def build_url(from_city: str, to_city: str, date: str) -> str:
    """Будує URL пошуку: https://vopas.com.ua/search/?from=...&to=...&date=DD.MM.YYYY&time=00+%3A+00"""
    params = urllib.parse.urlencode({
        "from": from_city,
        "to":   to_city,
        "date": date,
        "time": "00 : 00",
    })
    return f"https://vopas.com.ua/search/?{params}"


def fetch(url: str, ua_name: str) -> tuple[int, bytes, str]:
    """Робить GET-запит. Повертає (status_code, body_bytes, error_msg).

    error_msg = "" якщо успіх; інакше — текст помилки.

    Стратегія SSL:
      1. Спершу пробуємо звичайний контекст (з системним CA bundle Ubuntu).
      2. Якщо SSLError (наприклад VOPAS має сертифікат від UA-CA якого
         немає у системному store) — повторюємо з unverified context.
         Для парсера публічного розкладу це прийнятно (читаємо HTML, не
         передаємо чутливих даних).
    """
    headers = {
        "User-Agent":      USER_AGENTS[ua_name],
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8",
        "Cache-Control":   "no-cache",
        "Referer":         "https://vopas.com.ua/",
    }
    req = urllib.request.Request(url, headers=headers)

    def _do(ctx) -> tuple[int, bytes, str]:
        try:
            with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
                return resp.getcode(), resp.read(), ""
        except urllib.error.HTTPError as e:
            body = e.read() if hasattr(e, "read") else b""
            return e.code, body, f"HTTPError {e.code}: {e.reason}"
        except urllib.error.URLError as e:
            return 0, b"", f"URLError: {e.reason}"
        except Exception as e:  # noqa: BLE001
            return 0, b"", f"{type(e).__name__}: {e}"

    # 1. Звичайний SSL
    status, body, err = _do(ssl.create_default_context())
    if not err or "CERTIFICATE" not in err.upper():
        return status, body, err

    # 2. Fallback — unverified SSL (тільки якщо була CERT-помилка)
    print(f"    ⚠️  SSL verify failed, повтор без verify ({err})")
    status, body, err = _do(ssl._create_unverified_context())
    if not err:
        # Повертаємо порожній err — щоб main() пішов у assess(),
        # а позначку про unverified виводимо окремим print'ом
        print(f"    🔓 [SSL_UNVERIFIED] retry успішний, аналізуємо тіло")
    return status, body, err


def probe_cert() -> str:
    """Дістає issuer сертифіката vopas.com.ua — щоб зрозуміти хто видав
    (Let's Encrypt / UA-CA / самопідписаний)."""
    try:
        import socket
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE  # дістати cert навіть якщо невалідний
        with socket.create_connection(("vopas.com.ua", 443), timeout=10) as sock:
            with ctx.wrap_socket(sock, server_hostname="vopas.com.ua") as ssock:
                cert = ssock.getpeercert(binary_form=False) or ssock.getpeercert(binary_form=True)
                if isinstance(cert, dict) and cert:
                    issuer = dict(x[0] for x in cert.get("issuer", []))
                    subject = dict(x[0] for x in cert.get("subject", []))
                    return f"issuer={issuer}, subject={subject}, notAfter={cert.get('notAfter')}"
                return "cert returned in binary form (нема дешифровки без verify) — означає сервер має cert але system store йому не довіряє"
    except Exception as e:  # noqa: BLE001
        return f"cert probe failed: {type(e).__name__}: {e}"


def assess(body: bytes) -> dict:
    """Оцінює HTML — скільки ключових слів знайдено, скільки часів, чи виглядає на реальний розклад."""
    try:
        text = body.decode("utf-8", errors="ignore")
    except Exception:  # noqa: BLE001
        text = ""

    # Case-insensitive пошук: у HTML слова можуть бути з малої («рейсів»),
    # а CSS робить uppercase. Тому шукаємо у text.lower().
    text_lower = text.lower()
    keyword_hits = {kw: text_lower.count(kw.lower()) for kw in EXPECTED_KEYWORDS}
    times_found  = TIME_RE.findall(text)

    has_table_headers = keyword_hits["Відправлення"] >= 1 and keyword_hits["Перевізник"] >= 1
    has_prices       = keyword_hits["грн"] >= 3
    has_enough_times = len(times_found) >= 5

    verdict = "EMPTY"
    # Достатньо щоб був формат таблиці + ціни + часи — це гарантує реальний розклад.
    # Слово «рейсів» не обов'язкове (може бути по-різному оформлене).
    if has_table_headers and has_prices and has_enough_times:
        verdict = "OK"
    elif "captcha" in text_lower or "cloudflare" in text_lower or "challenge" in text_lower:
        verdict = "BLOCK"
    elif len(text) < 5000:
        verdict = "EMPTY"

    return {
        "verdict": verdict,
        "size_bytes": len(body),
        "size_text_chars": len(text),
        "keyword_hits": keyword_hits,
        "times_found_count": len(times_found),
        "times_sample": times_found[:8],
        "has_captcha_marker": "captcha" in text_lower or "challenge" in text_lower,
    }


def main() -> int:
    """Повертає 0 якщо хоч одна пара/UA дала OK (для CI exit code).
    Інакше — 1 (треба інший підхід)."""
    today = datetime.date.today().strftime("%d.%m.%Y")
    print(f"=== VOPAS access test ({today}) ===\n")

    print(f"🔐 Діагностика сертифіката vopas.com.ua:")
    print(f"   {probe_cert()}\n")

    any_ok = False
    saved_html_path: Path | None = None

    for from_city, to_city in TEST_PAIRS:
        url = build_url(from_city, to_city, today)
        print(f"→ Пара: {from_city} → {to_city}")
        print(f"  URL: {url}")

        for ua_name in USER_AGENTS:
            status, body, err = fetch(url, ua_name)
            if err:
                print(f"  [{ua_name}] ❌ {err}")
                continue

            result = assess(body)
            icon = {"OK": "✅", "BLOCK": "⚠️", "EMPTY": "❌"}[result["verdict"]]
            print(
                f"  [{ua_name}] {icon} status={status} verdict={result['verdict']} "
                f"size={result['size_bytes']}B "
                f"keywords={result['keyword_hits']} "
                f"times={result['times_found_count']} (sample {result['times_sample']})"
            )

            # ЗАВЖДИ зберігаємо першу нетривіальну відповідь — навіть якщо verdict
            # помилково EMPTY (наприклад через зміну ключових слів). Так у артефакті
            # буде HTML для аналізу структури.
            if status == 200 and len(body) > 50000 and saved_html_path is None:
                saved_html_path = Path(__file__).parent.parent / "tmp_vopas_response.html"
                saved_html_path.write_bytes(body)
                print(f"  💾 Збережено HTML у {saved_html_path}")
            if result["verdict"] == "OK":
                any_ok = True

        print()

    print("=" * 60)
    if any_ok:
        print("✅ VOPAS доступний з цього середовища — можна писати парсер")
        print(f"   HTML для аналізу: {saved_html_path}")
        return 0
    print("❌ VOPAS НЕ дав корисних даних з жодної пари + UA комбінації")
    print("   Можливі шляхи:")
    print("   - перенаправити через Cloudflare Worker (як olytska-gromada)")
    print("   - шукати JSON API endpoint у DevTools браузера")
    print("   - headless browser (Playwright) у GitHub Actions — складно")
    return 1


if __name__ == "__main__":
    sys.exit(main())
