import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ASAAS_API = "https://api.asaas.com/v3";

const PLAN_CONFIG: Record<string, { value: number; cycle: string; description: string; days: number }> = {
  mensal: { value: 19.90, cycle: "MONTHLY", description: "Brave Assessor - Plano Mensal", days: 30 },
  anual: { value: 178.80, cycle: "YEARLY", description: "Brave Assessor - Plano Anual", days: 365 },
};

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
    const { plan } = await req.json();

    if (!plan || !PLAN_CONFIG[plan]) {
      throw new Error(`Plano inválido: ${plan}. Use 'mensal' ou 'anual'.`);
    }

    const asaasKey = Deno.env.get("ASAAS_API_KEY");
    if (!asaasKey) throw new Error("ASAAS_API_KEY não configurada");

    const config = PLAN_CONFIG[plan];

    // 1. Find or create customer in Asaas
    const searchRes = await fetch(`${ASAAS_API}/customers?email=${encodeURIComponent(user.email!)}`, {
      headers: { "access_token": asaasKey },
    });
    const searchData = await searchRes.json();

    let customerId: string;

    if (searchData.data && searchData.data.length > 0) {
      customerId = searchData.data[0].id;
    } else {
      // Create customer
      const createRes = await fetch(`${ASAAS_API}/customers`, {
        method: "POST",
        headers: { "access_token": asaasKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user.user_metadata?.display_name || user.email!.split("@")[0],
          email: user.email,
          externalReference: user.id,
        }),
      });
      const createData = await createRes.json();
      if (createData.errors) throw new Error(createData.errors[0]?.description || "Erro ao criar cliente no Asaas");
      customerId = createData.id;
    }

    // 2. Create subscription in Asaas
    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);
    const dueDateStr = nextDueDate.toISOString().slice(0, 10);

    const subRes = await fetch(`${ASAAS_API}/subscriptions`, {
      method: "POST",
      headers: { "access_token": asaasKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: customerId,
        billingType: "UNDEFINED", // Let customer choose (PIX, boleto, credit card)
        value: config.value,
        cycle: config.cycle,
        nextDueDate: dueDateStr,
        description: config.description,
        externalReference: JSON.stringify({ user_id: user.id, plan }),
      }),
    });
    const subData = await subRes.json();

    if (subData.errors) {
      throw new Error(subData.errors[0]?.description || "Erro ao criar assinatura no Asaas");
    }

    // 3. Get the first payment's invoice URL
    // Fetch payments for this subscription
    const paymentsRes = await fetch(`${ASAAS_API}/subscriptions/${subData.id}/payments`, {
      headers: { "access_token": asaasKey },
    });
    const paymentsData = await paymentsRes.json();

    let paymentUrl = "";
    if (paymentsData.data && paymentsData.data.length > 0) {
      paymentUrl = paymentsData.data[0].invoiceUrl || paymentsData.data[0].bankSlipUrl || "";
    }

    // If no payment URL found, use subscription invoiceUrl  
    if (!paymentUrl && subData.id) {
      // Try getting payment link directly
      const paymentId = paymentsData.data?.[0]?.id;
      if (paymentId) {
        paymentUrl = `https://www.asaas.com/i/${paymentId}`;
      }
    }

    console.log(`Checkout Asaas criado para user=${user.id} plano=${plan} subscription=${subData.id}`);

    return new Response(JSON.stringify({ url: paymentUrl, subscriptionId: subData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("create-checkout error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
