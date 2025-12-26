import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GamePhase, GameContext, Player } from "@/engine/types";
import type { MultiplayerLogEntry } from "./actionLog";
import {
  resetLogIdCounter,
  logBeginTurn,
  logDrawCard,
  logPlayCard,
  logBuildRocket,
  logLaunchRocket,
  logUseReroll,
  logDeclineReroll,
  logEndTurn,
  logRoundEnd,
  logGameOver,
} from "./actionLog";

/**
 * COMET RUSH - A cooperative/competitive rocket-building game
 *
 * Players collect resources, draw and play research cards, build customizable rockets,
 * and launch them at a comet before it reaches Earth.
 */

// ============================================================================
// PHASES
// ============================================================================

export type CometRushPhase = "lobby" | "playing" | "gameOver";

// ============================================================================
// CORE TYPES
// ============================================================================

// Card deck types - 3 separate draw piles
export type CardDeckType = "engineering" | "espionage" | "economic";

// Card rarity (visual only, no mechanical effect)
export type CardRarity = "common" | "uncommon" | "rare";

// Engineering card types (44 cards total)
export type EngineeringCardType =
  | "MASS_PRODUCTION"         // −1 build time for all rockets (Rare, 4 cards)
  | "FLIGHT_ADJUSTMENT"       // If next launch fails, re-roll once (Rare, 4 cards)
  | "WARHEAD_UPGRADE"         // +1 max power cap up to 8 (Uncommon, 6 cards)
  | "GUIDANCE_SYSTEM_UPGRADE" // +1 max accuracy cap up to 5 (Uncommon, 6 cards)
  | "STREAMLINED_ASSEMBLY"    // −1 build time for one rocket (Common, 8 cards)
  | "COMET_ANALYSIS"          // Peek at strength or movement card (Common, 8 cards)
  | "ROCKET_CALIBRATION";     // Play before launch: +1 accuracy or +1 power (Common, 8 cards)

// Espionage card types (44 cards total)
export type EspionageCardType =
  | "COVERT_ROCKET_STRIKE"    // Destroy any rocket (building or ready) of another player (Rare, 4 cards)
  | "EMBARGO"                 // Target gains no income next turn (Rare, 4 cards)
  | "ESPIONAGE_AGENT"         // Steal a random card from target player (Uncommon, 6 cards)
  | "DIPLOMATIC_PRESSURE"     // Block any card a target player attempts to play (Uncommon, 6 cards)
  | "RESOURCE_SEIZURE"        // Steal 3 resources from target player (Common, 8 cards)
  | "SABOTAGE_CONSTRUCTION"   // Force target player to re-roll a launch (Common, 8 cards)
  | "REGULATORY_REVIEW";      // +1 build time to opponent's rocket (Common, 8 cards)

// Economic card types (44 cards total)
export type EconomicCardType =
  | "INTERNATIONAL_GRANT"     // You gain 5, all others gain 2 (Rare, 4 cards)
  | "FUNDING_PRESSURE"        // Gain resources based on comet distance 4/8/12 (Rare, 4 cards)
  | "INCREASE_INCOME"         // +1 income permanently, max 3 (Uncommon, 6 cards)
  | "ROCKET_SALVAGE"          // +1 resource per launch, max 3 (Uncommon, 6 cards)
  | "EMERGENCY_FUNDING"       // Gain income immediately (Common, 8 cards)
  | "PUBLIC_DONATION_DRIVE"   // Gain 2 resources per built rocket (Common, 8 cards)
  | "PROGRAM_PRESTIGE";       // Permanent: +1 resource per card played, max 3 (Common, 8 cards)

export type RocketStatus = "building" | "ready" | "launched" | "spent";

export interface MovementCard {
  id: string;
  moveSpaces: 1 | 2 | 3;
}

export interface StrengthCard {
  id: string;
  baseStrength: number;
  currentStrength: number;
}

// Base card interface
export interface BaseCard {
  id: string;
  deck: CardDeckType;
  name: string;
  description: string;
  rarity: CardRarity;
}

// Engineering card
export interface EngineeringCard extends BaseCard {
  deck: "engineering";
  cardType: EngineeringCardType;
}

// Espionage card
export interface EspionageCard extends BaseCard {
  deck: "espionage";
  cardType: EspionageCardType;
}

// Economic card
export interface EconomicCard extends BaseCard {
  deck: "economic";
  cardType: EconomicCardType;
}

// Union type for any card in hand
export type GameCard = EngineeringCard | EspionageCard | EconomicCard;

// Legacy alias for backwards compatibility during migration
export type ResearchCard = GameCard;

// ============================================================================
// PLAYER STATE
// ============================================================================

export interface Rocket {
  id: string;
  buildTimeBase: number; // Build Time Cost (1-3): affects both cube cost and build delay
  buildTimeRemaining: number; // Turns until ready (decrements each turn at BEGIN_TURN)
  power: number;
  accuracy: number; // 1-6, compared against 1d6 roll
  costCubes: number;
  status: RocketStatus;
}

export interface PlayerUpgrades {
  incomeBonus: number;        // From Increase Income cards (max 3)
  salvageBonus: number;       // From Rocket Salvage cards (max 3)
  cardPlayBonus: number;      // From Program Prestige cards (max 3) - +1 resource per card played
  powerBonus: number;         // Legacy field, kept for compatibility
  accuracyBonus: number;      // Legacy field, kept for compatibility
  buildTimeBonus: number;     // Legacy field, kept for compatibility
  maxRocketsBonus: number;    // Legacy field, kept for compatibility
  // Hard caps for sliders (raised by Warhead Upgrade / Guidance System Upgrade cards)
  powerCap: number;           // Default 3, max 8
  accuracyCap: number;        // Default 3, max 5
  buildTimeCap: number;       // Legacy field, kept at 3
}

// Launch calibration bonuses (from Rocket Calibration cards)
export interface LaunchCalibration {
  accuracyBonus: number;
  powerBonus: number;
}

export interface CometRushPlayerState {
  id: string;
  name: string;
  resourceCubes: number;
  baseIncome: number;
  maxConcurrentRockets: number;
  rockets: Rocket[];
  hand: GameCard[];           // Contains Engineering, Espionage, and Economic cards
  upgrades: PlayerUpgrades;
  trophies: StrengthCard[];
  // Initial setup: players draw 4 cards from any deck at start
  initialCardsDrawn: number;  // 0-4, when < 4 player is still drafting
  // Turn-based flags (reset each turn)
  hasBuiltRocketThisTurn: boolean;
  hasLaunchedRocketThisTurn: boolean;
  // For peek cards - private info revealed to player
  peekedMovementCard: MovementCard | null;
  peekedStrengthCard: StrengthCard | null;
  // Flight Adjustment: player can re-roll if launch fails (consumed on use)
  hasRerollToken: boolean;
  // Embargo: if true, player gains no income this turn (reset after BEGIN_TURN)
  isEmbargoed: boolean;
  // Sabotage Construction: if set, this player must re-roll their next launch
  mustRerollNextLaunch: boolean;
  // Diplomatic Pressure: if set, this player's next card play will be blocked
  isUnderDiplomaticPressure: boolean;
  // Launch calibration bonuses (accumulated from Rocket Calibration cards, applied to next launch)
  pendingCalibration: LaunchCalibration;
}

// ============================================================================
// GAME STATE
// ============================================================================

export interface LaunchResult {
  playerId: string;
  rocketId: string;
  diceRoll: number;
  accuracyNeeded: number;
  hit: boolean;
  power: number;
  strengthBefore: number;
  strengthAfter: number;
  destroyed: boolean;
  baseStrength: number; // Original strength value (for scoring display)
  canReroll: boolean; // True if player missed AND has reroll token available
  isReroll: boolean; // True if this result is from using a reroll
  mustReroll: boolean; // True if player was sabotaged and must reroll (forced)
}

// Pending launch - waiting for player to click "Roll Dice"
export interface PendingLaunch {
  playerId: string;
  rocketId: string;
  rocketIndex: number;
  calibratedAccuracy: number;
  calibratedPower: number;
  mustReroll: boolean; // Was the player sabotaged?
  hasRerollToken: boolean; // Can they use a reroll token if they miss?
  salvageBonus: number; // Salvage bonus to apply after launch
}

export interface TurnMeta {
  playerId: string;
  incomeGained: number;
  newTotalCubes: number;
  lastDrawnCardId: string | null;
  lastDrawnDeck: CardDeckType | null;  // Which deck the card was drawn from
  wasEmbargoed: boolean;  // True if income was blocked due to embargo
  cardsDrawnThisTurn: number;  // Count of cards drawn this turn (max 1 normally, 2 when comet ≤9 from Earth)
}

export interface CardResult {
  id: string;
  playerId: string;
  description: string;
  cardName: string;
}

// Pending card play awaiting response (for Diplomatic Pressure reactive system)
export interface PendingCardPlay {
  playerId: string;           // Who is playing the card
  card: GameCard;             // The card being played
  payload: PlayCardPayload;   // Original payload
  respondingPlayerIds: string[]; // Players who can still respond (have Diplomatic Pressure)
  respondedPlayerIds: string[];  // Players who have passed or don't have the card
  blockedByPlayerId: string | null; // If blocked, who blocked it
  expiresAt: number;          // Timeout timestamp
}

// Pending Diplomatic Pressure attack awaiting counter response
export interface PendingDiplomaticPressure {
  attackerId: string;         // Who played Diplomatic Pressure
  attackerName: string;       // Attacker's display name
  targetId: string;           // Who is being targeted
  counterCardId: string;      // The target's Diplomatic Pressure card they can use to counter
}

export interface CometRushState {
  phase: CometRushPhase;
  round: number;

  // Turn order and active player
  playerOrder: string[];
  activePlayerIndex: number;

  // Comet and decks
  distanceToImpact: number;
  lastMovementCard: MovementCard | null;

  movementDeck: MovementCard[];
  movementDiscard: MovementCard[];

  strengthDeck: StrengthCard[];
  activeStrengthCard: StrengthCard | null;

  // Engineering deck (player progression)
  engineeringDeck: EngineeringCard[];
  engineeringDiscard: EngineeringCard[];

  // Espionage deck (interference & disruption)
  espionageDeck: EspionageCard[];
  espionageDiscard: EspionageCard[];

  // Economic deck (resources & funding)
  economicDeck: EconomicCard[];
  economicDiscard: EconomicCard[];

  // Per player state
  players: Record<string, CometRushPlayerState>;

  // Last launch result for display
  lastLaunchResult: LaunchResult | null;

  // Pending launch - waiting for dice roll
  pendingLaunch: PendingLaunch | null;

  // Turn-start wizard meta (for UI)
  turnMeta: TurnMeta | null;

  // Last card play result for popup feedback
  lastCardResult: CardResult | null;

  // Player who destroyed the final strength card (bonus points)
  finalDestroyerId: string | null;

  // Total strength cards in play (scales with player count)
  totalStrengthCards: number;

  // Endgame / scoring
  winnerIds: string[];

  // Game outcome
  earthDestroyed: boolean;
  cometDestroyed: boolean;

  // Reactive card system - pending card play awaiting responses
  pendingCardPlay: PendingCardPlay | null;

  // Pending Diplomatic Pressure attack awaiting counter
  pendingDiplomaticPressure: PendingDiplomaticPressure | null;

  // Action logging for multiplayer
  actionLog: MultiplayerLogEntry[];
  gameStartTime: number;
}

// ============================================================================
// ACTIONS
// ============================================================================

export type CometRushActionType =
  | "START_GAME"
  | "BEGIN_TURN"
  | "DRAW_CARD"           // Draw from chosen deck (Engineering, Espionage, or Economic)
  | "PLAY_CARD"           // Play a single card from hand
  | "TRADE_CARDS"         // Discard 2 cards to draw 1 new card (free action)
  | "RESPOND_TO_CARD"     // Respond to pending card play (block with Diplomatic Pressure or pass)
  | "RESPOND_TO_DIPLOMATIC_PRESSURE"  // Counter or accept Diplomatic Pressure attack
  | "BUILD_ROCKET"
  | "APPLY_CALIBRATION"   // Apply Rocket Calibration before launch
  | "LAUNCH_ROCKET"       // Initiates launch - sets up pendingLaunch (no dice roll yet)
  | "CONFIRM_ROLL"        // Player clicked Roll Dice - actually rolls and calculates result
  | "USE_REROLL"          // Use re-roll token after a failed launch
  | "DECLINE_REROLL"      // Decline to use re-roll token, accept miss
  | "FORCED_REROLL"       // Forced reroll due to sabotage
  | "END_TURN"
  | "CLEAR_CARD_RESULT"   // Dismiss card result popup
  | "PLAY_AGAIN";

// Draw card payload - player chooses which deck
export interface DrawCardPayload {
  deck: CardDeckType;
}

// Play card payload
export interface PlayCardPayload {
  cardId: string;
  targetPlayerId?: string;
  targetRocketId?: string;
  peekChoice?: "strength" | "movement";  // For Comet Analysis card
  calibrationChoice?: "accuracy" | "power";  // For Rocket Calibration card
}

// Response to pending card play
export interface RespondToCardPayload {
  block: boolean;  // true = use Diplomatic Pressure to block, false = pass
}

// Response to Diplomatic Pressure attack
export interface RespondToDiplomaticPressurePayload {
  counter: boolean;  // true = use own Diplomatic Pressure to counter, false = accept the attack
}

// Trade cards payload - discard 2 cards to draw 1
export interface TradeCardsPayload {
  discardCardIds: [string, string];  // Exactly 2 card IDs to discard
  drawFromDeck: CardDeckType;        // Which deck to draw the new card from
}

export interface BuildRocketPayload {
  buildTimeBase: number;
  power: number;
  accuracy: number;
}

// Apply calibration before launch
export interface ApplyCalibrationPayload {
  cardId: string;
  choice: "accuracy" | "power";
}

export interface LaunchRocketPayload {
  rocketId: string;
}

export interface CometRushAction extends BaseAction {
  type: CometRushActionType;
  payload?: DrawCardPayload | PlayCardPayload | TradeCardsPayload | RespondToCardPayload | RespondToDiplomaticPressurePayload | BuildRocketPayload | ApplyCalibrationPayload | LaunchRocketPayload | Record<string, never>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STARTING_CUBES = 20;
const BASE_INCOME = 5;
const BASE_DISTANCE_TO_IMPACT = 18;
const BASE_MAX_ROCKETS = 3;

// Strength card scaling by player count:
// - 2 players: 6 strength cards
// - 3 players: 7 strength cards
// - 4 players: 8 strength cards
function getStrengthCardCount(playerCount: number): number {
  if (playerCount <= 2) return 6;
  if (playerCount >= 4) return 8;
  return 7; // 3 players
}

// ============================================================================
// DECK CREATION HELPERS
// ============================================================================

function createMovementDeck(): MovementCard[] {
  const cards: MovementCard[] = [];
  let idCounter = 1;
  const add = (moveSpaces: 1 | 2 | 3, count: number) => {
    for (let i = 0; i < count; i++) {
      cards.push({ id: `M${idCounter++}`, moveSpaces });
    }
  };
  add(1, 4);
  add(2, 4);
  add(3, 4);
  return cards;
}

function createStrengthDeck(count: number): StrengthCard[] {
  const cards: StrengthCard[] = [];
  let idCounter = 1;
  // Create strength cards with values starting from 4
  // For 4 cards: values 4-7, for 5 cards: values 4-8, for 6 cards: values 4-9
  for (let i = 0; i < count; i++) {
    const strength = 4 + i;
    cards.push({
      id: `S${idCounter++}`,
      baseStrength: strength,
      currentStrength: strength,
    });
  }
  return cards;
}

// Engineering Deck: 44 cards total
// Theme: Rocket engineering, optimization, and reliability
function createEngineeringDeck(): EngineeringCard[] {
  const cards: EngineeringCard[] = [];
  let idCounter = 1;

  const add = (
    cardType: EngineeringCardType,
    count: number,
    name: string,
    description: string,
    rarity: CardRarity
  ) => {
    for (let i = 0; i < count; i++) {
      cards.push({
        id: `E${idCounter++}`,
        deck: "engineering",
        cardType,
        name,
        description,
        rarity,
      });
    }
  };

  // Rare cards (4 each)
  add("MASS_PRODUCTION", 4, "Mass Production", "−1 build time for all rockets", "rare");
  add("FLIGHT_ADJUSTMENT", 4, "Flight Adjustment", "If next launch fails, re-roll once", "rare");

  // Uncommon cards (6 each)
  add("WARHEAD_UPGRADE", 6, "Warhead Upgrade", "+1 max power (up to 8)", "uncommon");
  add("GUIDANCE_SYSTEM_UPGRADE", 6, "Guidance System Upgrade", "+1 max accuracy (up to 5)", "uncommon");

  // Common cards (8 each)
  add("STREAMLINED_ASSEMBLY", 8, "Streamlined Assembly", "−1 build time for one rocket", "common");
  add("COMET_ANALYSIS", 8, "Comet Analysis", "Peek at a strength or movement card", "common");
  add("ROCKET_CALIBRATION", 8, "Rocket Calibration", "Play before launch: +1 Accuracy or +1 Power", "common");

  return cards;
}

// Espionage Deck: 44 cards total
// Theme: Interference, sabotage, and intelligence
function createEspionageDeck(): EspionageCard[] {
  const cards: EspionageCard[] = [];
  let idCounter = 1;

  const add = (
    cardType: EspionageCardType,
    count: number,
    name: string,
    description: string,
    rarity: CardRarity
  ) => {
    for (let i = 0; i < count; i++) {
      cards.push({
        id: `S${idCounter++}`,
        deck: "espionage",
        cardType,
        name,
        description,
        rarity,
      });
    }
  };

  // Rare cards (4 each)
  add("COVERT_ROCKET_STRIKE", 4, "Covert Rocket Strike", "Destroy any rocket (building or ready) of another player", "rare");
  add("EMBARGO", 4, "Embargo", "Target player gains no income next turn", "rare");

  // Uncommon cards (6 each)
  add("ESPIONAGE_AGENT", 6, "Espionage Agent", "Steal a random card from target player", "uncommon");
  add("DIPLOMATIC_PRESSURE", 6, "Diplomatic Pressure", "Block any card a target player attempts to play", "uncommon");

  // Common cards (8 each)
  add("RESOURCE_SEIZURE", 8, "Resource Seizure", "Steal 3 resources from target player", "common");
  add("SABOTAGE_CONSTRUCTION", 8, "Sabotage Construction", "Force target player to re-roll a launch", "common");
  add("REGULATORY_REVIEW", 8, "Regulatory Review", "+1 build time to opponent's rocket", "common");

  return cards;
}

// Economic Deck: 44 cards total
// Theme: Resources, funding, and financial advantage
function createEconomicDeck(): EconomicCard[] {
  const cards: EconomicCard[] = [];
  let idCounter = 1;

  const add = (
    cardType: EconomicCardType,
    count: number,
    name: string,
    description: string,
    rarity: CardRarity
  ) => {
    for (let i = 0; i < count; i++) {
      cards.push({
        id: `C${idCounter++}`,
        deck: "economic",
        cardType,
        name,
        description,
        rarity,
      });
    }
  };

  // Rare cards (4 each)
  add("INTERNATIONAL_GRANT", 4, "International Grant", "You gain 5 resources, all others gain 2", "rare");
  add("FUNDING_PRESSURE", 4, "Funding Pressure", "Gain resources based on comet distance (4/8/12)", "rare");

  // Uncommon cards (6 each)
  add("INCREASE_INCOME", 6, "Increase Income", "+1 income permanently (max 3)", "uncommon");
  add("ROCKET_SALVAGE", 6, "Rocket Salvage", "+1 resource per launch (max 3)", "uncommon");

  // Common cards (8 each)
  add("EMERGENCY_FUNDING", 8, "Emergency Funding", "Gain your income immediately", "common");
  add("PUBLIC_DONATION_DRIVE", 8, "Public Donation Drive", "Gain 2 resources per built rocket", "common");
  add("PROGRAM_PRESTIGE", 8, "Program Prestige", "+1 resource per card played (max 3)", "common");

  return cards;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function shuffle<T>(array: T[], random: () => number): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function calculateRocketCost(buildTimeCost: number, power: number, accuracy: number): number {
  // Rules: Power costs 1 cube/level, Accuracy costs 1 cube/level
  // Build Time Cost determines delay and cube cost:
  // - BTC 1 = 1 cube + 2 turns delay (slow but cheap)
  // - BTC 2 = 2 cubes + 1 turn delay (balanced)
  // - BTC 3 = 5 cubes + instant (fast but expensive)
  const buildTimeCubeCost = buildTimeCost === 3 ? 5 : buildTimeCost === 2 ? 2 : 1;
  return power + accuracy + buildTimeCubeCost;
}

function roll1d6(random: () => number): number {
  return Math.floor(random() * 6) + 1;
}

function getActivePlayerId(state: CometRushState): string | null {
  return state.playerOrder[state.activePlayerIndex] ?? null;
}

function calculateScores(state: CometRushState): Record<string, number> {
  const scores: Record<string, number> = {};

  for (const playerId of state.playerOrder) {
    const player = state.players[playerId];
    if (!player) continue;

    // Sum of baseStrength values of all trophies
    let score = player.trophies.reduce((sum, card) => sum + card.baseStrength, 0);

    // +5 bonus for destroying the final strength card
    if (state.finalDestroyerId === playerId) {
      score += 5;
    }

    scores[playerId] = score;
  }

  return scores;
}

function determineWinners(state: CometRushState): string[] {
  const scores = calculateScores(state);
  let maxScore = -1;
  let winners: string[] = [];

  for (const [playerId, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      winners = [playerId];
    } else if (score === maxScore) {
      winners.push(playerId);
    }
  }

  return winners;
}

// ============================================================================
// PLAYER STATE BUILDER
// ============================================================================

function buildPlayerState(p: Player): CometRushPlayerState {
  return {
    id: p.id,
    name: p.name ?? "Player",
    resourceCubes: STARTING_CUBES,
    baseIncome: BASE_INCOME,
    maxConcurrentRockets: BASE_MAX_ROCKETS,
    rockets: [],
    hand: [],
    upgrades: {
      incomeBonus: 0,
      salvageBonus: 0,
      cardPlayBonus: 0,
      powerBonus: 0,
      accuracyBonus: 0,
      buildTimeBonus: 0,
      maxRocketsBonus: 0,
      powerCap: 3,
      accuracyCap: 3,
      buildTimeCap: 3,
    },
    trophies: [],
    hasBuiltRocketThisTurn: false,
    hasLaunchedRocketThisTurn: false,
    peekedMovementCard: null,
    peekedStrengthCard: null,
    hasRerollToken: false,
    isEmbargoed: false,
    mustRerollNextLaunch: false,
    isUnderDiplomaticPressure: false,
    pendingCalibration: { accuracyBonus: 0, powerBonus: 0 },
    initialCardsDrawn: 0,
  };
}

// ============================================================================
// INITIAL STATE
// ============================================================================

function initialState(players: Player[]): CometRushState {
  const playerOrder = players.map((p) => p.id);
  const playersState: Record<string, CometRushPlayerState> = {};
  for (const p of players) {
    playersState[p.id] = buildPlayerState(p);
  }

  return {
    phase: "lobby",
    round: 0,
    playerOrder,
    activePlayerIndex: 0,
    distanceToImpact: BASE_DISTANCE_TO_IMPACT,
    lastMovementCard: null,
    movementDeck: [],
    movementDiscard: [],
    strengthDeck: [],
    activeStrengthCard: null,
    engineeringDeck: [],
    engineeringDiscard: [],
    espionageDeck: [],
    espionageDiscard: [],
    economicDeck: [],
    economicDiscard: [],
    players: playersState,
    lastLaunchResult: null,
    pendingLaunch: null,
    turnMeta: null,
    lastCardResult: null,
    finalDestroyerId: null,
    totalStrengthCards: 0, // Set during START_GAME based on player count
    winnerIds: [],
    earthDestroyed: false,
    cometDestroyed: false,
    pendingCardPlay: null,
    pendingDiplomaticPressure: null,
    actionLog: [],
    gameStartTime: 0,
  };
}

function getPhase(state: CometRushState): GamePhase {
  return state.phase;
}

// ============================================================================
// REDUCER
// ============================================================================

function reducer(
  state: CometRushState,
  action: CometRushAction,
  ctx: GameContext
): CometRushState {
  switch (action.type) {
    case "START_GAME": {
      const isHost = ctx.room.hostId === ctx.playerId;
      if (!isHost || state.phase !== "lobby") return state;

      // Reset log ID counter for new game
      resetLogIdCounter();

      // Calculate strength card count based on player count
      const playerCount = state.playerOrder.length;
      const strengthCardCount = getStrengthCardCount(playerCount);

      // Build and shuffle decks
      const movementDeck = shuffle(createMovementDeck(), ctx.random);
      const strengthDeck = shuffle(createStrengthDeck(strengthCardCount), ctx.random);
      const engineeringDeck = shuffle(createEngineeringDeck(), ctx.random);
      const espionageDeck = shuffle(createEspionageDeck(), ctx.random);
      const economicDeck = shuffle(createEconomicDeck(), ctx.random);

      // Players start with empty hands - they will draft 4 cards at the start of their first turn
      // (initialCardsDrawn is already 0 from buildPlayerState)

      // Initialize turnMeta for first player
      const firstPlayerId = state.playerOrder[0];

      return {
        ...state,
        phase: "playing",
        round: 1,
        movementDeck,
        strengthDeck,
        totalStrengthCards: strengthCardCount,
        engineeringDeck,
        engineeringDiscard: [],
        espionageDeck,
        espionageDiscard: [],
        economicDeck,
        economicDiscard: [],
        activeStrengthCard: null,
        lastMovementCard: null,
        lastLaunchResult: null,
        pendingCardPlay: null,
        turnMeta: {
          playerId: firstPlayerId,
          incomeGained: 0,
          newTotalCubes: state.players[firstPlayerId]?.resourceCubes ?? STARTING_CUBES,
          lastDrawnCardId: null,
          lastDrawnDeck: null,
          wasEmbargoed: false,
          cardsDrawnThisTurn: 0,
        },
        actionLog: [],
        gameStartTime: ctx.now(),
      };
    }

    case "BEGIN_TURN": {
      if (state.phase !== "playing") return state;

      const activePlayerId = getActivePlayerId(state);
      if (action.playerId !== activePlayerId) return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      // Calculate income (skip if embargoed)
      const wasEmbargoed = player.isEmbargoed;
      const income = wasEmbargoed ? 0 : (player.baseIncome + player.upgrades.incomeBonus);
      const newTotalCubes = player.resourceCubes + income;

      // Advance rocket build timers
      const updatedRockets = player.rockets.map(rocket => {
        if (rocket.status === "building" && rocket.buildTimeRemaining > 0) {
          const newRemaining = rocket.buildTimeRemaining - 1;
          return {
            ...rocket,
            buildTimeRemaining: newRemaining,
            status: newRemaining === 0 ? "ready" : "building" as RocketStatus,
          };
        }
        return rocket;
      });

      const updatedPlayer: CometRushPlayerState = {
        ...player,
        resourceCubes: newTotalCubes,
        rockets: updatedRockets,
        hasBuiltRocketThisTurn: false,
        hasLaunchedRocketThisTurn: false,
        peekedMovementCard: null,
        peekedStrengthCard: null,
        isEmbargoed: false, // Clear embargo after applying
      };

      const beginTurnState = {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: updatedPlayer,
        },
        turnMeta: {
          playerId: action.playerId,
          incomeGained: income,
          newTotalCubes,
          lastDrawnCardId: null,
          lastDrawnDeck: null,
          wasEmbargoed,
          cardsDrawnThisTurn: 0,
        },
      };

      // Add action log entry
      const beginTurnLogEntry = logBeginTurn(beginTurnState, action.playerId, income, wasEmbargoed);
      return {
        ...beginTurnState,
        actionLog: [...beginTurnState.actionLog, beginTurnLogEntry],
      };
    }

    case "DRAW_CARD": {
      if (state.phase !== "playing") return state;

      const activePlayerId = getActivePlayerId(state);
      if (action.playerId !== activePlayerId) return state;

      const payload = action.payload as DrawCardPayload | undefined;
      if (!payload || !payload.deck) return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      // Initial draft phase: players draw 4 cards at the start of the game
      const isInitialDraft = player.initialCardsDrawn < 4;

      // If not drafting, must have called BEGIN_TURN first
      if (!isInitialDraft) {
        if (!state.turnMeta || state.turnMeta.playerId !== action.playerId) return state;

        // Check if player can still draw cards this turn
        // Late game (comet ≤9 from Earth): can draw 2 cards per turn
        // Normal game: can draw 1 card per turn
        const maxDrawsAllowed = state.distanceToImpact <= 9 ? 2 : 1;
        if (state.turnMeta.cardsDrawnThisTurn >= maxDrawsAllowed) return state;
      }

      const deckType = payload.deck;
      let engineeringDeck = [...state.engineeringDeck];
      let engineeringDiscard = [...state.engineeringDiscard];
      let espionageDeck = [...state.espionageDeck];
      let espionageDiscard = [...state.espionageDiscard];
      let economicDeck = [...state.economicDeck];
      let economicDiscard = [...state.economicDiscard];
      let drawnCardId: string | null = null;
      let newHand = player.hand;

      if (deckType === "engineering") {
        // Reshuffle if empty
        if (engineeringDeck.length === 0 && engineeringDiscard.length > 0) {
          engineeringDeck = shuffle(engineeringDiscard, ctx.random);
          engineeringDiscard = [];
        }

        if (engineeringDeck.length > 0) {
          const drawnCard = engineeringDeck[0];
          drawnCardId = drawnCard.id;
          engineeringDeck = engineeringDeck.slice(1);
          newHand = [...player.hand, drawnCard];
        }
      } else if (deckType === "espionage") {
        // Reshuffle if empty
        if (espionageDeck.length === 0 && espionageDiscard.length > 0) {
          espionageDeck = shuffle(espionageDiscard, ctx.random);
          espionageDiscard = [];
        }

        if (espionageDeck.length > 0) {
          const drawnCard = espionageDeck[0];
          drawnCardId = drawnCard.id;
          espionageDeck = espionageDeck.slice(1);
          newHand = [...player.hand, drawnCard];
        }
      } else {
        // Economic deck
        if (economicDeck.length === 0 && economicDiscard.length > 0) {
          economicDeck = shuffle(economicDiscard, ctx.random);
          economicDiscard = [];
        }

        if (economicDeck.length > 0) {
          const drawnCard = economicDeck[0];
          drawnCardId = drawnCard.id;
          economicDeck = economicDeck.slice(1);
          newHand = [...player.hand, drawnCard];
        }
      }

      const updatedPlayer: CometRushPlayerState = {
        ...player,
        hand: newHand,
        // Increment initial cards drawn if drafting
        initialCardsDrawn: isInitialDraft ? player.initialCardsDrawn + 1 : player.initialCardsDrawn,
      };

      // Build turnMeta - always update lastDrawnCardId so the card can be displayed
      // But only increment cardsDrawnThisTurn for normal turns (not initial draft)
      let updatedTurnMeta: TurnMeta | null = state.turnMeta;
      if (state.turnMeta) {
        updatedTurnMeta = {
          ...state.turnMeta,
          lastDrawnCardId: drawnCardId,
          lastDrawnDeck: deckType,
          // Only increment cards drawn counter during normal turns, not initial draft
          cardsDrawnThisTurn: isInitialDraft
            ? (state.turnMeta.cardsDrawnThisTurn ?? 0)
            : (state.turnMeta.cardsDrawnThisTurn ?? 0) + 1,
        };
      }

      const drawCardState: CometRushState = {
        ...state,
        engineeringDeck,
        engineeringDiscard,
        espionageDeck,
        espionageDiscard,
        economicDeck,
        economicDiscard,
        players: {
          ...state.players,
          [action.playerId]: updatedPlayer,
        },
        turnMeta: updatedTurnMeta,
      };

      // Add action log entry
      const drawnCard = newHand.find(c => c.id === drawnCardId);
      const drawCardLogEntry = logDrawCard(drawCardState, action.playerId, deckType, drawnCard?.name ?? null);
      return {
        ...drawCardState,
        actionLog: [...drawCardState.actionLog, drawCardLogEntry],
      };
    }

    case "PLAY_CARD": {
      if (state.phase !== "playing") return state;

      const activePlayerId = getActivePlayerId(state);
      if (action.playerId !== activePlayerId) return state;

      const payload = action.payload as PlayCardPayload | undefined;
      if (!payload || !payload.cardId) return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      // Check if player is under Diplomatic Pressure - their card play is blocked
      if (player.isUnderDiplomaticPressure) {
        // Find the card to show in the blocked message
        const blockedCard = player.hand.find((c) => c.id === payload.cardId);
        if (!blockedCard) return state;

        const cardName = blockedCard.name;

        // Remove the blocked card from hand and add to appropriate discard pile
        const newHand = player.hand.filter((c) => c.id !== payload.cardId);

        let engineeringDiscard = [...state.engineeringDiscard];
        let espionageDiscard = [...state.espionageDiscard];
        let economicDiscard = [...state.economicDiscard];

        if (blockedCard.deck === "engineering") {
          engineeringDiscard = [...engineeringDiscard, blockedCard as EngineeringCard];
        } else if (blockedCard.deck === "espionage") {
          espionageDiscard = [...espionageDiscard, blockedCard as EspionageCard];
        } else {
          economicDiscard = [...economicDiscard, blockedCard as EconomicCard];
        }

        // Clear the diplomatic pressure flag (consumed on block)
        const updatedPlayer = {
          ...player,
          hand: newHand,
          isUnderDiplomaticPressure: false,
        };

        return {
          ...state,
          players: {
            ...state.players,
            [action.playerId]: updatedPlayer,
          },
          engineeringDiscard,
          espionageDiscard,
          economicDiscard,
          lastCardResult: {
            id: `${ctx.now()}`,
            playerId: action.playerId,
            description: `Your "${cardName}" was blocked by Diplomatic Pressure and discarded!`,
            cardName: "Diplomatic Pressure",
          },
        };
      }

      // Find the card in hand
      const card = player.hand.find((c) => c.id === payload.cardId);
      if (!card) return state;

      let updatedPlayers = { ...state.players };
      let updatedPlayer = { ...player };
      let resultDescription = "";
      let engineeringDiscard = [...state.engineeringDiscard];
      let espionageDiscard = [...state.espionageDiscard];
      let economicDiscard = [...state.economicDiscard];

      // Apply card play bonus from Program Prestige (before processing the card)
      if (updatedPlayer.upgrades.cardPlayBonus > 0) {
        updatedPlayer.resourceCubes += updatedPlayer.upgrades.cardPlayBonus;
      }

      // Handle Engineering cards
      if (card.deck === "engineering") {
        const engCard = card as EngineeringCard;

        switch (engCard.cardType) {
          case "MASS_PRODUCTION": {
            // -1 build time for ALL rockets
            const buildingRockets = updatedPlayer.rockets.filter((r) => r.status === "building");
            if (buildingRockets.length === 0) {
              resultDescription = "No rockets currently building.";
            } else {
              const updatedRockets = updatedPlayer.rockets.map((rocket) => {
                if (rocket.status !== "building") return rocket;
                const newRemaining = Math.max(0, rocket.buildTimeRemaining - 1);
                return {
                  ...rocket,
                  buildTimeRemaining: newRemaining,
                  status: newRemaining === 0 ? "ready" : "building" as RocketStatus,
                };
              });
              updatedPlayer.rockets = updatedRockets;
              const completedCount = updatedRockets.filter(
                (r, i) => r.status === "ready" && updatedPlayer.rockets[i].status === "building"
              ).length;
              resultDescription = `All rockets accelerated! ${buildingRockets.length} rocket(s) affected.`;
              if (completedCount > 0) {
                resultDescription += ` ${completedCount} now ready!`;
              }
            }
            break;
          }

          case "FLIGHT_ADJUSTMENT": {
            // Grant re-roll token
            updatedPlayer.hasRerollToken = true;
            resultDescription = "Flight Adjustment active! Your next failed launch can be re-rolled.";
            break;
          }

          case "WARHEAD_UPGRADE": {
            // +1 max power cap (max 8)
            const newCap = Math.min(8, updatedPlayer.upgrades.powerCap + 1);
            if (newCap === updatedPlayer.upgrades.powerCap) {
              resultDescription = "Power cap already at maximum (8).";
            } else {
              updatedPlayer.upgrades = {
                ...updatedPlayer.upgrades,
                powerCap: newCap,
              };
              resultDescription = `Warhead Upgrade! Max power increased to ${newCap}.`;
            }
            break;
          }

          case "GUIDANCE_SYSTEM_UPGRADE": {
            // +1 max accuracy cap (max 5)
            const newCap = Math.min(5, updatedPlayer.upgrades.accuracyCap + 1);
            if (newCap === updatedPlayer.upgrades.accuracyCap) {
              resultDescription = "Accuracy cap already at maximum (5).";
            } else {
              updatedPlayer.upgrades = {
                ...updatedPlayer.upgrades,
                accuracyCap: newCap,
              };
              resultDescription = `Guidance System Upgrade! Max accuracy increased to ${newCap}.`;
            }
            break;
          }

          case "STREAMLINED_ASSEMBLY": {
            // -1 build time for one rocket (requires target)
            if (!payload.targetRocketId) return state;
            const rocketIndex = updatedPlayer.rockets.findIndex(
              (r) => r.id === payload.targetRocketId && r.status === "building"
            );
            if (rocketIndex === -1) return state;

            const updatedRockets = [...updatedPlayer.rockets];
            const rocket = updatedRockets[rocketIndex];
            const newRemaining = Math.max(0, rocket.buildTimeRemaining - 1);
            updatedRockets[rocketIndex] = {
              ...rocket,
              buildTimeRemaining: newRemaining,
              status: newRemaining === 0 ? "ready" : "building" as RocketStatus,
            };
            updatedPlayer.rockets = updatedRockets;
            resultDescription = newRemaining === 0
              ? "Rocket is now ready to launch!"
              : `Rocket build time reduced to ${newRemaining} turn(s).`;
            break;
          }

          case "COMET_ANALYSIS": {
            // Peek at strength or movement deck
            if (!payload.peekChoice) return state;

            if (payload.peekChoice === "strength") {
              if (state.strengthDeck.length > 0) {
                const topCard = state.strengthDeck[0];
                updatedPlayer.peekedStrengthCard = topCard;
                resultDescription = `Comet Analysis: Next segment has strength ${topCard.baseStrength}.`;
              } else if (state.activeStrengthCard) {
                updatedPlayer.peekedStrengthCard = state.activeStrengthCard;
                resultDescription = `Comet Analysis: Current segment has strength ${state.activeStrengthCard.currentStrength}.`;
              } else {
                resultDescription = "No strength cards remaining.";
              }
            } else {
              if (state.movementDeck.length > 0) {
                const topCard = state.movementDeck[0];
                updatedPlayer.peekedMovementCard = topCard;
                resultDescription = `Comet Analysis: Next movement is ${topCard.moveSpaces} space(s).`;
              } else {
                resultDescription = "No movement cards remaining.";
              }
            }
            break;
          }

          case "ROCKET_CALIBRATION": {
            // Add calibration bonus for next launch
            if (!payload.calibrationChoice) return state;

            if (payload.calibrationChoice === "accuracy") {
              // Check if adding would exceed cap (5)
              const newAccuracyBonus = updatedPlayer.pendingCalibration.accuracyBonus + 1;
              updatedPlayer.pendingCalibration = {
                ...updatedPlayer.pendingCalibration,
                accuracyBonus: newAccuracyBonus,
              };
              resultDescription = `Rocket Calibration: +1 Accuracy for next launch (total: +${newAccuracyBonus}).`;
            } else {
              // Power bonus
              const newPowerBonus = updatedPlayer.pendingCalibration.powerBonus + 1;
              updatedPlayer.pendingCalibration = {
                ...updatedPlayer.pendingCalibration,
                powerBonus: newPowerBonus,
              };
              resultDescription = `Rocket Calibration: +1 Power for next launch (total: +${newPowerBonus}).`;
            }
            break;
          }

          default:
            return state;
        }

        // Move to engineering discard
        engineeringDiscard = [...engineeringDiscard, engCard];

      } else if (card.deck === "espionage") {
        // Handle Espionage cards
        const espCard = card as EspionageCard;

        switch (espCard.cardType) {
          case "COVERT_ROCKET_STRIKE": {
            // Destroy any rocket (building or ready) of another player
            if (!payload.targetPlayerId || !payload.targetRocketId) return state;
            const targetPlayer = state.players[payload.targetPlayerId];
            if (!targetPlayer || payload.targetPlayerId === action.playerId) return state;

            const rocketIndex = targetPlayer.rockets.findIndex(
              (r) => r.id === payload.targetRocketId && (r.status === "building" || r.status === "ready")
            );
            if (rocketIndex === -1) return state;

            const destroyedRocket = targetPlayer.rockets[rocketIndex];
            const updatedRockets = targetPlayer.rockets.filter((_, i) => i !== rocketIndex);

            updatedPlayers = {
              ...updatedPlayers,
              [payload.targetPlayerId]: {
                ...targetPlayer,
                rockets: updatedRockets,
              },
            };
            resultDescription = `Covert Rocket Strike! Destroyed ${targetPlayer.name}'s ${destroyedRocket.status} rocket!`;
            break;
          }

          case "EMBARGO": {
            // Target gains no income next turn
            if (!payload.targetPlayerId) return state;
            const targetPlayer = state.players[payload.targetPlayerId];
            if (!targetPlayer || payload.targetPlayerId === action.playerId) return state;

            updatedPlayers = {
              ...updatedPlayers,
              [payload.targetPlayerId]: {
                ...targetPlayer,
                isEmbargoed: true,
              },
            };
            resultDescription = `${targetPlayer.name} is embargoed! They will gain no income next turn.`;
            break;
          }

          case "ESPIONAGE_AGENT": {
            // Steal random card from another player
            if (!payload.targetPlayerId) return state;
            const targetPlayer = state.players[payload.targetPlayerId];
            if (!targetPlayer || payload.targetPlayerId === action.playerId) return state;
            if (targetPlayer.hand.length === 0) {
              resultDescription = `${targetPlayer.name} has no cards to steal!`;
              break;
            }

            const randomIndex = Math.floor(ctx.random() * targetPlayer.hand.length);
            const stolenCard = targetPlayer.hand[randomIndex];
            const newTargetHand = targetPlayer.hand.filter((_, i) => i !== randomIndex);

            updatedPlayers = {
              ...updatedPlayers,
              [payload.targetPlayerId]: {
                ...targetPlayer,
                hand: newTargetHand,
              },
            };
            updatedPlayer.hand = [...updatedPlayer.hand, stolenCard];
            resultDescription = `Espionage Agent stole "${stolenCard.name}" from ${targetPlayer.name}!`;
            break;
          }

          case "DIPLOMATIC_PRESSURE": {
            // Block target player's next card play
            if (!payload.targetPlayerId) return state;
            const targetPlayer = state.players[payload.targetPlayerId];
            if (!targetPlayer || payload.targetPlayerId === action.playerId) return state;

            // Check if target has a Diplomatic Pressure card they can counter with
            const counterCard = targetPlayer.hand.find(
              (c) => c.deck === "espionage" && (c as EspionageCard).cardType === "DIPLOMATIC_PRESSURE"
            );

            if (counterCard) {
              // Target can counter! Set up pending state and wait for response
              // Don't remove the attacker's card yet - keep it until resolved
              return {
                ...state,
                pendingDiplomaticPressure: {
                  attackerId: action.playerId,
                  attackerName: updatedPlayer.name,
                  targetId: payload.targetPlayerId,
                  counterCardId: counterCard.id,
                },
                lastCardResult: {
                  id: `${ctx.now()}`,
                  playerId: action.playerId,
                  description: `Diplomatic Pressure played on ${targetPlayer.name}! Waiting for response...`,
                  cardName: "Diplomatic Pressure",
                },
              };
            }

            // Target cannot counter - apply effect immediately
            updatedPlayers = {
              ...updatedPlayers,
              [payload.targetPlayerId]: {
                ...targetPlayer,
                isUnderDiplomaticPressure: true,
              },
            };
            resultDescription = `Diplomatic Pressure! ${targetPlayer.name}'s next card play will be blocked.`;
            break;
          }

          case "RESOURCE_SEIZURE": {
            // Steal 3 resources from another player
            if (!payload.targetPlayerId) return state;
            const targetPlayer = state.players[payload.targetPlayerId];
            if (!targetPlayer || payload.targetPlayerId === action.playerId) return state;

            const stealAmount = Math.min(3, targetPlayer.resourceCubes);
            updatedPlayers = {
              ...updatedPlayers,
              [payload.targetPlayerId]: {
                ...targetPlayer,
                resourceCubes: targetPlayer.resourceCubes - stealAmount,
              },
            };
            updatedPlayer.resourceCubes += stealAmount;
            resultDescription = `Resource Seizure! Stole ${stealAmount} cube(s) from ${targetPlayer.name}!`;
            break;
          }

          case "SABOTAGE_CONSTRUCTION": {
            // Force target to re-roll their next launch
            if (!payload.targetPlayerId) return state;
            const targetPlayer = state.players[payload.targetPlayerId];
            if (!targetPlayer || payload.targetPlayerId === action.playerId) return state;

            updatedPlayers = {
              ...updatedPlayers,
              [payload.targetPlayerId]: {
                ...targetPlayer,
                mustRerollNextLaunch: true,
              },
            };
            resultDescription = `Sabotage Construction! ${targetPlayer.name}'s next rocket launch will be sabotaged!`;
            break;
          }

          case "REGULATORY_REVIEW": {
            // +1 build time to another player's rocket
            if (!payload.targetPlayerId || !payload.targetRocketId) return state;
            const targetPlayer = state.players[payload.targetPlayerId];
            if (!targetPlayer || payload.targetPlayerId === action.playerId) return state;

            const rocketIndex = targetPlayer.rockets.findIndex(
              (r) => r.id === payload.targetRocketId && r.status === "building"
            );
            if (rocketIndex === -1) return state;

            const updatedRockets = [...targetPlayer.rockets];
            const rocket = updatedRockets[rocketIndex];
            updatedRockets[rocketIndex] = {
              ...rocket,
              buildTimeRemaining: rocket.buildTimeRemaining + 1,
            };

            updatedPlayers = {
              ...updatedPlayers,
              [payload.targetPlayerId]: {
                ...targetPlayer,
                rockets: updatedRockets,
              },
            };
            resultDescription = `Regulatory Review! Delayed ${targetPlayer.name}'s rocket by 1 turn!`;
            break;
          }

          default:
            return state;
        }

        // Move to espionage discard
        espionageDiscard = [...espionageDiscard, espCard];

      } else {
        // Handle Economic cards
        const econCard = card as EconomicCard;

        switch (econCard.cardType) {
          case "INTERNATIONAL_GRANT": {
            // You get 5, all others get 2
            updatedPlayer.resourceCubes += 5;
            for (const otherId of state.playerOrder) {
              if (otherId === action.playerId) continue;
              const otherPlayer = state.players[otherId];
              if (!otherPlayer) continue;
              updatedPlayers = {
                ...updatedPlayers,
                [otherId]: {
                  ...otherPlayer,
                  resourceCubes: otherPlayer.resourceCubes + 2,
                },
              };
            }
            resultDescription = "International Grant! You gained 5 cubes, all others gained 2.";
            break;
          }

          case "FUNDING_PRESSURE": {
            // Gain resources based on comet distance (4/8/12)
            let amount: number;
            if (state.distanceToImpact >= 13) {
              amount = 4;
            } else if (state.distanceToImpact >= 7) {
              amount = 8;
            } else {
              amount = 12;
            }
            updatedPlayer.resourceCubes += amount;
            resultDescription = `Funding Pressure! Gained ${amount} cubes (comet at distance ${state.distanceToImpact}).`;
            break;
          }

          case "INCREASE_INCOME": {
            // +1 income (max 3 stacks)
            if (updatedPlayer.upgrades.incomeBonus >= 3) {
              resultDescription = "Income bonus already at maximum (+3).";
            } else {
              updatedPlayer.upgrades = {
                ...updatedPlayer.upgrades,
                incomeBonus: updatedPlayer.upgrades.incomeBonus + 1,
              };
              resultDescription = `Income increased! Now earning ${updatedPlayer.baseIncome + updatedPlayer.upgrades.incomeBonus} cubes per round.`;
            }
            break;
          }

          case "ROCKET_SALVAGE": {
            // +1 resource per launch (max 3 stacks)
            if (updatedPlayer.upgrades.salvageBonus >= 3) {
              resultDescription = "Salvage bonus already at maximum (+3).";
            } else {
              updatedPlayer.upgrades = {
                ...updatedPlayer.upgrades,
                salvageBonus: updatedPlayer.upgrades.salvageBonus + 1,
              };
              resultDescription = `Rocket Salvage! Gain +${updatedPlayer.upgrades.salvageBonus} resource(s) per rocket launch.`;
            }
            break;
          }

          case "EMERGENCY_FUNDING": {
            // Gain income immediately
            const income = updatedPlayer.baseIncome + updatedPlayer.upgrades.incomeBonus;
            updatedPlayer.resourceCubes += income;
            resultDescription = `Emergency Funding! Gained ${income} cubes.`;
            break;
          }

          case "PUBLIC_DONATION_DRIVE": {
            // +2 resources per rocket (building or ready)
            const rocketCount = updatedPlayer.rockets.filter(
              (r) => r.status === "building" || r.status === "ready"
            ).length;
            const gain = rocketCount * 2;
            updatedPlayer.resourceCubes += gain;
            resultDescription = rocketCount > 0
              ? `Public Donation Drive! Gained ${gain} cube(s) from ${rocketCount} rocket(s).`
              : "No rockets to generate donations.";
            break;
          }

          case "PROGRAM_PRESTIGE": {
            // Permanent: +1 resource per card played (max 3)
            if (updatedPlayer.upgrades.cardPlayBonus >= 3) {
              resultDescription = "Card play bonus already at maximum (+3).";
            } else {
              updatedPlayer.upgrades = {
                ...updatedPlayer.upgrades,
                cardPlayBonus: updatedPlayer.upgrades.cardPlayBonus + 1,
              };
              resultDescription = `Program Prestige! Gain +${updatedPlayer.upgrades.cardPlayBonus} resource(s) each time you play a card.`;
            }
            break;
          }

          default:
            return state;
        }

        // Move to economic discard
        economicDiscard = [...economicDiscard, econCard];
      }

      // Remove played card from hand
      updatedPlayer.hand = updatedPlayer.hand.filter((c) => c.id !== payload.cardId);
      updatedPlayers[action.playerId] = updatedPlayer;

      const playCardState = {
        ...state,
        players: updatedPlayers,
        engineeringDiscard,
        espionageDiscard,
        economicDiscard,
        lastCardResult: resultDescription
          ? {
              id: `${ctx.now()}`,
              playerId: action.playerId,
              description: resultDescription,
              cardName: card.name,
            }
          : null,
      };

      // Add action log entry
      const targetPlayer = payload.targetPlayerId ? state.players[payload.targetPlayerId] : null;
      const playCardLogEntry = logPlayCard(
        playCardState,
        action.playerId,
        card.name,
        targetPlayer?.name,
        resultDescription
      );
      return {
        ...playCardState,
        actionLog: [...playCardState.actionLog, playCardLogEntry],
      };
    }

    case "TRADE_CARDS": {
      // Free action: Discard 2 cards to draw 1 new card
      if (state.phase !== "playing") return state;

      const activePlayerId = getActivePlayerId(state);
      if (action.playerId !== activePlayerId) return state;

      const payload = action.payload as TradeCardsPayload | undefined;
      if (!payload || !payload.discardCardIds || payload.discardCardIds.length !== 2) return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      // Verify both cards exist in hand
      const [cardId1, cardId2] = payload.discardCardIds;
      const card1 = player.hand.find((c) => c.id === cardId1);
      const card2 = player.hand.find((c) => c.id === cardId2);
      if (!card1 || !card2 || cardId1 === cardId2) return state;

      // Need at least 2 cards to trade
      if (player.hand.length < 2) return state;

      // Get the deck to draw from
      let deck: GameCard[];
      let discard: GameCard[];
      switch (payload.drawFromDeck) {
        case "engineering":
          deck = [...state.engineeringDeck];
          discard = [...state.engineeringDiscard];
          break;
        case "espionage":
          deck = [...state.espionageDeck];
          discard = [...state.espionageDiscard];
          break;
        case "economic":
          deck = [...state.economicDeck];
          discard = [...state.economicDiscard];
          break;
        default:
          return state;
      }

      // Check if deck has cards (if empty, shuffle discard into deck)
      if (deck.length === 0 && discard.length > 0) {
        deck = shuffleArray([...discard], ctx.random);
        discard = [];
      }

      // If still no cards, can't draw
      if (deck.length === 0) return state;

      // Draw a card
      const drawnCard = deck[0];
      deck = deck.slice(1);

      // Remove discarded cards from hand and add to appropriate discard piles
      let newHand = player.hand.filter((c) => c.id !== cardId1 && c.id !== cardId2);
      newHand = [...newHand, drawnCard];

      let engineeringDiscard = [...state.engineeringDiscard];
      let espionageDiscard = [...state.espionageDiscard];
      let economicDiscard = [...state.economicDiscard];

      // Discard card1
      if (card1.deck === "engineering") {
        engineeringDiscard = [...engineeringDiscard, card1 as EngineeringCard];
      } else if (card1.deck === "espionage") {
        espionageDiscard = [...espionageDiscard, card1 as EspionageCard];
      } else {
        economicDiscard = [...economicDiscard, card1 as EconomicCard];
      }

      // Discard card2
      if (card2.deck === "engineering") {
        engineeringDiscard = [...engineeringDiscard, card2 as EngineeringCard];
      } else if (card2.deck === "espionage") {
        espionageDiscard = [...espionageDiscard, card2 as EspionageCard];
      } else {
        economicDiscard = [...economicDiscard, card2 as EconomicCard];
      }

      // Update the deck we drew from
      let engineeringDeck = state.engineeringDeck;
      let espionageDeck = state.espionageDeck;
      let economicDeck = state.economicDeck;

      switch (payload.drawFromDeck) {
        case "engineering":
          engineeringDeck = deck as EngineeringCard[];
          engineeringDiscard = discard as EngineeringCard[];
          break;
        case "espionage":
          espionageDeck = deck as EspionageCard[];
          espionageDiscard = discard as EspionageCard[];
          break;
        case "economic":
          economicDeck = deck as EconomicCard[];
          economicDiscard = discard as EconomicCard[];
          break;
      }

      const updatedPlayer = {
        ...player,
        hand: newHand,
      };

      return {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: updatedPlayer,
        },
        engineeringDeck,
        espionageDeck,
        economicDeck,
        engineeringDiscard,
        espionageDiscard,
        economicDiscard,
        lastCardResult: {
          id: `${ctx.now()}`,
          playerId: action.playerId,
          description: `Traded "${card1.name}" and "${card2.name}" for a new ${payload.drawFromDeck} card!`,
          cardName: "Card Trade",
        },
      };
    }

    case "BUILD_ROCKET": {
      if (state.phase !== "playing") return state;

      const activePlayerId = getActivePlayerId(state);
      if (action.playerId !== activePlayerId) return state;

      const payload = action.payload as BuildRocketPayload | undefined;
      if (!payload) return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      const rawPower = payload.power;
      const rawAccuracy = payload.accuracy;
      const rawBuildTimeCost = payload.buildTimeBase;

      if (rawBuildTimeCost < 1 || rawBuildTimeCost > 3 || rawPower < 1 || rawAccuracy < 1) return state;

      const power = Math.min(rawPower, player.upgrades.powerCap);
      const accuracy = Math.min(rawAccuracy, player.upgrades.accuracyCap);
      const buildTimeCost = Math.min(rawBuildTimeCost, player.upgrades.buildTimeCap);

      const effectivePower = power;
      const effectiveAccuracy = Math.min(5, accuracy); // Accuracy capped at 5 (83.3% hit rate max)

      const cost = calculateRocketCost(buildTimeCost, power, accuracy);
      if (player.resourceCubes < cost) return state;

      const activeRockets = player.rockets.filter(
        (r) => r.status === "ready" || r.status === "building"
      ).length;
      const maxRockets = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
      if (activeRockets >= maxRockets) return state;

      const buildTimeRemaining = 3 - buildTimeCost;
      const initialStatus: RocketStatus = buildTimeRemaining > 0 ? "building" : "ready";

      const newRocket: Rocket = {
        id: `rocket-${action.playerId}-${ctx.now()}`,
        buildTimeBase: buildTimeCost,
        buildTimeRemaining: buildTimeRemaining,
        power: effectivePower,
        accuracy: effectiveAccuracy,
        costCubes: cost,
        status: initialStatus,
      };

      const updatedPlayer = {
        ...player,
        resourceCubes: player.resourceCubes - cost,
        rockets: [...player.rockets, newRocket],
        hasBuiltRocketThisTurn: true,
      };

      const buildRocketState = {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: updatedPlayer,
        },
      };

      // Add action log entry
      const buildRocketLogEntry = logBuildRocket(
        buildRocketState,
        action.playerId,
        effectivePower,
        effectiveAccuracy,
        buildTimeCost,
        cost
      );
      return {
        ...buildRocketState,
        actionLog: [...buildRocketState.actionLog, buildRocketLogEntry],
      };
    }

    case "LAUNCH_ROCKET": {
      // LAUNCH_ROCKET now only sets up pendingLaunch - dice roll happens in CONFIRM_ROLL
      if (state.phase !== "playing") return state;

      const activePlayerId = getActivePlayerId(state);
      if (action.playerId !== activePlayerId) return state;

      const payload = action.payload as LaunchRocketPayload | undefined;
      if (!payload) return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      const rocketIndex = player.rockets.findIndex(
        (r) => r.id === payload.rocketId && r.status === "ready"
      );
      if (rocketIndex === -1) return state;

      const rocket = player.rockets[rocketIndex];

      // Apply calibration bonuses (respecting caps: accuracy max 5, power max 8)
      const calibratedAccuracy = Math.min(5, rocket.accuracy + player.pendingCalibration.accuracyBonus);
      const calibratedPower = Math.min(8, rocket.power + player.pendingCalibration.powerBonus);

      // Check if player was sabotaged
      const mustReroll = player.mustRerollNextLaunch;

      // Calculate salvage bonus (will apply after final result)
      const salvageBonus = player.upgrades.salvageBonus;

      // Set up pending launch - NO dice roll yet
      const pendingLaunch: PendingLaunch = {
        playerId: action.playerId,
        rocketId: rocket.id,
        rocketIndex,
        calibratedAccuracy,
        calibratedPower,
        mustReroll,
        hasRerollToken: player.hasRerollToken,
        salvageBonus,
      };

      return {
        ...state,
        pendingLaunch,
        lastLaunchResult: null, // Clear any previous result
      };
    }

    case "CONFIRM_ROLL": {
      // Player clicked "Roll Dice" - now we actually roll and process the result
      if (state.phase !== "playing") return state;
      if (!state.pendingLaunch) return state;
      if (state.pendingLaunch.playerId !== action.playerId) return state;

      const { pendingLaunch } = state;
      const player = state.players[pendingLaunch.playerId];
      if (!player) return state;

      const rocket = player.rockets[pendingLaunch.rocketIndex];
      if (!rocket || rocket.status !== "ready") return state;

      // NOW we roll the dice
      const diceRoll = roll1d6(ctx.random);
      const hit = diceRoll <= pendingLaunch.calibratedAccuracy;

      // Check if player CAN reroll (has token, missed, and not already forced to reroll)
      const canReroll = !hit && pendingLaunch.hasRerollToken && !pendingLaunch.mustReroll;

      // If sabotaged and HIT, show first roll but don't process it - wait for forced reroll
      // If sabotaged and MISSED, consume the rocket - they don't get another chance
      if (pendingLaunch.mustReroll) {
        if (hit) {
          // HIT while sabotaged - must reroll, don't consume rocket yet
          const launchResult: LaunchResult = {
            playerId: pendingLaunch.playerId,
            rocketId: rocket.id,
            diceRoll,
            accuracyNeeded: pendingLaunch.calibratedAccuracy,
            hit, // Show what they would have gotten
            power: pendingLaunch.calibratedPower,
            strengthBefore: state.activeStrengthCard?.currentStrength ?? 0,
            strengthAfter: state.activeStrengthCard?.currentStrength ?? 0,
            destroyed: false,
            baseStrength: state.activeStrengthCard?.baseStrength ?? 0,
            canReroll: false,
            isReroll: false,
            mustReroll: true, // Force reroll due to sabotage
          };

          // Don't consume mustRerollNextLaunch yet - wait for actual reroll
          // Keep pendingLaunch for the forced reroll
          return {
            ...state,
            lastLaunchResult: launchResult,
            pendingLaunch: null, // Clear pending launch after roll
          };
        } else {
          // MISSED while sabotaged - consume rocket, clear sabotage, no reroll opportunity
          const updatedRockets = [...player.rockets];
          updatedRockets[pendingLaunch.rocketIndex] = {
            ...rocket,
            status: "spent",
          };

          const launchResult: LaunchResult = {
            playerId: pendingLaunch.playerId,
            rocketId: rocket.id,
            diceRoll,
            accuracyNeeded: pendingLaunch.calibratedAccuracy,
            hit: false,
            power: pendingLaunch.calibratedPower,
            strengthBefore: state.activeStrengthCard?.currentStrength ?? 0,
            strengthAfter: state.activeStrengthCard?.currentStrength ?? 0,
            destroyed: false,
            baseStrength: state.activeStrengthCard?.baseStrength ?? 0,
            canReroll: false, // No reroll on sabotaged miss
            isReroll: false,
            mustReroll: false, // Sabotage consumed but no reroll (was a miss)
          };

          const updatedPlayer = {
            ...player,
            rockets: updatedRockets,
            hasLaunchedRocketThisTurn: true,
            resourceCubes: player.resourceCubes + pendingLaunch.salvageBonus,
            mustRerollNextLaunch: false, // Consume the sabotage
            pendingCalibration: { accuracyBonus: 0, powerBonus: 0 }, // Clear calibration
          };

          const sabotageMissState = {
            ...state,
            players: {
              ...state.players,
              [pendingLaunch.playerId]: updatedPlayer,
            },
            lastLaunchResult: launchResult,
            pendingLaunch: null,
          };

          // Add action log entry for sabotaged miss
          const sabotageMissLogEntry = logLaunchRocket(sabotageMissState, pendingLaunch.playerId, launchResult);
          return {
            ...sabotageMissState,
            actionLog: [...sabotageMissState.actionLog, sabotageMissLogEntry],
          };
        }
      }

      if (!hit) {
        const updatedRockets = [...player.rockets];
        updatedRockets[pendingLaunch.rocketIndex] = {
          ...rocket,
          status: "spent",
        };

        const launchResult: LaunchResult = {
          playerId: pendingLaunch.playerId,
          rocketId: rocket.id,
          diceRoll,
          accuracyNeeded: pendingLaunch.calibratedAccuracy,
          hit: false,
          power: pendingLaunch.calibratedPower,
          strengthBefore: state.activeStrengthCard?.currentStrength ?? 0,
          strengthAfter: state.activeStrengthCard?.currentStrength ?? 0,
          destroyed: false,
          baseStrength: state.activeStrengthCard?.baseStrength ?? 0,
          canReroll, // Player can choose to reroll if they have token
          isReroll: false,
          mustReroll: false,
        };

        const updatedPlayer = {
          ...player,
          rockets: updatedRockets,
          hasLaunchedRocketThisTurn: !canReroll, // Don't end turn if they can still reroll
          resourceCubes: player.resourceCubes + (canReroll ? 0 : pendingLaunch.salvageBonus), // Salvage after final result
          hasRerollToken: player.hasRerollToken, // Keep token until they use it or decline
          mustRerollNextLaunch: false,
          pendingCalibration: { accuracyBonus: 0, powerBonus: 0 }, // Clear calibration
        };

        const launchMissState = {
          ...state,
          players: {
            ...state.players,
            [pendingLaunch.playerId]: updatedPlayer,
          },
          lastLaunchResult: launchResult,
          pendingLaunch: null,
        };

        // Add action log entry for miss
        const launchMissLogEntry = logLaunchRocket(launchMissState, pendingLaunch.playerId, launchResult);
        return {
          ...launchMissState,
          actionLog: [...launchMissState.actionLog, launchMissLogEntry],
        };
      }

      // HIT: Process strength
      let activeStrengthCard = state.activeStrengthCard;
      let strengthDeck = [...state.strengthDeck];

      if (!activeStrengthCard) {
        if (strengthDeck.length === 0) return state;
        activeStrengthCard = strengthDeck[0];
        strengthDeck = strengthDeck.slice(1);
      }

      let updatedStrengthCard: StrengthCard | null = activeStrengthCard;
      let destroyed = false;
      let trophyCard: StrengthCard | null = null;
      let finalDestroyerId = state.finalDestroyerId;

      if (pendingLaunch.calibratedPower >= activeStrengthCard.currentStrength) {
        destroyed = true;
        trophyCard = activeStrengthCard;
        updatedStrengthCard = null;

        if (strengthDeck.length === 0) {
          finalDestroyerId = pendingLaunch.playerId;
        }
      } else {
        updatedStrengthCard = {
          ...activeStrengthCard,
          currentStrength: activeStrengthCard.currentStrength - pendingLaunch.calibratedPower,
        };
      }

      const updatedRockets = [...player.rockets];
      updatedRockets[pendingLaunch.rocketIndex] = {
        ...rocket,
        status: "spent",
      };

      const updatedTrophies = trophyCard
        ? [...player.trophies, trophyCard]
        : player.trophies;

      const launchResult: LaunchResult = {
        playerId: pendingLaunch.playerId,
        rocketId: rocket.id,
        diceRoll,
        accuracyNeeded: pendingLaunch.calibratedAccuracy,
        hit,
        power: pendingLaunch.calibratedPower,
        strengthBefore: activeStrengthCard.currentStrength,
        strengthAfter: destroyed ? 0 : (updatedStrengthCard?.currentStrength ?? 0),
        destroyed,
        baseStrength: activeStrengthCard.baseStrength,
        canReroll: false, // Hit - no reroll needed
        isReroll: false,
        mustReroll: false,
      };

      const updatedPlayer = {
        ...player,
        rockets: updatedRockets,
        trophies: updatedTrophies,
        hasLaunchedRocketThisTurn: true,
        resourceCubes: player.resourceCubes + pendingLaunch.salvageBonus,
        hasRerollToken: player.hasRerollToken, // Keep token on hit
        mustRerollNextLaunch: false,
        pendingCalibration: { accuracyBonus: 0, powerBonus: 0 }, // Clear calibration
      };

      const totalDestroyed = Object.values(state.players).reduce(
        (sum, p) => sum + p.trophies.length,
        0
      ) + (destroyed ? 1 : 0);

      const cometDestroyed = totalDestroyed >= state.totalStrengthCards && !updatedStrengthCard && strengthDeck.length === 0;

      if (cometDestroyed) {
        const newState = {
          ...state,
          strengthDeck,
          activeStrengthCard: updatedStrengthCard,
          players: {
            ...state.players,
            [pendingLaunch.playerId]: updatedPlayer,
          },
          lastLaunchResult: launchResult,
          pendingLaunch: null,
          finalDestroyerId,
          phase: "gameOver" as CometRushPhase,
          cometDestroyed: true,
          earthDestroyed: false,
        };
        const finalState = {
          ...newState,
          winnerIds: determineWinners(newState),
        };
        // Add action log entries for launch and game over
        const launchHitLogEntry = logLaunchRocket(finalState, pendingLaunch.playerId, launchResult);
        const gameOverLogEntry = logGameOver(finalState, "cometDestroyed");
        return {
          ...finalState,
          actionLog: [...finalState.actionLog, launchHitLogEntry, gameOverLogEntry],
        };
      }

      const launchHitState = {
        ...state,
        strengthDeck,
        activeStrengthCard: updatedStrengthCard,
        players: {
          ...state.players,
          [pendingLaunch.playerId]: updatedPlayer,
        },
        lastLaunchResult: launchResult,
        pendingLaunch: null,
        finalDestroyerId,
      };

      // Add action log entry for hit
      const launchHitLogEntry = logLaunchRocket(launchHitState, pendingLaunch.playerId, launchResult);
      return {
        ...launchHitState,
        actionLog: [...launchHitState.actionLog, launchHitLogEntry],
      };
    }

    case "USE_REROLL": {
      // Player chose to use their reroll token after seeing a miss
      if (state.phase !== "playing") return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      // Must have a pending launch result that allows reroll
      const lastResult = state.lastLaunchResult;
      if (!lastResult) return state;
      if (lastResult.playerId !== action.playerId) return state;
      if (!lastResult.canReroll) return state;
      if (!player.hasRerollToken) return state;

      // Find the spent rocket (it was marked spent in the original launch)
      const rocketIndex = player.rockets.findIndex(
        (r) => r.id === lastResult.rocketId && r.status === "spent"
      );
      if (rocketIndex === -1) return state;

      const rocket = player.rockets[rocketIndex];

      // Re-roll the dice
      const diceRoll = roll1d6(ctx.random);
      const hit = diceRoll <= rocket.accuracy;

      // Calculate salvage bonus (applies after final result)
      const salvageBonus = player.upgrades.salvageBonus;

      if (!hit) {
        // Still missed - final result, consume token and give salvage
        const launchResult: LaunchResult = {
          playerId: action.playerId,
          rocketId: rocket.id,
          diceRoll,
          accuracyNeeded: rocket.accuracy,
          hit: false,
          power: rocket.power,
          strengthBefore: state.activeStrengthCard?.currentStrength ?? 0,
          strengthAfter: state.activeStrengthCard?.currentStrength ?? 0,
          destroyed: false,
          baseStrength: state.activeStrengthCard?.baseStrength ?? 0,
          canReroll: false, // Already used reroll
          isReroll: true,
          mustReroll: false,
        };

        const updatedPlayer = {
          ...player,
          hasLaunchedRocketThisTurn: true,
          resourceCubes: player.resourceCubes + salvageBonus,
          hasRerollToken: false, // Consumed
        };

        const rerollMissState = {
          ...state,
          players: {
            ...state.players,
            [action.playerId]: updatedPlayer,
          },
          lastLaunchResult: launchResult,
        };

        // Add action log entries for reroll and miss
        const useRerollLogEntry = logUseReroll(rerollMissState, action.playerId);
        const rerollMissLogEntry = logLaunchRocket(rerollMissState, action.playerId, launchResult);
        return {
          ...rerollMissState,
          actionLog: [...rerollMissState.actionLog, useRerollLogEntry, rerollMissLogEntry],
        };
      }

      // HIT on reroll: Process strength damage
      let activeStrengthCard = state.activeStrengthCard;
      let strengthDeck = [...state.strengthDeck];

      if (!activeStrengthCard) {
        if (strengthDeck.length === 0) return state;
        activeStrengthCard = strengthDeck[0];
        strengthDeck = strengthDeck.slice(1);
      }

      let updatedStrengthCard: StrengthCard | null = activeStrengthCard;
      let destroyed = false;
      let trophyCard: StrengthCard | null = null;
      let finalDestroyerId = state.finalDestroyerId;

      if (rocket.power >= activeStrengthCard.currentStrength) {
        destroyed = true;
        trophyCard = activeStrengthCard;
        updatedStrengthCard = null;

        if (strengthDeck.length === 0) {
          finalDestroyerId = action.playerId;
        }
      } else {
        updatedStrengthCard = {
          ...activeStrengthCard,
          currentStrength: activeStrengthCard.currentStrength - rocket.power,
        };
      }

      const updatedTrophies = trophyCard
        ? [...player.trophies, trophyCard]
        : player.trophies;

      const launchResult: LaunchResult = {
        playerId: action.playerId,
        rocketId: rocket.id,
        diceRoll,
        accuracyNeeded: rocket.accuracy,
        hit: true,
        power: rocket.power,
        strengthBefore: activeStrengthCard.currentStrength,
        strengthAfter: destroyed ? 0 : (updatedStrengthCard?.currentStrength ?? 0),
        destroyed,
        baseStrength: activeStrengthCard.baseStrength,
        canReroll: false,
        isReroll: true,
        mustReroll: false,
      };

      const updatedPlayer = {
        ...player,
        trophies: updatedTrophies,
        hasLaunchedRocketThisTurn: true,
        resourceCubes: player.resourceCubes + salvageBonus,
        hasRerollToken: false, // Consumed
      };

      const totalDestroyed = Object.values(state.players).reduce(
        (sum, p) => sum + p.trophies.length,
        0
      ) + (destroyed ? 1 : 0);

      const cometDestroyed = totalDestroyed >= state.totalStrengthCards && !updatedStrengthCard && strengthDeck.length === 0;

      if (cometDestroyed) {
        const newState = {
          ...state,
          strengthDeck,
          activeStrengthCard: updatedStrengthCard,
          players: {
            ...state.players,
            [action.playerId]: updatedPlayer,
          },
          lastLaunchResult: launchResult,
          finalDestroyerId,
          phase: "gameOver" as CometRushPhase,
          cometDestroyed: true,
          earthDestroyed: false,
        };
        const finalState = {
          ...newState,
          winnerIds: determineWinners(newState),
        };
        // Add action log entries
        const useRerollLogEntry = logUseReroll(finalState, action.playerId);
        const launchLogEntry = logLaunchRocket(finalState, action.playerId, launchResult);
        const gameOverLogEntry = logGameOver(finalState, "cometDestroyed");
        return {
          ...finalState,
          actionLog: [...finalState.actionLog, useRerollLogEntry, launchLogEntry, gameOverLogEntry],
        };
      }

      const rerollHitState = {
        ...state,
        strengthDeck,
        activeStrengthCard: updatedStrengthCard,
        players: {
          ...state.players,
          [action.playerId]: updatedPlayer,
        },
        lastLaunchResult: launchResult,
        finalDestroyerId,
      };

      // Add action log entries
      const useRerollLogEntry = logUseReroll(rerollHitState, action.playerId);
      const launchLogEntry = logLaunchRocket(rerollHitState, action.playerId, launchResult);
      return {
        ...rerollHitState,
        actionLog: [...rerollHitState.actionLog, useRerollLogEntry, launchLogEntry],
      };
    }

    case "DECLINE_REROLL": {
      // Player chose NOT to use their reroll token, accept the miss
      if (state.phase !== "playing") return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      // Must have a pending launch result that allows reroll
      const lastResult = state.lastLaunchResult;
      if (!lastResult) return state;
      if (lastResult.playerId !== action.playerId) return state;
      if (!lastResult.canReroll) return state;

      // Calculate salvage bonus (applies now that they've finalized the miss)
      const salvageBonus = player.upgrades.salvageBonus;

      // Update the result to show reroll is no longer available
      const updatedResult: LaunchResult = {
        ...lastResult,
        canReroll: false,
      };

      const updatedPlayer = {
        ...player,
        hasLaunchedRocketThisTurn: true,
        resourceCubes: player.resourceCubes + salvageBonus,
        // Keep the reroll token - they didn't use it
      };

      const declineRerollState = {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: updatedPlayer,
        },
        lastLaunchResult: updatedResult,
      };

      // Add action log entry
      const declineRerollLogEntry = logDeclineReroll(declineRerollState, action.playerId);
      return {
        ...declineRerollState,
        actionLog: [...declineRerollState.actionLog, declineRerollLogEntry],
      };
    }

    case "FORCED_REROLL": {
      // Player was sabotaged and must reroll their launch
      if (state.phase !== "playing") return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      // Must have a pending launch result that requires forced reroll
      const lastResult = state.lastLaunchResult;
      if (!lastResult) return state;
      if (lastResult.playerId !== action.playerId) return state;
      if (!lastResult.mustReroll) return state;
      if (!player.mustRerollNextLaunch) return state;

      // Find the rocket (should still be ready since we didn't mark it spent)
      const rocketIndex = player.rockets.findIndex(
        (r) => r.id === lastResult.rocketId && r.status === "ready"
      );
      if (rocketIndex === -1) return state;

      const rocket = player.rockets[rocketIndex];

      // Re-roll the dice (this is the actual launch roll)
      const diceRoll = roll1d6(ctx.random);
      const hit = diceRoll <= rocket.accuracy;

      // Check if player CAN use optional reroll token after forced reroll
      const canReroll = !hit && player.hasRerollToken;

      // Calculate salvage bonus
      const salvageBonus = player.upgrades.salvageBonus;

      if (!hit) {
        const updatedRockets = [...player.rockets];
        updatedRockets[rocketIndex] = {
          ...rocket,
          status: "spent",
        };

        const launchResult: LaunchResult = {
          playerId: action.playerId,
          rocketId: rocket.id,
          diceRoll,
          accuracyNeeded: rocket.accuracy,
          hit: false,
          power: rocket.power,
          strengthBefore: state.activeStrengthCard?.currentStrength ?? 0,
          strengthAfter: state.activeStrengthCard?.currentStrength ?? 0,
          destroyed: false,
          baseStrength: state.activeStrengthCard?.baseStrength ?? 0,
          canReroll, // Player can still use token if they have one
          isReroll: true, // This was a forced reroll
          mustReroll: false,
        };

        const updatedPlayer = {
          ...player,
          rockets: updatedRockets,
          hasLaunchedRocketThisTurn: !canReroll,
          resourceCubes: player.resourceCubes + (canReroll ? 0 : salvageBonus),
          hasRerollToken: player.hasRerollToken,
          mustRerollNextLaunch: false, // Consumed
        };

        const forcedRerollMissState = {
          ...state,
          players: {
            ...state.players,
            [action.playerId]: updatedPlayer,
          },
          lastLaunchResult: launchResult,
        };

        // Add action log entry for forced reroll miss
        const forcedRerollMissLogEntry = logLaunchRocket(forcedRerollMissState, action.playerId, launchResult);
        return {
          ...forcedRerollMissState,
          actionLog: [...forcedRerollMissState.actionLog, forcedRerollMissLogEntry],
        };
      }

      // HIT on forced reroll: Process strength damage
      let activeStrengthCard = state.activeStrengthCard;
      let strengthDeck = [...state.strengthDeck];

      if (!activeStrengthCard) {
        if (strengthDeck.length === 0) return state;
        activeStrengthCard = strengthDeck[0];
        strengthDeck = strengthDeck.slice(1);
      }

      let updatedStrengthCard: StrengthCard | null = activeStrengthCard;
      let destroyed = false;
      let trophyCard: StrengthCard | null = null;
      let finalDestroyerId = state.finalDestroyerId;

      if (rocket.power >= activeStrengthCard.currentStrength) {
        destroyed = true;
        trophyCard = activeStrengthCard;
        updatedStrengthCard = null;

        if (strengthDeck.length === 0) {
          finalDestroyerId = action.playerId;
        }
      } else {
        updatedStrengthCard = {
          ...activeStrengthCard,
          currentStrength: activeStrengthCard.currentStrength - rocket.power,
        };
      }

      const updatedRockets = [...player.rockets];
      updatedRockets[rocketIndex] = {
        ...rocket,
        status: "spent",
      };

      const updatedTrophies = trophyCard
        ? [...player.trophies, trophyCard]
        : player.trophies;

      const launchResult: LaunchResult = {
        playerId: action.playerId,
        rocketId: rocket.id,
        diceRoll,
        accuracyNeeded: rocket.accuracy,
        hit: true,
        power: rocket.power,
        strengthBefore: activeStrengthCard.currentStrength,
        strengthAfter: destroyed ? 0 : (updatedStrengthCard?.currentStrength ?? 0),
        destroyed,
        baseStrength: activeStrengthCard.baseStrength,
        canReroll: false,
        isReroll: true,
        mustReroll: false,
      };

      const updatedPlayer = {
        ...player,
        rockets: updatedRockets,
        trophies: updatedTrophies,
        hasLaunchedRocketThisTurn: true,
        resourceCubes: player.resourceCubes + salvageBonus,
        hasRerollToken: player.hasRerollToken,
        mustRerollNextLaunch: false,
      };

      const totalDestroyed = Object.values(state.players).reduce(
        (sum, p) => sum + p.trophies.length,
        0
      ) + (destroyed ? 1 : 0);

      const cometDestroyed = totalDestroyed >= state.totalStrengthCards && !updatedStrengthCard && strengthDeck.length === 0;

      if (cometDestroyed) {
        const newState = {
          ...state,
          strengthDeck,
          activeStrengthCard: updatedStrengthCard,
          players: {
            ...state.players,
            [action.playerId]: updatedPlayer,
          },
          lastLaunchResult: launchResult,
          finalDestroyerId,
          phase: "gameOver" as CometRushPhase,
          cometDestroyed: true,
          earthDestroyed: false,
        };
        const finalState = {
          ...newState,
          winnerIds: determineWinners(newState),
        };
        // Add action log entries
        const forcedRerollHitLogEntry = logLaunchRocket(finalState, action.playerId, launchResult);
        const gameOverLogEntry = logGameOver(finalState, "cometDestroyed");
        return {
          ...finalState,
          actionLog: [...finalState.actionLog, forcedRerollHitLogEntry, gameOverLogEntry],
        };
      }

      const forcedRerollHitState = {
        ...state,
        strengthDeck,
        activeStrengthCard: updatedStrengthCard,
        players: {
          ...state.players,
          [action.playerId]: updatedPlayer,
        },
        lastLaunchResult: launchResult,
        finalDestroyerId,
      };

      // Add action log entry
      const forcedRerollHitLogEntry = logLaunchRocket(forcedRerollHitState, action.playerId, launchResult);
      return {
        ...forcedRerollHitState,
        actionLog: [...forcedRerollHitState.actionLog, forcedRerollHitLogEntry],
      };
    }

    case "CLEAR_CARD_RESULT": {
      if (!state.lastCardResult) return state;
      if (state.lastCardResult.playerId !== action.playerId) return state;

      return {
        ...state,
        lastCardResult: null,
      };
    }

    case "RESPOND_TO_DIPLOMATIC_PRESSURE": {
      if (state.phase !== "playing") return state;
      if (!state.pendingDiplomaticPressure) return state;

      const pending = state.pendingDiplomaticPressure;

      // Only the target can respond
      if (action.playerId !== pending.targetId) return state;

      const payload = action.payload as RespondToDiplomaticPressurePayload | undefined;
      if (!payload) return state;

      const attacker = state.players[pending.attackerId];
      const target = state.players[pending.targetId];
      if (!attacker || !target) return state;

      // Find the attacker's Diplomatic Pressure card (still in their hand)
      const attackerCard = attacker.hand.find(
        (c) => c.deck === "espionage" && (c as EspionageCard).cardType === "DIPLOMATIC_PRESSURE"
      );

      if (payload.counter) {
        // Target chose to counter! Both cards are discarded, attack is nullified
        const counterCard = target.hand.find((c) => c.id === pending.counterCardId);
        if (!counterCard) return state; // Counter card no longer exists

        // Remove both cards from hands
        const newAttackerHand = attacker.hand.filter(
          (c) => !(c.deck === "espionage" && (c as EspionageCard).cardType === "DIPLOMATIC_PRESSURE")
        );
        const newTargetHand = target.hand.filter((c) => c.id !== pending.counterCardId);

        // Add both to espionage discard
        let espionageDiscard = [...state.espionageDiscard];
        if (attackerCard) {
          espionageDiscard = [...espionageDiscard, attackerCard as EspionageCard];
        }
        espionageDiscard = [...espionageDiscard, counterCard as EspionageCard];

        return {
          ...state,
          players: {
            ...state.players,
            [pending.attackerId]: {
              ...attacker,
              hand: newAttackerHand,
            },
            [pending.targetId]: {
              ...target,
              hand: newTargetHand,
            },
          },
          espionageDiscard,
          pendingDiplomaticPressure: null,
          lastCardResult: {
            id: `${ctx.now()}`,
            playerId: pending.targetId,
            description: `${target.name} countered with their own Diplomatic Pressure! Both cards discarded.`,
            cardName: "Diplomatic Pressure",
          },
        };
      } else {
        // Target chose not to counter - attack succeeds
        // Remove attacker's card and discard it
        const newAttackerHand = attacker.hand.filter(
          (c) => !(c.deck === "espionage" && (c as EspionageCard).cardType === "DIPLOMATIC_PRESSURE")
        );

        let espionageDiscard = [...state.espionageDiscard];
        if (attackerCard) {
          espionageDiscard = [...espionageDiscard, attackerCard as EspionageCard];
        }

        return {
          ...state,
          players: {
            ...state.players,
            [pending.attackerId]: {
              ...attacker,
              hand: newAttackerHand,
            },
            [pending.targetId]: {
              ...target,
              isUnderDiplomaticPressure: true,
            },
          },
          espionageDiscard,
          pendingDiplomaticPressure: null,
          lastCardResult: {
            id: `${ctx.now()}`,
            playerId: pending.targetId,
            description: `${target.name} accepted the Diplomatic Pressure. Their next card play will be blocked!`,
            cardName: "Diplomatic Pressure",
          },
        };
      }
    }

    case "END_TURN": {
      if (state.phase !== "playing") return state;

      const activePlayerId = getActivePlayerId(state);
      if (action.playerId !== activePlayerId) return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      let nextIndex = state.activePlayerIndex + 1;
      let round = state.round;
      let distanceToImpact = state.distanceToImpact;
      let movementDeck = [...state.movementDeck];
      let movementDiscard = [...state.movementDiscard];
      let lastMovementCard = state.lastMovementCard;
      let phase: CometRushPhase = state.phase;
      let winnerIds = state.winnerIds;
      let earthDestroyed = state.earthDestroyed;

      const wrapped = nextIndex >= state.playerOrder.length;

      if (wrapped) {
        nextIndex = 0;
        round += 1;

        const top = movementDeck[0];
        if (top) {
          movementDeck = movementDeck.slice(1);
          movementDiscard = [top, ...movementDiscard];
          distanceToImpact = distanceToImpact - top.moveSpaces;
          lastMovementCard = top;

          if (distanceToImpact <= 0) {
            phase = "gameOver";
            earthDestroyed = true;
            const endState = {
              ...state,
              earthDestroyed: true,
              cometDestroyed: false,
            };
            winnerIds = determineWinners(endState);
          }
        }
      }

      const nextPlayerId = state.playerOrder[nextIndex];
      const nextPlayer = state.players[nextPlayerId];

      const endTurnState = {
        ...state,
        activePlayerIndex: nextIndex,
        round,
        distanceToImpact,
        movementDeck,
        movementDiscard,
        lastMovementCard,
        phase,
        winnerIds,
        earthDestroyed,
        turnMeta: phase === "playing" && nextPlayer ? {
          playerId: nextPlayerId,
          incomeGained: 0,
          newTotalCubes: nextPlayer.resourceCubes,
          lastDrawnCardId: null,
          lastDrawnDeck: null,
          wasEmbargoed: false,
          cardsDrawnThisTurn: 0,
        } : null,
      };

      // Build log entries
      const logEntries: MultiplayerLogEntry[] = [];

      // Log end turn
      logEntries.push(logEndTurn(endTurnState, action.playerId));

      // If round wrapped, log round end
      if (wrapped && lastMovementCard) {
        logEntries.push(logRoundEnd(endTurnState, action.playerId, lastMovementCard.moveSpaces, distanceToImpact));
      }

      // If game over due to earth destroyed, log it
      if (earthDestroyed && phase === "gameOver") {
        logEntries.push(logGameOver(endTurnState, "earthDestroyed"));
      }

      return {
        ...endTurnState,
        actionLog: [...endTurnState.actionLog, ...logEntries],
      };
    }

    case "PLAY_AGAIN": {
      const isHost = ctx.room.hostId === ctx.playerId;
      if (!isHost || state.phase !== "gameOver") return state;

      // Reset to initial state but keep players
      const players = ctx.room.players;
      return initialState(players);
    }

    default:
      return state;
  }
}

// ============================================================================
// ACTION PERMISSIONS
// ============================================================================

function isActionAllowed(
  state: CometRushState,
  action: CometRushAction,
  ctx: GameContext
): boolean {
  const isHost = ctx.room.hostId === ctx.playerId;
  const activePlayerId = getActivePlayerId(state);

  switch (action.type) {
    case "START_GAME":
      return isHost && state.phase === "lobby";

    case "BEGIN_TURN":
    case "DRAW_CARD":
    case "PLAY_CARD":
    case "TRADE_CARDS":
    case "BUILD_ROCKET":
    case "LAUNCH_ROCKET":
    case "USE_REROLL":
    case "END_TURN":
      return state.phase === "playing" && ctx.playerId === activePlayerId;

    case "CONFIRM_ROLL":
      // Only the player who initiated the launch can confirm the roll
      return state.phase === "playing" &&
             state.pendingLaunch !== null &&
             state.pendingLaunch.playerId === ctx.playerId;

    case "CLEAR_CARD_RESULT":
      return state.phase === "playing";

    case "RESPOND_TO_DIPLOMATIC_PRESSURE":
      // The target of the attack can respond (even if not their turn)
      return state.phase === "playing" &&
             state.pendingDiplomaticPressure !== null &&
             state.pendingDiplomaticPressure.targetId === ctx.playerId;

    case "PLAY_AGAIN":
      return isHost && state.phase === "gameOver";

    default:
      return true;
  }
}

// ============================================================================
// GAME REGISTRATION
// ============================================================================

export const cometRushGame = defineGame<CometRushState, CometRushAction>({
  id: "comet-rush",
  name: "Comet Rush",
  description: "Build rockets and destroy the comet before it hits Earth!",
  minPlayers: 2,
  maxPlayers: 4,
  initialState,
  reducer,
  getPhase,
  isActionAllowed,
});

// Export helper for views to calculate scores
export { calculateScores };
