import type { GameTemplate, BaseAction } from "./types";

/**
 * Helper to define a game template with proper typing.
 * This is a simple passthrough that ensures type safety.
 */
export function defineGame<S, A extends BaseAction>(
  template: GameTemplate<S, A>
): GameTemplate<S, A> {
  return template;
}
