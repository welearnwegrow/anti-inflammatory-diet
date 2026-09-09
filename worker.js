// Standalone Cloudflare Worker — paste this into the Worker editor (Quick Edit).
// Handles two jobs, both by POST to the same URL:
//   1. Claude proxy  — default (body has messages/prompt/system)
//   2. Notion logger — body { kind:'notion', type:'lookup'|'dish', ... }
//
// Secrets / vars to set in  Worker → Settings → Variables and Secrets:
//   ANTHROPIC_API_KEY  = sk-ant-...            (secret)
//   NOTION_TOKEN       = ntn_...               (secret)  Notion integration token
//   NOTION_DB_LOOKUPS  = <database id>         (plain)   "Is this anti-inflammatory?" log
//   NOTION_DB_DISHES   = <database id>         (plain)   dishes added in Browse
//   NOTION_DB_CONTACT  = <database id>         (plain)   contact-form messages
//
// The Notion logger inspects each database's real schema and only writes the
// title plus whatever optional columns actually exist, so missing columns are
// skipped instead of erroring. Recommended (optional) columns:
//   Lookups: Verdict (text), Notes (text), When (date)
//   Dishes:  Category (text), Added (date)

const NOTION_VERSION = '2022-06-28';

export default {
  async fetch(request, env) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405, cors);

    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Invalid JSON' }, 400, cors); }

    if (body.kind === 'notion') return handleNotion(body, env, cors);
    return handleClaude(body, env, cors);
  },
};

async function handleClaude(body, env, cors) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'ANTHROPIC_API_KEY not set' }, 500, cors);
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
}

async function handleNotion(body, env, cors) {
  if (!env.NOTION_TOKEN) return json({ error: 'NOTION_TOKEN not set' }, 500, cors);

  const dbId = body.type === 'dish' ? env.NOTION_DB_DISHES : (body.type === 'contact' ? env.NOTION_DB_CONTACT : env.NOTION_DB_LOOKUPS);
  if (!dbId) return json({ error: (body.type === 'dish' ? 'NOTION_DB_DISHES' : body.type === 'contact' ? 'NOTION_DB_CONTACT' : 'NOTION_DB_LOOKUPS') + ' not set' }, 500, cors);

  const headers = {
    'content-type': 'application/json',
    'authorization': 'Bearer ' + env.NOTION_TOKEN,
    'notion-version': NOTION_VERSION,
  };

  // 1. read the database schema so we only write columns that actually exist
  let schema;
  try {
    const sr = await fetch('https://api.notion.com/v1/databases/' + dbId, { headers });
    schema = await sr.json();
    if (!sr.ok) return json({ error: (schema && schema.message) || 'Could not read Notion database' }, sr.status, cors);
  } catch (e) {
    return json({ error: String(e) }, 500, cors);
  }

  const props = schema.properties || {};
  const titleKey = Object.keys(props).find(k => props[k].type === 'title') || 'Name';
  const has = (name, type) => props[name] && props[name].type === type;

  // primary title + the optional fields we'd like to fill
  const primary = body.type === 'dish' ? (body.name || 'Untitled') : (body.type === 'contact' ? (body.name || body.contactEmail || 'Contact') : (body.query || 'Untitled'));
  const wanted = body.type === 'dish'
    ? { Category: body.category, Email: body.email, Visitor: body.visitor }
    : body.type === 'contact'
    ? { Message: body.message, Email: body.contactEmail || body.email, Visitor: body.visitor }
    : { Verdict: body.verdict, Notes: body.rationale, Email: body.email, Visitor: body.visitor };

  const properties = { [titleKey]: { title: [{ text: { content: String(primary).slice(0, 200) } }] } };
  for (const [name, val] of Object.entries(wanted)) {
    if (val == null || val === '') continue;
    if (has(name, 'rich_text')) properties[name] = { rich_text: [{ text: { content: String(val).slice(0, 1900) } }] };
    else if (has(name, 'select')) properties[name] = { select: { name: String(val).slice(0, 100) } };
    else if (has(name, 'email')) properties[name] = { email: String(val).slice(0, 200) };
  }
  // fill a date column if one exists (any of these names), else rely on Notion's created time
  const now = new Date().toISOString();
  for (const dname of ['Added', 'When', 'Date', 'Logged']) {
    if (has(dname, 'date')) { properties[dname] = { date: { start: now } }; break; }
  }

  // 2. create the page
  try {
    const r = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers,
      body: JSON.stringify({ parent: { database_id: dbId }, properties }),
    });
    const data = await r.json();
    if (!r.ok) return json({ error: (data && data.message) || 'Notion API error' }, r.status, cors);
    return json({ ok: true, wrote: Object.keys(properties) }, 200, cors);
  } catch (e) {
    return json({ error: String(e) }, 500, cors);
  }
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}
