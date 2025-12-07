import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GamePhase, GameContext, Player } from "@/engine/types";

// Game phases
export type NumberGuessPhase = "lobby" | "guessing" | "results";

// Game state
export type NumberGuessState = {
  phase: NumberGuessPhase;
  secret: number | null;
  guesses: Record<string, number>; // playerId -> guess
  winnerId: string | null;
};

// Action types
export type NumberGuessActionType =
  | "START_GAME"
  | "SUBMIT_GUESS"
  | "REVEAL_RESULTS"
  | "PLAY_AGAIN";

export interface NumberGuessAction extends BaseAction {
  type: NumberGuessActionType;
  payload?: {
    value?: number;
  };
}

function initialState(_players: Player[]): NumberGuessState {
  return {
    phase: "lobby",
    secret: null,
    guesses: {},
    winnerId: null,
  };
}

function getPhase(state: NumberGuessState): GamePhase {
  return state.phase;
}

function reducer(
  state: NumberGuessState,
  action: NumberGuessAction,
  ctx: GameContext
): NumberGuessState {
  switch (action.type) {
    case "START_GAME": {
      const isHost = ctx.room.hostId === ctx.playerId;
      if (!isHost) return state;
      if (state.phase !== "lobby") return state;

      // Generate secret number 1-100
      const secret = Math.floor(ctx.random() * 100) + 1;

      return {
        phase: "guessing",
        secret,
        guesses: {},
        winnerId: null,
      };
    }

    case "SUBMIT_GUESS": {
      if (state.phase !== "guessing") return state;
      if (typeof action.payload?.value !== "number") return state;

      const value = Math.round(action.payload.value);
      if (value < 1 || value > 100 || !Number.isFinite(value)) return state;

      return {
        ...state,
        guesses: {
          ...state.guesses,
          [action.playerId]: value,
        },
      };
    }

    case "REVEAL_RESULTS": {
      const isHost = ctx.room.hostId === ctx.playerId;
      if (!isHost) return state;
      if (state.phase !== "guessing") return state;
      if (state.secret == null) return state;

      const guessEntries = Object.entries(state.guesses);
      if (guessEntries.length === 0) {
        // No guesses yet, do nothing
        return state;
      }

      // Find winner (closest guess)
      let winnerId: string | null = null;
      let bestDiff = Infinity;

      for (const [playerId, guess] of guessEntries) {
        const diff = Math.abs(guess - state.secret);
        if (diff < bestDiff) {
          bestDiff = diff;
          winnerId = playerId;
        }
      }

      return {
        ...state,
        phase: "results",
        winnerId,
      };
    }

    case "PLAY_AGAIN": {
      const isHost = ctx.room.hostId === ctx.playerId;
      if (!isHost) return state;
      if (state.phase !== "results") return state;

      // Generate new secret number 1-100
      const secret = Math.floor(ctx.random() * 100) + 1;

      return {
        phase: "guessing",
        secret,
        guesses: {},
        winnerId: null,
      };
    }

    default:
      return state;
  }
}

export const numberGuessGame = defineGame<NumberGuessState, NumberGuessAction>({
  id: "number-guess",
  name: "Number Guess",
  description: "Guess the secret number!",
  minPlayers: 2,
  maxPlayers: 8,
  initialState,
  reducer,
  getPhase,
  isActionAllowed(state, action, ctx) {
    switch (action.type) {
      case "START_GAME":
        return ctx.room.hostId === ctx.playerId && state.phase === "lobby";
      case "SUBMIT_GUESS":
        return state.phase === "guessing";
      case "REVEAL_RESULTS":
        return (
          ctx.room.hostId === ctx.playerId &&
          state.phase === "guessing" &&
          Object.keys(state.guesses).length > 0
        );
      case "PLAY_AGAIN":
        return ctx.room.hostId === ctx.playerId && state.phase === "results";
      default:
        return true;
    }
  },
});
