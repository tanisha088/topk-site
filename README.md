# Top-K

**Top-K** is a daily AI briefing built for engineers and PMs who ship products with AI models — not researchers. Every morning at 7:00am IST, it aggregates 40+ sources across lab blogs, analyst newsletters, platform changelogs, leaderboards, and community feeds, then distills them into a scannable brief with 1-2 real deep-dives.

The name comes from top-k sampling: out of everything that happened in AI today, these are the k things that actually matter to what you're building.

Live at **[topk-site.vercel.app](https://topk-site.vercel.app)** (or your custom domain)

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

## Customer journey

```
1. Discovery
   Visitor lands on topk-site.vercel.app (shared link, search, etc.)

2. Subscribe
   Enters email on the landing page
   -> Stored in MailerLite via /api/subscribe
   -> Honeypot field filters bots

3. Welcome
   MailerLite automation sends a welcome email with a link
   to the latest brief (/api/latest -> today's artifact)

4. Daily delivery (7:00am IST)
   Automated task fires -> gathers from 40+ sources ->
   synthesizes -> publishes interactive brief page ->
   updates /api/latest redirect -> emails brief to all subscribers

5. Read
   Subscriber opens email -> reads inline headlines + deep-dives
   -> clicks through to the full interactive artifact for the
   complete experience (themed, scrollable, with source links)

6. Repeat
   Next morning, a new brief. Each day gets its own URL,
   building an archive over time.
```

---

## Architecture

```
topk-site/                    Vercel project (static + serverless)
  public/
    index.html                Landing page (signup form, design system)
  api/
    subscribe.js              POST /api/subscribe -> MailerLite
    count.js                  GET  /api/count -> subscriber count
    latest.js                 GET  /api/latest -> 302 redirect to today's brief
    update-latest.js          POST /api/update-latest -> store URL in Redis
```

### How the pieces connect

```
                   +-----------------+
                   |  Daily Pipeline |
                   |  (7am IST)      |
                   |                 |
                   +--------+--------+
                            |
              +-------------+-------------+
              |             |             |
        1. Gather      2. Publish    3. Deliver
        40+ sources    Interactive   Email via
        via web        brief page    MailerLite
              |             |             |
              +------+------+             |
                     |                    |
              POST /api/update-latest     |
              (stores brief URL           |
               in Upstash Redis)          |
                     |                    |
                     v                    v
              GET /api/latest       Subscribers'
              302 -> today's        inboxes
              brief URL
```

### External services

| Service | Purpose | Free tier |
|---------|---------|-----------|
| **Vercel** | Hosting + serverless functions | Hobby plan (sufficient) |
| **MailerLite** | Subscriber management + email delivery | Up to 1,000 subscribers |
| **Upstash Redis** | Store the latest brief URL for `/api/latest` | 10,000 commands/day |
| **Automated scheduled task** | Daily content generation pipeline | Runs on a cron schedule |

### Environment variables (Vercel)

| Variable | Source |
|----------|--------|
| `MAILERLITE_API_KEY` | MailerLite dashboard -> Integrations -> API |
| `MAILERLITE_GROUP_ID` | MailerLite group URL (optional, keeps signups organized) |
| `UPSTASH_REDIS_REST_URL` | Upstash console -> your database |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash console -> your database |
| `UPDATE_SECRET` | Any strong secret; must match the daily pipeline config |

---

## Source registry

Top-K draws from a curated, layered source set — not a single feed:

- **Daily consolidators** (8 sources) — AINews, Techmeme, TLDR AI, The Rundown AI, The Neuron, Ben's Bites, AlphaSignal, The AI Daily Brief. These set the day's agenda.
- **Individual analysts** (19 sources) — Zvi Mowshowitz, Simon Willison, Ethan Mollick, Nathan Lambert, Jack Clark, and others. These are where the understanding comes from.
- **Platform changelogs** (3 sources) — OpenAI, Anthropic, Google Gemini. The most directly actionable layer.
- **Leaderboards** (3 sources) — Artificial Analysis, Arena/LMArena, HuggingFace. Reports movement, not raw dumps.
- **Community** — Hacker News (direct), Reddit (via AINews aggregation).
- **Research** (4 sources) — HF Daily Papers, MarkTechPost, Synced, The Gradient. Gated: only papers with near-term builder implications.
- **Primary lab blogs** (12 sources) — Used for verification and citation only, never for discovery.
- **Industry/policy** (8 sources) — Reuters, Axios, TechCrunch, VentureBeat, etc. Backstop for business and regulatory coverage.

Full registry with URLs and status: see `plan.md`.

---

## Design system

The brief uses a consistent visual identity across every daily edition:

- **Fonts**: Martian Mono (wordmark, rank numerals), Public Sans (all prose), IBM Plex Mono (data, dates, tags, links, coverage log)
- **Palette**: Gold accent with semantic teal (GA/positive) and rust (breaking/deprecated), full light and dark theme tokenization
- **Masthead**: Literal top-k distribution bar chart — kept bars in accent, dropped bars in neutral, cutoff line
- **Coverage log**: Terminal-style `$ ok` / `$ fail` / `$ skip` at the bottom of every brief

---

## Development

The site is intentionally simple — a single HTML file with inline CSS/JS, plus four serverless functions. No build step, no framework, no dependencies.

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
