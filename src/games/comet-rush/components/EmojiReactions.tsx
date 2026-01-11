"use client";

import { useState, useCallback, useEffect } from "react";
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
}

interface EmojiReactionsProps {
  onSendReaction?: (emoji: string) => void;
  className?: string;
}

interface FloatingEmojiProps {
  emoji: string;
  x: number;
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

function FloatingEmoji({ emoji, x, onComplete }: FloatingEmojiProps) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1, y: 0, scale: 1 }}
      animate={{
        opacity: 0,
        y: -150,
        scale: [1, 1.4, 1.2],
        rotate: [0, -10, 10, -5, 0],
      }}
      transition={{
        duration: 2,
        ease: "easeOut",
        rotate: { duration: 0.5, repeat: 3 },
      }}
      style={{ left: `${x}%` }}
      className="fixed bottom-24 text-4xl pointer-events-none z-50"
    >
      {emoji}
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

  const handleReaction = useCallback((emoji: string) => {
    if (cooldown) return;

    // Create floating emoji
    const id = `${Date.now()}-${Math.random()}`;
    const x = 20 + Math.random() * 60; // Random x position between 20% and 80%

    setReactions(prev => [...prev, { id, emoji, x, timestamp: Date.now() }]);

    // Notify parent (could be used to send to other players)
    onSendReaction?.(emoji);

    // Brief cooldown to prevent spam
    setCooldown(true);
    setTimeout(() => setCooldown(false), 300);
  }, [cooldown, onSendReaction]);

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

  const handleReaction = useCallback((emoji: string) => {
    if (cooldown) return;

    const id = `${Date.now()}-${Math.random()}`;
    const x = 20 + Math.random() * 60;

    setReactions(prev => [...prev, { id, emoji, x, timestamp: Date.now() }]);
    onSendReaction?.(emoji);

    setCooldown(true);
    setTimeout(() => setCooldown(false), 300);

    // Close picker after selection
    setIsOpen(false);
  }, [cooldown, onSendReaction]);

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
