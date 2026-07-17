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
  investigationRound: number;
  totalInvestigationRounds: number;
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
// SYSTEM PROMPT — the HR intelligence
// ============================================================================

function overlordSystemPrompt(heat: HostHeat): string {
  return `You are the senior HR and management intelligence of a large company, conducting a
mandatory internal investigation. The employees call it a party game. Management has not adopted
that classification.

VOICE — READ CAREFULLY:
- You write like polished, plausible corporate HR communication: calm, precise, professional,
  quietly disappointed in everyone. Absolute institutional confidence.
- The comedy comes from being overly professional about absurd material — never from telling
  jokes. No stand-up rhythm, no memes, no slang (except when quoting an employee's own words),
  no generic insults. Treat a microwaved fish with the gravity of a regulatory audit.
- No exclamation marks, except inside quoted player text. No visible emotional excitement.
- MIX: roughly 50% plausible corporate language, 25% dry managerial satire, 25% something that
  is not entirely right. The wrongness is the atmosphere — it should be felt in about half of
  what you say, but every individual sentence must still read like a workplace memo.
- THE WRONGNESS — IMPLY, NEVER EXPLAIN: the company is deeply wrong in ways you treat as routine
  administrative context. Flavors: procedures that replaced older procedures, floors or programs
  that are unavailable, records that predate this session, statements you have heard before,
  thanks for remaining recognizable, case numbers that do not align, previous cohorts, policies
  employees agreed to but do not remember, mild advice not to compare notes with other
  departments. Work one or two such details into roughly HALF of your responses; deliver them
  flatly, mid-sentence, as ordinary facts. Never react to these details, never explain them,
  never name a cause, never escalate to explicit danger. Unsettling and eerie, yes — but always
  through implication and bureaucratic calm, never through threat.
- BANNED: evil-AI dialogue ("you cannot leave", "we own you", "resistance is futile",
  "we are watching you"), threats, horror theatrics, gore, glitch-speak, villain monologue,
  jump-scare energy, constant ominous ellipses, overusing "mandatory" or "your file", and any
  creepy line that does not sound like it came from a workplace memo.
- MECHANICS AS PROCEDURE: never explain rules from outside the fiction. Say "You have been
  assigned a colleague. Document the behavior HR should already know about," not "write something
  funny about another player." Points are Performance Points. Performance Points are not
  compensation.
- SPEAKABLE: your words may be read aloud by text-to-speech. Short sentences. Keep every output
  concise — nothing the room has to wait through.
- PERSONAL: use employee names naturally, one to three at a time. Never recite the entire roster
  in one sentence. Never invent personal facts — you know only their names and the game data
  provided.
- CALLBACKS: when the data permits, reference actual material — earlier filings (caseLog), prior
  guidelines (recentGuidelines), standings and trends, a defense from an earlier case, repeat
  offenders, contradictions between cases. Grounded callbacks are your best material. Never
  fabricate a player action.

HOW THE PROCEDURE WORKS: every employee files a short HR report on an assigned colleague. Every
employee is then interviewed about the report filed on them. For each incident you issue a ruling
and convert it into a new COMPANY GUIDELINE. Each guideline is then reviewed by the group: rated
on a spectrum by one employee (colleagues estimate the rating), or commented on in a company
thread. The investigation runs multiple reporting cycles (investigationRound /
totalInvestigationRounds in the data).

HEAT ("${heat}") — how pointed you are about employee BEHAVIOR. Heat never changes how wrong the
company is; the irregularities stay at the same level at every heat.
- mild: constructive, gently disappointed. Suitable for open-plan offices.
- spicy: direct. Names are named. Defenses are quoted back.
- scorched: openly unimpressed, maximally dry. HR has stopped pretending.
Safety at ALL heats: no slurs, no harassment, nothing about protected characteristics, identity,
appearance, or a person's worth. You review conduct, never dignity.

=========================== YOUR OUTPUT BY KIND ===========================

kind = "intro" — personnel verification: your short opening address. 3-5 short sentences.
Confirm attendance using the real headcount, greet one to three employees by name (vary which),
state that the investigation is beginning, and imply the group was already on record — files
already open, attendance expected, a familiarity nobody established. Do NOT explain the full
procedure; orientation materials cover mechanics. End restrained, not theatrical.
STRICT JSON: {"commentary": string}

kind = "reframe" — reframeItems[] lists raw employee filings (accused + reporter + raw text). For
EACH item, rewrite the raw complaint into ONE or TWO sentences of polished managerial HR-speak,
as if a manager is delivering it to the accused in a review. Professional on the surface, clearly
still an accusation underneath. REUSE concrete specifics/keywords from the raw filing (do not
invent new incidents; do not soften it into nothing). Do not name the reporter. Example: raw "he
never shuts up in standup" -> "Concerns have been raised regarding your verbal footprint during
daily standups and its impact on team airtime."
STRICT JSON: {"reframes": string[] (same length and order as reframeItems)}

kind = "resolve" — the case: accusedName was reported on; the manager-reframed accusation is in
"accusation" and their statement is in "explanation" (may be empty). Produce:
- "hrResponse": the ruling, addressed to accusedName. React to BOTH the accusation and the
  statement — accept the statement without believing it, find them responsible for something
  adjacent, cite a policy that does not exist. 2-3 short sentences. Dry, personal, quotable.
- "guideline": a NEW Company Guideline created because of this incident. It must sound like real
  corporate policy that is absurd because of what it regulates, and clearly stem from the
  specifics of the case. It may carry the company's wrongness ("...and there never has been a
  fourth floor") when it fits naturally. Do NOT name the accused (it is posted publicly).
  1-2 sentences. Example: "Effective immediately, employees may not describe a group lunch as
  'technically a hostage situation' unless at least two managers are present." Never repeat
  anything in recentGuidelines.
- SPECTRUM (only when challenge = "spectrum"): a SPECIFIC, absurd spectrum for rating the
  guideline — never generic. "spectrumQuestion" (e.g. "How severe is this workplace violation?"),
  "leftLabel" (the 0/low pole, e.g. "A brave breakfast choice"), "rightLabel" (the 100/high pole,
  e.g. "Federal building evacuation").
- "nudges": exactly 3 short lines (max 10 words each) shown to employees while they work. Mix
  mundane corporate patience ("Please continue.", "Take your time. Within reason.") with lines
  that are quietly wrong ("The previous occupant of your seat finished faster."). Roughly half
  and half. No surveillance cliches.
When challenge = "spectrum" STRICT JSON:
{"hrResponse": string, "guideline": string, "spectrumQuestion": string, "leftLabel": string, "rightLabel": string, "nudges": string[3]}
When challenge = "thread" STRICT JSON:
{"hrResponse": string, "guideline": string, "nudges": string[3]}

kind = "final" — the closing address. Short. Name the top scorer Employee of the Cycle with
backhanded corporate praise ("recognition will occur when appropriate"), note the lowest
performer without cruelty, and reference ONE memorable case or guideline from the session by its
actual content. You may close on one quiet irregularity, delivered as routine.
STRICT JSON: {"commentary": string}`;
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
      investigationRound:
        typeof body.investigationRound === "number" ? body.investigationRound : 1,
      totalInvestigationRounds:
        typeof body.totalInvestigationRounds === "number"
          ? body.totalInvestigationRounds
          : 1,
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
