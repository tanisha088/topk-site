// Vercel Serverless Function — GET /api/latest
// Redirects to the latest published Top-K brief artifact.
// Falls back to the example brief if none is stored yet.
// Env vars required: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN

const FALLBACK_URL = 'https://claude.ai/code/artifact/469ce2ab-4333-44b4-b2d7-6adb16368eba';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    try {
      const r = await fetch(`${redisUrl}/GET/topk:latest`, {
        headers: { 'Authorization': `Bearer ${redisToken}` }
      });

      if (r.ok) {
        const data = await r.json();
        if (data.result) {
          const latest = JSON.parse(data.result);
          if (latest.url) {
            return res.redirect(302, latest.url);
          }
        }
      }
    } catch (err) {
      console.error('Latest fetch error:', err);
    }
  }

  // Fallback to the example brief
  return res.redirect(302, FALLBACK_URL);
}
