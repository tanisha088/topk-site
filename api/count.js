// Vercel Serverless Function — GET /api/count
// Returns the current active subscriber count from MailerLite.
// Env vars required: MAILERLITE_API_KEY

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const apiKey = process.env.MAILERLITE_API_KEY;
  if (!apiKey) {
    return res.status(200).json({ count: null });
  }

  try {
    const r = await fetch('https://connect.mailerlite.com/api/subscribers?limit=0&filter[status]=active', {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const d = await r.json();
    return res.status(200).json({ count: d.total ?? 0 });
  } catch (err) {
    console.error('Count error:', err);
    return res.status(200).json({ count: null });
  }
}
