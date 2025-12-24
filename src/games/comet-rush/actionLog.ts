/**
 * Multiplayer Action Log System for Comet Rush
 *
 * Tracks all player actions during a game for analysis and review.
 * Excludes bot-specific fields (personality, LLM reasoning, decision context)
 * since this is for real human players.
 */

import type {
  CometRushState,
  CometRushPlayerState,
  LaunchResult,
  GameCard,
  EngineeringCard,
  PoliticalCard,
} from "./config";

// ============================================================================
// TYPES
// ============================================================================

export interface MultiplayerLogEntry {
  id: number;
  timestamp: number;
  round: number;
  playerId: string;
  playerName: string;
  action: string;
  actionType: string;
  details: string;

  // Game state at time of action
  distanceToImpact: number;
  movementCardsLeft: number;
  strengthCardsLeft: number;
  activeSegmentStrength: number | null;

  // Player state at time of action
  resourceCubes: number;
  handSize: number;
  readyRockets: number;
  buildingRockets: number;
  trophyCount: number;
  trophyPoints: number;
}

export interface PlayerGameStats {
  playerId: string;
  playerName: string;

  // Rockets
  rocketsBuilt: number;
  rocketsLaunched: number;

  // Launch accuracy
  hits: number;
  misses: number;
  hitRate: number;

  // Damage
  totalDamage: number;
  segmentsDestroyed: number;

  // Resources
  totalIncomeEarned: number;
  totalResourcesSpent: number;

  // Cards
  cardsDrawn: number;
  cardsPlayed: number;

  // Final state
  finalScore: number;
  isWinner: boolean;
}

export interface GameAnalytics {
  // Game summary
  totalRounds: number;
  totalActions: number;
  gameOutcome: "cometDestroyed" | "earthDestroyed";
  gameDurationMs: number;
  playerCount: number;

  // Aggregate stats
  totalRocketsBuilt: number;
  totalRocketsLaunched: number;
  totalHits: number;
  totalMisses: number;
  overallHitRate: number;
  totalDamageDealt: number;

  // Per-player stats
  playerStats: PlayerGameStats[];
}

// ============================================================================
// LOG ENTRY CREATION
// ============================================================================

let logIdCounter = 0;

export function resetLogIdCounter(): void {
  logIdCounter = 0;
}

export function createLogEntry(
  state: CometRushState,
  playerId: string,
  action: string,
  actionType: string,
  details: string
): MultiplayerLogEntry {
  const player = state.players[playerId];

  return {
    id: ++logIdCounter,
    timestamp: Date.now(),
    round: state.round,
    playerId,
    playerName: player?.name ?? "Unknown",
    action,
    actionType,
    details,

    // Game state
    distanceToImpact: state.distanceToImpact,
    movementCardsLeft: state.movementDeck.length,
    strengthCardsLeft: state.strengthDeck.length,
    activeSegmentStrength: state.activeStrengthCard?.currentStrength ?? null,

    // Player state
    resourceCubes: player?.resourceCubes ?? 0,
    handSize: player?.hand.length ?? 0,
    readyRockets: player?.rockets.filter(r => r.status === "ready").length ?? 0,
    buildingRockets: player?.rockets.filter(r => r.status === "building").length ?? 0,
    trophyCount: player?.trophies.length ?? 0,
    trophyPoints: player?.trophies.reduce((sum, t) => sum + t.baseStrength, 0) ?? 0,
  };
}

// ============================================================================
// ACTION-SPECIFIC LOG ENTRY HELPERS
// ============================================================================

export function logBeginTurn(
  state: CometRushState,
  playerId: string,
  incomeGained: number,
  wasEmbargoed: boolean
): MultiplayerLogEntry {
  const details = wasEmbargoed
    ? "Turn started (income blocked by embargo)"
    : `Turn started, gained ${incomeGained} resources`;

  return createLogEntry(state, playerId, "BEGIN_TURN", "Turn", details);
}

export function logDrawCard(
  state: CometRushState,
  playerId: string,
  deck: "engineering" | "political",
  cardName: string | null
): MultiplayerLogEntry {
  const details = cardName
    ? `Drew "${cardName}" from ${deck} deck`
    : `Drew from ${deck} deck`;

  return createLogEntry(state, playerId, "DRAW_CARD", "Card", details);
}

export function logPlayCard(
  state: CometRushState,
  playerId: string,
  cardName: string,
  targetPlayerName?: string,
  effectDescription?: string
): MultiplayerLogEntry {
  let details = `Played "${cardName}"`;
  if (targetPlayerName) {
    details += ` targeting ${targetPlayerName}`;
  }
  if (effectDescription) {
    details += ` - ${effectDescription}`;
  }

  return createLogEntry(state, playerId, "PLAY_CARD", "Card", details);
}

export function logBuildRocket(
  state: CometRushState,
  playerId: string,
  power: number,
  accuracy: number,
  buildTime: number,
  cost: number
): MultiplayerLogEntry {
  const buildDelay = 3 - buildTime;
  const readyText = buildDelay === 0 ? "instant" : `${buildDelay} turn${buildDelay > 1 ? "s" : ""}`;
  const details = `Built rocket: Power ${power}, Accuracy ${accuracy}, ${readyText} (cost: ${cost} cubes)`;

  return createLogEntry(state, playerId, "BUILD_ROCKET", "Build", details);
}

export function logLaunchRocket(
  state: CometRushState,
  playerId: string,
  result: LaunchResult
): MultiplayerLogEntry {
  let details: string;

  if (result.hit) {
    if (result.destroyed) {
      details = `Launched rocket: Rolled ${result.diceRoll} (needed ≤${result.accuracyNeeded}) - HIT! Destroyed segment for ${result.baseStrength} points!`;
    } else {
      details = `Launched rocket: Rolled ${result.diceRoll} (needed ≤${result.accuracyNeeded}) - HIT! Dealt ${result.power} damage`;
    }
  } else {
    details = `Launched rocket: Rolled ${result.diceRoll} (needed ≤${result.accuracyNeeded}) - MISS`;
  }

  if (result.isReroll) {
    details += " (reroll)";
  }

  return createLogEntry(state, playerId, "LAUNCH_ROCKET", "Launch", details);
}

export function logUseReroll(
  state: CometRushState,
  playerId: string
): MultiplayerLogEntry {
  return createLogEntry(state, playerId, "USE_REROLL", "Launch", "Used reroll token");
}

export function logDeclineReroll(
  state: CometRushState,
  playerId: string
): MultiplayerLogEntry {
  return createLogEntry(state, playerId, "DECLINE_REROLL", "Launch", "Declined to use reroll token");
}

export function logEndTurn(
  state: CometRushState,
  playerId: string
): MultiplayerLogEntry {
  return createLogEntry(state, playerId, "END_TURN", "Turn", "Ended turn");
}

export function logRoundEnd(
  state: CometRushState,
  playerId: string,
  movementValue: number,
  newDistance: number
): MultiplayerLogEntry {
  return createLogEntry(
    state,
    playerId,
    "ROUND_END",
    "Round",
    `Round ${state.round} ended. Comet moved ${movementValue} spaces. Distance: ${newDistance}`
  );
}

export function logGameOver(
  state: CometRushState,
  outcome: "cometDestroyed" | "earthDestroyed"
): MultiplayerLogEntry {
  const details = outcome === "cometDestroyed"
    ? "Game Over: Comet destroyed! Humanity is saved!"
    : "Game Over: Earth destroyed by comet impact.";

  // Use first player as the "actor" for this log entry
  const playerId = state.playerOrder[0] ?? "";

  return createLogEntry(state, playerId, "GAME_OVER", "Game", details);
}

// ============================================================================
// ANALYTICS CALCULATION
// ============================================================================

export function calculatePlayerStats(
  actionLog: MultiplayerLogEntry[],
  state: CometRushState,
  scores: Record<string, number>,
  winnerIds: string[]
): PlayerGameStats[] {
  const stats: Record<string, PlayerGameStats> = {};

  // Initialize stats for all players
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId];
    stats[playerId] = {
      playerId,
      playerName: player?.name ?? "Unknown",
      rocketsBuilt: 0,
      rocketsLaunched: 0,
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalDamage: 0,
      segmentsDestroyed: 0,
      totalIncomeEarned: 0,
      totalResourcesSpent: 0,
      cardsDrawn: 0,
      cardsPlayed: 0,
      finalScore: scores[playerId] ?? 0,
      isWinner: winnerIds.includes(playerId),
    };
  }

  // Process action log
  for (const entry of actionLog) {
    const playerStats = stats[entry.playerId];
    if (!playerStats) continue;

    switch (entry.action) {
      case "BEGIN_TURN": {
        // Extract income from details
        const incomeMatch = entry.details.match(/gained (\d+) resources/);
        if (incomeMatch) {
          playerStats.totalIncomeEarned += parseInt(incomeMatch[1], 10);
        }
        break;
      }
      case "DRAW_CARD":
        playerStats.cardsDrawn++;
        break;
      case "PLAY_CARD":
        playerStats.cardsPlayed++;
        break;
      case "BUILD_ROCKET": {
        playerStats.rocketsBuilt++;
        // Extract cost from details
        const costMatch = entry.details.match(/cost: (\d+) cubes/);
        if (costMatch) {
          playerStats.totalResourcesSpent += parseInt(costMatch[1], 10);
        }
        break;
      }
      case "LAUNCH_ROCKET": {
        playerStats.rocketsLaunched++;
        if (entry.details.includes("HIT")) {
          playerStats.hits++;
          // Extract damage
          const damageMatch = entry.details.match(/Dealt (\d+) damage/);
          if (damageMatch) {
            playerStats.totalDamage += parseInt(damageMatch[1], 10);
          }
          // Check for segment destruction
          if (entry.details.includes("Destroyed segment")) {
            playerStats.segmentsDestroyed++;
            // For destroyed segments, damage equals the segment strength
            const pointsMatch = entry.details.match(/for (\d+) points/);
            if (pointsMatch) {
              playerStats.totalDamage += parseInt(pointsMatch[1], 10);
            }
          }
        } else if (entry.details.includes("MISS")) {
          playerStats.misses++;
        }
        break;
      }
    }
  }

  // Calculate hit rates
  for (const playerId of Object.keys(stats)) {
    const s = stats[playerId];
    s.hitRate = s.rocketsLaunched > 0 ? (s.hits / s.rocketsLaunched) * 100 : 0;
  }

  return Object.values(stats);
}

export function calculateGameAnalytics(
  actionLog: MultiplayerLogEntry[],
  state: CometRushState,
  scores: Record<string, number>,
  winnerIds: string[],
  gameStartTime: number
): GameAnalytics {
  const playerStats = calculatePlayerStats(actionLog, state, scores, winnerIds);

  // Aggregate stats
  const totalRocketsBuilt = playerStats.reduce((sum, p) => sum + p.rocketsBuilt, 0);
  const totalRocketsLaunched = playerStats.reduce((sum, p) => sum + p.rocketsLaunched, 0);
  const totalHits = playerStats.reduce((sum, p) => sum + p.hits, 0);
  const totalMisses = playerStats.reduce((sum, p) => sum + p.misses, 0);
  const totalDamageDealt = playerStats.reduce((sum, p) => sum + p.totalDamage, 0);

  return {
    totalRounds: state.round,
    totalActions: actionLog.length,
    gameOutcome: state.cometDestroyed ? "cometDestroyed" : "earthDestroyed",
    gameDurationMs: Date.now() - gameStartTime,
    playerCount: state.playerOrder.length,

    totalRocketsBuilt,
    totalRocketsLaunched,
    totalHits,
    totalMisses,
    overallHitRate: totalRocketsLaunched > 0 ? (totalHits / totalRocketsLaunched) * 100 : 0,
    totalDamageDealt,

    playerStats,
  };
}

// ============================================================================
// CSV EXPORT
// ============================================================================

export function actionLogToCsv(actionLog: MultiplayerLogEntry[]): string {
  const headers = [
    "ID",
    "Timestamp",
    "Round",
    "Player ID",
    "Player Name",
    "Action",
    "Action Type",
    "Details",
    "Distance to Impact",
    "Movement Cards Left",
    "Strength Cards Left",
    "Active Segment Strength",
    "Resource Cubes",
    "Hand Size",
    "Ready Rockets",
    "Building Rockets",
    "Trophy Count",
    "Trophy Points",
  ];

  const rows = actionLog.map(entry => [
    entry.id,
    new Date(entry.timestamp).toISOString(),
    entry.round,
    entry.playerId,
    entry.playerName,
    entry.action,
    entry.actionType,
    `"${entry.details.replace(/"/g, '""')}"`, // Escape quotes in CSV
    entry.distanceToImpact,
    entry.movementCardsLeft,
    entry.strengthCardsLeft,
    entry.activeSegmentStrength ?? "",
    entry.resourceCubes,
    entry.handSize,
    entry.readyRockets,
    entry.buildingRockets,
    entry.trophyCount,
    entry.trophyPoints,
  ]);

  return [headers.join(","), ...rows.map(row => row.join(","))].join("\n");
}

export function generateCsvFilename(playerCount: number): string {
  const now = new Date();
  const dateStr = now.toISOString().split("T")[0]; // YYYY-MM-DD
  const timeStr = now.toTimeString().split(" ")[0].replace(/:/g, "-"); // HH-MM-SS
  return `comet-rush-${playerCount}p-${dateStr}-${timeStr}.csv`;
}

// ============================================================================
// TEXT LOG EXPORT
// ============================================================================

export function actionLogToText(actionLog: MultiplayerLogEntry[]): string {
  if (actionLog.length === 0) return "No actions recorded.";

  let currentRound = 0;
  const lines: string[] = [];

  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("                    COMET RUSH - ACTION LOG                     ");
  lines.push("═══════════════════════════════════════════════════════════════");
  lines.push("");

  for (const entry of actionLog) {
    // Add round separator
    if (entry.round !== currentRound) {
      currentRound = entry.round;
      lines.push("");
      lines.push(`─── Round ${currentRound} ───────────────────────────────────────`);
      lines.push("");
    }

    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    lines.push(`[${timestamp}] ${entry.playerName}: ${entry.details}`);
  }

  lines.push("");
  lines.push("═══════════════════════════════════════════════════════════════");

  return lines.join("\n");
}
