// tests/_board-fixture.mjs — ПІДРОБЛЕНА БАЗА ДЛЯ СТЕНДІВ ДОШКИ.
//
// 🔴 НАВІЩО ЦЕ ЗʼЯВИЛОСЬ (аудит 05.08).
// Чотири стенди Дошки (`board-card-row`, `board-rules`, `ad-nophoto`,
// `ad-sheet-swipe`) мали ВЛАСНІ дані і підміняли їх так:
//     p.route('**/data/community-board.json*', …)
// тобто вкидали фікстуру через ШЛЯХ ДЕМО-ФОЛБЕКУ застосунку. Дані були їхні
// власні — але дорога, якою вони потрапляли на екран, існувала лише тому, що
// при недоступній базі Дошка мовчки малювала демо-оголошення з вигаданими
// телефонами. Фолбек прибрали (він показував ті номери живим людям при збої
// мережі) — і всі чотири стенди впали.
//
// 🔑 Урок не про фолбек, а про стенди: **підміняти треба те, чим застосунок
// користується НАСПРАВДІ**, а не запасний шлях, який колись існував. Інакше
// перевірка тримається на побічному ефекті й падає від чужої зміни.
//
// 🔑 ЧОМУ ПІДМІНЯЄМО САМУ БІБЛІОТЕКУ, А НЕ REST-ЗАПИТИ.
// `src/core/supabase.js` створює клієнт лише якщо існує `window.supabase`, яка
// приходить окремим тегом із CDN. У пісочниці CDN недосяжний, тож клієнта немає
// зовсім і жоден REST-запит навіть не вирушає — перехоплювати нічого. Тому
// заглушка встає РАНІШЕ: віддає власну `window.supabase` замість скрипта CDN.
// Застосунок при цьому не знає, що база підроблена: він викликає ті самі
// `.from().select().eq().order().limit()`.
//
// ⚠️ Демо-файл `data/community-board.json` ВИДАЛЕНО з репозиторію: після цієї
// зміни його не читав ні застосунок, ні стенди (у кожного свій `POSTS`), а
// вигадані телефони в теці даних лишати не варто навіть мертвими.

const CDN = '**://cdn.jsdelivr.net/npm/@supabase/supabase-js**';

/**
 * Ставить підроблену базу на сторінку.
 * @param page      сторінка Playwright (route ще НЕ має бути перехоплений)
 * @param tables    { posts: [...], announcements: [...], ... } — що віддавати
 * @param opts      { user } — 🆕 07.08: підроблений ЗАЛОГІНЕНИЙ житель.
 *
 * 🔑 Навіщо `user` (баг B-30). Половина Дошки живе за `isLoggedIn()`, і поки
 * заглушка вміла лише «ніхто не ввійшов», жоден стенд не міг доторкнутись до
 * цієї половини — зокрема до входу в листування. Саме там і сидів B-30: пункт
 * «Повідомлення» мовчки не відкривався, а всі 46 стендів були зелені.
 * ⚠️ За замовчуванням `user` = null, тобто чотири наявні стенди Дошки бачать
 * рівно те, що бачили (публічний вигляд) — фікстура розширена, не змінена.
 */
export async function mockSupabase(page, tables = {}, opts = {}) {
  const user = opts.user || null;
  // 1. Замість бібліотеки з CDN — крихітна заглушка з тим самим інтерфейсом.
  await page.route(CDN, r => r.fulfill({
    contentType: 'application/javascript',
    body: `(() => {
      const T = ${JSON.stringify(tables)};
      const U = ${JSON.stringify(user)};
      const SESSION = U ? { user: U } : null;
      // 🆕 07.08 (B-30): { назваТаблиці: мс } — відповідь приходить ПІЗНО.
      // Живий телефон майже ніколи не встигає віддати все до першого рендера, і
      // саме «пізня» відповідь відкриває гілки коду, яких миттєва заглушка не
      // торкається взагалі. B-30 сидів рівно в такій гілці.
      const SLOW = ${JSON.stringify(opts.slow || {})};
      // Ланцюжок .select().eq().order().limit() має повертати САМ СЕБЕ, а в
      // кінці бути "thenable" — саме так поводиться справжній конструктор
      // запитів supabase-js, і саме тому await працює на будь-якій ланці.
      const q = (table) => {
        const self = {
          then(res) {
            const payload = { data: T[table] || [], error: null };
            const ms = SLOW[table] || 0;
            const pr = ms
              ? new Promise(r => setTimeout(() => r(payload), ms))
              : Promise.resolve(payload);
            return pr.then(res);
          },
        };
        // Читання і ЗАПИС однаково повертають ланцюжок: застосунок пише
        // аналітику (logEvent -> insert) на кожному перемиканні вкладки,
        // (зворотні лапки тут заборонені: увесь блок лежить у шаблонному рядку)
        // і без цих методів стенд падав ще до першої перевірки.
        // ⚠️ 07.08: доданий 'not' — без нього fetchUnreadByThread падав із
        // «.not is not a function», ланцюг рвався і розмови не приїжджали ЗОВСІМ.
        // Тобто заглушка мовчки відрізала половину сцени; список тримати повним.
        for (const m of ['select','eq','neq','in','is','not','order','limit','range','single','maybeSingle',
                         'filter','or','gt','lt','gte','lte','like','ilike','contains',
                         'insert','upsert','update','delete','match','abortSignal','returns'])
          self[m] = () => self;
        return self;
      };
      window.supabase = {
        createClient: () => ({
          from: q,
          // Без opts.user — ніхто не залогінений (публічний вигляд Дошки, як було).
          auth: {
            getSession: async () => ({ data: { session: SESSION }, error: null }),
            getUser:    async () => ({ data: { user: U }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            signInWithOAuth: async () => ({ data: null, error: null }),
            signOut: async () => ({ error: null }),
          },
          // Живі підписки стендам не потрібні, але код їх викликає.
          channel: () => ({ on() { return this; }, subscribe() { return this; }, unsubscribe() {} }),
          removeChannel: () => {},
          rpc: async () => ({ data: null, error: null }),
          storage: { from: () => ({
            upload: async () => ({ data: null, error: null }),
            getPublicUrl: () => ({ data: { publicUrl: '' } }),
          }) },
        }),
      };
    })();`,
  }));

  // 2. Самі REST-запити нікуди не підуть (клієнт підроблений), але як другий
  //    рубіж лишаємо порожню відповідь — щоб випадковий `fetch` повз клієнта не
  //    висів на таймауті і не робив стенд повільним та плаваючим.
  await page.route('**://*.supabase.co/**', r => r.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
}
