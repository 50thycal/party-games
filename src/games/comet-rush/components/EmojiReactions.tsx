"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";

// ============================================================================
// TYPES
// ============================================================================

interface EmojiReaction {
  id: string;
  emoji: string;
  x: number;
  timestamp: number;
  comboCount?: number;
}

interface EmojiReactionsProps {
  onSendReaction?: (emoji: string) => void;
  className?: string;
}

interface FloatingEmojiProps {
  emoji: string;
  x: number;
  comboCount?: number;
  onComplete: () => void;
}

// ============================================================================
// AVAILABLE REACTIONS
// ============================================================================

const REACTION_EMOJIS = [
  { emoji: "🚀", label: "Rocket" },
  { emoji: "🔥", label: "Fire" },
  { emoji: "👏", label: "Clap" },
  { emoji: "😱", label: "Shocked" },
  { emoji: "💀", label: "RIP" },
  { emoji: "🎯", label: "Bullseye" },
  { emoji: "😈", label: "Evil" },
  { emoji: "💪", label: "Strong" },
];

// ============================================================================
// FLOATING EMOJI ANIMATION
// ============================================================================

function FloatingEmoji({ emoji, x, comboCount = 1, onComplete }: FloatingEmojiProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const isCombo = comboCount >= 2;
  const isMegaCombo = comboCount >= 4;

  // Scale based on combo
  const baseScale = isMegaCombo ? 1.5 : isCombo ? 1.2 : 1;
  const maxScale = isMegaCombo ? 2.2 : isCombo ? 1.8 : 1.4;

  return (
    <motion.div
      initial={{ opacity: 1, y: 0, scale: baseScale }}
      animate={{
        opacity: 0,
        y: isMegaCombo ? -220 : isCombo ? -180 : -150,
        scale: [baseScale, maxScale, maxScale * 0.9],
        rotate: isMegaCombo ? [0, -20, 20, -15, 15, -10, 10, 0] : [0, -10, 10, -5, 0],
        x: isMegaCombo ? [0, -10, 10, -5, 5, 0] : 0,
      }}
      transition={{
        duration: isMegaCombo ? 2.5 : 2,
        ease: "easeOut",
        rotate: { duration: isMegaCombo ? 0.3 : 0.5, repeat: isMegaCombo ? 5 : 3 },
        x: isMegaCombo ? { duration: 0.4, repeat: 4 } : undefined,
      }}
      style={{ left: `${x}%` }}
      className={cn(
        "fixed bottom-24 pointer-events-none z-50",
        isMegaCombo ? "text-6xl" : isCombo ? "text-5xl" : "text-4xl"
      )}
    >
      {/* Combo glow effect */}
      {isCombo && (
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0.8 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            filter: isMegaCombo ? "blur(12px)" : "blur(8px)",
            transform: "scale(1.5)",
          }}
        >
          {emoji}
        </motion.div>
      )}

      {/* Main emoji */}
      <span
        className="relative"
        style={{
          textShadow: isMegaCombo
            ? "0 0 20px rgba(255,200,0,0.8), 0 0 40px rgba(255,150,0,0.6)"
            : isCombo
              ? "0 0 10px rgba(255,200,0,0.5)"
              : undefined,
        }}
      >
        {emoji}
      </span>

      {/* Combo counter */}
      {isCombo && (
        <motion.span
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cn(
            "absolute -top-2 -right-2 px-1.5 py-0.5 rounded-full text-xs font-bold",
            isMegaCombo
              ? "bg-mission-amber text-mission-dark"
              : "bg-mission-green text-mission-dark"
          )}
        >
          x{comboCount}
        </motion.span>
      )}

      {/* Sparkles for mega combo */}
      {isMegaCombo && (
        <>
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-mission-amber rounded-full"
              style={{
                left: "50%",
                top: "50%",
              }}
              initial={{ scale: 0, x: 0, y: 0, opacity: 1 }}
              animate={{
                scale: [0, 1, 0],
                x: Math.cos((i / 6) * Math.PI * 2) * 40,
                y: Math.sin((i / 6) * Math.PI * 2) * 40,
                opacity: [1, 1, 0],
              }}
              transition={{
                duration: 0.6,
                delay: 0.1,
              }}
            />
          ))}
        </>
      )}
    </motion.div>
  );
}

// ============================================================================
// EMOJI BUTTON
// ============================================================================

function EmojiButton({
  emoji,
  label,
  onClick,
  disabled,
}: {
  emoji: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const [isPressed, setIsPressed] = useState(false);

  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={() => {
        if (!disabled) {
          setIsPressed(true);
          onClick();
          setTimeout(() => setIsPressed(false), 200);
        }
      }}
      disabled={disabled}
      className={cn(
        "w-10 h-10 rounded-full flex items-center justify-center text-xl",
        "bg-mission-panel border border-mission-steel",
        "hover:bg-mission-panel-light hover:border-mission-amber",
        "active:bg-mission-amber/20 active:border-mission-amber",
        "transition-all duration-150",
        disabled && "opacity-50 cursor-not-allowed",
        isPressed && "ring-2 ring-mission-amber"
      )}
      title={label}
    >
      {emoji}
    </motion.button>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function EmojiReactions({ onSendReaction, className }: EmojiReactionsProps) {
  const [reactions, setReactions] = useState<EmojiReaction[]>([]);
  const [cooldown, setCooldown] = useState(false);
  const [lastEmoji, setLastEmoji] = useState<string | null>(null);
  const [comboCount, setComboCount] = useState(0);
  const comboTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleReaction = useCallback((emoji: string) => {
    if (cooldown) return;

    // Track combos - same emoji within 1.5 seconds
    let newComboCount = 1;
    if (emoji === lastEmoji && comboCount > 0) {
      newComboCount = comboCount + 1;
    }

    // Reset combo timeout
    if (comboTimeoutRef.current) {
      clearTimeout(comboTimeoutRef.current);
    }
    comboTimeoutRef.current = setTimeout(() => {
      setComboCount(0);
      setLastEmoji(null);
    }, 1500);

    setLastEmoji(emoji);
    setComboCount(newComboCount);

    // Create floating emoji
    const id = `${Date.now()}-${Math.random()}`;
    const x = 20 + Math.random() * 60; // Random x position between 20% and 80%

    setReactions(prev => [...prev, { id, emoji, x, timestamp: Date.now(), comboCount: newComboCount }]);

    // Notify parent (could be used to send to other players)
    onSendReaction?.(emoji);

    // Brief cooldown to prevent spam
    setCooldown(true);
    setTimeout(() => setCooldown(false), 300);
  }, [cooldown, onSendReaction, lastEmoji, comboCount]);

  const removeReaction = useCallback((id: string) => {
    setReactions(prev => prev.filter(r => r.id !== id));
  }, []);

  return (
    <>
      {/* Floating Emojis */}
      <AnimatePresence>
        {reactions.map(reaction => (
          <FloatingEmoji
            key={reaction.id}
            emoji={reaction.emoji}
            x={reaction.x}
            comboCount={reaction.comboCount}
            onComplete={() => removeReaction(reaction.id)}
          />
        ))}
      </AnimatePresence>

      {/* Emoji Button Bar */}
      <div className={cn("flex items-center gap-1.5", className)}>
        {REACTION_EMOJIS.map(({ emoji, label }) => (
          <EmojiButton
            key={emoji}
            emoji={emoji}
            label={label}
            onClick={() => handleReaction(emoji)}
            disabled={cooldown}
          />
        ))}
      </div>
    </>
  );
}

// ============================================================================
// COMPACT VERSION FOR BOTTOM BAR
// ============================================================================

export function EmojiReactionsCompact({ onSendReaction, className }: EmojiReactionsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [reactions, setReactions] = useState<EmojiReaction[]>([]);
  const [cooldown, setCooldown] = useState(false);
  const [lastEmoji, setLastEmoji] = useState<string | null>(null);
  const [comboCount, setComboCount] = useState(0);
  const comboTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleReaction = useCallback((emoji: string) => {
    if (cooldown) return;

    // Track combos
    let newComboCount = 1;
    if (emoji === lastEmoji && comboCount > 0) {
      newComboCount = comboCount + 1;
    }

    if (comboTimeoutRef.current) {
      clearTimeout(comboTimeoutRef.current);
    }
    comboTimeoutRef.current = setTimeout(() => {
      setComboCount(0);
      setLastEmoji(null);
    }, 1500);

    setLastEmoji(emoji);
    setComboCount(newComboCount);

    const id = `${Date.now()}-${Math.random()}`;
    const x = 20 + Math.random() * 60;

    setReactions(prev => [...prev, { id, emoji, x, timestamp: Date.now(), comboCount: newComboCount }]);
    onSendReaction?.(emoji);

    setCooldown(true);
    setTimeout(() => setCooldown(false), 300);

    // Close picker after selection
    setIsOpen(false);
  }, [cooldown, onSendReaction, lastEmoji, comboCount]);

  const removeReaction = useCallback((id: string) => {
    setReactions(prev => prev.filter(r => r.id !== id));
  }, []);

  return (
    <>
      {/* Floating Emojis */}
      <AnimatePresence>
        {reactions.map(reaction => (
          <FloatingEmoji
            key={reaction.id}
            emoji={reaction.emoji}
            x={reaction.x}
            comboCount={reaction.comboCount}
            onComplete={() => removeReaction(reaction.id)}
          />
        ))}
      </AnimatePresence>

      {/* Emoji Picker */}
      <div className={cn("relative", className)}>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-mission-panel border border-mission-steel rounded-lg p-2 shadow-lg"
            >
              <div className="flex gap-1">
                {REACTION_EMOJIS.map(({ emoji, label }) => (
                  <motion.button
                    key={emoji}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleReaction(emoji)}
                    disabled={cooldown}
                    className="w-8 h-8 flex items-center justify-center text-lg hover:bg-mission-panel-light rounded transition-colors"
                    title={label}
                  >
                    {emoji}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle Button */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center",
            "bg-mission-panel border border-mission-steel",
            "hover:border-mission-amber transition-colors",
            isOpen && "border-mission-amber bg-mission-amber/10"
          )}
        >
          <span className="text-lg">😀</span>
        </motion.button>
      </div>
    </>
  );
}
