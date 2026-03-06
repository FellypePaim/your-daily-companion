import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sendWhatsAppMessage(phone: string, message: string) {
  const url = Deno.env.get("EVOLUTION_API_URL")?.replace(/\/$/, "");
  const key = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_API_INSTANCE");
  if (!url || !key || !instance) return;

  const resp = await fetch(`${url}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ number: phone, text: message }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("Evolution API send error:", resp.status, t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: corsHeaders,
      });
    }

    const callerId = claimsData.claims.sub;

    const { data: roleData } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admins only" }), {
        status: 403, headers: corsHeaders,
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: adminRoles } = await adminClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const adminIds = new Set((adminRoles || []).map(r => r.user_id));

    const { data: allProfiles } = await adminClient
      .from("profiles")
      .select("id, display_name");

    if (!allProfiles || allProfiles.length === 0) {
      return new Response(JSON.stringify({ ok: true, reset: 0, notified: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const usersToReset = allProfiles.filter(p => !adminIds.has(p.id));
    const userIds = usersToReset.map(u => u.id);

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, reset: 0, notified: 0 }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tables = [
      "transactions",
      "reminders",
      "cards",
      "financial_goals",
      "recurring_transactions",
      "categories",
      "chat_messages",
      "wallets",
    ];

    const errors: string[] = [];
    for (const table of tables) {
      const { error } = await adminClient.from(table).delete().in("user_id", userIds);
      if (error) errors.push(`${table}: ${error.message}`);
    }

    for (const uid of userIds) {
      await adminClient.from("profiles").update({
        monthly_income: 0,
        has_completed_onboarding: false,
      }).eq("id", uid);
    }

    const { data: waLinks } = await adminClient
      .from("whatsapp_links")
      .select("user_id, phone_number")
      .eq("verified", true);

    let notified = 0;
    for (const link of waLinks || []) {
      const profile = allProfiles.find(u => u.id === link.user_id);
      const name = profile?.display_name || "Usuário";

      const message =
        `⚠️ *Aviso importante, ${name}!*\n\n` +
        `O banco de dados do Brave foi resetado pela equipe de administração.\n\n` +
        `🗑️ *O que foi removido:*\n` +
        `• Transações\n` +
        `• Lembretes\n` +
        `• Cartões\n` +
        `• Carteiras\n` +
        `• Metas financeiras\n` +
        `• Categorias\n` +
        `• Recorrências\n` +
        `• Histórico de chat\n\n` +
        `✅ *O que foi mantido:*\n` +
        `• Seu plano de assinatura\n` +
        `• WhatsApp vinculado\n` +
        `• Seu perfil (nome)\n\n` +
        `Você pode começar a usar o app normalmente e cadastrar seus dados novamente.\n\n` +
        `_Brave IA - Seu assessor financeiro 🤖_`;

      try {
        await sendWhatsAppMessage(link.phone_number!, message);
        notified++;
        console.log(`Notified ${link.phone_number} about reset`);
      } catch (e) {
        console.error(`Failed to notify ${link.phone_number}:`, e);
      }
    }

    if (errors.length > 0) {
      console.error("Partial errors during reset:", errors);
    }

    return new Response(
      JSON.stringify({ ok: true, reset: userIds.length, notified, errors: errors.length > 0 ? errors : undefined }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("admin-reset-all error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500, headers: corsHeaders,
    });
  }
});
