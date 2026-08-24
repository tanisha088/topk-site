# Top-K — Deployment Guide

Everything you need to get topk running on your own domain.

## What you're deploying

A static landing page with four serverless API routes:
- `/api/subscribe` — adds an email to your MailerLite subscriber list
- `/api/count` — returns the current subscriber count (cached 60s)
- `/api/latest` — redirects to the latest published Top-K brief (302)
- `/api/update-latest` — POST: stores the latest brief URL/summary in Upstash Redis

Total infra cost: **$0/month** on free tiers (until you exceed 1,000 MailerLite subscribers or Vercel's hobby limits).

---

## Step 1 — Create a MailerLite account (5 min)

1. Go to [mailerlite.com](https://www.mailerlite.com/) and sign up (free plan covers up to 1,000 subscribers)
2. Complete the account setup (confirm email, fill in sender details)
3. Go to **Integrations → MailerLite API** in the dashboard
4. Click **Generate new token**, name it "topk", and **copy the key immediately** — it won't be shown again
5. (Optional) Create a subscriber **Group** called "Top-K" — go to **Subscribers → Groups → Create group**. Copy the group ID from the URL (the number in the URL when you click into the group). This keeps Top-K signups organized if you use MailerLite for anything else.

Save these for Step 3:
- `MAILERLITE_API_KEY` — the token you just generated
- `MAILERLITE_GROUP_ID` — the group ID (optional but recommended)

## Step 1b — Set up Upstash Redis (5 min, for latest brief routing)

The `/api/latest` and `/api/update-latest` routes use Upstash Redis (pay-as-you-go, generous free tier) to store the URL of the most recent Top-K brief.

1. Go to [upstash.com](https://upstash.com/) and sign up (free tier is plenty)
2. Create a Redis database (REST API enabled)
3. Copy the `REST URL` and `REST TOKEN`

Save these for Step 3:
- `UPSTASH_REDIS_REST_URL` — the Upstash REST endpoint
- `UPSTASH_REDIS_REST_TOKEN` — the Upstash REST token
- `UPDATE_SECRET` — a shared secret string used to authenticate the daily update task (see Step 5)

---

## Step 2 — Deploy to Vercel (5 min)

### Option A: Deploy via GitHub (recommended — auto-deploys on every push)

1. Create a GitHub repo (public or private):
   ```
   cd topk-site
   git init
   git add .
   git commit -m "Initial Top-K site"
   ```
2. Push to GitHub:
   ```
   gh repo create topk-site --private --push --source=.
   ```
   (or create the repo on github.com and push manually)
3. Go to [vercel.com](https://vercel.com), sign up with GitHub
4. Click **Add New → Project**, import your `topk-site` repo
5. Vercel auto-detects the config. Click **Deploy**.

### Option B: Deploy via CLI (one command)

1. Install the Vercel CLI:
   ```
   npm i -g vercel
   ```
2. From the `topk-site` directory:
   ```
   vercel
   ```
3. Follow the prompts (link to your Vercel account, confirm settings)

---

## Step 3 — Set environment variables (2 min)

In the Vercel dashboard:

1. Go to your project → **Settings → Environment Variables**
2. Add:
   - `MAILERLITE_API_KEY` = your API token from Step 1
   - `MAILERLITE_GROUP_ID` = your group ID from Step 1 (optional)
   - `UPSTASH_REDIS_REST_URL` = your Upstash REST URL from Step 1b
   - `UPSTASH_REDIS_REST_TOKEN` = your Upstash REST token from Step 1b
   - `UPDATE_SECRET` = a shared secret string for authenticating the daily update task (see Step 5)
3. Click **Save**
4. Go to **Deployments** → click the three dots on the latest deployment → **Redeploy**

---

## Step 4 — Connect a custom domain (5 min, optional)

1. Buy a domain from any registrar (Namecheap, Cloudflare, Google Domains, etc.)
   - Suggestions: `topk.dev`, `topk.ai`, `topkai.com`, `gettopk.com`
2. In Vercel dashboard → **Settings → Domains** → add your domain
3. Vercel gives you DNS records to add at your registrar (usually a CNAME or A record)
4. Add them, wait for propagation (usually < 5 min), Vercel auto-provisions HTTPS

---

## Verify it works

1. Open your site URL (Vercel gives you a `.vercel.app` URL immediately, or your custom domain)
2. Enter a test email and subscribe
3. Check your MailerLite dashboard → **Subscribers** — the email should appear
4. The subscriber count on the page should update within 60 seconds

## Step 5 — Publish the daily brief (for the scheduled task)

The landing page "See today's brief" link points to `/api/latest`, which now **serves the brief HTML directly** (no redirect) — this is necessary because Claude artifacts are private by default and would need manual re-sharing every day.

The daily pipeline can upload the brief HTML in one of two ways:

**Option A — Direct POST** (preferred, if the pipeline session has full network access):
```
curl -X POST "https://your-domain.com/api/latest?token=YOUR_UPDATE_SECRET&summary=Today's+brief&date=2025-01-15&sourceArtifact=https://claude.ai/code/artifact/..." \
  -H "Content-Type: text/html" \
  --data-binary @brief.html
```
The raw HTML is stored directly as `topk:latest:html` (48h TTL) with metadata as `topk:latest:meta`.

**Option B — Chunked GET** (fallback, for environments that can only make GET requests):
```
# 1. Upload each chunk
curl "https://your-domain.com/api/latest?chunk=1&run=2025-01-15T07&idx=0&data=BASE64URL_ENCODED_DATA&token=YOUR_UPDATE_SECRET"

# 2. Assemble and publish
curl "https://your-domain.com/api/latest?finish=1&run=2025-01-15T07&summary=Today's+brief&date=2025-01-15&sourceArtifact=https://claude.ai/code/artifact/...&token=YOUR_UPDATE_SECRET"
```
Each chunk appends base64url-encoded bytes to a pending upload keyed by `run`. At finish, chunks are concatenated via `Buffer.concat` (correctly handling multi-byte UTF-8 chars split across boundaries), decoded to HTML, and stored.

**Verify:**
```
curl "https://your-domain.com/api/latest?peek=1"
# Returns: { "stored": true, "date": "2025-01-15", "summary": "...", "length": 8421, ... }
```

Pending uploads have a 1-hour TTL, so abandoned chunk sequences clear automatically.

**Patch (correct a typo or wrong date in the live brief):**
```
curl "https://your-domain.com/api/latest?patch=1&find=Januray&replace=January&token=YOUR_UPDATE_SECRET"
# Returns: { "ok": true, "replacements": 2, "bytes": 8423 }
```
Use `all=1` to replace every occurrence; omit it to replace only the first. If `find` isn't present, the response returns `replacements: 0` (no-op, not an error).

## Step 5b — Pipeline checkpoint monitoring (optional)

The `/api/checkpoint` endpoint lets the daily pipeline report and retrieve progress:

- **GET (write)** — report a checkpoint: `/api/checkpoint?run=2025-01-15T07&phase=gather&status=ok&detail=40/42+fetched&token=YOUR_UPDATE_SECRET`. Uses query-string because the pipeline environment can only make tool-mediated GET fetches.
- **POST (write)** — same as above but with JSON body and `Authorization: Bearer` header.
- **GET (read)** — retrieve the full checkpoint log for a run: `/api/checkpoint?run=2025-01-15T07`. Defaults to the most recent run. Returns `count`, `lastPhase`, `lastStatus`, and `secondsSinceLastCheckpoint`.
- Checkpoints are stored in Upstash Redis with a 3-day TTL.

---

## Project structure

   ```
   topk-site/
     public/
       index.html        ← Landing page (all HTML/CSS/JS in one file)
     api/
       subscribe.js      ← Serverless: POST email → MailerLite
       count.js          ← Serverless: GET subscriber count
        latest.js         ← Serverless: GET/POST /api/latest → serve brief HTML + chunked/POST upload + patch
        checkpoint.js     ← Serverless: GET/POST /api/checkpoint → pipeline progress log
     vercel.json         ← Routing config
     package.json
   ```

---

## Step 5b — Local runner alternative (Claude Code Pro)

If you have a **Claude Code Pro** subscription (no Anthropic API key), you can run the pipeline locally instead of via GitHub Actions:

1. **Install prerequisites:**
   - Node.js 20+ (for the pipeline scripts)
   - Claude Code CLI: `npm install -g @anthropic-ai/claude-code` (or use `npx @anthropic-ai/claude-code`)
   - Log in: `claude` → authenticate with your Pro subscription

2. **Set environment variables** in your shell:
   ```bash
   export UPDATE_SECRET="your-update-secret"        # same as Vercel
   export MAILERLITE_API_KEY="your-mailerlite-key"
   export MAILERLITE_GROUP_ID="196497502048879775"
   export SITE_BASE="https://topk-site.vercel.app"  # or your custom domain
   export FROM_EMAIL="tanisharas@gmail.com"
   ```

3. **Run the pipeline:**
   ```bash
   # Test run: publish brief but skip email
   cd topk-site
   node scripts/run-local.mjs --skip-email

   # Full run: publish + send campaign
   node scripts/run-local.mjs
   ```

4. **Schedule it** (Windows Task Scheduler / cron):
   - Trigger: daily at 06:45 local time (runs ~15 min before 7am IST)
   - Action: `node scripts/run-local.mjs` (from the topk-site directory)

The local runner (`run-local.mjs`) is identical to the GitHub Actions version, except it invokes `claude -p` for synthesis instead of calling the Anthropic API. Your Claude Code Pro subscription pays for the synthesis call; everything else (fetch, render, publish, email) uses standard HTTPS.

Once the subscriber list is building, connect the MailerLite MCP connector
in your Claude settings (claude.ai → Settings → Connectors → search "MailerLite").
This lets the daily Top-K scheduled task send the brief directly to your
subscriber list using MailerLite's campaign/email tools — no manual sending needed.
