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
      const { key, value, action, actId, actValue } = body;

      // 原子局部更新单条活动（防止全量覆盖冲突）
      if (action === 'patch_activity' && key && actId) {
        const existing = await env.DB.prepare('SELECT value FROM store WHERE key = ?').bind(key).first();
        let data = existing ? JSON.parse(existing.value) : { activities: {} };
        if (!data.activities) data.activities = {};
        if (actValue === null) {
          // 删除活动
          delete data.activities[actId];
        } else {
          // 合并单条活动（以传入的为准，保留其他活动不变）
          data.activities[actId] = actValue;
        }
        const newValue = JSON.stringify(data);
        await env.DB.prepare('INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, ?)').bind(key, newValue, Date.now()).run();
        return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
      }

      // 全量写入（兜底，保持向后兼容）
      if (!key) return new Response(JSON.stringify({ error: 'missing key' }), { status: 400, headers: corsHeaders });
      await env.DB.prepare('INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, ?)').bind(key, value, Date.now()).run();
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}
