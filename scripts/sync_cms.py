#!/usr/bin/env python3
"""CI-синк: бере готові статті кабінету (cms_articles status='ready') із Supabase
і викладає у git-стрічку data/articles.json (id/дедуп/ліміти — як publish_queue),
потім позначає їх status='published' назад у Supabase.

Архітектура «Supabase редагує — Git публікує» (docs/EDITOR_CABINET_ARCH.md).
Читає/пише Supabase через REST із SERVICE_ROLE-ключем (обходить RLS на сервері;
ключ — лише в секреті GitHub Actions, ніколи в клієнті).

Env: SUPABASE_URL (опц., є дефолт), SUPABASE_SERVICE_ROLE_KEY (обов'язково).
"""
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parse_rss as pr  # noqa: E402

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://uabyfecseqnemvcqhdem.supabase.co").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
REST = SUPABASE_URL + "/rest/v1/cms_articles"


def _req(method, url, body=None):
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": "Bearer " + SERVICE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def fetch_ready():
    url = REST + "?status=eq.ready&type=eq.news&select=*&order=ts.asc"
    headers = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read() or "[]")


def mark_published(row_id, git_id):
    body = {
        "status": "published",
        "git_id": git_id,
        "published_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    _req("PATCH", REST + "?id=eq.%s" % row_id, body)


def promote_scheduled():
    """Автопостинг: заплановані статті, яким настав час (publish_at<=now),
    переводимо scheduled→ready. Далі їх публікує звичайний потік синку."""
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    url = REST + "?status=eq.scheduled&publish_at=lte." + now
    try:
        _req("PATCH", url, {"status": "ready"})
        print(f"⏰ автопостинг: заплановані з часом <= {now} → ready")
    except Exception as e:
        print(f"⚠ promote_scheduled: {e}")


def cms_to_article(row, next_id):
    """Нормалізує рядок cms_articles у git-схему статті."""
    ts = row.get("ts") or int(time.time() * 1000)
    return {
        "id": next_id,
        "title": row.get("title", ""),
        "excerpt": (row.get("excerpt") or row.get("content") or "")[:400],
        "content": row.get("content", ""),
        "category": row.get("category") or "Суспільство",
        "geo": row.get("geo") or "Громада",
        "image": row.get("image"),
        "image_type": row.get("image_type") or ("source" if row.get("image") else "none"),
        "image_credit": row.get("image_credit"),
        "source": row.get("source") or "CSTL LIFE",
        "sourceUrl": row.get("source_url"),
        "exclusive": bool(row.get("exclusive", True)),
        "ts": ts,
        "added_ts": int(time.time() * 1000),
        "kind": "editor",
    }


def main():
    if not SERVICE_KEY:
        print("✗ немає SUPABASE_SERVICE_ROLE_KEY — пропускаю синк")
        return
    promote_scheduled()   # автопостинг: scheduled з насталим часом → ready
    try:
        ready = fetch_ready()
    except Exception as e:
        print(f"✗ не вдалося прочитати cms_articles: {e}")
        return
    if not ready:
        print("Немає готових статей (status=ready) — синк не потрібен")
        return

    existing = json.loads(pr.DATA_PATH.read_text(encoding="utf-8"))
    next_id = max((a["id"] for a in existing if isinstance(a.get("id"), int)), default=0) + 1

    # Дедуп за нечітким заголовком у межах розділу (як усюди).
    seen_by_section = {}
    for a in existing:
        if a.get("title"):
            pr.remember_title(pr.title_tokens(a["title"]), pr.section_of(a.get("geo", "")), seen_by_section)

    published, synced = [], 0
    for row in ready:
        title = (row.get("title") or "").strip()
        if not title:
            continue
        section = pr.section_of(row.get("geo", "Громада"))
        tokens = pr.title_tokens(title)
        if pr.is_dup_title(tokens, section, seen_by_section):
            mark_published(row["id"], None)   # уже у стрічці — просто закриваємо
            continue
        art = cms_to_article(row, next_id)
        published.append(art)
        pr.remember_title(tokens, section, seen_by_section)
        try:
            mark_published(row["id"], next_id)
            synced += 1
        except Exception as e:
            print(f"⚠ не вдалося позначити published id={row['id']}: {e}")
        next_id += 1

    if not published:
        print("Усі готові статті вже у стрічці (дублі) — закрито.")
        return

    # Ліміти/баланс/обрізка — як у publish_queue.
    published, evict_ids = pr.apply_daily_limits(published, existing)
    if evict_ids:
        existing = [a for a in existing if a.get("id") not in evict_ids]
    merged = published + existing
    merged.sort(key=lambda a: a.get("ts", 0), reverse=True)
    merged = pr.balance_ua_world(merged)[: pr.MAX_ARTICLES]

    pr.DATA_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ синк: +{synced} статей кабінету у стрічку (усього {len(merged)})")


if __name__ == "__main__":
    main()
