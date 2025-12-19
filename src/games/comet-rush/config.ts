import { defineGame } from "@/engine/defineGame";
import type { BaseAction, GamePhase, GameContext, Player } from "@/engine/types";

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

// Card deck types
export type CardDeckType = "engineering" | "political";

// Engineering card types
export type EngineeringCardType =
  | "BOOST_POWER"           // +1 max power cap (9 cards)
  | "IMPROVE_ACCURACY"      // +1 max accuracy cap (9 cards)
  | "STREAMLINED_ASSEMBLY"  // -1 build time for one rocket (9 cards)
  | "MASS_PRODUCTION"       // -1 build time for all rockets (4 cards)
  | "INCREASE_INCOME"       // +1 income permanently, max 3 stacks (12 cards)
  | "ROCKET_SALVAGE"        // +1 resource per launch, max 3 stacks (9 cards)
  | "REROLL_PROTOCOL"       // Re-roll failed launch (9 cards)
  | "COMET_RESEARCH";       // Peek at comet strength or movement (9 cards)

// Political card types
export type PoliticalCardType =
  | "RESOURCE_SEIZURE"      // Steal 2 resources from player (6 cards)
  | "TECHNOLOGY_THEFT"      // Steal random card from player (6 cards)
  | "EMBARGO"               // Target gains no income next turn (4 cards)
  | "SABOTAGE"              // Force re-roll on launch (6 cards)
  | "REGULATORY_REVIEW"     // +1 build time to opponent's rocket (6 cards)
  | "EMERGENCY_FUNDING"     // Gain income immediately (6 cards)
  | "PUBLIC_DONATION_DRIVE" // +1 resource per rocket (6 cards)
  | "INTERNATIONAL_GRANT";  // You get 5, all others get 1 (4 cards)

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
}

// Engineering card
export interface EngineeringCard extends BaseCard {
  deck: "engineering";
  cardType: EngineeringCardType;
}

// Political card
export interface PoliticalCard extends BaseCard {
  deck: "political";
  cardType: PoliticalCardType;
}

// Union type for any card in hand
export type GameCard = EngineeringCard | PoliticalCard;

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
  powerBonus: number;         // Legacy field, kept for compatibility
  accuracyBonus: number;      // Legacy field, kept for compatibility
  buildTimeBonus: number;     // Legacy field, kept for compatibility
  maxRocketsBonus: number;    // Legacy field, kept for compatibility
  // Hard caps for sliders (raised by Boost Power / Improve Accuracy cards)
  powerCap: number;           // Default 3, max 6
  accuracyCap: number;        // Default 3, max 6
  buildTimeCap: number;       // Legacy field, kept at 3
}

export interface CometRushPlayerState {
  id: string;
  name: string;
  resourceCubes: number;
  baseIncome: number;
  maxConcurrentRockets: number;
  rockets: Rocket[];
  hand: GameCard[];           // Now contains both Engineering and Political cards
  upgrades: PlayerUpgrades;
  trophies: StrengthCard[];
  // Turn-based flags (reset each turn)
  hasBuiltRocketThisTurn: boolean;
  hasLaunchedRocketThisTurn: boolean;
  // For peek cards - private info revealed to player
  peekedMovementCard: MovementCard | null;
  peekedStrengthCard: StrengthCard | null;
  // Re-roll Protocol: player can re-roll if launch fails (consumed on use)
  hasRerollToken: boolean;
  // Embargo: if true, player gains no income this turn (reset after BEGIN_TURN)
  isEmbargoed: boolean;
  // Sabotage: if set, this player must re-roll their next launch
  mustRerollNextLaunch: boolean;
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
}

export interface TurnMeta {
  playerId: string;
  incomeGained: number;
  newTotalCubes: number;
  lastDrawnCardId: string | null;
  lastDrawnDeck: CardDeckType | null;  // Which deck the card was drawn from
}

export interface CardResult {
  id: string;
  playerId: string;
  description: string;
  cardName: string;
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

  // Political deck (interaction & disruption)
  politicalDeck: PoliticalCard[];
  politicalDiscard: PoliticalCard[];

  // Per player state
  players: Record<string, CometRushPlayerState>;

  // Last launch result for display
  lastLaunchResult: LaunchResult | null;

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
}

// ============================================================================
// ACTIONS
// ============================================================================

export type CometRushActionType =
  | "START_GAME"
  | "BEGIN_TURN"
  | "DRAW_CARD"           // Draw from chosen deck (Engineering or Political)
  | "PLAY_CARD"           // Play a single card from hand
  | "BUILD_ROCKET"
  | "LAUNCH_ROCKET"
  | "USE_REROLL"          // Use re-roll token after a failed launch
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
  peekChoice?: "strength" | "movement";  // For Comet Research card
}

export interface BuildRocketPayload {
  buildTimeBase: number;
  power: number;
  accuracy: number;
}

export interface LaunchRocketPayload {
  rocketId: string;
}

export interface CometRushAction extends BaseAction {
  type: CometRushActionType;
  payload?: DrawCardPayload | PlayCardPayload | BuildRocketPayload | LaunchRocketPayload | Record<string, never>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STARTING_CUBES = 20;
const BASE_INCOME = 5;
const BASE_DISTANCE_TO_IMPACT = 18;
const BASE_MAX_ROCKETS = 3;

// Strength card scaling by player count:
// - 2 players: 4 strength cards
// - 3 players: 5 strength cards (baseline)
// - 4 players: 6 strength cards
function getStrengthCardCount(playerCount: number): number {
  if (playerCount <= 2) return 4;
  if (playerCount >= 4) return 6;
  return 5; // 3 players is baseline
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

// Engineering Deck: 70 cards total
// Theme: Rocket engineering, logistics, efficiency, and reliability
function createEngineeringDeck(): EngineeringCard[] {
  const cards: EngineeringCard[] = [];
  let idCounter = 1;

  const add = (
    cardType: EngineeringCardType,
    count: number,
    name: string,
    description: string
  ) => {
    for (let i = 0; i < count; i++) {
      cards.push({
        id: `E${idCounter++}`,
        deck: "engineering",
        cardType,
        name,
        description,
      });
    }
  };

  // Core Upgrade Cards
  add("BOOST_POWER", 9, "Boost Power", "+1 max power build cap");
  add("IMPROVE_ACCURACY", 9, "Improve Accuracy", "+1 max accuracy build cap");
  add("STREAMLINED_ASSEMBLY", 9, "Streamlined Assembly", "Reduce build time of one rocket by 1");
  add("MASS_PRODUCTION", 4, "Mass Production", "Reduce build time of all rockets by 1");

  // Economy & Efficiency
  add("INCREASE_INCOME", 12, "Increase Income", "+1 income permanently (max 3)");
  add("ROCKET_SALVAGE", 9, "Rocket Salvage", "+1 resource per rocket launch (max 3)");

  // Risk Management & Information
  add("REROLL_PROTOCOL", 9, "Re-roll Protocol", "If your next launch fails, re-roll once");
  add("COMET_RESEARCH", 9, "Comet Research", "Peek at top Comet Strength or Movement card");

  return cards;
}

// Political Deck: 44 cards total
// Theme: Politics, regulation, public funding, interference
function createPoliticalDeck(): PoliticalCard[] {
  const cards: PoliticalCard[] = [];
  let idCounter = 1;

  const add = (
    cardType: PoliticalCardType,
    count: number,
    name: string,
    description: string
  ) => {
    for (let i = 0; i < count; i++) {
      cards.push({
        id: `P${idCounter++}`,
        deck: "political",
        cardType,
        name,
        description,
      });
    }
  };

  // Direct Player Interaction
  add("RESOURCE_SEIZURE", 6, "Resource Seizure", "Steal 2 resources from another player");
  add("TECHNOLOGY_THEFT", 6, "Technology Theft", "Steal a random card from another player");
  add("EMBARGO", 4, "Embargo", "Target player gains no income next turn");

  // Launch Disruption
  add("SABOTAGE", 6, "Sabotage", "Force another player to re-roll a rocket launch");
  add("REGULATORY_REVIEW", 6, "Regulatory Review", "Delay another player's rocket by +1 build time");

  // Funding & Politics
  add("EMERGENCY_FUNDING", 6, "Emergency Funding", "Gain your income immediately");
  add("PUBLIC_DONATION_DRIVE", 6, "Public Donation Drive", "+1 resource for each rocket you have");
  add("INTERNATIONAL_GRANT", 4, "International Grant", "You gain 5 resources, all others gain 1");

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
  // Build Time Cost determines delay and cube cost: BTC 1 = 1 cube + 2 turns, BTC 2 = 2 cubes + 1 turn, BTC 3 = 3 cubes + instant
  return power + accuracy + buildTimeCost;
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
    politicalDeck: [],
    politicalDiscard: [],
    players: playersState,
    lastLaunchResult: null,
    turnMeta: null,
    lastCardResult: null,
    finalDestroyerId: null,
    totalStrengthCards: 0, // Set during START_GAME based on player count
    winnerIds: [],
    earthDestroyed: false,
    cometDestroyed: false,
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

      // Calculate strength card count based on player count
      const playerCount = state.playerOrder.length;
      const strengthCardCount = getStrengthCardCount(playerCount);

      // Build and shuffle decks
      const movementDeck = shuffle(createMovementDeck(), ctx.random);
      const strengthDeck = shuffle(createStrengthDeck(strengthCardCount), ctx.random);
      const engineeringDeck = shuffle(createEngineeringDeck(), ctx.random);
      const politicalDeck = shuffle(createPoliticalDeck(), ctx.random);

      // Deal initial hands: 2 Engineering + 2 Political cards each
      const updatedPlayers = { ...state.players };
      let currentEngineeringDeck = [...engineeringDeck];
      let currentPoliticalDeck = [...politicalDeck];

      for (const playerId of state.playerOrder) {
        const player = updatedPlayers[playerId];
        if (!player) continue;

        const engineeringCards = currentEngineeringDeck.slice(0, 2);
        currentEngineeringDeck = currentEngineeringDeck.slice(2);

        const politicalCards = currentPoliticalDeck.slice(0, 2);
        currentPoliticalDeck = currentPoliticalDeck.slice(2);

        updatedPlayers[playerId] = {
          ...player,
          hand: [...engineeringCards, ...politicalCards],
        };
      }

      // Initialize turnMeta for first player
      const firstPlayerId = state.playerOrder[0];

      return {
        ...state,
        phase: "playing",
        round: 1,
        movementDeck,
        strengthDeck,
        totalStrengthCards: strengthCardCount,
        engineeringDeck: currentEngineeringDeck,
        engineeringDiscard: [],
        politicalDeck: currentPoliticalDeck,
        politicalDiscard: [],
        activeStrengthCard: null,
        lastMovementCard: null,
        players: updatedPlayers,
        lastLaunchResult: null,
        turnMeta: {
          playerId: firstPlayerId,
          incomeGained: 0,
          newTotalCubes: updatedPlayers[firstPlayerId]?.resourceCubes ?? 0,
          lastDrawnCardId: null,
          lastDrawnDeck: null,
        },
      };
    }

    case "BEGIN_TURN": {
      if (state.phase !== "playing") return state;

      const activePlayerId = getActivePlayerId(state);
      if (action.playerId !== activePlayerId) return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      // Calculate income (skip if embargoed)
      const income = player.isEmbargoed ? 0 : (player.baseIncome + player.upgrades.incomeBonus);
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

      return {
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
        },
      };
    }

    case "DRAW_CARD": {
      if (state.phase !== "playing") return state;

      const activePlayerId = getActivePlayerId(state);
      if (action.playerId !== activePlayerId) return state;

      // Must have called BEGIN_TURN first
      if (!state.turnMeta || state.turnMeta.playerId !== action.playerId) return state;

      // Already drew a card this turn
      if (state.turnMeta.lastDrawnCardId !== null) return state;

      const payload = action.payload as DrawCardPayload | undefined;
      if (!payload || !payload.deck) return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      const deckType = payload.deck;
      let engineeringDeck = [...state.engineeringDeck];
      let engineeringDiscard = [...state.engineeringDiscard];
      let politicalDeck = [...state.politicalDeck];
      let politicalDiscard = [...state.politicalDiscard];
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
      } else {
        // Political deck
        if (politicalDeck.length === 0 && politicalDiscard.length > 0) {
          politicalDeck = shuffle(politicalDiscard, ctx.random);
          politicalDiscard = [];
        }

        if (politicalDeck.length > 0) {
          const drawnCard = politicalDeck[0];
          drawnCardId = drawnCard.id;
          politicalDeck = politicalDeck.slice(1);
          newHand = [...player.hand, drawnCard];
        }
      }

      const updatedPlayer: CometRushPlayerState = {
        ...player,
        hand: newHand,
      };

      return {
        ...state,
        engineeringDeck,
        engineeringDiscard,
        politicalDeck,
        politicalDiscard,
        players: {
          ...state.players,
          [action.playerId]: updatedPlayer,
        },
        turnMeta: {
          ...state.turnMeta,
          lastDrawnCardId: drawnCardId,
          lastDrawnDeck: deckType,
        },
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

      // Find the card in hand
      const card = player.hand.find((c) => c.id === payload.cardId);
      if (!card) return state;

      let updatedPlayers = { ...state.players };
      let updatedPlayer = { ...player };
      let resultDescription = "";
      let engineeringDiscard = [...state.engineeringDiscard];
      let politicalDiscard = [...state.politicalDiscard];

      // Handle Engineering cards
      if (card.deck === "engineering") {
        const engCard = card as EngineeringCard;

        switch (engCard.cardType) {
          case "BOOST_POWER": {
            // +1 max power cap (max 6)
            const newCap = Math.min(6, updatedPlayer.upgrades.powerCap + 1);
            if (newCap === updatedPlayer.upgrades.powerCap) {
              resultDescription = "Power cap already at maximum (6).";
            } else {
              updatedPlayer.upgrades = {
                ...updatedPlayer.upgrades,
                powerCap: newCap,
              };
              resultDescription = `Power upgraded! Max power increased to ${newCap}.`;
            }
            break;
          }

          case "IMPROVE_ACCURACY": {
            // +1 max accuracy cap (max 6)
            const newCap = Math.min(6, updatedPlayer.upgrades.accuracyCap + 1);
            if (newCap === updatedPlayer.upgrades.accuracyCap) {
              resultDescription = "Accuracy cap already at maximum (6).";
            } else {
              updatedPlayer.upgrades = {
                ...updatedPlayer.upgrades,
                accuracyCap: newCap,
              };
              resultDescription = `Accuracy upgraded! Max accuracy increased to ${newCap}.`;
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
              resultDescription = `Salvage bonus increased! Gain +${updatedPlayer.upgrades.salvageBonus} resource(s) per rocket launch.`;
            }
            break;
          }

          case "REROLL_PROTOCOL": {
            // Grant re-roll token
            updatedPlayer.hasRerollToken = true;
            resultDescription = "Re-roll Protocol active! Your next failed launch can be re-rolled.";
            break;
          }

          case "COMET_RESEARCH": {
            // Peek at strength or movement deck
            if (!payload.peekChoice) return state;

            if (payload.peekChoice === "strength") {
              if (state.strengthDeck.length > 0) {
                const topCard = state.strengthDeck[0];
                updatedPlayer.peekedStrengthCard = topCard;
                resultDescription = `Comet Research: Next segment has strength ${topCard.baseStrength}.`;
              } else if (state.activeStrengthCard) {
                updatedPlayer.peekedStrengthCard = state.activeStrengthCard;
                resultDescription = `Comet Research: Current segment has strength ${state.activeStrengthCard.currentStrength}.`;
              } else {
                resultDescription = "No strength cards remaining.";
              }
            } else {
              if (state.movementDeck.length > 0) {
                const topCard = state.movementDeck[0];
                updatedPlayer.peekedMovementCard = topCard;
                resultDescription = `Comet Research: Next movement is ${topCard.moveSpaces} space(s).`;
              } else {
                resultDescription = "No movement cards remaining.";
              }
            }
            break;
          }

          default:
            return state;
        }

        // Move to engineering discard
        engineeringDiscard = [...engineeringDiscard, engCard];

      } else {
        // Handle Political cards
        const polCard = card as PoliticalCard;

        switch (polCard.cardType) {
          case "RESOURCE_SEIZURE": {
            // Steal 2 resources from another player
            if (!payload.targetPlayerId) return state;
            const targetPlayer = state.players[payload.targetPlayerId];
            if (!targetPlayer || payload.targetPlayerId === action.playerId) return state;

            const stealAmount = Math.min(2, targetPlayer.resourceCubes);
            updatedPlayers = {
              ...updatedPlayers,
              [payload.targetPlayerId]: {
                ...targetPlayer,
                resourceCubes: targetPlayer.resourceCubes - stealAmount,
              },
            };
            updatedPlayer.resourceCubes += stealAmount;
            resultDescription = `Stole ${stealAmount} cube(s) from ${targetPlayer.name}!`;
            break;
          }

          case "TECHNOLOGY_THEFT": {
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
            resultDescription = `Stole "${stolenCard.name}" from ${targetPlayer.name}!`;
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

          case "SABOTAGE": {
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
            resultDescription = `${targetPlayer.name}'s next rocket launch will be sabotaged!`;
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
            resultDescription = `Delayed ${targetPlayer.name}'s rocket by 1 turn!`;
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
            // +1 resource per rocket (building or complete)
            const rocketCount = updatedPlayer.rockets.filter(
              (r) => r.status === "building" || r.status === "ready"
            ).length;
            updatedPlayer.resourceCubes += rocketCount;
            resultDescription = rocketCount > 0
              ? `Public Donation Drive! Gained ${rocketCount} cube(s) from ${rocketCount} rocket(s).`
              : "No rockets to generate donations.";
            break;
          }

          case "INTERNATIONAL_GRANT": {
            // You get 5, all others get 1
            updatedPlayer.resourceCubes += 5;
            for (const otherId of state.playerOrder) {
              if (otherId === action.playerId) continue;
              const otherPlayer = state.players[otherId];
              if (!otherPlayer) continue;
              updatedPlayers = {
                ...updatedPlayers,
                [otherId]: {
                  ...otherPlayer,
                  resourceCubes: otherPlayer.resourceCubes + 1,
                },
              };
            }
            resultDescription = "International Grant! You gained 5 cubes, all others gained 1.";
            break;
          }

          default:
            return state;
        }

        // Move to political discard
        politicalDiscard = [...politicalDiscard, polCard];
      }

      // Remove played card from hand
      updatedPlayer.hand = updatedPlayer.hand.filter((c) => c.id !== payload.cardId);
      updatedPlayers[action.playerId] = updatedPlayer;

      return {
        ...state,
        players: updatedPlayers,
        engineeringDiscard,
        politicalDiscard,
        lastCardResult: resultDescription
          ? {
              id: `${ctx.now()}`,
              playerId: action.playerId,
              description: resultDescription,
              cardName: card.name,
            }
          : null,
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
      const effectiveAccuracy = Math.min(6, accuracy);

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

      return {
        ...state,
        players: {
          ...state.players,
          [action.playerId]: updatedPlayer,
        },
      };
    }

    case "LAUNCH_ROCKET": {
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

      // Roll 1d6 for accuracy
      let diceRoll = roll1d6(ctx.random);
      let hit = diceRoll <= rocket.accuracy;

      // Handle sabotage (must re-roll)
      if (player.mustRerollNextLaunch) {
        diceRoll = roll1d6(ctx.random);
        hit = diceRoll <= rocket.accuracy;
      }

      // If MISS and has re-roll token, use it
      if (!hit && player.hasRerollToken) {
        diceRoll = roll1d6(ctx.random);
        hit = diceRoll <= rocket.accuracy;
      }

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
        };

        const updatedPlayer = {
          ...player,
          rockets: updatedRockets,
          hasLaunchedRocketThisTurn: true,
          resourceCubes: player.resourceCubes + salvageBonus,
          hasRerollToken: false, // Consumed even on miss
          mustRerollNextLaunch: false, // Consumed
        };

        return {
          ...state,
          players: {
            ...state.players,
            [action.playerId]: updatedPlayer,
          },
          lastLaunchResult: launchResult,
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
        hit,
        power: rocket.power,
        strengthBefore: activeStrengthCard.currentStrength,
        strengthAfter: destroyed ? 0 : (updatedStrengthCard?.currentStrength ?? 0),
        destroyed,
        baseStrength: activeStrengthCard.baseStrength,
      };

      const updatedPlayer = {
        ...player,
        rockets: updatedRockets,
        trophies: updatedTrophies,
        hasLaunchedRocketThisTurn: true,
        resourceCubes: player.resourceCubes + salvageBonus,
        hasRerollToken: false,
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
        return {
          ...newState,
          winnerIds: determineWinners(newState),
        };
      }

      return {
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
    }

    case "USE_REROLL": {
      // This action is handled inline in LAUNCH_ROCKET
      // The re-roll token is automatically used on a miss
      return state;
    }

    case "CLEAR_CARD_RESULT": {
      if (!state.lastCardResult) return state;
      if (state.lastCardResult.playerId !== action.playerId) return state;

      return {
        ...state,
        lastCardResult: null,
      };
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

      return {
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
        } : null,
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
    case "BUILD_ROCKET":
    case "LAUNCH_ROCKET":
    case "USE_REROLL":
    case "END_TURN":
      return state.phase === "playing" && ctx.playerId === activePlayerId;

    case "CLEAR_CARD_RESULT":
      return state.phase === "playing";

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
