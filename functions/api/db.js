export async function onRequest(context) {
  const { request, env } = context;
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const key = url.searchParams.get('key');
      if (!key) return new Response(JSON.stringify({ error: 'missing key' }), { status: 400, headers: corsHeaders });
      const result = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind(key).first();
      return new Response(result ? result.value : 'null', {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
    if (request.method === 'POST') {
      const body = await request.json();
      const { key, value, action, actId, actValue, objType, objEntry } = body;

      // 原子局部更新单条活动（防止并发全量覆盖）
      if (action === 'patch_activity' && key && actId) {
        const existing = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind(key).first();
        let data = existing ? JSON.parse(existing.value) : { activities: {} };
        if (!data.activities) data.activities = {};
        if (actValue === null) {
          delete data.activities[actId];
        } else {
          data.activities[actId] = actValue;
        }
        await env.DB.prepare('INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, ?)').bind(key, JSON.stringify(data), Date.now()).run();
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // 原子追加异议（防止多作者并发提交异议互相覆盖）
      // objType: 'whitelist' | 'winner', objEntry: 异议对象
      if (action === 'append_objection' && key && actId && objType && objEntry) {
        const existing = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind(key).first();
        let data = existing ? JSON.parse(existing.value) : { activities: {} };
        if (!data.activities) data.activities = {};
        const act = data.activities[actId];
        if (!act) return new Response(JSON.stringify({ error: 'activity not found' }), { status: 404, headers: corsHeaders });
        const field = objType === 'whitelist' ? 'whitelistObjections' : 'winnerObjections';
        if (!act[field]) act[field] = [];
        // 去重：同一个 id 不重复追加
        if (!act[field].find(o => o.id === objEntry.id)) {
          act[field].push(objEntry);
        }
        act.updatedAt = new Date().toISOString();
        await env.DB.prepare('INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, ?)').bind(key, JSON.stringify(data), Date.now()).run();
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // 全量写入（兜底，向后兼容）
      if (!key) return new Response(JSON.stringify({ error: 'missing key' }), { status: 400, headers: corsHeaders });
      await env.DB.prepare('INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, ?)').bind(key, value, Date.now()).run();
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}
