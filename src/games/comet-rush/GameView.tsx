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
  EspionageCard,
  EconomicCard,
  TurnMeta,
  CardDeckType,
  PendingDiplomaticPressure,
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
import { TurnAnnouncementOverlay } from "./components/animations/TurnAnnouncementOverlay";
import { GameOutcomeSequence } from "./components/animations/GameOutcomeSequence";
import { CardPlayEffect } from "./components/animations/CardPlayEffect";
import { getDangerLevel } from "./theme/missionControl";
import { ActionLogDisplay, ActionLogCompact } from "./components/ActionLogDisplay";
import { PlayerAnalytics } from "./components/PlayerAnalytics";
import { calculatePlayerStats, calculateGameAnalytics } from "./actionLog";
import { Tutorial, TutorialButton } from "./components/Tutorial";
import { LiveActionFeed, ActionNotification, TargetedNotification, checkIfTargeted } from "./components/LiveActionFeed";
import { LiveStatsDashboard } from "./components/LiveStatsDashboard";
import { EmojiReactionsCompact } from "./components/EmojiReactions";

// ============================================================================
// TURN WIZARD TYPES
// ============================================================================

type TurnWizardStep = "announce" | "showIncome" | "chooseDeck" | "showCard" | "draft" | null;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateRocketCost(buildTimeCost: number, power: number, accuracy: number): number {
  // Build Time Cost: BTC 1 = 1 cube, BTC 2 = 2 cubes, BTC 3 = 5 cubes (instant)
  const buildTimeCubeCost = buildTimeCost === 3 ? 5 : buildTimeCost === 2 ? 2 : 1;
  return power + accuracy + buildTimeCubeCost;
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
    <motion.div
      className="panel-retro p-3 mb-4 relative overflow-hidden"
      animate={{
        opacity: [1, 0.98, 1, 0.97, 1],
      }}
      transition={{
        duration: 8,
        repeat: Infinity,
        ease: "linear",
        times: [0, 0.4, 0.41, 0.8, 1],
      }}
    >
      {/* Ambient console glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        animate={{
          background: [
            "radial-gradient(ellipse at 20% 50%, rgba(51,255,51,0.03) 0%, transparent 50%)",
            "radial-gradient(ellipse at 80% 50%, rgba(51,255,51,0.03) 0%, transparent 50%)",
            "radial-gradient(ellipse at 20% 50%, rgba(51,255,51,0.03) 0%, transparent 50%)",
          ],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <div className="flex items-center justify-between relative">
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
    </motion.div>
  );
}

// Build Rocket Form with retro styling
function BuildRocketForm({
  player,
  onBuild,
  isBuilding,
  isMyTurn,
  showSuccess,
}: {
  player: CometRushPlayerState;
  onBuild: (buildTime: number, power: number, accuracy: number) => void;
  isBuilding: boolean;
  isMyTurn: boolean;
  showSuccess?: boolean;
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
    <div className="space-y-4 relative">
      {/* Success Animation Overlay */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 z-10 flex items-center justify-center bg-mission-dark/90 rounded"
          >
            <div className="text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: [0, 1.2, 1] }}
                transition={{ duration: 0.4 }}
                className="text-5xl mb-2"
              >
                🔧
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-mission-green font-bold text-lg"
              >
                CONSTRUCTION STARTED!
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-mission-steel text-xs mt-1"
              >
                Rocket queued for assembly
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Build Time Cost */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="label-embossed text-[10px]">BUILD TIME</span>
          <span className="led-segment text-sm text-mission-amber">
            {buildTime === 3 ? "5" : buildTime === 2 ? "2" : "1"} cubes
          </span>
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
            ? "⚡ Instant (5 cubes)"
            : buildDelay === 1
            ? "Ready in 1 turn (2 cubes)"
            : "Ready in 2 turns (1 cube)"}
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
        disabled={!canAfford || !hasSlot || isBuilding || !isMyTurn}
        variant="success"
        size="lg"
        className="w-full text-lg font-bold"
        isLoading={isBuilding}
      >
        {isBuilding
          ? "Building..."
          : !isMyTurn
            ? "Wait for Your Turn"
            : !hasSlot
              ? "No Slots Available"
              : !canAfford
                ? "Insufficient Cubes"
                : "🔧 BUILD ROCKET"}
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
    <motion.div
      className={cn(
        "panel-retro p-3 relative overflow-hidden",
        isReady && "border-mission-green",
        isBuilding && "border-mission-amber"
      )}
      animate={isReady ? {
        boxShadow: [
          "0 0 0px rgba(51,255,51,0)",
          "0 0 15px rgba(51,255,51,0.4)",
          "0 0 0px rgba(51,255,51,0)",
        ],
      } : {}}
      transition={isReady ? { duration: 2, repeat: Infinity, ease: "easeInOut" } : {}}
    >
      {/* Ready state glow effect */}
      {isReady && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{
            background: [
              "radial-gradient(ellipse at center, rgba(51,255,51,0) 0%, transparent 70%)",
              "radial-gradient(ellipse at center, rgba(51,255,51,0.15) 0%, transparent 70%)",
              "radial-gradient(ellipse at center, rgba(51,255,51,0) 0%, transparent 70%)",
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      )}

      <div className="flex items-center justify-between mb-2 relative">
        <div className="flex items-center gap-2">
          <motion.span
            className="text-xl"
            animate={isReady ? { scale: [1, 1.1, 1], rotate: [0, -5, 5, 0] } : {}}
            transition={isReady ? { duration: 1.5, repeat: Infinity } : {}}
          >
            {isReady ? "🚀" : "🔧"}
          </motion.span>
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
          pulse={isBuilding || isReady}
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
          size="lg"
          className="w-full text-lg font-bold relative"
          isLoading={isLaunching}
        >
          {isLaunching ? "Launching..." : "🚀 LAUNCH"}
        </MissionButton>
      )}
    </motion.div>
  );
}

// Action Panel with retro accordion style - Primary interaction areas
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
  const variantConfig = {
    default: { border: "border-mission-steel", bg: "", icon: "▶", iconColor: "text-mission-green" },
    build: { border: "border-emerald-600", bg: "bg-emerald-950/30", icon: "🔧", iconColor: "text-emerald-400" },
    launch: { border: "border-rose-600", bg: "bg-rose-950/30", icon: "🚀", iconColor: "text-rose-400" },
    cards: { border: "border-cyan-600", bg: "bg-cyan-950/30", icon: "🃏", iconColor: "text-cyan-400" },
  };

  const config = variantConfig[variant];

  return (
    <div
      className={cn(
        "panel-retro overflow-hidden transition-all border-2",
        isExpanded ? config.border : "border-mission-steel-dark",
        isExpanded && config.bg,
        disabled && "opacity-50"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          "w-full px-4 py-3 flex items-center justify-between text-left transition-all",
          "hover:bg-mission-panel-light/50",
          isExpanded && config.bg
        )}
      >
        <div className="flex items-center gap-3">
          <motion.span
            animate={{ scale: isExpanded ? 1.1 : 1 }}
            className={cn("text-2xl", config.iconColor)}
          >
            {config.icon}
          </motion.span>
          <span className="text-base font-bold uppercase text-mission-cream tracking-wide">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-mission-steel">{summary}</span>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            className="text-mission-green text-lg"
          >
            ▼
          </motion.span>
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="px-4 pb-4 border-t border-mission-steel-dark/50">
              <div className="pt-4">{children}</div>
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
  distanceToImpact,
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
  distanceToImpact: number;
  isBeginningTurn: boolean;
  isDrawingCard: boolean;
  selectedDeck: CardDeckType | null;
  onBeginTurn: () => void;
  onDrawCard: (deck: CardDeckType) => void;
  onDismiss: () => void;
}) {
  if (!step) return null;

  // Find the drawn card - either from turnMeta or the last card in hand (for initial draft)
  const drawnCard = turnMeta?.lastDrawnCardId
    ? player.hand.find((c) => c.id === turnMeta.lastDrawnCardId)
    : player.hand.length > 0 ? player.hand[player.hand.length - 1] : null;

  // Late game: can draw 2 cards when comet ≤9 from Earth
  const maxDraws = distanceToImpact <= 9 ? 2 : 1;
  const cardsDrawn = turnMeta?.cardsDrawnThisTurn ?? 0;

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
            <span className="text-sm text-mission-cream">
              Select intelligence deck
              {maxDraws > 1 && (
                <span className="text-mission-amber ml-1">
                  (Draw {cardsDrawn + 1}/{maxDraws})
                </span>
              )}
              :
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <MissionButton
              onClick={() => onDrawCard("engineering")}
              disabled={isDrawingCard}
              variant="success"
              size="sm"
              isLoading={isDrawingCard && selectedDeck === "engineering"}
            >
              <span className="text-[9px] sm:text-xs">Engineering</span>
            </MissionButton>
            <MissionButton
              onClick={() => onDrawCard("espionage")}
              disabled={isDrawingCard}
              variant="danger"
              size="sm"
              isLoading={isDrawingCard && selectedDeck === "espionage"}
            >
              <span className="text-[9px] sm:text-xs">Espionage</span>
            </MissionButton>
            <MissionButton
              onClick={() => onDrawCard("economic")}
              disabled={isDrawingCard}
              variant="warning"
              size="sm"
              isLoading={isDrawingCard && selectedDeck === "economic"}
            >
              <span className="text-[9px] sm:text-xs">Economic</span>
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
            {player.initialCardsDrawn < 4
              ? `Continue Drafting (${player.initialCardsDrawn}/4)`
              : "Commence Operations"}
          </MissionButton>
        </div>
      )}

      {/* Draft Step: Initial card selection at game start */}
      {step === "draft" && (
        <div>
          <div className="text-center mb-4">
            <span className="text-2xl block mb-2">📋</span>
            <h3 className="text-lg font-bold text-mission-green mb-2">MISSION BRIEFING</h3>
            <p className="text-sm text-mission-cream/80 mb-2">
              Select your starting intelligence cards.
            </p>
            <span className="led-segment text-2xl text-mission-amber">
              {player.initialCardsDrawn}/4
            </span>
            <span className="text-sm text-mission-steel block mt-1">cards drafted</span>
          </div>

          <div className="text-center mb-3">
            <span className="text-sm text-mission-cream">
              Choose a deck to draw from:
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <MissionButton
              onClick={() => onDrawCard("engineering")}
              disabled={isDrawingCard}
              variant="success"
              size="sm"
              isLoading={isDrawingCard && selectedDeck === "engineering"}
            >
              <span className="text-[9px] sm:text-xs">Engineering</span>
            </MissionButton>
            <MissionButton
              onClick={() => onDrawCard("espionage")}
              disabled={isDrawingCard}
              variant="danger"
              size="sm"
              isLoading={isDrawingCard && selectedDeck === "espionage"}
            >
              <span className="text-[9px] sm:text-xs">Espionage</span>
            </MissionButton>
            <MissionButton
              onClick={() => onDrawCard("economic")}
              disabled={isDrawingCard}
              variant="warning"
              size="sm"
              isLoading={isDrawingCard && selectedDeck === "economic"}
            >
              <span className="text-[9px] sm:text-xs">Economic</span>
            </MissionButton>
          </div>
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
  calibrationChoice,
  setCalibrationChoice,
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
    needsCalibrationChoice: boolean;
    canTargetReadyRockets: boolean;
  };
  targetPlayerId: string;
  setTargetPlayerId: (id: string) => void;
  targetRocketId: string;
  setTargetRocketId: (id: string) => void;
  peekChoice: "strength" | "movement" | null;
  setPeekChoice: (choice: "strength" | "movement" | null) => void;
  calibrationChoice: "accuracy" | "power" | null;
  setCalibrationChoice: (choice: "accuracy" | "power" | null) => void;
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
                    .filter((r) => cardRequirements.canTargetReadyRockets
                      ? (r.status === "building" || r.status === "ready")
                      : r.status === "building")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        Power {r.power}, Acc {r.accuracy} {r.status === "ready" ? "(Ready)" : `(${r.buildTimeRemaining} turns)`}
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

            {/* Calibration Choice for Rocket Calibration */}
            {cardRequirements.needsCalibrationChoice && (
              <div className="mb-3">
                <span className="label-embossed text-[10px] block mb-2">LAUNCH BONUS</span>
                <p className="text-xs text-mission-cream/70 mb-2">
                  Choose +1 bonus for next rocket launch
                </p>
                <div className="flex gap-2">
                  <MissionButton
                    onClick={() => setCalibrationChoice("accuracy")}
                    variant={calibrationChoice === "accuracy" ? "success" : "primary"}
                    size="sm"
                    className="flex-1"
                  >
                    +1 Accuracy
                  </MissionButton>
                  <MissionButton
                    onClick={() => setCalibrationChoice("power")}
                    variant={calibrationChoice === "power" ? "warning" : "primary"}
                    size="sm"
                    className="flex-1"
                  >
                    +1 Power
                  </MissionButton>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <MissionButton
                onClick={() => {
                  setSelectedCardId(null);
                  setTargetPlayerId("");
                  setTargetRocketId("");
                  setPeekChoice(null);
                  setCalibrationChoice(null);
                }}
                variant="primary"
                size="md"
                className="flex-1"
              >
                Cancel
              </MissionButton>
              <MissionButton
                onClick={handlePlayCard}
                disabled={!canPlayCard() || isPlayingCard}
                variant="success"
                size="lg"
                className="flex-1 text-lg font-bold"
                isLoading={isPlayingCard}
              >
                {isPlayingCard ? "Playing..." : "🃏 PLAY CARD"}
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
  const [isRespondingToDiplomaticPressure, setIsRespondingToDiplomaticPressure] = useState(false);

  // Card selection state
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [targetPlayerId, setTargetPlayerId] = useState<string>("");
  const [targetRocketId, setTargetRocketId] = useState<string>("");
  const [peekChoice, setPeekChoice] = useState<"strength" | "movement" | null>(null);
  const [calibrationChoice, setCalibrationChoice] = useState<"accuracy" | "power" | null>(null);

  // Trade cards state
  const [isTradeMode, setIsTradeMode] = useState(false);
  const [tradeCardIds, setTradeCardIds] = useState<string[]>([]);
  const [tradeDeck, setTradeDeck] = useState<CardDeckType | null>(null);
  const [isTradingCards, setIsTradingCards] = useState(false);

  // Tutorial state
  const [showTutorial, setShowTutorial] = useState(false);

  // Action notification state
  const [lastNotifiedActionId, setLastNotifiedActionId] = useState(0);
  const [pendingNotification, setPendingNotification] = useState<typeof gameState.actionLog[0] | null>(null);
  const [pendingTargetedNotification, setPendingTargetedNotification] = useState<typeof gameState.actionLog[0] | null>(null);

  // UI state
  const [expandedAction, setExpandedAction] = useState<"build" | "launch" | "cards" | null>(null);
  const [buildSuccess, setBuildSuccess] = useState(false);

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
  // Initialize refs to -1/999 to indicate "not yet synced with game state"
  const prevRoundRef = useRef<number>(-1);
  const prevDistanceRef = useRef<number>(999);

  // Turn announcement overlay state
  const [showTurnAnnouncement, setShowTurnAnnouncement] = useState(false);
  const [turnAnnouncementPlayer, setTurnAnnouncementPlayer] = useState<string>("");
  const prevActivePlayerRef = useRef<string | null>(null);

  // Game outcome sequence state
  const [showOutcomeSequence, setShowOutcomeSequence] = useState(false);
  const [outcomeSequenceShown, setOutcomeSequenceShown] = useState(false);
  const prevPhaseRef = useRef<string | null>(null);

  // Card play effect state
  const [cardPlayEffect, setCardPlayEffect] = useState<"espionage" | "engineering" | "economic" | null>(null);
  const lastCardPlayActionIdRef = useRef<number>(0);

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

    // Initialize refs on first sync (when they have sentinel values)
    if (prevRoundRef.current === -1 || prevDistanceRef.current === 999) {
      prevRoundRef.current = currentRound;
      prevDistanceRef.current = currentDistance;
      return;
    }

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

  // Detect turn start for wizard (or draft phase)
  useEffect(() => {
    // During initial draft phase, ALL players can draw simultaneously
    if (phase === "initialDraft") {
      // Don't change wizard state if player data isn't loaded yet
      if (!player) return;

      const isInDraftPhase = player.initialCardsDrawn < 4;
      if (isInDraftPhase) {
        // Show draft wizard for all players who haven't finished drafting
        // If turnWizardStep is "showCard" but hand is empty, reset to "draft"
        // This prevents empty panel when state gets out of sync
        if (turnWizardStep === "showCard" && player.hand.length === 0) {
          setTurnWizardStep("draft");
        } else if (turnWizardStep !== "draft" && turnWizardStep !== "showCard") {
          setTurnWizardStep("draft");
        }
      } else {
        // Player finished drafting, hide wizard (waiting for others)
        if (turnWizardStep === "draft") {
          setTurnWizardStep(null);
        }
      }
      return;
    }

    // Normal playing phase - only active player
    if (phase !== "playing" || !isMyTurn) return;

    // Normal turn detection
    if (!turnMeta) return;

    const prevMeta = prevTurnMetaRef.current;
    const isNewTurn =
      turnMeta.playerId === playerId &&
      (!prevMeta || prevMeta.playerId !== playerId || prevMeta.incomeGained !== turnMeta.incomeGained);

    if (isNewTurn && turnMeta.incomeGained === 0 && turnMeta.lastDrawnCardId === null) {
      setTurnWizardStep("announce");
    }

    prevTurnMetaRef.current = turnMeta;
  }, [phase, isMyTurn, turnMeta, playerId, player, player?.hand.length, turnWizardStep]);

  // Detect active player changes for turn announcement overlay
  useEffect(() => {
    if (phase !== "playing" || !activePlayerId) return;

    // Skip if this is the initial load (ref is null)
    if (prevActivePlayerRef.current === null) {
      prevActivePlayerRef.current = activePlayerId;
      return;
    }

    // Detect turn change
    if (activePlayerId !== prevActivePlayerRef.current) {
      const activePlayer = gameState?.players?.[activePlayerId];
      const playerName = activePlayer?.name || "Player";
      setTurnAnnouncementPlayer(playerName);
      setShowTurnAnnouncement(true);
    }

    prevActivePlayerRef.current = activePlayerId;
  }, [phase, activePlayerId, gameState?.players]);

  // Detect game over for outcome sequence
  useEffect(() => {
    // Detect transition to gameOver phase
    if (phase === "gameOver" && prevPhaseRef.current !== "gameOver" && !outcomeSequenceShown) {
      setShowOutcomeSequence(true);
      setOutcomeSequenceShown(true);
    }
    prevPhaseRef.current = phase;
  }, [phase, outcomeSequenceShown]);

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

  // Detect new important actions for floating notifications
  useEffect(() => {
    if (!gameState?.actionLog?.length) return;

    const latestAction = gameState.actionLog[gameState.actionLog.length - 1];
    if (latestAction && latestAction.id > lastNotifiedActionId) {
      // Only process actions from OTHER players (not your own)
      const isOtherPlayer = latestAction.playerId !== playerId;

      if (isOtherPlayer) {
        // PRIORITY 1: Check if current player was targeted by a card
        // This gets the dramatic TargetedNotification
        if (latestAction.action === "PLAY_CARD" && player?.name) {
          const targetInfo = checkIfTargeted(latestAction, player.name);
          if (targetInfo.isTargeted) {
            setPendingTargetedNotification(latestAction);
            setLastNotifiedActionId(latestAction.id);
            return; // Don't also show a regular notification
          }
        }

        // PRIORITY 2: Check for other important actions worth notifying
        const importantActions = [
          "LAUNCH_ROCKET",
          "ROUND_END",
          "GAME_OVER",
        ];

        if (importantActions.includes(latestAction.action)) {
          setPendingNotification(latestAction);
        }
      }

      setLastNotifiedActionId(latestAction.id);
    }
  }, [gameState?.actionLog, lastNotifiedActionId, playerId, player?.name]);

  // Detect card plays and actions for visual effects
  useEffect(() => {
    if (!gameState?.actionLog?.length) return;

    const latestAction = gameState.actionLog[gameState.actionLog.length - 1];
    if (latestAction && latestAction.id > lastCardPlayActionIdRef.current) {
      let effectType: "espionage" | "engineering" | "economic" | null = null;

      if (latestAction.action === "PLAY_CARD") {
        // Determine card type from the action details
        // Details format: Played "Card Name" ...
        const details = latestAction.details.toLowerCase();

        // Engineering cards (construction, tech, rockets)
        const engineeringKeywords = ["extra draw", "calibration", "prototype", "surplus", "rapid assembly", "boost", "precision"];
        // Espionage cards (spying, stealing, sabotage)
        const espionageKeywords = ["seizure", "espionage", "embargo", "sabotage", "pressure", "regulatory", "covert", "strike", "spy", "steal"];
        // Economic cards (resources, income, trading)
        const economicKeywords = ["stimulus", "subsidy", "efficiency", "grant", "partnership", "trade", "profit", "resource"];

        if (espionageKeywords.some(kw => details.includes(kw))) {
          effectType = "espionage";
        } else if (economicKeywords.some(kw => details.includes(kw))) {
          effectType = "economic";
        } else if (engineeringKeywords.some(kw => details.includes(kw))) {
          effectType = "engineering";
        }
      } else if (latestAction.action === "BUILD_ROCKET") {
        // Rocket building triggers engineering effect
        effectType = "engineering";
      }

      if (effectType) {
        setCardPlayEffect(effectType);
      }
      lastCardPlayActionIdRef.current = latestAction.id;
    }
  }, [gameState?.actionLog]);

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
    // Check if still in draft phase
    if (player && player.initialCardsDrawn < 4) {
      // Still drafting - go back to draft selection
      setTurnWizardStep("draft");
      setSelectedDeck(null);
      return;
    }

    // Just finished draft - check if we need to start regular turn
    // After draft, turnMeta.lastDrawnCardId is set (from last draft draw)
    // BEGIN_TURN resets it to null, so if it's still set, we need to BEGIN_TURN first
    if (player && player.initialCardsDrawn >= 4 && turnMeta &&
        turnMeta.cardsDrawnThisTurn === 0 && turnMeta.lastDrawnCardId !== null) {
      // Show announce step so player can BEGIN_TURN and collect income
      setTurnWizardStep("announce");
      setSelectedDeck(null);
      return;
    }

    // Check if player can draw another card (late game: 2 draws when comet ≤9 from Earth)
    if (gameState && turnMeta) {
      const maxDraws = gameState.distanceToImpact <= 9 ? 2 : 1;
      const cardsDrawn = turnMeta.cardsDrawnThisTurn ?? 0;
      if (cardsDrawn < maxDraws) {
        // Can draw another card - go back to deck selection
        setTurnWizardStep("chooseDeck");
        setSelectedDeck(null);
        return;
      }
    }
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
      // Show success animation
      setBuildSuccess(true);
      setTimeout(() => setBuildSuccess(false), 1500);
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

  async function handleConfirmRoll() {
    await dispatchAction("CONFIRM_ROLL");
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
        calibrationChoice: calibrationChoice || undefined,
      });
      setSelectedCardId(null);
      setTargetPlayerId("");
      setTargetRocketId("");
      setPeekChoice(null);
      setCalibrationChoice(null);
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

  async function handleRespondToDiplomaticPressure(counter: boolean) {
    setIsRespondingToDiplomaticPressure(true);
    try {
      await dispatchAction("RESPOND_TO_DIPLOMATIC_PRESSURE", { counter });
    } finally {
      setIsRespondingToDiplomaticPressure(false);
    }
  }

  function toggleTradeCardSelection(cardId: string) {
    setTradeCardIds((prev) => {
      if (prev.includes(cardId)) {
        return prev.filter((id) => id !== cardId);
      } else if (prev.length < 2) {
        return [...prev, cardId];
      }
      return prev;
    });
  }

  function exitTradeMode() {
    setIsTradeMode(false);
    setTradeCardIds([]);
    setTradeDeck(null);
  }

  async function handleTradeCards() {
    if (tradeCardIds.length !== 2 || !tradeDeck) return;

    setIsTradingCards(true);
    try {
      await dispatchAction("TRADE_CARDS", {
        discardCardIds: tradeCardIds as [string, string],
        drawFromDeck: tradeDeck,
      });
      exitTradeMode();
    } finally {
      setIsTradingCards(false);
    }
  }

  function toggleCardSelection(cardId: string) {
    setSelectedCardId((prev) => (prev === cardId ? null : cardId));
    setTargetPlayerId("");
    setTargetRocketId("");
    setPeekChoice(null);
    setCalibrationChoice(null);
  }

  // Get selected card info
  const selectedCard = player?.hand.find((c) => c.id === selectedCardId) ?? null;

  // Determine targeting requirements for selected card
  const getCardRequirements = (card: GameCard | null) => {
    const defaults = { needsTargetPlayer: false, needsTargetRocket: false, needsPeekChoice: false, needsOwnRocket: false, needsCalibrationChoice: false, canTargetReadyRockets: false };
    if (!card) return defaults;

    if (card.deck === "engineering") {
      const engCard = card as EngineeringCard;
      switch (engCard.cardType) {
        case "STREAMLINED_ASSEMBLY":
          return { ...defaults, needsOwnRocket: true };
        case "COMET_ANALYSIS":
          return { ...defaults, needsPeekChoice: true };
        case "ROCKET_CALIBRATION":
          return { ...defaults, needsCalibrationChoice: true };
        default:
          return defaults;
      }
    } else if (card.deck === "espionage") {
      const espCard = card as EspionageCard;
      switch (espCard.cardType) {
        case "RESOURCE_SEIZURE":
        case "ESPIONAGE_AGENT":
        case "EMBARGO":
        case "SABOTAGE_CONSTRUCTION":
        case "DIPLOMATIC_PRESSURE":
          return { ...defaults, needsTargetPlayer: true };
        case "REGULATORY_REVIEW":
        case "COVERT_ROCKET_STRIKE":
          return { ...defaults, needsTargetPlayer: true, needsTargetRocket: true, canTargetReadyRockets: true };
        default:
          return defaults;
      }
    } else {
      // Economic cards - no special targeting needed
      return defaults;
    }
  };

  const cardRequirements = getCardRequirements(selectedCard);

  const canPlayCard = () => {
    if (!selectedCard) return false;
    if (cardRequirements.needsTargetPlayer && !targetPlayerId) return false;
    if (cardRequirements.needsTargetRocket && !targetRocketId) return false;
    if (cardRequirements.needsPeekChoice && !peekChoice) return false;
    if (cardRequirements.needsOwnRocket && !targetRocketId) return false;
    if (cardRequirements.needsCalibrationChoice && !calibrationChoice) return false;
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
    score: p.trophies.reduce((sum, t) => sum + t.baseStrength, 0),
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

      {/* Turn Announcement Overlay */}
      <AnimatePresence>
        {showTurnAnnouncement && (
          <TurnAnnouncementOverlay
            playerName={turnAnnouncementPlayer}
            isCurrentPlayer={activePlayerId === playerId}
            onComplete={() => setShowTurnAnnouncement(false)}
          />
        )}
      </AnimatePresence>

      {/* Game Outcome Sequence */}
      <AnimatePresence>
        {showOutcomeSequence && (
          <GameOutcomeSequence
            outcome={gameState?.earthDestroyed ? "defeat" : "victory"}
            onComplete={() => setShowOutcomeSequence(false)}
          />
        )}
      </AnimatePresence>

      {/* Card Play Effect */}
      <CardPlayEffect
        cardType={cardPlayEffect}
        onComplete={() => setCardPlayEffect(null)}
      />

      {/* Floating Action Notification */}
      <ActionNotification
        entry={pendingNotification}
        currentPlayerId={playerId}
        onDismiss={() => setPendingNotification(null)}
      />

      {/* Targeted Notification - Dramatic alert when YOU are attacked */}
      <TargetedNotification
        entry={pendingTargetedNotification}
        currentPlayerName={player?.name ?? ""}
        onDismiss={() => setPendingTargetedNotification(null)}
      />

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

            {/* How to Play Button */}
            <MissionButton
              onClick={() => setShowTutorial(true)}
              variant="warning"
              size="lg"
              className="w-full mb-4"
            >
              <span className="flex items-center justify-center gap-2">
                <span>📖</span>
                <span>How to Play</span>
              </span>
            </MissionButton>

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

        {/* INITIAL DRAFT PHASE - All players draw 4 cards simultaneously */}
        {phase === "initialDraft" && gameState && player && (
          <>
            {/* Draft Phase Header */}
            <div className="panel-retro p-3 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-sm font-bold text-mission-cream uppercase tracking-wider">
                    Mission Briefing
                  </h1>
                  <span className="text-[10px] text-mission-steel">ALL AGENTS DRAFTING</span>
                </div>
                <div className="flex items-center gap-3">
                  <StatusLight
                    status={player.initialCardsDrawn < 4 ? "on" : "off"}
                    pulse={player.initialCardsDrawn < 4}
                    label={player.initialCardsDrawn < 4 ? "DRAFTING" : "READY"}
                  />
                  <span className="led-segment text-lg text-mission-amber">
                    {player.initialCardsDrawn}/4
                  </span>
                </div>
              </div>
            </div>

            {/* Show other players' draft progress */}
            <div className="panel-retro p-3 mb-4">
              <h3 className="label-embossed text-[10px] mb-2">AGENT STATUS</h3>
              <div className="grid grid-cols-2 gap-2">
                {gameState.playerOrder.map((pid) => {
                  const p = gameState.players[pid];
                  if (!p) return null;
                  const isDone = p.initialCardsDrawn >= 4;
                  return (
                    <div key={pid} className="flex items-center justify-between bg-mission-dark/50 p-2 rounded">
                      <span className={`text-xs ${pid === playerId ? "text-mission-green font-bold" : "text-mission-cream"}`}>
                        {p.name}{pid === playerId ? " (You)" : ""}
                      </span>
                      <span className={`text-xs ${isDone ? "text-mission-green" : "text-mission-amber"}`}>
                        {isDone ? "READY" : `${p.initialCardsDrawn}/4`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Turn Wizard for drafting - show card after draw OR deck selection */}
            {player.initialCardsDrawn < 4 && (
              (turnWizardStep === "showCard" && player.hand.length > 0) ? (
                <TurnWizard
                  step={turnWizardStep}
                  turnMeta={turnMeta}
                  player={player}
                  distanceToImpact={gameState.distanceToImpact}
                  isBeginningTurn={isBeginningTurn}
                  isDrawingCard={isDrawingCard}
                  selectedDeck={selectedDeck}
                  onBeginTurn={handleBeginTurn}
                  onDrawCard={handleDrawCard}
                  onDismiss={dismissWizard}
                />
              ) : (
                /* Always show deck selection during draft - don't depend on turnWizardStep */
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="panel-retro p-4 mb-4 border-mission-green"
                >
                  <div className="text-center mb-4">
                    <span className="text-2xl block mb-2">📋</span>
                    <h3 className="text-lg font-bold text-mission-green mb-2">MISSION BRIEFING</h3>
                    <p className="text-sm text-mission-cream/80 mb-2">
                      Select your starting intelligence cards.
                    </p>
                    <span className="led-segment text-2xl text-mission-amber">
                      {player.initialCardsDrawn}/4
                    </span>
                    <span className="text-sm text-mission-steel block mt-1">cards drafted</span>
                  </div>

                  <div className="text-center mb-3">
                    <span className="text-sm text-mission-cream">
                      Choose a deck to draw from:
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5">
                    <MissionButton
                      onClick={() => handleDrawCard("engineering")}
                      disabled={isDrawingCard}
                      variant="success"
                      size="sm"
                      isLoading={isDrawingCard && selectedDeck === "engineering"}
                    >
                      <span className="text-[9px] sm:text-xs">Engineering</span>
                    </MissionButton>
                    <MissionButton
                      onClick={() => handleDrawCard("espionage")}
                      disabled={isDrawingCard}
                      variant="danger"
                      size="sm"
                      isLoading={isDrawingCard && selectedDeck === "espionage"}
                    >
                      <span className="text-[9px] sm:text-xs">Espionage</span>
                    </MissionButton>
                    <MissionButton
                      onClick={() => handleDrawCard("economic")}
                      disabled={isDrawingCard}
                      variant="warning"
                      size="sm"
                      isLoading={isDrawingCard && selectedDeck === "economic"}
                    >
                      <span className="text-[9px] sm:text-xs">Economic</span>
                    </MissionButton>
                  </div>
                </motion.div>
              )
            )}

            {/* Waiting message when done drafting */}
            {player.initialCardsDrawn >= 4 && (
              <div className="panel-retro p-4 text-center">
                <span className="text-2xl block mb-2">⏳</span>
                <h3 className="text-lg font-bold text-mission-green mb-2">BRIEFING COMPLETE</h3>
                <p className="text-sm text-mission-cream/80">
                  Waiting for other agents to complete their briefings...
                </p>
              </div>
            )}
          </>
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
              pendingLaunch={gameState.lastLaunchResult ? {
                strengthBefore: gameState.lastLaunchResult.strengthBefore,
                baseStrength: gameState.lastLaunchResult.baseStrength,
                isHit: gameState.lastLaunchResult.hit,
                power: gameState.lastLaunchResult.power,
                destroyed: gameState.lastLaunchResult.destroyed,
              } : null}
              launchAnimationComplete={launchAnimationComplete}
              className="mb-4"
            />

            {/* Shared Board - Card Decks */}
            <CardDecksDisplay
              movementCount={gameState.movementDeck.length}
              strengthCount={gameState.strengthDeck.length}
              engineeringCount={gameState.engineeringDeck.length}
              espionageCount={gameState.espionageDeck.length}
              economicCount={gameState.economicDeck.length}
              movementDiscardCount={gameState.movementDiscard.length}
              engineeringDiscardCount={gameState.engineeringDiscard.length}
              espionageDiscardCount={gameState.espionageDiscard.length}
              economicDiscardCount={gameState.economicDiscard.length}
              drawableDeck={turnWizardStep === "showIncome" || turnWizardStep === "chooseDeck" ? undefined : undefined}
              className="mb-4"
            />

            {/* Shared Board - Player Status Grid */}
            <PlayerStatusGrid players={allPlayersInfo} className="mb-4" />

            {/* Live Statistics Dashboard */}
            <LiveStatsDashboard gameState={gameState} className="mb-4" />

            {/* Card Result Notification */}
            {gameState.lastCardResult &&
              gameState.lastCardResult.playerId === playerId && (
                <CardResultNotification
                  result={gameState.lastCardResult}
                  onDismiss={handleClearCardResult}
                />
              )}

            {/* Diplomatic Pressure Counter Prompt */}
            {gameState.pendingDiplomaticPressure &&
              gameState.pendingDiplomaticPressure.targetId === playerId && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="panel-retro p-4 mb-4 border-mission-red"
                >
                  <div className="text-center">
                    <span className="text-3xl block mb-2">⚔️</span>
                    <span className="label-embossed text-[10px] block mb-2 text-mission-red">
                      INCOMING ATTACK
                    </span>
                    <h3 className="text-lg font-bold text-mission-cream mb-2">
                      {gameState.pendingDiplomaticPressure.attackerName} played Diplomatic Pressure!
                    </h3>
                    <p className="text-sm text-mission-cream/80 mb-4">
                      You have a Diplomatic Pressure card. Use it to counter and nullify the attack?
                    </p>
                    <div className="flex gap-3 justify-center">
                      <MissionButton
                        onClick={() => handleRespondToDiplomaticPressure(true)}
                        disabled={isRespondingToDiplomaticPressure}
                        variant="success"
                        size="lg"
                        isLoading={isRespondingToDiplomaticPressure}
                      >
                        Counter Attack
                      </MissionButton>
                      <MissionButton
                        onClick={() => handleRespondToDiplomaticPressure(false)}
                        disabled={isRespondingToDiplomaticPressure}
                        variant="danger"
                        size="lg"
                      >
                        Accept Block
                      </MissionButton>
                    </div>
                    <p className="text-xs text-mission-steel mt-3">
                      Counter: Both cards discarded, no effect. Accept: Your next card play will be blocked and discarded.
                    </p>
                  </div>
                </motion.div>
              )}

            {/* Turn Wizard - only for active player during playing phase */}
            {isMyTurn && turnWizardStep && (
              <TurnWizard
                step={turnWizardStep}
                turnMeta={turnMeta}
                player={player}
                distanceToImpact={gameState.distanceToImpact}
                isBeginningTurn={isBeginningTurn}
                isDrawingCard={isDrawingCard}
                selectedDeck={selectedDeck}
                onBeginTurn={handleBeginTurn}
                onDrawCard={handleDrawCard}
                onDismiss={dismissWizard}
              />
            )}

            {/* Launch Animation - shown during pendingLaunch (waiting for roll) OR after roll (lastLaunchResult) */}
            {(gameState.pendingLaunch || gameState.lastLaunchResult) && (
              <RocketLaunchAnimation
                key={gameState.lastLaunchResult
                  ? `${gameState.lastLaunchResult.rocketId}-${gameState.lastLaunchResult.diceRoll}-${gameState.lastLaunchResult.isReroll}-${gameState.lastLaunchResult.mustReroll}`
                  : `pending-${gameState.pendingLaunch?.rocketId}`
                }
                // If we have a result, use it; otherwise we're waiting for roll
                diceRoll={gameState.lastLaunchResult?.diceRoll ?? 0}
                accuracyNeeded={gameState.lastLaunchResult?.accuracyNeeded ?? gameState.pendingLaunch?.calibratedAccuracy ?? 0}
                isHit={gameState.lastLaunchResult?.hit ?? false}
                power={gameState.lastLaunchResult?.power ?? gameState.pendingLaunch?.calibratedPower ?? 0}
                destroyed={gameState.lastLaunchResult?.destroyed ?? false}
                baseStrength={gameState.lastLaunchResult?.baseStrength ?? gameState.activeStrengthCard?.baseStrength ?? 0}
                playerName={
                  gameState.lastLaunchResult
                    ? (gameState.players[gameState.lastLaunchResult.playerId]?.name ?? "Unknown")
                    : (gameState.pendingLaunch ? (gameState.players[gameState.pendingLaunch.playerId]?.name ?? "Unknown") : "Unknown")
                }
                isReroll={gameState.lastLaunchResult?.isReroll ?? false}
                isSabotaged={gameState.lastLaunchResult?.mustReroll ?? gameState.pendingLaunch?.mustReroll ?? false}
                canReroll={gameState.lastLaunchResult?.canReroll ?? false}
                mustReroll={gameState.lastLaunchResult?.mustReroll ?? false}
                isCurrentPlayer={
                  gameState.lastLaunchResult
                    ? gameState.lastLaunchResult.playerId === playerId
                    : gameState.pendingLaunch?.playerId === playerId
                }
                // New: waiting for roll when we have pendingLaunch but no result yet
                waitingForRoll={gameState.pendingLaunch !== null && gameState.lastLaunchResult === null}
                onConfirmRoll={handleConfirmRoll}
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
              player.upgrades.cardPlayBonus > 0 ||
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
                  {player.upgrades.cardPlayBonus > 0 && (
                    <span className="px-2 py-1 bg-purple-900/50 border border-purple-600/50 rounded text-xs text-purple-300">
                      +{player.upgrades.cardPlayBonus} per Card
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

            {/* Pending Calibration Display */}
            {(player.pendingCalibration.accuracyBonus > 0 || player.pendingCalibration.powerBonus > 0) && (
              <div className="panel-retro p-3 mb-4 border-cyan-700">
                <span className="label-embossed text-[10px] block mb-2">LAUNCH CALIBRATION</span>
                <p className="text-xs text-mission-cream/70 mb-2">
                  Bonuses applied to your next rocket launch:
                </p>
                <div className="flex flex-wrap gap-2">
                  {player.pendingCalibration.accuracyBonus > 0 && (
                    <span className="px-2 py-1 bg-cyan-900/50 border border-cyan-600/50 rounded text-xs text-cyan-300">
                      +{player.pendingCalibration.accuracyBonus} Accuracy
                    </span>
                  )}
                  {player.pendingCalibration.powerBonus > 0 && (
                    <span className="px-2 py-1 bg-orange-900/50 border border-orange-600/50 rounded text-xs text-orange-300">
                      +{player.pendingCalibration.powerBonus} Power
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Diplomatic Pressure Warning */}
            {player.isUnderDiplomaticPressure && (
              <div className="panel-retro p-3 mb-4 border-mission-red">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🚫</span>
                  <div>
                    <span className="label-embossed text-[10px] block text-mission-red">DIPLOMATIC PRESSURE</span>
                    <p className="text-xs text-mission-cream/70">
                      Your next card play will be blocked!
                    </p>
                  </div>
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

            {/* Action Panels - Primary Player Interactions */}
            <div className="space-y-3 mb-4">
              {/* Build Rocket */}
              <ActionPanel
                title="Build Rocket"
                summary={`${player.rockets.filter((r) => r.status === "ready" || r.status === "building").length}/${player.maxConcurrentRockets + player.upgrades.maxRocketsBonus} slots`}
                isExpanded={expandedAction === "build"}
                onToggle={() => setExpandedAction(expandedAction === "build" ? null : "build")}
                variant="build"
              >
                <BuildRocketForm
                  player={player}
                  onBuild={handleBuildRocket}
                  isBuilding={isBuilding}
                  isMyTurn={isMyTurn}
                  showSuccess={buildSuccess}
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
                    setCalibrationChoice(null);
                    exitTradeMode();
                  }
                }}
                variant="cards"
              >
                {player.hand.length === 0 ? (
                  <p className="text-sm text-mission-steel">No cards in hand.</p>
                ) : isTradeMode ? (
                  /* Trade Mode UI */
                  <div className="space-y-3">
                    <div className="panel-retro p-2 border-mission-amber">
                      <div className="flex items-center justify-between mb-2">
                        <span className="label-embossed text-[10px] text-mission-amber">TRADE MODE</span>
                        <MissionButton onClick={exitTradeMode} variant="primary" size="sm">
                          Cancel
                        </MissionButton>
                      </div>
                      <p className="text-xs text-mission-cream/70 mb-2">
                        Select 2 cards to discard, then choose a deck to draw from.
                      </p>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-mission-steel">Selected:</span>
                        <span className={cn(
                          "led-segment",
                          tradeCardIds.length === 2 ? "text-mission-green" : "text-mission-amber"
                        )}>
                          {tradeCardIds.length}/2
                        </span>
                      </div>
                    </div>

                    {/* Card selection for trade */}
                    <div className="space-y-2">
                      {player.hand.map((card) => {
                        const isSelectedForTrade = tradeCardIds.includes(card.id);
                        return (
                          <div
                            key={card.id}
                            className={cn(
                              "transition-all",
                              isSelectedForTrade && "ring-2 ring-mission-amber rounded-sm"
                            )}
                          >
                            <GameCardDisplay
                              card={card}
                              isSelected={isSelectedForTrade}
                              onSelect={() => toggleTradeCardSelection(card.id)}
                              disabled={!isMyTurn}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Deck selection and execute */}
                    {tradeCardIds.length === 2 && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="panel-retro p-3"
                      >
                        <span className="label-embossed text-[10px] block mb-2">DRAW FROM DECK</span>
                        <div className="grid grid-cols-3 gap-2 mb-3">
                          <MissionButton
                            onClick={() => setTradeDeck("engineering")}
                            variant={tradeDeck === "engineering" ? "success" : "primary"}
                            size="sm"
                          >
                            Engineering
                          </MissionButton>
                          <MissionButton
                            onClick={() => setTradeDeck("espionage")}
                            variant={tradeDeck === "espionage" ? "danger" : "primary"}
                            size="sm"
                          >
                            Espionage
                          </MissionButton>
                          <MissionButton
                            onClick={() => setTradeDeck("economic")}
                            variant={tradeDeck === "economic" ? "warning" : "primary"}
                            size="sm"
                          >
                            Economic
                          </MissionButton>
                        </div>
                        <MissionButton
                          onClick={handleTradeCards}
                          disabled={!tradeDeck || isTradingCards}
                          variant="success"
                          size="lg"
                          className="w-full"
                          isLoading={isTradingCards}
                        >
                          {isTradingCards ? "Trading..." : "Trade Cards"}
                        </MissionButton>
                      </motion.div>
                    )}
                  </div>
                ) : (
                  /* Normal Play Mode */
                  <div className="space-y-2">
                    {/* Trade button */}
                    {isMyTurn && player.hand.length >= 2 && (
                      <MissionButton
                        onClick={() => {
                          setIsTradeMode(true);
                          setSelectedCardId(null);
                        }}
                        variant="warning"
                        size="sm"
                        className="w-full mb-2"
                      >
                        Trade Cards (2 → 1)
                      </MissionButton>
                    )}

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
                          calibrationChoice={calibrationChoice}
                          setCalibrationChoice={setCalibrationChoice}
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

            {/* Live Action Feed (visible to all players) */}
            {gameState.actionLog.length > 0 && (
              <LiveActionFeed
                actionLog={gameState.actionLog}
                currentPlayerId={playerId}
                currentPlayerName={player?.name ?? ""}
                maxVisible={6}
                className="mb-4"
              />
            )}

            {/* Host-only detailed Action Log (during gameplay) */}
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

            <TutorialButton onClick={() => setShowTutorial(true)} />

            {/* Emoji Reactions */}
            <EmojiReactionsCompact />

            {isMyTurn ? (
              <MissionButton
                onClick={handleEndTurn}
                disabled={
                  isEndingTurn ||
                  !!gameState?.pendingDiplomaticPressure ||
                  !!gameState?.pendingLaunch ||
                  !!gameState?.lastLaunchResult?.canReroll ||
                  !!gameState?.lastLaunchResult?.mustReroll
                }
                variant="success"
                size="lg"
                className="flex-1"
                isLoading={isEndingTurn}
              >
                {isEndingTurn
                  ? "Ending..."
                  : gameState?.pendingLaunch
                    ? "Roll First"
                    : (gameState?.lastLaunchResult?.canReroll || gameState?.lastLaunchResult?.mustReroll)
                      ? "Decide Reroll"
                      : "End Turn"}
              </MissionButton>
            ) : (
              <div className="flex-1 text-center py-3 text-mission-steel text-sm">
                Awaiting {gameState?.players[activePlayerId ?? ""]?.name ?? "..."}...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tutorial Modal */}
      <Tutorial isOpen={showTutorial} onClose={() => setShowTutorial(false)} />
    </div>
  );
}
