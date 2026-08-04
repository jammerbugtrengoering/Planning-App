export default async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    // Parse body from string
    let body;
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body;
    }

    console.log("📥 Body:", body);
    
    const { email, name, subject, html } = body;
    const brevoKey = process.env.VITE_BREVO_API_KEY;

    console.log("🔑 Key exists:", !!brevoKey);

    if (!brevoKey) {
      return new Response(JSON.stringify({ error: 'API key missing' }), { status: 500 });
    }

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
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: error.toString() }), { status: 500 });
  }
};