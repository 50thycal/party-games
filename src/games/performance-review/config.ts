import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GamePhase, GameContext, Player } from "@/engine/types";

// ============================================================================
// Tunable constants
// ============================================================================

// Everyone sits under review roughly this many times per cycle.
export const ROUNDS_PER_PLAYER = 2;

// Distance bands: how close a colleague's guess is to where the employee
// actually stands (d = |dial - opinion|) -> Performance Points.
const BAND_BULLSEYE_DIST = 5; // d <= 5  -> bullseye
const BAND_CLOSE_DIST = 15; // d <= 15 -> close
const BAND_WARM_DIST = 30; // d <= 30 -> warm
const BAND_BULLSEYE_PTS = 5;
const BAND_CLOSE_PTS = 3;
const BAND_WARM_PTS = 1;

const MAX_STEER_PROMPTS = 2;
const MAX_STEER_PROMPT_LENGTH = 200;
const MAX_CLUE_LENGTH = 40;
const MAX_FEEDBACK_LOG = 40;

// ============================================================================
// Types
// ============================================================================

export type PRPhase =
  | "lobby"
  | "steering"
  | "statement"
  | "guessing"
  | "reveal"
  | "game_over";
export type PRHeat = "mild" | "spicy" | "scorched";

export type PRColleagueResult = {
  name: string;
  dial: number;
  points: number; // Performance Points this colleague earned for their read
};

export type PRLastRoundResults = {
  topic: string;
  leftLabel: string;
  rightLabel: string;
  employeeName: string;
  opinion: number;
  results: PRColleagueResult[];
};

// A feedback suggestion kept across rounds so the Overlord can revisit old
// ideas. `used` marks suggestions that already seeded a review topic.
export type PRFeedbackEntry = {
  playerId: string;
  name: string;
  prompt: string;
  round: number;
  used: boolean;
};

export type PRState = {
  phase: PRPhase;
  heat: PRHeat;
  roundNumber: number; // 1-based
  totalRounds: number;
  psychicIdx: number; // index into room.players; -1 before round 1

  // --- current round (cleared each SET_SPECTRUM) ---
  topic: string | null;
  leftLabel: string | null; // the 0-pole label
  rightLabel: string | null; // the 100-pole label
  commentary: string | null; // Overlord memo shown at the top of this round
  opinion: number | null; // 0..100 - where the employee actually stands (secret until reveal)
  clue: string | null; // ONE word
  dials: Record<string, number>; // colleagueId -> 0..100

  // --- scoring ---
  scores: Record<string, number>; // cumulative Performance Points
  roundScores: Record<string, number>; // this round's delta, for the reveal screen

  // --- steering ---
  steerPrompts: Record<string, string[]>; // playerId -> up to 2 feedback prompts
  feedbackLog: PRFeedbackEntry[]; // all feedback across rounds; unused ones stay eligible

  // --- history / callbacks (fed to /api/host) ---
  history: Array<{
    topic: string;
    leftLabel: string;
    rightLabel: string;
    psychicName: string;
    opinion: number;
  }>;
  lastRoundResults: PRLastRoundResults | null;
  finalCommentary: string | null;
};

export type PRActionType =
  | "START_GAME"
  | "SUBMIT_STEER"
  | "SET_SPECTRUM"
  | "SET_STATEMENT"
  | "SUBMIT_DIAL"
  | "REVEAL"
  | "NEXT_ROUND"
  | "SET_FINAL"
  | "PLAY_AGAIN";

export interface PRAction extends BaseAction {
  type: PRActionType;
  payload?: {
    heat?: PRHeat;
    prompts?: string[];
    topic?: string;
    leftLabel?: string;
    rightLabel?: string;
    commentary?: string;
    seedPlayerId?: string; // whose feedback seeded this round's topic
    seedPrompt?: string;
    opinion?: number;
    clue?: string;
    dial?: number;
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
    psychicIdx: -1,
    topic: null,
    leftLabel: null,
    rightLabel: null,
    commentary: null,
    opinion: null,
    clue: null,
    dials: {},
    scores: {},
    roundScores: {},
    steerPrompts: {},
    feedbackLog: [],
    history: [],
    lastRoundResults: null,
    finalCommentary: null,
  };
}

function getPhase(state: PRState): GamePhase {
  return state.phase;
}

function isHost(ctx: GameContext): boolean {
  return ctx.room.hostId === ctx.playerId;
}

function psychicOf(state: PRState, ctx: GameContext): Player | undefined {
  return ctx.room.players[state.psychicIdx];
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

/**
 * Score the current round with whatever dials exist and advance to reveal.
 * Each colleague earns points for how close their guess lands to where the
 * employee actually stands; the employee under review shares the table's
 * accuracy (the sum of those points) as a reward for a readable clue.
 * Colleagues who never dialed score 0 and are excluded from the employee's
 * sum, so an AFK colleague neither helps nor hurts them.
 */
function scoreRound(state: PRState, ctx: GameContext): PRState {
  const psychic = psychicOf(state, ctx);
  if (!psychic) return state;

  const opinion = state.opinion ?? 50;
  const colleagues = ctx.room.players.filter((p) => p.id !== psychic.id);

  const scores = { ...state.scores };
  const roundScores: Record<string, number> = {};
  const results: PRColleagueResult[] = [];

  let psychicScore = 0;

  for (const colleague of colleagues) {
    const dial = state.dials[colleague.id];
    if (dial === undefined) {
      roundScores[colleague.id] = 0;
      continue;
    }

    const points = band(Math.abs(dial - opinion));

    roundScores[colleague.id] = points;
    scores[colleague.id] = Math.max(0, (scores[colleague.id] ?? 0) + points);

    psychicScore += points; // employee shares the table's accuracy

    results.push({ name: colleague.name, dial, points });
  }

  roundScores[psychic.id] = psychicScore;
  scores[psychic.id] = Math.max(0, (scores[psychic.id] ?? 0) + psychicScore);

  return {
    ...state,
    phase: "reveal",
    scores,
    roundScores,
    history: [
      ...state.history,
      {
        topic: state.topic ?? "",
        leftLabel: state.leftLabel ?? "",
        rightLabel: state.rightLabel ?? "",
        psychicName: psychic.name,
        opinion,
      },
    ],
    lastRoundResults: {
      topic: state.topic ?? "",
      leftLabel: state.leftLabel ?? "",
      rightLabel: state.rightLabel ?? "",
      employeeName: psychic.name,
      opinion,
      results,
    },
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
        phase: "steering",
        heat: validHeat,
        roundNumber: 1,
        totalRounds: ctx.room.players.length * ROUNDS_PER_PLAYER,
        psychicIdx: -1,
        scores,
      };
    }

    case "SUBMIT_STEER": {
      if (state.phase !== "steering") return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;

      const raw = Array.isArray(action.payload?.prompts)
        ? action.payload.prompts
        : [];
      const prompts = raw
        .filter((p): p is string => typeof p === "string")
        .map((p) => p.trim().slice(0, MAX_STEER_PROMPT_LENGTH))
        .filter((p) => p.length > 0)
        .slice(0, MAX_STEER_PROMPTS);
      if (prompts.length === 0) return state;

      return {
        ...state,
        steerPrompts: { ...state.steerPrompts, [ctx.playerId]: prompts },
      };
    }

    case "SET_SPECTRUM": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "steering") return state;

      const topic = action.payload?.topic;
      const leftLabel = action.payload?.leftLabel;
      const rightLabel = action.payload?.rightLabel;
      if (
        typeof topic !== "string" ||
        !topic.trim() ||
        typeof leftLabel !== "string" ||
        !leftLabel.trim() ||
        typeof rightLabel !== "string" ||
        !rightLabel.trim()
      ) {
        return state;
      }
      const commentary =
        typeof action.payload?.commentary === "string"
          ? action.payload.commentary
          : "";

      const n = ctx.room.players.length;
      if (n === 0) return state;

      // Archive this round's feedback so unused suggestions stay eligible for
      // later reviews; flag whichever suggestion seeded this topic as used.
      const seedPlayerId =
        typeof action.payload?.seedPlayerId === "string"
          ? action.payload.seedPlayerId
          : null;
      const seedPrompt =
        typeof action.payload?.seedPrompt === "string"
          ? action.payload.seedPrompt
          : null;

      const seedIsFromThisRound =
        seedPlayerId !== null &&
        seedPrompt !== null &&
        (state.steerPrompts[seedPlayerId] ?? []).includes(seedPrompt);

      let feedbackLog = state.feedbackLog;
      if (seedPlayerId !== null && seedPrompt !== null && !seedIsFromThisRound) {
        const idx = feedbackLog.findIndex(
          (e) => !e.used && e.playerId === seedPlayerId && e.prompt === seedPrompt
        );
        if (idx >= 0) {
          feedbackLog = feedbackLog.map((e, i) =>
            i === idx ? { ...e, used: true } : e
          );
        }
      }
      const newEntries: PRFeedbackEntry[] = [];
      for (const p of ctx.room.players) {
        for (const prompt of state.steerPrompts[p.id] ?? []) {
          newEntries.push({
            playerId: p.id,
            name: p.name,
            prompt,
            round: state.roundNumber,
            used: p.id === seedPlayerId && prompt === seedPrompt,
          });
        }
      }
      feedbackLog = [...feedbackLog, ...newEntries].slice(-MAX_FEEDBACK_LOG);

      return {
        ...state,
        psychicIdx: (state.psychicIdx + 1) % n,
        topic: topic.trim(),
        leftLabel: leftLabel.trim(),
        rightLabel: rightLabel.trim(),
        commentary,
        feedbackLog,
        opinion: null,
        clue: null,
        dials: {},
        roundScores: {},
        phase: "statement",
      };
    }

    case "SET_STATEMENT": {
      if (state.phase !== "statement") return state;
      const psychic = psychicOf(state, ctx);
      if (!psychic || ctx.playerId !== psychic.id) return state;

      const opinion = clampInt0100(action.payload?.opinion);
      if (opinion === null) return state;

      // The clue is exactly one word: coerce to the first token.
      const clue =
        typeof action.payload?.clue === "string"
          ? (action.payload.clue.trim().split(/\s+/)[0] ?? "").slice(
              0,
              MAX_CLUE_LENGTH
            )
          : "";
      if (!clue) return state;

      return { ...state, opinion, clue, phase: "guessing" };
    }

    case "SUBMIT_DIAL": {
      if (state.phase !== "guessing") return state;
      const psychic = psychicOf(state, ctx);
      if (!psychic || ctx.playerId === psychic.id) return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;

      const dial = clampInt0100(action.payload?.dial);
      if (dial === null) return state;

      const next: PRState = {
        ...state,
        dials: { ...state.dials, [ctx.playerId]: dial },
      };

      const colleagues = ctx.room.players.filter((p) => p.id !== psychic.id);
      const allDialed =
        colleagues.length > 0 &&
        colleagues.every((c) => next.dials[c.id] !== undefined);

      return allDialed ? scoreRound(next, ctx) : next;
    }

    case "REVEAL": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "guessing") return state;
      return scoreRound(state, ctx);
    }

    case "NEXT_ROUND": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "reveal") return state;

      if (state.roundNumber < state.totalRounds) {
        return {
          ...state,
          roundNumber: state.roundNumber + 1,
          steerPrompts: {},
          phase: "steering",
        };
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

    case "PLAY_AGAIN": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "game_over") return state;

      return { ...initialState(ctx.room.players), heat: state.heat };
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
  name: "Performance Review",
  description:
    "One coworker, one word, one opinion. Guess where they stand. Management is watching.",
  minPlayers: 3,
  maxPlayers: 8,
  initialState,
  reducer,
  getPhase,
  isActionAllowed(state, action, ctx) {
    const psychicId = ctx.room.players[state.psychicIdx]?.id;
    switch (action.type) {
      case "START_GAME":
        return isHost(ctx) && state.phase === "lobby";
      case "SUBMIT_STEER":
        return state.phase === "steering";
      case "SET_SPECTRUM":
        return isHost(ctx) && state.phase === "steering";
      case "SET_STATEMENT":
        return state.phase === "statement" && ctx.playerId === psychicId;
      case "SUBMIT_DIAL":
        return state.phase === "guessing" && ctx.playerId !== psychicId;
      case "REVEAL":
        return isHost(ctx) && state.phase === "guessing";
      case "NEXT_ROUND":
        return isHost(ctx) && state.phase === "reveal";
      case "SET_FINAL":
        return isHost(ctx) && state.phase === "game_over";
      case "PLAY_AGAIN":
        return isHost(ctx) && state.phase === "game_over";
      default:
        return true;
    }
  },
});
