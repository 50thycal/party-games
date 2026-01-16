"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";

interface TurnAnnouncementOverlayProps {
  playerName: string;
  isCurrentPlayer: boolean;
  onComplete?: () => void;
  className?: string;
}

/**
 * Full-screen turn announcement overlay
 * Appears briefly when a new turn begins, then fades out
 */
export function TurnAnnouncementOverlay({
  playerName,
  isCurrentPlayer,
  onComplete,
  className,
}: TurnAnnouncementOverlayProps) {
  const [phase, setPhase] = useState<"enter" | "display" | "exit">("enter");

  // Use ref to avoid resetting timers when onComplete callback changes
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("display"), 100),
      setTimeout(() => setPhase("exit"), 1200),
      setTimeout(() => onCompleteRef.current?.(), 1600),
    ];

    return () => timers.forEach(clearTimeout);
  }, []); // Empty deps - run once on mount

  return (
    <AnimatePresence>
      {phase !== "exit" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className={cn(
            "fixed inset-0 z-[300] flex items-center justify-center pointer-events-none",
            className
          )}
        >
          {/* Background flash */}
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.3, 0.1] }}
            transition={{ duration: 0.4 }}
            style={{
              background: isCurrentPlayer
                ? "radial-gradient(ellipse at center, rgba(51, 255, 51, 0.3) 0%, transparent 70%)"
                : "radial-gradient(ellipse at center, rgba(100, 100, 100, 0.2) 0%, transparent 70%)",
            }}
          />

          {/* Central announcement */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.1, opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 20,
            }}
            className="relative"
          >
            {/* Glow ring behind text */}
            <motion.div
              className="absolute inset-0 -m-8 rounded-full"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: [0.8, 1.2, 1], opacity: [0, 0.6, 0.3] }}
              transition={{ duration: 0.5 }}
              style={{
                background: isCurrentPlayer
                  ? "radial-gradient(circle, rgba(51, 255, 51, 0.4) 0%, transparent 70%)"
                  : "radial-gradient(circle, rgba(150, 150, 150, 0.3) 0%, transparent 70%)",
              }}
            />

            {/* Main text container */}
            <div className="relative text-center px-8 py-6">
              {/* Player name */}
              <motion.div
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="mb-2"
              >
                <span className={cn(
                  "text-xl font-bold tracking-wide",
                  isCurrentPlayer ? "text-mission-green" : "text-mission-steel"
                )}>
                  {isCurrentPlayer ? "YOUR" : `${playerName.toUpperCase()}'S`}
                </span>
              </motion.div>

              {/* TURN text */}
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 400 }}
              >
                <span className={cn(
                  "led-segment text-5xl font-bold tracking-wider",
                  isCurrentPlayer
                    ? "text-mission-green drop-shadow-[0_0_20px_rgba(51,255,51,0.8)]"
                    : "text-mission-cream drop-shadow-[0_0_10px_rgba(200,200,200,0.5)]"
                )}>
                  TURN
                </span>
              </motion.div>

              {/* Decorative lines */}
              <div className="flex items-center justify-center gap-4 mt-3">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                  className={cn(
                    "h-0.5 w-16",
                    isCurrentPlayer ? "bg-mission-green/60" : "bg-mission-steel/40"
                  )}
                />
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.25 }}
                  className="text-lg"
                >
                  {isCurrentPlayer ? "⚡" : "⏳"}
                </motion.div>
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: 0.2, duration: 0.3 }}
                  className={cn(
                    "h-0.5 w-16",
                    isCurrentPlayer ? "bg-mission-green/60" : "bg-mission-steel/40"
                  )}
                />
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
