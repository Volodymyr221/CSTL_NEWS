/**
 * CSTL NEWS — Cloudflare Worker
 * Проксі (посередник) для olytska-gromada.gov.ua
 * Обходить IP-блокування: сайт громади блокує Azure (GitHub Actions),
 * але не Cloudflare. Worker забирає HTML і повертає нашому парсеру.
 *
 * Деплой: cloudflare.com → Workers & Pages → Create Worker → вставити цей код
 */

// Worker — проксі ВИКЛЮЧНО для одного сайту. Будь-який інший хост відкидається
// (анти open-proxy: щоб чужі не ганяли через нього довільні сайти).
const TARGET_BASE = 'https://olytska-gromada.gov.ua';
const TARGET_ORIGIN = new URL(TARGET_BASE).origin;

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Простий health-check (перевірка що Worker живий)
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', worker: 'cstl-proxy' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Отримуємо шлях з query-параметра: ?path=/novyny
    const path = url.searchParams.get('path') || '/';

    // Будуємо цільовий URL безпечно через new URL() (а не конкатенацією рядків).
    // Анти open-proxy: path=@evil.com або //evil.com змінив би хост — після
    // парсингу перевіряємо що origin лишився саме сайтом громади.
    let target;
    try {
      target = new URL(path, TARGET_BASE);
    } catch {
      return new Response(JSON.stringify({ error: 'bad path' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (target.origin !== TARGET_ORIGIN) {
      return new Response(JSON.stringify({ error: 'forbidden host' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const targetUrl = target.href;

    try {
      const response = await fetch(targetUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'uk-UA,uk;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          Referer: TARGET_BASE + '/',
        },
        // Кешуємо на рівні Cloudflare на 30 хвилин — не спамимо сайт громади
        cf: { cacheTtl: 1800, cacheEverything: false },
      });

      const html = await response.text();

      return new Response(html, {
        status: response.status,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'X-Proxy-Status': String(response.status),
        },
      });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: String(err), path }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  },
};
