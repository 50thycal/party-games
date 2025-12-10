"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";
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
  round: number;
  playerId: string;
  action: string;
  details: string;
}

interface SimSummary {
  totalRounds: number;
  winner: string | null;
  earthDestroyed: boolean;
  cometDestroyed: boolean;
  playerScores: Record<string, number>;
  totalRocketsBuilt: number;
  totalRocketsLaunched: number;
}

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

  for (const [setKey, bucket] of bySetKey) {
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
  const targetAccuracy = Math.min(accuracyCap, 7); // "hit on 7 or less" style

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
// BOT LOGIC
// ============================================================================

function simulateBotTurn(
  state: CometRushState,
  playerId: string,
  room: Room,
  seed: number,
  log: SimLogEntry[]
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

  const addLog = (action: string, details: string) => {
    log.push({ round: currentState.round, playerId, action, details });
  };

  // 1. BEGIN_TURN
  if (dispatch({ type: "BEGIN_TURN", playerId })) {
    const player = currentState.players[playerId];
    addLog("BEGIN_TURN", `Income: +${currentState.turnMeta?.incomeGained ?? 0} cubes (total: ${player?.resourceCubes ?? 0})`);
  }

  // 2. DRAW_TURN_CARD
  if (dispatch({ type: "DRAW_TURN_CARD", playerId })) {
    const cardId = currentState.turnMeta?.lastDrawnCardId;
    addLog("DRAW_TURN_CARD", cardId ? `Drew card ${cardId}` : "No cards to draw");
  }

  // 3. MAYBE play one research set
  let player = currentState.players[playerId];
  if (player && !player.hasPlayedResearchThisTurn) {
    const choice = chooseResearchSetToPlay(player);
    if (choice) {
      if (
        dispatch({
          type: "PLAY_RESEARCH_SET",
          playerId,
          payload: { cardIds: choice.cards.map((c) => c.id) },
        })
      ) {
        addLog(
          "PLAY_RESEARCH_SET",
          `Played ${choice.setKey} (${choice.cards.length} cards)`
        );
      }
    }
  }

  // 4. MAYBE build one rocket (with intelligent stats)
  player = currentState.players[playerId];
  if (player && !player.hasBuiltRocketThisTurn) {
    const config = chooseRocketToBuild(player);
    if (config) {
      if (
        dispatch({
          type: "BUILD_ROCKET",
          playerId,
          payload: config,
        })
      ) {
        rocketsBuilt++;
        addLog(
          "BUILD_ROCKET",
          `P=${config.power}, A=${config.accuracy}, T=${config.buildTimeBase}`
        );
      }
    }
  }

  // 5. MAYBE launch one ready rocket
  player = currentState.players[playerId];
  if (player && !player.hasLaunchedRocketThisTurn) {
    const rocketId = chooseRocketToLaunch(player);
    if (rocketId) {
      if (
        dispatch({
          type: "LAUNCH_ROCKET",
          playerId,
          payload: { rocketId },
        })
      ) {
        rocketsLaunched++;
        const result = currentState.lastLaunchResult;
        if (result) {
          const hitMiss = result.hit ? "HIT" : "MISS";
          const destroyed = result.destroyed ? " - DESTROYED!" : "";
          addLog(
            "LAUNCH_ROCKET",
            `Roll ${result.diceRoll} vs ${result.accuracyNeeded}: ${hitMiss}${destroyed}`
          );
        }
      }
    }
  }

  // 6. END_TURN
  if (dispatch({ type: "END_TURN", playerId })) {
    addLog("END_TURN", `Distance to impact: ${currentState.distanceToImpact}`);
  }

  return { state: currentState, seed: currentSeed, rocketsBuilt, rocketsLaunched };
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

  log.push({ round: 1, playerId: "SYSTEM", action: "START_GAME", details: `Game started with ${playerCount} players` });

  // Run simulation loop
  let safetyCounter = 0;
  const maxIterations = maxRounds * playerCount;

  while (state.phase === "playing" && safetyCounter < maxIterations) {
    safetyCounter++;
    const activePlayerId = state.playerOrder[state.activePlayerIndex];

    const result = simulateBotTurn(state, activePlayerId, room, seed, log);
    state = result.state;
    seed = result.seed;
    totalRocketsBuilt += result.rocketsBuilt;
    totalRocketsLaunched += result.rocketsLaunched;
  }

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
  };

  return { summary, log };
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
    }, 50);
  }, [playerCount]);

  return (
    <main className="flex min-h-screen flex-col items-center p-8">
      <h1 className="text-3xl font-bold mb-2">
        Test: {gameId}
      </h1>
      <p className="text-gray-400 mb-6">
        {playerCount} players
      </p>

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

      {summary && (
        <div className="w-full max-w-2xl mb-8">
          <h2 className="text-xl font-semibold mb-4">Summary</h2>
          <div className="bg-gray-800 rounded-lg p-4 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Outcome:</span>
              <span className={summary.cometDestroyed ? "text-green-400" : "text-red-400"}>
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

      {log.length > 0 && (
        <div className="w-full max-w-2xl">
          <h2 className="text-xl font-semibold mb-4">Action Log</h2>
          <div className="bg-gray-800 rounded-lg p-4 max-h-96 overflow-y-auto font-mono text-sm">
            {log.map((entry, i) => (
              <div key={i} className="flex gap-2 py-1 border-b border-gray-700 last:border-0">
                <span className="text-gray-500 w-12 shrink-0">R{entry.round}</span>
                <span className="text-blue-400 w-20 shrink-0">{entry.playerId.replace("player-", "P")}</span>
                <span className="text-yellow-400 w-32 shrink-0">{entry.action}</span>
                <span className="text-gray-300">{entry.details}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
