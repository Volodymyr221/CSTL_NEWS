#!/usr/bin/env python3
"""CSTL NEWS — Парсер розкладу автобусів з vopas.com.ua.

ТОЧКА ВХОДУ ДЛЯ CRON: запускається з GitHub Actions
(.github/workflows/vopas-parser.yml).

Що робить:
  1. Робить GET-запити для кожної пари маршрутів (Луцьк↔Олика, тощо)
  2. Парсить HTML-картки рейсів (BeautifulSoup, селектори .result-cols)
  3. Витягує: маршрут, дата, відправлення, прибуття, перевізник, автобус,
     ціна, статус продажу, VOPAS ID рейсу
  4. На цьому етапі — ПИШЕ результат у data/vopas-fetched.json
     (не чіпає data/schedule.json — він поки залишається ручною базою)

Архітектура така ж як parse_rss.py:
  - urllib + browser User-Agent
  - SSL fallback на unverified (CERT_NONE) — vopas має сертифікат від
    UA-CA якого немає у системному store Ubuntu runner

Як розширити:
  Додай нову пару у MARSHRUTI — рестарт парсер скаже скільки рейсів знайшов.

Як інтегрувати з data/schedule.json:
  Окремий наступний крок — мапінг VOPAS title-result → внутрішні route ID,
  carrier name → carrier ID. Поки не робимо щоб не зламати робочу базу.
"""

from __future__ import annotations

import datetime
import json
import re
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

# ── Конфіг ────────────────────────────────────────────────────────────────

MARSHRUTI: list[tuple[str, str]] = [
    ("Луцьк",   "Олика"),
    ("Луцьк",   "Личани"),
    ("Олика",   "Луцьк"),
    ("Личани",  "Луцьк"),
    ("Ківерці", "Носовичі"),
    ("Носовичі", "Ківерці"),
]

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

VOPAS_BASE = "https://vopas.com.ua/search/"
OUTPUT_PATH = Path(__file__).parent.parent / "data" / "vopas-fetched.json"


# ── HTTP fetch з SSL fallback ─────────────────────────────────────────────

def build_url(from_city: str, to_city: str, date: str) -> str:
    """date у форматі DD.MM.YYYY."""
    params = urllib.parse.urlencode({
        "from": from_city,
        "to":   to_city,
        "date": date,
        "time": "00 : 00",
    })
    return f"{VOPAS_BASE}?{params}"


def fetch_html(url: str) -> str:
    """GET з браузерним UA. Якщо SSL verify failed (vopas має cert від UA-CA
    якого немає у Ubuntu trust store) — повторюємо без verify."""
    headers = {
        "User-Agent":      BROWSER_UA,
        "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "uk-UA,uk;q=0.9,en;q=0.8",
        "Referer":         "https://vopas.com.ua/",
    }
    req = urllib.request.Request(url, headers=headers)

    contexts = [ssl.create_default_context(), ssl._create_unverified_context()]
    last_err = None
    for ctx in contexts:
        try:
            with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
                return resp.read().decode("utf-8", errors="ignore")
        except urllib.error.URLError as e:
            last_err = e
            if "CERTIFICATE" not in str(e).upper():
                raise
        except Exception as e:  # noqa: BLE001
            raise RuntimeError(f"fetch error: {type(e).__name__}: {e}") from e
    raise RuntimeError(f"fetch failed: {last_err}")


# ── Парсинг HTML ──────────────────────────────────────────────────────────

def extract_span_value(cell, label: str) -> str | None:
    """У VOPAS HTML структура така:
       <div class="result-cell">
         <span>Label</span>
         <span>Value</span>
       </div>
       Беремо span наступний за тим що містить точно `label`."""
    if cell is None:
        return None
    spans = cell.find_all("span", recursive=True)
    for i, span in enumerate(spans):
        if span.get_text(strip=True) == label:
            if i + 1 < len(spans):
                return spans[i + 1].get_text(strip=True)
            break
    return None


def parse_price(text: str) -> float | None:
    """«157.30 грн.» → 157.30"""
    if not text:
        return None
    m = re.search(r"(\d+[.,]\d+|\d+)", text.replace(",", "."))
    return float(m.group(1)) if m else None


def parse_card(card_el) -> dict[str, Any] | None:
    """Витягує один рейс з <div class="result-cols">."""
    title_el = card_el.select_one(".title-result")
    if not title_el:
        return None
    route_name = title_el.get_text(strip=True)

    # Статус продажу: title-state-sale (продаж) / title-state-sale-stop (припинено)
    status_el = card_el.select_one('[class*="title-state-"]')
    status_text = status_el.get_text(strip=True) if status_el else None
    status_classes = " ".join(status_el.get("class", [])) if status_el else ""
    sale_active = "sale-stop" not in status_classes

    date_el = card_el.select_one(".result-date span")
    date_text = date_el.get_text(strip=True) if date_el else None

    # Час відправлення/прибуття — пара <span>Label</span><span>Value</span> у .result-cell
    cells = card_el.select(".result-cell")
    departure = arrival = driver = bus = None
    for cell in cells:
        spans = cell.find_all("span", recursive=False)
        if len(spans) >= 2:
            label = spans[0].get_text(strip=True)
            value = spans[1].get_text(strip=True)
            if label == "Відправлення": departure = value
            elif label == "Прибуття":   arrival   = value
            elif label == "Перевізник": driver    = value
            elif label == "Автобус":    bus       = value

    cost_el = card_el.select_one(".result-cost")
    price = parse_price(cost_el.get_text(strip=True)) if cost_el else None

    # VOPAS id рейсу — потрібен щоб потім дістати зупинки окремим запитом
    info_link = card_el.select_one("a.go[data-id]")
    vopas_id = info_link.get("data-id") if info_link else None
    if not vopas_id:
        hidden_id = card_el.select_one('input[name="id"]')
        vopas_id = hidden_id.get("value") if hidden_id else None

    return {
        "vopas_id":       vopas_id,
        "route_name":     route_name,
        "date":           date_text,
        "departure_time": departure,
        "arrival_time":   arrival,
        "carrier":        driver,
        "bus":            bus,
        "price":          price,
        "status":         status_text,
        "sale_active":    sale_active,
    }


def parse_search_page(html: str) -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("div.result-cols")
    routes = []
    for card in cards:
        info = parse_card(card)
        if info and info.get("departure_time"):  # skip empty
            routes.append(info)
    return routes


# ── Main ──────────────────────────────────────────────────────────────────

def dedupe(routes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Дедуплікація: один і той самий рейс (vopas_id + departure + route_name)
    може зʼявитись з різних пар (з Луцька до Олики і з Луцька до Личан —
    бо рейс Луцьк→Личани проходить через Олику)."""
    seen = set()
    out = []
    for r in routes:
        key = (r.get("vopas_id"), r.get("departure_time"), r.get("route_name"))
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


def main() -> int:
    today = datetime.date.today().strftime("%d.%m.%Y")
    print(f"=== VOPAS parser ({today}) ===")
    print(f"Запитую {len(MARSHRUTI)} пар маршрутів...\n")

    all_routes: list[dict[str, Any]] = []
    errors: list[str] = []

    for from_city, to_city in MARSHRUTI:
        url = build_url(from_city, to_city, today)
        print(f"→ {from_city} → {to_city}")
        try:
            html = fetch_html(url)
            routes = parse_search_page(html)
            print(f"  ✓ знайдено {len(routes)} рейсів (HTML {len(html)} байт)")
            all_routes.extend(routes)
        except Exception as e:  # noqa: BLE001
            err = f"{from_city}→{to_city}: {type(e).__name__}: {e}"
            errors.append(err)
            print(f"  ✗ {err}")

    unique = dedupe(all_routes)
    print(f"\n→ Усього: {len(all_routes)} рейсів, унікальних: {len(unique)}")

    if errors:
        print(f"\n⚠️  Помилок: {len(errors)}")
        for e in errors:
            print(f"   - {e}")

    # Зберігаємо у data/vopas-fetched.json (поки окремо від schedule.json)
    output = {
        "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "date":       today,
        "source":     "vopas.com.ua",
        "pairs_queried": [f"{a}→{b}" for a, b in MARSHRUTI],
        "errors":     errors,
        "routes":     unique,
    }
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(output, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"\n💾 Записано у {OUTPUT_PATH}")

    # exit 0 — навіть з помилками, бо часткові дані теж корисні
    return 0


if __name__ == "__main__":
    sys.exit(main())
