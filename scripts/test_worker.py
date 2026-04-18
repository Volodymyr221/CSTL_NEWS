#!/usr/bin/env python3
"""Тест Cloudflare Worker — перевіряємо чи Worker дістається до сайту громади.

Запуск: python scripts/test_worker.py https://cstl-proxy.YOUR_NAME.workers.dev
"""

import json
import sys
import urllib.request

def test_worker(worker_url: str):
    worker_url = worker_url.rstrip('/')
    print(f"Worker URL: {worker_url}\n")

    # 1. Health-check — Worker живий?
    print("── 1. Health-check ─────────────────────────────────────")
    try:
        req = urllib.request.Request(f"{worker_url}/health")
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
            print(f"✓ Worker живий: {data}")
    except Exception as e:
        print(f"✗ Worker недоступний: {e}")
        return

    # 2. Головна сторінка сайту громади
    print("\n── 2. Головна сторінка (/)")
    fetch_path(worker_url, '/')

    # 3. Новини
    print("\n── 3. Новини (/novyny)")
    fetch_path(worker_url, '/novyny')

    # 4. Оголошення
    print("\n── 4. Оголошення (/ogoloshennia)")
    fetch_path(worker_url, '/ogoloshennia')

    # 5. Пошук RSS-лінків
    print("\n── 5. Шукаємо RSS у <link> тегах головної сторінки ───")
    find_rss(worker_url)


def fetch_path(worker_url: str, path: str):
    import re
    url = f"{worker_url}?path={path}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=15) as r:
            status = r.getcode()
            html = r.read().decode('utf-8', errors='replace')
            print(f"  HTTP {status} | {len(html)} байт")

            # Показуємо перші заголовки статей
            titles = re.findall(r'<(?:h[123]|a)[^>]*class="[^"]*(?:title|news|article)[^"]*"[^>]*>\s*([^<]{10,120})', html, re.IGNORECASE)
            if titles:
                print("  Знайдені заголовки:")
                for t in titles[:5]:
                    print(f"    • {t.strip()}")
            else:
                # Просто покажемо шматок HTML для аналізу
                snippet = html[html.find('<main'):html.find('<main')+2000] if '<main' in html else html[1000:3000]
                print(f"  Заголовки не знайдено автоматично. Шматок HTML для аналізу:")
                print(f"  {repr(snippet[:500])}")
    except Exception as e:
        print(f"  ✗ Помилка: {e}")


def find_rss(worker_url: str):
    import re
    url = f"{worker_url}?path=/"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=15) as r:
            html = r.read().decode('utf-8', errors='replace')

        # Шукаємо <link rel="alternate" type="application/rss+xml">
        rss_links = re.findall(
            r'<link[^>]+type=["\']application/(?:rss|atom)\+xml["\'][^>]+href=["\']([^"\']+)["\']',
            html, re.IGNORECASE
        )
        if rss_links:
            print(f"  ✓ Знайдено RSS: {rss_links}")
        else:
            print("  Стандартних RSS-лінків у <head> не знайдено.")
            # Шукаємо будь-які посилання на feed/rss
            feed_links = re.findall(r'href=["\']([^"\']*(?:feed|rss|atom)[^"\']*)["\']', html, re.IGNORECASE)
            if feed_links:
                print(f"  Але є посилання з 'feed/rss' у href: {feed_links[:5]}")

    except Exception as e:
        print(f"  ✗ Помилка: {e}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Використання: python scripts/test_worker.py https://cstl-proxy.ТВІЙ_АКАУНТ.workers.dev")
        sys.exit(1)
    test_worker(sys.argv[1])
