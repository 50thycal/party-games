import type { GameTemplate, BaseAction } from "./types";

// Registry of all available games
// Games are registered here after being defined
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const games = new Map<string, GameTemplate<any, any>>();

/**
 * Register a game template with the engine
 */
export function registerGame<S, A extends BaseAction>(
  template: GameTemplate<S, A>
): void {
  if (games.has(template.id)) {
    console.warn(`Game "${template.id}" is already registered. Overwriting.`);
  }
  games.set(template.id, template);
}

/**
 * Get a registered game by ID
 */
export function getGame<S, A extends BaseAction>(
  gameId: string
): GameTemplate<S, A> | undefined {
  return games.get(gameId) as GameTemplate<S, A> | undefined;
}

/**
 * Get all registered games
 */
export function getAllGames(): GameTemplate<unknown, BaseAction>[] {
  return Array.from(games.values());
}

/**
 * Check if a game is registered
 */
export function hasGame(gameId: string): boolean {
  return games.has(gameId);
}
