"use client";

import { cn } from "@/lib/cn";
import { motion } from "framer-motion";
import { cardColors } from "../../theme/missionControl";

type DeckType = "movement" | "strength" | "engineering" | "espionage" | "economic";

interface CardDeckStackProps {
  type: DeckType;
  count: number;
  discardCount?: number;
  isHighlighted?: boolean;
  isDrawable?: boolean;
  onDraw?: () => void;
  className?: string;
}

type CardColorConfig = {
  bg: string;
  border: string;
  text: string;
  glow: string;
};

const deckConfig: Record<DeckType, {
  label: string;
  shortLabel: string;
  colors: CardColorConfig;
  icon: string;
}> = {
  movement: {
    label: "MOVEMENT",
    shortLabel: "MOVE",
    colors: cardColors.movement,
    icon: "→",
  },
  strength: {
    label: "STRENGTH",
    shortLabel: "STR",
    colors: cardColors.strength,
    icon: "⚡",
  },
  engineering: {
    label: "ENGINEERING",
    shortLabel: "ENG",
    colors: cardColors.engineering,
    icon: "⚙",
  },
  espionage: {
    label: "ESPIONAGE",
    shortLabel: "ESP",
    colors: cardColors.espionage,
    icon: "🔍",
  },
  economic: {
    label: "ECONOMIC",
    shortLabel: "ECON",
    colors: cardColors.economic,
    icon: "💰",
  },
};

/**
 * Physical card deck stack display
 * Shows a stack of cards with a retro card back design
 * Can be interactive (drawable) or display-only
 */
export function CardDeckStack({
  type,
  count,
  discardCount = 0,
  isHighlighted = false,
  isDrawable = false,
  onDraw,
  className,
}: CardDeckStackProps) {
  const config = deckConfig[type];
  const isEmpty = count === 0;

  // Calculate visual stack depth (max 5 cards shown)
  const stackDepth = Math.min(5, count);

  return (
    <div className={cn("flex flex-col items-center gap-2", className)}>
      {/* Deck label */}
      <span className="label-embossed text-[10px]">{config.shortLabel}</span>

      {/* Card stack */}
      <motion.div
        className="relative"
        whileHover={isDrawable && !isEmpty ? { scale: 1.05 } : {}}
        whileTap={isDrawable && !isEmpty ? { scale: 0.95 } : {}}
      >
        {/* Stack shadow layers */}
        {[...Array(stackDepth)].map((_, i) => (
          <div
            key={i}
            className={cn(
              "absolute w-14 h-20 rounded-sm",
              config.colors.bg,
              "border border-mission-steel-dark"
            )}
            style={{
              top: i * -2,
              left: i * 1,
              zIndex: i,
              opacity: 0.5 + (i / stackDepth) * 0.5,
            }}
          />
        ))}

        {/* Top card */}
        <button
          onClick={isDrawable ? onDraw : undefined}
          disabled={!isDrawable || isEmpty}
          className={cn(
            "relative w-14 h-20 rounded-sm",
            "border-2 transition-all duration-200",
            config.colors.bg,
            config.colors.border,
            isHighlighted && "ring-2 ring-mission-green ring-offset-2 ring-offset-mission-dark",
            isDrawable && !isEmpty && "cursor-pointer hover:brightness-110",
            isEmpty && "opacity-30",
            "disabled:cursor-not-allowed"
          )}
          style={{
            boxShadow: isHighlighted
              ? `0 0 15px ${config.colors.border.replace('border-', '')}`
              : "0 2px 4px rgba(0,0,0,0.3)",
          }}
        >
          {/* Card back design */}
          <div className="absolute inset-1 rounded-sm border border-white/10 flex flex-col items-center justify-center">
            {/* Decorative pattern */}
            <div className="absolute inset-2 border border-white/5 rounded-sm" />

            {/* Center icon */}
            <span className={cn("text-2xl opacity-50", config.colors.text)}>
              {config.icon}
            </span>

            {/* Classification stripe */}
            <div className={cn(
              "absolute bottom-2 inset-x-2 h-1 rounded-full",
              config.colors.border.replace('border-', 'bg-'),
              "opacity-50"
            )} />
          </div>

          {/* Draw indicator */}
          {isDrawable && !isEmpty && (
            <motion.div
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-mission-green flex items-center justify-center"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              <span className="text-[10px] text-mission-dark font-bold">+</span>
            </motion.div>
          )}
        </button>

        {/* Empty deck indicator */}
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[10px] text-mission-steel">EMPTY</span>
          </div>
        )}
      </motion.div>

      {/* Count display */}
      <div className="flex flex-col items-center gap-0.5">
        <span className="led-segment text-sm text-mission-green">
          {count}
        </span>
        {discardCount > 0 && (
          <span className="text-[8px] text-mission-steel">
            ({discardCount} disc.)
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Container for multiple deck stacks
 */
export function CardDecksDisplay({
  movementCount,
  strengthCount,
  engineeringCount,
  espionageCount,
  economicCount,
  movementDiscardCount = 0,
  engineeringDiscardCount = 0,
  espionageDiscardCount = 0,
  economicDiscardCount = 0,
  drawableDeck,
  onDrawEngineering,
  onDrawEspionage,
  onDrawEconomic,
  className,
}: {
  movementCount: number;
  strengthCount: number;
  engineeringCount: number;
  espionageCount: number;
  economicCount: number;
  movementDiscardCount?: number;
  engineeringDiscardCount?: number;
  espionageDiscardCount?: number;
  economicDiscardCount?: number;
  drawableDeck?: "engineering" | "espionage" | "economic" | null;
  onDrawEngineering?: () => void;
  onDrawEspionage?: () => void;
  onDrawEconomic?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("panel-retro p-3", className)}>
      <span className="label-embossed text-[10px] block mb-3">CARD DECKS</span>

      <div className="flex justify-around gap-2">
        <CardDeckStack
          type="movement"
          count={movementCount}
          discardCount={movementDiscardCount}
        />
        <CardDeckStack
          type="strength"
          count={strengthCount}
        />

        <div className="w-px bg-mission-steel-dark mx-1" />

        <CardDeckStack
          type="engineering"
          count={engineeringCount}
          discardCount={engineeringDiscardCount}
          isHighlighted={drawableDeck === "engineering"}
          isDrawable={drawableDeck === "engineering"}
          onDraw={onDrawEngineering}
        />
        <CardDeckStack
          type="espionage"
          count={espionageCount}
          discardCount={espionageDiscardCount}
          isHighlighted={drawableDeck === "espionage"}
          isDrawable={drawableDeck === "espionage"}
          onDraw={onDrawEspionage}
        />
        <CardDeckStack
          type="economic"
          count={economicCount}
          discardCount={economicDiscardCount}
          isHighlighted={drawableDeck === "economic"}
          isDrawable={drawableDeck === "economic"}
          onDraw={onDrawEconomic}
        />
      </div>
    </div>
  );
}
