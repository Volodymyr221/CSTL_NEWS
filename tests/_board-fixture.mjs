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

// 🔴 26.08 — ДВА ШЛЯХИ, А НЕ ОДИН. SDK переїхав із чужого CDN у нашу теку `vendor/`,
// і заглушка, прибита до старої адреси, мовчки перестала спрацьовувати: на сторінку
// приїжджав СПРАВЖНІЙ клієнт, підробленої бази не було, і півсотні перевірок у десятку
// стендів почервоніли разом.
// 🔑 Тримаємо обидві адреси навмисно: контрольні прогони (`BUNDLE_REV=origin/main`)
// піднімають стару розмітку, де ще стоїть CDN, і без цього вони перестали б працювати.
const SDK_ШЛЯХИ = [
  '**://cdn.jsdelivr.net/npm/@supabase/supabase-js**',
  '**/vendor/supabase-js*',
];

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
  await Promise.all(SDK_ШЛЯХИ.map(шлях => page.route(шлях, r => r.fulfill({
    contentType: 'application/javascript',
    body: `(() => {
      // 🔑 22.08 — таблиці лежать на window, а не в замиканні: стенд мусить уміти
      // ДОДАТИ рядок посеред прогону, щоб відтворити «хтось щойно написав, поки я
      // дивлюсь на екран». Той самий прийом, що вже зроблено для __cstlProfiles.
      window.__cstlTables = ${JSON.stringify(tables)};
      const T = window.__cstlTables;
      const U = ${JSON.stringify(user)};
      const SESSION = U ? { user: U } : null;
      // 🆕 07.08 (B-30): { назваТаблиці: мс } — відповідь приходить ПІЗНО.
      // Живий телефон майже ніколи не встигає віддати все до першого рендера, і
      // саме «пізня» відповідь відкриває гілки коду, яких миттєва заглушка не
      // торкається взагалі. B-30 сидів рівно в такій гілці.
      const SLOW = ${JSON.stringify(opts.slow || {})};
      // Профілі живуть на window — щоб стенд міг їх ЗМІНИТИ під час прогону.
      window.__cstlProfiles = ${JSON.stringify(opts.profiles || [])};
      // Ланцюжок .select().eq().order().limit() має повертати САМ СЕБЕ, а в
      // кінці бути "thenable" — саме так поводиться справжній конструктор
      // запитів supabase-js, і саме тому await працює на будь-якій ланці.
      // 🔴 07.08 — ЗАГЛУШКА ТЕПЕР СПРАВДІ ФІЛЬТРУЄ по .eq() і .neq().
      //
      // Було: усі фільтри — порожні заглушки, тобто на будь-який запит
      // поверталась УСЯ таблиця. Наслідок побачив стенд board-owner: він
      // повідомив, що в «Моїх оголошеннях» видно ЧУЖЕ оголошення. Насправді
      // fetchMyPosts фільтрує на СЕРВЕРІ (.eq owner_uid), і застосунок цілком
      // правий — брехала заглушка. Це правило проєкту номер один: якщо перевірка
      // завалила те, що вже працює, першою підозрюваною є перевірка.
      //
      // ⚠️ .or() лишається заглушкою свідомо: емулювати мову фільтрів PostgREST
      // тут означало б писати другу базу. Стенди, яким потрібен .or (напр. свої
      // треди), мусять давати фікстуру, вже звужену під сцену.
      // Лічильник звернень по таблицях: { posts: 3, threads: 1 }. Стенди ним
      // міряють «чи сходив застосунок у базу» — напр. чи справді сталося легке
      // оновлення при тапі по активній вкладці. Рахуємо в момент ОЧІКУВАННЯ
      // відповіді, а не створення ланцюжка: сам ланцюжок міг і не дійти до await.
      window.__cstlQueries = window.__cstlQueries || {};
      const q = (table) => {
        const умови = [];
        // 🔴 17.08 — .single()/.maybeSingle() ТЕПЕР ВІДДАЮТЬ ОДИН РЯДОК, а не масив.
        // Було: обидва — порожні заглушки, тобто на .maybeSingle() приходив
        // МАСИВ. Справжня supabase-js віддає обʼєкт (або null), і код, який
        // пише data.settlement, мовчки читав undefined у полі масиву. Найшло це
        // не читання коду, а стенд капсул: село з анкети не доїжджало ніколи, і
        // винен був не застосунок, а заглушка. Та сама хвороба, що з .eq 07.08.
        let один = false;
        const self = {
          then(res) {
            window.__cstlQueries[table] = (window.__cstlQueries[table] || 0) + 1;
            let рядки = T[table] || [];
            // 🔴 25.08 — RLS ЕМУЛЮЄТЬСЯ ЧЕСНО ДЛЯ МʼЯКОГО ВИДАЛЕННЯ.
            // У базі політика 'posts read' вимагає deleted_at is null, а
            // post_visible(post_id) переносить це на дочірні таблиці. Якби
            // заглушка віддавала видалений рядок, стенд зеленів би над
            // застосунком, що показує видалене питання, — і саме таку діру я
            // сьогодні знайшов у САМІЙ БАЗІ (відповіді видаленого питання
            // читались далі). Заглушка не сміє бути добрішою за прод.
            if (table === 'posts') рядки = рядки.filter(r => !r.deleted_at);
            if (table === 'comments' || table === 'reactions') {
              const живі = new Set((T.posts || []).filter(r => !r.deleted_at).map(r => String(r.id)));
              рядки = рядки.filter(r => r.post_id == null || живі.has(String(r.post_id)));
            }
            for (const c of умови) {
              if (c.порожнє) { рядки = рядки.filter(r => r[c.поле] == null); continue; }
              if (c.набір) { рядки = рядки.filter(r => c.значення.includes(r[c.поле])); continue; }
              if (c.межа) {
                рядки = рядки.filter(r => {
                  const a = r[c.поле], b = c.значення;
                  if (a == null) return false;
                  // Дати приходять рядками ISO — вони лексикографічно впорядковані,
                  // тож те саме порівняння працює і для чисел, і для часу.
                  return c.межа === 'gt' ? a > b : a < b;
                });
                continue;
              }
              рядки = рядки.filter(r => c.не ? r[c.поле] !== c.значення : r[c.поле] === c.значення);
            }
            const payload = { data: один ? (рядки[0] || null) : рядки, error: null };
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
        for (const m of ['select','not','order','limit','range',
                         'filter','or','gte','lte','like','ilike','contains',
                         'upsert','update','delete','match','abortSignal','returns'])
          self[m] = () => self;
        // 🔴 22.08 — ВСТАВКИ ТЕПЕР ВИДНО СТЕНДУ. Було: insert() — порожня
        // заглушка, тобто ЩО САМЕ застосунок пише в базу, не міг перевірити
        // ніхто. Через це не було чим довести, що діагностика збоїв справді
        // ДОЛІТАЄ, — а перевірити «чи стоїть слухач помилок» означало б знову
        // міряти форму запису замість наслідку.
        // 🔑 Пишемо в ОКРЕМИЙ журнал, а не в таблиці: поведінка читання лишається
        // байт-у-байт такою, як була, тож жоден із наявних стендів не змінює
        // сенсу від цієї правки.
        window.__cstlInserted = window.__cstlInserted || [];
        self.insert = (рядок) => {
          try { window.__cstlInserted.push({ table, row: рядок }); } catch (_) {}
          return self;
        };
        self.single = self.maybeSingle = () => { один = true; return self; };
        // Ці два справді звужують набір (див. пояснення вище).
        // 🔴 04.09 — .is(поле, null) ТЕПЕР СПРАВДІ ФІЛЬТРУЄ.
        // Було: 'is' стояв у списку мовчазних заглушок, тобто будь-який
        // .is('event_date', null) чи .is('deleted_at', null) заглушка
        // ІГНОРУВАЛА і віддавала все. Знайдено рівно так, як велить правило
        // проєкту «спершу перевір прилад»: нова перевірка «подія не потрапляє у
        // віджет стрічки» червоніла над ПРАВИЛЬНИМ застосунком — фільтр стояв на
        // сервері, а заглушка була добрішою за прод.
        // (зворотні лапки тут заборонені: увесь блок лежить у шаблонному рядку)
        // ⚠️ Порожнє поле у фікстурі — це undefined, а в базі null; для
        // is null це та сама відповідь, тому порівнюємо через == null.
        self.is  = (поле, значення) => {
          if (значення === null) умови.push({ порожнє: true, поле });
          return self;
        };
        self.eq  = (поле, значення) => { умови.push({ поле, значення, не: false }); return self; };
        self.neq = (поле, значення) => { умови.push({ поле, значення, не: true  }); return self; };
        // 🔴 22.08 — .in() ТЕЖ СПРАВДІ ЗВУЖУЄ. Було порожньою заглушкою, тобто
        // запит «коментарі під ОЦИМИ дописами» повертав коментарі під УСІМА, і
        // сцена, що доводить «чуже не рахується», зеленіла б над зламаним
        // фільтром. Третій випадок тієї самої хвороби (.eq 07.08, .single 17.08):
        // брехала не логіка застосунку, а заглушка під нею.
        self.in  = (поле, значення) => {
          умови.push({ поле, значення: значення || [], набір: true }); return self;
        };
        // 🔴 22.08 — .gt()/.lt() ТЕЖ ЗВУЖУЮТЬ. Знайдено падінням: сцена «перший
        // запуск застосунку» показувала капсулу про коментарі, яких людина не
        // пропускала. Виглядало це як вада в капсулі, а насправді запит «новіші за
        // мій візит» фільтрує на СЕРВЕРІ, і заглушка мовчки віддавала весь архів.
        // 🛑 Тобто без цих двох рядків будь-яка перевірка «що вважається новим»
        // міряла б не те, що робить застосунок.
        self.gt  = (поле, значення) => { умови.push({ поле, значення, межа: 'gt' }); return self; };
        self.lt  = (поле, значення) => { умови.push({ поле, значення, межа: 'lt' }); return self; };
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
          // 🆕 07.08 (потік «Живе оновлення») — RPC профілів справді відповідає.
          // Було: на БУДЬ-ЯКИЙ виклик поверталось data: null. Тобто get_avatars
          // мовчки віддавав нічого, кеш імен не заповнювався, і будь-який стенд
          // бачив лише вморожені імена. Весь механізм живих імен і фото не був
          // покритий ЖОДНОЮ перевіркою — саме там і жив баг.
          //
          // 🔑 window.__cstlProfiles НАВМИСНО мутабельний: стенд міняє його
          // прямо посеред прогону, і це відтворює головну сцену Вови — інша
          // людина змінила імʼя та фото, поки мій застосунок відкритий.
          // (зворотні лапки в цьому блоці заборонені: він у шаблонному рядку)
          rpc: async (fn, args) => {
            // Журнал імен викликаних RPC. Додано 14.08 для стенда правових
            // документів: там треба довести, що кнопка «Видалити акаунт»
            // справді доходить до бази, а не лише малює модалку.
            (window.__cstlRpcNames = window.__cstlRpcNames || []).push(fn);
            const all = window.__cstlProfiles || [];
            if (fn === 'get_avatars') {
              // Лічильник походів у базу — стенд ним міряє антифлуд.
              window.__cstlRpcCalls = (window.__cstlRpcCalls || 0) + 1;
              const want = (args && args.uids) || [];
              return { data: all.filter(r => want.includes(r.uid)), error: null };
            }
            if (fn === 'get_public_profile') {
              const u = args && args.p_uid;
              return { data: all.filter(r => r.uid === u), error: null };
            }
            // 🔴 24.08 — МІТКИ «БАЧИВ». Заглушка мусить емулювати їх ЧЕСНО, бо
            // головне правило живе саме тут: мітка рухається ТІЛЬКИ ВПЕРЕД
            // (у базі це greatest). Якби тут стояв простий запис, стенд зеленів
            // би над реалізацією, що дозволяє відкотити мітку назад — тобто над
            // рівно тією вадою, від якої вся ця робота.
            // ⚠️ Пишемо В ТАБЛИЦЮ, а не в окреме сховище: читання йде через
            // .from('user_seen_marks'), і два різні сховища розійшлись би.
            if (fn === 'mark_seen' || fn === 'seed_seen') {
              const uid = U ? U.id : null;
              if (!uid) return { data: null, error: { message: 'not authenticated' } };
              const now = Date.now();
              const want = fn === 'seed_seen'
                ? Math.min(Date.parse(args.p_seen_at) || 0, now)   // стеля now(), як у базі
                : now;
              T.user_seen_marks = T.user_seen_marks || [];
              const row = T.user_seen_marks.find(r => r.uid === uid && r.scope === args.p_scope);
              const next = Math.max(row ? Date.parse(row.seen_at) || 0 : 0, want);
              if (row) row.seen_at = new Date(next).toISOString();
              else T.user_seen_marks.push({ uid, scope: args.p_scope, seen_at: new Date(next).toISOString() });
              return { data: new Date(next).toISOString(), error: null };
            }
            if (fn === 'mark_thread_seen') {
              const uid = U ? U.id : null;
              if (!uid) return { data: null, error: { message: 'not authenticated' } };
              T.user_seen_threads = T.user_seen_threads || [];
              const row = T.user_seen_threads.find(r => r.uid === uid && r.post_id === args.p_post_id);
              const next = Math.max(row ? Date.parse(row.seen_at) || 0 : 0, Date.now());
              if (row) row.seen_at = new Date(next).toISOString();
              else T.user_seen_threads.push({ uid, post_id: args.p_post_id, seen_at: new Date(next).toISOString() });
              return { data: new Date(next).toISOString(), error: null };
            }
            // 🆕 25.08 — РЕДАГУВАННЯ Й ВИДАЛЕННЯ ВЛАСНОГО ПИТАННЯ.
            // 🛑 Емулюємо СЕРВЕРНІ ПЕРЕВІРКИ, а не лише щасливий шлях. Справжні
            // update_question / delete_question відмовляють чужому, не-питанню
            // і порожньому тексту — якби заглушка мовчки погоджувалась на все,
            // стенд зеленів би над клієнтом, що надсилає будь-що. Той самий
            // урок, що з .eq / .single / .in: брехала не логіка застосунку, а
            // заглушка під нею.
            if (fn === 'update_question' || fn === 'delete_question') {
              const uid = U ? U.id : null;
              if (!uid) return { data: { ok: false, error: 'Треба увійти' }, error: null };
              const row = (T.posts || []).find(r => String(r.id) === String(args.p_id));
              if (!row) return { data: { ok: false, error: 'Питання не знайдено' }, error: null };
              if (row.owner_uid !== uid) return { data: { ok: false, error: 'Це не ваше питання' }, error: null };
              if ((row.type || 'board') !== 'chat') return { data: { ok: false, error: 'Це не питання' }, error: null };
              if (row.deleted_at) {
                return fn === 'delete_question'
                  ? { data: { ok: true, already: true }, error: null }
                  : { data: { ok: false, error: 'Питання вже видалене' }, error: null };
              }
              if (fn === 'delete_question') {
                row.deleted_at = new Date().toISOString();
                return { data: { ok: true }, error: null };
              }
              const txt = String(args.p_text == null ? '' : args.p_text).trim();
              if (!txt) return { data: { ok: false, error: 'Порожнє питання' }, error: null };
              row.text = txt;
              row.edited_at = new Date().toISOString();
              return { data: { ok: true, edited_at: row.edited_at }, error: null };
            }
            return { data: null, error: null };
          },
          storage: { from: () => ({
            upload: async () => ({ data: null, error: null }),
            getPublicUrl: () => ({ data: { publicUrl: '' } }),
          }) },
        }),
      };
    })();`,
  }))));

  // 2. Самі REST-запити нікуди не підуть (клієнт підроблений), але як другий
  //    рубіж лишаємо порожню відповідь — щоб випадковий `fetch` повз клієнта не
  //    висів на таймауті і не робив стенд повільним та плаваючим.
  await page.route('**://*.supabase.co/**', r => r.fulfill({
    status: 200, contentType: 'application/json', body: '[]',
  }));
}
