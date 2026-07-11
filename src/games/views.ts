"use client";

import type { Room } from "@/engine/types";
import { NumberGuessGameView } from "./number-guess/GameView";
import { CometRushGameView } from "./comet-rush/GameView";
import { CafeGameView } from "./cafe/GameView";
import { RealEstateGameView } from "./real-estate/GameView";
import { PerformanceReviewGameView } from "./performance-review/GameView";
import { TheDeskGameView } from "./the-desk/GameView";

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
    maxPlayers: 6,
  },
  {
    id: "cafe",
    name: "Cafe",
    description: "Compete to attract customers to your cafe!",
    minPlayers: 2,
    maxPlayers: 4,
  },
  {
    id: "real-estate",
    name: "Open House",
    description: "Buy houses in a drifting market with a shared bank.",
    minPlayers: 2,
    maxPlayers: 6,
  },
  {
    id: "performance-review",
    name: "HR Investigation",
    description:
      "File a complaint, get investigated, and turn every workplace incident into an absurd new company policy. HR is watching.",
    minPlayers: 3,
    maxPlayers: 8,
  },
  {
    id: "the-desk",
    name: "The Desk",
    description:
      "Make markets, read the room. Beat the benchmark or the fund gets liquidated.",
    minPlayers: 3,
    maxPlayers: 8,
  },
];

// Registry of game view components
const gameViews: Record<string, GameViewComponent> = {
  "number-guess": NumberGuessGameView as GameViewComponent,
  "comet-rush": CometRushGameView as GameViewComponent,
  "cafe": CafeGameView as GameViewComponent,
  "real-estate": RealEstateGameView as GameViewComponent,
  "performance-review": PerformanceReviewGameView as GameViewComponent,
  "the-desk": TheDeskGameView as GameViewComponent,
};

/**
 * Get the view component for a game
 */
export function getGameView(gameId: string): GameViewComponent | undefined {
  return gameViews[gameId];
}
