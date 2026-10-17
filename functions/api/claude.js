// Cloudflare Pages Function — proxies the browser to the Anthropic API.
// Deployed automatically at  /api/claude  when this folder is part of a
// Cloudflare Pages project. The page (index.html) calls it with the same
// body shape the in-editor Claude helper uses: { system, max_tokens, messages }.
//
// Set your key as a secret/env var in the Pages project:
//   Settings → Environment variables → ANTHROPIC_API_KEY = sk-ant-...

const MODELS = ['claude-haiku-5-5', 'claude-haiku-4-5']; // newest first; falls back if a model is unavailable

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY is not set on the server.' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const payload = {
    max_tokens: body.max_tokens || 1024,
    messages: body.messages || [{ role: 'user', content: String(body.prompt || '') }],
  };
  if (body.system) payload.system = body.system;

  try {
    const { ok, status, data } = await callAnthropic(payload, env, body.model);
    if (!ok) return json({ error: (data && data.error && data.error.message) || 'Anthropic API error.' }, status);
    return json({ text: firstText(data) });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function callAnthropic(payload, env, requested) {
  const list = requested ? [requested] : MODELS;
  let last;
  for (const model of list) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ ...payload, model }),
    });
    const data = await r.json().catch(() => ({}));
    last = { ok: r.ok, status: r.status, data };
    if (r.ok) return last;
    // only fall back when the model itself is the problem (retired / not found / invalid for this model)
    if (![400, 404].includes(r.status)) return last;
  }
  return last;
}

function firstText(data) {
  const block = (data.content || []).find(b => b.type === 'text');
  return (block && block.text) || '';
}
