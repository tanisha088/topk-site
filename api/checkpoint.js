// Vercel Serverless Function — /api/checkpoint
//
// GET (write):  /api/checkpoint?run=...&phase=...&status=ok&detail=...&token=...
//   Records one checkpoint. Query-string GET rather than POST because the
//   pipeline environment cannot reliably make raw outbound POST requests —
//   only tool-mediated GET fetches reach the network there.
//
// GET (read):   /api/checkpoint?run=<id>   or   /api/checkpoint  (latest run)
//   Returns the checkpoint log for a run.
//
// POST: kept as a secondary write path in case a future environment can use it.
//
// Env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, UPDATE_SECRET

const TTL_SECONDS = 259200; // 3 days

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

async function writeCheckpoint(cfg, { run, phase, status, detail }) {
  const entry = JSON.stringify({
    phase: phase,
    status: status || 'ok',
    detail: detail || '',
    at: new Date().toISOString()
  });
  await redisPipeline(cfg, [
    ['SET', 'topk:run:current', String(run), 'EX', String(TTL_SECONDS)],
    ['RPUSH', `topk:checkpoints:${run}`, entry],
    ['EXPIRE', `topk:checkpoints:${run}`, String(TTL_SECONDS)]
  ]);
}

async function readCheckpoints(cfg, run) {
  let targetRun = run;
  if (!targetRun) {
    const [{ result: lastRun }] = await redisPipeline(cfg, [['GET', 'topk:run:current']]);
    targetRun = lastRun;
  }
  if (!targetRun) return { run: null, checkpoints: [] };

  const [{ result: entries }] = await redisPipeline(cfg, [
    ['LRANGE', `topk:checkpoints:${targetRun}`, '0', '-1']
  ]);
  const checkpoints = (entries || []).map(function (e) {
    try { return JSON.parse(e); } catch (_) { return { raw: e }; }
  });
  return { run: targetRun, checkpoints: checkpoints };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  const cfg = redisConfig();
  if (!cfg) {
    return res.status(500).json({ message: 'Storage not configured.' });
  }

  // ---------- GET with ?phase= : write a checkpoint (query-string form) ----------
  if (req.method === 'GET' && req.query && req.query.phase) {
    const secret = process.env.UPDATE_SECRET;
    if (!secret || req.query.token !== secret) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    const { run, phase, status, detail } = req.query;
    if (!run || !phase) {
      return res.status(400).json({ message: 'run and phase are required' });
    }
    try {
      await writeCheckpoint(cfg, { run, phase, status, detail });
      return res.status(200).json({ ok: true, via: 'get' });
    } catch (err) {
      console.error('Checkpoint write error (GET):', err);
      return res.status(502).json({ message: 'Could not store checkpoint.' });
    }
  }

  // ---------- GET (plain) : read the log ----------
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const result = await readCheckpoints(cfg, req.query.run);
      const last = result.checkpoints[result.checkpoints.length - 1];
      const staleMs = last ? Date.now() - new Date(last.at).getTime() : null;
      return res.status(200).json({
        run: result.run,
        count: result.checkpoints.length,
        lastPhase: last ? last.phase : null,
        lastStatus: last ? last.status : null,
        secondsSinceLastCheckpoint: staleMs == null ? null : Math.round(staleMs / 1000),
        checkpoints: result.checkpoints
      });
    } catch (err) {
      console.error('Checkpoint read error:', err);
      return res.status(502).json({ message: 'Could not read checkpoints.' });
    }
  }

  // ---------- POST : write a checkpoint (JSON body, secondary path) ----------
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
    try {
      await writeCheckpoint(cfg, { run, phase, status, detail });
      return res.status(200).json({ ok: true, via: 'post' });
    } catch (err) {
      console.error('Checkpoint write error (POST):', err);
      return res.status(502).json({ message: 'Could not store checkpoint.' });
    }
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
