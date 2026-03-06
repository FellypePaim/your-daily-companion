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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const now = new Date();
    const nowIso = now.toISOString();
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const in3DaysStart = new Date(in3Days.getTime() - 30 * 60 * 1000).toISOString();
    const in3DaysEnd = new Date(in3Days.getTime() + 30 * 60 * 1000).toISOString();

    // ── 1. Reminder for plans expiring in ~3 days ──
    const { data: expiringProfiles } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, subscription_plan, subscription_expires_at")
      .in("subscription_plan", ["mensal", "anual", "trimestral"])
      .gte("subscription_expires_at", in3DaysStart)
      .lte("subscription_expires_at", in3DaysEnd)
      .not("subscription_expires_at", "is", null);

    let reminders = 0;
    for (const profile of expiringProfiles ?? []) {
      const { data: waLink } = await supabaseAdmin
        .from("whatsapp_links").select("phone_number")
        .eq("user_id", profile.id).eq("verified", true).maybeSingle();
      if (!waLink?.phone_number) continue;

      const name = profile.display_name || "Usuário";
      const expiryDate = new Date(profile.subscription_expires_at!).toLocaleDateString("pt-BR");
      const planMap: Record<string, string> = { mensal: "Mensal", anual: "Anual", trimestral: "Trimestral" };

      const message = [
        `⏰ *${name}*, seu plano expira em 3 dias!`,
        `📋 Plano: *Brave ${planMap[profile.subscription_plan] || profile.subscription_plan}*`,
        `📅 Expira: *${expiryDate}*`,
        `🔒 Sem renovação, você perde Família, análise comportamental e WhatsApp.`,
        `💳 Renove agora: https://brave-assessor.lovable.app/plan-gate`,
        `_Brave IA 🤖_`,
      ].join("\n");

      await sendWhatsAppMessage(waLink.phone_number, message);
      reminders++;
    }

    // ── 2. Process already-expired plans ──
    const { data: expiredProfiles, error: fetchErr } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, subscription_plan, subscription_expires_at")
      .in("subscription_plan", ["mensal", "anual", "trimestral"])
      .lt("subscription_expires_at", nowIso)
      .not("subscription_expires_at", "is", null);

    if (fetchErr) throw fetchErr;
    if (!expiredProfiles || expiredProfiles.length === 0) {
      return new Response(JSON.stringify({ ok: true, processed: 0, reminders }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let processed = 0;
    for (const profile of expiredProfiles) {
      const userId = profile.id;
      const name = profile.display_name || "Usuário";

      try {
        await supabaseAdmin.from("profiles")
          .update({ subscription_plan: "free", subscription_expires_at: null })
          .eq("id", userId);

        const { data: ownedGroups } = await supabaseAdmin
          .from("family_groups").select("id").eq("owner_id", userId);

        if (ownedGroups && ownedGroups.length > 0) {
          const groupIds = ownedGroups.map((g: any) => g.id);
          await supabaseAdmin.from("family_memberships").delete().in("family_group_id", groupIds);
          await supabaseAdmin.from("family_groups").delete().in("id", groupIds);
        }

        await supabaseAdmin.from("family_memberships").delete().eq("user_id", userId);

        const { data: waLink } = await supabaseAdmin
          .from("whatsapp_links").select("phone_number")
          .eq("user_id", userId).eq("verified", true).maybeSingle();

        if (waLink?.phone_number) {
          const message = [
            `⚠️ *${name}*, seu plano Brave expirou.`,
            `🔒 Família, análise comportamental e grupos foram desativados.`,
            `💳 Renove agora: https://brave-assessor.lovable.app/plan-gate`,
            `_Brave IA 🤖_`,
          ].join("\n");

          await sendWhatsAppMessage(waLink.phone_number, message);
        }

        processed++;
      } catch (userErr) {
        console.error(`Error processing user ${userId}:`, userErr);
      }
    }

    return new Response(JSON.stringify({ ok: true, processed, reminders }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("check-expired-plans error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
