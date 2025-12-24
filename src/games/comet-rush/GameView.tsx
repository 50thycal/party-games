"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import type { GameViewProps } from "@/games/views";
import type {
  CometRushState,
  CometRushPlayerState,
  Rocket,
  GameCard,
  EngineeringCard,
  PoliticalCard,
  TurnMeta,
  CardDeckType,
} from "./config";
import { calculateScores } from "./config";

// New Mission Control Components
import { CometTrack } from "./components/board/CometTrack";
import { CardDecksDisplay } from "./components/board/CardDeckStack";
import { PlayerStatusGrid, CurrentPlayerStatus } from "./components/board/PlayerStatusGrid";
import { StrengthCardPanel } from "./components/board/StrengthCardPanel";
import { LEDCounter } from "./components/controls/LEDCounter";
import { MissionButton } from "./components/controls/MissionButton";
import { StatusLight } from "./components/controls/StatusLight";
import { DiceRoll, DiceResultBadge } from "./components/animations/DiceRoll";
import { CardDrawAnimation, GameCardDisplay } from "./components/animations/CardDrawAnimation";
import { RoundEndSequence, MovementCardReveal } from "./components/animations/RoundEndSequence";
import { RocketLaunchAnimation } from "./components/animations/RocketLaunchAnimation";
import { getDangerLevel } from "./theme/missionControl";
import { ActionLogDisplay, ActionLogCompact } from "./components/ActionLogDisplay";
import { PlayerAnalytics } from "./components/PlayerAnalytics";
import { calculatePlayerStats, calculateGameAnalytics } from "./actionLog";

// ============================================================================
// TURN WIZARD TYPES
// ============================================================================

type TurnWizardStep = "announce" | "showIncome" | "chooseDeck" | "showCard" | null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateRocketCost(buildTimeCost: number, power: number, accuracy: number): number {
  return power + accuracy + buildTimeCost;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// Mission Control Header
function MissionControlHeader({
  round,
  isMyTurn,
  activePlayerName,
}: {
  round: number;
  isMyTurn: boolean;
  activePlayerName: string;
}) {
  return (
    <div className="panel-retro p-3 mb-4">
      <div className="flex items-center justify-between">
        {/* Title and Round */}
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-sm font-bold text-mission-cream uppercase tracking-wider">
              Mission Control
            </h1>
            <span className="text-[10px] text-mission-steel">COMET DEFENSE INITIATIVE</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="label-embossed text-[10px]">ROUND</span>
            <LEDCounter value={round} digits={2} size="sm" color="green" />
          </div>
        </div>

        {/* Turn indicator */}
        <div className="flex items-center gap-3">
          <StatusLight
            status={isMyTurn ? "on" : "off"}
            pulse={isMyTurn}
            label={isMyTurn ? "YOUR TURN" : "STANDBY"}
          />
          {!isMyTurn && (
            <span className="text-xs text-mission-amber">
              {activePlayerName}&apos;s turn
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Build Rocket Form with retro styling
function BuildRocketForm({
  player,
  onBuild,
  isBuilding,
}: {
  player: CometRushPlayerState;
  onBuild: (buildTime: number, power: number, accuracy: number) => void;
  isBuilding: boolean;
}) {
  const [buildTime, setBuildTime] = useState(2);
  const [power, setPower] = useState(1);
  const [accuracy, setAccuracy] = useState(1);

  const cost = calculateRocketCost(buildTime, power, accuracy);
  const canAfford = player.resourceCubes >= cost;
  const activeRockets = player.rockets.filter(
    (r) => r.status === "ready" || r.status === "building"
  ).length;
  const maxRockets = player.maxConcurrentRockets + player.upgrades.maxRocketsBonus;
  const hasSlot = activeRockets < maxRockets;

  const maxPower = player.upgrades.powerCap;
  const maxAccuracy = player.upgrades.accuracyCap;

  const buildDelay =
    buildTime === 1 ? 2 : buildTime === 2 ? 1 : 0;

  return (
    <div className="space-y-4">
      {/* Build Time Cost */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="label-embossed text-[10px]">BUILD TIME COST</span>
          <span className="led-segment text-sm text-mission-amber">{buildTime}</span>
        </div>
        <input
          type="range"
          min={1}
          max={3}
          value={buildTime}
          onChange={(e) => setBuildTime(Number(e.target.value))}
          className="w-full accent-mission-amber"
        />
        <div className="text-[10px] text-mission-steel mt-1">
          {buildDelay === 0
            ? "Instant build"
            : `Ready in ${buildDelay} turn${buildDelay > 1 ? "s" : ""}`}
        </div>
      </div>

      {/* Power */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="label-embossed text-[10px]">POWER</span>
          <span className="led-segment text-sm text-mission-green">{power}</span>
        </div>
        <input
          type="range"
          min={1}
          max={maxPower}
          value={power}
          onChange={(e) => setPower(Number(e.target.value))}
          className="w-full accent-mission-green"
        />
        <div className="text-[10px] text-mission-steel mt-1">
          Damage dealt on hit (max: {maxPower})
        </div>
      </div>

      {/* Accuracy */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="label-embossed text-[10px]">ACCURACY</span>
          <span className="led-segment text-sm text-mission-green">{accuracy}</span>
        </div>
        <input
          type="range"
          min={1}
          max={maxAccuracy}
          value={accuracy}
          onChange={(e) => setAccuracy(Number(e.target.value))}
          className="w-full accent-mission-green"
        />
        <div className="text-[10px] text-mission-steel mt-1">
          Hit on roll ≤{accuracy} (max: {maxAccuracy})
        </div>
      </div>

      {/* Cost summary */}
      <div className="panel-retro p-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="label-embossed text-[10px]">COST</span>
          <span className={cn(
            "led-segment text-lg",
            canAfford ? "text-mission-amber" : "text-mission-red"
          )}>
            {cost}
          </span>
          <span className="text-[10px] text-mission-steel">CUBES</span>
        </div>
        <div className="text-[10px] text-mission-steel">
          {activeRockets}/{maxRockets} slots used
        </div>
      </div>

      <MissionButton
        onClick={() => onBuild(buildTime, power, accuracy)}
        disabled={!canAfford || !hasSlot || isBuilding}
        variant="success"
        size="lg"
        className="w-full"
        isLoading={isBuilding}
      >
        {isBuilding
          ? "Building..."
          : !hasSlot
            ? "No Slots Available"
            : !canAfford
              ? "Insufficient Cubes"
              : "Initiate Construction"}
      </MissionButton>
    </div>
  );
}

// Rocket Card with retro styling
function RocketCard({
  rocket,
  onLaunch,
  canLaunch,
  isLaunching,
}: {
  rocket: Rocket;
  onLaunch?: () => void;
  canLaunch: boolean;
  isLaunching: boolean;
}) {
  const isReady = rocket.status === "ready";
  const isBuilding = rocket.status === "building";

  return (
    <div
      className={cn(
        "panel-retro p-3",
        isReady && "border-mission-green",
        isBuilding && "border-mission-amber"
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xl">{isReady ? "🚀" : "🔧"}</span>
          <span
            className={cn(
              "text-xs font-bold uppercase",
              isReady && "text-mission-green",
              isBuilding && "text-mission-amber"
            )}
          >
            {isReady ? "LAUNCH READY" : `BUILDING (${rocket.buildTimeRemaining} turns)`}
          </span>
        </div>
        <StatusLight
          status={isReady ? "on" : "warning"}
          pulse={isBuilding}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 text-center mb-3">
        <div>
          <span className="label-embossed text-[8px] block">POWER</span>
          <span className="led-segment text-lg text-mission-green">{rocket.power}</span>
        </div>
        <div>
          <span className="label-embossed text-[8px] block">ACCURACY</span>
          <span className="led-segment text-lg text-mission-green">≤{rocket.accuracy}</span>
        </div>
      </div>

      {isReady && onLaunch && (
        <MissionButton
          onClick={onLaunch}
          disabled={!canLaunch || isLaunching}
          variant="danger"
          size="md"
          className="w-full"
          isLoading={isLaunching}
        >
          {isLaunching ? "Launching..." : "LAUNCH"}
        </MissionButton>
      )}
    </div>
  );
}

// Action Panel with retro accordion style
function ActionPanel({
  title,
  summary,
  isExpanded,
  onToggle,
  disabled,
  children,
  variant = "default",
}: {
  title: string;
  summary: string;
  isExpanded: boolean;
  onToggle: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  variant?: "default" | "build" | "launch" | "cards";
}) {
  const variantStyles = {
    default: "border-mission-steel",
    build: "border-emerald-700",
    launch: "border-rose-700",
    cards: "border-cyan-700",
  };

  return (
    <div
      className={cn(
        "panel-retro overflow-hidden transition-all",
        isExpanded && variantStyles[variant],
        disabled && "opacity-50"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-mission-panel-light/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <motion.span
            animate={{ rotate: isExpanded ? 90 : 0 }}
            className="text-mission-green text-sm"
          >
            ▶
          </motion.span>
          <span className="text-sm font-bold uppercase text-mission-cream">{title}</span>
        </div>
        <span className="text-xs text-mission-steel">{summary}</span>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-3 pb-3 border-t border-mission-steel-dark/50">
              <div className="pt-3">{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Turn Wizard with retro styling
function TurnWizard({
  step,
  turnMeta,
  player,
  isBeginningTurn,
  isDrawingCard,
  selectedDeck,
  onBeginTurn,
  onDrawCard,
  onDismiss,
}: {
  step: TurnWizardStep;
  turnMeta: TurnMeta | null;
  player: CometRushPlayerState;
  isBeginningTurn: boolean;
  isDrawingCard: boolean;
  selectedDeck: CardDeckType | null;
  onBeginTurn: () => void;
  onDrawCard: (deck: CardDeckType) => void;
  onDismiss: () => void;
}) {
  if (!step) return null;

  const drawnCard = turnMeta?.lastDrawnCardId
    ? player.hand.find((c) => c.id === turnMeta.lastDrawnCardId)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel-retro p-4 mb-4 border-mission-green"
    >
      {/* Step 1: Announce turn */}
      {step === "announce" && (
        <div className="text-center">
          <div className="text-2xl mb-2">⚡</div>
          <h3 className="text-lg font-bold text-mission-green mb-2">YOUR TURN</h3>
          <p className="text-sm text-mission-cream/80 mb-4">
            Collect income and draw a card to begin operations.
          </p>
          <MissionButton
            onClick={onBeginTurn}
            disabled={isBeginningTurn}
            variant="success"
            size="lg"
            className="w-full"
            isLoading={isBeginningTurn}
          >
            {isBeginningTurn ? "Initializing..." : "Begin Turn"}
          </MissionButton>
        </div>
      )}

      {/* Step 2+3: Show income and choose deck */}
      {(step === "showIncome" || step === "chooseDeck") && (
        <div>
          <div className="text-center mb-4">
            {turnMeta?.wasEmbargoed ? (
              <>
                <span className="label-embossed text-[10px] block mb-1 text-mission-red">EMBARGO IN EFFECT</span>
                <span className="led-segment text-4xl text-mission-red">
                  +0
                </span>
                <span className="text-sm text-mission-red block mt-1">
                  Income blocked by opponent!
                </span>
              </>
            ) : (
              <>
                <span className="label-embossed text-[10px] block mb-1">INCOME RECEIVED</span>
                <span className="led-segment text-4xl text-mission-amber">
                  +{turnMeta?.incomeGained ?? 0}
                </span>
                <span className="text-sm text-mission-steel block mt-1">cubes</span>
              </>
            )}
          </div>

          <div className="text-center mb-3">
            <span className="text-sm text-mission-cream">Select intelligence deck:</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MissionButton
              onClick={() => onDrawCard("engineering")}
              disabled={isDrawingCard}
              variant="success"
              size="lg"
              isLoading={isDrawingCard && selectedDeck === "engineering"}
            >
              Engineering
            </MissionButton>
            <MissionButton
              onClick={() => onDrawCard("political")}
              disabled={isDrawingCard}
              variant="danger"
              size="lg"
              isLoading={isDrawingCard && selectedDeck === "political"}
            >
              Political
            </MissionButton>
          </div>
        </div>
      )}

      {/* Step 4: Show drawn card */}
      {step === "showCard" && drawnCard && (
        <div className="text-center">
          <span className="label-embossed text-[10px] block mb-3">INTELLIGENCE ACQUIRED</span>

          <CardDrawAnimation
            card={drawnCard}
            deckType={drawnCard.deck}
          />

          <MissionButton
            onClick={onDismiss}
            variant="primary"
            size="lg"
            className="w-full mt-4"
          >
            Commence Operations
          </MissionButton>
        </div>
      )}
    </motion.div>
  );
}

// Launch Result Display with animation
function LaunchResultDisplay({
  result,
  playerName,
  onDismiss,
  onUseReroll,
  onDeclineReroll,
  isCurrentPlayer,
}: {
  result: {
    diceRoll: number;
    accuracyNeeded: number;
    hit: boolean;
    power: number;
    strengthBefore: number;
    destroyed: boolean;
    baseStrength: number;
    canReroll?: boolean;
    isReroll?: boolean;
  };
  playerName: string;
  onDismiss?: () => void;
  onUseReroll?: () => void;
  onDeclineReroll?: () => void;
  isCurrentPlayer?: boolean;
}) {
  const [showDice, setShowDice] = useState(true);

  return (
    <div className="mb-4">
      {showDice ? (
        <DiceRoll
          result={result.diceRoll}
          targetValue={result.accuracyNeeded}
          isSuccess={result.hit}
          onComplete={() => setShowDice(false)}
        />
      ) : (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={cn(
            "panel-retro p-4",
            result.destroyed && "border-mission-green",
            result.hit && !result.destroyed && "border-mission-amber",
            !result.hit && "border-mission-red"
          )}
        >
          <div className="text-center">
            <span className="label-embossed text-[10px] block mb-2">
              {playerName}&apos;s LAUNCH RESULT
              {result.isReroll && (
                <span className="ml-2 text-mission-amber">(REROLL)</span>
              )}
            </span>

            <DiceResultBadge
              result={result.diceRoll}
              targetValue={result.accuracyNeeded}
              isSuccess={result.hit}
            />

            <div className="mt-4">
              {result.destroyed ? (
                <div className="text-mission-green">
                  <span className="text-3xl block mb-1">💥</span>
                  <span className="led-segment text-xl">TARGET DESTROYED</span>
                  <span className="block text-sm mt-1">+{result.baseStrength} POINTS</span>
                </div>
              ) : result.hit ? (
                <div className="text-mission-amber">
                  <span className="text-3xl block mb-1">💫</span>
                  <span className="led-segment text-xl">TARGET HIT</span>
                  <span className="block text-sm mt-1">-{result.power} damage dealt</span>
                </div>
              ) : (
                <div className="text-mission-red">
                  <span className="text-3xl block mb-1">💨</span>
                  <span className="led-segment text-xl">TRAJECTORY MISS</span>

                  {/* Reroll option for current player */}
                  {result.canReroll && isCurrentPlayer && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="mt-4 pt-4 border-t border-mission-steel-dark"
                    >
                      <p className="text-sm text-mission-cream/80 mb-3">
                        You have a reroll token! Try again?
                      </p>
                      <div className="flex gap-2 justify-center">
                        <MissionButton
                          onClick={onUseReroll}
                          variant="success"
                          size="md"
                        >
                          Use Reroll
                        </MissionButton>
                        <MissionButton
                          onClick={onDeclineReroll}
                          variant="danger"
                          size="md"
                        >
                          Accept Miss
                        </MissionButton>
                      </div>
                    </motion.div>
                  )}

                  {/* Show other players that reroll is pending */}
                  {result.canReroll && !isCurrentPlayer && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-4 pt-4 border-t border-mission-steel-dark"
                    >
                      <p className="text-sm text-mission-amber animate-pulse">
                        Waiting for {playerName} to decide on reroll...
                      </p>
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// Card Result notification
function CardResultNotification({
  result,
  onDismiss,
}: {
  result: { cardName: string; description: string };
  onDismiss: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="panel-retro p-4 mb-4 border-mission-amber"
    >
      <div className="text-center">
        <span className="label-embossed text-[10px] block mb-2">CARD EFFECT</span>
        <h3 className="text-sm font-bold text-mission-amber mb-2">{result.cardName}</h3>
        <p className="text-sm text-mission-cream/80 mb-4">{result.description}</p>
        <MissionButton onClick={onDismiss} variant="warning" size="md" className="w-full">
          Acknowledge
        </MissionButton>
      </div>
    </motion.div>
  );
}

// Card with inline controls - auto-scrolls when expanded
function CardWithInlineControls({
  card,
  isSelected,
  isMyTurn,
  onSelect,
  cardRequirements,
  targetPlayerId,
  setTargetPlayerId,
  targetRocketId,
  setTargetRocketId,
  peekChoice,
  setPeekChoice,
  otherPlayers,
  gameState,
  player,
  canPlayCard,
  isPlayingCard,
  handlePlayCard,
  setSelectedCardId,
}: {
  card: GameCard;
  isSelected: boolean;
  isMyTurn: boolean;
  onSelect: () => void;
  cardRequirements: {
    needsTargetPlayer: boolean;
    needsTargetRocket: boolean;
    needsPeekChoice: boolean;
    needsOwnRocket: boolean;
  };
  targetPlayerId: string;
  setTargetPlayerId: (id: string) => void;
  targetRocketId: string;
  setTargetRocketId: (id: string) => void;
  peekChoice: "strength" | "movement" | null;
  setPeekChoice: (choice: "strength" | "movement" | null) => void;
  otherPlayers: Array<{ id: string; name: string; resourceCubes: number; hand: GameCard[] }>;
  gameState: CometRushState;
  player: CometRushPlayerState;
  canPlayCard: () => boolean;
  isPlayingCard: boolean;
  handlePlayCard: () => void;
  setSelectedCardId: (id: string | null) => void;
}) {
  const controlsRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to controls when card is selected
  useEffect(() => {
    if (isSelected && controlsRef.current) {
      // Small delay to let the animation start
      setTimeout(() => {
        controlsRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 100);
    }
  }, [isSelected]);

  return (
    <div>
      <GameCardDisplay
        card={card}
        isSelected={isSelected}
        onSelect={onSelect}
        disabled={!isMyTurn}
      />

      {/* Inline Play Controls - shown directly below selected card */}
      <AnimatePresence>
        {isMyTurn && isSelected && (
          <motion.div
            ref={controlsRef}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 ml-2 border-l-2 border-mission-green pl-3 py-2"
          >
            {/* Target Player Selection */}
            {cardRequirements.needsTargetPlayer && (
              <div className="mb-3">
                <span className="label-embossed text-[10px] block mb-1">TARGET PLAYER</span>
                <select
                  value={targetPlayerId}
                  onChange={(e) => {
                    setTargetPlayerId(e.target.value);
                    setTargetRocketId("");
                  }}
                  className="w-full bg-mission-dark border border-mission-steel rounded p-2 text-sm text-mission-cream"
                >
                  <option value="">Select target...</option>
                  {otherPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.resourceCubes} cubes, {p.hand.length} cards)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Target Rocket Selection */}
            {cardRequirements.needsTargetRocket && targetPlayerId && (
              <div className="mb-3">
                <span className="label-embossed text-[10px] block mb-1">TARGET ROCKET</span>
                <select
                  value={targetRocketId}
                  onChange={(e) => setTargetRocketId(e.target.value)}
                  className="w-full bg-mission-dark border border-mission-steel rounded p-2 text-sm text-mission-cream"
                >
                  <option value="">Select rocket...</option>
                  {gameState.players[targetPlayerId]?.rockets
                    .filter((r) => r.status === "building")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        Power {r.power}, Acc {r.accuracy} ({r.buildTimeRemaining} turns)
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Own Rocket Selection */}
            {cardRequirements.needsOwnRocket && (
              <div className="mb-3">
                <span className="label-embossed text-[10px] block mb-1">YOUR ROCKET</span>
                <select
                  value={targetRocketId}
                  onChange={(e) => setTargetRocketId(e.target.value)}
                  className="w-full bg-mission-dark border border-mission-steel rounded p-2 text-sm text-mission-cream"
                >
                  <option value="">Select rocket...</option>
                  {player.rockets
                    .filter((r) => r.status === "building")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        Power {r.power}, Acc {r.accuracy} ({r.buildTimeRemaining} turns)
                      </option>
                    ))}
                </select>
                {player.rockets.filter((r) => r.status === "building").length === 0 && (
                  <p className="text-xs text-mission-amber mt-1">No rockets building.</p>
                )}
              </div>
            )}

            {/* Peek Choice */}
            {cardRequirements.needsPeekChoice && (
              <div className="mb-3">
                <span className="label-embossed text-[10px] block mb-2">INTEL TYPE</span>
                <div className="flex gap-2">
                  <MissionButton
                    onClick={() => setPeekChoice("strength")}
                    variant={peekChoice === "strength" ? "warning" : "primary"}
                    size="sm"
                    className="flex-1"
                  >
                    Strength
                  </MissionButton>
                  <MissionButton
                    onClick={() => setPeekChoice("movement")}
                    variant={peekChoice === "movement" ? "success" : "primary"}
                    size="sm"
                    className="flex-1"
                  >
                    Movement
                  </MissionButton>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <MissionButton
                onClick={() => {
                  setSelectedCardId(null);
                  setTargetPlayerId("");
                  setTargetRocketId("");
                  setPeekChoice(null);
                }}
                variant="primary"
                size="sm"
                className="flex-1"
              >
                Cancel
              </MissionButton>
              <MissionButton
                onClick={handlePlayCard}
                disabled={!canPlayCard() || isPlayingCard}
                variant="success"
                size="sm"
                className="flex-1"
                isLoading={isPlayingCard}
              >
                {isPlayingCard ? "Playing..." : "Execute"}
              </MissionButton>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Game Over Screen with retro styling
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
  const isWinner = state.winnerIds?.includes(playerId);
  const earthDestroyed = state.earthDestroyed;

  // Calculate analytics
  const analytics = calculateGameAnalytics(
    state.actionLog,
    state,
    scores,
    state.winnerIds,
    state.gameStartTime
  );

  return (
    <div>
      {/* Outcome Header */}
      <div className="text-center mb-6">
        {earthDestroyed ? (
          <>
            <span className="text-5xl block mb-2">🌍💥</span>
            <h2 className="text-2xl font-bold text-mission-red">MISSION FAILED</h2>
            <p className="text-mission-cream/70 mt-2">Earth has been destroyed by the comet.</p>
          </>
        ) : state.cometDestroyed ? (
          <>
            <span className="text-5xl block mb-2">☄️💥</span>
            <h2 className="text-2xl font-bold text-mission-green">COMET DESTROYED</h2>
            <p className="text-mission-cream/70 mt-2">Humanity is saved!</p>
          </>
        ) : null}
      </div>

      {isWinner && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="mb-6 text-center"
        >
          <span className="text-4xl">🏆</span>
          <p className="text-mission-amber font-bold mt-2">YOU WIN!</p>
        </motion.div>
      )}

      {/* Player Analytics and Stats */}
      <PlayerAnalytics analytics={analytics} className="mb-6" />

      {/* Action Log */}
      <div className="mb-6">
        <ActionLogDisplay
          actionLog={state.actionLog}
          playerCount={state.playerOrder.length}
          maxHeight="300px"
        />
      </div>

      {/* Play Again Button */}
      {isHost && (
        <MissionButton
          onClick={onPlayAgain}
          disabled={isPlayingAgain}
          variant="success"
          size="lg"
          className="w-full"
          isLoading={isPlayingAgain}
        >
          {isPlayingAgain ? "Restarting..." : "New Mission"}
        </MissionButton>
      )}

      {!isHost && (
        <p className="text-mission-steel text-sm text-center">Waiting for host to start new mission...</p>
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
  // Action states
  const [isStarting, setIsStarting] = useState(false);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isEndingTurn, setIsEndingTurn] = useState(false);
  const [isPlayingCard, setIsPlayingCard] = useState(false);
  const [isPlayingAgain, setIsPlayingAgain] = useState(false);

  // Card selection state
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [targetPlayerId, setTargetPlayerId] = useState<string>("");
  const [targetRocketId, setTargetRocketId] = useState<string>("");
  const [peekChoice, setPeekChoice] = useState<"strength" | "movement" | null>(null);

  // UI state
  const [expandedAction, setExpandedAction] = useState<"build" | "launch" | "cards" | null>(null);

  // Turn wizard state
  const [turnWizardStep, setTurnWizardStep] = useState<TurnWizardStep>(null);
  const [isBeginningTurn, setIsBeginningTurn] = useState(false);
  const [isDrawingCard, setIsDrawingCard] = useState(false);
  const [selectedDeck, setSelectedDeck] = useState<CardDeckType | null>(null);
  const prevTurnMetaRef = useRef<TurnMeta | null>(null);

  // Round end animation state
  const [showRoundEnd, setShowRoundEnd] = useState(false);
  const [roundEndData, setRoundEndData] = useState<{
    movementCard: { id: string; moveSpaces: 1 | 2 | 3 };
    newDistance: number;
    previousDistance: number;
    round: number;
  } | null>(null);
  const prevRoundRef = useRef<number>(0);
  const prevDistanceRef = useRef<number>(18);

  // Track launch animation completion for trophy display timing
  const [launchAnimationComplete, setLaunchAnimationComplete] = useState(false);
  const prevLaunchResultRef = useRef<string | null>(null);

  // Memoized callback to prevent animation re-renders
  const handleLaunchAnimationComplete = useCallback(() => {
    setLaunchAnimationComplete(true);
  }, []);

  // Game state
  const gameState = state as CometRushState;
  const phase = gameState?.phase ?? "lobby";
  const player = gameState?.players?.[playerId];
  const activePlayerId = gameState?.playerOrder?.[gameState?.activePlayerIndex ?? 0] ?? null;
  const isMyTurn = playerId === activePlayerId;
  const turnMeta = gameState?.turnMeta ?? null;

  // Detect round changes for animation
  useEffect(() => {
    if (phase !== "playing" || !gameState) return;

    const currentRound = gameState.round;
    const currentDistance = gameState.distanceToImpact;

    // Check if round advanced and movement card was drawn
    if (
      currentRound > prevRoundRef.current &&
      gameState.lastMovementCard &&
      currentDistance < prevDistanceRef.current
    ) {
      setRoundEndData({
        movementCard: gameState.lastMovementCard,
        newDistance: currentDistance,
        previousDistance: prevDistanceRef.current,
        round: prevRoundRef.current,
      });
      setShowRoundEnd(true);
    }

    prevRoundRef.current = currentRound;
    prevDistanceRef.current = currentDistance;
  }, [phase, gameState?.round, gameState?.distanceToImpact, gameState?.lastMovementCard, gameState]);

  // Detect turn start for wizard
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

  // Reset launch animation state when a new launch result comes in
  useEffect(() => {
    const currentKey = gameState?.lastLaunchResult
      ? `${gameState.lastLaunchResult.rocketId}-${gameState.lastLaunchResult.diceRoll}-${gameState.lastLaunchResult.isReroll}`
      : null;

    if (currentKey !== prevLaunchResultRef.current) {
      // New launch result - reset animation complete state
      setLaunchAnimationComplete(false);
      prevLaunchResultRef.current = currentKey;
    }
  }, [gameState?.lastLaunchResult]);

  // Action handlers
  async function handleStartGame() {
    setIsStarting(true);
    try {
      await dispatchAction("START_GAME");
    } finally {
      setIsStarting(false);
    }
  }

  async function handleBeginTurn() {
    setIsBeginningTurn(true);
    try {
      await dispatchAction("BEGIN_TURN");
      setTurnWizardStep("showIncome");
    } finally {
      setIsBeginningTurn(false);
    }
  }

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

  async function handleClearCardResult() {
    await dispatchAction("CLEAR_CARD_RESULT");
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

  async function handleUseReroll() {
    await dispatchAction("USE_REROLL");
  }

  async function handleDeclineReroll() {
    await dispatchAction("DECLINE_REROLL");
  }

  async function handleForcedReroll() {
    await dispatchAction("FORCED_REROLL");
  }

  async function handleEndTurn() {
    // Check if player hasn't collected income or drawn a card yet
    if (turnWizardStep !== null) {
      const confirmed = confirm(
        "Are you sure you want to end your turn? You have not collected income or drawn a card yet."
      );
      if (!confirmed) return;
      // Dismiss wizard since they're ending early
      setTurnWizardStep(null);
    }

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

  // Determine targeting requirements for selected card
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

  const canPlayCard = () => {
    if (!selectedCard) return false;
    if (cardRequirements.needsTargetPlayer && !targetPlayerId) return false;
    if (cardRequirements.needsTargetRocket && !targetRocketId) return false;
    if (cardRequirements.needsPeekChoice && !peekChoice) return false;
    if (cardRequirements.needsOwnRocket && !targetRocketId) return false;
    return true;
  };

  const otherPlayers = Object.values(gameState?.players ?? {}).filter((p) => p.id !== playerId);

  // Prepare player info for status grid
  const allPlayersInfo = Object.values(gameState?.players ?? {}).map((p) => ({
    id: p.id,
    name: p.name,
    resourceCubes: p.resourceCubes,
    rockets: p.rockets.map((r) => ({
      id: r.id,
      status: r.status,
      power: r.power,
      accuracy: r.accuracy,
      buildTimeRemaining: r.buildTimeRemaining,
    })),
    isActive: p.id === activePlayerId,
    isCurrentUser: p.id === playerId,
  }));

  return (
    <div className="min-h-screen bg-mission-dark">
      {/* Round End Animation Overlay */}
      <AnimatePresence>
        {showRoundEnd && roundEndData && (
          <RoundEndSequence
            movementCard={roundEndData.movementCard}
            newDistance={roundEndData.newDistance}
            previousDistance={roundEndData.previousDistance}
            round={roundEndData.round}
            onComplete={() => setShowRoundEnd(false)}
          />
        )}
      </AnimatePresence>

      <div className="max-w-2xl mx-auto px-4 py-4 pb-24">
        {/* LOBBY PHASE */}
        {phase === "lobby" && (
          <div className="panel-retro p-6">
            <div className="text-center mb-6">
              <span className="text-4xl block mb-2">☄️</span>
              <h1 className="text-2xl font-bold text-mission-cream">COMET RUSH</h1>
              <p className="text-mission-steel mt-2">
                Build rockets, research upgrades, and destroy the comet before it hits Earth!
              </p>
            </div>

            <div className="panel-retro p-3 mb-4">
              <div className="flex items-center justify-between">
                <span className="label-embossed text-[10px]">CREW ASSEMBLED</span>
                <span className="led-segment text-xl text-mission-green">
                  {room.players.length}/4
                </span>
              </div>
            </div>

            {isHost ? (
              <MissionButton
                onClick={handleStartGame}
                disabled={isStarting || room.players.length < 2}
                variant="success"
                size="lg"
                className="w-full"
                isLoading={isStarting}
              >
                {isStarting
                  ? "Launching..."
                  : room.players.length < 2
                    ? "Need 2+ Crew"
                    : "Launch Mission"}
              </MissionButton>
            ) : (
              <div className="text-center text-mission-steel">
                Awaiting mission commander authorization...
              </div>
            )}
          </div>
        )}

        {/* PLAYING PHASE */}
        {phase === "playing" && gameState && player && (
          <>
            {/* Mission Control Header */}
            <MissionControlHeader
              round={gameState.round}
              isMyTurn={isMyTurn}
              activePlayerName={gameState.players[activePlayerId ?? ""]?.name ?? "..."}
            />

            {/* Shared Board - Comet Track */}
            <CometTrack
              distanceToImpact={gameState.distanceToImpact}
              lastMovement={gameState.lastMovementCard?.moveSpaces}
              className="mb-4"
            />

            {/* Shared Board - Strength Card Panel */}
            <StrengthCardPanel
              activeCard={gameState.activeStrengthCard}
              cardsRemaining={gameState.strengthDeck.length}
              totalCards={gameState.totalStrengthCards}
              className="mb-4"
            />

            {/* Shared Board - Card Decks */}
            <CardDecksDisplay
              movementCount={gameState.movementDeck.length}
              strengthCount={gameState.strengthDeck.length}
              engineeringCount={gameState.engineeringDeck.length}
              politicalCount={gameState.politicalDeck.length}
              movementDiscardCount={gameState.movementDiscard.length}
              engineeringDiscardCount={gameState.engineeringDiscard.length}
              politicalDiscardCount={gameState.politicalDiscard.length}
              drawableDeck={turnWizardStep === "showIncome" || turnWizardStep === "chooseDeck" ? undefined : undefined}
              className="mb-4"
            />

            {/* Shared Board - Player Status Grid */}
            <PlayerStatusGrid players={allPlayersInfo} className="mb-4" />

            {/* Card Result Notification */}
            {gameState.lastCardResult &&
              gameState.lastCardResult.playerId === playerId && (
                <CardResultNotification
                  result={gameState.lastCardResult}
                  onDismiss={handleClearCardResult}
                />
              )}

            {/* Turn Wizard */}
            {isMyTurn && turnWizardStep && (
              <TurnWizard
                step={turnWizardStep}
                turnMeta={turnMeta}
                player={player}
                isBeginningTurn={isBeginningTurn}
                isDrawingCard={isDrawingCard}
                selectedDeck={selectedDeck}
                onBeginTurn={handleBeginTurn}
                onDrawCard={handleDrawCard}
                onDismiss={dismissWizard}
              />
            )}

            {/* Launch Result with Animation */}
            {gameState.lastLaunchResult && (
              <RocketLaunchAnimation
                key={`${gameState.lastLaunchResult.rocketId}-${gameState.lastLaunchResult.diceRoll}-${gameState.lastLaunchResult.isReroll}-${gameState.lastLaunchResult.mustReroll}`}
                diceRoll={gameState.lastLaunchResult.diceRoll}
                accuracyNeeded={gameState.lastLaunchResult.accuracyNeeded}
                isHit={gameState.lastLaunchResult.hit}
                power={gameState.lastLaunchResult.power}
                destroyed={gameState.lastLaunchResult.destroyed}
                baseStrength={gameState.lastLaunchResult.baseStrength}
                playerName={
                  gameState.players[gameState.lastLaunchResult.playerId]?.name ?? "Unknown"
                }
                isReroll={gameState.lastLaunchResult.isReroll}
                isSabotaged={gameState.lastLaunchResult.mustReroll}
                canReroll={gameState.lastLaunchResult.canReroll}
                mustReroll={gameState.lastLaunchResult.mustReroll}
                isCurrentPlayer={gameState.lastLaunchResult.playerId === playerId}
                onUseReroll={handleUseReroll}
                onDeclineReroll={handleDeclineReroll}
                onMustReroll={handleForcedReroll}
                onComplete={handleLaunchAnimationComplete}
              />
            )}

            {/* Your Console - Status */}
            <CurrentPlayerStatus
              player={{
                id: player.id,
                name: player.name,
                resourceCubes: player.resourceCubes,
                rockets: player.rockets.map((r) => ({
                  id: r.id,
                  status: r.status,
                  power: r.power,
                  accuracy: r.accuracy,
                  buildTimeRemaining: r.buildTimeRemaining,
                })),
                isActive: isMyTurn,
                isCurrentUser: true,
              }}
              income={player.baseIncome + player.upgrades.incomeBonus}
              className="mb-4"
            />

            {/* Secret Intel (if any) */}
            {(player.peekedMovementCard || player.peekedStrengthCard) && (
              <div className="panel-retro p-3 mb-4 border-cyan-700">
                <span className="label-embossed text-[10px] block mb-2">SECRET INTEL</span>
                <div className="space-y-1">
                  {player.peekedMovementCard && (
                    <div className="text-sm">
                      <span className="text-mission-steel">Next Movement:</span>{" "}
                      <span className="led-segment text-mission-green">
                        -{player.peekedMovementCard.moveSpaces}
                      </span>
                    </div>
                  )}
                  {player.peekedStrengthCard && (
                    <div className="text-sm">
                      <span className="text-mission-steel">Next Strength:</span>{" "}
                      <span className="led-segment text-mission-amber">
                        {player.peekedStrengthCard.baseStrength}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Upgrades Display */}
            {(player.upgrades.incomeBonus > 0 ||
              player.upgrades.salvageBonus > 0 ||
              player.upgrades.powerCap > 3 ||
              player.upgrades.accuracyCap > 3 ||
              player.hasRerollToken) && (
              <div className="panel-retro p-3 mb-4">
                <span className="label-embossed text-[10px] block mb-2">ACTIVE UPGRADES</span>
                <div className="flex flex-wrap gap-2">
                  {player.upgrades.incomeBonus > 0 && (
                    <span className="px-2 py-1 bg-mission-amber/20 border border-mission-amber/50 rounded text-xs text-mission-amber">
                      +{player.upgrades.incomeBonus} Income
                    </span>
                  )}
                  {player.upgrades.salvageBonus > 0 && (
                    <span className="px-2 py-1 bg-mission-green/20 border border-mission-green/50 rounded text-xs text-mission-green">
                      +{player.upgrades.salvageBonus} Salvage
                    </span>
                  )}
                  {player.upgrades.powerCap > 3 && (
                    <span className="px-2 py-1 bg-mission-green/20 border border-mission-green/50 rounded text-xs text-mission-green">
                      Power Cap: {player.upgrades.powerCap}
                    </span>
                  )}
                  {player.upgrades.accuracyCap > 3 && (
                    <span className="px-2 py-1 bg-mission-green/20 border border-mission-green/50 rounded text-xs text-mission-green">
                      Accuracy Cap: {player.upgrades.accuracyCap}
                    </span>
                  )}
                  {player.hasRerollToken && (
                    <span className="px-2 py-1 bg-cyan-900/50 border border-cyan-600/50 rounded text-xs text-cyan-300">
                      Re-roll Token
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Trophies Display */}
            {(() => {
              // Hide newly earned trophy while launch animation is still playing
              const isAnimatingDestroy =
                gameState.lastLaunchResult?.destroyed &&
                gameState.lastLaunchResult?.playerId === playerId &&
                !launchAnimationComplete;

              // If animation is still playing, hide the most recently earned trophy
              const displayTrophies = isAnimatingDestroy
                ? player.trophies.slice(0, -1)
                : player.trophies;

              const displayPoints = displayTrophies.reduce((sum, t) => sum + t.baseStrength, 0);

              if (displayTrophies.length === 0) return null;

              return (
                <div className="panel-retro p-3 mb-4 border-purple-700">
                  <span className="label-embossed text-[10px] block mb-2">
                    TROPHIES ({displayPoints} pts)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {displayTrophies.map((trophy) => (
                      <span
                        key={trophy.id}
                        className="px-2 py-1 bg-purple-900/50 border border-purple-600/50 rounded text-xs text-purple-300"
                      >
                        STR {trophy.baseStrength}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Action Panels */}
            <div className="space-y-2 mb-4">
              {/* Build Rocket */}
              <ActionPanel
                title="Build Rocket"
                summary={`${player.rockets.filter((r) => r.status === "ready" || r.status === "building").length}/${player.maxConcurrentRockets + player.upgrades.maxRocketsBonus} slots`}
                isExpanded={expandedAction === "build"}
                onToggle={() => setExpandedAction(expandedAction === "build" ? null : "build")}
                disabled={!isMyTurn}
                variant="build"
              >
                <BuildRocketForm
                  player={player}
                  onBuild={handleBuildRocket}
                  isBuilding={isBuilding}
                />
              </ActionPanel>

              {/* Launch Rocket */}
              <ActionPanel
                title="Launch Rocket"
                summary={
                  player.rockets.filter((r) => r.status === "ready").length > 0
                    ? `${player.rockets.filter((r) => r.status === "ready").length} ready`
                    : player.rockets.filter((r) => r.status === "building").length > 0
                      ? `${player.rockets.filter((r) => r.status === "building").length} building`
                      : "none"
                }
                isExpanded={expandedAction === "launch"}
                onToggle={() => setExpandedAction(expandedAction === "launch" ? null : "launch")}
                disabled={!isMyTurn && player.rockets.filter((r) => r.status === "ready").length === 0}
                variant="launch"
              >
                {player.rockets.filter((r) => r.status !== "spent").length === 0 ? (
                  <p className="text-sm text-mission-steel">No rockets. Build one first!</p>
                ) : (
                  <div className="space-y-2">
                    {player.rockets
                      .filter((r) => r.status !== "spent")
                      .map((rocket) => (
                        <RocketCard
                          key={rocket.id}
                          rocket={rocket}
                          onLaunch={isMyTurn ? () => handleLaunchRocket(rocket.id) : undefined}
                          canLaunch={isMyTurn}
                          isLaunching={isLaunching}
                        />
                      ))}
                  </div>
                )}
              </ActionPanel>

              {/* Play Card */}
              <ActionPanel
                title="Play Card"
                summary={`${player.hand.length} cards`}
                isExpanded={expandedAction === "cards"}
                onToggle={() => {
                  setExpandedAction(expandedAction === "cards" ? null : "cards");
                  if (expandedAction === "cards") {
                    setSelectedCardId(null);
                    setTargetPlayerId("");
                    setTargetRocketId("");
                    setPeekChoice(null);
                  }
                }}
                disabled={!isMyTurn && player.hand.length === 0}
                variant="cards"
              >
                {player.hand.length === 0 ? (
                  <p className="text-sm text-mission-steel">No cards in hand.</p>
                ) : (
                  <div className="space-y-2">
                    {player.hand.map((card) => {
                      const isSelected = selectedCardId === card.id;
                      return (
                        <CardWithInlineControls
                          key={card.id}
                          card={card}
                          isSelected={isSelected}
                          isMyTurn={isMyTurn}
                          onSelect={() => {
                            if (isMyTurn) toggleCardSelection(card.id);
                          }}
                          cardRequirements={cardRequirements}
                          targetPlayerId={targetPlayerId}
                          setTargetPlayerId={setTargetPlayerId}
                          targetRocketId={targetRocketId}
                          setTargetRocketId={setTargetRocketId}
                          peekChoice={peekChoice}
                          setPeekChoice={setPeekChoice}
                          otherPlayers={otherPlayers}
                          gameState={gameState}
                          player={player}
                          canPlayCard={canPlayCard}
                          isPlayingCard={isPlayingCard}
                          handlePlayCard={handlePlayCard}
                          setSelectedCardId={setSelectedCardId}
                        />
                      );
                    })}
                  </div>
                )}
              </ActionPanel>
            </div>

            {/* Host-only Action Log (during gameplay) */}
            {isHost && gameState.actionLog.length > 0 && (
              <ActionLogCompact
                actionLog={gameState.actionLog}
                playerCount={gameState.playerOrder.length}
                isHost={isHost}
                className="mb-4"
              />
            )}
          </>
        )}

        {/* GAME OVER PHASE */}
        {phase === "gameOver" && gameState && (
          <div className="panel-retro p-6">
            <GameOverScreen
              state={gameState}
              room={room}
              playerId={playerId}
              isHost={isHost}
              onPlayAgain={handlePlayAgain}
              isPlayingAgain={isPlayingAgain}
            />
          </div>
        )}
      </div>

      {/* Fixed Bottom Bar */}
      {phase === "playing" && (
        <div
          className="bg-mission-panel border-t-2 border-mission-steel"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            padding: "12px 16px",
            paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          }}
        >
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <MissionButton
              onClick={() => {
                if (confirm("Abandon mission? Are you sure?")) {
                  window.location.href = "/";
                }
              }}
              variant="primary"
              size="sm"
            >
              Leave
            </MissionButton>

            {isMyTurn ? (
              <MissionButton
                onClick={handleEndTurn}
                disabled={isEndingTurn}
                variant="success"
                size="lg"
                className="flex-1"
                isLoading={isEndingTurn}
              >
                {isEndingTurn ? "Ending..." : "End Turn"}
              </MissionButton>
            ) : (
              <div className="flex-1 text-center py-3 text-mission-steel text-sm">
                Awaiting {gameState?.players[activePlayerId ?? ""]?.name ?? "..."}...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
