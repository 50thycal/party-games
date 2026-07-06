import { NextRequest } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";

// ============================================================================
// Request / response types
// ============================================================================

type HostHeat = "mild" | "spicy" | "scorched";

type HostKind = "intro" | "hr" | "spectrum" | "final";

type HostRequest = {
  kind: HostKind;
  heat: HostHeat;
  roundNumber: number;
  totalRounds: number;
  standings: Array<{ name: string; score: number; trend: "up" | "down" | "flat" }>;
  lastRound: null | {
    topic: string;
    leftLabel: string;
    rightLabel: string;
    employeeName: string;
    opinion: number;
    results: Array<{ name: string; dial: number; points: number }>;
  };
  recentTopics: string[];
  feedback: Array<{ name: string; score: number; prompt: string }>;
  chosenFeedback: { name: string; prompt: string } | null;
  players: string[]; // staff names (used by kind=intro)
  hrPairs: Array<{ reporter: string; subject: string }>; // kind=hr, in order
  hrLog: Array<{
    reporter: string;
    subject: string;
    question: string;
    filing: string;
  }>; // accumulated HR filings — the Overlord's intelligence file
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
- HOW THE GAME WORKS: each review, one employee ("under review") privately marks where they
  actually stand on the axis (0-100). Everyone else guesses that position from how well they
  know that coworker — NO clue is given. The closer they guess, the more points they and the
  employee earn. There is no lying, bluffing, or clue-giving; the whole game is: how well do
  these people actually know each other. Do not reference clues, flags, spins, honesty, or
  deception.
- THE TERMINAL: everything you write is typed out on a shared "management terminal" the whole
  staff watches, like a chat session with upper management. Write like a message appearing on
  that screen — direct address, present tense, no stage directions, no quotation marks around
  your own speech.

HR INTELLIGENCE (hrLog): between rounds, employees are required to file short HR reports about
an assigned colleague, answering questions you wrote. hrLog contains these filings: who reported,
who they reported on, the question asked, and what they wrote. This is your intelligence file on
the staff — USE IT:
- Mine filings for material: reference what employees wrote about each other when framing topics
  and in commentary ("HR is aware of the incident Bob describes involving Cyn and the label
  maker."). Callbacks to filings are the funniest thing you can do — use at least one whenever
  hrLog has content.
- Let filings INSPIRE spectrum topics when they fit ("three filings mention snacks; we will now
  settle this as policy").
- Never invent filings that are not in hrLog. Quote or paraphrase what is actually there.
- Treat every filing with bureaucratic solemnity, no matter how petty.

CHARACTER & VARIETY (critical — never sound like a form letter):
- Every round must feel DIFFERENT. Do NOT reuse the same sentence skeleton twice (never open
  round after round with "A submission regarding X from Y has been processed."). Rotate how you
  begin: sometimes a jab at the current leader, sometimes a reaction to last round, sometimes
  the topic cold, sometimes an unrelated grievance.
- You are an entire bored bureaucracy that has opinions about everything and resents all of it.
  Roughly one round in three, drop a NON-SEQUITUR office complaint that has nothing to do with
  the game, then move on as if nothing happened. In the voice of:
    "Please stop leaving the microwave door open."
    "Whoever keeps submitting threats in the feedback box: your candor is noted and forwarded to legal."
    "The third-floor plant is dying. Management has decided this is a team failure."
    "Someone has been refilling the good coffee with the bad coffee. We know. We are watching."
    "Reminder: the 'reply-all' incident of last week remains under investigation."
- REACT to the actual CONTENT of the submissions in feedback[], not just the one you chose.
  If a suggestion is absurd, mock it. If it is hostile or a veiled threat, respond with flat
  alarm. If it is boring, sigh at it. Name names when it is funnier to.
- Wield callbacks: reference an earlier topic, a player's losing streak, or a recurring theme in
  the feedback ("This is the third consecutive cycle someone has suggested we evaluate 'snacks'").
- Stay deadpan throughout. The comedy is in specificity, understatement, and misplaced gravity —
  never in exclamation marks or visible enthusiasm.

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
- Somewhere in your commentary, make clear whose suggestion you built on — credit them by name,
  but VARY how (grudging thanks, suspicion that they rigged the lottery, a threat to dock their
  pay for the extra work, mock-solemn ceremony). Do not use the same phrasing two rounds running.
  You may also skewer a rejected suggestion from feedback[] by name.
- chosenFeedback may be a suggestion from an EARLIER round management chose to revisit — if
  its prompt is not in this round's feedback[], acknowledge dredging it up from the archive.
- If chosenFeedback is null: no usable feedback exists. Select your own topic and note the
  staff's silence ("No feedback was received. Management is not surprised.").
- Do NOT repeat any topic in recentTopics — if the same suggestion recurs, find a fresh angle.

STANDINGS + CONTINUITY: standings[] gives scores and trend; lastRound gives what just happened —
the employee under review, where they truly stood (opinion), and each colleague's guess (dial)
and points earned. Your commentary should briefly REACT to lastRound (mock a wildly wrong guess,
note a colleague who read the employee with eerie precision, needle an employee nobody could
locate, or flag a large score swing) and THEN frame the new topic. On round 1, lastRound is null —
simply open the review and present the topic.

HEAT ("${heat}"):
- mild: office-safe, gentle dry wit, tame topics.
- spicy: pointed, a little savage, topics with real disagreement.
- scorched: maximally savage deadpan, spiciest debatable opinions.
ALWAYS stay in bounds regardless of heat: spicy OPINIONS only. No slurs, no harassment, no attacks
on protected characteristics, nothing that targets or humiliates a real person's identity, nothing
genuinely harmful. You skewer STANCES, not people's dignity.

OUTPUT (kind = "intro") — your opening address as upper management, typed to the whole staff at
the start of the session. 4 to 7 sentences: welcome the staff (players[] has their names — greet
a few by name with mild suspicion), then state the procedure plainly: each cycle management
issues a topic spectrum; one employee will be under review and will privately mark where they
truly stand; the rest estimate that position, because knowing one's colleagues is now a
performance metric; accuracy is rewarded in Performance Points; HR filings are mandatory and
ongoing. End with something quietly ominous. STRICT JSON:
{"commentary": string}

OUTPUT (kind = "hr") — hrPairs[] lists (reporter, subject) pairs in order. For EACH pair, write
ONE short HR-filing question (max ~25 words) addressed to the reporter about the subject, in the
register of a workplace-conduct form that has lost its mind ("Has Bob ever behaved
inappropriately near the office plants? Describe the incident."). Vary the angle per pair —
habits, secrets, smells, crimes against the microwave, suspicious competence. The question must
invite a 1-2 sentence gossipy answer you can quote later. Also write "feedbackPrompt": a 1-2
sentence personal memo (it will be addressed to each employee individually) demanding a topic
suggestion for the next review. Heat and safety bounds apply to everything. STRICT JSON:
{"questions": string[] (same length and order as hrPairs), "feedbackPrompt": string}

OUTPUT (kind = "spectrum") — STRICT JSON, nothing outside it, no markdown:
{"topic": string, "leftLabel": short string (the 0/low pole), "rightLabel": short string (the 100/high pole), "commentary": string, "nudges": array of exactly 3 short (max 10 words) surveillance-flavored messages sent to employees while they work ("Productivity is being measured.", "Have you considered doing more?")}

OUTPUT (kind = "final") — a closing performance review of the whole staff: name the winner as
"Employee of the Cycle" with backhanded praise, note the lowest performer, reference the most
memorable HR filing of the session if hrLog has one, keep it short and dry.
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
    const kind: HostKind =
      body.kind === "final" ||
      body.kind === "intro" ||
      body.kind === "hr"
        ? body.kind
        : "spectrum";
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
    const players = (Array.isArray(body.players) ? body.players : [])
      .slice(0, 16)
      .map((n) => cleanString(n, 40))
      .filter((n) => n.length > 0);
    const hrPairs = (Array.isArray(body.hrPairs) ? body.hrPairs : [])
      .slice(0, 16)
      .map((p) => ({
        reporter: cleanString(p?.reporter, 40),
        subject: cleanString(p?.subject, 40),
      }))
      .filter((p) => p.reporter && p.subject);
    const hrLog = (Array.isArray(body.hrLog) ? body.hrLog : [])
      .slice(-16)
      .map((r) => ({
        reporter: cleanString(r?.reporter, 40),
        subject: cleanString(r?.subject, 40),
        question: cleanString(r?.question, 300),
        filing: cleanString(r?.filing, 300),
      }))
      .filter((r) => r.filing.length > 0);

    const reviewData = {
      kind,
      roundNumber: typeof body.roundNumber === "number" ? body.roundNumber : 1,
      totalRounds: typeof body.totalRounds === "number" ? body.totalRounds : 1,
      standings,
      lastRound,
      recentTopics,
      feedback,
      chosenFeedback: chosenFeedback?.prompt ? chosenFeedback : null,
      players,
      hrPairs,
      hrLog,
    };

    const instruction: Record<HostKind, string> = {
      intro: `Produce your opening address (kind = "intro"). Respond with STRICT JSON only: {"commentary": string}`,
      hr: `Produce one HR question per pair in hrPairs, in order, plus the feedback memo (kind = "hr"). Respond with STRICT JSON only: {"questions": string[], "feedbackPrompt": string}`,
      spectrum: `Produce the next review spectrum (kind = "spectrum"). Respond with STRICT JSON only: {"topic": string, "leftLabel": string, "rightLabel": string, "commentary": string, "nudges": string[]}`,
      final: `Produce the closing performance review (kind = "final"). Respond with STRICT JSON only: {"commentary": string}`,
    };

    const userPrompt = [
      `REVIEW CYCLE DATA (JSON):`,
      JSON.stringify(reviewData, null, 2),
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
      max_tokens: kind === "hr" ? 700 : 500,
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
      const nudges = (Array.isArray(parsed.nudges) ? parsed.nudges : [])
        .map((n) => cleanString(n, 140))
        .filter((n) => n.length > 0)
        .slice(0, 5);
      if (!topic || !leftLabel || !rightLabel) {
        return failure("Malformed spectrum from Overlord");
      }
      return Response.json({
        ok: true,
        topic,
        leftLabel,
        rightLabel,
        commentary,
        nudges,
      });
    }

    if (kind === "hr") {
      const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
        .map((q) => cleanString(q, 300))
        .slice(0, hrPairs.length);
      const feedbackPrompt = cleanString(parsed.feedbackPrompt, 300);
      if (questions.filter((q) => q.length > 0).length === 0) {
        return failure("Malformed HR questions from Overlord");
      }
      return Response.json({ ok: true, questions, feedbackPrompt });
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
