"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import { motion, AnimatePresence } from "framer-motion";
import { cardColors } from "../../theme/missionControl";
import type { GameCard } from "../../config";

interface CardDrawAnimationProps {
  card: GameCard;
  deckType: "engineering" | "espionage" | "economic";
  onComplete?: () => void;
  className?: string;
}

/**
 * Animated card draw from deck to hand
 * Card slides from deck position, flips to reveal face
 */
export function CardDrawAnimation({
  card,
  deckType,
  onComplete,
  className,
}: CardDrawAnimationProps) {
  const [phase, setPhase] = useState<"drawing" | "flipping" | "revealed">("drawing");

  const colors = cardColors[deckType];

  useEffect(() => {
    // Drawing phase
    const flipTimer = setTimeout(() => {
      setPhase("flipping");
    }, 400);

    // Revealed phase
    const revealTimer = setTimeout(() => {
      setPhase("revealed");
    }, 700);

    // Complete callback
    const completeTimer = setTimeout(() => {
      onComplete?.();
    }, 1500);

    return () => {
      clearTimeout(flipTimer);
      clearTimeout(revealTimer);
      clearTimeout(completeTimer);
    };
  }, [onComplete]);

  return (
    <div className={cn("relative h-40 flex items-center justify-center", className)}>
      <AnimatePresence>
        <motion.div
          key="card"
          className="relative"
          initial={{ y: -50, x: -100, rotate: -10, scale: 0.6, opacity: 0 }}
          animate={{
            y: 0,
            x: 0,
            rotate: 0,
            scale: 1,
            opacity: 1,
            rotateY: phase === "flipping" || phase === "revealed" ? 180 : 0,
          }}
          transition={{
            duration: 0.4,
            ease: "easeOut",
            rotateY: { duration: 0.3 },
          }}
          style={{ perspective: 1000, transformStyle: "preserve-3d" }}
        >
          {/* Card container */}
          <div
            className={cn(
              "w-32 h-44 rounded-sm relative",
              "border-2 transition-all duration-300",
              colors.bg,
              colors.border
            )}
            style={{
              boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
              transformStyle: "preserve-3d",
            }}
          >
            {/* Card back (visible when not flipped) */}
            <div
              className={cn(
                "absolute inset-0 rounded-sm flex flex-col items-center justify-center p-2",
                phase !== "revealed" && "opacity-100",
                phase === "revealed" && "opacity-0"
              )}
              style={{ backfaceVisibility: "hidden" }}
            >
              <div className="absolute inset-1 border border-white/10 rounded-sm" />
              <span className={cn("text-4xl opacity-50", colors.text)}>
                {deckType === "engineering" ? "⚙" : deckType === "espionage" ? "🔍" : "💰"}
              </span>
              <span className={cn("text-xs mt-2 uppercase font-bold opacity-50", colors.text)}>
                {deckType}
              </span>
            </div>

            {/* Card face (visible when flipped) */}
            <div
              className={cn(
                "absolute inset-0 rounded-sm flex flex-col p-2",
                phase === "revealed" && "opacity-100",
                phase !== "revealed" && "opacity-0"
              )}
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
              }}
            >
              {/* Card header */}
              <div className={cn("text-xs font-bold uppercase mb-1", colors.text)}>
                {card.deck}
              </div>

              {/* Card name */}
              <div className="text-sm font-bold text-mission-cream mb-2 leading-tight">
                {card.name}
              </div>

              {/* Card description */}
              <div className="flex-1 text-[10px] text-mission-cream/80 leading-relaxed">
                {card.description}
              </div>

              {/* Card type indicator */}
              <div className={cn(
                "mt-2 px-2 py-0.5 rounded text-[8px] uppercase font-bold self-start",
                colors.border.replace("border-", "bg-") + "/30",
                colors.text
              )}>
                {card.cardType.replace(/_/g, " ")}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Draw label */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: phase === "revealed" ? 1 : 0 }}
        className="absolute -bottom-2 left-1/2 -translate-x-1/2"
      >
        <span className="text-[10px] text-mission-green uppercase font-bold px-2 py-0.5 bg-mission-green/20 rounded">
          Card Drawn
        </span>
      </motion.div>
    </div>
  );
}

/**
 * Simple card display component (non-animated)
 */
export function GameCardDisplay({
  card,
  isSelected,
  onSelect,
  disabled,
  className,
}: {
  card: GameCard;
  isSelected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  const colors = cardColors[card.deck];

  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.02, y: -2 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "w-full text-left rounded-sm p-2",
        "border-2 transition-all duration-200",
        colors.bg,
        colors.border,
        isSelected && "ring-2 ring-mission-green ring-offset-2 ring-offset-mission-dark",
        disabled && "opacity-50 cursor-not-allowed",
        !disabled && "cursor-pointer hover:brightness-110",
        className
      )}
      style={{
        boxShadow: isSelected
          ? "0 0 10px rgba(51, 255, 51, 0.3)"
          : "0 2px 4px rgba(0,0,0,0.2)",
      }}
    >
      {/* Card header */}
      <div className="flex items-center justify-between mb-1">
        <span className={cn("text-[10px] font-bold uppercase", colors.text)}>
          {card.deck}
        </span>
        <span className="text-sm">
          {card.deck === "engineering" ? "⚙" : card.deck === "espionage" ? "🔍" : "💰"}
        </span>
      </div>

      {/* Card name */}
      <div className="text-sm font-bold text-mission-cream mb-1 leading-tight">
        {card.name}
      </div>

      {/* Card description */}
      <div className="text-[10px] text-mission-cream/70 leading-relaxed line-clamp-2">
        {card.description}
      </div>
    </motion.button>
  );
}
