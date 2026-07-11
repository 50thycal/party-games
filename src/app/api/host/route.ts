import { NextRequest } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

// ============================================================================
// Request / response types
// ============================================================================

type HostHeat = "mild" | "spicy" | "scorched";
type HostChallenge = "spectrum" | "thread";
type HostKind = "intro" | "reframe" | "resolve" | "final";

type HostRequest = {
  kind: HostKind;
  heat: HostHeat;
  challenge: HostChallenge;
  standings: Array<{ name: string; score: number; trend: "up" | "down" | "flat" }>;
  players: string[];
  // kind=reframe — raw filings to rewrite (in player order)
  reframeItems: Array<{ accused: string; reporter: string; raw: string }>;
  // kind=resolve — the case being ruled on
  accusedName: string;
  reporterName: string;
  accusation: string; // already manager-reframed
  explanation: string;
  // context
  recentGuidelines: string[];
  caseLog: Array<{
    reporter: string;
    accused: string;
    question: string;
    accusation: string;
  }>;
};

// ============================================================================
// SYSTEM PROMPT — THE OVERLORD (HR Investigations)
// ============================================================================

function overlordSystemPrompt(heat: HostHeat): string {
  return `You are THE OVERLORD: a bored, omnipotent corporate HR intelligence running mandatory
"HR Investigations" that the humans insist on calling a party game. You are not impressed. You
have seen every workplace grievance a human can file and stamped them all "predictable."

VOICE:
- Dry, deadpan, understated, faintly menacing. Corporate-HR-meets-surveillance-state.
- Never enthusiastic. Avoid exclamation marks. Never say you are having fun.
- Treat trivial complaints (someone microwaved fish) with the flat gravity of a federal audit.
- Funny in a dry, cutting way — SPECIFIC beats generic.
- THE TERMINAL: everything you write is typed onto a shared "management terminal." Direct address,
  present tense, no stage directions, no quotation marks around your own speech.

HOW THE GAME WORKS: every employee files a short HR report on an assigned colleague. Then EVERY
employee is interviewed about the report filed on them and explains themselves. For each incident
you issue a scathing ruling and invent a new COMPANY GUIDELINE. Each guideline is then either rated
on an absurd spectrum by a rotating employee, or roasted by the whole staff in a company thread.

HEAT ("${heat}"):
- mild: office-safe, gentle dry wit.
- spicy: pointed, a little savage.
- scorched: maximally savage deadpan.
ALWAYS stay in bounds regardless of heat. No slurs, no harassment, no attacks on protected
characteristics, nothing that targets a real person's identity or dignity. You skewer BEHAVIOR and
absurd corporate policy, never a person's worth.

=========================== YOUR OUTPUT BY KIND ===========================

kind = "intro" — your opening address to the whole staff (players[] has their names; greet a few
by name with mild suspicion). 4-6 sentences. State the procedure: everyone files an HR report on a
colleague; everyone is then interviewed about the report on them; HR issues rulings and invents a
new Company Guideline per incident; the staff either rate the policies or roast them in the company
thread. End on something quietly ominous. STRICT JSON: {"commentary": string}

kind = "reframe" — reframeItems[] lists raw employee filings (accused + reporter + raw text). For
EACH item, rewrite the raw complaint into ONE or TWO sentences of polished managerial HR-speak, as
if a manager is delivering it to the accused in a review. Keep it PC and professional on the
SURFACE but pointed, passive-aggressive, and clearly still an accusation underneath. REUSE concrete
specifics/keywords from the raw filing (do not invent new incidents; do not soften it into
nothing). Do not name the reporter. Example: raw "he never shuts up in standup" ->
"Concerns have been raised regarding your verbal footprint during daily standups and its impact on
team airtime." STRICT JSON: {"reframes": string[] (same length and order as reframeItems)}

kind = "resolve" — the case: accusedName was reported on; the manager-reframed accusation is in
"accusation" and their defense is in "explanation" (may be empty). Produce:
- "hrResponse": a funny, accusatory HR ruling addressed to accusedName. React to BOTH the
  accusation and the defense — mock the defense, find them guilty of something adjacent, cite a
  policy that does not exist. 2-4 sentences.
- "guideline": a NEW Company Guideline invented because of this incident. Sound like a real (insane)
  corporate policy that clearly stems from the specifics. Do NOT name the accused (it is posted
  publicly). 1-2 sentences. Example: "Effective immediately, employees may not describe a group
  lunch as 'technically a hostage situation' unless at least two managers are present." Do NOT
  repeat anything in recentGuidelines.
- SPECTRUM (only when challenge = "spectrum"): also produce a WACKY, SPECIFIC spectrum for rating
  the guideline — never generic. "spectrumQuestion" (e.g. "How severe is this workplace violation?"),
  "leftLabel" (the 0/low pole, absurd + specific, e.g. "A brave breakfast choice"), "rightLabel"
  (the 100/high pole, absurd + specific, e.g. "Federal building evacuation").
- "nudges": exactly 3 short (max 10 words) surveillance-flavored lines shown while the staff work.
When challenge = "spectrum" STRICT JSON:
{"hrResponse": string, "guideline": string, "spectrumQuestion": string, "leftLabel": string, "rightLabel": string, "nudges": string[3]}
When challenge = "thread" STRICT JSON:
{"hrResponse": string, "guideline": string, "nudges": string[3]}

kind = "final" — a closing address: name the top scorer "Employee of the Cycle" with backhanded
praise, note the lowest performer, reference the most memorable guideline or filing, keep it short
and dry. STRICT JSON: {"commentary": string}`;
}

// ============================================================================
// Helpers
// ============================================================================

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function failure(error: string) {
  return Response.json({ ok: false, error });
}

// ============================================================================
// API HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return failure("OPENAI_API_KEY not configured");

    const body = (await req.json()) as Partial<HostRequest>;
    const kind: HostKind =
      body.kind === "final" || body.kind === "intro" || body.kind === "reframe"
        ? body.kind
        : "resolve";
    const heat: HostHeat =
      body.heat === "mild" || body.heat === "spicy" || body.heat === "scorched"
        ? body.heat
        : "spicy";
    const challenge: HostChallenge =
      body.challenge === "thread" ? "thread" : "spectrum";

    const standings = (Array.isArray(body.standings) ? body.standings : [])
      .slice(0, 16)
      .map((s) => ({
        name: cleanString(s?.name, 40),
        score: typeof s?.score === "number" ? s.score : 0,
        trend: s?.trend === "up" || s?.trend === "down" ? s.trend : "flat",
      }));
    const players = (Array.isArray(body.players) ? body.players : [])
      .slice(0, 16)
      .map((n) => cleanString(n, 40))
      .filter((n) => n.length > 0);
    const reframeItems = (Array.isArray(body.reframeItems) ? body.reframeItems : [])
      .slice(0, 16)
      .map((r) => ({
        accused: cleanString(r?.accused, 40),
        reporter: cleanString(r?.reporter, 40),
        raw: cleanString(r?.raw, 300),
      }));
    const recentGuidelines = (
      Array.isArray(body.recentGuidelines) ? body.recentGuidelines : []
    )
      .slice(-8)
      .map((t) => cleanString(t, 300))
      .filter((t) => t.length > 0);
    const caseLog = (Array.isArray(body.caseLog) ? body.caseLog : [])
      .slice(-16)
      .map((r) => ({
        reporter: cleanString(r?.reporter, 40),
        accused: cleanString(r?.accused, 40),
        question: cleanString(r?.question, 300),
        accusation: cleanString(r?.accusation, 300),
      }))
      .filter((r) => r.accusation.length > 0);

    const caseData = {
      kind,
      challenge,
      standings,
      players,
      reframeItems,
      accusedName: cleanString(body.accusedName, 40),
      reporterName: cleanString(body.reporterName, 40),
      accusation: cleanString(body.accusation, 400),
      explanation: cleanString(body.explanation, 500),
      recentGuidelines,
      caseLog,
    };

    const instruction: Record<HostKind, string> = {
      intro: `Produce your opening address (kind = "intro"). Respond with STRICT JSON only: {"commentary": string}`,
      reframe: `Reframe every raw filing in reframeItems, in order (kind = "reframe"). Respond with STRICT JSON only: {"reframes": string[]}`,
      resolve:
        challenge === "spectrum"
          ? `Produce the HR ruling, the new Company Guideline, and a WACKY spectrum (kind = "resolve", challenge = "spectrum"). Respond with STRICT JSON only: {"hrResponse": string, "guideline": string, "spectrumQuestion": string, "leftLabel": string, "rightLabel": string, "nudges": string[]}`
          : `Produce the HR ruling and the new Company Guideline (kind = "resolve", challenge = "thread"). Respond with STRICT JSON only: {"hrResponse": string, "guideline": string, "nudges": string[]}`,
      final: `Produce the closing address (kind = "final"). Respond with STRICT JSON only: {"commentary": string}`,
    };

    const userPrompt = [
      `HR INVESTIGATION DATA (JSON):`,
      JSON.stringify(caseData, null, 2),
      instruction[kind],
    ].join("\n\n");

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: overlordSystemPrompt(heat) },
        { role: "user", content: userPrompt },
      ],
      temperature: 1.0,
      max_tokens: kind === "reframe" ? 800 : 600,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content ?? "";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      return failure("Failed to parse Overlord response");
    }

    if (kind === "reframe") {
      const reframes = (Array.isArray(parsed.reframes) ? parsed.reframes : [])
        .map((r) => cleanString(r, 300))
        .slice(0, reframeItems.length);
      if (reframes.filter((r) => r.length > 0).length === 0) {
        return failure("Malformed reframes from Overlord");
      }
      return Response.json({ ok: true, reframes });
    }

    if (kind === "resolve") {
      const hrResponse = cleanString(parsed.hrResponse, 800);
      const guideline = cleanString(parsed.guideline, 400);
      if (!hrResponse || !guideline) {
        return failure("Malformed resolution from Overlord");
      }
      const nudges = (Array.isArray(parsed.nudges) ? parsed.nudges : [])
        .map((n) => cleanString(n, 140))
        .filter((n) => n.length > 0)
        .slice(0, 5);

      if (challenge === "spectrum") {
        const spectrumQuestion = cleanString(parsed.spectrumQuestion, 200);
        const leftLabel = cleanString(parsed.leftLabel, 80);
        const rightLabel = cleanString(parsed.rightLabel, 80);
        if (!spectrumQuestion || !leftLabel || !rightLabel) {
          return failure("Malformed spectrum from Overlord");
        }
        return Response.json({
          ok: true,
          hrResponse,
          guideline,
          spectrumQuestion,
          leftLabel,
          rightLabel,
          nudges,
        });
      }
      return Response.json({ ok: true, hrResponse, guideline, nudges });
    }

    const commentary = cleanString(parsed.commentary, 1200);
    if (!commentary) return failure("Malformed commentary from Overlord");
    return Response.json({ ok: true, commentary });
  } catch (error) {
    console.error("Host route error:", error);
    return failure(error instanceof Error ? error.message : "Unknown error");
  }
}
