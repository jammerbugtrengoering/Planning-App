export default async (req, context) => {
  console.log("📧 Function called with:", req.method);
  
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    console.log("📥 Request body:", body);
    
    const { email, name, subject, html } = body;
    const brevoKey = process.env.VITE_BREVO_API_KEY;

    if (!brevoKey) {
      console.error("❌ VITE_BREVO_API_KEY not configured");
      return new Response(JSON.stringify({ error: 'BREVO_API_KEY not configured' }), { status: 500 });
    }

    console.log("📤 Sending email to:", email);
    
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

    console.log("📥 Brevo response:", response.status);

    if (response.ok || response.status === 201) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    } else {
      const error = await response.json();
      console.error("❌ Brevo error:", error);
      return new Response(JSON.stringify({ error }), { status: response.status });
    }
  } catch (error) {
    console.error('❌ Function error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
};