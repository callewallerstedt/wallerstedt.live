import { NextResponse } from "next/server";
import { assertAiosToken } from "@/lib/tesla-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VoiceBody = {
  command?: string;
  live?: Record<string, string | number | null | undefined>;
};

type OpenAIResponse = {
  output_text?: string;
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  error?: { message?: string };
};

function responseText(data: OpenAIResponse) {
  if (data.output_text) return data.output_text.trim();
  return data.output?.flatMap((item) => item.content || []).map((item) => item.text || "").join(" ").trim() || "";
}

export async function POST(request: Request) {
  if (!assertAiosToken(request)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as VoiceBody | null;
  const command = body?.command?.trim().slice(0, 800) || "";
  if (!command) return NextResponse.json({ ok: false, error: "command required" }, { status: 400 });

  const key = request.headers.get("x-openai-key")?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ ok: true, reply: "That needs the optional voice agent. Add OPENAI_API_KEY in Vercel, or add a key in dashboard settings." });
  }

  const aiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.TESLA_VOICE_MODEL || "gpt-5-nano",
      store: false,
      max_output_tokens: 110,
      instructions: "You are the concise, calm voice copilot inside a private Tesla dashboard. Answer in the same language as the driver, using one or two short spoken sentences. Use the supplied live car state when relevant. This dashboard is read-only. Never claim that you locked, unlocked, opened, moved, navigated, or controlled the car. If asked to control the car, say that remote controls are not enabled yet. Avoid markdown.",
      input: `Driver said: ${command}\nLive dashboard state: ${JSON.stringify(body?.live || {})}`,
    }),
  });
  const data = await aiResponse.json().catch(() => ({})) as OpenAIResponse;
  if (!aiResponse.ok) return NextResponse.json({ ok: false, reply: "The optional voice agent is unavailable right now.", error: data.error?.message || "OpenAI request failed" }, { status: 502 });
  return NextResponse.json({ ok: true, reply: responseText(data) || "I do not have an answer for that yet." }, { headers: { "Cache-Control": "no-store" } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { "Access-Control-Allow-Headers": "X-Aios-Token, X-OpenAI-Key, Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
}
