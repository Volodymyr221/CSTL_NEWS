#!/usr/bin/env python3
"""
migrate_to_supabase.py — одноразова міграція data/*.json у Supabase.

ПЕРЕДУМОВА:
  1. Створено Supabase проект
  2. У SQL Editor запущено scripts/supabase_schema.sql (вписав свій email!)
  3. У env-змінних SUPABASE_URL і SUPABASE_SERVICE_KEY

ЗАПУСК:
  pip install requests
  export SUPABASE_URL="https://xxxxxx.supabase.co"
  export SUPABASE_SERVICE_KEY="eyJhbG..."   # service_role, НЕ anon!
  python3 scripts/migrate_to_supabase.py

ЩО РОБИТЬ:
  - Читає data/community-board.json → INSERT у `posts` (status='published')
  - Читає data/community.json::announcements → INSERT у `announcements`
  - Контакти з community.json лишаються у JSON (рідко змінюються)

ВАЖЛИВО: використовується service_role key — він проходить повз RLS policies.
Anon-key не годиться, бо RLS блокує запис нечітких статусів.
"""

import json
import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: pip install requests", file=sys.stderr)
    sys.exit(1)


ROOT = Path(__file__).resolve().parent.parent


def supabase_insert(url, key, table, rows):
    """POST у /rest/v1/{table}. Повертає (ok_count, errors)."""
    if not rows:
        return 0, []
    endpoint = f"{url.rstrip('/')}/rest/v1/{table}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    resp = requests.post(endpoint, headers=headers, json=rows, timeout=30)
    if resp.status_code >= 400:
        return 0, [f"{resp.status_code}: {resp.text}"]
    return len(resp.json()), []


def migrate_posts(url, key):
    src = ROOT / "data" / "community-board.json"
    with src.open(encoding="utf-8") as f:
        data = json.load(f)

    rows = []
    for p in data.get("posts", []):
        # photo (single str|null) у JSON → photos (TEXT[]) у Supabase
        photo = p.get("photo")
        photos = [photo] if photo else []

        # "анонімно" у JSON → NULL у БД (Supabase has author=NULL convention)
        author = p.get("author")
        if author in (None, "", "анонімно"):
            author = None

        rows.append({
            "type":         p.get("type", "board"),
            "category":     p.get("category"),
            "text":         p["text"],
            "title":        None,                       # для board без title
            "author":       author,
            "contact":      p.get("contact"),
            "color":        p.get("color", "yellow"),
            "photos":       photos,
            "tags":         [],                         # для board порожній
            "price":        None,
            "currency":     "UAH",
            "location":     p.get("location"),
            "status":       p.get("status", "published"),
            "ts":           p.get("ts"),
            "published_at": p.get("published_at"),
        })

    ok, errors = supabase_insert(url, key, "posts", rows)
    print(f"posts: записано {ok}/{len(rows)}")
    for e in errors:
        print(f"  ERROR: {e}", file=sys.stderr)
    return ok, errors


def migrate_announcements(url, key):
    src = ROOT / "data" / "community.json"
    with src.open(encoding="utf-8") as f:
        data = json.load(f)

    rows = []
    for a in data.get("announcements", []):
        rows.append({
            "pinned":       bool(a.get("pinned")),
            "title":        a["title"],
            "body":         a["body"],
            "author":       a.get("author"),
            "ts":           a.get("ts"),
            "status":       a.get("status", "published"),
            "published_at": a.get("published_at"),
        })

    ok, errors = supabase_insert(url, key, "announcements", rows)
    print(f"announcements: записано {ok}/{len(rows)}")
    for e in errors:
        print(f"  ERROR: {e}", file=sys.stderr)
    return ok, errors


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not url or not key:
        print("ERROR: встанови SUPABASE_URL і SUPABASE_SERVICE_KEY у env", file=sys.stderr)
        print("Приклад:", file=sys.stderr)
        print('  export SUPABASE_URL="https://xxxxxx.supabase.co"', file=sys.stderr)
        print('  export SUPABASE_SERVICE_KEY="eyJ..."', file=sys.stderr)
        sys.exit(1)

    print(f"Supabase: {url}")
    print("Перевір що scripts/supabase_schema.sql виконано і admins має твою пошту.\n")

    posts_ok, posts_err     = migrate_posts(url, key)
    ann_ok, ann_err         = migrate_announcements(url, key)

    print()
    print(f"Підсумок: posts={posts_ok}, announcements={ann_ok}")
    if posts_err or ann_err:
        print("⚠️ Були помилки — див. ERROR вище", file=sys.stderr)
        sys.exit(1)

    print(f"✓ Готово. Перевір у Table Editor: {url}/project/_/editor")


if __name__ == "__main__":
    main()
