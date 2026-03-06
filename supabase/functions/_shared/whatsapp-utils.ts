export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function getEvolutionConfig() {
  const url = Deno.env.get("EVOLUTION_API_URL");
  const key = Deno.env.get("EVOLUTION_API_KEY");
  const instance = Deno.env.get("EVOLUTION_API_INSTANCE");
  if (!url || !key || !instance) throw new Error("Evolution API credentials not configured");
  return { url: url.replace(/\/$/, ""), key, instance };
}

export async function sendWhatsAppMessage(phone: string, message: string) {
  const { url, key, instance } = getEvolutionConfig();

  const resp = await fetch(`${url}/message/sendText/${instance}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: key },
    body: JSON.stringify({ number: phone, text: message }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("Evolution API send error:", resp.status, t);
    throw new Error(`Evolution API error: ${resp.status}`);
  }
  return resp.json();
}

export async function sendWhatsAppButtons(
  phone: string,
  body: string,
  buttons: { id: string; text: string }[],
  footer?: string
) {
  const { url, key, instance } = getEvolutionConfig();

  // Try Evolution API v2 native buttons
  try {
    const resp = await fetch(`${url}/message/sendButtons/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({
        number: phone,
        title: "",
        description: body,
        footer: footer || "",
        buttons: buttons.map(b => ({
          type: "reply",
          displayText: b.text,
          id: b.id,
        })),
      }),
    });

    if (resp.ok) return await resp.json();

    const errText = await resp.text();
    console.warn("sendButtons failed, falling back to text:", resp.status, errText);
  } catch (e) {
    console.warn("sendButtons error, falling back to text:", e);
  }

  // Fallback to plain text with options listed
  const fallback = body + (footer ? `\n\n${footer}` : "") +
    `\n\n${buttons.map(b => b.text).join(" | ")}`;
  return sendWhatsAppMessage(phone, fallback);
}

export function getBrazilNow(): Date {
  return new Date(new Date().getTime() - 3 * 60 * 60 * 1000);
}

export function getBrazilTodayStr(): string {
  return getBrazilNow().toISOString().slice(0, 10);
}

export function guessMimeType(mediaType?: string): string {
  if (!mediaType) return "application/octet-stream";
  if (mediaType.includes("audio") || mediaType === "ptt") return "audio/ogg";
  if (mediaType.includes("image")) return "image/jpeg";
  if (mediaType.includes("video")) return "video/mp4";
  return "application/octet-stream";
}

export function fmt(v: number): string {
  return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function isMediaMessage(message: any): boolean {
  const mediaTypes = ["media", "ptt", "audio", "image", "document", "video", "sticker"];
  return message.isMedia === true || mediaTypes.includes(message.type);
}

export function isAudioMessage(message: any): boolean {
  const mt = (message.mediaType || message.type || "").toLowerCase();
  return mt === "ptt" ||
    mt === "audio" ||
    mt.includes("audio") ||
    message.mimetype?.startsWith("audio/") ||
    message.mimetype?.includes("ogg");
}

export function isImageMessage(message: any): boolean {
  const mt = (message.mediaType || message.type || "").toLowerCase();
  return mt === "image" ||
    mt.includes("image") ||
    message.mimetype?.startsWith("image/");
}

export function parseDateTimeBR(text: string): Date | null {
  const now = getBrazilNow();
  const lower = text.toLowerCase().trim();
  const timeAmPmMatch = lower.match(/(\d{1,2}):(\d{2})\s*(am|pm)/i);
  const timeMatch = lower.match(/(\d{1,2})(?::(\d{2}))?h(?:(\d{2}))?|(\d{1,2}):(\d{2})/);
  let hour = 0, minute = 0, hasTime = false;
  if (timeAmPmMatch) {
    hasTime = true;
    hour = parseInt(timeAmPmMatch[1]);
    minute = parseInt(timeAmPmMatch[2]);
    const period = timeAmPmMatch[3].toLowerCase();
    if (period === "pm" && hour < 12) hour += 12;
    if (period === "am" && hour === 12) hour = 0;
  } else if (timeMatch) {
    hasTime = true;
    if (timeMatch[4] !== undefined) { hour = parseInt(timeMatch[4]); minute = parseInt(timeMatch[5]); }
    else { hour = parseInt(timeMatch[1]); minute = parseInt(timeMatch[3] || timeMatch[2] || "0"); }
  }
  let date = new Date(now);
  const ddmmMatch = lower.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
  if (ddmmMatch) {
    const d = parseInt(ddmmMatch[1]), m = parseInt(ddmmMatch[2]) - 1;
    const y = ddmmMatch[3] ? (ddmmMatch[3].length === 2 ? 2000 + parseInt(ddmmMatch[3]) : parseInt(ddmmMatch[3])) : now.getFullYear();
    date = new Date(y, m, d, hour, minute, 0);
  } else if (lower.includes("amanhã") || lower.includes("amanha")) {
    date.setDate(date.getDate() + 1); date.setHours(hour, minute, 0, 0);
  } else if (lower.includes("hoje")) {
    date.setHours(hour, minute, 0, 0);
  } else if (/segunda/.test(lower)) date = nextWD(now, 1, hour, minute);
  else if (/terça|terca/.test(lower)) date = nextWD(now, 2, hour, minute);
  else if (/quarta/.test(lower)) date = nextWD(now, 3, hour, minute);
  else if (/quinta/.test(lower)) date = nextWD(now, 4, hour, minute);
  else if (/sexta/.test(lower)) date = nextWD(now, 5, hour, minute);
  else if (/sábado|sabado/.test(lower)) date = nextWD(now, 6, hour, minute);
  else if (/domingo/.test(lower)) date = nextWD(now, 0, hour, minute);
  else if (hasTime) { date.setHours(hour, minute, 0, 0); if (date <= now) date.setDate(date.getDate() + 1); }
  else return null;
  return date;
}

export function nextWD(from: Date, wd: number, h: number, m: number): Date {
  const d = new Date(from); const diff = (wd - d.getDay() + 7) % 7 || 7;
  d.setDate(d.getDate() + diff); d.setHours(h, m, 0, 0); return d;
}

export function parseNotifyMinutes(text: string): number | null {
  const lower = text.toLowerCase();
  const dia = lower.match(/(\d+)\s*dia/); if (dia) return parseInt(dia[1]) * 1440;
  const hora = lower.match(/(\d+)\s*h(?:ora)?/); if (hora) return parseInt(hora[1]) * 60;
  const min = lower.match(/(\d+)\s*min/); if (min) return parseInt(min[1]);
  const sh = lower.match(/^(\d+)h$/); if (sh) return parseInt(sh[1]) * 60;
  const sm = lower.match(/^(\d+)m$/); if (sm) return parseInt(sm[1]);
  const sd = lower.match(/^(\d+)d$/); if (sd) return parseInt(sd[1]) * 1440;
  return null;
}

export function parseRecurrence(text: string): string {
  const lower = text.toLowerCase();
  if (/\b(todo\s*dia|todos\s*os\s*dias|diário|diario|diariamente)\b/.test(lower)) return "daily";
  if (/\b(toda\s*semana|todas\s*as\s*semanas|semanalmente|semanal)\b/.test(lower)) return "weekly";
  if (/\b(todo\s*m[eê]s|todos\s*os\s*meses|mensalmente|mensal)\b/.test(lower)) return "monthly";
  if (/\b(toda\s*(segunda|terça|terca|quarta|quinta|sexta|s[aá]bado|sabado|domingo))\b/.test(lower)) return "weekly";
  if (/\b(todo\s*(sábado|sabado|domingo|segunda|terça|terca|quarta|quinta|sexta))\b/.test(lower)) return "weekly";
  if (/\b(todas?\s*as?\s*(segunda|terça|terca|quarta|quinta|sexta|s[aá]bado|sabado|domingo))\b/.test(lower)) return "weekly";
  return "none";
}

export function recurrenceLabel(recurrence: string, eventAt?: string, reminderText?: string): string {
  const lower = (reminderText || "").toLowerCase();
  const dayNames: Record<number, string> = { 0: "domingo", 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sábado" };
  if (recurrence === "daily") return "🔁 Diário";
  if (recurrence === "monthly") return "🔁 Mensal";
  if (recurrence === "weekly") {
    if (/segunda/.test(lower)) return "🔁 Toda segunda-feira";
    if (/terça|terca/.test(lower)) return "🔁 Toda terça-feira";
    if (/quarta/.test(lower)) return "🔁 Toda quarta-feira";
    if (/quinta/.test(lower)) return "🔁 Toda quinta-feira";
    if (/sexta/.test(lower)) return "🔁 Toda sexta-feira";
    if (/sábado|sabado/.test(lower)) return "🔁 Todo sábado";
    if (/domingo/.test(lower)) return "🔁 Todo domingo";
    if (eventAt) {
      const wd = new Date(eventAt).getDay();
      return `🔁 Toda ${dayNames[wd] || "semana"}`;
    }
    return "🔁 Semanal";
  }
  return "";
}
