"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/cn";
import { motion, AnimatePresence } from "framer-motion";

interface RocketLaunchAnimationProps {
  diceRoll: number;
  accuracyNeeded: number;
  isHit: boolean;
  power: number;
  destroyed: boolean;
  baseStrength: number;
  playerName: string;
  isReroll?: boolean;
  isSabotaged?: boolean;
  canReroll?: boolean;
  mustReroll?: boolean;
  isCurrentPlayer?: boolean;
  onComplete?: () => void;
  onUseReroll?: () => void;
  onDeclineReroll?: () => void;
  onMustReroll?: () => void;
  className?: string;
}

type AnimationPhase =
  | "waiting_for_roll"
  | "dice_rolling"
  | "dice_result"
  | "rocket_launching"
  | "rocket_flying"
  | "impact"
  | "complete";

/**
 * Full rocket launch animation sequence:
 * 0. Wait for player to click Roll button
 * 1. Dice roll (trajectory calculation)
 * 2. Rocket launch from pad
 * 3. Rocket flying toward comet
 * 4. Impact (hit/miss animation)
 * 5. Results display
 */
export function RocketLaunchAnimation({
  diceRoll,
  accuracyNeeded,
  isHit,
  power,
  destroyed,
  baseStrength,
  playerName,
  isReroll = false,
  isSabotaged = false,
  canReroll = false,
  mustReroll = false,
  isCurrentPlayer = false,
  onComplete,
  onUseReroll,
  onDeclineReroll,
  onMustReroll,
  className,
}: RocketLaunchAnimationProps) {
  // Start in waiting phase for current player, skip to rolling for spectators
  const [phase, setPhase] = useState<AnimationPhase>(
    isCurrentPlayer ? "waiting_for_roll" : "dice_rolling"
  );
  const [displayValue, setDisplayValue] = useState(1);

  // Handle roll button click
  const handleRollClick = () => {
    if (phase === "waiting_for_roll") {
      setPhase("dice_rolling");
    }
  };

  // Dice rolling animation
  useEffect(() => {
    if (phase !== "dice_rolling") return;

    const interval = setInterval(() => {
      setDisplayValue(Math.floor(Math.random() * 6) + 1);
    }, 80);

    const timeout = setTimeout(() => {
      clearInterval(interval);
      setDisplayValue(diceRoll);
      setPhase("dice_result");
    }, 1200);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [phase, diceRoll]);

  // After dice result, move to rocket launch (with delay for dramatic effect)
  useEffect(() => {
    if (phase !== "dice_result") return;

    // If mustReroll or canReroll, don't auto-advance - wait for user action
    if (mustReroll || canReroll) return;

    const timeout = setTimeout(() => {
      setPhase("rocket_launching");
    }, 1500);

    return () => clearTimeout(timeout);
  }, [phase, mustReroll, canReroll]);

  // Rocket launching
  useEffect(() => {
    if (phase !== "rocket_launching") return;

    const timeout = setTimeout(() => {
      setPhase("rocket_flying");
    }, 800);

    return () => clearTimeout(timeout);
  }, [phase]);

  // Rocket flying
  useEffect(() => {
    if (phase !== "rocket_flying") return;

    const timeout = setTimeout(() => {
      setPhase("impact");
    }, 1200);

    return () => clearTimeout(timeout);
  }, [phase]);

  // Impact
  useEffect(() => {
    if (phase !== "impact") return;

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

  const showWaitingPhase = phase === "waiting_for_roll";
  const showDicePhase = phase === "dice_rolling" || phase === "dice_result";
  const showRocketPhase = phase === "rocket_launching" || phase === "rocket_flying" || phase === "impact";
  const showCompletePhase = phase === "complete";

  return (
    <div className={cn("panel-retro p-4", className)}>
      <span className="label-embossed text-[10px] block text-center mb-3">
        {playerName}&apos;s ROCKET LAUNCH
        {isReroll && <span className="ml-2 text-mission-amber">(REROLL)</span>}
        {isSabotaged && <span className="ml-2 text-mission-red">(SABOTAGED)</span>}
      </span>

      {/* Phase 0: Waiting for Roll */}
      <AnimatePresence mode="wait">
        {showWaitingPhase && (
          <motion.div
            key="waiting"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="relative bg-mission-dark rounded border-2 border-mission-steel-dark p-6 overflow-hidden">
              <div className="text-center">
                <div className="mb-4">
                  <span className="text-4xl">🎯</span>
                </div>
                <div className="text-mission-cream mb-2">
                  <span className="led-segment text-lg">TRAJECTORY CALCULATION</span>
                </div>
                <p className="text-sm text-mission-steel mb-4">
                  Need to roll ≤{accuracyNeeded} to hit target
                </p>

                {isCurrentPlayer && (
                  <motion.button
                    onClick={handleRollClick}
                    className="btn-mission px-8 py-3 bg-mission-amber text-mission-red font-bold rounded-lg text-lg"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    animate={{
                      boxShadow: [
                        "0 0 10px rgba(255,191,0,0.3)",
                        "0 0 20px rgba(255,191,0,0.6)",
                        "0 0 10px rgba(255,191,0,0.3)",
                      ],
                    }}
                    transition={{
                      boxShadow: { duration: 1.5, repeat: Infinity },
                    }}
                  >
                    🎲 ROLL DICE
                  </motion.button>
                )}

                {!isCurrentPlayer && (
                  <p className="text-sm text-mission-amber animate-pulse">
                    Waiting for {playerName} to roll...
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* Phase 1: Dice Roll */}
        {showDicePhase && (
          <motion.div
            key="dice"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Dice tray */}
            <div className="relative bg-mission-dark rounded border-2 border-mission-steel-dark p-4 overflow-hidden">
              <div className="text-center mb-2">
                <span className="text-[10px] text-mission-steel">TRAJECTORY CALCULATION</span>
              </div>

              {/* Rolling dice */}
              <div className="flex justify-center items-center h-24">
                <motion.div
                  className={cn(
                    "relative w-16 h-16 rounded-lg",
                    "bg-mission-cream border-2",
                    phase === "dice_result" && isHit && "border-mission-green shadow-glow-green",
                    phase === "dice_result" && !isHit && "border-mission-red shadow-glow-red",
                    phase === "dice_rolling" && "border-mission-steel"
                  )}
                  animate={
                    phase === "dice_rolling"
                      ? {
                          rotate: [0, 90, 180, 270, 360],
                          scale: [1, 1.1, 0.9, 1.05, 1],
                          x: [-10, 10, -5, 5, 0],
                          y: [-5, 5, -10, 5, 0],
                        }
                      : { scale: [1, 1.2, 1], rotate: 0 }
                  }
                  transition={
                    phase === "dice_rolling"
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
                                  phase === "dice_result" && isHit && "bg-mission-green",
                                  phase === "dice_result" && !isHit && "bg-mission-red",
                                  phase === "dice_rolling" && "bg-mission-dark"
                                )}
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
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
              {phase === "dice_result" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4"
                >
                  <div className="flex items-center justify-center gap-4">
                    <div className="text-center">
                      <span className="text-[10px] text-mission-steel block">ROLLED</span>
                      <span
                        className={cn(
                          "led-segment text-3xl font-bold",
                          isHit ? "text-mission-green" : "text-mission-red"
                        )}
                      >
                        {diceRoll}
                      </span>
                    </div>

                    <span className="text-mission-steel text-lg">vs</span>

                    <div className="text-center">
                      <span className="text-[10px] text-mission-steel block">NEEDED</span>
                      <span className="led-segment text-3xl font-bold text-mission-amber">
                        ≤{accuracyNeeded}
                      </span>
                    </div>
                  </div>

                  {/* Trajectory result */}
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className={cn(
                      "mt-3 px-4 py-2 rounded font-bold text-sm uppercase text-center",
                      isHit
                        ? "bg-mission-green/20 text-mission-green border border-mission-green"
                        : "bg-mission-red/20 text-mission-red border border-mission-red"
                    )}
                  >
                    {isHit ? "TRAJECTORY LOCKED" : "TRAJECTORY MISS"}
                  </motion.div>

                  {/* Must Reroll (Sabotage) */}
                  {mustReroll && isCurrentPlayer && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="mt-4 pt-4 border-t border-mission-steel-dark text-center"
                    >
                      <p className="text-sm text-mission-red mb-3">
                        Your launch was sabotaged! You must reroll.
                      </p>
                      <button
                        onClick={onMustReroll}
                        className="btn-mission px-6 py-2 bg-mission-amber text-mission-red font-bold rounded"
                      >
                        Reroll Trajectory
                      </button>
                    </motion.div>
                  )}

                  {/* Can Reroll (Token) */}
                  {canReroll && !mustReroll && isCurrentPlayer && !isHit && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="mt-4 pt-4 border-t border-mission-steel-dark text-center"
                    >
                      <p className="text-sm text-mission-cream/80 mb-3">
                        You have a reroll token! Try again?
                      </p>
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={onUseReroll}
                          className="btn-mission px-4 py-2 bg-mission-green text-white font-bold rounded"
                        >
                          Use Reroll
                        </button>
                        <button
                          onClick={onDeclineReroll}
                          className="btn-mission px-4 py-2 bg-mission-red text-white font-bold rounded"
                        >
                          Accept Miss
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Waiting for decision (other players) */}
                  {(mustReroll || (canReroll && !isHit)) && !isCurrentPlayer && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mt-4 pt-4 border-t border-mission-steel-dark text-center"
                    >
                      <p className="text-sm text-mission-amber animate-pulse">
                        Waiting for {playerName} to {mustReroll ? "reroll" : "decide"}...
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* Phase 2: Rocket Flight */}
        {showRocketPhase && (
          <motion.div
            key="rocket"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="relative bg-mission-dark rounded border-2 border-mission-steel-dark p-4 overflow-hidden h-48">
              {/* Starfield background */}
              <div className="absolute inset-0">
                {[...Array(20)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-1 h-1 bg-white rounded-full"
                    style={{
                      left: `${Math.random() * 100}%`,
                      top: `${Math.random() * 100}%`,
                      opacity: Math.random() * 0.5 + 0.3,
                    }}
                    animate={{
                      x: phase === "rocket_flying" ? [-50, 50] : 0,
                      opacity: [0.3, 0.8, 0.3],
                    }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      delay: Math.random() * 0.5,
                    }}
                  />
                ))}
              </div>

              {/* Comet (target) */}
              <motion.div
                className="absolute top-4 right-4"
                initial={{ scale: 0.8, x: 20 }}
                animate={{
                  scale: phase === "impact" ? (isHit ? 1.3 : 1) : 1,
                  x: 0,
                }}
              >
                <div className="relative">
                  {/* Comet tail */}
                  <motion.div
                    className="absolute -right-8 top-1/2 -translate-y-1/2 w-12 h-4"
                    style={{
                      background: "linear-gradient(to right, rgba(255,191,0,0.8), transparent)",
                      filter: "blur(2px)",
                    }}
                    animate={{
                      scaleX: [1, 1.2, 1],
                      opacity: [0.6, 1, 0.6],
                    }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  />
                  {/* Comet body */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-300 to-gray-600 border-2 border-gray-400 relative z-10">
                    {/* Impact effect on hit */}
                    {phase === "impact" && isHit && (
                      <motion.div
                        className="absolute inset-0 rounded-full"
                        initial={{ scale: 1, opacity: 1 }}
                        animate={{ scale: 2, opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        style={{
                          background: destroyed
                            ? "radial-gradient(circle, rgba(255,100,0,1) 0%, transparent 70%)"
                            : "radial-gradient(circle, rgba(255,191,0,1) 0%, transparent 70%)",
                        }}
                      />
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Rocket */}
              <motion.div
                className="absolute bottom-8 left-8"
                initial={{ x: 0, y: 0, rotate: -45 }}
                animate={
                  phase === "rocket_launching"
                    ? { y: -20, scale: [1, 1.1, 1] }
                    : phase === "rocket_flying"
                      ? { x: 120, y: -80, scale: 0.8 }
                      : phase === "impact"
                        ? isHit
                          ? { x: 140, y: -100, opacity: 0, scale: 0 }
                          : { x: 200, y: -120, opacity: 0.3 }
                        : {}
                }
                transition={
                  phase === "rocket_launching"
                    ? { duration: 0.5, ease: "easeOut" }
                    : phase === "rocket_flying"
                      ? { duration: 1, ease: "easeIn" }
                      : { duration: 0.3 }
                }
              >
                <div className="relative">
                  {/* Rocket exhaust */}
                  <motion.div
                    className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-3 h-8"
                    style={{
                      background: "linear-gradient(to bottom, rgba(255,100,0,1), rgba(255,200,0,0.5), transparent)",
                      filter: "blur(2px)",
                      transformOrigin: "top",
                    }}
                    animate={{
                      scaleY: [0.8, 1.2, 0.8],
                      opacity: [0.8, 1, 0.8],
                    }}
                    transition={{ duration: 0.15, repeat: Infinity }}
                  />
                  {/* Rocket body */}
                  <div className="w-6 h-10 bg-gradient-to-b from-gray-200 to-gray-400 rounded-t-full relative">
                    {/* Nose cone */}
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[10px] border-l-transparent border-r-transparent border-b-mission-red" />
                    {/* Window */}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-cyan-400 border border-cyan-600" />
                    {/* Fins */}
                    <div className="absolute bottom-0 -left-1 w-0 h-0 border-t-[8px] border-r-[6px] border-t-transparent border-r-gray-500" />
                    <div className="absolute bottom-0 -right-1 w-0 h-0 border-t-[8px] border-l-[6px] border-t-transparent border-l-gray-500" />
                  </div>
                </div>
              </motion.div>

              {/* Status text */}
              <motion.div
                className="absolute bottom-2 left-1/2 -translate-x-1/2 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <span className={cn(
                  "text-xs font-bold uppercase",
                  phase === "rocket_launching" && "text-mission-amber",
                  phase === "rocket_flying" && "text-cyan-400",
                  phase === "impact" && isHit && "text-mission-green",
                  phase === "impact" && !isHit && "text-mission-red"
                )}>
                  {phase === "rocket_launching" && "LAUNCH INITIATED"}
                  {phase === "rocket_flying" && "IN FLIGHT..."}
                  {phase === "impact" && isHit && (destroyed ? "TARGET DESTROYED!" : "IMPACT!")}
                  {phase === "impact" && !isHit && "MISSED TARGET"}
                </span>
              </motion.div>

              {/* Miss effect - rocket flies past */}
              {phase === "impact" && !isHit && (
                <motion.div
                  className="absolute top-4 right-4 text-2xl"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 0.5 }}
                >
                  💨
                </motion.div>
              )}

              {/* Hit effect - explosion */}
              {phase === "impact" && isHit && (
                <motion.div
                  className="absolute top-4 right-4"
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.5, 1] }}
                  transition={{ duration: 0.3 }}
                >
                  <span className="text-3xl">{destroyed ? "💥" : "💫"}</span>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {/* Phase 3: Complete - Results */}
        {showCompletePhase && (
          <motion.div
            key="complete"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className={cn(
              "bg-mission-dark rounded border-2 p-4",
              destroyed && "border-mission-green",
              isHit && !destroyed && "border-mission-amber",
              !isHit && "border-mission-red"
            )}>
              <div className="text-center">
                {/* Result icon */}
                <div className="text-4xl mb-2">
                  {destroyed ? "💥" : isHit ? "💫" : "💨"}
                </div>

                {/* Result message */}
                <div className={cn(
                  "led-segment text-xl mb-2",
                  destroyed && "text-mission-green",
                  isHit && !destroyed && "text-mission-amber",
                  !isHit && "text-mission-red"
                )}>
                  {destroyed ? "TARGET DESTROYED" : isHit ? "TARGET HIT" : "TRAJECTORY MISS"}
                </div>

                {/* Details */}
                {isHit && (
                  <div className="text-sm text-mission-cream/80">
                    {destroyed ? (
                      <span>+{baseStrength} points earned!</span>
                    ) : (
                      <span>-{power} damage dealt</span>
                    )}
                  </div>
                )}

                {/* Dice result badge */}
                <div className="mt-3 flex items-center justify-center gap-2">
                  <div className={cn(
                    "w-8 h-8 rounded flex items-center justify-center",
                    "bg-mission-cream border-2",
                    isHit ? "border-mission-green" : "border-mission-red"
                  )}>
                    <span className="font-bold text-mission-dark">{diceRoll}</span>
                  </div>
                  <span className="text-mission-steel text-xs">≤{accuracyNeeded}</span>
                  <span className={cn(
                    "text-xs font-bold",
                    isHit ? "text-mission-green" : "text-mission-red"
                  )}>
                    {isHit ? "HIT" : "MISS"}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
