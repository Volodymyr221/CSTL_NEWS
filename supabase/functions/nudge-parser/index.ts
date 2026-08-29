// supabase/functions/nudge-parser/index.ts
//
// БУДИТЬ ПАРСЕР НОВИН У GITHUB. Кличе РОЗКЛАД (`pg_cron`), не людина.
//
// 🔴 НАВІЩО. Розклад GitHub Actions працює «за можливості», і в цьому репозиторії
// він деградував. 📐 Заміряно 29.08 по 30 останніх прогонах `rss-parser`:
// просимо 48 запусків на добу (`0,30 * * * *`) — отримуємо **8.6**. Медіана між
// прогонами **70 хв**, найбільша діра **733 хв (12 годин)**.
// 🔑 І це саме ПОГІРШЕННЯ, а не «так було завжди»: до 26.08 14:37 медіана була
// **55 хв**, тобто «раз на годину» працювало. Після — 120…733 хв.
//
// 🛑 РОЗВЕДЕННЯ ХВИЛИН НЕ ЛІКУЄ, і це вже перевірено на собі: 28.08 ми зсунули
// `cms-sync` на `7,22,37,52`, і за розкладом у нього досі 10 прогонів із 30 —
// живе він на події `push`. Тому другий раз той самий засіб не пробуємо.
//
// 🔑 РІШЕННЯ — ПЕРЕНЕСТИ РОЗКЛАД ТУДИ, ДЕ ВІН НАДІЙНИЙ. `pg_cron` у Supabase
// возить `send-bus-push` **щохвилини** і не пропускає; це той самий інструмент,
// тільки чужа черга його не топить.
//
// 🛑 ЩО САМЕ МОЖНА БУДИТИ — ВПИСАНО В КОД, а не приймається із запиту.
// Інакше той, хто дістався б секрету, запускав би БУДЬ-ЯКИЙ наш воркфлов —
// зокрема деплой чи бекап бази. Те саме рішення вже стоїть у `publish-now`.
//
// 🔑 ДВА РУБЕЖІ, як у `send-unanswered-push`: `verify_jwt` (ключ проєкту) —
// перший, спільний секрет `x-cstl-push-secret` — ДРУГИЙ, а не заміна першого.
//
// ⚠️ Відповідає ЧЕСНОЮ причиною, а не мовчить. Урок 28.08: кабінет ковтав
// `{nudged:false}` і показував «виходить за 1-2 хв», поки насправді не виходило
// нічого. Мовчазна відмова — найдорожчий вид відмови.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
// Той самий секрет, що вже живить `publish-now` — fine-grained PAT з правом
// «Actions: Read and write» РІВНО на цей репозиторій.
const GITHUB_TOKEN = Deno.env.get('GITHUB_DISPATCH_TOKEN') || '';

const REPO     = 'Volodymyr221/CSTL_NEWS';
const WORKFLOW = 'rss-parser.yml';   // 🛑 не параметр. Див. шапку.
const REF      = 'main';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cstl-push-secret',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const secretHeader = req.headers.get('x-cstl-push-secret') || '';
    if (!secretHeader) return json({ nudged: false, reason: 'no secret' }, 401);
    const { data: row } = await admin
      .from('app_secrets').select('value').eq('name', 'page_push_secret').maybeSingle();
    if (!row?.value || row.value !== secretHeader) {
      return json({ nudged: false, reason: 'bad secret' }, 401);
    }

    if (!GITHUB_TOKEN) {
      // Кажемо ВГОЛОС і з адресою, де це лікується.
      return json({
        nudged: false,
        reason: 'Немає секрету GITHUB_DISPATCH_TOKEN. Supabase → Edge Functions '
              + '→ Secrets → додати токен GitHub із правом «Actions: Read and write».',
      }, 503);
    }

    const res = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Accept':               'application/vnd.github+json',
          'Authorization':        `Bearer ${GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type':         'application/json',
          'User-Agent':           'cstl-nudge-parser',
        },
        body: JSON.stringify({ ref: REF }),
      },
    );

    // GitHub на успіх віддає 204 БЕЗ тіла — тобто «порожньо» тут це успіх,
    // і плутати його з мовчазним провалом не можна.
    if (res.status === 204) return json({ nudged: true, workflow: WORKFLOW });

    const text = (await res.text()).slice(0, 400);
    return json({ nudged: false, reason: `github ${res.status}: ${text}` }, 502);
  } catch (e) {
    return json({ nudged: false, reason: String(e) }, 500);
  }
});
