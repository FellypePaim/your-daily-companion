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
  if (!url || !key || !instance) throw new Error("Evolution API credentials not configured");

  const resp = await fetch(`${url}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ number: phone, text: message }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    console.error("Evolution API send error:", resp.status, t);
  }
  return resp;
}

async function sendWhatsAppButtons(
  phone: string,
  body: string,
  buttons: { id: string; text: string }[],
  footer?: string
) {
  const fallback = body + (footer ? `\n\n${footer}` : "") +
    `\n\n${buttons.map((b) => b.text).join(" | ")}`;
  return sendWhatsAppMessage(phone, fallback);
}

// Parse date/time expressions in Brazilian Portuguese
// Returns ISO string or null
function parseDateTimeBR(text: string): Date | null {
  const now = new Date();
  const lower = text.toLowerCase().trim();

  // Extract time pattern HH:mm or HHh or HHhMM
  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?h(?:(\d{2}))?|(\d{1,2}):(\d{2})/);
  let hour = 0, minute = 0, hasTime = false;
  if (timeMatch) {
    hasTime = true;
    if (timeMatch[4] !== undefined) { // HH:MM format
      hour = parseInt(timeMatch[4]);
      minute = parseInt(timeMatch[5]);
    } else { // HHh or HHhMM
      hour = parseInt(timeMatch[1]);
      minute = parseInt(timeMatch[3] || timeMatch[2] || "0");
    }
  }

  // Extract date
  let date = new Date(now);
  const ddmmMatch = lower.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);

  if (ddmmMatch) {
    const d = parseInt(ddmmMatch[1]);
    const m = parseInt(ddmmMatch[2]) - 1;
    const y = ddmmMatch[3]
      ? (ddmmMatch[3].length === 2 ? 2000 + parseInt(ddmmMatch[3]) : parseInt(ddmmMatch[3]))
      : now.getFullYear();
    date = new Date(y, m, d, hour, minute, 0);
  } else if (lower.includes("amanhã") || lower.includes("amanha")) {
    date = new Date(now);
    date.setDate(date.getDate() + 1);
    date.setHours(hour, minute, 0, 0);
  } else if (lower.includes("hoje")) {
    date.setHours(hour, minute, 0, 0);
  } else if (lower.includes("segunda")) {
    date = nextWeekday(now, 1, hour, minute);
  } else if (lower.includes("terça") || lower.includes("terca")) {
    date = nextWeekday(now, 2, hour, minute);
  } else if (lower.includes("quarta")) {
    date = nextWeekday(now, 3, hour, minute);
  } else if (lower.includes("quinta")) {
    date = nextWeekday(now, 4, hour, minute);
  } else if (lower.includes("sexta")) {
    date = nextWeekday(now, 5, hour, minute);
  } else if (lower.includes("sábado") || lower.includes("sabado")) {
    date = nextWeekday(now, 6, hour, minute);
  } else if (lower.includes("domingo")) {
    date = nextWeekday(now, 0, hour, minute);
  } else if (hasTime) {
    // Only time given: assume today, or tomorrow if already passed
    date.setHours(hour, minute, 0, 0);
    if (date <= now) date.setDate(date.getDate() + 1);
  } else {
    return null;
  }

  return date;
}

function nextWeekday(from: Date, weekday: number, hour: number, minute: number): Date {
  const d = new Date(from);
  const diff = (weekday - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(hour, minute, 0, 0);
  return d;
}

// Parse notify_minutes_before from text like "1h antes", "30 minutos antes", "1 dia antes"
function parseNotifyMinutes(text: string): number | null {
  const lower = text.toLowerCase();
  const diaMatch = lower.match(/(\d+)\s*dia/);
  if (diaMatch) return parseInt(diaMatch[1]) * 1440;
  const horaMatch = lower.match(/(\d+)\s*h(?:ora)?/);
  if (horaMatch) return parseInt(horaMatch[1]) * 60;
  const minMatch = lower.match(/(\d+)\s*min/);
  if (minMatch) return parseInt(minMatch[1]);
  // Shorthand: "1h", "30m", "1d"
  const shortH = lower.match(/^(\d+)h$/);
  if (shortH) return parseInt(shortH[1]) * 60;
  const shortM = lower.match(/^(\d+)m$/);
  if (shortM) return parseInt(shortM[1]);
  const shortD = lower.match(/^(\d+)d$/);
  if (shortD) return parseInt(shortD[1]) * 1440;
  return null;
}

function parseRecurrence(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(todo\s*dia|diário|diario|diariamente)\b/.test(lower)) return "daily";
  if (/\b(toda\s*semana|semanalmente|semanal)\b/.test(lower)) return "weekly";
  if (/\b(todo\s*m[eê]s|mensalmente|mensal)\b/.test(lower)) return "monthly";
  if (/\b(toda\s*(segunda|terça|quarta|quinta|sexta|s[aá]bado|domingo))\b/.test(lower)) return "weekly";
  return "none";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const now = new Date();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Find reminders due for notification ──
    const { data: reminders, error: remErr } = await supabase
      .from("reminders")
      .select("id, user_id, title, description, event_at, notify_minutes_before, recurrence")
      .eq("is_sent", false)
      .eq("is_active", true)
      .gte("event_at", now.toISOString());

    if (remErr) throw remErr;

    // Filter reminders where it's time to send notification
    const toSend = (reminders || []).filter(r => {
      const eventAt = new Date(r.event_at);
      const notifyAt = new Date(eventAt.getTime() - r.notify_minutes_before * 60 * 1000);
      return now >= notifyAt;
    });

    // Also check for WhatsApp reminder session messages (handled by webhook, but we process here)
    const userIds = [...new Set(toSend.map(r => r.user_id))];

    const phoneMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: links } = await supabase
        .from("whatsapp_links")
        .select("user_id, phone_number")
        .in("user_id", userIds)
        .eq("verified", true)
        .not("phone_number", "is", null);

      (links || []).forEach(l => phoneMap.set(l.user_id, l.phone_number));
    }

    let sent = 0;
    let skipped = 0;

    for (const reminder of toSend) {
      const phone = phoneMap.get(reminder.user_id);
      if (!phone) { skipped++; continue; }

      const eventAt = new Date(reminder.event_at);
      const fmt = (d: Date) =>
        d.toLocaleString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "numeric",
          hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
        });

      const minutesBefore = reminder.notify_minutes_before;
      let timeLabel = "";
      if (minutesBefore < 60) timeLabel = `em *${minutesBefore} minutos*`;
      else if (minutesBefore < 1440) timeLabel = `em *${minutesBefore / 60} hora(s)*`;
      else timeLabel = `em *${minutesBefore / 1440} dia(s)*`;

      const recurrenceLabel: Record<string, string> = {
        daily: "🔁 Repetição: diária",
        weekly: "🔁 Repetição: semanal",
        monthly: "🔁 Repetição: mensal",
        none: "",
      };

      const message = [
        `🔔 *Lembrete: ${reminder.title}*`,
        "",
        reminder.description ? `📝 ${reminder.description}` : null,
        `📅 Data/Hora: *${fmt(eventAt)}*`,
        `⏰ O evento começa ${timeLabel}`,
        recurrenceLabel[reminder.recurrence] || null,
        "",
        "_Brave IA - Seu assessor financeiro 🤖_",
      ].filter(l => l !== null).join("\n");

      try {
        await sendWhatsAppMessage(phone, message);

        // For recurring reminders: advance event_at and reset is_sent
        if (reminder.recurrence !== "none") {
          const next = new Date(eventAt);
          if (reminder.recurrence === "daily") next.setDate(next.getDate() + 1);
          else if (reminder.recurrence === "weekly") next.setDate(next.getDate() + 7);
          else if (reminder.recurrence === "monthly") next.setMonth(next.getMonth() + 1);

          await supabase.from("reminders").update({
            event_at: next.toISOString(),
            is_sent: false,
          }).eq("id", reminder.id);
        } else {
          await supabase.from("reminders").update({ is_sent: true }).eq("id", reminder.id);
        }

        sent++;
        console.log(`Sent reminder "${reminder.title}" to ${phone}`);
      } catch (e) {
        console.error(`Failed to send reminder to ${phone}:`, e);
        skipped++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, skipped, checked: (reminders || []).length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("send-reminders error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

export { parseDateTimeBR, parseNotifyMinutes, parseRecurrence, sendWhatsAppMessage, sendWhatsAppButtons };
