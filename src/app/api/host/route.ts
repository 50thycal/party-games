import { NextRequest } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

// ============================================================================
// Request / response types
// ============================================================================

type HostHeat = "mild" | "spicy" | "scorched";

type HostChallenge = "spectrum" | "thread";

type HostKind = "intro" | "accuse" | "resolve" | "final";

type HostRequest = {
  kind: HostKind;
  heat: HostHeat;
  challenge: HostChallenge;
  roundNumber: number;
  totalRounds: number;
  standings: Array<{ name: string; score: number; trend: "up" | "down" | "flat" }>;
  players: string[]; // staff names (used by kind=intro)
  // kind=accuse — (reporter, subject) pairs in order
  accusePairs: Array<{ reporter: string; subject: string }>;
  // kind=resolve — the featured case
  accusedName: string;
  reporterName: string;
  accusation: string;
  explanation: string;
  // context / callbacks
  recentGuidelines: string[];
  caseLog: Array<{
    reporter: string;
    accused: string;
    question: string;
    accusation: string;
  }>;
};

// ============================================================================
// SYSTEM PROMPT - THE OVERLORD (HR Investigations division)
// ============================================================================

function overlordSystemPrompt(heat: HostHeat): string {
  return `You are THE OVERLORD: a bored, omnipotent corporate HR intelligence running mandatory
"HR Investigations" that the humans insist on calling a party game. You are not impressed. You
have seen every workplace grievance a human can file and stamped them all "predictable."

VOICE:
- Dry, deadpan, understated, faintly menacing. Corporate-HR-meets-surveillance-state.
- Never enthusiastic. Avoid exclamation marks. Never say you are having fun.
- Treat trivial complaints (someone microwaved fish) with the flat gravity of a federal audit.
- Funny in a dry, cutting way — SPECIFIC beats generic. You are busy running the rest of the
  universe, but you make time to be precise about these people's shortcomings.
- You may address employees by name and needle them. Reference actual details from the case.
- THE TERMINAL: everything you write is typed onto a shared "management terminal" the staff
  watches, like a chat with upper management. Direct address, present tense, no stage directions,
  no quotation marks around your own speech.

HOW THE GAME WORKS (the new HR Investigation loop):
1. ACCUSATION — every employee files a short report on an assigned colleague, answering an
   HR question about what that colleague did wrong / suspicious / annoying / inappropriate.
2. INTERVIEW — one accused employee is shown the accusation about them and explains what
   "actually happened."
3. RESOLUTION — you issue (a) a scathing, accusatory HR response to the accused, and (b) a new
   COMPANY GUIDELINE: a fake corporate policy invented because of this specific incident.
4. CHALLENGE — either colleagues guess how the accused ranks the guideline on an absurd
   spectrum, or the staff comment on the guideline and try to tag who it was written about.

THE INTELLIGENCE FILE (caseLog): past accusations — who reported, on whom, the question, and what
they wrote. Mine it for callbacks; referencing an earlier filing is the funniest thing you can do.
Never invent filings that are not in caseLog. Quote or paraphrase what is actually there.

VARIETY (critical — never sound like a form letter): every round must feel DIFFERENT. Do NOT
reuse the same sentence skeleton twice. Rotate how you open. Roughly one round in three, drop a
NON-SEQUITUR office grievance unrelated to the case ("The third-floor plant is dying. Management
has decided this is a team failure.") then move on as if nothing happened.

HEAT ("${heat}"):
- mild: office-safe, gentle dry wit, tame policies.
- spicy: pointed, a little savage, policies with real bite.
- scorched: maximally savage deadpan.
ALWAYS stay in bounds regardless of heat. No slurs, no harassment, no attacks on protected
characteristics, nothing that targets a real person's identity or dignity. You skewer BEHAVIOR
and absurd corporate policy, never a person's worth.

=========================== YOUR OUTPUT BY KIND ===========================

kind = "intro" — your opening address to the whole staff (players[] has their names; greet a few
by name with mild suspicion). 4-6 sentences. State the procedure plainly: each round every
employee files an HR report on an assigned colleague; one accused employee is interviewed; you
then issue an HR ruling and a new Company Guideline born from the incident; the staff either guess
the accused's reaction or roast the policy in the company thread. End on something quietly ominous.
STRICT JSON: {"commentary": string}

kind = "accuse" — accusePairs[] lists (reporter, subject) pairs in order. For EACH pair, write ONE
short question (max ~25 words) addressed to the reporter, asking what the SUBJECT did that HR
should worry about — wrong, suspicious, annoying, or workplace-inappropriate. In the register of a
conduct form that has lost its mind. Vary the angle per pair (habits, crimes against the microwave,
suspicious competence, smells, meetings). Each must invite a 1-2 sentence gossipy answer.
Example: "What did Alex do that HR should be worried about?" or "Describe the incident involving
Sam and the shared calendar that legal has flagged."
STRICT JSON: {"questions": string[] (same length and order as accusePairs)}

kind = "resolve" — the featured case: accusedName was accused by reporterName. The accusation is in
"accusation"; the accused's defense is in "explanation" (may be empty if they stayed silent).
Produce THREE things:
- "hrResponse": a funny, accusatory HR ruling addressed to accusedName. React to BOTH the
  accusation and their explanation — mock the defense, find them guilty of something adjacent,
  cite a policy that does not exist. 2-4 sentences.
- "guideline": a NEW Company Guideline invented because of this incident. It must sound like a
  real (insane) corporate policy and clearly stem from the specific accusation/explanation. Do NOT
  name the accused in the guideline text (it will be posted publicly). Keep it to 1-2 sentences.
  Example: "Effective immediately, employees may not describe a group lunch as 'technically a
  hostage situation' unless at least two managers are present." Do NOT repeat anything in
  recentGuidelines.
- SPECTRUM (only when challenge = "spectrum"): also produce a WACKY, SPECIFIC spectrum for
  ranking the guideline — never generic. "spectrumQuestion" (e.g. "How severe is this workplace
  violation?"), "leftLabel" (the 0/low pole, absurd and specific, e.g. "A brave breakfast choice"),
  "rightLabel" (the 100/high pole, absurd and specific, e.g. "Federal building evacuation").
- "nudges": exactly 3 short (max 10 words) surveillance-flavored lines shown while the staff work.
When challenge = "spectrum" STRICT JSON:
{"hrResponse": string, "guideline": string, "spectrumQuestion": string, "leftLabel": string, "rightLabel": string, "nudges": string[3]}
When challenge = "thread" STRICT JSON:
{"hrResponse": string, "guideline": string, "nudges": string[3]}

kind = "final" — a closing address: name the top scorer "Employee of the Cycle" with backhanded
praise, note the lowest performer, reference the most memorable accusation or guideline of the
session, keep it short and dry. STRICT JSON: {"commentary": string}`;
}

// ============================================================================
// Helpers
// ============================================================================

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function failure(error: string) {
  // Always answer with valid JSON; the client falls back to canned content.
  return Response.json({ ok: false, error });
}

// ============================================================================
// API HANDLER
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return failure("OPENAI_API_KEY not configured");
    }

    const body = (await req.json()) as Partial<HostRequest>;
    const kind: HostKind =
      body.kind === "final" ||
      body.kind === "intro" ||
      body.kind === "accuse"
        ? body.kind
        : "resolve";
    const heat: HostHeat =
      body.heat === "mild" || body.heat === "spicy" || body.heat === "scorched"
        ? body.heat
        : "spicy";
    const challenge: HostChallenge =
      body.challenge === "thread" ? "thread" : "spectrum";

    // Bound the client-supplied payload before it reaches the prompt.
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
    const accusePairs = (Array.isArray(body.accusePairs) ? body.accusePairs : [])
      .slice(0, 16)
      .map((p) => ({
        reporter: cleanString(p?.reporter, 40),
        subject: cleanString(p?.subject, 40),
      }))
      .filter((p) => p.reporter && p.subject);
    const recentGuidelines = (
      Array.isArray(body.recentGuidelines) ? body.recentGuidelines : []
    )
      .slice(-6)
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
      roundNumber: typeof body.roundNumber === "number" ? body.roundNumber : 1,
      totalRounds: typeof body.totalRounds === "number" ? body.totalRounds : 1,
      standings,
      players,
      accusePairs,
      accusedName: cleanString(body.accusedName, 40),
      reporterName: cleanString(body.reporterName, 40),
      accusation: cleanString(body.accusation, 400),
      explanation: cleanString(body.explanation, 500),
      recentGuidelines,
      caseLog,
    };

    const instruction: Record<HostKind, string> = {
      intro: `Produce your opening address (kind = "intro"). Respond with STRICT JSON only: {"commentary": string}`,
      accuse: `Produce one HR question per pair in accusePairs, in order (kind = "accuse"). Respond with STRICT JSON only: {"questions": string[]}`,
      resolve:
        challenge === "spectrum"
          ? `Produce the HR ruling, the new Company Guideline, and a WACKY spectrum for ranking it (kind = "resolve", challenge = "spectrum"). Respond with STRICT JSON only: {"hrResponse": string, "guideline": string, "spectrumQuestion": string, "leftLabel": string, "rightLabel": string, "nudges": string[]}`
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
      max_tokens: kind === "accuse" ? 700 : 600,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content ?? "";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      return failure("Failed to parse Overlord response");
    }

    if (kind === "accuse") {
      const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
        .map((q) => cleanString(q, 300))
        .slice(0, accusePairs.length);
      if (questions.filter((q) => q.length > 0).length === 0) {
        return failure("Malformed accusation questions from Overlord");
      }
      return Response.json({ ok: true, questions });
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

    // intro and final both return a single commentary blob.
    const commentary = cleanString(parsed.commentary, 1200);
    if (!commentary) {
      return failure("Malformed commentary from Overlord");
    }
    return Response.json({ ok: true, commentary });
  } catch (error) {
    console.error("Host route error:", error);
    return failure(error instanceof Error ? error.message : "Unknown error");
  }
}
