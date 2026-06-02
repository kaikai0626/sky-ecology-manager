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
      const { key, value } = await request.json();
      if (!key) return new Response(JSON.stringify({ error: 'missing key' }), { status: 400, headers: corsHeaders });
      await env.DB.prepare('INSERT OR REPLACE INTO store (key, value, updated_at) VALUES (?, ?, ?)').bind(key, value, Date.now()).run();
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
  }
}
