import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getConfig() {
  const url = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
  const key = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_API_INSTANCE");
  if (!url || !key || !instance) throw new Error("Evolution API credentials not configured");
  return { url, key, instance };
}

async function evoFetch(path: string, method = "GET", body?: unknown) {
  const { url, key } = getConfig();
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", apikey: key },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${url}${path}`, opts);
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action } = await req.json();
    const { instance } = getConfig();

    let result: unknown;

    switch (action) {
      case "status": {
        // Get instance connection status
        const { ok, data } = await evoFetch(`/instance/connectionState/${instance}`);
        if (!ok) {
          // Instance might not exist, try to fetch info
          const info = await evoFetch(`/instance/fetchInstances?instanceName=${instance}`);
          result = { state: "close", instance: info.data };
        } else {
          result = data;
        }
        break;
      }

      case "qrcode": {
        // Get QR code for connecting
        const { ok, data } = await evoFetch(`/instance/connect/${instance}`);
        if (!ok) throw new Error(`QR code error: ${JSON.stringify(data)}`);
        result = data;
        break;
      }

      case "restart": {
        // Restart instance
        const { ok, data } = await evoFetch(`/instance/restart/${instance}`, "PUT");
        result = { ok, data };
        break;
      }

      case "logout": {
        // Logout/disconnect WhatsApp
        const { ok, data } = await evoFetch(`/instance/logout/${instance}`, "DELETE");
        result = { ok, data };
        break;
      }

      case "setup_webhook": {
        // Configure webhook
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const webhookUrl = `${SUPABASE_URL}/functions/v1/whatsapp-webhook`;
        const { ok, data } = await evoFetch(`/webhook/set/${instance}`, "POST", {
          webhook: {
            url: webhookUrl,
            webhook_by_events: false,
            webhook_base64: true,
            enabled: true,
            events: ["MESSAGES_UPSERT"],
          },
        });
        result = { ok, data, webhookUrl };
        break;
      }

      default:
        return new Response(JSON.stringify({ error: "Invalid action" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("evolution-api error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
