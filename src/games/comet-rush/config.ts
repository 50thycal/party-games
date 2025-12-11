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

export type ResearchType = "ROCKET_UPGRADE" | "COMET_INSIGHT" | "SABOTAGE";

export type ResearchTag =
  | "POWER"
  | "ACCURACY"
  | "BUILD_TIME"
  | "INCOME"
  | "MAX_ROCKETS"
  | "PEEK_MOVE"
  | "PEEK_STRENGTH"
  | "STEAL_RESOURCES"
  | "STEAL_CARD"
  | "DELAY_BUILD"
  | "FORCE_REROLL";

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

export interface ResearchCard {
  id: string;
  type: ResearchType;
  tag: ResearchTag;
  setKey: string;
  setSizeRequired: number;
  name: string;
  description: string;
}

// ============================================================================
// PLAYER STATE
// ============================================================================

export interface Rocket {
  id: string;
  buildTimeBase: number;
  buildTimeRemaining: number;
  power: number;
  accuracy: number; // 1-12, compared against 2d6 roll
  costCubes: number;
  status: RocketStatus;
}

export interface PlayerUpgrades {
  incomeBonus: number;
  powerBonus: number;
  accuracyBonus: number;
  buildTimeBonus: number;
  maxRocketsBonus: number;
  // Hard caps for sliders (raised by research cards)
  powerCap: number;
  accuracyCap: number;
  buildTimeCap: number;
}

export interface CometRushPlayerState {
  id: string;
  name: string;
  resourceCubes: number;
  baseIncome: number;
  maxConcurrentRockets: number;
  rockets: Rocket[];
  hand: ResearchCard[];
  upgrades: PlayerUpgrades;
  trophies: StrengthCard[];
  hasPlayedResearchThisTurn: boolean;
  hasBuiltRocketThisTurn: boolean;
  hasLaunchedRocketThisTurn: boolean;
  // For peek cards - private info revealed to player
  peekedMovementCard: MovementCard | null;
  peekedStrengthCard: StrengthCard | null;
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
}

export interface TurnMeta {
  playerId: string;
  incomeGained: number;
  newTotalCubes: number;
  lastDrawnCardId: string | null;
}

export interface ResearchResult {
  id: string;
  playerId: string;
  description: string;
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

  researchDeck: ResearchCard[];
  researchDiscard: ResearchCard[];

  // Per player state
  players: Record<string, CometRushPlayerState>;

  // Last launch result for display
  lastLaunchResult: LaunchResult | null;

  // Turn-start wizard meta (for UI)
  turnMeta: TurnMeta | null;

  // Last research result for popup feedback
  lastResearchResult: ResearchResult | null;

  // Player who destroyed the final strength card (bonus points)
  finalDestroyerId: string | null;

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
  | "DRAW_TURN_CARD"
  | "PLAY_RESEARCH_SET"
  | "BUILD_ROCKET"
  | "LAUNCH_ROCKET"
  | "END_TURN"
  | "CYCLE_RESEARCH"
  | "CLEAR_RESEARCH_RESULT"
  | "PLAY_AGAIN";

export interface PlayResearchPayload {
  cardIds: string[];
  targetPlayerId?: string;
  targetRocketId?: string;
}

export interface BuildRocketPayload {
  buildTimeBase: number;
  power: number;
  accuracy: number;
}

export interface LaunchRocketPayload {
  rocketId: string;
}

export interface CycleResearchPayload {
  cardIds: string[]; // must be exactly 3
}

export interface CometRushAction extends BaseAction {
  type: CometRushActionType;
  payload?: PlayResearchPayload | BuildRocketPayload | LaunchRocketPayload | CycleResearchPayload | Record<string, never>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const STARTING_CUBES = 5;
const BASE_INCOME = 2;
const BASE_DISTANCE_TO_IMPACT = 18;
const BASE_MAX_ROCKETS = 2;
const TOTAL_STRENGTH_CARDS = 6; // How many need to be destroyed to win

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

function createStrengthDeck(): StrengthCard[] {
  const cards: StrengthCard[] = [];
  let idCounter = 1;
  // Create 6 strength cards with values 4-9
  for (let strength = 4; strength <= 9; strength++) {
    cards.push({
      id: `S${idCounter++}`,
      baseStrength: strength,
      currentStrength: strength,
    });
  }
  return cards;
}

function createResearchDeck(): ResearchCard[] {
  const cards: ResearchCard[] = [];
  let idCounter = 1;

  const add = (
    type: ResearchType,
    tag: ResearchTag,
    setKey: string,
    setSizeRequired: number,
    count: number,
    name: string,
    description: string
  ) => {
    for (let i = 0; i < count; i++) {
      cards.push({
        id: `R${idCounter++}`,
        type,
        tag,
        setKey,
        setSizeRequired,
        name,
        description,
      });
    }
  };

  // Rocket upgrades (require 2 cards of same type)
  add("ROCKET_UPGRADE", "POWER", "POWER", 2, 4, "Power Boost", "+1 power to future rockets");
  add("ROCKET_UPGRADE", "ACCURACY", "ACCURACY", 2, 4, "Targeting System", "+1 accuracy to future rockets");
  add("ROCKET_UPGRADE", "BUILD_TIME", "BUILD_TIME", 2, 4, "Quick Assembly", "-1 build time for future rockets");
  add("ROCKET_UPGRADE", "INCOME", "INCOME", 2, 4, "Resource Mining", "+1 resource income per round");
  add("ROCKET_UPGRADE", "MAX_ROCKETS", "MAX_ROCKETS", 2, 4, "Launch Pad", "+1 max concurrent rockets");

  // Comet insight (require 1 card)
  add("COMET_INSIGHT", "PEEK_MOVE", "PEEK_MOVE", 1, 3, "Trajectory Analysis", "Peek at top movement card");
  add("COMET_INSIGHT", "PEEK_STRENGTH", "PEEK_STRENGTH", 1, 3, "Surface Scan", "Peek at top strength card");

  // Sabotage (varying requirements)
  add("SABOTAGE", "STEAL_RESOURCES", "STEAL_RESOURCES", 2, 3, "Resource Raid", "Steal 2 cubes from another player");
  add("SABOTAGE", "STEAL_CARD", "STEAL_CARD", 2, 3, "Espionage", "Steal a random card from another player");
  add("SABOTAGE", "DELAY_BUILD", "DELAY_BUILD", 1, 3, "Sabotage", "Delay an opponent's rocket by 1 turn");

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

function calculateRocketCost(buildTimeBase: number, power: number, accuracy: number): number {
  const accuracyCost = Math.ceil(accuracy / 2);
  const buildTimeCost = Math.max(0, 4 - buildTimeBase);
  return power + accuracyCost + buildTimeCost;
}

function roll2d6(random: () => number): number {
  const d1 = Math.floor(random() * 6) + 1;
  const d2 = Math.floor(random() * 6) + 1;
  return d1 + d2;
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
      powerBonus: 0,
      accuracyBonus: 0,
      buildTimeBonus: 0,
      maxRocketsBonus: 0,
      powerCap: 4,
      accuracyCap: 4,
      buildTimeCap: 4,
    },
    trophies: [],
    hasPlayedResearchThisTurn: false,
    hasBuiltRocketThisTurn: false,
    hasLaunchedRocketThisTurn: false,
    peekedMovementCard: null,
    peekedStrengthCard: null,
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
    researchDeck: [],
    researchDiscard: [],
    players: playersState,
    lastLaunchResult: null,
    turnMeta: null,
    lastResearchResult: null,
    finalDestroyerId: null,
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

      // Build and shuffle decks
      const movementDeck = shuffle(createMovementDeck(), ctx.random);
      const strengthDeck = shuffle(createStrengthDeck(), ctx.random);
      const researchDeck = shuffle(createResearchDeck(), ctx.random);

      // Deal initial hands (2 cards each)
      const updatedPlayers = { ...state.players };
      let currentDeck = [...researchDeck];

      for (const playerId of state.playerOrder) {
        const player = updatedPlayers[playerId];
        if (!player) continue;

        const drawnCards = currentDeck.slice(0, 2);
        currentDeck = currentDeck.slice(2);

        updatedPlayers[playerId] = {
          ...player,
          hand: drawnCards,
        };
      }

      // Initialize turnMeta for first player (no income/draw yet, they must call BEGIN_TURN)
      const firstPlayerId = state.playerOrder[0];

      return {
        ...state,
        phase: "playing",
        round: 1,
        movementDeck,
        strengthDeck,
        researchDeck: currentDeck,
        movementDiscard: [],
        researchDiscard: [],
        activeStrengthCard: null,
        lastMovementCard: null,
        players: updatedPlayers,
        lastLaunchResult: null,
        turnMeta: {
          playerId: firstPlayerId,
          incomeGained: 0,
          newTotalCubes: updatedPlayers[firstPlayerId]?.resourceCubes ?? 0,
          lastDrawnCardId: null,
        },
      };
    }

    case "BEGIN_TURN": {
      if (state.phase !== "playing") return state;

      const activePlayerId = getActivePlayerId(state);
      if (action.playerId !== activePlayerId) return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      // Calculate income
      const income = player.baseIncome + player.upgrades.incomeBonus;
      const newTotalCubes = player.resourceCubes + income;

      // Advance rocket builds
      const updatedRockets = player.rockets.map((rocket) => {
        if (rocket.status === "building") {
          const newRemaining = rocket.buildTimeRemaining - 1;
          return {
            ...rocket,
            buildTimeRemaining: newRemaining,
            status: newRemaining <= 0 ? ("ready" as RocketStatus) : rocket.status,
          };
        }
        return rocket;
      });

      const updatedPlayer: CometRushPlayerState = {
        ...player,
        resourceCubes: newTotalCubes,
        rockets: updatedRockets,
        hasPlayedResearchThisTurn: false,
        hasBuiltRocketThisTurn: false,
        hasLaunchedRocketThisTurn: false,
        peekedMovementCard: null,
        peekedStrengthCard: null,
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
        },
      };
    }

    case "DRAW_TURN_CARD": {
      if (state.phase !== "playing") return state;

      const activePlayerId = getActivePlayerId(state);
      if (action.playerId !== activePlayerId) return state;

      // Must have called BEGIN_TURN first (turnMeta exists)
      if (!state.turnMeta || state.turnMeta.playerId !== action.playerId) return state;

      // Already drew a card this turn
      if (state.turnMeta.lastDrawnCardId !== null) return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      let researchDeck = [...state.researchDeck];
      let researchDiscard = [...state.researchDiscard];
      let drawnCardId: string | null = null;
      let newHand = player.hand;

      // If deck is empty, shuffle discard pile into deck
      if (researchDeck.length === 0 && researchDiscard.length > 0) {
        researchDeck = shuffle(researchDiscard, ctx.random);
        researchDiscard = [];
      }

      if (researchDeck.length > 0) {
        const drawnCard = researchDeck[0];
        drawnCardId = drawnCard.id;
        researchDeck = researchDeck.slice(1);
        newHand = [...player.hand, drawnCard];
      }

      const updatedPlayer: CometRushPlayerState = {
        ...player,
        hand: newHand,
      };

      return {
        ...state,
        researchDeck,
        researchDiscard,
        players: {
          ...state.players,
          [action.playerId]: updatedPlayer,
        },
        turnMeta: {
          ...state.turnMeta,
          lastDrawnCardId: drawnCardId,
        },
      };
    }

    case "PLAY_RESEARCH_SET": {
      if (state.phase !== "playing") return state;

      const activePlayerId = getActivePlayerId(state);
      if (action.playerId !== activePlayerId) return state;

      const payload = action.payload as PlayResearchPayload | undefined;
      if (!payload || !Array.isArray(payload.cardIds) || payload.cardIds.length === 0) {
        return state;
      }

      const player = state.players[action.playerId];
      if (!player || player.hasPlayedResearchThisTurn) return state;

      // Validate all cards are in hand and share setKey
      const cardsToPlay = payload.cardIds
        .map((id) => player.hand.find((c) => c.id === id))
        .filter((c): c is ResearchCard => c !== undefined);

      if (cardsToPlay.length !== payload.cardIds.length) return state;
      if (cardsToPlay.length === 0) return state;

      const setKey = cardsToPlay[0].setKey;
      const setSizeRequired = cardsToPlay[0].setSizeRequired;

      if (!cardsToPlay.every((c) => c.setKey === setKey)) return state;
      if (cardsToPlay.length < setSizeRequired) return state;

      // Apply effect based on the card type
      let updatedPlayers = { ...state.players };
      let updatedPlayer = { ...player };
      const tag = cardsToPlay[0].tag;
      let resultDescription = "";

      switch (tag) {
        case "POWER":
          updatedPlayer.upgrades = {
            ...updatedPlayer.upgrades,
            powerBonus: updatedPlayer.upgrades.powerBonus + 1,
            powerCap: updatedPlayer.upgrades.powerCap + 1,
          };
          resultDescription = `Rocket power upgraded! Future rockets get +${updatedPlayer.upgrades.powerBonus} power (cap now ${updatedPlayer.upgrades.powerCap}).`;
          break;

        case "ACCURACY":
          updatedPlayer.upgrades = {
            ...updatedPlayer.upgrades,
            accuracyBonus: Math.min(updatedPlayer.upgrades.accuracyBonus + 1, 4),
            accuracyCap: updatedPlayer.upgrades.accuracyCap + 1,
          };
          resultDescription = `Targeting upgraded! Future rockets get +${updatedPlayer.upgrades.accuracyBonus} accuracy (cap now ${updatedPlayer.upgrades.accuracyCap}).`;
          break;

        case "BUILD_TIME":
          updatedPlayer.upgrades = {
            ...updatedPlayer.upgrades,
            buildTimeBonus: updatedPlayer.upgrades.buildTimeBonus + 1,
            buildTimeCap: updatedPlayer.upgrades.buildTimeCap + 1,
          };
          resultDescription = `Quick Assembly! Future rockets build ${updatedPlayer.upgrades.buildTimeBonus} turn(s) faster.`;
          break;

        case "INCOME":
          updatedPlayer.upgrades = {
            ...updatedPlayer.upgrades,
            incomeBonus: updatedPlayer.upgrades.incomeBonus + 1,
          };
          resultDescription = `Income increased! Now earning +${updatedPlayer.baseIncome + updatedPlayer.upgrades.incomeBonus} cubes per round.`;
          break;

        case "MAX_ROCKETS":
          updatedPlayer.upgrades = {
            ...updatedPlayer.upgrades,
            maxRocketsBonus: updatedPlayer.upgrades.maxRocketsBonus + 1,
          };
          resultDescription = `Launch pad expanded! Can now build ${updatedPlayer.maxConcurrentRockets + updatedPlayer.upgrades.maxRocketsBonus} rockets at once.`;
          break;

        case "PEEK_MOVE":
          if (state.movementDeck.length > 0) {
            const topCard = state.movementDeck[0];
            updatedPlayer.peekedMovementCard = topCard;
            resultDescription = `Trajectory Analysis: Next comet movement is ${topCard.moveSpaces} space(s).`;
          } else {
            resultDescription = "Peeked at movement deck: no cards remaining.";
          }
          break;

        case "PEEK_STRENGTH":
          if (state.strengthDeck.length > 0) {
            const topCard = state.strengthDeck[0];
            updatedPlayer.peekedStrengthCard = topCard;
            resultDescription = `Surface Scan: Next comet segment has strength ${topCard.baseStrength}.`;
          } else if (state.activeStrengthCard) {
            updatedPlayer.peekedStrengthCard = state.activeStrengthCard;
            resultDescription = `Surface Scan: Current comet segment has strength ${state.activeStrengthCard.currentStrength}.`;
          } else {
            resultDescription = "Peeked at strength deck: no cards remaining.";
          }
          break;

        case "STEAL_RESOURCES": {
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

        case "STEAL_CARD": {
          if (!payload.targetPlayerId) return state;
          const targetPlayer = state.players[payload.targetPlayerId];
          if (!targetPlayer || payload.targetPlayerId === action.playerId) return state;
          if (targetPlayer.hand.length === 0) return state;

          // Steal random card
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

        case "DELAY_BUILD": {
          if (!payload.targetPlayerId || !payload.targetRocketId) return state;
          const targetPlayer = state.players[payload.targetPlayerId];
          if (!targetPlayer || payload.targetPlayerId === action.playerId) return state;

          const targetRocketIndex = targetPlayer.rockets.findIndex(
            (r) => r.id === payload.targetRocketId && r.status === "building"
          );
          if (targetRocketIndex === -1) return state;

          const targetRocket = targetPlayer.rockets[targetRocketIndex];
          const newBuildTime = targetRocket.buildTimeRemaining + 1;

          const updatedRockets = [...targetPlayer.rockets];
          updatedRockets[targetRocketIndex] = {
            ...updatedRockets[targetRocketIndex],
            buildTimeRemaining: newBuildTime,
          };

          updatedPlayers = {
            ...updatedPlayers,
            [payload.targetPlayerId]: {
              ...targetPlayer,
              rockets: updatedRockets,
            },
          };
          resultDescription = `Sabotaged ${targetPlayer.name}'s rocket! Now ${newBuildTime} turn(s) remaining.`;
          break;
        }

        default:
          return state;
      }

      // Remove played cards from hand and add to discard
      const playedCardIds = new Set(payload.cardIds);
      updatedPlayer.hand = updatedPlayer.hand.filter((c) => !playedCardIds.has(c.id));
      updatedPlayer.hasPlayedResearchThisTurn = true;

      updatedPlayers[action.playerId] = updatedPlayer;

      return {
        ...state,
        players: updatedPlayers,
        researchDiscard: [...state.researchDiscard, ...cardsToPlay],
        lastResearchResult: resultDescription
          ? {
              id: `${ctx.now()}`,
              playerId: action.playerId,
              description: resultDescription,
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
      if (!player || player.hasBuiltRocketThisTurn) return state;

      // Get raw values from payload
      const rawPower = payload.power;
      const rawAccuracy = payload.accuracy;
      const rawBuildTime = payload.buildTimeBase;

      // Basic validation
      if (rawBuildTime < 1 || rawPower < 1 || rawAccuracy < 1) return state;

      // Clamp to player's caps (enforced server-side to prevent cheating)
      const power = Math.min(rawPower, player.upgrades.powerCap);
      const accuracy = Math.min(rawAccuracy, player.upgrades.accuracyCap);
      const buildTimeBase = Math.min(rawBuildTime, player.upgrades.buildTimeCap);

      // Apply upgrades to clamped inputs
      const effectiveBuildTime = Math.max(1, buildTimeBase - player.upgrades.buildTimeBonus);
      const effectivePower = power + player.upgrades.powerBonus;
      const effectiveAccuracy = Math.min(12, accuracy + player.upgrades.accuracyBonus);

      // Calculate cost using clamped values
      const cost = calculateRocketCost(buildTimeBase, power, accuracy);
      if (player.resourceCubes < cost) return state;

      // Check max concurrent rockets
      const activeRockets = player.rockets.filter(
        (r) => r.status === "building" || r.status === "ready"
      ).length;
      const maxRockets = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
      if (activeRockets >= maxRockets) return state;

      const newRocket: Rocket = {
        id: `rocket-${action.playerId}-${ctx.now()}`,
        buildTimeBase,
        buildTimeRemaining: effectiveBuildTime,
        power: effectivePower,
        accuracy: effectiveAccuracy,
        costCubes: cost,
        status: effectiveBuildTime <= 0 ? "ready" : "building",
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
      if (!player || player.hasLaunchedRocketThisTurn) return state;

      // Find the ready rocket
      const rocketIndex = player.rockets.findIndex(
        (r) => r.id === payload.rocketId && r.status === "ready"
      );
      if (rocketIndex === -1) return state;

      const rocket = player.rockets[rocketIndex];

      // Roll 2d6 for accuracy FIRST
      const diceRoll = roll2d6(ctx.random);
      const hit = diceRoll <= rocket.accuracy;

      // If MISS, don't touch strength deck at all
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
        };

        const updatedPlayer = {
          ...player,
          rockets: updatedRockets,
          hasLaunchedRocketThisTurn: true,
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

      // HIT: Now process strength
      let activeStrengthCard = state.activeStrengthCard;
      let strengthDeck = [...state.strengthDeck];

      // If no active strength card, flip the top one
      if (!activeStrengthCard) {
        if (strengthDeck.length === 0) {
          // No more strength cards - game should already be over
          return state;
        }
        activeStrengthCard = strengthDeck[0];
        strengthDeck = strengthDeck.slice(1);
      }

      let updatedStrengthCard: StrengthCard | null = activeStrengthCard;
      let destroyed = false;
      let trophyCard: StrengthCard | null = null;
      let finalDestroyerId = state.finalDestroyerId;

      // Check power vs strength
      if (rocket.power > activeStrengthCard.currentStrength) {
        // Destroyed!
        destroyed = true;
        trophyCard = activeStrengthCard;
        updatedStrengthCard = null;

        // Check if this was the final card
        if (strengthDeck.length === 0) {
          finalDestroyerId = action.playerId;
        }
      } else {
        // Partial damage
        updatedStrengthCard = {
          ...activeStrengthCard,
          currentStrength: activeStrengthCard.currentStrength - 1,
        };
      }

      // Update rocket status
      const updatedRockets = [...player.rockets];
      updatedRockets[rocketIndex] = {
        ...rocket,
        status: "spent",
      };

      // Add trophy if destroyed
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
      };

      const updatedPlayer = {
        ...player,
        rockets: updatedRockets,
        trophies: updatedTrophies,
        hasLaunchedRocketThisTurn: true,
      };

      // Check for comet destruction (all strength cards destroyed)
      const totalDestroyed = Object.values(state.players).reduce(
        (sum, p) => sum + p.trophies.length,
        0
      ) + (destroyed ? 1 : 0);

      const cometDestroyed = totalDestroyed >= TOTAL_STRENGTH_CARDS && !updatedStrengthCard && strengthDeck.length === 0;

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

    case "CYCLE_RESEARCH": {
      if (state.phase !== "playing") return state;

      const activePlayerId = getActivePlayerId(state);
      if (action.playerId !== activePlayerId) return state;

      const payload = action.payload as CycleResearchPayload | undefined;
      if (!payload || payload.cardIds.length !== 3) return state;

      const player = state.players[action.playerId];
      if (!player) return state;

      // Verify all 3 cards are actually in hand
      const handIds = new Set(player.hand.map((c) => c.id));
      const allPresent = payload.cardIds.every((id) => handIds.has(id));
      if (!allPresent) return state;

      // Move the 3 chosen cards to researchDiscard
      const remainingHand: ResearchCard[] = [];
      const discarded: ResearchCard[] = [];

      for (const card of player.hand) {
        if (payload.cardIds.includes(card.id)) {
          discarded.push(card);
        } else {
          remainingHand.push(card);
        }
      }

      let researchDeck = [...state.researchDeck];
      const researchDiscard = [...state.researchDiscard, ...discarded];

      // Draw 1 replacement card if available
      let drawn: ResearchCard | undefined;
      if (researchDeck.length > 0) {
        drawn = researchDeck[0];
        researchDeck = researchDeck.slice(1);
      }

      const updatedPlayer: CometRushPlayerState = {
        ...player,
        hand: drawn ? [...remainingHand, drawn] : remainingHand,
      };

      return {
        ...state,
        researchDeck,
        researchDiscard,
        players: {
          ...state.players,
          [player.id]: updatedPlayer,
        },
      };
    }

    case "CLEAR_RESEARCH_RESULT": {
      if (!state.lastResearchResult) return state;
      // Only the player who triggered it should be able to clear
      if (state.lastResearchResult.playerId !== action.playerId) return state;

      return {
        ...state,
        lastResearchResult: null,
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

      // Process end of round if wrapped
      if (wrapped) {
        nextIndex = 0;
        round += 1;

        // End-of-round comet movement
        const top = movementDeck[0];
        if (top) {
          movementDeck = movementDeck.slice(1);
          movementDiscard = [top, ...movementDiscard];
          distanceToImpact = distanceToImpact - top.moveSpaces;
          lastMovementCard = top;

          if (distanceToImpact <= 0) {
            // Earth hit - game over
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

      // Set turnMeta for next player (income/draw handled by BEGIN_TURN and DRAW_TURN_CARD)
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
    case "DRAW_TURN_CARD":
    case "PLAY_RESEARCH_SET":
    case "BUILD_ROCKET":
    case "LAUNCH_ROCKET":
    case "CYCLE_RESEARCH":
    case "END_TURN":
      return state.phase === "playing" && ctx.playerId === activePlayerId;

    case "CLEAR_RESEARCH_RESULT":
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
