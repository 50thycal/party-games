/**
 * Client-side player identity management.
 * Stores playerId and name in localStorage for persistence across sessions.
 */

export const PLAYER_IDENTITY_KEY = "partyShellPlayer";

export type PlayerIdentity = {
  id: string;
  name: string;
};

/**
 * Load player identity from localStorage
 */
export function loadPlayerIdentity(): PlayerIdentity | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(PLAYER_IDENTITY_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as PlayerIdentity;
    if (!parsed.id || !parsed.name) return null;

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Save player identity to localStorage
 */
export function savePlayerIdentity(identity: PlayerIdentity): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PLAYER_IDENTITY_KEY, JSON.stringify(identity));
}

/**
 * Clear player identity from localStorage
 */
export function clearPlayerIdentity(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PLAYER_IDENTITY_KEY);
}

/**
 * Get or create a player ID
 */
export function getOrCreatePlayerId(): string {
  const existing = loadPlayerIdentity();
  if (existing?.id) return existing.id;
  return crypto.randomUUID();
}
