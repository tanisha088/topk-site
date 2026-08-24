// Fetch every source in parallel and reduce each to a compact list of
// recent items. Runs on a normal GitHub runner, so this is plain fetch()
// against the real internet: no proxy, no chunking, no approval gates.
import { SOURCES } from './sources.mjs';

const TIMEOUT_MS = 20000;
const MAX_ITEMS_PER_SOURCE = 12;
const MAX_AGE_DAYS = 4;

function stripTags(s = '') {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, m => {
      const map = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
      if (map[m.toLowerCase()]) return map[m.toLowerCase()];
      const num = m.match(/&#(\d+);/); if (num) return String.fromCharCode(+num[1]);
      return ' ';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? stripTags(m[1]) : '';
};

// Minimal RSS + Atom reader. Deliberately dependency-free: one less
// thing that can break a 7am run because of a transitive package bump.
function parseFeed(xml) {
  const blocks = [
    ...xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s>][\s\S]*?<\/entry>/gi),
  ].map(m => m[0]);

  return blocks.map(b => {
    let link = tag(b, 'link');
    if (!link) {
      const href = b.match(/<link[^>]*href=["']([^"']+)["']/i);
      link = href ? href[1] : '';
    }
    return {
      title: tag(b, 'title'),
      link,
      date: tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || '',
      summary: (tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')).slice(0, 600),
    };
  }).filter(i => i.title);
}

function parseHackerNews(json) {
  return (json.hits || []).map(h => ({
    title: h.title || h.story_title || '',
    link: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
    date: h.created_at || '',
    summary: `${h.points ?? 0} points, ${h.num_comments ?? 0} comments`,
    points: h.points ?? 0,
  })).filter(i => i.title && (i.points ?? 0) >= 8);
}

// Changelog and leaderboard pages are HTML, not feeds. We don't try to
// parse them structurally — we hand a text slice to the model, which is
// far more robust to markup churn than a scraper would be.
function parseHtmlPage(html) {
  const body = stripTags(html.replace(/<(script|style|nav|footer|svg)[\s\S]*?<\/\1>/gi, ' '));
  return [{ title: '(page text)', link: '', date: '', summary: body.slice(0, 6000) }];
}

function recentEnough(item) {
  if (!item.date) return true;          // undated: let the model judge
  const t = Date.parse(item.date);
  if (Number.isNaN(t)) return true;
  return (Date.now() - t) / 86400000 <= MAX_AGE_DAYS;
}

async function fetchOne(src) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(src.url, {
      signal: ctl.signal,
      headers: { 'user-agent': 'Top-K/1.0 (+https://topk-site.vercel.app)', accept: '*/*' },
    });
    if (!res.ok) return { ...src, status: 'fail', reason: `HTTP ${res.status}`, items: [] };

    const ctype = res.headers.get('content-type') || '';
    const text = await res.text();

    let items;
    if (src.url.includes('hn.algolia.com')) items = parseHackerNews(JSON.parse(text));
    else if (ctype.includes('xml') || text.trimStart().startsWith('<?xml') || /<(rss|feed)[\s>]/i.test(text)) items = parseFeed(text);
    else items = parseHtmlPage(text);

    items = items.filter(recentEnough).slice(0, MAX_ITEMS_PER_SOURCE);
    return { ...src, status: items.length ? 'ok' : 'thin', reason: items.length ? '' : 'no recent items', items };
  } catch (err) {
    return { ...src, status: 'fail', reason: err.name === 'AbortError' ? 'timeout' : String(err.message || err), items: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function gather() {
  const results = await Promise.all(SOURCES.map(fetchOne));
  const ok = results.filter(r => r.status === 'ok').length;
  console.log(`[gather] ${ok}/${results.length} sources returned items`);
  for (const r of results) {
    if (r.status !== 'ok') console.log(`[gather] ${r.status.padEnd(4)} ${r.url} ${r.reason}`);
  }
  if (ok < 5) throw new Error(`Only ${ok} sources returned usable items — refusing to build a brief on this little input.`);
  return results;
}
