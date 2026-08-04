export default async (req) => {
  console.log("Function called");
  console.log("Method:", req.method);
  console.log("Headers:", req.headers);
  
  if (req.method !== 'POST') {
    return new Response('Only POST allowed', { status: 405 });
  }

  try {
    // Netlify Functions passes body as is - could be Buffer or string
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
    
    console.log("Body:", JSON.stringify(bodyData));
    
    // For now just return success to test
    return new Response(JSON.stringify({ success: true, received: bodyData }), { status: 200 });
  } catch (err) {
    console.error("Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 400 });
  }
};