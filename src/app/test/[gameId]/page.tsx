"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState, useCallback, useMemo } from "react";
import {
  cometRushGame,
  CometRushState,
  CometRushAction,
  CometRushPlayerState,
  GameCard,
  EngineeringCard,
  EspionageCard,
  EconomicCard,
  CardDeckType,
  calculateScores,
} from "@/games/comet-rush/config";

// Cafe game imports
import {
  cafeGame,
  CafeState,
  CafeAction,
  CafePlayerState,
  GAME_CONFIG as CAFE_CONFIG,
  SupplyType,
} from "@/games/cafe/config";
import {
  CAFE_PERSONALITIES,
  getCafePlayerPersonality,
  decideInvestmentAction,
  decideOnCustomer,
  selectCustomersToFulfill,
  decideBailout,
  type CafeBotPersonality,
} from "@/games/cafe/bots";

// Union type for non-engineering cards (espionage + economic)
type ActionCard = EspionageCard | EconomicCard;
import type { Player, GameContext, Room } from "@/engine/types";

// ============================================================================
// TYPES
// ============================================================================

interface SimLogEntry {
  id: number;
  round: number;
  playerId: string;
  playerLabel: string;
  personality: string;
  action: string;
  actionType: string;
  details: string;
  summary: string;
  movementCardsLeft: number;
  strengthCardsLeft: number;
  totalMovementValueLeft: number;
  totalStrengthValueLeft: number;
  // Player state
  resources: number;
  hand: string;
  buildQueue: string;
  readyRockets: string;
  // Comet state
  activeSegment: string;
  segmentHP: string;
  // Bot decision context
  decision: string;
  playableSets: number;
  canBuildRocket: boolean;
  rocketSlotFull: boolean;
  hasReadyRocket: boolean;
  // LLM bot reasoning (optional)
  reasoning?: string;
}

interface SimulationAnalytics {
  // Built rockets
  built: {
    count: number;
    minPower: number;
    maxPower: number;
    avgPower: number;
    minAccuracy: number;
    maxAccuracy: number;
    avgAccuracy: number;
    minBuildTime: number;
    maxBuildTime: number;
    avgBuildTime: number;
  };

  // Launched rockets
  launched: {
    count: number;
    minPower: number;
    maxPower: number;
    avgPower: number;
    minAccuracy: number;
    maxAccuracy: number;
    avgAccuracy: number;
    minBuildTime: number;
    maxBuildTime: number;
    avgBuildTime: number;
    hitRate: number; // hits / launches
  };

  // Damage to comet
  comet: {
    totalDamage: number;
    segmentsDestroyed: number;
    totalStrengthStart: number;
    totalStrengthEnd: number;
  };
}

interface SimSummary {
  totalRounds: number;
  winner: string | null;
  earthDestroyed: boolean;
  cometDestroyed: boolean;
  playerScores: Record<string, number>;
  totalRocketsBuilt: number;
  totalRocketsLaunched: number;
  analytics: SimulationAnalytics;
  aborted?: boolean;
}

interface SimRow {
  id: number;
  timestamp: number;
  players: number;
  rounds: number;
  endReason: "earthDestroyed" | "cometDestroyed" | "maxRounds";
  winnerIds: string[];
  rocketsBuilt: number;
  rocketsLaunched: number;
}

type SortKey = keyof SimRow;

type LogSortKey =
  | "id"
  | "round"
  | "playerLabel"
  | "actionType"
  | "movementCardsLeft"
  | "strengthCardsLeft"
  | "totalMovementValueLeft"
  | "totalStrengthValueLeft"
  | "resources"
  | "playableSets";

// ============================================================================
// HELPERS
// ============================================================================

function createTestPlayers(count: number): Player[] {
  const names = ["Alice", "Bob", "Charlie", "Diana"];
  return Array.from({ length: count }, (_, i) => ({
    id: `player-${i + 1}`,
    name: names[i] ?? `Player ${i + 1}`,
    role: i === 0 ? "host" as const : "player" as const,
  }));
}

function createTestRoom(players: Player[]): Room {
  return {
    roomCode: "TEST",
    hostId: players[0].id,
    players,
    gameId: "comet-rush",
    createdAt: Date.now(),
    mode: "simulation",
  };
}

function createGameContext(
  room: Room,
  playerId: string,
  seed: number
): GameContext {
  // Simple seeded random
  let s = seed;
  const random = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  return {
    room,
    playerId,
    random,
    now: () => Date.now(),
  };
}

// ============================================================================
// BOT INTELLIGENCE HELPERS
// ============================================================================

// Cards that can be played without targets (simple effects)
function getSimplePlayableCards(
  player: CometRushPlayerState,
): GameCard[] {
  return player.hand.filter((card) => {
    if (card.deck === "engineering") {
      const engCard = card as EngineeringCard;
      // These cards don't need targets
      return ["BOOST_POWER", "IMPROVE_ACCURACY", "MASS_PRODUCTION", "INCREASE_INCOME", "ROCKET_SALVAGE", "REROLL_PROTOCOL", "ROCKET_CALIBRATION", "STREAMLINED_ASSEMBLY", "COMET_ANALYSIS"].includes(engCard.cardType);
    } else if (card.deck === "economic") {
      const econCard = card as EconomicCard;
      // These economic cards don't need targets
      return ["EMERGENCY_FUNDING", "PUBLIC_DONATION_DRIVE", "INTERNATIONAL_GRANT", "COMET_PROXIMITY_BONUS", "PROGRAM_PRESTIGE"].includes(econCard.cardType);
    } else {
      // Espionage cards - most need targets
      return false;
    }
  });
}

// Cards that need a target player (espionage cards)
function getTargetPlayerCards(
  player: CometRushPlayerState,
): ActionCard[] {
  return player.hand
    .filter((card) => card.deck === "espionage")
    .filter((card) => {
      const espCard = card as EspionageCard;
      return ["RESOURCE_SEIZURE", "ESPIONAGE_AGENT", "EMBARGO", "SABOTAGE_CONSTRUCTION", "COVERT_ROCKET_STRIKE", "DIPLOMATIC_PRESSURE", "REGULATORY_REVIEW"].includes(espCard.cardType);
    }) as ActionCard[];
}

// Get Engineering cards in hand
function getEngineeringCards(player: CometRushPlayerState): EngineeringCard[] {
  return player.hand.filter((c) => c.deck === "engineering") as EngineeringCard[];
}

// Get Espionage cards in hand
function getEspionageCards(player: CometRushPlayerState): EspionageCard[] {
  return player.hand.filter((c) => c.deck === "espionage") as EspionageCard[];
}

// Get Economic cards in hand
function getEconomicCards(player: CometRushPlayerState): EconomicCard[] {
  return player.hand.filter((c) => c.deck === "economic") as EconomicCard[];
}

// Get all action cards (espionage + economic)
function getActionCards(player: CometRushPlayerState): ActionCard[] {
  return player.hand.filter((c) => c.deck === "espionage" || c.deck === "economic") as ActionCard[];
}

// ============================================================================
// BOT PERSONALITIES
// ============================================================================

type BotPersonality = "engineer" | "sniper" | "firehose" | "bruiser";

interface PersonalityConfig {
  name: string;
  preferEngineering: boolean;  // Prefer Engineering deck over Espionage/Economic
  cardPriorities: string[];    // Card types to prioritize (any deck)
  minAccuracyToLaunch: number;
  prefersPowerOverAccuracy: boolean;
  buildTimeCostPreference: "cheap" | "balanced" | "instant";
  minHealthToAttack: number | null;
  fillsAllSlots: boolean;
  aggressiveness: number;      // 0-1, how likely to play attack cards
}

const PERSONALITIES: Record<BotPersonality, PersonalityConfig> = {
  engineer: {
    name: "Engineer",
    preferEngineering: true,
    cardPriorities: ["IMPROVE_ACCURACY", "BOOST_POWER", "INCREASE_INCOME", "ROCKET_SALVAGE", "COMET_RESEARCH"],
    minAccuracyToLaunch: 3,
    prefersPowerOverAccuracy: false,
    buildTimeCostPreference: "balanced",
    minHealthToAttack: null,
    fillsAllSlots: true,
    aggressiveness: 0.2,
  },
  sniper: {
    name: "Sniper",
    preferEngineering: false,
    cardPriorities: ["RESOURCE_SEIZURE", "TECHNOLOGY_THEFT", "IMPROVE_ACCURACY", "COMET_RESEARCH", "EMBARGO"],
    minAccuracyToLaunch: 3,
    prefersPowerOverAccuracy: false,
    buildTimeCostPreference: "balanced",
    minHealthToAttack: 3,
    fillsAllSlots: false,
    aggressiveness: 0.7,
  },
  firehose: {
    name: "Firehose",
    preferEngineering: true,
    cardPriorities: ["INCREASE_INCOME", "BOOST_POWER", "EMERGENCY_FUNDING", "MASS_PRODUCTION", "ROCKET_SALVAGE"],
    minAccuracyToLaunch: 2,
    prefersPowerOverAccuracy: true,
    buildTimeCostPreference: "cheap",
    minHealthToAttack: null,
    fillsAllSlots: true,
    aggressiveness: 0.3,
  },
  bruiser: {
    name: "Bruiser",
    preferEngineering: true,
    cardPriorities: ["BOOST_POWER", "IMPROVE_ACCURACY", "SABOTAGE", "STREAMLINED_ASSEMBLY", "MASS_PRODUCTION"],
    minAccuracyToLaunch: 2,
    prefersPowerOverAccuracy: true,
    buildTimeCostPreference: "instant",
    minHealthToAttack: null,
    fillsAllSlots: false,
    aggressiveness: 0.5,
  },
};

// Assign personalities to players based on their ID
function getPlayerPersonality(playerId: string): BotPersonality {
  const personalities: BotPersonality[] = ["engineer", "sniper", "firehose", "bruiser"];
  // Use player number to deterministically assign personality
  const playerNum = parseInt(playerId.replace(/\D/g, "")) || 0;
  return personalities[playerNum % personalities.length];
}

// Choose a card to play based on personality priorities
function chooseCardToPlay(
  player: CometRushPlayerState,
  personality: BotPersonality,
  state: CometRushState,
  otherPlayers: CometRushPlayerState[],
): { card: GameCard; targetPlayerId?: string; peekChoice?: "strength" | "movement"; calibrationChoice?: "accuracy" | "power" } | null {
  const config = PERSONALITIES[personality];
  const simpleCards = getSimplePlayableCards(player);
  const targetCards = getTargetPlayerCards(player);

  // Combine all playable cards
  const allPlayable = [...simpleCards, ...targetCards];
  if (allPlayable.length === 0) return null;

  // Find best card based on priorities
  let bestCard: GameCard | null = null;
  let bestPriority = 999;

  for (const card of allPlayable) {
    const cardType = card.deck === "engineering"
      ? (card as EngineeringCard).cardType
      : card.deck === "espionage"
        ? (card as EspionageCard).cardType
        : (card as EconomicCard).cardType;
    const priority = config.cardPriorities.indexOf(cardType);
    if (priority !== -1 && priority < bestPriority) {
      bestPriority = priority;
      bestCard = card;
    }
  }

  // If no priority match, pick random
  if (!bestCard) {
    bestCard = allPlayable[Math.floor(Math.random() * allPlayable.length)];
  }

  // Determine if we need a target
  let targetPlayerId: string | undefined;
  let peekChoice: "strength" | "movement" | undefined;
  let calibrationChoice: "accuracy" | "power" | undefined;

  if (bestCard.deck === "espionage") {
    const espCard = bestCard as EspionageCard;
    if (["RESOURCE_SEIZURE", "ESPIONAGE_AGENT", "EMBARGO", "SABOTAGE_CONSTRUCTION", "COVERT_ROCKET_STRIKE", "DIPLOMATIC_PRESSURE", "REGULATORY_REVIEW"].includes(espCard.cardType)) {
      // Pick target player (prefer player with most resources)
      if (otherPlayers.length > 0) {
        const sorted = [...otherPlayers].sort((a, b) => b.resourceCubes - a.resourceCubes);
        targetPlayerId = sorted[0].id;
      } else {
        return null; // Can't play without target
      }
    }
  } else if (bestCard.deck === "engineering") {
    const engCard = bestCard as EngineeringCard;
    if (engCard.cardType === "COMET_ANALYSIS") {
      // Prefer strength peek
      peekChoice = Math.random() < 0.7 ? "strength" : "movement";
    } else if (engCard.cardType === "ROCKET_CALIBRATION") {
      // Prefer accuracy for calibration
      calibrationChoice = Math.random() < 0.5 ? "accuracy" : "power";
    }
  }

  return { card: bestCard, targetPlayerId, peekChoice, calibrationChoice };
}

// Choose which deck to draw from
function chooseDeckToDraw(
  personality: BotPersonality,
  state: CometRushState,
): CardDeckType {
  const config = PERSONALITIES[personality];

  // Check deck availability
  const engAvailable = state.engineeringDeck.length > 0 || state.engineeringDiscard.length > 0;
  const espAvailable = state.espionageDeck.length > 0 || state.espionageDiscard.length > 0;
  const econAvailable = state.economicDeck.length > 0 || state.economicDiscard.length > 0;

  const availableDecks: CardDeckType[] = [];
  if (engAvailable) availableDecks.push("engineering");
  if (espAvailable) availableDecks.push("espionage");
  if (econAvailable) availableDecks.push("economic");

  if (availableDecks.length === 0) return "engineering"; // Fallback

  // Use personality preference with some randomness
  if (config.preferEngineering) {
    // Prefer engineering (70%), else random other
    if (engAvailable && Math.random() < 0.7) {
      return "engineering";
    }
  } else {
    // Prefer espionage/economic for aggressive personalities
    if (config.aggressiveness > 0.5 && espAvailable && Math.random() < 0.5) {
      return "espionage";
    }
    if (econAvailable && Math.random() < 0.4) {
      return "economic";
    }
  }

  // Return random available deck
  return availableDecks[Math.floor(Math.random() * availableDecks.length)];
}

type RocketConfig = {
  buildTimeBase: number;
  power: number;
  accuracy: number;
};

function chooseRocketToBuild(
  player: CometRushPlayerState,
  personality: BotPersonality,
): RocketConfig | null {
  const { powerCap, accuracyCap, buildTimeCap } = player.upgrades;
  const config = PERSONALITIES[personality];

  // Check if we have capacity for more rockets (count both building and ready)
  const maxSlots =
    player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
  const activeRockets = player.rockets.filter(
    (r) => r.status === "ready" || r.status === "building",
  ).length;
  if (activeRockets >= maxSlots) return null;

  // If low on cubes, skip building (minimum cost is 3)
  if (player.resourceCubes < 3) return null;

  // Determine build time cost based on personality
  let buildTimeCost: number;
  if (config.buildTimeCostPreference === "cheap") {
    // Firehose: prefer BTC=1 (cheap, 2 turn delay)
    buildTimeCost = 1;
  } else if (config.buildTimeCostPreference === "instant") {
    // Bruiser: prefer BTC=3 (instant, expensive)
    buildTimeCost = Math.min(3, buildTimeCap);
  } else {
    // Engineer/Sniper: balanced, use what we can afford
    buildTimeCost = Math.min(3, Math.max(1, Math.min(buildTimeCap, player.resourceCubes - 6)));
  }

  // Determine power and accuracy based on personality and available budget
  // After upgrades, powerCap and accuracyCap can go from 3 up to 6
  let targetPower: number;
  let targetAccuracy: number;

  // Calculate remaining budget after build time cost
  const remainingBudget = player.resourceCubes - buildTimeCost;

  // Minimum rocket needs at least 1 power and 1 accuracy (cost = 2)
  if (remainingBudget < 2) return null;

  if (config.prefersPowerOverAccuracy) {
    // Firehose/Bruiser: max power first, then accuracy
    // Use full powerCap (can be 3-6 after upgrades)
    targetPower = Math.min(powerCap, remainingBudget - 1); // Leave at least 1 for accuracy
    targetPower = Math.max(1, targetPower); // Minimum 1
    // Remaining budget goes to accuracy, up to accuracyCap
    targetAccuracy = Math.min(accuracyCap, remainingBudget - targetPower);
    targetAccuracy = Math.max(1, targetAccuracy); // Minimum 1
  } else {
    // Engineer/Sniper: max accuracy first, then power
    // Use full accuracyCap (can be 3-6 after upgrades)
    targetAccuracy = Math.min(accuracyCap, remainingBudget - 1); // Leave at least 1 for power
    targetAccuracy = Math.max(1, targetAccuracy); // Minimum 1
    // Remaining budget goes to power, up to powerCap
    targetPower = Math.min(powerCap, remainingBudget - targetAccuracy);
    targetPower = Math.max(1, targetPower); // Minimum 1
  }

  return {
    buildTimeBase: buildTimeCost,
    power: targetPower,
    accuracy: targetAccuracy,
  };
}

function chooseRocketToLaunch(
  player: CometRushPlayerState,
  personality: BotPersonality,
  activeSegmentHP: number | null,
): string | null {
  const config = PERSONALITIES[personality];
  const ready = player.rockets.filter((r) => r.status === "ready");
  if (ready.length === 0) return null;

  // Sniper: only launch if segment HP is low enough
  if (config.minHealthToAttack !== null && activeSegmentHP !== null) {
    if (activeSegmentHP > config.minHealthToAttack) {
      return null; // Wait for segment to be weakened
    }
  }

  // Check minimum accuracy requirement
  const accurateEnough = ready.filter((r) => r.accuracy >= config.minAccuracyToLaunch);
  const candidates = accurateEnough.length > 0 ? accurateEnough : ready;

  // Launch the highest power ready rocket
  candidates.sort((a, b) => b.power - a.power);
  const choice = candidates[0];

  return choice.id;
}

// ============================================================================
// STATE FORMATTING HELPERS
// ============================================================================

function formatHand(player: CometRushPlayerState): string {
  if (player.hand.length === 0) return "-";

  // Count cards by type
  const counts = new Map<string, number>();
  for (const card of player.hand) {
    const key = card.deck === "engineering"
      ? (card as EngineeringCard).cardType.substring(0, 3).toUpperCase()
      : card.deck === "espionage"
        ? (card as EspionageCard).cardType.substring(0, 3).toUpperCase()
        : (card as EconomicCard).cardType.substring(0, 3).toUpperCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  // Format as "BOOx2, IMPx1, ..."
  const entries = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([key, count]) => `${key}x${count}`).join(", ");
}

function formatBuildQueue(_player: CometRushPlayerState): string {
  // Rockets are now instant - no build queue
  return "[]";
}

function formatReadyRockets(player: CometRushPlayerState): string {
  const ready = player.rockets.filter((r) => r.status === "ready");
  if (ready.length === 0) return "[]";

  return "[" + ready.map((r) => `P${r.power}/A${r.accuracy}`).join(", ") + "]";
}

// ============================================================================
// BOT PRIORITY HELPERS
// ============================================================================

function hasReadyRocket(player: CometRushPlayerState): boolean {
  return player.rockets.some((r) => r.status === "ready");
}

function hasBuildingRocket(_player: CometRushPlayerState): boolean {
  // Rockets are now instant - no building state
  return false;
}

function canDestroyActiveSegment(
  player: CometRushPlayerState,
  state: CometRushState
): boolean {
  if (!state.activeStrengthCard) return false;
  const ready = player.rockets.filter((r) => r.status === "ready");
  if (ready.length === 0) return false;

  // Check if any ready rocket can destroy the active segment
  return ready.some((r) => r.power > state.activeStrengthCard!.currentStrength);
}

function hasUpgradeCards(player: CometRushPlayerState): boolean {
  return player.hand.some((card) => {
    if (card.deck === "engineering") {
      const engCard = card as EngineeringCard;
      return ["BOOST_POWER", "IMPROVE_ACCURACY"].includes(engCard.cardType);
    }
    return false;
  });
}

function getPlayableCardCount(player: CometRushPlayerState): number {
  return getSimplePlayableCards(player).length + getTargetPlayerCards(player).length;
}

function botWantsAnotherRocket(
  player: CometRushPlayerState,
  personality: BotPersonality,
  _distanceToImpact: number
): boolean {
  const config = PERSONALITIES[personality];
  const maxSlots = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
  // Count both ready and building rockets
  const currentSlots = player.rockets.filter(
    (r) => r.status === "ready" || r.status === "building"
  ).length;

  // Can't build more if slots are full
  if (currentSlots >= maxSlots) return false;

  // Can't build if not enough resources (minimum cost is 3: power 1 + accuracy 1 + build cost 1)
  if (player.resourceCubes < 3) return false;

  // Firehose/Engineer: always fill all slots
  if (config.fillsAllSlots) {
    return true;
  }

  // Sniper/Bruiser: more conservative, only build 1-2 rockets
  return currentSlots < Math.max(1, maxSlots - 1);
}

// ============================================================================
// BOT LOGIC
// ============================================================================

interface RocketRecord {
  power: number;
  accuracy: number;
  buildTimeBase: number;
}

interface LaunchRecord extends RocketRecord {
  hit: boolean;
  damage: number;
  destroyed: boolean;
}

function simulateBotTurn(
  state: CometRushState,
  playerId: string,
  room: Room,
  seed: number,
  log: SimLogEntry[],
  builtRockets: RocketRecord[],
  launchedRockets: LaunchRecord[]
): { state: CometRushState; seed: number; rocketsBuilt: number; rocketsLaunched: number } {
  let currentState = state;
  let currentSeed = seed;
  let rocketsBuilt = 0;
  let rocketsLaunched = 0;

  // PER-TURN action limit to prevent infinite loops
  const MAX_ACTIONS_PER_TURN = 50;
  let turnActionCount = 0;

  const dispatch = (action: CometRushAction): boolean => {
    // Check per-turn action limit BEFORE dispatching
    if (turnActionCount >= MAX_ACTIONS_PER_TURN) {
      console.error(`[LOOP GUARD] Hit MAX_ACTIONS_PER_TURN (${MAX_ACTIONS_PER_TURN}) for player ${playerId}`);
      console.error(`State snapshot:`, {
        resources: currentState.players[playerId]?.resourceCubes,
        rockets: currentState.players[playerId]?.rockets.length,
        ready: currentState.players[playerId]?.rockets.filter(r => r.status === "ready").length,
        phase: currentState.phase,
        round: currentState.round,
      });
      return false;
    }

    const ctx = createGameContext(room, playerId, currentSeed);
    currentSeed += 1;

    const allowed = cometRushGame.isActionAllowed?.(currentState, action, ctx) ?? true;
    if (allowed) {
      const prevState = currentState;
      currentState = cometRushGame.reducer(currentState, action, ctx);
      turnActionCount++;

      // STATE CHANGE ASSERTION: Verify state actually changed for critical actions
      if (action.type === "BUILD_ROCKET") {
        const prevPlayer = prevState.players[playerId];
        const newPlayer = currentState.players[playerId];
        if (prevPlayer && newPlayer) {
          const resourcesDecreased = newPlayer.resourceCubes < prevPlayer.resourceCubes;
          const rocketsIncreased = newPlayer.rockets.length > prevPlayer.rockets.length;
          if (!resourcesDecreased || !rocketsIncreased) {
            console.error(`[STATE ASSERTION] BUILD_ROCKET didn't change state properly!`, {
              resourcesBefore: prevPlayer.resourceCubes,
              resourcesAfter: newPlayer.resourceCubes,
              rocketsBefore: prevPlayer.rockets.length,
              rocketsAfter: newPlayer.rockets.length,
            });
            return false;
          }
        }
      }

      if (action.type === "LAUNCH_ROCKET") {
        const prevPlayer = prevState.players[playerId];
        const newPlayer = currentState.players[playerId];
        if (prevPlayer && newPlayer) {
          const prevReady = prevPlayer.rockets.filter(r => r.status === "ready").length;
          const newReady = newPlayer.rockets.filter(r => r.status === "ready").length;
          if (newReady >= prevReady) {
            console.error(`[STATE ASSERTION] LAUNCH_ROCKET didn't decrease ready rockets!`, {
              readyBefore: prevReady,
              readyAfter: newReady,
            });
            return false;
          }
        }
      }

      return true;
    }
    return false;
  };

  const addLog = (action: string, details: string, decisionContext?: string) => {
    const playerLabel = playerId.replace("player-", "P");
    const player = currentState.players[playerId];
    const personality = getPlayerPersonality(playerId);
    const personalityName = PERSONALITIES[personality].name;

    // Calculate comet tracking data
    const movementCardsLeft = currentState.movementDeck.length;
    const strengthCardsLeft = currentState.strengthDeck.length;
    const totalMovementValueLeft = currentState.distanceToImpact;
    const totalStrengthValueLeft = currentState.strengthDeck.reduce(
      (sum, card) => sum + card.baseStrength,
      0,
    ) + (currentState.activeStrengthCard?.currentStrength ?? 0);

    // Player state
    const resources = player?.resourceCubes ?? 0;
    const hand = player ? formatHand(player) : "-";
    const buildQueue = player ? formatBuildQueue(player) : "[]";
    const readyRockets = player ? formatReadyRockets(player) : "[]";

    // Comet state
    const activeSegment = currentState.activeStrengthCard
      ? String(currentState.activeStrengthCard.baseStrength)
      : "-";
    const segmentHP = currentState.activeStrengthCard
      ? String(currentState.activeStrengthCard.currentStrength)
      : "-";

    // Bot decision context
    const playableSets = player ? getPlayableCardCount(player) : 0;
    const canBuildRocket = player ? (() => {
      const maxSlots = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
      const readyCount = player.rockets.filter(
        (r) => r.status === "ready"
      ).length;
      return player.resourceCubes >= 3 && readyCount < maxSlots; // min cost is 3
    })() : false;
    const rocketSlotFull = player ? (() => {
      const maxSlots = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
      const readyCount = player.rockets.filter(
        (r) => r.status === "ready"
      ).length;
      return readyCount >= maxSlots;
    })() : false;
    const hasReadyRocket = player ? player.rockets.some((r) => r.status === "ready") : false;

    log.push({
      id: 0, // Will be assigned after simulation completes
      round: currentState.round,
      playerId,
      playerLabel,
      personality: personalityName,
      action,
      actionType: action,
      details,
      summary: details,
      movementCardsLeft,
      strengthCardsLeft,
      totalMovementValueLeft,
      totalStrengthValueLeft,
      resources,
      hand,
      buildQueue,
      readyRockets,
      activeSegment,
      segmentHP,
      decision: decisionContext || "-",
      playableSets,
      canBuildRocket,
      rocketSlotFull,
      hasReadyRocket,
    });
  };

  // Action counter for debug logging
  let turnActionIndex = 0;

  // 1. BEGIN_TURN (always)
  if (dispatch({ type: "BEGIN_TURN", playerId })) {
    turnActionIndex++;
    const player = currentState.players[playerId];
    console.log(`[${playerId}] Action ${turnActionIndex}: BEGIN_TURN - Income: +${currentState.turnMeta?.incomeGained ?? 0} (total: ${player?.resourceCubes ?? 0})`);
    addLog("BEGIN_TURN", `Income: +${currentState.turnMeta?.incomeGained ?? 0} cubes (total: ${player?.resourceCubes ?? 0})`, "BEGIN_TURN: mandatory");
  }

  // Get bot personality for this player
  const personality = getPlayerPersonality(playerId);

  // 2. DRAW_CARD - choose deck based on personality
  const deckToDraw = chooseDeckToDraw(personality, currentState);
  if (dispatch({ type: "DRAW_CARD", playerId, payload: { deck: deckToDraw } })) {
    turnActionIndex++;
    const cardId = currentState.turnMeta?.lastDrawnCardId;
    console.log(`[${playerId}] Action ${turnActionIndex}: DRAW_CARD (${deckToDraw}) - ${cardId ?? "none"}`);
    addLog("DRAW_CARD", cardId ? `Drew card ${cardId} from ${deckToDraw}` : "No cards to draw", `DRAW: chose ${deckToDraw}`);
  }

  // 3. Evaluate actions in priority order
  let player = currentState.players[playerId];
  if (!player) {
    // If player doesn't exist, just end turn
    if (dispatch({ type: "END_TURN", playerId })) {
      addLog("END_TURN", `Distance to impact: ${currentState.distanceToImpact}`, "END_TURN: no player");
    }
    return { state: currentState, seed: currentSeed, rocketsBuilt, rocketsLaunched };
  }
  const personalityName = PERSONALITIES[personality].name;
  console.log(`[${playerId}] 🤖 Playing as ${personalityName}`);

  let launchCount = 0;
  let buildCount = 0;

  // ====================
  // PHASE 1: LAUNCH ALL READY ROCKETS
  // ====================

  // Log available actions before Phase 1
  const maxSlots = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
  const currentSlots = player.rockets.filter((r) => r.status === "ready" || r.status === "building").length;
  const canBuild = player.resourceCubes >= 3 && currentSlots < maxSlots;
  const canLaunch = hasReadyRocket(player);
  const canPlayCards = getPlayableCardCount(player) > 0;

  console.log(`[${playerId}] PHASE 1 START - Legal actions: LAUNCH=${canLaunch} (ready:${player.rockets.filter(r => r.status === "ready").length}), BUILD=${canBuild} (slots:${currentSlots}/${maxSlots}, res:${player.resourceCubes}), CARDS=${canPlayCards} (${getPlayableCardCount(player)})`);

  // Launch ALL ready rockets - no restrictions
  let launchIterations = 0;
  while (hasReadyRocket(player)) {
    if (++launchIterations > 20) {
      console.error(`[LOOP GUARD] Launch loop exceeded 20 iterations for ${playerId}`);
      break;
    }
    const activeSegmentHP = currentState.activeStrengthCard?.currentStrength ?? null;
    const rocketId = chooseRocketToLaunch(player, personality, activeSegmentHP);
    if (!rocketId) break;

    const rocket = player.rockets.find((r) => r.id === rocketId);
    const rocketStats = rocket ? {
      power: rocket.power,
      accuracy: rocket.accuracy,
      buildTimeBase: rocket.buildTimeBase,
    } : null;

    if (dispatch({ type: "LAUNCH_ROCKET", playerId, payload: { rocketId } })) {
      turnActionIndex++;
      rocketsLaunched++;
      launchCount++;
      const result = currentState.lastLaunchResult;
      if (result && rocketStats) {
        const damage = result.destroyed
          ? result.strengthBefore
          : (result.hit ? Math.max(0, result.strengthBefore - result.strengthAfter) : 0);

        launchedRockets.push({
          ...rocketStats,
          hit: result.hit,
          damage,
          destroyed: result.destroyed,
        });

        const hitMiss = result.hit ? "HIT" : "MISS";
        const destroyed = result.destroyed ? " - DESTROYED!" : "";
        console.log(`[${playerId}] Action ${turnActionIndex}: LAUNCH_ROCKET - ${hitMiss} (roll:${result.diceRoll} vs ${result.accuracyNeeded})${destroyed}`);
        addLog("LAUNCH_ROCKET", `Roll ${result.diceRoll} vs ${result.accuracyNeeded}: ${hitMiss}${destroyed}`, `LAUNCH: ready rocket available`);
      }
      player = currentState.players[playerId];
    } else {
      console.log(`[${playerId}] LAUNCH_ROCKET rejected by reducer for rocket ${rocketId}`);
      break;
    }
  }

  // ====================
  // PHASE 2: BUILD ROCKETS (always check, regardless of launch phase)
  // ====================

  console.log(`[${playerId}] PHASE 2 START - BUILD check: botWants=${botWantsAnotherRocket(player, personality, currentState.distanceToImpact)} (res:${player.resourceCubes}, slots:${player.rockets.filter(r => r.status === "ready" || r.status === "building").length}/${maxSlots}, dist:${currentState.distanceToImpact})`);

  let p4Iterations = 0;
  while (botWantsAnotherRocket(player, personality, currentState.distanceToImpact)) {
    if (++p4Iterations > 10) {
      console.error(`[LOOP GUARD] P4 build loop exceeded 10 iterations for ${playerId}`);
      console.error(`Loop state:`, {
        resources: player.resourceCubes,
        rockets: player.rockets.length,
        maxSlots: player.maxConcurrentRockets + player.upgrades.maxRocketsBonus,
        distance: currentState.distanceToImpact,
      });
      break;
    }
    const config = chooseRocketToBuild(player, personality);
    if (!config) break;

    if (dispatch({ type: "BUILD_ROCKET", playerId, payload: config })) {
      turnActionIndex++;
      rocketsBuilt++;
      buildCount++;
      builtRockets.push({
        power: config.power,
        accuracy: config.accuracy,
        buildTimeBase: config.buildTimeBase,
      });
      const currentSlots = player.rockets.filter((r) => r.status === "ready" || r.status === "building").length;
      const maxSlots = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
      const rocketCost = config.power + config.accuracy + config.buildTimeBase;
      console.log(`[${playerId}] Action ${turnActionIndex}: BUILD_ROCKET (P4) - P=${config.power}, A=${config.accuracy}, T=${config.buildTimeBase} (${currentSlots + 1}/${maxSlots}, cost: ${rocketCost}, res after: ${player.resourceCubes - rocketCost})`);
      addLog("BUILD_ROCKET", `[P4: Fill slots] P=${config.power}, A=${config.accuracy}, T=${config.buildTimeBase} (${currentSlots + 1}/${maxSlots})`, `BUILD: P4 slots available`);
      player = currentState.players[playerId];
    } else {
      break;
    }
  }

  // ====================
  // PHASE 2.5: LAUNCH INSTANT ROCKETS (if we built one and haven't launched yet)
  // ====================

  // If we built an instant rocket (BTC=3) and haven't launched yet, launch it now
  if (!player.hasLaunchedRocketThisTurn && hasReadyRocket(player)) {
    const activeSegmentHP = currentState.activeStrengthCard?.currentStrength ?? null;
    const rocketId = chooseRocketToLaunch(player, personality, activeSegmentHP);
    if (rocketId) {
      const rocket = player.rockets.find((r) => r.id === rocketId);
      const rocketStats = rocket ? {
        power: rocket.power,
        accuracy: rocket.accuracy,
        buildTimeBase: rocket.buildTimeBase,
      } : null;

      console.log(`[${playerId}] PHASE 2.5 - Launching instant rocket that was just built`);

      if (dispatch({ type: "LAUNCH_ROCKET", playerId, payload: { rocketId } })) {
        turnActionIndex++;
        rocketsLaunched++;
        launchCount++;
        const result = currentState.lastLaunchResult;
        if (result && rocketStats) {
          const damage = result.destroyed
            ? result.strengthBefore
            : (result.hit ? Math.max(0, result.strengthBefore - result.strengthAfter) : 0);

          launchedRockets.push({
            ...rocketStats,
            hit: result.hit,
            damage,
            destroyed: result.destroyed,
          });

          const hitMiss = result.hit ? "HIT" : "MISS";
          const destroyed = result.destroyed ? " - DESTROYED!" : "";
          console.log(`[${playerId}] Action ${turnActionIndex}: LAUNCH_ROCKET (instant) - ${hitMiss} (roll:${result.diceRoll} vs ${result.accuracyNeeded})${destroyed}`);
          addLog("LAUNCH_ROCKET", `Roll ${result.diceRoll} vs ${result.accuracyNeeded}: ${hitMiss}${destroyed}`, `LAUNCH: instant rocket`);
        }
        player = currentState.players[playerId];
      }
    }
  }

  // ====================
  // PHASE 3: PLAY CARDS (can play multiple cards per turn)
  // ====================

  const otherPlayers = Object.values(currentState.players).filter((p) => p.id !== playerId);
  console.log(`[${playerId}] PHASE 3 START - CARDS check: hasUpgrade=${hasUpgradeCards(player)}, playable=${getPlayableCardCount(player)}`);

  // Play cards (can play multiple per turn)
  let cardsPlayed = 0;
  let cardIterations = 0;
  while (cardIterations < 5) { // Limit to 5 cards per turn to avoid loops
    cardIterations++;
    const cardChoice = chooseCardToPlay(player, personality, currentState, otherPlayers);
    if (!cardChoice) break;

    const payload = {
      cardId: cardChoice.card.id,
      targetPlayerId: cardChoice.targetPlayerId,
      peekChoice: cardChoice.peekChoice,
    };

    if (dispatch({ type: "PLAY_CARD", playerId, payload })) {
      turnActionIndex++;
      cardsPlayed++;
      console.log(`[${playerId}] Action ${turnActionIndex}: PLAY_CARD - ${cardChoice.card.name}`);
      addLog("PLAY_CARD", `${cardChoice.card.name}`, `PLAY_CARD: ${cardChoice.card.deck}`);
      player = currentState.players[playerId];
    } else {
      break; // If action fails, stop trying
    }
  }

  // 7. END_TURN
  const currentSlotsAtEnd = player.rockets.filter((r) => r.status === "ready" || r.status === "building").length;
  const canBuildAtEnd = player.resourceCubes >= 3 && currentSlotsAtEnd < maxSlots;
  const canLaunchAtEnd = hasReadyRocket(player);
  const canPlayCardsAtEnd = getPlayableCardCount(player) > 0;

  const totalActions = launchCount + buildCount + cardsPlayed;
  const endReason = totalActions > 0
    ? `Ending turn after ${totalActions} action(s) (launched:${launchCount}, built:${buildCount}, cards:${cardsPlayed})`
    : `Ending turn - NO actions possible (canLaunch:${canLaunchAtEnd}, canBuild:${canBuildAtEnd}, canPlayCards:${canPlayCardsAtEnd}, res:${player.resourceCubes}, slots:${currentSlotsAtEnd}/${maxSlots})`;

  console.log(`[${playerId}] END_TURN - ${endReason}`);

  const endDecision = totalActions > 0
    ? "END_TURN: actions completed"
    : `END_TURN: no action (ready:${hasReadyRocket(player)}, canBuild:${canBuildAtEnd}, cards:${getPlayableCardCount(player)})`;
  if (dispatch({ type: "END_TURN", playerId })) {
    turnActionIndex++;
    addLog("END_TURN", `Distance to impact: ${currentState.distanceToImpact}`, endDecision);
  }

  return { state: currentState, seed: currentSeed, rocketsBuilt, rocketsLaunched };
}

// ============================================================================
// ANALYTICS COMPUTATION
// ============================================================================

function computeAnalytics(
  builtRockets: RocketRecord[],
  launchedRockets: LaunchRecord[],
  finalState: CometRushState
): SimulationAnalytics {
  // Helper to compute stats
  const computeStats = (rockets: RocketRecord[]) => {
    if (rockets.length === 0) {
      return {
        count: 0,
        minPower: 0,
        maxPower: 0,
        avgPower: 0,
        minAccuracy: 0,
        maxAccuracy: 0,
        avgAccuracy: 0,
        minBuildTime: 0,
        maxBuildTime: 0,
        avgBuildTime: 0,
      };
    }

    const powers = rockets.map((r) => r.power);
    const accuracies = rockets.map((r) => r.accuracy);
    const buildTimes = rockets.map((r) => r.buildTimeBase);

    return {
      count: rockets.length,
      minPower: Math.min(...powers),
      maxPower: Math.max(...powers),
      avgPower: powers.reduce((a, b) => a + b, 0) / powers.length,
      minAccuracy: Math.min(...accuracies),
      maxAccuracy: Math.max(...accuracies),
      avgAccuracy: accuracies.reduce((a, b) => a + b, 0) / accuracies.length,
      minBuildTime: Math.min(...buildTimes),
      maxBuildTime: Math.max(...buildTimes),
      avgBuildTime: buildTimes.reduce((a, b) => a + b, 0) / buildTimes.length,
    };
  };

  // Built rockets stats
  const built = computeStats(builtRockets);

  // Launched rockets stats
  const launchedStats = computeStats(launchedRockets);
  const hits = launchedRockets.filter((r) => r.hit).length;
  const hitRate = launchedRockets.length > 0 ? hits / launchedRockets.length : 0;

  const launched = {
    ...launchedStats,
    hitRate,
  };

  // Comet damage stats
  const totalDamage = launchedRockets.reduce((sum, r) => sum + r.damage, 0);
  const segmentsDestroyed = launchedRockets.filter((r) => r.destroyed).length;

  // Calculate total strength at start and end
  const totalStrengthStart = finalState.strengthDeck.reduce(
    (sum, card) => sum + card.baseStrength,
    0
  ) + (finalState.activeStrengthCard?.baseStrength ?? 0) +
    Object.values(finalState.players).reduce(
      (sum, p) => sum + p.trophies.reduce((s, t) => s + t.baseStrength, 0),
      0
    );

  const totalStrengthEnd = finalState.strengthDeck.reduce(
    (sum, card) => sum + card.baseStrength,
    0
  ) + (finalState.activeStrengthCard?.currentStrength ?? 0);

  return {
    built,
    launched,
    comet: {
      totalDamage,
      segmentsDestroyed,
      totalStrengthStart,
      totalStrengthEnd,
    },
  };
}

// ============================================================================
// SIMULATION RUNNER
// ============================================================================

// Safety caps to prevent runaway simulations
const MAX_ROUNDS_PER_GAME = 25;
const MAX_ACTIONS_PER_GAME = 500;

function runCometRushSimulation(
  playerCount: number,
  maxRounds: number = MAX_ROUNDS_PER_GAME
): Promise<{ summary: SimSummary; log: SimLogEntry[]; aborted?: boolean }> {
  return new Promise((resolve) => {
    console.log(`[Simulation] Starting game with ${playerCount} players, maxRounds=${maxRounds}`);
    const players = createTestPlayers(playerCount);
    const room = createTestRoom(players);
    let seed = Date.now();

    // Create initial state
    let state = cometRushGame.initialState(players);

    // Start game (as host)
    const hostCtx = createGameContext(room, players[0].id, seed++);
    state = cometRushGame.reducer(state, { type: "START_GAME", playerId: players[0].id }, hostCtx);

    const log: SimLogEntry[] = [];
    let totalRocketsBuilt = 0;
    let totalRocketsLaunched = 0;

    // Analytics tracking
    const builtRockets: RocketRecord[] = [];
    const launchedRockets: LaunchRecord[] = [];

    // Calculate initial comet state
    const initialMovementCardsLeft = state.movementDeck.length;
    const initialStrengthCardsLeft = state.strengthDeck.length;
    const initialTotalMovementValueLeft = state.distanceToImpact;
    const initialTotalStrengthValueLeft = state.strengthDeck.reduce(
      (sum, card) => sum + card.baseStrength,
      0,
    ) + (state.activeStrengthCard?.currentStrength ?? 0);

    log.push({
      id: 0,
      round: 1,
      playerId: "SYSTEM",
      playerLabel: "SYSTEM",
      personality: "-",
      action: "START_GAME",
      actionType: "START_GAME",
      details: `Game started with ${playerCount} players`,
      summary: `Game started with ${playerCount} players`,
      movementCardsLeft: initialMovementCardsLeft,
      strengthCardsLeft: initialStrengthCardsLeft,
      totalMovementValueLeft: initialTotalMovementValueLeft,
      totalStrengthValueLeft: initialTotalStrengthValueLeft,
      resources: 0,
      hand: "-",
      buildQueue: "[]",
      readyRockets: "[]",
      activeSegment: "-",
      segmentHP: "-",
      decision: "START_GAME",
      playableSets: 0,
      canBuildRocket: false,
      rocketSlotFull: false,
      hasReadyRocket: false,
    });

    // Run simulation loop with safety caps - ASYNC version
    let safetyCounter = 0;
    let actionCounter = 0;
    const maxIterations = maxRounds * playerCount;
    let aborted = false;

    function runNextTurn() {
      // Check exit conditions
      if (state.phase !== "playing" || safetyCounter >= maxIterations || actionCounter >= MAX_ACTIONS_PER_GAME) {
        // Simulation complete - finalize
        if (state.phase === "playing" && safetyCounter >= maxIterations) {
          console.warn(`[Simulation] ABORTED: Hit MAX_ROUNDS (${maxRounds}) at round ${state.round}`);
          aborted = true;
        }
        if (actionCounter >= MAX_ACTIONS_PER_GAME) {
          console.warn(`[Simulation] ABORTED: Hit MAX_ACTIONS_PER_GAME (${MAX_ACTIONS_PER_GAME}) at round ${state.round}`);
          aborted = true;
        }

        console.log(`[Simulation] Finished: ${state.phase}, rounds=${state.round}, actions=${actionCounter}, aborted=${aborted}`);

        // Compute analytics
        const analytics = computeAnalytics(builtRockets, launchedRockets, state);

        // Build summary
        const scores = calculateScores(state);
        const winner = state.winnerIds.length > 0
          ? state.winnerIds.map((id) => state.players[id]?.name ?? id).join(", ")
          : null;

        const summary: SimSummary = {
          totalRounds: state.round,
          winner,
          earthDestroyed: state.earthDestroyed,
          cometDestroyed: state.cometDestroyed,
          playerScores: Object.fromEntries(
            Object.entries(scores).map(([id, score]) => [state.players[id]?.name ?? id, score])
          ),
          totalRocketsBuilt,
          totalRocketsLaunched,
          analytics,
        };

        // Assign IDs to log entries
        const logWithIds = log.map((entry, index) => ({
          ...entry,
          id: index + 1,
        }));

        resolve({ summary, log: logWithIds, aborted });
        return;
      }

      // Run one turn
      safetyCounter++;
      const activePlayerId = state.playerOrder[state.activePlayerIndex];

      const actionsBefore = log.length;
      const result = simulateBotTurn(state, activePlayerId, room, seed, log, builtRockets, launchedRockets);
      const actionsThisTurn = log.length - actionsBefore;
      actionCounter += actionsThisTurn;

      state = result.state;
      seed = result.seed;
      totalRocketsBuilt += result.rocketsBuilt;
      totalRocketsLaunched += result.rocketsLaunched;

      // Yield to browser after each turn, then continue
      setTimeout(runNextTurn, 0);
    }

    // Start the async loop
    runNextTurn();
  });
}

// ============================================================================
// LLM BOT SIMULATION
// ============================================================================

interface LLMBotResponse {
  ok: boolean;
  action?: string;
  payload?: Record<string, unknown>;
  reasoning?: string;
  error?: string;
}

async function callLLMBot(
  state: CometRushState,
  playerId: string,
  turnPhase: "begin" | "draw" | "actions" | "end",
  actionHistory: string[]
): Promise<LLMBotResponse> {
  try {
    const response = await fetch("/api/llm-bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, playerId, turnPhase, actionHistory }),
    });
    return await response.json();
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Network error" };
  }
}

function runLLMCometRushSimulation(
  playerCount: number,
  maxRounds: number = MAX_ROUNDS_PER_GAME,
  onProgress?: (message: string) => void
): Promise<{ summary: SimSummary; log: SimLogEntry[]; aborted?: boolean }> {
  return new Promise((resolve) => {
    console.log(`[LLM Simulation] Starting game with ${playerCount} players, maxRounds=${maxRounds}`);
    onProgress?.(`Starting LLM game with ${playerCount} players...`);

    const players = createTestPlayers(playerCount);
    const room = createTestRoom(players);
    let seed = Date.now();

    // Create initial state
    let state = cometRushGame.initialState(players);

    // Start game (as host)
    const hostCtx = createGameContext(room, players[0].id, seed++);
    state = cometRushGame.reducer(state, { type: "START_GAME", playerId: players[0].id }, hostCtx);

    const log: SimLogEntry[] = [];
    let totalRocketsBuilt = 0;
    let totalRocketsLaunched = 0;

    // Analytics tracking
    const builtRockets: RocketRecord[] = [];
    const launchedRockets: LaunchRecord[] = [];

    // Calculate initial comet state
    const initialMovementCardsLeft = state.movementDeck.length;
    const initialStrengthCardsLeft = state.strengthDeck.length;
    const initialTotalMovementValueLeft = state.distanceToImpact;
    const initialTotalStrengthValueLeft = state.strengthDeck.reduce(
      (sum, card) => sum + card.baseStrength,
      0,
    ) + (state.activeStrengthCard?.currentStrength ?? 0);

    log.push({
      id: 0,
      round: 1,
      playerId: "SYSTEM",
      playerLabel: "SYSTEM",
      personality: "LLM",
      action: "START_GAME",
      actionType: "START_GAME",
      details: `Game started with ${playerCount} players (LLM mode)`,
      summary: `Game started with ${playerCount} players (LLM mode)`,
      movementCardsLeft: initialMovementCardsLeft,
      strengthCardsLeft: initialStrengthCardsLeft,
      totalMovementValueLeft: initialTotalMovementValueLeft,
      totalStrengthValueLeft: initialTotalStrengthValueLeft,
      resources: 0,
      hand: "-",
      buildQueue: "[]",
      readyRockets: "[]",
      activeSegment: "-",
      segmentHP: "-",
      decision: "START_GAME",
      playableSets: 0,
      canBuildRocket: false,
      rocketSlotFull: false,
      hasReadyRocket: false,
    });

    // Run simulation loop with safety caps - ASYNC version
    let safetyCounter = 0;
    let actionCounter = 0;
    const maxIterations = maxRounds * playerCount;
    let aborted = false;

    // Helper to add log entries
    const addLLMLog = (
      playerId: string,
      actionType: string,
      details: string,
      decision: string,
      reasoning?: string
    ) => {
      const player = state.players[playerId];
      if (!player) return;

      const hand = player.hand.map((c) => {
        const type = c.deck === "engineering"
          ? (c as EngineeringCard).cardType
          : c.deck === "espionage"
            ? (c as EspionageCard).cardType
            : (c as EconomicCard).cardType;
        const abbrev = type.substring(0, 3).toUpperCase();
        return abbrev;
      });
      const handCounts: Record<string, number> = {};
      hand.forEach((h) => {
        handCounts[h] = (handCounts[h] || 0) + 1;
      });
      const handStr = Object.entries(handCounts)
        .map(([k, v]) => `${k}x${v}`)
        .join(", ") || "-";

      const buildQueue = player.rockets
        .filter((r) => r.status === "building")
        .map((r) => `P${r.power}/A${r.accuracy}`)
        .join(", ");
      const readyRockets = player.rockets
        .filter((r) => r.status === "ready")
        .map((r) => `P${r.power}/A${r.accuracy}`)
        .join(", ");

      const activeSegment = state.activeStrengthCard
        ? `${state.activeStrengthCard.id}`
        : "-";
      const segmentHP = state.activeStrengthCard
        ? `${state.activeStrengthCard.currentStrength}`
        : "-";

      const maxSlots = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
      const currentSlots = player.rockets.filter(
        (r) => r.status === "ready" || r.status === "building"
      ).length;
      const canBuild = player.resourceCubes >= 3 && currentSlots < maxSlots;

      log.push({
        id: log.length,
        round: state.round,
        playerId,
        playerLabel: playerId,
        personality: "LLM",
        action: actionType,
        actionType,
        details,
        summary: details,
        movementCardsLeft: state.movementDeck.length,
        strengthCardsLeft: state.strengthDeck.length,
        totalMovementValueLeft: state.distanceToImpact,
        totalStrengthValueLeft: state.strengthDeck.reduce((sum, c) => sum + c.baseStrength, 0) +
          (state.activeStrengthCard?.currentStrength ?? 0),
        resources: player.resourceCubes,
        hand: handStr,
        buildQueue: `[${buildQueue}]`,
        readyRockets: `[${readyRockets}]`,
        activeSegment,
        segmentHP,
        decision,
        playableSets: player.hand.length,
        canBuildRocket: canBuild,
        rocketSlotFull: currentSlots >= maxSlots,
        hasReadyRocket: player.rockets.some((r) => r.status === "ready"),
        reasoning,
      });
    };

    async function runLLMTurn() {
      // Check exit conditions
      if (state.phase !== "playing" || safetyCounter >= maxIterations || actionCounter >= MAX_ACTIONS_PER_GAME) {
        // Simulation complete - finalize
        if (state.phase === "playing" && safetyCounter >= maxIterations) {
          console.warn(`[LLM Simulation] ABORTED: Hit MAX_ROUNDS (${maxRounds}) at round ${state.round}`);
          aborted = true;
        }
        if (actionCounter >= MAX_ACTIONS_PER_GAME) {
          console.warn(`[LLM Simulation] ABORTED: Hit MAX_ACTIONS_PER_GAME (${MAX_ACTIONS_PER_GAME}) at round ${state.round}`);
          aborted = true;
        }

        console.log(`[LLM Simulation] Finished: ${state.phase}, rounds=${state.round}, actions=${actionCounter}, aborted=${aborted}`);

        // Compute analytics
        const analytics = computeAnalytics(builtRockets, launchedRockets, state);

        // Build summary
        const scores = calculateScores(state);
        const winner = state.winnerIds.length > 0
          ? state.winnerIds.map((id) => state.players[id]?.name ?? id).join(", ")
          : null;

        const summary: SimSummary = {
          totalRounds: state.round,
          winner,
          earthDestroyed: state.earthDestroyed,
          cometDestroyed: state.cometDestroyed,
          playerScores: Object.fromEntries(
            Object.entries(scores).map(([id, score]) => [state.players[id]?.name ?? id, score])
          ),
          totalRocketsBuilt,
          totalRocketsLaunched,
          analytics,
        };

        // Assign IDs to log entries
        const logWithIds = log.map((entry, index) => ({
          ...entry,
          id: index + 1,
        }));

        resolve({ summary, log: logWithIds, aborted });
        return;
      }

      // Run one turn
      safetyCounter++;
      const activePlayerId = state.playerOrder[state.activePlayerIndex];
      const actionHistory: string[] = [];

      onProgress?.(`Round ${state.round}: ${activePlayerId}'s turn...`);

      // Dispatch helper
      const dispatch = (action: CometRushAction): boolean => {
        const ctx = createGameContext(room, activePlayerId, seed++);
        const allowed = cometRushGame.isActionAllowed?.(state, action, ctx) ?? true;
        if (allowed) {
          state = cometRushGame.reducer(state, action, ctx);
          actionCounter++;
          return true;
        }
        return false;
      };

      // Phase 1: BEGIN_TURN
      let llmResult = await callLLMBot(state, activePlayerId, "begin", actionHistory);
      if (llmResult.ok && llmResult.action === "BEGIN_TURN") {
        if (dispatch({ type: "BEGIN_TURN", playerId: activePlayerId })) {
          const player = state.players[activePlayerId];
          actionHistory.push("BEGIN_TURN");
          addLLMLog(
            activePlayerId,
            "BEGIN_TURN",
            `Income: +${state.turnMeta?.incomeGained ?? 0} cubes (total: ${player?.resourceCubes ?? 0})`,
            "LLM chose BEGIN_TURN",
            llmResult.reasoning
          );
        }
      } else {
        // Fallback: force BEGIN_TURN
        dispatch({ type: "BEGIN_TURN", playerId: activePlayerId });
        actionHistory.push("BEGIN_TURN");
        addLLMLog(activePlayerId, "BEGIN_TURN", "Forced BEGIN_TURN", "Fallback", llmResult.reasoning || llmResult.error);
      }

      // Phase 2: DRAW_CARD
      llmResult = await callLLMBot(state, activePlayerId, "draw", actionHistory);
      if (llmResult.ok && llmResult.action === "DRAW_CARD" && llmResult.payload?.deck) {
        const deck = llmResult.payload.deck as CardDeckType;
        if (dispatch({ type: "DRAW_CARD", playerId: activePlayerId, payload: { deck } })) {
          const cardId = state.turnMeta?.lastDrawnCardId;
          actionHistory.push(`DRAW_CARD(${deck})`);
          addLLMLog(
            activePlayerId,
            "DRAW_CARD",
            `Drew from ${deck}: ${cardId ?? "none"}`,
            `LLM chose ${deck}`,
            llmResult.reasoning
          );
        }
      } else {
        // Fallback: draw engineering
        dispatch({ type: "DRAW_CARD", playerId: activePlayerId, payload: { deck: "engineering" } });
        actionHistory.push("DRAW_CARD(engineering)");
        addLLMLog(activePlayerId, "DRAW_CARD", "Fallback draw", "Fallback", llmResult.reasoning || llmResult.error);
      }

      // Phase 3: Free actions (loop until END_TURN)
      let freeActionCount = 0;
      const maxFreeActions = 20;
      let consecutiveFailures = 0;
      let lastFailedAction = "";

      while (freeActionCount < maxFreeActions) {
        freeActionCount++;

        // If we've had 3+ consecutive failures, force end turn
        if (consecutiveFailures >= 3) {
          console.warn(`[LLM] 3 consecutive failures, forcing END_TURN`);
          dispatch({ type: "END_TURN", playerId: activePlayerId });
          addLLMLog(activePlayerId, "END_TURN", "Forced END_TURN (repeated failures)", "Fallback");
          break;
        }

        llmResult = await callLLMBot(state, activePlayerId, "actions", actionHistory);

        if (!llmResult.ok) {
          console.warn(`[LLM] Error in actions phase: ${llmResult.error}`);
          break;
        }

        const action = llmResult.action;
        const payload = llmResult.payload || {};

        if (action === "END_TURN") {
          if (dispatch({ type: "END_TURN", playerId: activePlayerId })) {
            addLLMLog(
              activePlayerId,
              "END_TURN",
              `Distance to impact: ${state.distanceToImpact}`,
              "LLM chose END_TURN",
              llmResult.reasoning
            );
          }
          break;
        }

        // Track if this action succeeds or fails
        let actionSucceeded = false;

        if (action === "LAUNCH_ROCKET" && payload.rocketId) {
          const rocketId = payload.rocketId as string;
          const player = state.players[activePlayerId];
          const rocket = player?.rockets.find((r) => r.id === rocketId);
          const rocketStats = rocket ? { power: rocket.power, accuracy: rocket.accuracy, buildTimeBase: rocket.buildTimeBase } : null;

          if (dispatch({ type: "LAUNCH_ROCKET", playerId: activePlayerId, payload: { rocketId } })) {
            totalRocketsLaunched++;
            actionSucceeded = true;
            const result = state.lastLaunchResult;
            if (result && rocketStats) {
              const damage = result.destroyed
                ? result.strengthBefore
                : (result.hit ? Math.max(0, result.strengthBefore - result.strengthAfter) : 0);
              launchedRockets.push({ ...rocketStats, hit: result.hit, damage, destroyed: result.destroyed });
              const hitMiss = result.hit ? "HIT" : "MISS";
              const destroyed = result.destroyed ? " - DESTROYED!" : "";
              actionHistory.push(`LAUNCH(${hitMiss})`);
              addLLMLog(
                activePlayerId,
                "LAUNCH_ROCKET",
                `Roll ${result.diceRoll} vs ${result.accuracyNeeded}: ${hitMiss}${destroyed}`,
                "LLM chose LAUNCH",
                llmResult.reasoning
              );
            }
          }
        }

        if (action === "BUILD_ROCKET" && payload.power && payload.accuracy && payload.buildTimeCost) {
          const player = state.players[activePlayerId];
          const rocketsBefore = player?.rockets.length ?? 0;
          const resourcesBefore = player?.resourceCubes ?? 0;

          const config = {
            power: payload.power as number,
            accuracy: payload.accuracy as number,
            buildTimeBase: payload.buildTimeCost as number,
          };

          // Validate cost before attempting
          const cost = config.power + config.accuracy + config.buildTimeBase;
          if (cost > resourcesBefore) {
            console.warn(`[LLM] BUILD_ROCKET rejected: cost ${cost} > resources ${resourcesBefore}`);
            actionHistory.push(`BUILD_FAILED(insufficient_cubes)`);
            // Don't continue - let the bot try something else or end turn
          } else if (dispatch({ type: "BUILD_ROCKET", playerId: activePlayerId, payload: config })) {
            const playerAfter = state.players[activePlayerId];
            const rocketsAfter = playerAfter?.rockets.length ?? 0;

            // Verify state actually changed
            if (rocketsAfter > rocketsBefore) {
              totalRocketsBuilt++;
              builtRockets.push(config);
              actionSucceeded = true;
              actionHistory.push(`BUILD(P${config.power}/A${config.accuracy})`);
              addLLMLog(
                activePlayerId,
                "BUILD_ROCKET",
                `P=${config.power}, A=${config.accuracy}, BTC=${config.buildTimeBase}`,
                "LLM chose BUILD",
                llmResult.reasoning
              );
            } else {
              console.warn(`[LLM] BUILD_ROCKET dispatched but no state change`);
              actionHistory.push(`BUILD_FAILED(no_change)`);
            }
          }
        }

        if (action === "PLAY_CARD" && payload.cardId) {
          const player = state.players[activePlayerId];
          const cardId = payload.cardId as string;

          // Validate card exists in hand
          const cardInHand = player?.hand.find(c => c.id === cardId);
          if (!cardInHand) {
            console.warn(`[LLM] PLAY_CARD rejected: card ${cardId} not in hand`);
            actionHistory.push(`PLAY_FAILED(card_not_found:${cardId})`);
            continue;
          }

          // Get card type for validation
          const cardType = (cardInHand as { cardType?: string }).cardType;

          // Validate required targets based on card type
          const needsTargetPlayer = ["RESOURCE_SEIZURE", "TECHNOLOGY_THEFT", "EMBARGO", "SABOTAGE", "REGULATORY_REVIEW"];
          const needsTargetRocket = ["STREAMLINED_ASSEMBLY", "REGULATORY_REVIEW"];
          const needsPeekChoice = ["COMET_RESEARCH"];

          if (needsTargetPlayer.includes(cardType || "") && !payload.targetPlayerId) {
            console.warn(`[LLM] PLAY_CARD rejected: ${cardType} requires targetPlayerId`);
            actionHistory.push(`PLAY_FAILED(missing_targetPlayerId:${cardType})`);
            continue;
          }

          if (needsTargetRocket.includes(cardType || "") && !payload.targetRocketId) {
            console.warn(`[LLM] PLAY_CARD rejected: ${cardType} requires targetRocketId`);
            actionHistory.push(`PLAY_FAILED(missing_targetRocketId:${cardType})`);
            continue;
          }

          if (needsPeekChoice.includes(cardType || "") && !payload.peekChoice) {
            console.warn(`[LLM] PLAY_CARD rejected: ${cardType} requires peekChoice ("strength" or "movement")`);
            actionHistory.push(`PLAY_FAILED(missing_peekChoice:${cardType})`);
            continue;
          }

          const handSizeBefore = player?.hand.length ?? 0;

          const cardPayload = {
            cardId,
            targetPlayerId: payload.targetPlayerId as string | undefined,
            targetRocketId: payload.targetRocketId as string | undefined,
            peekChoice: payload.peekChoice as "strength" | "movement" | undefined,
          };
          if (dispatch({ type: "PLAY_CARD", playerId: activePlayerId, payload: cardPayload })) {
            const playerAfter = state.players[activePlayerId];
            const handSizeAfter = playerAfter?.hand.length ?? 0;

            // Verify card was consumed
            if (handSizeAfter < handSizeBefore) {
              actionSucceeded = true;
              const cardResult = state.lastCardResult;
              actionHistory.push(`PLAY(${cardResult?.cardName ?? cardId})`);
              addLLMLog(
                activePlayerId,
                "PLAY_CARD",
                cardResult?.description ?? `Played ${cardId}`,
                "LLM chose PLAY_CARD",
                llmResult.reasoning
              );
            } else {
              console.warn(`[LLM] PLAY_CARD dispatched but card not consumed`);
              actionHistory.push(`PLAY_FAILED(not_consumed:${cardId})`);
            }
          }
        }

        // If no known action matched, it's an unknown action
        if (!actionSucceeded && action !== "LAUNCH_ROCKET" && action !== "BUILD_ROCKET" && action !== "PLAY_CARD") {
          console.warn(`[LLM] Unknown action: ${action}, forcing END_TURN`);
          dispatch({ type: "END_TURN", playerId: activePlayerId });
          addLLMLog(activePlayerId, "END_TURN", "Forced END_TURN (unknown action)", "Fallback");
          break;
        }

        // Track consecutive failures
        if (actionSucceeded) {
          consecutiveFailures = 0;
          lastFailedAction = "";
        } else {
          if (action === lastFailedAction) {
            consecutiveFailures++;
          } else {
            consecutiveFailures = 1;
            lastFailedAction = action || "";
          }
        }
      }

      // If we hit max free actions without ending turn, force it
      if (freeActionCount >= maxFreeActions) {
        dispatch({ type: "END_TURN", playerId: activePlayerId });
        addLLMLog(activePlayerId, "END_TURN", "Forced END_TURN (max actions)", "Fallback");
      }

      // Continue to next turn
      setTimeout(runLLMTurn, 0);
    }

    // Start the async loop
    runLLMTurn();
  });
}

// ============================================================================
// CAFE SIMULATION TYPES
// ============================================================================

interface CafeSimLogEntry {
  id: number;
  round: number;
  phase: string;
  playerId: string;
  playerLabel: string;
  personality: string;
  action: string;
  actionType: string;
  details: string;
  // Player state
  money: number;
  supplies: string;
  customerCount: number;
  // Game state
  reputation: number;
  customersRemaining: number;
  // Decision context
  decision: string;
}

interface CafeSimSummary {
  totalRounds: number;
  winner: string | null;
  endReason: "lastStanding" | "maxRounds" | "allBankrupt";
  playerScores: Record<string, { money: number; prestige: number; total: number }>;
  eliminatedPlayers: string[];
  finalReputation: number;
  customersServed: number;
  aborted?: boolean;
}

interface CafeSimRow {
  id: number;
  timestamp: number;
  players: number;
  rounds: number;
  endReason: "lastStanding" | "maxRounds" | "allBankrupt";
  winnerIds: string[];
  customersServed: number;
  finalReputation: number;
}

// ============================================================================
// CAFE SIMULATION HELPERS
// ============================================================================

function createCafeTestRoom(players: Player[]): Room {
  return {
    roomCode: "TEST",
    hostId: players[0].id,
    players,
    gameId: "cafe",
    createdAt: Date.now(),
    mode: "simulation",
  };
}

function formatSupplies(player: CafePlayerState): string {
  const { coffeeBeans, tea, milk, syrup } = player.supplies;
  return `C:${coffeeBeans} T:${tea} M:${milk} S:${syrup}`;
}

function getActivePlayerCount(state: CafeState): number {
  return state.playerOrder.filter(id => !state.eliminatedPlayers.includes(id)).length;
}

// ============================================================================
// CAFE SIMULATION RUNNER
// ============================================================================

const CAFE_MAX_ROUNDS = 10;
const CAFE_MAX_ACTIONS = 500;

function runCafeSimulation(
  playerCount: number,
  maxRounds: number = CAFE_MAX_ROUNDS
): Promise<{ summary: CafeSimSummary; log: CafeSimLogEntry[]; aborted?: boolean }> {
  return new Promise((resolve) => {
    console.log(`[Cafe Simulation] Starting game with ${playerCount} players`);
    const players = createTestPlayers(playerCount);
    const room = createCafeTestRoom(players);
    let seed = Date.now();

    // Seeded random function
    const createRandom = () => {
      let s = seed++;
      return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return s / 0x7fffffff;
      };
    };

    // Create initial state
    let state = cafeGame.initialState(players);

    const log: CafeSimLogEntry[] = [];
    let actionCounter = 0;
    let aborted = false;

    const addLog = (
      playerId: string,
      actionType: string,
      details: string,
      decision: string
    ) => {
      const player = state.players[playerId];
      const personality = getCafePlayerPersonality(playerId);
      const personalityName = CAFE_PERSONALITIES[personality].name;

      log.push({
        id: log.length,
        round: state.round,
        phase: state.phase,
        playerId,
        playerLabel: playerId.replace("player-", "P"),
        personality: personalityName,
        action: actionType,
        actionType,
        details,
        money: player?.money ?? 0,
        supplies: player ? formatSupplies(player) : "-",
        customerCount: player?.customerLine.length ?? 0,
        reputation: state.reputation,
        customersRemaining: state.currentRoundCustomers.length - state.customersDealtThisRound,
        decision,
      });
    };

    const dispatch = (action: CafeAction): boolean => {
      const random = createRandom();
      const ctx: GameContext = {
        room,
        playerId: action.playerId,
        random,
        now: () => Date.now(),
      };

      const allowed = cafeGame.isActionAllowed?.(state, action, ctx) ?? true;
      if (allowed) {
        state = cafeGame.reducer(state, action, ctx);
        actionCounter++;
        return true;
      }
      return false;
    };

    // Start game (as host)
    dispatch({ type: "START_GAME", playerId: players[0].id });
    addLog("SYSTEM", "START_GAME", `Game started with ${playerCount} players`, "Game initialization");

    // Main simulation loop
    function runNextPhase() {
      // Check termination conditions
      if (state.phase === "gameOver" || state.round > maxRounds || actionCounter >= CAFE_MAX_ACTIONS) {
        if (state.round > maxRounds || actionCounter >= CAFE_MAX_ACTIONS) {
          console.warn(`[Cafe Simulation] ABORTED at round ${state.round}`);
          aborted = true;
        }

        // Build summary
        const playerScores: Record<string, { money: number; prestige: number; total: number }> = {};
        let totalCustomersServed = 0;

        for (const [id, player] of Object.entries(state.players)) {
          const total = player.money + player.prestige * 2;
          playerScores[player.name] = {
            money: player.money,
            prestige: player.prestige,
            total,
          };
          totalCustomersServed += player.customersServed;
        }

        const endReason: "lastStanding" | "maxRounds" | "allBankrupt" =
          state.eliminatedPlayers.length === state.playerOrder.length
            ? "allBankrupt"
            : state.winnerId
            ? "lastStanding"
            : "maxRounds";

        const summary: CafeSimSummary = {
          totalRounds: state.round,
          winner: state.winnerId ? state.players[state.winnerId]?.name ?? null : null,
          endReason,
          playerScores,
          eliminatedPlayers: state.eliminatedPlayers.map(id => state.players[id]?.name ?? id),
          finalReputation: state.reputation,
          customersServed: totalCustomersServed,
          aborted,
        };

        resolve({ summary, log, aborted });
        return;
      }

      const hostId = players[0].id;
      const random = createRandom();

      switch (state.phase) {
        case "planning": {
          // Host ends planning
          dispatch({ type: "END_PLANNING", playerId: hostId });
          addLog(hostId, "END_PLANNING", "Planning phase ended", "Host action");
          break;
        }

        case "investment": {
          // Each active player makes investment decisions
          for (const playerId of state.playerOrder) {
            if (state.eliminatedPlayers.includes(playerId)) continue;

            const player = state.players[playerId];
            const personality = getCafePlayerPersonality(playerId);

            // Make multiple investment decisions until done
            let investmentActions = 0;
            const maxInvestmentActions = 20;

            while (investmentActions < maxInvestmentActions) {
              investmentActions++;
              const decision = decideInvestmentAction(player, personality, state, random);

              if (decision.action === "END_INVESTMENT") {
                break;
              }

              if (decision.action === "PURCHASE_SUPPLY" && decision.supplyType) {
                if (dispatch({
                  type: "PURCHASE_SUPPLY",
                  playerId,
                  payload: { supplyType: decision.supplyType },
                })) {
                  addLog(playerId, "PURCHASE_SUPPLY", `Bought ${decision.supplyType}`, decision.reason);
                }
              } else if (decision.action === "UPGRADE_CAFE" && decision.upgradeType) {
                if (dispatch({
                  type: "UPGRADE_CAFE",
                  playerId,
                  payload: { upgradeType: decision.upgradeType },
                })) {
                  addLog(playerId, "UPGRADE_CAFE", `Upgraded ${decision.upgradeType}`, decision.reason);
                }
              }

              // Re-fetch player state after action
              const updatedPlayer = state.players[playerId];
              if (updatedPlayer.money <= CAFE_CONFIG.RENT_PER_ROUND) {
                break; // Stop if running low on money
              }
            }
          }

          // Host ends investment
          dispatch({ type: "END_INVESTMENT", playerId: hostId });
          addLog(hostId, "END_INVESTMENT", "Investment phase ended", "Host action");
          break;
        }

        case "customerDraft": {
          // Draft loop until all customers are dealt
          let draftIterations = 0;
          const maxDraftIterations = 100;

          while (
            state.phase === "customerDraft" &&
            draftIterations < maxDraftIterations
          ) {
            draftIterations++;

            // If no current customer, drawer draws
            if (state.currentCustomer === null) {
              const drawerId = state.playerOrder[state.currentDrawerIndex];
              if (state.eliminatedPlayers.includes(drawerId)) continue;

              if (state.customersDealtThisRound >= state.currentRoundCustomers.length) {
                break; // All customers dealt
              }

              dispatch({ type: "DRAW_CUSTOMER", playerId: drawerId });
              addLog(drawerId, "DRAW_CUSTOMER", "Drew a customer", "Drawer action");
              continue;
            }

            // Current customer exists - decider decides
            const deciderId = state.playerOrder[state.currentDeciderIndex];
            if (state.eliminatedPlayers.includes(deciderId)) continue;

            const player = state.players[deciderId];
            const personality = getCafePlayerPersonality(deciderId);
            const isDrawer = state.currentDrawerIndex === state.currentDeciderIndex;
            const activeCount = getActivePlayerCount(state);

            const decision = decideOnCustomer(
              player,
              state.currentCustomer,
              personality,
              state.passCount,
              activeCount,
              isDrawer,
              random
            );

            if (decision.action === "TAKE_CUSTOMER") {
              dispatch({ type: "TAKE_CUSTOMER", playerId: deciderId });
              addLog(deciderId, "TAKE_CUSTOMER", `Took customer`, decision.reason);
            } else {
              dispatch({ type: "PASS_CUSTOMER", playerId: deciderId });
              addLog(deciderId, "PASS_CUSTOMER", `Passed customer`, decision.reason);
            }
          }
          break;
        }

        case "customerResolution": {
          // Each player selects which customers to fulfill
          for (const playerId of state.playerOrder) {
            if (state.eliminatedPlayers.includes(playerId)) continue;

            const player = state.players[playerId];
            const personality = getCafePlayerPersonality(playerId);
            const decision = selectCustomersToFulfill(player, personality);

            // Toggle off any customers not in selection
            const currentSelection = state.selectedForFulfillment[playerId] || [];
            for (const idx of currentSelection) {
              if (!decision.customerIndices.includes(idx)) {
                dispatch({
                  type: "TOGGLE_CUSTOMER_FULFILL",
                  playerId,
                  payload: { customerIndex: idx },
                });
              }
            }

            // Toggle on selected customers
            for (const idx of decision.customerIndices) {
              if (!currentSelection.includes(idx)) {
                dispatch({
                  type: "TOGGLE_CUSTOMER_FULFILL",
                  playerId,
                  payload: { customerIndex: idx },
                });
              }
            }

            // Confirm resolution
            dispatch({ type: "CONFIRM_RESOLUTION", playerId });
            addLog(playerId, "CONFIRM_RESOLUTION", `Selected ${decision.customerIndices.length} customers`, decision.reason);
          }

          // Host resolves customers
          dispatch({ type: "RESOLVE_CUSTOMERS", playerId: hostId });
          addLog(hostId, "RESOLVE_CUSTOMERS", "Customers resolved", "Host action");
          break;
        }

        case "shopClosed": {
          // Host closes shop
          dispatch({ type: "CLOSE_SHOP", playerId: hostId });
          addLog(hostId, "CLOSE_SHOP", "Shop closed for the day", "Host action");
          break;
        }

        case "cleanup": {
          // Check for bailout opportunities
          for (const playerId of state.playerOrder) {
            if (state.eliminatedPlayers.includes(playerId)) continue;

            const player = state.players[playerId];
            const personality = getCafePlayerPersonality(playerId);
            const bailoutDecision = decideBailout(player, state, personality, random);

            if (bailoutDecision.targetPlayerId) {
              dispatch({
                type: "PAY_RENT_FOR",
                playerId,
                payload: { targetPlayerId: bailoutDecision.targetPlayerId },
              });
              addLog(playerId, "PAY_RENT_FOR", `Bailed out ${bailoutDecision.targetPlayerId}`, bailoutDecision.reason);
            }
          }

          // Host ends round
          dispatch({ type: "END_ROUND", playerId: hostId });
          addLog(hostId, "END_ROUND", `Round ${state.round} ended`, "Host action");
          break;
        }

        default:
          // Unknown phase - should not happen
          console.warn(`[Cafe Simulation] Unknown phase: ${state.phase}`);
          break;
      }

      // Continue to next phase
      setTimeout(runNextPhase, 0);
    }

    // Start simulation loop
    runNextPhase();
  });
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function TestGamePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const gameId = params.gameId as string;
  const playerCount = Number(searchParams.get("players")) || 2;

  // Comet Rush state
  const [summary, setSummary] = useState<SimSummary | null>(null);
  const [log, setLog] = useState<SimLogEntry[]>([]);

  // Cafe state
  const [cafeSummary, setCafeSummary] = useState<CafeSimSummary | null>(null);
  const [cafeLog, setCafeLog] = useState<CafeSimLogEntry[]>([]);
  const [cafeSimRows, setCafeSimRows] = useState<CafeSimRow[]>([]);

  const [isRunning, setIsRunning] = useState(false);

  // LLM bot mode (only for Comet Rush currently)
  const [useLLMBot, setUseLLMBot] = useState(false);
  const [llmProgress, setLLMProgress] = useState<string | null>(null);

  // All simulation runs (Comet Rush)
  const [simRows, setSimRows] = useState<SimRow[]>([]);
  const [nextId, setNextId] = useState(1);

  // Determine if this is a cafe game
  const isCafe = gameId === "cafe";

  // Sorting state
  const [sortKey, setSortKey] = useState<SortKey>("id");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Filter state - dropdowns use "Any" as default
  const [filterPlayers, setFilterPlayers] = useState("Any");
  const [filterRounds, setFilterRounds] = useState("Any");
  const [filterEndReason, setFilterEndReason] = useState("Any");
  const [filterRocketsBuilt, setFilterRocketsBuilt] = useState("Any");
  const [filterRocketsLaunched, setFilterRocketsLaunched] = useState("Any");

  // Action Log sorting state
  const [logSortKey, setLogSortKey] = useState<LogSortKey>("id");
  const [logSortDir, setLogSortDir] = useState<"asc" | "desc">("asc");

  // Action Log filter state - dropdowns use "Any" as default
  const [filterLogRound, setFilterLogRound] = useState("Any");
  const [filterLogPlayer, setFilterLogPlayer] = useState("Any");
  const [filterLogAction, setFilterLogAction] = useState("Any");
  const [filterMvCards, setFilterMvCards] = useState("Any");
  const [filterStrCards, setFilterStrCards] = useState("Any");
  const [filterMvTotal, setFilterMvTotal] = useState("Any");
  const [filterStrTotal, setFilterStrTotal] = useState("Any");
  const [filterLogSummary, setFilterLogSummary] = useState(""); // Keep text for details

  const runSimulation = useCallback(async () => {
    setIsRunning(true);
    setLLMProgress(null);

    if (isCafe) {
      // Run Cafe simulation
      setCafeSummary(null);
      setCafeLog([]);

      const result = await runCafeSimulation(playerCount);

      const summaryWithAborted: CafeSimSummary = {
        ...result.summary,
        aborted: result.aborted,
      };

      setCafeSummary(summaryWithAborted);
      setCafeLog(result.log);
      setIsRunning(false);

      // Add to cafe simulation rows
      const row: CafeSimRow = {
        id: nextId,
        timestamp: Date.now(),
        players: playerCount,
        rounds: result.summary.totalRounds,
        endReason: result.summary.endReason,
        winnerIds: result.summary.winner ? [result.summary.winner] : [],
        customersServed: result.summary.customersServed,
        finalReputation: result.summary.finalReputation,
      };

      setCafeSimRows((prev) => [...prev, row]);
      setNextId((id) => id + 1);
    } else {
      // Run Comet Rush simulation
      setSummary(null);
      setLog([]);

      const result = useLLMBot
        ? await runLLMCometRushSimulation(playerCount, MAX_ROUNDS_PER_GAME, setLLMProgress)
        : await runCometRushSimulation(playerCount);

      setLLMProgress(null);

      // Add aborted flag to summary if present
      const summaryWithAborted: SimSummary = {
        ...result.summary,
        aborted: result.aborted,
      };

      setSummary(summaryWithAborted);
      setLog(result.log);
      setIsRunning(false);

      // Add to simulation rows
      const endReason = result.aborted
        ? "maxRounds"
        : result.summary.cometDestroyed
        ? "cometDestroyed"
        : result.summary.earthDestroyed
        ? "earthDestroyed"
        : "maxRounds";

      const row: SimRow = {
        id: nextId,
        timestamp: Date.now(),
        players: playerCount,
        rounds: result.summary.totalRounds,
        endReason: endReason as "earthDestroyed" | "cometDestroyed" | "maxRounds",
        winnerIds: result.summary.winner ? [result.summary.winner] : [],
        rocketsBuilt: result.summary.totalRocketsBuilt,
        rocketsLaunched: result.summary.totalRocketsLaunched,
      };

      setSimRows((prev) => [...prev, row]);
      setNextId((id) => id + 1);
    }
  }, [playerCount, nextId, useLLMBot, isCafe]);

  // Sorting logic
  const handleSort = useCallback((column: SortKey) => {
    setSortKey((prevKey) => {
      if (prevKey === column) {
        setSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevKey;
      } else {
        setSortDir("asc");
        return column;
      }
    });
  }, []);

  // Compute unique values for Simulation Runs dropdowns
  const uniquePlayers = useMemo(
    () => Array.from(new Set(simRows.map((r) => r.players))).sort((a, b) => a - b),
    [simRows],
  );
  const uniqueRounds = useMemo(
    () => Array.from(new Set(simRows.map((r) => r.rounds))).sort((a, b) => a - b),
    [simRows],
  );
  const uniqueEndReasons = useMemo(
    () => Array.from(new Set(simRows.map((r) => r.endReason))).sort(),
    [simRows],
  );
  const uniqueRocketsBuilt = useMemo(
    () => Array.from(new Set(simRows.map((r) => r.rocketsBuilt))).sort((a, b) => a - b),
    [simRows],
  );
  const uniqueRocketsLaunched = useMemo(
    () => Array.from(new Set(simRows.map((r) => r.rocketsLaunched))).sort((a, b) => a - b),
    [simRows],
  );

  // Derived sorted rows
  const sortedRows = [...simRows].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const va = a[sortKey];
    const vb = b[sortKey];

    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * dir;
    }
    if (Array.isArray(va) && Array.isArray(vb)) {
      return (va.length - vb.length) * dir;
    }
    return String(va).localeCompare(String(vb)) * dir;
  });

  // Derived filtered rows
  const filteredRows = sortedRows.filter((row) => {
    if (filterPlayers !== "Any" && String(row.players) !== filterPlayers) return false;
    if (filterRounds !== "Any" && String(row.rounds) !== filterRounds) return false;
    if (filterEndReason !== "Any" && row.endReason !== filterEndReason) return false;
    if (filterRocketsBuilt !== "Any" && String(row.rocketsBuilt) !== filterRocketsBuilt)
      return false;
    if (
      filterRocketsLaunched !== "Any" &&
      String(row.rocketsLaunched) !== filterRocketsLaunched
    )
      return false;
    return true;
  });

  // Copy table to clipboard
  const handleCopyTable = useCallback(async () => {
    if (!navigator.clipboard) return;

    const header = [
      "#",
      "players",
      "rounds",
      "endReason",
      "timestamp",
      "winners",
      "rocketsBuilt",
      "rocketsLaunched",
    ];

    const lines = [
      header.join("\t"),
      ...filteredRows.map((row) =>
        [
          row.id,
          row.players,
          row.rounds,
          row.endReason,
          new Date(row.timestamp).toISOString(),
          row.winnerIds.join(","),
          row.rocketsBuilt,
          row.rocketsLaunched,
        ].join("\t"),
      ),
    ];

    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy table", e);
    }
  }, [filteredRows]);

  // Action Log sorting logic
  const handleLogSort = useCallback((column: LogSortKey) => {
    setLogSortKey((prevKey) => {
      if (prevKey === column) {
        setLogSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
        return prevKey;
      } else {
        setLogSortDir("asc");
        return column;
      }
    });
  }, []);

  // Compute unique values for Action Log dropdowns
  const uniqueLogRounds = useMemo(
    () => Array.from(new Set(log.map((r) => r.round))).sort((a, b) => a - b),
    [log],
  );
  const uniqueLogPlayers = useMemo(
    () => Array.from(new Set(log.map((r) => r.playerLabel))).sort(),
    [log],
  );
  const uniqueLogActions = useMemo(
    () => Array.from(new Set(log.map((r) => r.actionType))).sort(),
    [log],
  );
  const uniqueMvCards = useMemo(
    () =>
      Array.from(new Set(log.map((r) => r.movementCardsLeft))).sort((a, b) => a - b),
    [log],
  );
  const uniqueStrCards = useMemo(
    () =>
      Array.from(new Set(log.map((r) => r.strengthCardsLeft))).sort((a, b) => a - b),
    [log],
  );
  const uniqueMvTotals = useMemo(
    () =>
      Array.from(new Set(log.map((r) => r.totalMovementValueLeft))).sort(
        (a, b) => a - b,
      ),
    [log],
  );
  const uniqueStrTotals = useMemo(
    () =>
      Array.from(new Set(log.map((r) => r.totalStrengthValueLeft))).sort(
        (a, b) => a - b,
      ),
    [log],
  );

  // Derived sorted action log
  const sortedActionLog = [...log].sort((a, b) => {
    const dir = logSortDir === "asc" ? 1 : -1;
    const va = a[logSortKey];
    const vb = b[logSortKey];

    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * dir;
    }
    return String(va).localeCompare(String(vb)) * dir;
  });

  // Derived filtered action log
  const filteredActionLog = sortedActionLog.filter((row) => {
    if (filterLogRound !== "Any" && String(row.round) !== filterLogRound) return false;
    if (filterLogPlayer !== "Any" && row.playerLabel !== filterLogPlayer) return false;
    if (filterLogAction !== "Any" && row.actionType !== filterLogAction) return false;
    if (
      filterMvCards !== "Any" &&
      String(row.movementCardsLeft) !== filterMvCards
    )
      return false;
    if (
      filterStrCards !== "Any" &&
      String(row.strengthCardsLeft) !== filterStrCards
    )
      return false;
    if (
      filterMvTotal !== "Any" &&
      String(row.totalMovementValueLeft) !== filterMvTotal
    )
      return false;
    if (
      filterStrTotal !== "Any" &&
      String(row.totalStrengthValueLeft) !== filterStrTotal
    )
      return false;
    if (
      filterLogSummary &&
      !row.summary.toLowerCase().includes(filterLogSummary.toLowerCase().trim())
    )
      return false;
    return true;
  });

  // Copy action log to clipboard
  const handleCopyActionLog = useCallback(async () => {
    if (!navigator.clipboard) return;

    const header = [
      "#",
      "round",
      "player",
      "action",
      "res",
      "hand",
      "queue",
      "ready",
      "actSeg",
      "segHP",
      "mvCards",
      "strCards",
      "dist",
      "strTotal",
      "decision",
      "sets",
      "canBuild",
      "slotFull",
      "hasReady",
      "details",
      "reasoning",
    ];

    const lines = [
      header.join("\t"),
      ...filteredActionLog.map((row) =>
        [
          row.id,
          row.round,
          row.playerLabel,
          row.actionType,
          row.resources,
          row.hand,
          row.buildQueue,
          row.readyRockets,
          row.activeSegment,
          row.segmentHP,
          row.movementCardsLeft,
          row.strengthCardsLeft,
          row.totalMovementValueLeft,
          row.totalStrengthValueLeft,
          row.decision,
          row.playableSets,
          row.canBuildRocket,
          row.rocketSlotFull,
          row.hasReadyRocket,
          row.summary.replace(/\s+/g, " "),
          (row.reasoning || "").replace(/\s+/g, " "),
        ].join("\t"),
      ),
    ];

    const text = lines.join("\n");

    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.error("Failed to copy action log", err);
    }
  }, [filteredActionLog]);

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <h1 className="text-3xl font-bold mb-2">Test: {gameId}</h1>
      <p className="text-gray-400 mb-6">{playerCount} players</p>

      <div className="flex flex-col items-center gap-4 mb-8">
        <div className="flex gap-4 items-center">
          <button
            onClick={runSimulation}
            disabled={isRunning}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            {isRunning ? "Running..." : "Run Simulation"}
          </button>
          <Link
            href="/test"
            className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
          >
            Back
          </Link>
        </div>

        {/* LLM Bot Toggle - only for Comet Rush */}
        {!isCafe && (
          <label className="flex items-center gap-3 cursor-pointer">
            <span className="text-sm text-gray-400">Hardcoded Bots</span>
            <div className="relative">
              <input
                type="checkbox"
                checked={useLLMBot}
                onChange={(e) => setUseLLMBot(e.target.checked)}
                disabled={isRunning}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
            </div>
            <span className="text-sm text-gray-400">LLM Bots (GPT-4o-mini)</span>
          </label>
        )}

        {/* LLM Progress */}
        {llmProgress && (
          <div className="text-sm text-purple-400 animate-pulse">
            {llmProgress}
          </div>
        )}
      </div>

      {/* Simulation Runs Table - Comet Rush */}
      {!isCafe && (
      <section className="w-full max-w-6xl mb-8">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h2 className="text-sm font-semibold text-slate-100">
            Simulation Runs ({filteredRows.length})
          </h2>
          <button
            type="button"
            onClick={handleCopyTable}
            disabled={filteredRows.length === 0}
            className="rounded-lg border border-slate-600 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Copy Table
          </button>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs text-slate-200">
              <thead>
                <tr className="border-b border-slate-700 text-[11px] uppercase tracking-wide text-slate-400">
                  <th
                    className="cursor-pointer px-2 py-1 hover:text-slate-200"
                    onClick={() => handleSort("id")}
                  >
                    # {sortKey === "id" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="cursor-pointer px-2 py-1 hover:text-slate-200"
                    onClick={() => handleSort("players")}
                  >
                    Players {sortKey === "players" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="cursor-pointer px-2 py-1 hover:text-slate-200"
                    onClick={() => handleSort("rounds")}
                  >
                    Rounds {sortKey === "rounds" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="cursor-pointer px-2 py-1 hover:text-slate-200"
                    onClick={() => handleSort("endReason")}
                  >
                    End Reason {sortKey === "endReason" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="cursor-pointer px-2 py-1 hover:text-slate-200"
                    onClick={() => handleSort("rocketsBuilt")}
                  >
                    Built {sortKey === "rocketsBuilt" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="cursor-pointer px-2 py-1 hover:text-slate-200"
                    onClick={() => handleSort("rocketsLaunched")}
                  >
                    Launched {sortKey === "rocketsLaunched" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    className="cursor-pointer px-2 py-1 hover:text-slate-200"
                    onClick={() => handleSort("timestamp")}
                  >
                    Time {sortKey === "timestamp" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="px-2 py-1">Winners</th>
                </tr>

                {/* Filter row */}
                <tr className="border-b border-slate-800 text-[11px]">
                  <th className="px-2 py-1"></th>
                  <th className="px-2 py-1">
                    <select
                      className="w-full rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                      value={filterPlayers}
                      onChange={(e) => setFilterPlayers(e.target.value)}
                    >
                      <option value="Any">Any</option>
                      {uniquePlayers.map((p) => (
                        <option key={p} value={String(p)}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th className="px-2 py-1">
                    <select
                      className="w-full rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                      value={filterRounds}
                      onChange={(e) => setFilterRounds(e.target.value)}
                    >
                      <option value="Any">Any</option>
                      {uniqueRounds.map((r) => (
                        <option key={r} value={String(r)}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th className="px-2 py-1">
                    <select
                      className="w-full rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                      value={filterEndReason}
                      onChange={(e) => setFilterEndReason(e.target.value)}
                    >
                      <option value="Any">Any</option>
                      {uniqueEndReasons.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th className="px-2 py-1">
                    <select
                      className="w-full rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                      value={filterRocketsBuilt}
                      onChange={(e) => setFilterRocketsBuilt(e.target.value)}
                    >
                      <option value="Any">Any</option>
                      {uniqueRocketsBuilt.map((r) => (
                        <option key={r} value={String(r)}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th className="px-2 py-1">
                    <select
                      className="w-full rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                      value={filterRocketsLaunched}
                      onChange={(e) => setFilterRocketsLaunched(e.target.value)}
                    >
                      <option value="Any">Any</option>
                      {uniqueRocketsLaunched.map((r) => (
                        <option key={r} value={String(r)}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </th>
                  <th className="px-2 py-1"></th>
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>

              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-2 py-3 text-center text-[11px] text-slate-500"
                    >
                      No simulation runs yet. Click &quot;Run Simulation&quot; to get started.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="px-2 py-1 text-[11px]">{row.id}</td>
                      <td className="px-2 py-1 text-[11px]">{row.players}</td>
                      <td className="px-2 py-1 text-[11px]">{row.rounds}</td>
                      <td className="px-2 py-1 text-[11px]">
                        <span
                          className={
                            row.endReason === "cometDestroyed"
                              ? "text-green-400"
                              : row.endReason === "earthDestroyed"
                              ? "text-red-400"
                              : "text-yellow-400"
                          }
                        >
                          {row.endReason}
                        </span>
                      </td>
                      <td className="px-2 py-1 text-[11px]">{row.rocketsBuilt}</td>
                      <td className="px-2 py-1 text-[11px]">{row.rocketsLaunched}</td>
                      <td className="px-2 py-1 text-[11px]">
                        {new Date(row.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-2 py-1 text-[11px]">
                        {row.winnerIds.join(", ") || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      )}

      {/* Simulation Runs Table - Cafe */}
      {isCafe && (
        <section className="w-full max-w-6xl mb-8">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-100">
              Simulation Runs ({cafeSimRows.length})
            </h2>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs text-slate-200">
                <thead>
                  <tr className="border-b border-slate-700 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">Players</th>
                    <th className="px-2 py-1">Rounds</th>
                    <th className="px-2 py-1">End Reason</th>
                    <th className="px-2 py-1">Customers</th>
                    <th className="px-2 py-1">Final Rep</th>
                    <th className="px-2 py-1">Time</th>
                    <th className="px-2 py-1">Winner</th>
                  </tr>
                </thead>
                <tbody>
                  {cafeSimRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-2 py-3 text-center text-[11px] text-slate-500"
                      >
                        No simulation runs yet. Click &quot;Run Simulation&quot; to get started.
                      </td>
                    </tr>
                  ) : (
                    cafeSimRows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                        <td className="px-2 py-1 text-[11px]">{row.id}</td>
                        <td className="px-2 py-1 text-[11px]">{row.players}</td>
                        <td className="px-2 py-1 text-[11px]">{row.rounds}</td>
                        <td className="px-2 py-1 text-[11px]">
                          <span
                            className={
                              row.endReason === "lastStanding"
                                ? "text-green-400"
                                : row.endReason === "allBankrupt"
                                ? "text-red-400"
                                : "text-yellow-400"
                            }
                          >
                            {row.endReason}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-[11px]">{row.customersServed}</td>
                        <td className={`px-2 py-1 text-[11px] ${row.finalReputation >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {row.finalReputation > 0 ? "+" : ""}{row.finalReputation}
                        </td>
                        <td className="px-2 py-1 text-[11px]">
                          {new Date(row.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-2 py-1 text-[11px]">
                          {row.winnerIds.join(", ") || "—"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Last Run Summary - Comet Rush */}
      {!isCafe && summary && (
        <div className="w-full max-w-2xl mb-8">
          <h2 className="text-xl font-semibold mb-4">Last Run Summary</h2>
          <div className="bg-gray-800 rounded-lg p-4 space-y-2">
            {summary.aborted && (
              <div className="bg-orange-900/30 border border-orange-600 rounded p-2 mb-2">
                <span className="text-orange-400 font-semibold">⚠ SIMULATION ABORTED</span>
                <p className="text-orange-300 text-sm mt-1">
                  Hit safety cap (max rounds or actions). Check console for details.
                </p>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">Outcome:</span>
              <span
                className={summary.cometDestroyed ? "text-green-400" : "text-red-400"}
              >
                {summary.cometDestroyed ? "Comet Destroyed!" : "Earth Destroyed!"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total Rounds:</span>
              <span>{summary.totalRounds}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Winner:</span>
              <span className="text-yellow-400">{summary.winner ?? "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Rockets Built:</span>
              <span>{summary.totalRocketsBuilt}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Rockets Launched:</span>
              <span>{summary.totalRocketsLaunched}</span>
            </div>
            <div className="border-t border-gray-700 pt-2 mt-2">
              <span className="text-gray-400 block mb-2">Scores:</span>
              {Object.entries(summary.playerScores).map(([name, score]) => (
                <div key={name} className="flex justify-between pl-4">
                  <span>{name}</span>
                  <span>{score} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Last Run Summary - Cafe */}
      {isCafe && cafeSummary && (
        <div className="w-full max-w-2xl mb-8">
          <h2 className="text-xl font-semibold mb-4">Last Run Summary</h2>
          <div className="bg-gray-800 rounded-lg p-4 space-y-2">
            {cafeSummary.aborted && (
              <div className="bg-orange-900/30 border border-orange-600 rounded p-2 mb-2">
                <span className="text-orange-400 font-semibold">⚠ SIMULATION ABORTED</span>
                <p className="text-orange-300 text-sm mt-1">
                  Hit safety cap (max rounds or actions). Check console for details.
                </p>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-400">End Reason:</span>
              <span
                className={
                  cafeSummary.endReason === "lastStanding"
                    ? "text-green-400"
                    : cafeSummary.endReason === "allBankrupt"
                    ? "text-red-400"
                    : "text-yellow-400"
                }
              >
                {cafeSummary.endReason === "lastStanding"
                  ? "Last Standing!"
                  : cafeSummary.endReason === "allBankrupt"
                  ? "All Bankrupt"
                  : "Max Rounds"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Total Rounds:</span>
              <span>{cafeSummary.totalRounds}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Winner:</span>
              <span className="text-yellow-400">{cafeSummary.winner ?? "N/A"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Customers Served:</span>
              <span>{cafeSummary.customersServed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Final Reputation:</span>
              <span className={cafeSummary.finalReputation >= 0 ? "text-green-400" : "text-red-400"}>
                {cafeSummary.finalReputation > 0 ? "+" : ""}{cafeSummary.finalReputation}
              </span>
            </div>
            {cafeSummary.eliminatedPlayers.length > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">Eliminated:</span>
                <span className="text-red-400">{cafeSummary.eliminatedPlayers.join(", ")}</span>
              </div>
            )}
            <div className="border-t border-gray-700 pt-2 mt-2">
              <span className="text-gray-400 block mb-2">Final Scores:</span>
              {Object.entries(cafeSummary.playerScores).map(([name, score]) => (
                <div key={name} className="flex justify-between pl-4">
                  <span>{name}</span>
                  <span>${score.money} + {score.prestige}★ = {score.total} pts</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Analytics - Comet Rush only */}
      {!isCafe && summary?.analytics && (
        <div className="w-full max-w-2xl mb-8">
          <h2 className="text-xl font-semibold mb-4">Rocket Statistics</h2>
          <div className="bg-gray-800 rounded-lg p-4 space-y-4">
            {/* Built Rockets */}
            <div>
              <h3 className="text-lg font-semibold text-blue-400 mb-2">Built Rockets</h3>
              <div className="space-y-1 pl-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Power:</span>
                  <span>
                    {summary.analytics.built.minPower}–{summary.analytics.built.maxPower}{" "}
                    (avg {summary.analytics.built.avgPower.toFixed(1)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Accuracy:</span>
                  <span>
                    {summary.analytics.built.minAccuracy}–{summary.analytics.built.maxAccuracy}{" "}
                    (avg {summary.analytics.built.avgAccuracy.toFixed(1)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Build Time:</span>
                  <span>
                    {summary.analytics.built.minBuildTime}–{summary.analytics.built.maxBuildTime}{" "}
                    (avg {summary.analytics.built.avgBuildTime.toFixed(1)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Built:</span>
                  <span>{summary.analytics.built.count}</span>
                </div>
              </div>
            </div>

            {/* Launched Rockets */}
            <div className="border-t border-gray-700 pt-3">
              <h3 className="text-lg font-semibold text-green-400 mb-2">Launched Rockets</h3>
              <div className="space-y-1 pl-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Power:</span>
                  <span>
                    {summary.analytics.launched.minPower}–{summary.analytics.launched.maxPower}{" "}
                    (avg {summary.analytics.launched.avgPower.toFixed(1)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Accuracy:</span>
                  <span>
                    {summary.analytics.launched.minAccuracy}–{summary.analytics.launched.maxAccuracy}{" "}
                    (avg {summary.analytics.launched.avgAccuracy.toFixed(1)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Build Time:</span>
                  <span>
                    {summary.analytics.launched.minBuildTime}–{summary.analytics.launched.maxBuildTime}{" "}
                    (avg {summary.analytics.launched.avgBuildTime.toFixed(1)})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Launched:</span>
                  <span>{summary.analytics.launched.count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Hit Rate:</span>
                  <span className="text-yellow-400 font-semibold">
                    {(summary.analytics.launched.hitRate * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Comet Damage */}
            <div className="border-t border-gray-700 pt-3">
              <h3 className="text-lg font-semibold text-purple-400 mb-2">Comet Damage</h3>
              <div className="space-y-1 pl-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Damage Dealt:</span>
                  <span>{summary.analytics.comet.totalDamage}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Segments Destroyed:</span>
                  <span>{summary.analytics.comet.segmentsDestroyed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Initial Total Strength:</span>
                  <span>{summary.analytics.comet.totalStrengthStart}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Remaining Strength:</span>
                  <span>{summary.analytics.comet.totalStrengthEnd}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Log - Comet Rush */}
      {!isCafe && log.length > 0 && (
        <section className="w-full max-w-6xl">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-100">
              Action Log ({filteredActionLog.length})
            </h2>
            <button
              type="button"
              onClick={handleCopyActionLog}
              disabled={filteredActionLog.length === 0}
              className="rounded-lg border border-slate-600 px-2 py-1 text-[11px] font-semibold text-slate-100 hover:border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Copy Log
            </button>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="min-w-full text-left text-xs text-slate-200">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="border-b border-slate-700 text-[11px] uppercase tracking-wide text-slate-400">
                    <th
                      className="cursor-pointer px-2 py-1 hover:text-slate-200"
                      onClick={() => handleLogSort("id")}
                    >
                      # {logSortKey === "id" && (logSortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="cursor-pointer px-2 py-1 hover:text-slate-200"
                      onClick={() => handleLogSort("round")}
                    >
                      R {logSortKey === "round" && (logSortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="cursor-pointer px-2 py-1 hover:text-slate-200"
                      onClick={() => handleLogSort("playerLabel")}
                    >
                      Player{" "}
                      {logSortKey === "playerLabel" && (logSortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="px-2 py-1">Type</th>
                    <th
                      className="cursor-pointer px-2 py-1 hover:text-slate-200"
                      onClick={() => handleLogSort("actionType")}
                    >
                      Action{" "}
                      {logSortKey === "actionType" && (logSortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="cursor-pointer px-2 py-1 hover:text-slate-200"
                      onClick={() => handleLogSort("resources")}
                    >
                      Res{" "}
                      {logSortKey === "resources" && (logSortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="px-2 py-1">Hand</th>
                    <th className="px-2 py-1">Rockets</th>
                    <th
                      className="cursor-pointer px-2 py-1 hover:text-slate-200"
                      onClick={() => handleLogSort("movementCardsLeft")}
                    >
                      MvCards{" "}
                      {logSortKey === "movementCardsLeft" && (logSortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="cursor-pointer px-2 py-1 hover:text-slate-200"
                      onClick={() => handleLogSort("strengthCardsLeft")}
                    >
                      StrCards{" "}
                      {logSortKey === "strengthCardsLeft" && (logSortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="cursor-pointer px-2 py-1 hover:text-slate-200"
                      onClick={() => handleLogSort("totalMovementValueLeft")}
                    >
                      Dist{" "}
                      {logSortKey === "totalMovementValueLeft" &&
                        (logSortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th
                      className="cursor-pointer px-2 py-1 hover:text-slate-200"
                      onClick={() => handleLogSort("totalStrengthValueLeft")}
                    >
                      StrTotal{" "}
                      {logSortKey === "totalStrengthValueLeft" &&
                        (logSortDir === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="px-2 py-1">Details</th>
                    <th className="px-2 py-1 text-purple-400">Reasoning</th>
                  </tr>

                  {/* Filter row */}
                  <tr className="border-b border-slate-800 text-[11px] bg-slate-900">
                    <th className="px-2 py-1"></th>
                    <th className="px-2 py-1">
                      <select
                        className="w-full rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                        value={filterLogRound}
                        onChange={(e) => setFilterLogRound(e.target.value)}
                      >
                        <option value="Any">Any</option>
                        {uniqueLogRounds.map((r) => (
                          <option key={r} value={String(r)}>
                            R{r}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th className="px-2 py-1">
                      <select
                        className="w-full rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                        value={filterLogPlayer}
                        onChange={(e) => setFilterLogPlayer(e.target.value)}
                      >
                        <option value="Any">Any</option>
                        {uniqueLogPlayers.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th className="px-2 py-1"></th>
                    <th className="px-2 py-1">
                      <select
                        className="w-full rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                        value={filterLogAction}
                        onChange={(e) => setFilterLogAction(e.target.value)}
                      >
                        <option value="Any">Any</option>
                        {uniqueLogActions.map((a) => (
                          <option key={a} value={a}>
                            {a}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th className="px-2 py-1"></th>
                    <th className="px-2 py-1"></th>
                    <th className="px-2 py-1"></th>
                    <th className="px-2 py-1">
                      <select
                        className="w-full rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                        value={filterMvCards}
                        onChange={(e) => setFilterMvCards(e.target.value)}
                      >
                        <option value="Any">Any</option>
                        {uniqueMvCards.map((c) => (
                          <option key={c} value={String(c)}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th className="px-2 py-1">
                      <select
                        className="w-full rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                        value={filterStrCards}
                        onChange={(e) => setFilterStrCards(e.target.value)}
                      >
                        <option value="Any">Any</option>
                        {uniqueStrCards.map((c) => (
                          <option key={c} value={String(c)}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th className="px-2 py-1">
                      <select
                        className="w-full rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                        value={filterMvTotal}
                        onChange={(e) => setFilterMvTotal(e.target.value)}
                      >
                        <option value="Any">Any</option>
                        {uniqueMvTotals.map((t) => (
                          <option key={t} value={String(t)}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th className="px-2 py-1">
                      <select
                        className="w-full rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                        value={filterStrTotal}
                        onChange={(e) => setFilterStrTotal(e.target.value)}
                      >
                        <option value="Any">Any</option>
                        {uniqueStrTotals.map((t) => (
                          <option key={t} value={String(t)}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </th>
                    <th className="px-2 py-1">
                      <input
                        className="w-full rounded bg-slate-800 px-1 py-0.5 text-[11px] text-slate-200"
                        value={filterLogSummary}
                        onChange={(e) => setFilterLogSummary(e.target.value)}
                        placeholder="search"
                      />
                    </th>
                    <th className="px-2 py-1"></th>
                  </tr>
                </thead>

                <tbody>
                  {filteredActionLog.length === 0 ? (
                    <tr>
                      <td
                        colSpan={13}
                        className="px-2 py-3 text-center text-[11px] text-slate-500"
                      >
                        No actions to display.
                      </td>
                    </tr>
                  ) : (
                    filteredActionLog.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-800 align-top hover:bg-slate-800/30"
                      >
                        <td className="px-2 py-1 text-[11px] text-slate-400">{row.id}</td>
                        <td className="px-2 py-1 text-[11px] text-slate-200">
                          R{row.round}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-sky-400">
                          {row.playerLabel}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-purple-400">
                          {row.personality}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-amber-300 font-mono">
                          {row.actionType}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-yellow-400 font-mono">
                          {row.resources}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-slate-300 font-mono whitespace-nowrap">
                          {row.hand}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-slate-300 font-mono whitespace-nowrap">
                          <span className="text-green-400">{row.readyRockets}</span>
                          {row.buildQueue !== "[]" && (
                            <span className="text-yellow-500 ml-1">{row.buildQueue}</span>
                          )}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-slate-200">
                          {row.movementCardsLeft}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-slate-200">
                          {row.strengthCardsLeft}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-slate-200">
                          {row.totalMovementValueLeft}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-slate-200">
                          {row.totalStrengthValueLeft}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-slate-200">
                          {row.summary}
                        </td>
                        <td className="px-2 py-1 text-[11px] text-purple-300 max-w-xs">
                          {row.reasoning ? (
                            <span
                              className="block truncate cursor-help"
                              title={row.reasoning}
                            >
                              {row.reasoning}
                            </span>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Action Log - Cafe */}
      {isCafe && cafeLog.length > 0 && (
        <section className="w-full max-w-6xl">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-sm font-semibold text-slate-100">
              Action Log ({cafeLog.length})
            </h2>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="min-w-full text-left text-xs text-slate-200">
                <thead className="sticky top-0 bg-slate-900">
                  <tr className="border-b border-slate-700 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-2 py-1">#</th>
                    <th className="px-2 py-1">Round</th>
                    <th className="px-2 py-1">Phase</th>
                    <th className="px-2 py-1">Player</th>
                    <th className="px-2 py-1">Type</th>
                    <th className="px-2 py-1">Action</th>
                    <th className="px-2 py-1">Money</th>
                    <th className="px-2 py-1">Supplies</th>
                    <th className="px-2 py-1">Customers</th>
                    <th className="px-2 py-1">Rep</th>
                    <th className="px-2 py-1">Details</th>
                    <th className="px-2 py-1">Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {cafeLog.map((row) => (
                    <tr key={row.id} className="border-b border-slate-800 hover:bg-slate-800/30">
                      <td className="px-2 py-1 text-[11px]">{row.id}</td>
                      <td className="px-2 py-1 text-[11px]">{row.round}</td>
                      <td className="px-2 py-1 text-[11px] text-blue-300">{row.phase}</td>
                      <td className="px-2 py-1 text-[11px]">
                        <span className="text-cyan-300">{row.playerLabel}</span>
                        <span className="text-slate-500 ml-1">({row.personality})</span>
                      </td>
                      <td className="px-2 py-1 text-[11px] text-purple-300">{row.personality}</td>
                      <td className="px-2 py-1 text-[11px] font-medium text-yellow-300">
                        {row.actionType}
                      </td>
                      <td className="px-2 py-1 text-[11px] text-green-300">${row.money}</td>
                      <td className="px-2 py-1 text-[11px] text-orange-300">{row.supplies}</td>
                      <td className="px-2 py-1 text-[11px]">{row.customerCount}</td>
                      <td className={`px-2 py-1 text-[11px] ${row.reputation >= 0 ? "text-green-300" : "text-red-300"}`}>
                        {row.reputation > 0 ? "+" : ""}{row.reputation}
                      </td>
                      <td className="px-2 py-1 text-[11px] max-w-xs truncate" title={row.details}>
                        {row.details}
                      </td>
                      <td className="px-2 py-1 text-[11px] text-slate-400 max-w-xs truncate" title={row.decision}>
                        {row.decision}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
