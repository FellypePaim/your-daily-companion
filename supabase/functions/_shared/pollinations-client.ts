// Pollinations AI client with Gemini fallback
// Primary: Pollinations (free, OpenAI-compatible)
// Fallback: Google Gemini direct API

import { callGemini } from "./gemini-client.ts";

const POLLINATIONS_BASE = "https://gen.pollinations.ai";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: any;
}

interface CallAIOptions {
  model?: string;
  systemPrompt: string;
  messages: { role: string; content: any }[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * Call Pollinations API directly (no retry).
 */
async function callPollinationsRaw(opts: CallAIOptions): Promise<string> {
  const model = opts.model || "openai";
  const apiKey = Deno.env.get("POLLINATIONS_API_KEY");

  const apiMessages: ChatMessage[] = [
    { role: "system", content: opts.systemPrompt },
  ];

  for (const msg of opts.messages) {
    const role = msg.role === "assistant" ? "assistant" : "user";
    apiMessages.push({ role, content: msg.content });
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const resp = await fetch(`${POLLINATIONS_BASE}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: apiMessages,
      temperature: opts.temperature ?? 0.3,
      max_tokens: opts.maxTokens ?? 2048,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("Pollinations API error:", resp.status, t);
    throw new Error(`Pollinations API error: ${resp.status}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || "";
}

/**
 * Call Pollinations with retry + Gemini fallback.
 * Tries Pollinations up to 2 times, then falls back to Gemini.
 */
export async function callPollinations(opts: CallAIOptions): Promise<string> {
  // Attempt 1: Pollinations
  try {
    return await callPollinationsRaw(opts);
  } catch (e1) {
    console.warn("Pollinations attempt 1 failed:", (e1 as Error).message);
  }

  // Attempt 2: Pollinations with small delay
  try {
    await new Promise((r) => setTimeout(r, 1500));
    return await callPollinationsRaw(opts);
  } catch (e2) {
    console.warn("Pollinations attempt 2 failed:", (e2 as Error).message);
  }

  // Fallback: Gemini
  console.log("Falling back to Gemini API...");
  try {
    return await callGemini({
      model: "gemini-2.5-flash",
      systemPrompt: opts.systemPrompt,
      messages: opts.messages,
      temperature: opts.temperature,
    });
  } catch (e3) {
    console.error("Gemini fallback also failed:", (e3 as Error).message);
    throw new Error("All AI providers failed. Please try again later.");
  }
}

/**
 * Transcribe audio using Pollinations, with Gemini fallback.
 */
export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  // Attempt Pollinations transcription
  try {
    return await transcribeAudioPollinations(audioBase64, mimeType);
  } catch (e1) {
    console.warn("Pollinations transcription failed:", (e1 as Error).message);
  }

  // Retry once
  try {
    await new Promise((r) => setTimeout(r, 1500));
    return await transcribeAudioPollinations(audioBase64, mimeType);
  } catch (e2) {
    console.warn("Pollinations transcription retry failed:", (e2 as Error).message);
  }

  // Fallback: Use Gemini to transcribe audio directly
  console.log("Falling back to Gemini for audio transcription...");
  try {
    const audioFormat = mimeType.includes("ogg") ? "audio/ogg" : mimeType.includes("mp4") ? "audio/mp4" : "audio/mpeg";
    const result = await callGemini({
      model: "gemini-2.5-flash",
      systemPrompt: "Transcreva o áudio a seguir para texto em português brasileiro. Retorne APENAS o texto transcrito, sem explicações.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${audioFormat};base64,${audioBase64}` } },
            { type: "text", text: "Transcreva este áudio." },
          ],
        },
      ],
      temperature: 0,
    });
    return result;
  } catch (e3) {
    console.error("Gemini audio fallback also failed:", (e3 as Error).message);
    throw new Error("All transcription providers failed.");
  }
}

/**
 * Raw Pollinations transcription (no retry).
 */
async function transcribeAudioPollinations(audioBase64: string, mimeType: string): Promise<string> {
  const binaryStr = atob(audioBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "mp3";
  const blob = new Blob([bytes], { type: mimeType });

  const apiKey = Deno.env.get("POLLINATIONS_API_KEY");
  const formData = new FormData();
  formData.append("file", blob, `audio.${ext}`);
  formData.append("model", "openai");

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const resp = await fetch(`${POLLINATIONS_BASE}/v1/audio/transcriptions`, {
    method: "POST",
    headers,
    body: formData,
  });

  if (!resp.ok) {
    const t = await resp.text();
    console.error("Pollinations transcription error:", resp.status, t);
    throw new Error(`Pollinations transcription error: ${resp.status}`);
  }

  const data = await resp.json();
  return data.text || "";
}
