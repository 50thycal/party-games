import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GamePhase, GameContext, Player } from "@/engine/types";

// ============================================================================
// HR Investigation — three investigation rounds, one case per employee per round
// ----------------------------------------------------------------------------
// A full game:
//   1. Accusation   every employee files an HR report on an assigned colleague
//                   (prompts drawn from a fixed corporate-grievance bank)
//   2. Interview    EVERY employee is shown a manager-reframed version of the
//                   accusation about them and explains what actually happened
//   3. Resolution   for each employee, HR issues a ruling + a new Company
//                   Guideline born from that incident
//   4. Challenges   one challenge PER guideline (so #challenges == #players),
//                   alternating between the two types:
//                     A) Spectrum Review  a rotating employee privately rates the
//                        new policy; everyone else guesses where they landed
//                     B) Guideline Thread everyone comments on the policy, tagging
//                        (@) who they think it targets inside their comment
//   5. Reveal       each challenge ends on a "case closed" screen
// ============================================================================

// ============================================================================
// Tunable constants
// ============================================================================

// --- Spectrum Review (Challenge A) scoring ---
// Distance bands: how close a guess lands to where the rater put the policy
// (d = |guess - stance|) -> Performance Points.
const BAND_BULLSEYE_DIST = 5; // d <= 5  -> bullseye
const BAND_CLOSE_DIST = 15; // d <= 15 -> close
const BAND_WARM_DIST = 30; // d <= 30 -> warm
const BAND_BULLSEYE_PTS = 5;
const BAND_CLOSE_PTS = 3;
const BAND_WARM_PTS = 1;

// --- Guideline Thread (Challenge B) scoring ---
export const COMMENT_VOTE_PTS = 2; // points per vote your comment receives
export const ATMENTION_BONUS = 3; // bonus for correctly @-tagging the target

const MAX_ACCUSATION_LENGTH = 280;
const MAX_EXPLANATION_LENGTH = 400;
const MAX_COMMENT_LENGTH = 240;
const MAX_CASE_LOG = 40;
const MAX_NUDGES = 5;
const MAX_NUDGE_LENGTH = 140;
export const TOTAL_INVESTIGATION_ROUNDS = 3;

// ============================================================================
// The corporate grievance bank — HR report prompts ({subject} interpolated).
// Roughly half relatable office grievances, half questions from a company that
// is not entirely right. All of them tee up a silly answer about a coworker.
// ============================================================================
export const HR_QUESTION_BANK: string[] = [
  // --- ordinary grievances, as filed anywhere ---
  "Has {subject} been taking suspiciously long bathroom breaks?",
  "Has {subject} been showing up late to work more than usual?",
  "Has {subject} been microwaving fish in the shared kitchen again?",
  "Does {subject} mute themselves to eat during video calls?",
  "Is {subject} 'working from home' or working from the beach?",
  "Does {subject} reply-all when they absolutely should not?",
  "Has {subject} taken the last coffee without starting a new pot?",
  "Does {subject} schedule meetings that could have been an email?",
  "Has {subject} been stealing office supplies for 'home office' use?",
  "Does {subject} keep their camera off in every single meeting?",
  "Has {subject} ever taken credit for someone else's idea?",
  "Has {subject} been leaving passive-aggressive notes on the fridge?",
  "Does {subject} wield 'per my last email' as a weapon?",
  "Does {subject} say 'let's circle back' and then never circle back?",
  "Has {subject} been napping in the wellness room during work hours?",
  "Does {subject} conveniently go on mute the moment they're asked a question?",
  "Has {subject} ghosted a calendar invite they clearly saw?",
  "Does {subject} log off at exactly 4:59 every single day?",
  "Has {subject} taken another 'sick day' that landed on a Friday?",
  "Has {subject} been eating someone else's labeled lunch from the fridge?",
  "Does {subject} reply 'sounds good!' without reading the message?",
  "Does {subject} take a two-hour lunch and call it a 'working lunch'?",
  "Does {subject} say 'great question' to stall when they don't know the answer?",
  "Has {subject} been dodging the mandatory cybersecurity training?",
  "Does {subject} show up to the potluck with store-bought and zero effort?",
  "Has {subject} been treating 'reply by EOD' as a gentle suggestion?",
  // --- grievances specific to this company ---
  "Does {subject} actually participate in the monthly safety moment? The safety moment participates in them.",
  "Has {subject} been seen near the wellness floor? The wellness floor remains unavailable.",
  "Does {subject} still match their badge photo? Describe any drift.",
  "Has {subject} been comparing case numbers with other departments? Report the numbers they compared.",
  "Does {subject} remember the previous office layout? Describe what they claim to remember.",
  "Has {subject} attended the mandatory retreat? Attendance records show no one attended the mandatory retreat.",
  "Does {subject} greet the building when arriving? The building has commented on this.",
  "Has {subject} been using the elevator button for the floor we do not discuss?",
  "Does {subject} eat lunch at their desk in a way that suggests they are being observed? They are not being observed. Describe the behavior anyway.",
  "Has {subject} filed this exact report about you before? Answer as if they had.",
  "Does {subject} respond to their name on the first attempt, or does it take several? Which name?",
  "Has {subject} been leaving work through the correct exit? List any incorrect exits they prefer.",
  "Does {subject} water the third-floor plant? Someone does. It is thriving. It should not be.",
  "Has {subject} shown signs of remembering the previous cohort? Give one example.",
  "Does {subject} decorate their desk in a way that implies they intend to stay? Describe the items.",
  "Has {subject} been humming the onboarding jingle? The onboarding jingle was retired for a reason.",
  "Does {subject} take the stairs between floors three and five? Explain how.",
  "Has {subject} ever replied to an email that had not been sent yet? Include timestamps if convenient.",
  "Does {subject} know where the suggestion box goes when it is emptied? Do they seem at peace with it?",
  "Has {subject} been photocopying their own hands? The count is currently at eleven.",
  "Does {subject} maintain eye contact with the lobby portrait? The portrait has filed no complaints. Yet.",
  "Has {subject} RSVP'd to the holiday party? The date has not been announced. Their RSVP is on file.",
  "Does {subject} avoid the break room at 3:15? Everyone avoids the break room at 3:15. Why do they?",
  "Has {subject} been keeping personal items in the refrigerator past Friday? The refrigerator keeps its own records.",
];

// ============================================================================
// Types
// ============================================================================

export type PRPhase =
  | "lobby"
  | "intro" // HR's opening address + synchronized tutorial
  | "accusation" // everyone files a report on an assigned colleague
  | "reframing" // HR reframes every accusation into managerial language
  | "interview" // everyone explains the accusation about them
  | "case_prep" // HR drafts the ruling + guideline for the current case
  | "a_stance" // Challenge A: the rotating rater privately rates the policy
  | "a_guess" // Challenge A: everyone else guesses where the rater landed
  | "b_comment" // Challenge B: everyone comments (with an @-tag guess inside)
  | "b_vote" // Challenge B: vote the funniest comment
  | "reveal" // "case closed" for the current guideline
  | "game_over";

export type PRHeat = "mild" | "spicy" | "scorched";

export type PRChallenge = "spectrum" | "thread";

// HR voice options for text-to-speech. IDs are OpenAI TTS voices.
export const PR_VOICES: Array<{ id: string; label: string; blurb: string }> = [
  { id: "onyx", label: "The Overlord", blurb: "Deep, ominous" },
  { id: "ash", label: "Middle Management", blurb: "Dry, clipped" },
  { id: "sage", label: "The Consultant", blurb: "Calm, knowing" },
  { id: "echo", label: "Facilities", blurb: "Flat, official" },
  { id: "shimmer", label: "The New Hire", blurb: "Bright, unsettling" },
  { id: "alloy", label: "Reception", blurb: "Neutral" },
];
export const PR_VOICE_IDS = PR_VOICES.map((v) => v.id);
const DEFAULT_VOICE_ID = "onyx";

export type PRAssignment = { subjectId: string; subjectName: string };

// One case per employee — everything the investigation knows about one incident.
export type PRCase = {
  accusedId: string;
  accusedName: string;
  reporterId: string | null;
  reporterName: string;
  question: string; // the bank prompt the reporter answered
  rawAccusation: string; // exactly what the reporter wrote
  accusation: string | null; // AI manager-reframed version (shown everywhere)
  explanation: string | null; // the accused's interview answer
  challenge: PRChallenge; // which challenge this guideline resolves through
  raterId: string | null; // spectrum only — the rotating rater
  raterName: string | null;
  // filled during case_prep
  hrResponse: string | null;
  guideline: string | null;
  spectrumQuestion: string | null;
  leftLabel: string | null;
  rightLabel: string | null;
};

// An archived accusation for the AI's callbacks.
export type PRCaseRecord = {
  reporterName: string;
  accusedName: string;
  question: string;
  accusation: string;
};

export type PRSpectrumResult = { name: string; guess: number; points: number };

export type PRThreadResult = {
  id: string;
  name: string;
  comment: string;
  votes: number;
  commentPoints: number;
  atBonus: number;
  taggedName: string | null; // who this commenter @-tagged
  guessedTarget: boolean; // did they tag the real accused
  eligibleForBonus: boolean;
};

export type PRLastRound = {
  challenge: PRChallenge;
  caseNumber: number;
  totalCases: number;
  investigationRound: number;
  totalInvestigationRounds: number;
  rawAccusation: string;
  accusation: string;
  reporterName: string;
  accusedName: string;
  explanation: string;
  hrResponse: string;
  guideline: string;
  // spectrum-only
  spectrumQuestion?: string;
  leftLabel?: string;
  rightLabel?: string;
  raterName?: string;
  stance?: number;
  spectrumResults?: PRSpectrumResult[];
  // thread-only
  threadResults?: PRThreadResult[];
};

export type PRState = {
  phase: PRPhase;
  heat: PRHeat;
  investigationRound: number;
  totalInvestigationRounds: number;
  tutorialStep: number;

  // --- accusation window ---
  assignments: Record<string, PRAssignment>; // reporterId -> subject
  questions: Record<string, string>; // reporterId -> bank prompt
  accusations: Record<string, string>; // reporterId -> raw text

  // --- reframing + interview (keyed by accused) ---
  reframes: Record<string, string>; // accusedId -> managerial reframe
  explanations: Record<string, string>; // accusedId -> defense

  // --- the built docket ---
  cases: PRCase[];
  totalCases: number;
  challengeIndex: number; // which case is currently being challenged (0-based)

  // --- current challenge working state (reset per case) ---
  stance: number | null; // rater's private 0..100
  guesses: Record<string, number>; // guesserId -> 0..100
  comments: Record<string, string>; // authorId -> comment (may contain @tag)
  votes: Record<string, string>; // voterId -> authorId voted funniest

  // --- scoring ---
  scores: Record<string, number>;
  roundScores: Record<string, number>; // this case's delta

  // --- HR terminal ---
  introText: string | null;
  nudges: string[];

  // --- context / reveal ---
  caseLog: PRCaseRecord[];
  lastRound: PRLastRound | null;
  finalCommentary: string | null;

  // --- voice ---
  voiceEnabled: boolean;
  voiceId: string;
};

export type PRActionType =
  | "START_GAME"
  | "SET_INTRO"
  | "SET_TUTORIAL_STEP"
  | "BEGIN"
  | "SUBMIT_ACCUSATION"
  | "CLOSE_ACCUSATION"
  | "SET_REFRAMES"
  | "SUBMIT_EXPLANATION"
  | "SKIP_INTERVIEW"
  | "SET_CASE_RESOLUTION"
  | "SET_STANCE"
  | "SUBMIT_GUESS"
  | "SUBMIT_COMMENT"
  | "CLOSE_COMMENTS"
  | "SUBMIT_VOTE"
  | "REVEAL"
  | "NEXT_CASE"
  | "SET_FINAL"
  | "SET_VOICE"
  | "PLAY_AGAIN";

export interface PRAction extends BaseAction {
  type: PRActionType;
  payload?: {
    heat?: PRHeat;
    enabled?: boolean;
    voiceId?: string;
    commentary?: string;
    tutorialStep?: number;
    accusation?: string;
    reframes?: Record<string, string>; // accusedId -> reframe
    explanation?: string;
    hrResponse?: string;
    guideline?: string;
    spectrumQuestion?: string;
    leftLabel?: string;
    rightLabel?: string;
    nudges?: string[];
    stance?: number;
    guess?: number;
    comment?: string;
    voteFor?: string;
  };
}

// ============================================================================
// Helpers
// ============================================================================

function initialState(_players: Player[]): PRState {
  return {
    phase: "lobby",
    heat: "spicy",
    investigationRound: 1,
    totalInvestigationRounds: TOTAL_INVESTIGATION_ROUNDS,
    tutorialStep: 0,
    assignments: {},
    questions: {},
    accusations: {},
    reframes: {},
    explanations: {},
    cases: [],
    totalCases: 0,
    challengeIndex: 0,
    stance: null,
    guesses: {},
    comments: {},
    votes: {},
    scores: {},
    roundScores: {},
    introText: null,
    nudges: [],
    caseLog: [],
    lastRound: null,
    finalCommentary: null,
    voiceEnabled: false,
    voiceId: DEFAULT_VOICE_ID,
  };
}

function getPhase(state: PRState): GamePhase {
  return state.phase;
}

function isHost(ctx: GameContext): boolean {
  return ctx.room.hostId === ctx.playerId;
}

// Automatic "HR" beats (intro / reframes / rulings / final) are fetched from the
// AI by one client and written back via an action. In multiplayer only the host
// runs them; in hotseat/simulation the whole game lives on one device, so any
// active player may commit them — otherwise the game stalls waiting for the host
// seat to come back around during pass-and-play.
function canDrive(ctx: GameContext): boolean {
  return isHost(ctx) || ctx.room.mode !== "multiplayer";
}

function clampInt0100(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function band(d: number): number {
  if (d <= BAND_BULLSEYE_DIST) return BAND_BULLSEYE_PTS;
  if (d <= BAND_CLOSE_DIST) return BAND_CLOSE_PTS;
  if (d <= BAND_WARM_DIST) return BAND_WARM_PTS;
  return 0;
}

function sanitizeNudges(raw: unknown): string[] {
  return (Array.isArray(raw) ? raw : [])
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim().slice(0, MAX_NUDGE_LENGTH))
    .filter((v) => v.length > 0)
    .slice(0, MAX_NUDGES);
}

/** The raw accusation written about `accusedId`, via their assigned reporter. */
function accusationAbout(
  state: PRState,
  accusedId: string
): { reporterId: string | null; raw: string; question: string } {
  for (const [reporterId, a] of Object.entries(state.assignments)) {
    if (a.subjectId === accusedId) {
      return {
        reporterId,
        raw: state.accusations[reporterId] ?? "",
        question: state.questions[reporterId] ?? "",
      };
    }
  }
  return { reporterId: null, raw: "", question: "" };
}

/**
 * Which player @-tag a comment contains: the earliest "@Name" that resolves to
 * a real player (ties broken by the longest matching name). Returns the tagged
 * player's id, or null.
 */
export function parseMention(text: string, players: Player[]): string | null {
  const lower = text.toLowerCase();
  let best: { index: number; id: string; len: number } | null = null;
  for (const p of players) {
    const needle = "@" + p.name.toLowerCase();
    const idx = lower.indexOf(needle);
    if (idx < 0) continue;
    if (
      best === null ||
      idx < best.index ||
      (idx === best.index && p.name.length > best.len)
    ) {
      best = { index: idx, id: p.id, len: p.name.length };
    }
  }
  return best?.id ?? null;
}

/**
 * Open the accusation window: assign each employee a colleague to report on
 * (cyclic shift => a permutation, so everyone is reported on exactly once) and
 * hand each reporter a distinct prompt from the grievance bank.
 */
function openAccusationWindow(state: PRState, ctx: GameContext): PRState {
  const players = ctx.room.players;
  const n = players.length;
  if (n < 2) return state;

  const shift = 1 + Math.floor(ctx.random() * (n - 1)); // 1..n-1, never 0
  const assignments: Record<string, PRAssignment> = {};
  players.forEach((p, i) => {
    const subject = players[(i + shift) % n];
    assignments[p.id] = { subjectId: subject.id, subjectName: subject.name };
  });

  // Deal distinct prompts from a shuffled bank.
  const pool = [...HR_QUESTION_BANK];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(ctx.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const questions: Record<string, string> = {};
  players.forEach((p, i) => {
    const q = pool[i % pool.length];
    questions[p.id] = q.replace(
      /\{subject\}/g,
      assignments[p.id].subjectName
    );
  });

  return {
    ...state,
    phase: "accusation",
    assignments,
    questions,
    accusations: {},
    reframes: {},
    explanations: {},
    cases: [],
    challengeIndex: 0,
    stance: null,
    guesses: {},
    comments: {},
    votes: {},
    roundScores: {},
  };
}

/** Everyone has filed (or the host force-closed): move on to reframing. */
function closeAccusationWindow(state: PRState, ctx: GameContext): PRState {
  const records: PRCaseRecord[] = [];
  for (const [reporterId, text] of Object.entries(state.accusations)) {
    const a = state.assignments[reporterId];
    if (!a) continue;
    const reporter = ctx.room.players.find((p) => p.id === reporterId);
    records.push({
      reporterName: reporter?.name ?? "Former employee",
      accusedName: a.subjectName,
      question: state.questions[reporterId] ?? "",
      accusation: text,
    });
  }
  return {
    ...state,
    caseLog: [...state.caseLog, ...records].slice(-MAX_CASE_LOG),
    phase: "reframing",
  };
}

/**
 * Build the docket once interviews close: one case per employee, in seating
 * order, alternating challenge types. Spectrum cases get a rotating rater
 * (never the accused) so the on-the-spot role travels around the table.
 */
function buildCases(state: PRState, ctx: GameContext): PRState {
  const players = ctx.room.players;
  const n = players.length;

  const cases: PRCase[] = [];
  let raterPtr = Math.floor(ctx.random() * n);

  players.forEach((accused, i) => {
    const src = accusationAbout(state, accused.id);
    const reporter = src.reporterId
      ? players.find((p) => p.id === src.reporterId)
      : undefined;
    const challenge: PRChallenge = i % 2 === 0 ? "spectrum" : "thread";

    let raterId: string | null = null;
    let raterName: string | null = null;
    if (challenge === "spectrum") {
      let tries = 0;
      let rater = players[raterPtr % n];
      while (rater.id === accused.id && tries < n) {
        raterPtr++;
        rater = players[raterPtr % n];
        tries++;
      }
      raterId = rater.id;
      raterName = rater.name;
      raterPtr++;
    }

    cases.push({
      accusedId: accused.id,
      accusedName: accused.name,
      reporterId: src.reporterId,
      reporterName: reporter?.name ?? "HR",
      question: src.question,
      rawAccusation: src.raw,
      accusation: state.reframes[accused.id] ?? null,
      explanation: state.explanations[accused.id] ?? null,
      challenge,
      raterId,
      raterName,
      hrResponse: null,
      guideline: null,
      spectrumQuestion: null,
      leftLabel: null,
      rightLabel: null,
    });
  });

  return {
    ...state,
    cases,
    totalCases: cases.length,
    challengeIndex: 0,
    phase: "case_prep",
  };
}

/** Reset the per-case working state and route to the right challenge start. */
function startChallenge(state: PRState, index: number): PRState {
  const c = state.cases[index];
  return {
    ...state,
    challengeIndex: index,
    stance: null,
    guesses: {},
    comments: {},
    votes: {},
    roundScores: {},
    phase: c.challenge === "spectrum" ? "a_stance" : "b_comment",
  };
}

function currentCase(state: PRState): PRCase | undefined {
  return state.cases[state.challengeIndex];
}

function buildLastRound(state: PRState, extra: Partial<PRLastRound>): PRLastRound {
  const c = currentCase(state);
  return {
    challenge: c?.challenge ?? "spectrum",
    caseNumber: state.challengeIndex + 1,
    totalCases: state.totalCases,
    investigationRound: state.investigationRound,
    totalInvestigationRounds: state.totalInvestigationRounds,
    rawAccusation: c?.rawAccusation ?? "",
    accusation: c?.accusation ?? "",
    reporterName: c?.reporterName ?? "",
    accusedName: c?.accusedName ?? "",
    explanation: c?.explanation ?? "",
    hrResponse: c?.hrResponse ?? "",
    guideline: c?.guideline ?? "",
    ...extra,
  };
}

/** Spectrum: guessers score for reading the rater; the rater shares the total. */
function scoreSpectrum(state: PRState, ctx: GameContext): PRState {
  const c = currentCase(state);
  if (!c || !c.raterId) return state;
  const rater = ctx.room.players.find((p) => p.id === c.raterId);
  if (!rater) return state;

  const stance = state.stance ?? 50;
  const guessers = ctx.room.players.filter((p) => p.id !== rater.id);

  const scores = { ...state.scores };
  const roundScores: Record<string, number> = {};
  const results: PRSpectrumResult[] = [];
  let raterScore = 0;

  for (const g of guessers) {
    const guess = state.guesses[g.id];
    if (guess === undefined) {
      roundScores[g.id] = 0;
      continue;
    }
    const points = band(Math.abs(guess - stance));
    roundScores[g.id] = points;
    scores[g.id] = Math.max(0, (scores[g.id] ?? 0) + points);
    raterScore += points;
    results.push({ name: g.name, guess, points });
  }

  roundScores[rater.id] = (roundScores[rater.id] ?? 0) + raterScore;
  scores[rater.id] = Math.max(0, (scores[rater.id] ?? 0) + raterScore);

  return {
    ...state,
    phase: "reveal",
    scores,
    roundScores,
    lastRound: buildLastRound(state, {
      spectrumQuestion: c.spectrumQuestion ?? "",
      leftLabel: c.leftLabel ?? "",
      rightLabel: c.rightLabel ?? "",
      raterName: rater.name,
      stance,
      spectrumResults: results,
    }),
  };
}

/**
 * Thread: comments score per vote; the @-tag inside a comment is that author's
 * guess of who the guideline targets. The reporter and the accused already know
 * the answer, so they earn no tag bonus.
 */
function scoreThread(state: PRState, ctx: GameContext): PRState {
  const players = ctx.room.players;
  const c = currentCase(state);
  if (!c) return state;

  const voteCount: Record<string, number> = {};
  for (const authorId of Object.values(state.votes)) {
    voteCount[authorId] = (voteCount[authorId] ?? 0) + 1;
  }

  const scores = { ...state.scores };
  const roundScores: Record<string, number> = {};
  const results: PRThreadResult[] = [];

  for (const p of players) {
    const comment = state.comments[p.id];
    const votes = voteCount[p.id] ?? 0;
    const commentPoints = votes * COMMENT_VOTE_PTS;

    const taggedId =
      comment !== undefined ? parseMention(comment, players) : null;
    const taggedName = taggedId
      ? players.find((pl) => pl.id === taggedId)?.name ?? null
      : null;
    const eligibleForBonus =
      p.id !== c.accusedId && p.id !== c.reporterId;
    const guessedTarget = taggedId === c.accusedId;
    const atBonus = guessedTarget && eligibleForBonus ? ATMENTION_BONUS : 0;

    const total = commentPoints + atBonus;
    roundScores[p.id] = total;
    scores[p.id] = Math.max(0, (scores[p.id] ?? 0) + total);

    if (comment !== undefined) {
      results.push({
        id: p.id,
        name: p.name,
        comment,
        votes,
        commentPoints,
        atBonus,
        taggedName,
        guessedTarget,
        eligibleForBonus,
      });
    }
  }

  results.sort((a, b) => b.votes - a.votes);

  return {
    ...state,
    phase: "reveal",
    scores,
    roundScores,
    lastRound: buildLastRound(state, { threadResults: results }),
  };
}

// ============================================================================
// Reducer
// ============================================================================

function reducer(state: PRState, action: PRAction, ctx: GameContext): PRState {
  switch (action.type) {
    case "START_GAME": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "lobby") return state;
      if (ctx.room.players.length === 0) return state;

      const heat = action.payload?.heat;
      const validHeat: PRHeat =
        heat === "mild" || heat === "spicy" || heat === "scorched"
          ? heat
          : "spicy";

      const scores: Record<string, number> = {};
      for (const p of ctx.room.players) scores[p.id] = 0;

      return {
        ...initialState(ctx.room.players),
        phase: "intro",
        heat: validHeat,
        totalCases: ctx.room.players.length,
        investigationRound: 1,
        totalInvestigationRounds: TOTAL_INVESTIGATION_ROUNDS,
        tutorialStep: 0,
        scores,
        voiceEnabled: state.voiceEnabled,
        voiceId: state.voiceId,
      };
    }

    case "SET_INTRO": {
      if (!canDrive(ctx)) return state;
      if (state.phase !== "intro") return state;
      const commentary = action.payload?.commentary;
      if (typeof commentary !== "string" || !commentary.trim()) return state;
      return { ...state, introText: commentary.trim() };
    }


    case "SET_TUTORIAL_STEP": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "intro") return state;
      const step = action.payload?.tutorialStep;
      if (typeof step !== "number" || !Number.isFinite(step)) return state;
      return { ...state, tutorialStep: Math.max(0, Math.round(step)) };
    }

    case "BEGIN": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "intro") return state;
      return openAccusationWindow(state, ctx);
    }

    case "SUBMIT_ACCUSATION": {
      if (state.phase !== "accusation") return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;
      if (!state.assignments[ctx.playerId]) return state;

      const text =
        typeof action.payload?.accusation === "string"
          ? action.payload.accusation.trim().slice(0, MAX_ACCUSATION_LENGTH)
          : "";
      if (!text) return state;

      const next: PRState = {
        ...state,
        accusations: { ...state.accusations, [ctx.playerId]: text },
      };

      const reporters = ctx.room.players.filter(
        (p) => next.assignments[p.id] !== undefined
      );
      const allFiled =
        reporters.length > 0 &&
        reporters.every((p) => next.accusations[p.id] !== undefined);

      return allFiled ? closeAccusationWindow(next, ctx) : next;
    }

    case "CLOSE_ACCUSATION": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "accusation") return state;
      // Need at least one filing to build a docket.
      if (Object.keys(state.accusations).length === 0) return state;
      return closeAccusationWindow(state, ctx);
    }

    case "SET_REFRAMES": {
      if (!canDrive(ctx)) return state;
      if (state.phase !== "reframing") return state;
      const raw = action.payload?.reframes;
      if (!raw || typeof raw !== "object") return state;

      const reframes: Record<string, string> = {};
      for (const p of ctx.room.players) {
        const val = raw[p.id];
        if (typeof val === "string" && val.trim()) {
          reframes[p.id] = val.trim().slice(0, MAX_ACCUSATION_LENGTH);
        }
      }
      if (Object.keys(reframes).length === 0) return state;
      return { ...state, reframes, phase: "interview" };
    }

    case "SUBMIT_EXPLANATION": {
      if (state.phase !== "interview") return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;

      const text =
        typeof action.payload?.explanation === "string"
          ? action.payload.explanation.trim().slice(0, MAX_EXPLANATION_LENGTH)
          : "";
      if (!text) return state;

      const next: PRState = {
        ...state,
        explanations: { ...state.explanations, [ctx.playerId]: text },
      };

      const allDone = ctx.room.players.every(
        (p) => next.explanations[p.id] !== undefined
      );
      return allDone ? buildCases(next, ctx) : next;
    }

    case "SKIP_INTERVIEW": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "interview") return state;
      return buildCases(state, ctx);
    }

    case "SET_CASE_RESOLUTION": {
      if (!canDrive(ctx)) return state;
      if (state.phase !== "case_prep") return state;
      const c = currentCase(state);
      if (!c) return state;

      const hrResponse =
        typeof action.payload?.hrResponse === "string"
          ? action.payload.hrResponse.trim()
          : "";
      const guideline =
        typeof action.payload?.guideline === "string"
          ? action.payload.guideline.trim()
          : "";
      if (!hrResponse || !guideline) return state;

      let spectrumQuestion = c.spectrumQuestion;
      let leftLabel = c.leftLabel;
      let rightLabel = c.rightLabel;
      if (c.challenge === "spectrum") {
        const q =
          typeof action.payload?.spectrumQuestion === "string"
            ? action.payload.spectrumQuestion.trim()
            : "";
        const l =
          typeof action.payload?.leftLabel === "string"
            ? action.payload.leftLabel.trim()
            : "";
        const r =
          typeof action.payload?.rightLabel === "string"
            ? action.payload.rightLabel.trim()
            : "";
        if (!q || !l || !r) return state;
        spectrumQuestion = q;
        leftLabel = l;
        rightLabel = r;
      }

      const cases = state.cases.map((x, i) =>
        i === state.challengeIndex
          ? { ...x, hrResponse, guideline, spectrumQuestion, leftLabel, rightLabel }
          : x
      );

      const withResolution: PRState = {
        ...state,
        cases,
        nudges: sanitizeNudges(action.payload?.nudges),
      };
      return startChallenge(withResolution, state.challengeIndex);
    }

    case "SET_STANCE": {
      if (state.phase !== "a_stance") return state;
      const c = currentCase(state);
      if (!c || ctx.playerId !== c.raterId) return state;
      const stance = clampInt0100(action.payload?.stance);
      if (stance === null) return state;
      return { ...state, stance, phase: "a_guess" };
    }

    case "SUBMIT_GUESS": {
      if (state.phase !== "a_guess") return state;
      const c = currentCase(state);
      if (!c) return state;
      if (ctx.playerId === c.raterId) return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;

      const guess = clampInt0100(action.payload?.guess);
      if (guess === null) return state;

      const next: PRState = {
        ...state,
        guesses: { ...state.guesses, [ctx.playerId]: guess },
      };
      const guessers = ctx.room.players.filter((p) => p.id !== c.raterId);
      const allGuessed =
        guessers.length > 0 &&
        guessers.every((g) => next.guesses[g.id] !== undefined);
      return allGuessed ? scoreSpectrum(next, ctx) : next;
    }

    case "SUBMIT_COMMENT": {
      if (state.phase !== "b_comment") return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;
      const text =
        typeof action.payload?.comment === "string"
          ? action.payload.comment.trim().slice(0, MAX_COMMENT_LENGTH)
          : "";
      if (!text) return state;

      const next: PRState = {
        ...state,
        comments: { ...state.comments, [ctx.playerId]: text },
      };
      const allCommented =
        ctx.room.players.length > 0 &&
        ctx.room.players.every((p) => next.comments[p.id] !== undefined);
      return allCommented ? { ...next, phase: "b_vote" } : next;
    }

    case "CLOSE_COMMENTS": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "b_comment") return state;
      if (Object.keys(state.comments).length === 0) return state;
      return { ...state, phase: "b_vote" };
    }

    case "SUBMIT_VOTE": {
      if (state.phase !== "b_vote") return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;

      const voteFor =
        typeof action.payload?.voteFor === "string"
          ? action.payload.voteFor
          : null;
      if (
        !voteFor ||
        voteFor === ctx.playerId ||
        state.comments[voteFor] === undefined
      ) {
        return state;
      }

      const next: PRState = {
        ...state,
        votes: { ...state.votes, [ctx.playerId]: voteFor },
      };
      const allVoted = ctx.room.players.every(
        (p) => next.votes[p.id] !== undefined
      );
      return allVoted ? scoreThread(next, ctx) : next;
    }

    case "REVEAL": {
      if (!isHost(ctx)) return state;
      if (state.phase === "a_guess") return scoreSpectrum(state, ctx);
      if (state.phase === "b_vote") return scoreThread(state, ctx);
      return state;
    }

    case "NEXT_CASE": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "reveal") return state;
      if (state.challengeIndex < state.totalCases - 1) {
        return { ...startChallenge(state, state.challengeIndex + 1), phase: "case_prep" };
      }
      if (state.investigationRound < state.totalInvestigationRounds) {
        return openAccusationWindow(
          {
            ...state,
            investigationRound: state.investigationRound + 1,
            totalCases: ctx.room.players.length,
            challengeIndex: 0,
            cases: [],
            lastRound: null,
            nudges: [],
          },
          ctx
        );
      }
      return { ...state, phase: "game_over" };
    }

    case "SET_FINAL": {
      if (!canDrive(ctx)) return state;
      if (state.phase !== "game_over") return state;
      const commentary = action.payload?.commentary;
      if (typeof commentary !== "string" || !commentary.trim()) return state;
      return { ...state, finalCommentary: commentary.trim() };
    }

    case "SET_VOICE": {
      if (!isHost(ctx)) return state;
      let voiceEnabled = state.voiceEnabled;
      let voiceId = state.voiceId;
      if (typeof action.payload?.enabled === "boolean") {
        voiceEnabled = action.payload.enabled;
      }
      if (
        typeof action.payload?.voiceId === "string" &&
        PR_VOICE_IDS.includes(action.payload.voiceId)
      ) {
        voiceId = action.payload.voiceId;
      }
      return { ...state, voiceEnabled, voiceId };
    }

    case "PLAY_AGAIN": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "game_over") return state;
      return {
        ...initialState(ctx.room.players),
        heat: state.heat,
        voiceEnabled: state.voiceEnabled,
        voiceId: state.voiceId,
      };
    }

    default:
      return state;
  }
}

// ============================================================================
// Game template
// ============================================================================

export const performanceReviewGame = defineGame<PRState, PRAction>({
  id: "performance-review",
  name: "HR Investigation",
  description:
    "File a complaint, survive the interview, and turn every workplace incident into company policy. HR thanks you in advance.",
  minPlayers: 3,
  maxPlayers: 8,
  initialState,
  reducer,
  getPhase,
  isActionAllowed(state, action, ctx) {
    switch (action.type) {
      case "START_GAME":
        return isHost(ctx) && state.phase === "lobby";
      case "SET_INTRO":
        return canDrive(ctx) && state.phase === "intro";
      case "SET_TUTORIAL_STEP":
        return isHost(ctx) && state.phase === "intro";
      case "BEGIN":
        return isHost(ctx) && state.phase === "intro";
      case "SUBMIT_ACCUSATION":
        return (
          state.phase === "accusation" &&
          state.assignments[ctx.playerId] !== undefined
        );
      case "CLOSE_ACCUSATION":
        return isHost(ctx) && state.phase === "accusation";
      case "SET_REFRAMES":
        return canDrive(ctx) && state.phase === "reframing";
      case "SUBMIT_EXPLANATION":
        return state.phase === "interview";
      case "SKIP_INTERVIEW":
        return isHost(ctx) && state.phase === "interview";
      case "SET_CASE_RESOLUTION":
        return canDrive(ctx) && state.phase === "case_prep";
      case "SET_STANCE":
        return (
          state.phase === "a_stance" &&
          ctx.playerId === currentCase(state)?.raterId
        );
      case "SUBMIT_GUESS":
        return (
          state.phase === "a_guess" &&
          ctx.playerId !== currentCase(state)?.raterId
        );
      case "SUBMIT_COMMENT":
        return state.phase === "b_comment";
      case "CLOSE_COMMENTS":
        return isHost(ctx) && state.phase === "b_comment";
      case "SUBMIT_VOTE":
        return state.phase === "b_vote";
      case "REVEAL":
        return (
          isHost(ctx) &&
          (state.phase === "a_guess" || state.phase === "b_vote")
        );
      case "NEXT_CASE":
        return isHost(ctx) && state.phase === "reveal";
      case "SET_FINAL":
        return canDrive(ctx) && state.phase === "game_over";
      case "SET_VOICE":
        return isHost(ctx);
      case "PLAY_AGAIN":
        return isHost(ctx) && state.phase === "game_over";
      default:
        return true;
    }
  },
});
