export default async (req, context) => {
  if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
        }

          const { email, name, subject, html } = await req.json();
            const brevoKey = context.env.VITE_BREVO_API_KEY;

              if (!brevoKey) {
                  return new Response(JSON.stringify({ error: 'BREVO_API_KEY not configured' }), { status: 500 });
                    }

                      try {
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
                                                                                                                                        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
                                                                                                                                          }
                                                                                                                                          };
