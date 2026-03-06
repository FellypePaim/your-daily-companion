import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { sendWhatsAppMessage } from "../_shared/whatsapp-utils.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { phone, type, detail } = await req.json();

    if (!phone || !type || !detail) {
      return new Response(
        JSON.stringify({ error: "Missing phone, type, or detail" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let message = "";

    if (type === "achievement") {
      message = `🏆 *Conquista desbloqueada!*\n\nVocê acabou de desbloquear: *${detail}*\n\nContinue assim! 💪\n\n_Brave IA 🤖_`;
    } else if (type === "level_up") {
      message = `⭐ *Subiu de nível!*\n\nParabéns! Você agora é: *${detail}*\n\nContinue evoluindo suas finanças! 🚀\n\n_Brave IA 🤖_`;
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await sendWhatsAppMessage(phone, message);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("gamification-notify error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
