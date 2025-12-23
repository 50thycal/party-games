"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import { motion, AnimatePresence } from "framer-motion";

interface DiceRollProps {
  result: number;
  targetValue: number; // Need to roll <= this
  isSuccess: boolean;
  onComplete?: () => void;
  className?: string;
}

/**
 * Animated dice roll display
 * Shows dice tumbling in a retro-styled tray, then reveals result
 * Styled like rolling physical dice on a mission control desk
 */
export function DiceRoll({
  result,
  targetValue,
  isSuccess,
  onComplete,
  className,
}: DiceRollProps) {
  const [phase, setPhase] = useState<"rolling" | "revealing" | "complete">("rolling");
  const [displayValue, setDisplayValue] = useState(1);

  // Cycle through random values while rolling
  useEffect(() => {
    if (phase !== "rolling") return;

    const interval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 6) + 1);
    }, 80);

    // Stop rolling after 1.2 seconds
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setDisplayValue(result);
      setPhase("revealing");
    }, 1200);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [phase, result]);

  // Complete after reveal
  useEffect(() => {
    if (phase !== "revealing") return;

    const timeout = setTimeout(() => {
      setPhase("complete");
      onComplete?.();
    }, 1500);

    return () => clearTimeout(timeout);
  }, [phase, onComplete]);

  // Dice face dot patterns
  const getDiceFace = (value: number) => {
    const patterns: Record<number, [number, number][]> = {
      1: [[1, 1]],
      2: [[0, 0], [2, 2]],
      3: [[0, 0], [1, 1], [2, 2]],
      4: [[0, 0], [0, 2], [2, 0], [2, 2]],
      5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
      6: [[0, 0], [0, 1], [0, 2], [2, 0], [2, 1], [2, 2]],
    };
    return patterns[value] || patterns[1];
  };

  return (
    <div className={cn("panel-retro p-4", className)}>
      <span className="label-embossed text-[10px] block text-center mb-3">
        LAUNCH TRAJECTORY CALCULATION
      </span>

      {/* Dice tray */}
      <div className="relative bg-mission-dark rounded border-2 border-mission-steel-dark p-4 overflow-hidden">
        {/* Wood grain texture effect */}
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `repeating-linear-gradient(
              90deg,
              transparent,
              transparent 2px,
              rgba(139, 90, 43, 0.3) 2px,
              rgba(139, 90, 43, 0.3) 4px
            )`,
          }}
        />

        {/* Rolling dice */}
        <div className="flex justify-center items-center h-24">
          <motion.div
            className={cn(
              "relative w-16 h-16 rounded-lg",
              "bg-mission-cream border-2",
              phase === "complete" && isSuccess && "border-mission-green shadow-glow-green",
              phase === "complete" && !isSuccess && "border-mission-red shadow-glow-red",
              phase !== "complete" && "border-mission-steel"
            )}
            animate={
              phase === "rolling"
                ? {
                    rotate: [0, 90, 180, 270, 360],
                    scale: [1, 1.1, 0.9, 1.05, 1],
                    x: [-10, 10, -5, 5, 0],
                    y: [-5, 5, -10, 5, 0],
                  }
                : phase === "revealing"
                  ? { scale: [1, 1.2, 1], rotate: 0 }
                  : {}
            }
            transition={
              phase === "rolling"
                ? { duration: 0.3, repeat: Infinity, ease: "linear" }
                : { duration: 0.3 }
            }
            style={{
              boxShadow: "inset -2px -2px 4px rgba(0,0,0,0.2), 2px 2px 4px rgba(0,0,0,0.3)",
            }}
          >
            {/* Dice face */}
            <div className="absolute inset-2 grid grid-cols-3 grid-rows-3 gap-0.5">
              {[0, 1, 2].map((row) =>
                [0, 1, 2].map((col) => {
                  const hasDot = getDiceFace(displayValue).some(
                    ([r, c]) => r === row && c === col
                  );
                  return (
                    <div key={`${row}-${col}`} className="flex items-center justify-center">
                      {hasDot && (
                        <motion.div
                          className={cn(
                            "w-2.5 h-2.5 rounded-full",
                            phase === "complete" && isSuccess && "bg-mission-green",
                            phase === "complete" && !isSuccess && "bg-mission-red",
                            phase !== "complete" && "bg-mission-dark"
                          )}
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: phase === "revealing" ? 0.1 : 0 }}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        </div>

        {/* Result display */}
        <AnimatePresence>
          {phase !== "rolling" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-center"
            >
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <span className="text-[10px] text-mission-steel block">ROLLED</span>
                  <span
                    className={cn(
                      "led-segment text-3xl font-bold",
                      isSuccess ? "text-mission-green" : "text-mission-red"
                    )}
                  >
                    {result}
                  </span>
                </div>

                <span className="text-mission-steel text-lg">vs</span>

                <div className="text-center">
                  <span className="text-[10px] text-mission-steel block">NEEDED</span>
                  <span className="led-segment text-3xl font-bold text-mission-amber">
                    ≤{targetValue}
                  </span>
                </div>
              </div>

              {/* Result message */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className={cn(
                  "mt-3 px-4 py-2 rounded font-bold text-sm uppercase",
                  isSuccess
                    ? "bg-mission-green/20 text-mission-green border border-mission-green"
                    : "bg-mission-red/20 text-mission-red border border-mission-red"
                )}
              >
                {isSuccess ? "TARGET HIT" : "TRAJECTORY MISS"}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Compact dice result display (for showing in launch results)
 */
export function DiceResultBadge({
  result,
  targetValue,
  isSuccess,
}: {
  result: number;
  targetValue: number;
  isSuccess: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-2">
      <div
        className={cn(
          "w-8 h-8 rounded flex items-center justify-center",
          "bg-mission-cream border-2",
          isSuccess ? "border-mission-green" : "border-mission-red"
        )}
      >
        <span className="font-bold text-mission-dark">{result}</span>
      </div>
      <span className="text-mission-steel text-xs">≤{targetValue}</span>
      <span
        className={cn(
          "text-xs font-bold",
          isSuccess ? "text-mission-green" : "text-mission-red"
        )}
      >
        {isSuccess ? "HIT" : "MISS"}
      </span>
    </div>
  );
}
