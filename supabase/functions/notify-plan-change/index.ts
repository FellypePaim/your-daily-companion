import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function sendWhatsAppMessage(phone: string, message: string) {
  const url = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
  const key = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_API_INSTANCE");
  if (!url || !key || !instance) throw new Error("Evolution API credentials not configured");

  const resp = await fetch(`${url}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ number: phone, text: message }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("Evolution API send error:", resp.status, t);
  }
  return resp;
}

const PLAN_BENEFITS: Record<string, string[]> = {
  mensal: [
    "✅ WhatsApp conectado",
    "✅ Cartões de crédito",
    "✅ Orçamentos por categoria",
    "✅ Relatórios detalhados",
    "✅ Previsões com IA",
  ],
  anual: [
    "✅ WhatsApp conectado",
    "✅ Cartões de crédito",
    "✅ Orçamentos por categoria",
    "✅ Relatórios detalhados",
    "✅ Previsões com IA",
    "✅ Modo Família (5 pessoas)",
    "✅ Análise comportamental avançada",
  ],
};

const PLAN_NAMES: Record<string, string> = {
  mensal: "Brave Mensal (R$ 19,90/mês)",
  anual: "Brave Anual (12x R$ 14,90/mês)",
  free: "Gratuito",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { newPlan, oldPlan } = body;

    if (!newPlan || newPlan === oldPlan) {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's WhatsApp link
    const [{ data: profile }, { data: waLink }] = await Promise.all([
      supabaseAdmin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("whatsapp_links").select("phone_number").eq("user_id", userId).eq("verified", true).maybeSingle(),
    ]);

    if (!waLink?.phone_number) {
      return new Response(JSON.stringify({ ok: true, no_whatsapp: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = profile?.display_name || "Usuário";
    const isUpgrade = newPlan === "anual" && oldPlan === "mensal";
    const isDowngrade = newPlan === "mensal" && oldPlan === "anual";

    const action = isUpgrade ? "upgrade" : isDowngrade ? "downgrade" : "alteração";
    const emoji = isUpgrade ? "🚀" : isDowngrade ? "📊" : "🔄";

    const benefits = PLAN_BENEFITS[newPlan] || [];
    const benefitsText = benefits.join("\n");

    const message = `${emoji} *${action.charAt(0).toUpperCase() + action.slice(1)} de plano confirmado!*\n\n` +
      `Olá, ${name}! Seu plano foi alterado com sucesso.\n\n` +
      `📋 *Novo plano:* ${PLAN_NAMES[newPlan] || newPlan}\n\n` +
      `*Seus benefícios agora:*\n${benefitsText}\n\n` +
      `💪 Continue gerenciando suas finanças com o Brave IA!\n\n` +
      `_Brave IA - Seu assessor financeiro 🤖_`;

    await sendWhatsAppMessage(waLink.phone_number, message);
    console.log(`Plan change notification sent to ${waLink.phone_number}: ${oldPlan} -> ${newPlan}`);

    return new Response(JSON.stringify({ ok: true, sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("notify-plan-change error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
