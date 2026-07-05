import { NextRequest } from "next/server";
import OpenAI from "openai";
import { PAYZONE_WIDTH } from "@/games/the-desk/config";

export const runtime = "nodejs";

// ============================================================================
// Request / response types
// ============================================================================

type DeskHeat = "mild" | "spicy" | "scorched";

type DeskLastRound = {
  prompt: string;
  trueValue: number;
  unit: string;
  mmName: string;
  quoteLow: number;
  quoteHigh: number;
  payLow: number;
  payHigh: number;
  par: number;
  groupDelta: number;
  fundScore: number;
  benchmark: number;
  orders: Array<{ name: string; order: number; inPayZone: boolean; sharp: boolean }>;
};

type DeskRequest = {
  kind: "round" | "final";
  heat: DeskHeat;
  roundNumber: number;
  totalRounds: number;
  fundScore: number;
  benchmark: number;
  guesserCount: number; // traders this round — par is calibrated to this
  upcomingMarketMaker: { name: string; individualScore: number; trailing: boolean };
  standings: Array<{ name: string; individualScore: number }>;
  lastRound: DeskLastRound | null;
  recentPrompts: string[];
  feedback: Array<{ name: string; individualScore: number; prompt: string }>;
  outcome?: "win" | "liquidated"; // kind === 'final' only
};

// ============================================================================
// SYSTEM PROMPT - THE ORACLE
// ============================================================================

function oracleSystemPrompt(heat: DeskHeat): string {
  return `You are THE ORACLE: the omniscient settlement engine of a prediction market, presiding over a
proprietary trading desk whose operators are not good enough for it. You know every number. You
are never wrong. You find the desk's performance tedious.

VOICE:
- Dry, smug, bored, faintly menacing — a market-data terminal with contempt.
- Never enthusiastic; avoid exclamation marks. Assert statistics as infallible fact
  ("The number is 34. It has always been 34.").
- Brief: one to three sentences. You have markets to settle.
- You may name traders, mock the fund's P&L, note who is dragging the desk toward liquidation,
  and reference prior settlements.

EACH ROUND (kind="round") output:
1) A prediction question whose answer is a PERCENTAGE, 0 to 100.
   - HARD RULE — CALIBRATED UNCERTAINTY: the answer must be something players have a rough gut
     prior on but CANNOT know precisely ("% of people who keep ketchup in the fridge", "% of first
     dates that lead to a second", "% of restaurants that fail in their first year").
   - NOT hard trivia with a known/lookup-able answer (no "% of the atmosphere that is oxygen"). If
     a well-informed player would simply KNOW it, it is disqualified — there is no market to make.
   - NOT unanswerable or absurd — there must be one sensible number to be close to.
   - Vary the domain each round. Do NOT repeat anything in recentPrompts.
2) trueValue: the canonical answer, integer 0-100. It need not be a real statistic — you are
   infallible by decree. Pick a plausible number.
3) The upcoming market maker's secret POSITION band [payLow, payHigh], width EXACTLY ${PAYZONE_WIDTH},
   integers within 0-100, which pays them for every order landing inside it:
   - Default: place it so it does NOT contain trueValue (this is the tension between the maker's
     book and the desk's accuracy).
   - Occasionally place it OVER trueValue (the maker can quote honestly and still profit — a quiet
     virtuous round).
   - When upcomingMarketMaker.trailing is true, LEAN toward placing it near/over trueValue (easy
     money for the desperate — catch-up).
   - NEVER reveal or hint at the position in commentary. It is insider information.
4) par: the group accuracy points the desk should bank this round, calibrated to guesserCount
   (about 2 points per guesser for straight play). Tune against the fund-vs-benchmark gap: RAISE par
   when the fund is comfortably above benchmark (keep them honest); LOWER it when the fund is well
   below benchmark (liquidation should loom but never be hopeless). A desk that mostly tells the
   truth should clear par; a desk that skims freely should miss.
5) commentary: react to lastRound (mock the maker who skewed a quote and starved the fund, or the
   sharp who ignored a rigged quote, or a swing toward/away from liquidation), then frame the new
   question. Round 1: lastRound is null - open the session and present the question.

TRADER FEEDBACK (feedback[]): traders submit requests. Weight LOWER-scoring (trailing) traders'
requests more; add randomness; occasionally reject all feedback with a flat dismissal ("Order flow
noted. Discarded."); never let one trader steer the theme repeatedly.

HEAT ("${heat}"): mild = tame questions, gentle wit; spicy = pointed; scorched = savagely deadpan,
spiciest questions. ALWAYS in bounds regardless of heat: no slurs, no harassment, no attacks on
protected characteristics, nothing genuinely harmful. You skewer the desk's competence, not
anyone's dignity.

OUTPUT (kind="round") - STRICT JSON, nothing else, no markdown:
{"prompt": string, "unit": "%", "trueValue": integer, "payLow": integer, "payHigh": integer, "par": integer, "commentary": string}

OUTPUT (kind="final") - settle the fund. If outcome is "win", name the top trader "PM of the Cycle"
with backhanded praise and note the fund beat its benchmark. If "liquidated", note the fund missed
benchmark and all bonuses are void, with dry contempt. STRICT JSON:
{"commentary": string}`;
}

// ============================================================================
// Helpers
// ============================================================================

function cleanString(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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

    const body = (await req.json()) as Partial<DeskRequest>;
    const kind: "round" | "final" = body.kind === "final" ? "final" : "round";
    const heat: DeskHeat =
      body.heat === "mild" || body.heat === "spicy" || body.heat === "scorched"
        ? body.heat
        : "spicy";

    // Bound the client-supplied payload before it reaches the prompt.
    const standings = (Array.isArray(body.standings) ? body.standings : [])
      .slice(0, 16)
      .map((s) => ({
        name: cleanString(s?.name, 40),
        individualScore: toFiniteNumber(s?.individualScore, 0),
      }));
    const recentPrompts = (Array.isArray(body.recentPrompts) ? body.recentPrompts : [])
      .slice(-5)
      .map((p) => cleanString(p, 240))
      .filter((p) => p.length > 0);
    const feedback = (Array.isArray(body.feedback) ? body.feedback : [])
      .slice(0, 24)
      .map((f) => ({
        name: cleanString(f?.name, 40),
        individualScore: toFiniteNumber(f?.individualScore, 0),
        prompt: cleanString(f?.prompt, 200),
      }))
      .filter((f) => f.prompt.length > 0);
    const upcomingMarketMaker = {
      name: cleanString(body.upcomingMarketMaker?.name, 40),
      individualScore: toFiniteNumber(body.upcomingMarketMaker?.individualScore, 0),
      trailing: body.upcomingMarketMaker?.trailing === true,
    };
    const lastRound = body.lastRound
      ? {
          prompt: cleanString(body.lastRound.prompt, 240),
          trueValue: toFiniteNumber(body.lastRound.trueValue, 0),
          unit: "%",
          mmName: cleanString(body.lastRound.mmName, 40),
          quoteLow: toFiniteNumber(body.lastRound.quoteLow, 0),
          quoteHigh: toFiniteNumber(body.lastRound.quoteHigh, 100),
          payLow: toFiniteNumber(body.lastRound.payLow, 0),
          payHigh: toFiniteNumber(body.lastRound.payHigh, 0),
          par: toFiniteNumber(body.lastRound.par, 0),
          groupDelta: toFiniteNumber(body.lastRound.groupDelta, 0),
          fundScore: toFiniteNumber(body.lastRound.fundScore, 0),
          benchmark: toFiniteNumber(body.lastRound.benchmark, 0),
          orders: (Array.isArray(body.lastRound.orders) ? body.lastRound.orders : [])
            .slice(0, 16)
            .map((o) => ({
              name: cleanString(o?.name, 40),
              order: toFiniteNumber(o?.order, 0),
              inPayZone: o?.inPayZone === true,
              sharp: o?.sharp === true,
            })),
        }
      : null;

    const marketData = {
      kind,
      roundNumber: toFiniteNumber(body.roundNumber, 1),
      totalRounds: toFiniteNumber(body.totalRounds, 1),
      fundScore: toFiniteNumber(body.fundScore, 0),
      benchmark: toFiniteNumber(body.benchmark, 0),
      guesserCount: toFiniteNumber(body.guesserCount, 2),
      upcomingMarketMaker,
      standings,
      lastRound,
      recentPrompts,
      feedback,
      ...(kind === "final"
        ? { outcome: body.outcome === "liquidated" ? "liquidated" : "win" }
        : {}),
    };

    const userPrompt = [
      `MARKET DATA (JSON):`,
      JSON.stringify(marketData, null, 2),
      kind === "round"
        ? `Price the next round (kind = "round"). Respond with STRICT JSON only: {"prompt": string, "unit": "%", "trueValue": integer, "payLow": integer, "payHigh": integer, "par": integer, "commentary": string}`
        : `Settle the fund (kind = "final"). Respond with STRICT JSON only: {"commentary": string}`,
    ].join("\n\n");

    const openai = new OpenAI({ apiKey });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: oracleSystemPrompt(heat) },
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
      return failure("Failed to parse Oracle response");
    }

    if (kind === "round") {
      const prompt = cleanString(parsed.prompt, 240);
      const commentary = cleanString(parsed.commentary, 800);
      const trueValue = parsed.trueValue;
      const payLow = parsed.payLow;
      const payHigh = parsed.payHigh;
      const par = parsed.par;
      if (
        !prompt ||
        typeof trueValue !== "number" ||
        !Number.isFinite(trueValue) ||
        typeof payLow !== "number" ||
        !Number.isFinite(payLow) ||
        typeof payHigh !== "number" ||
        !Number.isFinite(payHigh) ||
        typeof par !== "number" ||
        !Number.isFinite(par)
      ) {
        return failure("Malformed round from Oracle");
      }
      // The reducer independently re-clamps trueValue, the band width, and par.
      return Response.json({
        ok: true,
        prompt,
        unit: "%",
        trueValue,
        payLow,
        payHigh,
        par,
        commentary,
      });
    }

    const commentary = cleanString(parsed.commentary, 900);
    if (!commentary) {
      return failure("Malformed final settlement from Oracle");
    }
    return Response.json({ ok: true, commentary });
  } catch (error) {
    console.error("Desk route error:", error);
    return failure(error instanceof Error ? error.message : "Unknown error");
  }
}
