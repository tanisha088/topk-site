// Vercel Serverless Function — POST /api/subscribe
// Adds an email to the MailerLite subscriber list.
// Env vars required: MAILERLITE_API_KEY, MAILERLITE_GROUP_ID (optional)

export default async function handler(req, res) {
  // CORS — allow same-origin only in production; permissive in dev
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    console.error('MAILERLITE_API_KEY not set');
    return res.status(500).json({ message: 'Server misconfigured — email service not connected.' });
  }

  const { email } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ message: 'A valid email is required.' });
  }

  // Build the MailerLite payload
  const payload = { email: email.trim().toLowerCase() };

  // If a group ID is configured, add the subscriber to that group
  const groupId = process.env.MAILERLITE_GROUP_ID;
  if (groupId) {
    payload.groups = [groupId];
  }

  try {
    const mlRes = await fetch('https://connect.mailerlite.com/api/subscribers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const mlData = await mlRes.json();

    // 200 = existing subscriber updated, 201 = new subscriber created
    if (mlRes.status === 200) {
      // Already existed — still a success, just tell the frontend
      return res.status(200).json({ code: 'already_subscribed', message: "You're already on the list." });
    }

    if (mlRes.status === 201) {
      // Fetch updated count
      const count = await getSubscriberCount(apiKey);
      return res.status(200).json({ ok: true, count });
    }

    // MailerLite returned an error
    console.error('MailerLite error:', mlRes.status, mlData);
    return res.status(502).json({ message: 'Could not add you right now — try again in a moment.' });

  } catch (err) {
    console.error('Subscribe error:', err);
    return res.status(500).json({ message: 'Something went wrong on our end.' });
  }
}

async function getSubscriberCount(apiKey) {
  try {
    const r = await fetch('https://connect.mailerlite.com/api/subscribers?limit=0&filter[status]=active', {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });
    const d = await r.json();
    return d.total ?? null;
  } catch {
    return null;
  }
}
