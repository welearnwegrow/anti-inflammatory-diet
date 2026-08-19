# Anti-Inflammatory Diet — self-hosted site

Static site + an optional AI backend for the "Is this anti-inflammatory?" chat
and the tap-a-meal recipe drawer.

## Files
- `index.html` — the whole site (self-contained, works offline).
- `functions/api/claude.js` — Cloudflare Pages Function that powers the AI
  features. Served at `/api/claude`.

## Deploy on Cloudflare Pages (AI works)
1. Push this folder to a GitHub repo (or upload directly in the Cloudflare dashboard).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**
   (or **Upload assets**).
3. Build settings: **no build command**, output/root directory = the folder that
   contains `index.html` (this folder). Cloudflare auto-detects `functions/`.
4. **Settings → Environment variables → add:**
   `ANTHROPIC_API_KEY = sk-ant-...`  (your key from console.anthropic.com)
   Add it for Production (and Preview if you use previews). Redeploy after adding.
5. Visit your `*.pages.dev` URL. The poster, daily meals, shuffle, Download PDF
   and mobile layout work immediately; the AI chat + recipe drawer work once the
   key is set.

To change the AI model, edit the `model` line in `functions/api/claude.js`.

## GitHub Pages / any static host (no AI)
`index.html` runs fine on its own. The AI chat and recipe drawer need the
`/api/claude` backend above, which GitHub Pages cannot run — those two features
stay dormant there. Everything else works.

## Cost / privacy
Each AI request bills your Anthropic account. The key lives only in the
Cloudflare environment variable — it is never shipped to the browser.
