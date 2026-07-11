import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GamePhase, GameContext, Player } from "@/engine/types";

// ============================================================================
// HR Investigation — round loop
// ----------------------------------------------------------------------------
// Each round:
//   1. Accusation      every employee reports on an assigned colleague
//   2. Interview       the featured accused explains themselves to HR
//   3. Resolution      the Overlord issues an HR response + a Company Guideline
//   4. Challenge       alternates each round:
//        A) Spectrum Review    accused privately ranks the guideline; others guess
//        B) Guideline Thread   everyone comments on the policy + guesses the accused
//   5. Reveal          the whole case is unsealed and points are awarded
// ============================================================================

// ============================================================================
// Tunable constants
// ============================================================================

// Roughly this many featured cases per employee across a full cycle.
export const ROUNDS_PER_PLAYER = 2;

// --- Spectrum Review (Challenge A) scoring ---
// Distance bands: how close a colleague's guess is to where the accused ranked
// the guideline (d = |guess - stance|) -> Performance Points.
const BAND_BULLSEYE_DIST = 5; // d <= 5  -> bullseye
const BAND_CLOSE_DIST = 15; // d <= 15 -> close
const BAND_WARM_DIST = 30; // d <= 30 -> warm
const BAND_BULLSEYE_PTS = 5;
const BAND_CLOSE_PTS = 3;
const BAND_WARM_PTS = 1;

// --- Guideline Thread (Challenge B) scoring ---
export const COMMENT_VOTE_PTS = 2; // points per vote your comment receives
export const ATMENTION_BONUS = 3; // bonus for correctly tagging the accused

const MAX_ACCUSATION_LENGTH = 280;
const MAX_ACCUSATION_QUESTION_LENGTH = 300;
const MAX_EXPLANATION_LENGTH = 400;
const MAX_COMMENT_LENGTH = 240;
const MAX_CASE_LOG = 40;
const MAX_NUDGES = 5;
const MAX_NUDGE_LENGTH = 140;

// ============================================================================
// Types
// ============================================================================

export type PRPhase =
  | "lobby"
  | "intro" // the Overlord's opening address in the shared terminal
  | "accusation" // every employee reports on their assigned colleague
  | "interview" // the featured accused explains what actually happened
  | "resolving" // HR deliberates (host fetches the AI resolution)
  | "a_stance" // Challenge A: accused privately ranks the guideline
  | "a_guess" // Challenge A: colleagues guess where the accused landed
  | "b_comment" // Challenge B: everyone comments on the guideline post
  | "b_vote" // Challenge B: vote funniest comment + tag the accused
  | "reveal"
  | "game_over";

export type PRHeat = "mild" | "spicy" | "scorched";

export type PRChallenge = "spectrum" | "thread";

// Overlord voice options for text-to-speech. IDs are OpenAI TTS voices; the
// labels/blurbs are the in-fiction flavor shown to the host.
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

// Who each employee must report on this window (subject name snapshotted so the
// record survives a roster change).
export type PRAssignment = { subjectId: string; subjectName: string };

// An archived accusation — the Overlord's intelligence file on the staff.
export type PRCaseRecord = {
  reporterName: string;
  accusedName: string;
  question: string;
  accusation: string;
  round: number;
};

// --- Challenge A (Spectrum Review) reveal rows ---
export type PRSpectrumResult = {
  name: string;
  guess: number;
  points: number;
};

// --- Challenge B (Guideline Thread) reveal rows ---
export type PRThreadResult = {
  id: string;
  name: string;
  comment: string;
  votes: number;
  commentPoints: number;
  atBonus: number;
  guessedAccused: boolean;
  eligibleForBonus: boolean;
};

export type PRLastRound = {
  challenge: PRChallenge;
  round: number;
  accusation: string;
  reporterName: string;
  accusedName: string;
  explanation: string;
  hrResponse: string;
  guideline: string;
  // Spectrum-only
  spectrumQuestion?: string;
  leftLabel?: string;
  rightLabel?: string;
  stance?: number;
  spectrumResults?: PRSpectrumResult[];
  // Thread-only
  threadResults?: PRThreadResult[];
};

export type PRState = {
  phase: PRPhase;
  heat: PRHeat;
  roundNumber: number; // 1-based
  totalRounds: number;
  challenge: PRChallenge; // this round's challenge type

  // --- accusation window ---
  accusationRound: number; // how many windows have opened (drives pairing rotation)
  assignments: Record<string, PRAssignment>; // reporterId -> subject
  accusationQuestions: Record<string, string>; // reporterId -> AI-authored prompt
  accusations: Record<string, string>; // reporterId -> accusation text (this window)

  // --- the featured case (set when the accusation window closes) ---
  accusedId: string | null;
  accusedName: string | null;
  reporterId: string | null;
  reporterName: string | null;
  accusation: string | null; // the featured accusation text
  accusationQuestion: string | null; // the prompt that produced it

  // --- interview ---
  explanation: string | null; // the accused's account (secret until reveal)

  // --- AI resolution ---
  hrResponse: string | null; // accusatory HR response (secret until reveal)
  guideline: string | null; // the new Company Guideline (public once posted)

  // --- Challenge A: Spectrum Review ---
  spectrumQuestion: string | null;
  leftLabel: string | null; // 0-pole label
  rightLabel: string | null; // 100-pole label
  stance: number | null; // 0..100 where the accused ranked it (secret until reveal)
  guesses: Record<string, number>; // guesserId -> 0..100

  // --- Challenge B: Guideline Thread ---
  comments: Record<string, string>; // authorId -> comment
  votes: Record<string, string>; // voterId -> authorId they voted funniest
  atGuesses: Record<string, string>; // guesserId -> playerId they tagged as the accused

  // --- scoring ---
  scores: Record<string, number>; // cumulative Performance Points
  roundScores: Record<string, number>; // this round's delta, for the reveal

  // --- the Overlord's terminal ---
  introText: string | null; // opening address, typed out for all staff
  nudges: string[]; // ambient "get back to work" messages

  // --- history / callbacks (fed to /api/host) ---
  caseLog: PRCaseRecord[]; // accumulated accusations, the intelligence file
  history: Array<{
    guideline: string;
    accusedName: string;
    challenge: PRChallenge;
  }>;
  lastRound: PRLastRound | null;
  finalCommentary: string | null;

  // --- voice (host-controlled TTS of the Overlord) ---
  voiceEnabled: boolean;
  voiceId: string;
};

export type PRActionType =
  | "START_GAME"
  | "SET_INTRO"
  | "BEGIN"
  | "SET_ACCUSATION_QUESTIONS"
  | "SUBMIT_ACCUSATION"
  | "CLOSE_ACCUSATION"
  | "SUBMIT_EXPLANATION"
  | "SKIP_INTERVIEW"
  | "SET_RESOLUTION"
  | "SET_STANCE"
  | "SUBMIT_GUESS"
  | "SUBMIT_COMMENT"
  | "CLOSE_COMMENTS"
  | "SUBMIT_VOTE"
  | "REVEAL"
  | "NEXT_ROUND"
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
    questions?: Record<string, string>; // reporterId -> accusation prompt
    accusation?: string;
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
    voteFor?: string; // authorId
    atGuess?: string; // playerId tagged as accused
  };
}

// ============================================================================
// Helpers
// ============================================================================

function initialState(_players: Player[]): PRState {
  return {
    phase: "lobby",
    heat: "spicy",
    roundNumber: 1,
    totalRounds: 0,
    challenge: "spectrum",
    accusationRound: 0,
    assignments: {},
    accusationQuestions: {},
    accusations: {},
    accusedId: null,
    accusedName: null,
    reporterId: null,
    reporterName: null,
    accusation: null,
    accusationQuestion: null,
    explanation: null,
    hrResponse: null,
    guideline: null,
    spectrumQuestion: null,
    leftLabel: null,
    rightLabel: null,
    stance: null,
    guesses: {},
    comments: {},
    votes: {},
    atGuesses: {},
    scores: {},
    roundScores: {},
    introText: null,
    nudges: [],
    caseLog: [],
    history: [],
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

/**
 * Reset every per-round field back to empty. Called when a fresh accusation
 * window opens so a slow client can never carry a previous case forward.
 */
function clearRound(state: PRState): PRState {
  return {
    ...state,
    accusationQuestions: {},
    accusations: {},
    accusedId: null,
    accusedName: null,
    reporterId: null,
    reporterName: null,
    accusation: null,
    accusationQuestion: null,
    explanation: null,
    hrResponse: null,
    guideline: null,
    spectrumQuestion: null,
    leftLabel: null,
    rightLabel: null,
    stance: null,
    guesses: {},
    comments: {},
    votes: {},
    atGuesses: {},
    nudges: [],
    roundScores: {},
  };
}

/**
 * Open an accusation window: assign every employee a colleague to report on via
 * a cyclic shift (varies each window, never 0), so nobody reports on themselves
 * and everyone is the subject of exactly one report. The challenge type for the
 * round alternates by round parity (odd = Spectrum Review, even = Guideline
 * Thread) so the loop never feels repetitive.
 */
function openAccusationWindow(state: PRState, ctx: GameContext): PRState {
  const players = ctx.room.players;
  const n = players.length;
  if (n < 2) return state;

  const accusationRound = state.accusationRound + 1;
  const shift = 1 + ((accusationRound - 1) % (n - 1));
  const assignments: Record<string, PRAssignment> = {};
  players.forEach((p, i) => {
    const subject = players[(i + shift) % n];
    assignments[p.id] = { subjectId: subject.id, subjectName: subject.name };
  });

  const challenge: PRChallenge =
    state.roundNumber % 2 === 1 ? "spectrum" : "thread";

  return {
    ...clearRound(state),
    phase: "accusation",
    accusationRound,
    assignments,
    challenge,
  };
}

/**
 * Close the accusation window: archive every filing into the intelligence file
 * and select ONE featured case to drive this round. The featured accused rotates
 * across rounds (indexed by accusationRound over the filed reports, ordered by
 * seating) so the spotlight moves around fairly. If nobody filed — e.g. the host
 * force-closed an empty window — a canned case keeps the round playable.
 */
function closeAccusationWindow(state: PRState, ctx: GameContext): PRState {
  const players = ctx.room.players;

  const cases: Array<{
    reporterId: string;
    reporterName: string;
    accusedId: string;
    accusedName: string;
    question: string;
    accusation: string;
  }> = [];
  for (const [reporterId, text] of Object.entries(state.accusations)) {
    const assignment = state.assignments[reporterId];
    if (!assignment) continue;
    const reporter = players.find((p) => p.id === reporterId);
    cases.push({
      reporterId,
      reporterName: reporter?.name ?? "Former employee",
      accusedId: assignment.subjectId,
      accusedName: assignment.subjectName,
      question: state.accusationQuestions[reporterId] ?? "",
      accusation: text,
    });
  }

  const records: PRCaseRecord[] = cases.map((c) => ({
    reporterName: c.reporterName,
    accusedName: c.accusedName,
    question: c.question,
    accusation: c.accusation,
    round: state.roundNumber,
  }));

  let featured:
    | {
        reporterId: string | null;
        reporterName: string;
        accusedId: string;
        accusedName: string;
        question: string;
        accusation: string;
      }
    | undefined;

  if (cases.length > 0) {
    const ordered = [...cases].sort(
      (a, b) =>
        players.findIndex((p) => p.id === a.accusedId) -
        players.findIndex((p) => p.id === b.accusedId)
    );
    featured = ordered[(state.accusationRound - 1) % ordered.length];
  } else {
    // Nobody filed. Fabricate a case so HR is never idle.
    const accused = players[(state.accusationRound - 1) % players.length];
    const reporterEntry = Object.entries(state.assignments).find(
      ([, a]) => a.subjectId === accused.id
    );
    const reporterId = reporterEntry?.[0] ?? null;
    const reporter = reporterId
      ? players.find((p) => p.id === reporterId)
      : undefined;
    featured = {
      reporterId,
      reporterName: reporter?.name ?? "HR",
      accusedId: accused.id,
      accusedName: accused.name,
      question: reporterId
        ? state.accusationQuestions[reporterId] ?? ""
        : "",
      accusation: "",
    };
  }

  return {
    ...state,
    caseLog: [...state.caseLog, ...records].slice(-MAX_CASE_LOG),
    accusedId: featured.accusedId,
    accusedName: featured.accusedName,
    reporterId: featured.reporterId,
    reporterName: featured.reporterName,
    accusation: featured.accusation || null,
    accusationQuestion: featured.question || null,
    phase: "interview",
  };
}

function buildLastRound(
  state: PRState,
  extra: Partial<PRLastRound>
): PRLastRound {
  return {
    challenge: state.challenge,
    round: state.roundNumber,
    accusation: state.accusation ?? "",
    reporterName: state.reporterName ?? "",
    accusedName: state.accusedName ?? "",
    explanation: state.explanation ?? "",
    hrResponse: state.hrResponse ?? "",
    guideline: state.guideline ?? "",
    ...extra,
  };
}

/**
 * Score Challenge A (Spectrum Review): each colleague earns points for how close
 * their guess lands to where the accused ranked the guideline; the accused shares
 * the table's total accuracy as a reward for being well understood.
 */
function scoreSpectrum(state: PRState, ctx: GameContext): PRState {
  const accused = ctx.room.players.find((p) => p.id === state.accusedId);
  if (!accused) return state;

  const stance = state.stance ?? 50;
  const guessers = ctx.room.players.filter((p) => p.id !== accused.id);

  const scores = { ...state.scores };
  const roundScores: Record<string, number> = {};
  const results: PRSpectrumResult[] = [];
  let accusedScore = 0;

  for (const g of guessers) {
    const guess = state.guesses[g.id];
    if (guess === undefined) {
      roundScores[g.id] = 0;
      continue;
    }
    const points = band(Math.abs(guess - stance));
    roundScores[g.id] = points;
    scores[g.id] = Math.max(0, (scores[g.id] ?? 0) + points);
    accusedScore += points;
    results.push({ name: g.name, guess, points });
  }

  roundScores[accused.id] = accusedScore;
  scores[accused.id] = Math.max(0, (scores[accused.id] ?? 0) + accusedScore);

  return {
    ...state,
    phase: "reveal",
    scores,
    roundScores,
    history: [
      ...state.history,
      {
        guideline: state.guideline ?? "",
        accusedName: accused.name,
        challenge: "spectrum",
      },
    ],
    lastRound: buildLastRound(state, {
      spectrumQuestion: state.spectrumQuestion ?? "",
      leftLabel: state.leftLabel ?? "",
      rightLabel: state.rightLabel ?? "",
      stance,
      spectrumResults: results,
    }),
  };
}

/**
 * Score Challenge B (Guideline Thread): a comment earns points per vote it
 * receives; correctly tagging the accused earns a bonus — EXCEPT for the reporter
 * (who wrote the accusation) and the accused themselves, both of whom already
 * know the answer.
 */
function scoreThread(state: PRState, ctx: GameContext): PRState {
  const players = ctx.room.players;

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

    const eligibleForBonus =
      p.id !== state.accusedId && p.id !== state.reporterId;
    const guessedAccused = state.atGuesses[p.id] === state.accusedId;
    const atBonus = guessedAccused && eligibleForBonus ? ATMENTION_BONUS : 0;

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
        guessedAccused,
        eligibleForBonus,
      });
    }
  }

  results.sort((a, b) => b.votes - a.votes);

  const accused = players.find((p) => p.id === state.accusedId);

  return {
    ...state,
    phase: "reveal",
    scores,
    roundScores,
    history: [
      ...state.history,
      {
        guideline: state.guideline ?? "",
        accusedName: accused?.name ?? state.accusedName ?? "",
        challenge: "thread",
      },
    ],
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
        roundNumber: 1,
        totalRounds: ctx.room.players.length * ROUNDS_PER_PLAYER,
        scores,
        voiceEnabled: state.voiceEnabled,
        voiceId: state.voiceId,
      };
    }

    case "SET_INTRO": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "intro") return state;
      const commentary = action.payload?.commentary;
      if (typeof commentary !== "string" || !commentary.trim()) return state;
      return { ...state, introText: commentary.trim() };
    }

    case "BEGIN": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "intro") return state;
      return openAccusationWindow(state, ctx);
    }

    case "SET_ACCUSATION_QUESTIONS": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "accusation") return state;

      const raw = action.payload?.questions;
      if (!raw || typeof raw !== "object") return state;
      const accusationQuestions: Record<string, string> = {};
      for (const [reporterId, question] of Object.entries(raw)) {
        if (!state.assignments[reporterId]) continue;
        if (typeof question !== "string" || !question.trim()) continue;
        accusationQuestions[reporterId] = question
          .trim()
          .slice(0, MAX_ACCUSATION_QUESTION_LENGTH);
      }
      if (Object.keys(accusationQuestions).length === 0) return state;

      return { ...state, accusationQuestions };
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

      // Auto-close once every present reporter has filed.
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
      return closeAccusationWindow(state, ctx);
    }

    case "SUBMIT_EXPLANATION": {
      if (state.phase !== "interview") return state;
      if (ctx.playerId !== state.accusedId) return state;

      const text =
        typeof action.payload?.explanation === "string"
          ? action.payload.explanation.trim().slice(0, MAX_EXPLANATION_LENGTH)
          : "";
      if (!text) return state;

      return { ...state, explanation: text, phase: "resolving" };
    }

    case "SKIP_INTERVIEW": {
      // Host escape hatch when the accused is slow or absent.
      if (!isHost(ctx)) return state;
      if (state.phase !== "interview") return state;
      return { ...state, phase: "resolving" };
    }

    case "SET_RESOLUTION": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "resolving") return state;

      const hrResponse =
        typeof action.payload?.hrResponse === "string"
          ? action.payload.hrResponse.trim()
          : "";
      const guideline =
        typeof action.payload?.guideline === "string"
          ? action.payload.guideline.trim()
          : "";
      if (!hrResponse || !guideline) return state;

      const base: PRState = { ...state, hrResponse, guideline };

      if (state.challenge === "spectrum") {
        const spectrumQuestion =
          typeof action.payload?.spectrumQuestion === "string"
            ? action.payload.spectrumQuestion.trim()
            : "";
        const leftLabel =
          typeof action.payload?.leftLabel === "string"
            ? action.payload.leftLabel.trim()
            : "";
        const rightLabel =
          typeof action.payload?.rightLabel === "string"
            ? action.payload.rightLabel.trim()
            : "";
        if (!spectrumQuestion || !leftLabel || !rightLabel) return state;

        return {
          ...base,
          spectrumQuestion,
          leftLabel,
          rightLabel,
          nudges: sanitizeNudges(action.payload?.nudges),
          stance: null,
          guesses: {},
          phase: "a_stance",
        };
      }

      return {
        ...base,
        nudges: sanitizeNudges(action.payload?.nudges),
        comments: {},
        votes: {},
        atGuesses: {},
        phase: "b_comment",
      };
    }

    case "SET_STANCE": {
      if (state.phase !== "a_stance") return state;
      if (ctx.playerId !== state.accusedId) return state;
      const stance = clampInt0100(action.payload?.stance);
      if (stance === null) return state;
      return { ...state, stance, phase: "a_guess" };
    }

    case "SUBMIT_GUESS": {
      if (state.phase !== "a_guess") return state;
      if (ctx.playerId === state.accusedId) return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;

      const guess = clampInt0100(action.payload?.guess);
      if (guess === null) return state;

      const next: PRState = {
        ...state,
        guesses: { ...state.guesses, [ctx.playerId]: guess },
      };

      const guessers = ctx.room.players.filter((p) => p.id !== state.accusedId);
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
      // Need at least one comment to vote on.
      if (Object.keys(state.comments).length === 0) return state;
      return { ...state, phase: "b_vote" };
    }

    case "SUBMIT_VOTE": {
      if (state.phase !== "b_vote") return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;

      // A vote for the funniest comment: must be a real comment, never your own.
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

      const votes = { ...state.votes, [ctx.playerId]: voteFor };

      // Tagging the accused is optional; only recorded if it's a real player.
      const atGuesses = { ...state.atGuesses };
      const atGuess =
        typeof action.payload?.atGuess === "string"
          ? action.payload.atGuess
          : null;
      if (atGuess && ctx.room.players.some((p) => p.id === atGuess)) {
        atGuesses[ctx.playerId] = atGuess;
      }

      const next: PRState = { ...state, votes, atGuesses };

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

    case "NEXT_ROUND": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "reveal") return state;

      if (state.roundNumber < state.totalRounds) {
        return openAccusationWindow(
          { ...state, roundNumber: state.roundNumber + 1 },
          ctx
        );
      }
      return { ...state, phase: "game_over" };
    }

    case "SET_FINAL": {
      if (!isHost(ctx)) return state;
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
    "File a complaint, get investigated, and turn one workplace incident into an absurd new company policy. HR is watching.",
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
        return isHost(ctx) && state.phase === "intro";
      case "BEGIN":
        return isHost(ctx) && state.phase === "intro";
      case "SET_ACCUSATION_QUESTIONS":
        return isHost(ctx) && state.phase === "accusation";
      case "SUBMIT_ACCUSATION":
        return (
          state.phase === "accusation" &&
          state.assignments[ctx.playerId] !== undefined
        );
      case "CLOSE_ACCUSATION":
        return isHost(ctx) && state.phase === "accusation";
      case "SUBMIT_EXPLANATION":
        return state.phase === "interview" && ctx.playerId === state.accusedId;
      case "SKIP_INTERVIEW":
        return isHost(ctx) && state.phase === "interview";
      case "SET_RESOLUTION":
        return isHost(ctx) && state.phase === "resolving";
      case "SET_STANCE":
        return state.phase === "a_stance" && ctx.playerId === state.accusedId;
      case "SUBMIT_GUESS":
        return state.phase === "a_guess" && ctx.playerId !== state.accusedId;
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
      case "NEXT_ROUND":
        return isHost(ctx) && state.phase === "reveal";
      case "SET_FINAL":
        return isHost(ctx) && state.phase === "game_over";
      case "SET_VOICE":
        return isHost(ctx);
      case "PLAY_AGAIN":
        return isHost(ctx) && state.phase === "game_over";
      default:
        return true;
    }
  },
});
