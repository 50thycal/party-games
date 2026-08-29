import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GameContext, Player } from "@/engine/types";

// ============================================================================
// Subway v0.4 — two-player competitive subway-network construction.
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
export const SUBWAY_STATE_VERSION = 8;

// ----------------------------------------------------------------------------
// Tunable configuration
// ----------------------------------------------------------------------------

export const SUBWAY_CONFIG = {
  /**
   * Starting capital. The six contracts total $50M, so an even 3/3 split costs
   * about $25M — roughly 74% of this, which is the intended squeeze (see
   * RULES.md). Contracts, mobilization, crew, and Survey Pins consume money.
   */
  startingMoney: 34,
  timelinePeriods: 16,
  minContractsPerPlayer: 2,
  maxContractsPerPlayer: 3,
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
    debtVpPerMillion: 2,
  },
  /** Destination cards face up at the start of the Engineering draft. */
  destinationRow: 3,
  /** Destination cards each company drafts. */
  destinationsPerPlayer: 2,
  startingHands: {
    engineering: ["straight", "bend", "network", "terminal", "crossing"],
    scheduling: ["early", "float", "priority"],
    construction: ["overtime", "surge"],
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
// Line contracts — six per game, all of which must find an owner.
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
  special?: string;
};

export const LINE_CONTRACTS: LineContract[] = [
  {
    id: "short",
    name: "Short Line",
    code: "S",
    color: "#d4380d",
    recipe: [3, 4, 3, 4],
    cost: 5,
    completionVp: 4,
    stationBonus: 3,
    incompletePenalty: -4,
  },
  {
    id: "branch",
    name: "Branch Line",
    code: "B",
    color: "#c2410c",
    dash: "20 10",
    recipe: [5, 5, 3, 4, 4],
    cost: 6,
    completionVp: 5,
    stationBonus: 3,
    incompletePenalty: -5,
  },
  {
    id: "medium",
    name: "Medium Line",
    code: "M",
    color: "#15803d",
    recipe: [3, 4, 3, 4, 3, 4],
    cost: 8,
    completionVp: 6,
    stationBonus: 4,
    incompletePenalty: -6,
  },
  {
    id: "express",
    name: "Express Line",
    code: "E",
    color: "#1d4ed8",
    dash: "26 8 6 8",
    recipe: [5, 4, 5, 4, 5],
    cost: 9,
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
    recipe: [4, 3, 4, 3, 4, 3],
    cost: 10,
    completionVp: 7,
    stationBonus: 4,
    incompletePenalty: -7,
  },
  {
    id: "long",
    name: "Long Line",
    code: "L",
    color: "#0f766e",
    recipe: [4, 5, 4, 4, 5, 4, 4],
    cost: 12,
    completionVp: 9,
    stationBonus: 4,
    incompletePenalty: -8,
  },
];

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
    id: "network",
    name: "Network Link",
    description: "Tie two parts of the city together on one finished line.",
    requirement: "One completed line connects at least two different stations.",
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
    description: "Take your alignment straight over the competition's.",
    requirement: "One of your segments properly crosses an opposing segment.",
    vp: 2,
    kind: "objective",
  },
];

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
  description: `Serve ${s.name} with the line you assign this card to.`,
  requirement: `The assigned line connects ${s.name}, complete or not.`,
  vp: SUBWAY_CONFIG.destinationVp,
}));

const DESTINATION_BY_ID = new Map(DESTINATION_CARDS.map((c) => [c.id, c]));

export const destinationById = (id: string): DestinationCard | undefined => DESTINATION_BY_ID.get(id);

export const isDestinationCard = (id: string): boolean => DESTINATION_BY_ID.has(id);

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
export type EngineeringStep = "DESTINATION_DRAFT" | "PLAN" | "SURVEY";

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
  /** Mobilization + crew actually paid at schedule lock. */
  schedulePaid?: number;
  /** Line indexes this company may still build this period. */
  pendingActions: number[];
  actedThisPeriod: boolean;
  constructionCardThisPeriod: boolean;
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

/** Public events kept in state; older ones fall off the front. */
export const SUBWAY_EVENT_LIMIT = 20;

export interface SubwayState {
  version: number;
  phase: SubwayPhase;
  playerOrder: string[];
  players: Record<string, SubwayPlayer>;
  /**
   * The company holding priority in odd calendar periods; the opposition holds
   * it in even periods. Priority Permit overrides one contested period.
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
  winnerIds: string[];
  message: string;
}

export type SubwayActionType =
  | "START_GAME"
  | "PROCURE"
  | "PICK_DESTINATION"
  | "LOCK_ENGINEERING_PLAN"
  | "PLACE_SURVEY"
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
    x?: number;
    y?: number;
    slot?: number;
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

/** The face-up Engineering card id, which may be an objective or a Destination. */
export const marketEngineeringId = (m: Market): string =>
  MARKET_DECKS.engineering[m.engineeringIndex % MARKET_DECKS.engineering.length];

/** Name/description/kind of whatever is face up on the Engineering market. */
export function marketEngineering(m: Market): {
  id: string;
  name: string;
  description: string;
  destination: boolean;
} {
  const id = marketEngineeringId(m);
  const dest = destinationById(id);
  if (dest) return { id, name: dest.name, description: dest.description, destination: true };
  const card = engineeringById(id)!;
  return { id, name: card.name, description: card.description, destination: false };
}

export const marketScheduling = (m: Market) =>
  schedulingById(MARKET_DECKS.scheduling[m.schedulingIndex % MARKET_DECKS.scheduling.length])!;

export const marketConstruction = (m: Market) =>
  constructionById(MARKET_DECKS.construction[m.constructionIndex % MARKET_DECKS.construction.length])!;

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

/** The company whose calendar turn it is to build first, ignoring permits. */
export function basePriorityId(s: SubwayState, period: number): string {
  const other = s.playerOrder.find((id) => id !== s.oddPriorityId);
  return period % 2 === 1 ? s.oddPriorityId : other ?? s.oddPriorityId;
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
  s.procurement.deck.length + s.procurement.yard.length + (s.procurement.offer ? 1 : 0);

/**
 * Whether the 2–3 ownership range can still be met. Because every contract is
 * bought and the cap is 3 of 6, holding the cap is what guarantees the
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
    if (station) return slotPoint(station, n.stationSlot ?? 0);
  }
  return { x: n.x, y: n.y };
}

/** Physical position of a candidate placement at a hole, with a chosen dock. */
export function targetPoint(p: Point, slot?: number): Point {
  const station = stationAt(p);
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
  for (const { line } of opposing) {
    for (const n of line.route) {
      if (n.stationId) continue; // stations keep their own exclusive rules
      if (samePoint(n, from)) continue; // already ours, and already paid for
      if (!pointOnSegment(n, from, to)) continue;
      const key = contactKey(n.x, n.y);
      found.set(key, { key, kind: "peg", x: n.x, y: n.y });
    }
  }

  for (const { line } of opposing) {
    for (let i = 1; i < line.route.length; i++) {
      const a = line.route[i - 1];
      const b = line.route[i];
      if (segmentsCross(from, to, a, b)) {
        const at = intersectionOf(from, to, a, b);
        const key = contactKey(at.x, at.y);
        if (!found.has(key)) found.set(key, { key, kind: "crossing", x: at.x, y: at.y });
      } else if (!samePoint(to, a) && !samePoint(to, b) && pointOnSegment(to, a, b)) {
        const key = contactKey(to.x, to.y);
        if (!found.has(key)) found.set(key, { key, kind: "endpoint", x: to.x, y: to.y });
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

  const station = stationAt(p);
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
  const toPos = targetPoint(p, slot);
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
      const station = stationAt({ x, y });
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
  if (stationAt(p)) return "Survey Pins cannot be placed on a station.";
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
export function surveyTurnId(s: SubwayState): string | undefined {
  const waiting = s.playerOrder.filter((id) => surveysPending(s, id) > 0);
  if (!waiting.length) return undefined;
  if (waiting.length === 1) return waiting[0];
  const [a, b] = waiting;
  const placedA = surveysPlaced(s, a);
  const placedB = surveysPlaced(s, b);
  if (placedA !== placedB) return placedA < placedB ? a : b;
  return s.oddPriorityId === b ? b : a;
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
  const waiting = s.playerOrder.filter(
    (id) => s.players[id] && destinationsHeld(s.players[id]) < SUBWAY_CONFIG.destinationsPerPlayer
  );
  if (!waiting.length) return undefined;
  if (waiting.length === 1) return waiting[0];
  const [a, b] = waiting;
  const held = (id: string) => destinationsHeld(s.players[id]);
  if (held(a) !== held(b)) return held(a) < held(b) ? a : b;
  return s.oddPriorityId === b ? b : a;
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
          angleChange(pts[i - 2], pts[i - 1], pts[i]) <= tol.straight
      );
    case "through":
      return r.some(
        (n, i) =>
          i > 0 && i < r.length - 1 && n.stationId !== undefined &&
          angleChange(pts[i - 1], pts[i], pts[i + 1]) <= tol.gentleCurve
      );
    case "network": {
      if (!complete) return false;
      const stations = new Set(r.filter((n) => n.stationId).map((n) => n.stationId));
      return stations.size >= 2;
    }
    case "parallel":
      // Approximation: one of my segments runs nearly parallel to an opposing
      // segment and close to it (midpoint distance within the configured pegs).
      return pts.some((n, i) => {
        if (i === 0) return false;
        const m1 = { x: (n.x + pts[i - 1].x) / 2, y: (n.y + pts[i - 1].y) / 2 };
        return opponents.some((o) =>
          o.lines.some((ol) => {
            const opts = routePoints(ol);
            return opts.some((q, j) => {
              if (j === 0) return false;
              const m2 = { x: (q.x + opts[j - 1].x) / 2, y: (q.y + opts[j - 1].y) / 2 };
              return (
                headingDiff(pts[i - 1], n, opts[j - 1], q) <= tol.parallelHeading &&
                Math.hypot(m1.x - m2.x, m1.y - m2.y) <= tol.parallelMaxDistance
              );
            });
          })
        );
      });
    case "terminal":
      return complete && r[r.length - 1]?.stationId !== undefined;
    case "crossing":
      return me.properCrossings > 0;
    default:
      return false;
  }
}

export function objectiveMet(id: string, me: SubwayPlayer, opponents: SubwayPlayer[]): boolean {
  // Minimal Footprint is judged across the whole portfolio, not per line.
  if (id === "minimal") return allLinesComplete(me);
  if (id === "crossing") return me.properCrossings > 0;
  return me.lines.some((line) => lineMeets(id, line, me, opponents));
}

/** Live private status of one company's committed cards, for its own UI. */
export function committedStatus(s: SubwayState, playerId: string): { cardId: string; met: boolean }[] {
  const me = s.players[playerId];
  if (!me) return [];
  const opponents = seats(s).filter((p) => p.id !== playerId);
  return me.committedEngineering.map((cardId) => ({ cardId, met: objectiveMet(cardId, me, opponents) }));
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

    for (const commitment of p.destinationCommitments) {
      const card = destinationById(commitment.cardId);
      if (!card) continue;
      const assigned = p.lines[commitment.lineIndex];
      const lineName = assigned ? contractOf(assigned)?.name : undefined;
      const met = destinationMet(p, commitment);
      items.push({
        label: `${card.name}${lineName ? ` · ${lineName}` : ""}`,
        points: met ? card.vp : 0,
        met,
      });
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
    oddPriorityId: order[0] ?? "",
    priorityOverrides: {},
    procurement: { deck: [], yard: [], offerIndex: 0, cleanup: false },
    market: { engineeringIndex: 0, schedulingIndex: 0, constructionIndex: 0 },
    engineeringStep: "DESTINATION_DRAFT",
    destinationDeck: [],
    destinationRow: [],
    schedulingStep: "PLANNING",
    surveyPins: [],
    currentPeriod: 1,
    resolveQueue: [],
    events: [],
    nextEventSeq: 1,
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
function forceSale(s: SubwayState, entry: YardEntry, now: number): SubwayState {
  const eligible = seats(s).filter(canHoldMore);
  if (!eligible.length) return s; // unreachable: two caps of three cover six contracts
  const buyer = [...eligible].sort((a, b) => b.money - a.money)[0];
  // Distressed price: a forced buyer never pays more than it holds.
  const price = Math.min(entry.price, buyer.money);
  buyer.money -= price;
  buyer.lines.push({ contractId: entry.contractId, paid: price, route: [] });
  pushEvent(
    s,
    now,
    "CARD",
    "notice",
    `${buyer.name} is assigned the ${contractById(entry.contractId)!.name} for $${price}M.`,
    buyer.id
  );
  return s;
}

/** Reveals the next contract, or ends procurement when every one is owned. */
function nextOffer(s: SubwayState, now: number): SubwayState {
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
    s.engineeringStep = "DESTINATION_DRAFT";
    s.destinationRow = s.destinationDeck.splice(0, SUBWAY_CONFIG.destinationRow);
    const first = destinationTurnId(s);
    if (!first) s.engineeringStep = "PLAN";
    pushEvent(
      s,
      now,
      "PHASE",
      "banner",
      first
        ? `Every contract is signed. ${s.players[first].name} drafts the first Destination.`
        : "Every contract is signed. Lock your Engineering plan."
    );
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

/** Closes Engineering once every purchased Survey Pin is on the board. */
function toScheduling(s: SubwayState, now: number): SubwayState {
  s.phase = "SCHEDULING";
  s.schedulingStep = "PLANNING";
  for (const p of seats(s)) autoSchedule(p);
  pushEvent(
    s,
    now,
    "PHASE",
    "banner",
    "Scheduling opens. Plan your whole construction programme, then submit it."
  );
  return s;
}

// ----------------------------------------------------------------------------
// Construction flow
// ----------------------------------------------------------------------------

function toScoring(s: SubwayState, now: number): SubwayState {
  s.phase = "SCORING";
  s.resolveQueue = [];
  for (const p of seats(s)) p.pendingActions = [];
  pushEvent(s, now, "PHASE", "banner", "Construction is over. Reveal Engineering and score.");
  return s;
}

/** Which line indexes this company is scheduled to build in a period. */
export function scheduledLines(p: SubwayPlayer, period: number): number[] {
  return p.lines
    .map((_, i) => i)
    .filter((i) => blockPeriods(p.lines[i]).includes(period) && !lineComplete(p.lines[i]));
}

/** Opens the next period that anyone is scheduled to build in. */
function beginConstructionPeriod(s: SubwayState, now: number, opening = false): SubwayState {
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
      pushEvent(
        s,
        now,
        "PERIOD",
        "banner",
        `${opening ? "Construction begins. " : ""}Period ${s.currentPeriod}: ${s.players[s.resolveQueue[0]].name} builds.`
      );
      return s;
    }
    s.currentPeriod++;
  }
  return toScoring(s, now);
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

function reducer(state: SubwayState, action: SubwayAction, ctx: GameContext): SubwayState {
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
      if (ctx.room.players.length < 2) return state;
      // Rebuild seats from the live room so lazily-initialized state can never
      // strand a player outside the game. First two joiners become companies.
      const fresh = initialState(ctx.room.players);
      fresh.phase = "PROCUREMENT";
      fresh.oddPriorityId = fresh.playerOrder[Math.floor(ctx.random() * fresh.playerOrder.length)];
      fresh.procurement.deck = shuffle(
        LINE_CONTRACTS.map((c) => c.id),
        ctx.random
      );
      // Shuffled now, dealt when Engineering opens: this is the only point in
      // the flow with a random source, and the reducer must stay pure.
      fresh.destinationDeck = shuffle(
        DESTINATION_CARDS.map((c) => c.id),
        ctx.random
      );
      pushEvent(fresh, ctx.now(), "PHASE", "banner", "Subway begins — six Line Contracts go to market.");
      return nextOffer(fresh, ctx.now());
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
        pushEvent(s, ctx.now(), "CARD", "notice", `${me.name} signed the ${contract.name} for $${price}M.`, me.id);
        return nextOffer(s, ctx.now());
      }

      if (action.payload?.choice !== "pass") return state;
      // Nobody else can ever own this one, so passing is not an option.
      if (mustBuyOffer(s, me.id)) return state;

      if (offer.stage === "first") {
        // First refusal is paid for with a free face-up card.
        const deck = action.payload?.deck;
        if (deck === "engineering") {
          me.engineeringHand.push(marketEngineeringId(s.market));
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
        // The drafted family is public; which card it was stays off the wire —
        // the face-up slot is visible to anyone watching the market anyway.
        pushEvent(
          s,
          ctx.now(),
          "CARD",
          "notice",
          `${me.name} passed on the ${contract.name} and drafted a card from the ${deck} deck.`,
          me.id
        );
        s.message = `${me.name} passed and drafted a card. ${s.players[opponent].name} may take the ${contract.name}.`;
        return s;
      }

      // Second pass: no card, and the contract is discounted into the yard.
      me.decisionsUsed++;
      const nextPrice = Math.max(SUBWAY_CONFIG.minContractPrice, offer.price - SUBWAY_CONFIG.discountStep);
      if (offer.fromYard && nextPrice === offer.price) {
        // Already at the floor and declined again — assign it so the phase ends.
        const assigned = forceSale(s, { contractId: offer.contractId, price: nextPrice }, ctx.now());
        return nextOffer(assigned, ctx.now());
      }
      s.procurement.yard.push({ contractId: offer.contractId, price: nextPrice });
      pushEvent(
        s,
        ctx.now(),
        "CARD",
        "notice",
        `Both companies passed. ${contract.name} moves to the Discount Yard at $${nextPrice}M.`,
        me.id
      );
      return nextOffer(s, ctx.now());
    }

    case "PICK_DESTINATION": {
      if (state.phase !== "ENGINEERING" || state.engineeringStep !== "DESTINATION_DRAFT") return state;
      if (!me || destinationTurnId(state) !== me.id) return state;
      const cardId = action.payload?.destinationCardId;
      if (!cardId || !s.destinationRow.includes(cardId)) return state;

      s.destinationRow = removeOne(s.destinationRow, cardId);
      me.destinationHand.push(cardId);
      while (s.destinationRow.length < SUBWAY_CONFIG.destinationRow && s.destinationDeck.length) {
        s.destinationRow.push(s.destinationDeck.shift()!);
      }
      // The pick is public; which station it names is the drafter's secret, so
      // neither the event nor the shared message may carry the card identity.
      pushEvent(
        s,
        ctx.now(),
        "CARD",
        "notice",
        `${me.name} drafted a Destination card (${destinationsHeld(me)} of ${SUBWAY_CONFIG.destinationsPerPlayer}).`,
        me.id
      );

      const next = destinationTurnId(s);
      if (!next) {
        s.engineeringStep = "PLAN";
        pushEvent(s, ctx.now(), "PHASE", "banner", "Destinations are drafted. Lock your Engineering plan.");
      }
      return s;
    }

    case "LOCK_ENGINEERING_PLAN": {
      if (state.phase !== "ENGINEERING" || state.engineeringStep !== "PLAN") return state;
      if (!me || me.engineeringLocked) return state;

      // Exactly three distinct normal Engineering cards from hand.
      const ids = action.payload?.cardIds ?? [];
      if (ids.length !== 3 || new Set(ids).size !== 3) return state;
      if (ids.some(isDestinationCard)) return state;
      let hand = [...me.engineeringHand];
      for (const id of ids) {
        if (!engineeringById(id) || !hand.includes(id)) return state;
        hand = removeOne(hand, id);
      }

      // Zero or more Destination cards, each bound to an owned line.
      const assignments = action.payload?.destinations ?? [];
      if (!Array.isArray(assignments)) return state;
      // Every drafted Destination is assigned; there is no holding one back.
      if (assignments.length !== me.destinationHand.length) return state;
      if (destinationProblems(me, assignments).length) return state;

      // Zero to five Survey Pins at $1M each, paid for exactly once.
      const surveys = action.payload?.surveys ?? 0;
      if (!Number.isInteger(surveys) || surveys < 0 || surveys > SUBWAY_CONFIG.survey.max) return state;
      const surveyCost = surveys * SUBWAY_CONFIG.survey.cost;
      if (surveyCost > me.money) return state;

      me.engineeringHand = hand;
      me.committedEngineering = [...ids];
      let destHand = [...me.destinationHand];
      me.destinationCommitments = assignments.map((a) => {
        destHand = removeOne(destHand, a.cardId);
        return { cardId: a.cardId, stationId: destinationById(a.cardId)!.stationId, lineIndex: a.lineIndex };
      });
      me.destinationHand = destHand;
      me.surveysPurchased = surveys;
      me.money -= surveyCost;
      me.engineeringLocked = true;
      // Pin count is public (they are placed publicly next step); the three
      // objectives and Destination assignments stay unnamed.
      pushEvent(
        s,
        ctx.now(),
        "PLAN",
        "notice",
        `${me.name} locked their Engineering plan${surveys ? ` and bought ${surveys} Survey Pin${surveys === 1 ? "" : "s"}` : ""}.`,
        me.id
      );

      if (seats(s).every((p) => p.engineeringLocked)) {
        s.engineeringStep = "SURVEY";
        const first = surveyTurnId(s);
        if (!first) return toScheduling(s, ctx.now());
        pushEvent(
          s,
          ctx.now(),
          "PHASE",
          "banner",
          `Engineering is locked. ${s.players[first].name} places the first Survey Pin.`
        );
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

    case "SET_SCHEDULE": {
      if (state.phase !== "SCHEDULING" || s.schedulingStep !== "PLANNING" || !me) return state;
      if (me.scheduleSubmitted) return state;
      const lineIndex = action.payload?.lineIndex ?? -1;
      const line = me.lines[lineIndex];
      if (!line) return state;
      // Null and undefined both mean "shelved", so normalise before comparing.
      const start = action.payload?.start;
      const requested = start === null ? undefined : start;
      // Re-selecting what is already selected changes nothing. It has to return
      // the original state rather than the cleared clone, or it would silently
      // consume an outstanding Undo window (OD-15, R-26).
      if (requested === line.start) return state;
      if (requested === undefined) {
        line.start = undefined; // shelved: it will score its incomplete penalty
      } else {
        if (!blockFits(line, requested)) return state;
        line.start = requested;
      }
      return s;
    }

    case "SUBMIT_SCHEDULE": {
      if (state.phase !== "SCHEDULING" || s.schedulingStep !== "PLANNING" || !me) return state;
      if (me.scheduleSubmitted || scheduleProblems(me).length) return state;
      me.scheduleSubmitted = true;
      // The fact of submission is public; the blocks stay hidden until reveal.
      pushEvent(s, ctx.now(), "PLAN", "notice", `${me.name} submitted their schedule.`, me.id);
      if (seats(s).every((p) => p.scheduleSubmitted)) {
        s.schedulingStep = "RESOLUTION";
        pushEvent(
          s,
          ctx.now(),
          "PHASE",
          "banner",
          "Both schedules are revealed. Play up to one Scheduling card, then confirm."
        );
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
        pushEvent(
          s,
          ctx.now(),
          "CARD",
          "notice",
          `${me.name} played Priority Permit — they build first in period ${period}.`,
          me.id
        );
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
        // Schedules are already revealed in RESOLUTION, so the block is public.
        pushEvent(
          s,
          ctx.now(),
          "CARD",
          "notice",
          `${me.name} played ${schedulingById(id)!.name} — the ${contractOf(line)!.name} block moved ${shift < 0 ? "earlier" : "later"}.`,
          me.id
        );
      }

      me.schedulingHand = removeOne(me.schedulingHand, id);
      me.schedulingCardPlayed = id;
      return s;
    }

    case "CONFIRM_SCHEDULE": {
      if (state.phase !== "SCHEDULING" || s.schedulingStep !== "RESOLUTION" || !me) return state;
      if (me.scheduleConfirmed || scheduleProblems(me).length) return state;
      me.scheduleConfirmed = true;
      pushEvent(s, ctx.now(), "PLAN", "notice", `${me.name} locked their schedule.`, me.id);
      if (seats(s).every((p) => p.scheduleConfirmed)) {
        for (const p of seats(s)) {
          const cost = scheduleCost(p);
          p.money -= cost;
          p.schedulePaid = cost;
        }
        s.phase = "STARTER_PLACEMENT";
        pushEvent(
          s,
          ctx.now(),
          "PHASE",
          "banner",
          "Schedules are locked. Place one free starter peg per scheduled contract — border holes only."
        );
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

    case "PLAY_CONSTRUCTION_CARD": {
      if (state.phase !== "CONSTRUCTION" || !me) return state;
      if (me.constructionCardThisPeriod || me.actedThisPeriod) return state;
      if (!s.resolveQueue.includes(me.id)) return state;
      const id = action.payload?.cardId as ConstructionCardId;
      if (!me.constructionHand.includes(id)) return state;

      if (id === "expedite") {
        if (s.resolveQueue[0] === me.id) return state;
        s.resolveQueue = [me.id, ...s.resolveQueue.filter((pid) => pid !== me.id)];
        pushEvent(
          s,
          ctx.now(),
          "CARD",
          "notice",
          `${me.name} played Expedite Materials and builds first this period.`,
          me.id
        );
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
        pushEvent(
          s,
          ctx.now(),
          "CARD",
          "notice",
          `${me.name} played ${constructionById(id)!.name} on the ${contractOf(line)!.name}.`,
          me.id
        );
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
      const slot = action.payload?.slot;
      if (validateNode(s, me.id, lineIndex, pt, false, slot)) return state;

      const from = line.route[line.route.length - 1];

      // Price the opposing network before the route changes under us. Own
      // contacts are free; each distinct opposing contact is $1M to its owner,
      // and Construction is the one phase allowed to go into debt (DEC-018).
      const contacts = routeContacts(s, me.id, from, pt);
      const toll = contactToll(contacts);
      const opponentId = s.playerOrder.find((id) => id !== me.id);
      if (toll > 0 && opponentId) {
        me.money -= toll;
        me.tollsPaid += toll;
        s.players[opponentId].money += toll;
      }
      me.properCrossings += properCrossingCount(contacts);

      const station = stationAt(pt);
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
        ? ` ${contacts.length} contact${contacts.length === 1 ? "" : "s"} with ${s.players[opponentId!].name}: $${toll}M.`
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
      const next = me.pendingActions.length ? s : endPlayerTurn(s, me.id, ctx.now());
      next.undo = record; // survives a period or phase advance until someone else acts
      return next;
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
  if (!waiting.length) return undefined;
  if (waiting.length === 1) return waiting[0].id;
  const placed = (p: SubwayPlayer) => starterLines(p).length - pendingStarters(p).length;
  const [a, b] = waiting;
  if (placed(a) !== placed(b)) return placed(a) < placed(b) ? a.id : b.id;
  return s.oddPriorityId === b.id ? b.id : a.id;
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
// - Company Cards: asymmetric starting money / hands / abilities.
// - Multiple project cycles per company.
// - Server-controlled bot as an optional third company.
// - Additional maps.
