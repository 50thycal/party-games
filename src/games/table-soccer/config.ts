import { defineGame } from "../../engine/defineGame";
import type { BaseAction, GameContext, Player } from "../../engine/types";
import {
  canPlaceBumper, DEFAULT_TABLE, defaultPhones, GOALIE_LIMIT, goalieSaves,
  isFiniteNumber, isPoint, isTable, MAX_PULL, MIN_PULL, simulateShot, validLayout,
  type Bumper, type Flight, type Phone, type Point, type Table,
} from "./physics";

export const TABLE_SOCCER_ID = "table-soccer";
export const TABLE_SOCCER_VERSION = 1;
export const MAX_PLAYERS = 4;
export const WINNING_SCORE = 3;
const KICK_LEAD_MS = 900;
const SAVE_RECEIPT_MS = 150;

export type Shot = Flight & { startsAt: number; settlesAt: number; goalieX: number };
type Result = { kind: "goal" | "save" | "miss"; shooterId: string; defenderId?: string };

export type TableSoccerState = {
  version: number;
  revision: number;
  phase: "lobby" | "setup" | "initial-bumpers" | "aim" | "flight" | "bonus-bumper" | "finished";
  players: Pick<Player, "id" | "name">[];
  table: Table;
  phones: Phone[];
  bumpers: Bumper[];
  scores: number[];
  shooterIndex: number;
  match: number;
  turn: number;
  shot: Shot | null;
  lastResult: Result | null;
};

export interface TableSoccerAction extends BaseAction {
  payload?: {
    match?: number;
    turn?: number;
    table?: Table;
    phones?: Phone[];
    point?: Point;
    placement?: "initial" | "bonus";
    pull?: Point;
    x?: number;
  };
}

function initialState(): TableSoccerState {
  return {
    version: TABLE_SOCCER_VERSION,
    revision: 0,
    phase: "lobby",
    players: [],
    table: DEFAULT_TABLE,
    phones: [],
    bumpers: [],
    scores: [],
    shooterIndex: 0,
    match: 1,
    turn: 0,
    shot: null,
    lastResult: null,
  };
}

function validSetup(state: TableSoccerState, table: unknown, phones: unknown): boolean {
  if (!isTable(table) || !Array.isArray(phones) || phones.length !== state.players.length) return false;
  const geometriesValid = phones.every((phone, index) => {
    // The room order fixes seat IDs even if positions are swapped.
    if (!isPoint(phone)) return false;
    const candidate = phone as Phone;
    return candidate.playerId === state.players[index].id && isFiniteNumber(candidate.angle) &&
      candidate.angle >= 0 && candidate.angle < 360;
  });
  return geometriesValid && validLayout(table, phones);
}

function allowed(state: TableSoccerState, action: TableSoccerAction, ctx: GameContext, now: number): boolean {
  if (state.version !== TABLE_SOCCER_VERSION || ctx.room.mode !== "multiplayer" ||
      !ctx.room.players.some((player) => player.id === action.playerId) || ctx.playerId !== action.playerId) return false;

  const host = ctx.room.hostId === action.playerId;
  const shooterId = state.players[state.shooterIndex]?.id;
  const payload = action.payload;
  const shot = state.shot;
  if (payload?.match !== state.match || payload?.turn !== state.turn) return false;

  switch (action.type) {
    case "SOCCER_OPEN_SETUP":
      return host && state.phase === "lobby" && ctx.room.players.length >= 2 && ctx.room.players.length <= MAX_PLAYERS;
    case "SOCCER_CONFIRM_LAYOUT":
      return host && state.phase === "setup" && validSetup(state, payload.table, payload.phones);
    case "SOCCER_PLACE_BUMPER":
      return ((payload.placement === "initial" && state.phase === "initial-bumpers" && state.players.some((p) => p.id === action.playerId) &&
        !state.bumpers.some((bumper) => bumper.playerId === action.playerId)) ||
        (payload.placement === "bonus" && state.phase === "bonus-bumper" && state.lastResult?.shooterId === action.playerId)) &&
        isPoint(payload.point) && canPlaceBumper(payload.point, state.table, state.phones, state.bumpers);
    case "SOCCER_KICK": {
      if (state.phase !== "aim" || shooterId !== action.playerId || !isPoint(payload.pull)) return false;
      const strength = Math.hypot(payload.pull.x, payload.pull.y);
      return strength >= MIN_PULL && strength <= MAX_PULL + 0.001;
    }
    case "SOCCER_GOALIE":
      return state.phase === "flight" && !!shot && shot.crossing?.playerId === action.playerId &&
        now < shot.settlesAt && isFiniteNumber(payload.x) && Math.abs(payload.x) <= GOALIE_LIMIT;
    case "SOCCER_SETTLE":
      return state.phase === "flight" && !!shot && now >= shot.settlesAt &&
        state.players.some((player) => player.id === action.playerId);
    case "SOCCER_PLAY_AGAIN":
      return host && state.phase === "finished";
    default:
      return false;
  }
}

function nextTurn(state: TableSoccerState): TableSoccerState {
  return {
    ...state,
    phase: "aim",
    shooterIndex: (state.shooterIndex + 1) % state.players.length,
    turn: state.turn + 1,
    shot: null,
  };
}

function settle(state: TableSoccerState, shot: Shot): TableSoccerState {
  const shooterId = state.players[state.shooterIndex].id;
  if (!shot.crossing) return nextTurn({ ...state, lastResult: { kind: "miss", shooterId } });

  const defenderId = shot.crossing.playerId;
  if (goalieSaves(shot.goalieX, shot.crossing.x)) {
    return nextTurn({ ...state, lastResult: { kind: "save", shooterId, defenderId } });
  }

  const scores = state.scores.map((score, index) => score + Number(index === state.shooterIndex));
  return {
    ...state,
    phase: scores[state.shooterIndex] === WINNING_SCORE ? "finished" : "bonus-bumper",
    shot: null,
    scores,
    lastResult: { kind: "goal", shooterId, defenderId },
  };
}

function reducer(before: TableSoccerState, action: TableSoccerAction, ctx: GameContext): TableSoccerState {
  const now = ctx.now();
  if (!allowed(before, action, ctx, now)) return before;
  const state = { ...before, revision: before.revision + 1 };
  const payload = action.payload!;

  switch (action.type) {
    case "SOCCER_OPEN_SETUP": {
      const players = ctx.room.players.map(({ id, name }) => ({ id, name }));
      return {
        ...state,
        phase: "setup",
        players,
        phones: defaultPhones(players.map((p) => p.id), state.table),
        scores: players.map(() => 0),
      };
    }
    case "SOCCER_CONFIRM_LAYOUT":
      return { ...state, phase: "initial-bumpers", table: payload.table!, phones: payload.phones! };
    case "SOCCER_PLACE_BUMPER": {
      const bumpers = [...state.bumpers, { ...payload.point!, playerId: action.playerId }];
      if (state.phase === "bonus-bumper") return nextTurn({ ...state, bumpers });
      return { ...state, bumpers, phase: bumpers.length === state.players.length ? "aim" : state.phase };
    }
    case "SOCCER_KICK": {
      const flight = simulateShot(state.table, state.phones, state.bumpers, state.phones[state.shooterIndex], payload.pull!);
      const startsAt = now + KICK_LEAD_MS;
      return {
        ...state,
        phase: "flight",
        lastResult: null,
        shot: { ...flight, startsAt, settlesAt: startsAt + flight.duration + SAVE_RECEIPT_MS, goalieX: 0 },
      };
    }
    case "SOCCER_GOALIE":
      return { ...state, shot: { ...state.shot!, goalieX: payload.x! } };
    case "SOCCER_SETTLE":
      return settle(state, state.shot!);
    case "SOCCER_PLAY_AGAIN":
      return {
        ...state,
        phase: "setup",
        bumpers: [],
        scores: state.players.map(() => 0),
        shooterIndex: 0,
        match: state.match + 1,
        turn: 0,
        lastResult: null,
      };
    default:
      return before;
  }
}

export const tableSoccerGame = defineGame<TableSoccerState, TableSoccerAction>({
  id: TABLE_SOCCER_ID,
  name: "Table Soccer",
  minPlayers: 2,
  maxPlayers: MAX_PLAYERS,
  initialState,
  reducer,
  getPhase: (state) => state.phase,
  isActionAllowed: (state, action, ctx) => allowed(state, action, ctx, ctx.now()),
});
