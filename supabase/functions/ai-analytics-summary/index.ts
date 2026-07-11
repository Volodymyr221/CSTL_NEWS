// supabase/functions/ai-analytics-summary/index.ts
// Edge Function: AI-висновок статистики (Потік 2, byyou) — по кнопці «Оновити
// статистику» в admin.html, НЕ за розкладом (cron) — економія: платиш лише
// коли реально дивишся, не щодня/щогодини.
//
// Викликається клієнтом (admin.html, залогінений адмін):
//   supa.functions.invoke('ai-analytics-summary')
// verify_jwt = true → JWT викликача в запиті; перевіряємо що це справді
// адмін (та сама таблиця admins що is_admin() у БД) — інакше будь-хто
// залогінений міг би смітити платні виклики Claude API.
//
// Агрегати рахуємо ТУТ (service_role), НЕ довіряємо клієнтському payload —
// щоб ніхто не роздув запит фейковими цифрами/довгим текстом.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANTHROPIC_API_KEY         = Deno.env.get('ANTHROPIC_API_KEY')!;
const MODEL = 'claude-sonnet-5';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '');
    if (!jwt) return json({ error: 'no auth' }, 401);

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: 'bad token' }, 401);

    // Гейт: лише адмін (не будь-який залогінений) — платні виклики Claude.
    const { data: adminRow } = await admin
      .from('admins').select('email').eq('email', caller.email).maybeSingle();
    if (!adminRow) return json({ error: 'not admin' }, 403);

    if (!ANTHROPIC_API_KEY) {
      return json({ error: 'ANTHROPIC_API_KEY не налаштовано в Supabase secrets' }, 500);
    }

    // Агрегати за 7 днів — той самий розріз що admin.html renderAnalytics(),
    // рахуємо незалежно (service_role), не довіряємо клієнту.
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data: events } = await admin
      .from('analytics_events')
      .select('visitor_id, event_type, tab, meta, created_at')
      .gte('created_at', since)
      .limit(20000);
    const rows = events || [];
    const uniqueVisitors = new Set(rows.map((r: any) => r.visitor_id)).size;
    const byTab: Record<string, number> = {};
    const byDevice: Record<string, number> = {};
    let pwaInstalls = 0;
    for (const r of rows) {
      if (r.event_type === 'tab_view' && r.tab) byTab[r.tab] = (byTab[r.tab] || 0) + 1;
      if (r.event_type === 'pwa_install') pwaInstalls++;
      const device = r.meta?.device;
      if (device) byDevice[device] = (byDevice[device] || 0) + 1;
    }
    const { data: profStats } = await admin.rpc('admin_profile_stats');

    const summary = {
      period: '7 днів',
      total_events: rows.length,
      unique_visitors: uniqueVisitors,
      pwa_installs: pwaInstalls,
      by_tab: byTab,
      by_device: byDevice,
      profiles: profStats || {},
    };

    const prompt = `Ти аналітик локального медіа-застосунку CSTL NEWS (містечко Олика, Волинська область, Україна). Ось агреговані дані статистики за останні 7 днів (JSON):

${JSON.stringify(summary, null, 2)}

Дай короткий аналіз (3-4 речення) і 2-3 конкретні практичні рекомендації власнику — простою українською мовою, без води, по суті. Формат відповіді: спершу аналіз одним абзацом, потім список рекомендацій з "•". Якщо даних дуже мало (напр. total_events < 10) — прямо скажи що зарано робити висновки, і порадь почекати накопичення даних.`;

    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return json({ error: 'Anthropic API: ' + errText.slice(0, 300) }, 502);
    }
    const aiData = await aiRes.json();
    const text = aiData?.content?.[0]?.text || 'AI не повернув відповідь.';

    return json({ ok: true, summary_text: text, raw: summary });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
