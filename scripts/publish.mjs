// Publishing and delivery. On a GitHub runner these are ordinary HTTPS
// calls — the whole chunked-upload apparatus the old pipeline needed is
// replaced by a single POST.

export async function publishBrief(html, { siteBase, secret, isoDate, summary }) {
  const qs = new URLSearchParams({ token: secret, date: isoDate, summary: summary || '' });
  const res = await fetch(`${siteBase}/api/latest?${qs}`, {
    method: 'POST',
    headers: { 'content-type': 'text/html; charset=utf-8' },
    body: html,
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Publish failed: HTTP ${res.status} — ${body.slice(0, 300)}`);

  let json; try { json = JSON.parse(body); } catch { throw new Error(`Publish returned non-JSON: ${body.slice(0, 200)}`); }
  if (!json.ok) throw new Error(`Publish rejected: ${body.slice(0, 300)}`);
  console.log(`[publish] stored ${json.bytes} bytes`);
  return json;
}

// Never report success from the write call alone — read it back.
export async function verifyPublished({ siteBase, isoDate, expectedBytes }) {
  const res = await fetch(`${siteBase}/api/latest?peek=1&cb=${Date.now()}`);
  const meta = await res.json();
  if (!meta.stored) throw new Error('Verification failed: nothing stored');
  if (meta.date !== isoDate) throw new Error(`Verification failed: stored date is ${meta.date}, expected ${isoDate}`);
  const drift = Math.abs((meta.length ?? 0) - expectedBytes);
  if (drift > expectedBytes * 0.02) throw new Error(`Verification failed: stored ${meta.length} bytes, expected ~${expectedBytes}`);
  console.log(`[verify] ok — ${meta.length} bytes, date ${meta.date}, updated ${meta.updatedAt}`);
  return meta;
}

const ML = 'https://connect.mailerlite.com/api';

async function ml(path, opts = {}) {
  const res = await fetch(`${ML}${path}`, {
    ...opts,
    headers: {
      authorization: `Bearer ${process.env.MAILERLITE_API_KEY}`,
      'content-type': 'application/json',
      accept: 'application/json',
      ...opts.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`MailerLite ${path} → HTTP ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

export async function sendCampaign({ emailHtml, isoDate, dateLine, groupId, fromEmail }) {
  const created = await ml('/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      name: `Top-K — ${isoDate}`,
      type: 'regular',
      groups: [String(groupId)],
      emails: [{
        subject: `Top-K — ${dateLine}`,
        from_name: 'Top-K',
        from: fromEmail,
        content: emailHtml,
      }],
    }),
  });

  const id = created?.data?.id;
  if (!id) throw new Error(`Campaign creation returned no id: ${JSON.stringify(created).slice(0, 300)}`);

  await ml(`/campaigns/${id}/schedule`, {
    method: 'POST',
    body: JSON.stringify({ delivery: 'instant' }),
  });
  console.log(`[email] campaign ${id} queued`);

  // schedule returning 200 only means "queued". Poll until MailerLite
  // reports it actually sent, so a silent non-delivery fails the run.
  for (let i = 0; i < 10; i++) {
    await new Promise(r => setTimeout(r, 15000));
    const { data } = await ml(`/campaigns/${id}`);
    console.log(`[email] status=${data.status} sent=${data.stats?.sent ?? 0}`);
    if (data.status === 'sent') return { id, sent: data.stats?.sent ?? 0 };
  }
  throw new Error(`Campaign ${id} did not reach status "sent" within 150s — check MailerLite.`);
}
