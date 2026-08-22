// Vercel Serverless Function — /api/checkpoint
//
// POST: the daily pipeline reports progress after each phase.
//       Authenticated with UPDATE_SECRET.
//       Body: { run, phase, status, detail }
//
// GET:  returns the checkpoint log for a run, so a run that dies
//       mid-flight can be diagnosed by seeing how far it got.
//       Query: ?run=<id>  (defaults to the most recent run)
//
// Env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, UPDATE_SECRET

const TTL_SECONDS = 259200; // 3 days

function redisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

// Upstash REST accepts a JSON array body for one command, and
// /pipeline for several. Using the body form avoids URL-encoding
// problems with arbitrary checkpoint text.
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
  res.setHeader('Content-Type', 'application/json');

  const cfg = redisConfig();
  if (!cfg) {
    return res.status(500).json({ message: 'Storage not configured.' });
  }

  // ---------- GET: read the log ----------
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    try {
      let run = req.query.run;

      if (!run) {
        const [{ result: lastRun }] = await redisPipeline(cfg, [
          ['GET', 'topk:run:current']
        ]);
        run = lastRun;
      }

      if (!run) {
        return res.status(200).json({ run: null, checkpoints: [] });
      }

      const [{ result: entries }] = await redisPipeline(cfg, [
        ['LRANGE', `topk:checkpoints:${run}`, '0', '-1']
      ]);

      const checkpoints = (entries || []).map(function (e) {
        try { return JSON.parse(e); } catch (_) { return { raw: e }; }
      });

      const last = checkpoints[checkpoints.length - 1];
      const staleMs = last ? Date.now() - new Date(last.at).getTime() : null;

      return res.status(200).json({
        run: run,
        count: checkpoints.length,
        lastPhase: last ? last.phase : null,
        lastStatus: last ? last.status : null,
        secondsSinceLastCheckpoint: staleMs == null ? null : Math.round(staleMs / 1000),
        checkpoints: checkpoints
      });
    } catch (err) {
      console.error('Checkpoint read error:', err);
      return res.status(502).json({ message: 'Could not read checkpoints.' });
    }
  }

  // ---------- POST: write a checkpoint ----------
  if (req.method === 'POST') {
    const secret = process.env.UPDATE_SECRET;
    const auth = req.headers['authorization'];
    if (!secret || auth !== `Bearer ${secret}`) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { run, phase, status, detail } = req.body || {};
    if (!run || !phase) {
      return res.status(400).json({ message: 'run and phase are required' });
    }

    const entry = JSON.stringify({
      phase: phase,
      status: status || 'ok',
      detail: detail || '',
      at: new Date().toISOString()
    });

    try {
      await redisPipeline(cfg, [
        ['SET', 'topk:run:current', String(run), 'EX', String(TTL_SECONDS)],
        ['RPUSH', `topk:checkpoints:${run}`, entry],
        ['EXPIRE', `topk:checkpoints:${run}`, String(TTL_SECONDS)]
      ]);
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('Checkpoint write error:', err);
      return res.status(502).json({ message: 'Could not store checkpoint.' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
