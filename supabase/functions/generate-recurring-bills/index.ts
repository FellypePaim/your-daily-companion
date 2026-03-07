import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-indexed

    // Get all active recurring transactions
    const { data: recurring, error: recurringError } = await supabase
      .from("recurring_transactions")
      .select("*")
      .eq("is_active", true);

    if (recurringError) throw recurringError;

    let created = 0;
    let skipped = 0;

    // Track bills created per user for notifications
    const userBills: Record<string, { name: string; userId: string; bills: string[] }> = {};

    for (const rec of recurring || []) {
      // Calculate due date for this month
      const day = Math.min(rec.day_of_month, new Date(year, month + 1, 0).getDate());
      const dueDate = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      // Check if bill already exists for this month
      const { data: existing } = await supabase
        .from("transactions")
        .select("id")
        .eq("recurring_id", rec.id)
        .eq("due_date", dueDate)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      // Create the bill (unpaid transaction)
      const { error: insertError } = await supabase.from("transactions").insert({
        user_id: rec.user_id,
        description: rec.description,
        amount: rec.amount,
        type: rec.type,
        category_id: rec.category_id,
        wallet_id: rec.wallet_id,
        card_id: rec.card_id,
        date: dueDate,
        due_date: dueDate,
        is_paid: false,
        recurring_id: rec.id,
      });

      if (insertError) {
        console.error(`Error creating bill for recurring ${rec.id}:`, insertError);
      } else {
        created++;

        // Group by user
        if (!userBills[rec.user_id]) {
          userBills[rec.user_id] = { name: "", userId: rec.user_id, bills: [] };
        }
        const amount = Number(rec.amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
        userBills[rec.user_id].bills.push(`• ${rec.description}: ${amount} (vence ${String(day).padStart(2, "0")}/${String(month + 1).padStart(2, "0")})`);
      }
    }

    // Send WhatsApp notifications per user
    let notified = 0;
    for (const userId of Object.keys(userBills)) {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("display_name")
          .eq("id", userId)
          .maybeSingle();

        const { data: waLink } = await supabase
          .from("whatsapp_links")
          .select("phone_number")
          .eq("user_id", userId)
          .eq("verified", true)
          .maybeSingle();

        if (!waLink?.phone_number) continue;

        const name = profile?.display_name || "Usuário";
        const billsList = userBills[userId].bills.join("\n");
        const monthName = now.toLocaleDateString("pt-BR", { month: "long" });

        const message = [
          `📋 *${name}*, suas contas de ${monthName} foram geradas!`,
          ``,
          `${billsList}`,
          ``,
          `📊 Total: *${userBills[userId].bills.length} conta(s)* criada(s)`,
          `💡 Acesse o app para gerenciar seus pagamentos.`,
          `_Brave IA 🤖_`,
        ].join("\n");

        await sendWhatsAppMessage(waLink.phone_number, message);
        notified++;
      } catch (err) {
        console.error(`Error notifying user ${userId}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, created, skipped, notified, total: recurring?.length || 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
