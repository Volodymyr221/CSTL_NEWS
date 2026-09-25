// sw.js — CSTL LIFE Service Worker
// Кешує статичні файли для офлайн-роботи і швидкого завантаження

const CACHE_NAME = 'cstl-20260925-1745';

// 🔴 26.08 — ОКРЕМИЙ ВІЧНИЙ КЕШ ДЛЯ СТОРОННІХ БІБЛІОТЕК.
// 🔑 Чому не в `STATIC_ASSETS`: `CACHE_NAME` міняється при КОЖНОМУ деплої, і передкеш
// качається заново. SDK Supabase важить 212 КБ — на десяток деплоїв за вечір це два
// мегабайти мобільного трафіку на кожному телефоні за файл, який не змінився.
// 🔑 Ім'я файлу містить ВЕРСІЮ, тож вміст за цією адресою незмінний назавжди — його
// можна кешувати вічно і ніколи не перевіряти. Оновлення версії дає нове ім'я.
// ⚠️ Цей кеш НЕ чиститься при активації (див. `activate` нижче) — у цьому й суть.
const VENDOR_CACHE = 'cstl-vendor-v1';

// Precache (попереднє кешування) — статичні файли які не змінюються часто
// index.html тут — як fallback для офлайну (на fetch використовується network-first)
const STATIC_ASSETS = [
  './',
  './index.html',
  // 🔴 24.09 — ОДИН ФАЙЛ СТИЛІВ ЗАМІСТЬ ПʼЯТНАДЦЯТИ.
  // Було: `style.css` + 14 файлів `style/*.css` перелічені руками. Два лиха
  // одразу. Перше — список відставав: сім файлів (`news-card.css`,
  // `news-hub.css`, `install.css`, `crop.css`, `dev-lock.css`,
  // `desktop-gate.css`, `fund-screen.css`) до нього так і не дописали, тобто
  // офлайн частина екранів лишалась без стилів. Друге — браузер тягнув їх
  // ланцюжком `@import`, де кожен запит чекав на попередній.
  // Стало: `build.js` складає все в `style.min.css` (52 КБ gzip проти 385 КБ
  // сумою), і передкешувати треба рівно один рядок, який нічого не забуде.
  './style.min.css',
  // ⚠️ `style/tokens.css` ЛИШАЄТЬСЯ окремим рядком, хоч він і всередині збірки.
  // Причина не в застосунку, а в `admin.html`: це окрема сторінка, вона тягне
  // токени напряму, і без них адмінка офлайн лишається взагалі без кольорів.
  // Це вимога стенда `tests/admin-shell.mjs` — знято було помилково, стенд
  // упіймав. 16 КБ.
  './style/tokens.css',
  './bundle.js',
  './logo.png',
  './icons/castle-icon.png',   // лого центральної кнопки ГРОМАДА — precache, щоб не зникало після bump CACHE
  './manifest.json',
  // 🔴 ЗНЯТО 28.07: './images/cork2.png' (2.9 МБ) — найважчий файл проєкту.
  // Чому це було дорого: CACHE_NAME міняється при КОЖНОМУ деплої коду, а install
  // качає весь цей список заново — тобто кожен телефон перевантажував 2.9 МБ фото
  // корка щоразу, навіть жодного разу не відкривши Дошку. Ще й через `Promise.all`
  // нижче падіння одного файлу валило установку цілком, тобто найважчий файл був
  // і найбільшим ризиком.
  // Тепер фото не просить жодне правило CSS: фон Дошки — нейтральний `--board-bg`,
  // а темний корок віджета Громади й прев'ю подачі малюється CSS-градієнтом (0 байт).
  // Сам файл лишається в репозиторії — видаляти без окремого слова Вови не можна.
];

// Встановлення: кешуємо статичні файли
// 🔴 16.08 — `Promise.all` → `allSettled`. Один недоступний файл зі списку валив
// установку кешу ЦІЛКОМ: офлайн не працював зовсім, і дізнатись про це не було як
// (помилка тонула всередині `waitUntil`). Тепер кожен файл відповідає лише за себе,
// а те, що не доїхало, чесно називається в консолі. Кеш із 21 файлу кращий за
// відсутній кеш через 22-й.
// ⚠️ `skipWaiting()` лишається безумовним — новий Service Worker має ставати
//    активним навіть коли якийсь файл не закешувався: код застосунку однаково
//    береться network-first.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(
        STATIC_ASSETS.map(url =>
          // 🔴 24.09 — теж `no-cache` замість `reload` (див. `мережаПершою`).
          // Тут це болить найбільше: `CACHE_NAME` міняється при КОЖНОМУ деплої,
          // тобто передкеш качався ЦІЛКОМ щоразу — близько мегабайта на кожен
          // телефон за файли, з яких більшість не змінилась. Умовний запит
          // віддає їх як `304` без тіла, а `fetch` однаково резолвиться повною
          // відповіддю з кешу браузера, тож `cache.put` кладе справжній вміст.
          fetch(url, { cache: 'no-cache' }).then(r => {
            if (!r.ok) throw new Error(url + ' ' + r.status);
            return cache.put(url, r);
          })
        )
      ).then(results => {
        const failed = results
          .map((r, i) => (r.status === 'rejected' ? STATIC_ASSETS[i] : null))
          .filter(Boolean);
        if (failed.length) console.warn('[sw] не закешовано:', failed.join(', '));
      }))
      .then(() => self.skipWaiting())
  );
});

// Активація: видаляємо старі версії кешу
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        // ⚠️ `VENDOR_CACHE` навмисно переживає активацію: він тримає файли з версією в
        // імені, які не змінюються. Прибрати його тут означало б качати 212 КБ SDK
        // заново на кожен деплой — рівно те, від чого його й винесли.
        keys.filter(k => k !== CACHE_NAME && k !== VENDOR_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Обробка запитів
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 СТЕЛЯ ОЧІКУВАННЯ МЕРЕЖІ (22.09.2026) — найдорожчий рядок цього файлу.
//
// 📐 ЗАМІРЯНО В НІЧ НА 22.09, коли Вова написав «чому додаток так довго став
// завантажувати вкладки?». Шар даних Supabase лежав: `PGRST002` на кожному
// запиті, продовження сесії висіло 10-29 секунд, вхід через Google — 38.6 с.
// А застосунок УСЕ ЦЕ ЧЕКАВ, хоча поряд у кеші лежала готова копія.
//
// 🔑 КОРІНЬ БУВ У СТРАТЕГІЇ, А НЕ В СЕРВЕРІ. «Мережа-перша» знала рівно два
// стани: мережа є (чекаємо скільки треба) і мережі НЕМА ЗОВСІМ (беремо кеш).
// Стану «мережа є, але повзе» не існувало — саме в нього ми й потрапили.
//
// ➡️ Тепер третій стан описаний: не відповіла за `МЕРЕЖА_ЧЕКАЄ_МС` і копія в
// кеші є — віддаємо копію ОДРАЗУ, а свіже дописуємо в кеш фоном. Людина бачить
// трохи несвіже замість порожнього екрана; наступне відкриття вже свіже.
//
// ⚠️ ЧОГО ЦЕ НЕ ЛІКУЄ, і це чесно: `fetch` виконується, коли прийшли ЗАГОЛОВКИ,
// а не коли докачалось тіло. Тож стеля рятує від «сервер думає» (наш випадок),
// але не від «файл на 1.8 МБ повзе по 3G». Друге лікується вагою файлу, не тут.
//
// 🛑 Запас береться з `CACHE_NAME`, а він міняється щодеплою і старі кеші
// чистяться при активації — тобто в запасі лежить код ЦЬОГО деплою, а не
// давнина. Саме тому підміна кешем безпечна для `bundle.js`.
const МЕРЕЖА_ЧЕКАЄ_МС = 2500;

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 SERVICE WORKER РОЗКАЗУЄ СТОРІНЦІ, ЩО САМЕ ВІН ВІДДАВ (22.09.2026)
//
// 🗣️ Питання Вови, яке це породило: «коли підтягнуло нормальний інтернет, то як
// застосунок обновиться до свіжої версії?»
//
// 🔴 ВІДПОВІДЬ БУЛА «НІЯК», І ЦЕ Я ЗЛАМАВ ВЛАСНОЮ СТЕЛЕЮ. Доти станів було два:
// мережа відповіла (свіже) або впала (збій → `news.js` перезапитує при поверненні
// звʼязку, замовлення Вови 17.09). Стеля додала ТРЕТІЙ — «віддали копію і це
// УСПІХ» — а під нього не підвʼязано нічого: збою немає, отже перезапит не
// вмикається, отже новини лишались учорашніми до перезапуску застосунку.
//
// 🔑 SW ЗНАЄ ТЕ, ЧОГО НЕ ЗНАЄ СТОРІНКА: що віддав копію, і що потім приїхало
// інше. Доти він це знання викидав. Тепер каже двома повідомленнями:
//   • `sw-старе`    — «це збережена копія, знята тоді-то» (для позначки часу
//                      там, де несвіжість має ціну: автобуси, світло);
//   • `sw-оновлено` — «фонове оновлення принесло ІНШЕ» (сторінка вирішує, що з
//                      цим робити — підставити тихо чи показати пігулку).
//
// 🛑 «ПРИНЕСЛО ІНШЕ» ПЕРЕВІРЯЄМО, А НЕ ПРИПУСКАЄМО — інакше буде вічна петля:
// сторінка на звістку перезапитує файл → це знову мережа-перша → знову звістка.
// Тому порівнюємо мітку відповіді (`ETag` → `Last-Modified` → довжина) і мовчимо,
// коли вона та сама. Петлю ловить стенд окремою перевіркою.
const СПОВІЩАТИ_НЕ_ЧАСТІШЕ_МС = 10000;
const _останнєСповіщення = new Map();

function міткаВідповіді(resp) {
  if (!resp) return '';
  const h = resp.headers;
  return h.get('etag') || h.get('last-modified') || h.get('content-length') || '';
}

function сказатиСторінкам(дані) {
  const ключ = дані.__cstl + ' ' + дані.url;
  const тепер = Date.now();
  if (тепер - (_останнєСповіщення.get(ключ) || 0) < СПОВІЩАТИ_НЕ_ЧАСТІШЕ_МС) return;
  _останнєСповіщення.set(ключ, тепер);
  self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    .then(список => список.forEach(c => { try { c.postMessage(дані); } catch (_) {} }));
}

function мережаПершою(request, { звірити = false, колиПорожньо = null } = {}) {
  return caches.match(request).then(зКешу => {
    const булаМітка = міткаВідповіді(зКешу);

    // 🔴 24.09 — БУЛО `cache: 'reload'`, СТАЛО `'no-cache'`. Різниця в одному
    // слові й у сотнях кілобайтів на кожне відкриття. `reload` каже «не питай
    // кеш узагалі» — тобто браузер НЕ шле `If-None-Match`, і сервер фізично не
    // може відповісти «не змінилось». Наслідок: `bundle.js` (667 КБ) і
    // `style.min.css` качались ЦІЛКОМ щоразу, навіть коли не змінювались ні на
    // байт. `no-cache` теж ніколи не віддає копію без питання — свіжість та
    // сама, — але питає УМОВНО, і незмінений файл приїжджає як `304` без тіла.
    // 🔑 Що це не здогадка: вартовий `health-watch` заміряв на живому Pages —
    // `ETag`/`304` він віддає (23.09, записано в `NOW.md`).
    // 🛑 Проблема, заради якої стояв `reload`, лишається закритою: на iOS PWA
    // новий Service Worker активується із затримкою, і cache-first віддавав би
    // старий код. `no-cache` ходить у мережу щоразу — просто дешевше.
    const зМережі = fetch(request, звірити ? { cache: 'no-cache' } : undefined)
      .then(r => {
        // Кладемо в кеш НАВІТЬ якщо відповідь спізнилась і людина вже бачить копію:
        // у цьому й суть фонового оновлення.
        if (r.ok) {
          const копія = r.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, копія));
          // Мовчимо, якщо копії не було (нічого не підміняли) або мітка та сама.
          const сталаМітка = міткаВідповіді(r);
          if (зКешу && булаМітка && сталаМітка && булаМітка !== сталаМітка) {
            сказатиСторінкам({ __cstl: 'sw-оновлено', url: request.url });
          }
        }
        return r;
      });

    // Копії немає — чекати нема на що, віддаємо мережу як є.
    if (!зКешу) {
      return зМережі
        .catch(() => (колиПорожньо ? caches.match(колиПорожньо) : undefined))
        .then(r => r || new Response('', { status: 503 }));
    }

    const віддатиКопію = () => {
      сказатиСторінкам({
        __cstl: 'sw-старе', url: request.url,
        коли: зКешу.headers.get('date') || null,
      });
      return зКешу;
    };
    return Promise.race([
      зМережі.catch(віддатиКопію),
      new Promise(готово => setTimeout(() => готово(віддатиКопію()), МЕРЕЖА_ЧЕКАЄ_МС)),
    ]);
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // HTML-сторінки (index.html, корінь, навігаційні запити) — network-first
  // Критично для лічильника версії: завжди показуємо свіжий штамп часу деплою.
  // Fallback на кеш тільки якщо мережі немає.
  const isHTML = e.request.mode === 'navigate' ||
                 url.pathname === '/' ||
                 url.pathname.endsWith('/') ||
                 url.pathname.endsWith('/index.html');
  if (isHTML) {
    e.respondWith(мережаПершою(e.request, { колиПорожньо: './index.html' }));
    return;
  }

  // 🔴 Сторонні бібліотеки (`vendor/*`) — cache-first У ВЛАСНОМУ ВІЧНОМУ КЕШІ.
  // 🛑 Це не оптимізація, а виправлення справжньої вади: доти SDK Supabase вантажився з
  // чужого CDN, а сторонні запити нижче йдуть «тільки мережа». Один невдалий запит — і
  // застосунок лишався без бази до перезавантаження сторінки, ще й мовчки.
  // 🔑 Вміст за цією адресою незмінний (версія в імені), тому кеш можна не перевіряти.
  if (url.pathname.includes('/vendor/')) {
    e.respondWith(
      caches.open(VENDOR_CACHE).then(c => c.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(r => {
          if (r.ok) c.put(e.request, r.clone());
          return r;
        });
      }))
    );
    return;
  }

  // Файли даних (data/*.json) — network-first (завжди свіжі новини/розклад)
  if (url.pathname.includes('/data/')) {
    e.respondWith(мережаПершою(e.request));
    return;
  }

  // Зовнішні запити (погода, RSS і т.ін.) — тільки мережа
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(e.request).catch(() => new Response('', { status: 503 }))
    );
    return;
  }

  // Код застосунку (bundle.js + *.css) — network-first.
  // Чому: на iOS PWA новий Service Worker активується із затримкою (часто аж після
  // повного перезапуску), тому cache-first віддавав старий код навіть коли версія
  // (index.html) вже свіжа. Network-first тягне свіжий код щоразу коли є мережа,
  // а кеш лишається запасним для офлайну. Прибирає «застряглий старий вигляд».
  const isAppCode = url.pathname.endsWith('.css') || url.pathname.endsWith('bundle.js');
  if (isAppCode) {
    // `звірити` — умовний запит (`If-None-Match`): свіжість як була, а
    // незмінений файл не качається вдруге. Подробиці — у `мережаПершою`.
    e.respondWith(мережаПершою(e.request, { звірити: true }));
    return;
  }

  // Статичні файли (logo.png, manifest.json, images, тощо) — cache-first
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => new Response('', { status: 503 }));
      // ↑ Раніше повертав index.html — для <img> це HTML замість картинки → «биті» фото.
      //   Тепер порожня відповідь: браузер показує стандартний плейсхолдер, не сторінку.
    })
  );
});

// ── Push-сповіщення (Level B — справжні сповіщення навіть при закритому додатку) ──

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        // Повідомити ВІДКРИТИЙ додаток про push → оновити список розмов/бейдж наживо +
        // показати in-app банер (P-8). title/body/threadId/groupId — раніше форвардили
        // лише pushType, банер не мав чим себе заповнити.
        // Realtime-підписка буває пропускає нові треди між акаунтами; push — надійний.
        list.forEach(c => { try { c.postMessage({
          __cstl: 'push', pushType: data.type || null,
          title: data.title || '', body: data.body || '',
          threadId: data.thread_id ?? null, groupId: data.group_id ?? null,
          // url — deep-link (напр. на новий пост «Стрічки»). Потрібен in-app банеру:
          // при відкритому додатку системне сповіщення НЕ показуємо (нижче), тож без
          // банера користувач не дізнався б про новий пост узагалі.
          url: data.url || null,
        }); } catch (_) {} });
        // App is in foreground — skip system notification, in-app banner handles it
        if (list.some(c => c.visibilityState === 'visible')) return;
        return self.registration.showNotification(data.title || 'CSTL LIFE', {
          body:               data.body  || '',
          icon:               './logo.png',
          badge:              './logo.png',
          tag:                data.tag   || 'bus-push',
          // threadId/groupId (P-9) — щоб клік по пуші відкрив САМЕ цю розмову, не просто застосунок.
          data:               {
            url: data.url || (data.type === 'chat' ? './' : './#buses'),
            threadId: data.thread_id ?? null, groupId: data.group_id ?? null,
          },
          requireInteraction: false,
        });
      })
  );
});

// ── Ротація push-підписки (16.08) ────────────────────────────────────────────
//
// 🔴 ЩО ЛІКУЄ. Браузер періодично перевипускає push-підписку (оновлення застосунку,
// чистка даних, службова ротація). Старий `endpoint` після цього мертвий: сервер
// отримає `410` і видалить рядок — а людина далі бачить увімкнений дзвіночок і
// **не отримує ЖОДНОГО сповіщення**. Мовчазна відмова, яку помічають на зупинці.
//
// 🔑 Тут ми лише ПЕРЕОФОРМЛЯЄМО підписку і будимо застосунок. Записати новий
// endpoint у базу Service Worker НЕ може: рядки захищені RLS (`user_uuid =
// auth.uid()`), а в SW немає сесії людини — тільки публічний ключ. Тому перенос
// робить сам застосунок під своєю сесією (`healPushEndpoint()` у `core/push.js`),
// а ми передаємо йому обидві адреси.
// ⚠️ Якщо жодної вкладки не відкрито, повідомлення нікому не дійде — тому
// `healPushEndpoint()` НЕ покладається на нього, а ще й звіряє адресу при кожному
// старті. Ця подія лише прискорює лікування, коли застосунок відкритий.
const SW_VAPID_KEY = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';

function swUrlBase64ToUint8Array(b64) {
  const pad  = '='.repeat((4 - b64.length % 4) % 4);
  const base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw  = atob(base);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

self.addEventListener('pushsubscriptionchange', e => {
  const oldEndpoint = e.oldSubscription?.endpoint || null;
  e.waitUntil((async () => {
    try {
      const sub = e.newSubscription || await self.registration.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: swUrlBase64ToUint8Array(SW_VAPID_KEY),
      });
      if (!sub) return;
      const j = sub.toJSON();
      const list = await clients.matchAll({ type: 'window', includeUncontrolled: true });
      list.forEach(c => { try { c.postMessage({
        __cstl: 'push-endpoint-changed',
        oldEndpoint,
        endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth_key: j.keys?.auth,
      }); } catch (_) {} });
    } catch (err) {
      console.warn('[sw] pushsubscriptionchange:', err && err.message);
    }
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const { threadId, groupId, url } = e.notification.data || {};
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(list => {
        // Застосунок уже відкритий — фокусуємо і кажемо йому відкрити САМЕ цю розмову
        // (P-9: раніше просто фокусувало, thread_id ігнорувався).
        for (const c of list) {
          if ('focus' in c) {
            if (threadId != null || groupId != null || url) {
              // url — deep-link на конкретний елемент (#/post/feed/<id> тощо). Раніше
              // при ВІДКРИТОМУ додатку він ігнорувався: тап по сповіщенню про новий
              // пост лише фокусував вікно і лишав користувача там, де він був.
              try { c.postMessage({ __cstl: 'notif-click', threadId, groupId, url }); } catch (_) {}
            }
            return c.focus();
          }
        }
        // Холодний старт — передаємо thread_id через hash (як #/join/<uuid> для інвайтів),
        // app.js підхопить після завантаження.
        const coldUrl = threadId != null ? `./#/thread/${threadId}` : (url || './');
        return clients.openWindow(coldUrl);
      })
  );
});
