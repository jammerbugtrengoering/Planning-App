export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Only POST allowed', { status: 405 });
  }

  try {
    let bodyData = {};
    
    if (req.body) {
      if (typeof req.body === 'string') {
        bodyData = JSON.parse(req.body);
      } else if (Buffer.isBuffer(req.body)) {
        bodyData = JSON.parse(req.body.toString());
      } else {
        bodyData = req.body;
      }
    }
    
    const { email, name, subject, html } = bodyData;
    const brevoKey = process.env.VITE_BREVO_API_KEY;

    if (!brevoKey) {
      return new Response(JSON.stringify({ error: 'API key missing' }), { status: 500 });
    }

    // Send via Brevo
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': brevoKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: [{ email, name }],
        subject,
        htmlContent: html
      })
    });

    if (response.ok || response.status === 201) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } else {
      const error = await response.json();
      return new Response(JSON.stringify({ error }), { status: response.status });
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 400 });
  }
};