// ============================================================================
// Saved device identity for the iPad/phone companion (DGLE playtest follow-up).
//
// The stored token is also the device's only recovery key, so a stale identity
// is never deleted silently while its game could still be running. After the
// idle window the page asks before rejoining; a finished or vanished room is
// cleared without asking.
// ============================================================================

export const DEVICE_SESSION_KEY = "subway-companion-device-v1";
/** Idle time after which a reopened page asks before rejoining its room. */
export const DEVICE_SESSION_IDLE_MS = 20 * 60 * 1000;
/** Minimum spacing between activity stamps written while polling. */
export const DEVICE_SESSION_TOUCH_MS = 30 * 1000;

export type SavedDeviceIdentity = { roomCode: string; token: string; controllerKey?: string; seenAt?: number };

export function parseSavedIdentity(raw: string | null): SavedDeviceIdentity | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (typeof saved?.roomCode !== "string" || typeof saved?.token !== "string") return null;
    return { roomCode: saved.roomCode, token: saved.token, ...(typeof saved.controllerKey === "string" ? { controllerKey: saved.controllerKey } : {}), ...(typeof saved.seenAt === "number" ? { seenAt: saved.seenAt } : {}) };
  } catch { return null; }
}

/** What a reopened page should do with its saved identity before contacting the room. */
export function resumeDecision(saved: SavedDeviceIdentity | null, now: number): "none" | "resume" | "ask" {
  if (!saved) return "none";
  // Identities written before activity stamps existed count as fresh once.
  if (saved.seenAt === undefined) return "resume";
  return now - saved.seenAt > DEVICE_SESSION_IDLE_MS ? "ask" : "resume";
}

/** After an idle check-in with the room: keep asking, rejoin, or forget the room. */
export function staleRoomDecision(ok: boolean, phase: string | null | undefined): "ask" | "forget" {
  return !ok || phase === "RESULTS" ? "forget" : "ask";
}

export function stamped(identity: SavedDeviceIdentity, now: number): SavedDeviceIdentity {
  return { ...identity, seenAt: now };
}
