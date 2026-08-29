import {
  SUBWAY_CONFIG,
  SUBWAY_STATE_VERSION,
  stationById,
  validateNode,
  type RouteNode,
  type SubwayState,
} from "./config";

// ============================================================================
// Saved phantom route plans (WS-004, DEC-022).
//
// A plan is one player's private, non-binding sketch of a full route for one
// owned Line Contract. It lives only in this browser's local storage — it is
// never part of an action payload or room state, reserves nothing, prices
// nothing, and the reducer never sees it. Keys are versioned by the Subway
// state shape, so a plan sketched under older rules is never loaded into
// newer behavior; it is simply ignored.
// ============================================================================

/** Full intended route from starter onward; the real route is its prefix. */
export type SavedPlan = {
  nodes: RouteNode[];
  savedAt: number;
};

export const planStorageKey = (roomCode: string, playerId: string, contractId: string): string =>
  `subway-plan-v${SUBWAY_STATE_VERSION}:${roomCode}:${playerId}:${contractId}`;

/** Longest route any contract can want, with slack; caps hostile payloads. */
const MAX_PLAN_NODES = 24;

const isPlanNode = (n: unknown): n is RouteNode => {
  if (!n || typeof n !== "object") return false;
  const node = n as Record<string, unknown>;
  if (!Number.isInteger(node.x) || !Number.isInteger(node.y)) return false;
  const x = node.x as number;
  const y = node.y as number;
  if (x < 0 || y < 0 || x >= SUBWAY_CONFIG.board.columns || y >= SUBWAY_CONFIG.board.rows) return false;
  if (node.stationId !== undefined) {
    if (typeof node.stationId !== "string") return false;
    const station = stationById(node.stationId);
    if (!station) return false;
    if (!Number.isInteger(node.stationSlot)) return false;
    const slot = node.stationSlot as number;
    if (slot < 0 || slot >= station.capacity) return false;
  }
  return true;
};

/** Copies only the fields a plan node is allowed to carry. */
const cleanNode = (n: RouteNode): RouteNode => ({
  x: n.x,
  y: n.y,
  ...(n.stationId !== undefined ? { stationId: n.stationId, stationSlot: n.stationSlot ?? 0 } : {}),
});

/**
 * Reads one saved plan. Anything missing, corrupt, oversized, from another
 * state version, or shaped wrong fails closed to null — the board must never
 * crash because storage held garbage.
 */
export function loadPlan(roomCode: string, playerId: string, contractId: string): SavedPlan | null {
  try {
    const raw = window.localStorage.getItem(planStorageKey(roomCode, playerId, contractId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const plan = parsed as Record<string, unknown>;
    if (plan.v !== SUBWAY_STATE_VERSION) return null;
    if (!Array.isArray(plan.nodes) || plan.nodes.length === 0 || plan.nodes.length > MAX_PLAN_NODES) {
      return null;
    }
    if (!plan.nodes.every(isPlanNode)) return null;
    return {
      nodes: (plan.nodes as RouteNode[]).map(cleanNode),
      savedAt: typeof plan.savedAt === "number" ? plan.savedAt : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Persists one plan. Returns false when storage is unavailable or full so the
 * caller can say "kept for this session only" instead of silently lying.
 */
export function savePlan(
  roomCode: string,
  playerId: string,
  contractId: string,
  nodes: RouteNode[]
): boolean {
  try {
    window.localStorage.setItem(
      planStorageKey(roomCode, playerId, contractId),
      JSON.stringify({ v: SUBWAY_STATE_VERSION, nodes: nodes.map(cleanNode), savedAt: Date.now() })
    );
    return true;
  } catch {
    return false;
  }
}

export function clearPlan(roomCode: string, playerId: string, contractId: string): void {
  try {
    window.localStorage.removeItem(planStorageKey(roomCode, playerId, contractId));
  } catch {
    // Nothing to do: with storage unavailable there is nothing stored either.
  }
}

/** How one saved plan relates to the line's real route right now. */
export type PlanStatus = {
  /** Leading plan nodes the real route has already built. */
  matched: number;
  /** The remaining phantom continuation, drawn from the real endpoint. */
  phantom: RouteNode[];
  /**
   * True when reality diverged from the plan or a later phantom segment is no
   * longer legal. A stale plan stays visible and editable — it is never
   * silently rewritten into a different route.
   */
  stale: boolean;
};

const sameNode = (a: RouteNode, b: RouteNode): boolean =>
  a.x === b.x &&
  a.y === b.y &&
  (a.stationId ?? null) === (b.stationId ?? null) &&
  (a.stationId === undefined || (a.stationSlot ?? 0) === (b.stationSlot ?? 0));

/**
 * Reconciles a plan against authoritative state using the reducer's own
 * legality (`validateNode` on a throwaway clone), so "still viable" means
 * viable under exactly the rules construction will apply.
 */
export function reconcilePlan(
  game: SubwayState,
  playerId: string,
  lineIndex: number,
  plan: RouteNode[]
): PlanStatus {
  const line = game.players[playerId]?.lines[lineIndex];
  if (!line) return { matched: 0, phantom: [], stale: true };

  const route = line.route;
  if (route.length > plan.length) {
    // The line built past the plan's end: nothing phantom remains to show.
    return { matched: plan.length, phantom: [], stale: true };
  }
  for (let i = 0; i < route.length; i++) {
    if (!sameNode(route[i], plan[i])) {
      return { matched: i, phantom: plan.slice(i), stale: true };
    }
  }

  const phantom = plan.slice(route.length);
  // Walk the remainder against a clone of the live board. Room state is plain
  // JSON by invariant, so this is a safe deep copy.
  const clone = JSON.parse(JSON.stringify(game)) as SubwayState;
  const cloneLine = clone.players[playerId]?.lines[lineIndex];
  if (!cloneLine) return { matched: route.length, phantom, stale: true };
  let stale = false;
  for (const n of phantom) {
    const starter = cloneLine.route.length === 0;
    const reason = validateNode(
      clone,
      playerId,
      lineIndex,
      { x: n.x, y: n.y },
      starter,
      n.stationId !== undefined ? n.stationSlot ?? 0 : undefined
    );
    if (reason) {
      stale = true;
      break;
    }
    cloneLine.route.push(cleanNode(n));
  }
  return { matched: route.length, phantom, stale };
}
