import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GamePhase, GameContext, Player } from "@/engine/types";

// Game phases
type NumberGuessPhase = "lobby" | "playing";

// Game state
type NumberGuessState = {
  phase: NumberGuessPhase;
};

// Action types
type NumberGuessActionType = "START_GAME";

interface NumberGuessAction extends BaseAction {
  type: NumberGuessActionType;
}

function initialState(_players: Player[]): NumberGuessState {
  return {
    phase: "lobby",
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
      // Only host can start the game
      const isHost = ctx.room.hostId === ctx.playerId;
      if (!isHost) return state;
      if (state.phase !== "lobby") return state;

      return {
        ...state,
        phase: "playing",
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
    // Only host can START_GAME and only in lobby phase
    if (action.type === "START_GAME") {
      return ctx.room.hostId === ctx.playerId && state.phase === "lobby";
    }
    return true;
  },
  views: {
    // Placeholder views - will be implemented in Phase 5
    HostView: () => null,
    PlayerView: () => null,
  },
});
