import { borderSides, distinctSides, companyNetwork, linesConnected, networkNodeKey, longestNetwork, companyComponents, interchangeAt } from "./network";
export { longestNetwork } from "./network";
import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GameContext, Player } from "@/engine/types";

// ============================================================================
// Subway v0.5 — 2–4 player competitive subway-network construction.
//
// This module holds all data, rules, and the reducer. The view lives in
// GameView.tsx. Balancing knobs are collected in SUBWAY_CONFIG and the card /
// contract / station tables below (see RULES.md for the rulings made).
//
// v0.3 reshaped the loop into a single pass:
//   SETUP → PROCUREMENT → ENGINEERING → SCHEDULING → STARTER_PLACEMENT
//         → CONSTRUCTION → SCORING → RESULTS
//
// v0.4 (WS-002) turns freehand routes into engineered ones. Every contract owns
// an ordered recipe of segment lengths and a permanent line color; construction
// must hit the next length within half a peg and may not turn more than 90°;
// station docks are chosen explicitly; Engineering splits into a planning step
// (three objectives + line-bound Destinations + purchased Survey Pins) and a
// public Survey placement step; and the latest physical placement may be undone.
//
// WS-004 (DEC-021/DEC-022) adds a bounded, privacy-safe public event stream that
// the view narrates over the pegboard, and restricts starter pegs to non-station
// holes on the board's outer border.
// ============================================================================

/** Bumped when the state shape changes; older rooms must restart. */
export const SUBWAY_STATE_VERSION = 20;

// ----------------------------------------------------------------------------
// Tunable configuration
// ----------------------------------------------------------------------------

export const SUBWAY_CONFIG = {
  /**
   * A tighter budget creates choices between construction speed, missions
   * and debt. Every portfolio is affordable to purchase; completion is not free.
   */
  startingMoney: 40,
  completionReward: 3,
  timelinePeriods: 9,
  minContractsPerPlayer: 3,
  maxContractsPerPlayer: 3,
  /** $M per period per extra concurrent block of your own (second crew). */
  crewCostPerOverlapPeriod: 2,
  /** Mobilization surcharge by block start period; first matching tier wins. */
  mobilizationTiers: [
    { throughPeriod: 3, cost: 3 },
    { throughPeriod: 6, cost: 2 },
    { throughPeriod: 9, cost: 1 },
  ],
  board: { columns: 27, rows: 9 },
  stationScores: { major: 0, minor: 0, medium: 0 },
  tolerances: {
    straight: 15, // degrees: "approximately straight"
    gentleCurve: 30, // degrees: max turn for Gentle Curve
    bend: 50, // degrees: upper bound for the 45° bend window
    parallelHeading: 15, // degrees: headings that count as parallel
  },
  /** Ordered-recipe geometry (WS-002). */
  geometry: {
    /** A segment satisfies length L when |distance − L| is within this. */
    lengthTolerance: 0.5,
    /** Maximum heading change between consecutive segments, inclusive. */
    maxTurnDegrees: 90,
  },
  survey: {
    /** $M per Survey Pin. */
    cost: 1,
    /** Most pins one company may buy in a game. */
    max: 5,
    /** VP for a pin the assigned line actually builds through. */
    vp: 1,
  },
  /** Destination mission rewards and optional purchase. */
  destinationVp: 4,
  threeStationDestinationVp: 7,
  destinationPurchaseCost: 5,
  engineeringPicks: 3,
  /** Construction interaction with the opposing network (WS-003, DEC-018). */
  contact: {
    /** $M paid to the opponent per distinct contact with their normal route. */
    toll: 1,
    /** VP lost per $1M of cash still owed at scoring. */
    debtVpPerMillion: 4,
  },
  /** Destination cards face up at the start of the Engineering draft. */
  destinationRow: 3,
  /** Destination cards each company drafts. */
  destinationsPerPlayer: 2,
  startingHands: {
    engineering: [] as string[],
    scheduling: [] as SchedulingCardId[],
  },
} as const;

/** Float slack so a boundary case (exactly ±0.5, exactly 90°) reads as legal. */
const EPS = 1e-6;

// ----------------------------------------------------------------------------
// Board data
// ----------------------------------------------------------------------------

export type Point = { x: number; y: number };

export type Station = Point & {
  id: string;
  name: string;
  kind: "major" | "minor" | "medium";
  /** Exact peg holes belonging to this neighborhood. */
  cells?: Point[];
};

/**
 * Station identities. A game assigns these to well-spaced board sites at
 * setup, so the city changes without ever bunching every Destination together.
 */
export const STATIONS: Station[] = [
  { id: "market", name: "Market", kind: "minor", x: 3, y: 7 },
  { id: "grand", name: "Grand Central", kind: "major", x: 5, y: 3 },
  { id: "museum", name: "Museum", kind: "major", x: 10, y: 6 },
  { id: "garden", name: "Garden", kind: "minor", x: 14, y: 2 },
  { id: "stadium", name: "Stadium", kind: "major", x: 19, y: 7 },
  { id: "university", name: "University", kind: "major", x: 7, y: 7 },
  { id: "library", name: "Library", kind: "minor", x: 12, y: 4 },
  { id: "theatre", name: "Theatre", kind: "medium", x: 17, y: 4 },
  { id: "airport", name: "Airport", kind: "major", x: 24, y: 1 },
  { id: "harbor", name: "Harbor Exchange", kind: "major", x: 22, y: 4 },
];

const STATION_BY_ID = new Map(STATIONS.map((s) => [s.id, s]));

export const stationAt = (p: Point, stations: Station[] = STATIONS): Station | undefined =>
  stations.find((s) => (s.cells ?? [s]).some(c => c.x === p.x && c.y === p.y));

export const stationById = (id: string): Station | undefined => STATION_BY_ID.get(id);

export const neighborhoodSize = (station: Station): string =>
  station.kind === "major" ? "large" : station.kind === "minor" ? "small" : "medium";

// ----------------------------------------------------------------------------
// Line contracts — three per company per game, all of which must find an owner.
// ----------------------------------------------------------------------------

export type LineContract = {
  id: string;
  name: string;
  /** Short label used wherever color alone would not identify the line. */
  code: string;
  /** Permanent, globally distinct route color. */
  color: string;
  /** SVG dash pattern, so lines stay distinguishable without color. */
  dash?: string;
  /** Ordered segment lengths, in peg spaces, built in this order. */
  recipe: number[];
  cost: number; // $M list price
  completionVp: number;
  incompletePenalty: number; // negative VP
};

export const LINE_CONTRACTS: LineContract[] = [
  {
    id: "short",
    name: "Red Line", code: "RE", color: "#b91c1c",
    recipe: [2, 3, 2, 3],
    cost: 5,
    completionVp: 4,
    incompletePenalty: -4,
  },
  {
    id: "branch",
    name: "Orange Line", code: "OR", color: "#c2410c",
    dash: "20 10",
    recipe: [4, 2, 3, 4, 2],
    cost: 6,
    completionVp: 5,
    incompletePenalty: -5,
  },
  {
    id: "medium",
    name: "Green Line", code: "GR", color: "#15803d",
    recipe: [3, 5, 2, 4, 3, 5],
    cost: 8,
    completionVp: 6,
    incompletePenalty: -6,
  },
  {
    id: "express",
    name: "Blue Line", code: "BL", color: "#1d4ed8",
    dash: "26 8 6 8",
    recipe: [6, 4, 5, 3, 6],
    cost: 10,
    completionVp: 6,
    incompletePenalty: -7,
  },
  {
    id: "crosstown",
    name: "Purple Line", code: "PU", color: "#7e22ce",
    dash: "6 9",
    recipe: [5, 3, 4, 2, 5, 3],
    cost: 10,
    completionVp: 7,
    incompletePenalty: -7,
  },
  {
    id: "long",
    name: "Teal Line", code: "TE", color: "#0f766e",
    recipe: [4, 6, 3, 5, 2, 4, 6],
    cost: 11,
    completionVp: 9,
    incompletePenalty: -8,
  },
];

/** Six new services. Each seat receives three contracts from a shared shuffled pool. */
LINE_CONTRACTS.push(
  { id: "tram", name: "Pink Line", code: "PI", color: "#be185d", recipe: [2, 3, 4, 2], cost: 5, completionVp: 4, incompletePenalty: -4 },
  { id: "river", name: "Black Line", code: "BK", color: "#171717", dash: "14 7", recipe: [4, 2, 5, 3, 4], cost: 7, completionVp: 5, incompletePenalty: -5 },
  { id: "university", name: "Yellow Line", code: "YE", color: "#a16207", dash: "4 6", recipe: [3, 2, 4, 3], cost: 6, completionVp: 4, incompletePenalty: -4 },
  { id: "orbital", name: "Gray Line", code: "GY", color: "#64748b", dash: "18 6 4 6", recipe: [4, 5, 2, 4, 3, 5], cost: 9, completionVp: 6, incompletePenalty: -6, },
  { id: "airport", name: "White Line", code: "WH", color: "#e2e8f0", dash: "28 10", recipe: [6, 3, 5, 4, 2], cost: 10, completionVp: 6, incompletePenalty: -6, },
  { id: "local", name: "Brown Line", code: "BR", color: "#78350f", dash: "10 5", recipe: [2, 3, 2, 4, 3], cost: 6, completionVp: 5, incompletePenalty: -5 },
);

export const contractById = (id: string): LineContract | undefined =>
  LINE_CONTRACTS.find((c) => c.id === id);

/** Construction actions a contract needs after its free starter peg. */
export const contractActions = (c: LineContract): number => c.recipe.length;

/** Total nodes on a finished contract, starter peg included. */
export const contractNodes = (c: LineContract): number => c.recipe.length + 1;

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
    "id": "gentle",
    "name": "Three-Way Service",
    "description": "Complete all three lines with their final pegs on three different board sides.",
    "requirement": "Complete all three lines with their final pegs on three different board sides.",
    "vp": 6,
    "kind": "objective"
  },
  {
    "id": "bend",
    "name": "Turning the Corner",
    "description": "Complete all three lines: each starts on the east or west border and ends on the north or south border.",
    "requirement": "Complete all three lines: each starts on the east or west border and ends on the north or south border.",
    "vp": 6,
    "kind": "objective"
  },
  {
    "id": "straight",
    "name": "Loop",
    "description": "Complete all three lines: each ends on the same board side as its starter.",
    "requirement": "Complete all three lines: each ends on the same board side as its starter.",
    "vp": 7,
    "kind": "objective"
  },
  {
    "id": "approach",
    "name": "Regional Service",
    "description": "Complete one line serving three different large neighborhoods.",
    "requirement": "Complete one line serving three different large neighborhoods.",
    "vp": 6,
    "kind": "objective"
  },
  {
    "id": "through",
    "name": "North–South Lines",
    "description": "All three lines each have a node on both the north and south borders.",
    "requirement": "All three lines each have a node on both the north and south borders.",
    "vp": 7,
    "kind": "objective"
  },
  {
    "id": "network",
    "name": "Integrated Network",
    "description": "Complete all three lines and connect them through overlapping or horizontally/vertically adjacent nodes. Sharing an area or crossing strings does not connect lines.",
    "requirement": "Complete all three lines and connect them through overlapping or horizontally/vertically adjacent nodes. Sharing an area or crossing strings does not connect lines.",
    "vp": 7,
    "kind": "objective"
  },
  {
    "id": "terminal",
    "name": "Citywide Service",
    "description": "Place at least one company node in each of the ten neighborhoods. Lines need not connect or be complete.",
    "requirement": "Place at least one company node in each of the ten neighborhoods. Lines need not connect or be complete.",
    "vp": 10,
    "kind": "objective"
  },
  {
    "id": "minimal",
    "name": "Surveyed System",
    "description": "Complete all three lines and build through at least one of your purchased Survey Pins.",
    "requirement": "Complete all three lines and build through at least one of your purchased Survey Pins.",
    "vp": 7,
    "kind": "objective"
  },
  {
    "id": "crossing",
    "name": "First to Open",
    "description": "Be the first company to complete all three lines.",
    "requirement": "Be the first company to complete all three lines.",
    "vp": 7,
    "kind": "objective"
  },
  {
    "id": "crosstown-service",
    "name": "Across Town",
    "description": "4 VP: one company network reaches the exact east and west borders. 8 VP: that same network also reaches north and south. Use distinct nodes for each side. Multiple unfinished lines may contribute.",
    "requirement": "4 VP: one company network reaches the exact east and west borders. 8 VP: that same network also reaches north and south. Use distinct nodes for each side. Multiple unfinished lines may contribute.",
    "vp": 8,
    "kind": "objective"
  },
  {
    "id": "local-service",
    "name": "Local Service",
    "description": "One line serves all three small neighborhoods. The line need not be complete.",
    "requirement": "One line serves all three small neighborhoods. The line need not be complete.",
    "vp": 6,
    "kind": "objective"
  },
  {
    "id": "interchange",
    "name": "Central Interchange",
    "description": "All three lines form one connected group of overlapping or horizontally/vertically adjacent nodes inside the same large neighborhood. Completion is not required.",
    "requirement": "All three lines form one connected group of overlapping or horizontally/vertically adjacent nodes inside the same large neighborhood. Completion is not required.",
    "vp": 4,
    "kind": "objective"
  },
  {
    "id": "solvent",
    "name": "On Budget",
    "description": "Complete all three lines and finish with at least $5M.",
    "requirement": "Complete all three lines and finish with at least $5M.",
    "vp": 6,
    "kind": "objective"
  },
  {
    "id": "perimeter",
    "name": "Perimeter Service",
    "description": "1 / 2 / 3 completed lines each visiting at least three different border sides: 2 / 5 / 8 VP. Each side needs a distinct node.",
    "requirement": "1 / 2 / 3 completed lines each visiting at least three different border sides: 2 / 5 / 8 VP. Each side needs a distinct node.",
    "vp": 8,
    "kind": "objective"
  },
  {
    "id": "three-fronts",
    "name": "Three Fronts",
    "description": "Complete all three lines: their starters occupy three different board sides and their final pegs all occupy the same side.",
    "requirement": "Complete all three lines: their starters occupy three different board sides and their final pegs all occupy the same side.",
    "vp": 7,
    "kind": "objective"
  },
  {
    "id": "four-corners",
    "name": "Four Corners",
    "description": "5 VP: one company network connects two opposite corner pegs. 10 VP: that same network connects all four corner pegs. Multiple unfinished lines may contribute.",
    "requirement": "5 VP: one company network connects two opposite corner pegs. 10 VP: that same network connects all four corner pegs. Multiple unfinished lines may contribute.",
    "vp": 10,
    "kind": "objective"
  }
];

export const OBJECTIVE_TIERS: Record<string,string> = {
  gentle: "1 / 2 / 3 different border sides among completed line ends: 2 / 4 / 6 VP.",
  bend: "1 / 2 / 3 completed lines starting east or west and ending north or south: 2 / 4 / 6 VP.",
  straight: "1 / 2 / 3 completed lines ending on their starter's border side: 2 / 4 / 7 VP.",
  through: "1 / 2 / 3 lines touching both north and south borders: 2 / 4 / 7 VP. Completion is not required.",
  "three-fronts": "1 / 2 / 3 completed lines with different starter sides and a common final border side: 2 / 4 / 7 VP.",
};
for (const card of ENGINEERING_CARDS) {
  if (OBJECTIVE_TIERS[card.id]) card.description = card.requirement = OBJECTIVE_TIERS[card.id];
}

export const engineeringById = (id: string): EngineeringCard | undefined =>
  ENGINEERING_CARDS.find((c) => c.id === id);

/** Private network missions: a fixed balanced deck of 15 pairs and 15 triples. */
export type DestinationCard = {
  id: string;
  stationIds: string[];
  name: string;
  description: string;
  requirement: string;
  vp: number;
};
// A ten-neighborhood ring plus opposite pairs gives each neighborhood 3 pair
// appearances. Ten rotated triples plus five additional triples give 4 or 5
// triple appearances. Canonical order keeps IDs stable and every card unique.
const destinationSets: number[][] = [];
for (let i = 0; i < 10; i++) destinationSets.push([i, (i + 1) % 10]);
for (let i = 0; i < 5; i++) destinationSets.push([i, i + 5]);
for (let i = 0; i < 10; i++) destinationSets.push([i, (i + 1) % 10, (i + 3) % 10]);
for (let i = 0; i < 5; i++) destinationSets.push([i, i + 2, i + 5]);
export const DESTINATION_CARDS: DestinationCard[] = destinationSets.map(indexes => {
  const stations = indexes.sort((a, b) => a - b).map(i => STATIONS[i]);
  const names = stations.map(s => s.name).join(" ↔ ");
  return {id: `dest-${stations.map(s => s.id).join("-")}`, stationIds: stations.map(s => s.id), name: names,
    description: "Connect these neighborhoods through your own network.",
    requirement: `Connect ${names} through your own network. Different lines transfer at overlapping or horizontally/vertically adjacent nodes. Sharing an area or crossing strings does not connect lines. Completion is not required.`,
    vp: stations.length === 2 ? SUBWAY_CONFIG.destinationVp : SUBWAY_CONFIG.threeStationDestinationVp};
});

const DESTINATION_BY_ID = new Map(DESTINATION_CARDS.map((c) => [c.id, c]));

export const destinationById = (id: string): DestinationCard | undefined => DESTINATION_BY_ID.get(id);

export const isDestinationCard = (id: string): boolean => DESTINATION_BY_ID.has(id);

export type SchedulingCardId = "early" | "float" | "priority" | "stagger" | "coordination";

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

SCHEDULING_CARDS.push(
  { id: "stagger", name: "Staggered Start", description: "After reveal, move one block one to three periods later. Costs adjust." },
  { id: "coordination", name: "Coordination Window", description: "After reveal, waive $2M of your crew-overlap cost." },
);

export const schedulingById = (id: SchedulingCardId) => SCHEDULING_CARDS.find((c) => c.id === id);

/**
 * Card families used to seed shuffled piles at setup. Contracts and
 * Destinations have separate drafts.
 */
export const MARKET_DECKS = {
  // Objectives only. Destinations have their own Engineering draft (DEC-019).
  engineering: ENGINEERING_CARDS.map((c) => c.id),
  scheduling: SCHEDULING_CARDS.map((c) => c.id),
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

/**
 * Within ENGINEERING: draft Destinations from a public row, lock the private
 * plan, then place the Survey Pins that plan bought.
 */
export type EngineeringStep = "BUY_SURVEYS" | "CARD_DRAFT" | "DESTINATION_DRAFT" | "PLAN" | "SURVEY";

/** Within SCHEDULING: plan privately, then reveal and adjust once. */
export type SchedulingStep = "PLANNING" | "RESOLUTION";

export type RouteNode = Point & {
  stationId?: string;
  /** Legacy plans only; ignored by current geometry. */
  stationSlot?: number;
  /** Legacy plans only; no connection cap in v18. */
  stationCapacity?: number;
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

/** A Destination card assigned to one of this company's lines. */
export type DestinationCommitment = {
  cardId: string;
  stationId: string;
  lineIndex: number;
};

/**
 * A bought, publicly placed Survey Pin. Pins never occupy a hole, and they are
 * company-wide: any line the buyer owns fulfils one.
 */
export type SurveyPin = {
  playerId: string;
  x: number;
  y: number;
};

export type ScoreItem = { label: string; points: number; met?: boolean };

export type SubwayPlayer = {
  id: string;
  name: string;
  color: string;
  money: number;
  crewsHired?: boolean;
  crewPaid?: number;
  engineeringHand: string[];
  committedEngineering: string[];
  engineeringLocked: boolean;
  /** Private missions scored across the connected company network. */
  destinationHand: string[];
  destinationPurchased?: boolean;
  /** Destination cards locked to a line at Engineering plan lock. */
  destinationCommitments: DestinationCommitment[];
  /** Survey Pins bought at plan lock; paid for once, placed publicly after. */
  surveysPurchased: number;
  schedulingHand: SchedulingCardId[];
  lines: PlayerLine[];
  /** Procurement decisions spent in the normal market phase. */
  decisionsUsed: number;
  scheduleSubmitted: boolean;
  scheduleConfirmed: boolean;
  schedulingCardPlayed?: SchedulingCardId;
  /** Coordination Window removes one $2M crew-overlap surcharge. */
  crewOverlapDiscount?: number;
  /** Mobilization + crew actually paid at schedule lock. */
  schedulePaid?: number;
  /** Line indexes this company may still build this period. */
  pendingActions: number[];
  actedThisPeriod: boolean;
  /**
   * Proper interior-to-interior crossings this company has made of an opposing
   * segment. Crossing needs no permit (DEC-018); this only drives the Crossing
   * Design objective, so contacts at an existing peg deliberately do not count.
   */
  properCrossings: number;
  /** $M paid to the opposition for route contacts, for the results breakdown. */
  tollsPaid: number;
  score?: number;
  scoreBreakdown?: ScoreItem[];
};

/** First visible contract and active picker; the whole row is selectable. */
export type ContractOffer = {contractId:string; price:number; activeId:string};
export type Procurement = {
  row:string[];
  deck:string[];
  offer?:ContractOffer;
  /** Total accepted picks; derives snake round and active seat. */
  offerIndex:number;
};
export type Market = {
  rows:Record<CardDeckId,string[]>;
  decks:Record<CardDeckId,string[]>;
  picks:number;
};

/** What the last physical placement was, so exactly that one can be undone. */
export type UndoRecord = {
  playerId: string;
  kind: "survey" | "starter" | "build";
  /** Human-readable name of the placement, for the undo affordance. */
  label: string;
  /** The complete pre-placement state. Never itself carries an undo record. */
  state: SubwayState;
};

/**
 * One entry of the public narration stream (WS-004, DEC-021). Events are
 * appended only when the reducer accepts a change, carry no hidden card
 * identity, Destination assignment, unrevealed schedule, or private plan, and
 * drive the pegboard overlays plus the bounded public history.
 */
export type SubwayEventKind =
  | "PHASE"
  | "PERIOD"
  | "TURN"
  | "PLACEMENT"
  | "CARD"
  | "PLAN"
  | "ROUTE"
  | "UNDO"
  | "SCORE";

export type SubwayEvent = {
  seq: number;
  kind: SubwayEventKind;
  actorId?: string;
  text: string;
  createdAt: number;
  /** Banners are prominent transitions; notices are brief action narration. */
  emphasis: "banner" | "notice";
};

export type SubwayEndReason = "ROUND_LIMIT" | "NO_LEGAL_CONSTRUCTION";

export type SubwayTelemetryPlayer = {
  money: number;
  crewPaid: number;
  tollsPaid: number;
  surveysPurchased: number;
  engineeringCards: string[];
  destinationCards: string[];
  destinationPurchased: boolean;
  lineNodeCounts: number[];
  completedLines: string[];
};

/**
 * Complete accepted-action ledger used only by the post-game playtest export.
 * Unlike the short public narration stream, this intentionally retains card
 * identities and before/after player snapshots so a playtest can be replayed
 * and its economy inspected after the game.
 */
export type SubwayTelemetryEvent = {
  actionNumber: number;
  acceptedAt: number;
  actorId: string;
  action: SubwayActionType;
  payload?: Record<string, unknown>;
  phaseBefore: SubwayPhase;
  phaseAfter: SubwayPhase;
  periodBefore: number;
  periodAfter: number;
  playersBefore: Record<string, SubwayTelemetryPlayer>;
  playersAfter: Record<string, SubwayTelemetryPlayer>;
};

/** Public events kept in state; older ones fall off the front. */
export const SUBWAY_EVENT_LIMIT = 20;

export interface SubwayState {
  version: number;
  firstCompletedPlayerId?: string;
  phase: SubwayPhase;
  playerOrder: string[];
  players: Record<string, SubwayPlayer>;
  /** This game's shuffled, well-spaced station layout. */
  stations: Station[];
  /**
   * The company opening the rotating priority order. The legacy field name is
   * retained; with 3–4 players the rotation visits every seat.
   */
  oddPriorityId: string;
  /** period → playerId that builds first in that period. */
  priorityOverrides: Record<number, string>;
  procurement: Procurement;
  market: Market;
  engineeringStep: EngineeringStep;
  /** Face-down Destination cards left to refill the draft row from. */
  destinationDeck: string[];
  /** The public face-up Destination row players draft from. */
  destinationRow: string[];
  schedulingStep: SchedulingStep;
  /** Public Survey Pins, in placement order. */
  surveyPins: SurveyPin[];
  currentPeriod: number;
  /** Companies still to build this period, in resolution order. */
  resolveQueue: string[];
  /** The one placement that may still be taken back, if any. */
  undo?: UndoRecord;
  /** Bounded public narration, newest last. Only accepted actions append. */
  events: SubwayEvent[];
  /** Monotonic event sequence. Never rewound — an Undo appends, it never erases. */
  nextEventSeq: number;
  /** Full, finite accepted-action history for the post-game AI report. */
  telemetry: SubwayTelemetryEvent[];
  nextTelemetrySeq: number;
  startedAt?: number;
  constructionEndedAt?: number;
  endReason?: SubwayEndReason;
  winnerIds: string[];
  message: string;
}

export type SubwayActionType =
  | "START_GAME"
  | "PROCURE"
  | "DRAFT_CARD"
  | "BUY_DESTINATION"
  | "BUY_SURVEYS"
  | "HIRE_CREWS"
  | "PICK_DESTINATION"
  | "LOCK_ENGINEERING_PLAN"
  | "PLACE_SURVEY"
  | "AUTO_SCHEDULE"
  | "SET_SCHEDULE"
  | "SUBMIT_SCHEDULE"
  | "PLAY_SCHEDULING_CARD"
  | "CONFIRM_SCHEDULE"
  | "PLACE_STARTER"
  | "BUILD"
  | "SKIP_ACTION"
  | "UNDO_PLACEMENT"
  | "ADVANCE_SCORING";

export interface SubwayAction extends BaseAction {
  type: SubwayActionType;
  payload?: {
    choice?: "buy" | "pass";
    contractId?: string;
    expectedPick?: number;
    lineIndexes?: number[];
    deck?: CardDeckId;
    cardIds?: string[];
    cardId?: string;
    destinations?: { cardId: string; lineIndex: number }[];
    surveys?: number;
    destinationCardId?: string;
    lineIndex?: number;
    start?: number | null;
    direction?: number;
    period?: number;
    otherLineIndex?: number;
    x?: number;
    y?: number;
    slot?: number;
  };
}

export const PLAYER_COLORS = ["#e5484d", "#3b82f6", "#059669", "#a855f7"];

// ----------------------------------------------------------------------------
// Small helpers
// ----------------------------------------------------------------------------

const seats = (s: SubwayState): SubwayPlayer[] =>
  s.playerOrder.map((id) => s.players[id]).filter(Boolean);

export const contractOf = (line: PlayerLine): LineContract | undefined => contractById(line.contractId);

export const lineComplete = (line: PlayerLine): boolean => {
  const contract = contractOf(line);
  return !!contract && line.route.length >= contractNodes(contract);
};

export const allLinesComplete = (p: SubwayPlayer): boolean =>
  p.lines.length > 0 && p.lines.every(lineComplete);

/** How many recipe segments this line has actually built. */
export const segmentsBuilt = (line: PlayerLine): number => Math.max(0, line.route.length - 1);

/** The length the next construction action on this line must hit, if any. */
export function nextSegmentLength(line: PlayerLine): number | undefined {
  const contract = contractOf(line);
  if (!contract || !line.route.length) return undefined;
  return contract.recipe[segmentsBuilt(line)];
}

/** Build actions still owed on one contract (the starter peg is free). */
export const lineActionsRemaining = (line: PlayerLine): number => {
  const contract = contractOf(line);
  if (!contract) return 0;
  return Math.max(0, contract.recipe.length - segmentsBuilt(line));
};

/** Build actions still owed across the contracts this company scheduled. */
export const actionsRemaining = (p: SubwayPlayer): number =>
  p.lines.reduce((sum, line) => sum + (line.start === undefined ? 0 : lineActionsRemaining(line)), 0);

/** Removes a single instance of a value (hands may hold duplicates). */
const removeOne = <T,>(arr: T[], value: T): T[] => {
  const i = arr.indexOf(value);
  return i === -1 ? arr : [...arr.slice(0, i), ...arr.slice(i + 1)];
};

/**
 * Appends one public event and keeps `message` in step with the latest one, so
 * the string can never contradict the structured stream. The text must already
 * be privacy-safe: no hidden card identity, Destination assignment, unrevealed
 * schedule detail, or saved plan ever goes through here.
 */
function pushEvent(
  s: SubwayState,
  now: number,
  kind: SubwayEventKind,
  emphasis: "banner" | "notice",
  text: string,
  actorId?: string
): void {
  s.events.push({
    seq: s.nextEventSeq++,
    kind,
    ...(actorId !== undefined ? { actorId } : {}),
    text,
    createdAt: now,
    emphasis,
  });
  if (s.events.length > SUBWAY_EVENT_LIMIT) {
    s.events.splice(0, s.events.length - SUBWAY_EVENT_LIMIT);
  }
  s.message = text;
}

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
  return Math.max(0, cost - (p.crewOverlapDiscount ?? 0));
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

/** Periods in which at least two companies have a block running. */
export function contestedPeriods(s: SubwayState): number[] {
  const periods: number[] = [];
  for (let period = 1; period <= SUBWAY_CONFIG.timelinePeriods; period++) {
    if (seats(s).filter((p) => concurrentBlocks(p, period) > 0).length >= 2) periods.push(period);
  }
  return periods;
}

/** The company whose calendar turn it is to build first, ignoring permits. */
export function basePriorityId(s: SubwayState, _period: number): string {
  const start = Math.max(0, s.playerOrder.indexOf(s.oddPriorityId));
  return s.playerOrder[start] ?? "";
}

/** Which company builds first in a period, honouring any Priority Permit. */
export const periodPriorityId = (s: SubwayState, period: number): string =>
  s.priorityOverrides[period] ?? basePriorityId(s, period);

// ----------------------------------------------------------------------------
// Procurement helpers
// ----------------------------------------------------------------------------

export const contractCount = (p: SubwayPlayer): number => p.lines.length;

/** Contracts still needing an owner, including the one on the table. */
export const contractsOutstanding = (s: SubwayState): number =>
  s.procurement.deck.length + s.procurement.row.length;

// ----------------------------------------------------------------------------
// Geometry
//
// Neighborhood and ordinary nodes both use exact integer peg positions.
// ----------------------------------------------------------------------------

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Physical position of a placed route node. */
export function nodePoint(n: RouteNode): Point {
  return { x: n.x, y: n.y };
}

/** Physical position of a candidate placement at a hole. */
export function targetPoint(p: Point, _slot?: number, _station?: Station): Point {
  // Slot arguments are ignored: a target is the exact selected grid hole.
  return { x: p.x, y: p.y };
}

/** A line's route as physical positions, in build order. */
export const routePoints = (line: PlayerLine): Point[] => line.route.map(nodePoint);

export const distanceBetween = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/** True when a physical distance satisfies a required whole-peg length. */
export const lengthMatches = (distance: number, required: number): boolean =>
  Math.abs(distance - required) <= SUBWAY_CONFIG.geometry.lengthTolerance + EPS;

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

/** Proper crossings count against any existing route, including your own other lines. */
export function countAnyCrossings(state: SubwayState, from: Point, to: Point): number {
  let crossings = 0;
  for (const { line } of allLines(state)) {
    for (let i = 1; i < line.route.length; i++) {
      if (segmentsCross(from, to, nodePoint(line.route[i - 1]), nodePoint(line.route[i]))) crossings++;
    }
  }
  return crossings;
}

const cross2 = (o: Point, a: Point, b: Point) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

/**
 * True when two segments lie on the same line *and* share more than a single
 * point. This is the one route-on-route interaction that stays illegal: a
 * coincident string has no finite contact count and cannot be picked apart on
 * the board (DEC-018).
 */
export function segmentsOverlap(a: Point, b: Point, c: Point, d: Point): boolean {
  if (cross2(a, b, c) !== 0 || cross2(a, b, d) !== 0) return false;
  const horizontal = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const axis = (p: Point) => (horizontal ? p.x : p.y);
  const lo = Math.max(Math.min(axis(a), axis(b)), Math.min(axis(c), axis(d)));
  const hi = Math.min(Math.max(axis(a), axis(b)), Math.max(axis(c), axis(d)));
  return hi - lo > 0;
}

/** Where two properly crossing segments meet. */
function intersectionOf(a: Point, b: Point, c: Point, d: Point): Point {
  const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (!denominator) return { x: a.x, y: a.y };
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) };
}

/** One priced interaction between a new segment and the opposing network. */
export type RouteContact = {
  /** Coordinate key. One key is one charge, however many strings meet there. */
  key: string;
  ownerId: string;
  kind: "peg" | "crossing" | "endpoint";
  x: number;
  y: number;
};

const contactKey = (x: number, y: number) => `${x.toFixed(4)},${y.toFixed(4)}`;

/**
 * Every distinct contact the segment from→to makes with the *opposing* normal
 * network. Contacts are counted per geometric event, keyed by coordinate, so
 * landing on an opposing peg is one charge rather than one per incident string.
 * A peg always wins its coordinate: a crossing that happens exactly at an
 * existing peg is a peg contact, and is not a proper crossing.
 *
 * The company's own routes are deliberately absent — self-interaction is free.
 */
export function routeContacts(
  state: SubwayState,
  playerId: string,
  from: Point,
  to: Point
): RouteContact[] {
  const found = new Map<string, RouteContact>();
  const opposing = allLines(state).filter(({ playerId: owner }) => owner !== playerId);

  // Pegs first, so they own their coordinate before any crossing claims it.
  for (const { line, playerId: ownerId } of opposing) {
    for (const n of line.route) {
      if (samePoint(n, from)) continue; // already ours, and already paid for
      if (!pointOnSegment(n, from, to)) continue;
      const key = `${ownerId}:${contactKey(n.x, n.y)}`;
      found.set(key, { key, ownerId, kind: "peg", x: n.x, y: n.y });
    }
  }

  for (const { line, playerId: ownerId } of opposing) {
    for (let i = 1; i < line.route.length; i++) {
      const a = line.route[i - 1];
      const b = line.route[i];
      if (segmentsCross(from, to, a, b)) {
        const at = intersectionOf(from, to, a, b);
        const key = `${ownerId}:${contactKey(at.x, at.y)}`;
        if (!found.has(key)) found.set(key, { key, ownerId, kind: "crossing", x: at.x, y: at.y });
      } else if (!samePoint(to, a) && !samePoint(to, b) && pointOnSegment(to, a, b)) {
        const key = `${ownerId}:${contactKey(to.x, to.y)}`;
        if (!found.has(key)) found.set(key, { key, ownerId, kind: "endpoint", x: to.x, y: to.y });
      }
    }
  }

  return Array.from(found.values());
}

/** $M owed to the opposition for a candidate segment. */
export const contactToll = (contacts: RouteContact[]): number =>
  contacts.length * SUBWAY_CONFIG.contact.toll;

/** Contacts that count towards the Crossing Design objective. */
export const properCrossingCount = (contacts: RouteContact[]): number =>
  contacts.filter((c) => c.kind === "crossing").length;

// ----------------------------------------------------------------------------
// Placement validation
// ----------------------------------------------------------------------------

/** Line connections docked inside a neighborhood, in the order they arrived. */
export function stationConnections(state: SubwayState, stationId: string): LineRef[] {
  return allLines(state).filter(({ line }) => line.route.some((n) => n.stationId === stationId));
}

/** Companies holding at least one connection inside a neighborhood. */
export function stationCompanies(state: SubwayState, stationId: string): string[] {
  return Array.from(new Set(stationConnections(state, stationId).map((c) => c.playerId)));
}

/**
 * Validates extending `lineIndex` of `playerId` to `p`. Returns a
 * human-readable reason when the placement is illegal, or null when allowed.
 *
 * Neighborhood holes use ordinary shared-peg rules; no area connection limit.
 */
export function validateNode(
  state: SubwayState,
  playerId: string,
  lineIndex: number,
  p: Point,
  starter = false,
  slot?: number
): string | null {
  const me = state.players[playerId];
  if (!me) return "You are not part of this game.";
  const myLine = me.lines[lineIndex];
  if (!myLine) return "That line is not under contract.";
  const contract = contractOf(myLine);
  if (!contract) return "That line is not under contract.";
  if (
    !Number.isInteger(p.x) || !Number.isInteger(p.y) ||
    p.x < 0 || p.y < 0 ||
    p.x >= SUBWAY_CONFIG.board.columns || p.y >= SUBWAY_CONFIG.board.rows
  ) {
    return "Outside the pegboard.";
  }

  const station = stationAt(p, state.stations);
  if (starter && station) return "Starter pegs must use a normal hole.";
  // Starters enter from the edge of the map (OD-6): only holes on the outer
  // border are legal, and a border station would still be refused above.
  if (
    starter &&
    p.x !== 0 &&
    p.x !== SUBWAY_CONFIG.board.columns - 1 &&
    p.y !== 0 &&
    p.y !== SUBWAY_CONFIG.board.rows - 1
  ) {
    return "Starter pegs must sit on the outer border of the board.";
  }
  if (!starter && myLine.route.length && lineComplete(myLine)) {
    return `${contract.name} is already finished.`;
  }

  // Every neighborhood hole follows ordinary peg contact rules. There are no
  // area-wide dock limits, offsets or exclusive slots.
  // A normal hole is no longer exclusive, and nothing is excluded for being
  // beside, on, or through an existing route (DEC-018). What that costs during
  // Construction is priced by routeContacts(), not forbidden here.

  if (starter || !myLine.route.length) return null;

  // ---- Ordered recipe geometry ---------------------------------------------
  const required = contract.recipe[segmentsBuilt(myLine)];
  const fromNode = myLine.route[myLine.route.length - 1];
  const fromPos = nodePoint(fromNode);
  const toPos = targetPoint(p, slot, station);
  // Only the immediately preceding segment may meet the new one at its start.
  // Other colors (including this company's) remain legal contacts.
  for (let i = 1; i < myLine.route.length - 1; i++) {
    const a = nodePoint(myLine.route[i - 1]), b = nodePoint(myLine.route[i]);
    if (segmentsCross(fromPos, toPos, a, b) || pointOnSegment(toPos, a, b) || pointOnSegment(a, fromPos, toPos) || pointOnSegment(b, fromPos, toPos)) {
      return "A line cannot cross or rejoin its own color.";
    }
  }
  const span = distanceBetween(fromPos, toPos);
  if (!lengthMatches(span, required)) {
    return `Segment ${segmentsBuilt(myLine) + 1} must span ${required} pegs (this one spans ${span.toFixed(1)}).`;
  }
  if (myLine.route.length >= 2) {
    const turn = angleChange(nodePoint(myLine.route[myLine.route.length - 2]), fromPos, toPos);
    if (turn > SUBWAY_CONFIG.geometry.maxTurnDegrees + EPS) {
      return `A line may turn at most ${SUBWAY_CONFIG.geometry.maxTurnDegrees}° (this turns ${Math.round(turn)}°).`;
    }
  }

  // ---- The one route-on-route prohibition that survives ---------------------
  // Coincident strings have no finite contact count and cannot be told apart on
  // the board, so an exact collinear overlap stays illegal — for anyone's route,
  // including this company's own.
  const from = fromNode;
  for (const { line } of allLines(state)) {
    for (let i = 1; i < line.route.length; i++) {
      if (segmentsOverlap(from, p, line.route[i - 1], line.route[i])) {
        return "A string cannot lie on top of an existing string.";
      }
    }
  }

  return null;
}

/** An exact grid hole a line may legally go next. */
export type PlacementTarget = Point & { slot?: number };

/** Every legal next hole, including all neighborhood footprint holes. */
export function legalTargets(
  state: SubwayState,
  playerId: string,
  lineIndex: number,
  starter = false
): PlacementTarget[] {
  const out: PlacementTarget[] = [];
  for (let y = 0; y < SUBWAY_CONFIG.board.rows; y++) {
    for (let x = 0; x < SUBWAY_CONFIG.board.columns; x++) {
      if (!validateNode(state, playerId, lineIndex, { x, y }, starter)) out.push({ x, y });
    }
  }
  return out;
}

/** True when this line has at least one legal placement anywhere. */
export function hasLegalMove(state: SubwayState, playerId: string, lineIndex: number): boolean {
  const line = state.players[playerId]?.lines[lineIndex];
  if (!line || lineComplete(line)) return false;
  return legalTargets(state, playerId, lineIndex, line.route.length === 0).length > 0;
}

/** Lines this company could still legally build on this period. */
export function buildableLines(state: SubwayState, playerId: string): number[] {
  const me = state.players[playerId];
  if (!me) return [];
  return me.lines
    .map((_, i) => i)
    .filter((i) => !lineComplete(me.lines[i]) && hasLegalMove(state, playerId, i));
}

// ----------------------------------------------------------------------------
// Survey Pins
// ----------------------------------------------------------------------------

export const surveysPlaced = (s: SubwayState, playerId: string): number =>
  s.surveyPins.filter((pin) => pin.playerId === playerId).length;

export const surveysPending = (s: SubwayState, playerId: string): number =>
  Math.max(0, (s.players[playerId]?.surveysPurchased ?? 0) - surveysPlaced(s, playerId));

/** Why this company cannot pin that hole, if it cannot. */
export function surveyBlocker(s: SubwayState, playerId: string, p: Point): string | null {
  if (
    !Number.isInteger(p.x) || !Number.isInteger(p.y) ||
    p.x < 0 || p.y < 0 ||
    p.x >= SUBWAY_CONFIG.board.columns || p.y >= SUBWAY_CONFIG.board.rows
  ) {
    return "Outside the pegboard.";
  }
  if (p.x === 0 || p.y === 0 || p.x === SUBWAY_CONFIG.board.columns - 1 || p.y === SUBWAY_CONFIG.board.rows - 1) return "Starter areas are reserved: place Survey Pins inside the border.";
  if (stationAt(p, s.stations)) return "Survey Pins cannot be placed inside a neighborhood.";
  if (s.surveyPins.some((pin) => pin.playerId === playerId && pin.x === p.x && pin.y === p.y)) {
    return "You already surveyed that hole.";
  }
  return null;
}

/**
 * Whose turn it is to place a Survey Pin. Companies alternate, the odd-priority
 * company goes first, and whoever has placed fewer goes next — so unequal
 * purchases simply finish with the remaining company placing its balance.
 */
function leastServed(s: SubwayState, waiting: string[], count: (id: string) => number): string | undefined {
  const rotation = s.playerOrder.map((_, i) => draftTurnId(s, i, 0));
  return [...waiting].sort((a, b) => count(a) - count(b) || rotation.indexOf(a) - rotation.indexOf(b))[0];
}

export function surveyTurnId(s: SubwayState): string | undefined {
  const waiting = s.playerOrder.filter((id) => surveysPending(s, id) > 0);
  return leastServed(s, waiting, (id) => surveysPlaced(s, id));
}

/** True when any line this company owns has built through the pin's hole. */
export function surveyFulfilled(p: SubwayPlayer, pin: SurveyPin): boolean {
  return p.lines.some((line) =>
    line.route.some((n) => !n.stationId && n.x === pin.x && n.y === pin.y)
  );
}

// ----------------------------------------------------------------------------
// Destinations
// ----------------------------------------------------------------------------

/** The mission's stations must belong to one connected OWN network. */
export function destinationMet(p: SubwayPlayer, mission: string | DestinationCommitment): boolean {
  const card = destinationById(typeof mission === "string" ? mission : mission.cardId);
  if (!card) return false;
  const graph = companyNetwork(p);
  // One neighborhood may be visited by multiple disconnected components. Do
  // not merge them through its identity; find an actual shared component.
  const components = card.stationIds.map(id => new Set(p.lines.flatMap(line => line.route)
    .filter(node => node.stationId === id).map(node => graph.get(networkNodeKey(node))!)));
  return Array.from(components[0]).some(id => components.every(set => set.has(id)));
}

/** Destination cards this company has drafted, assigned or not. */
export const destinationsHeld = (p: SubwayPlayer): number =>
  p.destinationHand.length + p.destinationCommitments.length;

/**
 * Whose Destination pick it is. Derived rather than stored, so an undo or a
 * replayed action can never leave the draft pointing at the wrong company:
 * whoever holds fewer picks next, the odd-period company breaking the tie —
 * which is exactly "alternate, odd-priority first".
 */
export function destinationTurnId(s: SubwayState): string | undefined {
  const pick = s.playerOrder.reduce((n,id) => n + destinationsHeld(s.players[id]), 0);
  return pick < s.playerOrder.length * SUBWAY_CONFIG.destinationsPerPlayer ? draftTurnId(s, pick, 2) : undefined;
}

/** Why this set of Destination assignments cannot be locked, if it cannot. */
export function destinationProblems(
  p: SubwayPlayer,
  assignments: { cardId: string; lineIndex: number }[]
): string[] {
  const problems: string[] = [];
  let hand = [...p.destinationHand];
  const perLine = new Map<number, string[]>();

  for (const a of assignments) {
    const card = destinationById(a.cardId);
    if (!card) {
      problems.push("That is not a Destination card.");
      continue;
    }
    if (!hand.includes(a.cardId)) {
      problems.push(`${card.name} is not in your hand.`);
      continue;
    }
    hand = removeOne(hand, a.cardId);
    if (!Number.isInteger(a.lineIndex) || !p.lines[a.lineIndex]) {
      problems.push(`${card.name} must be assigned to a line you own.`);
      continue;
    }
    const stations = perLine.get(a.lineIndex) ?? [];
    if (stations.length >= 2) {
      problems.push(`${contractOf(p.lines[a.lineIndex])?.name ?? "That line"} may carry only two Destinations.`);
      continue;
    }
    if (stations.includes(card.id)) {
      problems.push(`${card.name} is already assigned to that line.`);
      continue;
    }
    stations.push(card.id);
    perLine.set(a.lineIndex, stations);
  }
  return problems;
}

// ----------------------------------------------------------------------------
// Engineering objective evaluation (approximate geometry, see RULES.md)
// ----------------------------------------------------------------------------

export function objectiveMet(id: string, me: SubwayPlayer, opponents: SubwayPlayer[], state?: SubwayState): boolean {
  if (destinationById(id)) return destinationMet(me, id);
  const all = me.lines.length === 3 && allLinesComplete(me);
  const starts = me.lines.flatMap(line => line.route.slice(0, 1));
  const ends = me.lines.flatMap(line => line.route.slice(-1));
  const graph = () => companyNetwork(me);
  switch (id) {
    case "gentle": return all && distinctSides(ends, 3);
    case "bend": return all && starts.every(p => borderSides(p).some(s => s === "east" || s === "west")) && ends.every(p => borderSides(p).some(s => s === "north" || s === "south"));
    case "straight": return all && me.lines.every(line => borderSides(line.route[0]).some(s => borderSides(line.route.at(-1)!).includes(s)));
    case "approach": return me.lines.some(line => lineComplete(line) && lineMajors(line).length >= 3);
    case "through": return me.lines.length === 3 && me.lines.every(line => line.route.some(n => n.y === 0) && line.route.some(n => n.y === SUBWAY_CONFIG.board.rows - 1));
    case "network": return all && linesConnected(me.lines, graph());
    case "terminal": return connectedStations(me).length === STATIONS.length;
    case "minimal": return all && !!state?.surveyPins.some(pin => pin.playerId === me.id && surveyFulfilled(me, pin));
    case "crossing": return state?.firstCompletedPlayerId === me.id && all;
    case "crosstown-service": return acrossTownTier(me) === 2;
    case "local-service": return me.lines.some(line => STATIONS.filter(s => s.kind === "minor" && line.route.some(n => n.stationId === s.id)).length === 3);
    case "interchange": return STATIONS.some(station => station.kind === "major" && interchangeAt(me.lines, station.id));
    case "solvent": return all && me.money >= 5;
    case "perimeter": return all && me.lines.every(line => distinctSides(line.route, 3));
    case "three-fronts": return all && distinctSides(starts, 3) && borderSides(ends[0]).some(side => ends.every(n => borderSides(n).includes(side)));
    case "four-corners": return fourCornersTier(me) === 2;
    default: return false;
  }
}

/** Border objectives share the physical company graph and exact edge semantics. */
function acrossTownTier(player: SubwayPlayer): number {
  return Math.max(0, ...companyComponents(player).map(nodes => {
    if (!nodes.some(n => n.x === 0) || !nodes.some(n => n.x === SUBWAY_CONFIG.board.columns - 1)) return 0;
    return distinctSides(nodes, 4) ? 2 : 1;
  }));
}
function fourCornersTier(player: SubwayPlayer): number {
  const east = SUBWAY_CONFIG.board.columns - 1, south = SUBWAY_CONFIG.board.rows - 1;
  return Math.max(0, ...companyComponents(player).map(nodes => {
    const corners = [[0,0],[east,0],[0,south],[east,south]].map(([x,y]) => nodes.some(n => n.x === x && n.y === y));
    return corners.every(Boolean) ? 2 : (corners[0] && corners[3]) || (corners[1] && corners[2]) ? 1 : 0;
  }));
}

/** Live points, not banked points: Undo or changed conditions recompute them. */
export function objectiveProgress(id: string, me: SubwayPlayer, opponents: SubwayPlayer[], state?: SubwayState): {points:number;max:number;met:boolean;count?:number;tiers?:number[]} {
  const card = engineeringById(id) ?? destinationById(id);
  const max = card?.vp ?? 0;
  const met = objectiveMet(id, me, opponents, state);
  const complete = me.lines.filter(lineComplete);
  let count: number | undefined;
  const tiers = id === "perimeter" ? [2,5,8] : id === "crosstown-service" ? [4,8] : id === "four-corners" ? [5,10] : OBJECTIVE_TIERS[id] ? [2,4,max] : undefined;
  switch (id) {
    case "gentle": count = [1,2,3].filter(n => distinctSides(complete.flatMap(l=>l.route.slice(-1)),n)).length; break;
    case "bend": count = complete.filter(l=>borderSides(l.route[0]).some(s=>s==="east"||s==="west") && borderSides(l.route.at(-1)!).some(s=>s==="north"||s==="south")).length; break;
    case "straight": count = complete.filter(l=>borderSides(l.route[0]).some(s=>borderSides(l.route.at(-1)!).includes(s))).length; break;
    case "through": count = me.lines.filter(l=>l.route.some(n=>n.y===0)&&l.route.some(n=>n.y===SUBWAY_CONFIG.board.rows-1)).length; break;
    case "three-fronts": {
      count = 0;
      for (const side of ["north","south","east","west"] as const) {
        const starts = complete.filter(l=>borderSides(l.route.at(-1)!).includes(side)).map(l=>l.route[0]);
        count = Math.max(count,...[1,2,3].map(n=>distinctSides(starts,n)?n:0));
      }
      break;
    }
    case "perimeter": {
      count = complete.filter(l => distinctSides(l.route, 3)).length;
      break;
    }
    case "crosstown-service": {
      count = acrossTownTier(me);
      break;
    }
    case "four-corners": {
      count = fourCornersTier(me);
      break;
    }
  }

  return {points: count === undefined ? (met ? max : 0) : count === 0 ? 0 : tiers![Math.min(count, tiers!.length) - 1], max, met, count, tiers};
}

/** Live private status of one company's committed cards, for its own UI. */
export function committedStatus(s: SubwayState, playerId: string): { cardId: string; met: boolean }[] {
  const me = s.players[playerId];
  if (!me) return [];
  const opponents = seats(s).filter((p) => p.id !== playerId);
  return me.engineeringHand.map((cardId) => ({ cardId, met: objectiveMet(cardId, me, opponents, s) }));
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

export function scoreGame(state: SubwayState, now: number): SubwayState {
  const players = structuredClone(state.players);
  const lengths = Object.values(players).map(p => ({id:p.id, length:longestNetwork(p)}));
  const max = Math.max(0, ...lengths.map(entry => entry.length));
  const longest = lengths.filter(entry => max > 0 && Math.abs(entry.length - max) < EPS);

  for (const p of Object.values(players)) {
    const items: ScoreItem[] = [];

    // Neighborhood visits serve objectives but award no automatic VP.

    for (const line of p.lines) {
      const contract = contractOf(line);
      if (!contract) continue;
      const complete = lineComplete(line);
      items.push({
        label: complete
          ? `${contract.name} completed`
          : `${contract.name} incomplete (${line.route.length}/${contractNodes(contract)})`,
        points: complete ? contract.completionVp : contract.incompletePenalty,
        met: complete,
      });

    }

    const opponents = Object.values(players).filter((o) => o.id !== p.id);
    for (const id of Array.from(new Set([...p.engineeringHand, ...p.destinationHand]))) {
      const card = engineeringById(id) ?? destinationById(id);
      if (!card) continue;
      const met = objectiveMet(id, p, opponents, state);
      items.push({ label: card.name, points: objectiveProgress(id,p,opponents,state).points, met });
    }

    for (const pin of state.surveyPins.filter((entry) => entry.playerId === p.id)) {
      const met = surveyFulfilled(p, pin);
      items.push({
        label: `Survey Pin ${pin.x + 1},${pin.y + 1}`,
        points: met ? SUBWAY_CONFIG.survey.vp : 0,
        met,
      });
    }

    // Construction debt. Only route contacts can push a company below zero, and
    // money received from the opposition pays it back down (DEC-018).
    if (p.money < 0) {
      items.push({
        label: `Construction debt ($${-p.money}M owed)`,
        points: p.money * SUBWAY_CONFIG.contact.debtVpPerMillion,
        met: false,
      });
    }

    const length = lengths.find(entry => entry.id === p.id)!.length;
    const longestMet = longest.some(entry => entry.id === p.id);
    items.push({label: `Longest network (${length.toFixed(1)} peg spaces)`, points: longestMet ? (longest.length === 1 ? 5 : 3) : 0, met:longestMet});
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

  const out: SubwayState = {
    ...state,
    players,
    events: [...state.events],
    undo: undefined,
    winnerIds: winners,
    phase: "RESULTS",
    message: "",
  };
  pushEvent(
    out,
    now,
    "SCORE",
    "banner",
    winners.length > 1 ? "Shared victory!" : `${top.name} wins!`
  );
  return out;
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
    destinationHand: [],
    destinationCommitments: [],
    surveysPurchased: 0,
    schedulingHand: [...SUBWAY_CONFIG.startingHands.scheduling],
    lines: [],
    decisionsUsed: 0,
    scheduleSubmitted: false,
    scheduleConfirmed: false,
    pendingActions: [],
    actedThisPeriod: false,
    properCrossings: 0,
    tollsPaid: 0,
  };
}

function initialState(players: Player[]): SubwayState {
  const roster = players.slice(0, 4);
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
    stations: STATIONS.map((station) => ({ ...station })),
    oddPriorityId: order[0] ?? "",
    priorityOverrides: {},
    procurement: { row: [], deck: [], offerIndex: 0 },
    market: {rows:{engineering:[], scheduling:[]}, decks:{engineering:[], scheduling:[]}, picks:0},
    engineeringStep: "DESTINATION_DRAFT",
    destinationDeck: [],
    destinationRow: [],
    schedulingStep: "PLANNING",
    surveyPins: [],
    currentPeriod: 1,
    resolveQueue: [],
    events: [],
    nextEventSeq: 1,
    telemetry: [],
    nextTelemetrySeq: 1,
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

/** Six four-column interior bays each hold one 16-hole area. The complementary
 * connected space holds a 6- or 10-hole area in four randomly chosen bays.
 * This bounded packing covers 124 holes, leaving 51 interior survey holes and
 * every border hole clear. Areas may be adjacent, never overlapping.
 */
export function randomStationLayout(random: () => number): Station[] {
  const large = shuffle(STATIONS.filter(s => s.kind === "major"), random);
  const companions = shuffle([...STATIONS.filter(s => s.kind !== "major"), undefined, undefined], random);
  const gap = Math.floor(random() * 7); // one empty column before/between/after bays
  const areas = new Map<string, Station>();
  for (let i = 0; i < large.length; i++) {
    const x0 = 1 + i * 4 + (i >= gap ? 1 : 0);
    const flip = random() < 0.5;
    const heights = random() < 0.5 ? [4,4,4,4] : shuffle([3,4,4,5], random);
    const filled: Point[] = [], remainder: Point[] = [];
    for (let x = 0; x < 4; x++) for (let y = 0; y < 7; y++) {
      (y < heights[x] ? filled : remainder).push({x, y});
    }
    const position = (p: Point): Point => ({x:x0+p.x, y:1+(flip ? 6-p.y : p.y)});
    const cells = filled.map(position);
    areas.set(large[i].id, {...large[i], ...cells[0], cells});
    const companion = companions[i];
    if (!companion) continue;
    const size = companion.kind === "medium" ? 10 : 6;
    // Grow a connected footprint inside the 12-hole complement. Every column
    // retains at least two adjoining holes, so the frontier cannot run dry.
    const selected: Point[] = [];
    const frontier = [remainder[Math.floor(random() * remainder.length)]];
    const seen = new Set<string>(frontier.map(p => `${p.x},${p.y}`));
    const available = new Set(remainder.map(p => `${p.x},${p.y}`));
    while (selected.length < size) {
      const next = frontier.shift()!;
      selected.push(next);
      const neighbors = shuffle([{x:next.x-1,y:next.y},{x:next.x+1,y:next.y},
        {x:next.x,y:next.y-1},{x:next.x,y:next.y+1}], random);
      for (const p of neighbors) {
        const key = `${p.x},${p.y}`;
        if (available.has(key) && !seen.has(key)) { seen.add(key); frontier.push(p); }
      }
    }
    const footprint = selected.map(position);
    areas.set(companion.id, {...companion, ...footprint[0], cells:footprint});
  }
  return STATIONS.map(s => areas.get(s.id)!);
}

// ----------------------------------------------------------------------------
// Procurement flow
// ----------------------------------------------------------------------------

/** Cyclic seats across drafts; no snake or repeated seat at a stage boundary. */
export function draftTurnId(s: SubwayState, pick: number, _stage: number): string {
  const n = s.playerOrder.length;
  const offset = pick % n;
  const first = s.playerOrder.indexOf(s.oddPriorityId);
  return s.playerOrder[(first + offset) % n];
}

export function cardDraftTurnId(s: SubwayState): string | undefined {
  const pick = s.market.picks ?? 0;
  return pick < s.playerOrder.length * SUBWAY_CONFIG.engineeringPicks ? draftTurnId(s, pick, 1) : undefined;
}
export function draftPicks(p: SubwayPlayer): number {
  return p.engineeringHand.length;
}
export function cardDraftBlocker(s: SubwayState, playerId: string, deck: CardDeckId, cardId?: string): string | undefined {
  const p = s.players[playerId];
  if (s.phase !== "ENGINEERING" || s.engineeringStep !== "CARD_DRAFT" || cardDraftTurnId(s) !== playerId) return "Wait for your draft turn.";
  if (deck !== "engineering") return "Only Engineering goals are drafted.";
  if (deck === "engineering" && cardId && p.engineeringHand.includes(cardId)) return "You already hold this Engineering goal.";
  return undefined;
}

/** Refill after every purchase; every seat must choose at list price. */
function nextOffer(s: SubwayState, now: number): SubwayState {
  const proc = s.procurement;
  while (proc.row.length < s.playerOrder.length && proc.deck.length) proc.row.push(proc.deck.shift()!);
  if (!proc.row.length) {
    proc.offer = undefined;
    s.phase = "ENGINEERING";
    s.engineeringStep = "CARD_DRAFT";
    pushEvent(s, now, "PHASE", "banner", "Contracts signed. Draft three Engineering goals each. Your two Destination missions are already in hand.");
    return s;
  }
  const id = draftTurnId(s, proc.offerIndex, 0);
  const c = contractById(proc.row[0])!;
  proc.offer = {contractId:c.id, price:c.cost, activeId:id};
  s.message = `${s.players[id].name}: choose one route at list price. Draft round ${Math.floor(proc.offerIndex / s.playerOrder.length) + 1} of 3.`;
  return s;
}

/** Lays a company's blocks back to back so scheduling opens somewhere legal. */
export function autoSchedule(p: SubwayPlayer): void {
  // Three lines, at most 13^3 combinations: choose the cheapest complete
  // programme, then the earliest finish. No line is silently shelved.
  const candidate = { ...p, lines: p.lines.map((line) => ({ ...line })) };
  let best: (number | undefined)[] = [];
  let bestCost = Infinity;
  let bestFinish = Infinity;
  const visit = (index: number) => {
    if (index === candidate.lines.length) {
      const cost = scheduleCost(candidate);
      const finish = Math.max(0, ...candidate.lines.map((line) => blockEnd(line) ?? 0));
      if (cost < bestCost || (cost === bestCost && finish < bestFinish)) {
        bestCost = cost; bestFinish = finish;
        best = candidate.lines.map((line) => line.start);
      }
      return;
    }
    const line = candidate.lines[index];
    for (let start = 1; blockFits(line, start); start++) {
      line.start = start;
      visit(index + 1);
    }
  };
  visit(0);
  p.lines.forEach((line, i) => { line.start = best[i]; });
}

/** Closes Engineering once every purchased Survey Pin is on the board. */
/** All purchased routes receive a starter; no timetable is created or paid for. */
function toScheduling(s: SubwayState, now: number): SubwayState {
  s.phase = "STARTER_PLACEMENT";
  for (const p of seats(s)) for (const line of p.lines) line.start = 1;
  pushEvent(s, now, "PHASE", "banner", "Place one free border starter for each route.");
  return s;
}

// ----------------------------------------------------------------------------
// Construction flow
// ----------------------------------------------------------------------------

function toScoring(s: SubwayState, now: number, reason: SubwayEndReason): SubwayState {
  s.phase = "SCORING";
  s.constructionEndedAt = now;
  s.endReason = reason;
  s.resolveQueue = [];
  for (const p of seats(s)) p.pendingActions = [];
  pushEvent(
    s,
    now,
    "PHASE",
    "banner",
    reason === "NO_LEGAL_CONSTRUCTION"
      ? "No legal construction remains. Construction ends immediately."
      : `Round ${SUBWAY_CONFIG.timelinePeriods} is complete. Reveal Engineering and score.`
  );
  return s;
}

/** True once no incomplete route owned by any company has a legal next segment. */
export function constructionExhausted(s: SubwayState): boolean {
  return seats(s).every((p) =>
    p.lines.every((line, lineIndex) => lineComplete(line) || !hasLegalMove(s, p.id, lineIndex))
  );
}

/** Which line indexes this company is scheduled to build in a period. */
export function scheduledLines(p: SubwayPlayer, period: number): number[] {
  return p.lines
    .map((_, i) => i)
    .filter((i) => blockPeriods(p.lines[i]).includes(period) && !lineComplete(p.lines[i]));
}

/** Incremental costs: first crew $1M, second adds $2M, third adds $3M. */
export function activationCost(_p: SubwayPlayer, count: number): number {
  return count === 0 ? 0 : count * (count + 1) / 2;
}
function beginConstructionPeriod(s: SubwayState, now: number, opening = false): SubwayState {
  if (constructionExhausted(s)) return toScoring(s, now, "NO_LEGAL_CONSTRUCTION");
  if (s.currentPeriod > SUBWAY_CONFIG.timelinePeriods) return toScoring(s, now, "ROUND_LIMIT");
  for (const p of seats(s)) {
    p.pendingActions = [];
    p.actedThisPeriod = false;
    p.crewsHired = false;
  }
  s.resolveQueue = s.playerOrder.map((_,i) => draftTurnId(s,i,0));
  pushEvent(s, now, "PERIOD", "banner", `${opening ? "Construction begins. " : ""}Round ${s.currentPeriod}: choose crews on your turn.`);
  return s;
}

/** Ends a company's turn this period and moves play along. */
function endPlayerTurn(s: SubwayState, playerId: string, now: number): SubwayState {
  const p = s.players[playerId];
  if (p) {
    p.pendingActions = [];
    p.actedThisPeriod = true;
  }
  s.resolveQueue = s.resolveQueue.filter((id) => id !== playerId);
  if (!s.resolveQueue.length) {
    if (s.currentPeriod >= SUBWAY_CONFIG.timelinePeriods) return toScoring(s, now, "ROUND_LIMIT");
    s.currentPeriod++;
    return beginConstructionPeriod(s, now);
  }
  // Turn-only change: a compact notice, never a large banner per queue pop.
  pushEvent(
    s,
    now,
    "TURN",
    "notice",
    `Period ${s.currentPeriod}: ${s.players[s.resolveQueue[0]].name} builds.`,
    s.resolveQueue[0]
  );
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
// Undo — exactly one placement deep
// ----------------------------------------------------------------------------

/**
 * Snapshots the state a placement is about to change. The snapshot never
 * carries an undo record of its own, so undoing can only ever walk back one
 * placement and room state cannot grow without bound.
 */
function undoRecord(before: SubwayState, playerId: string, kind: UndoRecord["kind"], label: string): UndoRecord {
  const snapshot = structuredClone(before);
  snapshot.undo = undefined;
  return { playerId, kind, label, state: snapshot };
}

// ----------------------------------------------------------------------------
// Reducer
// ----------------------------------------------------------------------------

function reduceAction(state: SubwayState, action: SubwayAction, ctx: GameContext): SubwayState {
  // A state saved by an older version can only be restarted.
  const legacy = state.version !== SUBWAY_STATE_VERSION;
  const hostScoring = action.type === "ADVANCE_SCORING" && action.playerId === ctx.room.hostId;
  if (action.type !== "START_GAME" && (legacy || (!state.players[action.playerId] && !hostScoring))) return state;

  // Undo is the only action that reads the outstanding undo record. Every other
  // accepted action consumes it: `s` is what an accepted action returns, and it
  // starts with the record cleared, while a rejected action returns `state`
  // untouched and leaves the record standing.
  const s = structuredClone(state);
  s.undo = undefined;
  const me = s.players[action.playerId];

  switch (action.type) {
    case "START_GAME": {
      if (!legacy && state.phase !== "SETUP") return state;
      if (ctx.room.hostId !== action.playerId) return state;
      if (ctx.room.players.length < 2 || ctx.room.players.length > 4) return state;
      // Rebuild seats from the live room so lazily-initialized state can never
      // strand a player outside the game. First four joiners become companies.
      const fresh = initialState(ctx.room.players);
      fresh.startedAt = ctx.now();
      fresh.phase = "PROCUREMENT";
      fresh.market.rows = {engineering:[], scheduling:[]};
      fresh.market.decks = {engineering:[], scheduling:[]};
      fresh.market.picks = 0;
      fresh.market.decks.engineering = shuffle(ENGINEERING_CARDS.map(c => c.id), ctx.random);
      fresh.market.rows.engineering = fresh.market.decks.engineering.splice(0, 2);
      fresh.stations = randomStationLayout(ctx.random);
      fresh.oddPriorityId = fresh.playerOrder[Math.floor(ctx.random() * fresh.playerOrder.length)];
      fresh.procurement.deck = shuffle(
        LINE_CONTRACTS.map((c) => c.id),
        ctx.random
      ).slice(0, fresh.playerOrder.length * 3);
      // Deal one pair and one triple to each company, without replacement.
      const pairs = shuffle(DESTINATION_CARDS.filter(c => c.stationIds.length === 2).map(c => c.id), ctx.random);
      const triples = shuffle(DESTINATION_CARDS.filter(c => c.stationIds.length === 3).map(c => c.id), ctx.random);
      for (const id of fresh.playerOrder) fresh.players[id].destinationHand = [pairs.shift()!, triples.shift()!];
      fresh.destinationDeck = shuffle([...pairs, ...triples], ctx.random);
      pushEvent(fresh, ctx.now(), "PHASE", "banner", `Subway begins — ${fresh.playerOrder.length * 3} Line Contracts for ${fresh.playerOrder.length} companies.`);
      return nextOffer(fresh, ctx.now());
    }

    case "PROCURE": {
      if (state.phase !== "PROCUREMENT" || !me || s.procurement.offer?.activeId !== me.id) return state;
      const id = action.payload?.contractId;
      if (action.payload?.choice !== "buy" || !id || !s.procurement.row.includes(id)) return state;
      const contract = contractById(id)!;
      if (me.lines.length >= 3 || me.money < contract.cost) return state;
      me.money -= contract.cost;
      me.lines.push({contractId:id, paid:contract.cost, route:[]});
      me.decisionsUsed++;
      s.procurement.row = removeOne(s.procurement.row, id);
      s.procurement.offerIndex++;
      pushEvent(s, ctx.now(), "CARD", "notice", `${me.name} signed the ${contract.name} for $${contract.cost}M.`, me.id);
      return nextOffer(s, ctx.now());
    }

    case "DRAFT_CARD": {
      const deck = action.payload?.deck;
      if (!me || !deck || deck !== "engineering") return state;
      if (action.payload?.expectedPick !== s.market.picks || cardDraftBlocker(s, me.id, deck, action.payload?.cardId)) return state;
      const row = s.market.rows?.[deck], pile = s.market.decks?.[deck];
      if (!row || !pile) return state;
      let cardId = action.payload?.cardId;
      if (cardId) {
        if (!row.includes(cardId)) return state;
        row.splice(row.indexOf(cardId), 1);
      } else {
        // Blind Engineering draws skip owned goals without spending a pick.
        const index = pile.findIndex((id) => deck !== "engineering" || !me.engineeringHand.includes(id));
        if (index < 0) return state;
        cardId = pile.splice(index, 1)[0];
      }
      me.engineeringHand.push(cardId);
      while (row.length < 2 && pile.length) row.push(pile.shift()!);
      s.market.picks = (s.market.picks ?? 0) + 1;
      pushEvent(s, ctx.now(), "CARD", "notice", `${me.name} drafted a ${deck} card (${draftPicks(me)} of ${SUBWAY_CONFIG.engineeringPicks}).`, me.id);
      if (!cardDraftTurnId(s)) {
        s.engineeringStep = "BUY_SURVEYS";
        pushEvent(s, ctx.now(), "PHASE", "banner", "All goals are active. Optionally buy Survey Pins, then place your starters.");
      }
      return s;
    }

    case "BUY_DESTINATION": {
      if (s.phase !== "CONSTRUCTION" || !me || s.resolveQueue[0] !== me.id || me.crewsHired || me.destinationPurchased || me.money < SUBWAY_CONFIG.destinationPurchaseCost || !s.destinationDeck.length || action.payload?.period !== s.currentPeriod) return state;
      me.money -= SUBWAY_CONFIG.destinationPurchaseCost;
      me.destinationHand.push(s.destinationDeck.shift()!);
      me.destinationPurchased = true;
      pushEvent(s, ctx.now(), "CARD", "notice", `${me.name} bought a private Destination mission for $5M.`, me.id);
      return s;
    }

    case "BUY_SURVEYS": {
      if (s.phase !== "ENGINEERING" || s.engineeringStep !== "BUY_SURVEYS" || !me || me.engineeringLocked) return state;
      const count = action.payload?.surveys;
      if (!Number.isInteger(count) || count! < 0 || count! > SUBWAY_CONFIG.survey.max || count! * SUBWAY_CONFIG.survey.cost > me.money) return state;
      me.surveysPurchased = count!;
      me.money -= count! * SUBWAY_CONFIG.survey.cost;
      me.engineeringLocked = true;
      pushEvent(s, ctx.now(), "CARD", "notice", `${me.name} bought ${count} Survey Pins.`, me.id);
      if (seats(s).every(p => p.engineeringLocked)) {
        s.engineeringStep = "SURVEY";
        if (!surveyTurnId(s)) return toScheduling(s, ctx.now());
      }
      return s;
    }

    case "PLACE_SURVEY": {
      if (state.phase !== "ENGINEERING" || state.engineeringStep !== "SURVEY" || !me) return state;
      if (surveyTurnId(state) !== me.id) return state;
      const pt = { x: action.payload?.x ?? -1, y: action.payload?.y ?? -1 };
      if (surveyBlocker(state, me.id, pt)) return state;

      s.surveyPins.push({ playerId: me.id, x: pt.x, y: pt.y });
      pushEvent(s, ctx.now(), "PLACEMENT", "notice", `${me.name} surveyed hole ${pt.x + 1},${pt.y + 1}.`, me.id);
      s.undo = undoRecord(state, me.id, "survey", "Survey Pin");
      if (!surveyTurnId(s)) {
        const next = toScheduling(s, ctx.now());
        next.undo = s.undo; // the placement is still the last thing that happened
        return next;
      }
      return s;
    }

    case "PLACE_STARTER": {
      if (state.phase !== "STARTER_PLACEMENT" || !me) return state;
      if (starterTurnId(state) !== me.id) return state;
      const lineIndex = action.payload?.lineIndex ?? -1;
      const line = me.lines[lineIndex];
      if (!line || line.route.length) return state;
      // Shelved contracts are never built, so they get no starter peg.
      if (line.start === undefined) return state;
      const pt = { x: action.payload?.x ?? -1, y: action.payload?.y ?? -1 };
      if (validateNode(s, me.id, lineIndex, pt, true)) return state;
      line.route = [pt];
      pushEvent(
        s,
        ctx.now(),
        "PLACEMENT",
        "notice",
        `${me.name} opened the ${contractOf(line)!.name} at ${pt.x + 1},${pt.y + 1}.`,
        me.id
      );
      s.undo = undoRecord(state, me.id, "starter", "starter peg");
      if (!starterTurnId(s)) {
        s.phase = "CONSTRUCTION";
        s.currentPeriod = 1;
        const opened = beginConstructionPeriod(s, ctx.now(), true);
        opened.undo = s.undo; // the placement is still the last thing that happened
        return opened;
      }
      return s;
    }

    case "HIRE_CREWS": {
      if (s.phase !== "CONSTRUCTION" || s.resolveQueue[0] !== me?.id || me.crewsHired || action.payload?.period !== s.currentPeriod) return state;
      const indexes = action.payload?.lineIndexes;
      if (!Array.isArray(indexes) || indexes.length > 3 || new Set(indexes).size !== indexes.length || indexes.some(i => !Number.isInteger(i) || !buildableLines(s,me.id).includes(i))) return state;
      const cost = activationCost(me,indexes.length);
      me.money -= cost;
      me.crewPaid = (me.crewPaid ?? 0) + cost;
      me.crewsHired = true;
      me.pendingActions = [...indexes];
      pushEvent(s, ctx.now(), "TURN", "notice", `${me.name} hired ${indexes.length} crew(s) for $${cost}M.`, me.id);
      return indexes.length ? s : endPlayerTurn(s,me.id,ctx.now());
    }
    case "BUILD": {
      if (state.phase !== "CONSTRUCTION" || !me) return state;
      if (!me.crewsHired || s.resolveQueue[0] !== me.id || !me.pendingActions.length) return state;
      const lineIndex = action.payload?.lineIndex ?? -1;
      if (!me.pendingActions.includes(lineIndex)) return state;
      const line = me.lines[lineIndex];
      if (!line || lineComplete(line)) return state;

      const pt = { x: action.payload?.x ?? -1, y: action.payload?.y ?? -1 };
      const slot = action.payload?.slot;
      if (validateNode(s, me.id, lineIndex, pt, false, slot)) return state;

      const from = line.route[line.route.length - 1];

      // Price the opposing network before the route changes under us. Own
      // contacts are free; each distinct opposing contact is $1M to its owner,
      // and Construction is the one phase allowed to go into debt (DEC-018).
      const station = stationAt(pt, s.stations);
      const contacts = routeContacts(s, me.id, from, pt);
      const toll = contactToll(contacts);
      if (toll > 0) {
        me.money -= toll;
        me.tollsPaid += toll;
        for (const contact of contacts) s.players[contact.ownerId].money += SUBWAY_CONFIG.contact.toll;
      }
      me.properCrossings += countAnyCrossings(s, nodePoint(from), targetPoint(pt, slot, station));
      line.route.push({
        ...pt,
        ...(station ? { stationId: station.id } : {}),
      });

      // Legal BUILD rejects completed lines; Undo restores the prior balance.
      if (lineComplete(line)) me.money += SUBWAY_CONFIG.completionReward;
      if (!s.firstCompletedPlayerId && me.lines.length === 3 && allLinesComplete(me)) s.firstCompletedPlayerId = me.id;
      me.pendingActions = removeOne(me.pendingActions, lineIndex);
      const contract = contractOf(line)!;
      // One combined, privacy-safe notice: the placement, the station or hole
      // it reached, completion, and any toll transfer are all public facts.
      const where = station
        ? `${station.name} (${pt.x + 1},${pt.y + 1})`
        : `hole ${pt.x + 1},${pt.y + 1}`;
      const tollNote = toll > 0
        ? ` ${contacts.length} contact${contacts.length === 1 ? "" : "s"} with ${Array.from(new Set(contacts.map((c) => s.players[c.ownerId].name))).join(", ")}: $${toll}M.`
        : "";
      pushEvent(
        s,
        ctx.now(),
        lineComplete(line) ? "ROUTE" : "PLACEMENT",
        "notice",
        (lineComplete(line)
          ? `${me.name} completed the ${contract.name} at ${where}! +$${SUBWAY_CONFIG.completionReward}M completion reward.`
          : `${me.name} extended the ${contract.name} to ${where}.`) + tollNote,
        me.id
      );
      const record = undoRecord(state, me.id, "build", `${contract.name} node`);

      prunePendingActions(s, me.id);
      if (constructionExhausted(s)) {
        const next = toScoring(s, ctx.now(), "NO_LEGAL_CONSTRUCTION");
        next.undo = record;
        return next;
      }
      const next = me.pendingActions.length ? s : endPlayerTurn(s, me.id, ctx.now());
      next.undo = record; // survives a period or phase advance until someone else acts
      return next;
    }

    case "SKIP_ACTION": {
      if (state.phase !== "CONSTRUCTION" || !me) return state;
      if (!me.crewsHired || s.resolveQueue[0] !== me.id) return state;
      const lineIndex = action.payload?.lineIndex;
      // A skipped action is simply lost; it never rolls into a later period.
      if (lineIndex === undefined || lineIndex === null) {
        me.pendingActions = [];
      } else {
        if (!me.pendingActions.includes(lineIndex)) return state;
        me.pendingActions = removeOne(me.pendingActions, lineIndex);
      }
      pushEvent(s, ctx.now(), "TURN", "notice", `${me.name} gave up a construction action.`, me.id);
      if (!me.pendingActions.length) return endPlayerTurn(s, me.id, ctx.now());
      return s;
    }

    case "UNDO_PLACEMENT": {
      const record = state.undo;
      if (!record || record.playerId !== action.playerId) return state;
      const restored = structuredClone(record.state);
      restored.undo = undefined;
      // The event stream is never rewound: the sequence stays monotonic so a
      // client that saw seq N can never see a different event wearing the same
      // number. The undo is narrated as its own event on top of the history.
      restored.events = structuredClone(state.events);
      restored.nextEventSeq = state.nextEventSeq;
      restored.telemetry = structuredClone(state.telemetry);
      restored.nextTelemetrySeq = state.nextTelemetrySeq;
      pushEvent(
        restored,
        ctx.now(),
        "UNDO",
        "notice",
        `${state.players[action.playerId]?.name ?? "A company"} took back their ${record.label}.`,
        action.playerId
      );
      return restored;
    }

    case "ADVANCE_SCORING": {
      if (state.phase !== "SCORING" || ctx.room.hostId !== action.playerId) return state;
      return scoreGame(s, ctx.now());
    }

    default:
      return state;
  }
}

function telemetryPlayers(state: SubwayState): Record<string, SubwayTelemetryPlayer> {
  return Object.fromEntries(
    state.playerOrder.map((id) => {
      const p = state.players[id];
      return [id, {
        money: p.money,
        crewPaid: p.crewPaid ?? 0,
        tollsPaid: p.tollsPaid,
        surveysPurchased: p.surveysPurchased,
        engineeringCards: [...p.engineeringHand],
        destinationCards: [...p.destinationHand],
        destinationPurchased: !!p.destinationPurchased,
        lineNodeCounts: p.lines.map((line) => line.route.length),
        completedLines: p.lines.filter(lineComplete).map((line) => line.contractId),
      }];
    })
  );
}

/** Records every accepted reducer action without changing rejected-action semantics. */
function reducer(state: SubwayState, action: SubwayAction, ctx: GameContext): SubwayState {
  const playersBefore = telemetryPlayers(state);
  const next = reduceAction(state, action, ctx);
  if (next === state) return state;

  next.telemetry ??= [];
  next.nextTelemetrySeq ??= 1;
  next.telemetry.push({
    actionNumber: next.nextTelemetrySeq++,
    acceptedAt: ctx.now(),
    actorId: action.playerId,
    action: action.type,
    ...(action.payload ? { payload: structuredClone(action.payload) as Record<string, unknown> } : {}),
    phaseBefore: state.phase,
    phaseAfter: next.phase,
    periodBefore: state.currentPeriod,
    periodAfter: next.currentPeriod,
    playersBefore,
    playersAfter: telemetryPlayers(next),
  });
  return next;
}

/** Line indexes that were actually scheduled, so are owed a starter peg. */
export const starterLines = (p: SubwayPlayer): number[] =>
  p.lines.map((_, i) => i).filter((i) => p.lines[i].start !== undefined);

/** Scheduled lines of this company that still need their starter peg. */
export const pendingStarters = (p: SubwayPlayer): number[] =>
  starterLines(p).filter((i) => !p.lines[i].route.length);

/** Whose turn it is to place a starter peg, alternating between companies. */
export function starterTurnId(s: SubwayState): string | undefined {
  const waiting = s.playerOrder
    .map((id) => s.players[id])
    .filter((p) => p && pendingStarters(p).length > 0);
  return leastServed(s, waiting.map((p) => p.id), (id) => {
    const p = s.players[id];
    return starterLines(p).length - pendingStarters(p).length;
  });
}

// ----------------------------------------------------------------------------
// Game template
// ----------------------------------------------------------------------------

export const subwayGame = defineGame<SubwayState, SubwayAction>({
  id: "subway",
  name: "Subway",
  description: "Race to engineer and construct a competitive transit network.",
  minPlayers: 2,
  maxPlayers: 4,
  initialState,
  getPhase: (s) => s.phase,
  reducer,
});

// TODO (future design pins, intentionally not implemented — see RULES.md):
// - Company Cards: asymmetric starting money / hands / abilities.
// - Multiple project cycles per company.
// - Server-controlled bot as an optional third company.
// - Additional maps.

/** Next company with an outstanding decision, used by the hotseat handoff. */
export function nextCompanyId(s: SubwayState): string | undefined {
  switch (s.phase) {
    case "PROCUREMENT": return s.procurement.offer?.activeId;
    case "ENGINEERING":
      if (s.engineeringStep === "CARD_DRAFT") return cardDraftTurnId(s);
      if (s.engineeringStep === "DESTINATION_DRAFT") return destinationTurnId(s);
      if (s.engineeringStep === "SURVEY") return surveyTurnId(s);
      return s.playerOrder.find((id) => !s.players[id].engineeringLocked);
    case "SCHEDULING": return s.playerOrder.find((id) => s.schedulingStep === "PLANNING" ? !s.players[id].scheduleSubmitted : !s.players[id].scheduleConfirmed);
    case "STARTER_PLACEMENT": return starterTurnId(s);
    case "CONSTRUCTION": return s.resolveQueue[0];
    default: return s.playerOrder[0];
  }
}
