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
const MAX_FEEDBACK_LOG = 40;
const MAX_HR_FILING_LENGTH = 280;
const MAX_HR_QUESTION_LENGTH = 300;
const MAX_HR_LOG = 40;
const MAX_NUDGES = 5;
const MAX_NUDGE_LENGTH = 140;

// ============================================================================
// Types
// ============================================================================

export type PRPhase =
  | "lobby"
  | "intro" // the Overlord's opening address in the shared terminal
  | "hr" // mandatory HR filings about an assigned colleague
  | "steering"
  | "statement"
  | "guessing"
  | "reveal"
  | "game_over";
export type PRHeat = "mild" | "spicy" | "scorched";

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

// Who each player must report on this HR window (subject name snapshotted so
// the record survives a roster change).
export type PRHrAssignment = { subjectId: string; subjectName: string };

// An archived HR filing — the Overlord's intelligence file on the staff.
export type PRHrRecord = {
  reporterName: string;
  subjectName: string;
  question: string;
  filing: string;
  round: number;
};

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
  // Whose turn it is under review. Stored by identity (not array index) so the
  // rotation stays a strict round-robin even if the roster changes mid-game.
  psychicId: string | null; // null before round 1

  // --- current round (cleared each SET_SPECTRUM) ---
  topic: string | null;
  leftLabel: string | null; // the 0-pole label
  rightLabel: string | null; // the 100-pole label
  commentary: string | null; // Overlord memo shown at the top of this round
  opinion: number | null; // 0..100 - where the employee actually stands (secret until reveal)
  dials: Record<string, number>; // colleagueId -> 0..100

  // --- scoring ---
  scores: Record<string, number>; // cumulative Performance Points
  roundScores: Record<string, number>; // this round's delta, for the reveal screen

  // --- the Overlord's terminal ---
  introText: string | null; // opening address, typed out for all staff
  feedbackPrompt: string | null; // personal memo asking for steering feedback
  nudges: string[]; // ambient "get back to work" messages during guessing

  // --- HR filings ---
  hrRound: number; // how many HR windows have opened (drives pairing rotation)
  hrAssignments: Record<string, PRHrAssignment>; // reporterId -> subject
  hrQuestions: Record<string, string>; // reporterId -> AI-authored question
  hrFilings: Record<string, string>; // reporterId -> filing text (this window)
  hrLog: PRHrRecord[]; // accumulated filings, fed to /api/host

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

  // --- voice (host-controlled TTS of the Overlord) ---
  voiceEnabled: boolean;
  voiceId: string;
};

export type PRActionType =
  | "START_GAME"
  | "SET_INTRO"
  | "BEGIN_HR"
  | "SET_HR_QUESTIONS"
  | "SUBMIT_HR"
  | "CLOSE_HR"
  | "SUBMIT_STEER"
  | "SET_SPECTRUM"
  | "SET_STATEMENT"
  | "SUBMIT_DIAL"
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
    prompts?: string[];
    topic?: string;
    leftLabel?: string;
    rightLabel?: string;
    commentary?: string;
    seedPlayerId?: string; // whose feedback seeded this round's topic
    seedPrompt?: string;
    opinion?: number;
    dial?: number;
    questions?: Record<string, string>; // reporterId -> HR question
    feedbackPrompt?: string;
    filing?: string;
    nudges?: string[];
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
    psychicId: null,
    topic: null,
    leftLabel: null,
    rightLabel: null,
    commentary: null,
    opinion: null,
    dials: {},
    scores: {},
    roundScores: {},
    introText: null,
    feedbackPrompt: null,
    nudges: [],
    hrRound: 0,
    hrAssignments: {},
    hrQuestions: {},
    hrFilings: {},
    hrLog: [],
    steerPrompts: {},
    feedbackLog: [],
    history: [],
    lastRoundResults: null,
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

function psychicOf(state: PRState, ctx: GameContext): Player | undefined {
  if (!state.psychicId) return undefined;
  return ctx.room.players.find((p) => p.id === state.psychicId);
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
 * Open an HR window: assign every player a colleague to report on via a
 * cyclic shift (shift varies each window, never 0), so nobody reports on
 * themselves and everyone has exactly one filing written about them.
 */
function openHrWindow(state: PRState, ctx: GameContext): PRState {
  const players = ctx.room.players;
  const n = players.length;
  if (n < 2) return { ...state, phase: "steering" };

  const hrRound = state.hrRound + 1;
  const shift = 1 + ((hrRound - 1) % (n - 1));
  const hrAssignments: Record<string, PRHrAssignment> = {};
  players.forEach((p, i) => {
    const subject = players[(i + shift) % n];
    hrAssignments[p.id] = { subjectId: subject.id, subjectName: subject.name };
  });

  return {
    ...state,
    phase: "hr",
    hrRound,
    hrAssignments,
    hrQuestions: {},
    hrFilings: {},
  };
}

/** Archive this window's filings into the Overlord's intelligence file. */
function closeHrWindow(state: PRState, ctx: GameContext): PRState {
  const records: PRHrRecord[] = [];
  for (const [reporterId, filing] of Object.entries(state.hrFilings)) {
    const assignment = state.hrAssignments[reporterId];
    if (!assignment) continue;
    const reporter = ctx.room.players.find((p) => p.id === reporterId);
    records.push({
      reporterName: reporter?.name ?? "Former employee",
      subjectName: assignment.subjectName,
      question: state.hrQuestions[reporterId] ?? "",
      filing,
      round: state.roundNumber,
    });
  }
  return {
    ...state,
    hrLog: [...state.hrLog, ...records].slice(-MAX_HR_LOG),
    phase: "steering",
  };
}

/**
 * Score the current round with whatever dials exist and advance to reveal.
 * Each colleague earns points for how close their guess lands to where the
 * employee actually stands; the employee under review shares the table's
 * accuracy (the sum of those points) as a reward for being well understood.
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
        phase: "intro",
        heat: validHeat,
        roundNumber: 1,
        totalRounds: ctx.room.players.length * ROUNDS_PER_PLAYER,
        psychicId: null,
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

    case "BEGIN_HR": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "intro") return state;
      return openHrWindow(state, ctx);
    }

    case "SET_HR_QUESTIONS": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "hr") return state;

      const raw = action.payload?.questions;
      if (!raw || typeof raw !== "object") return state;
      const hrQuestions: Record<string, string> = {};
      for (const [reporterId, question] of Object.entries(raw)) {
        if (!state.hrAssignments[reporterId]) continue;
        if (typeof question !== "string" || !question.trim()) continue;
        hrQuestions[reporterId] = question.trim().slice(0, MAX_HR_QUESTION_LENGTH);
      }
      if (Object.keys(hrQuestions).length === 0) return state;

      const feedbackPrompt =
        typeof action.payload?.feedbackPrompt === "string" &&
        action.payload.feedbackPrompt.trim()
          ? action.payload.feedbackPrompt.trim().slice(0, MAX_HR_QUESTION_LENGTH)
          : state.feedbackPrompt;

      return { ...state, hrQuestions, feedbackPrompt };
    }

    case "SUBMIT_HR": {
      if (state.phase !== "hr") return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;
      if (!state.hrAssignments[ctx.playerId]) return state;

      const filing =
        typeof action.payload?.filing === "string"
          ? action.payload.filing.trim().slice(0, MAX_HR_FILING_LENGTH)
          : "";
      if (!filing) return state;

      const next: PRState = {
        ...state,
        hrFilings: { ...state.hrFilings, [ctx.playerId]: filing },
      };

      // Auto-close once every present player with an assignment has filed.
      const reporters = ctx.room.players.filter(
        (p) => next.hrAssignments[p.id] !== undefined
      );
      const allFiled =
        reporters.length > 0 &&
        reporters.every((p) => next.hrFilings[p.id] !== undefined);

      return allFiled ? closeHrWindow(next, ctx) : next;
    }

    case "CLOSE_HR": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "hr") return state;
      return closeHrWindow(state, ctx);
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

      // Advance the review to the NEXT player in seating order, anchored to the
      // current employee's identity (not a raw index) so a mid-game join/leave
      // can never scramble the rotation. Round 1 (psychicId null) starts at [0].
      const curIdx = state.psychicId
        ? ctx.room.players.findIndex((p) => p.id === state.psychicId)
        : -1;
      const nextPsychicId = ctx.room.players[(curIdx + 1) % n].id;

      const nudges = (Array.isArray(action.payload?.nudges)
        ? action.payload.nudges
        : []
      )
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim().slice(0, MAX_NUDGE_LENGTH))
        .filter((v) => v.length > 0)
        .slice(0, MAX_NUDGES);

      return {
        ...state,
        psychicId: nextPsychicId,
        topic: topic.trim(),
        leftLabel: leftLabel.trim(),
        rightLabel: rightLabel.trim(),
        commentary,
        nudges,
        feedbackLog,
        opinion: null,
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

      // The employee privately commits where they actually stand; colleagues
      // guess it from what they know about this person (no clue is given).
      return { ...state, opinion, phase: "guessing" };
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
        // Every round begins with a fresh HR window before feedback opens.
        return openHrWindow(
          {
            ...state,
            roundNumber: state.roundNumber + 1,
            steerPrompts: {},
          },
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
  name: "Performance Review",
  description:
    "One coworker, one hot take. Guess where they really stand. Management is watching.",
  minPlayers: 3,
  maxPlayers: 8,
  initialState,
  reducer,
  getPhase,
  isActionAllowed(state, action, ctx) {
    const psychicId = state.psychicId;
    switch (action.type) {
      case "START_GAME":
        return isHost(ctx) && state.phase === "lobby";
      case "SET_INTRO":
        return isHost(ctx) && state.phase === "intro";
      case "BEGIN_HR":
        return isHost(ctx) && state.phase === "intro";
      case "SET_HR_QUESTIONS":
        return isHost(ctx) && state.phase === "hr";
      case "SUBMIT_HR":
        return (
          state.phase === "hr" &&
          state.hrAssignments[ctx.playerId] !== undefined
        );
      case "CLOSE_HR":
        return isHost(ctx) && state.phase === "hr";
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
      case "SET_VOICE":
        return isHost(ctx);
      case "PLAY_AGAIN":
        return isHost(ctx) && state.phase === "game_over";
      default:
        return true;
    }
  },
});
