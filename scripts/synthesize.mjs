// One Anthropic API call turns the raw gathered items into the structured
// brief. This is the only step in the pipeline that genuinely needs a model.
const API = 'https://api.anthropic.com/v1/messages';

const SCHEMA_NOTE = `Return ONLY a JSON object, no prose and no markdown fence, matching:
{
  "summary": "one short line, max 60 chars, for the site metadata",
  "stackChanges": [ { "kind": "price|GA|breaking|new|tooling", "title": "...", "detail": "one or two sentences" } ],
  "headlines": [ { "group": "Model & API changes|Dev tooling & agents|Leaderboard movement|Product & competitive|Applied research & policy", "title": "...", "why": "one line on why it matters to a builder", "url": "..." } ],
  "deepDives": [ { "kicker": "one word, e.g. cost / architecture / risk", "title": "...", "paragraphs": ["...","..."], "callout": "one sentence worth pulling out", "sources": [ {"label":"...","url":"..."} ] } ]
}`;

export async function synthesize({ items, dateLine }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

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

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 500)}`);

  const data = await res.json();
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');

  // Be forgiving about a stray fence, strict about everything else.
  const jsonText = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  let brief;
  try {
    brief = JSON.parse(jsonText);
  } catch {
    const m = jsonText.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`Model did not return JSON. First 400 chars: ${text.slice(0, 400)}`);
    brief = JSON.parse(m[0]);
  }

  if (!brief.headlines?.length) throw new Error('Synthesis returned no headlines');
  if (!brief.deepDives?.length) throw new Error('Synthesis returned no deep-dives');

  console.log(`[synthesize] ${brief.headlines.length} headlines, ${brief.deepDives.length} deep-dives, ${brief.stackChanges?.length ?? 0} stack changes`);
  return brief;
}
