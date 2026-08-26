import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { email, name, subject, html } = await req.json();
    const brevoKey = Deno.env.get("BREVO_API_KEY") ?? Deno.env.get("VITE_BREVO_API_KEY");

    console.log("📧 Email request:", { email, name, subject });

    if (!brevoKey) {
      console.error("❌ BREVO_API_KEY not configured");
      return new Response(
        JSON.stringify({ error: "BREVO_API_KEY not configured" }),
        { 
          status: 500, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        }
      );
    }

    // Send via Brevo
    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": brevoKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to: [{ email, name }],
        subject,
        htmlContent: html,
      }),
    });

    console.log("📤 Brevo response:", brevoResponse.status);

    if (brevoResponse.ok || brevoResponse.status === 201) {
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } else {
      const error = await brevoResponse.json();
      console.error("❌ Brevo error:", error);
      return new Response(JSON.stringify({ error }), {
        status: brevoResponse.status,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  } catch (error) {
    console.error("❌ Function error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
