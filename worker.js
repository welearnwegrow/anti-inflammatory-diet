// Standalone Cloudflare Worker — paste this into the Worker editor (Quick Edit).
// It proxies the browser to the Anthropic API and adds CORS so your Pages site
// can call it from a different origin.
//
// After deploying:
//   1. Worker → Settings → Variables and Secrets → add secret
//        ANTHROPIC_API_KEY = sk-ant-...
//   2. Copy the Worker URL (https://<name>.<account>.workers.dev) and send it to
//      me so I point the site's "Guide me" chat + recipe drawer at it.

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);
    if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500, cors);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400, cors); }

    const payload = {
      model: body.model || 'claude-haiku-4-5',
      max_tokens: body.max_tokens || 1024,
      messages: body.messages || [{ role: 'user', content: String(body.prompt || '') }],
    };
    if (body.system) payload.system = body.system;

    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok) return json({ error: (data && data.error && data.error.message) || 'Anthropic API error' }, r.status, cors);
      const text = (data.content && data.content[0] && data.content[0].text) || '';
      return json({ text }, 200, cors);
    } catch (e) {
      return json({ error: String(e) }, 500, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}
