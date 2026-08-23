// Vercel Serverless Function — /api/latest
//
// This route now HOSTS the brief itself, rather than redirecting to a
// Claude artifact. Claude artifacts are private by default — a fresh
// artifact published daily would need to be manually re-shared every
// day for outside visitors to see it, which defeats automation. So the
// full brief HTML is uploaded here (chunked, since only GET requests
// are reliable from the pipeline environment) and served directly.
//
// GET (serve):      /api/latest
//   Serves the stored brief as text/html. Falls back to a placeholder
//   page if nothing is stored yet.
//
// GET (peek):        /api/latest?peek=1
//   Returns metadata (not the full HTML) as JSON: stored, date, summary,
//   length, updatedAt, sourceArtifact.
//
// GET (chunk upload): /api/latest?chunk=1&run=ID&idx=N&data=BASE64URL&token=...
//   Appends one chunk of base64url-encoded UTF-8 bytes to a pending
//   upload for `run`. Chunks are concatenated as raw bytes (not
//   strings) at finish time, so multi-byte characters split across a
//   chunk boundary are still decoded correctly.
//
// GET (finish):       /api/latest?finish=1&run=ID&token=...&summary=...&date=...&sourceArtifact=...
//   Assembles all chunks for `run` into the final HTML, stores it as
//   the live brief, and clears the chunk buffer.
//
// Env vars: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, UPDATE_SECRET

const TTL_SECONDS = 172800; // 48h
const CHUNK_TTL_SECONDS = 3600; // pending uploads expire in 1h if never finished

const PLACEHOLDER_HTML = `<!doctype html><html><head><meta charset="utf-8">
<title>Top-K — no brief yet</title></head>
<body style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 24px;color:#1A1C20">
<h1 style="font-size:1.4rem">No brief published yet</h1>
<p style="color:#5B6067">Today's Top-K brief hasn't been generated yet. Check back soon.</p>
</body></html>`;

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

function checkAuth(req) {
  const secret = process.env.UPDATE_SECRET;
  return !!secret && req.query.token === secret;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Content-Type', 'application/json');
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const cfg = redisConfig();
  if (!cfg) {
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ message: 'Storage not configured.' });
  }

  // ---------- chunk upload ----------
  if (req.query.chunk) {
    res.setHeader('Content-Type', 'application/json');
    if (!checkAuth(req)) return res.status(401).json({ message: 'Unauthorized' });

    const { run, idx, data } = req.query;
    if (!run || idx === undefined || !data) {
      return res.status(400).json({ message: 'run, idx, and data are required' });
    }
    try {
      await redisPipeline(cfg, [
        ['RPUSH', `topk:pending:${run}`, data],
        ['EXPIRE', `topk:pending:${run}`, String(CHUNK_TTL_SECONDS)]
      ]);
      return res.status(200).json({ ok: true, run, idx: Number(idx) });
    } catch (err) {
      console.error('Chunk upload error:', err);
      return res.status(502).json({ message: 'Could not store chunk.' });
    }
  }

  // ---------- finish upload ----------
  if (req.query.finish) {
    res.setHeader('Content-Type', 'application/json');
    if (!checkAuth(req)) return res.status(401).json({ message: 'Unauthorized' });

    const { run, summary, date, sourceArtifact } = req.query;
    if (!run) return res.status(400).json({ message: 'run is required' });

    try {
      const [{ result: chunks }] = await redisPipeline(cfg, [
        ['LRANGE', `topk:pending:${run}`, '0', '-1']
      ]);
      if (!chunks || chunks.length === 0) {
        return res.status(400).json({ message: 'No chunks found for this run.' });
      }

      const buffers = chunks.map(c => Buffer.from(c, 'base64url'));
      const html = Buffer.concat(buffers).toString('utf-8');

      const meta = JSON.stringify({
        summary: summary || '',
        date: date || new Date().toISOString().slice(0, 10),
        sourceArtifact: sourceArtifact || '',
        length: html.length,
        updatedAt: new Date().toISOString()
      });

      await redisPipeline(cfg, [
        ['SET', 'topk:latest:html', html, 'EX', String(TTL_SECONDS)],
        ['SET', 'topk:latest:meta', meta, 'EX', String(TTL_SECONDS)],
        ['DEL', `topk:pending:${run}`]
      ]);

      return res.status(200).json({ ok: true, run, bytes: html.length });
    } catch (err) {
      console.error('Finish upload error:', err);
      return res.status(502).json({ message: 'Could not assemble brief.', detail: String(err) });
    }
  }

  // ---------- peek: metadata only ----------
  if (req.query.peek) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    try {
      const [{ result: meta }] = await redisPipeline(cfg, [['GET', 'topk:latest:meta']]);
      if (!meta) return res.status(200).json({ stored: false });
      return res.status(200).json({ stored: true, ...JSON.parse(meta) });
    } catch (err) {
      console.error('Peek error:', err);
      return res.status(502).json({ message: 'Could not read metadata.' });
    }
  }

  // ---------- serve the brief ----------
  res.setHeader('Cache-Control', 'no-store');
  try {
    const [{ result: html }] = await redisPipeline(cfg, [['GET', 'topk:latest:html']]);
    if (html) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(html);
    }
  } catch (err) {
    console.error('Serve error:', err);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(PLACEHOLDER_HTML);
}
