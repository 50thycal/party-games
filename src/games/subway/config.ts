import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GameContext, Player } from "@/engine/types";

// ============================================================================
// Subway v0.2 — two-player competitive subway-network construction.
//
// This module holds all data, rules, and the reducer. The view lives in
// GameView.tsx. Balancing knobs are collected in SUBWAY_CONFIG and the card /
// contract / station tables below (see RULES.md for the rulings made).
//
// v0.2 replaces the contiguous Gantt block with a period-by-period secret
// commitment, and lets each company hold up to two Line Contracts.
// ============================================================================

/** Bumped when the state shape changes; older rooms must restart. */
export const SUBWAY_STATE_VERSION = 2;

// ----------------------------------------------------------------------------
// Tunable configuration
// ----------------------------------------------------------------------------

export const SUBWAY_CONFIG = {
  startingMoney: 18,
  timelinePeriods: 10,
  maxLinesPerPlayer: 2,
  /** Procurement picks in total = contracts on offer + this. */
  extraProcurementPicks: 2,
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
  /** Max number of line connections that may dock here. */
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

export const stationById = (id: string): Station | undefined => STATION_BY_ID.get(id);

// ----------------------------------------------------------------------------
// Line contracts
// ----------------------------------------------------------------------------

export type LineContract = {
  id: string;
  name: string;
  nodes: number; // total nodes including the free starter peg
  cost: number; // $M
  completionVp: number;
  stationBonus: number; // once per contract, if that line connects a Major Station
  incompletePenalty: number; // negative VP
  special?: string;
};

export const LINE_CONTRACTS: LineContract[] = [
  { id: "short", name: "Short Line", nodes: 5, cost: 6, completionVp: 4, stationBonus: 4, incompletePenalty: -5 },
  { id: "medium", name: "Medium Line", nodes: 7, cost: 8, completionVp: 6, stationBonus: 4, incompletePenalty: -6 },
  { id: "long", name: "Long Line", nodes: 9, cost: 10, completionVp: 8, stationBonus: 4, incompletePenalty: -8 },
  {
    id: "express",
    name: "Express Line",
    nodes: 7,
    cost: 9,
    completionVp: 6,
    stationBonus: 5,
    incompletePenalty: -7,
    special: "+3 VP if this completed line connects two Major Stations.",
  },
];

export const contractById = (id: string): LineContract | undefined =>
  LINE_CONTRACTS.find((c) => c.id === id);

// ----------------------------------------------------------------------------
// Cards
// ----------------------------------------------------------------------------

export type EngineeringCard = {
  id: string;
  name: string;
  description: string;
  /** One-line statement of exactly what the scorer checks. */
  requirement: string;
  vp: number;
  kind: "objective" | "permission";
};

export const ENGINEERING_CARDS: EngineeringCard[] = [
  {
    id: "gentle",
    name: "Gentle Curve",
    description: "Sweep three segments without a sharp turn.",
    requirement: "One line has three consecutive segments where every turn is ≤30°.",
    vp: 4,
    kind: "objective",
  },
  {
    id: "bend",
    name: "45° Bend",
    description: "Work a deliberate dogleg into the alignment.",
    requirement: "One line turns more than 30° and at most 50° at a node.",
    vp: 3,
    kind: "objective",
  },
  {
    id: "straight",
    name: "Straightaway",
    description: "Hold a true alignment across three segments.",
    requirement: "One line has three consecutive segments aligned within 15°.",
    vp: 4,
    kind: "objective",
  },
  {
    id: "approach",
    name: "Station Approach",
    description: "Arrive at a major station square on.",
    requirement: "A line enters a Major Station with its last turn within 15°.",
    vp: 4,
    kind: "objective",
  },
  {
    id: "through",
    name: "Through Station",
    description: "Run through a station instead of terminating at it.",
    requirement: "A line enters and leaves a station turning ≤30° there.",
    vp: 5,
    kind: "objective",
  },
  {
    id: "long-segment",
    name: "Long Segment",
    description: "Span real distance in a single reach.",
    requirement: "One segment spans at least 3 peg widths.",
    vp: 3,
    kind: "objective",
  },
  {
    id: "parallel",
    name: "Parallel Corridor",
    description: "Shadow the competition down the same corridor.",
    requirement: "A segment runs within 15° of an opposing segment, close alongside.",
    vp: 4,
    kind: "objective",
  },
  {
    id: "terminal",
    name: "Terminal Approach",
    description: "Finish at a station, not in open ground.",
    requirement: "A completed line ends on a station.",
    vp: 4,
    kind: "objective",
  },
  {
    id: "minimal",
    name: "Minimal Footprint",
    description: "Deliver every project you signed for.",
    requirement: "Every Line Contract you own is completed.",
    vp: 3,
    kind: "objective",
  },
  {
    id: "crossing",
    name: "Crossing Design",
    description: "Permit to bridge the competition's alignment.",
    requirement: "Permits one crossing of an opposing line. +2 VP if you use it.",
    vp: 2,
    kind: "permission",
  },
];

export const engineeringById = (id: string): EngineeringCard | undefined =>
  ENGINEERING_CARDS.find((c) => c.id === id);

export type SchedulingCardId = "early" | "float" | "priority";

export const SCHEDULING_CARDS: { id: SchedulingCardId; name: string; description: string }[] = [
  {
    id: "early",
    name: "Early Mobilization",
    description: "After the reveal, change what you committed to this period.",
  },
  {
    id: "float",
    name: "Float",
    description: "After the reveal, build last this period and watch them commit first.",
  },
  { id: "priority", name: "Priority Permit", description: "Take Priority 1 for the rest of the game." },
];

export const schedulingById = (id: SchedulingCardId) => SCHEDULING_CARDS.find((c) => c.id === id);

export type ConstructionCardId = "overtime" | "expedite" | "field" | "crew";

export const CONSTRUCTION_CARDS: { id: ConstructionCardId; name: string; description: string }[] = [
  { id: "overtime", name: "Overtime", description: "Build one extra node on the same line this period." },
  { id: "crew", name: "Extra Crew", description: "Build one extra node this period, on either of your lines." },
  { id: "expedite", name: "Expedite Materials", description: "Build first this period, ahead of the opposition." },
  {
    id: "field",
    name: "Field Adjustment",
    description: "Retired in v0.2 — destinations are always chosen freely.",
  },
];

export const constructionById = (id: ConstructionCardId) => CONSTRUCTION_CARDS.find((c) => c.id === id);

/**
 * Face-up market decks, cycled deterministically by the indexes in
 * SubwayState.market. Field Adjustment is excluded: destinations are never
 * pre-committed, which makes it a dead card (see RULES.md).
 */
export const MARKET_DECKS = {
  engineering: ENGINEERING_CARDS.map((c) => c.id),
  scheduling: SCHEDULING_CARDS.map((c) => c.id),
  construction: ["overtime", "crew", "expedite"] as ConstructionCardId[],
} as const;

// ----------------------------------------------------------------------------
// Game state
// ----------------------------------------------------------------------------

export type SubwayPhase =
  | "SETUP"
  | "PROCUREMENT"
  | "ENGINEERING"
  | "STARTER_PLACEMENT"
  | "CONSTRUCTION"
  | "SCORING"
  | "RESULTS";

/** Within CONSTRUCTION: everyone commits in secret, then builds in order. */
export type PeriodStep = "COMMIT" | "RESOLVE";

export type RouteNode = Point & {
  stationId?: string;
  /** Which docking slot of the station this connection occupies. */
  stationSlot?: number;
};

export type PlayerLine = { contractId: string; route: RouteNode[] };

export type PeriodCommitment = { kind: "pass" } | { kind: "build"; lineIndex: number };

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
  lines: PlayerLine[];
  /** This period's secret commitment; hidden from the opponent until reveal. */
  commitment?: PeriodCommitment;
  /** Queued build actions this period. A null entry may target any line. */
  pendingActions: (number | null)[];
  actedThisPeriod: boolean;
  schedulingCardThisPeriod: boolean;
  constructionCardThisPeriod: boolean;
  crossingsUsed: number;
  score?: number;
  scoreBreakdown?: ScoreItem[];
};

export type Market = {
  engineeringIndex: number;
  schedulingIndex: number;
  constructionIndex: number;
};

export interface SubwayState {
  version: number;
  phase: SubwayPhase;
  playerOrder: string[];
  players: Record<string, SubwayPlayer>;
  /** Priority 1 acts first when both companies build in the same period. */
  priorityPlayerId: string;
  /** Snake draft sequence of player ids, one entry per procurement pick. */
  procurementOrder: string[];
  procurementPick: number;
  /** Contract ids still on offer. */
  contractMarket: string[];
  market: Market;
  currentPeriod: number;
  periodStep: PeriodStep;
  /** Players still to build this period, in resolution order. */
  resolveQueue: string[];
  winnerIds: string[];
  message: string;
}

export type SubwayActionType =
  | "START_GAME"
  | "PROCURE"
  | "COMMIT_ENGINEERING"
  | "PLACE_STARTER"
  | "COMMIT_PERIOD"
  | "PLAY_SCHEDULING_CARD"
  | "PLAY_CONSTRUCTION_CARD"
  | "BUILD"
  | "SKIP_ACTION"
  | "ADVANCE_SCORING";

export interface SubwayAction extends BaseAction {
  type: SubwayActionType;
  payload?: {
    choice?: "contract" | "engineering" | "scheduling" | "construction" | "pass";
    contractId?: string;
    cardIds?: string[];
    cardId?: string;
    lineIndex?: number;
    pass?: boolean;
    x?: number;
    y?: number;
  };
}

export const PLAYER_COLORS = ["#e5484d", "#3b82f6"];

// ----------------------------------------------------------------------------
// Small helpers
// ----------------------------------------------------------------------------

const seats = (s: SubwayState): SubwayPlayer[] =>
  s.playerOrder.map((id) => s.players[id]).filter(Boolean);

export const contractOf = (line: PlayerLine): LineContract | undefined => contractById(line.contractId);

export const lineComplete = (line: PlayerLine): boolean => {
  const contract = contractOf(line);
  return !!contract && line.route.length >= contract.nodes;
};

export const allLinesComplete = (p: SubwayPlayer): boolean =>
  p.lines.length > 0 && p.lines.every(lineComplete);

/** Build actions still owed on one contract (the starter peg is free). */
export const lineActionsRemaining = (line: PlayerLine): number => {
  const contract = contractOf(line);
  if (!contract) return 0;
  return Math.max(0, contract.nodes - Math.max(1, line.route.length));
};

/** Total build actions still owed across all of a company's contracts. */
export const actionsRemaining = (p: SubwayPlayer): number =>
  p.lines.reduce((sum, line) => sum + lineActionsRemaining(line), 0);

export const marketEngineering = (m: Market): EngineeringCard =>
  engineeringById(MARKET_DECKS.engineering[m.engineeringIndex % MARKET_DECKS.engineering.length])!;

export const marketScheduling = (m: Market) =>
  schedulingById(MARKET_DECKS.scheduling[m.schedulingIndex % MARKET_DECKS.scheduling.length])!;

export const marketConstruction = (m: Market) =>
  constructionById(MARKET_DECKS.construction[m.constructionIndex % MARKET_DECKS.construction.length])!;

/** The player whose procurement pick it currently is. */
export const procurementPlayerId = (s: SubwayState): string | undefined =>
  s.procurementOrder[s.procurementPick];

/** Picks this player still has left, including the current one. */
export const picksRemaining = (s: SubwayState, playerId: string): number =>
  s.procurementOrder.slice(s.procurementPick).filter((id) => id === playerId).length;

/** Removes a single instance of a value (hands may hold duplicates). */
const removeOne = <T,>(arr: T[], value: T): T[] => {
  const i = arr.indexOf(value);
  return i === -1 ? arr : [...arr.slice(0, i), ...arr.slice(i + 1)];
};

/** Snake draft order: A B | B A | A B … so neither seat hoards the openers. */
export function snakeOrder(ids: string[], picks: number): string[] {
  const order: string[] = [];
  for (let round = 0; order.length < picks; round++) {
    const sequence = round % 2 === 0 ? ids : [...ids].reverse();
    for (const id of sequence) {
      if (order.length >= picks) break;
      order.push(id);
    }
  }
  return order;
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

type LineRef = { playerId: string; lineIndex: number; line: PlayerLine };

/** Every line on the board, including unstarted ones. */
export const allLines = (s: SubwayState): LineRef[] =>
  s.playerOrder.flatMap((id) =>
    (s.players[id]?.lines ?? []).map((line, lineIndex) => ({ playerId: id, lineIndex, line }))
  );

/** How many opposing segments the candidate segment from→to crosses. */
export function countCrossings(state: SubwayState, playerId: string, from: Point, to: Point): number {
  let crossings = 0;
  for (const { playerId: owner, line } of allLines(state)) {
    if (owner === playerId) continue;
    for (let i = 1; i < line.route.length; i++) {
      if (segmentsCross(from, to, line.route[i - 1], line.route[i])) crossings++;
    }
  }
  return crossings;
}

// ----------------------------------------------------------------------------
// Placement validation
// ----------------------------------------------------------------------------

/** Line connections docked at a station, in the order they arrived. */
export function stationConnections(state: SubwayState, stationId: string): LineRef[] {
  return allLines(state).filter(({ line }) => line.route.some((n) => n.stationId === stationId));
}

/** Companies holding at least one connection at a station. */
export function stationCompanies(state: SubwayState, stationId: string): string[] {
  return Array.from(new Set(stationConnections(state, stationId).map((c) => c.playerId)));
}

/**
 * Validates extending `lineIndex` of `playerId` to `p`. Returns a
 * human-readable reason when the placement is illegal, or null when allowed.
 *
 * Station holes are docks: each holds one connection per line, up to the
 * station's capacity, so companies race for slots. Normal holes hold one peg.
 */
export function validateNode(
  state: SubwayState,
  playerId: string,
  lineIndex: number,
  p: Point,
  starter = false
): string | null {
  const me = state.players[playerId];
  if (!me) return "You are not part of this game.";
  const myLine = me.lines[lineIndex];
  if (!myLine) return "That line is not under contract.";
  if (
    !Number.isInteger(p.x) || !Number.isInteger(p.y) ||
    p.x < 0 || p.y < 0 ||
    p.x >= SUBWAY_CONFIG.board.columns || p.y >= SUBWAY_CONFIG.board.rows
  ) {
    return "Outside the pegboard.";
  }

  const station = stationAt(p);
  if (starter && station) return "Starter pegs must use a normal hole.";

  if (station) {
    if (myLine.route.some((n) => n.stationId === station.id)) {
      return "This line already connects that station.";
    }
    if (stationConnections(state, station.id).length >= station.capacity) {
      return `${station.name} is at capacity.`;
    }
  } else {
    for (const { line } of allLines(state)) {
      if (line.route.some((n) => samePoint(n, p))) return "That peg hole is occupied.";
    }
  }

  // Node spacing: keep one empty hole between opposing *normal* nodes. Stations
  // are exempt in both directions so they never become walls, and a company's
  // own lines may run side by side.
  if (!station) {
    for (const { playerId: owner, line } of allLines(state)) {
      if (owner === playerId) continue;
      for (const n of line.route) {
        if (!n.stationId && Math.max(Math.abs(n.x - p.x), Math.abs(n.y - p.y)) <= 1) {
          return "Leave one empty hole beside opposing pegs.";
        }
      }
    }
  }

  if (starter || !myLine.route.length) return null;

  // Segment checks for the new segment from this line's current endpoint.
  const from = myLine.route[myLine.route.length - 1];

  for (const { playerId: owner, line } of allLines(state)) {
    for (let i = 1; i < line.route.length; i++) {
      const a = line.route[i - 1];
      const b = line.route[i];
      if ((samePoint(from, a) && samePoint(p, b)) || (samePoint(from, b) && samePoint(p, a))) {
        return "Segments cannot overlap.";
      }
      if (!samePoint(p, a) && !samePoint(p, b) && pointOnSegment(p, a, b)) {
        return "A peg cannot sit on an existing line.";
      }
      // Your own string may never cross itself or your other line; the permit
      // below only covers the opposition. Segments sharing the growing
      // endpoint are not crossings, so they never trip this.
      if (owner === playerId && segmentsCross(from, p, a, b)) {
        return "Your own lines cannot cross.";
      }
    }
    for (const n of line.route) {
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

/** True when this line has at least one legal placement anywhere. */
export function hasLegalMove(state: SubwayState, playerId: string, lineIndex: number): boolean {
  const line = state.players[playerId]?.lines[lineIndex];
  if (!line || lineComplete(line)) return false;
  const starter = line.route.length === 0;
  for (let y = 0; y < SUBWAY_CONFIG.board.rows; y++) {
    for (let x = 0; x < SUBWAY_CONFIG.board.columns; x++) {
      if (!validateNode(state, playerId, lineIndex, { x, y }, starter)) return true;
    }
  }
  return false;
}

/** Lines this company could still legally build on this period. */
export function buildableLines(state: SubwayState, playerId: string): number[] {
  const me = state.players[playerId];
  if (!me) return [];
  return me.lines
    .map((_, i) => i)
    .filter((i) => !lineComplete(me.lines[i]) && hasLegalMove(state, playerId, i));
}

const canAct = (state: SubwayState, playerId: string): boolean =>
  buildableLines(state, playerId).length > 0;

// ----------------------------------------------------------------------------
// Engineering objective evaluation (approximate geometry, see RULES.md)
// ----------------------------------------------------------------------------

function lineMeets(id: string, line: PlayerLine, me: SubwayPlayer, opponents: SubwayPlayer[]): boolean {
  const tol = SUBWAY_CONFIG.tolerances;
  const r = line.route;
  const complete = lineComplete(line);
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
          o.lines.some((ol) =>
            ol.route.some((q, j) => {
              if (j === 0) return false;
              const m2 = { x: (q.x + ol.route[j - 1].x) / 2, y: (q.y + ol.route[j - 1].y) / 2 };
              return (
                headingDiff(r[i - 1], n, ol.route[j - 1], q) <= tol.parallelHeading &&
                Math.hypot(m1.x - m2.x, m1.y - m2.y) <= tol.parallelMaxDistance
              );
            })
          )
        );
      });
    case "terminal":
      return complete && r[r.length - 1]?.stationId !== undefined;
    case "crossing":
      return me.crossingsUsed > 0;
    default:
      return false;
  }
}

export function objectiveMet(id: string, me: SubwayPlayer, opponents: SubwayPlayer[]): boolean {
  // Minimal Footprint is judged across the whole portfolio, not per line.
  if (id === "minimal") return allLinesComplete(me);
  if (id === "crossing") return me.crossingsUsed > 0;
  return me.lines.some((line) => lineMeets(id, line, me, opponents));
}

// ----------------------------------------------------------------------------
// Scoring
// ----------------------------------------------------------------------------

const connectedStations = (p: SubwayPlayer): Station[] =>
  STATIONS.filter((s) => p.lines.some((line) => line.route.some((n) => n.stationId === s.id)));

const lineMajors = (line: PlayerLine): Station[] =>
  STATIONS.filter((s) => s.kind === "major" && line.route.some((n) => n.stationId === s.id));

const majorCount = (p: SubwayPlayer): number =>
  connectedStations(p).filter((s) => s.kind === "major").length;

export function scoreGame(state: SubwayState): SubwayState {
  const players = structuredClone(state.players);

  for (const p of Object.values(players)) {
    const items: ScoreItem[] = [];

    // Stations score once per company, however many lines dock there.
    for (const s of connectedStations(p)) {
      items.push({ label: `${s.name} connection`, points: SUBWAY_CONFIG.stationScores[s.kind], met: true });
    }

    for (const line of p.lines) {
      const contract = contractOf(line);
      if (!contract) continue;
      const complete = lineComplete(line);
      items.push({
        label: complete
          ? `${contract.name} completed`
          : `${contract.name} incomplete (${line.route.length}/${contract.nodes})`,
        points: complete ? contract.completionVp : contract.incompletePenalty,
        met: complete,
      });
      const majors = lineMajors(line);
      if (majors.length) {
        items.push({ label: `${contract.name} major-station bonus`, points: contract.stationBonus, met: true });
      }
      if (contract.id === "express" && complete && majors.length >= 2) {
        items.push({ label: "Express special", points: 3, met: true });
      }
    }

    const opponents = Object.values(players).filter((o) => o.id !== p.id);
    for (const id of p.committedEngineering) {
      const card = engineeringById(id);
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
// Setup
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
    lines: [],
    pendingActions: [],
    actedThisPeriod: false,
    schedulingCardThisPeriod: false,
    constructionCardThisPeriod: false,
    crossingsUsed: 0,
  };
}

function initialState(players: Player[]): SubwayState {
  const roster = players.slice(0, 2);
  const playersById: Record<string, SubwayPlayer> = {};
  roster.forEach((p, i) => {
    playersById[p.id] = makePlayer(p, i);
  });
  const order = roster.map((p) => p.id);
  return {
    version: SUBWAY_STATE_VERSION,
    phase: "SETUP",
    playerOrder: order,
    players: playersById,
    priorityPlayerId: order[0] ?? "",
    procurementOrder: [],
    procurementPick: 0,
    contractMarket: LINE_CONTRACTS.map((c) => c.id),
    market: { engineeringIndex: 0, schedulingIndex: 0, constructionIndex: 0 },
    currentPeriod: 1,
    periodStep: "COMMIT",
    resolveQueue: [],
    winnerIds: [],
    message: "Waiting for the host to start.",
  };
}

// ----------------------------------------------------------------------------
// Construction flow
// ----------------------------------------------------------------------------

const byPriority = (s: SubwayState) => (a: string, b: string) =>
  a === s.priorityPlayerId ? -1 : b === s.priorityPlayerId ? 1 : 0;

function toScoring(s: SubwayState): SubwayState {
  s.phase = "SCORING";
  s.resolveQueue = [];
  s.message = "Construction is over. Reveal Engineering and score.";
  return s;
}

/** Opens the COMMIT step of state.currentPeriod, skipping dead periods. */
function beginPeriod(s: SubwayState): SubwayState {
  for (const p of seats(s)) {
    p.commitment = undefined;
    p.pendingActions = [];
    p.actedThisPeriod = false;
    p.schedulingCardThisPeriod = false;
    p.constructionCardThisPeriod = false;
  }
  s.periodStep = "COMMIT";
  s.resolveQueue = [];

  if (seats(s).every(allLinesComplete)) return toScoring(s);

  // Nobody able to build (everyone finished or boxed in) — fast-forward. Pegs
  // are never removed, so a company that is blocked now stays blocked.
  while (s.currentPeriod <= SUBWAY_CONFIG.timelinePeriods && !seats(s).some((p) => canAct(s, p.id))) {
    s.currentPeriod++;
  }
  if (s.currentPeriod > SUBWAY_CONFIG.timelinePeriods) return toScoring(s);

  for (const p of seats(s)) {
    if (!canAct(s, p.id)) p.commitment = { kind: "pass" };
  }
  s.message = `Period ${s.currentPeriod}: commit your construction in secret.`;
  return s;
}

/** Simultaneous reveal, then build order by priority. */
function revealPeriod(s: SubwayState): SubwayState {
  const builders = seats(s).filter((p) => p.commitment?.kind === "build");
  for (const p of builders) {
    p.pendingActions = [(p.commitment as { kind: "build"; lineIndex: number }).lineIndex];
  }
  s.resolveQueue = builders.map((p) => p.id).sort(byPriority(s));
  s.periodStep = "RESOLVE";

  if (!s.resolveQueue.length) {
    s.currentPeriod++;
    return beginPeriod(s);
  }
  s.message = `Period ${s.currentPeriod}: ${s.players[s.resolveQueue[0]].name} builds.`;
  return s;
}

/** Ends a company's turn this period and moves play along. */
function endTurn(s: SubwayState, playerId: string): SubwayState {
  const p = s.players[playerId];
  if (p) {
    p.pendingActions = [];
    p.actedThisPeriod = true;
  }
  s.resolveQueue = s.resolveQueue.filter((id) => id !== playerId);
  if (!s.resolveQueue.length) {
    s.currentPeriod++;
    return beginPeriod(s);
  }
  s.message = `Period ${s.currentPeriod}: ${s.players[s.resolveQueue[0]].name} builds.`;
  return s;
}

/** Drops queued actions that can no longer be spent (line finished or boxed in). */
function prunePendingActions(s: SubwayState, playerId: string): void {
  const p = s.players[playerId];
  const open = buildableLines(s, playerId);
  p.pendingActions = p.pendingActions.filter((restriction) =>
    restriction === null ? open.length > 0 : open.includes(restriction)
  );
}

// ----------------------------------------------------------------------------
// Reducer
// ----------------------------------------------------------------------------

function reducer(state: SubwayState, action: SubwayAction, ctx: GameContext): SubwayState {
  // A state saved by an older version can only be restarted.
  const legacy = state.version !== SUBWAY_STATE_VERSION;
  if (action.type !== "START_GAME" && (legacy || !state.players[action.playerId])) return state;

  const s = structuredClone(state);
  const me = s.players[action.playerId];

  switch (action.type) {
    case "START_GAME": {
      if (!legacy && state.phase !== "SETUP") return state;
      if (ctx.room.hostId !== action.playerId) return state;
      if (ctx.room.players.length < 2) return state;
      // Rebuild seats from the live room so lazily-initialized state can never
      // strand a player outside the game. First two joiners become companies.
      const fresh = initialState(ctx.room.players);
      fresh.phase = "PROCUREMENT";
      fresh.priorityPlayerId = fresh.playerOrder[Math.floor(ctx.random() * fresh.playerOrder.length)];
      // The company without Priority 1 drafts first, offsetting that coin flip.
      const draftFirst =
        fresh.playerOrder.find((id) => id !== fresh.priorityPlayerId) ?? fresh.playerOrder[0];
      const draftOrder = [draftFirst, ...fresh.playerOrder.filter((id) => id !== draftFirst)];
      fresh.procurementOrder = snakeOrder(
        draftOrder,
        LINE_CONTRACTS.length + SUBWAY_CONFIG.extraProcurementPicks
      );
      fresh.message = `${fresh.players[draftFirst].name} drafts first. ${
        fresh.players[fresh.priorityPlayerId].name
      } holds Priority 1.`;
      return fresh;
    }

    case "PROCURE": {
      if (state.phase !== "PROCUREMENT" || !me) return state;
      if (procurementPlayerId(s) !== me.id) return state;
      const choice = action.payload?.choice;
      // A company that would otherwise finish the draft with no contract must
      // spend its last pick on one.
      const mustBuy = me.lines.length === 0 && picksRemaining(s, me.id) <= 1;
      if (mustBuy && choice !== "contract") return state;

      if (choice === "contract") {
        const contractId = action.payload?.contractId;
        if (!contractId || !s.contractMarket.includes(contractId)) return state;
        const contract = contractById(contractId)!;
        if (me.lines.length >= SUBWAY_CONFIG.maxLinesPerPlayer) return state;
        if (me.money < contract.cost) return state;
        me.money -= contract.cost;
        me.lines.push({ contractId, route: [] });
        s.contractMarket = s.contractMarket.filter((id) => id !== contractId);
        s.message = `${me.name} signed the ${contract.name}.`;
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

      s.procurementPick++;
      if (s.procurementPick >= s.procurementOrder.length) {
        s.phase = "ENGINEERING";
        s.message = "Drafting is done. Commit exactly three Engineering cards.";
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
      if (seats(s).every((p) => p.engineeringLocked)) {
        s.phase = "STARTER_PLACEMENT";
        s.message = "Place one free starter peg for each line you contracted.";
      }
      return s;
    }

    case "PLACE_STARTER": {
      if (state.phase !== "STARTER_PLACEMENT" || !me) return state;
      const lineIndex = action.payload?.lineIndex ?? -1;
      const line = me.lines[lineIndex];
      if (!line || line.route.length) return state;
      const pt = { x: action.payload?.x ?? -1, y: action.payload?.y ?? -1 };
      if (validateNode(s, me.id, lineIndex, pt, true)) return state;
      line.route = [pt];
      s.message = `${me.name} placed a starter peg.`;
      if (seats(s).every((p) => p.lines.every((l) => l.route.length))) {
        s.phase = "CONSTRUCTION";
        s.currentPeriod = 1;
        return beginPeriod(s);
      }
      return s;
    }

    case "COMMIT_PERIOD": {
      if (state.phase !== "CONSTRUCTION" || s.periodStep !== "COMMIT" || !me) return state;
      if (me.commitment) return state;
      if (action.payload?.pass) {
        me.commitment = { kind: "pass" };
      } else {
        const lineIndex = action.payload?.lineIndex ?? -1;
        if (!buildableLines(s, me.id).includes(lineIndex)) return state;
        me.commitment = { kind: "build", lineIndex };
      }
      s.message = `${me.name} locked in for period ${s.currentPeriod}.`;
      if (seats(s).every((p) => p.commitment)) return revealPeriod(s);
      return s;
    }

    case "PLAY_SCHEDULING_CARD": {
      if (state.phase !== "CONSTRUCTION" || !me || me.schedulingCardThisPeriod) return state;
      const id = action.payload?.cardId as SchedulingCardId;
      if (!me.schedulingHand.includes(id)) return state;

      if (id === "priority") {
        if (s.priorityPlayerId === me.id) return state;
        s.priorityPlayerId = me.id;
        // Re-order whoever has not built yet this period.
        s.resolveQueue = [...s.resolveQueue].sort(byPriority(s));
        s.message = `${me.name} played Priority Permit and takes Priority 1.`;
      } else if (id === "float") {
        if (s.periodStep !== "RESOLVE" || me.actedThisPeriod) return state;
        if (s.resolveQueue.length < 2 || s.resolveQueue[s.resolveQueue.length - 1] === me.id) return state;
        s.resolveQueue = [...s.resolveQueue.filter((pid) => pid !== me.id), me.id];
        s.message = `${me.name} played Float and will build last this period.`;
      } else if (id === "early") {
        if (s.periodStep !== "RESOLVE" || me.actedThisPeriod) return state;
        if (action.payload?.pass) {
          me.commitment = { kind: "pass" };
          me.pendingActions = [];
          s.resolveQueue = s.resolveQueue.filter((pid) => pid !== me.id);
        } else {
          const lineIndex = action.payload?.lineIndex ?? -1;
          if (!buildableLines(s, me.id).includes(lineIndex)) return state;
          me.commitment = { kind: "build", lineIndex };
          me.pendingActions = [lineIndex];
          const queued = s.resolveQueue.includes(me.id) ? s.resolveQueue : [...s.resolveQueue, me.id];
          s.resolveQueue = [...queued].sort(byPriority(s));
        }
        s.message = `${me.name} played Early Mobilization and changed their commitment.`;
      } else {
        return state;
      }

      me.schedulingHand = removeOne(me.schedulingHand, id);
      me.schedulingCardThisPeriod = true;
      // Switching to a pass can leave nobody building this period.
      if (s.periodStep === "RESOLVE" && !s.resolveQueue.length) {
        s.currentPeriod++;
        return beginPeriod(s);
      }
      return s;
    }

    case "PLAY_CONSTRUCTION_CARD": {
      if (state.phase !== "CONSTRUCTION" || s.periodStep !== "RESOLVE" || !me) return state;
      if (me.constructionCardThisPeriod || me.actedThisPeriod) return state;
      if (!s.resolveQueue.includes(me.id)) return state;
      const id = action.payload?.cardId as ConstructionCardId;
      if (!me.constructionHand.includes(id)) return state;

      if (id === "overtime" || id === "crew") {
        // Only playable when the extra node could actually be placed: Overtime
        // stays on the committed line, Extra Crew may go to either line.
        const restriction = id === "overtime" ? me.pendingActions[0] ?? null : null;
        const capacity =
          restriction === null ? actionsRemaining(me) : lineActionsRemaining(me.lines[restriction]);
        if (capacity < me.pendingActions.length + 1) return state;
        me.pendingActions.push(restriction);
        s.message =
          id === "overtime"
            ? `${me.name} played Overtime: an extra node on the same line.`
            : `${me.name} played Extra Crew: an extra node on either line.`;
      } else if (id === "expedite") {
        if (s.resolveQueue[0] === me.id) return state;
        s.resolveQueue = [me.id, ...s.resolveQueue.filter((pid) => pid !== me.id)];
        s.message = `${me.name} expedited materials and builds first this period.`;
      } else {
        return state; // Field Adjustment is retired in v0.2.
      }

      me.constructionHand = removeOne(me.constructionHand, id);
      me.constructionCardThisPeriod = true;
      return s;
    }

    case "BUILD": {
      if (state.phase !== "CONSTRUCTION" || s.periodStep !== "RESOLVE" || !me) return state;
      if (s.resolveQueue[0] !== me.id || !me.pendingActions.length) return state;
      const lineIndex = action.payload?.lineIndex ?? -1;
      const restriction = me.pendingActions[0];
      if (restriction !== null && restriction !== lineIndex) return state;
      const line = me.lines[lineIndex];
      if (!line || lineComplete(line)) return state;

      const pt = { x: action.payload?.x ?? -1, y: action.payload?.y ?? -1 };
      if (validateNode(s, me.id, lineIndex, pt)) return state;

      const from = line.route[line.route.length - 1];
      me.crossingsUsed += countCrossings(s, me.id, from, pt);
      const station = stationAt(pt);
      line.route.push({
        ...pt,
        ...(station ? { stationId: station.id, stationSlot: stationConnections(s, station.id).length } : {}),
      });

      me.pendingActions = me.pendingActions.slice(1);
      const contract = contractOf(line)!;
      s.message = lineComplete(line)
        ? `${me.name} completed the ${contract.name}!`
        : `${me.name} extended the ${contract.name}.`;

      prunePendingActions(s, me.id);
      if (!me.pendingActions.length) return endTurn(s, me.id);
      return s;
    }

    case "SKIP_ACTION": {
      if (state.phase !== "CONSTRUCTION" || s.periodStep !== "RESOLVE" || !me) return state;
      if (s.resolveQueue[0] !== me.id) return state;
      s.message = `${me.name} stopped building this period.`;
      return endTurn(s, me.id);
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

// TODO (future design pins, intentionally not implemented — see RULES.md):
// - Survey Markers: 2–3 non-reserving, stackable intent markers per player
//   placed during Engineering, with bonus VP for building through them.
// - Company Cards: asymmetric starting money / hands / abilities.
// - More than two Line Contracts, across multiple project cycles.
// - Server-controlled bot as an optional third company.
// - Additional maps.
