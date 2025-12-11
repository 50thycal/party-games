"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState, useCallback, useMemo } from "react";
import {
  cometRushGame,
  CometRushState,
  CometRushAction,
  CometRushPlayerState,
  ResearchCard,
  ResearchType,
  calculateScores,
} from "@/games/comet-rush/config";
import type { Player, GameContext, Room } from "@/engine/types";

// ============================================================================
// TYPES
// ============================================================================

interface SimLogEntry {
  id: number;
  round: number;
  playerId: string;
  playerLabel: string;
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

type ResearchSetOption = {
  setKey: string;
  type: ResearchCard["type"];
  cards: ResearchCard[];
};

function getPlayableResearchSets(
  player: CometRushPlayerState,
): ResearchSetOption[] {
  const bySetKey = new Map<
    string,
    { card: ResearchCard; type: ResearchCard["type"]; setSizeRequired: number }[]
  >();

  for (const card of player.hand) {
    const key = card.setKey;
    if (!key) continue;
    const bucket = bySetKey.get(key) ?? [];
    bucket.push({
      card,
      type: card.type,
      setSizeRequired: card.setSizeRequired ?? 1,
    });
    bySetKey.set(key, bucket);
  }

  const result: ResearchSetOption[] = [];

  for (const [setKey, bucket] of Array.from(bySetKey.entries())) {
    const setSizeRequired = bucket[0].setSizeRequired || 1;
    if (bucket.length >= setSizeRequired) {
      result.push({
        setKey,
        type: bucket[0].type,
        cards: bucket.slice(0, setSizeRequired).map((b) => b.card),
      });
    }
  }

  return result;
}

const RESEARCH_PRIORITY: string[] = [
  "INCOME",
  "MAX_ROCKETS",
  "BUILD_TIME",
  "POWER",
  "ACCURACY",
  "PEEK_STRENGTH",
  "PEEK_MOVE",
  "STEAL_RESOURCES",
  "DELAY_BUILD",
  "STEAL_CARD",
];

function chooseResearchSetToPlay(
  player: CometRushPlayerState,
): ResearchSetOption | null {
  const options = getPlayableResearchSets(player);
  if (options.length === 0) return null;

  // Sort by our priority list
  options.sort((a, b) => {
    const pa = RESEARCH_PRIORITY.indexOf(a.setKey);
    const pb = RESEARCH_PRIORITY.indexOf(b.setKey);
    return (pa === -1 ? 999 : pa) - (pb === -1 ? 999 : pb);
  });

  // 70% of the time we play the "best" one, otherwise random
  const best = options[0];
  if (Math.random() < 0.7 || options.length === 1) return best;

  return options[1 + Math.floor(Math.random() * (options.length - 1))];
}

type RocketConfig = {
  buildTimeBase: number;
  power: number;
  accuracy: number;
};

function chooseRocketToBuild(
  player: CometRushPlayerState,
): RocketConfig | null {
  const { powerCap, accuracyCap, buildTimeCap } = player.upgrades;

  // Check if we have capacity for more rockets
  const maxSlots =
    player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
  const buildingOrReady = player.rockets.filter(
    (r) => r.status === "building" || r.status === "ready",
  ).length;
  if (buildingOrReady >= maxSlots) return null;

  // If low on cubes, skip building
  if (player.resourceCubes < 4) return null;

  const buildTimeBase = Math.max(
    1,
    Math.min(buildTimeCap, 3), // try to keep around 3 turns
  );

  const targetPower = Math.min(powerCap, 5); // aim for ~5 power
  const targetAccuracy = Math.min(accuracyCap, 3); // baseline 50% hit rate (3/6)

  return {
    buildTimeBase,
    power: targetPower,
    accuracy: targetAccuracy,
  };
}

function chooseRocketToLaunch(
  player: CometRushPlayerState,
): string | null {
  const ready = player.rockets.filter((r) => r.status === "ready");
  if (ready.length === 0) return null;

  // Launch the highest power ready rocket
  ready.sort((a, b) => b.power - a.power);
  const choice = ready[0];

  return choice.id;
}

// ============================================================================
// STATE FORMATTING HELPERS
// ============================================================================

function formatHand(player: CometRushPlayerState): string {
  if (player.hand.length === 0) return "-";

  // Count cards by setKey
  const counts = new Map<string, number>();
  for (const card of player.hand) {
    const key = card.setKey || "UNKNOWN";
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  // Format as "POWx2, ACCx1, ..."
  const entries = Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return entries.map(([key, count]) => `${key}x${count}`).join(", ");
}

function formatBuildQueue(player: CometRushPlayerState): string {
  const building = player.rockets.filter((r) => r.status === "building");
  if (building.length === 0) return "[]";

  return "[" + building.map((r) => `P${r.power}/A${r.accuracy}/T${r.buildTimeRemaining}`).join(", ") + "]";
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

function hasBuildingRocket(player: CometRushPlayerState): boolean {
  return player.rockets.some((r) => r.status === "building");
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

function hasPowerOrAccuracyResearch(player: CometRushPlayerState): boolean {
  const sets = getPlayableResearchSets(player);
  return sets.some((s) => s.setKey === "POWER" || s.setKey === "ACCURACY");
}

function choosePriorityResearchSet(
  player: CometRushPlayerState,
  priorityTypes: string[]
): ResearchSetOption | null {
  const options = getPlayableResearchSets(player);
  if (options.length === 0) return null;

  // First, try to find a priority type
  for (const priority of priorityTypes) {
    const match = options.find((s) => s.setKey === priority);
    if (match) return match;
  }

  // Otherwise return first available
  return options[0];
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

  const dispatch = (action: CometRushAction): boolean => {
    const ctx = createGameContext(room, playerId, currentSeed);
    currentSeed += 1;

    const allowed = cometRushGame.isActionAllowed?.(currentState, action, ctx) ?? true;
    if (allowed) {
      currentState = cometRushGame.reducer(currentState, action, ctx);
      return true;
    }
    return false;
  };

  const addLog = (action: string, details: string, decisionContext?: string) => {
    const playerLabel = playerId.replace("player-", "P");
    const player = currentState.players[playerId];

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
    const playableSets = player ? getPlayableResearchSets(player).length : 0;
    const canBuildRocket = player ? (() => {
      const maxSlots = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
      const buildingOrReady = player.rockets.filter(
        (r) => r.status === "building" || r.status === "ready"
      ).length;
      return player.resourceCubes >= 4 && buildingOrReady < maxSlots && !hasBuildingRocket(player);
    })() : false;
    const rocketSlotFull = player ? (() => {
      const maxSlots = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
      const buildingOrReady = player.rockets.filter(
        (r) => r.status === "building" || r.status === "ready"
      ).length;
      return buildingOrReady >= maxSlots;
    })() : false;
    const hasReadyRocket = player ? player.rockets.some((r) => r.status === "ready") : false;

    log.push({
      id: 0, // Will be assigned after simulation completes
      round: currentState.round,
      playerId,
      playerLabel,
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

  // 1. BEGIN_TURN (always)
  if (dispatch({ type: "BEGIN_TURN", playerId })) {
    const player = currentState.players[playerId];
    addLog("BEGIN_TURN", `Income: +${currentState.turnMeta?.incomeGained ?? 0} cubes (total: ${player?.resourceCubes ?? 0})`, "BEGIN_TURN: mandatory");
  }

  // 2. DRAW_TURN_CARD (always)
  if (dispatch({ type: "DRAW_TURN_CARD", playerId })) {
    const cardId = currentState.turnMeta?.lastDrawnCardId;
    addLog("DRAW_TURN_CARD", cardId ? `Drew card ${cardId}` : "No cards to draw", "DRAW: mandatory");
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

  let actionTaken = false;

  // PRIORITY 1: Launch if can destroy active segment (loop for multiple launches)
  while (!actionTaken && canDestroyActiveSegment(player, currentState)) {
    const rocketId = chooseRocketToLaunch(player);
    if (!rocketId) break;

    const rocket = player.rockets.find((r) => r.id === rocketId);
    const rocketStats = rocket ? {
      power: rocket.power,
      accuracy: rocket.accuracy,
      buildTimeBase: rocket.buildTimeBase,
    } : null;

    if (dispatch({ type: "LAUNCH_ROCKET", playerId, payload: { rocketId } })) {
      rocketsLaunched++;
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
        addLog("LAUNCH_ROCKET", `[P1: Kill shot] Roll ${result.diceRoll} vs ${result.accuracyNeeded}: ${hitMiss}${destroyed}`, `LAUNCH: P1 segmentHP <= rocket.power`);
      }
      actionTaken = true;
      player = currentState.players[playerId];
    } else {
      break;
    }
  }

  // PRIORITY 2: Launch if comet distance <= 8 (loop for multiple launches)
  while (!actionTaken && currentState.distanceToImpact <= 8 && hasReadyRocket(player)) {
    const rocketId = chooseRocketToLaunch(player);
    if (!rocketId) break;

    const rocket = player.rockets.find((r) => r.id === rocketId);
    const rocketStats = rocket ? {
      power: rocket.power,
      accuracy: rocket.accuracy,
      buildTimeBase: rocket.buildTimeBase,
    } : null;

    if (dispatch({ type: "LAUNCH_ROCKET", playerId, payload: { rocketId } })) {
      rocketsLaunched++;
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
        addLog("LAUNCH_ROCKET", `[P2: Close approach] Roll ${result.diceRoll} vs ${result.accuracyNeeded}: ${hitMiss}${destroyed}`, `LAUNCH: P2 cometDist <= 8`);
      }
      actionTaken = true;
      player = currentState.players[playerId];
    } else {
      break;
    }
  }

  // PRIORITY 3: Launch if have ready rocket AND building rocket (loop for multiple launches)
  while (!actionTaken && hasReadyRocket(player) && hasBuildingRocket(player)) {
    const rocketId = chooseRocketToLaunch(player);
    if (!rocketId) break;

    const rocket = player.rockets.find((r) => r.id === rocketId);
    const rocketStats = rocket ? {
      power: rocket.power,
      accuracy: rocket.accuracy,
      buildTimeBase: rocket.buildTimeBase,
    } : null;

    if (dispatch({ type: "LAUNCH_ROCKET", playerId, payload: { rocketId } })) {
      rocketsLaunched++;
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
        addLog("LAUNCH_ROCKET", `[P3: Clear pipeline] Roll ${result.diceRoll} vs ${result.accuracyNeeded}: ${hitMiss}${destroyed}`, `LAUNCH: P3 ready + building`);
      }
      actionTaken = true;
      player = currentState.players[playerId];
    } else {
      break;
    }
  }

  // PRIORITY 4: Build if no building rocket and enough resources
  if (!actionTaken && !player.hasBuiltRocketThisTurn && !hasBuildingRocket(player)) {
    const config = chooseRocketToBuild(player);
    if (config) {
      if (dispatch({ type: "BUILD_ROCKET", playerId, payload: config })) {
        rocketsBuilt++;
        builtRockets.push({
          power: config.power,
          accuracy: config.accuracy,
          buildTimeBase: config.buildTimeBase,
        });
        addLog("BUILD_ROCKET", `[P4: Pipeline] P=${config.power}, A=${config.accuracy}, T=${config.buildTimeBase}`, `BUILD: P4 no building + canBuild`);
        actionTaken = true;
        player = currentState.players[playerId];
      }
    }
  }

  // PRIORITY 5: Play POWER or ACCURACY research
  if (!actionTaken && !player.hasPlayedResearchThisTurn && hasPowerOrAccuracyResearch(player)) {
    const choice = choosePriorityResearchSet(player, ["POWER", "ACCURACY"]);
    if (choice) {
      if (dispatch({ type: "PLAY_RESEARCH_SET", playerId, payload: { cardIds: choice.cards.map((c) => c.id) } })) {
        addLog("PLAY_RESEARCH_SET", `[P5: Combat upgrade] ${choice.setKey} (${choice.cards.length} cards)`, `PLAY_RESEARCH: P5 ${choice.setKey} available`);
        actionTaken = true;
        player = currentState.players[playerId];
      }
    }
  }

  // PRIORITY 6: Play any other research
  if (!actionTaken && !player.hasPlayedResearchThisTurn) {
    const choice = chooseResearchSetToPlay(player);
    if (choice) {
      if (dispatch({ type: "PLAY_RESEARCH_SET", playerId, payload: { cardIds: choice.cards.map((c) => c.id) } })) {
        addLog("PLAY_RESEARCH_SET", `[P6: Other upgrade] ${choice.setKey} (${choice.cards.length} cards)`, `PLAY_RESEARCH: P6 ${choice.setKey} available`);
        actionTaken = true;
        player = currentState.players[playerId];
      }
    }
  }

  // 7. END_TURN
  const endDecision = actionTaken
    ? "END_TURN: action taken"
    : `END_TURN: no action (ready:${hasReadyRocket(player)}, canBuild:${!hasBuildingRocket(player)}, sets:${getPlayableResearchSets(player).length})`;
  if (dispatch({ type: "END_TURN", playerId })) {
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

function runCometRushSimulation(
  playerCount: number,
  maxRounds: number = 100
): { summary: SimSummary; log: SimLogEntry[] } {
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

  // Run simulation loop
  let safetyCounter = 0;
  const maxIterations = maxRounds * playerCount;

  while (state.phase === "playing" && safetyCounter < maxIterations) {
    safetyCounter++;
    const activePlayerId = state.playerOrder[state.activePlayerIndex];

    const result = simulateBotTurn(state, activePlayerId, room, seed, log, builtRockets, launchedRockets);
    state = result.state;
    seed = result.seed;
    totalRocketsBuilt += result.rocketsBuilt;
    totalRocketsLaunched += result.rocketsLaunched;
  }

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

  return { summary, log: logWithIds };
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function TestGamePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const gameId = params.gameId as string;
  const playerCount = Number(searchParams.get("players")) || 2;

  const [summary, setSummary] = useState<SimSummary | null>(null);
  const [log, setLog] = useState<SimLogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // All simulation runs
  const [simRows, setSimRows] = useState<SimRow[]>([]);
  const [nextId, setNextId] = useState(1);

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

  const runSimulation = useCallback(() => {
    setIsRunning(true);
    setSummary(null);
    setLog([]);

    // Run on next tick to allow UI update
    setTimeout(() => {
      const result = runCometRushSimulation(playerCount);
      setSummary(result.summary);
      setLog(result.log);
      setIsRunning(false);

      // Add to simulation rows
      const endReason = result.summary.cometDestroyed
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
    }, 50);
  }, [playerCount, nextId]);

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

      <div className="flex gap-4 mb-8">
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

      {/* Simulation Runs Table */}
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

      {/* Last Run Summary */}
      {summary && (
        <div className="w-full max-w-2xl mb-8">
          <h2 className="text-xl font-semibold mb-4">Last Run Summary</h2>
          <div className="bg-gray-800 rounded-lg p-4 space-y-2">
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

      {/* Analytics */}
      {summary?.analytics && (
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

      {/* Action Log */}
      {log.length > 0 && (
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
                    <th
                      className="cursor-pointer px-2 py-1 hover:text-slate-200"
                      onClick={() => handleLogSort("actionType")}
                    >
                      Action{" "}
                      {logSortKey === "actionType" && (logSortDir === "asc" ? "↑" : "↓")}
                    </th>
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
                  </tr>
                </thead>

                <tbody>
                  {filteredActionLog.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
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
                        <td className="px-2 py-1 text-[11px] text-amber-300 font-mono">
                          {row.actionType}
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
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
