import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ASAAS_API = "https://api.asaas.com/v3";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const asaasKey = Deno.env.get("ASAAS_API_KEY");
  const webhookToken = Deno.env.get("ASAAS_WEBHOOK_TOKEN");

  try {
    // Validate webhook access token — fail closed
    if (!webhookToken) {
      console.error("ASAAS_WEBHOOK_TOKEN não configurado — rejeitando request");
      return new Response("Webhook token not configured", { status: 500 });
    }
    const incomingToken = req.headers.get("asaas-access-token");
    if (incomingToken !== webhookToken) {
      console.error("Webhook token inválido ou ausente");
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const event = body.event;
    const payment = body.payment;

    console.log(`Asaas webhook: ${event}`, JSON.stringify(payment?.id));

    // Events we care about:
    // PAYMENT_CONFIRMED / PAYMENT_RECEIVED — payment was made
    // PAYMENT_OVERDUE — payment is overdue
    // PAYMENT_DELETED / PAYMENT_REFUNDED — cancelled/refunded
    // SUBSCRIPTION_DELETED — subscription cancelled

    if (event === "PAYMENT_CONFIRMED" || event === "PAYMENT_RECEIVED") {
      // Get subscription details to find user_id and plan
      const subscriptionId = payment?.subscription;
      if (!subscriptionId || !asaasKey) {
        // Try externalReference from payment
        let userId: string | null = null;
        let plan: string | null = null;

        if (payment?.externalReference) {
          try {
            const ref = JSON.parse(payment.externalReference);
            userId = ref.user_id;
            plan = ref.plan;
          } catch {}
        }

        if (!userId) {
          console.warn("No subscription or externalReference for payment:", payment?.id);
          return new Response("ok");
        }

        const planDays = plan === "anual" ? 365 : 30;
        const expiresAt = new Date(Date.now() + planDays * 24 * 60 * 60 * 1000).toISOString();

        await supabase
          .from("profiles")
          .update({ subscription_plan: plan as any, subscription_expires_at: expiresAt })
          .eq("id", userId);

        console.log(`✅ Plano ${plan} ativado para user=${userId}`);
        return new Response(JSON.stringify({ received: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      // Fetch subscription to get externalReference
      const subRes = await fetch(`${ASAAS_API}/subscriptions/${subscriptionId}`, {
        headers: { "access_token": asaasKey },
      });
      const subData = await subRes.json();

      let userId: string | null = null;
      let plan: string | null = null;

      if (subData.externalReference) {
        try {
          const ref = JSON.parse(subData.externalReference);
          userId = ref.user_id;
          plan = ref.plan;
        } catch {}
      }

      if (!userId || !plan) {
        console.warn("Could not extract user/plan from subscription:", subscriptionId);
        return new Response("ok");
      }

      const planDays = plan === "anual" ? 365 : 30;
      const expiresAt = new Date(Date.now() + planDays * 24 * 60 * 60 * 1000).toISOString();

      const { error } = await supabase
        .from("profiles")
        .update({ subscription_plan: plan as any, subscription_expires_at: expiresAt })
        .eq("id", userId);

      if (error) {
        console.error(`Erro ao atualizar perfil user=${userId}:`, error);
      } else {
        console.log(`✅ Plano ${plan} ativado para user=${userId} até ${expiresAt}`);
      }
    }

    if (event === "SUBSCRIPTION_DELETED" || event === "PAYMENT_REFUNDED" || event === "PAYMENT_DELETED") {
      // Try to find user from payment/subscription externalReference
      let userId: string | null = null;

      if (payment?.externalReference) {
        try {
          const ref = JSON.parse(payment.externalReference);
          userId = ref.user_id;
        } catch {}
      }

      if (!userId && payment?.subscription && asaasKey) {
        const subRes = await fetch(`${ASAAS_API}/subscriptions/${payment.subscription}`, {
          headers: { "access_token": asaasKey },
        });
        const subData = await subRes.json();
        if (subData.externalReference) {
          try {
            const ref = JSON.parse(subData.externalReference);
            userId = ref.user_id;
          } catch {}
        }
      }

      // For SUBSCRIPTION_DELETED event, the subscription info is in body directly
      if (!userId && body.subscription?.externalReference) {
        try {
          const ref = JSON.parse(body.subscription.externalReference);
          userId = ref.user_id;
        } catch {}
      }

      if (userId) {
        await supabase
          .from("profiles")
          .update({ subscription_plan: "free" as any, subscription_expires_at: null })
          .eq("id", userId);
        console.log(`❌ Plano cancelado para user=${userId}`);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Asaas webhook error:", err.message);
    return new Response("Erro interno", { status: 500 });
  }
});
