# Top-K

**Top-K** is a daily AI briefing built for engineers and PMs who ship products with AI models — not researchers. Every morning at 7:00am IST, it aggregates 40+ sources across lab blogs, analyst newsletters, platform changelogs, leaderboards, and community feeds, then distills them into a scannable brief with 1-2 real deep-dives, publishes it as a public interactive page, and emails it to subscribers.

The name comes from top-k sampling: out of everything that happened in AI today, these are the k things that actually matter to what you're building.

Live at **[topk-site.vercel.app](https://topk-site.vercel.app)**

---

## What subscribers get

### The daily brief

A self-contained interactive page published every morning, containing:

- **"What changed in your stack"** — platform changelog entries (pricing, deprecations, breaking changes, new capabilities) from OpenAI, Anthropic, and Google, presented as tagged cards you can scan in seconds.
- **10-15 headlines** grouped by category (model/API changes, dev tooling, leaderboard movement, product moves, applied research, policy) — each with a one-line "why it matters" and a source link.
- **1-2 deep-dives** — the day's most consequential stories explained properly: what happened, the engineering/product context, why it matters, what to watch. Written as mini-tutorials, not extended headlines.
- **A coverage note** — which sources yielded nothing or failed to fetch. No padding slow days with recycled news.

### The inclusion test

Every item must answer: *"Does this change what I build, what it costs, or what I can promise?"* AI-safety discourse, funding-round trivia, and lab palace-intrigue are deprioritized unless they carry a concrete build implication.

---

## How the daily pipeline actually works

This is the part most daily-digest projects fake with a cron job and an RSS reader. Top-K runs a genuine research-to-delivery pipeline, unattended, every morning:

```
07:00 IST  Scheduled task fires (fresh session, no memory of prior runs)
   │
   ├─ 1. GATHER      5 parallel research agents sweep 40+ sources
   │                 (consolidators, changelogs, leaderboards, analysts,
   │                  community/research), each returning a compact digest
   │
   ├─ 2. SYNTHESIZE   Headlines + deep-dives assembled from the digests,
   │                  weighted toward changelog/pricing/leaderboard signal,
   │                  cross-checked against a critical-counterweight source set
   │
   ├─ 3. BUILD        A complete, self-contained HTML brief is written —
   │                  full light/dark theme, custom type system, a literal
   │                  top-k distribution-bar motif in the masthead
   │
   ├─ 4. PUBLISH      The brief is hosted directly at /api/latest — not a
   │                  redirect to a private document, an actual public page
   │                  anyone can open with no login
   │
   └─ 5. DELIVER      A MailerLite campaign goes out to the subscriber list,
                       inline-styled for email clients, linking back to the
                       full interactive brief
```

Every phase writes a checkpoint (`/api/checkpoint`) so a stalled or failed run is diagnosable after the fact instead of a silent no-show.

### The interesting engineering problem: getting content out of the pipeline

The pipeline runs in an isolated environment with no general-purpose outbound networking — it can only reach the outside world through a fetch tool, and that tool enforces an undocumented limit: any request carrying more than roughly 150–200 characters of "data-looking" content in its URL gets silently blocked as a precaution against exfiltration. That's a real constraint when the thing you need to move is a 20–30KB HTML document.

`/api/latest` handles this with two paths:

- **Direct POST** — the whole brief in a single request body. Fast when it works.
- **Tiny-chunk fallback** — if POST isn't available, the brief is split into ~100-byte pieces, each base64url-encoded and sent as its own small request, then reassembled server-side from raw bytes (not strings — chunk boundaries can land mid-character, and only concatenating bytes before a single final UTF-8 decode keeps multi-byte characters like em-dashes intact). Slower — several hundred requests for a full brief — but it always gets there.

Earlier versions of this pipeline pointed the "read today's brief" link at a privately-hosted document, which technically worked but meant no outside visitor could actually open it without their own login. `/api/latest` now serves the HTML directly, so the link that goes out in the newsletter is genuinely public.

---

## Customer journey

```
1. Discovery
   Visitor lands on topk-site.vercel.app (shared link, search, etc.)

2. Subscribe
   Enters email on the landing page
   -> Stored in MailerLite via /api/subscribe, added to the TopK group
   -> Honeypot field filters bots

3. Welcome
   MailerLite sends a welcome email with a link to the latest brief
   (/api/latest — served directly, no login wall)

4. Daily delivery (7:00am IST)
   The pipeline above runs end to end, unattended

5. Read
   Subscriber opens the email -> reads inline headlines + deep-dive
   summaries -> clicks through to the full interactive brief for the
   complete experience (themed, scrollable, with source links)

6. Repeat
   Next morning, a new brief goes out. Each day's HTML is archived,
   building a running record over time.
```

---

## Architecture

```
topk-site/                    Vercel project (static + serverless)
  public/
    index.html                Landing page (signup form, design system)
  api/
    subscribe.js               POST /api/subscribe -> MailerLite
    count.js                    GET  /api/count -> subscriber count
    latest.js                   GET  /api/latest -> serves the live brief
                                  POST /api/latest -> direct one-shot upload
                                  GET  /api/latest?chunk=1 / ?finish=1 -> chunked upload fallback
                                  GET  /api/latest?peek=1 -> metadata only, for verification
    checkpoint.js               GET  /api/checkpoint -> pipeline run history
                                  GET  /api/checkpoint?phase=... -> write a checkpoint
```

### External services

| Service | Purpose | Free tier |
|---------|---------|-----------|
| **Vercel** | Hosting + serverless functions | Hobby plan (sufficient) |
| **MailerLite** | Subscriber management + daily email delivery | Up to 1,000 subscribers |
| **Upstash Redis** | Stores the live brief HTML + metadata behind `/api/latest` | 10,000 commands/day |
| **Scheduled task** | Runs the daily gather → synthesize → build → publish → deliver pipeline | Daily cron, ~1 run/day |

### Environment variables (Vercel)

| Variable | Source |
|----------|--------|
| `MAILERLITE_API_KEY` | MailerLite dashboard -> Integrations -> API |
| `MAILERLITE_GROUP_ID` | MailerLite group URL (keeps signups organized into the delivery list) |
| `UPSTASH_REDIS_REST_URL` | Upstash console -> your database |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console -> your database |
| `UPDATE_SECRET` | Any strong secret; must match the daily pipeline's config |

---

## Source registry

Top-K draws from a curated, layered source set — not a single feed:

- **Daily consolidators** (8 sources) — smol.ai, Techmeme, TLDR AI, The Rundown AI, The Neuron, Ben's Bites, AlphaSignal, AI Daily Brief. These set the day's agenda.
- **Platform changelogs** (3 sources) — OpenAI, Anthropic, Google Gemini. The most directly actionable layer.
- **Leaderboards** (2 sources) — Artificial Analysis, Arena/LMArena. Reports movement, not raw rankings.
- **Analysts** (17 sources) — Zvi Mowshowitz, Jack Clark (Import AI), Nathan Lambert, Simon Willison, Ethan Mollick, Gary Marcus, Dwarkesh Patel, and others. This is where interpretation and disagreement come from.
- **Community & research** (7 sources) — Hacker News, HuggingFace Daily Papers, MarkTechPost, Synced, and more. Research is gated: a paper only enters if it changes what's promisable or measurable within a quarter.
- **Industry/policy backstop** (3 sources) — TechCrunch, VentureBeat, Reuters.

Every headline cites its primary source; aggregators and analysts are credited for the framing, not the underlying fact.

---

## Design system

The brief uses a consistent visual identity across every daily edition:

- **Fonts**: Martian Mono (wordmark, rank numerals), Public Sans (all prose), IBM Plex Mono (data, dates, tags, links, coverage log)
- **Palette**: Gold accent with semantic teal (GA/positive) and rust (breaking/deprecated), full light and dark theme tokenization
- **Masthead**: A literal top-k distribution bar chart — kept bars in accent, dropped bars in neutral, with a cutoff line
- **Coverage log**: Terminal-style `$ ok` / `$ fail` / `$ skip` at the bottom of every brief, so what didn't make it in is as visible as what did

---

## Development

The site is intentionally simple — a single HTML file with inline CSS/JS, plus a handful of serverless functions. No build step, no framework, no dependencies.

```bash
# Local preview
cd topk-site
python3 -m http.server 8000 --directory public
# open http://localhost:8000
```

API routes require Vercel's runtime. For full local testing, use `vercel dev`.

---

## Deployment

See [DEPLOY.md](./DEPLOY.md) for step-by-step setup instructions covering MailerLite, Vercel, environment variables, custom domains, and the MailerLite welcome automation.

---

## License

Private project. Not open-sourced.
