// Cloudflare Pages Function — proxies the browser to the Anthropic API.
// Deployed automatically at  /api/claude  when this folder is part of a
// Cloudflare Pages project. The page (index.html) calls it with the same
// body shape the in-editor Claude helper uses: { system, max_tokens, messages }.
//
// Set your key as a secret/env var in the Pages project:
//   Settings → Environment variables → ANTHROPIC_API_KEY = sk-ant-...

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
    if (!r.ok) {
      return json({ error: (data && data.error && data.error.message) || 'Anthropic API error.' }, r.status);
    }
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    return json({ text });
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
