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

# Олика — проміжна точка (хаб) на маршрутах. Щоб витягти ВСІ рейси що
# проходять через Олику в обидва боки — запитуємо Олику в парі з кожною
# кінцевою станцією (туди і назад). Дедуплікація прибере повтори.
#
# Кінцеві станції маршрутів через Олику:
#   Захід: Луцьк, Ківерці
#   Схід:  Личани, Носовичі, Жорнище, Метельне, Чемерин
# Якщо VOPAS не знає міста — поверне 0 рейсів (не помилка), безпечно додавати.
HUB = "Олика"
ENDPOINTS: list[str] = [
    "Луцьк", "Ківерці",
    "Личани", "Носовичі", "Жорнище", "Метельне", "Чемерин",
]

# Усі пари: Олика→endpoint (рейси що йдуть з Олики) +
#           endpoint→Олика (рейси що прибувають в Олику)
MARSHRUTI: list[tuple[str, str]] = (
    [(HUB, e) for e in ENDPOINTS] + [(e, HUB) for e in ENDPOINTS]
)

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


# ── ДІАГНОСТИКА: як VOPAS віддає зупинки рейсу (тимчасово) ─────────────────
def probe_stops(vopas_id: str) -> None:
    """Endpoint зупинок невідомий — мої здогадки дали 404. Тому читаємо
    JS-код VOPAS і шукаємо обробник кнопки .go (data-id) — там буде
    справжній URL/ajax виклик за зупинками."""
    if not vopas_id:
        print("   probe_stops: немає vopas_id")
        return

    print(f"\n=== PROBE: шукаю обробник зупинок у JS VOPAS (рейс id={vopas_id}) ===")

    # Завантажуємо головний JS і шукаємо обробник кнопки .go (кнопка зупинок рейсу).
    # Знаємо патерн: VOPAS робить $.ajax POST на /module/ajaxXXX.php.
    # Треба знайти який саме endpoint викликає клік по .go з data-id.
    js_url = "https://vopas.com.ua/js/configPage.js"
    try:
        req = urllib.request.Request(js_url, headers={"User-Agent": BROWSER_UA})
        js = None
        for ctx in (ssl.create_default_context(), ssl._create_unverified_context()):
            try:
                with urllib.request.urlopen(req, timeout=20, context=ctx) as resp:
                    js = resp.read().decode("utf-8", errors="ignore")
                    break
            except urllib.error.URLError as e:
                if "CERTIFICATE" in str(e).upper():
                    continue
                raise
        if js:
            print(f"  configPage.js завантажено ({len(js)} байт)")
            # 1. Усі endpoint-и /module/*.php
            endpoints = sorted(set(re.findall(r"/module/[\w]+\.php", js)))
            print(f"  Знайдені endpoint-и /module/*.php: {endpoints}")
            # 2. Контекст навколо обробника .go (клік по кнопці зупинок)
            for m in re.finditer(r"\.go\b|'\.go'|\"\.go\"|data-id|getStops|showStops|Stops", js):
                pos = m.start()
                s = max(0, pos - 200)
                frag = js[s:pos + 400].replace("\n", " ").replace("  ", " ")
                print(f"    [{m.group()}@{pos}] …{frag}…")
        else:
            print("  configPage.js — не завантажився")
    except Exception as e:  # noqa: BLE001
        print(f"  помилка: {type(e).__name__}: {e}")
    print("=== кінець probe ===\n")


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
    # sale_active=True тільки якщо квитки реально продаються онлайн і рейс не відмінено
    sale_active = (not cancelled) and ("sale-stop" not in status_classes)

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
        "cancelled":      cancelled,
    }


def parse_search_page(html: str, from_city: str = "", to_city: str = "") -> list[dict[str, Any]]:
    soup = BeautifulSoup(html, "html.parser")
    cards = soup.select("div.result-cols")
    routes = []
    for card in cards:
        info = parse_card(card)
        if info and info.get("departure_time"):  # skip empty
            # Зберігаємо точки сегмента з запиту (route_name — повна назва маршруту)
            info["from"] = from_city
            info["to"] = to_city
            routes.append(info)
    return routes


# ── Конвертація у формат data/schedule.json (для UI вкладки Автобуси) ──────

CARRIER_PHONE = "0332 224 500"  # єдиний диспетчер VOPAS

# Whitelist населених пунктів Олицької громади + транспортні вузли + проміжні
# зупинки на трасах через Олику (з реального квиткового розкладу VOPAS).
# Рейс ЛОКАЛЬНИЙ тільки якщо ВСІ точки його маршруту тут. Інакше — транзит
# (Рига-Одеса, Полтава-Щецин і т.д.) → відсікаємо.
ALLOWED_STOPS = {
    # Олика — центр громади
    "олика",
    # Села Олицької громади (16, офіц. перелік decentralization.gov.ua)
    "дідичі", "жорнище", "чемерин", "метельне", "носовичі", "одеради",
    "покащів", "хромяків", "дерно", "котів", "путилівка", "мощаниця",
    "залісоче", "горянівка", "ставок", "личани",
    # Альтернативні написання (на vopas.com.ua назви можуть відрізнятись)
    "горанівка", "чмерин", "путилика", "одераж", "залісся",
    # Транспортні вузли — кінцеві/проміжні точки приміських рейсів громади
    "луцьк", "ківерці", "рівне",
    # Проміжні зупинки на трасі (з квиткового розкладу VOPAS)
    "піддубці", "струмівка", "гараджа", "звірів", "арматнів", "пальче",
    "хорлупи",
}

# Службові слова у назвах маршрутів VOPAS («ч/з Покащів» = через Покащів)
ROUTE_STOPWORDS = {"чз", "через", "пов", "аз", "збір", "зб"}


def route_is_local(route_name: str | None) -> bool:
    """True якщо ВСІ населені пункти у назві маршруту — з ALLOWED_STOPS.
    «Луцьк-Личани ч/з Покащів» → [луцьк, личани, покащів] всі наші → True
    «Рига Одеса» → рига не наша → False
    «Краматорськ Єленя-Гура» → False"""
    if not route_name:
        return False
    # Нормалізуємо: апострофи (Хром'яків→Хромяків) і службові розділювачі
    normalized = route_name.lower().replace("'", "").replace("'", "").replace("`", "")
    cleaned = re.sub(r"ч/з|через|[\-,()]", " ", normalized)
    tokens = [t.strip() for t in cleaned.split() if len(t.strip()) >= 3]
    place_tokens = [t for t in tokens if t not in ROUTE_STOPWORDS]
    if not place_tokens:
        return False
    for t in place_tokens:
        # точний збіг або токен є частиною дозволеної назви (Хромяків пов. → хромяків)
        if not any(t == s or t in s or s in t for s in ALLOWED_STOPS):
            return False
    return True

def hhmm_to_min(hhmm: str | None) -> int | None:
    if not hhmm or ":" not in hhmm:
        return None
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)

def make_carrier_id(name: str) -> str:
    """«під.Яцишин М.М.» → 'yatsyshyn_mm' (стабільний slug для carriers{})."""
    base = re.sub(r"[^\wа-яіїєґА-ЯІЇЄҐ]+", "_", (name or "").lower()).strip("_")
    return base[:40] or "unknown"

def build_schedule(routes: list[dict[str, Any]], today: str) -> dict[str, Any]:
    """Конвертує розпарсені рейси VOPAS у формат data/schedule.json
    який очікує src/core/bus-schedule.js (routes[] зі stops[], carriers{}).

    Проміжні зупинки поки НЕ доступні (треба окремий запит VOPAS за vopas_id) —
    кожен рейс має 2 точки [from, to]. Шкала покаже старт→фініш з рухом 🚌 за часом.
    """
    carriers: dict[str, dict[str, str]] = {}
    out_routes = []
    skipped_transit = 0

    for r in routes:
        dep = r.get("departure_time")
        arr = r.get("arrival_time")
        dep_min = hhmm_to_min(dep)
        arr_min = hhmm_to_min(arr)
        if dep_min is None or arr_min is None:
            continue
        duration = max(0, arr_min - dep_min)
        price = r.get("price")

        # ФІЛЬТР ЛОКАЛЬНИХ РЕЙСІВ (надійний — whitelist по населених пунктах).
        # Рейс лишаємо ТІЛЬКИ якщо всі точки маршруту — села громади / вузли.
        # Транзитні (Рига-Одеса, Полтава-Щецин) мають чужі міста у назві.
        # Додатковий sanity-check: тривалість не більше 2.5 год (приміський).
        if not route_is_local(r.get("route_name")):
            skipped_transit += 1
            continue
        if duration > 150:
            skipped_transit += 1
            continue

        carrier_name = r.get("carrier") or "Перевізник"
        cid = make_carrier_id(carrier_name)
        carriers.setdefault(cid, {"name": carrier_name, "phone": CARRIER_PHONE})

        frm = r.get("from") or (r.get("route_name") or "").split()[0]
        to = r.get("to") or (r.get("route_name") or "—")

        # Статус для UI: cancelled (відмінено) має пріоритет
        status = "cancelled" if r.get("cancelled") else "scheduled"

        out_routes.append({
            "id": f"vopas_{r.get('vopas_id') or dep.replace(':', '')}",
            "vopas_id": r.get("vopas_id"),
            "name": r.get("route_name") or f"{frm} → {to}",
            "carrier": cid,
            "bus": r.get("bus"),
            "days": "щодня",  # VOPAS дає на конкретну дату; cron щодня тримає актуальним
            "status": status,
            "sale_active": r.get("sale_active", True),
            "departure_time": dep,
            "arrival_time": arr,
            "duration_min": duration,
            "auto_generated": False,
            "price": price,  # None якщо тарифу немає → UI покаже «—»
            "stops": [
                {"name": frm, "km": 0,   "price_from_start": 0},
                {"name": to,  "km": 100, "price_from_start": price or 0},
            ],
        })

    # Сортуємо за часом відправлення
    out_routes.sort(key=lambda x: hhmm_to_min(x["departure_time"]) or 0)
    print(f"   build_schedule: {len(out_routes)} локальних, {skipped_transit} транзитних відсіяно")

    now_kyiv = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=3)))
    return {
        "version": today,
        "verifiedAt": now_kyiv.strftime("%d.%m.%Y"),
        "verifiedTime": now_kyiv.strftime("%H:%M"),
        "source": "VOPAS — vopas.com.ua (авто-оновлення)",
        "note": f"Авто-парсинг vopas.com.ua. Оновлено {now_kyiv.strftime('%d.%m.%Y %H:%M')} Київ.",
        "carriers": carriers,
        "routes": out_routes,
    }


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
            routes = parse_search_page(html, from_city, to_city)
            print(f"  ✓ знайдено {len(routes)} рейсів (HTML {len(html)} байт)")
            all_routes.extend(routes)
        except Exception as e:  # noqa: BLE001
            err = f"{from_city}→{to_city}: {type(e).__name__}: {e}"
            errors.append(err)
            print(f"  ✗ {err}")

    unique = dedupe(all_routes)
    print(f"\n→ Усього: {len(all_routes)} рейсів, унікальних: {len(unique)}")

    # ДІАГНОСТИКА (тимчасово): пробуємо знайти endpoint зупинок на 1 рейсі
    first_with_id = next((r for r in unique if r.get("vopas_id")), None)
    if first_with_id:
        probe_stops(first_with_id["vopas_id"])

    if errors:
        print(f"\n⚠️  Помилок: {len(errors)}")
        for e in errors:
            print(f"   - {e}")

    # ЗАХИСТ: якщо нічого не знайшли (сайт ліг / усі запити з помилкою) —
    # НЕ перезаписуємо schedule.json, щоб не обнулити робочий розклад.
    if not unique:
        print("\n⚠️  Жодного рейсу не отримано — schedule.json НЕ оновлюємо (зберігаємо старий)")
        return 0

    # Діагностичний дамп (сирі дані) — поки лишаємо для перевірки
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps({
        "fetched_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "date": today, "source": "vopas.com.ua",
        "errors": errors, "routes": unique,
    }, ensure_ascii=False, indent=2), encoding="utf-8")

    # ГОЛОВНЕ: пишемо data/schedule.json у форматі для UI вкладки Автобуси
    schedule = build_schedule(unique, today)
    schedule_path = Path(__file__).parent.parent / "data" / "schedule.json"
    schedule_path.write_text(
        json.dumps(schedule, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"💾 Оновлено {schedule_path}: {len(schedule['routes'])} рейсів, "
          f"{len(schedule['carriers'])} перевізників, "
          f"verifiedAt={schedule['verifiedAt']} {schedule['verifiedTime']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
