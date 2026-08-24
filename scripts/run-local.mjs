// Local pipeline runner — uses Claude Code CLI (Pro subscription) instead of
// the Anthropic API. Identical orchestration to run.mjs, just a different
// synthesis step that shells out to `npx @anthropic-ai/claude-code -p`.
//
// Run with:  node scripts/run-local.mjs [--skip-email]
//
// Requires:  Node 20+, claude code CLI auth (logged in via `claude /login`)
// IMPORTANT: Do not set ANTHROPIC_API_KEY in the environment — Claude Code Pro
// uses OAuth. A stale API key with no credits will override OAuth auth.

import { mkdir, writeFile } from 'node:fs/promises';
import { writeFileSync, unlinkSync, createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gather } from './fetch-sources.mjs';
import { renderPage, renderEmail } from './render.mjs';
import { publishBrief, verifyPublished, sendCampaign } from './publish.mjs';

const TZ = 'Asia/Kolkata';
const skipEmail = process.argv.includes('--skip-email');

const SCHEMA_NOTE = `Return ONLY a JSON object, no prose and no markdown fence, matching:
{
  "summary": "one short line, max 60 chars, for the site metadata",
  "stackChanges": [ { "kind": "price|GA|breaking|new|tooling", "title": "...", "detail": "one or two sentences" } ],
  "headlines": [ { "group": "Model & API changes|Dev tooling & agents|Leaderboard movement|Product & competitive|Applied research & policy", "title": "...", "why": "one line on why it matters to a builder", "url": "..." } ],
  "deepDives": [ { "kicker": "one word, e.g. cost / architecture / risk", "title": "...", "paragraphs": ["...","..."], "callout": "one sentence worth pulling out", "sources": [ {"label":"...","url":"..."} ] } ]
}`;

function today() {
  const now = new Date();
  const f = o => new Intl.DateTimeFormat('en-US', { timeZone: TZ, ...o }).format(now);
  const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
  const weekday = f({ weekday: 'long' });
  const monthDay = f({ month: 'long', day: 'numeric', year: 'numeric' });
  return { isoDate, weekday, monthDay, dateLine: `${weekday}, ${monthDay}` };
}

function coverageFrom(sources) {
  const byTier = {};
  for (const s of sources) (byTier[s.tier] ??= []).push(s);
  const rows = Object.entries(byTier).map(([tier, list]) => {
    const ok = list.filter(s => s.status === 'ok');
    return {
      status: ok.length ? 'ok' : 'fail',
      label: tier,
      detail: `${ok.length}/${list.length} sources returned items`,
    };
  });
  for (const s of sources.filter(s => s.status !== 'ok')) {
    rows.push({ status: s.status === 'fail' ? 'fail' : 'skip', label: new URL(s.url).hostname.replace(/^www\./, ''), detail: s.reason });
  }
  return rows;
}

async function synthesizeLocal({ items, dateLine }) {
  const corpus = items
    .filter(s => s.items.length)
    .map(s => `### ${s.tier.toUpperCase()} — ${s.url}\n` +
      s.items.map(i => `- ${i.title}${i.link ? ` [${i.link}]` : ''}${i.summary ? `\n  ${i.summary}` : ''}`).join('\n'))
    .join('\n\n');

  const prompt = `You are producing "Top-K", a daily AI brief for engineers and PMs who ship products with AI models — not researchers. Today is ${dateLine}.

INCLUSION TEST. An item earns a place only if it answers: does this change what I build, what it costs, or what I can promise? Cut funding-round trivia, lab palace-intrigue, and AI-safety discourse unless it carries a concrete build implication.

WHAT TO PRODUCE.
- stackChanges: 4-6 platform changes a builder should act on — pricing, deprecations, breaking changes, GA promotions. This is the most actionable section; prefer changelog sources.
- headlines: 12-15 items with the groups given in the schema. Each "why" is ONE line, concrete, and about consequences for a builder. Roughly: 30% model/API changes, 20% dev tooling and agents, 15% leaderboard movement, 15% product/competitive, 10% applied research, 10% policy. For leaderboards report MOVEMENT and notable standings, not exhaustive rankings.
- deepDives: exactly 2. Pick by architecture or pricing impact, a shift in what is technically possible, an invalidated assumption, or regulatory precedent — NOT by "biggest headline". Enter from the engineering problem, teach the idea, then say why it matters and what to watch. 4-6 paragraphs each. Attribute opinions to people by name. Where analysts disagree, say so. Cross-check enthusiastic claims against the counterweight sources.

RULES.
- Cite the primary source URL for the underlying event. Credit aggregators and analysts for framing, not for the fact.
- Use only URLs that appear in the material below. Never invent one.
- Do not editorialise about AI generally. Be factual, information-dense, specific.
- No emoji.

${SCHEMA_NOTE}

MATERIAL:

${corpus.slice(0, 220000)}`;

  console.log('[synthesize] invoking Claude Code CLI...');

  const tmpFile = join(tmpdir(), `topk-prompt-${Date.now()}.txt`);
  writeFileSync(tmpFile, prompt, 'utf8');

  const proc = spawn('npx', ['@anthropic-ai/claude-code', '-p'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    shell: true,
    env: { ...process.env },
  });

  const stdinStream = createReadStream(tmpFile);
  stdinStream.pipe(proc.stdin);

  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (d) => (stdout += d));
  proc.stderr.on('data', (d) => (stderr += d));

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Claude Code CLI timed out after 180s'));
    }, 180000);
    proc.on('close', (c) => { clearTimeout(timer); resolve(c); });
    proc.on('error', (err) => { clearTimeout(timer); reject(err); });
  });

  unlinkSync(tmpFile);

  if (code !== 0) {
    throw new Error(`Claude Code CLI failed (exit ${code}): ${stderr.slice(0, 500)}`);
  }

  const text = stdout.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');

  const jsonText = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  let brief;
  try {
    brief = JSON.parse(jsonText);
  } catch {
    const m = jsonText.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`Claude did not return JSON. First 400 chars: ${text.slice(0, 400)}`);
    brief = JSON.parse(m[0]);
  }

  if (!brief.headlines?.length) throw new Error('Synthesis returned no headlines');
  if (!brief.deepDives?.length) throw new Error('Synthesis returned no deep-dives');

  console.log(`[synthesize] ${brief.headlines.length} headlines, ${brief.deepDives.length} deep-dives, ${brief.stackChanges?.length ?? 0} stack changes`);
  return brief;
}

async function main() {
  const ctx = { ...today(), siteBase: process.env.SITE_BASE || 'https://topk-site.vercel.app' };
  console.log(`[run] Top-K (local) for ${ctx.dateLine}`);

  const sources = await gather();
  const brief = await synthesizeLocal({ items: sources, dateLine: ctx.dateLine });

  const coverage = coverageFrom(sources);
  const page = renderPage(brief, { ...ctx, coverage });
  const email = renderEmail(brief, ctx);

  await mkdir('out', { recursive: true });
  await writeFile(`out/brief-${ctx.isoDate}.html`, page);
  await writeFile(`out/email-${ctx.isoDate}.html`, email);
  await writeFile(`out/brief-${ctx.isoDate}.json`, JSON.stringify(brief, null, 2));
  console.log(`[run] built ${Buffer.byteLength(page)} bytes`);

  await publishBrief(page, { siteBase: ctx.siteBase, secret: process.env.UPDATE_SECRET, isoDate: ctx.isoDate, summary: brief.summary });
  await verifyPublished({ siteBase: ctx.siteBase, isoDate: ctx.isoDate, expectedBytes: Buffer.byteLength(page) });

  if (skipEmail) {
    console.log('[email] skipped (local --skip-email flag)');
    return;
  }

  await sendCampaign({
    emailHtml: email,
    isoDate: ctx.isoDate,
    dateLine: ctx.dateLine,
    groupId: process.env.MAILERLITE_GROUP_ID,
    fromEmail: process.env.FROM_EMAIL || 'tanisharas@gmail.com',
  });
  console.log('[run] done');
}

main().catch(err => {
  console.error(`[run] FAILED: ${err.message}`);
  process.exit(1);
});
