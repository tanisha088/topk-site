// Vercel Serverless Function — POST /api/update-latest
// Called by the daily Top-K scheduled task after publishing the artifact.
// Stores the latest brief URL + summary in Upstash Redis.
// Env vars required: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, UPDATE_SECRET

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  // Authenticate — the scheduled task must send the shared secret
  const secret = process.env.UPDATE_SECRET;
  const auth = req.headers['authorization'];
  if (!secret || auth !== `Bearer ${secret}`) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) {
    console.error('Upstash env vars not set');
    return res.status(500).json({ message: 'Server misconfigured — storage not connected.' });
  }

  const { url, summary, date } = req.body || {};
  if (!url) {
    return res.status(400).json({ message: 'url is required' });
  }

  try {
    // Store as a JSON blob with TTL of 48 hours (172800 seconds)
    // so stale briefs don't linger if a run is skipped
    const payload = JSON.stringify({
      url,
      summary: summary || '',
      date: date || new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString()
    });

    const r = await fetch(`${redisUrl}/SET/topk:latest/${encodeURIComponent(payload)}/EX/172800`, {
      headers: { 'Authorization': `Bearer ${redisToken}` }
    });

    if (!r.ok) {
      const err = await r.text();
      console.error('Upstash error:', err);
      return res.status(502).json({ message: 'Failed to store latest brief URL.' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Update-latest error:', err);
    return res.status(500).json({ message: 'Internal error.' });
  }
}
