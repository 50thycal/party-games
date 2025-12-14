"use client";

import { useState, useEffect, useRef } from "react";
import type { GameViewProps } from "@/games/views";
import type {
  CometRushState,
  CometRushPlayerState,
  Rocket,
  ResearchCard,
  StrengthCard,
  TurnMeta,
  ResearchResult,
} from "./config";
import { calculateScores } from "./config";

// ============================================================================
// TURN WIZARD TYPES
// ============================================================================

type TurnWizardStep = "announce" | "showIncome" | "promptDraw" | "showCard" | null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateRocketCost(buildTimeCost: number, power: number, accuracy: number): number {
  // Rules: Power costs 1 cube/level, Accuracy costs 1 cube/level
  // Build Time Cost determines delay and cube cost: BTC 1 = 1 cube + 2 turns, BTC 2 = 2 cubes + 1 turn, BTC 3 = 3 cubes + instant
  return power + accuracy + buildTimeCost;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

function CometTrack({
  distanceToImpact,
  lastMovementCard,
  activeStrengthCard,
  movementDeckCount,
  strengthDeckCount,
}: {
  distanceToImpact: number;
  lastMovementCard: { moveSpaces: number } | null;
  activeStrengthCard: StrengthCard | null;
  movementDeckCount: number;
  strengthDeckCount: number;
}) {
  const percentage = Math.max(0, Math.min(100, (distanceToImpact / 18) * 100));

  const dangerColor =
    distanceToImpact <= 6
      ? "bg-red-500"
      : distanceToImpact <= 12
      ? "bg-yellow-500"
      : "bg-green-500";

  const DeckChip = ({ label, count, borderColor }: { label: string; count: number; borderColor: string }) => (
    <div className="flex flex-col items-center">
      <div className="relative h-10 w-14">
        {/* Back card shadow */}
        <div className="absolute inset-0 translate-x-0.5 translate-y-0.5 rounded-md border border-slate-700 bg-slate-900/70" />
        {/* Front card */}
        <div className={`absolute inset-0 rounded-md border ${borderColor} bg-slate-800/90 flex items-center justify-center`}>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-200">
            {label}
          </span>
        </div>
      </div>
      {/* Count badge */}
      <div className="mt-1 rounded-full bg-black/80 px-2 py-0.5 text-[10px] font-bold text-slate-100 border border-slate-700">
        {count}
      </div>
    </div>
  );

  return (
    <div className="bg-slate-900/60 rounded-xl border border-slate-700 p-4 mb-4">
      <div className="flex items-start justify-between gap-4">
        {/* Left side - distance info */}
        <div className="flex-1">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Comet Distance</span>
            <span className="font-bold text-lg">
              {distanceToImpact} / 18
              {lastMovementCard && (
                <span className="text-red-400 text-sm ml-2">
                  (-{lastMovementCard.moveSpaces})
                </span>
              )}
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full ${dangerColor} transition-all duration-500`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>Impact!</span>
            <span>Safe</span>
          </div>

          {activeStrengthCard && (
            <div className="mt-3 p-3 bg-amber-900/30 border border-amber-600/60 rounded-lg">
              <div className="text-xs uppercase tracking-wide text-amber-400 mb-1">Active Comet Segment</div>
              <div className="flex justify-between items-center">
                <span className="text-slate-300 text-sm">Strength:</span>
                <span className="text-xl font-bold text-amber-300">
                  {activeStrengthCard.currentStrength}
                  {activeStrengthCard.currentStrength !== activeStrengthCard.baseStrength && (
                    <span className="text-xs text-amber-400/70 ml-1">
                      (was {activeStrengthCard.baseStrength})
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right side - compact deck chips */}
        <div className="flex flex-col items-center gap-2 pt-1">
          <DeckChip label="Move" count={movementDeckCount} borderColor="border-cyan-500" />
          <DeckChip label="Str" count={strengthDeckCount} borderColor="border-amber-500" />
        </div>
      </div>
    </div>
  );
}

function ResourceDisplay({ player }: { player: CometRushPlayerState }) {
  return (
    <div className="flex items-center gap-4 p-3 bg-gray-900 rounded-lg mb-4">
      <div className="flex items-center gap-2">
        <span className="text-yellow-400 text-xl">&#9679;</span>
        <span className="font-bold text-xl">{player.resourceCubes}</span>
        <span className="text-gray-400 text-sm">cubes</span>
      </div>
      <div className="text-gray-500 text-sm">
        +{player.baseIncome + player.upgrades.incomeBonus}/round
      </div>
    </div>
  );
}

function UpgradesDisplay({ player }: { player: CometRushPlayerState }) {
  const upgrades = player.upgrades;
  const hasUpgrades =
    upgrades.powerBonus > 0 ||
    upgrades.accuracyBonus > 0 ||
    upgrades.buildTimeBonus > 0 ||
    upgrades.incomeBonus > 0 ||
    upgrades.maxRocketsBonus > 0;

  if (!hasUpgrades) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {upgrades.powerBonus > 0 && (
        <span className="px-2 py-1 bg-red-900/50 border border-red-700 rounded text-xs">
          Power +{upgrades.powerBonus}
        </span>
      )}
      {upgrades.accuracyBonus > 0 && (
        <span className="px-2 py-1 bg-blue-900/50 border border-blue-700 rounded text-xs">
          Accuracy +{upgrades.accuracyBonus}
        </span>
      )}
      {upgrades.buildTimeBonus > 0 && (
        <span className="px-2 py-1 bg-green-900/50 border border-green-700 rounded text-xs">
          Build -{upgrades.buildTimeBonus}
        </span>
      )}
      {upgrades.incomeBonus > 0 && (
        <span className="px-2 py-1 bg-yellow-900/50 border border-yellow-700 rounded text-xs">
          Income +{upgrades.incomeBonus}
        </span>
      )}
      {upgrades.maxRocketsBonus > 0 && (
        <span className="px-2 py-1 bg-purple-900/50 border border-purple-700 rounded text-xs">
          Slots +{upgrades.maxRocketsBonus}
        </span>
      )}
    </div>
  );
}

function RocketCard({
  rocket,
  onLaunch,
  canLaunch,
  isLaunching,
}: {
  rocket: Rocket;
  onLaunch?: () => void;
  canLaunch?: boolean;
  isLaunching?: boolean;
}) {
  const statusColors = {
    building: "border-yellow-600 bg-yellow-900/20",
    ready: "border-green-600 bg-green-900/20",
    launched: "border-blue-600 bg-blue-900/20",
    spent: "border-gray-600 bg-gray-900/20 opacity-50",
  };

  const statusText = {
    building: `Building (${rocket.buildTimeRemaining} turns)`,
    ready: "Ready to Launch!",
    launched: "Launched",
    spent: "Spent",
  };

  return (
    <div className={`border rounded-lg p-3 mb-2 ${statusColors[rocket.status]}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-semibold">{statusText[rocket.status]}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div className="text-center">
          <div className="text-red-400 font-bold">{rocket.power}</div>
          <div className="text-gray-500 text-xs">Power</div>
        </div>
        <div className="text-center">
          <div className="text-blue-400 font-bold">{rocket.accuracy}</div>
          <div className="text-gray-500 text-xs">Accuracy</div>
        </div>
        <div className="text-center">
          <div className="text-green-400 font-bold">{rocket.buildTimeBase}</div>
          <div className="text-gray-500 text-xs">Build Time</div>
        </div>
      </div>
      {rocket.status === "ready" && onLaunch && (
        <button
          onClick={onLaunch}
          disabled={!canLaunch || isLaunching}
          className="w-full mt-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded transition-colors"
        >
          {isLaunching ? "Launching..." : "Launch!"}
        </button>
      )}
    </div>
  );
}

function ResearchCardDisplay({
  card,
  isSelected,
  onToggle,
}: {
  card: ResearchCard;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const typeColors: Record<ResearchCard["type"], string> = {
    ROCKET_UPGRADE: "from-emerald-700/70 to-emerald-900/80",
    COMET_INSIGHT: "from-sky-700/70 to-sky-900/80",
    SABOTAGE: "from-rose-700/70 to-rose-900/80",
  };

  const gradient = typeColors[card.type];

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`
        w-full rounded-2xl border px-3 py-3 sm:px-4 sm:py-3 text-left
        transition-all duration-150
        bg-gradient-to-br ${gradient}
        ${isSelected
          ? "border-cyan-300 ring-2 ring-cyan-400 scale-[1.02] shadow-lg shadow-cyan-500/20"
          : "border-slate-600 hover:border-slate-300 hover:shadow-md"}
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="text-sm font-semibold text-slate-50">
            {card.name}
          </div>
          <div className="mt-1 text-xs text-slate-200">
            {card.description}
          </div>
        </div>
        <div className="text-right text-[10px] uppercase tracking-wide text-slate-300">
          <div className="font-semibold">{card.setKey}</div>
          <div className="mt-1">Need {card.setSizeRequired}</div>
        </div>
      </div>
    </button>
  );
}

function BuildRocketForm({
  player,
  onBuild,
  isBuilding,
}: {
  player: CometRushPlayerState;
  onBuild: (buildTimeBase: number, power: number, accuracy: number) => void;
  isBuilding: boolean;
}) {
  // Get caps from player upgrades
  const { powerCap, accuracyCap, buildTimeCap } = player.upgrades;

  // Initialize state with values clamped to caps (accuracy max is 3 per rules)
  const [buildTime, setBuildTime] = useState(Math.min(2, buildTimeCap));
  const [power, setPower] = useState(Math.min(3, powerCap));
  const [accuracy, setAccuracy] = useState(Math.min(3, accuracyCap));

  const cost = calculateRocketCost(buildTime, power, accuracy);
  const canAfford = player.resourceCubes >= cost;

  // Count both building and ready rockets for capacity
  const activeRockets = player.rockets.filter(
    (r) => r.status === "ready" || r.status === "building"
  ).length;
  const maxRockets = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
  const hasSlot = activeRockets < maxRockets;

  const effectivePower = power + player.upgrades.powerBonus;
  const effectiveAccuracy = Math.min(6, accuracy + player.upgrades.accuracyBonus); // Cap at 6 (guaranteed hit on d6)
  const effectiveBuildTime = buildTime; // Build time is now just a cost, no reduction needed

  return (
    <div className="bg-gray-900 rounded-lg p-4 mb-4">
      <h3 className="font-semibold mb-4">Build New Rocket</h3>

      <div className="space-y-4">
        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm text-gray-400">Build Cost</span>
            <span className="text-sm">
              {buildTime} cubes
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={buildTimeCap}
            value={buildTime}
            onChange={(e) => setBuildTime(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Cheap & Slow (2 turns)</span>
            <span>Expensive & Fast (instant)</span>
          </div>
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm text-gray-400">Power</span>
            <span className="text-sm">
              {power}
              {player.upgrades.powerBonus > 0 && (
                <span className="text-red-400 ml-1">({effectivePower})</span>
              )}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={powerCap}
            value={power}
            onChange={(e) => setPower(Number(e.target.value))}
            className="w-full"
          />
          {powerCap > 3 && (
            <div className="text-xs text-green-400 mt-1">Cap increased to {powerCap}!</div>
          )}
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <span className="text-sm text-gray-400">Accuracy (roll {effectiveAccuracy} or less on d6)</span>
            <span className="text-sm">
              {accuracy}
              {player.upgrades.accuracyBonus > 0 && (
                <span className="text-blue-400 ml-1">({effectiveAccuracy})</span>
              )}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={accuracyCap}
            value={accuracy}
            onChange={(e) => setAccuracy(Number(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Hard to hit</span>
            <span>Easy to hit</span>
          </div>
          {accuracyCap > 3 && (
            <div className="text-xs text-green-400 mt-1">Cap increased to {accuracyCap}!</div>
          )}
        </div>

        <div className="flex justify-between items-center pt-2 border-t border-gray-700">
          <div>
            <span className="text-gray-400">Cost: </span>
            <span className={`font-bold ${canAfford ? "text-yellow-400" : "text-red-400"}`}>
              {cost} cubes
            </span>
          </div>
          <div className="text-sm text-gray-500">
            Slots: {activeRockets}/{maxRockets}
          </div>
        </div>

        <button
          onClick={() => onBuild(buildTime, power, accuracy)}
          disabled={!canAfford || !hasSlot || isBuilding}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          {isBuilding
            ? "Building..."
            : !hasSlot
            ? "No rocket slots"
            : !canAfford
            ? "Not enough cubes"
            : "Build Rocket"}
        </button>
      </div>
    </div>
  );
}

function LaunchResultDisplay({
  result,
  playerName,
}: {
  result: {
    diceRoll: number;
    accuracyNeeded: number;
    hit: boolean;
    power: number;
    strengthBefore: number;
    destroyed: boolean;
    baseStrength: number;
  };
  playerName: string;
}) {
  return (
    <div
      className={`mb-4 p-4 rounded-lg border ${
        result.destroyed
          ? "bg-green-900/30 border-green-600"
          : result.hit
          ? "bg-yellow-900/30 border-yellow-600"
          : "bg-red-900/30 border-red-600"
      }`}
    >
      <div className="font-semibold mb-2">
        {playerName}&apos;s Launch Result
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          Dice Roll: <span className="font-bold">{result.diceRoll}</span>
        </div>
        <div>
          Needed: <span className="font-bold">&le;{result.accuracyNeeded}</span>
        </div>
      </div>
      <div className="mt-2 font-bold text-lg">
        {result.destroyed ? (
          <span className="text-green-400">DESTROYED! (+{result.baseStrength} points)</span>
        ) : result.hit ? (
          <span className="text-yellow-400">HIT! Comet damaged</span>
        ) : (
          <span className="text-red-400">MISS!</span>
        )}
      </div>
    </div>
  );
}

function PeekInfo({ player }: { player: CometRushPlayerState }) {
  if (!player.peekedMovementCard && !player.peekedStrengthCard) return null;

  return (
    <div className="mb-4 p-3 bg-blue-900/30 border border-blue-600 rounded-lg">
      <div className="text-sm text-blue-400 mb-2">Secret Intel (only you can see)</div>
      {player.peekedMovementCard && (
        <div className="text-sm">
          Next movement: <span className="font-bold">-{player.peekedMovementCard.moveSpaces}</span>
        </div>
      )}
      {player.peekedStrengthCard && (
        <div className="text-sm">
          Next strength card: <span className="font-bold">{player.peekedStrengthCard.baseStrength}</span>
        </div>
      )}
    </div>
  );
}

function TrophiesDisplay({ trophies }: { trophies: StrengthCard[] }) {
  if (trophies.length === 0) return null;

  const totalPoints = trophies.reduce((sum, t) => sum + t.baseStrength, 0);

  return (
    <div className="mb-4">
      <div className="text-sm text-gray-400 mb-2">
        Trophies ({totalPoints} points)
      </div>
      <div className="flex flex-wrap gap-2">
        {trophies.map((trophy) => (
          <span
            key={trophy.id}
            className="px-2 py-1 bg-purple-900/50 border border-purple-600 rounded text-sm font-bold"
          >
            {trophy.baseStrength}
          </span>
        ))}
      </div>
    </div>
  );
}

function OtherPlayersDisplay({
  players,
  currentPlayerId,
  activePlayerId,
}: {
  players: Record<string, CometRushPlayerState>;
  currentPlayerId: string;
  activePlayerId: string | null;
}) {
  const otherPlayers = Object.values(players).filter((p) => p.id !== currentPlayerId);

  if (otherPlayers.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="text-lg font-semibold text-gray-50 mb-3">Other Players</h3>
      <div className="space-y-2">
        {otherPlayers.map((p) => {
          const readyRockets = p.rockets.filter((r) => r.status === "ready").length;
          const buildingRockets = p.rockets.filter((r) => r.status === "building").length;
          const points = p.trophies.reduce((sum, t) => sum + t.baseStrength, 0);

          return (
            <div
              key={p.id}
              className={`p-3 rounded-xl border ${
                p.id === activePlayerId
                  ? "border-yellow-500 bg-yellow-900/30"
                  : "border-gray-700 bg-gray-800/60"
              }`}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-100">{p.name}</span>
                  {p.id === activePlayerId && (
                    <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 rounded-full">
                      Active
                    </span>
                  )}
                </div>
                <span className="text-yellow-400 font-semibold">{p.resourceCubes} cubes</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 text-xs bg-gray-700/50 border border-gray-600 rounded-full text-gray-300">
                  {p.hand.length} cards
                </span>
                {buildingRockets > 0 && (
                  <span className="px-2 py-1 text-xs bg-blue-900/50 border border-blue-600 rounded-full text-blue-300">
                    {buildingRockets} building
                  </span>
                )}
                {readyRockets > 0 && (
                  <span className="px-2 py-1 text-xs bg-green-900/50 border border-green-600 rounded-full text-green-300">
                    {readyRockets} ready
                  </span>
                )}
                {points > 0 && (
                  <span className="px-2 py-1 text-xs bg-purple-900/50 border border-purple-600 rounded-full text-purple-300">
                    {points} pts
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GameOverScreen({
  state,
  room,
  playerId,
  isHost,
  onPlayAgain,
  isPlayingAgain,
}: {
  state: CometRushState;
  room: { players: { id: string; name: string }[] };
  playerId: string;
  isHost: boolean;
  onPlayAgain: () => void;
  isPlayingAgain: boolean;
}) {
  const scores = calculateScores(state);
  const sortedPlayers = [...room.players].sort(
    (a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0)
  );

  return (
    <div className="text-center">
      <div
        className={`text-4xl font-bold mb-4 ${
          state.cometDestroyed ? "text-green-400" : "text-red-400"
        }`}
      >
        {state.cometDestroyed ? "COMET DESTROYED!" : "EARTH DESTROYED!"}
      </div>
      <p className="text-gray-400 mb-6">
        {state.cometDestroyed
          ? "Humanity is saved! The comet has been obliterated."
          : "The comet reached Earth. Humanity tried its best..."}
      </p>

      <div className="bg-gray-900 rounded-lg p-4 mb-6">
        <h3 className="font-semibold mb-4">Final Scores</h3>
        <div className="space-y-3">
          {sortedPlayers.map((p, index) => {
            const isWinner = state.winnerIds.includes(p.id);
            const player = state.players[p.id];
            const trophyPoints = player?.trophies.reduce((sum, t) => sum + t.baseStrength, 0) ?? 0;
            const bonusPoints = state.finalDestroyerId === p.id ? 5 : 0;

            return (
              <div
                key={p.id}
                className={`p-3 rounded-lg ${
                  isWinner ? "bg-yellow-900/30 border border-yellow-600" : "bg-gray-800"
                }`}
              >
                <div className="flex justify-between items-center">
                  <span>
                    {index + 1}. {p.name}
                    {p.id === playerId && " (You)"}
                    {isWinner && " - WINNER!"}
                  </span>
                  <span className="font-bold text-xl">{scores[p.id] ?? 0}</span>
                </div>
                <div className="text-sm text-gray-400 text-left mt-1">
                  Trophies: {trophyPoints}
                  {bonusPoints > 0 && (
                    <span className="text-green-400"> + {bonusPoints} (final blow)</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isHost && (
        <button
          onClick={onPlayAgain}
          disabled={isPlayingAgain}
          className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          {isPlayingAgain ? "Starting new game..." : "Play Again"}
        </button>
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function CometRushGameView({
  state,
  room,
  playerId,
  isHost,
  dispatchAction,
}: GameViewProps<CometRushState>) {
  const [isStarting, setIsStarting] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isEndingTurn, setIsEndingTurn] = useState(false);
  const [isPlayingResearch, setIsPlayingResearch] = useState(false);
  const [isPlayingAgain, setIsPlayingAgain] = useState(false);
  const [isCycling, setIsCycling] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState<string[]>([]);
  const [cycleCardIds, setCycleCardIds] = useState<string[]>([]);
  const [isCycleMode, setIsCycleMode] = useState(false);
  const [targetPlayerId, setTargetPlayerId] = useState<string>("");
  const [targetRocketId, setTargetRocketId] = useState<string>("");

  // Turn wizard state
  const [turnWizardStep, setTurnWizardStep] = useState<TurnWizardStep>(null);
  const [isBeginningTurn, setIsBeginningTurn] = useState(false);
  const [isDrawingCard, setIsDrawingCard] = useState(false);
  const prevTurnMetaRef = useRef<TurnMeta | null>(null);

  const gameState = state as CometRushState;
  const phase = gameState?.phase ?? "lobby";
  const player = gameState?.players?.[playerId];
  const activePlayerId = gameState?.playerOrder?.[gameState?.activePlayerIndex ?? 0] ?? null;
  const isMyTurn = playerId === activePlayerId;
  const turnMeta = gameState?.turnMeta ?? null;

  // Effect to detect turn start and trigger wizard
  useEffect(() => {
    // Only show wizard in playing phase and when it's my turn
    if (phase !== "playing" || !isMyTurn || !turnMeta) return;

    // Check if this is a new turn for me (turnMeta changed to my player)
    const prevMeta = prevTurnMetaRef.current;
    const isNewTurn =
      turnMeta.playerId === playerId &&
      (!prevMeta || prevMeta.playerId !== playerId || prevMeta.incomeGained !== turnMeta.incomeGained);

    if (isNewTurn && turnMeta.incomeGained === 0 && turnMeta.lastDrawnCardId === null) {
      // Fresh turn start - show "It's your turn" announcement
      setTurnWizardStep("announce");
    }

    prevTurnMetaRef.current = turnMeta;
  }, [phase, isMyTurn, turnMeta, playerId]);

  // Begin turn handler - triggers income and rocket tick
  async function handleBeginTurn() {
    setIsBeginningTurn(true);
    try {
      await dispatchAction("BEGIN_TURN");
      setTurnWizardStep("showIncome");
    } finally {
      setIsBeginningTurn(false);
    }
  }

  // Draw turn card handler
  async function handleDrawTurnCard() {
    setIsDrawingCard(true);
    try {
      await dispatchAction("DRAW_TURN_CARD");
      setTurnWizardStep("showCard");
    } finally {
      setIsDrawingCard(false);
    }
  }

  // Dismiss wizard
  function dismissWizard() {
    setTurnWizardStep(null);
  }

  // Clear research result popup
  async function handleClearResearchResult() {
    await dispatchAction("CLEAR_RESEARCH_RESULT");
  }

  async function handleStartGame() {
    setIsStarting(true);
    try {
      await dispatchAction("START_GAME");
    } finally {
      setIsStarting(false);
    }
  }

  async function handleBuildRocket(buildTimeBase: number, power: number, accuracy: number) {
    setIsBuilding(true);
    try {
      await dispatchAction("BUILD_ROCKET", { buildTimeBase, power, accuracy });
    } finally {
      setIsBuilding(false);
    }
  }

  async function handleLaunchRocket(rocketId: string) {
    setIsLaunching(true);
    try {
      await dispatchAction("LAUNCH_ROCKET", { rocketId });
    } finally {
      setIsLaunching(false);
    }
  }

  async function handleEndTurn() {
    setIsEndingTurn(true);
    try {
      await dispatchAction("END_TURN");
    } finally {
      setIsEndingTurn(false);
    }
  }

  async function handlePlayResearch() {
    if (selectedCardIds.length === 0) return;

    setIsPlayingResearch(true);
    try {
      await dispatchAction("PLAY_RESEARCH_SET", {
        cardIds: selectedCardIds,
        targetPlayerId: targetPlayerId || undefined,
        targetRocketId: targetRocketId || undefined,
      });
      setSelectedCardIds([]);
      setTargetPlayerId("");
      setTargetRocketId("");
    } finally {
      setIsPlayingResearch(false);
    }
  }

  async function handlePlayAgain() {
    setIsPlayingAgain(true);
    try {
      await dispatchAction("PLAY_AGAIN");
    } finally {
      setIsPlayingAgain(false);
    }
  }

  function toggleCardSelection(cardId: string) {
    setSelectedCardIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
    );
  }

  function toggleCycleCardSelection(cardId: string) {
    setCycleCardIds((prev) =>
      prev.includes(cardId) ? prev.filter((id) => id !== cardId) : [...prev, cardId]
    );
  }

  async function handleCycleResearch() {
    if (cycleCardIds.length !== 3) return;

    setIsCycling(true);
    try {
      await dispatchAction("CYCLE_RESEARCH", { cardIds: cycleCardIds });
      setCycleCardIds([]);
      setIsCycleMode(false);
    } finally {
      setIsCycling(false);
    }
  }

  // Check if selected cards form a valid set
  const selectedCards = player?.hand.filter((c) => selectedCardIds.includes(c.id)) ?? [];
  const canPlaySet =
    selectedCards.length > 0 &&
    selectedCards.every((c) => c.setKey === selectedCards[0].setKey) &&
    selectedCards.length >= selectedCards[0].setSizeRequired;

  // Check if we need target selection
  const needsTargetPlayer = selectedCards[0]?.tag === "STEAL_RESOURCES" ||
    selectedCards[0]?.tag === "STEAL_CARD";
  const needsTargetRocket = false; // No cards require rocket targeting now

  const otherPlayers = Object.values(gameState?.players ?? {}).filter((p) => p.id !== playerId);

  return (
    <>
      {/* LOBBY PHASE */}
      {phase === "lobby" && (
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">Comet Rush</h2>
          <p className="text-gray-400 text-sm mb-4">
            Build rockets, research upgrades, and destroy the comet before it hits Earth!
          </p>
          <p className="text-gray-500 text-sm mb-4">
            Players: {room.players.length}/4
          </p>

          {isHost ? (
            <button
              onClick={handleStartGame}
              disabled={isStarting || room.players.length < 2}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isStarting
                ? "Starting..."
                : room.players.length < 2
                ? "Need 2+ players"
                : "Start Game"}
            </button>
          ) : (
            <p className="text-gray-400 text-center">
              Waiting for host to start the game...
            </p>
          )}
        </section>
      )}

      {/* PLAYING PHASE */}
      {phase === "playing" && gameState && player && (
        <>
          {/* Turn Wizard Modal */}
          {turnWizardStep && isMyTurn && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className="bg-gray-800 border border-gray-600 rounded-2xl p-6 m-4 max-w-sm w-full shadow-2xl">
                {/* Step 1: Announce turn */}
                {turnWizardStep === "announce" && (
                  <div className="text-center">
                    <div className="text-5xl mb-4">🚀</div>
                    <h2 className="text-2xl font-bold text-green-400 mb-2">Your Turn!</h2>
                    <p className="text-gray-400 mb-6">
                      Round {gameState.round}
                    </p>
                    <button
                      onClick={handleBeginTurn}
                      disabled={isBeginningTurn}
                      className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                    >
                      {isBeginningTurn ? "Starting..." : "Begin Turn"}
                    </button>
                  </div>
                )}

                {/* Step 2: Show income gained */}
                {turnWizardStep === "showIncome" && turnMeta && (
                  <div className="text-center">
                    <div className="text-5xl mb-4">💰</div>
                    <h2 className="text-xl font-bold text-yellow-400 mb-2">Income Received!</h2>
                    <div className="bg-gray-900 rounded-lg p-4 mb-4">
                      <div className="text-3xl font-bold text-yellow-300">
                        +{turnMeta.incomeGained} cubes
                      </div>
                      <div className="text-gray-400 text-sm mt-1">
                        Total: {turnMeta.newTotalCubes} cubes
                      </div>
                    </div>
                    <button
                      onClick={() => setTurnWizardStep("promptDraw")}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                    >
                      Continue
                    </button>
                  </div>
                )}

                {/* Step 3: Prompt to draw card */}
                {turnWizardStep === "promptDraw" && (
                  <div className="text-center">
                    <div className="text-5xl mb-4">🃏</div>
                    <h2 className="text-xl font-bold text-blue-400 mb-2">Draw Research Card</h2>
                    <p className="text-gray-400 mb-6">
                      {gameState.researchDeck.length > 0
                        ? `${gameState.researchDeck.length} cards remaining in deck`
                        : "Deck is empty!"}
                    </p>
                    <button
                      onClick={handleDrawTurnCard}
                      disabled={isDrawingCard || gameState.researchDeck.length === 0}
                      className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                    >
                      {isDrawingCard
                        ? "Drawing..."
                        : gameState.researchDeck.length === 0
                        ? "No Cards Left"
                        : "Draw Card"}
                    </button>
                    {gameState.researchDeck.length === 0 && (
                      <button
                        onClick={dismissWizard}
                        className="w-full mt-3 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                      >
                        Continue Without Drawing
                      </button>
                    )}
                  </div>
                )}

                {/* Step 4: Show drawn card */}
                {turnWizardStep === "showCard" && turnMeta && (
                  <div className="text-center">
                    <div className="text-5xl mb-4">✨</div>
                    <h2 className="text-xl font-bold text-green-400 mb-2">Card Drawn!</h2>
                    {(() => {
                      const drawnCard = player.hand.find(
                        (c) => c.id === turnMeta.lastDrawnCardId
                      );
                      if (!drawnCard) {
                        return (
                          <p className="text-gray-400 mb-6">No card was drawn.</p>
                        );
                      }
                      const typeColors: Record<ResearchCard["type"], string> = {
                        ROCKET_UPGRADE: "border-green-600 bg-green-900/40",
                        COMET_INSIGHT: "border-blue-600 bg-blue-900/40",
                        SABOTAGE: "border-red-600 bg-red-900/40",
                      };
                      return (
                        <div
                          className={`border-2 rounded-xl p-4 mb-4 ${typeColors[drawnCard.type]}`}
                        >
                          <div className="font-bold text-lg">{drawnCard.name}</div>
                          <div className="text-sm text-gray-300 mt-1">
                            {drawnCard.description}
                          </div>
                          <div className="text-xs text-gray-400 mt-2">
                            {drawnCard.setKey} • Need {drawnCard.setSizeRequired}
                          </div>
                        </div>
                      );
                    })()}
                    <button
                      onClick={dismissWizard}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                    >
                      Start Playing
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Research Result Popup */}
          {gameState.lastResearchResult &&
            gameState.lastResearchResult.playerId === playerId && (
              <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60">
                <div className="w-full max-w-sm rounded-2xl bg-slate-900 p-4 m-4 border border-slate-700 shadow-xl">
                  <div className="text-center">
                    <div className="text-4xl mb-3">📜</div>
                    <h2 className="text-sm font-semibold text-slate-50 uppercase tracking-wide">
                      Research Result
                    </h2>
                    <p className="mt-3 text-sm text-slate-200">
                      {gameState.lastResearchResult.description}
                    </p>
                    <button
                      className="mt-4 w-full rounded-lg bg-sky-600 hover:bg-sky-700 px-3 py-2 text-sm font-semibold text-white transition-colors"
                      onClick={handleClearResearchResult}
                    >
                      OK
                    </button>
                  </div>
                </div>
              </div>
            )}

          {/* Turn Indicator - sticky */}
          <div
            className={`sticky top-0 z-10 mb-4 p-3 rounded-xl text-center font-semibold backdrop-blur-sm ${
              isMyTurn
                ? "bg-green-900/80 border border-green-500 shadow-lg shadow-green-500/20"
                : "bg-gray-800/90 border border-gray-700"
            }`}
          >
            <div className="flex items-center justify-center gap-3">
              <span className="text-xs text-gray-400 uppercase tracking-wide">
                Round {gameState.round}
              </span>
              <span className="text-gray-600">|</span>
              {isMyTurn ? (
                <span className="text-green-300">Your Turn!</span>
              ) : (
                <span className="text-gray-300">
                  Waiting for {gameState.players[activePlayerId ?? ""]?.name ?? "..."}
                </span>
              )}
            </div>
          </div>

          {/* Comet Track */}
          <CometTrack
            distanceToImpact={gameState.distanceToImpact}
            lastMovementCard={gameState.lastMovementCard}
            activeStrengthCard={gameState.activeStrengthCard}
            movementDeckCount={gameState.movementDeck.length}
            strengthDeckCount={gameState.strengthDeck.length}
          />

          {/* Last Launch Result */}
          {gameState.lastLaunchResult && (
            <LaunchResultDisplay
              result={gameState.lastLaunchResult}
              playerName={
                gameState.players[gameState.lastLaunchResult.playerId]?.name ?? "Unknown"
              }
            />
          )}

          {/* Peek Info (private) */}
          <PeekInfo player={player} />

          {/* Resources */}
          <ResourceDisplay player={player} />

          {/* Upgrades */}
          <UpgradesDisplay player={player} />

          {/* Trophies */}
          <TrophiesDisplay trophies={player.trophies} />

          {/* My Rockets */}
          <section className="bg-gray-800/60 border border-gray-700 rounded-xl p-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-50 mb-4">Your Rockets</h3>
            {player.rockets.length === 0 ? (
              <p className="text-sm text-gray-400">No rockets yet. Build one below!</p>
            ) : (
              <div className="space-y-2">
                {player.rockets
                  .filter((r) => r.status !== "spent")
                  .map((rocket) => (
                    <RocketCard
                      key={rocket.id}
                      rocket={rocket}
                      onLaunch={
                        isMyTurn
                          ? () => handleLaunchRocket(rocket.id)
                          : undefined
                      }
                      canLaunch={isMyTurn}
                      isLaunching={isLaunching}
                    />
                  ))}
              </div>
            )}
          </section>

          {/* Build Rocket (only on my turn) */}
          {isMyTurn && <BuildRocketForm player={player} onBuild={handleBuildRocket} isBuilding={isBuilding} />}

          {/* Research Cards */}
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-50 mb-3">
              Research Cards ({player.hand.length})
            </h3>
            {player.hand.length === 0 ? (
              <p className="text-sm text-slate-400">No cards in hand.</p>
            ) : (
              <div className="space-y-2">
                {player.hand.map((card) => (
                  <ResearchCardDisplay
                    key={card.id}
                    card={card}
                    isSelected={selectedCardIds.includes(card.id)}
                    onToggle={() => {
                      if (isMyTurn && !isCycleMode) {
                        toggleCardSelection(card.id);
                      }
                    }}
                  />
                ))}
              </div>
            )}

            {/* Play Research Set Controls */}
            {isMyTurn && selectedCardIds.length > 0 && (
              <div className="mt-4 p-3 bg-gray-900 rounded-lg">
                <div className="text-sm text-gray-400 mb-2">
                  Selected: {selectedCardIds.length} cards
                  {canPlaySet ? (
                    <span className="text-green-400 ml-2">Valid set!</span>
                  ) : (
                    <span className="text-red-400 ml-2">
                      Need {selectedCards[0]?.setSizeRequired ?? "?"} matching cards
                    </span>
                  )}
                </div>

                {/* Target Selection for Sabotage */}
                {canPlaySet && needsTargetPlayer && (
                  <div className="mb-2">
                    <label className="text-sm text-gray-400">Target Player:</label>
                    <select
                      value={targetPlayerId}
                      onChange={(e) => setTargetPlayerId(e.target.value)}
                      className="w-full mt-1 bg-gray-800 border border-gray-600 rounded p-2"
                    >
                      <option value="">Select player...</option>
                      {otherPlayers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {canPlaySet && needsTargetRocket && targetPlayerId && (
                  <div className="mb-2">
                    <label className="text-sm text-gray-400">Target Rocket:</label>
                    <select
                      value={targetRocketId}
                      onChange={(e) => setTargetRocketId(e.target.value)}
                      className="w-full mt-1 bg-gray-800 border border-gray-600 rounded p-2"
                    >
                      <option value="">Select rocket...</option>
                      {gameState.players[targetPlayerId]?.rockets
                        .filter((r) => r.status === "building")
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            Power {r.power}, Acc {r.accuracy} ({r.buildTimeRemaining} turns left)
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                <button
                  onClick={handlePlayResearch}
                  disabled={
                    !canPlaySet ||
                    isPlayingResearch ||
                    (needsTargetPlayer && !targetPlayerId) ||
                    (needsTargetRocket && !targetRocketId)
                  }
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded transition-colors"
                >
                  {isPlayingResearch ? "Playing..." : "Play Research Set"}
                </button>
              </div>
            )}

            {/* Cycle Research (3-for-1 trade) */}
            {isMyTurn && player.hand.length >= 3 && !isCycleMode && (
              <button
                onClick={() => {
                  setIsCycleMode(true);
                  setCycleCardIds([]);
                  setSelectedCardIds([]);
                }}
                className="w-full mt-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded transition-colors"
              >
                Trade 3 Cards for 1
              </button>
            )}

            {/* Cycle Mode UI */}
            {isMyTurn && isCycleMode && (
              <div className="mt-4 p-3 bg-purple-900/30 border border-purple-600 rounded-lg">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-semibold text-purple-300">
                    Select 3 cards to discard
                  </span>
                  <button
                    onClick={() => {
                      setIsCycleMode(false);
                      setCycleCardIds([]);
                    }}
                    className="text-gray-400 hover:text-white text-sm"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 mb-3">
                  {player.hand.map((card) => (
                    <div
                      key={card.id}
                      onClick={() => toggleCycleCardSelection(card.id)}
                      className={`border rounded-lg p-2 cursor-pointer transition-all ${
                        cycleCardIds.includes(card.id)
                          ? "border-purple-400 bg-purple-900/50 ring-2 ring-purple-400"
                          : "border-gray-600 bg-gray-800 hover:border-gray-500"
                      }`}
                    >
                      <div className="font-semibold text-sm">{card.name}</div>
                      <div className="text-xs text-gray-400">{card.description}</div>
                    </div>
                  ))}
                </div>
                <div className="text-sm text-gray-400 mb-2">
                  Selected: {cycleCardIds.length}/3
                  {cycleCardIds.length === 3 && (
                    <span className="text-green-400 ml-2">Ready to trade!</span>
                  )}
                </div>
                <button
                  onClick={handleCycleResearch}
                  disabled={cycleCardIds.length !== 3 || isCycling}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded transition-colors"
                >
                  {isCycling ? "Trading..." : "Discard 3, Draw 1"}
                </button>
              </div>
            )}
          </div>

          {/* Other Players */}
          <OtherPlayersDisplay
            players={gameState.players}
            currentPlayerId={playerId}
            activePlayerId={activePlayerId}
          />

          {/* End Turn Button */}
          {isMyTurn && (
            <button
              onClick={handleEndTurn}
              disabled={isEndingTurn}
              className="w-full bg-gray-600 hover:bg-gray-700 disabled:bg-gray-800 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isEndingTurn ? "Ending turn..." : "End Turn"}
            </button>
          )}
        </>
      )}

      {/* GAME OVER PHASE */}
      {phase === "gameOver" && gameState && (
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <GameOverScreen
            state={gameState}
            room={room}
            playerId={playerId}
            isHost={isHost}
            onPlayAgain={handlePlayAgain}
            isPlayingAgain={isPlayingAgain}
          />
        </section>
      )}
    </>
  );
}
