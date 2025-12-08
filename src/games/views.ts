"use client";

import type { Room } from "@/engine/types";
import { NumberGuessGameView } from "./number-guess/GameView";
import { CometRushGameView } from "./comet-rush/GameView";

// Props passed to game views
export type GameViewProps<S = unknown> = {
  state: S;
  room: Room;
  playerId: string;
  isHost: boolean;
  dispatchAction: (type: string, payload?: Record<string, unknown>) => Promise<void>;
};

// Game view component type
export type GameViewComponent = React.FC<GameViewProps>;

// Game option for selection UI
export type GameOption = {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
};

// Available games for selection (client-side mirror of registry)
export const gameOptions: GameOption[] = [
  {
    id: "number-guess",
    name: "Number Guess",
    description: "Guess the secret number!",
    minPlayers: 2,
    maxPlayers: 8,
  },
  {
    id: "comet-rush",
    name: "Comet Rush",
    description: "Build rockets and destroy the comet before it hits Earth!",
    minPlayers: 2,
    maxPlayers: 4,
  },
];

// Registry of game view components
const gameViews: Record<string, GameViewComponent> = {
  "number-guess": NumberGuessGameView as GameViewComponent,
  "comet-rush": CometRushGameView as GameViewComponent,
};

/**
 * Get the view component for a game
 */
export function getGameView(gameId: string): GameViewComponent | undefined {
  return gameViews[gameId];
}
