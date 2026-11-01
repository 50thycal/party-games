import { defineGame } from "../../engine/defineGame";
import type { BaseAction, GameContext, Player } from "../../engine/types";
import { angularError, initialBearing, isLocation, normalizeDegrees, type Location } from "./geography";
import { getLandmark, LANDMARKS, ORIGINS } from "./places";

export const BEARINGS_STATE_VERSION = 1;
export type BearingsSettings = {
  origin: Location;
  pack: "us" | "world" | "all";
  rounds: number;
  firstLandmarkId: string;
};
export type RoundResult = {
  round: number;
  landmarkId: string;
  answer: number;
  guesses: Record<string, number>;
  errors: Record<string, number>;
  winnerIds: string[];
};
export type BearingsState = {
  version: number;
  phase: "lobby" | "guessing" | "round_results" | "finished";
  settings: BearingsSettings;
  players: Pick<Player, "id" | "name">[];
  deck: string[];
  round: number;
  match: number;
  guesses: Record<string, number>;
  history: RoundResult[];
};
export interface BearingsAction extends BaseAction {
  payload?: {
    settings?: BearingsSettings;
    round?: number;
    match?: number;
    value?: number;
  };
}

export function initialState(): BearingsState {
  return {
    version: BEARINGS_STATE_VERSION, phase: "lobby",
    settings: { origin: { ...ORIGINS[0] }, pack: "us", rounds: 5, firstLandmarkId: "" },
    players: [], deck: [], round: 0, match: 0, guesses: {}, history: [],
  };
}

export function eligibleLandmarks(settings: BearingsSettings) {
  return LANDMARKS.filter((landmark) =>
    (settings.pack === "all" || landmark.region === settings.pack) &&
    initialBearing(settings.origin, landmark) !== null
  );
}

function validSettings(value: unknown): value is BearingsSettings {
  if (!value || typeof value !== "object") return false;
  const settings = value as BearingsSettings;
  if (!isLocation(settings.origin) || !["us", "world", "all"].includes(settings.pack) ||
    !Number.isInteger(settings.rounds) || settings.rounds < 1 || settings.rounds > 10 ||
    typeof settings.firstLandmarkId !== "string") return false;
  const eligible = eligibleLandmarks(settings);
  return eligible.length >= settings.rounds && (!settings.firstLandmarkId ||
    eligible.some((place) => place.id === settings.firstLandmarkId));
}

function isAllowed(state: BearingsState, action: BearingsAction, ctx: GameContext): boolean {
  if (state.version !== BEARINGS_STATE_VERSION || ctx.playerId !== action.playerId ||
    !ctx.room.players.some((player) => player.id === ctx.playerId)) return false;
  const host = ctx.room.hostId === ctx.playerId;
  const currentRound = action.payload?.round === state.round && action.payload?.match === state.match;
  switch (action.type) {
    case "UPDATE_SETTINGS":
      return host && state.phase === "lobby" && validSettings(action.payload?.settings);
    case "START_GAME":
      return host && state.phase === "lobby" && ctx.room.players.length >= 2 &&
        ctx.room.players.length <= 12 && validSettings(action.payload?.settings ?? state.settings);
    case "SUBMIT_GUESS":
      return state.phase === "guessing" && currentRound &&
        state.players.some((player) => player.id === ctx.playerId) &&
        state.guesses[ctx.playerId] === undefined &&
        typeof action.payload?.value === "number" && Number.isInteger(action.payload.value) &&
        action.payload.value >= 0 && action.payload.value <= 360;
    case "REVEAL_RESULTS":
      return host && state.phase === "guessing" && currentRound &&
        Object.keys(state.guesses).length > 0;
    case "NEXT_ROUND":
      return host && state.phase === "round_results" && currentRound;
    case "PLAY_AGAIN":
      return host && state.phase === "finished" && currentRound;
    default:
      return false;
  }
}

function reducer(state: BearingsState, action: BearingsAction, ctx: GameContext): BearingsState {
  // Keep authoritative validation here too; local play/tests can call the reducer directly.
  if (!isAllowed(state, action, ctx)) return state;
  switch (action.type) {
    case "UPDATE_SETTINGS":
      return { ...state, settings: cleanSettings(action.payload!.settings!) };
    case "START_GAME": {
      const settings = cleanSettings(action.payload?.settings ?? state.settings);
      const deck = eligibleLandmarks(settings).map((place) => place.id);
      for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(ctx.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
      }
      if (settings.firstLandmarkId) {
        const index = deck.indexOf(settings.firstLandmarkId);
        [deck[0], deck[index]] = [deck[index], deck[0]];
      }
      return { ...initialState(), settings, match: state.match, phase: "guessing", round: 1,
        deck: deck.slice(0, settings.rounds),
        players: ctx.room.players.map(({ id, name }) => ({ id, name })) };
    }
    case "SUBMIT_GUESS":
      return { ...state, guesses: { ...state.guesses,
        [ctx.playerId]: normalizeDegrees(action.payload!.value!) } };
    case "REVEAL_RESULTS": {
      const landmark = getLandmark(state.deck[state.round - 1]);
      if (!landmark) return state;
      const answer = initialBearing(state.settings.origin, landmark);
      if (answer === null) return state;
      const errors: Record<string, number> = {};
      for (const player of state.players) {
        const guess = state.guesses[player.id];
        errors[player.id] = guess === undefined ? 180 : angularError(guess, answer);
      }
      const best = Math.min(...Object.keys(state.guesses).map((id) => errors[id]));
      const winnerIds = state.players.filter((player) => state.guesses[player.id] !== undefined &&
        Math.abs(errors[player.id] - best) < 1e-9).map((player) => player.id);
      const result: RoundResult = { round: state.round, landmarkId: landmark.id,
        answer, guesses: { ...state.guesses }, errors, winnerIds };
      return { ...state, phase: state.round === state.settings.rounds ? "finished" : "round_results",
        history: [...state.history, result] };
    }
    case "NEXT_ROUND":
      return { ...state, phase: "guessing", round: state.round + 1, guesses: {} };
    case "PLAY_AGAIN":
      return { ...initialState(), settings: state.settings, match: state.match + 1 };
    default:
      return state;
  }
}

function cleanSettings(settings: BearingsSettings): BearingsSettings {
  return { origin: { name: settings.origin.name.trim(), latitude: settings.origin.latitude,
    longitude: settings.origin.longitude }, pack: settings.pack, rounds: settings.rounds,
    firstLandmarkId: settings.firstLandmarkId };
}

export function standings(state: BearingsState) {
  return state.players.map((player) => ({ ...player,
    totalError: state.history.reduce((sum, result) => sum + result.errors[player.id], 0),
    wins: state.history.filter((result) => result.winnerIds.includes(player.id)).length,
  })).sort((a, b) => a.totalError - b.totalError);
}

export const landmarkBearingsGame = defineGame<BearingsState, BearingsAction>({
  id: "landmark-bearings", name: "Landmark Bearings",
  description: "Which way is the landmark? Guess the compass bearing. Closest wins.",
  minPlayers: 2, maxPlayers: 12,
  initialState, reducer, getPhase: (state) => state.phase, isActionAllowed: isAllowed,
});
