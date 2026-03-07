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

async function findOrCreateCustomer(asaasKey: string, user: any, cpfCnpj?: string): Promise<string> {
  const searchRes = await fetch(`${ASAAS_API}/customers?email=${encodeURIComponent(user.email!)}`, {
    headers: { "access_token": asaasKey },
  });
  const searchData = await searchRes.json();

  if (searchData.data && searchData.data.length > 0) {
    const existing = searchData.data[0];
    // Update cpfCnpj if provided and not already set
    if (cpfCnpj && !existing.cpfCnpj) {
      await fetch(`${ASAAS_API}/customers/${existing.id}`, {
        method: "PUT",
        headers: { "access_token": asaasKey, "Content-Type": "application/json" },
        body: JSON.stringify({ cpfCnpj }),
      });
    }
    return existing.id;
  }

  const createRes = await fetch(`${ASAAS_API}/customers`, {
    method: "POST",
    headers: { "access_token": asaasKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: user.user_metadata?.display_name || user.email!.split("@")[0],
      email: user.email,
      cpfCnpj: cpfCnpj || undefined,
      externalReference: user.id,
    }),
  });
  const createData = await createRes.json();
  if (createData.errors) throw new Error(createData.errors[0]?.description || "Erro ao criar cliente no Asaas");
  return createData.id;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

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
    const body = await req.json();
    let { plan, mode, billingType, value, description, cpfCnpj } = body;

    // Fetch CPF from profile if not provided
    if (!cpfCnpj) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("cpf_cnpj")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.cpf_cnpj) cpfCnpj = profile.cpf_cnpj;
    }

    const asaasKey = Deno.env.get("ASAAS_API_KEY");
    if (!asaasKey) throw new Error("ASAAS_API_KEY não configurada");

    const customerId = await findOrCreateCustomer(asaasKey, user, cpfCnpj);

    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);
    const dueDateStr = nextDueDate.toISOString().slice(0, 10);

    // ── One-off payment (PIX / Boleto / Card) ──
    if (mode === "payment") {
      if (!value || value <= 0) throw new Error("Valor inválido para cobrança avulsa");

      const payRes = await fetch(`${ASAAS_API}/payments`, {
        method: "POST",
        headers: { "access_token": asaasKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          customer: customerId,
          billingType: billingType || "UNDEFINED", // PIX, BOLETO, CREDIT_CARD, UNDEFINED
          value,
          dueDate: dueDateStr,
          description: description || "Cobrança avulsa - Brave Assessor",
          externalReference: JSON.stringify({ user_id: user.id, type: "one_off" }),
        }),
      });
      const payData = await payRes.json();

      if (payData.errors) {
        throw new Error(payData.errors[0]?.description || "Erro ao criar cobrança no Asaas");
      }

      const paymentUrl = payData.invoiceUrl || payData.bankSlipUrl || `https://www.asaas.com/i/${payData.id}`;

      console.log(`Cobrança avulsa Asaas criada para user=${user.id} payment=${payData.id}`);

      return new Response(JSON.stringify({ url: paymentUrl, paymentId: payData.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // ── Subscription ──
    if (!plan || !PLAN_CONFIG[plan]) {
      throw new Error(`Plano inválido: ${plan}. Use 'mensal' ou 'anual'.`);
    }

    const config = PLAN_CONFIG[plan];

    const subRes = await fetch(`${ASAAS_API}/subscriptions`, {
      method: "POST",
      headers: { "access_token": asaasKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: customerId,
        billingType: "UNDEFINED",
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

    const paymentsRes = await fetch(`${ASAAS_API}/subscriptions/${subData.id}/payments`, {
      headers: { "access_token": asaasKey },
    });
    const paymentsData = await paymentsRes.json();

    let paymentUrl = "";
    if (paymentsData.data && paymentsData.data.length > 0) {
      paymentUrl = paymentsData.data[0].invoiceUrl || paymentsData.data[0].bankSlipUrl || "";
    }
    if (!paymentUrl) {
      const paymentId = paymentsData.data?.[0]?.id;
      if (paymentId) paymentUrl = `https://www.asaas.com/i/${paymentId}`;
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
