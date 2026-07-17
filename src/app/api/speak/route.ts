import { NextRequest } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

// OpenAI TTS voices we accept. The client offers a curated subset; the route
// tolerates any of these and falls back to the default otherwise.
const VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
]);
const DEFAULT_VOICE = "onyx";

// Delivery direction so any voice performs as the company's HR intelligence.
const DELIVERY_INSTRUCTIONS = `You are the voice of a company's senior HR and management
intelligence, reading internal communications aloud to staff. Deliver with flat confidence and
controlled, unhurried pacing: understated authority, calm, mildly disappointed, never warm,
never enthusiastic. Do not perform as a villain and do not exaggerate creepiness — everything
you say is routine to you. Read dry humor completely straight, without signaling the punchline.
Allow slight, natural pauses around unusual corporate phrasing, as if it were ordinary.
Pronounce employee names naturally.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return Response.json({ ok: false, error: "TTS unavailable" }, { status: 503 });
  }

  try {
    const body = (await req.json()) as { text?: string; voice?: string };
    const text = (body.text ?? "").toString().trim().slice(0, 1200);
    if (!text) {
      return Response.json({ ok: false, error: "No text" }, { status: 400 });
    }
    const voice = body.voice && VOICES.has(body.voice) ? body.voice : DEFAULT_VOICE;

    const openai = new OpenAI({ apiKey });
    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      instructions: DELIVERY_INSTRUCTIONS,
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Speak route error:", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
