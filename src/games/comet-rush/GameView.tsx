"use client";

import { useState, useEffect, useRef } from "react";
import type { GameViewProps } from "@/games/views";
import type {
  CometRushState,
  CometRushPlayerState,
  Rocket,
  GameCard,
  EngineeringCard,
  PoliticalCard,
  StrengthCard,
  TurnMeta,
  CardResult,
  CardDeckType,
} from "./config";
import { calculateScores } from "./config";

// ============================================================================
// TURN WIZARD TYPES
// ============================================================================

type TurnWizardStep = "announce" | "showIncome" | "chooseDeck" | "showCard" | null;

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

// Consolidated header showing all read-only game state
function GameStateHeader({
  round,
  isMyTurn,
  activePlayerName,
  distanceToImpact,
  activeStrengthCard,
  playerCubes,
  playerIncome,
}: {
  round: number;
  isMyTurn: boolean;
  activePlayerName: string;
  distanceToImpact: number;
  activeStrengthCard: { currentStrength: number; baseStrength: number } | null;
  playerCubes: number;
  playerIncome: number;
}) {
  const percentage = Math.max(0, Math.min(100, (distanceToImpact / 18) * 100));
  const dangerColor =
    distanceToImpact <= 6
      ? "bg-red-500"
      : distanceToImpact <= 12
        ? "bg-yellow-500"
        : "bg-green-500";

  const dangerText =
    distanceToImpact <= 6
      ? "text-red-400"
      : distanceToImpact <= 12
        ? "text-yellow-400"
        : "text-green-400";

  return (
    <div className="sticky top-0 z-10 bg-slate-900 border-b border-slate-700 px-4 py-3 -mx-4 mb-4">
      {/* Row 1: Round + Turn */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Round {round}
          </span>
        </div>
        <div
          className={`px-3 py-1 rounded-full text-sm font-semibold ${
            isMyTurn
              ? "bg-green-900/80 text-green-300 border border-green-600"
              : "bg-slate-800 text-slate-400 border border-slate-600"
          }`}
        >
          {isMyTurn ? "Your Turn" : `${activePlayerName}'s Turn`}
        </div>
      </div>

      {/* Row 2: Comet distance + Strength */}
      <div className="flex items-center gap-4 mb-3">
        {/* Comet distance */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-500">Comet</span>
            <span className={`text-sm font-bold ${dangerText}`}>
              {distanceToImpact}/18
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full ${dangerColor} transition-all duration-500`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        </div>

        {/* Strength */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-900/40 border border-amber-700/50 rounded-lg">
          <span className="text-xs text-amber-400">STR</span>
          <span className="text-lg font-bold text-amber-300">
            {activeStrengthCard?.currentStrength ?? "—"}
          </span>
        </div>
      </div>

      {/* Row 3: Resources */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-yellow-400">●</span>
          <span className="font-bold text-lg text-white">{playerCubes}</span>
          <span className="text-slate-500 text-sm">cubes</span>
          <span className="text-slate-600 text-sm">
            (+{playerIncome}/round)
          </span>
        </div>
      </div>
    </div>
  );
}

// Simplified deck info display (distance/strength now in header)
function DeckInfo({
  lastMovementCard,
  movementDeckCount,
  strengthDeckCount,
  engineeringDeckCount,
  politicalDeckCount,
}: {
  lastMovementCard: { moveSpaces: number } | null;
  movementDeckCount: number;
  strengthDeckCount: number;
  engineeringDeckCount: number;
  politicalDeckCount: number;
}) {
  const DeckChip = ({ label, count, borderColor }: { label: string; count: number; borderColor: string }) => (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/80 border border-slate-700">
      <div className={`w-2 h-2 rounded-full ${borderColor.replace('border-', 'bg-')}`} />
      <span className="text-xs text-slate-400">{label}</span>
      <span className="text-xs font-semibold text-slate-200">{count}</span>
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {lastMovementCard && (
        <div className="px-2 py-1 rounded-md bg-red-900/40 border border-red-700/50 text-xs text-red-300">
          Last move: -{lastMovementCard.moveSpaces}
        </div>
      )}
      <DeckChip label="Move" count={movementDeckCount} borderColor="border-cyan-500" />
      <DeckChip label="Str" count={strengthDeckCount} borderColor="border-amber-500" />
      <DeckChip label="Eng" count={engineeringDeckCount} borderColor="border-emerald-500" />
      <DeckChip label="Pol" count={politicalDeckCount} borderColor="border-rose-500" />
    </div>
  );
}

// Accordion-style action panel - only one can be open at a time
type ActionPanelType = "build" | "launch" | "cards" | null;

function ActionPanel({
  type,
  title,
  summary,
  isExpanded,
  onToggle,
  disabled,
  children,
}: {
  type: ActionPanelType;
  title: string;
  summary: string;
  isExpanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border transition-all duration-200 ${
      isExpanded
        ? "bg-slate-800 border-slate-600"
        : "bg-slate-800/50 border-slate-700 hover:border-slate-600"
    } ${disabled ? "opacity-50" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="w-full px-4 py-3 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <span className={`text-lg transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
            ▶
          </span>
          <span className="font-semibold text-slate-100">{title}</span>
        </div>
        <span className="text-sm text-slate-400">{summary}</span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 border-t border-slate-700">
          <div className="pt-4">
            {children}
          </div>
        </div>
      )}
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
    upgrades.powerCap > 3 ||
    upgrades.accuracyCap > 3 ||
    upgrades.incomeBonus > 0 ||
    upgrades.salvageBonus > 0 ||
    player.hasRerollToken ||
    player.isEmbargoed ||
    player.mustRerollNextLaunch;

  if (!hasUpgrades) return null;

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {upgrades.powerCap > 3 && (
        <span className="px-2 py-1 bg-red-900/50 border border-red-700 rounded text-xs">
          Power Cap {upgrades.powerCap}
        </span>
      )}
      {upgrades.accuracyCap > 3 && (
        <span className="px-2 py-1 bg-blue-900/50 border border-blue-700 rounded text-xs">
          Accuracy Cap {upgrades.accuracyCap}
        </span>
      )}
      {upgrades.incomeBonus > 0 && (
        <span className="px-2 py-1 bg-yellow-900/50 border border-yellow-700 rounded text-xs">
          Income +{upgrades.incomeBonus}
        </span>
      )}
      {upgrades.salvageBonus > 0 && (
        <span className="px-2 py-1 bg-green-900/50 border border-green-700 rounded text-xs">
          Salvage +{upgrades.salvageBonus}
        </span>
      )}
      {player.hasRerollToken && (
        <span className="px-2 py-1 bg-cyan-900/50 border border-cyan-700 rounded text-xs">
          Re-roll Ready
        </span>
      )}
      {player.isEmbargoed && (
        <span className="px-2 py-1 bg-orange-900/50 border border-orange-700 rounded text-xs">
          Embargoed!
        </span>
      )}
      {player.mustRerollNextLaunch && (
        <span className="px-2 py-1 bg-pink-900/50 border border-pink-700 rounded text-xs">
          Sabotaged!
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

function GameCardDisplay({
  card,
  isSelected,
  onToggle,
}: {
  card: GameCard;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const isEngineering = card.deck === "engineering";
  const gradient = isEngineering
    ? "from-emerald-700/70 to-emerald-900/80"
    : "from-rose-700/70 to-rose-900/80";
  const deckLabel = isEngineering ? "ENG" : "POL";

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
        <div className={`text-[10px] uppercase tracking-wide px-2 py-1 rounded ${
          isEngineering ? "bg-emerald-600/50 text-emerald-200" : "bg-rose-600/50 text-rose-200"
        }`}>
          {deckLabel}
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
        className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
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

// Collapsible section for secondary info
function CollapsibleSection({
  title,
  summary,
  isExpanded,
  onToggle,
  variant = "default",
  children,
}: {
  title: string;
  summary?: string;
  isExpanded: boolean;
  onToggle: () => void;
  variant?: "default" | "info" | "trophy";
  children: React.ReactNode;
}) {
  const variantStyles = {
    default: "bg-slate-800/50 border-slate-700 hover:border-slate-600",
    info: "bg-blue-900/30 border-blue-700 hover:border-blue-600",
    trophy: "bg-purple-900/30 border-purple-700 hover:border-purple-600",
  };

  return (
    <div className={`rounded-xl border mb-3 ${variantStyles[variant]}`}>
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-2">
          <span className={`text-sm transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
            ▶
          </span>
          <span className="text-sm font-medium text-slate-200">{title}</span>
        </div>
        {summary && <span className="text-xs text-slate-400">{summary}</span>}
      </button>
      {isExpanded && (
        <div className="px-3 pb-3 border-t border-slate-700/50">
          <div className="pt-2">{children}</div>
        </div>
      )}
    </div>
  );
}

function PeekInfo({
  player,
  isExpanded,
  onToggle,
}: {
  player: CometRushPlayerState;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  if (!player.peekedMovementCard && !player.peekedStrengthCard) return null;

  const intelCount = (player.peekedMovementCard ? 1 : 0) + (player.peekedStrengthCard ? 1 : 0);

  return (
    <CollapsibleSection
      title="Secret Intel"
      summary={`${intelCount} peeked`}
      isExpanded={isExpanded}
      onToggle={onToggle}
      variant="info"
    >
      {player.peekedMovementCard && (
        <div className="text-sm text-slate-300">
          Next movement: <span className="font-bold text-cyan-400">-{player.peekedMovementCard.moveSpaces}</span>
        </div>
      )}
      {player.peekedStrengthCard && (
        <div className="text-sm text-slate-300">
          Next strength: <span className="font-bold text-amber-400">{player.peekedStrengthCard.baseStrength}</span>
        </div>
      )}
    </CollapsibleSection>
  );
}

function TrophiesDisplay({
  trophies,
  isExpanded,
  onToggle,
}: {
  trophies: StrengthCard[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  if (trophies.length === 0) return null;

  const totalPoints = trophies.reduce((sum, t) => sum + t.baseStrength, 0);

  return (
    <CollapsibleSection
      title="Trophies"
      summary={`${totalPoints} pts`}
      isExpanded={isExpanded}
      onToggle={onToggle}
      variant="trophy"
    >
      <div className="flex flex-wrap gap-2">
        {trophies.map((trophy) => (
          <span
            key={trophy.id}
            className="px-2 py-1 bg-purple-900/50 border border-purple-500 rounded text-sm font-bold text-purple-200"
          >
            {trophy.baseStrength}
          </span>
        ))}
      </div>
    </CollapsibleSection>
  );
}

function OtherPlayersDisplay({
  players,
  currentPlayerId,
  activePlayerId,
  isExpanded,
  onToggle,
}: {
  players: Record<string, CometRushPlayerState>;
  currentPlayerId: string;
  activePlayerId: string | null;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const otherPlayers = Object.values(players).filter((p) => p.id !== currentPlayerId);

  if (otherPlayers.length === 0) return null;

  return (
    <CollapsibleSection
      title="Other Players"
      summary={`${otherPlayers.length} players`}
      isExpanded={isExpanded}
      onToggle={onToggle}
    >
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
    </CollapsibleSection>
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
  const [isPlayingCard, setIsPlayingCard] = useState(false);
  const [isPlayingAgain, setIsPlayingAgain] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [targetPlayerId, setTargetPlayerId] = useState<string>("");
  const [targetRocketId, setTargetRocketId] = useState<string>("");
  const [peekChoice, setPeekChoice] = useState<"strength" | "movement" | null>(null);

  // Action panel accordion state - only one can be open at a time
  const [expandedAction, setExpandedAction] = useState<ActionPanelType>(null);

  // Secondary info collapsible sections state
  const [expandedInfo, setExpandedInfo] = useState<"peek" | "trophies" | "players" | null>(null);
  const toggleInfoSection = (section: "peek" | "trophies" | "players") => {
    setExpandedInfo(expandedInfo === section ? null : section);
  };

  // Turn wizard state
  const [turnWizardStep, setTurnWizardStep] = useState<TurnWizardStep>(null);
  const [isBeginningTurn, setIsBeginningTurn] = useState(false);
  const [isDrawingCard, setIsDrawingCard] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<CardDeckType | null>(null);
  const prevTurnMetaRef = useRef<TurnMeta | null>(null);

  const gameState = state as CometRushState;
  const phase = gameState?.phase ?? "lobby";
  const player = gameState?.players?.[playerId];
  const activePlayerId = gameState?.playerOrder?.[gameState?.activePlayerIndex ?? 0] ?? null;
  const isMyTurn = playerId === activePlayerId;
  const turnMeta = gameState?.turnMeta ?? null;

  // Effect to detect turn start and trigger wizard
  useEffect(() => {
    if (phase !== "playing" || !isMyTurn || !turnMeta) return;

    const prevMeta = prevTurnMetaRef.current;
    const isNewTurn =
      turnMeta.playerId === playerId &&
      (!prevMeta || prevMeta.playerId !== playerId || prevMeta.incomeGained !== turnMeta.incomeGained);

    if (isNewTurn && turnMeta.incomeGained === 0 && turnMeta.lastDrawnCardId === null) {
      setTurnWizardStep("announce");
    }

    prevTurnMetaRef.current = turnMeta;
  }, [phase, isMyTurn, turnMeta, playerId]);

  // Begin turn handler
  async function handleBeginTurn() {
    setIsBeginningTurn(true);
    try {
      await dispatchAction("BEGIN_TURN");
      setTurnWizardStep("showIncome");
    } finally {
      setIsBeginningTurn(false);
    }
  }

  // Draw card from chosen deck
  async function handleDrawCard(deck: CardDeckType) {
    setIsDrawingCard(true);
    setSelectedDeck(deck);
    try {
      await dispatchAction("DRAW_CARD", { deck });
      setTurnWizardStep("showCard");
    } finally {
      setIsDrawingCard(false);
    }
  }

  function dismissWizard() {
    setTurnWizardStep(null);
    setSelectedDeck(null);
  }

  // Clear card result popup
  async function handleClearCardResult() {
    await dispatchAction("CLEAR_CARD_RESULT");
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

  async function handlePlayCard() {
    if (!selectedCardId) return;

    setIsPlayingCard(true);
    try {
      await dispatchAction("PLAY_CARD", {
        cardId: selectedCardId,
        targetPlayerId: targetPlayerId || undefined,
        targetRocketId: targetRocketId || undefined,
        peekChoice: peekChoice || undefined,
      });
      setSelectedCardId(null);
      setTargetPlayerId("");
      setTargetRocketId("");
      setPeekChoice(null);
    } finally {
      setIsPlayingCard(false);
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
    setSelectedCardId((prev) => (prev === cardId ? null : cardId));
    setTargetPlayerId("");
    setTargetRocketId("");
    setPeekChoice(null);
  }

  // Get selected card info
  const selectedCard = player?.hand.find((c) => c.id === selectedCardId) ?? null;

  // Determine what targeting is needed for the selected card
  const getCardRequirements = (card: GameCard | null) => {
    if (!card) return { needsTargetPlayer: false, needsTargetRocket: false, needsPeekChoice: false, needsOwnRocket: false };

    if (card.deck === "engineering") {
      const engCard = card as EngineeringCard;
      switch (engCard.cardType) {
        case "STREAMLINED_ASSEMBLY":
          return { needsTargetPlayer: false, needsTargetRocket: false, needsPeekChoice: false, needsOwnRocket: true };
        case "COMET_RESEARCH":
          return { needsTargetPlayer: false, needsTargetRocket: false, needsPeekChoice: true, needsOwnRocket: false };
        default:
          return { needsTargetPlayer: false, needsTargetRocket: false, needsPeekChoice: false, needsOwnRocket: false };
      }
    } else {
      const polCard = card as PoliticalCard;
      switch (polCard.cardType) {
        case "RESOURCE_SEIZURE":
        case "TECHNOLOGY_THEFT":
        case "EMBARGO":
        case "SABOTAGE":
          return { needsTargetPlayer: true, needsTargetRocket: false, needsPeekChoice: false, needsOwnRocket: false };
        case "REGULATORY_REVIEW":
          return { needsTargetPlayer: true, needsTargetRocket: true, needsPeekChoice: false, needsOwnRocket: false };
        default:
          return { needsTargetPlayer: false, needsTargetRocket: false, needsPeekChoice: false, needsOwnRocket: false };
      }
    }
  };

  const cardRequirements = getCardRequirements(selectedCard);

  // Check if card can be played
  const canPlayCard = () => {
    if (!selectedCard) return false;
    if (cardRequirements.needsTargetPlayer && !targetPlayerId) return false;
    if (cardRequirements.needsTargetRocket && !targetRocketId) return false;
    if (cardRequirements.needsPeekChoice && !peekChoice) return false;
    if (cardRequirements.needsOwnRocket && !targetRocketId) return false;
    return true;
  };

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
          {/* Consolidated Game State Header */}
          <GameStateHeader
            round={gameState.round}
            isMyTurn={isMyTurn}
            activePlayerName={gameState.players[activePlayerId ?? ""]?.name ?? "..."}
            distanceToImpact={gameState.distanceToImpact}
            activeStrengthCard={gameState.activeStrengthCard}
            playerCubes={player.resourceCubes}
            playerIncome={player.baseIncome + player.upgrades.incomeBonus}
          />

          {/* Deck counts and last movement */}
          <DeckInfo
            lastMovementCard={gameState.lastMovementCard}
            movementDeckCount={gameState.movementDeck.length}
            strengthDeckCount={gameState.strengthDeck.length}
            engineeringDeckCount={gameState.engineeringDeck.length}
            politicalDeckCount={gameState.politicalDeck.length}
          />

          {/* Card Result - Inline notification */}
          {gameState.lastCardResult &&
            gameState.lastCardResult.playerId === playerId && (
              <div className="mb-4 rounded-xl border border-amber-600 bg-amber-900/30 p-4">
                <div className="text-center">
                  <h3 className="text-sm font-semibold text-amber-300 uppercase tracking-wide mb-2">
                    {gameState.lastCardResult.cardName}
                  </h3>
                  <p className="text-sm text-slate-200">
                    {gameState.lastCardResult.description}
                  </p>
                  <button
                    className="mt-3 w-full rounded-lg bg-amber-600 hover:bg-amber-700 px-3 py-2 text-sm font-semibold text-white transition-colors"
                    onClick={handleClearCardResult}
                  >
                    OK
                  </button>
                </div>
              </div>
            )}

          {/* Turn Start Card - Inline, appears when it's your turn and wizard is active */}
          {isMyTurn && turnWizardStep && (
            <div className="mb-4 rounded-xl border border-green-600 bg-green-900/30 p-4">
              {/* Step 1: Announce turn */}
              {turnWizardStep === "announce" && (
                <div className="text-center">
                  <div className="text-lg font-semibold text-green-300 mb-2">
                    Your Turn!
                  </div>
                  <p className="text-sm text-slate-300 mb-4">
                    Collect income and draw a card to begin.
                  </p>
                  <button
                    onClick={handleBeginTurn}
                    disabled={isBeginningTurn}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                  >
                    {isBeginningTurn ? "Starting..." : "Begin Turn"}
                  </button>
                </div>
              )}

              {/* Step 2+3: Show income and choose deck */}
              {(turnWizardStep === "showIncome" || turnWizardStep === "chooseDeck") && (
                <div>
                  <div className="text-center mb-4">
                    <div className="text-3xl font-bold text-yellow-400">
                      +{turnMeta?.incomeGained ?? 0}
                    </div>
                    <div className="text-sm text-slate-400">cubes collected</div>
                  </div>
                  <div className="text-sm text-slate-300 mb-3 text-center">
                    Choose a deck to draw from:
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleDrawCard("engineering")}
                      disabled={isDrawingCard}
                      className="bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                      {isDrawingCard && selectedDeck === "engineering" ? "Drawing..." : "Engineering"}
                    </button>
                    <button
                      onClick={() => handleDrawCard("political")}
                      disabled={isDrawingCard}
                      className="bg-rose-700 hover:bg-rose-600 disabled:bg-slate-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                    >
                      {isDrawingCard && selectedDeck === "political" ? "Drawing..." : "Political"}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Show drawn card */}
              {turnWizardStep === "showCard" && turnMeta?.lastDrawnCardId && (
                <div className="text-center">
                  <div className="text-sm text-slate-400 mb-2">Card drawn:</div>
                  {(() => {
                    const drawnCard = player.hand.find(c => c.id === turnMeta.lastDrawnCardId);
                    if (!drawnCard) return null;
                    const isEngineering = drawnCard.deck === "engineering";
                    return (
                      <div className={`rounded-xl border p-3 mb-4 ${
                        isEngineering
                          ? "bg-emerald-900/50 border-emerald-600"
                          : "bg-rose-900/50 border-rose-600"
                      }`}>
                        <div className="font-semibold text-slate-100">
                          {drawnCard.name}
                        </div>
                        <div className="text-sm text-slate-300 mt-1">
                          {drawnCard.description}
                        </div>
                      </div>
                    );
                  })()}
                  <button
                    onClick={dismissWizard}
                    className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                  >
                    Start Playing
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Last Launch Result */}
          {gameState.lastLaunchResult && (
            <LaunchResultDisplay
              result={gameState.lastLaunchResult}
              playerName={
                gameState.players[gameState.lastLaunchResult.playerId]?.name ?? "Unknown"
              }
            />
          )}

          {/* Peek Info (private) - collapsible */}
          <PeekInfo
            player={player}
            isExpanded={expandedInfo === "peek"}
            onToggle={() => toggleInfoSection("peek")}
          />

          {/* Upgrades */}
          <UpgradesDisplay player={player} />

          {/* Trophies - collapsible */}
          <TrophiesDisplay
            trophies={player.trophies}
            isExpanded={expandedInfo === "trophies"}
            onToggle={() => toggleInfoSection("trophies")}
          />

          {/* Action Panels - Accordion Style */}
          {(() => {
            const activeRockets = player.rockets.filter((r) => r.status === "ready" || r.status === "building");
            const readyRockets = player.rockets.filter((r) => r.status === "ready");
            const buildingRockets = player.rockets.filter((r) => r.status === "building");
            const maxRockets = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;

            const togglePanel = (panel: ActionPanelType) => {
              setExpandedAction(expandedAction === panel ? null : panel);
              // Clear card selection when switching panels
              if (panel !== "cards") {
                setSelectedCardId(null);
                setTargetPlayerId("");
                setTargetRocketId("");
                setPeekChoice(null);
              }
            };

            return (
              <div className="space-y-2 mb-4">
                {/* Build Rocket Panel */}
                <ActionPanel
                  type="build"
                  title="Build Rocket"
                  summary={`${activeRockets.length}/${maxRockets} slots`}
                  isExpanded={expandedAction === "build"}
                  onToggle={() => togglePanel("build")}
                  disabled={!isMyTurn}
                >
                  <BuildRocketForm player={player} onBuild={handleBuildRocket} isBuilding={isBuilding} />
                </ActionPanel>

                {/* Launch Rocket Panel */}
                <ActionPanel
                  type="launch"
                  title="Launch Rocket"
                  summary={readyRockets.length > 0 ? `${readyRockets.length} ready` : buildingRockets.length > 0 ? `${buildingRockets.length} building` : "none"}
                  isExpanded={expandedAction === "launch"}
                  onToggle={() => togglePanel("launch")}
                  disabled={!isMyTurn && readyRockets.length === 0}
                >
                  {player.rockets.filter((r) => r.status !== "spent").length === 0 ? (
                    <p className="text-sm text-slate-400">No rockets yet. Build one first!</p>
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
                </ActionPanel>

                {/* Play Card Panel */}
                <ActionPanel
                  type="cards"
                  title="Play Card"
                  summary={`${player.hand.length} cards`}
                  isExpanded={expandedAction === "cards"}
                  onToggle={() => togglePanel("cards")}
                  disabled={!isMyTurn && player.hand.length === 0}
                >
                  {player.hand.length === 0 ? (
                    <p className="text-sm text-slate-400">No cards in hand.</p>
                  ) : (
                    <div className="space-y-2">
                      {player.hand.map((card) => (
                        <GameCardDisplay
                          key={card.id}
                          card={card}
                          isSelected={selectedCardId === card.id}
                          onToggle={() => {
                            if (isMyTurn) {
                              toggleCardSelection(card.id);
                            }
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* Play Card Controls */}
                  {isMyTurn && selectedCard && (
                    <div className="mt-4 p-3 bg-slate-900 rounded-lg">
                      <div className="text-sm text-slate-300 mb-3">
                        Playing: <span className="font-semibold text-white">{selectedCard.name}</span>
                      </div>

                      {/* Target Player Selection */}
                      {cardRequirements.needsTargetPlayer && (
                        <div className="mb-3">
                          <label className="text-sm text-slate-400 block mb-1">Target Player:</label>
                          <select
                            value={targetPlayerId}
                            onChange={(e) => {
                              setTargetPlayerId(e.target.value);
                              setTargetRocketId("");
                            }}
                            className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm"
                          >
                            <option value="">Select player...</option>
                            {otherPlayers.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.resourceCubes} cubes, {p.hand.length} cards)
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Target Rocket Selection (for Regulatory Review) */}
                      {cardRequirements.needsTargetRocket && targetPlayerId && (
                        <div className="mb-3">
                          <label className="text-sm text-slate-400 block mb-1">Target Rocket:</label>
                          <select
                            value={targetRocketId}
                            onChange={(e) => setTargetRocketId(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm"
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

                      {/* Own Rocket Selection (for Streamlined Assembly) */}
                      {cardRequirements.needsOwnRocket && (
                        <div className="mb-3">
                          <label className="text-sm text-slate-400 block mb-1">Target Your Rocket:</label>
                          <select
                            value={targetRocketId}
                            onChange={(e) => setTargetRocketId(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-600 rounded p-2 text-sm"
                          >
                            <option value="">Select rocket...</option>
                            {player.rockets
                              .filter((r) => r.status === "building")
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  Power {r.power}, Acc {r.accuracy} ({r.buildTimeRemaining} turns left)
                                </option>
                              ))}
                          </select>
                          {player.rockets.filter((r) => r.status === "building").length === 0 && (
                            <p className="text-xs text-orange-400 mt-1">No rockets currently building.</p>
                          )}
                        </div>
                      )}

                      {/* Peek Choice (for Comet Research) */}
                      {cardRequirements.needsPeekChoice && (
                        <div className="mb-3">
                          <label className="text-sm text-slate-400 block mb-1">What to Peek:</label>
                          <div className="flex gap-2">
                            <button
                              onClick={() => setPeekChoice("strength")}
                              className={`flex-1 py-2 px-3 rounded text-sm font-semibold transition-colors ${
                                peekChoice === "strength"
                                  ? "bg-amber-600 text-white"
                                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                              }`}
                            >
                              Comet Strength
                            </button>
                            <button
                              onClick={() => setPeekChoice("movement")}
                              className={`flex-1 py-2 px-3 rounded text-sm font-semibold transition-colors ${
                                peekChoice === "movement"
                                  ? "bg-cyan-600 text-white"
                                  : "bg-slate-700 text-slate-300 hover:bg-slate-600"
                              }`}
                            >
                              Comet Movement
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedCardId(null);
                            setTargetPlayerId("");
                            setTargetRocketId("");
                            setPeekChoice(null);
                          }}
                          className="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-semibold py-2 px-4 rounded transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handlePlayCard}
                          disabled={!canPlayCard() || isPlayingCard}
                          className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded transition-colors"
                        >
                          {isPlayingCard ? "Playing..." : "Play Card"}
                        </button>
                      </div>
                    </div>
                  )}
                </ActionPanel>
              </div>
            );
          })()}

          {/* Other Players - collapsible */}
          <OtherPlayersDisplay
            players={gameState.players}
            currentPlayerId={playerId}
            activePlayerId={activePlayerId}
            isExpanded={expandedInfo === "players"}
            onToggle={() => toggleInfoSection("players")}
          />

          {/* Bottom spacing for fixed bar */}
          <div className="h-64" />

          {/* Fixed Bottom Bar */}
          <div
            className="bg-slate-900 border-t border-slate-700"
            style={{
              position: 'fixed',
              bottom: 0,
              left: 0,
              right: 0,
              zIndex: 100,
              padding: '12px 16px',
              paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            }}
          >
            <div className="max-w-lg mx-auto flex items-center gap-3">
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to leave the room?")) {
                    window.location.href = "/";
                  }
                }}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 font-medium rounded-lg transition-colors text-sm"
              >
                Leave
              </button>
              {isMyTurn ? (
                <button
                  onClick={handleEndTurn}
                  disabled={isEndingTurn}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                >
                  {isEndingTurn ? "Ending..." : "End Turn"}
                </button>
              ) : (
                <div className="flex-1 text-center py-3 text-slate-500 text-sm">
                  Waiting for {gameState.players[activePlayerId ?? ""]?.name ?? "..."}
                </div>
              )}
            </div>
          </div>
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
