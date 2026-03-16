import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { callGemini } from "../_shared/gemini-client.ts";
import { safeJsonParse, extractJsonFromMixed } from "../_shared/ai-response-parser.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { transactions } = await req.json();

    if (!transactions || transactions.length === 0) {
      return new Response(JSON.stringify({ error: "No transactions" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Summarize by month and category
    const summary: Record<string, { income: number; expense: number; categories: Record<string, number> }> = {};
    for (const tx of transactions) {
      const month = tx.date?.substring(0, 7) || "unknown";
      if (!summary[month]) summary[month] = { income: 0, expense: 0, categories: {} };
      const amt = Number(tx.amount) || 0;
      if (tx.type === "income") summary[month].income += amt;
      else {
        summary[month].expense += amt;
        const cat = tx.categories?.name || "Outros";
        summary[month].categories[cat] = (summary[month].categories[cat] || 0) + amt;
      }
    }

    const summaryText = Object.entries(summary)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => {
        const cats = Object.entries(data.categories)
          .sort(([, a], [, b]) => b - a)
          .map(([name, val]) => `${name}: R$${val.toFixed(0)}`)
          .join(", ");
        return `${month}: Receita R$${data.income.toFixed(0)}, Despesa R$${data.expense.toFixed(0)} (${cats})`;
      })
      .join("\n");

    const systemPrompt = `Você é um analista financeiro. Com base no histórico mensal abaixo, preveja os gastos e receitas do próximo mês.
Responda APENAS com JSON neste formato (sem markdown):
{
  "predicted_expense": number,
  "predicted_income": number,
  "top_categories": [{"name": "string", "predicted": number}],
  "tip": "uma dica prática curta em português para economizar"
}`;

    const response = await callGemini({
      systemPrompt,
      messages: [{ role: "user", content: `Histórico:\n${summaryText}` }],
      temperature: 0.2,
    });

    const jsonStr = extractJsonFromMixed(response);
    if (!jsonStr) throw new Error("Failed to parse AI response");
    const parsed = safeJsonParse(jsonStr);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("predict-spending error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
