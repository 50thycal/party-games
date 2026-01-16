"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";

interface GameOutcomeSequenceProps {
  outcome: "victory" | "defeat";
  onComplete?: () => void;
  className?: string;
}

// Generate confetti particles
function generateConfetti(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 2,
    rotation: Math.random() * 360,
    color: ['#33ff33', '#ffcc00', '#00bcd4', '#f7931e', '#ff6b35'][Math.floor(Math.random() * 5)],
    size: 6 + Math.random() * 8,
  }));
}

// Generate explosion debris
function generateDebris(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    angle: (i / count) * 360 + Math.random() * 20,
    distance: 100 + Math.random() * 200,
    size: 8 + Math.random() * 16,
    duration: 1 + Math.random() * 1,
    color: ['#ff6b35', '#ff4444', '#ffcc00', '#f7931e'][Math.floor(Math.random() * 4)],
  }));
}

/**
 * Dramatic game outcome sequence
 * Victory: Comet explodes with confetti celebration
 * Defeat: Comet impact with earth destruction
 */
export function GameOutcomeSequence({
  outcome,
  onComplete,
  className,
}: GameOutcomeSequenceProps) {
  const [phase, setPhase] = useState<"intro" | "action" | "result" | "fadeout">("intro");
  const [confetti] = useState(() => generateConfetti(40));
  const [debris] = useState(() => generateDebris(24));

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("action"), 800),
      setTimeout(() => setPhase("result"), 2000),
      setTimeout(() => setPhase("fadeout"), 4500),
      setTimeout(() => onComplete?.(), 5000),
    ];

    return () => timers.forEach(clearTimeout);
  }, [onComplete]);

  const isVictory = outcome === "victory";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: phase === "fadeout" ? 0 : 1 }}
      transition={{ duration: 0.5 }}
      className={cn(
        "fixed inset-0 z-[400] flex items-center justify-center overflow-hidden",
        isVictory ? "bg-mission-dark" : "bg-black",
        className
      )}
    >
      {/* Stars background */}
      <div className="absolute inset-0">
        {[...Array(30)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              opacity: Math.random() * 0.5 + 0.3,
            }}
            animate={{ opacity: [0.3, 0.8, 0.3] }}
            transition={{ duration: 1 + Math.random(), repeat: Infinity, delay: Math.random() }}
          />
        ))}
      </div>

      {/* VICTORY SEQUENCE */}
      {isVictory && (
        <>
          {/* Comet (explodes in action phase) */}
          <AnimatePresence>
            {(phase === "intro" || phase === "action") && (
              <motion.div
                className="absolute"
                initial={{ scale: 1, x: 0, y: 0 }}
                animate={phase === "action" ? { scale: [1, 1.5, 0], opacity: [1, 1, 0] } : {}}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
              >
                {/* Comet body */}
                <div className="relative">
                  <motion.div
                    className="w-24 h-24 rounded-full bg-gradient-to-br from-gray-300 to-gray-600 border-4 border-gray-400"
                    animate={phase === "intro" ? { rotate: [0, 5, -5, 0] } : {}}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  {/* Comet tail */}
                  <motion.div
                    className="absolute top-1/2 -right-16 -translate-y-1/2 w-20 h-8"
                    style={{
                      background: "linear-gradient(to right, rgba(255,191,0,0.8), transparent)",
                      filter: "blur(4px)",
                    }}
                    animate={{ scaleX: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Explosion flash */}
          {phase === "action" && (
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              transition={{ duration: 0.4 }}
              style={{
                background: "radial-gradient(circle at center, rgba(255,255,255,1) 0%, rgba(255,200,0,0.8) 30%, transparent 70%)",
              }}
            />
          )}

          {/* Explosion debris */}
          {(phase === "action" || phase === "result") && debris.map((d) => (
            <motion.div
              key={d.id}
              className="absolute rounded-full"
              style={{
                width: d.size,
                height: d.size,
                backgroundColor: d.color,
                boxShadow: `0 0 ${d.size}px ${d.color}`,
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: Math.cos((d.angle * Math.PI) / 180) * d.distance,
                y: Math.sin((d.angle * Math.PI) / 180) * d.distance,
                opacity: 0,
                scale: 0.2,
              }}
              transition={{ duration: d.duration, ease: "easeOut" }}
            />
          ))}

          {/* Confetti celebration */}
          {(phase === "result" || phase === "fadeout") && confetti.map((c) => (
            <motion.div
              key={c.id}
              className="absolute top-0"
              style={{
                left: `${c.x}%`,
                width: c.size,
                height: c.size,
                backgroundColor: c.color,
                borderRadius: Math.random() > 0.5 ? "50%" : "2px",
              }}
              initial={{ y: -20, rotate: 0, opacity: 1 }}
              animate={{
                y: window.innerHeight + 100,
                rotate: c.rotation * 3,
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: c.duration,
                delay: c.delay,
                ease: "easeIn",
              }}
            />
          ))}

          {/* Victory text */}
          <AnimatePresence>
            {(phase === "result" || phase === "fadeout") && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="relative z-10 text-center"
              >
                <motion.div
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <span className="text-6xl block mb-4">🎉</span>
                </motion.div>
                <h1 className="led-segment text-4xl font-bold text-mission-green drop-shadow-[0_0_30px_rgba(51,255,51,0.8)] mb-2">
                  MISSION COMPLETE
                </h1>
                <p className="text-xl text-mission-cream">Humanity is saved!</p>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* DEFEAT SEQUENCE */}
      {!isVictory && (
        <>
          {/* Earth */}
          <motion.div
            className="absolute"
            style={{ bottom: "15%", left: "50%", x: "-50%" }}
            animate={phase === "action" ? {
              scale: [1, 1.1, 0],
              opacity: [1, 1, 0],
            } : {}}
            transition={{ duration: 0.8, delay: 0.3 }}
          >
            <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-400 via-green-400 to-blue-600 border-4 border-blue-300 relative overflow-hidden">
              {/* Land masses */}
              <div className="absolute top-4 left-6 w-8 h-6 bg-green-500 rounded-full opacity-70" />
              <div className="absolute bottom-6 right-4 w-10 h-8 bg-green-500 rounded-full opacity-70" />
              {/* Clouds */}
              <div className="absolute top-2 right-6 w-6 h-3 bg-white rounded-full opacity-50" />
              <div className="absolute bottom-4 left-8 w-8 h-3 bg-white rounded-full opacity-50" />
            </div>
          </motion.div>

          {/* Comet approaching */}
          <motion.div
            className="absolute"
            initial={{ top: "10%", scale: 0.3 }}
            animate={
              phase === "intro"
                ? { top: "10%", scale: 0.3 }
                : phase === "action"
                  ? { top: "40%", scale: 1.5, opacity: [1, 1, 0] }
                  : {}
            }
            transition={{ duration: 1, ease: "easeIn" }}
          >
            <div className="relative">
              <motion.div
                className="w-20 h-20 rounded-full bg-gradient-to-br from-gray-300 to-gray-600 border-2 border-gray-400"
                animate={{ rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, repeat: Infinity }}
              />
              {/* Tail pointing up */}
              <motion.div
                className="absolute bottom-full left-1/2 -translate-x-1/2 w-8 h-16"
                style={{
                  background: "linear-gradient(to top, rgba(255,191,0,0.8), transparent)",
                  filter: "blur(4px)",
                }}
                animate={{ scaleY: [1, 1.4, 1] }}
                transition={{ duration: 0.3, repeat: Infinity }}
              />
            </div>
          </motion.div>

          {/* Impact flash */}
          {phase === "action" && (
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.8, 0] }}
              transition={{ duration: 1, delay: 0.5 }}
              style={{
                background: "radial-gradient(circle at 50% 60%, rgba(255,100,0,1) 0%, rgba(255,50,0,0.8) 30%, rgba(0,0,0,1) 70%)",
              }}
            />
          )}

          {/* Shockwave rings */}
          {phase === "action" && (
            <>
              {[1, 2, 3].map((i) => (
                <motion.div
                  key={i}
                  className="absolute rounded-full border-4 border-orange-500"
                  style={{ bottom: "15%", left: "50%", x: "-50%", y: "50%" }}
                  initial={{ width: 0, height: 0, opacity: 1 }}
                  animate={{ width: 400 + i * 100, height: 400 + i * 100, opacity: 0 }}
                  transition={{ duration: 1.5, delay: 0.5 + i * 0.2, ease: "easeOut" }}
                />
              ))}
            </>
          )}

          {/* Destruction debris */}
          {(phase === "action" || phase === "result") && debris.map((d) => (
            <motion.div
              key={d.id}
              className="absolute rounded-full"
              style={{
                width: d.size,
                height: d.size,
                backgroundColor: d.id % 3 === 0 ? "#4488ff" : d.color,
                boxShadow: `0 0 ${d.size}px ${d.id % 3 === 0 ? "#4488ff" : d.color}`,
                bottom: "15%",
                left: "50%",
              }}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{
                x: Math.cos((d.angle * Math.PI) / 180) * d.distance * 1.5,
                y: Math.sin((d.angle * Math.PI) / 180) * d.distance * 1.5 - 100,
                opacity: 0,
                scale: 0.1,
              }}
              transition={{ duration: d.duration * 1.5, delay: 0.6, ease: "easeOut" }}
            />
          ))}

          {/* Defeat text */}
          <AnimatePresence>
            {(phase === "result" || phase === "fadeout") && (
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 150, damping: 20 }}
                className="relative z-10 text-center"
              >
                <motion.div
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <span className="text-6xl block mb-4">💀</span>
                </motion.div>
                <h1 className="led-segment text-4xl font-bold text-mission-red drop-shadow-[0_0_30px_rgba(255,51,51,0.8)] mb-2">
                  MISSION FAILED
                </h1>
                <p className="text-xl text-mission-cream/80">Earth has been destroyed.</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Screen crack effect for defeat */}
          {(phase === "result" || phase === "fadeout") && (
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none z-20"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              <motion.path
                d="M50 45 L48 30 L52 20 M50 45 L55 35 L60 25 M50 45 L45 50 L35 55 M50 45 L55 52 L65 50"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth="0.3"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
              />
            </svg>
          )}
        </>
      )}
    </motion.div>
  );
}
