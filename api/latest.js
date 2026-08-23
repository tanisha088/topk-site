// Vercel Serverless Function — /api/latest
//
// GET (redirect):  /api/latest
//   302-redirects to the most recent published Top-K brief.
//   Falls back to the example brief if nothing is stored yet.
//
// GET (peek):       /api/latest?peek=1
//   Returns the stored record as JSON instead of redirecting.
//
// GET (set):        /api/latest?set=1&token=...&url=...&summary=...&date=...
//   Updates the latest brief. Query-string GET rather than POST because
//   the pipeline environment cannot make raw outbound POST requests —
//   only tool-mediated GET fetches reliably reach the network there.
//   The secret is necessarily exposed in the URL as a result; treat it
//   as a low-stakes shared secret, not a real credential.
//
// POST: kept as a secondary path in case a future environment can use it.
//   Body: { url, summary, date }, Authorization: Bearer <UPDATE_SECRET>
//
// Env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, UPDATE_SECRET

const FALLBACK_URL = 'https://claude.ai/code/artifact/469ce2ab-4333-44b4-b2d7-6adb16368eba';
const TTL_SECONDS = 172800; // 48h — a skipped run should not serve a stale brief forever

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

async function redisPipeline(cfg, commands) {
  const r = await fetch(`${cfg.url}/pipeline`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(commands)
  });
  if (!r.ok) throw new Error(`Upstash ${r.status}: ${await r.text()}`);
  return r.json();
}

async function writeLatest(cfg, { url, summary, date }) {
  const payload = JSON.stringify({
    url: url,
    summary: summary || '',
    date: date || new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString()
  });
  await redisPipeline(cfg, [
    ['SET', 'topk:latest', payload, 'EX', String(TTL_SECONDS)]
  ]);
}

export default async function handler(req, res) {
  const cfg = redisConfig();

  // ---------- GET ?set=1 : update via query string (POST substitute) ----------
  if (req.method === 'GET' && req.query && req.query.set) {
    res.setHeader('Content-Type', 'application/json');

    const secret = process.env.UPDATE_SECRET;
    const given = req.query.token;
    if (!secret || given !== secret) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!cfg) {
      return res.status(500).json({ message: 'Storage not configured.' });
    }
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ message: 'url is required' });
    }

    try {
      await writeLatest(cfg, { url, summary: req.query.summary, date: req.query.date });
      return res.status(200).json({ ok: true, url: url, via: 'get-set' });
    } catch (err) {
      console.error('Latest write error (GET):', err);
      return res.status(502).json({ message: 'Could not store latest brief URL.' });
    }
  }

  // ---------- POST : update via JSON body (kept as secondary path) ----------
  if (req.method === 'POST') {
    res.setHeader('Content-Type', 'application/json');

    const secret = process.env.UPDATE_SECRET;
    const auth = req.headers['authorization'];
    if (!secret || auth !== `Bearer ${secret}`) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    if (!cfg) {
      return res.status(500).json({ message: 'Storage not configured.' });
    }
    const { url, summary, date } = req.body || {};
    if (!url) {
      return res.status(400).json({ message: 'url is required' });
    }

    try {
      await writeLatest(cfg, { url, summary, date });
      return res.status(200).json({ ok: true, url: url, via: 'post' });
    } catch (err) {
      console.error('Latest write error (POST):', err);
      return res.status(502).json({ message: 'Could not store latest brief URL.' });
    }
  }

  // ---------- GET : redirect to the latest brief, or peek at it ----------
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    const peek = req.query && req.query.peek;

    if (cfg) {
      try {
        const [{ result }] = await redisPipeline(cfg, [['GET', 'topk:latest']]);
        if (result) {
          const latest = JSON.parse(result);
          if (latest.url) {
            if (peek) {
              res.setHeader('Content-Type', 'application/json');
              return res.status(200).json({ stored: true, ...latest });
            }
            return res.redirect(302, latest.url);
          }
        }
      } catch (err) {
        console.error('Latest read error:', err);
      }
    }

    if (peek) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({ stored: false, fallback: FALLBACK_URL });
    }
    return res.redirect(302, FALLBACK_URL);
  }

  res.setHeader('Content-Type', 'application/json');
  return res.status(405).json({ message: 'Method not allowed' });
}
