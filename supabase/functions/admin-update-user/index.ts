import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function sendWhatsAppMessage(phone: string, message: string) {
  const UAZAPI_URL = Deno.env.get("UAZAPI_URL");
  const UAZAPI_TOKEN = Deno.env.get("UAZAPI_TOKEN");
  if (!UAZAPI_URL || !UAZAPI_TOKEN) return;
  const resp = await fetch(`${UAZAPI_URL}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: UAZAPI_TOKEN },
    body: JSON.stringify({ number: phone, text: message }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("UAZAPI send error:", resp.status, t);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Authenticate the requesting user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    // Verify caller is admin using anon client
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await anonClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const callerId = claimsData.claims.sub;

    // Check admin role
    const { data: roleData } = await anonClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admins only" }), {
        status: 403,
        headers: corsHeaders,
      });
    }

    // Parse body ONCE
    const {
      userId,
      email,
      password,
      fetchOnly,
      deleteUser,
      resetUser,
      subscription_plan,
      subscription_expires_at,
      display_name,
      monthly_income,
      cpf_cnpj,
    } = await req.json();

    if (!userId) {
      return new Response(JSON.stringify({ error: "userId is required" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // Use service role
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // fetchOnly mode — return the user's current email + cpf
    if (fetchOnly) {
      const { data, error } = await adminClient.auth.admin.getUserById(userId);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: corsHeaders,
        });
      }
      // Also fetch cpf_cnpj from profile
      const { data: profileData } = await adminClient
        .from("profiles")
        .select("cpf_cnpj")
        .eq("id", userId)
        .maybeSingle();
      return new Response(
        JSON.stringify({ success: true, user: { id: data.user.id, email: data.user.email, cpf_cnpj: profileData?.cpf_cnpj || null } }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // deleteUser mode — permanently delete user
    if (deleteUser) {
      if (userId === callerId) {
        return new Response(JSON.stringify({ error: "Você não pode excluir sua própria conta." }), {
          status: 400, headers: corsHeaders,
        });
      }
      const { error } = await adminClient.auth.admin.deleteUser(userId);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400, headers: corsHeaders,
        });
      }
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // resetUser mode — delete all user data EXCEPT profile (plan/whatsapp) and whatsapp_links
    if (resetUser) {
      const tables = [
        "transactions",
        "reminders",
        "cards",
        "financial_goals",
        "recurring_transactions",
        "categories",
        "chat_messages",
      ];
      const errors: string[] = [];
      for (const table of tables) {
        const { error } = await adminClient.from(table).delete().eq("user_id", userId);
        if (error) errors.push(`${table}: ${error.message}`);
      }
      // Reset wallets balance to 0 instead of deleting (keep structure)
      const { error: walletErr } = await adminClient.from("wallets").delete().eq("user_id", userId);
      if (walletErr) errors.push(`wallets: ${walletErr.message}`);

      // Reset profile fields (keep plan, whatsapp, name)
      const { data: profileData } = await adminClient.from("profiles").select("display_name").eq("id", userId).maybeSingle();
      await adminClient.from("profiles").update({
        monthly_income: 0,
        has_completed_onboarding: false,
      }).eq("id", userId);

      // Send WhatsApp notification
      const { data: waLink } = await adminClient
        .from("whatsapp_links")
        .select("phone_number")
        .eq("user_id", userId)
        .eq("verified", true)
        .maybeSingle();

      if (waLink?.phone_number) {
        const name = profileData?.display_name || "Usuário";
        const message =
          `⚠️ *Aviso, ${name}!*\n\n` +
          `Seus dados foram resetados pela equipe de administração.\n\n` +
          `🗑️ *Removidos:* transações, lembretes, cartões, carteiras, metas, categorias, recorrências e chat.\n\n` +
          `✅ *Mantidos:* plano de assinatura e WhatsApp vinculado.\n\n` +
          `Você pode começar a usar o app normalmente.\n\n` +
          `_Brave IA - Seu assessor financeiro 🤖_`;
        try { await sendWhatsAppMessage(waLink.phone_number, message); } catch (e) { console.error("WA notify error:", e); }
      }

      if (errors.length > 0) {
        return new Response(JSON.stringify({ error: `Erros parciais: ${errors.join("; ")}` }), {
          status: 400, headers: corsHeaders,
        });
      }
      return new Response(
        JSON.stringify({ success: true, message: "Dados do usuário resetados com sucesso." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update profile data (plan, expiry, display_name, income) using service role to bypass RLS
    const profileFieldsToUpdate: Record<string, any> = {};
    if (subscription_plan !== undefined) profileFieldsToUpdate.subscription_plan = subscription_plan;
    if (subscription_expires_at !== undefined) profileFieldsToUpdate.subscription_expires_at = subscription_expires_at ?? null;
    if (display_name !== undefined) profileFieldsToUpdate.display_name = display_name;
    if (monthly_income !== undefined) profileFieldsToUpdate.monthly_income = monthly_income;
    if (cpf_cnpj !== undefined) profileFieldsToUpdate.cpf_cnpj = cpf_cnpj;

    if (Object.keys(profileFieldsToUpdate).length > 0) {
      const { error: profileErr } = await adminClient
        .from("profiles")
        .update(profileFieldsToUpdate)
        .eq("id", userId);

      if (profileErr) {
        return new Response(JSON.stringify({ error: profileErr.message }), {
          status: 400,
          headers: corsHeaders,
        });
      }
    }

    if (!email && !password) {
      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate inputs
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email) || email.length > 255) {
        return new Response(JSON.stringify({ error: "Invalid email" }), {
          status: 400,
          headers: corsHeaders,
        });
      }
    }

    if (password && password.length < 6) {
      return new Response(
        JSON.stringify({ error: "Password must be at least 6 characters" }),
        { status: 400, headers: corsHeaders }
      );
    }

    const updateData: { email?: string; password?: string } = {};
    if (email) updateData.email = email;
    if (password) updateData.password = password;

    const { data, error } = await adminClient.auth.admin.updateUserById(userId, updateData);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    return new Response(
      JSON.stringify({ success: true, user: { id: data.user.id, email: data.user.email } }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
