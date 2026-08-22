// Vercel Serverless Function — /api/latest
//
// GET:  302-redirects to the most recent published Top-K brief.
//       Falls back to the example brief if nothing is stored yet.
// POST: the daily pipeline sets the latest brief URL.
//       Authenticated with UPDATE_SECRET.
//       Body: { url, summary, date }
//
// Read and write live in one handler deliberately: it is the same
// resource, and it keeps the pipeline's write path on a route that
// is known to deploy.
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

export default async function handler(req, res) {
  const cfg = redisConfig();

  // ---------- POST: set the latest brief ----------
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

    const payload = JSON.stringify({
      url: url,
      summary: summary || '',
      date: date || new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString()
    });

    try {
      await redisPipeline(cfg, [
        ['SET', 'topk:latest', payload, 'EX', String(TTL_SECONDS)]
      ]);
      return res.status(200).json({ ok: true, url: url });
    } catch (err) {
      console.error('Latest write error:', err);
      return res.status(502).json({ message: 'Could not store latest brief URL.' });
    }
  }

  // ---------- GET: redirect to the latest brief ----------
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');

    // ?peek=1 returns the stored record as JSON instead of redirecting,
    // so the pipeline (and a human) can verify a write without following it.
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
