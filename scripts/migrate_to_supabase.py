#!/usr/bin/env python3
"""
migrate_to_supabase.py — одноразова міграція даних з data/*.json у Supabase.

ЗАПУСК (після того як Вова створив Supabase проект):

    export SUPABASE_URL="https://xxxxxx.supabase.co"
    export SUPABASE_SERVICE_KEY="eyJhbG..."   # service_role key, НЕ anon!
    python3 scripts/migrate_to_supabase.py

Що робить:
  1. Створює таблиці `posts` і `announcements` через REST PostgREST API
     (SQL запускати вручну у SQL Editor — див. CREATE TABLE нижче)
  2. Читає data/community-board.json → INSERT у `posts`
  3. Читає data/community.json::announcements → INSERT у `announcements`
  4. Виводить статистику: скільки рядків записано, які пропущено

Контакти з community.json НЕ мігруються — вони лишаються у JSON (рідко змінюються).

Залежності: requests (`pip install requests`).

SQL-схема (запустити у Supabase SQL Editor ПЕРЕД скриптом):

    -- Таблиця оголошень Дошки громади (план з docs/COMMUNITY_BOARD_VISION.md)
    CREATE TABLE posts (
      id            BIGSERIAL PRIMARY KEY,
      type          TEXT NOT NULL DEFAULT 'board',     -- 'board' | 'chat' | 'greeting'
      category      TEXT,                              -- 'продам' | 'куплю' | 'шукаю' | 'знайдено' | 'загубилось' | 'подяка' | 'послуга' | 'оголошення'
      text          TEXT NOT NULL,
      author        TEXT,                              -- NULL = анонім
      contact       TEXT,                              -- телефон / Telegram
      color         TEXT DEFAULT 'yellow',             -- колір стікера
      photo         TEXT,                              -- URL зі Storage АБО base64 (тимчасово, до Спринту 2)
      location      TEXT,                              -- село ОТГ (Олика / Дерно / Ставок / ...)
      status        TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'published' | 'rejected'
      ts            BIGINT,                            -- legacy timestamp у мс (для сумісності з JSON)
      published_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX idx_posts_status_published_at ON posts (status, published_at DESC);

    -- Офіційні оголошення від адміністрації
    CREATE TABLE announcements (
      id            BIGSERIAL PRIMARY KEY,
      pinned        BOOLEAN DEFAULT false,
      title         TEXT NOT NULL,
      body          TEXT NOT NULL,
      author        TEXT,
      ts            BIGINT,
      status        TEXT NOT NULL DEFAULT 'pending',
      published_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ DEFAULT now()
    );

    -- RLS (Row Level Security) — публічне читання тільки published, запис тільки через service_role
    ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public read published posts" ON posts FOR SELECT
      USING (status = 'published');

    ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public read published announcements" ON announcements FOR SELECT
      USING (status = 'published');

    -- Реклама (з docs/MONETIZATION.md) — закласти одразу щоб потім не ALTER
    CREATE TABLE ads (
      id            BIGSERIAL PRIMARY KEY,
      title         TEXT NOT NULL,
      body          TEXT,
      image_url     TEXT,
      link_url      TEXT,
      placement     TEXT NOT NULL,   -- 'board' | 'news_feed' | 'event_card' | 'banner'
      priority      INT DEFAULT 0,
      paid_amount   NUMERIC,
      client_name   TEXT,
      client_email  TEXT,
      client_phone  TEXT,
      starts_at     TIMESTAMPTZ DEFAULT now(),
      expires_at    TIMESTAMPTZ NOT NULL,
      views_count   INT DEFAULT 0,
      clicks_count  INT DEFAULT 0,
      is_active     BOOLEAN DEFAULT true,
      created_at    TIMESTAMPTZ DEFAULT now()
    );
    ALTER TABLE ads ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Public read active ads" ON ads FOR SELECT
      USING (is_active = true AND expires_at > now());
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
        rows.append({
            "type":         p.get("type", "board"),
            "category":     p.get("category"),
            "text":         p["text"],
            "author":       p.get("author") if p.get("author") not in (None, "", "анонімно") else None,
            "contact":      p.get("contact"),
            "color":        p.get("color", "yellow"),
            "photo":        p.get("photo"),
            "location":     p.get("location"),
            "status":       p.get("status", "published"),
            "ts":           p.get("ts"),
            "published_at": p.get("published_at"),
        })

    ok, errors = supabase_insert(url, key, "posts", rows)
    print(f"posts: записано {ok}/{len(rows)}")
    for e in errors:
        print(f"  ERROR: {e}", file=sys.stderr)


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
    print("Перед запуском — створи таблиці через SQL Editor (див. docstring у цьому файлі).\n")

    migrate_posts(url, key)
    migrate_announcements(url, key)

    print("\nГотово. Перевір через Supabase Table Editor:")
    print(f"  {url}/project/_/editor")


if __name__ == "__main__":
    main()
