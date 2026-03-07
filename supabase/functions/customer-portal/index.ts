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
    if (userError || !userData.user?.email) throw new Error("Usuário não autenticado");

    const user = userData.user;
    const asaasKey = Deno.env.get("ASAAS_API_KEY");
    if (!asaasKey) throw new Error("ASAAS_API_KEY não configurada");

    // Find customer by email
    const searchRes = await fetch(`${ASAAS_API}/customers?email=${encodeURIComponent(user.email!)}`, {
      headers: { "access_token": asaasKey },
    });
    const searchData = await searchRes.json();

    if (!searchData.data || searchData.data.length === 0) {
      // No Asaas customer yet — return a message instead of throwing
      return new Response(JSON.stringify({ error: "Você ainda não possui cobranças. Assine um plano para acessar o portal de pagamentos.", noCustomer: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = searchData.data[0].id;

    // Find active subscriptions for this customer
    const subsRes = await fetch(`${ASAAS_API}/subscriptions?customer=${customerId}`, {
      headers: { "access_token": asaasKey },
    });
    const subsData = await subsRes.json();

    // Get the most recent active subscription's payments
    let portalUrl = "";
    if (subsData.data && subsData.data.length > 0) {
      const activeSub = subsData.data.find((s: any) => s.status === "ACTIVE") || subsData.data[0];
      
      const paymentsRes = await fetch(`${ASAAS_API}/subscriptions/${activeSub.id}/payments?limit=1&sort=dueDate&order=desc`, {
        headers: { "access_token": asaasKey },
      });
      const paymentsData = await paymentsRes.json();

      if (paymentsData.data && paymentsData.data.length > 0) {
        portalUrl = paymentsData.data[0].invoiceUrl || "";
      }
    }

    if (!portalUrl) {
      const paymentsRes = await fetch(`${ASAAS_API}/payments?customer=${customerId}&limit=1&sort=dueDate&order=desc`, {
        headers: { "access_token": asaasKey },
      });
      const paymentsData = await paymentsRes.json();
      if (paymentsData.data && paymentsData.data.length > 0) {
        portalUrl = paymentsData.data[0].invoiceUrl || "";
      }
    }

    if (!portalUrl) {
      return new Response(JSON.stringify({ error: "Nenhuma cobrança encontrada ainda. Assine um plano primeiro.", noPayments: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    console.log(`Portal Asaas para user=${user.id}`);

    return new Response(JSON.stringify({ url: portalUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("customer-portal error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
