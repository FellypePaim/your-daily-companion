import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders, sendWhatsAppMessage, sendWhatsAppButtons,
  getBrazilNow, getBrazilTodayStr,
  isMediaMessage, isAudioMessage, isImageMessage,
  parseDateTimeBR, nextWD, parseNotifyMinutes, parseRecurrence,
  recurrenceLabel,
} from "../_shared/whatsapp-utils.ts";
import { downloadMediaFromEvolution } from "../_shared/whatsapp-media.ts";
import {
  processWithNoxIA, processImageWithAI, processAudioWithAI,
  parseReminderWithAI,
} from "../_shared/whatsapp-ai.ts";
import {
  extractActionJson, safeJsonParse, extractAllActions,
  cleanDescription, normalizeAmount, normalizeType, cleanSearchTerm,
  cleanReminderTitle, extractUserTime, forceTimeOnIso,
} from "../_shared/ai-response-parser.ts";
import { autoCategorize } from "../_shared/auto-categorize.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();

    // Evolution API v2 wraps payload in { event, instance, data: { key, message, ... } }
    const isEvolutionV2 = !!(body.data && body.event);
    const payload = isEvolutionV2 ? body.data : body;

    // Detailed log for debugging
    console.log("Webhook payload (parsed):", JSON.stringify({
      isEvolutionV2,
      event: body.event,
      instance: body.instance,
      remoteJid: payload.key?.remoteJid,
      fromMe: payload.key?.fromMe,
      messageType: payload.messageType,
      pushName: payload.pushName,
      msgKeys: payload.message ? Object.keys(payload.message) : [],
      conversation: payload.message?.conversation,
    }));

    const message = payload.message || {};
    const chat = payload.chat || {};

    // Evolution API v2: phone comes from key.remoteJid (format: 5511999999999@s.whatsapp.net)
    const remoteJid = payload.key?.remoteJid || "";
    const phoneFromJid = remoteJid.replace(/@.*$/, "");
    const phone = phoneFromJid || chat.number || chat.phone || message.number || message.phone || message.from || message.sender || body.number || body.from;

    // Evolution API v2: text is in message.conversation or message.extendedTextMessage.text
    const text = message.conversation || message.extendedTextMessage?.text || message.body || message.text || body.text || "";
    const messageId = payload.key?.id || message.messageid || message.id || message.messageId;
    const mediaType = payload.messageType || message.mediaType || message.type;
    const isFromMe = payload.key?.fromMe === true || message.fromMe === true;

    if (isFromMe) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Button/click responses may come with empty text but buttonOrListid set
    const buttonId = message.buttonOrListid || message.selectedButtonId || message.buttonId || "";
    const isButtonResponse = !!(buttonId) || message.type === "buttonResponse" || message.type === "interactive";

    const evMessageType = payload.messageType || "";
    const isMedia = isMediaMessage(message, evMessageType);
    const hasText = !!(text && text.trim());
    const hasButtonResponse = !!(buttonId.trim());

    if (!phone || (!hasText && !isMedia && !hasButtonResponse)) {
      console.log("Missing phone or content, skipping. phone:", phone, "text:", text, "isMedia:", isMedia, "buttonId:", buttonId);
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cleanPhone = phone.replace(/@.*$/, "").replace(/\D/g, "");
    const messageText = (text || "").trim();
    // effectiveText considers both text messages and button click IDs
    const effectiveText = messageText || buttonId.trim();
    const isAudio = isAudioMessage(message, evMessageType);
    const isImage = isImageMessage(message, evMessageType);

    console.log(`Message from ${cleanPhone}: type=${evMessageType || message.type} isMedia=${isMedia} isAudio=${isAudio} isImage=${isImage} text="${messageText}" buttonId="${buttonId}"`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // ── RATE LIMITER: 80 messages per hour per phone ──
    const { data: rateLimitAllowed } = await supabaseAdmin.rpc("check_whatsapp_rate_limit", { _phone: cleanPhone, _max_messages: 80 });
    if (rateLimitAllowed === false) {
      await sendWhatsAppMessage(cleanPhone, "⚠️ Você atingiu o limite de 80 mensagens por hora. Aguarde um pouco e tente novamente! ⏳");
      return new Response(JSON.stringify({ ok: true, rate_limited: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check verification code (text only) — match code anywhere in the message
    if (hasText) {
      const codeMatch = messageText.match(/(?:NOX|BRAVE)-(\d{6})/i);
      if (codeMatch) {
        // Try both prefixes to handle already-stored NOX- codes and new BRAVE- codes
        const digits = codeMatch[1];
        const bravCode = `BRAVE-${digits}`;
        const noxCode = `NOX-${digits}`;

        let link = null;
        // First try BRAVE- prefix (new codes)
        const { data: linkBrave } = await supabaseAdmin
          .from("whatsapp_links")
          .select("*")
          .eq("verification_code", bravCode)
          .eq("verified", false)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();
        if (linkBrave) {
          link = linkBrave;
        } else {
          // Fallback: try NOX- prefix (legacy codes already in DB)
          const { data: linkNox } = await supabaseAdmin
            .from("whatsapp_links")
            .select("*")
            .eq("verification_code", noxCode)
            .eq("verified", false)
            .gt("expires_at", new Date().toISOString())
            .maybeSingle();
          if (linkNox) link = linkNox;
        }

        if (!link) {
          await sendWhatsAppMessage(cleanPhone, "❌ Código inválido ou expirado. Gere um novo código no app Brave.");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        await supabaseAdmin
          .from("whatsapp_links")
          .update({ phone_number: cleanPhone, verified: true })
          .eq("id", link.id);

        // Fetch user's name for personalized welcome message
        const { data: welcomeProfile } = await supabaseAdmin
          .from("profiles")
          .select("display_name")
          .eq("id", link.user_id)
          .maybeSingle();
        const userName = welcomeProfile?.display_name || "usuário";

        await sendWhatsAppMessage(cleanPhone,
          `🎉 *Olá, ${userName}! WhatsApp vinculado com sucesso!*\n\n` +
          `Agora você pode gerenciar suas finanças direto aqui! Veja o que posso fazer por você:\n\n` +
          `💸 *Registrar gastos (texto):*\n_"Gastei 50 no almoço"_\n_"Almocei por 30 conto"_\n_"Paguei 200 de luz"_\n\n` +
          `📸 *Enviar foto de comprovante*\n_Basta fotografar o recibo ou nota fiscal_\n\n` +
          `🎙️ *Enviar áudio*\n_"Gastei 80 de gasolina no posto"_\n\n` +
          `🔔 *Criar lembretes:*\n_"lembrete: reunião amanhã 15h"_\n_"lembrete: academia toda segunda 7h"_\n\n` +
          `📋 *Ver suas contas:* _"conferir"_\n` +
          `📊 *Ver saldo:* _"Qual meu saldo?"_\n` +
          `👑 *Ver seu plano:* _"meu plano"_\n` +
          `❓ *Ajuda:* _"ajuda"_\n\n` +
          `_Brave IA - Seu assessor financeiro 🤖_`
        );

        return new Response(JSON.stringify({ ok: true, linked: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── "meu plano" command — check BEFORE looking up linked user ──
    const meuPlanoMatch = /^\s*(meu\s*plano|meu plano|meu\s+plano)\s*$/i.test(messageText);
    if (hasText && meuPlanoMatch) {
      // Try to find user by phone
      const { data: linkedForPlan } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForPlan) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada a este número. Vincule pelo app Nox primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: planProfile } = await supabaseAdmin
        .from("profiles")
        .select("display_name, subscription_plan, subscription_expires_at")
        .eq("id", linkedForPlan.user_id)
        .maybeSingle();

      const planNames: Record<string, string> = {
        mensal: "Brave Mensal",
        anual: "Brave Anual",
        trimestral: "Brave Trimestral",
        free: "Gratuito",
      };
      const planBenefits: Record<string, string[]> = {
        mensal: ["✅ WhatsApp conectado", "✅ Cartões de crédito", "✅ Orçamentos por categoria", "✅ Relatórios detalhados", "✅ Previsões com IA", "🔒 Modo Família", "🔒 Análise comportamental"],
        anual:  ["✅ WhatsApp conectado", "✅ Cartões de crédito", "✅ Orçamentos por categoria", "✅ Relatórios detalhados", "✅ Previsões com IA", "✅ Modo Família (5 pessoas)", "✅ Análise comportamental"],
        trimestral: ["✅ WhatsApp conectado", "✅ Cartões de crédito", "✅ Orçamentos por categoria", "✅ Relatórios detalhados", "✅ Previsões com IA"],
        free: ["🔒 Acesso limitado", "🔒 WhatsApp desconectado"],
      };

      const currentPlan = planProfile?.subscription_plan || "free";
      const expiresAt = planProfile?.subscription_expires_at;
      const expiryLine = expiresAt
        ? `📅 *Válido até:* ${new Date(expiresAt).toLocaleDateString("pt-BR")}`
        : "";
      const daysLeft = expiresAt
        ? Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
      const daysLine = daysLeft !== null
        ? (daysLeft <= 3 ? `\n⚠️ *Atenção:* seu plano expira em ${daysLeft} dia${daysLeft !== 1 ? "s" : ""}!` : `\n✅ Faltam ${daysLeft} dias para renovação.`)
        : "";
      const benefits = (planBenefits[currentPlan] || []).join("\n");

      const planMsg =
        `👑 *Seu Plano Brave*\n\n` +
        `📋 *Plano atual:* ${planNames[currentPlan] || currentPlan}\n` +
        (expiryLine ? `${expiryLine}\n` : "") +
        `${daysLine}\n\n` +
        `*Benefícios ativos:*\n${benefits}\n\n` +
        (currentPlan === "free" || daysLeft !== null && daysLeft <= 3
          ? `💳 Para renovar: Configurações → Planos e Assinatura no app Brave.\n\n`
          : "") +
        `_Brave IA - Seu assessor financeiro 🤖_`;

      await sendWhatsAppMessage(cleanPhone, planMsg);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Helper functions (parseDateTimeBR, nextWD, parseNotifyMinutes, parseRecurrence,
    // parseReminderWithAI, recurrenceLabel) are now imported from shared modules.

    // ── Session-based multi-step flow (bill payment + reminder creation) ──
    {
      const { data: session } = await supabaseAdmin
        .from("whatsapp_sessions")
        .select("*")
        .eq("phone_number", cleanPhone)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (session) {
        const ctx = session.context as any;
        const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // ── Step: ask if list is recurring or one-time ──
        if (session.step === "ask_list_type") {
          const items: any[] = ctx.items || [];
          const isRecurring = /recorrente|mensal|todo\s*m[eê]s|1|✅ recorrentes/i.test(effectiveText);
          const isOneTime = /[uú]nica|avulsa|paguei|j[aá] paguei|2|💸 transações únicas|transações únicas/i.test(effectiveText);
          const isCancel = /^(cancelar|cancel|não|nao|n|❌)$/i.test(effectiveText);

          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Cadastro cancelado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (isRecurring) {
            // Check if ALL items already have day_of_month from the AI extraction
            const allHaveDays = items.length > 0 && items.every((i: any) => i.day_of_month && i.day_of_month >= 1 && i.day_of_month <= 31);
            
            if (allHaveDays) {
              // Skip asking day — go directly to confirmation
              const totalAmount = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
              const lines = items.map((i: any, idx: number) =>
                `${idx + 1}. *${i.description}* — ${fmt(Number(i.amount))} · dia ${i.day_of_month}`
              );
              await supabaseAdmin.from("whatsapp_sessions").update({
                step: "confirm_recurring_list",
                context: { ...ctx, list_type: "recurring" },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              await sendWhatsAppButtons(
                cleanPhone,
                `🔄 *Confirmar ${items.length} recorrências mensais?*\n\n` + lines.join("\n") +
                `\n\n💸 *Total mensal: ${fmt(totalAmount)}*\n\n` +
                `✏️ _Para editar:_\n` +
                `• _"3 remover"_ — remove o item 3\n` +
                `• _"2 valor 50"_ — muda valor do item 2\n` +
                `• _"1 dia 15"_ — muda dia do item 1`,
                [{ id: "sim", text: "✅ Cadastrar todas" }, { id: "nao", text: "❌ Cancelar" }],
                "Confirme ou edite os itens"
              );
            } else {
              // Some or no items have days — ask for the common day
              await supabaseAdmin.from("whatsapp_sessions").update({
                step: "ask_recurring_day",
                context: { ...ctx, list_type: "recurring" },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              // Build a smarter message — show which items already have days
              const itemsWithDays = items.filter((i: any) => i.day_of_month);
              if (itemsWithDays.length > 0) {
                const withDayLines = items.map((i: any, idx: number) =>
                  i.day_of_month
                    ? `${idx + 1}. ✅ *${i.description}* — dia ${i.day_of_month}`
                    : `${idx + 1}. ❓ *${i.description}* — dia ?`
                ).join("\n");
                await sendWhatsAppMessage(cleanPhone,
                  `📅 *Falta definir o dia de vencimento de alguns itens:*\n\n` +
                  withDayLines +
                  `\n\nEnvie o dia para os itens que faltam (ex: _"10"_)\n` +
                  `💡 _O dia será aplicado apenas aos itens sem dia definido._`
                );
              } else {
                await sendWhatsAppMessage(cleanPhone,
                  `📅 *Em qual dia do mês vencem essas contas?*\n\n` +
                  `Envie o dia (ex: _"10"_ ou _"todo dia 5"_)\n\n` +
                  `💡 _Se cada conta vence em um dia diferente, pode definir depois. Envie o dia mais comum._`
                );
              }
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (isOneTime) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "confirm_onetime_list",
              context: { ...ctx, list_type: "onetime" },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);

            const totalAmount = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
            const lines = items.map((i: any, idx: number) =>
              `${idx + 1}. *${i.description}* — ${fmt(Number(i.amount))}`
            );
            await sendWhatsAppButtons(
              cleanPhone,
              `💸 *Confirmar ${items.length} transações?*\n\n` + lines.join("\n") +
              `\n\n💵 *Total: ${fmt(totalAmount)}*\n\n` +
              `✏️ _Para editar:_\n` +
              `• _"3 remover"_ — remove o item 3\n` +
              `• _"2 valor 50"_ — muda valor do item 2`,
              [{ id: "sim", text: "✅ Registrar todas" }, { id: "nao", text: "❌ Cancelar" }],
              "Confirme ou edite os itens"
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          await sendWhatsAppButtons(
            cleanPhone,
            `❓ São contas *recorrentes* (todo mês) ou transações *únicas* (já pagou/recebeu)?`,
            [{ id: "1", text: "✅ Recorrentes" }, { id: "2", text: "💸 Transações únicas" }],
            ""
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: ask day of month for recurring list ──
        if (session.step === "ask_recurring_day") {
          const items: any[] = ctx.items || [];
          const dayMatch = effectiveText.match(/(\d{1,2})/);
          
          if (dayMatch) {
            const day = parseInt(dayMatch[1]);
            if (day >= 1 && day <= 31) {
              const updatedItems = items.map((i: any) => ({ ...i, day_of_month: i.day_of_month || day }));
              await supabaseAdmin.from("whatsapp_sessions").update({
                step: "confirm_recurring_list",
                context: { ...ctx, items: updatedItems },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);

              const totalAmount = updatedItems.reduce((s: number, i: any) => s + Number(i.amount), 0);
              const lines = updatedItems.map((i: any, idx: number) =>
                `${idx + 1}. *${i.description}* — ${fmt(Number(i.amount))} · dia ${i.day_of_month}`
              );
              await sendWhatsAppButtons(
                cleanPhone,
                `🔄 *Confirmar ${updatedItems.length} recorrências mensais?*\n\n` + lines.join("\n") +
                `\n\n💸 *Total mensal: ${fmt(totalAmount)}*\n\n` +
                `✏️ _Para editar:_\n` +
                `• _"3 remover"_ — remove o item 3\n` +
                `• _"2 valor 50"_ — muda valor do item 2\n` +
                `• _"1 dia 15"_ — muda dia do item 1`,
                [{ id: "sim", text: "✅ Cadastrar todas" }, { id: "nao", text: "❌ Cancelar" }],
                "Confirme ou edite os itens"
              );
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          await sendWhatsAppMessage(cleanPhone, `❓ Envie um dia válido entre 1 e 31. Exemplo: _"10"_`);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: confirm and save recurring list (with inline editing) ──
        if (session.step === "confirm_recurring_list") {
          let items: any[] = ctx.items || [];
          const isConfirm = /sim|ok|yes|confirmar|✅ cadastrar todas|cadastrar todas?/i.test(effectiveText);
          const isCancel  = /^(não|nao|n|cancelar|cancel|❌ cancelar)$/i.test(effectiveText);

          const showList = async (currentItems: any[]) => {
            const totalAmount = currentItems.reduce((s: number, i: any) => s + Number(i.amount), 0);
            const lines = currentItems.map((i: any, idx: number) => {
              const dayStr = i.day_of_month ? ` · dia ${i.day_of_month}` : "";
              return `${idx + 1}. *${i.description}* — ${fmt(Number(i.amount))}${dayStr}`;
            });
            await sendWhatsAppButtons(
              cleanPhone,
              `🔄 *Confirmar ${currentItems.length} recorrências?*\n\n` + lines.join("\n") +
              `\n\n💸 *Total: ${fmt(totalAmount)}*\n\n` +
              `✏️ _Para editar:_\n` +
              `• _"3 remover"_ — remove o item 3\n` +
              `• _"2 valor 50"_ — muda valor do item 2\n` +
              `• _"1 dia 15"_ — muda dia do item 1`,
              [{ id: "sim", text: "✅ Cadastrar todas" }, { id: "nao", text: "❌ Cancelar" }],
              "Confirme ou edite os itens"
            );
          };

          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Cadastro de recorrências cancelado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const removeMatch = effectiveText.match(/^(\d+)\s+remover$/i);
          if (removeMatch) {
            const idx = parseInt(removeMatch[1]) - 1;
            if (idx >= 0 && idx < items.length) {
              const removed = items[idx];
              items = items.filter((_: any, i: number) => i !== idx);
              await supabaseAdmin.from("whatsapp_sessions").update({
                context: { ...ctx, items },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              if (items.length === 0) {
                await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
                await sendWhatsAppMessage(cleanPhone, `🗑️ *${removed.description}* removido. Lista vazia, cadastro cancelado.`);
              } else {
                await sendWhatsAppMessage(cleanPhone, `🗑️ *${removed.description}* removido!`);
                await showList(items);
              }
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const valorMatch = effectiveText.match(/^(\d+)\s+valor\s+(?:R\$\s?)?([\d.,]+)$/i);
          if (valorMatch) {
            const idx = parseInt(valorMatch[1]) - 1;
            const newVal = parseFloat(valorMatch[2].replace(",", "."));
            if (idx >= 0 && idx < items.length && !isNaN(newVal) && newVal > 0) {
              items[idx] = { ...items[idx], amount: newVal };
              await supabaseAdmin.from("whatsapp_sessions").update({
                context: { ...ctx, items },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              await sendWhatsAppMessage(cleanPhone, `✅ *${items[idx].description}* atualizado para ${fmt(newVal)}!`);
              await showList(items);
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const diaMatch = effectiveText.match(/^(\d+)\s+dia\s+(\d+)$/i);
          if (diaMatch) {
            const idx = parseInt(diaMatch[1]) - 1;
            const newDay = parseInt(diaMatch[2]);
            if (idx >= 0 && idx < items.length && newDay >= 1 && newDay <= 31) {
              items[idx] = { ...items[idx], day_of_month: newDay };
              await supabaseAdmin.from("whatsapp_sessions").update({
                context: { ...ctx, items },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              await sendWhatsAppMessage(cleanPhone, `✅ *${items[idx].description}* agora vence todo dia ${newDay}!`);
              await showList(items);
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (isConfirm) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            const inserts = items.map((item: any) => ({
              user_id: ctx.user_id,
              description: item.description,
              amount: Number(item.amount),
              type: item.type || "expense",
              category_id: item.category_id || null,
              day_of_month: item.day_of_month || new Date().getDate(),
              is_active: true,
              expense_type: "fixed",
            }));

            const { error: recErr } = await supabaseAdmin.from("recurring_transactions").insert(inserts);
            if (recErr) {
              await sendWhatsAppMessage(cleanPhone, `❌ Erro ao cadastrar recorrências: ${recErr.message}`);
            } else {
              const total = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
              const savedList = items.map((i: any, idx: number) =>
                `${idx + 1}. ✅ *${i.description}* — ${fmt(Number(i.amount))} · todo dia ${i.day_of_month || new Date().getDate()}`
              ).join("\n");
              await sendWhatsAppMessage(cleanPhone,
                `🎉 *${items.length} recorrências cadastradas!*\n\n` +
                savedList +
                `\n\n💸 *Total mensal: ${fmt(total)}*\n\n` +
                `_Aparecem automaticamente todo mês no painel Brave! 📊_`
              );
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          await showList(items);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: confirm and save one-time transaction list ──
        if (session.step === "confirm_onetime_list") {
          let items: any[] = ctx.items || [];
          const isConfirm = /sim|ok|yes|confirmar|✅ registrar todas|registrar todas?/i.test(effectiveText);
          const isCancel  = /^(não|nao|n|cancelar|cancel|❌ cancelar)$/i.test(effectiveText);

          const showList = async (currentItems: any[]) => {
            const totalAmount = currentItems.reduce((s: number, i: any) => s + Number(i.amount), 0);
            const lines = currentItems.map((i: any, idx: number) =>
              `${idx + 1}. *${i.description}* — ${fmt(Number(i.amount))}`
            );
            await sendWhatsAppButtons(
              cleanPhone,
              `💸 *Confirmar ${currentItems.length} transações?*\n\n` + lines.join("\n") +
              `\n\n💵 *Total: ${fmt(totalAmount)}*\n\n` +
              `✏️ _Para editar:_\n` +
              `• _"3 remover"_ — remove o item 3\n` +
              `• _"2 valor 50"_ — muda valor do item 2`,
              [{ id: "sim", text: "✅ Registrar todas" }, { id: "nao", text: "❌ Cancelar" }],
              "Confirme ou edite os itens"
            );
          };

          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Cadastro cancelado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const removeMatch = effectiveText.match(/^(\d+)\s+remover$/i);
          if (removeMatch) {
            const idx = parseInt(removeMatch[1]) - 1;
            if (idx >= 0 && idx < items.length) {
              const removed = items[idx];
              items = items.filter((_: any, i: number) => i !== idx);
              await supabaseAdmin.from("whatsapp_sessions").update({
                context: { ...ctx, items },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              if (items.length === 0) {
                await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
                await sendWhatsAppMessage(cleanPhone, `🗑️ *${removed.description}* removido. Lista vazia, cadastro cancelado.`);
              } else {
                await sendWhatsAppMessage(cleanPhone, `🗑️ *${removed.description}* removido!`);
                await showList(items);
              }
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const valorMatch = effectiveText.match(/^(\d+)\s+valor\s+(?:R\$\s?)?([\d.,]+)$/i);
          if (valorMatch) {
            const idx = parseInt(valorMatch[1]) - 1;
            const newVal = parseFloat(valorMatch[2].replace(",", "."));
            if (idx >= 0 && idx < items.length && !isNaN(newVal) && newVal > 0) {
              items[idx] = { ...items[idx], amount: newVal };
              await supabaseAdmin.from("whatsapp_sessions").update({
                context: { ...ctx, items },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              await sendWhatsAppMessage(cleanPhone, `✅ *${items[idx].description}* atualizado para ${fmt(newVal)}!`);
              await showList(items);
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (isConfirm) {
            // Check if user has multiple wallets before saving
            const { data: userWallets } = await supabaseAdmin
              .from("wallets")
              .select("id, name, balance")
              .eq("user_id", ctx.user_id)
              .order("created_at", { ascending: true });

            if (userWallets && userWallets.length > 1) {
              // Ask which wallet to use
              const walletLines = userWallets.map((w: any, idx: number) =>
                `${idx + 1}. *${w.name}* — ${fmt(Number(w.balance))}`
              );
              await supabaseAdmin.from("whatsapp_sessions").update({
                step: "ask_wallet_for_list",
                context: { ...ctx, wallets: userWallets },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              await sendWhatsAppMessage(
                cleanPhone,
                `🏦 *De qual conta saem essas transações?*\n\n` +
                walletLines.join("\n") +
                `\n\nEnvie o número da conta (ex: _"1"_)`
              );
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            // Single or no wallet — save directly
            const walletId = userWallets && userWallets.length === 1 ? userWallets[0].id : null;
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            const todayStr = getBrazilTodayStr();
            const inserts = items.map((item: any) => ({
              user_id: ctx.user_id,
              description: item.description,
              amount: Number(item.amount),
              type: item.type || "expense",
              category_id: item.category_id || null,
              date: todayStr,
              is_paid: true,
              wallet_id: walletId,
              card_id: null,
              recurring_id: null,
            }));

            const { error: txErr } = await supabaseAdmin.from("transactions").insert(inserts);
            if (txErr) {
              await sendWhatsAppMessage(cleanPhone, `❌ Erro ao registrar transações: ${txErr.message}`);
            } else {
              // Update wallet balance if single wallet
              if (walletId) {
                const totalExpense = items.filter((i: any) => (i.type || "expense") === "expense").reduce((s: number, i: any) => s + Number(i.amount), 0);
                const totalIncome = items.filter((i: any) => i.type === "income").reduce((s: number, i: any) => s + Number(i.amount), 0);
                const delta = totalIncome - totalExpense;
                if (delta !== 0) {
                  const { data: wData } = await supabaseAdmin.from("wallets").select("balance").eq("id", walletId).single();
                  if (wData) {
                    await supabaseAdmin.from("wallets").update({ balance: Number(wData.balance) + delta }).eq("id", walletId);
                  }
                }
              }
              const total = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
              const savedList = items.map((i: any, idx: number) =>
                `${idx + 1}. ✅ *${i.description}* — ${fmt(Number(i.amount))}`
              ).join("\n");
              await sendWhatsAppMessage(cleanPhone,
                `🎉 *${items.length} transações registradas!*\n\n` +
                savedList +
                `\n\n💵 *Total: ${fmt(total)}*\n\n` +
                `_Brave IA - Seu assessor financeiro 🤖_`
              );
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          await showList(items);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: ask wallet for one-time list ──
        if (session.step === "ask_wallet_for_list") {
          const items: any[] = ctx.items || [];
          const userWallets: any[] = ctx.wallets || [];
          const isCancel = /^(cancelar|cancel|não|nao|n|❌)$/i.test(effectiveText);

          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Cadastro cancelado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const numMatch = effectiveText.match(/^(\d+)$/);
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < userWallets.length) {
              const chosenWallet = userWallets[idx];
              await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
              const todayStr = getBrazilTodayStr();
              const inserts = items.map((item: any) => ({
                user_id: ctx.user_id,
                description: item.description,
                amount: Number(item.amount),
                type: item.type || "expense",
                category_id: item.category_id || null,
                date: todayStr,
                is_paid: true,
                wallet_id: chosenWallet.id,
                card_id: null,
                recurring_id: null,
              }));

              const { error: txErr } = await supabaseAdmin.from("transactions").insert(inserts);
              if (txErr) {
                await sendWhatsAppMessage(cleanPhone, `❌ Erro ao registrar: ${txErr.message}`);
              } else {
                // Update wallet balance
                const totalExpense = items.filter((i: any) => (i.type || "expense") === "expense").reduce((s: number, i: any) => s + Number(i.amount), 0);
                const totalIncome = items.filter((i: any) => i.type === "income").reduce((s: number, i: any) => s + Number(i.amount), 0);
                const delta = totalIncome - totalExpense;
                if (delta !== 0) {
                  const { data: wData } = await supabaseAdmin.from("wallets").select("balance").eq("id", chosenWallet.id).single();
                  if (wData) {
                    await supabaseAdmin.from("wallets").update({ balance: Number(wData.balance) + delta }).eq("id", chosenWallet.id);
                  }
                }
                const total = items.reduce((s: number, i: any) => s + Number(i.amount), 0);
                const savedList = items.map((i: any, idx2: number) =>
                  `${idx2 + 1}. ✅ *${i.description}* — ${fmt(Number(i.amount))}`
                ).join("\n");
                await sendWhatsAppMessage(cleanPhone,
                  `🎉 *${items.length} transações registradas na conta ${chosenWallet.name}!*\n\n` +
                  savedList +
                  `\n\n💵 *Total: ${fmt(total)}*\n\n` +
                  `_Brave IA - Seu assessor financeiro 🤖_`
                );
              }
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          // Invalid input - repeat
          const walletLines = userWallets.map((w: any, idx: number) =>
            `${idx + 1}. *${w.name}* — ${fmt(Number(w.balance))}`
          );
          await sendWhatsAppMessage(
            cleanPhone,
            `❓ Envie o número da conta:\n\n` + walletLines.join("\n")
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: managing recurring transactions ──
        if (session.step === "manage_recurrentes") {
          const recList: any[] = ctx.recList || [];
          const fmt2 = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

          if (/^\s*(voltar|sair|cancelar|cancel)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "👌 Ok! Até mais.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Match "cancelar X" or just a number
          const cancelNumMatch = effectiveText.match(/^(?:cancelar\s+)?(\d+)$/i);
          if (cancelNumMatch) {
            const allItems = [...(recList.filter((r: any) => r.type === "expense")), ...(recList.filter((r: any) => r.type === "income"))];
            const idx = parseInt(cancelNumMatch[1]) - 1;
            const chosen = allItems[idx];
            if (!chosen) {
              await sendWhatsAppMessage(cleanPhone, `❓ Item ${cancelNumMatch[1]} não encontrado. Envie um número válido ou *voltar* para sair.`);
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            // Confirm cancellation
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "confirm_cancel_recurring",
              context: { ...ctx, chosen_recurring: chosen },
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppButtons(
              cleanPhone,
              `⚠️ Cancelar a recorrência *${chosen.description}* (${fmt2(Number(chosen.amount))}/mês · dia ${chosen.day_of_month})?`,
              [{ id: "sim_cancel_rec", text: "✅ Sim, cancelar" }, { id: "voltar", text: "❌ Não, voltar" }],
              ""
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Unknown
          await sendWhatsAppMessage(cleanPhone, `❓ Envie o *número* da recorrência para cancelar, ou *voltar* para sair.\nEx: _"cancelar 2"_`);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: confirming recurring cancellation ──
        if (session.step === "confirm_cancel_recurring") {
          const chosen = ctx.chosen_recurring;
          const isConfirm = /sim|sim_cancel_rec|✅|confirmar/i.test(effectiveText);
          const isCancel  = /não|nao|voltar|❌/i.test(effectiveText);

          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "👌 Operação cancelada. A recorrência continua ativa.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (isConfirm) {
            await supabaseAdmin.from("recurring_transactions").update({ is_active: false }).eq("id", chosen.id);
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone,
              `🗑️ Recorrência *${chosen.description}* cancelada com sucesso!\n\n` +
              `_Ela não será mais gerada nos próximos meses._\n\n` +
              `_Brave IA - Seu assessor financeiro 🤖_`
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: select reminder to delete (numbered list) ──
        if (session.step === "select_reminder_to_delete") {
          const reminders: any[] = ctx.reminders_list || [];

          if (/^\s*(cancelar|sair|voltar)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Operação cancelada. Nenhum lembrete foi apagado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // "todos" or "all" → confirm delete all
          if (/^\s*(todos|tudo|all|0)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "confirm_bulk_delete",
              context: { ...ctx, delete_target: "reminders" },
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppButtons(
              cleanPhone,
              `🔔 *ATENÇÃO!* Você tem certeza que deseja apagar *TODOS os ${reminders.length} lembretes*?\n\n⚠️ Esta ação *NÃO pode ser desfeita*!`,
              [{ id: "BULK_DELETE_YES", text: "✅ Sim, apagar tudo" }, { id: "BULK_DELETE_NO", text: "❌ Não, cancelar" }],
              ""
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Pick by number
          const numMatch = effectiveText.match(/^(\d+)$/);
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < reminders.length) {
              const chosen = reminders[idx];
              await supabaseAdmin.from("whatsapp_sessions").update({
                step: "confirm_single_reminder_delete",
                context: { ...ctx, chosen_reminder: chosen },
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              await sendWhatsAppButtons(
                cleanPhone,
                `⚠️ Tem certeza que quer apagar o lembrete *${chosen.title}*?`,
                [{ id: "CONFIRM_DELETE_REMINDER", text: "✅ Sim, apagar" }, { id: "BACK_DELETE_LIST", text: "❌ Não, voltar" }],
                ""
              );
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          // Invalid input — re-show list
          const list = reminders.map((r: any, i: number) => {
            const dt = new Date(r.event_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
            return `${i + 1}. 🔔 ${r.title} — ${dt}`;
          }).join("\n");
          await sendWhatsAppMessage(cleanPhone,
            `❓ Não entendi. Responda com o *número* do lembrete para apagar:\n\n${list}\n\n0️⃣ *Todos* — apagar todos\n❌ *Cancelar* — sair`
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: confirm single reminder delete ──
        if (session.step === "confirm_single_reminder_delete") {
          const chosen: any = ctx.chosen_reminder;
          const isConfirm = /sim|ok|yes|confirmar|CONFIRM_DELETE_REMINDER|✅/i.test(effectiveText);
          const isCancel = /não|nao|voltar|cancelar|BACK_DELETE_LIST|❌/i.test(effectiveText);

          if (isConfirm) {
            await supabaseAdmin.from("reminders").delete().eq("id", chosen.id);
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, `🗑️ Lembrete *${chosen.title}* apagado com sucesso!\n\n_Brave IA 🤖_`);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (isCancel) {
            // Go back to the list
            const reminders: any[] = ctx.reminders_list || [];
            const list = reminders.map((r: any, i: number) => {
              const dt = new Date(r.event_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
              return `${i + 1}. 🔔 ${r.title} — ${dt}`;
            }).join("\n");
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "select_reminder_to_delete",
              context: ctx,
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone,
              `👌 Ok! Escolha outro lembrete para apagar:\n\n${list}\n\n0️⃣ *Todos* — apagar todos\n❌ *Cancelar* — sair`
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          await sendWhatsAppButtons(
            cleanPhone,
            "⚠️ Responda *sim* para confirmar ou *não* para voltar.",
            [{ id: "CONFIRM_DELETE_REMINDER", text: "✅ Sim, apagar" }, { id: "BACK_DELETE_LIST", text: "❌ Não, voltar" }],
            ""
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: select transaction to delete (numbered list) ──
        if (session.step === "select_transaction_to_delete") {
          const items: any[] = ctx.items_list || [];
          const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          if (/^\s*(cancelar|sair|voltar)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Operação cancelada. Nenhuma transação foi apagada.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^\s*(todos|tudo|all|0)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "confirm_bulk_delete",
              context: { ...ctx, delete_target: "transactions" },
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppButtons(cleanPhone,
              `💸 *ATENÇÃO!* Deseja apagar *TODAS as ${items.length} transações*?\n\n⚠️ Saldos das carteiras serão revertidos. Esta ação *NÃO pode ser desfeita*!`,
              [{ id: "BULK_DELETE_YES", text: "✅ Sim, apagar tudo" }, { id: "BULK_DELETE_NO", text: "❌ Não, cancelar" }], "");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const numMatch = effectiveText.match(/^(\d+)$/);
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < items.length) {
              const chosen = items[idx];
              await supabaseAdmin.from("whatsapp_sessions").update({
                step: "confirm_single_item_delete",
                context: { ...ctx, chosen_item: chosen, item_type: "transaction" },
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              await sendWhatsAppButtons(cleanPhone,
                `⚠️ Apagar transação *${chosen.description}* (${fmt(Number(chosen.amount))})?`,
                [{ id: "CONFIRM_ITEM_DEL", text: "✅ Sim, apagar" }, { id: "BACK_ITEM_LIST", text: "❌ Não, voltar" }], "");
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          const list = items.map((t: any, i: number) => {
            const icon = t.type === "income" ? "📈" : "📉";
            return `${i + 1}. ${icon} *${t.description}* — ${fmt(Number(t.amount))}`;
          }).join("\n");
          await sendWhatsAppMessage(cleanPhone, `❓ Responda com o *número*:\n\n${list}\n\n0️⃣ *Todos* — apagar todas\n❌ *Cancelar* — sair`);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: select card to delete (numbered list) ──
        if (session.step === "select_card_to_delete") {
          const items: any[] = ctx.items_list || [];

          if (/^\s*(cancelar|sair|voltar)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Operação cancelada. Nenhum cartão foi apagado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^\s*(todos|tudo|all|0)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "confirm_bulk_delete",
              context: { ...ctx, delete_target: "cards" },
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppButtons(cleanPhone,
              `💳 *ATENÇÃO!* Deseja apagar *TODOS os ${items.length} cartões*?\n\n⚠️ Esta ação *NÃO pode ser desfeita*!`,
              [{ id: "BULK_DELETE_YES", text: "✅ Sim, apagar tudo" }, { id: "BULK_DELETE_NO", text: "❌ Não, cancelar" }], "");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const numMatch = effectiveText.match(/^(\d+)$/);
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < items.length) {
              const chosen = items[idx];
              await supabaseAdmin.from("whatsapp_sessions").update({
                step: "confirm_single_item_delete",
                context: { ...ctx, chosen_item: chosen, item_type: "card" },
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              const label = chosen.last_4_digits ? `${chosen.name} (****${chosen.last_4_digits})` : chosen.name;
              await sendWhatsAppButtons(cleanPhone,
                `⚠️ Apagar cartão *${label}*?`,
                [{ id: "CONFIRM_ITEM_DEL", text: "✅ Sim, apagar" }, { id: "BACK_ITEM_LIST", text: "❌ Não, voltar" }], "");
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          const list = items.map((c: any, i: number) => {
            const digits = c.last_4_digits ? ` (****${c.last_4_digits})` : "";
            return `${i + 1}. 💳 *${c.name}*${digits}`;
          }).join("\n");
          await sendWhatsAppMessage(cleanPhone, `❓ Responda com o *número*:\n\n${list}\n\n0️⃣ *Todos* — apagar todos\n❌ *Cancelar* — sair`);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: select wallet to delete (numbered list) ──
        if (session.step === "select_wallet_to_delete") {
          const items: any[] = ctx.items_list || [];
          const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          if (/^\s*(cancelar|sair|voltar)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Operação cancelada. Nenhuma carteira foi apagada.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^\s*(todos|tudo|all|0)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "confirm_bulk_delete",
              context: { ...ctx, delete_target: "wallets" },
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppButtons(cleanPhone,
              `💳 *ATENÇÃO!* Deseja apagar *TODAS as ${items.length} carteiras*?\n\n⚠️ Esta ação *NÃO pode ser desfeita*!`,
              [{ id: "BULK_DELETE_YES", text: "✅ Sim, apagar tudo" }, { id: "BULK_DELETE_NO", text: "❌ Não, cancelar" }], "");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const numMatch = effectiveText.match(/^(\d+)$/);
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < items.length) {
              const chosen = items[idx];
              await supabaseAdmin.from("whatsapp_sessions").update({
                step: "confirm_single_item_delete",
                context: { ...ctx, chosen_item: chosen, item_type: "wallet" },
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              await sendWhatsAppButtons(cleanPhone,
                `⚠️ Apagar carteira *${chosen.name}* (${fmt(Number(chosen.balance))})?`,
                [{ id: "CONFIRM_ITEM_DEL", text: "✅ Sim, apagar" }, { id: "BACK_ITEM_LIST", text: "❌ Não, voltar" }], "");
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          const list = items.map((w: any, i: number) => `${i + 1}. 💳 *${w.name}* — ${fmt(Number(w.balance))}`).join("\n");
          await sendWhatsAppMessage(cleanPhone, `❓ Responda com o *número*:\n\n${list}\n\n0️⃣ *Todas* — apagar todas\n❌ *Cancelar* — sair`);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: confirm single item delete (transactions/cards/wallets) ──
        if (session.step === "confirm_single_item_delete") {
          const chosen: any = ctx.chosen_item;
          const itemType: string = ctx.item_type;
          const isConfirm = /sim|ok|yes|confirmar|CONFIRM_ITEM_DEL|✅/i.test(effectiveText);
          const isCancel = /não|nao|voltar|cancelar|BACK_ITEM_LIST|❌/i.test(effectiveText);

          if (isConfirm) {
            let msg = "";
            if (itemType === "transaction") {
              // Revert wallet balance
              if (chosen.wallet_id) {
                const { data: w } = await supabaseAdmin.from("wallets").select("id, balance").eq("id", chosen.wallet_id).maybeSingle();
                if (w) {
                  const revert = chosen.type === "income" ? -Number(chosen.amount) : Number(chosen.amount);
                  await supabaseAdmin.from("wallets").update({ balance: Number(w.balance) + revert }).eq("id", w.id);
                }
              }
              await supabaseAdmin.from("transactions").delete().eq("id", chosen.id);
              msg = `🗑️ Transação *${chosen.description}* apagada!`;
            } else if (itemType === "card") {
              await supabaseAdmin.from("cards").delete().eq("id", chosen.id);
              msg = `🗑️ Cartão *${chosen.name}* apagado!`;
            } else if (itemType === "wallet") {
              await supabaseAdmin.from("wallets").delete().eq("id", chosen.id);
              msg = `🗑️ Carteira *${chosen.name}* apagada!`;
            } else if (itemType === "goal") {
              await supabaseAdmin.from("financial_goals").delete().eq("id", chosen.id);
              msg = `🗑️ Meta *${chosen.name}* apagada!`;
            } else if (itemType === "category") {
              await supabaseAdmin.from("categories").delete().eq("id", chosen.id);
              msg = `🗑️ Categoria *${chosen.name}* apagada!`;
            } else if (itemType === "recurring") {
              await supabaseAdmin.from("recurring_transactions").delete().eq("id", chosen.id);
              msg = `🗑️ Recorrência *${chosen.description}* apagada!`;
            }
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, `${msg}\n\n_Brave IA 🤖_`);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (isCancel) {
            // Go back to the appropriate list
            const stepMap: Record<string, string> = {
              transaction: "select_transaction_to_delete",
              card: "select_card_to_delete",
              wallet: "select_wallet_to_delete",
              goal: "select_goal_to_delete",
              category: "select_category_to_delete",
              recurring: "select_recurring_to_delete",
            };
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: stepMap[itemType] || "select_transaction_to_delete",
              context: ctx,
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "👌 Ok! Escolha outro item para apagar ou envie *cancelar* para sair.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          await sendWhatsAppButtons(cleanPhone,
            "⚠️ Responda *sim* para confirmar ou *não* para voltar.",
            [{ id: "CONFIRM_ITEM_DEL", text: "✅ Sim, apagar" }, { id: "BACK_ITEM_LIST", text: "❌ Não, voltar" }], "");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: select goal to delete (numbered list) ──
        if (session.step === "select_goal_to_delete") {
          const items: any[] = ctx.items_list || [];
          const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          if (/^\s*(cancelar|sair|voltar)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Operação cancelada. Nenhuma meta foi apagada.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^\s*(todos|tudo|all|0)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "confirm_bulk_delete", context: { ...ctx, delete_target: "goals" },
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppButtons(cleanPhone,
              `🎯 *ATENÇÃO!* Deseja apagar *TODAS as ${items.length} metas*?\n\n⚠️ Esta ação *NÃO pode ser desfeita*!`,
              [{ id: "BULK_DELETE_YES", text: "✅ Sim, apagar tudo" }, { id: "BULK_DELETE_NO", text: "❌ Não, cancelar" }], "");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const numMatch = effectiveText.match(/^(\d+)$/);
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < items.length) {
              const chosen = items[idx];
              await supabaseAdmin.from("whatsapp_sessions").update({
                step: "confirm_single_item_delete", context: { ...ctx, chosen_item: chosen, item_type: "goal" },
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              await sendWhatsAppButtons(cleanPhone,
                `⚠️ Apagar meta *${chosen.name}* (${fmt(Number(chosen.current_amount))}/${fmt(Number(chosen.target_amount))})?`,
                [{ id: "CONFIRM_ITEM_DEL", text: "✅ Sim, apagar" }, { id: "BACK_ITEM_LIST", text: "❌ Não, voltar" }], "");
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          const list = items.map((g: any, i: number) => {
            const pct = Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100);
            return `${i + 1}. 🎯 *${g.name}* — ${pct}% (${fmt(Number(g.current_amount))}/${fmt(Number(g.target_amount))})`;
          }).join("\n");
          await sendWhatsAppMessage(cleanPhone, `❓ Responda com o *número*:\n\n${list}\n\n0️⃣ *Todas* — apagar todas\n❌ *Cancelar* — sair`);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: select category to delete (numbered list) ──
        if (session.step === "select_category_to_delete") {
          const items: any[] = ctx.items_list || [];

          if (/^\s*(cancelar|sair|voltar)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Operação cancelada. Nenhuma categoria foi apagada.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^\s*(todos|tudo|all|0)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "confirm_bulk_delete", context: { ...ctx, delete_target: "categories" },
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppButtons(cleanPhone,
              `📂 *ATENÇÃO!* Deseja apagar *TODAS as ${items.length} categorias*?\n\n⚠️ Esta ação *NÃO pode ser desfeita*!`,
              [{ id: "BULK_DELETE_YES", text: "✅ Sim, apagar tudo" }, { id: "BULK_DELETE_NO", text: "❌ Não, cancelar" }], "");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const numMatch = effectiveText.match(/^(\d+)$/);
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < items.length) {
              const chosen = items[idx];
              await supabaseAdmin.from("whatsapp_sessions").update({
                step: "confirm_single_item_delete", context: { ...ctx, chosen_item: chosen, item_type: "category" },
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              await sendWhatsAppButtons(cleanPhone,
                `⚠️ Apagar categoria *${chosen.name}*?`,
                [{ id: "CONFIRM_ITEM_DEL", text: "✅ Sim, apagar" }, { id: "BACK_ITEM_LIST", text: "❌ Não, voltar" }], "");
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          const list = items.map((c: any, i: number) => `${i + 1}. 📂 *${c.name}*`).join("\n");
          await sendWhatsAppMessage(cleanPhone, `❓ Responda com o *número*:\n\n${list}\n\n0️⃣ *Todas* — apagar todas\n❌ *Cancelar* — sair`);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: select recurring to delete (numbered list) ──
        if (session.step === "select_recurring_to_delete") {
          const items: any[] = ctx.items_list || [];
          const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

          if (/^\s*(cancelar|sair|voltar)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Operação cancelada. Nenhuma recorrência foi apagada.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^\s*(todos|tudo|all|0)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "confirm_bulk_delete", context: { ...ctx, delete_target: "recurring" },
              expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppButtons(cleanPhone,
              `🔄 *ATENÇÃO!* Deseja apagar *TODAS as ${items.length} recorrências*?\n\n⚠️ Esta ação *NÃO pode ser desfeita*!`,
              [{ id: "BULK_DELETE_YES", text: "✅ Sim, apagar tudo" }, { id: "BULK_DELETE_NO", text: "❌ Não, cancelar" }], "");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const numMatch = effectiveText.match(/^(\d+)$/);
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < items.length) {
              const chosen = items[idx];
              await supabaseAdmin.from("whatsapp_sessions").update({
                step: "confirm_single_item_delete", context: { ...ctx, chosen_item: chosen, item_type: "recurring" },
                expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              await sendWhatsAppButtons(cleanPhone,
                `⚠️ Apagar recorrência *${chosen.description}* (${fmt(Number(chosen.amount))})?`,
                [{ id: "CONFIRM_ITEM_DEL", text: "✅ Sim, apagar" }, { id: "BACK_ITEM_LIST", text: "❌ Não, voltar" }], "");
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          const list = items.map((r: any, i: number) => {
            const icon = r.type === "income" ? "📈" : "📉";
            return `${i + 1}. ${icon} *${r.description}* — ${fmt(Number(r.amount))}/mês (dia ${r.day_of_month})`;
          }).join("\n");
          await sendWhatsAppMessage(cleanPhone, `❓ Responda com o *número*:\n\n${list}\n\n0️⃣ *Todas* — apagar todas\n❌ *Cancelar* — sair`);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: confirm bulk delete ──
        if (session.step === "confirm_bulk_delete") {
          const isConfirm = /sim|ok|yes|confirmar|BULK_DELETE_YES|✅/i.test(effectiveText);
          const isCancel = /não|nao|n|cancelar|cancel|BULK_DELETE_NO|❌/i.test(effectiveText);

          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Operação cancelada. Nenhum dado foi apagado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (isConfirm) {
            const target = ctx.delete_target;
            const uid = ctx.user_id;
            let resultMsg = "";

            try {
              if (target === "reminders") {
                await supabaseAdmin.from("reminders").delete().eq("user_id", uid);
                resultMsg = "🗑️ *Todos os lembretes foram apagados!*";
              } else if (target === "transactions") {
                // Restore wallet balances before deleting
                const { data: txs } = await supabaseAdmin.from("transactions").select("amount, type, wallet_id").eq("user_id", uid);
                if (txs) {
                  const walletChanges: Record<string, number> = {};
                  for (const tx of txs) {
                    if (tx.wallet_id) {
                      if (!walletChanges[tx.wallet_id]) walletChanges[tx.wallet_id] = 0;
                      walletChanges[tx.wallet_id] += tx.type === "income" ? -Number(tx.amount) : Number(tx.amount);
                    }
                  }
                  for (const [wid, change] of Object.entries(walletChanges)) {
                    const { data: w } = await supabaseAdmin.from("wallets").select("id, balance").eq("id", wid).maybeSingle();
                    if (w) await supabaseAdmin.from("wallets").update({ balance: Number(w.balance) + change }).eq("id", w.id);
                  }
                }
                await supabaseAdmin.from("transactions").delete().eq("user_id", uid);
                resultMsg = "🗑️ *Todas as transações foram apagadas!* Saldos das carteiras revertidos.";
              } else if (target === "cards") {
                await supabaseAdmin.from("cards").delete().eq("user_id", uid);
                resultMsg = "🗑️ *Todos os cartões foram apagados!*";
              } else if (target === "wallets") {
                await supabaseAdmin.from("wallets").delete().eq("user_id", uid);
                resultMsg = "🗑️ *Todas as carteiras foram apagadas!*";
              } else if (target === "goals") {
                await supabaseAdmin.from("financial_goals").delete().eq("user_id", uid);
                resultMsg = "🗑️ *Todas as metas foram apagadas!*";
              } else if (target === "categories") {
                await supabaseAdmin.from("categories").delete().eq("user_id", uid);
                resultMsg = "🗑️ *Todas as categorias foram apagadas!*";
              } else if (target === "recurring") {
                await supabaseAdmin.from("recurring_transactions").delete().eq("user_id", uid);
                resultMsg = "🗑️ *Todas as recorrências foram apagadas!*";
              } else if (target === "all") {
                await supabaseAdmin.from("reminders").delete().eq("user_id", uid);
                await supabaseAdmin.from("transactions").delete().eq("user_id", uid);
                await supabaseAdmin.from("cards").delete().eq("user_id", uid);
                await supabaseAdmin.from("financial_goals").delete().eq("user_id", uid);
                await supabaseAdmin.from("recurring_transactions").delete().eq("user_id", uid);
                await supabaseAdmin.from("wallets").delete().eq("user_id", uid);
                await supabaseAdmin.from("categories").delete().eq("user_id", uid);
                resultMsg = "🗑️ *Todos os dados financeiros foram resetados!* Lembretes, transações, carteiras, cartões, metas, categorias e recorrências foram apagados.";
              }
            } catch (err) {
              console.error("Bulk delete error:", err);
              resultMsg = "❌ Erro ao apagar dados. Tente novamente.";
            }

            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, resultMsg + "\n\n_Brave IA 🤖_");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Didn't understand
          await sendWhatsAppButtons(
            cleanPhone,
            "⚠️ Responda *sim* para confirmar ou *não* para cancelar.",
            [{ id: "BULK_DELETE_YES", text: "✅ Sim, apagar" }, { id: "BULK_DELETE_NO", text: "❌ Não, cancelar" }],
            ""
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: waiting for user to pick which bill to mark as paid ──
        if (session.step === "bill_selection") {
          const bills: any[] = ctx.bills || [];

          // Cancel command
          if (/^\s*(cancelar|cancel|sair|exit)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Operação cancelada.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Try to match by number (1, 2, 3...) or partial description
          let matched: any = null;
          const numMatch = effectiveText.match(/^(\d+)$/);
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < bills.length) matched = bills[idx];
          } else {
            matched = bills.find((b: any) =>
              b.description.toLowerCase().includes(effectiveText.toLowerCase())
            );
          }

          if (!matched) {
            const opts = bills.map((b: any, i: number) => `${i + 1}. ${b.description} — ${fmt(Number(b.amount))}`).join("\n");
            await sendWhatsAppMessage(cleanPhone,
              `❓ Não encontrei essa conta. Responda com o *número* da conta:\n\n${opts}\n\nOu envie *cancelar* para sair.`
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Fetch user wallets
          const { data: wallets } = await supabaseAdmin
            .from("wallets")
            .select("id, name, balance, type")
            .eq("user_id", ctx.user_id)
            .order("created_at", { ascending: true });

          // Update session to wallet_selection step
          await supabaseAdmin
            .from("whatsapp_sessions")
            .update({
              step: "wallet_selection",
              context: { ...ctx, selected_bill: matched, wallets: wallets || [] },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            })
            .eq("id", session.id);

          const walletList = (wallets || []).map((w: any, i: number) =>
            `${i + 1}. ${w.name} — saldo: ${fmt(Number(w.balance))}`
          ).join("\n");

          const due = matched.due_date
            ? new Date(matched.due_date + "T12:00:00").toLocaleDateString("pt-BR")
            : "—";

          await sendWhatsAppMessage(cleanPhone,
            `✅ *${matched.description}* selecionada!\n` +
            `💵 Valor: ${fmt(Number(matched.amount))} · vence ${due}\n\n` +
            `💳 De qual conta/carteira saiu o pagamento?\n\n${walletList}\n\n` +
            `Responda com o *número* ou *nome* da carteira. Ou envie *cancelar*.`
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: waiting for wallet selection ──
        if (session.step === "wallet_selection") {
          const selectedBill: any = ctx.selected_bill;
          const wallets: any[] = ctx.wallets || [];

          // Cancel command
          if (/^\s*(cancelar|cancel|sair|exit)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Operação cancelada.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          let matchedWallet: any = null;
          const numMatch = effectiveText.match(/^(\d+)$/);
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < wallets.length) matchedWallet = wallets[idx];
          } else {
            matchedWallet = wallets.find((w: any) =>
              w.name.toLowerCase().includes(effectiveText.toLowerCase())
            );
          }

          if (!matchedWallet) {
            const opts = wallets.map((w: any, i: number) => `${i + 1}. ${w.name} — ${fmt(Number(w.balance))}`).join("\n");
            await sendWhatsAppMessage(cleanPhone,
              `❓ Não encontrei essa carteira. Responda com o *número*:\n\n${opts}\n\nOu envie *cancelar*.`
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Mark the bill as paid
          const { error: updateErr } = await supabaseAdmin
            .from("transactions")
            .update({ is_paid: true })
            .eq("id", selectedBill.id)
            .eq("user_id", ctx.user_id);

          if (updateErr) {
            await sendWhatsAppMessage(cleanPhone, `❌ Erro ao marcar como pago: ${updateErr.message}`);
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Deduct amount from wallet
          const newBalance = Number(matchedWallet.balance) - Number(selectedBill.amount);
          await supabaseAdmin
            .from("wallets")
            .update({ balance: newBalance })
            .eq("id", matchedWallet.id);

          // Clean up session
          await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);

          await sendWhatsAppMessage(cleanPhone,
            `✅ *Conta paga com sucesso!*\n\n` +
            `📝 ${selectedBill.description}\n` +
            `💵 ${fmt(Number(selectedBill.amount))}\n` +
            `💳 Debitado de: *${matchedWallet.name}*\n` +
            `💰 Novo saldo da carteira: ${fmt(newBalance)}\n\n` +
            `_Brave Assessor - Seu assessor financeiro 🤖_`
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: waiting for notify_minutes_before ──
        if (session.step === "reminder_notify") {
          const cancel = /^\s*(cancelar|cancel|sair)\s*$/i.test(effectiveText);
          if (cancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Lembrete cancelado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // ── Awaiting time input (user gave date but no time) ──
          if (ctx.awaiting === "time") {
            const timeMatch = effectiveText.match(/(\d{1,2})\s*[h:]\s*(\d{0,2})/i);
            if (timeMatch) {
              const hours = parseInt(timeMatch[1]);
              const minutes = parseInt(timeMatch[2] || "0");
              if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
                const currentEventAt = new Date(ctx.event_at);
                const brDate = new Date(currentEventAt.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
                brDate.setHours(hours, minutes, 0, 0);
                const utcCorrected = new Date(brDate.getTime() + 3 * 60 * 60 * 1000);
                const newEventAt = utcCorrected.toISOString();

                // Remove awaiting flag, move to ask antecedência
                const newCtx = { ...ctx, event_at: newEventAt };
                delete newCtx.awaiting;

                await supabaseAdmin.from("whatsapp_sessions").update({
                  context: newCtx,
                  expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                }).eq("id", session.id);

                const dtLabel = utcCorrected.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
                const recLbl = recurrenceLabel(ctx.recurrence || "none", newEventAt, ctx.originalText || "");

                await sendWhatsAppButtons(
                  cleanPhone,
                  `🔔 *${ctx.title}*\n📅 ${dtLabel}${recLbl ? `\n${recLbl}` : ""}\n\n⏰ Com quanto tempo de antecedência você quer ser avisado?`,
                  [{ id: "5m", text: "5 minutos" }, { id: "10m", text: "10 minutos" }, { id: "30m", text: "30 minutos" }],
                  "Ou escreva: 1h, 15 min, 2 horas..."
                );
                return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
              }
            }
            // Didn't understand time
            await sendWhatsAppMessage(cleanPhone, "🕐 Não entendi o horário. Envie no formato: *14h*, *15:30*, *9h*");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // ── Detect time/date correction: "não é 11:00 é 14:00", "14:00", "14h", "as 14:00" ──
          const timeCorrectionMatch = effectiveText.match(/(?:(?:não|nao)\s+é?\s*\d{1,2}[h:]\d{0,2}\s*(?:é|e|,)\s*)?(\d{1,2})[h:](\d{0,2})/i);
          const isTimeCorrection = /(?:não|nao)\s+é?\s*\d{1,2}|^\s*\d{1,2}[h:]\d{0,2}\s*$/i.test(effectiveText) && !parseNotifyMinutes(effectiveText);
          
          if (isTimeCorrection && timeCorrectionMatch) {
            const hours = parseInt(timeCorrectionMatch[1]);
            const minutes = parseInt(timeCorrectionMatch[2] || "0");
            if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
              const currentEventAt = new Date(ctx.event_at);
              const brDate = new Date(currentEventAt.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
              brDate.setHours(hours, minutes, 0, 0);
              const utcCorrected = new Date(brDate.getTime() + 3 * 60 * 60 * 1000);
              const newEventAt = utcCorrected.toISOString();
              
              await supabaseAdmin.from("whatsapp_sessions").update({
                context: { ...ctx, event_at: newEventAt },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              
              const dtLabel = utcCorrected.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
              await sendWhatsAppMessage(cleanPhone, `✅ Horário corrigido para *${dtLabel}*!`);
              
              await sendWhatsAppButtons(
                cleanPhone,
                `⏰ Com quanto tempo de antecedência você quer ser avisado?`,
                [{ id: "5m", text: "5 minutos" }, { id: "10m", text: "10 minutos" }, { id: "30m", text: "30 minutos" }],
                "Ou escreva: 1h, 15 min, 2 horas..."
              );
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          // Try button value first (e.g. "30 min", "1h", "1 dia")
          const notifyMins = parseNotifyMinutes(effectiveText);
          if (notifyMins === null) {
            await sendWhatsAppButtons(
              cleanPhone,
              "⏰ Não entendi. Quanto tempo antes você quer ser avisado?\n\nExemplo: 30 min, 1h, 2h, 1 dia\n\n_Para corrigir o horário, digite o horário correto (ex: 14:00)_",
              [{ id: "30m", text: "30 minutos" }, { id: "1h", text: "1 hora" }, { id: "1d", text: "1 dia" }],
              "Ou escreva manualmente"
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // All data gathered – store and show full confirmation before saving
          const reminderCtx = ctx;

          // Update session to reminder_confirm step with notifyMins included
          await supabaseAdmin.from("whatsapp_sessions").update({
            step: "reminder_confirm",
            context: {
              ...ctx,
              notify_minutes_before: notifyMins,
            },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          }).eq("id", session.id);

          const fmtDate = (s: string) =>
            new Date(s).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
            });

          let notifyLabel = "";
          if (notifyMins < 60) notifyLabel = `${notifyMins} minutos`;
          else if (notifyMins < 1440) notifyLabel = `${notifyMins / 60} hora(s)`;
          else notifyLabel = `${notifyMins / 1440} dia(s)`;

          const recLblForNotify = recurrenceLabel(reminderCtx.recurrence || "none", reminderCtx.event_at, reminderCtx.originalText || "");

          await sendWhatsAppButtons(
            cleanPhone,
            `🔔 *Confirmar lembrete?*\n\n` +
            `📝 *Nome:* ${reminderCtx.title}\n` +
            `📅 *Horário:* ${fmtDate(reminderCtx.event_at)}\n` +
            `⏰ *Aviso:* ${notifyLabel} antes\n` +
            (recLblForNotify ? `${recLblForNotify}\n` : `🔂 *Recorrência:* Nenhuma\n`),
            [{ id: "CONFIRM_REMINDER", text: "✅ Confirmar" }, { id: "cancelar", text: "❌ Cancelar" }],
            "Toque para confirmar"
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: listing reminders — user picks one ──
        if (session.step === "list_reminders") {
          const reminders: any[] = ctx.reminders || [];

          if (/^\s*(cancelar|sair|voltar)\s*$/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "👌 Ok, saindo da lista de lembretes.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const numMatch = effectiveText.match(/^(\d+)$/);
          let chosen: any = null;
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < reminders.length) chosen = reminders[idx];
          }

          if (!chosen) {
            const list = reminders.map((r: any, i: number) => {
              const dt = new Date(r.event_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
              return `${i + 1}. 🔔 ${r.title} — ${dt}`;
            }).join("\n");
            await sendWhatsAppMessage(cleanPhone,
              `❓ Não entendi. Responda com o *número* do lembrete:\n\n${list}\n\nOu envie *cancelar* para sair.`
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Show chosen reminder and offer actions
          await supabaseAdmin.from("whatsapp_sessions").update({
            step: "reminder_action",
            context: { ...ctx, chosen_reminder: chosen },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          }).eq("id", session.id);

          const dt = new Date(chosen.event_at).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", year: "numeric",
            hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
          });
          const recMap: Record<string, string> = { none: "", daily: "🔁 Diário", weekly: "🔁 Semanal", monthly: "🔁 Mensal" };
          const recLabel = recMap[chosen.recurrence] || "";

          await sendWhatsAppButtons(
            cleanPhone,
            `🔔 *${chosen.title}*\n📅 ${dt}${recLabel ? `\n${recLabel}` : ""}\n\nO que deseja fazer?`,
            [{ id: "EDIT_REMINDER", text: "✏️ Editar" }, { id: "DELETE_REMINDER", text: "🗑️ Cancelar lembrete" }, { id: "BACK_REMINDERS", text: "⬅️ Voltar" }],
            "Escolha uma opção"
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: action on a chosen reminder ──
        if (session.step === "reminder_action") {
          const chosen: any = ctx.chosen_reminder;

          // Match by buttonId Outton text (UAZAPI may send text instead of ID)
          const isDeleteTrigger = /^(DELETE_REMINDER|cancelar.?lembrete|remover.?lembrete|deletar|🗑️|cancelar lembrete)/i.test(effectiveText);
          if (isDeleteTrigger) {
            await sendWhatsAppButtons(
              cleanPhone,
              `⚠️ Tem certeza que quer cancelar o lembrete *${chosen.title}*?`,
              [{ id: "CONFIRM_DELETE_REMINDER", text: "✅ Sim, cancelar" }, { id: "BACK_REMINDERS", text: "❌ Não, voltar" }],
              ""
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^(CONFIRM_DELETE_REMINDER|✅ sim, cancelar|sim, cancelar)/i.test(effectiveText)) {
            await supabaseAdmin.from("reminders").delete().eq("id", chosen.id);
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, `🗑️ Lembrete *${chosen.title}* cancelado com sucesso!\n\n_Brave IA - Seu assessor financeiro 🤖_`);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^(BACK_REMINDERS|⬅️ voltar|voltar)/i.test(effectiveText)) {
            // Rebuild the reminder list
            const reminders: any[] = ctx.reminders || [];
            const list = reminders.map((r: any, i: number) => {
              const dt = new Date(r.event_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
              return `${i + 1}. 🔔 ${r.title} — ${dt}`;
            }).join("\n");

            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "list_reminders",
              context: ctx,
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);

            await sendWhatsAppMessage(cleanPhone, `📋 *Seus lembretes ativos:*\n\n${list}\n\nResponda com o *número* para gerenciar ou envie *cancelar*.`);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^(EDIT_REMINDER|✏️ editar|editar)/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "reminder_edit_field",
              context: { ...ctx, chosen_reminder: chosen },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);

            await sendWhatsAppButtons(
              cleanPhone,
              `✏️ *Editar: ${chosen.title}*\n\nO que deseja alterar?`,
              [{ id: "EDIT_TITLE", text: "📝 Nome" }, { id: "EDIT_DATE", text: "📅 Data/hora" }, { id: "EDIT_NOTIFY", text: "⏰ Aviso antecipado" }],
              "Escolha o que editar"
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }

        // ── Step: user chose which field to edit ──
        if (session.step === "reminder_edit_field") {
          const chosen: any = ctx.chosen_reminder;

          if (/^EDIT_TITLE/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "reminder_edit_value",
              context: { ...ctx, edit_field: "title" },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, `📝 Envie o *novo nome* para o lembrete "${chosen.title}":`);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^EDIT_DATE/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "reminder_edit_value",
              context: { ...ctx, edit_field: "event_at" },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, `📅 Envie a *nova data e hora* do lembrete "${chosen.title}":\n\nExemplo: amanhã 15h, 25/02 10:00, sexta 14h`);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (/^EDIT_NOTIFY/i.test(effectiveText)) {
            await supabaseAdmin.from("whatsapp_sessions").update({
              step: "reminder_edit_value",
              context: { ...ctx, edit_field: "notify_minutes_before" },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppButtons(
              cleanPhone,
              `⏰ Com quanto tempo de antecedência quer ser avisado sobre "${chosen.title}"?`,
              [{ id: "5m", text: "5 minutos" }, { id: "10m", text: "10 minutos" }, { id: "30m", text: "30 minutos" }],
              "Ou escreva: 1h, 15 min, 2 horas..."
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }

        // ── Step: user typed the new value for the edited field ──
        if (session.step === "reminder_edit_value") {
          const chosen: any = ctx.chosen_reminder;
          const field: string = ctx.edit_field;
          let updateData: any = {};
          let successMsg = "";

          if (field === "title") {
            if (!effectiveText || effectiveText.length < 2) {
              await sendWhatsAppMessage(cleanPhone, "❓ Por favor, envie um nome válido para o lembrete.");
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            updateData.title = effectiveText;
            successMsg = `✅ Nome atualizado para *${effectiveText}*!`;
          } else if (field === "event_at") {
            const newDate = parseDateTimeBR(effectiveText);
            if (!newDate) {
              await sendWhatsAppMessage(cleanPhone, `❓ Não entendi a data. Tente: "amanhã 15h", "25/02 10:00", "sexta 14h"`);
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            updateData.event_at = newDate.toISOString();
            updateData.is_sent = false;
            const dt = newDate.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
            successMsg = `✅ Data atualizada para *${dt}*!`;
          } else if (field === "notify_minutes_before") {
            const mins = parseNotifyMinutes(effectiveText);
            if (mins === null) {
              await sendWhatsAppButtons(
                cleanPhone,
                "❓ Não entendi. Escolha ou escreva o tempo de antecedência:",
                [{ id: "5m", text: "5 minutos" }, { id: "10m", text: "10 minutos" }, { id: "30m", text: "30 minutos" }],
                "Ou escreva: 1h, 15 min..."
              );
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            updateData.notify_minutes_before = mins;
            let label = mins < 60 ? `${mins} minutos` : mins < 1440 ? `${mins / 60} hora(s)` : `${mins / 1440} dia(s)`;
            successMsg = `✅ Aviso atualizado para *${label} antes*!`;
          }

          if (Object.keys(updateData).length > 0) {
            await supabaseAdmin.from("reminders").update(updateData).eq("id", chosen.id);
          }

          await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
          await sendWhatsAppMessage(cleanPhone, `${successMsg}\n\n🔔 *${updateData.title || chosen.title}*\n_Brave IA - Seu assessor financeiro 🤖_`);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: confirming reminder details ──
        if (session.step === "reminder_confirm") {
          const cancel = /^\s*(cancelar|cancel|não|nao|n|❌ cancelar|❌)\s*$/i.test(effectiveText);
          if (cancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Lembrete cancelado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Helper to format and show confirmation with edit options
          const showReminderConfirm = async (c: any) => {
            const fmtD = (s: string) =>
              new Date(s).toLocaleString("pt-BR", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
              });
            const nm = c.notify_minutes_before ?? 30;
            let notifyLbl = nm < 60 ? `${nm} minutos` : nm < 1440 ? `${nm / 60} hora(s)` : `${nm / 1440} dia(s)`;
            const recLbl = recurrenceLabel(c.recurrence || "none", c.event_at, c.originalText || "");

            await sendWhatsAppButtons(
              cleanPhone,
              `🔔 *Confirmar lembrete?*\n\n` +
              `📝 *Nome:* ${c.title}\n` +
              `📅 *Horário:* ${fmtD(c.event_at)}\n` +
              `⏰ *Aviso:* ${notifyLbl} antes\n` +
              (recLbl ? `${recLbl}\n` : `🔂 *Recorrência:* Nenhuma\n`) +
              `\n✏️ _Para editar antes de confirmar:_\n` +
              `• _"nome Reunião semanal"_ — altera o nome\n` +
              `• _"data amanhã 15h"_ — altera data/hora\n` +
              `• _"aviso 1h"_ — altera tempo de aviso`,
              [{ id: "CONFIRM_REMINDER", text: "✅ Confirmar" }, { id: "cancelar", text: "❌ Cancelar" }],
              "Confirme ou edite"
            );
          };

          // ── Inline edit: "nome Novo Nome" ──
          const nameMatch = effectiveText.match(/^nome\s+(.+)$/i);
          if (nameMatch) {
            const newTitle = nameMatch[1].trim();
            await supabaseAdmin.from("whatsapp_sessions").update({
              context: { ...ctx, title: newTitle },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, `✅ Nome atualizado para *${newTitle}*!`);
            await showReminderConfirm({ ...ctx, title: newTitle });
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // ── Inline edit: "data amanhã 15h" ──
          const dateMatch = effectiveText.match(/^data\s+(.+)$/i);
          if (dateMatch) {
            const newDate = parseDateTimeBR(dateMatch[1].trim());
            if (!newDate) {
              await sendWhatsAppMessage(cleanPhone, `❓ Não entendi a data. Tente: _"data amanhã 15h"_, _"data 25/02 10:00"_`);
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            const newEventAt = newDate.toISOString();
            await supabaseAdmin.from("whatsapp_sessions").update({
              context: { ...ctx, event_at: newEventAt },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            const dtLabel = newDate.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
            await sendWhatsAppMessage(cleanPhone, `✅ Data atualizada para *${dtLabel}*!`);
            await showReminderConfirm({ ...ctx, event_at: newEventAt });
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // ── Natural language time correction: "não é 11:00 é 14:00", "14h", "14:00" ──
          const confirmTimeFix = effectiveText.match(/(?:(?:não|nao)\s+é?\s*\d{1,2}[h:]\d{0,2}\s*(?:é|e|,)\s*)?(\d{1,2})[h:](\d{0,2})/i);
          const isConfirmTimeCorr = /(?:não|nao)\s+é?\s*\d{1,2}|^\s*\d{1,2}[h:]\d{0,2}\s*$/i.test(effectiveText) 
            && !effectiveText.match(/^(nome|data|aviso)\s/i);
          if (isConfirmTimeCorr && confirmTimeFix) {
            const hrs = parseInt(confirmTimeFix[1]);
            const mins2 = parseInt(confirmTimeFix[2] || "0");
            if (hrs >= 0 && hrs <= 23 && mins2 >= 0 && mins2 <= 59) {
              const brDate = new Date(new Date(ctx.event_at).toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
              brDate.setHours(hrs, mins2, 0, 0);
              const utcCorr = new Date(brDate.getTime() + 3 * 60 * 60 * 1000);
              const corrEventAt = utcCorr.toISOString();
              await supabaseAdmin.from("whatsapp_sessions").update({
                context: { ...ctx, event_at: corrEventAt },
                expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              }).eq("id", session.id);
              const dtLbl = utcCorr.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
              await sendWhatsAppMessage(cleanPhone, `✅ Horário corrigido para *${dtLbl}*!`);
              await showReminderConfirm({ ...ctx, event_at: corrEventAt });
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          // ── Inline edit: "aviso 1h" or "aviso 30 min" ──
          const avisoMatch = effectiveText.match(/^aviso\s+(.+)$/i);
          if (avisoMatch) {
            const mins = parseNotifyMinutes(avisoMatch[1].trim());
            if (mins === null) {
              await sendWhatsAppMessage(cleanPhone, `❓ Não entendi. Tente: _"aviso 30 min"_, _"aviso 1h"_, _"aviso 1 dia"_`);
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
            await supabaseAdmin.from("whatsapp_sessions").update({
              context: { ...ctx, notify_minutes_before: mins },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            let label = mins < 60 ? `${mins} minutos` : mins < 1440 ? `${mins / 60} hora(s)` : `${mins / 1440} dia(s)`;
            await sendWhatsAppMessage(cleanPhone, `✅ Aviso atualizado para *${label} antes*!`);
            await showReminderConfirm({ ...ctx, notify_minutes_before: mins });
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // CONFIRM_REMINDER or "sim" or button text "✅ Confirmar"
          const isConfirmReminder = 
            /sim|ok|yes|confirmar/i.test(effectiveText) ||
            effectiveText.includes("✅") ||
            effectiveText.toUpperCase().includes("CONFIRM_REMINDER");

          if (isConfirmReminder) {
            // Create the reminder
            const { error: reminderInsertError } = await supabaseAdmin.from("reminders").insert({
              user_id: ctx.user_id,
              title: ctx.title,
              description: ctx.description || null,
              event_at: ctx.event_at,
              notify_minutes_before: ctx.notify_minutes_before ?? 30,
              recurrence: ctx.recurrence || "none",
              is_active: true,
              is_sent: false,
            });

            if (reminderInsertError) {
              console.error("Error inserting reminder:", reminderInsertError);
              await sendWhatsAppMessage(cleanPhone, `❌ Erro ao salvar lembrete: ${reminderInsertError.message}`);
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }

            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);

            const fmtDate = (s: string) =>
              new Date(s).toLocaleString("pt-BR", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
              });

            let notifyLabel = "";
            const nm = ctx.notify_minutes_before ?? 30;
            if (nm < 60) notifyLabel = `${nm} minutos`;
            else if (nm < 1440) notifyLabel = `${nm / 60} hora(s)`;
            else notifyLabel = `${nm / 1440} dia(s)`;

            const recLbl = recurrenceLabel(ctx.recurrence || "none", ctx.event_at, ctx.originalText || "");

            await sendWhatsAppMessage(cleanPhone,
              `✅ *Lembrete salvo com sucesso!*\n\n` +
              `📝 *Nome:* ${ctx.title}\n` +
              `📅 *Horário:* ${fmtDate(ctx.event_at)}\n` +
              `⏰ *Aviso:* ${notifyLabel} antes\n` +
              (recLbl ? `${recLbl}` : `🔂 *Recorrência:* Nenhuma`) +
              `\n\n_Brave IA - Seu assessor financeiro 🤖_`
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Unknown input: re-show confirmation
          await showReminderConfirm(ctx);
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: confirm single recurring transaction ──
        if (session.step === "confirm_single_recurring") {
          const isConfirm = /sim|ok|yes|confirmar|✅/i.test(effectiveText);
          const isCancel = /^(não|nao|n|cancelar|cancel|❌)$/i.test(effectiveText);

          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Recorrência cancelada.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Inline edits: "valor 30", "dia 15", "descrição Netflix"
          const valorEdit = effectiveText.match(/^valor\s+(\d+[\.,]?\d*)/i);
          if (valorEdit) {
            const newAmount = normalizeAmount(valorEdit[1]);
            await supabaseAdmin.from("whatsapp_sessions").update({
              context: { ...ctx, amount: newAmount },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, `✅ Valor atualizado para *R$ ${Number(newAmount).toFixed(2)}*!`);
            const updCtx = { ...ctx, amount: newAmount };
            await sendWhatsAppButtons(cleanPhone,
              `🔄 *Confirmar recorrência?*\n\n📝 ${updCtx.description}\n💵 ${fmt(Number(updCtx.amount))}\n📅 Todo dia ${updCtx.day_of_month}\n📂 ${updCtx.category_name}`,
              [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }], "");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          const diaEdit = effectiveText.match(/^dia\s+(\d{1,2})/i);
          if (diaEdit) {
            const newDay = Math.min(Math.max(parseInt(diaEdit[1]), 1), 31);
            await supabaseAdmin.from("whatsapp_sessions").update({
              context: { ...ctx, day_of_month: newDay },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            }).eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, `✅ Dia atualizado para *${newDay}*!`);
            const updCtx = { ...ctx, day_of_month: newDay };
            await sendWhatsAppButtons(cleanPhone,
              `🔄 *Confirmar recorrência?*\n\n📝 ${updCtx.description}\n💵 ${fmt(Number(updCtx.amount))}\n📅 Todo dia ${updCtx.day_of_month}\n📂 ${updCtx.category_name}`,
              [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }], "");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (isConfirm) {
            // Find default wallet
            const { data: defaultWallet } = await supabaseAdmin.from("wallets").select("id").eq("user_id", ctx.user_id).limit(1).maybeSingle();

            const { error: recError } = await supabaseAdmin.from("recurring_transactions").insert({
              user_id: ctx.user_id,
              description: ctx.description,
              amount: ctx.amount,
              type: ctx.type || "expense",
              day_of_month: ctx.day_of_month,
              category_id: ctx.category_id || null,
              wallet_id: defaultWallet?.id || null,
              is_active: true,
            });

            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);

            if (recError) {
              console.error("Error creating recurring:", recError);
              await sendWhatsAppMessage(cleanPhone, "❌ Erro ao cadastrar recorrência. Tente novamente.");
            } else {
              await sendWhatsAppMessage(cleanPhone,
                `🔄 *Recorrência cadastrada!*\n\n` +
                `📝 ${ctx.description}\n` +
                `💵 ${fmt(Number(ctx.amount))}\n` +
                `📅 Todo dia ${ctx.day_of_month}\n` +
                `📂 ${ctx.category_name}\n\n` +
                `_A conta será gerada automaticamente todo mês._\n_Brave IA 🤖_`
              );
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Unknown input — re-show confirmation
          await sendWhatsAppButtons(cleanPhone,
            `🔄 *Confirmar recorrência?*\n\n📝 ${ctx.description}\n💵 ${fmt(Number(ctx.amount))}\n📅 Todo dia ${ctx.day_of_month}\n📂 ${ctx.category_name}`,
            [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
            "Ou corrija: valor 30, dia 15");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: help category selection ──
        if (session.step === "help_category") {
          const helpMessages: Record<string, string> = {
            HELP_FINANCAS: `💰 *Finanças - Comandos disponíveis:*\n\n` +
              `📝 *Registrar gasto:*\n_"Gastei 50 com almoço"_\n_"Paguei 200 no mercado"_\n\n` +
              `📸 *Enviar comprovante:*\nEnvie uma foto do recibo ou nota fiscal\n\n` +
              `🎙️ *Áudio:*\nEnvie um áudio descrevendo a transação\n\n` +
              `📋 *Ver contas:*\n_"conferir"_ ou _"minhas contas"_\n\n` +
              `💳 *Pagar conta:*\n_"marcar como pago"_\n\n` +
              `🔄 *Transações recorrentes:*\n_"recorrentes"_ → lista e cancela recorrências ativas\n\n` +
              `✏️ *Editar lista antes de confirmar:*\n_"3 remover"_ → remove item 3\n_"2 valor 50"_ → altera valor do item 2\n_"1 dia 15"_ → altera dia de vencimento do item 1\n\n` +
              `💬 *Perguntar ao Brave IA:*\n_"Qual meu saldo?"_, _"Quanto gastei esse mês?"_`,

            HELP_LEMBRETES: `🔔 *Lembretes - Comandos disponíveis:*\n\n` +
              `➕ *Criar lembrete:*\n_"lembrete: reunião amanhã 15h"_\n_"lembrete: médico 25/02 10h, avisar 1h antes"_\n\n` +
              `🔁 *Criar lembrete recorrente:*\n_"lembrete: academia toda segunda 07h"_\n_"lembrete: reunião toda sexta 14h, avisar 30 min antes"_\n_"lembrete: contas todo mês dia 10, avisar 1 dia antes"_\n\n` +
              `📋 *Ver lembretes:*\n_"meus lembretes"_ ou _"lembretes"_\n\n` +
              `✏️ *Editar lembrete:*\n_"editar lembrete 2"_ → edita o lembrete nº 2 da lista\n\n` +
              `❌ *Cancelar lembrete:*\nEnvie _"meus lembretes"_ e escolha pelo número`,

            HELP_PLANO: `👑 *Plano - Comandos disponíveis:*\n\n` +
              `📋 *Ver meu plano:*\n_"meu plano"_\n\n` +
              `💳 *Renovar/Assinar:*\nAcesse o app Brave → Configurações → Planos\n\n` +
              `🛎️ *Suporte:*\nFale com nossa equipe pelo número\n*+55 37 9981-95029*`,

            HELP_OUTROS: `🌟 *Outros Comandos:*\n\n` +
              `❓ *Ajuda:*\n_"ajuda"_ ou _"comandos"_\n\n` +
              `💳 *Saldo por carteira:*\n_"saldo"_ → ver saldo de cada carteira + total\n\n` +
              `💳 *Cartões de crédito:*\n_"cartões"_ ou _"meus cartões"_ → fatura, limite e vencimento\n\n` +
              `🏷️ *Categorias e orçamentos:*\n_"categorias"_ ou _"orçamentos"_ → gastos por categoria e limites\n\n` +
              `📈 *Cotações do mercado:*\n_"mercado"_ ou _"cotações"_ → dólar, bitcoin, ibovespa\n\n` +
              `🩺 *Saúde financeira:*\n_"comportamento"_ ou _"saúde"_ → análise do seu perfil\n\n` +
              `🎯 *Metas financeiras:*\n_"metas"_ → ver e criar metas\n_"meta: Viagem"_ → criar meta diretamente\n_"aporte"_ → depositar em uma meta\n\n` +
              `📊 *Resumo financeiro:*\n_"resumo"_ ou _"meu resumo"_\n\n` +
              `💡 *Dica personalizada:*\n_"dica"_ → IA gera uma dica baseada no seu perfil de gastos\n\n` +
              `🔄 *Recorrentes:*\n_"recorrentes"_ → ver e cancelar transações fixas\n\n` +
              `🔗 *Vincular WhatsApp:*\nEnvie o código BRAVE-XXXXXX do app`,
          };

          // Check which category was requested
          const catKey = Object.keys(helpMessages).find(k => 
            effectiveText.toUpperCase().includes(k) || effectiveText.toUpperCase() === k
          );

          if (catKey) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppButtons(
              cleanPhone,
              helpMessages[catKey],
              [{ id: "HELP_OUTROS", text: "⚙️ Outros" }, { id: "ajuda", text: "🏠 Menu Ajuda" }],
              "Ver mais categorias"
            );
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
        }

        // ── Step: goal creation — ask name ──
        if (session.step === "goal_ask_name") {
          const isCancel = /^(cancelar|cancel|sair|não|nao)$/i.test(effectiveText);
          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Criação de meta cancelada.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const goalName = effectiveText.trim();
          if (!goalName) {
            await sendWhatsAppMessage(cleanPhone, "📝 Por favor, digite o nome da sua meta.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          await supabaseAdmin.from("whatsapp_sessions").update({
            step: "goal_ask_amount",
            context: { ...ctx, name: goalName },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          }).eq("id", session.id);
          await sendWhatsAppMessage(cleanPhone,
            `🎯 *Meta:* _${goalName}_\n\n💰 Qual é o *valor total* que você quer atingir?\n\nEx: _3000_, _R$ 5.000_, _1500,00_`
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: goal creation — ask target amount ──
        if (session.step === "goal_ask_amount") {
          const isCancel = /^(cancelar|cancel|sair)$/i.test(effectiveText);
          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Criação de meta cancelada.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const amtRaw = effectiveText.replace(/[r$\s.]/gi, "").replace(",", ".");
          const targetAmount = parseFloat(amtRaw);
          if (isNaN(targetAmount) || targetAmount <= 0) {
            await sendWhatsAppMessage(cleanPhone, "❓ Não entendi o valor. Digite um número, ex: _5000_ ou _R$ 1.500_");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          await supabaseAdmin.from("whatsapp_sessions").update({
            step: "goal_ask_deadline",
            context: { ...ctx, target_amount: targetAmount },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          }).eq("id", session.id);
          await sendWhatsAppButtons(cleanPhone,
            `🎯 *Meta:* _${ctx.name}_\n💰 *Valor:* ${fmt(targetAmount)}\n\n📅 Tem um prazo para atingir essa meta?`,
            [{ id: "GOAL_NO_DEADLINE", text: "Sem prazo" }],
            "Ou envie uma data: 31/12/2025, dez/2025, 2026"
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: goal creation — ask deadline ──
        if (session.step === "goal_ask_deadline") {
          const isCancel = /^(cancelar|cancel|sair)$/i.test(effectiveText);
          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Criação de meta cancelada.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          let deadline: string | null = null;
          const noDeadline = /^(sem\s+prazo|não|nao|n|GOAL_NO_DEADLINE)$/i.test(effectiveText);
          if (!noDeadline) {
            // Parse date: dd/mm/yyyy, mm/yyyy, yyyy
            const dmyMatch = effectiveText.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
            const myMatch = effectiveText.match(/(\d{1,2})[\/\-](\d{4})/);
            const yMatch = effectiveText.match(/^(\d{4})$/);
            const monthNames: Record<string, number> = {
              jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
              jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
            };
            const monthNameMatch = effectiveText.match(/([a-z]{3})\/?(\d{4})/i);

            if (dmyMatch) {
              deadline = `${dmyMatch[3]}-${dmyMatch[2].padStart(2,"0")}-${dmyMatch[1].padStart(2,"0")}`;
            } else if (monthNameMatch) {
              const mon = monthNames[monthNameMatch[1].toLowerCase()];
              if (mon) deadline = `${monthNameMatch[2]}-${String(mon).padStart(2,"0")}-01`;
            } else if (myMatch) {
              deadline = `${myMatch[2]}-${myMatch[1].padStart(2,"0")}-01`;
            } else if (yMatch) {
              deadline = `${yMatch[1]}-12-31`;
            } else {
              await sendWhatsAppMessage(cleanPhone,
                "❓ Não entendi a data. Tente: _31/12/2025_, _dez/2025_, _2026_\nOu envie _sem prazo_"
              );
              return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            }
          }

          // Show confirmation
          const deadlineStr = deadline
            ? new Date(deadline + "T12:00:00").toLocaleDateString("pt-BR")
            : "Sem prazo definido";
          await supabaseAdmin.from("whatsapp_sessions").update({
            step: "goal_confirm",
            context: { ...ctx, deadline },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          }).eq("id", session.id);
          await sendWhatsAppButtons(cleanPhone,
            `🎯 *Confirmar nova meta?*\n\n` +
            `📝 *Nome:* ${ctx.name}\n` +
            `💰 *Valor alvo:* ${fmt(Number(ctx.target_amount))}\n` +
            `📅 *Prazo:* ${deadlineStr}\n\n` +
            `Está tudo certo?`,
            [{ id: "GOAL_CONFIRM_YES", text: "✅ Criar Meta" }, { id: "GOAL_CONFIRM_NO", text: "❌ Cancelar" }],
            "Confirme para salvar"
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: aporte — select goal ──
        if (session.step === "aporte_select_goal") {
          const goalsList: any[] = ctx.goalsList || [];
          const isCancel = /^(cancelar|cancel|sair|voltar)$/i.test(effectiveText);
          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Aporte cancelado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          let matched: any = null;
          const numMatch = effectiveText.match(/^(\d+)$/);
          if (numMatch) {
            const idx = parseInt(numMatch[1]) - 1;
            if (idx >= 0 && idx < goalsList.length) matched = goalsList[idx];
          } else {
            matched = goalsList.find((g: any) => g.name.toLowerCase().includes(effectiveText.toLowerCase()));
          }
          if (!matched) {
            const opts = goalsList.map((g: any, i: number) => `${i + 1}. ${g.name}`).join("\n");
            await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei essa meta. Responda com o *número*:\n\n${opts}\n\nOu envie *cancelar*.`);
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          await supabaseAdmin.from("whatsapp_sessions").update({
            step: "aporte_enter_amount",
            context: { ...ctx, selected_goal: matched },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          }).eq("id", session.id);
          const fmtA = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          const pct = Math.round((Number(matched.current_amount) / Number(matched.target_amount)) * 100);
          await sendWhatsAppMessage(cleanPhone,
            `🎯 *${matched.name}*\n` +
            `💰 Progresso: ${fmtA(Number(matched.current_amount))} / ${fmtA(Number(matched.target_amount))} (${pct}%)\n\n` +
            `💵 Quanto deseja depositar?\n\nEx: _500_, _R$ 1.000_, _250,00_`
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: aporte — enter amount and confirm ──
        if (session.step === "aporte_enter_amount") {
          const isCancel = /^(cancelar|cancel|sair)$/i.test(effectiveText);
          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Aporte cancelado.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const amtRaw = effectiveText.replace(/[r$\s.]/gi, "").replace(",", ".");
          const amount = parseFloat(amtRaw);
          if (isNaN(amount) || amount <= 0) {
            await sendWhatsAppMessage(cleanPhone, "❓ Não entendi o valor. Digite um número, ex: _500_ ou _R$ 1.000_");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }
          const goal = ctx.selected_goal;
          const newAmount = Number(goal.current_amount) + amount;
          const { error: upErr } = await supabaseAdmin.from("financial_goals")
            .update({ current_amount: newAmount })
            .eq("id", goal.id);
          await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
          if (upErr) {
            await sendWhatsAppMessage(cleanPhone, `❌ Erro ao registrar aporte: ${upErr.message}`);
          } else {
            const fmtA = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            const pct = Math.round((newAmount / Number(goal.target_amount)) * 100);
            const missing = Number(goal.target_amount) - newAmount;
            const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
            await sendWhatsAppMessage(cleanPhone,
              `✅ *Aporte registrado!*\n\n` +
              `🎯 *${goal.name}*\n` +
              `💵 Depositado: +${fmtA(amount)}\n` +
              `${bar} ${pct}%\n` +
              `💰 ${fmtA(newAmount)} / ${fmtA(Number(goal.target_amount))}\n` +
              (missing > 0 ? `⏳ Falta: ${fmtA(missing)}\n` : `🎉 *Meta atingida!*\n`) +
              `\n_Brave IA - Seu assessor financeiro 🤖_`
            );
          }
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        // ── Step: goal creation — confirm and save ──
        if (session.step === "goal_confirm") {
          const isConfirm = /sim|ok|yes|confirmar|GOAL_CONFIRM_YES|✅/i.test(effectiveText);
          const isCancel = /não|nao|n|cancelar|cancel|GOAL_CONFIRM_NO|❌/i.test(effectiveText);

          if (isCancel) {
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);
            await sendWhatsAppMessage(cleanPhone, "❌ Meta cancelada. Nenhuma alteração foi feita.");
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          if (isConfirm) {
            const { error: goalErr } = await supabaseAdmin.from("financial_goals").insert({
              user_id: ctx.user_id,
              name: ctx.name,
              target_amount: Number(ctx.target_amount),
              current_amount: 0,
              deadline: ctx.deadline || null,
            });

            await supabaseAdmin.from("whatsapp_sessions").delete().eq("id", session.id);

            if (goalErr) {
              await sendWhatsAppMessage(cleanPhone, `❌ Erro ao criar meta: ${goalErr.message}`);
            } else {
              const deadlineStr = ctx.deadline
                ? new Date(ctx.deadline + "T12:00:00").toLocaleDateString("pt-BR")
                : "sem prazo";
              await sendWhatsAppMessage(cleanPhone,
                `🎉 *Meta criada com sucesso!*\n\n` +
                `🎯 *${ctx.name}*\n` +
                `💰 *Objetivo:* ${fmt(Number(ctx.target_amount))}\n` +
                `📅 *Prazo:* ${deadlineStr}\n\n` +
                `💡 Para acompanhar suas metas, acesse o app Brave → Metas\n` +
                `Ou envie _"metas"_ aqui a qualquer momento!\n\n` +
                `_Brave IA - Seu assessor financeiro 🤖_`
              );
            }
            return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
          }

          // Unknown response — re-show confirmation
          const deadlineStr = ctx.deadline
            ? new Date(ctx.deadline + "T12:00:00").toLocaleDateString("pt-BR")
            : "Sem prazo definido";
          await sendWhatsAppButtons(cleanPhone,
            `🎯 *Confirmar nova meta?*\n\n📝 *Nome:* ${ctx.name}\n💰 *Valor alvo:* ${fmt(Number(ctx.target_amount))}\n📅 *Prazo:* ${deadlineStr}`,
            [{ id: "GOAL_CONFIRM_YES", text: "✅ Criar Meta" }, { id: "GOAL_CONFIRM_NO", text: "❌ Cancelar" }],
            "Confirme para salvar"
          );
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }
    }

    // ── "lembrete:" trigger — create reminder via WhatsApp ──
    // IMPORTANT: Must NOT match "lembretes" (plural) which means "list my reminders"
    const isListRemindersIntent = /^\s*(qual\s+)?(meus\s+lembretes|lembretes|ver\s+lembretes|meus\s+compromissos|quais\s+(meus\s+)?lembretes|listar\s+lembretes|mostrar\s+lembretes)\s*$/i.test(messageText);
    const reminderTrigger = /^\s*lembrete\s*[:;]\s*/i;
    const reminderTriggerLoose = /^\s*lembrete\s+(?!s\s*$)/i; // "lembrete reunião..." but NOT "lembretes"
    if (!isListRemindersIntent && (reminderTrigger.test(messageText) || reminderTriggerLoose.test(messageText)) && hasText) {
      const { data: linkedForReminder } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForReminder) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const reminderText = messageText.replace(/^\s*lembrete\s*[:;]?\s*/i, "").trim();

      // ── AI-first parsing, regex fallback ──
      let title = "";
      let eventDate: Date | null = null;
      let notifyMins: number | null = null;
      let recurrence = "none";

      const aiParsed = await parseReminderWithAI(reminderText);
      if (aiParsed) {
        title = aiParsed.title || reminderText;
        recurrence = aiParsed.recurrence;
        notifyMins = aiParsed.notify_minutes_before;
        if (aiParsed.event_at) {
          const parsed = new Date(aiParsed.event_at);
          if (!isNaN(parsed.getTime())) eventDate = parsed;
        }
      }

      // Fallback to regex if AI didn't extract key fields
      if (!title) {
        title = reminderText
          .replace(/,?\s*(amanhã|amanha|hoje|segunda|terça|quarta|quinta|sexta|sábado|sabado|domingo|\d{1,2}\/\d{1,2}|\d{1,2}h|\d{2}:\d{2}|todos?\s*os?\s*dias?|todo\s*dia|ao|às|as|de|do|da).*/i, "")
          .trim() || reminderText.split(/[,;]/)[0].trim();
        title = title.replace(/\b(toda|todo)\s*(segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)\b/gi, "").trim();
      }
      if (!eventDate) eventDate = parseDateTimeBR(reminderText);
      if (notifyMins === null) {
        const notifyMatch = reminderText.match(/avisar\s+(.+?)(?:\s+antes|\s*$)/i);
        notifyMins = notifyMatch ? parseNotifyMinutes(notifyMatch[1]) : null;
      }
      if (recurrence === "none") recurrence = parseRecurrence(reminderText);

      // Clear any old reminder sessions
      await supabaseAdmin.from("whatsapp_sessions").delete()
        .eq("phone_number", cleanPhone).like("step", "reminder_%");

      if (!eventDate) {
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone,
          step: "reminder_notify",
          context: {
            user_id: linkedForReminder.user_id,
            title: title || "Lembrete",
            event_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            notify_minutes_before: 30,
            recurrence,
            awaiting: "date",
          },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        await sendWhatsAppMessage(cleanPhone,
          `🔔 *Criando lembrete: ${title || "Lembrete"}*\n\n` +
          `📅 Qual a data e horário do evento?\n\nExemplo: amanhã 15h, 19/02 16:00, sexta 10h`
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Check if the user explicitly mentioned a time (e.g. "14h", "15:00", "3 da tarde", "meio-dia")
      const hasExplicitTime = /\d{1,2}\s*[h:]\s*\d{0,2}|\d{1,2}\s*da\s*(tarde|manhã|manha|noite)|meio[\s-]?dia|meia[\s-]?noite/i.test(reminderText);

      if (!hasExplicitTime) {
        // User gave a date but no time — ask for the time first
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone,
          step: "reminder_notify",
          context: {
            user_id: linkedForReminder.user_id,
            title: title || reminderText,
            event_at: eventDate.toISOString(),
            recurrence,
            originalText: reminderText,
            awaiting: "time",
          },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });

        const fmtDateOnly = eventDate.toLocaleDateString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo",
        });

        await sendWhatsAppMessage(cleanPhone,
          `🔔 *${title || reminderText}*\n📅 Data: ${fmtDateOnly}\n\n🕐 Qual horário do evento?\n\nExemplo: 14h, 15:30, 9h`
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (notifyMins === null) {
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone,
          step: "reminder_notify",
          context: {
            user_id: linkedForReminder.user_id,
            title: title || reminderText,
            event_at: eventDate.toISOString(),
            recurrence,
            originalText: reminderText,
          },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });

        const fmtDateStr = eventDate.toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
        });
        const recLbl = recurrenceLabel(recurrence, eventDate.toISOString(), reminderText);

        await sendWhatsAppButtons(
          cleanPhone,
          `🔔 *${title || reminderText}*\n📅 ${fmtDateStr}${recLbl ? `\n${recLbl}` : ""}\n\n⏰ Com quanto tempo de antecedência você quer ser avisado?`,
          [{ id: "5m", text: "5 minutos" }, { id: "10m", text: "10 minutos" }, { id: "30m", text: "30 minutos" }],
          "Ou escreva: 1h, 15 min, 2 horas..."
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Have everything — show confirmation
      await supabaseAdmin.from("whatsapp_sessions").insert({
        phone_number: cleanPhone,
        step: "reminder_confirm",
        context: {
          user_id: linkedForReminder.user_id,
          title: title || reminderText,
          event_at: eventDate.toISOString(),
          notify_minutes_before: notifyMins,
          recurrence,
          originalText: reminderText,
        },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      const fmtDateStr = eventDate.toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
      });
      let notifyLabel = "";
      if (notifyMins < 60) notifyLabel = `${notifyMins} minutos`;
      else if (notifyMins < 1440) notifyLabel = `${notifyMins / 60} hora(s)`;
      else notifyLabel = `${notifyMins / 1440} dia(s)`;
      const recLbl = recurrenceLabel(recurrence, eventDate.toISOString(), reminderText);

      await sendWhatsAppButtons(
        cleanPhone,
        `🔔 *Confirmar lembrete?*\n\n` +
        `📝 *${title || reminderText}*\n` +
        `📅 ${fmtDateStr}\n` +
        `⏰ Aviso: *${notifyLabel} antes*\n` +
        (recLbl ? `${recLbl}\n` : ""),
        [{ id: "CONFIRM_REMINDER", text: "✅ Confirmar" }, { id: "cancelar", text: "❌ Cancelar" }],
        "Toque para confirmar"
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "ajuda" command — list all available commands with categories ──
    const ajudaMatch = /^\s*(ajuda|help|comandos|menu|o que você faz|oque voce faz)\s*$/i.test(effectiveText);
    if (ajudaMatch) {
      // Check if user is linked so we know context
      const { data: linkedForHelp } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      // Show category selection via buttons
      await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
      await supabaseAdmin.from("whatsapp_sessions").insert({
        phone_number: cleanPhone,
        step: "help_category",
        context: { linked: !!linkedForHelp },
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });

      await sendWhatsAppButtons(
        cleanPhone,
        `🤖 *Brave IA - Central de Ajuda*\n\nEscolha uma categoria para ver os comandos disponíveis:`,
        [{ id: "HELP_FINANCAS", text: "💰 Finanças" }, { id: "HELP_LEMBRETES", text: "🔔 Lembretes" }, { id: "HELP_PLANO", text: "👑 Plano" }],
        "Ou escolha outra categoria abaixo"
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (effectiveText === "MARK_PAID" || /^\s*(marcar.?como.?pago|pagar.?conta|marcar.?pago)\s*$/i.test(effectiveText)) {
      const { data: linkedForPay } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForPay) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const today = getBrazilNow();
      const todayStr = today.toISOString().slice(0, 10);
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + 30);
      const futureDateStr = futureDate.toISOString().slice(0, 10);

      const { data: upcomingForPay } = await supabaseAdmin
        .from("transactions")
        .select("id, description, amount, type, due_date, categories(name)")
        .eq("user_id", linkedForPay.user_id)
        .eq("is_paid", false)
        .eq("type", "expense")
        .gte("due_date", todayStr)
        .lte("due_date", futureDateStr)
        .order("due_date", { ascending: true })
        .limit(10);

      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const payBills = upcomingForPay || [];

      if (payBills.length === 0) {
        await sendWhatsAppMessage(cleanPhone, "✅ Nenhuma conta a pagar nos próximos 30 dias. Tudo em dia! 🎉");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Create session for bill_selection
      await supabaseAdmin
        .from("whatsapp_sessions")
        .delete()
        .eq("phone_number", cleanPhone); // clear any old sessions

      await supabaseAdmin.from("whatsapp_sessions").insert({
        phone_number: cleanPhone,
        step: "bill_selection",
        context: { user_id: linkedForPay.user_id, bills: payBills },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      const list = payBills.map((b: any, i: number) => {
        const due = b.due_date ? new Date(b.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—";
        return `${i + 1}. ${b.description} — ${fmt(Number(b.amount))} · vence ${due}`;
      }).join("\n");

      await sendWhatsAppMessage(cleanPhone,
        `💳 *Qual conta deseja marcar como paga?*\n\n${list}\n\n` +
        `Responda com o *número* ou *nome* da conta.\nOu envie *cancelar* para sair.`
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "meus lembretes" command — list active reminders ──
    const meusLembretesMatch = /^\s*(qual\s+)?(meus\s+lembretes|lembretes|ver\s+lembretes|meus\s+compromissos|quais\s+(meus\s+)?lembretes|listar\s+lembretes|mostrar\s+lembretes)\s*$/i.test(effectiveText);
    if (meusLembretesMatch) {
      const { data: linkedForReminders } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForReminders) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const now = new Date();
      // For recurring reminders, don't filter by event_at (they repeat indefinitely)
      // For non-recurring, only show future ones
      const { data: allUserReminders } = await supabaseAdmin
        .from("reminders")
        .select("id, title, description, event_at, notify_minutes_before, recurrence, is_active")
        .eq("user_id", linkedForReminders.user_id)
        .eq("is_active", true)
        .order("event_at", { ascending: true })
        .limit(20);

      // Filter: show recurring reminders always + non-recurring only if in the future
      const activeReminders = (allUserReminders || []).filter((r: any) => {
        if (r.recurrence && r.recurrence !== "none") return true; // recurring: always show
        return new Date(r.event_at) > now; // non-recurring: only future
      }).slice(0, 10);

      if (!activeReminders || activeReminders.length === 0) {
        await sendWhatsAppMessage(cleanPhone,
          "📭 Você não tem lembretes ativos no momento.\n\n" +
          "Para criar um, envie:\n" +
          "_lembrete: reunião amanhã 15h_\n\n" +
          "_Brave IA - Seu assessor financeiro 🤖_"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const recMap: Record<string, string> = { none: "", daily: "🔁", weekly: "🔁", monthly: "🔁" };
      const list = activeReminders.map((r: any, i: number) => {
        const dt = new Date(r.event_at).toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
        });
        const rec = recMap[r.recurrence] || "";
        return `${i + 1}. ${rec} 🔔 *${r.title}*\n    📅 ${dt}`;
      }).join("\n\n");

      // Create session for list interaction
      await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
      await supabaseAdmin.from("whatsapp_sessions").insert({
        phone_number: cleanPhone,
        step: "list_reminders",
        context: { user_id: linkedForReminders.user_id, reminders: activeReminders },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      await sendWhatsAppMessage(cleanPhone,
        `📋 *Seus próximos lembretes (${activeReminders.length}):*\n\n${list}\n\n` +
        `Responda com o *número* para editar ou cancelar um lembrete.\nEnvie *cancelar* para sair.`
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "recorrentes" command — list active recurring transactions ──
    const recorrentesMatch = /^\s*(recorrentes?|meus\s+recorrentes?|minhas\s+recorr[eê]ncias?|recorr[eê]ncias?|cobran[cç]as?)\s*$/i.test(effectiveText);
    if (recorrentesMatch) {
      const { data: linkedForRec } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForRec) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: recList } = await supabaseAdmin
        .from("recurring_transactions")
        .select("id, description, amount, type, day_of_month, expense_type, categories(name)")
        .eq("user_id", linkedForRec.user_id)
        .eq("is_active", true)
        .order("day_of_month", { ascending: true })
        .limit(20);

      const fmt2 = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

      if (!recList || recList.length === 0) {
        await sendWhatsAppMessage(cleanPhone,
          "📭 Você não tem transações recorrentes ativas.\n\n" +
          "Para cadastrar, envie uma lista:\n" +
          "_Netflix R$45\nAcademia R$90\nInternet R$100_\n\n" +
          "_Brave IA - Seu assessor financeiro 🤖_"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const expenses = recList.filter((r: any) => r.type === "expense");
      const incomes = recList.filter((r: any) => r.type === "income");
      const totalExp = expenses.reduce((s: number, r: any) => s + Number(r.amount), 0);

      let lines = [`🔁 *Suas recorrências ativas (${recList.length}):*\n`];
      if (expenses.length > 0) {
        lines.push("💸 *Despesas:*");
        expenses.forEach((r: any, i: number) => {
          const cat = (r as any).categories?.name || "Geral";
          lines.push(`${i + 1}. *${r.description}* — ${fmt2(Number(r.amount))} · dia ${r.day_of_month} · ${cat}`);
        });
        lines.push(`\n💰 *Total mensal: ${fmt2(totalExp)}*`);
      }
      if (incomes.length > 0) {
        lines.push("\n✅ *Receitas:*");
        incomes.forEach((r: any, i: number) => {
          lines.push(`${expenses.length + i + 1}. *${r.description}* — ${fmt2(Number(r.amount))} · dia ${r.day_of_month}`);
        });
      }

      lines.push(`\nPara cancelar uma recorrência, envie o *número*.\nEx: _"cancelar 2"_\n\nOu envie *voltar* para sair.`);

      // Create session for managing recurring
      await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
      await supabaseAdmin.from("whatsapp_sessions").insert({
        phone_number: cleanPhone,
        step: "manage_recurrentes",
        context: { user_id: linkedForRec.user_id, recList },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      await sendWhatsAppMessage(cleanPhone, lines.join("\n"));
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "saldo" command — show balance per wallet + total ──
    const saldoMatch = /^\s*(saldo|meu\s+saldo|ver\s+saldo|carteiras?|minha[s]?\s+carteiras?|quanto\s+tenho)\s*$/i.test(effectiveText);
    if (saldoMatch) {
      const { data: linkedForSaldo } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForSaldo) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: saldoWallets } = await supabaseAdmin
        .from("wallets")
        .select("name, type, balance, icon")
        .eq("user_id", linkedForSaldo.user_id)
        .order("balance", { ascending: false });

      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const walletList = saldoWallets || [];
      const totalSaldo = walletList.reduce((s: number, w: any) => s + Number(w.balance), 0);

      if (walletList.length === 0) {
        await sendWhatsAppMessage(cleanPhone,
          "💳 Você ainda não tem carteiras cadastradas.\n\nAcesse o app Brave → Carteira para adicionar uma."
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const typeEmoji: Record<string, string> = {
        checking: "🏦", savings: "💰", investment: "📈", cash: "💵", other: "💳",
      };

      const walletLines = walletList.map((w: any) => {
        const emoji = typeEmoji[w.type] || "💳";
        const sign = Number(w.balance) < 0 ? "⚠️ " : "";
        return `${emoji} *${w.name}:* ${sign}${fmt(Number(w.balance))}`;
      }).join("\n");

      const totalEmoji = totalSaldo >= 0 ? "✅" : "⚠️";
      await sendWhatsAppMessage(cleanPhone,
        `💳 *Saldo das suas carteiras:*\n\n${walletLines}\n\n` +
        `${totalEmoji} *Total consolidado: ${fmt(totalSaldo)}*\n\n` +
        `_Brave IA - Seu assessor financeiro 🤖_`
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "metas" command — list financial goals ──
    const metasMatch = /^\s*(metas?|minha[s]?\s+metas?|ver\s+metas?|objetivos?|meus\s+objetivos?)\s*$/i.test(effectiveText);
    if (metasMatch) {
      const { data: linkedForMetas } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForMetas) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const { data: goalsList } = await supabaseAdmin
        .from("financial_goals")
        .select("id, name, target_amount, current_amount, deadline")
        .eq("user_id", linkedForMetas.user_id)
        .order("created_at", { ascending: false })
        .limit(10);

      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      if (!goalsList || goalsList.length === 0) {
        await sendWhatsAppButtons(cleanPhone,
          "🎯 Você ainda não tem metas cadastradas!\n\nQuer criar sua primeira meta agora?",
          [{ id: "CRIAR_META", text: "✨ Criar Meta" }],
          "Ou envie: meta: Nome da Meta"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const goalLines = goalsList.map((g: any, i: number) => {
        const pct = Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100);
        const missing = Number(g.target_amount) - Number(g.current_amount);
        const bar = "█".repeat(Math.floor(pct / 10)) + "░".repeat(10 - Math.floor(pct / 10));
        const deadline = g.deadline
          ? `\n    📅 Prazo: ${new Date(g.deadline + "T12:00:00").toLocaleDateString("pt-BR")}`
          : "";
        return `${i + 1}. 🎯 *${g.name}*\n    ${bar} ${pct}%\n    💰 ${fmt(Number(g.current_amount))} de ${fmt(Number(g.target_amount))}\n    ⏳ Falta: ${fmt(missing)}${deadline}`;
      }).join("\n\n");

      await sendWhatsAppButtons(cleanPhone,
        `🎯 *Suas metas financeiras:*\n\n${goalLines}\n\n_Brave IA - Seu assessor financeiro 🤖_`,
        [{ id: "CRIAR_META", text: "✨ Nova Meta" }],
        "Criar uma nova meta"
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "meta:" trigger or CRIAR_META button — create goal via WhatsApp ──
    const metaTrigger = /^\s*meta\s*[:;]?\s*/i;
    const isCreateGoalBtn = effectiveText === "CRIAR_META";
    if (metaTrigger.test(messageText) || isCreateGoalBtn) {
      const { data: linkedForGoal } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForGoal) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const goalName = isCreateGoalBtn ? "" : messageText.replace(metaTrigger, "").trim();

      await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);

      if (goalName) {
        // Name provided inline — ask for target amount
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone,
          step: "goal_ask_amount",
          context: { user_id: linkedForGoal.user_id, name: goalName },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        await sendWhatsAppMessage(cleanPhone,
          `🎯 *Nova meta:* _${goalName}_\n\n💰 Qual é o *valor total* que você quer atingir?\n\nEx: _3000_, _R$ 5.000_, _1500,00_`
        );
      } else {
        // No name — ask for it first
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone,
          step: "goal_ask_name",
          context: { user_id: linkedForGoal.user_id },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        await sendWhatsAppMessage(cleanPhone,
          `🎯 *Criar nova meta!*\n\n📝 Qual é o *nome* da sua meta?\n\nEx: _Viagem para Europa_, _Reserva de emergência_, _Comprar carro_`
        );
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "dica" command — AI-generated personalized financial tip ──
    const dicaMatch = /^\s*(dica|dica\s+financeira|me\s*d[aáê]\s*uma?\s*dica|tip|sugest[aã]o)\s*$/i.test(effectiveText);
    if (dicaMatch) {
      const { data: linkedForDica } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForDica) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const dicaUserId = linkedForDica.user_id;
      const nowDica = getBrazilNow();
      const dicaFirstDay = new Date(Date.UTC(nowDica.getFullYear(), nowDica.getMonth(), 1)).toISOString().slice(0, 10);
      const dicaLastDay = new Date(Date.UTC(nowDica.getFullYear(), nowDica.getMonth() + 1, 0)).toISOString().slice(0, 10);

      const [
        { data: dicaProfile },
        { data: dicaWallets },
        { data: dicaTx },
        { data: dicaGoals },
        { data: dicaRecurring },
      ] = await Promise.all([
        supabaseAdmin.from("profiles").select("display_name, monthly_income").eq("id", dicaUserId).single(),
        supabaseAdmin.from("wallets").select("name, balance").eq("user_id", dicaUserId),
        supabaseAdmin.from("transactions").select("amount, type, categories(name)")
          .eq("user_id", dicaUserId).gte("date", dicaFirstDay).lte("date", dicaLastDay),
        supabaseAdmin.from("financial_goals").select("name, target_amount, current_amount, deadline")
          .eq("user_id", dicaUserId),
        supabaseAdmin.from("recurring_transactions").select("description, amount, type, day_of_month")
          .eq("user_id", dicaUserId).eq("is_active", true),
      ]);

      const fmtDica = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const txList = dicaTx || [];
      const totalSpent = txList.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalReceived = txList.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalBal = (dicaWallets || []).reduce((s: number, w: any) => s + Number(w.balance), 0);
      const monthlyIncome = Number(dicaProfile?.monthly_income) || 0;

      // Group expenses by category
      const catMap: Record<string, number> = {};
      txList.filter((t: any) => t.type === "expense").forEach((t: any) => {
        const cat = (t as any).categories?.name || "Outros";
        catMap[cat] = (catMap[cat] || 0) + Number(t.amount);
      });
      const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5);
      const catSummary = topCats.map(([c, v]) => `${c}: ${fmtDica(v)}`).join(", ");

      const goalsInfo = (dicaGoals || []).map((g: any) => {
        const pct = Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100);
        return `${g.name} (${pct}% de ${fmtDica(Number(g.target_amount))})`;
      }).join("; ") || "nenhuma";

      const recurringTotal = (dicaRecurring || []).reduce((s: number, r: any) => s + Number(r.amount), 0);

      const dicaContext = `
Dados financeiros para gerar dica personalizada:
- Nome: ${dicaProfile?.display_name || "Usuário"}
- Renda mensal: ${monthlyIncome > 0 ? fmtDica(monthlyIncome) : "não informada"}
- Saldo total: ${fmtDica(totalBal)}
- Gastos este mês: ${fmtDica(totalSpent)}
- Receitas este mês: ${fmtDica(totalReceived)}
- % renda comprometida: ${monthlyIncome > 0 ? Math.round((totalSpent / monthlyIncome) * 100) + "%" : "?"}
- Maiores categorias de gasto: ${catSummary || "sem dados"}
- Total recorrências mensais: ${fmtDica(recurringTotal)} (${(dicaRecurring || []).length} itens)
- Metas financeiras: ${goalsInfo}
`;

      let dicaText = "💡 Não foi possível gerar a dica agora. Tente novamente!";
      try {
        dicaText = await callGemini({
          model: "gemini-2.5-flash",
          systemPrompt: `Você é o Brave IA, assessor financeiro pessoal. Gere UMA dica financeira personalizada e prática baseada nos dados do usuário abaixo.

REGRAS:
- Use emojis relevantes
- Para negrito use APENAS *texto* (um asterisco). NUNCA use **texto**.
- Máximo 600 caracteres
- Seja específico: cite categorias, valores, metas reais do usuário
- Dê uma ação concreta que ele pode fazer HOJE
- Se ele gasta muito em uma categoria, sugira redução com valor específico
- Se tem meta, calcule quanto precisa poupar por mês
- Se renda comprometida > 70%, alerte sobre isso
- Finalize com motivação curta

${dicaContext}`,
          messages: [{ role: "user", content: "Me dê uma dica financeira personalizada." }],
          temperature: 0.7,
        });
      } catch (e) {
        console.error("Dica AI error:", e);
      }

      await sendWhatsAppMessage(cleanPhone,
        `💡 *Dica Financeira Personalizada*\n\n${dicaText}\n\n_Brave IA - Seu assessor financeiro 🤖_`
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "resumo" command — show monthly financial summary ──
    const resumoMatch = /^\s*(resumo|resumo\s*do\s*m[eê]s|r[eê]sumo\s*financeiro|extrato|extrato\s*mensal|summary)\s*$/i.test(effectiveText);
    if (resumoMatch) {
      const { data: linkedForResumo } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForResumo) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada a este número. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const resumoUserId = linkedForResumo.user_id;
      const now = getBrazilNow();
      const firstDay = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
      const lastDay = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)).toISOString().slice(0, 10);

      const [{ data: monthTx }, { data: resumoWallets }, { data: resumoProfile }] = await Promise.all([
        supabaseAdmin
          .from("transactions")
          .select("amount, type, description, date, categories(name)")
          .eq("user_id", resumoUserId)
          .gte("date", firstDay)
          .lte("date", lastDay)
          .eq("is_paid", true),
        supabaseAdmin.from("wallets").select("balance").eq("user_id", resumoUserId),
        supabaseAdmin.from("profiles").select("display_name, monthly_income").eq("id", resumoUserId).maybeSingle(),
      ]);

      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const txList = monthTx || [];
      const totalSpent = txList.filter((t: any) => t.type === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalReceived = txList.filter((t: any) => t.type === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
      const totalBalance = (resumoWallets || []).reduce((s: number, w: any) => s + Number(w.balance), 0);
      const monthName = now.toLocaleString("pt-BR", { month: "long" });

      // Group by category
      const categoryMap: Record<string, number> = {};
      txList.filter((t: any) => t.type === "expense").forEach((t: any) => {
        const cat = (t as any).categories?.name || "Outros";
        categoryMap[cat] = (categoryMap[cat] || 0) + Number(t.amount);
      });
      const topCategories = Object.entries(categoryMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      const monthBudget = resumoProfile?.monthly_income ? Number(resumoProfile.monthly_income) : null;
      const budgetLine = monthBudget
        ? `💼 *Renda mensal:* ${fmt(monthBudget)}\n📊 *Comprometido:* ${Math.round((totalSpent / monthBudget) * 100)}%\n`
        : "";

      const categoriesLine = topCategories.length > 0
        ? `\n🏷️ *Top categorias de gasto:*\n${topCategories.map((c, i) => `  ${i + 1}. ${c[0]} — ${fmt(c[1])}`).join("\n")}\n`
        : "";

      const resumoMsg =
        `📊 *Resumo de ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}*\n\n` +
        `💸 *Total gasto:* ${fmt(totalSpent)}\n` +
        `💰 *Total recebido:* ${fmt(totalReceived)}\n` +
        `💳 *Saldo atual:* ${fmt(totalBalance)}\n` +
        budgetLine +
        categoriesLine +
        `\n📈 *Transações no mês:* ${txList.length}\n\n` +
        `_Brave IA - Seu assessor financeiro 🤖_`;

      await sendWhatsAppMessage(cleanPhone, resumoMsg);
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "cartões" command — show credit cards info ──
    const cartoesMatch = /^\s*(cart[oõ]es|meus?\s*cart[oõ]es|cart[aã]o|meu\s*cart[aã]o|fatura|faturas)\s*$/i.test(effectiveText);
    if (cartoesMatch) {
      const { data: linkedForCards } = await supabaseAdmin
        .from("whatsapp_links").select("user_id")
        .eq("phone_number", cleanPhone).eq("verified", true).maybeSingle();
      if (!linkedForCards) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const cardUserId = linkedForCards.user_id;
      const nowC = getBrazilNow();
      const cMonthStart = new Date(nowC.getFullYear(), nowC.getMonth(), 1).toISOString().slice(0, 10);
      const cMonthEnd = new Date(nowC.getFullYear(), nowC.getMonth() + 1, 0).toISOString().slice(0, 10);
      const [{ data: userCards }, { data: cardTxs }] = await Promise.all([
        supabaseAdmin.from("cards").select("id, name, brand, last_4_digits, credit_limit, due_day, color")
          .eq("user_id", cardUserId).order("created_at"),
        supabaseAdmin.from("transactions").select("amount, type, card_id")
          .eq("user_id", cardUserId).not("card_id", "is", null)
          .eq("type", "expense").gte("date", cMonthStart).lte("date", cMonthEnd),
      ]);
      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (!userCards || userCards.length === 0) {
        await sendWhatsAppMessage(cleanPhone, "💳 Você não tem cartões cadastrados.\n\nAcesse o app Brave → Cartões para adicionar.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const todayDay = nowC.getDate();
      const lines: string[] = ["💳 *Seus Cartões de Crédito:*\n"];
      userCards.forEach((card: any, i: number) => {
        const bill = (cardTxs || []).filter((t: any) => t.card_id === card.id).reduce((s: number, t: any) => s + Number(t.amount), 0);
        const limit = Number(card.credit_limit) || 0;
        const available = Math.max(0, limit - bill);
        const usagePct = limit > 0 ? Math.round((bill / limit) * 100) : 0;
        const dueDay = card.due_day || 0;
        const daysUntilDue = dueDay >= todayDay ? dueDay - todayDay : 30 - todayDay + dueDay;
        const dueAlert = dueDay > 0 && daysUntilDue <= 3 ? " 🔴" : "";
        const usageAlert = usagePct >= 80 ? " ⚠️" : "";
        lines.push(
          `${i + 1}. *${card.name}* ${card.brand || ""} (****${card.last_4_digits || "?"})\n` +
          `   💸 Fatura: ${fmt(bill)}${usageAlert}\n` +
          `   ✅ Disponível: ${fmt(available)}\n` +
          (limit > 0 ? `   📊 ${usagePct}% do limite (${fmt(limit)})\n` : "") +
          (dueDay > 0 ? `   📅 Vence dia ${dueDay}${dueAlert}${daysUntilDue <= 3 ? ` (em ${daysUntilDue} dia${daysUntilDue !== 1 ? "s" : ""})` : ""}\n` : "")
        );
      });
      lines.push(`\n_Brave IA - Seu assessor financeiro 🤖_`);
      await sendWhatsAppMessage(cleanPhone, lines.join("\n"));
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "categorias" / "orçamentos" command — show category budgets ──
    const categoriasMatch = /^\s*(categorias?|or[cç]amentos?|meus?\s*or[cç]amentos?|budget)\s*$/i.test(effectiveText);
    if (categoriasMatch) {
      const { data: linkedForCat } = await supabaseAdmin
        .from("whatsapp_links").select("user_id")
        .eq("phone_number", cleanPhone).eq("verified", true).maybeSingle();
      if (!linkedForCat) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const catUserId = linkedForCat.user_id;
      const nowCat = getBrazilNow();
      const catMonthStart = new Date(nowCat.getFullYear(), nowCat.getMonth(), 1).toISOString().slice(0, 10);
      const catMonthEnd = new Date(nowCat.getFullYear(), nowCat.getMonth() + 1, 0).toISOString().slice(0, 10);
      const [{ data: userCats }, { data: catTxs }] = await Promise.all([
        supabaseAdmin.from("categories").select("id, name, budget_limit").eq("user_id", catUserId).order("name"),
        supabaseAdmin.from("transactions").select("amount, category_id")
          .eq("user_id", catUserId).eq("type", "expense")
          .gte("date", catMonthStart).lte("date", catMonthEnd),
      ]);
      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (!userCats || userCats.length === 0) {
        await sendWhatsAppMessage(cleanPhone, "🏷️ Nenhuma categoria encontrada.\n\nAcesse o app Brave → Categorias.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const spentMap: Record<string, number> = {};
      (catTxs || []).forEach((t: any) => {
        if (t.category_id) spentMap[t.category_id] = (spentMap[t.category_id] || 0) + Number(t.amount);
      });
      const monthName = nowCat.toLocaleString("pt-BR", { month: "long" });
      const lines: string[] = [`🏷️ *Categorias e Orçamentos — ${monthName.charAt(0).toUpperCase() + monthName.slice(1)}*\n`];
      let totalSpent = 0;
      let exceeded = 0;
      userCats.forEach((cat: any) => {
        const spent = spentMap[cat.id] || 0;
        totalSpent += spent;
        const limit = cat.budget_limit ? Number(cat.budget_limit) : null;
        if (limit) {
          const pct = Math.round((spent / limit) * 100);
          const bar = "█".repeat(Math.floor(Math.min(pct, 100) / 10)) + "░".repeat(10 - Math.floor(Math.min(pct, 100) / 10));
          const status = pct > 100 ? "🔴" : pct >= 80 ? "🟡" : "🟢";
          if (pct > 100) exceeded++;
          lines.push(`${status} *${cat.name}*\n   ${bar} ${pct}%\n   ${fmt(spent)} de ${fmt(limit)} ${pct > 100 ? `(⚠️ estourou ${fmt(spent - limit)})` : `(resta ${fmt(limit - spent)})`}\n`);
        } else if (spent > 0) {
          lines.push(`📋 *${cat.name}*: ${fmt(spent)} (sem limite definido)\n`);
        }
      });
      if (totalSpent > 0) lines.push(`\n💸 *Total gasto no mês: ${fmt(totalSpent)}*`);
      if (exceeded > 0) lines.push(`⚠️ ${exceeded} categoria(s) estourada(s)`);
      lines.push(`\n_Brave IA - Seu assessor financeiro 🤖_`);
      await sendWhatsAppMessage(cleanPhone, lines.join("\n"));
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "mercado" / "cotações" / "investimentos" command — show market data ──
    const mercadoMatch = /^\s*(mercado|cota[cç][oõ]es|investimentos?|d[oó]lar|bitcoin|ibovespa|bolsa)\s*$/i.test(effectiveText);
    if (mercadoMatch) {
      const { data: linkedForMercado } = await supabaseAdmin
        .from("whatsapp_links").select("user_id")
        .eq("phone_number", cleanPhone).eq("verified", true).maybeSingle();
      if (!linkedForMercado) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        const marketResp = await fetch(`${supabaseUrl}/functions/v1/market-data`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({}),
        });
        if (!marketResp.ok) throw new Error("Market data unavailable");
        const marketData = await marketResp.json();
        const items: any[] = marketData.market || [];
        if (items.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📈 Dados de mercado indisponíveis no momento. Tente novamente em alguns minutos.");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const emojiMap: Record<string, string> = {
          "DÓLAR": "🇺🇸", "EURO": "🇪🇺", "LIBRA (GBP)": "🇬🇧", "BITCOIN": "₿",
          "IBOVESPA": "📊", "NASDAQ": "📈", "DOW JONES": "📉", "CDI": "💹",
          "SELIC": "🏛️", "IFIX": "🏢", "EUR/USD": "💱",
        };
        const lines: string[] = ["📈 *Cotações do Mercado Hoje:*\n"];
        items.forEach((item: any) => {
          const emoji = emojiMap[item.label] || "📊";
          const arrow = item.positive ? "↗️" : "↘️";
          const changeStr = item.change ? ` ${arrow} ${item.change}` : "";
          lines.push(`${emoji} *${item.label}:* ${item.value}${changeStr}`);
        });
        lines.push(`\n⏱️ Atualizado agora\n_Brave IA - Seu assessor financeiro 🤖_`);
        await sendWhatsAppMessage(cleanPhone, lines.join("\n"));
      } catch (e) {
        console.error("Market data error:", e);
        await sendWhatsAppMessage(cleanPhone, "📈 Não foi possível obter dados do mercado agora. Tente novamente mais tarde.");
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "comportamento" / "saúde" command — financial health score ──
    const comportamentoMatch = /^\s*(comportamento|sa[uú]de|sa[uú]de\s*financeira|perfil\s*financeiro|meu\s*perfil)\s*$/i.test(effectiveText);
    if (comportamentoMatch) {
      const { data: linkedForComp } = await supabaseAdmin
        .from("whatsapp_links").select("user_id")
        .eq("phone_number", cleanPhone).eq("verified", true).maybeSingle();
      if (!linkedForComp) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const compUserId = linkedForComp.user_id;
      const nowComp = getBrazilNow();
      const compMonthStart = new Date(nowComp.getFullYear(), nowComp.getMonth(), 1).toISOString().slice(0, 10);
      const compMonthEnd = new Date(nowComp.getFullYear(), nowComp.getMonth() + 1, 0).toISOString().slice(0, 10);
      const comp3MoAgo = new Date(nowComp.getFullYear(), nowComp.getMonth() - 2, 1).toISOString().slice(0, 10);
      const compPrevStart = new Date(nowComp.getFullYear(), nowComp.getMonth() - 1, 1).toISOString().slice(0, 10);
      const compPrevEnd = new Date(nowComp.getFullYear(), nowComp.getMonth(), 0).toISOString().slice(0, 10);
      const [{ data: compProfile }, { data: compTx }, { data: compGoals }] = await Promise.all([
        supabaseAdmin.from("profiles").select("monthly_income").eq("id", compUserId).single(),
        supabaseAdmin.from("transactions").select("amount, type, date, created_at, categories(name)")
          .eq("user_id", compUserId).gte("date", comp3MoAgo).order("date"),
        supabaseAdmin.from("financial_goals").select("id").eq("user_id", compUserId),
      ]);
      const income = Number(compProfile?.monthly_income) || 0;
      const allExpenses = (compTx || []).filter((t: any) => t.type === "expense");
      const currentExpenses = allExpenses.filter((t: any) => t.date >= compMonthStart && t.date <= compMonthEnd);
      const prevExpenses = allExpenses.filter((t: any) => t.date >= compPrevStart && t.date <= compPrevEnd);
      const totalExpense = currentExpenses.reduce((s: number, t: any) => s + Number(t.amount), 0);
      const prevTotalExpense = prevExpenses.reduce((s: number, t: any) => s + Number(t.amount), 0);
      // Small transactions (impulsivity)
      const smallTx = currentExpenses.filter((t: any) => Number(t.amount) < 20).length;
      const impulsivity = currentExpenses.length > 0 ? Math.round((smallTx / currentExpenses.length) * 100) : 0;
      // Health scores
      const controlScore = income > 0 ? Math.max(0, Math.min(100, 100 - (totalExpense / income * 100))) : 50;
      const consistencyScore = allExpenses.length > 0 ? Math.min(100, allExpenses.length * 5) : 0;
      const planningScore = (compGoals || []).length > 0 ? Math.min(100, (compGoals || []).length * 25) : 0;
      const economyScore = income > 0 ? Math.max(0, Math.min(100, ((income - totalExpense) / income) * 100)) : 50;
      const disciplineScore = 100 - impulsivity;
      const healthScore = Math.round((controlScore + consistencyScore + planningScore + economyScore + disciplineScore) / 5);
      // Month change
      const monthChange = prevTotalExpense > 0 ? Math.round(((totalExpense - prevTotalExpense) / prevTotalExpense) * 100) : 0;
      // Top category
      const catMap: Record<string, number> = {};
      currentExpenses.forEach((t: any) => {
        const cat = (t as any).categories?.name || "Outros";
        catMap[cat] = (catMap[cat] || 0) + Number(t.amount);
      });
      const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 3);
      const fmtC = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const statusEmoji = healthScore >= 70 ? "🟢" : healthScore >= 40 ? "🟡" : "🔴";
      const statusLabel = healthScore >= 70 ? "Saudável" : healthScore >= 40 ? "Equilibrado" : "Atenção";
      const bar = (v: number) => "█".repeat(Math.floor(v / 10)) + "░".repeat(10 - Math.floor(v / 10));
      const lines: string[] = [
        `🩺 *Saúde Financeira*\n`,
        `${statusEmoji} *Status:* ${statusLabel} — *${healthScore}%*\n`,
        `📊 *Indicadores:*`,
        `🎯 Controle: ${bar(controlScore)} ${Math.round(controlScore)}%`,
        `📈 Consistência: ${bar(consistencyScore)} ${Math.round(consistencyScore)}%`,
        `🗓️ Planejamento: ${bar(planningScore)} ${Math.round(planningScore)}%`,
        `💰 Economia: ${bar(economyScore)} ${Math.round(economyScore)}%`,
        `🧠 Disciplina: ${bar(disciplineScore)} ${Math.round(disciplineScore)}%\n`,
        `📋 *Mês atual:*`,
        `💸 Gastos: ${fmtC(totalExpense)}`,
        income > 0 ? `📊 ${Math.round((totalExpense / income) * 100)}% da renda comprometida` : "",
        monthChange !== 0 ? `${monthChange > 0 ? "📈" : "📉"} ${monthChange > 0 ? "+" : ""}${monthChange}% vs mês anterior` : "",
        `⚡ Impulsividade: ${impulsivity}%\n`,
      ];
      if (topCats.length > 0) {
        lines.push(`🏷️ *Top categorias:*`);
        topCats.forEach(([c, v], i) => lines.push(`  ${i + 1}. ${c}: ${fmtC(v)}`));
        lines.push("");
      }
      lines.push(`_Brave IA - Seu assessor financeiro 🤖_`);
      await sendWhatsAppMessage(cleanPhone, lines.filter(l => l !== "").join("\n"));
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "aporte" command — deposit into a goal ──
    const aporteMatch = /^\s*(aporte|depositar|depositar\s+na\s+meta|aporte\s+meta)\s*$/i.test(effectiveText);
    if (aporteMatch) {
      const { data: linkedForAporte } = await supabaseAdmin
        .from("whatsapp_links").select("user_id")
        .eq("phone_number", cleanPhone).eq("verified", true).maybeSingle();
      if (!linkedForAporte) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const { data: aporteGoals } = await supabaseAdmin
        .from("financial_goals").select("id, name, target_amount, current_amount, deadline")
        .eq("user_id", linkedForAporte.user_id).order("created_at", { ascending: false }).limit(10);
      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (!aporteGoals || aporteGoals.length === 0) {
        await sendWhatsAppButtons(cleanPhone,
          "🎯 Você não tem metas cadastradas para depositar.\n\nCrie uma meta primeiro!",
          [{ id: "CRIAR_META", text: "✨ Criar Meta" }],
          "Ou envie: meta: Nome da Meta"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
      await supabaseAdmin.from("whatsapp_sessions").insert({
        phone_number: cleanPhone,
        step: "aporte_select_goal",
        context: { user_id: linkedForAporte.user_id, goalsList: aporteGoals },
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      const goalLines = aporteGoals.map((g: any, i: number) => {
        const pct = Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100);
        return `${i + 1}. 🎯 *${g.name}* — ${pct}% (${fmt(Number(g.current_amount))} / ${fmt(Number(g.target_amount))})`;
      }).join("\n");
      await sendWhatsAppMessage(cleanPhone,
        `💵 *Depositar em qual meta?*\n\n${goalLines}\n\nResponda com o *número* da meta. Ou envie *cancelar*.`
      );
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── "conferir" / CHECK_BILLS command — show upcoming unpaid bills ──
    const checkBillsMatch = /^\s*(conferir|check.?bills|ver.?contas|minhas.?contas|contas)\s*$/i.test(effectiveText) || effectiveText === "CHECK_BILLS";
    if (checkBillsMatch) {
      const { data: linkedForBills } = await supabaseAdmin
        .from("whatsapp_links")
        .select("user_id")
        .eq("phone_number", cleanPhone)
        .eq("verified", true)
        .maybeSingle();

      if (!linkedForBills) {
        await sendWhatsAppMessage(cleanPhone, "❌ Nenhuma conta vinculada a este número. Vincule pelo app Brave primeiro.");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const today = getBrazilNow();
      const todayStr = today.toISOString().slice(0, 10);
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + 7);
      const futureDateStr = futureDate.toISOString().slice(0, 10);

      const { data: upcoming } = await supabaseAdmin
        .from("transactions")
        .select("id, description, amount, type, due_date, is_paid, categories(name)")
        .eq("user_id", linkedForBills.user_id)
        .eq("is_paid", false)
        .gte("due_date", todayStr)
        .lte("due_date", futureDateStr)
        .order("due_date", { ascending: true })
        .limit(15);

      const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const bills = (upcoming || []).filter((t: any) => t.type === "expense");
      const receivables = (upcoming || []).filter((t: any) => t.type === "income");

      if (bills.length === 0 && receivables.length === 0) {
        await sendWhatsAppMessage(cleanPhone, "✅ Você não tem contas pendentes nos próximos 7 dias. Tudo em dia! 🎉");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const lines: string[] = ["📋 *Suas contas dos próximos 7 dias:*"];

      if (bills.length > 0) {
        const total = bills.reduce((s: number, t: any) => s + Number(t.amount), 0);
        lines.push("\n💸 *A Pagar:*");
        bills.forEach((t: any, i: number) => {
          const cat = (t as any).categories?.name || "Geral";
          const due = t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—";
          lines.push(`${i + 1}. ${t.description} — ${fmt(Number(t.amount))} · vence ${due} · ${cat}`);
        });
        lines.push(`💸 *Total a pagar: ${fmt(total)}*`);
      }

      if (receivables.length > 0) {
        const total = receivables.reduce((s: number, t: any) => s + Number(t.amount), 0);
        lines.push("\n💰 *A Receber:*");
        receivables.forEach((t: any) => {
          const due = t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "—";
          lines.push(`• ${t.description} — ${fmt(Number(t.amount))} · previsto ${due}`);
        });
        lines.push(`✅ *Total a receber: ${fmt(total)}*`);
      }

      lines.push("\n_Brave Assessor - Seu assessor financeiro 🤖_");

      // Send the bill list first
      await sendWhatsAppMessage(cleanPhone, lines.join("\n"));

      // If there are bills to pay, also send the "Marcar como Pago" button
      if (bills.length > 0) {
        await sendWhatsAppButtons(
          cleanPhone,
          "Deseja marcar alguma conta como paga?",
          [{ id: "MARK_PAID", text: "💳 Marcar como Pago" }],
          "Clique para iniciar"
        );
      }

      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: link } = await supabaseAdmin
      .from("whatsapp_links")
      .select("user_id")
      .eq("phone_number", cleanPhone)
      .eq("verified", true)
      .maybeSingle();

    if (!link) {
      await sendWhatsAppMessage(cleanPhone,
        "👋 Olá! Sou o Brave IA, seu assessor financeiro.\n\n" +
        "Para começar, vincule seu WhatsApp no app:\n" +
        "1. Abra o Nox → Configurações\n" +
        "2. Clique em 'Vincular WhatsApp'\n" +
        "3. Envie o código aqui\n\n" +
        "É rapidinho! 😊"
      );
      return new Response(JSON.stringify({ ok: true, unlinked: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = link.user_id;

    // Get financial context (unified — includes data created via website AND WhatsApp)
    const now = getBrazilNow();
    const firstDayOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
    const lastDayOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0)).toISOString().slice(0, 10);

    const [
      { data: profile },
      { data: wallets },
      { data: categories },
      { data: recentTx },
      { data: activeReminders },
      { data: recurringTx },
      { data: financialGoals },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("display_name, monthly_income").eq("id", userId).single(),
      supabaseAdmin.from("wallets").select("name, type, balance, id").eq("user_id", userId),
      supabaseAdmin.from("categories").select("id, name, icon, budget_limit").eq("user_id", userId),
      supabaseAdmin.from("transactions").select("amount, type, description, date, categories(name)")
        .eq("user_id", userId).order("date", { ascending: false }).limit(10),
      supabaseAdmin.from("reminders")
        .select("title, description, event_at, recurrence, is_active")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("event_at", { ascending: true })
        .limit(10),
      supabaseAdmin.from("recurring_transactions")
        .select("description, amount, type, day_of_month, categories(name)")
        .eq("user_id", userId)
        .eq("is_active", true)
        .order("day_of_month", { ascending: true })
        .limit(15),
      supabaseAdmin.from("financial_goals")
        .select("id, name, target_amount, current_amount, deadline")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    const totalBalance = (wallets || []).reduce((s: number, w: any) => s + Number(w.balance), 0);

    // Format reminders for context (both from website and WhatsApp)
    const futureReminders = (activeReminders || []).filter((r: any) =>
      r.recurrence !== "none" || new Date(r.event_at) > now
    );
    const remindersCtx = futureReminders.length > 0
      ? futureReminders.slice(0, 5).map((r: any) => {
          const dt = new Date(r.event_at).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          });
          const rec = r.recurrence && r.recurrence !== "none" ? ` (${r.recurrence})` : "";
          return `${r.title}${rec} em ${dt}`;
        }).join("; ")
      : "nenhum";

    // Format recurring transactions for context
    const recurringCtx = (recurringTx || []).length > 0
      ? (recurringTx || []).slice(0, 8).map((r: any) =>
          `${r.description} R$${Number(r.amount).toFixed(2)} dia ${r.day_of_month}`
        ).join("; ")
      : "nenhuma";

    // Format financial goals for context
    const goalsCtx = (financialGoals || []).length > 0
      ? (financialGoals || []).map((g: any) => {
          const pct = Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100);
          const missing = Number(g.target_amount) - Number(g.current_amount);
          const deadline = g.deadline
            ? ` prazo: ${new Date(g.deadline + "T12:00:00").toLocaleDateString("pt-BR")}`
            : "";
          return `${g.name}: R$${Number(g.current_amount).toFixed(2)}/R$${Number(g.target_amount).toFixed(2)} (${pct}%, falta R$${missing.toFixed(2)}${deadline})`;
        }).join("; ")
      : "nenhuma";

    const financialContext = `
Nome: ${profile?.display_name || "Usuário"}
Renda: R$ ${profile?.monthly_income ? Number(profile.monthly_income).toFixed(2) : "?"}
Saldo: R$ ${totalBalance.toFixed(2)}
Carteiras: ${(wallets || []).map((w: any) => `${w.name} R$${Number(w.balance).toFixed(2)}`).join(", ") || "nenhuma"}
Categorias: ${(categories || []).map((c: any) => `${c.name} (id:${c.id})`).join(", ")}
Últimas transações: ${(recentTx || []).slice(0, 5).map((t: any) => `${t.type === "income" ? "+" : "-"}R$${Number(t.amount).toFixed(2)} ${t.description}`).join("; ") || "nenhuma"}
Lembretes ativos: ${remindersCtx}
Recorrências ativas: ${recurringCtx}
Metas financeiras: ${goalsCtx}`;

    // ── PRIORITY 1: Check if user is interacting with a pending transaction ──
    // This must happen BEFORE calling AI, so button clicks get handled immediately
    if (effectiveText) {
      const { data: pending } = await supabaseAdmin
        .from("whatsapp_pending_transactions")
        .select("*")
        .eq("phone_number", cleanPhone)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (pending) {
        console.log(`Pending transaction found: ${pending.id}, effectiveText="${effectiveText}"`);

        const confirmMatch = effectiveText.match(/^(1|sim|s|confirmar|ok|yes|confirm|✅ confirmar|✅)$/i);
        const cancelMatch  = effectiveText.match(/^(2|não|nao|n|cancelar|cancel|no|❌ cancelar|❌)$/i);
        const amountMatch  = effectiveText.match(/^(?:valor\s+)?r?\$?\s*(\d+(?:[.,]\d{1,2})?)$/i);
        const descMatch    = effectiveText.match(/^(?:desc(?:rição)?|descrição|nome|item)\s*[:\-]?\s*(.+)$/i);
        const typeMatch    = effectiveText.match(/^(receita|income|entrada|despesa|expense|gasto|saída|saida)$/i);
        const catMatch     = !confirmMatch && !cancelMatch && !amountMatch && !descMatch && !typeMatch
          ? (categories || []).find((c: any) => effectiveText.toLowerCase() === c.name.toLowerCase())
          : null;

        if (cancelMatch) {
          await supabaseAdmin.from("whatsapp_pending_transactions").delete().eq("id", pending.id);
          await sendWhatsAppMessage(cleanPhone, "❌ Transação cancelada!");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (amountMatch) {
          const newAmount = parseFloat(amountMatch[1].replace(",", "."));
          await supabaseAdmin
            .from("whatsapp_pending_transactions")
            .update({ amount: newAmount })
            .eq("id", pending.id);
          const emoji = pending.type === "income" ? "💰" : "💸";
          await sendWhatsAppButtons(
            cleanPhone,
            `✏️ Valor atualizado para *R$ ${newAmount.toFixed(2)}*\n\n` +
            `${emoji} *Confirmar transação?*\n\n` +
            `📝 ${pending.description}\n` +
            `💵 R$ ${newAmount.toFixed(2)}\n` +
            `📂 ${pending.category_name || "Sem categoria"}`,
            [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
            "Ou corrija: valor, descrição, categoria ou tipo"
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (descMatch) {
          const newDesc = descMatch[1].trim();
          await supabaseAdmin
            .from("whatsapp_pending_transactions")
            .update({ description: newDesc })
            .eq("id", pending.id);
          const emoji = pending.type === "income" ? "💰" : "💸";
          await sendWhatsAppButtons(
            cleanPhone,
            `✏️ Descrição atualizada para *${newDesc}*\n\n` +
            `${emoji} *Confirmar transação?*\n\n` +
            `📝 ${newDesc}\n` +
            `💵 R$ ${Number(pending.amount).toFixed(2)}\n` +
            `📂 ${pending.category_name || "Sem categoria"}`,
            [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
            "Ou corrija: valor, descrição, categoria ou tipo"
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (typeMatch) {
          const isIncome = /receita|income|entrada/i.test(effectiveText);
          const newType = isIncome ? "income" : "expense";
          await supabaseAdmin
            .from("whatsapp_pending_transactions")
            .update({ type: newType })
            .eq("id", pending.id);
          const emoji = newType === "income" ? "💰" : "💸";
          const typeLabel = newType === "income" ? "Receita" : "Despesa";
          await sendWhatsAppButtons(
            cleanPhone,
            `✏️ Tipo alterado para *${typeLabel}*\n\n` +
            `${emoji} *Confirmar transação?*\n\n` +
            `📝 ${pending.description}\n` +
            `💵 R$ ${Number(pending.amount).toFixed(2)}\n` +
            `📂 ${pending.category_name || "Sem categoria"}\n` +
            `🏷️ ${typeLabel}`,
            [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
            "Ou corrija: valor, descrição, categoria ou tipo"
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (catMatch) {
          await supabaseAdmin
            .from("whatsapp_pending_transactions")
            .update({ category_id: (catMatch as any).id, category_name: (catMatch as any).name })
            .eq("id", pending.id);
          const emoji = pending.type === "income" ? "💰" : "💸";
          await sendWhatsAppButtons(
            cleanPhone,
            `✏️ Categoria atualizada para *${(catMatch as any).name}*\n\n` +
            `${emoji} *Confirmar transação?*\n\n` +
            `📝 ${pending.description}\n` +
            `💵 R$ ${Number(pending.amount).toFixed(2)}\n` +
            `📂 ${(catMatch as any).name}`,
            [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
            "Ou corrija: valor, descrição, categoria ou tipo"
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (confirmMatch) {
          await supabaseAdmin.from("whatsapp_pending_transactions").delete().eq("id", pending.id);

          const defaultWallet = (wallets || [])[0];
          const { error: txError } = await supabaseAdmin.from("transactions").insert({
            user_id: userId,
            amount: pending.amount,
            description: pending.description,
            type: pending.type,
            category_id: pending.category_id || null,
            wallet_id: defaultWallet?.id || null,
            date: getBrazilTodayStr(),
          });

          if (txError) {
            await sendWhatsAppMessage(cleanPhone, `❌ Erro ao registrar: ${txError.message}`);
          } else {
            if (defaultWallet) {
              const balanceChange = pending.type === "income" ? Number(pending.amount) : -Number(pending.amount);
              await supabaseAdmin.from("wallets").update({
                balance: Number(defaultWallet.balance) + balanceChange,
              }).eq("id", defaultWallet.id);
            }
            const emoji = pending.type === "income" ? "💰" : "💸";
            const paymentInfo = pending.payment_method ? `\n💳 ${pending.payment_method}` : "";
            const newBalance = totalBalance + (pending.type === "income" ? Number(pending.amount) : -Number(pending.amount));
            await sendWhatsAppMessage(cleanPhone,
              `${emoji} Transação registrada!\n\n` +
              `📝 ${pending.description}\n` +
              `💵 R$ ${Number(pending.amount).toFixed(2)}\n` +
              `📂 ${pending.category_name || "Sem categoria"}${paymentInfo}\n` +
              `📅 ${new Date().toLocaleDateString("pt-BR")}\n\n` +
              `💰 Novo saldo: R$ ${newBalance.toFixed(2)}`
            );
          }
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Unknown response while pending — re-show the confirmation
        const emoji = pending.type === "income" ? "💰" : "💸";
        await sendWhatsAppButtons(
          cleanPhone,
          `${emoji} *Confirmar transação?*\n\n` +
          `📝 ${pending.description}\n` +
          `💵 R$ ${Number(pending.amount).toFixed(2)}\n` +
          `📂 ${pending.category_name || "Sem categoria"}`,
          [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
          "Ou corrija: valor, descrição, categoria ou tipo"
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── PRIORITY 2: Process media or text with AI ──
    let aiResponse: string;

    if (isMedia && messageId && !isButtonResponse) {
      const mediaLabel = isAudio ? "🎙️ Processando seu áudio..." : "📸 Analisando o comprovante...";
      console.log(`Downloading media: messageId=${messageId} mediaType=${mediaType}`);
      await sendWhatsAppMessage(cleanPhone, mediaLabel);

      try {
        const mediaData = await downloadMediaFromEvolution(messageId, mediaType, message);

        if (!mediaData) {
          aiResponse = "😕 Não consegui baixar a mídia. Tente enviar novamente ou descreva por texto!";
        } else if (isAudio) {
          console.log("Processing audio, mimetype:", mediaData.mimetype);
          aiResponse = await processAudioWithAI(mediaData.base64, mediaData.mimetype, financialContext);
        } else if (isImage) {
          console.log("Processing image, mimetype:", mediaData.mimetype);
          const caption = message.caption || "";
          aiResponse = await processImageWithAI(mediaData.base64, mediaData.mimetype, financialContext, caption);
        } else {
          aiResponse = "📎 Recebi seu arquivo, mas só consigo processar áudios e imagens por enquanto!";
        }
      } catch (e) {
        console.error("Media processing error:", e);
        aiResponse = "😕 Não consegui processar a mídia. Tente novamente ou escreva por texto!";
      }
    } else {
      aiResponse = await processWithNoxIA(effectiveText || messageText, financialContext);
    }
    let replyText = aiResponse;
    try {
      // ── Detect list action (add_list or legacy add_recurring_list) ──
      const listAction = extractActionJson(aiResponse, "add_list") || extractActionJson(aiResponse, "add_recurring_list");
      if (listAction) {
        const action = listAction;
        const items: any[] = (action.items || []).map((item: any) => ({
          ...item,
          amount: normalizeAmount(item.amount),
          description: cleanDescription(item.description || ""),
          type: normalizeType(item.type || "expense"),
        }));
        if (items.length === 0) throw new Error("Empty list");

        const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // Match categories for each item
        const enriched = items.map((item: any) => {
          let matchedCat = (categories || []).find(
            (c: any) => c.name.toLowerCase() === item.category?.toLowerCase()
          );
          // Fallback: keyword-based auto-categorization
          if (!matchedCat && item.description) {
            matchedCat = autoCategorize(item.description, categories || []);
          }
          return { ...item, category_id: matchedCat?.id || null, category_name: matchedCat?.name || item.category || "Outros" };
        });

        // Build summary
        const totalAmount = enriched.reduce((s: number, i: any) => s + Number(i.amount), 0);
        const lines = enriched.map((i: any, idx: number) =>
          `${idx + 1}. *${i.description}* — ${fmt(Number(i.amount))}`
        );

        const summaryMsg =
          `📋 *Encontrei ${items.length} itens:*\n\n` +
          lines.join("\n") +
          `\n\n💵 *Total: ${fmt(totalAmount)}*`;

        // Store in session and ask if recurring or one-time
        await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone,
          step: "ask_list_type",
          context: { user_id: userId, items: enriched },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });

        await sendWhatsAppMessage(cleanPhone, summaryMsg);
        await sendWhatsAppButtons(
          cleanPhone,
          `❓ São contas *recorrentes* (todo mês) ou transações *únicas* (já pagou/recebeu)?`,
          [{ id: "1", text: "✅ Recorrentes" }, { id: "2", text: "💸 Transações únicas" }],
          ""
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Detect single transaction action ──
      const txAction = extractActionJson(aiResponse, "add_transaction");
      if (txAction) {
        const action = txAction;
        action.amount = normalizeAmount(action.amount);
        action.description = cleanDescription(action.description || "");
        action.type = normalizeType(action.type || "expense");

        let matchedCategory = (categories || []).find(
          (c: any) => c.name.toLowerCase() === action.category?.toLowerCase()
        );
        // Fallback: keyword-based auto-categorization
        if (!matchedCategory && action.description) {
          matchedCategory = autoCategorize(action.description, categories || []);
        }

        // Save as pending and ask for confirmation instead of auto-registering
        await supabaseAdmin.from("whatsapp_pending_transactions").insert({
          user_id: userId,
          phone_number: cleanPhone,
          amount: action.amount,
          description: action.description,
          type: action.type || "expense",
          category_id: matchedCategory?.id || null,
          category_name: matchedCategory?.name || action.category || null,
          payment_method: action.payment_method || null,
        });

        const emoji = action.type === "income" ? "💰" : "💸";
        const paymentInfo = action.payment_method ? `\n💳 ${action.payment_method}` : "";
        const confirmBody =
          `${emoji} *Confirmar transação?*\n\n` +
          `📝 ${action.description}\n` +
          `💵 R$ ${Number(action.amount).toFixed(2)}\n` +
          `📂 ${matchedCategory?.name || action.category || "Sem categoria"}${paymentInfo}`;

        await sendWhatsAppButtons(
          cleanPhone,
          confirmBody,
          [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
          "Ou corrija: valor, descrição, categoria ou tipo"
        );
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Detect add_recurring action (single recurring bill) — confirmation flow ──
      const addRecurringAction = extractActionJson(aiResponse, "add_recurring");
      if (addRecurringAction) {
        const action = addRecurringAction;
        action.amount = normalizeAmount(action.amount);
        action.description = cleanDescription(action.description || "");
        action.type = normalizeType(action.type || "expense");
        const dayOfMonth = Math.min(Math.max(parseInt(action.day_of_month) || 1, 1), 31);

        let matchedCategory = (categories || []).find(
          (c: any) => c.name.toLowerCase() === action.category?.toLowerCase()
        );
        if (!matchedCategory && action.description) {
          matchedCategory = autoCategorize(action.description, categories || []);
        }

        // Store in session for confirmation
        await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone,
          step: "confirm_single_recurring",
          context: {
            user_id: userId,
            description: action.description,
            amount: action.amount,
            type: action.type,
            day_of_month: dayOfMonth,
            category_id: matchedCategory?.id || null,
            category_name: matchedCategory?.name || action.category || "Sem categoria",
          },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });

        const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
        const emoji = action.type === "income" ? "💰" : "🔄";
        await sendWhatsAppButtons(
          cleanPhone,
          `${emoji} *Confirmar recorrência?*\n\n` +
          `📝 ${action.description}\n` +
          `💵 ${fmt(Number(action.amount))}\n` +
          `📅 Todo dia ${dayOfMonth}\n` +
          `📂 ${matchedCategory?.name || action.category || "Sem categoria"}`,
          [{ id: "sim", text: "✅ Confirmar" }, { id: "nao", text: "❌ Cancelar" }],
          "Ou corrija: valor, dia, descrição"
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect add_reminder action from AI ──
      const reminderAction = extractActionJson(aiResponse, "add_reminder");
      if (reminderAction) {
        const action = reminderAction;
        // Clean the title programmatically
        action.title = cleanReminderTitle(action.title || "", effectiveText || messageText);
        
        // Build event_at from date + time provided by AI
        let eventAt: string | null = null;
        if (action.date && action.time) {
          eventAt = new Date(`${action.date}T${action.time}:00-03:00`).toISOString();
        } else if (action.date) {
          eventAt = new Date(`${action.date}T09:00:00-03:00`).toISOString();
        } else if (action.event_at) {
          eventAt = new Date(action.event_at).toISOString();
        }

        // Force user's intended time from original text (compensate for AI errors)
        if (eventAt) {
          const userTime = extractUserTime(effectiveText || messageText);
          if (userTime) {
            const dateStr = eventAt.length >= 10 ? new Date(eventAt).toISOString().substring(0, 10) : eventAt.substring(0, 10);
            eventAt = forceTimeOnIso(dateStr + "T00:00:00-03:00", userTime.hours, userTime.minutes);
            eventAt = new Date(eventAt).toISOString();
          }
        }

        if (!eventAt || isNaN(new Date(eventAt).getTime())) {
          // Fallback: use parseReminderWithAI for the original text
          replyText = "❓ Não consegui identificar a data/hora do lembrete. Tente: _\"lembrete: reunião amanhã 15h\"_";
        } else {
          const recurrence = action.recurrence || "none";

          // Create session — go to reminder_notify step to ask notification time
          await supabaseAdmin.from("whatsapp_sessions").upsert({
            phone_number: cleanPhone,
            step: "reminder_notify",
            context: {
              user_id: userId,
              title: action.title,
              description: action.description || null,
              event_at: eventAt,
              recurrence,
              originalText: effectiveText,
            },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          }, { onConflict: "phone_number" });

          const fmtDate = (s: string) =>
            new Date(s).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
            });

          const recLbl = recurrenceLabel(recurrence, eventAt, effectiveText);

          await sendWhatsAppButtons(
            cleanPhone,
            `🔔 *Novo lembrete:*\n\n` +
            `📝 *Nome:* ${action.title}\n` +
            `📅 *Horário:* ${fmtDate(eventAt)}\n` +
            (recLbl ? `${recLbl}\n` : `🔂 *Recorrência:* Nenhuma\n`) +
            `\n⏰ *Quanto tempo antes quer ser avisado?*`,
            [{ id: "30m", text: "30 minutos" }, { id: "1h", text: "1 hora" }, { id: "1d", text: "1 dia" }],
            "Ou escreva: 10 min, 2h, 3 dias..."
          );
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // ── Detect list_reminders action from AI ──
      const listRemindersMatch = aiResponse.match(/\{[\s\S]*"action"\s*:\s*"list_reminders"[\s\S]*\}/);
      if (listRemindersMatch) {
        const now = new Date();
        const { data: allUserReminders } = await supabaseAdmin
          .from("reminders")
          .select("id, title, description, event_at, notify_minutes_before, recurrence, is_active")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("event_at", { ascending: true })
          .limit(20);

        const activeReminders = (allUserReminders || []).filter((r: any) => {
          if (r.recurrence && r.recurrence !== "none") return true;
          return new Date(r.event_at) > now;
        }).slice(0, 10);

        if (!activeReminders || activeReminders.length === 0) {
          await sendWhatsAppMessage(cleanPhone,
            "📭 Você não tem lembretes ativos no momento.\n\nPara criar um, envie:\n_lembrete: reunião amanhã 15h_\n\n_Brave IA - Seu assessor financeiro 🤖_"
          );
        } else {
          const recMap: Record<string, string> = { none: "", daily: "🔁", weekly: "🔁", monthly: "🔁" };
          const list = activeReminders.map((r: any, i: number) => {
            const dt = new Date(r.event_at).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", year: "numeric",
              hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
            });
            const rec = recMap[r.recurrence] || "";
            return `${i + 1}. ${rec} 🔔 *${r.title}*\n    📅 ${dt}`;
          }).join("\n\n");

          await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
          await supabaseAdmin.from("whatsapp_sessions").insert({
            phone_number: cleanPhone,
            step: "list_reminders",
            context: { user_id: userId, reminders: activeReminders },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          });

          await sendWhatsAppMessage(cleanPhone,
            `📋 *Seus próximos lembretes (${activeReminders.length}):*\n\n${list}\n\n` +
            `Responda com o *número* para editar ou cancelar um lembrete.\nEnvie *cancelar* para sair.`
          );
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Detect delete_reminder action from AI ──
      const deleteReminderAction = extractActionJson(aiResponse, "delete_reminder");
      if (deleteReminderAction) {
        const action = deleteReminderAction;
        const searchTerm = (action.search || "").toLowerCase();

        const { data: userReminders } = await supabaseAdmin
          .from("reminders")
          .select("id, title, event_at, recurrence, is_active")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("event_at", { ascending: true });

        const matched = (userReminders || []).filter((r: any) =>
          r.title.toLowerCase().includes(searchTerm)
        );

        if (matched.length === 0) {
          await sendWhatsAppMessage(cleanPhone,
            `❓ Não encontrei nenhum lembrete com "${action.search}". Envie _"meus lembretes"_ para ver a lista.`
          );
        } else if (matched.length === 1) {
          const r = matched[0];
          const dt = new Date(r.event_at).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
          });

          await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
          await supabaseAdmin.from("whatsapp_sessions").insert({
            phone_number: cleanPhone,
            step: "reminder_action",
            context: { user_id: userId, chosen_reminder: r, reminders: userReminders },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          });

          await sendWhatsAppButtons(
            cleanPhone,
            `🔔 *${r.title}*\n📅 ${dt}\n\nDeseja cancelar este lembrete?`,
            [{ id: "CONFIRM_DELETE_REMINDER", text: "✅ Sim, cancelar" }, { id: "BACK_REMINDERS", text: "⬅️ Voltar" }],
            "Confirme para excluir"
          );
        } else {
          // Multiple matches - show list to pick
          const list = matched.map((r: any, i: number) => {
            const dt = new Date(r.event_at).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
            });
            return `${i + 1}. 🔔 *${r.title}* — ${dt}`;
          }).join("\n");

          await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
          await supabaseAdmin.from("whatsapp_sessions").insert({
            phone_number: cleanPhone,
            step: "list_reminders",
            context: { user_id: userId, reminders: matched },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          });

          await sendWhatsAppMessage(cleanPhone,
            `🔍 Encontrei ${matched.length} lembretes com "${action.search}":\n\n${list}\n\nResponda com o *número* para gerenciar.`
          );
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ── Detect edit_reminder action from AI ──
      const editReminderAction = extractActionJson(aiResponse, "edit_reminder");
      if (editReminderAction) {
        const action = editReminderAction;
        const searchTerm = (action.search || "").toLowerCase();

        const { data: userReminders } = await supabaseAdmin
          .from("reminders")
          .select("id, title, event_at, recurrence, notify_minutes_before, is_active")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("event_at", { ascending: true });

        const matched = (userReminders || []).filter((r: any) =>
          r.title.toLowerCase().includes(searchTerm)
        );

        if (matched.length === 0) {
          await sendWhatsAppMessage(cleanPhone,
            `❓ Não encontrei nenhum lembrete com "${action.search}". Envie _"meus lembretes"_ para ver a lista.`
          );
        } else if (matched.length === 1) {
          const r = matched[0];
          let updateData: any = {};
          let successMsg = "";

          if (action.field === "title" && action.new_value) {
            updateData.title = action.new_value;
            successMsg = `✅ Nome atualizado para *${action.new_value}*!`;
          } else if (action.field === "time" && action.new_value) {
            const currentDate = new Date(r.event_at);
            const [h, m] = action.new_value.split(":").map(Number);
            currentDate.setHours(h, m, 0, 0);
            updateData.event_at = currentDate.toISOString();
            updateData.is_sent = false;
            successMsg = `✅ Horário atualizado para *${action.new_value}*!`;
          } else if (action.field === "date" && action.new_value) {
            const currentTime = new Date(r.event_at);
            const newDate = new Date(`${action.new_value}T${currentTime.getHours().toString().padStart(2,"0")}:${currentTime.getMinutes().toString().padStart(2,"0")}:00-03:00`);
            updateData.event_at = newDate.toISOString();
            updateData.is_sent = false;
            const dt = newDate.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
            successMsg = `✅ Data atualizada para *${dt}*!`;
          } else if (action.field === "recurrence" && action.new_value) {
            updateData.recurrence = action.new_value;
            const recNames: Record<string, string> = { none: "Nenhuma", daily: "Diária", weekly: "Semanal", monthly: "Mensal" };
            successMsg = `✅ Recorrência atualizada para *${recNames[action.new_value] || action.new_value}*!`;
          } else {
            // No valid field — open edit session
            await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
            await supabaseAdmin.from("whatsapp_sessions").insert({
              phone_number: cleanPhone,
              step: "reminder_edit_field",
              context: { user_id: userId, chosen_reminder: r, reminders: userReminders },
              expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            });

            await sendWhatsAppButtons(
              cleanPhone,
              `✏️ *Editar: ${r.title}*\n\nO que deseja alterar?`,
              [{ id: "EDIT_TITLE", text: "📝 Nome" }, { id: "EDIT_DATE", text: "📅 Data/hora" }, { id: "EDIT_NOTIFY", text: "⏰ Aviso antecipado" }],
              "Escolha o que editar"
            );
            return new Response(JSON.stringify({ ok: true }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }

          if (Object.keys(updateData).length > 0) {
            await supabaseAdmin.from("reminders").update(updateData).eq("id", r.id);
            await sendWhatsAppMessage(cleanPhone,
              `${successMsg}\n\n🔔 *${updateData.title || r.title}*\n_Brave IA - Seu assessor financeiro 🤖_`
            );
          }
        } else {
          // Multiple matches
          const list = matched.map((r: any, i: number) => {
            const dt = new Date(r.event_at).toLocaleString("pt-BR", {
              day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
            });
            return `${i + 1}. 🔔 *${r.title}* — ${dt}`;
          }).join("\n");

          await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
          await supabaseAdmin.from("whatsapp_sessions").insert({
            phone_number: cleanPhone,
            step: "list_reminders",
            context: { user_id: userId, reminders: matched },
            expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
          });

          await sendWhatsAppMessage(cleanPhone,
            `🔍 Encontrei ${matched.length} lembretes com "${action.search}":\n\n${list}\n\nResponda com o *número* para gerenciar.`
          );
        }
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // ── Detect add_goal action ──
      const addGoalAction = extractActionJson(aiResponse, "add_goal");
      if (addGoalAction) {
        const action = addGoalAction;
        const { error } = await supabaseAdmin.from("financial_goals").insert({
          user_id: userId,
          name: action.name,
          target_amount: Number(action.target_amount),
          current_amount: 0,
          deadline: action.deadline || null,
          color: action.color || "#10b981",
        });
        if (error) {
          await sendWhatsAppMessage(cleanPhone, `❌ Erro ao criar meta: ${error.message}`);
        } else {
          await sendWhatsAppMessage(cleanPhone,
            `🎯 *Meta criada com sucesso!*\n\n` +
            `📝 *Nome:* ${action.name}\n` +
            `💰 *Valor alvo:* R$ ${Number(action.target_amount).toFixed(2)}\n` +
            (action.deadline ? `📅 *Prazo:* ${new Date(action.deadline + "T12:00:00").toLocaleDateString("pt-BR")}\n` : "") +
            `\n_Brave IA - Seu assessor financeiro 🤖_`
          );
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect deposit_goal action ──
      const depositGoalAction = extractActionJson(aiResponse, "deposit_goal");
      if (depositGoalAction) {
        const action = depositGoalAction;
        const searchTerm = (action.search || "").toLowerCase();
        const { data: goals } = await supabaseAdmin.from("financial_goals").select("*").eq("user_id", userId);
        const matched = (goals || []).find((g: any) => g.name.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei a meta "${action.search}". Envie _"minhas metas"_ para ver a lista.`);
        } else {
          const newAmount = Number(matched.current_amount) + Number(action.amount);
          await supabaseAdmin.from("financial_goals").update({ current_amount: newAmount }).eq("id", matched.id);
          const pct = ((newAmount / Number(matched.target_amount)) * 100).toFixed(0);
          const remaining = Number(matched.target_amount) - newAmount;
          await sendWhatsAppMessage(cleanPhone,
            `💰 *Aporte registrado!*\n\n` +
            `🎯 *${matched.name}*\n` +
            `➕ Aporte: R$ ${Number(action.amount).toFixed(2)}\n` +
            `📊 Progresso: R$ ${newAmount.toFixed(2)} / R$ ${Number(matched.target_amount).toFixed(2)} (${pct}%)\n` +
            (remaining > 0 ? `💪 Faltam: R$ ${remaining.toFixed(2)}\n` : `🎉 *Meta atingida!*\n`) +
            `\n_Brave IA - Seu assessor financeiro 🤖_`
          );
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect edit_goal action ──
      const editGoalAction = extractActionJson(aiResponse, "edit_goal");
      if (editGoalAction) {
        const action = editGoalAction;
        const searchTerm = (action.search || "").toLowerCase();
        const { data: goals } = await supabaseAdmin.from("financial_goals").select("*").eq("user_id", userId);
        const matched = (goals || []).find((g: any) => g.name.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei a meta "${action.search}".`);
        } else {
          const updateData: any = {};
          if (action.field === "name") updateData.name = action.new_value;
          else if (action.field === "target_amount") updateData.target_amount = Number(action.new_value);
          else if (action.field === "deadline") updateData.deadline = action.new_value;
          else if (action.field === "color") updateData.color = action.new_value;
          if (Object.keys(updateData).length > 0) {
            await supabaseAdmin.from("financial_goals").update(updateData).eq("id", matched.id);
            await sendWhatsAppMessage(cleanPhone, `✅ Meta *${matched.name}* atualizada!\n\n_Brave IA - Seu assessor financeiro 🤖_`);
          }
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect delete_goal action ──
      const deleteGoalAction = extractActionJson(aiResponse, "delete_goal");
      if (deleteGoalAction) {
        const action = deleteGoalAction;
        const searchTerm = (action.search || "").toLowerCase();
        const { data: goals } = await supabaseAdmin.from("financial_goals").select("*").eq("user_id", userId);
        const matched = (goals || []).find((g: any) => g.name.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei a meta "${action.search}".`);
        } else {
          await supabaseAdmin.from("financial_goals").delete().eq("id", matched.id);
          await sendWhatsAppMessage(cleanPhone, `🗑️ Meta *${matched.name}* excluída!\n\n_Brave IA - Seu assessor financeiro 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect list_goals action ──
      const listGoalsAction = extractActionJson(aiResponse, "list_goals");
      if (listGoalsAction) {
        const { data: goals } = await supabaseAdmin.from("financial_goals").select("*").eq("user_id", userId).order("created_at");
        if (!goals || goals.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📭 Você não tem metas cadastradas.\n\nPara criar: _\"criar meta de viagem de 5000\"_\n\n_Brave IA 🤖_");
        } else {
          const list = goals.map((g: any, i: number) => {
            const pct = ((Number(g.current_amount) / Number(g.target_amount)) * 100).toFixed(0);
            const dl = g.deadline ? ` · até ${new Date(g.deadline + "T12:00:00").toLocaleDateString("pt-BR")}` : "";
            return `${i + 1}. 🎯 *${g.name}*\n   R$ ${Number(g.current_amount).toFixed(2)} / R$ ${Number(g.target_amount).toFixed(2)} (${pct}%)${dl}`;
          }).join("\n\n");
          await sendWhatsAppMessage(cleanPhone, `🎯 *Suas Metas (${goals.length}):*\n\n${list}\n\n💡 _Aportar: "depositar 200 na meta X"_\n_Brave IA 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect add_wallet action ──
      const addWalletAction = extractActionJson(aiResponse, "add_wallet");
      if (addWalletAction) {
        const action = addWalletAction;
        const { error } = await supabaseAdmin.from("wallets").insert({
          user_id: userId,
          name: action.name,
          type: action.type || "checking",
          balance: Number(action.balance || 0),
        });
        if (error) {
          await sendWhatsAppMessage(cleanPhone, `❌ Erro ao criar carteira: ${error.message}`);
        } else {
          const typeNames: Record<string, string> = { checking: "Corrente", savings: "Poupança", cash: "Dinheiro", investment: "Investimento" };
          await sendWhatsAppMessage(cleanPhone,
            `💳 *Carteira criada!*\n\n` +
            `📝 *${action.name}*\n` +
            `🏷️ Tipo: ${typeNames[action.type] || action.type}\n` +
            `💰 Saldo: R$ ${Number(action.balance || 0).toFixed(2)}\n\n_Brave IA 🤖_`
          );
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect edit_wallet action ──
      const editWalletAction = extractActionJson(aiResponse, "edit_wallet");
      if (editWalletAction) {
        const action = editWalletAction;
        const searchTerm = (action.search || "").toLowerCase();
        const { data: wList } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId);
        const matched = (wList || []).find((w: any) => w.name.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei a carteira "${action.search}".`);
        } else {
          const updateData: any = {};
          if (action.field === "name") updateData.name = action.new_value;
          else if (action.field === "balance") updateData.balance = Number(action.new_value);
          else if (action.field === "type") updateData.type = action.new_value;
          if (Object.keys(updateData).length > 0) {
            await supabaseAdmin.from("wallets").update(updateData).eq("id", matched.id);
            await sendWhatsAppMessage(cleanPhone, `✅ Carteira *${matched.name}* atualizada!\n\n_Brave IA 🤖_`);
          }
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect list_wallets action ──
      const listWalletsAction = extractActionJson(aiResponse, "list_wallets");
      if (listWalletsAction) {
        const { data: wList } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId).order("created_at");
        if (!wList || wList.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📭 Nenhuma carteira cadastrada.\n\nPara criar: _\"criar carteira Nubank\"_\n\n_Brave IA 🤖_");
        } else {
          const total = wList.reduce((s: number, w: any) => s + Number(w.balance), 0);
          const typeNames: Record<string, string> = { checking: "Corrente", savings: "Poupança", cash: "Dinheiro", investment: "Investimento" };
          const list = wList.map((w: any, i: number) => `${i + 1}. 💳 *${w.name}* (${typeNames[w.type] || w.type})\n   Saldo: R$ ${Number(w.balance).toFixed(2)}`).join("\n\n");
          await sendWhatsAppMessage(cleanPhone, `💳 *Suas Carteiras:*\n\n${list}\n\n💰 *Saldo total: R$ ${total.toFixed(2)}*\n\n_Brave IA 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect add_category action ──
      const addCategoryAction = extractActionJson(aiResponse, "add_category");
      if (addCategoryAction) {
        const action = addCategoryAction;
        const { error } = await supabaseAdmin.from("categories").insert({
          user_id: userId,
          name: action.name,
          icon: action.icon || "tag",
          color: action.color || "#6b7280",
          budget_limit: action.budget_limit ? Number(action.budget_limit) : null,
        });
        if (error) {
          await sendWhatsAppMessage(cleanPhone, `❌ Erro ao criar categoria: ${error.message}`);
        } else {
          await sendWhatsAppMessage(cleanPhone,
            `📂 *Categoria criada!*\n\n` +
            `📝 *${action.name}*\n` +
            (action.budget_limit ? `💰 Orçamento: R$ ${Number(action.budget_limit).toFixed(2)}\n` : "") +
            `\n_Brave IA 🤖_`
          );
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect edit_category action ──
      const editCategoryAction = extractActionJson(aiResponse, "edit_category");
      if (editCategoryAction) {
        const action = editCategoryAction;
        const searchTerm = (action.search || "").toLowerCase();
        const matched = (categories || []).find((c: any) => c.name.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei a categoria "${action.search}".`);
        } else {
          const updateData: any = {};
          if (action.field === "name") updateData.name = action.new_value;
          else if (action.field === "budget_limit") updateData.budget_limit = Number(action.new_value);
          else if (action.field === "color") updateData.color = action.new_value;
          else if (action.field === "icon") updateData.icon = action.new_value;
          if (Object.keys(updateData).length > 0) {
            await supabaseAdmin.from("categories").update(updateData).eq("id", (matched as any).id);
            await sendWhatsAppMessage(cleanPhone, `✅ Categoria *${(matched as any).name}* atualizada!\n\n_Brave IA 🤖_`);
          }
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect list_categories action ──
      const listCategoriesAction = extractActionJson(aiResponse, "list_categories");
      if (listCategoriesAction) {
        if (!categories || categories.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📭 Nenhuma categoria cadastrada.\n\n_Brave IA 🤖_");
        } else {
          const list = categories.map((c: any, i: number) => {
            const budget = c.budget_limit ? ` · Limite: R$ ${Number(c.budget_limit).toFixed(2)}` : "";
            return `${i + 1}. 📂 *${c.name}*${budget}`;
          }).join("\n");
          await sendWhatsAppMessage(cleanPhone, `📂 *Suas Categorias (${categories.length}):*\n\n${list}\n\n_Brave IA 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect add_card action ──
      const addCardAction = extractActionJson(aiResponse, "add_card");
      if (addCardAction) {
        const action = addCardAction;
        const { error } = await supabaseAdmin.from("cards").insert({
          user_id: userId,
          name: action.name,
          brand: action.brand || null,
          last_4_digits: action.last_4_digits || null,
          credit_limit: action.credit_limit ? Number(action.credit_limit) : null,
          due_day: action.due_day ? Number(action.due_day) : null,
        });
        if (error) {
          await sendWhatsAppMessage(cleanPhone, `❌ Erro ao criar cartão: ${error.message}`);
        } else {
          await sendWhatsAppMessage(cleanPhone,
            `💳 *Cartão adicionado!*\n\n` +
            `📝 *${action.name}*${action.brand ? ` (${action.brand})` : ""}\n` +
            (action.last_4_digits ? `🔢 Final: ****${action.last_4_digits}\n` : "") +
            (action.credit_limit ? `💰 Limite: R$ ${Number(action.credit_limit).toFixed(2)}\n` : "") +
            (action.due_day ? `📅 Vencimento: dia ${action.due_day}\n` : "") +
            `\n_Brave IA 🤖_`
          );
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect edit_card action ──
      const editCardAction = extractActionJson(aiResponse, "edit_card");
      if (editCardAction) {
        const action = editCardAction;
        const searchTerm = (action.search || "").toLowerCase();
        const { data: cardList } = await supabaseAdmin.from("cards").select("*").eq("user_id", userId);
        const matched = (cardList || []).find((c: any) => c.name.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei o cartão "${action.search}".`);
        } else {
          const updateData: any = {};
          if (action.field === "name") updateData.name = action.new_value;
          else if (action.field === "brand") updateData.brand = action.new_value;
          else if (action.field === "credit_limit") updateData.credit_limit = Number(action.new_value);
          else if (action.field === "due_day") updateData.due_day = Number(action.new_value);
          else if (action.field === "last_4_digits") updateData.last_4_digits = action.new_value;
          if (Object.keys(updateData).length > 0) {
            await supabaseAdmin.from("cards").update(updateData).eq("id", matched.id);
            await sendWhatsAppMessage(cleanPhone, `✅ Cartão *${matched.name}* atualizado!\n\n_Brave IA 🤖_`);
          }
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect list_cards action ──
      const listCardsAction = extractActionJson(aiResponse, "list_cards");
      if (listCardsAction) {
        const { data: cardList } = await supabaseAdmin.from("cards").select("*").eq("user_id", userId).order("created_at");
        if (!cardList || cardList.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📭 Nenhum cartão cadastrado.\n\nPara adicionar: _\"adicionar cartão Nubank Visa limite 5000 vence dia 10\"_\n\n_Brave IA 🤖_");
        } else {
          const list = cardList.map((c: any, i: number) => {
            const digits = c.last_4_digits ? ` (****${c.last_4_digits})` : "";
            const limit = c.credit_limit ? ` · Limite: R$ ${Number(c.credit_limit).toFixed(2)}` : "";
            const due = c.due_day ? ` · Venc: dia ${c.due_day}` : "";
            return `${i + 1}. 💳 *${c.name}*${digits}${c.brand ? ` ${c.brand}` : ""}${limit}${due}`;
          }).join("\n");
          await sendWhatsAppMessage(cleanPhone, `💳 *Seus Cartões (${cardList.length}):*\n\n${list}\n\n_Brave IA 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect delete_wallet action ──
      const deleteWalletAction = extractActionJson(aiResponse, "delete_wallet");
      if (deleteWalletAction) {
        const action = deleteWalletAction;
        const searchTerm = (action.search || "").toLowerCase();
        const { data: wList } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId);
        const matched = (wList || []).find((w: any) => w.name.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei a carteira "${action.search}".`);
        } else {
          await supabaseAdmin.from("wallets").delete().eq("id", matched.id);
          await sendWhatsAppMessage(cleanPhone, `🗑️ Carteira *${matched.name}* excluída!\n\n_Brave IA 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect delete_category action ──
      const deleteCategoryAction = extractActionJson(aiResponse, "delete_category");
      if (deleteCategoryAction) {
        const action = deleteCategoryAction;
        const searchTerm = (action.search || "").toLowerCase();
        const matched = (categories || []).find((c: any) => c.name.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei a categoria "${action.search}".`);
        } else {
          await supabaseAdmin.from("categories").delete().eq("id", (matched as any).id);
          await sendWhatsAppMessage(cleanPhone, `🗑️ Categoria *${(matched as any).name}* excluída!\n\n_Brave IA 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect delete_card action ──
      const deleteCardAction = extractActionJson(aiResponse, "delete_card");
      if (deleteCardAction) {
        const action = deleteCardAction;
        const searchTerm = (action.search || "").toLowerCase();
        const { data: cList } = await supabaseAdmin.from("cards").select("*").eq("user_id", userId);
        const matched = (cList || []).find((c: any) => c.name.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei o cartão "${action.search}".`);
        } else {
          await supabaseAdmin.from("cards").delete().eq("id", matched.id);
          await sendWhatsAppMessage(cleanPhone, `🗑️ Cartão *${matched.name}* excluído!\n\n_Brave IA 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect delete_transaction action ──
      const deleteTransactionAction = extractActionJson(aiResponse, "delete_transaction");
      if (deleteTransactionAction) {
        const action = deleteTransactionAction;
        const searchTerm = (action.search || "").toLowerCase();
        const { data: txList } = await supabaseAdmin.from("transactions").select("id, description, amount, type, date, wallet_id")
          .eq("user_id", userId).order("date", { ascending: false }).limit(20);
        const matched = (txList || []).find((t: any) => t.description.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei a transação "${action.search}".`);
        } else {
          // Reverse wallet balance change
          if (matched.wallet_id) {
            const { data: w } = await supabaseAdmin.from("wallets").select("id, balance").eq("id", matched.wallet_id).maybeSingle();
            if (w) {
              const change = matched.type === "income" ? -Number(matched.amount) : Number(matched.amount);
              await supabaseAdmin.from("wallets").update({ balance: Number(w.balance) + change }).eq("id", w.id);
            }
          }
          await supabaseAdmin.from("transactions").delete().eq("id", matched.id);
          const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
          await sendWhatsAppMessage(cleanPhone,
            `🗑️ Transação excluída!\n\n` +
            `📝 ${matched.description}\n` +
            `💵 ${fmt(Number(matched.amount))}\n` +
            `📅 ${new Date(matched.date + "T12:00:00").toLocaleDateString("pt-BR")}\n\n` +
            `_Saldo da carteira atualizado automaticamente._\n_Brave IA 🤖_`
          );
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect edit_transaction action ──
      const editTransactionAction = extractActionJson(aiResponse, "edit_transaction");
      if (editTransactionAction) {
        const action = editTransactionAction;
        const searchTerm = (action.search || "").toLowerCase();
        const { data: txList } = await supabaseAdmin.from("transactions").select("id, description, amount, type, date, wallet_id, category_id")
          .eq("user_id", userId).order("date", { ascending: false }).limit(20);
        const matched = (txList || []).find((t: any) => t.description.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei a transação "${action.search}".`);
        } else {
          const updateData: any = {};
          if (action.field === "amount") {
            const oldAmount = Number(matched.amount);
            const newAmount = Number(action.new_value);
            updateData.amount = newAmount;
            if (matched.wallet_id) {
              const { data: w } = await supabaseAdmin.from("wallets").select("id, balance").eq("id", matched.wallet_id).maybeSingle();
              if (w) {
                const diff = matched.type === "income" ? (newAmount - oldAmount) : (oldAmount - newAmount);
                await supabaseAdmin.from("wallets").update({ balance: Number(w.balance) + diff }).eq("id", w.id);
              }
            }
          } else if (action.field === "description") updateData.description = action.new_value;
          else if (action.field === "category") {
            const matchedCat = (categories || []).find((c: any) => c.name.toLowerCase().includes(String(action.new_value).toLowerCase()));
            if (matchedCat) updateData.category_id = (matchedCat as any).id;
          } else if (action.field === "type") updateData.type = action.new_value;
          if (Object.keys(updateData).length > 0) {
            await supabaseAdmin.from("transactions").update(updateData).eq("id", matched.id);
            await sendWhatsAppMessage(cleanPhone, `✅ Transação *${matched.description}* atualizada!\n\n_Brave IA 🤖_`);
          }
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect list_transactions action ──
      const listTransactionsAction = extractActionJson(aiResponse, "list_transactions");
      if (listTransactionsAction) {
        const { data: txList } = await supabaseAdmin.from("transactions").select("description, amount, type, date, categories(name)")
          .eq("user_id", userId).order("date", { ascending: false }).limit(10);
        if (!txList || txList.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📭 Nenhuma transação recente.\n\n_Brave IA 🤖_");
        } else {
          const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
          const list = txList.map((t: any, i: number) => {
            const emoji = t.type === "income" ? "💰" : "💸";
            const cat = (t as any).categories?.name || "";
            const dt = new Date(t.date + "T12:00:00").toLocaleDateString("pt-BR");
            return `${i + 1}. ${emoji} *${t.description}* — ${fmt(Number(t.amount))} · ${dt}${cat ? ` · ${cat}` : ""}`;
          }).join("\n");
          await sendWhatsAppMessage(cleanPhone, `📋 *Últimas transações:*\n\n${list}\n\n_Brave IA 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect list_recurring action ──
      const listRecurringAction = extractActionJson(aiResponse, "list_recurring");
      if (listRecurringAction) {
        const { data: recList } = await supabaseAdmin.from("recurring_transactions").select("*").eq("user_id", userId).eq("is_active", true).order("day_of_month");
        if (!recList || recList.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📭 Nenhuma recorrência ativa.\n\n_Brave IA 🤖_");
        } else {
          const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
          const total = recList.reduce((s: number, r: any) => s + Number(r.amount), 0);
          const list = recList.map((r: any, i: number) => {
            const emoji = r.type === "income" ? "💰" : "💸";
            return `${i + 1}. ${emoji} *${r.description}* — ${fmt(Number(r.amount))} · dia ${r.day_of_month}`;
          }).join("\n");
          await sendWhatsAppMessage(cleanPhone, `🔄 *Recorrências ativas (${recList.length}):*\n\n${list}\n\n💸 *Total mensal: ${fmt(total)}*\n\n_Brave IA 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect edit_recurring action ──
      const editRecurringAction = extractActionJson(aiResponse, "edit_recurring");
      if (editRecurringAction) {
        const action = editRecurringAction;
        const searchTerm = (action.search || "").toLowerCase();
        const { data: recList } = await supabaseAdmin.from("recurring_transactions").select("*").eq("user_id", userId).eq("is_active", true);
        const matched = (recList || []).find((r: any) => r.description.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei a recorrência "${action.search}".`);
        } else {
          const updateData: any = {};
          if (action.field === "amount") updateData.amount = Number(action.new_value);
          else if (action.field === "description") updateData.description = action.new_value;
          else if (action.field === "day_of_month") updateData.day_of_month = Number(action.new_value);
          if (Object.keys(updateData).length > 0) {
            await supabaseAdmin.from("recurring_transactions").update(updateData).eq("id", matched.id);
            await sendWhatsAppMessage(cleanPhone, `✅ Recorrência *${matched.description}* atualizada!\n\n_Brave IA 🤖_`);
          }
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect delete_recurring action ──
      const deleteRecurringAction = extractActionJson(aiResponse, "delete_recurring");
      if (deleteRecurringAction) {
        const action = deleteRecurringAction;
        const searchTerm = (action.search || "").toLowerCase();
        const { data: recList } = await supabaseAdmin.from("recurring_transactions").select("*").eq("user_id", userId).eq("is_active", true);
        const matched = (recList || []).find((r: any) => r.description.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei a recorrência "${action.search}".`);
        } else {
          await supabaseAdmin.from("recurring_transactions").update({ is_active: false }).eq("id", matched.id);
          await sendWhatsAppMessage(cleanPhone, `🗑️ Recorrência *${matched.description}* desativada!\n\n_Ela não será mais gerada nos próximos meses._\n\n_Brave IA 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect transfer_wallet action ──
      const transferWalletAction = extractActionJson(aiResponse, "transfer_wallet");
      if (transferWalletAction) {
        const action = transferWalletAction;
        const { data: wList } = await supabaseAdmin.from("wallets").select("*").eq("user_id", userId);
        const from = (wList || []).find((w: any) => w.name.toLowerCase().includes((action.from || "").toLowerCase()));
        const to = (wList || []).find((w: any) => w.name.toLowerCase().includes((action.to || "").toLowerCase()));
        const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
        if (!from) {
          await sendWhatsAppMessage(cleanPhone, `❓ Carteira de origem "${action.from}" não encontrada.`);
        } else if (!to) {
          await sendWhatsAppMessage(cleanPhone, `❓ Carteira de destino "${action.to}" não encontrada.`);
        } else {
          const amount = Number(action.amount);
          if (Number(from.balance) < amount) {
            await sendWhatsAppMessage(cleanPhone, `❌ Saldo insuficiente em *${from.name}* (${fmt(Number(from.balance))}).`);
          } else {
            await supabaseAdmin.from("wallets").update({ balance: Number(from.balance) - amount }).eq("id", from.id);
            await supabaseAdmin.from("wallets").update({ balance: Number(to.balance) + amount }).eq("id", to.id);
            await sendWhatsAppMessage(cleanPhone,
              `🔄 *Transferência realizada!*\n\n` +
              `💳 ${from.name} → ${to.name}\n` +
              `💵 ${fmt(amount)}\n\n` +
              `📊 *${from.name}:* ${fmt(Number(from.balance) - amount)}\n` +
              `📊 *${to.name}:* ${fmt(Number(to.balance) + amount)}\n\n_Brave IA 🤖_`
            );
          }
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect update_profile action ──
      const updateProfileAction = extractActionJson(aiResponse, "update_profile");
      if (updateProfileAction) {
        const action = updateProfileAction;
        const updateData: any = {};
        if (action.field === "monthly_income") updateData.monthly_income = Number(action.new_value);
        else if (action.field === "display_name") updateData.display_name = action.new_value;
        if (Object.keys(updateData).length > 0) {
          await supabaseAdmin.from("profiles").update(updateData).eq("id", userId);
          const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
          const label = action.field === "monthly_income" 
            ? `Renda mensal atualizada para *${fmt(Number(action.new_value))}*` 
            : `Nome atualizado para *${action.new_value}*`;
          await sendWhatsAppMessage(cleanPhone, `✅ ${label}\n\n_Brave IA 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect pay_bill action ──
      const payBillAction = extractActionJson(aiResponse, "pay_bill");
      if (payBillAction) {
        const action = payBillAction;
        const searchTerm = (action.search || "").toLowerCase();
        const { data: bills } = await supabaseAdmin.from("transactions").select("id, description, amount, type, wallet_id, due_date")
          .eq("user_id", userId).eq("is_paid", false).eq("type", "expense").order("due_date").limit(20);
        const matched = (bills || []).find((t: any) => t.description.toLowerCase().includes(searchTerm));
        if (!matched) {
          await sendWhatsAppMessage(cleanPhone, `❓ Não encontrei a conta "${action.search}" entre as pendentes.`);
        } else {
          await supabaseAdmin.from("transactions").update({ is_paid: true }).eq("id", matched.id);
          if (matched.wallet_id) {
            const { data: w } = await supabaseAdmin.from("wallets").select("id, balance").eq("id", matched.wallet_id).maybeSingle();
            if (w) await supabaseAdmin.from("wallets").update({ balance: Number(w.balance) - Number(matched.amount) }).eq("id", w.id);
          }
          const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
          await sendWhatsAppMessage(cleanPhone, `✅ Conta *${matched.description}* (${fmt(Number(matched.amount))}) marcada como paga!\n\n_Brave IA 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect list_bills action ──
      const listBillsAction = extractActionJson(aiResponse, "list_bills");
      if (listBillsAction) {
        const { data: bills } = await supabaseAdmin.from("transactions").select("description, amount, due_date, categories(name)")
          .eq("user_id", userId).eq("is_paid", false).eq("type", "expense").order("due_date").limit(15);
        if (!bills || bills.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "✅ Nenhuma conta pendente! Tudo em dia! 🎉\n\n_Brave IA 🤖_");
        } else {
          const fmt = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
          const total = bills.reduce((s: number, t: any) => s + Number(t.amount), 0);
          const list = bills.map((t: any, i: number) => {
            const due = t.due_date ? new Date(t.due_date + "T12:00:00").toLocaleDateString("pt-BR") : "sem vencimento";
            return `${i + 1}. 📋 *${t.description}* — ${fmt(Number(t.amount))} · vence ${due}`;
          }).join("\n");
          await sendWhatsAppMessage(cleanPhone, `📋 *Contas a pagar:*\n\n${list}\n\n💸 *Total: ${fmt(total)}*\n\n_Brave IA 🤖_`);
        }
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect delete_all_reminders — show numbered list ──
      const bulkDeleteReminders = extractActionJson(aiResponse, "delete_all_reminders");
      if (bulkDeleteReminders) {
        const { data: allReminders } = await supabaseAdmin
          .from("reminders")
          .select("id, title, event_at, recurrence, is_active")
          .eq("user_id", userId)
          .eq("is_active", true)
          .order("event_at", { ascending: true });

        if (!allReminders || allReminders.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📭 Você não tem nenhum lembrete ativo para apagar.");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const list = allReminders.map((r: any, i: number) => {
          const dt = new Date(r.event_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
          return `${i + 1}. 🔔 *${r.title}* — ${dt}`;
        }).join("\n");

        await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone,
          step: "select_reminder_to_delete",
          context: { user_id: userId, reminders_list: allReminders },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });

        await sendWhatsAppMessage(cleanPhone,
          `🗑️ *Qual lembrete deseja apagar?*\n\n${list}\n\n0️⃣ *Todos* — apagar todos os lembretes\n❌ *Cancelar* — sair sem apagar`
        );
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect delete_all_transactions — show numbered list ──
      const bulkDeleteTx = extractActionJson(aiResponse, "delete_all_transactions");
      if (bulkDeleteTx) {
        const { data: allTx } = await supabaseAdmin.from("transactions")
          .select("id, description, amount, type, wallet_id, date")
          .eq("user_id", userId).order("date", { ascending: false }).limit(50);
        if (!allTx || allTx.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📭 Você não tem transações para apagar.");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const fmtT = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const list = allTx.map((t: any, i: number) => {
          const icon = t.type === "income" ? "📈" : "📉";
          return `${i + 1}. ${icon} *${t.description}* — ${fmtT(Number(t.amount))}`;
        }).join("\n");
        await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone, step: "select_transaction_to_delete",
          context: { user_id: userId, items_list: allTx },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        await sendWhatsAppMessage(cleanPhone, `🗑️ *Qual transação deseja apagar?*\n\n${list}\n\n0️⃣ *Todas* — apagar todas\n❌ *Cancelar* — sair`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect delete_all_cards — show numbered list ──
      const bulkDeleteCards = extractActionJson(aiResponse, "delete_all_cards");
      if (bulkDeleteCards) {
        const { data: allCards } = await supabaseAdmin.from("cards")
          .select("id, name, brand, last_4_digits, credit_limit")
          .eq("user_id", userId).order("name");
        if (!allCards || allCards.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📭 Você não tem cartões para apagar.");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const list = allCards.map((c: any, i: number) => {
          const digits = c.last_4_digits ? ` (****${c.last_4_digits})` : "";
          return `${i + 1}. 💳 *${c.name}*${digits}`;
        }).join("\n");
        await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone, step: "select_card_to_delete",
          context: { user_id: userId, items_list: allCards },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        await sendWhatsAppMessage(cleanPhone, `🗑️ *Qual cartão deseja apagar?*\n\n${list}\n\n0️⃣ *Todos* — apagar todos\n❌ *Cancelar* — sair`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect delete_all_wallets — show numbered list ──
      const bulkDeleteWallets = extractActionJson(aiResponse, "delete_all_wallets");
      if (bulkDeleteWallets) {
        const { data: allWallets } = await supabaseAdmin.from("wallets")
          .select("id, name, balance, type")
          .eq("user_id", userId).order("name");
        if (!allWallets || allWallets.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📭 Você não tem carteiras para apagar.");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const fmtW = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const list = allWallets.map((w: any, i: number) => `${i + 1}. 💳 *${w.name}* — ${fmtW(Number(w.balance))}`).join("\n");
        await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone, step: "select_wallet_to_delete",
          context: { user_id: userId, items_list: allWallets },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        await sendWhatsAppMessage(cleanPhone, `🗑️ *Qual carteira deseja apagar?*\n\n${list}\n\n0️⃣ *Todas* — apagar todas\n❌ *Cancelar* — sair`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect delete_all_goals — show numbered list ──
      const bulkDeleteGoals = extractActionJson(aiResponse, "delete_all_goals");
      if (bulkDeleteGoals) {
        const { data: allGoals } = await supabaseAdmin.from("financial_goals")
          .select("id, name, target_amount, current_amount")
          .eq("user_id", userId).order("name");
        if (!allGoals || allGoals.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📭 Você não tem metas para apagar.");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const fmtG = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const list = allGoals.map((g: any, i: number) => {
          const pct = Math.round((Number(g.current_amount) / Number(g.target_amount)) * 100);
          return `${i + 1}. 🎯 *${g.name}* — ${pct}% (${fmtG(Number(g.current_amount))}/${fmtG(Number(g.target_amount))})`;
        }).join("\n");
        await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone, step: "select_goal_to_delete",
          context: { user_id: userId, items_list: allGoals },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        await sendWhatsAppMessage(cleanPhone, `🗑️ *Qual meta deseja apagar?*\n\n${list}\n\n0️⃣ *Todas* — apagar todas\n❌ *Cancelar* — sair`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect delete_all_categories — show numbered list ──
      const bulkDeleteCats = extractActionJson(aiResponse, "delete_all_categories");
      if (bulkDeleteCats) {
        const { data: allCats } = await supabaseAdmin.from("categories")
          .select("id, name, icon")
          .eq("user_id", userId).order("name");
        if (!allCats || allCats.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📭 Você não tem categorias para apagar.");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const list = allCats.map((c: any, i: number) => `${i + 1}. 📂 *${c.name}*`).join("\n");
        await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone, step: "select_category_to_delete",
          context: { user_id: userId, items_list: allCats },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        await sendWhatsAppMessage(cleanPhone, `🗑️ *Qual categoria deseja apagar?*\n\n${list}\n\n0️⃣ *Todas* — apagar todas\n❌ *Cancelar* — sair`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect delete_all_recurring — show numbered list ──
      const bulkDeleteRec = extractActionJson(aiResponse, "delete_all_recurring");
      if (bulkDeleteRec) {
        const { data: allRec } = await supabaseAdmin.from("recurring_transactions")
          .select("id, description, amount, type, day_of_month")
          .eq("user_id", userId).eq("is_active", true).order("description");
        if (!allRec || allRec.length === 0) {
          await sendWhatsAppMessage(cleanPhone, "📭 Você não tem recorrências para apagar.");
          return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        const fmtR = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const list = allRec.map((r: any, i: number) => {
          const icon = r.type === "income" ? "📈" : "📉";
          return `${i + 1}. ${icon} *${r.description}* — ${fmtR(Number(r.amount))}/mês (dia ${r.day_of_month})`;
        }).join("\n");
        await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone, step: "select_recurring_to_delete",
          context: { user_id: userId, items_list: allRec },
          expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        });
        await sendWhatsAppMessage(cleanPhone, `🗑️ *Qual recorrência deseja apagar?*\n\n${list}\n\n0️⃣ *Todas* — apagar todas\n❌ *Cancelar* — sair`);
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ── Detect reset_all_data — direct confirmation (no list) ──
      const resetAllAction = extractActionJson(aiResponse, "reset_all_data");
      if (resetAllAction) {
        await supabaseAdmin.from("whatsapp_sessions").delete().eq("phone_number", cleanPhone);
        await supabaseAdmin.from("whatsapp_sessions").insert({
          phone_number: cleanPhone, step: "confirm_bulk_delete",
          context: { user_id: userId, delete_target: "all" },
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        });
        await sendWhatsAppButtons(cleanPhone,
          `⚠️ *ATENÇÃO!* Você tem certeza que deseja apagar *TODOS os dados financeiros*?\n\n⚠️ Esta ação *NÃO pode ser desfeita*!`,
          [{ id: "BULK_DELETE_YES", text: "✅ Sim, apagar tudo" }, { id: "BULK_DELETE_NO", text: "❌ Não, cancelar" }], "");
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

    } catch (parseErr) {
      console.log("Response is text, not action");
    }

    // Detect when bot doesn't understand and offer quick-command suggestions
    const notUnderstoodPatterns = [
      /não entendi/i, /não consegui entender/i, /pode reformular/i,
      /não reconheci/i, /tente novamente/i, /não foi possível/i,
      /não compreendi/i, /mensagem não clara/i, /poderia explicar/i,
    ];
    const isConfused = notUnderstoodPatterns.some(p => p.test(replyText));

    if (isConfused) {
      await sendWhatsAppButtons(
        cleanPhone,
        replyText + "\n\n💡 *Tente um desses comandos rápidos:*",
        [
          { id: "gastei", text: "💸 Registrar gasto" },
          { id: "resumo", text: "📊 Ver resumo" },
          { id: "conferir", text: "📋 Conferir contas" },
        ],
        "Ou envie 'ajuda' para ver todos os comandos"
      );
    } else {
      await sendWhatsAppMessage(cleanPhone, replyText);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
