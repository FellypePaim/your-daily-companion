import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASAAS_API = "https://api.asaas.com/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Sem autorização");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Usuário não autenticado");

    const { paymentId } = await req.json();
    if (!paymentId) throw new Error("paymentId é obrigatório");

    const asaasKey = Deno.env.get("ASAAS_API_KEY");
    if (!asaasKey) throw new Error("ASAAS_API_KEY não configurada");

    const res = await fetch(`${ASAAS_API}/payments/${paymentId}`, {
      headers: { "access_token": asaasKey },
    });
    const payment = await res.json();

    if (payment.errors) {
      throw new Error(payment.errors[0]?.description || "Erro ao consultar pagamento");
    }

    // Verify the payment belongs to this user
    let belongsToUser = false;
    try {
      const ref = JSON.parse(payment.externalReference || "{}");
      belongsToUser = ref.user_id === userData.user.id;
    } catch { /* ignore parse errors */ }

    if (!belongsToUser) {
      throw new Error("Pagamento não encontrado para este usuário");
    }

    return new Response(JSON.stringify({
      status: payment.status,
      confirmedDate: payment.confirmedDate,
      billingType: payment.billingType,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("check-payment-status error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
