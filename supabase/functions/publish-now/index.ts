// supabase/functions/publish-now/index.ts
// Edge Function: «опублікував у кабінеті — стаття виходить одразу».
//
// 🔴 ЗАВЕДЕНО 28.08.2026 — ЦЕ ЗАМІНА ОПИТУВАННЯ ЧЕРГИ, А НЕ ПРИСКОРЕННЯ ЙОГО.
// 📐 Заміряно через GitHub API: розклад `cms-sync` просив 288 прогонів на добу, а
// давав ТРИ (27.08 о 05:07 і 16:27, 28.08 о 01:03). Тобто «стаття зʼявиться за
// 5 хвилин» означало 8-11 годин. 28.08 частоту знизили до `*/15` — це зробило
// обіцянку чесною, але не швидкою.
// 🔑 Правильний інструмент інший: публікація має ШТОВХАТИ синк. Кабінет кличе цю
// функцію, вона будить воркфлов — і стаття виходить за хвилину-дві.
//
// 🛑 ЧОМУ НЕ З БРАУЗЕРА НАПРЯМУ. Щоб розбудити воркфлов, потрібен токен GitHub із
// правом `actions: write`. У браузері він був би видимий будь-кому, хто відкриє
// devtools, — тобто ми віддали б чужій людині право запускати наші воркфлови.
// Тут токен лишається на сервері й назовні не виходить НІКОЛИ.
//
// 🔑 ГЕЙТ — ТА САМА ФУНКЦІЯ, ЩО В RLS: `has_editor_perm('publish')`, викликана ВІД
// ІМЕНІ людини (її JWT). Другої копії правила «кому можна публікувати» не заводимо:
// саме дві копії одного правила вже розходились у цьому проєкті (списки антиспаму).
// ⚠️ Відкликаний редактор (`disabled_at`) не пройде — це перевіряє сама функція бази.
//
// 🛑 ЩО САМЕ МОЖНА РОЗБУДИТИ — ВПИСАНО В КОД, А НЕ ПРИЙМАЄТЬСЯ З ЗАПИТУ. Інакше
// будь-хто з правом публікації міг би запустити БУДЬ-ЯКИЙ наш воркфлов, зокрема
// деплой чи бекап. Тіло запиту ми не читаємо взагалі.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
// Токен GitHub (fine-grained PAT, доступ лише до цього репозиторію, право
// «Actions: Read and write»). Кладеться в секрети функцій Supabase.
const GITHUB_TOKEN = Deno.env.get('GITHUB_DISPATCH_TOKEN') || '';

const REPO     = 'Volodymyr221/CSTL_NEWS';
const WORKFLOW = 'cms-sync.yml';
const REF      = 'main';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...cors, 'Content-Type': 'application/json' },
  });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    if (!jwt) return json({ nudged: false, reason: 'no auth' }, 401);

    // Клієнт від ІМЕНІ людини: `has_editor_perm` читає `auth.uid()` з її JWT.
    // Під `service_role` жодного uid немає, і гейт чесно відмовив би всім.
    const asUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: можна, error: permErr } = await asUser.rpc('has_editor_perm', { p: 'publish' });
    if (permErr) return json({ nudged: false, reason: 'perm check failed' }, 500);
    if (можна !== true) return json({ nudged: false, reason: 'not allowed' }, 403);

    // 🔑 Текст помилки — ІНСТРУКЦІЯ, а не діагноз: без цього рядка наступна людина
    // побачила б «нічого не сталось» і пішла шукати ваду в коді.
    if (!GITHUB_TOKEN) {
      return json({
        nudged: false,
        reason: 'Немає секрету GITHUB_DISPATCH_TOKEN. Supabase → Edge Functions → '
              + 'Secrets: додати fine-grained токен GitHub із правом «Actions: '
              + 'Read and write» на репозиторій CSTL_NEWS. Доти стаття вийде за розкладом.',
      }, 503);
    }

    const r = await fetch(
      `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'cstl-life-publish-now',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ref: REF }),
      },
    );

    // GitHub на успіх віддає 204 БЕЗ тіла — читати його не треба.
    if (r.status === 204) return json({ nudged: true });

    const текст = await r.text().catch(() => '');
    // ⚠️ Не ковтаємо мовчки: 401/403 тут означає протермінований або обрізаний
    // токен, і про це має бути видно в журналі функції, а не «просто повільно».
    console.error(`[publish-now] GitHub ${r.status}: ${текст.slice(0, 300)}`);
    return json({ nudged: false, reason: `github ${r.status}` }, 502);
  } catch (e) {
    console.error('[publish-now]', e);
    return json({ nudged: false, reason: 'error' }, 500);
  }
});
