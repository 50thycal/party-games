import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GameContext, Player } from "@/engine/types";

// ============================================================================
// Subway v0.1 — two-player competitive subway-network construction.
//
// This module holds all data, rules, and the reducer. The view lives in
// GameView.tsx. Balancing knobs are collected in SUBWAY_CONFIG and the card /
// contract / station tables below (see RULES.md for the assumptions made).
// ============================================================================

// ----------------------------------------------------------------------------
// Tunable configuration
// ----------------------------------------------------------------------------

export const SUBWAY_CONFIG = {
  startingMoney: 15,
  timelinePeriods: 10,
  board: { columns: 9, rows: 9 },
  stationScores: { major: 5, minor: 2 },
  tolerances: {
    straight: 15, // degrees: "approximately straight"
    gentleCurve: 30, // degrees: max turn for Gentle Curve
    bend: 50, // degrees: upper bound for the 45° bend window
    parallelHeading: 15, // degrees: headings that count as parallel
    parallelMaxDistance: 2.5, // pegs: max midpoint distance for Parallel Corridor
  },
  longSegmentDistance: 3, // pegs: minimum length for Long Segment
  startingHands: {
    engineering: ["straight", "bend", "long-segment", "terminal", "crossing"],
    scheduling: ["early", "float", "priority"],
    construction: ["overtime", "crew"],
  },
} as const;

// ----------------------------------------------------------------------------
// Board data
// ----------------------------------------------------------------------------

export type Point = { x: number; y: number };

export type Station = Point & {
  id: string;
  name: string;
  kind: "major" | "minor";
  /** Max number of companies that may claim a scoring connection. */
  capacity: number;
};

export const STATIONS: Station[] = [
  { id: "grand", name: "Grand Central", kind: "major", x: 2, y: 2, capacity: 2 },
  { id: "harbor", name: "Harbor Exchange", kind: "major", x: 6, y: 6, capacity: 2 },
  { id: "museum", name: "Museum", kind: "minor", x: 6, y: 1, capacity: 2 },
  { id: "market", name: "Market", kind: "minor", x: 1, y: 5, capacity: 2 },
  { id: "garden", name: "Garden", kind: "minor", x: 4, y: 4, capacity: 2 },
  { id: "stadium", name: "Stadium", kind: "minor", x: 7, y: 3, capacity: 2 },
];

const STATION_BY_ID = new Map(STATIONS.map((s) => [s.id, s]));

export const stationAt = (p: Point): Station | undefined =>
  STATIONS.find((s) => s.x === p.x && s.y === p.y);

// ----------------------------------------------------------------------------
// Line contracts
// ----------------------------------------------------------------------------

export type LineContract = {
  id: string;
  name: string;
  nodes: number; // total nodes including the free starter peg
  cost: number; // $M
  completionVp: number;
  stationBonus: number; // once, when the line connects at least one Major Station
  incompletePenalty: number; // negative VP
  special?: string;
};

export const LINE_CONTRACTS: LineContract[] = [
  { id: "short", name: "Short Line", nodes: 5, cost: 7, completionVp: 4, stationBonus: 4, incompletePenalty: -5 },
  { id: "medium", name: "Medium Line", nodes: 7, cost: 9, completionVp: 6, stationBonus: 4, incompletePenalty: -6 },
  { id: "long", name: "Long Line", nodes: 9, cost: 11, completionVp: 8, stationBonus: 4, incompletePenalty: -8 },
  {
    id: "express",
    name: "Express Line",
    nodes: 7,
    cost: 10,
    completionVp: 6,
    stationBonus: 5,
    incompletePenalty: -7,
    special: "+3 VP if the completed line connects two Major Stations.",
  },
];

// ----------------------------------------------------------------------------
// Cards
// ----------------------------------------------------------------------------

export type EngineeringCard = {
  id: string;
  name: string;
  description: string;
  vp: number;
  kind: "objective" | "permission";
};

export const ENGINEERING_CARDS: EngineeringCard[] = [
  { id: "gentle", name: "Gentle Curve", description: "Three sequential segments with every turn ≤30°.", vp: 4, kind: "objective" },
  { id: "bend", name: "45° Bend", description: "Include one direction change >30° and ≤50°.", vp: 3, kind: "objective" },
  { id: "straight", name: "Straightaway", description: "Three consecutive segments aligned within 15°.", vp: 4, kind: "objective" },
  { id: "approach", name: "Station Approach", description: "Enter a Major Station with a near-straight final segment.", vp: 4, kind: "objective" },
  { id: "through", name: "Through Station", description: "Pass through a station on a continuous alignment.", vp: 5, kind: "objective" },
  { id: "long-segment", name: "Long Segment", description: "Build one segment spanning at least 3 pegs.", vp: 3, kind: "objective" },
  { id: "parallel", name: "Parallel Corridor", description: "Run close and parallel to the opposing line.", vp: 4, kind: "objective" },
  { id: "terminal", name: "Terminal Approach", description: "End your completed route at a station.", vp: 4, kind: "objective" },
  { id: "minimal", name: "Minimal Footprint", description: "Complete the line with exactly the contracted nodes.", vp: 3, kind: "objective" },
  { id: "crossing", name: "Crossing Design", description: "Permits crossing the opposing line once. +2 VP if the crossing is used.", vp: 2, kind: "permission" },
];

export type SchedulingCardId = "early" | "float" | "priority";

export const SCHEDULING_CARDS: { id: SchedulingCardId; name: string; description: string }[] = [
  { id: "early", name: "Early Mobilization", description: "Shift your revealed block one period earlier, if legal." },
  { id: "float", name: "Float", description: "Shift your revealed block one period earlier or later, if legal." },
  { id: "priority", name: "Priority Permit", description: "Take Priority 1 for the locked schedule." },
];

export type ConstructionCardId = "overtime" | "expedite" | "field" | "crew";

export const CONSTRUCTION_CARDS: { id: ConstructionCardId; name: string; description: string }[] = [
  { id: "overtime", name: "Overtime", description: "Immediately after this scheduled build, place one extra node." },
  { id: "expedite", name: "Expedite Materials", description: "Move your next future construction action one period earlier." },
  { id: "field", name: "Field Adjustment", description: "Re-target your next segment. (No effect in v0.1 — destinations are always chosen freely.)" },
  { id: "crew", name: "Extra Crew", description: "Place two legal sequential nodes on this scheduled action." },
];

/**
 * Face-up market decks, cycled deterministically by the indexes in
 * SubwayState.market. Field Adjustment is excluded from the v0.1 market
 * because destinations are never pre-committed, which makes it a dead card
 * (see RULES.md).
 */
export const MARKET_DECKS = {
  contract: LINE_CONTRACTS.map((c) => c.id),
  engineering: ENGINEERING_CARDS.map((c) => c.id),
  scheduling: SCHEDULING_CARDS.map((c) => c.id),
  construction: ["overtime", "expedite", "crew"] as ConstructionCardId[],
} as const;

// ----------------------------------------------------------------------------
// Game state
// ----------------------------------------------------------------------------

export type SubwayPhase =
  | "SETUP"
  | "PROCUREMENT"
  | "ENGINEERING"
  | "SCHEDULING_PROPOSAL"
  | "SCHEDULING_REVEAL" // legacy: new games auto-reveal when both proposals are in
  | "SCHEDULING_RESOLUTION"
  | "SCHEDULE_LOCKED" // legacy: new games move straight to STARTER_PLACEMENT
  | "STARTER_PLACEMENT"
  | "CONSTRUCTION"
  | "SCORING"
  | "RESULTS";

export type RouteNode = Point & { stationId?: string };

export type ScoreItem = { label: string; points: number; met?: boolean };

export type SubwayPlayer = {
  id: string;
  name: string;
  color: string;
  money: number;
  engineeringHand: string[];
  committedEngineering: string[];
  engineeringLocked: boolean;
  schedulingHand: SchedulingCardId[];
  constructionHand: ConstructionCardId[];
  contractId?: string;
  proposedStart?: number;
  scheduleStart?: number;
  /** Explicit construction periods, generated at schedule lock. */
  schedulePeriods?: number[];
  scheduleCardPlayed?: SchedulingCardId;
  scheduleConfirmed: boolean;
  route: RouteNode[];
  crossingsUsed: number;
  /** Extra immediate builds granted by Overtime / Extra Crew. */
  overtimeActions: number;
  score?: number;
  scoreBreakdown?: ScoreItem[];
};

export type Market = {
  contractIndex: number;
  engineeringIndex: number;
  schedulingIndex: number;
  constructionIndex: number;
};

export interface SubwayState {
  phase: SubwayPhase;
  playerOrder: string[];
  players: Record<string, SubwayPlayer>;
  /** Priority 1 player; assigned randomly at start, changed by Priority Permit. */
  defaultPriorityPlayerId: string;
  procurementTurn: number;
  market: Market;
  currentPeriod: number;
  constructionQueue: string[];
  winnerIds: string[];
  message: string;
}

export type SubwayActionType =
  | "START_GAME"
  | "PROCURE"
  | "COMMIT_ENGINEERING"
  | "PROPOSE_SCHEDULE"
  | "REVEAL_SCHEDULES" // legacy no-op kept for in-flight rooms
  | "PLAY_SCHEDULING_CARD"
  | "CONFIRM_SCHEDULE"
  | "PLACE_STARTER"
  | "BUILD"
  | "SKIP_ACTION"
  | "PLAY_CONSTRUCTION_CARD"
  | "ADVANCE_SCORING";

export interface SubwayAction extends BaseAction {
  type: SubwayActionType;
  payload?: {
    choice?: "contract" | "engineering" | "scheduling" | "construction" | "pass";
    cardIds?: string[];
    start?: number;
    cardId?: string;
    direction?: number;
    x?: number;
    y?: number;
  };
}

export const PLAYER_COLORS = ["#e5484d", "#3b82f6"];

// ----------------------------------------------------------------------------
// Lookups and small helpers
// ----------------------------------------------------------------------------

export const contractFor = (p: SubwayPlayer): LineContract | undefined =>
  LINE_CONTRACTS.find((c) => c.id === p.contractId);

export const stationById = (id: string): Station | undefined => STATION_BY_ID.get(id);

export const marketContract = (m: Market): LineContract =>
  LINE_CONTRACTS.find((c) => c.id === MARKET_DECKS.contract[m.contractIndex % MARKET_DECKS.contract.length])!;

export const marketEngineering = (m: Market): EngineeringCard =>
  ENGINEERING_CARDS.find((c) => c.id === MARKET_DECKS.engineering[m.engineeringIndex % MARKET_DECKS.engineering.length])!;

export const marketScheduling = (m: Market) =>
  SCHEDULING_CARDS.find((c) => c.id === MARKET_DECKS.scheduling[m.schedulingIndex % MARKET_DECKS.scheduling.length])!;

export const marketConstruction = (m: Market) =>
  CONSTRUCTION_CARDS.find((c) => c.id === MARKET_DECKS.construction[m.constructionIndex % MARKET_DECKS.construction.length])!;

/** The player whose procurement opportunity it currently is. */
export const procurementPlayerId = (s: SubwayState): string | undefined =>
  s.playerOrder[s.procurementTurn % Math.max(1, s.playerOrder.length)];

/** Removes a single instance of a value (hands may hold duplicates). */
const removeOne = <T,>(arr: T[], value: T): T[] => {
  const i = arr.indexOf(value);
  return i === -1 ? arr : [...arr.slice(0, i), ...arr.slice(i + 1)];
};

/**
 * The construction periods a player acts in. Falls back to a contiguous block
 * derived from scheduleStart for states saved before schedulePeriods existed.
 */
export function periodsFor(p: SubwayPlayer): number[] {
  if (p.schedulePeriods) return p.schedulePeriods;
  const contract = contractFor(p);
  if (p.scheduleStart === undefined || !contract) return [];
  return Array.from({ length: contract.nodes - 1 }, (_, i) => p.scheduleStart! + i);
}

export function legalScheduleStart(p: SubwayPlayer, start: number): boolean {
  const duration = (contractFor(p)?.nodes ?? 1) - 1;
  return Number.isInteger(start) && start >= 1 && start + duration - 1 <= SUBWAY_CONFIG.timelinePeriods;
}

// ----------------------------------------------------------------------------
// Geometry
// ----------------------------------------------------------------------------

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Absolute direction change at b when travelling a → b → c, in degrees. */
export const angleChange = (a: Point, b: Point, c: Point): number => {
  const u = { x: b.x - a.x, y: b.y - a.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  const n = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  if (!n) return 180;
  return (Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / n))) * 180) / Math.PI;
};

/** Smallest angle between the headings of segments a→b and c→d (0..90). */
const headingDiff = (a: Point, b: Point, c: Point, d: Point): number => {
  const h1 = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const h2 = (Math.atan2(d.y - c.y, d.x - c.x) * 180) / Math.PI;
  const raw = Math.abs(h1 - h2) % 180;
  return Math.min(raw, 180 - raw);
};

/** Proper segment intersection — shared endpoints do not count as a crossing. */
export const segmentsCross = (a: Point, b: Point, c: Point, d: Point): boolean => {
  const orient = (p: Point, q: Point, r: Point) =>
    Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  return orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
};

/** True when p lies on segment a→b (inclusive of endpoints). */
const pointOnSegment = (p: Point, a: Point, b: Point): boolean => {
  const area = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  if (area !== 0) return false;
  return (
    p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y)
  );
};

/** How many of the opponent's segments the candidate segment from→to crosses. */
export function countCrossings(state: SubwayState, playerId: string, from: Point, to: Point): number {
  let crossings = 0;
  for (const other of Object.values(state.players)) {
    if (other.id === playerId) continue;
    for (let i = 1; i < other.route.length; i++) {
      if (segmentsCross(from, to, other.route[i - 1], other.route[i])) crossings++;
    }
  }
  return crossings;
}

// ----------------------------------------------------------------------------
// Placement validation
// ----------------------------------------------------------------------------

/** Companies (player ids) holding a scoring connection at a station. */
export function stationClaimants(state: SubwayState, stationId: string): string[] {
  return state.playerOrder.filter((id) =>
    state.players[id]?.route.some((n) => n.stationId === stationId)
  );
}

/**
 * Validates placing a node for `playerId` at `p`. Returns a human-readable
 * reason when the placement is illegal, or null when it is allowed.
 *
 * Station holes are special: they hold one node per company up to the
 * station's capacity, so several companies can dock into the same station.
 * Normal holes belong to a single player.
 */
export function validateNode(
  state: SubwayState,
  playerId: string,
  p: Point,
  starter = false
): string | null {
  const me = state.players[playerId];
  if (!me) return "You are not part of this game.";
  if (
    !Number.isInteger(p.x) || !Number.isInteger(p.y) ||
    p.x < 0 || p.y < 0 ||
    p.x >= SUBWAY_CONFIG.board.columns || p.y >= SUBWAY_CONFIG.board.rows
  ) {
    return "Outside the pegboard.";
  }

  const station = stationAt(p);
  if (starter && station) return "Starter pegs must use a normal hole.";

  // Occupancy. Normal holes hold one peg total; station holes hold one peg
  // per company, limited by station capacity.
  if (station) {
    if (me.route.some((n) => n.stationId === station.id)) {
      return "You already connect this station.";
    }
    const claimants = stationClaimants(state, station.id);
    if (claimants.length >= station.capacity) {
      return `${station.name} is at capacity.`;
    }
  } else {
    for (const other of Object.values(state.players)) {
      if (other.route.some((n) => samePoint(n, p))) return "That peg hole is occupied.";
    }
  }

  // Node spacing: keep one empty hole between opposing *normal* nodes.
  // Stations are exempt in both directions so they never become walls.
  if (!station) {
    for (const other of Object.values(state.players)) {
      if (other.id === playerId) continue;
      for (const n of other.route) {
        if (!n.stationId && Math.max(Math.abs(n.x - p.x), Math.abs(n.y - p.y)) <= 1) {
          return "Leave one empty hole beside opposing pegs.";
        }
      }
    }
  }

  if (starter || !me.route.length) return null;

  // Segment checks for the new segment from the current endpoint.
  const from = me.route[me.route.length - 1];

  for (const other of Object.values(state.players)) {
    for (let i = 1; i < other.route.length; i++) {
      const a = other.route[i - 1];
      const b = other.route[i];
      // Two segments may not occupy exactly the same path.
      if ((samePoint(from, a) && samePoint(p, b)) || (samePoint(from, b) && samePoint(p, a))) {
        return "Segments cannot overlap.";
      }
      // A peg may not sit on an existing line (endpoints excluded).
      if (!samePoint(p, a) && !samePoint(p, b) && pointOnSegment(p, a, b)) {
        return "A peg cannot sit on an existing line.";
      }
    }
    // A line may not run through an occupied peg (physical pegs block string).
    for (const n of other.route) {
      if (samePoint(n, from) || samePoint(n, p)) continue;
      if (pointOnSegment(n, from, p)) return "The line would run through an occupied peg.";
    }
  }

  // Crossing the opposing line needs the committed Crossing Design permission,
  // which allows exactly one crossing in total.
  const crossings = countCrossings(state, playerId, from, p);
  if (crossings > 0) {
    if (!me.committedEngineering.includes("crossing")) {
      return "Crossing Design is required to cross the opposing line.";
    }
    if (me.crossingsUsed + crossings > 1) {
      return "Crossing Design permits only one crossing.";
    }
  }

  return null;
}

/** True when the player has at least one legal placement anywhere. */
export function hasLegalMove(state: SubwayState, playerId: string): boolean {
  for (let y = 0; y < SUBWAY_CONFIG.board.rows; y++) {
    for (let x = 0; x < SUBWAY_CONFIG.board.columns; x++) {
      if (!validateNode(state, playerId, { x, y })) return true;
    }
  }
  return false;
}

// ----------------------------------------------------------------------------
// Engineering objective evaluation (approximate geometry, see RULES.md)
// ----------------------------------------------------------------------------

export function objectiveMet(id: string, me: SubwayPlayer, opponents: SubwayPlayer[]): boolean {
  const tol = SUBWAY_CONFIG.tolerances;
  const r = me.route;
  const contract = contractFor(me);
  const complete = !!contract && r.length >= contract.nodes;
  // angles[i] is the direction change between segment i and segment i+1.
  const angles = r.slice(2).map((_, i) => angleChange(r[i], r[i + 1], r[i + 2]));
  const runOfTwo = (max: number) =>
    angles.some((_, i) => i + 1 < angles.length && angles[i] <= max && angles[i + 1] <= max);

  switch (id) {
    case "gentle":
      return runOfTwo(tol.gentleCurve);
    case "straight":
      return runOfTwo(tol.straight);
    case "bend":
      return angles.some((a) => a > tol.gentleCurve && a <= tol.bend);
    case "approach":
      return r.some(
        (n, i) =>
          i >= 2 &&
          n.stationId !== undefined &&
          stationById(n.stationId)?.kind === "major" &&
          angleChange(r[i - 2], r[i - 1], n) <= tol.straight
      );
    case "through":
      return r.some(
        (n, i) =>
          i > 0 && i < r.length - 1 && n.stationId !== undefined &&
          angleChange(r[i - 1], n, r[i + 1]) <= tol.gentleCurve
      );
    case "long-segment":
      return r.some(
        (n, i) => i > 0 && Math.hypot(n.x - r[i - 1].x, n.y - r[i - 1].y) >= SUBWAY_CONFIG.longSegmentDistance
      );
    case "parallel":
      // Approximation: one of my segments runs nearly parallel to an opposing
      // segment and close to it (midpoint distance within the configured pegs).
      return r.some((n, i) => {
        if (i === 0) return false;
        const m1 = { x: (n.x + r[i - 1].x) / 2, y: (n.y + r[i - 1].y) / 2 };
        return opponents.some((o) =>
          o.route.some((q, j) => {
            if (j === 0) return false;
            const m2 = { x: (q.x + o.route[j - 1].x) / 2, y: (q.y + o.route[j - 1].y) / 2 };
            return (
              headingDiff(r[i - 1], n, o.route[j - 1], q) <= tol.parallelHeading &&
              Math.hypot(m1.x - m2.x, m1.y - m2.y) <= tol.parallelMaxDistance
            );
          })
        );
      });
    case "terminal":
      return complete && r[r.length - 1]?.stationId !== undefined;
    case "minimal":
      return complete && r.length === contract!.nodes;
    case "crossing":
      return me.crossingsUsed > 0;
    default:
      return false;
  }
}

// ----------------------------------------------------------------------------
// Scoring
// ----------------------------------------------------------------------------

const majorCount = (p: SubwayPlayer): number =>
  STATIONS.filter((s) => s.kind === "major" && p.route.some((n) => n.stationId === s.id)).length;

export function scoreGame(state: SubwayState): SubwayState {
  const players = structuredClone(state.players);

  for (const p of Object.values(players)) {
    const contract = contractFor(p);
    const items: ScoreItem[] = [];
    const claimed = STATIONS.filter((s) => p.route.some((n) => n.stationId === s.id));

    for (const s of claimed) {
      items.push({ label: `${s.name} connection`, points: SUBWAY_CONFIG.stationScores[s.kind], met: true });
    }

    if (contract) {
      const complete = p.route.length >= contract.nodes;
      items.push({
        label: complete ? `${contract.name} completed` : `${contract.name} incomplete`,
        points: complete ? contract.completionVp : contract.incompletePenalty,
        met: complete,
      });
      if (claimed.some((s) => s.kind === "major")) {
        items.push({ label: "Contract major-station bonus", points: contract.stationBonus, met: true });
      }
      if (contract.id === "express" && complete && majorCount(p) >= 2) {
        items.push({ label: "Express special", points: 3, met: true });
      }
    }

    const opponents = Object.values(players).filter((o) => o.id !== p.id);
    for (const id of p.committedEngineering) {
      const card = ENGINEERING_CARDS.find((c) => c.id === id);
      if (!card) continue;
      const met = objectiveMet(id, p, opponents);
      items.push({ label: card.name, points: met ? card.vp : 0, met });
    }

    p.scoreBreakdown = items;
    p.score = items.reduce((sum, i) => sum + i.points, 0);
  }

  // Ties: score, then major connections, then remaining money, then shared win.
  const ranked = Object.values(players).sort(
    (a, b) => b.score! - a.score! || majorCount(b) - majorCount(a) || b.money - a.money
  );
  const top = ranked[0];
  const winners = ranked
    .filter((p) => p.score === top.score && majorCount(p) === majorCount(top) && p.money === top.money)
    .map((p) => p.id);

  return {
    ...state,
    players,
    winnerIds: winners,
    phase: "RESULTS",
    message: winners.length > 1 ? "Shared victory!" : `${top.name} wins!`,
  };
}

// ----------------------------------------------------------------------------
// Setup and construction flow
// ----------------------------------------------------------------------------

function makePlayer(p: Player, index: number): SubwayPlayer {
  return {
    id: p.id,
    name: p.name,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    money: SUBWAY_CONFIG.startingMoney,
    engineeringHand: [...SUBWAY_CONFIG.startingHands.engineering],
    committedEngineering: [],
    engineeringLocked: false,
    schedulingHand: [...SUBWAY_CONFIG.startingHands.scheduling],
    constructionHand: [...SUBWAY_CONFIG.startingHands.construction],
    scheduleConfirmed: false,
    route: [],
    crossingsUsed: 0,
    overtimeActions: 0,
  };
}

function initialState(players: Player[]): SubwayState {
  const seats = players.slice(0, 2);
  const playersById: Record<string, SubwayPlayer> = {};
  seats.forEach((p, i) => {
    playersById[p.id] = makePlayer(p, i);
  });
  return {
    phase: "SETUP",
    playerOrder: seats.map((p) => p.id),
    players: playersById,
    defaultPriorityPlayerId: seats[0]?.id ?? "",
    procurementTurn: 0,
    market: { contractIndex: 0, engineeringIndex: 0, schedulingIndex: 0, constructionIndex: 0 },
    currentPeriod: 1,
    constructionQueue: [],
    winnerIds: [],
    message: "Waiting for the host to start.",
  };
}

/**
 * Advances to the next period (starting from state.currentPeriod) with at
 * least one scheduled, unfinished builder, or to SCORING when none remain.
 */
function advanceConstruction(state: SubwayState): SubwayState {
  let period = state.currentPeriod;
  let queue: string[] = [];

  while (period <= SUBWAY_CONFIG.timelinePeriods && !queue.length) {
    queue = state.playerOrder.filter((id) => {
      const p = state.players[id];
      const contract = contractFor(p);
      return !!contract && p.route.length < contract.nodes && periodsFor(p).includes(period);
    });
    // Priority 1 acts first when both companies share the period.
    queue.sort((a, b) =>
      a === state.defaultPriorityPlayerId ? -1 : b === state.defaultPriorityPlayerId ? 1 : 0
    );
    if (!queue.length) period++;
  }

  if (period > SUBWAY_CONFIG.timelinePeriods) {
    return {
      ...state,
      phase: "SCORING",
      currentPeriod: period,
      constructionQueue: [],
      message: "Construction is complete. Reveal Engineering and score.",
    };
  }

  return {
    ...state,
    currentPeriod: period,
    constructionQueue: queue,
    message: `Period ${period}: ${state.players[queue[0]].name} builds.`,
  };
}

/** Ends the acting player's current action and moves play along. */
function finishAction(s: SubwayState): SubwayState {
  s.constructionQueue = s.constructionQueue.slice(1);
  if (!s.constructionQueue.length) {
    s.currentPeriod++;
    return advanceConstruction(s);
  }
  s.message = `Period ${s.currentPeriod}: ${s.players[s.constructionQueue[0]].name} builds.`;
  return s;
}

const bothPlayers = (s: SubwayState): SubwayPlayer[] => s.playerOrder.map((id) => s.players[id]);

// ----------------------------------------------------------------------------
// Reducer
// ----------------------------------------------------------------------------

function reducer(state: SubwayState, action: SubwayAction, ctx: GameContext): SubwayState {
  const actor = state.players[action.playerId];
  if (action.type !== "START_GAME" && !actor) return state;

  const s = structuredClone(state);
  const me = s.players[action.playerId];

  switch (action.type) {
    case "START_GAME": {
      if (state.phase !== "SETUP") return state;
      if (ctx.room.hostId !== action.playerId) return state;
      if (ctx.room.players.length < 2) return state;
      // Rebuild seats from the live room so lazily-initialized state can never
      // strand a player outside the game. First two joiners become companies.
      const fresh = initialState(ctx.room.players);
      fresh.phase = "PROCUREMENT";
      fresh.defaultPriorityPlayerId = fresh.playerOrder[Math.floor(ctx.random() * fresh.playerOrder.length)];
      const first = fresh.players[fresh.playerOrder[0]];
      const priority = fresh.players[fresh.defaultPriorityPlayerId];
      fresh.message = `${first.name} shops first. ${priority.name} holds Priority 1.`;
      return fresh;
    }

    case "PROCURE": {
      if (state.phase !== "PROCUREMENT" || !me) return state;
      if (procurementPlayerId(s) !== me.id) return state;
      const choice = action.payload?.choice;

      if (choice === "contract") {
        if (me.contractId) return state;
        const contract = marketContract(s.market);
        if (me.money < contract.cost) return state;
        me.money -= contract.cost;
        me.contractId = contract.id;
        s.market.contractIndex++;
        s.message = `${me.name} bought the ${contract.name}.`;
      } else if (choice === "engineering") {
        me.engineeringHand.push(marketEngineering(s.market).id);
        s.market.engineeringIndex++;
        s.message = `${me.name} took an Engineering card.`;
      } else if (choice === "scheduling") {
        me.schedulingHand.push(marketScheduling(s.market).id);
        s.market.schedulingIndex++;
        s.message = `${me.name} took a Scheduling card.`;
      } else if (choice === "construction") {
        me.constructionHand.push(marketConstruction(s.market).id);
        s.market.constructionIndex++;
        s.message = `${me.name} took a Construction card.`;
      } else if (choice === "pass") {
        s.message = `${me.name} passed.`;
      } else {
        return state;
      }

      s.procurementTurn++;
      if (bothPlayers(s).every((p) => p.contractId)) {
        s.phase = "ENGINEERING";
        s.message = "Both contracts signed. Commit exactly three Engineering cards.";
      }
      return s;
    }

    case "COMMIT_ENGINEERING": {
      if (state.phase !== "ENGINEERING" || !me || me.engineeringLocked) return state;
      const ids = action.payload?.cardIds ?? [];
      if (ids.length !== 3 || new Set(ids).size !== 3) return state;
      let hand = [...me.engineeringHand];
      for (const id of ids) {
        if (!hand.includes(id)) return state;
        hand = removeOne(hand, id);
      }
      me.engineeringHand = hand;
      me.committedEngineering = [...ids];
      me.engineeringLocked = true;
      s.message = `${me.name} committed their Engineering cards.`;
      if (bothPlayers(s).every((p) => p.engineeringLocked)) {
        s.phase = "SCHEDULING_PROPOSAL";
        s.message = "Secretly propose the start period of your construction block.";
      }
      return s;
    }

    case "PROPOSE_SCHEDULE": {
      if (state.phase !== "SCHEDULING_PROPOSAL" || !me) return state;
      if (me.proposedStart !== undefined) return state;
      const start = action.payload?.start ?? 0;
      if (!legalScheduleStart(me, start)) return state;
      me.proposedStart = start;
      s.message = `${me.name} locked a proposal.`;
      // Simultaneous reveal: when both proposals are in, reveal immediately.
      if (bothPlayers(s).every((p) => p.proposedStart !== undefined)) {
        for (const p of bothPlayers(s)) p.scheduleStart = p.proposedStart;
        s.phase = "SCHEDULING_RESOLUTION";
        const priority = s.players[s.defaultPriorityPlayerId];
        s.message = `Schedules revealed — ${priority.name} holds Priority 1. Play up to one Scheduling card, then confirm.`;
      }
      return s;
    }

    case "REVEAL_SCHEDULES": {
      // Legacy path for rooms stuck in SCHEDULING_REVEAL before auto-reveal.
      if (state.phase !== "SCHEDULING_REVEAL" || ctx.room.hostId !== action.playerId) return state;
      for (const p of bothPlayers(s)) p.scheduleStart = p.proposedStart;
      s.phase = "SCHEDULING_RESOLUTION";
      s.message = "Schedules revealed. Play up to one Scheduling card, then confirm.";
      return s;
    }

    case "PLAY_SCHEDULING_CARD": {
      if (state.phase !== "SCHEDULING_RESOLUTION" || !me) return state;
      if (me.scheduleCardPlayed || me.scheduleConfirmed) return state;
      const id = action.payload?.cardId as SchedulingCardId;
      if (!me.schedulingHand.includes(id)) return state;

      if (id === "priority") {
        s.defaultPriorityPlayerId = me.id;
        s.message = `${me.name} played Priority Permit and takes Priority 1.`;
      } else {
        const shift = id === "early" ? -1 : action.payload?.direction === -1 ? -1 : 1;
        const start = (me.scheduleStart ?? 1) + shift;
        if (!legalScheduleStart(me, start)) return state;
        me.scheduleStart = start;
        s.message = `${me.name} shifted their block ${shift < 0 ? "earlier" : "later"}.`;
      }
      me.scheduleCardPlayed = id;
      me.schedulingHand = removeOne(me.schedulingHand, id);
      return s;
    }

    case "CONFIRM_SCHEDULE": {
      if (state.phase !== "SCHEDULING_RESOLUTION" || !me || me.scheduleConfirmed) return state;
      me.scheduleConfirmed = true;
      s.message = `${me.name} confirmed their schedule.`;
      if (bothPlayers(s).every((p) => p.scheduleConfirmed)) {
        // Lock: freeze each block into explicit periods, then place starters.
        for (const p of bothPlayers(s)) p.schedulePeriods = periodsFor(p);
        s.phase = "STARTER_PLACEMENT";
        s.message = "Schedules locked. Each company places one free starter peg.";
      }
      return s;
    }

    case "PLACE_STARTER": {
      if ((state.phase !== "STARTER_PLACEMENT" && state.phase !== "SCHEDULE_LOCKED") || !me) return state;
      if (me.route.length) return state;
      const pt = { x: action.payload?.x ?? -1, y: action.payload?.y ?? -1 };
      if (validateNode(s, me.id, pt, true)) return state;
      me.route = [pt];
      s.message = `${me.name} placed their starter peg.`;
      if (bothPlayers(s).every((p) => p.route.length)) {
        s.phase = "CONSTRUCTION";
        s.currentPeriod = 1;
        return advanceConstruction(s);
      }
      return s;
    }

    case "PLAY_CONSTRUCTION_CARD": {
      if (state.phase !== "CONSTRUCTION" || !me || s.constructionQueue[0] !== me.id) return state;
      const id = action.payload?.cardId as ConstructionCardId;
      if (!me.constructionHand.includes(id)) return state;
      const contract = contractFor(me);
      if (!contract) return state;
      const remaining = contract.nodes - me.route.length;

      if (id === "overtime" || id === "crew") {
        // Both grant one extra sequential build on this scheduled action.
        if (remaining < 2) return state; // would be wasted
        me.overtimeActions++;
        s.message = `${me.name} played ${id === "overtime" ? "Overtime" : "Extra Crew"}: one extra node this action.`;
      } else if (id === "expedite") {
        // Move the next *future* scheduled action one period earlier. Never
        // touches the current or past periods and never stacks onto an
        // existing scheduled period.
        const periods = [...periodsFor(me)].sort((a, b) => a - b);
        const target = periods.find((q) => q - 1 > s.currentPeriod && !periods.includes(q - 1));
        if (target === undefined) return state;
        me.schedulePeriods = periods.map((q) => (q === target ? q - 1 : q)).sort((a, b) => a - b);
        s.message = `${me.name} expedited: period ${target} moves to ${target - 1}.`;
      } else if (id === "field") {
        // Kept for compatibility; no effect in v0.1 (destinations are free).
        s.message = "Field Adjustment has no effect in v0.1 — destinations are always chosen freely.";
      } else {
        return state;
      }

      me.constructionHand = removeOne(me.constructionHand, id);
      return s;
    }

    case "BUILD": {
      if (state.phase !== "CONSTRUCTION" || !me || s.constructionQueue[0] !== me.id) return state;
      const contract = contractFor(me);
      if (!contract || me.route.length >= contract.nodes) return state;
      const pt = { x: action.payload?.x ?? -1, y: action.payload?.y ?? -1 };
      if (validateNode(s, me.id, pt)) return state;

      const from = me.route[me.route.length - 1];
      me.crossingsUsed += countCrossings(s, me.id, from, pt);
      const station = stationAt(pt);
      me.route = [...me.route, { ...pt, ...(station ? { stationId: station.id } : {}) }];

      if (me.route.length >= contract.nodes) {
        me.overtimeActions = 0;
        s.message = `${me.name} completed the ${contract.name}!`;
        return finishAction(s);
      }
      if (me.overtimeActions > 0) {
        me.overtimeActions--;
        s.message = `${me.name} builds one extra node.`;
        return s;
      }
      return finishAction(s);
    }

    case "SKIP_ACTION": {
      // Passing forfeits this construction action (used when blocked in).
      if (state.phase !== "CONSTRUCTION" || !me || s.constructionQueue[0] !== me.id) return state;
      me.overtimeActions = 0;
      s.message = `${me.name} passed their construction action.`;
      return finishAction(s);
    }

    case "ADVANCE_SCORING": {
      if (state.phase !== "SCORING" || ctx.room.hostId !== action.playerId) return state;
      return scoreGame(s);
    }

    default:
      return state;
  }
}

// ----------------------------------------------------------------------------
// Game template
// ----------------------------------------------------------------------------

export const subwayGame = defineGame<SubwayState, SubwayAction>({
  id: "subway",
  name: "Subway",
  description: "Race to engineer and construct a competitive transit network.",
  minPlayers: 2,
  maxPlayers: 2,
  initialState,
  getPhase: (s) => s.phase,
  reducer,
});

// TODO (future design pins, intentionally not implemented in v0.1 — RULES.md):
// - Survey Markers: 2–3 non-reserving, stackable intent markers per player
//   placed during Engineering, with bonus VP for building through them.
// - Company Cards: asymmetric starting money / hands / abilities.
// - Multiple Line Contracts per company across project cycles.
// - Server-controlled bot as an optional third company.
// - Additional maps.
