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
export const SUBWAY_STATE_VERSION = 13;

// ----------------------------------------------------------------------------
// Tunable configuration
// ----------------------------------------------------------------------------

export const SUBWAY_CONFIG = {
  /**
   * Starting capital covers every three-route portfolio and its cheapest full
   * schedule. Reserve cash remains valuable for survey pins and route contacts.
   */
  startingMoney: 60,
  timelinePeriods: 16,
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
  stationScores: { major: 5, minor: 2 },
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
  /** VP for a fulfilled Destination card. */
  destinationVp: 3,
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
    construction: [] as ConstructionCardId[],
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
  kind: "major" | "minor";
  /** Max number of line connections that may dock here. */
  capacity: number;
};

/**
 * Station identities. A game assigns these to well-spaced board sites at
 * setup, so the city changes without ever bunching every Destination together.
 */
export const STATIONS: Station[] = [
  { id: "market", name: "Market", kind: "minor", x: 3, y: 7, capacity: 2 },
  { id: "grand", name: "Grand Central", kind: "major", x: 5, y: 3, capacity: 3 },
  { id: "museum", name: "Museum", kind: "minor", x: 10, y: 6, capacity: 2 },
  { id: "garden", name: "Garden", kind: "minor", x: 14, y: 2, capacity: 2 },
  { id: "stadium", name: "Stadium", kind: "minor", x: 19, y: 7, capacity: 2 },
  { id: "university", name: "University", kind: "minor", x: 7, y: 7, capacity: 2 },
  { id: "library", name: "Library", kind: "minor", x: 12, y: 4, capacity: 2 },
  { id: "theatre", name: "Theatre", kind: "minor", x: 17, y: 4, capacity: 2 },
  { id: "airport", name: "Airport", kind: "major", x: 24, y: 1, capacity: 3 },
  { id: "harbor", name: "Harbor Exchange", kind: "major", x: 22, y: 4, capacity: 3 },
];

/** Candidate locations are deliberately separated by at least three peg spaces. */
export const STATION_SITES: Point[] = [
  { x: 2, y: 2 }, { x: 3, y: 7 }, { x: 5, y: 4 }, { x: 7, y: 1 },
  { x: 8, y: 7 }, { x: 10, y: 4 }, { x: 12, y: 8 }, { x: 14, y: 2 },
  { x: 16, y: 6 }, { x: 18, y: 1 }, { x: 20, y: 7 }, { x: 22, y: 4 },
  { x: 24, y: 1 }, { x: 25, y: 7 },
];

const STATION_BY_ID = new Map(STATIONS.map((s) => [s.id, s]));

export const stationAt = (p: Point, stations: Station[] = STATIONS): Station | undefined =>
  stations.find((s) => s.x === p.x && s.y === p.y);

export const stationById = (id: string): Station | undefined => STATION_BY_ID.get(id);

/**
 * Where a docking slot physically sits inside its station tile, in peg spaces.
 * Docks are offset sideways so two lines never share a point, and dropped
 * slightly below the hole so the tile label stays readable. These offsets are
 * real geometry: they are what the route is drawn through and what segment
 * lengths and turn angles are measured against.
 */
export const STATION_SLOT_SPACING = 0.32;
export const STATION_SLOT_DROP = 0.18;

/** Physical position of one station dock. */
export const slotPoint = (station: Station, slot: number): Point => ({
  x: station.x + (slot - (station.capacity - 1) / 2) * STATION_SLOT_SPACING,
  y: station.y + STATION_SLOT_DROP,
});

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
  stationBonus: number; // once per contract, if that line connects a Major Station
  incompletePenalty: number; // negative VP
  /** A premium route's optional completion bonus, shown directly on the contract. */
  special?: string;
};

export const LINE_CONTRACTS: LineContract[] = [
  {
    id: "short",
    name: "Market Shuttle",
    code: "S",
    color: "#d4380d",
    recipe: [2, 3, 2, 3],
    cost: 5,
    completionVp: 4,
    stationBonus: 3,
    incompletePenalty: -4,
  },
  {
    id: "branch",
    name: "Garden Spur",
    code: "B",
    color: "#c2410c",
    dash: "20 10",
    recipe: [4, 2, 3, 4, 2],
    cost: 6,
    completionVp: 5,
    stationBonus: 3,
    incompletePenalty: -5,
  },
  {
    id: "medium",
    name: "Museum Connector",
    code: "M",
    color: "#15803d",
    recipe: [3, 5, 2, 4, 3, 5],
    cost: 8,
    completionVp: 6,
    stationBonus: 4,
    incompletePenalty: -6,
  },
  {
    id: "express",
    name: "Grand Central Express",
    code: "E",
    color: "#1d4ed8",
    dash: "26 8 6 8",
    recipe: [6, 4, 5, 3, 6],
    cost: 10,
    completionVp: 6,
    stationBonus: 5,
    incompletePenalty: -7,
    special: "+3 VP if this completed line connects two Major Stations.",
  },
  {
    id: "crosstown",
    name: "Crosstown Line",
    code: "C",
    color: "#7e22ce",
    dash: "6 9",
    recipe: [5, 3, 4, 2, 5, 3],
    cost: 10,
    completionVp: 7,
    stationBonus: 4,
    incompletePenalty: -7,
    special: "+3 VP if this completed line reaches within five pegs of both east and west board edges.",
  },
  {
    id: "long",
    name: "Harbor Line",
    code: "L",
    color: "#0f766e",
    recipe: [4, 6, 3, 5, 2, 4, 6],
    cost: 11,
    completionVp: 9,
    stationBonus: 4,
    incompletePenalty: -8,
  },
];

/** Six new services. Each seat receives three contracts from a shared shuffled pool. */
LINE_CONTRACTS.push(
  { id: "tram", name: "Old Town Tram", code: "T", color: "#be185d", recipe: [2, 3, 4, 2], cost: 5, completionVp: 4, stationBonus: 3, incompletePenalty: -4 },
  { id: "river", name: "Riverside Line", code: "R", color: "#0369a1", dash: "14 7", recipe: [4, 2, 5, 3, 4], cost: 7, completionVp: 5, stationBonus: 4, incompletePenalty: -5 },
  { id: "university", name: "University Shuttle", code: "U", color: "#a16207", dash: "4 6", recipe: [3, 2, 4, 3], cost: 6, completionVp: 4, stationBonus: 3, incompletePenalty: -4 },
  { id: "orbital", name: "Orbital Line", code: "O", color: "#475569", dash: "18 6 4 6", recipe: [4, 5, 2, 4, 3, 5], cost: 9, completionVp: 6, stationBonus: 4, incompletePenalty: -6, special: "+3 VP if this completed line connects three different stations." },
  { id: "airport", name: "Airport Express", code: "A", color: "#4f46e5", dash: "28 10", recipe: [6, 3, 5, 4, 2], cost: 10, completionVp: 6, stationBonus: 5, incompletePenalty: -6, special: "+4 VP if this completed line docks at Airport." },
  { id: "local", name: "Neighbourhood Local", code: "N", color: "#65a30d", dash: "10 5", recipe: [2, 3, 2, 4, 3], cost: 6, completionVp: 5, stationBonus: 3, incompletePenalty: -5 },
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
    name: "Major Connection",
    description: "Link a civic destination into the wider network.",
    requirement: "One completed line connects a Major Station and a Minor Station.",
    vp: 4,
    kind: "objective",
  },
  {
    id: "through",
    name: "Grand Tour",
    description: "Make one line do real city work.",
    requirement: "One completed line connects one Major Station and at least two Minor Stations.",
    vp: 5,
    kind: "objective",
  },
  {
    id: "network",
    name: "Network Link",
    description: "Tie two parts of the city together on one finished line.",
    requirement: "One completed line connects at least three different stations.",
    vp: 4,
    kind: "objective",
  },
  {
    id: "parallel",
    name: "Long Haul",
    description: "Commit to a proper cross-city project.",
    requirement: "One completed line has six or more segments.",
    vp: 4,
    kind: "objective",
  },
  {
    id: "terminal",
    name: "End of the Line",
    description: "Finish at a station, not in open ground.",
    requirement: "A completed line ends on a station.",
    vp: 4,
    kind: "objective",
  },
  {
    id: "minimal",
    name: "Twin Completion",
    description: "Deliver more than one promise.",
    requirement: "Complete at least two of your Line Contracts.",
    vp: 3,
    kind: "objective",
  },
  {
    id: "crossing",
    name: "Crossing Design",
    description: "Take your alignment straight over the competition's.",
    requirement: "One of your segments properly crosses any existing line.",
    vp: 2,
    kind: "objective",
  },
];

ENGINEERING_CARDS.push(
  { id: "crosstown-service", name: "Across Town", description: "Connect the city's far edges.", requirement: "One line has a node within five pegs of both the west and east board edges.", vp: 5, kind: "objective" },
  { id: "local-service", name: "Local Service", description: "Make everyday journeys easier.", requirement: "Your company connects two different Minor Stations.", vp: 4, kind: "objective" },
  { id: "interchange", name: "Interchange", description: "Give passengers a connection.", requirement: "Two of your lines dock the same station.", vp: 3, kind: "objective" },
  { id: "solvent", name: "On Budget", description: "Deliver a railway with a reserve.", requirement: "Complete at least two lines and finish with at least $3M.", vp: 3, kind: "objective" },
);

export const engineeringById = (id: string): EngineeringCard | undefined =>
  ENGINEERING_CARDS.find((c) => c.id === id);

/**
 * Destination cards — one per station. They share the face-up Engineering
 * market but are a separate commitment: each is assigned to one owned line and
 * pays out when that line connects the named station, complete or not.
 */
export type DestinationCard = {
  id: string;
  stationId: string;
  name: string;
  description: string;
  requirement: string;
  vp: number;
};

export const DESTINATION_CARDS: DestinationCard[] = STATIONS.map((s) => ({
  id: `dest-${s.id}`,
  stationId: s.id,
  name: `Destination: ${s.name}`,
  description: `Serve ${s.name} with any of your routes.`,
  requirement: `Any owned line connects ${s.name}, complete or not.`,
  vp: SUBWAY_CONFIG.destinationVp,
}));

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

export type ConstructionCardId = "overtime" | "expedite" | "surge" | "grant" | "access" | "booking" | "relief";

export const CONSTRUCTION_CARDS: {id:ConstructionCardId; name:string; description:string}[] = [
  {id:"booking",name:"Advance Booking",description:"Before hiring, reserve $1M off your crew bill next round. Expires unused; never pays cash."},
  {id:"relief",name:"Relief Crew",description:"Before hiring, your first crew is free this turn. Pay $0M / $2M / $5M for 1 / 2 / 3 crews."},
  {id:"expedite",name:"Priority Dispatch",description:"During the opening priority window, take the first turn this round. Counts as your one card this round."},
  {id:"grant",name:"City Grant",description:"Before hiring, receive $3M."},
  {id:"access",name:"Access Pass",description:"Before building, the city pays all contact tolls on your next segment this turn. Route owners still receive payment."},
];

export const constructionById = (id: ConstructionCardId) => CONSTRUCTION_CARDS.find((c) => c.id === id);

/**
 * Card families used to seed shuffled piles at setup. Contracts and
 * Destinations have separate drafts.
 */
export const MARKET_DECKS = {
  // Objectives only. Destinations have their own Engineering draft (DEC-019).
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

/**
 * Within ENGINEERING: draft Destinations from a public row, lock the private
 * plan, then place the Survey Pins that plan bought.
 */
export type EngineeringStep = "BUY_SURVEYS" | "CARD_DRAFT" | "DESTINATION_DRAFT" | "PLAN" | "SURVEY";

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
  crewDiscount?: number;
  nextCrewDiscount?: number;
  crewPaid?: number;
  engineeringHand: string[];
  committedEngineering: string[];
  engineeringLocked: boolean;
  /** Destination cards drafted but not yet assigned; they score nothing. */
  destinationHand: string[];
  /** Destination cards locked to a line at Engineering plan lock. */
  destinationCommitments: DestinationCommitment[];
  /** Survey Pins bought at plan lock; paid for once, placed publicly after. */
  surveysPurchased: number;
  schedulingHand: SchedulingCardId[];
  constructionHand: ConstructionCardId[];
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
  constructionCardThisPeriod: boolean;
  /** Access Pass covers the next placement this period; the city pays the owners. */
  accessPass?: boolean;
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
  constructionCards: ConstructionCardId[];
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
  priorityQueue: string[];
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
  | "BUY_SURVEYS"
  | "HIRE_CREWS"
  | "PASS_PRIORITY"
  | "PICK_DESTINATION"
  | "LOCK_ENGINEERING_PLAN"
  | "PLACE_SURVEY"
  | "AUTO_SCHEDULE"
  | "SET_SCHEDULE"
  | "SUBMIT_SCHEDULE"
  | "PLAY_SCHEDULING_CARD"
  | "CONFIRM_SCHEDULE"
  | "PLACE_STARTER"
  | "PLAY_CONSTRUCTION_CARD"
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
export function basePriorityId(s: SubwayState, period: number): string {
  const start = Math.max(0, s.playerOrder.indexOf(s.oddPriorityId));
  return s.playerOrder[(start + period - 1) % s.playerOrder.length] ?? "";
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
// Two coordinate ideas live side by side, and the difference matters:
//   * the *hole* a node occupies — always integer, and what the occupancy,
//     spacing, overlap, and crossing rules are written against; and
//   * its *physical* position — the hole itself for a normal peg, or the exact
//     station dock for a station connection. Recipe lengths, turn angles, and
//     everything drawn on the board use this one.
// ----------------------------------------------------------------------------

const samePoint = (a: Point, b: Point) => a.x === b.x && a.y === b.y;

/** Physical position of a placed route node. */
export function nodePoint(n: RouteNode): Point {
  if (n.stationId) {
    const station = stationById(n.stationId);
    if (station) {
      const slot = n.stationSlot ?? 0;
      return {
        x: n.x + (slot - (station.capacity - 1) / 2) * STATION_SLOT_SPACING,
        y: n.y + STATION_SLOT_DROP,
      };
    }
  }
  return { x: n.x, y: n.y };
}

/** Physical position of a candidate placement at a hole, with a chosen dock. */
export function targetPoint(p: Point, slot?: number, station?: Station): Point {
  if (station && slot !== undefined) return slotPoint(station, slot);
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
      if (n.stationId) continue; // stations keep their own exclusive rules
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

/** Line connections docked at a station, in the order they arrived. */
export function stationConnections(state: SubwayState, stationId: string): LineRef[] {
  return allLines(state).filter(({ line }) => line.route.some((n) => n.stationId === stationId));
}

/** Companies holding at least one connection at a station. */
export function stationCompanies(state: SubwayState, stationId: string): string[] {
  return Array.from(new Set(stationConnections(state, stationId).map((c) => c.playerId)));
}

/** Which line, if any, already occupies a specific dock of a station. */
export function slotOccupant(state: SubwayState, stationId: string, slot: number): LineRef | undefined {
  return allLines(state).find(({ line }) =>
    line.route.some((n) => n.stationId === stationId && (n.stationSlot ?? 0) === slot)
  );
}

/** Docks of this station nobody has taken yet. */
export function openSlots(state: SubwayState, station: Station): number[] {
  return Array.from({ length: station.capacity }, (_, i) => i).filter(
    (slot) => !slotOccupant(state, station.id, slot)
  );
}

/**
 * Validates extending `lineIndex` of `playerId` to `p`. Returns a
 * human-readable reason when the placement is illegal, or null when allowed.
 *
 * Station holes are docks: each dock holds exactly one connection, so a company
 * must name the open dock it wants and companies race for specific slots.
 * Normal holes hold one peg.
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

  if (station) {
    if (slot === undefined) return "Choose which dock of the station to use.";
    if (!Number.isInteger(slot) || slot < 0 || slot >= station.capacity) {
      return `${station.name} has no such dock.`;
    }
    if (myLine.route.some((n) => n.stationId === station.id)) {
      return "This line already connects that station.";
    }
    if (slotOccupant(state, station.id, slot)) return "That dock is already taken.";
    if (stationConnections(state, station.id).length >= station.capacity) {
      return `${station.name} is at capacity.`;
    }
  }
  // A normal hole is no longer exclusive, and nothing is excluded for being
  // beside, on, or through an existing route (DEC-018). What that costs during
  // Construction is priced by routeContacts(), not forbidden here.

  if (starter || !myLine.route.length) return null;

  // ---- Ordered recipe geometry ---------------------------------------------
  const required = contract.recipe[segmentsBuilt(myLine)];
  const fromNode = myLine.route[myLine.route.length - 1];
  const fromPos = nodePoint(fromNode);
  const toPos = targetPoint(p, slot, station);
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

/** A place a line may legally go next: a normal hole, or one station dock. */
export type PlacementTarget = Point & { slot?: number };

/** Every legal next placement for this line, docks enumerated individually. */
export function legalTargets(
  state: SubwayState,
  playerId: string,
  lineIndex: number,
  starter = false
): PlacementTarget[] {
  const out: PlacementTarget[] = [];
  for (let y = 0; y < SUBWAY_CONFIG.board.rows; y++) {
    for (let x = 0; x < SUBWAY_CONFIG.board.columns; x++) {
      const station = stationAt({ x, y }, state.stations);
      if (station) {
        if (starter) continue; // starters may not use a station
        for (let slot = 0; slot < station.capacity; slot++) {
          if (!validateNode(state, playerId, lineIndex, { x, y }, false, slot)) out.push({ x, y, slot });
        }
      } else if (!validateNode(state, playerId, lineIndex, { x, y }, starter)) {
        out.push({ x, y });
      }
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
  if (stationAt(p, s.stations)) return "Survey Pins cannot be placed on a station.";
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
  const rotation = s.playerOrder.map((_, i) => basePriorityId(s, i + 1));
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

/** True when the assigned line connects the card's station, complete or not. */
export function destinationMet(p: SubwayPlayer, commitment: DestinationCommitment): boolean {
  const line = p.lines[commitment.lineIndex];
  return !!line && line.route.some((n) => n.stationId === commitment.stationId);
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
    if (stations.includes(card.stationId)) {
      problems.push(`${card.name} is already assigned to that line.`);
      continue;
    }
    stations.push(card.stationId);
    perLine.set(a.lineIndex, stations);
  }
  return problems;
}

// ----------------------------------------------------------------------------
// Engineering objective evaluation (approximate geometry, see RULES.md)
// ----------------------------------------------------------------------------

function lineMeets(id: string, line: PlayerLine, me: SubwayPlayer, opponents: SubwayPlayer[]): boolean {
  const tol = SUBWAY_CONFIG.tolerances;
  const r = line.route;
  const pts = routePoints(line);
  const complete = lineComplete(line);
  // angles[i] is the direction change between segment i and segment i+1.
  const angles = pts.slice(2).map((_, i) => angleChange(pts[i], pts[i + 1], pts[i + 2]));
  const runOfTwo = (max: number) =>
    angles.some((_, i) => i + 1 < angles.length && angles[i] <= max && angles[i + 1] <= max);

  switch (id) {
    case "crosstown-service":
      return r.some((n) => n.x <= 5) && r.some((n) => n.x >= SUBWAY_CONFIG.board.columns - 6);
    case "gentle":
      return runOfTwo(tol.gentleCurve);
    case "straight":
      return runOfTwo(tol.straight);
    case "bend":
      return angles.some((a) => a > tol.gentleCurve && a <= tol.bend);
    case "approach": {
      if (!complete) return false;
      const connected = r.map((n) => n.stationId).filter(Boolean).map((id) => stationById(id!));
      return connected.some((station) => station?.kind === "major") && connected.some((station) => station?.kind === "minor");
    }
    case "through": {
      if (!complete) return false;
      const connected = r.map((n) => n.stationId).filter(Boolean).map((id) => stationById(id!));
      return connected.some((station) => station?.kind === "major") && connected.filter((station) => station?.kind === "minor").length >= 2;
    }
    case "network": {
      if (!complete) return false;
      const stations = new Set(r.filter((n) => n.stationId).map((n) => n.stationId));
      return stations.size >= 3;
    }
    case "parallel":
      return complete && contractOf(line)!.recipe.length >= 6;
    case "terminal":
      return complete && r[r.length - 1]?.stationId !== undefined;
    case "crossing":
      return me.properCrossings > 0;
    default:
      return false;
  }
}

export function objectiveMet(id: string, me: SubwayPlayer, opponents: SubwayPlayer[]): boolean {
  const destination = destinationById(id);
  if (destination) return me.lines.some(line => line.route.some(node => node.stationId === destination.stationId));
  // Portfolio objectives are judged across the whole company, not per line.
  if (id === "solvent") return me.money >= 3 && me.lines.filter(lineComplete).length >= 2;
  if (id === "local-service") return STATIONS.filter((station) => station.kind === "minor" && me.lines.some((line) => line.route.some((n) => n.stationId === station.id))).length >= 2;
  if (id === "interchange") return STATIONS.some((station) => me.lines.filter((line) => line.route.some((n) => n.stationId === station.id)).length >= 2);
  if (id === "minimal") return me.lines.filter(lineComplete).length >= 2;
  if (id === "crossing") return me.properCrossings > 0;
  return me.lines.some((line) => lineMeets(id, line, me, opponents));
}

/** Live private status of one company's committed cards, for its own UI. */
export function committedStatus(s: SubwayState, playerId: string): { cardId: string; met: boolean }[] {
  const me = s.players[playerId];
  if (!me) return [];
  const opponents = seats(s).filter((p) => p.id !== playerId);
  return me.engineeringHand.map((cardId) => ({ cardId, met: objectiveMet(cardId, me, opponents) }));
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
          : `${contract.name} incomplete (${line.route.length}/${contractNodes(contract)})`,
        points: complete ? contract.completionVp : contract.incompletePenalty,
        met: complete,
      });
      const majors = lineMajors(line);
      if (majors.length) {
        items.push({ label: `${contract.name} major-station bonus`, points: contract.stationBonus, met: true });
      }
      const stationIds = new Set(line.route.flatMap((node) => node.stationId ? [node.stationId] : []));
      const spansBoard = line.route.some((node) => node.x <= 5) && line.route.some((node) => node.x >= SUBWAY_CONFIG.board.columns - 6);
      const specialMet =
        (contract.id === "express" && complete && majors.length >= 2) ||
        (contract.id === "crosstown" && complete && spansBoard) ||
        (contract.id === "orbital" && complete && stationIds.size >= 3) ||
        (contract.id === "airport" && complete && stationIds.has("airport"));
      if (specialMet) {
        const points = contract.id === "airport" ? 4 : 3;
        items.push({ label: `${contract.name} special`, points, met: true });
      }
    }

    const opponents = Object.values(players).filter((o) => o.id !== p.id);
    for (const id of Array.from(new Set(p.engineeringHand))) {
      const card = engineeringById(id) ?? destinationById(id);
      if (!card) continue;
      const met = objectiveMet(id, p, opponents);
      items.push({ label: card.name, points: met ? card.vp : 0, met });
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
    constructionHand: [...SUBWAY_CONFIG.startingHands.construction],
    lines: [],
    decisionsUsed: 0,
    scheduleSubmitted: false,
    scheduleConfirmed: false,
    pendingActions: [],
    actedThisPeriod: false,
    constructionCardThisPeriod: false,
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
    market: {rows:{engineering:[], scheduling:[], construction:[]}, decks:{engineering:[], scheduling:[], construction:[]}, picks:0},
    engineeringStep: "DESTINATION_DRAFT",
    destinationDeck: [],
    destinationRow: [],
    schedulingStep: "PLANNING",
    surveyPins: [],
    currentPeriod: 1,
    resolveQueue: [],
    priorityQueue: [],
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

/** Assign every named station to a different deliberately spaced site. */
export function randomStationLayout(random: () => number): Station[] {
  const sites = shuffle(STATION_SITES, random).slice(0, STATIONS.length);
  return STATIONS.map((station, i) => ({ ...station, ...sites[i] }));
}

// ----------------------------------------------------------------------------
// Procurement flow
// ----------------------------------------------------------------------------

/** Shared snake order: each stage rotates its opening seat. */
export function draftTurnId(s: SubwayState, pick: number, stage: number): string {
  const n = s.playerOrder.length;
  const round = Math.floor(pick / n);
  const offset = round % 2 === 0 ? pick % n : n - 1 - pick % n;
  const first = (s.playerOrder.indexOf(s.oddPriorityId) + stage) % n;
  return s.playerOrder[(first + offset) % n];
}

export function cardDraftTurnId(s: SubwayState): string | undefined {
  const pick = s.market.picks ?? 0;
  return pick < s.playerOrder.length * 6 ? draftTurnId(s, pick, 1) : undefined;
}
export function draftPicks(p: SubwayPlayer): number {
  return p.engineeringHand.length + p.schedulingHand.length + p.constructionHand.length;
}
export function cardDraftBlocker(s: SubwayState, playerId: string, deck: CardDeckId, cardId?: string): string | undefined {
  const p = s.players[playerId];
  if (s.phase !== "ENGINEERING" || s.engineeringStep !== "CARD_DRAFT" || cardDraftTurnId(s) !== playerId) return "Wait for your draft turn.";
  if (deck === "scheduling") return "Scheduling cards are now Construction cards.";
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
    pushEvent(s, now, "PHASE", "banner", "Contracts signed. Draft six cards each: Engineering goals or Construction abilities.");
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
  s.priorityQueue = [];
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
export function activationCost(p: SubwayPlayer, count: number): number {
  return count === 0 ? 0 : Math.max(0, count * (count + 1) / 2 - (p.crewDiscount ?? 0));
}
export function constructionCardBlocker(s: SubwayState, id: string, card: ConstructionCardId): string | undefined {
  const p = s.players[id];
  if (s.phase !== "CONSTRUCTION" || !p) return "Only during Construction.";
  if (!p.constructionHand.includes(card)) return "You do not hold this card.";
  if (p.constructionCardThisPeriod) return "One Construction card per round.";
  if (card === "expedite") return s.priorityQueue[0] === id ? undefined : "Only during your opening priority opportunity.";
  if (s.priorityQueue.length || s.resolveQueue[0] !== id) return "Wait for your construction turn.";
  if (!constructionById(card)) return "This card is no longer in the game.";
  if (["booking","relief","grant"].includes(card) && p.crewsHired) return "Play before hiring crews.";
  if (card === "booking" && s.currentPeriod === SUBWAY_CONFIG.timelinePeriods) return "There is no next round.";
  if (card === "access" && !p.pendingActions.length) return "Hire a crew before playing Access Pass.";
  return undefined;
}
function beginConstructionPeriod(s: SubwayState, now: number, opening = false): SubwayState {
  if (constructionExhausted(s)) return toScoring(s, now, "NO_LEGAL_CONSTRUCTION");
  if (s.currentPeriod > SUBWAY_CONFIG.timelinePeriods) return toScoring(s, now, "ROUND_LIMIT");
  for (const p of seats(s)) {
    p.pendingActions = [];
    p.actedThisPeriod = false;
    p.constructionCardThisPeriod = false;
    p.accessPass = false;
    p.crewsHired = false;
    p.crewDiscount = p.nextCrewDiscount ?? 0;
    p.nextCrewDiscount = 0;
  }
  s.resolveQueue = s.playerOrder.map((_,i) => basePriorityId(s,s.currentPeriod+i));
  s.priorityQueue = s.resolveQueue.filter(id => s.players[id].constructionHand.includes("expedite"));
  pushEvent(s, now, "PERIOD", "banner", `${opening ? "Construction begins. " : ""}Round ${s.currentPeriod}: ${s.priorityQueue.length ? "Priority Dispatch opportunity." : "Choose crews on your turn."}`);
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
  if (action.type !== "START_GAME" && (legacy || !state.players[action.playerId])) return state;

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
      fresh.market.rows = {engineering:[], scheduling:[], construction:[]};
      fresh.market.decks = {engineering:[], scheduling:[], construction:[]};
      fresh.market.picks = 0;
      for (const deck of ["engineering", "construction"] as CardDeckId[]) {
        const ids = deck === "engineering" ? [...ENGINEERING_CARDS, ...DESTINATION_CARDS].map(c => c.id) : CONSTRUCTION_CARDS.map(c => c.id);
        fresh.market.decks[deck] = shuffle(deck === "engineering" ? ids : Array.from({length:8}, () => ids).flat(), ctx.random);
        fresh.market.rows[deck] = fresh.market.decks[deck].splice(0, 2);
      }
      fresh.stations = randomStationLayout(ctx.random);
      fresh.oddPriorityId = fresh.playerOrder[Math.floor(ctx.random() * fresh.playerOrder.length)];
      fresh.procurement.deck = shuffle(
        LINE_CONTRACTS.map((c) => c.id),
        ctx.random
      ).slice(0, fresh.playerOrder.length * 3);
      // Shuffled now, dealt when Engineering opens: this is the only point in
      // the flow with a random source, and the reducer must stay pure.
      fresh.destinationDeck = shuffle(
        DESTINATION_CARDS.map((c) => c.id),
        ctx.random
      );
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
      if (!me || !deck || !["engineering", "construction"].includes(deck)) return state;
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
      if (deck === "engineering") me.engineeringHand.push(cardId);
      else if (deck === "scheduling") me.schedulingHand.push(cardId as SchedulingCardId);
      else me.constructionHand.push(cardId as ConstructionCardId);
      while (row.length < 2 && pile.length) row.push(pile.shift()!);
      s.market.picks = (s.market.picks ?? 0) + 1;
      pushEvent(s, ctx.now(), "CARD", "notice", `${me.name} drafted a ${deck} card (${draftPicks(me)} of 6).`, me.id);
      if (!cardDraftTurnId(s)) {
        s.engineeringStep = "BUY_SURVEYS";
        pushEvent(s, ctx.now(), "PHASE", "banner", "All goals are active. Optionally buy Survey Pins, then place your starters.");
      }
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

    case "PASS_PRIORITY": {
      if (s.phase !== "CONSTRUCTION" || s.priorityQueue[0] !== me?.id || action.payload?.period !== s.currentPeriod) return state;
      s.priorityQueue.shift();
      return s;
    }
    case "HIRE_CREWS": {
      if (s.phase !== "CONSTRUCTION" || s.priorityQueue.length || s.resolveQueue[0] !== me?.id || me.crewsHired || action.payload?.period !== s.currentPeriod) return state;
      const indexes = action.payload?.lineIndexes;
      if (!Array.isArray(indexes) || indexes.length > 3 || new Set(indexes).size !== indexes.length || indexes.some(i => !Number.isInteger(i) || !buildableLines(s,me.id).includes(i))) return state;
      const cost = activationCost(me,indexes.length);
      me.money -= cost;
      me.crewPaid = (me.crewPaid ?? 0) + cost;
      me.crewDiscount = 0;
      me.crewsHired = true;
      me.pendingActions = [...indexes];
      pushEvent(s, ctx.now(), "TURN", "notice", `${me.name} hired ${indexes.length} crew(s) for $${cost}M.`, me.id);
      return indexes.length ? s : endPlayerTurn(s,me.id,ctx.now());
    }
    case "PLAY_CONSTRUCTION_CARD": {
      const id = action.payload?.cardId as ConstructionCardId;
      if (!me || action.payload?.period !== s.currentPeriod || constructionCardBlocker(s,me.id,id)) return state;
      if (id === "expedite") {
        s.resolveQueue = [me.id,...s.resolveQueue.filter(pid=>pid!==me.id)];
        s.priorityQueue = [];
      } else if (id === "grant") me.money += 3;
      else if (id === "access") me.accessPass = true;
      else if (id === "booking") me.nextCrewDiscount = 1;
      else if (id === "relief") me.crewDiscount = (me.crewDiscount ?? 0) + 1;
      me.constructionHand = removeOne(me.constructionHand,id);
      me.constructionCardThisPeriod = true;
      pushEvent(s,ctx.now(),"CARD","notice",`${me.name} played ${constructionById(id)!.name}.`,me.id);
      return s;
    }

    case "BUILD": {
      if (state.phase !== "CONSTRUCTION" || !me) return state;
      if (s.priorityQueue.length || !me.crewsHired || s.resolveQueue[0] !== me.id || !me.pendingActions.length) return state;
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
        if (!me.accessPass) {
          me.money -= toll;
          me.tollsPaid += toll;
        }
        for (const contact of contacts) s.players[contact.ownerId].money += SUBWAY_CONFIG.contact.toll;
      }
      const subsidized = me.accessPass;
      me.accessPass = false;
      me.properCrossings += countAnyCrossings(s, nodePoint(from), targetPoint(pt, slot, station));
      line.route.push({
        ...pt,
        ...(station ? { stationId: station.id, stationSlot: slot! } : {}),
      });

      me.pendingActions = removeOne(me.pendingActions, lineIndex);
      const contract = contractOf(line)!;
      // One combined, privacy-safe notice: the placement, the station or hole
      // it reached, completion, and any toll transfer are all public facts.
      const where = station
        ? `${station.name} dock ${(slot ?? 0) + 1}`
        : `hole ${pt.x + 1},${pt.y + 1}`;
      const tollNote = toll > 0
        ? ` ${contacts.length} contact${contacts.length === 1 ? "" : "s"} with ${Array.from(new Set(contacts.map((c) => s.players[c.ownerId].name))).join(", ")}: $${toll}M${subsidized ? " paid by the city" : ""}.`
        : "";
      pushEvent(
        s,
        ctx.now(),
        lineComplete(line) ? "ROUTE" : "PLACEMENT",
        "notice",
        (lineComplete(line)
          ? `${me.name} completed the ${contract.name} at ${where}!`
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
      if (s.priorityQueue.length || !me.crewsHired || s.resolveQueue[0] !== me.id) return state;
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
        constructionCards: [...p.constructionHand],
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
    case "CONSTRUCTION": return s.priorityQueue[0] ?? s.resolveQueue[0];
    default: return s.playerOrder[0];
  }
}
