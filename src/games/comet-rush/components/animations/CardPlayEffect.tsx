"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";

type CardEffectType = "espionage" | "engineering" | "economic" | null;

interface CardPlayEffectProps {
  cardType: CardEffectType;
  onComplete?: () => void;
  className?: string;
}

// Generate sparkle particles for economic cards
function generateSparkles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 20 + Math.random() * 60, // Keep sparkles in center area
    y: 20 + Math.random() * 60,
    delay: Math.random() * 0.3,
    size: 4 + Math.random() * 8,
    duration: 0.5 + Math.random() * 0.5,
  }));
}

// Generate gear particles for engineering cards
function generateGears(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 10 + Math.random() * 80,
    y: 10 + Math.random() * 80,
    size: 16 + Math.random() * 24,
    rotation: Math.random() * 360,
    rotationSpeed: (Math.random() > 0.5 ? 1 : -1) * (180 + Math.random() * 180),
    delay: Math.random() * 0.2,
  }));
}

/**
 * Visual effect overlay when cards are played
 * - Espionage: Glitch/interference effect
 * - Economic: Golden sparkles
 * - Engineering: Mechanical gears
 */
export function CardPlayEffect({
  cardType,
  onComplete,
  className,
}: CardPlayEffectProps) {
  const [sparkles] = useState(() => generateSparkles(12));
  const [gears] = useState(() => generateGears(6));

  useEffect(() => {
    if (!cardType) return;
    const timer = setTimeout(() => onComplete?.(), 1200);
    return () => clearTimeout(timer);
  }, [cardType, onComplete]);

  if (!cardType) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={cn(
          "fixed inset-0 pointer-events-none z-[250]",
          className
        )}
      >
        {/* ESPIONAGE EFFECT - Glitch/interference */}
        {cardType === "espionage" && (
          <>
            {/* Chromatic aberration layers */}
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.15, 0.1, 0.2, 0] }}
              transition={{ duration: 0.8, times: [0, 0.1, 0.3, 0.5, 1] }}
              style={{
                background: "linear-gradient(90deg, rgba(255,0,0,0.1) 0%, transparent 33%, rgba(0,255,255,0.1) 66%, transparent 100%)",
                mixBlendMode: "screen",
              }}
            />

            {/* Scan lines intensify */}
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.4, 0.2, 0.5, 0] }}
              transition={{ duration: 1 }}
              style={{
                backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
              }}
            />

            {/* Horizontal glitch bars */}
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute left-0 right-0 bg-mission-red/30"
                style={{
                  height: 2 + Math.random() * 6,
                  top: `${15 + i * 18 + Math.random() * 10}%`,
                }}
                initial={{ scaleX: 0, x: "-100%" }}
                animate={{
                  scaleX: [0, 1, 1, 0],
                  x: ["-100%", "0%", "0%", "100%"],
                }}
                transition={{
                  duration: 0.3,
                  delay: i * 0.08,
                  ease: "easeInOut",
                }}
              />
            ))}

            {/* "INTERCEPTED" text flash */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.8, times: [0, 0.2, 0.6, 1] }}
            >
              <motion.span
                className="text-4xl font-bold text-mission-red tracking-widest"
                style={{
                  textShadow: "2px 0 #ff0000, -2px 0 #00ffff",
                }}
                animate={{
                  x: [0, -2, 3, -1, 0],
                }}
                transition={{ duration: 0.2, repeat: 3 }}
              >
                INTERCEPTED
              </motion.span>
            </motion.div>

            {/* Screen jitter */}
            <motion.div
              className="absolute inset-0 border-4 border-mission-red/50"
              animate={{
                x: [0, -2, 3, -1, 2, 0],
                y: [0, 1, -2, 1, -1, 0],
              }}
              transition={{ duration: 0.3, repeat: 2 }}
            />
          </>
        )}

        {/* ECONOMIC EFFECT - Golden sparkles */}
        {cardType === "economic" && (
          <>
            {/* Golden glow */}
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.3, 0.15, 0] }}
              transition={{ duration: 1 }}
              style={{
                background: "radial-gradient(ellipse at center, rgba(255,200,0,0.3) 0%, transparent 60%)",
              }}
            />

            {/* Sparkle particles */}
            {sparkles.map((sparkle) => (
              <motion.div
                key={sparkle.id}
                className="absolute"
                style={{
                  left: `${sparkle.x}%`,
                  top: `${sparkle.y}%`,
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: [0, 1.5, 0],
                  opacity: [0, 1, 0],
                  rotate: [0, 180],
                }}
                transition={{
                  duration: sparkle.duration,
                  delay: sparkle.delay,
                  ease: "easeOut",
                }}
              >
                <svg width={sparkle.size} height={sparkle.size} viewBox="0 0 24 24">
                  <path
                    d="M12 0L14 10L24 12L14 14L12 24L10 14L0 12L10 10Z"
                    fill="#ffcc00"
                    style={{ filter: "drop-shadow(0 0 4px #ffcc00)" }}
                  />
                </svg>
              </motion.div>
            ))}

            {/* Coin symbols floating up */}
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute text-2xl"
                style={{
                  left: `${20 + i * 12}%`,
                  bottom: "30%",
                }}
                initial={{ y: 0, opacity: 0, scale: 0.5 }}
                animate={{
                  y: -100,
                  opacity: [0, 1, 1, 0],
                  scale: [0.5, 1, 1, 0.8],
                }}
                transition={{
                  duration: 1,
                  delay: i * 0.1,
                  ease: "easeOut",
                }}
              >
                💰
              </motion.div>
            ))}

            {/* Center text */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0.5, 1, 1, 1.1] }}
              transition={{ duration: 1, times: [0, 0.2, 0.7, 1] }}
            >
              <span
                className="text-3xl font-bold text-mission-amber"
                style={{ textShadow: "0 0 20px rgba(255,200,0,0.8)" }}
              >
                PROFIT!
              </span>
            </motion.div>
          </>
        )}

        {/* ENGINEERING EFFECT - Mechanical gears */}
        {cardType === "engineering" && (
          <>
            {/* Technical overlay */}
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.2, 0.1, 0] }}
              transition={{ duration: 1 }}
              style={{
                background: "radial-gradient(ellipse at center, rgba(51,255,51,0.2) 0%, transparent 60%)",
              }}
            />

            {/* Rotating gears */}
            {gears.map((gear) => (
              <motion.div
                key={gear.id}
                className="absolute"
                style={{
                  left: `${gear.x}%`,
                  top: `${gear.y}%`,
                  width: gear.size,
                  height: gear.size,
                }}
                initial={{ rotate: gear.rotation, opacity: 0, scale: 0 }}
                animate={{
                  rotate: gear.rotation + gear.rotationSpeed,
                  opacity: [0, 0.6, 0.6, 0],
                  scale: [0, 1, 1, 0.5],
                }}
                transition={{
                  duration: 1.2,
                  delay: gear.delay,
                  ease: "easeInOut",
                }}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full">
                  <path
                    d="M50 10 L55 20 L65 15 L60 25 L75 25 L65 35 L80 40 L65 45 L75 55 L60 55 L65 70 L55 60 L50 75 L45 60 L35 70 L40 55 L25 55 L35 45 L20 40 L35 35 L25 25 L40 25 L35 15 L45 20 Z"
                    fill="none"
                    stroke="#33ff33"
                    strokeWidth="2"
                    style={{ filter: "drop-shadow(0 0 4px #33ff33)" }}
                  />
                  <circle cx="50" cy="50" r="15" fill="none" stroke="#33ff33" strokeWidth="2" />
                </svg>
              </motion.div>
            ))}

            {/* Blueprint grid lines */}
            <motion.div
              className="absolute inset-0 overflow-hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.3, 0] }}
              transition={{ duration: 1 }}
            >
              <svg width="100%" height="100%" className="opacity-30">
                <defs>
                  <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#33ff33" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </motion.div>

            {/* Center text */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: [0, 1, 1, 0], scale: [0.8, 1, 1, 1.05] }}
              transition={{ duration: 1, times: [0, 0.2, 0.7, 1] }}
            >
              <span
                className="text-3xl font-bold text-mission-green tracking-wider"
                style={{ textShadow: "0 0 20px rgba(51,255,51,0.8)" }}
              >
                UPGRADED
              </span>
            </motion.div>

            {/* Technical readout */}
            <motion.div
              className="absolute bottom-20 left-1/2 -translate-x-1/2"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: [0, 1, 1, 0], y: [20, 0, 0, -10] }}
              transition={{ duration: 1, times: [0, 0.2, 0.7, 1] }}
            >
              <div className="flex items-center gap-2 px-4 py-2 bg-mission-dark/80 rounded border border-mission-green/50">
                <span className="text-mission-green text-sm font-mono">SYS.UPGRADE</span>
                <motion.span
                  className="text-mission-green"
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.3, repeat: 3 }}
                >
                  ▓▓▓▓▓
                </motion.span>
                <span className="text-mission-green text-sm font-mono">COMPLETE</span>
              </div>
            </motion.div>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
