// Turns the structured brief into (a) the standalone public HTML page and
// (b) an inline-styled email body. Kept as pure functions so the design can
// be tested locally with `node scripts/render.mjs --demo`.

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const CHIP = { price: 'c-price', GA: 'c-ga', breaking: 'c-break', new: 'c-ga', tooling: 'c-board' };

function bars(kept, total) {
  const n = Math.min(total, 18), k = Math.min(kept, n);
  return Array.from({ length: n }, (_, i) => {
    const h = Math.max(2, Math.round(34 * Math.pow(0.82, i)));
    return `<i class="${i < 5 ? 'k' : ''}" style="height:${h}px"></i>`;
  }).join('');
}

export function renderPage(brief, ctx) {
  const { dateLine, weekday, monthDay, isoDate, coverage } = ctx;
  const groups = [...new Set(brief.headlines.map(h => h.group))];
  let n = 0;

  const headlineHtml = groups.map(g => {
    const rows = brief.headlines.filter(h => h.group === g).map(h => {
      n += 1;
      return `<div class="row"><div class="n">${String(n).padStart(2, '0')}</div><div><b>${esc(h.title)}</b><p>${esc(h.why)}${h.url ? ` <a href="${esc(h.url)}">&rarr; source</a>` : ''}</p></div></div>`;
    }).join('');
    return `<div class="grp">${esc(g)}</div>${rows}`;
  }).join('');

  const stackHtml = (brief.stackChanges || []).map(c =>
    `<div class="card"><span class="chip ${CHIP[c.kind] || 'c-board'}">${esc(c.kind)}</span><b>${esc(c.title)}</b><span>${esc(c.detail)}</span></div>`
  ).join('');

  const diveHtml = (brief.deepDives || []).map((d, i) => {
    const paras = (d.paragraphs || []);
    const mid = Math.min(2, paras.length);
    const body = [
      ...paras.slice(0, mid).map(p => `<p>${esc(p)}</p>`),
      d.callout ? `<div class="call"><p>${esc(d.callout)}</p></div>` : '',
      ...paras.slice(mid).map(p => `<p>${esc(p)}</p>`),
    ].join('');
    const src = (d.sources || []).map(s => `<a href="${esc(s.url)}">${esc(s.label)}</a>`).join(' &middot; ');
    return `<div class="dive"><div class="kick">Deep-dive ${String(i + 1).padStart(2, '0')}${d.kicker ? ` &middot; ${esc(d.kicker)}` : ''}</div><h3>${esc(d.title)}</h3>${body}${src ? `<div class="src">Sources: ${src}</div>` : ''}</div>`;
  }).join('');

  const logHtml = coverage.map(c =>
    `<div><span class="${c.status === 'ok' ? 'ok' : c.status === 'fail' ? 'fail' : 'skip'}">$ ${c.status.padEnd(4)}</span> ${esc(c.label.padEnd(18))} ${esc(c.detail)}</div>`
  ).join('');

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Top-K &mdash; ${esc(isoDate)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Martian+Mono:wght@400;600;800&family=Public+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--paper:#F3F5F7;--paper-raised:#FFFFFF;--ink:#1A1C20;--ink-dim:#5B6067;--ink-faint:#8B9098;--line:#DBE0E4;--line-strong:#C3C9CE;--accent:#B9791A;--accent-strong:#8F5B10;--accent-tint:#FBEED9;--good:#2E7D6B;--good-tint:#E1F0EB;--warn:#A6461E;--warn-tint:#F7E6DD;--mono-tint:#EAEDF0;}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#15171B;--paper-raised:#1C1F24;--ink:#E9EBED;--ink-dim:#A2A8AF;--ink-faint:#6C7178;--line:#2A2E34;--line-strong:#383D44;--accent:#EFAE3E;--accent-strong:#F4C263;--accent-tint:#362A13;--good:#57B39D;--good-tint:#172622;--warn:#D98455;--warn-tint:#2C1D14;--mono-tint:#20242A;}}
:root[data-theme="dark"]{--paper:#15171B;--paper-raised:#1C1F24;--ink:#E9EBED;--ink-dim:#A2A8AF;--ink-faint:#6C7178;--line:#2A2E34;--line-strong:#383D44;--accent:#EFAE3E;--accent-strong:#F4C263;--accent-tint:#362A13;--good:#57B39D;--good-tint:#172622;--warn:#D98455;--warn-tint:#2C1D14;--mono-tint:#20242A;}
*{box-sizing:border-box}
body{background:var(--paper);color:var(--ink);font-family:"Public Sans",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;line-height:1.6;margin:0;-webkit-font-smoothing:antialiased}
.wrap{max-width:840px;margin:0 auto;padding:44px 24px 90px}
.mast{border-bottom:2px solid var(--ink);padding-bottom:18px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap}
.wordmark{font-family:"Martian Mono",ui-monospace,monospace;font-weight:800;font-size:2rem;letter-spacing:-.04em;line-height:1}
.wordmark .dot{color:var(--accent)}
.tag{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.68rem;letter-spacing:.18em;text-transform:uppercase;color:var(--ink-faint);margin-top:8px}
.date{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.85rem;color:var(--ink-dim);text-align:right}
.dist{display:flex;align-items:flex-end;gap:3px;height:34px;margin:20px 0 6px;position:relative}
.dist i{display:block;width:9px;background:var(--line-strong)}
.dist i.k{background:var(--accent)}
.cut{position:absolute;left:0;right:0;bottom:9px;border-bottom:1px dashed var(--line-strong)}
.cap{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.7rem;color:var(--ink-faint);margin-bottom:36px}
h2.sec{font-family:"Martian Mono",ui-monospace,monospace;font-weight:600;font-size:.95rem;margin:44px 0 16px;padding-bottom:8px;border-bottom:1px solid var(--line)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.card{background:var(--paper-raised);border:1px solid var(--line);padding:14px 16px}
.chip{display:inline-block;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.62rem;letter-spacing:.12em;text-transform:uppercase;padding:2px 7px;margin-bottom:8px}
.c-price{background:var(--accent-tint);color:var(--accent-strong)}
.c-ga{background:var(--good-tint);color:var(--good)}
.c-break{background:var(--warn-tint);color:var(--warn)}
.c-board{background:var(--mono-tint);color:var(--ink-dim)}
.card b{display:block;font-size:.92rem;line-height:1.4;margin-bottom:4px}
.card span{font-size:.82rem;color:var(--ink-dim);line-height:1.5}
.grp{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-strong);margin:26px 0 10px}
.row{display:grid;grid-template-columns:38px 1fr;gap:14px;padding:13px 0;border-bottom:1px solid var(--line)}
.n{font-family:"Martian Mono",ui-monospace,monospace;font-weight:800;font-size:.95rem;color:var(--accent);font-variant-numeric:tabular-nums;padding-top:2px}
.row b{font-size:1rem;line-height:1.4;display:block}
.row p{margin:3px 0 0;font-size:.9rem;color:var(--ink-dim);line-height:1.55}
.row a{color:var(--accent-strong);font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.78rem;text-decoration:none;white-space:nowrap}
.row a:hover{text-decoration:underline}
.dive{background:var(--paper-raised);border:1px solid var(--line);padding:30px 32px;margin:20px 0}
.kick{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.68rem;letter-spacing:.16em;text-transform:uppercase;color:var(--accent-strong);margin-bottom:10px}
.dive h3{font-family:"Martian Mono",ui-monospace,monospace;font-weight:600;font-size:1.32rem;line-height:1.25;letter-spacing:-.02em;margin:0 0 16px;text-wrap:balance}
.dive p{font-size:.97rem;color:var(--ink-dim);max-width:65ch;margin:0 0 14px}
.call{background:var(--mono-tint);border-left:3px solid var(--accent);padding:14px 18px;margin:18px 0}
.call p{margin:0;font-size:.92rem}
.src{border-top:1px solid var(--line);margin-top:20px;padding-top:12px;font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.74rem;color:var(--ink-faint);line-height:1.9;word-break:break-word}
.src a{color:var(--accent-strong);text-decoration:none}
.log{background:var(--mono-tint);border:1px solid var(--line);font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.76rem;padding:16px 18px;margin-top:14px;overflow-x:auto;line-height:1.85}
.log div{white-space:pre}
.ok{color:var(--good)}.fail{color:var(--warn)}.skip{color:var(--ink-faint)}
footer{margin-top:46px;padding-top:18px;border-top:2px solid var(--ink);font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:.72rem;color:var(--ink-faint);line-height:1.9}
@media(max-width:560px){.wrap{padding:32px 18px 70px}.dive{padding:22px 20px}.row{grid-template-columns:30px 1fr;gap:10px}}
</style></head><body><div class="wrap">
<div class="mast"><div><div class="wordmark">TOP<span class="dot">&middot;</span>K</div><div class="tag">Signal, ranked &mdash; the daily AI brief for builders</div></div><div class="date">${esc(weekday)}<br>${esc(monthDay)}</div></div>
<div class="dist"><span class="cut"></span>${bars(brief.headlines.length, 18)}</div>
<div class="cap">${brief.headlines.length} kept &middot; cutoff at the line</div>
${stackHtml ? `<h2 class="sec">What changed in your stack</h2><div class="cards">${stackHtml}</div>` : ''}
<h2 class="sec">Headlines</h2>${headlineHtml}
<h2 class="sec">Deep-dives</h2>${diveHtml}
<h2 class="sec">Coverage log</h2><div class="log">${logHtml}</div>
<footer>Top-K &mdash; a daily brief for people who ship with AI models.<br>Inclusion test: does this change what you build, what it costs, or what you can promise?<br>Aggregation-first &mdash; cited to the primary source where one exists.</footer>
</div></body></html>`;
}

// Email clients don't reliably support external stylesheets or CSS
// variables, so every style here is inlined by hand.
export function renderEmail(brief, ctx) {
  const { dateLine, siteBase } = ctx;
  const link = `${siteBase}/api/latest`;

  const heads = brief.headlines.map((h, i) =>
    `<div style="margin-bottom:16px"><div style="font-weight:700;font-size:15px;color:#1A1C20;line-height:1.4">${String(i + 1).padStart(2, '0')}. ${esc(h.title)}</div><div style="font-size:13px;color:#5B6067;line-height:1.5;margin-top:2px">${esc(h.why)}${h.url ? ` <a href="${esc(h.url)}" style="color:#8F5B10">&rarr; source</a>` : ''}</div></div>`
  ).join('');

  const dives = brief.deepDives.map(d =>
    `<div style="background:#EAEDF0;border-left:3px solid #B9791A;padding:14px 16px;margin-bottom:12px"><div style="font-weight:700;font-size:14px;color:#1A1C20">${esc(d.title)}</div><div style="font-size:13px;color:#5B6067;line-height:1.5;margin-top:6px">${esc((d.paragraphs || [])[0] || '')}</div></div>`
  ).join('');

  return `<div style="background:#F3F5F7;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #DBE0E4">
<div style="padding:28px 28px 20px;border-bottom:2px solid #1A1C20">
<div style="font-family:'Courier New',monospace;font-weight:800;font-size:28px;letter-spacing:-0.5px;color:#1A1C20">TOP<span style="color:#B9791A">&middot;</span>K</div>
<div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8B9098;margin-top:6px">Signal, ranked &mdash; the daily AI brief for builders</div>
<div style="font-family:'Courier New',monospace;font-size:12px;color:#5B6067;margin-top:10px">${esc(dateLine)}</div></div>
<div style="padding:22px 28px;background:#FBEED9;border-bottom:1px solid #DBE0E4">
<a href="${esc(link)}" style="color:#8F5B10;font-weight:700;font-size:15px;text-decoration:none">&rarr; View the full interactive brief</a>
<div style="color:#8F5B10;font-size:13px;margin-top:4px">${brief.headlines.length} headlines &middot; ${brief.deepDives.length} deep-dives &middot; full theming and source log</div></div>
<div style="padding:24px 28px">
<div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8B9098;margin-bottom:14px;border-bottom:1px solid #DBE0E4;padding-bottom:8px">Headlines</div>${heads}</div>
<div style="padding:4px 28px 24px">
<div style="font-family:'Courier New',monospace;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8B9098;margin-bottom:14px;border-bottom:1px solid #DBE0E4;padding-bottom:8px">Deep-dives</div>${dives}
<div style="text-align:center;margin-top:20px"><a href="${esc(link)}" style="display:inline-block;background:#B9791A;color:#FFFFFF;font-weight:700;font-size:14px;text-decoration:none;padding:12px 24px">Read the full brief &rarr;</a></div></div>
<div style="padding:20px 28px;border-top:1px solid #DBE0E4;font-family:'Courier New',monospace;font-size:11px;color:#8B9098;line-height:1.7">
Top-K &mdash; a daily brief for people who ship with AI models.<br><br>{$unsubscribe}</div>
</div></div>`;
}
