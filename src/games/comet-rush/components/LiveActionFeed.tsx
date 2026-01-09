"use client";

import { useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import type { MultiplayerLogEntry } from "../actionLog";

// ============================================================================
// TYPES
// ============================================================================

interface LiveActionFeedProps {
  actionLog: MultiplayerLogEntry[];
  currentPlayerId: string;
  currentPlayerName: string;
  maxVisible?: number;
  className?: string;
}

// ============================================================================
// TARGETING CARD DEFINITIONS
// ============================================================================

interface TargetingCardInfo {
  icon: string;
  alertTitle: string;
  alertMessage: string;
  effectDescription: string;
}

const TARGETING_CARDS: Record<string, TargetingCardInfo> = {
  "Resource Seizure": {
    icon: "💸",
    alertTitle: "RESOURCES STOLEN!",
    alertMessage: "stole 3 cubes from you!",
    effectDescription: "You lost 3 resource cubes",
  },
  "Espionage Agent": {
    icon: "🕵️",
    alertTitle: "CARD STOLEN!",
    alertMessage: "stole a card from your hand!",
    effectDescription: "A random card was taken from you",
  },
  "Embargo": {
    icon: "🚫",
    alertTitle: "EMBARGO PLACED!",
    alertMessage: "embargoed you!",
    effectDescription: "You will receive NO income next turn",
  },
  "Sabotage Construction": {
    icon: "💣",
    alertTitle: "LAUNCH SABOTAGED!",
    alertMessage: "sabotaged your rockets!",
    effectDescription: "Your next launch will be forced to reroll",
  },
  "Diplomatic Pressure": {
    icon: "🛡️",
    alertTitle: "CARD PLAY BLOCKED!",
    alertMessage: "is blocking your next card!",
    effectDescription: "Your next card play will be cancelled",
  },
  "Regulatory Review": {
    icon: "📋",
    alertTitle: "BUILD DELAYED!",
    alertMessage: "delayed your rocket construction!",
    effectDescription: "+1 turn added to your rocket build time",
  },
  "Covert Rocket Strike": {
    icon: "💥",
    alertTitle: "ROCKET DESTROYED!",
    alertMessage: "destroyed one of your rockets!",
    effectDescription: "One of your rockets was eliminated",
  },
};

// ============================================================================
// HELPER: Check if current player was targeted
// ============================================================================

interface TargetedResult {
  isTargeted: boolean;
  attackerName: string;
  cardName: string;
  cardInfo: TargetingCardInfo | null;
}

function checkIfTargeted(
  entry: MultiplayerLogEntry,
  currentPlayerName: string
): TargetedResult {
  const result: TargetedResult = {
    isTargeted: false,
    attackerName: entry.playerName,
    cardName: "",
    cardInfo: null,
  };

  if (entry.action !== "PLAY_CARD") {
    return result;
  }

  // Extract card name from details: Played "Card Name"
  const cardMatch = entry.details.match(/Played "([^"]+)"/);
  if (!cardMatch) {
    return result;
  }

  result.cardName = cardMatch[1];

  // Check if this card targets players and if current player is the target
  // The details format is: Played "Card Name" targeting PlayerName - effect
  const targetMatch = entry.details.match(/targeting (\w+)/);
  if (!targetMatch) {
    return result;
  }

  const targetName = targetMatch[1];

  // Check if the current player is the target
  // Compare case-insensitively and allow partial matches for names
  if (targetName.toLowerCase() === currentPlayerName.toLowerCase() ||
      currentPlayerName.toLowerCase().startsWith(targetName.toLowerCase())) {
    result.isTargeted = true;
    result.cardInfo = TARGETING_CARDS[result.cardName] || null;
  }

  return result;
}

// ============================================================================
// ACTION FORMATTING
// ============================================================================

interface FormattedAction {
  icon: string;
  text: string;
  variant: "default" | "success" | "danger" | "warning" | "info" | "highlight";
  isImportant: boolean;
}

function formatAction(
  entry: MultiplayerLogEntry,
  currentPlayerId: string
): FormattedAction {
  const isCurrentPlayer = entry.playerId === currentPlayerId;
  const playerLabel = isCurrentPlayer ? "You" : entry.playerName;

  switch (entry.action) {
    case "BEGIN_TURN": {
      if (entry.details.includes("embargo")) {
        return {
          icon: "🚫",
          text: `${playerLabel} started turn (income blocked!)`,
          variant: isCurrentPlayer ? "highlight" : "danger",
          isImportant: isCurrentPlayer,
        };
      }
      const incomeMatch = entry.details.match(/gained (\d+)/);
      const income = incomeMatch ? incomeMatch[1] : "?";
      return {
        icon: "💰",
        text: `${playerLabel} started turn (+${income} cubes)`,
        variant: isCurrentPlayer ? "highlight" : "default",
        isImportant: isCurrentPlayer,
      };
    }

    case "DRAW_CARD": {
      const deckMatch = entry.details.match(/from (\w+) deck/);
      const deck = deckMatch ? deckMatch[1] : "unknown";
      const deckIcons: Record<string, string> = {
        engineering: "🔧",
        espionage: "🕵️",
        economic: "💵",
      };
      return {
        icon: deckIcons[deck] || "🃏",
        text: `${playerLabel} drew from ${deck}`,
        variant: isCurrentPlayer ? "highlight" : "info",
        isImportant: false,
      };
    }

    case "PLAY_CARD": {
      const cardMatch = entry.details.match(/Played "([^"]+)"/);
      const cardName = cardMatch ? cardMatch[1] : "a card";
      const targetMatch = entry.details.match(/targeting (\w+)/);
      const target = targetMatch ? targetMatch[1] : null;

      // Check if current player is being targeted
      const isTargeted = target && entry.details.toLowerCase().includes("targeting") && !isCurrentPlayer;

      let text = `${playerLabel} played ${cardName}`;
      if (target) {
        text += ` on ${target}`;
      }

      // Determine card type for icon
      let icon = "🃏";
      let variant: FormattedAction["variant"] = isCurrentPlayer ? "highlight" : "warning";

      if (cardName.includes("Embargo") || cardName.includes("Sabotage") || cardName.includes("Strike")) {
        icon = "⚔️";
        variant = isTargeted ? "danger" : "warning";
      } else if (cardName.includes("Seizure") || cardName.includes("Agent")) {
        icon = "🕵️";
        variant = isTargeted ? "danger" : "warning";
      } else if (cardName.includes("Pressure")) {
        icon = "🛡️";
        variant = isTargeted ? "danger" : "warning";
      } else if (cardName.includes("Upgrade") || cardName.includes("Calibration")) {
        icon = "⬆️";
        variant = isCurrentPlayer ? "highlight" : "success";
      } else if (cardName.includes("Income") || cardName.includes("Funding") || cardName.includes("Grant")) {
        icon = "💰";
        variant = isCurrentPlayer ? "highlight" : "success";
      } else if (cardName.includes("Analysis")) {
        icon = "🔍";
      } else if (cardName.includes("Flight") || cardName.includes("Reroll")) {
        icon = "🔄";
      }

      return {
        icon,
        text,
        variant,
        isImportant: isTargeted || isCurrentPlayer,
      };
    }

    case "BUILD_ROCKET": {
      const statsMatch = entry.details.match(/Power (\d+), Accuracy (\d+)/);
      const power = statsMatch ? statsMatch[1] : "?";
      const accuracy = statsMatch ? statsMatch[2] : "?";
      return {
        icon: "🔧",
        text: `${playerLabel} built rocket (P${power}/A${accuracy})`,
        variant: isCurrentPlayer ? "highlight" : "info",
        isImportant: false,
      };
    }

    case "LAUNCH_ROCKET": {
      const isHit = entry.details.includes("HIT");
      const isMiss = entry.details.includes("MISS");
      const isDestroy = entry.details.includes("Destroyed");
      const rollMatch = entry.details.match(/Rolled (\d+)/);
      const roll = rollMatch ? rollMatch[1] : "?";

      if (isDestroy) {
        const pointsMatch = entry.details.match(/for (\d+) points/);
        const points = pointsMatch ? pointsMatch[1] : "?";
        return {
          icon: "💥",
          text: `${playerLabel} DESTROYED segment! (+${points} pts, rolled ${roll})`,
          variant: "success",
          isImportant: true,
        };
      } else if (isHit) {
        const damageMatch = entry.details.match(/Dealt (\d+) damage/);
        const damage = damageMatch ? damageMatch[1] : "?";
        return {
          icon: "🎯",
          text: `${playerLabel} HIT! (${damage} dmg, rolled ${roll})`,
          variant: "success",
          isImportant: true,
        };
      } else if (isMiss) {
        return {
          icon: "💨",
          text: `${playerLabel} missed (rolled ${roll})`,
          variant: "danger",
          isImportant: isCurrentPlayer,
        };
      }
      return {
        icon: "🚀",
        text: `${playerLabel} launched rocket`,
        variant: "default",
        isImportant: false,
      };
    }

    case "USE_REROLL":
      return {
        icon: "🔄",
        text: `${playerLabel} used reroll token!`,
        variant: "warning",
        isImportant: true,
      };

    case "DECLINE_REROLL":
      return {
        icon: "❌",
        text: `${playerLabel} declined reroll`,
        variant: "default",
        isImportant: false,
      };

    case "END_TURN":
      return {
        icon: "⏭️",
        text: `${playerLabel} ended turn`,
        variant: "default",
        isImportant: false,
      };

    case "ROUND_END": {
      const moveMatch = entry.details.match(/moved (\d+) spaces/);
      const move = moveMatch ? moveMatch[1] : "?";
      const distMatch = entry.details.match(/Distance: (\d+)/);
      const dist = distMatch ? distMatch[1] : "?";
      return {
        icon: "☄️",
        text: `COMET ADVANCES! (-${move} → ${dist} from Earth)`,
        variant: "danger",
        isImportant: true,
      };
    }

    case "GAME_OVER":
      if (entry.details.includes("destroyed")) {
        return {
          icon: "🏆",
          text: "COMET DESTROYED! Humanity saved!",
          variant: "success",
          isImportant: true,
        };
      }
      return {
        icon: "💀",
        text: "EARTH DESTROYED! Game over.",
        variant: "danger",
        isImportant: true,
      };

    default:
      return {
        icon: "📝",
        text: entry.details,
        variant: "default",
        isImportant: false,
      };
  }
}

// ============================================================================
// ACTION ENTRY COMPONENT
// ============================================================================

function ActionEntry({
  entry,
  formatted,
  isNew,
}: {
  entry: MultiplayerLogEntry;
  formatted: FormattedAction;
  isNew: boolean;
}) {
  const variantStyles = {
    default: "bg-mission-panel-light/30 border-mission-steel-dark/50",
    success: "bg-mission-green/15 border-mission-green/50",
    danger: "bg-mission-red/15 border-mission-red/50",
    warning: "bg-mission-amber/15 border-mission-amber/50",
    info: "bg-cyan-500/10 border-cyan-500/30",
    highlight: "bg-purple-500/15 border-purple-500/50",
  };

  return (
    <motion.div
      initial={isNew ? { opacity: 0, x: -20, scale: 0.95 } : false}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex items-start gap-2 px-2 py-1.5 rounded border-l-2 text-xs",
        variantStyles[formatted.variant],
        formatted.isImportant && "font-medium"
      )}
    >
      <span className="shrink-0 text-sm">{formatted.icon}</span>
      <span className="text-mission-cream/90 flex-1">{formatted.text}</span>
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function LiveActionFeed({
  actionLog,
  currentPlayerId,
  currentPlayerName,
  maxVisible = 8,
  className,
}: LiveActionFeedProps) {
  // Note: currentPlayerName is available for future use in enhanced targeting detection
  void currentPlayerName; // Prevent unused variable warning
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [seenCount, setSeenCount] = useState(actionLog.length);

  // Get visible entries
  const displayCount = isExpanded ? Math.min(actionLog.length, 20) : maxVisible;
  const visibleEntries = actionLog.slice(-displayCount).reverse();

  // Track new entries for animation
  const newEntryIds = actionLog.slice(seenCount).map((e) => e.id);

  // Update seen count after render
  useEffect(() => {
    if (actionLog.length > seenCount) {
      const timer = setTimeout(() => setSeenCount(actionLog.length), 500);
      return () => clearTimeout(timer);
    }
  }, [actionLog.length, seenCount]);

  // Auto-scroll to top when new entries arrive (since we reverse the order)
  useEffect(() => {
    if (containerRef.current && newEntryIds.length > 0) {
      containerRef.current.scrollTop = 0;
    }
  }, [newEntryIds.length]);

  if (actionLog.length === 0) {
    return null;
  }

  return (
    <div className={cn("panel-retro overflow-hidden", className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-mission-panel-light/50 transition-colors border-b border-mission-steel-dark/50"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm">📡</span>
          <span className="text-xs font-bold uppercase text-mission-cream">
            Live Feed
          </span>
          {newEntryIds.length > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="px-1.5 py-0.5 bg-mission-green/30 border border-mission-green/50 rounded text-[10px] text-mission-green"
            >
              NEW
            </motion.span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-mission-steel">
            {actionLog.length} actions
          </span>
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            className="text-mission-green text-xs"
          >
            ▼
          </motion.span>
        </div>
      </button>

      {/* Action List */}
      <div
        ref={containerRef}
        className="overflow-y-auto transition-all duration-200"
        style={{ maxHeight: isExpanded ? "300px" : "180px" }}
      >
        <div className="p-2 space-y-1">
          <AnimatePresence mode="popLayout">
            {visibleEntries.map((entry) => {
              const formatted = formatAction(entry, currentPlayerId);
              const isNew = newEntryIds.includes(entry.id);
              return (
                <ActionEntry
                  key={entry.id}
                  entry={entry}
                  formatted={formatted}
                  isNew={isNew}
                />
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* Expand hint */}
      {actionLog.length > maxVisible && !isExpanded && (
        <div className="px-3 py-1 text-center border-t border-mission-steel-dark/30">
          <span className="text-[10px] text-mission-steel">
            Tap to see {actionLog.length - maxVisible} more
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FLOATING NOTIFICATION FOR IMPORTANT EVENTS
// ============================================================================

interface ActionNotificationProps {
  entry: MultiplayerLogEntry | null;
  currentPlayerId: string;
  onDismiss: () => void;
}

export function ActionNotification({
  entry,
  currentPlayerId,
  onDismiss,
}: ActionNotificationProps) {
  useEffect(() => {
    if (entry) {
      const timer = setTimeout(onDismiss, 4000);
      return () => clearTimeout(timer);
    }
  }, [entry, onDismiss]);

  if (!entry) return null;

  const formatted = formatAction(entry, currentPlayerId);

  // Only show notifications for important events
  if (!formatted.isImportant) return null;

  const variantStyles = {
    default: "bg-mission-panel border-mission-steel",
    success: "bg-mission-green/20 border-mission-green",
    danger: "bg-mission-red/20 border-mission-red",
    warning: "bg-mission-amber/20 border-mission-amber",
    info: "bg-cyan-500/20 border-cyan-500",
    highlight: "bg-purple-500/20 border-purple-500",
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -50, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.9 }}
        className={cn(
          "fixed top-4 left-1/2 -translate-x-1/2 z-50",
          "px-4 py-3 rounded-lg border-2 shadow-lg",
          "flex items-center gap-3",
          variantStyles[formatted.variant]
        )}
        onClick={onDismiss}
      >
        <span className="text-2xl">{formatted.icon}</span>
        <span className="text-sm font-medium text-mission-cream">
          {formatted.text}
        </span>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================================================
// TARGETED NOTIFICATION - Dramatic alert when YOU are targeted by a card
// ============================================================================

interface TargetedNotificationProps {
  entry: MultiplayerLogEntry | null;
  currentPlayerName: string;
  onDismiss: () => void;
}

export function TargetedNotification({
  entry,
  currentPlayerName,
  onDismiss,
}: TargetedNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (entry) {
      setIsVisible(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setTimeout(onDismiss, 300); // Allow exit animation
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [entry, onDismiss]);

  if (!entry) return null;

  const targetInfo = checkIfTargeted(entry, currentPlayerName);

  // Only show if this player was actually targeted
  if (!targetInfo.isTargeted) return null;

  const cardInfo = targetInfo.cardInfo || {
    icon: "⚠️",
    alertTitle: "YOU WERE TARGETED!",
    alertMessage: `played a card against you!`,
    effectDescription: `${targetInfo.cardName} was used on you`,
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: -100 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -50 }}
          transition={{ type: "spring", damping: 15, stiffness: 300 }}
          className="fixed inset-x-4 top-4 z-[100] max-w-md mx-auto"
          onClick={onDismiss}
        >
          {/* Dramatic red alert box */}
          <div className="bg-gradient-to-b from-mission-red/30 to-mission-red/10 border-2 border-mission-red rounded-lg shadow-2xl overflow-hidden">
            {/* Flashing header */}
            <motion.div
              animate={{ opacity: [1, 0.7, 1] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="bg-mission-red/40 px-4 py-2 border-b border-mission-red/50"
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-2xl">{cardInfo.icon}</span>
                <span className="text-lg font-bold text-mission-red uppercase tracking-wider">
                  {cardInfo.alertTitle}
                </span>
                <span className="text-2xl">{cardInfo.icon}</span>
              </div>
            </motion.div>

            {/* Content */}
            <div className="p-4 space-y-3">
              {/* Attacker info */}
              <div className="text-center">
                <span className="text-xl font-bold text-mission-amber">
                  {targetInfo.attackerName}
                </span>
                <span className="text-mission-cream ml-2">
                  {cardInfo.alertMessage}
                </span>
              </div>

              {/* Card name */}
              <div className="flex justify-center">
                <div className="px-3 py-1 bg-mission-dark/50 rounded border border-mission-steel">
                  <span className="text-xs text-mission-steel">Card: </span>
                  <span className="text-sm font-medium text-mission-cream">
                    {targetInfo.cardName}
                  </span>
                </div>
              </div>

              {/* Effect description */}
              <div className="text-center">
                <p className="text-sm text-mission-red/90 font-medium">
                  {cardInfo.effectDescription}
                </p>
              </div>

              {/* Dismiss hint */}
              <div className="text-center pt-1">
                <span className="text-[10px] text-mission-steel">
                  Tap to dismiss
                </span>
              </div>
            </div>

            {/* Animated border glow */}
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="absolute inset-0 border-2 border-mission-red rounded-lg pointer-events-none"
              style={{ boxShadow: "0 0 20px rgba(239, 68, 68, 0.5)" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// HELPER: Export targeting check for use in GameView
// ============================================================================

export { checkIfTargeted, TARGETING_CARDS };
export type { TargetedResult, TargetingCardInfo };
