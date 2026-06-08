#!/usr/bin/env python3
"""CSTL NEWS — Парсер розкладу автобусів з vopas.com.ua.

ТОЧКА ВХОДУ ДЛЯ CRON: запускається з GitHub Actions
(.github/workflows/vopas-parser.yml).

Що робить:
  1. Запитує VOPAS для 21 дня (3 тижні): Пн поточного → Нд через 2 тижні
  2. Кешує минулі дні та "далекі" майбутні (>7 днів) — не перезапитує
  3. Конвертує у формат data/schedule.json (структура з days{})
  4. Оновлює data/vopas-fetched.json (діагностичний дамп)

Чому 21 день: UI показує 2 тижні (поточний + наступний). Щоб у неділю
парсер вже мав дані наступного тижня до того як настане понеділок і
календар зсунеться вперед.

Архітектура:
  - urllib + browser User-Agent
  - SSL fallback на unverified (CERT_NONE) — vopas має сертифікат від
    UA-CA якого немає у системному store Ubuntu runner
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

# ВАЖЛИВО: запитуємо ПОВНІ маршрути кінець-до-кінця, НЕ Олика-центричні сегменти.
# Бо запит «Луцьк→Олика» давав обрізаний сегмент рейсу Луцьк-Личани (прибуття
# в Олику, а не в Личани). Повний запит «Луцьк→Личани» дає реальні from/to/час.
# Усі ці маршрути проходять через Олику (одна траса) — тому покривають громаду.
# Кожен напрямок туди-назад. Легко додати нову пару.
MARSHRUTI: list[tuple[str, str]] = [
    ("Луцьк",   "Личани"),  ("Личани",   "Луцьк"),
    ("Луцьк",   "Носовичі"), ("Носовичі", "Луцьк"),
    ("Луцьк",   "Жорнище"),  ("Жорнище",  "Луцьк"),
    ("Луцьк",   "Олика"),    ("Олика",    "Луцьк"),
    ("Луцьк",   "Рівне"),    ("Рівне",    "Луцьк"),
    ("Ківерці", "Носовичі"), ("Носовичі", "Ківерці"),
    ("Ківерці", "Олика"),    ("Олика",    "Ківерці"),
]

BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

VOPAS_BASE = "https://vopas.com.ua/search/"
OUTPUT_PATH = Path(__file__).parent.parent / "data" / "vopas-fetched.json"
SCHEDULE_PATH = Path(__file__).parent.parent / "data" / "schedule.json"
ROUTE_STOPS_PATH = Path(__file__).parent.parent / "data" / "route-stops.json"

# Завантажуємо ручні зупинки — словник {назва_маршруту: [stop, ...]}
_route_stops_map: dict[str, list] = {}
try:
    _rs = json.loads(ROUTE_STOPS_PATH.read_text(encoding="utf-8"))
    _route_stops_map = _rs.get("_by_vopas_name", {})
except Exception:
    pass


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
    """«157.30 грн.» → 157.30. «0.00 грн» / «—» / порожньо → None
    (для напрямку «з Олики» VOPAS не дає тариф — Олика проміжна станція,
    ціна рахується від кінцевого терміналу). None → UI покаже «—»."""
    if not text:
        return None
    m = re.search(r"(\d+[.,]\d+|\d+)", text.replace(",", "."))
    if not m:
        return None
    val = float(m.group(1))
    return val if val > 0 else None


def parse_card(card_el) -> dict[str, Any] | None:
    """Витягує один рейс з <div class="result-cols">."""
    title_el = card_el.select_one(".title-result")
    if not title_el:
        return None
    route_name = title_el.get_text(strip=True)

    # Статус: «в продажі» (sale) / «продаж припинено» (sale-stop, рейс їде) /
    # «Рейс зірваний» (cancelled — рейс ВІДМІНЕНО, не їде)
    status_el = card_el.select_one('[class*="title-state-"]')
    status_text = status_el.get_text(strip=True) if status_el else None
    status_classes = " ".join(status_el.get("class", [])) if status_el else ""
    status_lower = (status_text or "").lower()
    cancelled = "зірван" in status_lower or "відмін" in status_lower or "canceled" in status_classes
    sale_active = (not cancelled) and ("sale-stop" not in status_classes)

    date_el = card_el.select_one(".result-date span")
    date_text = date_el.get_text(strip=True) if date_el else None

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
        "cancelled":      cancelled,
    }


def parse_search_page(html: str, from_city: str = "", to_city: str = "") -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("div.result-cols")
    routes = []
    for card in cards:
        info = parse_card(card)
        if info and info.get("departure_time"):
            info["from"] = from_city
            info["to"] = to_city
            routes.append(info)
    return routes


# ── Фільтр локальних маршрутів ────────────────────────────────────────────

CARRIER_PHONE = "0332 224 500"

# Whitelist населених пунктів Олицької громади + транспортні вузли + проміжні
# зупинки на трасах через Олику (з реального квиткового розкладу VOPAS).
ALLOWED_STOPS = {
    "олика",
    "дідичі", "жорнище", "чемерин", "метельне", "носовичі", "одеради",
    "покащів", "хромяків", "дерно", "котів", "путилівка", "мощаниця",
    "залісоче", "горянівка", "ставок", "личани",
    "горанівка", "чмерин", "путилика", "одераж", "залісся",
    "луцьк", "ківерці", "рівне",
    "піддубці", "струмівка", "гараджа", "звірів", "арматнів", "пальче",
    "хорлупи",
}

ROUTE_STOPWORDS = {"чз", "через", "пов", "аз", "збір", "зб"}


def route_is_local(route_name: str | None) -> bool:
    """True якщо ВСІ населені пункти у назві маршруту — з ALLOWED_STOPS."""
    if not route_name:
        return False
    normalized = route_name.lower().replace("'", "").replace("'", "").replace("`", "")
    cleaned = re.sub(r"ч/з|через|[\-,()]", " ", normalized)
    tokens = [t.strip() for t in cleaned.split() if len(t.strip()) >= 3]
    place_tokens = [t for t in tokens if t not in ROUTE_STOPWORDS]
    if not place_tokens:
        return False
    for t in place_tokens:
        if not any(t == s or t in s or s in t for s in ALLOWED_STOPS):
            return False
    return True


def hhmm_to_min(hhmm: str | None) -> int | None:
    if not hhmm or ":" not in hhmm:
        return None
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def make_carrier_id(name: str) -> str:
    base = re.sub(r"[^\wа-яіїєґА-ЯІЇЄҐ]+", "_", (name or "").lower()).strip("_")
    return base[:40] or "unknown"


# ── Конвертація рейсів у формат schedule.json ─────────────────────────────

def build_day_routes(
    unique: list[dict[str, Any]],
    query_date: str,
    prev_routes: list[dict[str, Any]] | None = None,
    now_min: int | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Конвертує сирі рейси VOPAS у формат schedule.json для одного дня.
    prev_routes — попередні дані для збереження статусу 'cancelled' (sticky).
    now_min — поточний час у хвилинах від 00:00 (для sticky-перевірки).
    Sticky правило: скасування зберігається тільки якщо ми вже ПІСЛЯ часу відправлення.
    До відправлення — якщо VOPAS зняв скасування, довіряємо (рейс поновлений).
    Повертає (routes_list, carriers_dict)."""
    # Індекс попередніх скасованих рейсів за (назва, час відправлення)
    prev_cancelled: set[tuple[str, str]] = set()
    for pr in (prev_routes or []):
        if pr.get("status") == "cancelled":
            prev_cancelled.add((pr.get("name", ""), pr.get("departure_time", "")))
    routes: list[dict] = []
    carriers: dict[str, dict] = {}
    skipped = 0

    for r in unique:
        dep = r.get("departure_time")
        arr = r.get("arrival_time")
        dep_min = hhmm_to_min(dep)
        arr_min = hhmm_to_min(arr)
        if dep_min is None or arr_min is None:
            continue
        duration = max(0, arr_min - dep_min)

        if not route_is_local(r.get("route_name")):
            skipped += 1
            continue
        if duration > 150:
            skipped += 1
            continue

        carrier_name = r.get("carrier") or "Перевізник"
        cid = make_carrier_id(carrier_name)
        carriers[cid] = {"name": carrier_name, "phone": CARRIER_PHONE}

        frm = r.get("from") or (r.get("route_name") or "").split()[0]
        to = r.get("to") or (r.get("route_name") or "—")
        route_name_for_key = r.get("route_name") or ""
        dep_for_key = r.get("departure_time") or ""
        was_cancelled = (route_name_for_key, dep_for_key) in prev_cancelled
        # Sticky: зберігаємо cancelled тільки якщо вже минув час відправлення.
        # До відправлення — якщо VOPAS зняв мітку, рейс поновлений, довіряємо.
        dep_min_val = hhmm_to_min(dep_for_key)
        past_dep = now_min is not None and dep_min_val is not None and now_min >= dep_min_val
        status = "cancelled" if (r.get("cancelled") or (was_cancelled and past_dep)) else "scheduled"
        stops = _route_stops_map.get(route_name_for_key) or [{"name": frm, "km": 0}, {"name": to, "km": 100}]
        vopas_url = build_url(frm, to, query_date)

        routes.append({
            "id": f"vopas_{r.get('vopas_id') or dep.replace(':', '')}",
            "vopas_id": r.get("vopas_id"),
            "name": r.get("route_name") or f"{frm} → {to}",
            "carrier": cid,
            "bus": r.get("bus"),
            "days": "щодня",
            "status": status,
            "sale_active": r.get("sale_active", True),
            "departure_time": dep,
            "arrival_time": arr,
            "duration_min": duration,
            "auto_generated": False,
            "stops": stops,
            "vopas_url": vopas_url,
        })

    routes.sort(key=lambda x: hhmm_to_min(x["departure_time"]) or 0)
    print(f"   → {len(routes)} локальних, {skipped} транзитних відсіяно")
    return routes, carriers


# ── Дедуплікація ──────────────────────────────────────────────────────────

def dedupe(routes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Один рейс може зʼявитись з різних пар (Луцьк→Олика і Луцьк→Личани)."""
    seen = set()
    out = []
    for r in routes:
        key = (r.get("vopas_id"), r.get("departure_time"), r.get("route_name"))
        if key in seen:
            continue
        seen.add(key)
        out.append(r)
    return out


# ── Запит одного дня ──────────────────────────────────────────────────────

def query_day(date_str: str) -> tuple[list[dict], list[str]]:
    """Запитує VOPAS для дати (DD.MM.YYYY). Повертає (unique_routes, errors)."""
    all_routes: list[dict] = []
    errors: list[str] = []

    for from_city, to_city in MARSHRUTI:
        url = build_url(from_city, to_city, date_str)
        try:
            html = fetch_html(url)
            routes = parse_search_page(html, from_city, to_city)
            all_routes.extend(routes)
        except Exception as e:  # noqa: BLE001
            err = f"{from_city}→{to_city}: {type(e).__name__}: {e}"
            errors.append(err)

    return dedupe(all_routes), errors


# ── Main ──────────────────────────────────────────────────────────────────

def get_21_days() -> list[datetime.date]:
    """Повертає 21 день: Пн поточного тижня → Нд через 2 тижні.
    21 = 14 (видимі в UI) + 7 (буфер наступного тижня).
    Буфер гарантує: у неділю парсер вже зберіг наступний тиждень,
    щоб коли настає понеділок і UI зсовується вперед — дані вже є."""
    today = datetime.date.today()
    monday = today - datetime.timedelta(days=today.weekday())
    return [monday + datetime.timedelta(days=i) for i in range(21)]


def main() -> int:
    now_kyiv = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3)))
    today = datetime.date.today()
    week_days = get_21_days()
    monday = today - datetime.timedelta(days=today.weekday())
    visible_end = monday + datetime.timedelta(days=13)  # останній день видимого тижня 1 (Нд)

    print(f"=== VOPAS parser {now_kyiv.strftime('%d.%m.%Y %H:%M')} Київ ===")
    print(f"Діапазон: {week_days[0]} — {week_days[-1]} (21 день)\n")

    # Завантажуємо поточний schedule.json щоб зберегти кешовані минулі дні
    existing: dict[str, Any] = {}
    if SCHEDULE_PATH.exists():
        try:
            existing = json.loads(SCHEDULE_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass

    existing_days: dict[str, Any] = existing.get("days", {})
    all_carriers: dict[str, Any] = dict(existing.get("carriers", {}))
    days_result: dict[str, Any] = {}
    raw_today: list[dict] = []  # сирі дані для vopas-fetched.json

    for day in week_days:
        iso = day.isoformat()           # "2026-06-07"
        date_str = day.strftime("%d.%m.%Y")  # "07.06.2026"

        # Минулі дні — кешуємо, не перезапитуємо
        if day < today and iso in existing_days:
            days_result[iso] = existing_days[iso]
            print(f"  ↻ {iso}: кешовано минуле ({len(existing_days[iso].get('routes', []))} рейсів)")
            continue

        # Тиждень 3 (буфер, не видимий в UI) — кешуємо якщо вже є.
        # Свіжий запит отримає коли стане частиною видимого вікна (тиждень 0/1).
        if day > visible_end and iso in existing_days:
            days_result[iso] = existing_days[iso]
            print(f"  ↻ {iso}: буфер, кешовано ({len(existing_days[iso].get('routes', []))} рейсів)")
            continue

        print(f"\n=== {iso} ({date_str}) — {len(MARSHRUTI)} пар ===")
        unique, errors = query_day(date_str)
        print(f"  Усього: {len(unique)} унікальних рейсів від VOPAS")

        if errors:
            for e in errors:
                print(f"  ✗ {e}")

        # ЗАХИСТ: якщо VOPAS взагалі не відповів для сьогодні — зберігаємо старе
        if not unique and day == today and iso in existing_days:
            days_result[iso] = existing_days[iso]
            print(f"  ⚠ VOPAS не відповів — зберігаємо попередні дані")
            continue

        prev_routes = existing_days.get(iso, {}).get("routes") or []
        # now_min передаємо тільки для сьогоднішнього дня (sticky актуальний лише сьогодні)
        cur_now_min = (now_kyiv.hour * 60 + now_kyiv.minute) if day == today else None
        routes, day_carriers = build_day_routes(unique, date_str, prev_routes, cur_now_min)
        all_carriers.update(day_carriers)

        days_result[iso] = {
            "routes":      routes,
            "fetchedAt":   now_kyiv.strftime("%d.%m.%Y"),
            "fetchedTime": now_kyiv.strftime("%H:%M"),
        }
        print(f"  💾 {iso}: {len(routes)} рейсів")

        if day == today:
            raw_today = unique

    # Діагностичний дамп сьогоднішніх сирих даних
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps({
        "fetched_at": now_kyiv.isoformat(),
        "date": today.strftime("%d.%m.%Y"),
        "source": "vopas.com.ua",
        "routes": raw_today,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    # Записуємо schedule.json
    schedule = {
        "version":     2,
        "source":      "VOPAS — vopas.com.ua (авто-оновлення)",
        "updatedAt":   now_kyiv.strftime("%d.%m.%Y"),
        "updatedTime": now_kyiv.strftime("%H:%M"),
        "carriers":    all_carriers,
        "days":        days_result,
    }

    SCHEDULE_PATH.write_text(
        json.dumps(schedule, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    total_routes = sum(len(d.get("routes", [])) for d in days_result.values())
    print(f"\n💾 schedule.json: {len(days_result)} днів, {total_routes} рейсів, "
          f"{len(all_carriers)} перевізників")
    return 0


if __name__ == "__main__":
    sys.exit(main())
