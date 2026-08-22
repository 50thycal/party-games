import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GameContext, Player } from "@/engine/types";

// ============================================================================
// Subway v0.3 — two-player competitive subway-network construction.
//
// This module holds all data, rules, and the reducer. The view lives in
// GameView.tsx. Balancing knobs are collected in SUBWAY_CONFIG and the card /
// contract / station tables below (see RULES.md for the rulings made).
//
// v0.3 reshapes the game loop into a single pass:
//   SETUP → PROCUREMENT → ENGINEERING → SCHEDULING → STARTER_PLACEMENT
//         → CONSTRUCTION → SCORING → RESULTS
// All scheduling happens once, before construction, on a shared Gantt board.
// ============================================================================

/** Bumped when the state shape changes; older rooms must restart. */
export const SUBWAY_STATE_VERSION = 4;

// ----------------------------------------------------------------------------
// Tunable configuration
// ----------------------------------------------------------------------------

export const SUBWAY_CONFIG = {
  /**
   * Starting capital. The six contracts total $50M, so an even 3/3 split costs
   * about $25M — roughly 74% of this, which is the intended squeeze (see
   * RULES.md). Only contracts, mobilization, and crew consume money.
   */
  startingMoney: 34,
  timelinePeriods: 16,
  minContractsPerPlayer: 2,
  maxContractsPerPlayer: 4,
  /** Nominal market-phase decisions per player; not a hard gate (RULES.md). */
  procurementDecisions: 5,
  /** $M knocked off a contract each time both companies decline it. */
  discountStep: 2,
  /** Discount Yard price floor. */
  minContractPrice: 3,
  /** $M per period per extra concurrent block of your own (second crew). */
  crewCostPerOverlapPeriod: 2,
  /** Mobilization surcharge by block start period; first matching tier wins. */
  mobilizationTiers: [
    { throughPeriod: 3, cost: 3 },
    { throughPeriod: 6, cost: 2 },
    { throughPeriod: 9, cost: 1 },
  ],
  board: { columns: 27, rows: 9 },
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
    construction: ["overtime", "surge"],
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

/**
 * The same six stations as before, spread along the 27-wide corridor and
 * staggered vertically so routes have room to make real shapes. The two Major
 * Stations sit 17 columns apart, which makes connecting both a long-haul job.
 */
export const STATIONS: Station[] = [
  { id: "market", name: "Market", kind: "minor", x: 3, y: 7, capacity: 2 },
  { id: "grand", name: "Grand Central", kind: "major", x: 5, y: 3, capacity: 2 },
  { id: "museum", name: "Museum", kind: "minor", x: 10, y: 6, capacity: 2 },
  { id: "garden", name: "Garden", kind: "minor", x: 14, y: 2, capacity: 2 },
  { id: "stadium", name: "Stadium", kind: "minor", x: 19, y: 7, capacity: 2 },
  { id: "harbor", name: "Harbor Exchange", kind: "major", x: 22, y: 4, capacity: 2 },
];

const STATION_BY_ID = new Map(STATIONS.map((s) => [s.id, s]));

export const stationAt = (p: Point): Station | undefined =>
  STATIONS.find((s) => s.x === p.x && s.y === p.y);

export const stationById = (id: string): Station | undefined => STATION_BY_ID.get(id);

// ----------------------------------------------------------------------------
// Line contracts — six per game, all of which must find an owner.
// ----------------------------------------------------------------------------

export type LineContract = {
  id: string;
  name: string;
  nodes: number; // total nodes including the free starter peg
  cost: number; // $M list price
  completionVp: number;
  stationBonus: number; // once per contract, if that line connects a Major Station
  incompletePenalty: number; // negative VP
  special?: string;
};

export const LINE_CONTRACTS: LineContract[] = [
  { id: "short", name: "Short Line", nodes: 5, cost: 5, completionVp: 4, stationBonus: 3, incompletePenalty: -4 },
  { id: "branch", name: "Branch Line", nodes: 6, cost: 6, completionVp: 5, stationBonus: 3, incompletePenalty: -5 },
  { id: "medium", name: "Medium Line", nodes: 7, cost: 8, completionVp: 6, stationBonus: 4, incompletePenalty: -6 },
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
  { id: "crosstown", name: "Crosstown Line", nodes: 8, cost: 10, completionVp: 7, stationBonus: 4, incompletePenalty: -7 },
  { id: "long", name: "Long Line", nodes: 9, cost: 12, completionVp: 9, stationBonus: 4, incompletePenalty: -8 },
];

export const contractById = (id: string): LineContract | undefined =>
  LINE_CONTRACTS.find((c) => c.id === id);

/** Construction actions a contract needs after its free starter peg. */
export const contractActions = (c: LineContract): number => c.nodes - 1;

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
    description: "Move one block one period earlier and waive the extra mobilization it would cost.",
  },
  {
    id: "float",
    name: "Float",
    description: "After the reveal, slide one block one period earlier or later. Costs adjust.",
  },
  {
    id: "priority",
    name: "Priority Permit",
    description: "Pick one contested period; you build first in that period.",
  },
];

export const schedulingById = (id: SchedulingCardId) => SCHEDULING_CARDS.find((c) => c.id === id);

export type ConstructionCardId = "overtime" | "expedite" | "surge";

export const CONSTRUCTION_CARDS: { id: ConstructionCardId; name: string; description: string }[] = [
  { id: "overtime", name: "Overtime", description: "After a scheduled action, take one more on that same line." },
  { id: "surge", name: "Surge Crew", description: "Take one extra action this period on a different line of yours." },
  { id: "expedite", name: "Expedite Materials", description: "Build before the opposition this period." },
];

export const constructionById = (id: ConstructionCardId) => CONSTRUCTION_CARDS.find((c) => c.id === id);

/**
 * Face-up card market decks, cycled deterministically by the indexes in
 * SubwayState.market. Line Contracts are not part of this market — they come
 * off their own shuffled deck one at a time.
 */
export const MARKET_DECKS = {
  engineering: ENGINEERING_CARDS.map((c) => c.id),
  scheduling: SCHEDULING_CARDS.map((c) => c.id),
  construction: CONSTRUCTION_CARDS.map((c) => c.id),
} as const;

export type CardDeckId = keyof typeof MARKET_DECKS;

// ----------------------------------------------------------------------------
// Game state
// ----------------------------------------------------------------------------

export type SubwayPhase =
  | "SETUP"
  | "PROCUREMENT"
  | "ENGINEERING"
  | "SCHEDULING"
  | "STARTER_PLACEMENT"
  | "CONSTRUCTION"
  | "SCORING"
  | "RESULTS";

/** Within SCHEDULING: plan privately, then reveal and adjust once. */
export type SchedulingStep = "PLANNING" | "RESOLUTION";

export type RouteNode = Point & {
  stationId?: string;
  /** Which docking slot of the station this connection occupies. */
  stationSlot?: number;
};

export type PlayerLine = {
  contractId: string;
  /** What this company paid for it (list price, or a Discount Yard price). */
  paid: number;
  route: RouteNode[];
  /** First period of the contiguous Gantt block; undefined means shelved. */
  start?: number;
  /** Mobilization waived by Early Mobilization, in $M. */
  mobilizationWaived?: number;
};

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
  /** Procurement decisions spent in the normal market phase. */
  decisionsUsed: number;
  scheduleSubmitted: boolean;
  scheduleConfirmed: boolean;
  schedulingCardPlayed?: SchedulingCardId;
  /** Mobilization + crew actually paid at schedule lock. */
  schedulePaid?: number;
  /** Line indexes this company may still build this period. */
  pendingActions: number[];
  actedThisPeriod: boolean;
  constructionCardThisPeriod: boolean;
  crossingsUsed: number;
  score?: number;
  scoreBreakdown?: ScoreItem[];
};

/** A Line Contract currently on the table, awaiting first or second refusal. */
export type ContractOffer = {
  contractId: string;
  price: number;
  firstRefusalId: string;
  /** Whose decision it is right now. */
  activeId: string;
  stage: "first" | "second";
  /** True when this offer came back around out of the Discount Yard. */
  fromYard: boolean;
};

export type YardEntry = { contractId: string; price: number };

export type Procurement = {
  /** Face-down contracts still to be revealed, in shuffled order. */
  deck: string[];
  offer?: ContractOffer;
  yard: YardEntry[];
  /** Offers made so far; drives which seat gets first refusal. */
  offerIndex: number;
  /** True once the deck is empty and the Discount Yard is being cleared. */
  cleanup: boolean;
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
  /** Default company priority; overridden per period by Priority Permit. */
  priorityPlayerId: string;
  /** period → playerId that builds first in that period. */
  priorityOverrides: Record<number, string>;
  procurement: Procurement;
  market: Market;
  schedulingStep: SchedulingStep;
  currentPeriod: number;
  /** Companies still to build this period, in resolution order. */
  resolveQueue: string[];
  winnerIds: string[];
  message: string;
}

export type SubwayActionType =
  | "START_GAME"
  | "PROCURE"
  | "COMMIT_ENGINEERING"
  | "SET_SCHEDULE"
  | "SUBMIT_SCHEDULE"
  | "PLAY_SCHEDULING_CARD"
  | "CONFIRM_SCHEDULE"
  | "PLACE_STARTER"
  | "PLAY_CONSTRUCTION_CARD"
  | "BUILD"
  | "SKIP_ACTION"
  | "ADVANCE_SCORING";

export interface SubwayAction extends BaseAction {
  type: SubwayActionType;
  payload?: {
    choice?: "buy" | "pass";
    deck?: CardDeckId;
    cardIds?: string[];
    cardId?: string;
    lineIndex?: number;
    start?: number | null;
    direction?: number;
    period?: number;
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

/** Removes a single instance of a value (hands may hold duplicates). */
const removeOne = <T,>(arr: T[], value: T): T[] => {
  const i = arr.indexOf(value);
  return i === -1 ? arr : [...arr.slice(0, i), ...arr.slice(i + 1)];
};

// ----------------------------------------------------------------------------
// Schedule maths
// ----------------------------------------------------------------------------

/** The periods a scheduled block occupies; empty when the line is shelved. */
export function blockPeriods(line: PlayerLine): number[] {
  const contract = contractOf(line);
  if (!contract || line.start === undefined) return [];
  return Array.from({ length: contractActions(contract) }, (_, i) => line.start! + i);
}

export const blockEnd = (line: PlayerLine): number | undefined => {
  const periods = blockPeriods(line);
  return periods.length ? periods[periods.length - 1] : undefined;
};

/** True when a block starting here fits inside the construction horizon. */
export function blockFits(line: PlayerLine, start: number): boolean {
  const contract = contractOf(line);
  if (!contract) return false;
  return (
    Number.isInteger(start) &&
    start >= 1 &&
    start + contractActions(contract) - 1 <= SUBWAY_CONFIG.timelinePeriods
  );
}

/** Mobilization surcharge for starting a block in this period. */
export function mobilizationFor(start: number): number {
  for (const tier of SUBWAY_CONFIG.mobilizationTiers) {
    if (start <= tier.throughPeriod) return tier.cost;
  }
  return 0;
}

/** Mobilization actually charged for a line, after any waiver. */
export function lineMobilization(line: PlayerLine): number {
  if (line.start === undefined) return 0;
  return Math.max(0, mobilizationFor(line.start) - (line.mobilizationWaived ?? 0));
}

/** How many of this company's blocks are active in a period. */
export function concurrentBlocks(p: SubwayPlayer, period: number): number {
  return p.lines.filter((line) => blockPeriods(line).includes(period)).length;
}

/** Periods where this company runs more than one block at once. */
export function overlapPeriods(p: SubwayPlayer): number[] {
  const periods: number[] = [];
  for (let period = 1; period <= SUBWAY_CONFIG.timelinePeriods; period++) {
    if (concurrentBlocks(p, period) > 1) periods.push(period);
  }
  return periods;
}

/**
 * Second-crew cost: one base crew is free, every additional simultaneous block
 * costs crewCostPerOverlapPeriod for each period it runs.
 */
export function crewCost(p: SubwayPlayer): number {
  let cost = 0;
  for (let period = 1; period <= SUBWAY_CONFIG.timelinePeriods; period++) {
    cost += Math.max(0, concurrentBlocks(p, period) - 1) * SUBWAY_CONFIG.crewCostPerOverlapPeriod;
  }
  return cost;
}

export const mobilizationCost = (p: SubwayPlayer): number =>
  p.lines.reduce((sum, line) => sum + lineMobilization(line), 0);

export const scheduleCost = (p: SubwayPlayer): number => mobilizationCost(p) + crewCost(p);

/** Reasons this company's proposed schedule cannot be submitted. */
export function scheduleProblems(p: SubwayPlayer): string[] {
  const problems: string[] = [];
  for (const line of p.lines) {
    const contract = contractOf(line);
    if (!contract) continue;
    if (line.start !== undefined && !blockFits(line, line.start)) {
      problems.push(`${contract.name} runs past period ${SUBWAY_CONFIG.timelinePeriods}.`);
    }
  }
  const cost = scheduleCost(p);
  if (cost > p.money) {
    problems.push(`Schedule costs $${cost}M but you hold $${p.money}M.`);
  }
  return problems;
}

/** Periods in which both companies have at least one block running. */
export function contestedPeriods(s: SubwayState): number[] {
  const periods: number[] = [];
  for (let period = 1; period <= SUBWAY_CONFIG.timelinePeriods; period++) {
    if (seats(s).every((p) => concurrentBlocks(p, period) > 0)) periods.push(period);
  }
  return periods;
}

/** Which company builds first in a period, honouring any Priority Permit. */
export const periodPriorityId = (s: SubwayState, period: number): string =>
  s.priorityOverrides[period] ?? s.priorityPlayerId;

// ----------------------------------------------------------------------------
// Procurement helpers
// ----------------------------------------------------------------------------

export const contractCount = (p: SubwayPlayer): number => p.lines.length;

/** Contracts still needing an owner, including the one on the table. */
export const contractsOutstanding = (s: SubwayState): number =>
  s.procurement.deck.length + s.procurement.yard.length + (s.procurement.offer ? 1 : 0);

/**
 * Whether the 2–4 ownership range can still be met. Because every contract is
 * bought and the cap is 4 of 6, holding the cap is what guarantees the
 * opponent's minimum — so this reduces to a capacity check.
 */
export function ownershipFeasible(s: SubwayState, counts: Record<string, number>): boolean {
  const [a, b] = s.playerOrder.map((id) => counts[id] ?? 0);
  const remaining = contractsOutstanding(s);
  const max = SUBWAY_CONFIG.maxContractsPerPlayer;
  const min = SUBWAY_CONFIG.minContractsPerPlayer;
  const lo = Math.max(0, min - a, b + remaining - max);
  const hi = Math.min(remaining, max - a, b + remaining - min);
  return lo <= hi;
}

export const canHoldMore = (p: SubwayPlayer): boolean =>
  contractCount(p) < SUBWAY_CONFIG.maxContractsPerPlayer;

/**
 * True when this company has to take the contract on the table: the opposition
 * has hit its cap, so nobody else can ever own it.
 */
export function mustBuyOffer(s: SubwayState, playerId: string): boolean {
  if (!s.procurement.offer) return false;
  const others = seats(s).filter((p) => p.id !== playerId);
  return others.every((p) => !canHoldMore(p));
}

/** Why this company cannot buy the contract on the table, if it cannot. */
export function buyBlocker(s: SubwayState, playerId: string): string | undefined {
  const offer = s.procurement.offer;
  const me = s.players[playerId];
  if (!offer || !me) return "No contract on offer.";
  if (!canHoldMore(me)) return `Limit ${SUBWAY_CONFIG.maxContractsPerPlayer} contracts.`;
  if (me.money < offer.price) return "Not enough money.";
  return undefined;
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
    decisionsUsed: 0,
    scheduleSubmitted: false,
    scheduleConfirmed: false,
    pendingActions: [],
    actedThisPeriod: false,
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
    priorityOverrides: {},
    procurement: { deck: [], yard: [], offerIndex: 0, cleanup: false },
    market: { engineeringIndex: 0, schedulingIndex: 0, constructionIndex: 0 },
    schedulingStep: "PLANNING",
    currentPeriod: 1,
    resolveQueue: [],
    winnerIds: [],
    message: "Waiting for the host to start.",
  };
}

/** Fisher-Yates using the engine's random source. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ----------------------------------------------------------------------------
// Procurement flow
// ----------------------------------------------------------------------------

/** Hands the contract to the only company that can still legally own it. */
function forceSale(s: SubwayState, entry: YardEntry): SubwayState {
  const eligible = seats(s).filter(canHoldMore);
  if (!eligible.length) return s; // unreachable: 4+4 > 6 contracts
  const buyer = [...eligible].sort((a, b) => b.money - a.money)[0];
  // Distressed price: a forced buyer never pays more than it holds.
  const price = Math.min(entry.price, buyer.money);
  buyer.money -= price;
  buyer.lines.push({ contractId: entry.contractId, paid: price, route: [] });
  s.message = `${buyer.name} is assigned the ${contractById(entry.contractId)!.name} for $${price}M.`;
  return s;
}

/** Reveals the next contract, or ends procurement when every one is owned. */
function nextOffer(s: SubwayState): SubwayState {
  const proc = s.procurement;
  proc.offer = undefined;

  let entry: YardEntry | undefined;
  let fromYard = false;
  if (proc.deck.length) {
    const contractId = proc.deck.shift()!;
    entry = { contractId, price: contractById(contractId)!.cost };
  } else if (proc.yard.length) {
    entry = proc.yard.shift()!;
    fromYard = true;
    proc.cleanup = true;
  }

  if (!entry) {
    s.phase = "ENGINEERING";
    s.message = "Every contract is signed. Commit exactly three Engineering cards.";
    return s;
  }

  const firstRefusalId = s.playerOrder[proc.offerIndex % s.playerOrder.length];
  proc.offerIndex++;
  proc.offer = {
    contractId: entry.contractId,
    price: entry.price,
    firstRefusalId,
    activeId: firstRefusalId,
    stage: "first",
    fromYard,
  };
  const contract = contractById(entry.contractId)!;
  s.message = `${contract.name} on offer at $${entry.price}M — ${s.players[firstRefusalId].name} has first refusal.`;
  return s;
}

/** Lays a company's blocks back to back so scheduling opens somewhere legal. */
function autoSchedule(p: SubwayPlayer): void {
  let cursor = 1;
  for (const line of p.lines) {
    const contract = contractOf(line);
    if (!contract) continue;
    const actions = contractActions(contract);
    if (cursor + actions - 1 <= SUBWAY_CONFIG.timelinePeriods) {
      line.start = cursor;
      cursor += actions;
    } else {
      line.start = undefined; // does not fit end to end; the player must compress or shelve it
    }
  }
}

// ----------------------------------------------------------------------------
// Construction flow
// ----------------------------------------------------------------------------

function toScoring(s: SubwayState): SubwayState {
  s.phase = "SCORING";
  s.resolveQueue = [];
  for (const p of seats(s)) p.pendingActions = [];
  s.message = "Construction is over. Reveal Engineering and score.";
  return s;
}

/** Which line indexes this company is scheduled to build in a period. */
export function scheduledLines(p: SubwayPlayer, period: number): number[] {
  return p.lines
    .map((_, i) => i)
    .filter((i) => blockPeriods(p.lines[i]).includes(period) && !lineComplete(p.lines[i]));
}

/** Opens the next period that anyone is scheduled to build in. */
function beginConstructionPeriod(s: SubwayState): SubwayState {
  for (const p of seats(s)) {
    p.pendingActions = [];
    p.actedThisPeriod = false;
    p.constructionCardThisPeriod = false;
  }
  s.resolveQueue = [];

  while (s.currentPeriod <= SUBWAY_CONFIG.timelinePeriods) {
    const actors: string[] = [];
    for (const p of seats(s)) {
      const lines = scheduledLines(p, s.currentPeriod);
      if (lines.length) actors.push(p.id);
    }
    if (actors.length) {
      for (const p of seats(s)) p.pendingActions = scheduledLines(p, s.currentPeriod);
      const first = periodPriorityId(s, s.currentPeriod);
      s.resolveQueue = actors.sort((a, b) => (a === first ? -1 : b === first ? 1 : 0));
      s.message = `Period ${s.currentPeriod}: ${s.players[s.resolveQueue[0]].name} builds.`;
      return s;
    }
    s.currentPeriod++;
  }
  return toScoring(s);
}

/** Ends a company's turn this period and moves play along. */
function endPlayerTurn(s: SubwayState, playerId: string): SubwayState {
  const p = s.players[playerId];
  if (p) {
    p.pendingActions = [];
    p.actedThisPeriod = true;
  }
  s.resolveQueue = s.resolveQueue.filter((id) => id !== playerId);
  if (!s.resolveQueue.length) {
    s.currentPeriod++;
    return beginConstructionPeriod(s);
  }
  s.message = `Period ${s.currentPeriod}: ${s.players[s.resolveQueue[0]].name} builds.`;
  return s;
}

/** Drops queued actions whose line is finished or boxed in. */
function prunePendingActions(s: SubwayState, playerId: string): void {
  const p = s.players[playerId];
  p.pendingActions = p.pendingActions.filter(
    (i) => !lineComplete(p.lines[i]) && hasLegalMove(s, playerId, i)
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
      fresh.procurement.deck = shuffle(
        LINE_CONTRACTS.map((c) => c.id),
        ctx.random
      );
      return nextOffer(fresh);
    }

    case "PROCURE": {
      if (state.phase !== "PROCUREMENT" || !me) return state;
      const offer = s.procurement.offer;
      if (!offer || offer.activeId !== me.id) return state;
      const contract = contractById(offer.contractId)!;

      if (action.payload?.choice === "buy") {
        const forced = mustBuyOffer(s, me.id);
        const blocker = buyBlocker(s, me.id);
        // A forced buyer never pays more than it holds (RULES.md).
        const price = forced ? Math.min(offer.price, me.money) : offer.price;
        if (blocker && !(forced && blocker === "Not enough money.")) return state;
        me.money -= price;
        me.lines.push({ contractId: offer.contractId, paid: price, route: [] });
        me.decisionsUsed++;
        s.message = `${me.name} signed the ${contract.name} for $${price}M.`;
        return nextOffer(s);
      }

      if (action.payload?.choice !== "pass") return state;
      // Nobody else can ever own this one, so passing is not an option.
      if (mustBuyOffer(s, me.id)) return state;

      if (offer.stage === "first") {
        // First refusal is paid for with a free face-up card.
        const deck = action.payload?.deck;
        if (deck === "engineering") {
          me.engineeringHand.push(marketEngineering(s.market).id);
          s.market.engineeringIndex++;
        } else if (deck === "scheduling") {
          me.schedulingHand.push(marketScheduling(s.market).id);
          s.market.schedulingIndex++;
        } else if (deck === "construction") {
          me.constructionHand.push(marketConstruction(s.market).id);
          s.market.constructionIndex++;
        } else {
          return state;
        }
        me.decisionsUsed++;
        const opponent = s.playerOrder.find((id) => id !== me.id)!;
        offer.stage = "second";
        offer.activeId = opponent;
        s.message = `${me.name} passed and drafted a card. ${s.players[opponent].name} may take the ${contract.name}.`;
        return s;
      }

      // Second pass: no card, and the contract is discounted into the yard.
      me.decisionsUsed++;
      const nextPrice = Math.max(SUBWAY_CONFIG.minContractPrice, offer.price - SUBWAY_CONFIG.discountStep);
      if (offer.fromYard && nextPrice === offer.price) {
        // Already at the floor and declined again — assign it so the phase ends.
        const assigned = forceSale(s, { contractId: offer.contractId, price: nextPrice });
        return nextOffer(assigned);
      }
      s.procurement.yard.push({ contractId: offer.contractId, price: nextPrice });
      s.message = `Both companies passed. ${contract.name} moves to the Discount Yard at $${nextPrice}M.`;
      return nextOffer(s);
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
        s.phase = "SCHEDULING";
        s.schedulingStep = "PLANNING";
        for (const p of seats(s)) autoSchedule(p);
        s.message = "Plan your whole construction programme, then submit it.";
      }
      return s;
    }

    case "SET_SCHEDULE": {
      if (state.phase !== "SCHEDULING" || s.schedulingStep !== "PLANNING" || !me) return state;
      if (me.scheduleSubmitted) return state;
      const lineIndex = action.payload?.lineIndex ?? -1;
      const line = me.lines[lineIndex];
      if (!line) return state;
      const start = action.payload?.start;
      if (start === null || start === undefined) {
        line.start = undefined; // shelved: it will score its incomplete penalty
      } else {
        if (!blockFits(line, start)) return state;
        line.start = start;
      }
      return s;
    }

    case "SUBMIT_SCHEDULE": {
      if (state.phase !== "SCHEDULING" || s.schedulingStep !== "PLANNING" || !me) return state;
      if (me.scheduleSubmitted || scheduleProblems(me).length) return state;
      me.scheduleSubmitted = true;
      s.message = `${me.name} submitted their schedule.`;
      if (seats(s).every((p) => p.scheduleSubmitted)) {
        s.schedulingStep = "RESOLUTION";
        s.message = "Both schedules are revealed. Play up to one Scheduling card, then confirm.";
      }
      return s;
    }

    case "PLAY_SCHEDULING_CARD": {
      if (state.phase !== "SCHEDULING" || s.schedulingStep !== "RESOLUTION" || !me) return state;
      if (me.schedulingCardPlayed || me.scheduleConfirmed) return state;
      const id = action.payload?.cardId as SchedulingCardId;
      if (!me.schedulingHand.includes(id)) return state;

      if (id === "priority") {
        const period = action.payload?.period ?? 0;
        if (!contestedPeriods(s).includes(period)) return state;
        s.priorityOverrides[period] = me.id;
        s.message = `${me.name} took build priority for period ${period}.`;
      } else {
        const lineIndex = action.payload?.lineIndex ?? -1;
        const line = me.lines[lineIndex];
        if (!line || line.start === undefined) return state;
        const shift = id === "early" ? -1 : action.payload?.direction === -1 ? -1 : 1;
        const target = line.start + shift;
        if (!blockFits(line, target)) return state;
        const before = mobilizationFor(line.start);
        const after = mobilizationFor(target);
        line.start = target;
        if (id === "early") {
          // Early Mobilization waives whatever extra the earlier start costs.
          line.mobilizationWaived = (line.mobilizationWaived ?? 0) + Math.max(0, after - before);
        }
        if (scheduleProblems(me).length) return state; // must stay affordable
        s.message = `${me.name} moved a block ${shift < 0 ? "earlier" : "later"}.`;
      }

      me.schedulingHand = removeOne(me.schedulingHand, id);
      me.schedulingCardPlayed = id;
      return s;
    }

    case "CONFIRM_SCHEDULE": {
      if (state.phase !== "SCHEDULING" || s.schedulingStep !== "RESOLUTION" || !me) return state;
      if (me.scheduleConfirmed || scheduleProblems(me).length) return state;
      me.scheduleConfirmed = true;
      s.message = `${me.name} locked their schedule.`;
      if (seats(s).every((p) => p.scheduleConfirmed)) {
        for (const p of seats(s)) {
          const cost = scheduleCost(p);
          p.money -= cost;
          p.schedulePaid = cost;
        }
        s.phase = "STARTER_PLACEMENT";
        s.message = "Schedules are locked. Place one free starter peg per contract.";
      }
      return s;
    }

    case "PLACE_STARTER": {
      if (state.phase !== "STARTER_PLACEMENT" || !me) return state;
      if (starterTurnId(s) !== me.id) return state;
      const lineIndex = action.payload?.lineIndex ?? -1;
      const line = me.lines[lineIndex];
      if (!line || line.route.length) return state;
      const pt = { x: action.payload?.x ?? -1, y: action.payload?.y ?? -1 };
      if (validateNode(s, me.id, lineIndex, pt, true)) return state;
      line.route = [pt];
      s.message = `${me.name} placed a starter peg.`;
      if (!starterTurnId(s)) {
        s.phase = "CONSTRUCTION";
        s.currentPeriod = 1;
        return beginConstructionPeriod(s);
      }
      return s;
    }

    case "PLAY_CONSTRUCTION_CARD": {
      if (state.phase !== "CONSTRUCTION" || !me) return state;
      if (me.constructionCardThisPeriod || me.actedThisPeriod) return state;
      if (!s.resolveQueue.includes(me.id)) return state;
      const id = action.payload?.cardId as ConstructionCardId;
      if (!me.constructionHand.includes(id)) return state;

      if (id === "expedite") {
        if (s.resolveQueue[0] === me.id) return state;
        s.resolveQueue = [me.id, ...s.resolveQueue.filter((pid) => pid !== me.id)];
        s.message = `${me.name} expedited materials and builds first this period.`;
      } else {
        const lineIndex = action.payload?.lineIndex ?? -1;
        const line = me.lines[lineIndex];
        if (!line || lineComplete(line)) return state;
        const queued = me.pendingActions.filter((i) => i === lineIndex).length;
        if (lineActionsRemaining(line) < queued + 1) return state;
        if (id === "overtime") {
          // Overtime doubles up on a line already working this period.
          if (!me.pendingActions.includes(lineIndex)) return state;
        } else {
          // Surge Crew opens a different project instead.
          if (me.pendingActions.includes(lineIndex)) return state;
          if (!hasLegalMove(s, me.id, lineIndex)) return state;
        }
        me.pendingActions.push(lineIndex);
        s.message = `${me.name} played ${constructionById(id)!.name} on the ${contractOf(line)!.name}.`;
      }

      me.constructionHand = removeOne(me.constructionHand, id);
      me.constructionCardThisPeriod = true;
      return s;
    }

    case "BUILD": {
      if (state.phase !== "CONSTRUCTION" || !me) return state;
      if (s.resolveQueue[0] !== me.id || !me.pendingActions.length) return state;
      const lineIndex = action.payload?.lineIndex ?? -1;
      if (!me.pendingActions.includes(lineIndex)) return state;
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

      me.pendingActions = removeOne(me.pendingActions, lineIndex);
      const contract = contractOf(line)!;
      s.message = lineComplete(line)
        ? `${me.name} completed the ${contract.name}!`
        : `${me.name} extended the ${contract.name}.`;

      prunePendingActions(s, me.id);
      if (!me.pendingActions.length) return endPlayerTurn(s, me.id);
      return s;
    }

    case "SKIP_ACTION": {
      if (state.phase !== "CONSTRUCTION" || !me) return state;
      if (s.resolveQueue[0] !== me.id) return state;
      const lineIndex = action.payload?.lineIndex;
      // A skipped action is simply lost; it never rolls into a later period.
      if (lineIndex === undefined || lineIndex === null) {
        me.pendingActions = [];
      } else {
        if (!me.pendingActions.includes(lineIndex)) return state;
        me.pendingActions = removeOne(me.pendingActions, lineIndex);
      }
      s.message = `${me.name} gave up a construction action.`;
      if (!me.pendingActions.length) return endPlayerTurn(s, me.id);
      return s;
    }

    case "ADVANCE_SCORING": {
      if (state.phase !== "SCORING" || ctx.room.hostId !== action.playerId) return state;
      return scoreGame(s);
    }

    default:
      return state;
  }
}

/** Whose turn it is to place a starter peg, alternating between companies. */
export function starterTurnId(s: SubwayState): string | undefined {
  const waiting = s.playerOrder
    .map((id) => s.players[id])
    .filter((p) => p && p.lines.some((l) => !l.route.length));
  if (!waiting.length) return undefined;
  if (waiting.length === 1) return waiting[0].id;
  const placed = (p: SubwayPlayer) => p.lines.filter((l) => l.route.length).length;
  const [a, b] = waiting;
  if (placed(a) !== placed(b)) return placed(a) < placed(b) ? a.id : b.id;
  return s.priorityPlayerId === b.id ? b.id : a.id;
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
// - Multiple project cycles per company.
// - Server-controlled bot as an optional third company.
// - Additional maps.
