"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState, useCallback } from "react";
import {
  cometRushGame,
  CometRushState,
  CometRushAction,
  CometRushPlayerState,
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

  // 3. Try to build a rocket if we have enough resources and capacity
  const player = currentState.players[playerId];
  if (player) {
    const activeRockets = player.rockets.filter(
      (r) => r.status === "building" || r.status === "ready"
    ).length;
    const maxRockets = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;

    if (activeRockets < maxRockets && player.resourceCubes >= 3) {
      // Simple bot: build a basic rocket (power 1, accuracy 2, build time 2)
      const power = Math.min(1, player.upgrades.powerCap);
      const accuracy = Math.min(2, player.upgrades.accuracyCap);
      const buildTime = Math.min(2, player.upgrades.buildTimeCap);

      if (
        dispatch({
          type: "BUILD_ROCKET",
          playerId,
          payload: { buildTimeBase: buildTime, power, accuracy },
        })
      ) {
        rocketsBuilt++;
        addLog("BUILD_ROCKET", `Power: ${power}, Accuracy: ${accuracy}, Build time: ${buildTime}`);
      }
    }

    // 4. Try to launch a ready rocket
    const readyRocket = currentState.players[playerId]?.rockets.find(
      (r) => r.status === "ready"
    );
    if (readyRocket) {
      if (
        dispatch({
          type: "LAUNCH_ROCKET",
          playerId,
          payload: { rocketId: readyRocket.id },
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

  // 5. END_TURN
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
