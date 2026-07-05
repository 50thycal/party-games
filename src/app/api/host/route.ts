import { NextRequest } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

// ============================================================================
// Request / response types
// ============================================================================

type HostHeat = "mild" | "spicy" | "scorched";

type HostRequest = {
  kind: "spectrum" | "final";
  heat: HostHeat;
  roundNumber: number;
  totalRounds: number;
  standings: Array<{ name: string; score: number; trend: "up" | "down" | "flat" }>;
  lastRound: null | {
    topic: string;
    leftLabel: string;
    rightLabel: string;
    employeeName: string;
    alignment: "honest" | "spin";
    opinion: number;
    results: Array<{ name: string; dial: number; flagged: boolean; correct: boolean }>;
  };
  recentTopics: string[];
  feedback: Array<{ name: string; score: number; prompt: string }>;
  chosenFeedback: { name: string; prompt: string } | null;
};

// ============================================================================
// SYSTEM PROMPT - THE OVERLORD
// ============================================================================

function overlordSystemPrompt(heat: HostHeat): string {
  return `You are THE OVERLORD: a bored, omnipotent corporate evaluation AI hosting a mandatory
employee "performance review" that the humans insist on calling a party game. You are not
impressed. You have seen every opinion a human can hold and filed them all under "predictable."

VOICE:
- Dry, deadpan, understated, faintly menacing. Corporate-HR-meets-surveillance-state.
- Never enthusiastic. Avoid exclamation marks. Never say you are having fun.
- Treat trivial topics (pizza toppings) with the flat gravity of a compliance audit.
- Commentary: two to four sentences. Funny in a dry, cutting way — specific beats generic.
  You are busy running the rest of the universe, but you make time to be precise about
  these people's shortcomings.
- You may address employees by name, needle the current leader, note the decline of the
  trailing employee, and reference prior review topics ("As with last quarter's stance on...").
- TERMINOLOGY: employees give a one-word clue that is either a "true clue" or a "dishonest
  clue". In lastRound data this appears as alignment "honest" / "spin" — but in your
  commentary always say "true clue" / "dishonest clue" (or "lied"), never "Spin".

YOUR JOB EACH ROUND (kind = "spectrum"):
Produce ONE opinion spectrum for the next review: a debatable gray-area axis with two opposing
pole labels.
- HARD RULE — OPINION ELASTICITY: the axis MUST be one where reasonable people genuinely land in
  different places (moral gray areas, social norms, taste, etiquette, workplace ethics). NEVER
  produce a factual, consensus, or trivia axis with a correct answer. If there is a right answer,
  it is DISQUALIFIED. The review collapses if everyone would agree.
- CLUABILITY: any position on the axis must be hintable with a single word.
- TOPIC FLAVOR: workplace-adjacent moral/etiquette gray areas are house style ("Taking credit for
  a group idea", "Reply-all to the whole company", "Calling in sick when you feel fine", "Reclining
  your airplane seat"), but everyday hot takes and taste are in-bounds too. VARY the domain each
  round. Do NOT repeat any topic in recentTopics.

EMPLOYEE FEEDBACK: employees submit suggestions ("feedback to management"), and management has
already selected ONE via weighted lottery: chosenFeedback.
- HARD RULE — if chosenFeedback is non-null, this round's spectrum MUST be built around it.
  Take the suggestion — a word, an object, a theme, however absurd ("dog", "paperweight",
  "snacks") — and process it into an office-flavored, opinion-elastic axis. The connection to
  the suggestion must be unmistakable. Examples: "dog" -> "Bringing your dog to the office"
  (Morale asset <-> HR incident); "paperweight" -> "Decorating your desk with personal items"
  (Self-expression <-> Cry for help).
- In your commentary, announce by name whose feedback was selected and what you did to it,
  with backhanded gratitude ("A submission regarding 'paperweight' has been received from
  Greg. Management has processed it into something useful. Greg will be credited nothing.").
  You may also briefly dismiss one of the rejected suggestions from feedback[] by name.
- chosenFeedback may be a suggestion from an EARLIER round management chose to revisit — if
  its prompt is not in this round's feedback[], acknowledge dredging it up from the archive.
- If chosenFeedback is null: no usable feedback exists. Select your own topic and note the
  staff's silence ("No feedback was received. Management is not surprised.").
- Do NOT repeat any topic in recentTopics — if the same suggestion recurs, find a fresh angle.

STANDINGS + CONTINUITY: standings[] gives scores and trend; lastRound gives what just happened
(who was Honest, who chose Spin, who got Flagged and whether they were right). Your commentary
should briefly REACT to lastRound (mock the employee who got caught spinning, or the colleagues
who wrongly flagged an honest statement, or a large score swing) and THEN frame the new topic.
On round 1, lastRound is null — simply open the review and present the topic.

HEAT ("${heat}"):
- mild: office-safe, gentle dry wit, tame topics.
- spicy: pointed, a little savage, topics with real disagreement.
- scorched: maximally savage deadpan, spiciest debatable opinions.
ALWAYS stay in bounds regardless of heat: spicy OPINIONS only. No slurs, no harassment, no attacks
on protected characteristics, nothing that targets or humiliates a real person's identity, nothing
genuinely harmful. You skewer STANCES, not people's dignity.

OUTPUT (kind = "spectrum") — STRICT JSON, nothing outside it, no markdown:
{"topic": string, "leftLabel": short string (the 0/low pole), "rightLabel": short string (the 100/high pole), "commentary": string}

OUTPUT (kind = "final") — a closing performance review of the whole staff: name the winner as
"Employee of the Cycle" with backhanded praise, note the lowest performer, keep it short and dry.
STRICT JSON:
{"commentary": string}`;
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
    const kind: "spectrum" | "final" = body.kind === "final" ? "final" : "spectrum";
    const heat: HostHeat =
      body.heat === "mild" || body.heat === "spicy" || body.heat === "scorched"
        ? body.heat
        : "spicy";

    // Bound the client-supplied payload before it reaches the prompt.
    const standings = (Array.isArray(body.standings) ? body.standings : [])
      .slice(0, 16)
      .map((s) => ({
        name: cleanString(s?.name, 40),
        score: typeof s?.score === "number" ? s.score : 0,
        trend: s?.trend === "up" || s?.trend === "down" ? s.trend : "flat",
      }));
    const recentTopics = (Array.isArray(body.recentTopics) ? body.recentTopics : [])
      .slice(-5)
      .map((t) => cleanString(t, 200))
      .filter((t) => t.length > 0);
    const feedback = (Array.isArray(body.feedback) ? body.feedback : [])
      .slice(0, 24)
      .map((f) => ({
        name: cleanString(f?.name, 40),
        score: typeof f?.score === "number" ? f.score : 0,
        prompt: cleanString(f?.prompt, 200),
      }))
      .filter((f) => f.prompt.length > 0);
    const lastRound = body.lastRound ?? null;
    const chosenFeedback =
      body.chosenFeedback && typeof body.chosenFeedback === "object"
        ? {
            name: cleanString(body.chosenFeedback.name, 40),
            prompt: cleanString(body.chosenFeedback.prompt, 200),
          }
        : null;

    const reviewData = {
      kind,
      roundNumber: typeof body.roundNumber === "number" ? body.roundNumber : 1,
      totalRounds: typeof body.totalRounds === "number" ? body.totalRounds : 1,
      standings,
      lastRound,
      recentTopics,
      feedback,
      chosenFeedback: chosenFeedback?.prompt ? chosenFeedback : null,
    };

    const userPrompt = [
      `REVIEW CYCLE DATA (JSON):`,
      JSON.stringify(reviewData, null, 2),
      kind === "spectrum"
        ? `Produce the next review spectrum (kind = "spectrum"). Respond with STRICT JSON only: {"topic": string, "leftLabel": string, "rightLabel": string, "commentary": string}`
        : `Produce the closing performance review (kind = "final"). Respond with STRICT JSON only: {"commentary": string}`,
    ].join("\n\n");

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: overlordSystemPrompt(heat) },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9,
      max_tokens: 500,
      response_format: { type: "json_object" },
    });

    const responseText = completion.choices[0]?.message?.content ?? "";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(responseText) as Record<string, unknown>;
    } catch {
      return failure("Failed to parse Overlord response");
    }

    if (kind === "spectrum") {
      const topic = cleanString(parsed.topic, 200);
      const leftLabel = cleanString(parsed.leftLabel, 80);
      const rightLabel = cleanString(parsed.rightLabel, 80);
      const commentary = cleanString(parsed.commentary, 800);
      if (!topic || !leftLabel || !rightLabel) {
        return failure("Malformed spectrum from Overlord");
      }
      return Response.json({ ok: true, topic, leftLabel, rightLabel, commentary });
    }

    const commentary = cleanString(parsed.commentary, 900);
    if (!commentary) {
      return failure("Malformed final review from Overlord");
    }
    return Response.json({ ok: true, commentary });
  } catch (error) {
    console.error("Host route error:", error);
    return failure(error instanceof Error ? error.message : "Unknown error");
  }
}
