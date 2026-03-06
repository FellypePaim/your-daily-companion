import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
    const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY");
    const EVOLUTION_INSTANCE = Deno.env.get("EVOLUTION_API_INSTANCE");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");

    if (!EVOLUTION_URL || !EVOLUTION_KEY || !EVOLUTION_INSTANCE || !SUPABASE_URL) {
      throw new Error("Missing required environment variables");
    }

    const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;

    const resp = await fetch(`${EVOLUTION_URL}/webhook/set/${EVOLUTION_INSTANCE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: EVOLUTION_KEY,
      },
      body: JSON.stringify({
        webhook: {
          url: webhookUrl,
          webhook_by_events: false,
          webhook_base64: true,
          enabled: true,
          events: [
            "MESSAGES_UPSERT",
          ],
        },
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      console.error("Evolution API webhook set error:", resp.status, JSON.stringify(data));
      throw new Error(`Evolution API error: ${resp.status} - ${JSON.stringify(data)}`);
    }

    console.log("Webhook configured successfully:", JSON.stringify(data));

    return new Response(
      JSON.stringify({
        ok: true,
        webhookUrl,
        instance: EVOLUTION_INSTANCE,
        response: data,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("setup-evolution-webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});