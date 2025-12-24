"use client";

import { cn } from "@/lib/cn";
import { motion, AnimatePresence } from "framer-motion";
import { cardColors } from "../../theme/missionControl";

interface StrengthCardPanelProps {
  activeCard: {
    id: string;
    currentStrength: number;
    baseStrength: number;
  } | null;
  cardsRemaining: number;
  totalCards: number;
  className?: string;
}

/**
 * Prominent inline panel displaying the current comet strength card
 * Shows health bar, damage taken, and cards remaining
 * Visible to all players for clear game state awareness
 */
export function StrengthCardPanel({
  activeCard,
  cardsRemaining,
  totalCards,
  className,
}: StrengthCardPanelProps) {
  if (!activeCard) {
    return (
      <div className={cn("panel-retro p-4", className)}>
        <div className="text-center">
          <span className="label-embossed text-[10px] block mb-2">COMET STRENGTH</span>
          <div className="text-mission-green text-lg font-bold">
            ALL SEGMENTS DESTROYED
          </div>
          <span className="text-[10px] text-mission-steel">Comet has been neutralized!</span>
        </div>
      </div>
    );
  }

  const healthPercent = (activeCard.currentStrength / activeCard.baseStrength) * 100;
  const damageTaken = activeCard.baseStrength - activeCard.currentStrength;
  const cardNumber = totalCards - cardsRemaining;

  // Determine status based on damage
  const getStatus = () => {
    if (healthPercent <= 25) return { label: "CRITICAL", colorClass: "text-mission-red", bgClass: "bg-mission-red/30" };
    if (healthPercent <= 50) return { label: "DAMAGED", colorClass: "text-mission-amber", bgClass: "bg-mission-amber/30" };
    if (healthPercent < 100) return { label: "HIT", colorClass: "text-yellow-400", bgClass: "bg-yellow-900/30" };
    return { label: "INTACT", colorClass: "text-mission-green", bgClass: "bg-mission-green/30" };
  };

  const status = getStatus();

  return (
    <div className={cn(
      "panel-retro p-4",
      cardColors.strength.border,
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="label-embossed">ACTIVE COMET SEGMENT</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-mission-steel">SEGMENT</span>
          <span className="led-segment text-sm text-amber-300">
            {cardNumber}/{totalCards}
          </span>
        </div>
      </div>

      {/* Main strength display */}
      <div className="relative bg-mission-dark rounded border border-mission-steel-dark p-4">
        {/* Comet glow effect */}
        <div className="absolute inset-0 rounded opacity-30 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse at center, rgba(245, 158, 11, 0.3) 0%, transparent 70%)"
          }}
        />

        {/* Central strength readout */}
        <div className="relative flex items-center justify-center gap-6 mb-4">
          {/* Comet icon */}
          <motion.div
            className="text-4xl"
            animate={damageTaken > 0 ? {
              scale: [1, 1.1, 1],
              rotate: [0, -5, 5, 0],
            } : {}}
            transition={{ duration: 0.3 }}
          >
            ☄️
          </motion.div>

          {/* Current strength - large LED display */}
          <div className="text-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeCard.currentStrength}
                initial={{ scale: 1.3, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="relative"
              >
                <span className={cn(
                  "led-segment text-5xl font-bold",
                  cardColors.strength.text,
                  "drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]"
                )}>
                  {activeCard.currentStrength}
                </span>
              </motion.div>
            </AnimatePresence>
            <span className="text-[10px] text-mission-steel block mt-1">CURRENT STRENGTH</span>
          </div>

          {/* Damage indicator */}
          {damageTaken > 0 && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-center"
            >
              <span className="led-segment text-2xl text-mission-red">
                -{damageTaken}
              </span>
              <span className="text-[10px] text-mission-steel block mt-1">DAMAGE</span>
            </motion.div>
          )}
        </div>

        {/* Health bar */}
        <div className="relative mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-mission-steel">STRUCTURAL INTEGRITY</span>
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded", status.bgClass, status.colorClass)}>
              {status.label}
            </span>
          </div>
          <div className="h-4 bg-mission-steel-dark rounded overflow-hidden border border-mission-steel-dark">
            <motion.div
              className={cn(
                "h-full rounded-sm",
                healthPercent > 50 ? "bg-gradient-to-r from-amber-600 to-amber-400" :
                healthPercent > 25 ? "bg-gradient-to-r from-orange-600 to-orange-400" :
                "bg-gradient-to-r from-red-600 to-red-400"
              )}
              initial={false}
              animate={{ width: `${healthPercent}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-mission-steel">0</span>
            <span className="text-[10px] text-amber-300">
              {activeCard.currentStrength} / {activeCard.baseStrength}
            </span>
            <span className="text-[10px] text-mission-steel">{activeCard.baseStrength}</span>
          </div>
        </div>

        {/* Target info */}
        <div className="flex items-center justify-center gap-4 pt-3 border-t border-mission-steel-dark/50">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-mission-steel">DESTROY WITH:</span>
            <span className={cn(
              "led-segment text-lg font-bold",
              cardColors.strength.text
            )}>
              ≥{activeCard.currentStrength}
            </span>
            <span className="text-[10px] text-mission-steel">POWER</span>
          </div>
          <div className="h-4 w-px bg-mission-steel-dark" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-mission-steel">REMAINING:</span>
            <span className="led-segment text-lg text-amber-300">
              {cardsRemaining}
            </span>
            <span className="text-[10px] text-mission-steel">SEGMENTS</span>
          </div>
        </div>
      </div>
    </div>
  );
}
