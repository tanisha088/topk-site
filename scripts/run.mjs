import { mkdir, writeFile } from 'node:fs/promises';
import { gather } from './fetch-sources.mjs';
import { synthesize } from './synthesize.mjs';
import { renderPage, renderEmail } from './render.mjs';
import { publishBrief, verifyPublished, sendCampaign } from './publish.mjs';

const SITE = process.env.SITE_BASE || 'https://topk-site.vercel.app';
const TZ = 'Asia/Kolkata';

// The date is computed, never copied from a reference edition — a past run
// shipped a brief labelled "Saturday" on a Sunday by doing exactly that.
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

async function main() {
  const ctx = { ...today(), siteBase: SITE };
  console.log(`[run] Top-K for ${ctx.dateLine}`);

  const sources = await gather();
  const brief = await synthesize({ items: sources, dateLine: ctx.dateLine });

  const coverage = coverageFrom(sources);
  const page = renderPage(brief, { ...ctx, coverage });
  const email = renderEmail(brief, ctx);

  // Always write artifacts before publishing, so a failed publish still
  // leaves the built brief downloadable from the workflow run.
  await mkdir('out', { recursive: true });
  await writeFile(`out/brief-${ctx.isoDate}.html`, page);
  await writeFile(`out/email-${ctx.isoDate}.html`, email);
  await writeFile(`out/brief-${ctx.isoDate}.json`, JSON.stringify(brief, null, 2));
  console.log(`[run] built ${Buffer.byteLength(page)} bytes`);

  await publishBrief(page, { siteBase: SITE, secret: process.env.UPDATE_SECRET, isoDate: ctx.isoDate, summary: brief.summary });
  await verifyPublished({ siteBase: SITE, isoDate: ctx.isoDate, expectedBytes: Buffer.byteLength(page) });

  if (process.env.SKIP_EMAIL === 'true') {
    console.log('[email] skipped by workflow input');
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
  process.exit(1);   // red X in the Actions tab, and GitHub emails you
});
