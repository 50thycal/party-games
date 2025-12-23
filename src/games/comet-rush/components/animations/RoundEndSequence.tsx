"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/cn";
import { motion, AnimatePresence } from "framer-motion";
import type { MovementCard } from "../../config";

interface RoundEndSequenceProps {
  movementCard: MovementCard;
  newDistance: number;
  previousDistance: number;
  round: number;
  onComplete?: () => void;
  className?: string;
}

/**
 * End of round animation sequence:
 * 1. Movement card flips to reveal movement value
 * 2. Comet advances on the track
 * 3. New distance displayed
 */
export function RoundEndSequence({
  movementCard,
  newDistance,
  previousDistance,
  round,
  onComplete,
  className,
}: RoundEndSequenceProps) {
  const [phase, setPhase] = useState<"intro" | "flip" | "advance" | "complete">("intro");

  useEffect(() => {
    // Phase timings
    const timers = [
      setTimeout(() => setPhase("flip"), 800),
      setTimeout(() => setPhase("advance"), 1800),
      setTimeout(() => setPhase("complete"), 3000),
      setTimeout(() => onComplete?.(), 3500),
    ];

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  const moveSpaces = movementCard.moveSpaces;
  const isDanger = newDistance <= 6;
  const isWarning = newDistance <= 12 && newDistance > 6;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center",
        "bg-mission-dark/95 backdrop-blur-sm",
        className
      )}
    >
      <div className="max-w-md w-full mx-4">
        {/* Header */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center mb-6"
        >
          <span className="label-embossed">END OF ROUND {round}</span>
          <h2 className="text-2xl font-bold text-mission-cream mt-2">
            COMET APPROACH UPDATE
          </h2>
        </motion.div>

        {/* Movement card */}
        <div className="flex justify-center mb-8">
          <motion.div
            className="relative w-32 h-44"
            animate={{
              rotateY: phase === "flip" || phase === "advance" || phase === "complete" ? 180 : 0,
            }}
            transition={{ duration: 0.6, ease: "easeInOut" }}
            style={{ perspective: 1000, transformStyle: "preserve-3d" }}
          >
            {/* Card back */}
            <div
              className={cn(
                "absolute inset-0 rounded-sm",
                "bg-mission-move-blue border-2 border-cyan-600",
                "flex flex-col items-center justify-center"
              )}
              style={{
                backfaceVisibility: "hidden",
                boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
              }}
            >
              <div className="absolute inset-1 border border-white/10 rounded-sm" />
              <span className="text-4xl opacity-50 text-cyan-300">→</span>
              <span className="text-xs mt-2 uppercase font-bold text-cyan-300 opacity-50">
                MOVEMENT
              </span>
            </div>

            {/* Card face */}
            <div
              className={cn(
                "absolute inset-0 rounded-sm",
                "bg-mission-move-blue border-2 border-cyan-600",
                "flex flex-col items-center justify-center"
              )}
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
              }}
            >
              <span className="text-xs text-cyan-300 uppercase font-bold mb-2">
                MOVEMENT
              </span>
              <motion.span
                className="led-segment text-6xl text-cyan-300 font-bold"
                animate={phase === "advance" ? {
                  scale: [1, 1.2, 1],
                  textShadow: [
                    "0 0 10px #00bcd4",
                    "0 0 30px #00bcd4",
                    "0 0 10px #00bcd4",
                  ],
                } : {}}
                transition={{ duration: 0.5 }}
              >
                -{moveSpaces}
              </motion.span>
              <span className="text-xs text-cyan-300/70 mt-2">UNITS</span>
            </div>
          </motion.div>
        </div>

        {/* Distance update */}
        <AnimatePresence>
          {(phase === "advance" || phase === "complete") && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="panel-retro p-4"
            >
              {/* Animated track */}
              <div className="flex items-center justify-center gap-4 mb-4">
                <div className="text-center">
                  <span className="text-[10px] text-mission-steel block">PREVIOUS</span>
                  <span className="led-segment text-2xl text-mission-steel">
                    {previousDistance}
                  </span>
                </div>

                <motion.div
                  animate={{ x: [0, 5, 0] }}
                  transition={{ duration: 0.5, repeat: 2 }}
                >
                  <span className="text-2xl text-mission-red">→</span>
                </motion.div>

                <div className="text-center">
                  <span className="text-[10px] text-mission-steel block">CURRENT</span>
                  <motion.span
                    className={cn(
                      "led-segment text-3xl font-bold",
                      isDanger && "text-mission-red",
                      isWarning && "text-mission-amber",
                      !isDanger && !isWarning && "text-mission-green"
                    )}
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 0.3 }}
                  >
                    {newDistance}
                  </motion.span>
                </div>
              </div>

              {/* Alert message */}
              <div
                className={cn(
                  "text-center px-4 py-2 rounded font-bold text-sm uppercase",
                  isDanger && "bg-mission-red/20 text-mission-red border border-mission-red animate-pulse",
                  isWarning && "bg-mission-amber/20 text-mission-amber border border-mission-amber",
                  !isDanger && !isWarning && "bg-mission-green/20 text-mission-green border border-mission-green"
                )}
              >
                {isDanger
                  ? "⚠ CRITICAL - IMPACT IMMINENT"
                  : isWarning
                    ? "⚠ WARNING - APPROACHING DANGER ZONE"
                    : "STATUS NOMINAL"}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Continue prompt */}
        <AnimatePresence>
          {phase === "complete" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center mt-6"
            >
              <span className="text-xs text-mission-steel animate-pulse">
                Continuing to next round...
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/**
 * Compact movement card reveal (for inline display)
 */
export function MovementCardReveal({
  moveSpaces,
  isNew,
}: {
  moveSpaces: number;
  isNew?: boolean;
}) {
  return (
    <motion.div
      initial={isNew ? { scale: 0.8, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      className={cn(
        "inline-flex items-center gap-2 px-2 py-1 rounded",
        "bg-mission-move-blue/30 border border-cyan-600/50"
      )}
    >
      <span className="text-xs text-cyan-300 uppercase">Last Move:</span>
      <span className="led-segment text-lg text-cyan-300 font-bold">-{moveSpaces}</span>
    </motion.div>
  );
}
