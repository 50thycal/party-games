import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GamePhase, GameContext, Player } from "@/engine/types";

// ============================================================================
// Tunable constants
// ============================================================================

// Width of the Market Maker's secret position band (inclusive endpoints).
export const PAYZONE_WIDTH = 20;
// Personal bonus the MM banks per order that lands inside their book.
export const PAYZONE_POINTS = 2;
// Personal bonus for the trader(s) whose order lands closest to truth.
export const SHARP_BONUS = 3;
// Everyone makes markets roughly this many times per session.
export const ROUNDS_PER_PLAYER = 2;
// Fallback par per trader when the Oracle sends nothing usable.
export const PAR_K = 2;
// Par clamp floor per trader.
export const PAR_MIN = 1;
// Par clamp ceiling per trader (< band max of 5, so par is always achievable).
export const PAR_MAX = 3.5;

const MAX_STEER_PROMPTS = 2;
const MAX_STEER_PROMPT_LENGTH = 200;

// ============================================================================
// Types
// ============================================================================

export type DeskPhase =
  | "lobby"
  | "briefing"
  | "quote"
  | "trading"
  | "settlement"
  | "final";
export type DeskHeat = "mild" | "spicy" | "scorched";

export type DeskOrderResult = {
  name: string;
  order: number;
  inPayZone: boolean;
  sharp: boolean;
};

export type DeskLastRoundResults = {
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
  orders: DeskOrderResult[];
};

export type DeskHistoryEntry = {
  prompt: string;
  trueValue: number;
  mmName: string;
  quoteLow: number;
  quoteHigh: number;
  payLow: number;
  payHigh: number;
  groupDelta: number;
};

export type DeskState = {
  phase: DeskPhase;
  heat: DeskHeat;
  roundNumber: number; // 1-based
  totalRounds: number;
  // Roster snapshotted at START_GAME so the Market Maker rotation is fixed for
  // the whole game — everyone makes markets exactly ROUNDS_PER_PLAYER times,
  // regardless of anyone joining mid-game.
  rosterIds: string[];
  mmIdx: number; // market maker index into rosterIds; -1 pre-round-1

  // --- fund (group ledger) ---
  fundScore: number; // cumulative group points
  benchmark: number; // cumulative target; accrues `par` at each SET_ROUND

  // --- current round (from the Oracle; cleared each SET_ROUND) ---
  prompt: string | null;
  unit: string | null; // always "%"
  trueValue: number | null; // 0..100, secret; MM sees it
  payLow: number | null; // MM's secret position band (width = PAYZONE_WIDTH)
  payHigh: number | null;
  par: number | null; // group target added to benchmark this round
  commentary: string | null; // Oracle memo (reacts to last round + frames new)

  // --- MM's public quote ---
  quoteLow: number | null;
  quoteHigh: number | null;

  // --- traders' orders ---
  orders: Record<string, number>; // traderId -> 0..100

  // --- individual (bragging ledger; void on liquidation) ---
  individual: Record<string, number>; // cumulative
  roundGroupDelta: number; // this round's fund gain (display)
  roundIndividualDelta: Record<string, number>; // this round's per-player individual gain (display)

  // --- steering ---
  steerPrompts: Record<string, string[]>; // playerId -> up to 2 requests

  // --- history / callbacks (fed to /api/desk) ---
  history: DeskHistoryEntry[];
  lastRoundResults: DeskLastRoundResults | null;

  outcome: "win" | "liquidated" | null;
  finalCommentary: string | null;
};

export type DeskActionType =
  | "START_GAME"
  | "SUBMIT_STEER"
  | "SET_ROUND"
  | "SET_QUOTE"
  | "SUBMIT_ORDER"
  | "SETTLE"
  | "NEXT_ROUND"
  | "SET_FINAL"
  | "PLAY_AGAIN";

export interface DeskAction extends BaseAction {
  type: DeskActionType;
  payload?: {
    heat?: DeskHeat;
    prompts?: string[];
    prompt?: string;
    unit?: string;
    trueValue?: number;
    payLow?: number;
    payHigh?: number;
    par?: number;
    commentary?: string;
    quoteLow?: number;
    quoteHigh?: number;
    order?: number;
  };
}

// ============================================================================
// Helpers
// ============================================================================

function initialState(_players: Player[]): DeskState {
  return {
    phase: "lobby",
    heat: "spicy",
    roundNumber: 1,
    totalRounds: 0,
    rosterIds: [],
    mmIdx: -1,
    fundScore: 0,
    benchmark: 0,
    prompt: null,
    unit: null,
    trueValue: null,
    payLow: null,
    payHigh: null,
    par: null,
    commentary: null,
    quoteLow: null,
    quoteHigh: null,
    orders: {},
    individual: {},
    roundGroupDelta: 0,
    roundIndividualDelta: {},
    steerPrompts: {},
    history: [],
    lastRoundResults: null,
    outcome: null,
    finalCommentary: null,
  };
}

function getPhase(state: DeskState): GamePhase {
  return state.phase;
}

function isHost(ctx: GameContext): boolean {
  return ctx.room.hostId === ctx.playerId;
}

function marketMakerOf(state: DeskState, ctx: GameContext): Player | undefined {
  const mmId = state.rosterIds[state.mmIdx];
  if (mmId === undefined) return undefined;
  return ctx.room.players.find((p) => p.id === mmId);
}

function clampInt0100(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

// Accuracy band: distance from truth -> fund points.
export function band(d: number): number {
  if (d <= 5) return 5;
  if (d <= 15) return 3;
  if (d <= 30) return 1;
  return 0;
}

/**
 * Settle the round with whatever orders exist. Traders who never ordered
 * contribute 0 to the fund and are excluded from sharp/position credit, so an
 * AFK trader neither feeds the MM's book nor drags the sharp calculation.
 */
function settleRound(state: DeskState, ctx: GameContext): DeskState {
  const mm = marketMakerOf(state, ctx);
  if (!mm) return state;

  const trueValue = state.trueValue ?? 50;
  const payLow = state.payLow ?? 0;
  const payHigh = state.payHigh ?? payLow + PAYZONE_WIDTH;
  const traders = ctx.room.players.filter((p) => p.id !== mm.id);
  const submitted = traders.filter((t) => state.orders[t.id] !== undefined);

  const individual = { ...state.individual };
  const roundIndividualDelta: Record<string, number> = {};

  // FUND (group ledger) — the ONLY source of group points.
  let roundGroupDelta = 0;
  for (const trader of submitted) {
    roundGroupDelta += band(Math.abs(state.orders[trader.id] - trueValue));
  }
  const fundScore = state.fundScore + roundGroupDelta;

  // INDIVIDUAL — MM position hits.
  const mmHits = submitted.filter((t) => {
    const order = state.orders[t.id];
    return payLow <= order && order <= payHigh;
  }).length;
  individual[mm.id] = (individual[mm.id] ?? 0) + PAYZONE_POINTS * mmHits;
  roundIndividualDelta[mm.id] = PAYZONE_POINTS * mmHits;

  // INDIVIDUAL — sharp trader(s): closest order(s) to truth.
  let minDist = Infinity;
  for (const trader of submitted) {
    minDist = Math.min(minDist, Math.abs(state.orders[trader.id] - trueValue));
  }

  const orderResults: DeskOrderResult[] = [];
  for (const trader of submitted) {
    const order = state.orders[trader.id];
    const sharp = Math.abs(order - trueValue) === minDist;
    if (sharp) {
      individual[trader.id] = (individual[trader.id] ?? 0) + SHARP_BONUS;
      roundIndividualDelta[trader.id] = SHARP_BONUS;
    }
    orderResults.push({
      name: trader.name,
      order,
      inPayZone: payLow <= order && order <= payHigh,
      sharp,
    });
  }

  return {
    ...state,
    phase: "settlement",
    fundScore,
    individual,
    roundGroupDelta,
    roundIndividualDelta,
    history: [
      ...state.history,
      {
        prompt: state.prompt ?? "",
        trueValue,
        mmName: mm.name,
        quoteLow: state.quoteLow ?? 0,
        quoteHigh: state.quoteHigh ?? 100,
        payLow,
        payHigh,
        groupDelta: roundGroupDelta,
      },
    ],
    lastRoundResults: {
      prompt: state.prompt ?? "",
      trueValue,
      unit: state.unit ?? "%",
      mmName: mm.name,
      quoteLow: state.quoteLow ?? 0,
      quoteHigh: state.quoteHigh ?? 100,
      payLow,
      payHigh,
      par: state.par ?? 0,
      groupDelta: roundGroupDelta,
      fundScore,
      benchmark: state.benchmark,
      orders: orderResults,
    },
  };
}

// ============================================================================
// Reducer
// ============================================================================

function reducer(state: DeskState, action: DeskAction, ctx: GameContext): DeskState {
  switch (action.type) {
    case "START_GAME": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "lobby") return state;
      if (ctx.room.players.length === 0) return state;

      const heat = action.payload?.heat;
      const validHeat: DeskHeat =
        heat === "mild" || heat === "spicy" || heat === "scorched"
          ? heat
          : "spicy";

      const individual: Record<string, number> = {};
      for (const p of ctx.room.players) individual[p.id] = 0;

      // Freeze the roster now: everyone here makes markets exactly
      // ROUNDS_PER_PLAYER times, and the total round count is a whole number of
      // full rotations so no one gets an extra turn.
      const rosterIds = ctx.room.players.map((p) => p.id);

      return {
        ...initialState(ctx.room.players),
        phase: "briefing",
        heat: validHeat,
        roundNumber: 1,
        totalRounds: rosterIds.length * ROUNDS_PER_PLAYER,
        rosterIds,
        mmIdx: -1,
        individual,
      };
    }

    case "SUBMIT_STEER": {
      if (state.phase !== "briefing") return state;
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

    case "SET_ROUND": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "briefing") return state;

      const n = ctx.room.players.length;
      if (n === 0) return state;

      const prompt =
        typeof action.payload?.prompt === "string"
          ? action.payload.prompt.trim()
          : "";
      const trueValue = clampInt0100(action.payload?.trueValue);
      if (!prompt || trueValue === null) return state;

      const unit =
        typeof action.payload?.unit === "string" && action.payload.unit.trim()
          ? action.payload.unit.trim()
          : "%";
      const commentary =
        typeof action.payload?.commentary === "string"
          ? action.payload.commentary
          : "";

      // Normalize the position band: exactly PAYZONE_WIDTH wide, inside 0..100.
      // A misbehaving Oracle cannot break the math — we re-derive everything.
      const maxLow = 100 - PAYZONE_WIDTH;
      let payLow = clampInt0100(action.payload?.payLow);
      if (payLow === null) {
        payLow = Math.floor(ctx.random() * (maxLow + 1));
      }
      payLow = Math.min(maxLow, Math.max(0, payLow));
      const payHigh = payLow + PAYZONE_WIDTH;

      // Clamp par to a live band scaled to this round's trader count.
      const guessers = Math.max(1, n - 1);
      const parLo = Math.ceil(PAR_MIN * guessers);
      const parHi = Math.floor(PAR_MAX * guessers);
      const rawPar =
        typeof action.payload?.par === "number" &&
        Number.isFinite(action.payload.par)
          ? Math.round(action.payload.par)
          : PAR_K * guessers;
      const par = Math.min(parHi, Math.max(parLo, rawPar));

      // Advance the Market Maker over the frozen roster so turns stay even.
      const rotationLen = state.rosterIds.length > 0 ? state.rosterIds.length : n;

      return {
        ...state,
        phase: "quote",
        mmIdx: (state.mmIdx + 1) % rotationLen,
        benchmark: state.benchmark + par,
        prompt,
        unit,
        trueValue,
        payLow,
        payHigh,
        par,
        commentary,
        quoteLow: null,
        quoteHigh: null,
        orders: {},
        roundGroupDelta: 0,
        roundIndividualDelta: {},
      };
    }

    case "SET_QUOTE": {
      if (state.phase !== "quote") return state;
      const mm = marketMakerOf(state, ctx);
      if (!mm || ctx.playerId !== mm.id) return state;

      const a = clampInt0100(action.payload?.quoteLow);
      const b = clampInt0100(action.payload?.quoteHigh);
      if (a === null || b === null) return state;

      return {
        ...state,
        phase: "trading",
        quoteLow: Math.min(a, b),
        quoteHigh: Math.max(a, b),
      };
    }

    case "SUBMIT_ORDER": {
      if (state.phase !== "trading") return state;
      const mm = marketMakerOf(state, ctx);
      if (!mm || ctx.playerId === mm.id) return state;
      if (!ctx.room.players.some((p) => p.id === ctx.playerId)) return state;

      const order = clampInt0100(action.payload?.order);
      if (order === null) return state;

      const next: DeskState = {
        ...state,
        orders: { ...state.orders, [ctx.playerId]: order },
      };

      const traders = ctx.room.players.filter((p) => p.id !== mm.id);
      const allOrdersIn =
        traders.length > 0 &&
        traders.every((t) => next.orders[t.id] !== undefined);

      return allOrdersIn ? settleRound(next, ctx) : next;
    }

    case "SETTLE": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "trading") return state;
      return settleRound(state, ctx);
    }

    case "NEXT_ROUND": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "settlement") return state;

      if (state.roundNumber < state.totalRounds) {
        return {
          ...state,
          roundNumber: state.roundNumber + 1,
          steerPrompts: {},
          phase: "briefing",
        };
      }
      return {
        ...state,
        outcome: state.fundScore >= state.benchmark ? "win" : "liquidated",
        phase: "final",
      };
    }

    case "SET_FINAL": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "final") return state;

      const commentary = action.payload?.commentary;
      if (typeof commentary !== "string" || !commentary.trim()) return state;

      return { ...state, finalCommentary: commentary.trim() };
    }

    case "PLAY_AGAIN": {
      if (!isHost(ctx)) return state;
      if (state.phase !== "final") return state;

      return { ...initialState(ctx.room.players), heat: state.heat };
    }

    default:
      return state;
  }
}

// ============================================================================
// Game template
// ============================================================================

export const theDeskGame = defineGame<DeskState, DeskAction>({
  id: "the-desk",
  name: "The Desk",
  description:
    "Make markets, read the room. Beat the benchmark or the fund gets liquidated.",
  minPlayers: 3,
  maxPlayers: 8,
  initialState,
  reducer,
  getPhase,
  isActionAllowed(state, action, ctx) {
    const mmId = state.rosterIds[state.mmIdx];
    switch (action.type) {
      case "START_GAME":
        return isHost(ctx) && state.phase === "lobby";
      case "SUBMIT_STEER":
        return state.phase === "briefing";
      case "SET_ROUND":
        return isHost(ctx) && state.phase === "briefing";
      case "SET_QUOTE":
        return state.phase === "quote" && ctx.playerId === mmId;
      case "SUBMIT_ORDER":
        return state.phase === "trading" && ctx.playerId !== mmId;
      case "SETTLE":
        return isHost(ctx) && state.phase === "trading";
      case "NEXT_ROUND":
        return isHost(ctx) && state.phase === "settlement";
      case "SET_FINAL":
        return isHost(ctx) && state.phase === "final";
      case "PLAY_AGAIN":
        return isHost(ctx) && state.phase === "final";
      default:
        return true;
    }
  },
});
