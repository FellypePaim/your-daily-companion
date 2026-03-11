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

    // Rate limiting: max 5 checkout attempts per user per hour
    const { data: allowed } = await supabaseAdmin.rpc("check_checkout_rate_limit", {
      _user_id: user.id,
      _max_attempts: 5,
      _window_minutes: 60,
    });
    if (!allowed) {
      throw new Error("Muitas tentativas de pagamento. Tente novamente em alguns minutos.");
    }

    const body = await req.json();
    let { plan, billingType, cpfCnpj, creditCard, creditCardHolderInfo, installmentCount, remoteIp } = body;

    // Fetch CPF from profile if not provided
    if (!cpfCnpj) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("cpf_cnpj")
        .eq("id", user.id)
        .maybeSingle();
      if (profile?.cpf_cnpj) cpfCnpj = profile.cpf_cnpj;
    }

    // Save CPF to profile if provided and not yet saved
    if (cpfCnpj) {
      await supabaseAdmin
        .from("profiles")
        .update({ cpf_cnpj: cpfCnpj })
        .eq("id", user.id)
        .is("cpf_cnpj", null);
    }

    const asaasKey = Deno.env.get("ASAAS_API_KEY");
    if (!asaasKey) throw new Error("ASAAS_API_KEY não configurada");

    if (!plan || !PLAN_CONFIG[plan]) {
      throw new Error(`Plano inválido: ${plan}. Use 'mensal' ou 'anual'.`);
    }

    const config = PLAN_CONFIG[plan];
    const customerId = await findOrCreateCustomer(asaasKey, user, cpfCnpj);

    const nextDueDate = new Date();
    nextDueDate.setDate(nextDueDate.getDate() + 1);
    const dueDateStr = nextDueDate.toISOString().slice(0, 10);

    // Build payment body
    const paymentBody: any = {
      customer: customerId,
      billingType: billingType || "UNDEFINED",
      value: config.value,
      dueDate: dueDateStr,
      description: config.description,
      externalReference: JSON.stringify({ user_id: user.id, plan }),
    };

    // Credit card transparent checkout
    if (billingType === "CREDIT_CARD" && creditCard) {
      paymentBody.creditCard = creditCard;
      paymentBody.creditCardHolderInfo = creditCardHolderInfo;
      if (installmentCount && installmentCount > 1) {
        paymentBody.installmentCount = installmentCount;
        paymentBody.installmentValue = Math.ceil((config.value / installmentCount) * 100) / 100;
      }
      if (remoteIp) paymentBody.remoteIp = remoteIp;
    }

    // Create payment
    const payRes = await fetch(`${ASAAS_API}/payments`, {
      method: "POST",
      headers: { "access_token": asaasKey, "Content-Type": "application/json" },
      body: JSON.stringify(paymentBody),
    });
    const payData = await payRes.json();

    if (payData.errors) {
      throw new Error(payData.errors[0]?.description || "Erro ao criar cobrança no Asaas");
    }

    const result: any = {
      paymentId: payData.id,
      status: payData.status,
      billingType: payData.billingType,
      value: payData.value,
      invoiceUrl: payData.invoiceUrl,
      bankSlipUrl: payData.bankSlipUrl,
    };

    // For PIX: fetch QR Code
    if (billingType === "PIX" || (!billingType && payData.billingType === "PIX")) {
      const pixRes = await fetch(`${ASAAS_API}/payments/${payData.id}/pixQrCode`, {
        headers: { "access_token": asaasKey },
      });
      const pixData = await pixRes.json();
      if (pixData.encodedImage) {
        result.pixQrCode = pixData.encodedImage;
        result.pixPayload = pixData.payload;
        result.pixExpirationDate = pixData.expirationDate;
      }
    }

    // For BOLETO: include identificationField (bar code)
    if (billingType === "BOLETO") {
      const detailRes = await fetch(`${ASAAS_API}/payments/${payData.id}/identificationField`, {
        headers: { "access_token": asaasKey },
      });
      const detailData = await detailRes.json();
      if (detailData.identificationField) {
        result.boletoBarCode = detailData.identificationField;
        result.boletoUrl = payData.bankSlipUrl;
      }
    }

    // For CREDIT_CARD: status will be CONFIRMED if approved
    if (billingType === "CREDIT_CARD") {
      result.creditCardStatus = payData.status;
    }

    console.log(`Transparent checkout: user=${user.id} plan=${plan} type=${billingType} payment=${payData.id} status=${payData.status}`);

    return new Response(JSON.stringify(result), {
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
