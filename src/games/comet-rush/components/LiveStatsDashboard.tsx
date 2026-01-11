"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/cn";
import type { CometRushState } from "../config";
import type { MultiplayerLogEntry } from "../actionLog";

// ============================================================================
// TYPES
// ============================================================================

interface LiveStatsDashboardProps {
  gameState: CometRushState;
  className?: string;
}

interface PlayerLiveStats {
  playerId: string;
  playerName: string;
  hits: number;
  misses: number;
  hitRate: number;
  totalDamage: number;
  segmentsDestroyed: number;
  cardsPlayed: number;
  score: number;
}

// ============================================================================
// LIVE STATS CALCULATION
// ============================================================================

function calculateLiveStats(state: CometRushState): PlayerLiveStats[] {
  const stats: Record<string, PlayerLiveStats> = {};

  // Initialize stats for all players
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId];
    stats[playerId] = {
      playerId,
      playerName: player?.name ?? "Unknown",
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalDamage: 0,
      segmentsDestroyed: player?.trophies.length ?? 0,
      cardsPlayed: 0,
      score: player?.trophies.reduce((sum, t) => sum + t.baseStrength, 0) ?? 0,
    };
  }

  // Process action log for live stats
  for (const entry of state.actionLog) {
    const playerStats = stats[entry.playerId];
    if (!playerStats) continue;

    switch (entry.action) {
      case "PLAY_CARD":
        playerStats.cardsPlayed++;
        break;
      case "LAUNCH_ROCKET": {
        if (entry.details.includes("HIT")) {
          playerStats.hits++;
          // Extract damage
          const damageMatch = entry.details.match(/Dealt (\d+) damage/);
          if (damageMatch) {
            playerStats.totalDamage += parseInt(damageMatch[1], 10);
          }
        } else if (entry.details.includes("MISS")) {
          playerStats.misses++;
        }
        break;
      }
    }
  }

  // Calculate hit rates and add trophy points to damage
  for (const playerId of Object.keys(stats)) {
    const s = stats[playerId];
    const launches = s.hits + s.misses;
    s.hitRate = launches > 0 ? (s.hits / launches) * 100 : 0;
    // Add destroyed segment points to damage
    s.totalDamage += s.score;
  }

  return Object.values(stats);
}

function calculateWinProbability(stats: PlayerLiveStats[], state: CometRushState): Record<string, number> {
  const probabilities: Record<string, number> = {};

  // Simple probability based on current score, damage potential, and resources
  let totalWeight = 0;
  const weights: Record<string, number> = {};

  for (const s of stats) {
    const player = state.players[s.playerId];
    if (!player) continue;

    // Weight factors:
    // - Current score (most important)
    // - Hit rate (reliability)
    // - Resources (building potential)
    // - Ready rockets (immediate potential)
    const readyRockets = player.rockets.filter(r => r.status === "ready").length;
    const buildingRockets = player.rockets.filter(r => r.status === "building").length;

    const weight =
      (s.score * 10) +                    // Current score heavily weighted
      (s.hitRate * 0.5) +                 // Good accuracy helps
      (player.resourceCubes * 0.3) +      // Resources = potential
      (readyRockets * 5) +                // Ready rockets = immediate threat
      (buildingRockets * 2) +             // Building rockets = future threat
      10;                                 // Base weight so everyone has a chance

    weights[s.playerId] = weight;
    totalWeight += weight;
  }

  // Normalize to percentages
  for (const playerId of Object.keys(weights)) {
    probabilities[playerId] = totalWeight > 0 ? (weights[playerId] / totalWeight) * 100 : 0;
  }

  return probabilities;
}

// ============================================================================
// STAT BAR COMPONENT
// ============================================================================

function StatBar({
  label,
  value,
  maxValue,
  color,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: "green" | "amber" | "red" | "cyan";
}) {
  const percentage = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  const colorClasses = {
    green: "bg-mission-green",
    amber: "bg-mission-amber",
    red: "bg-mission-red",
    cyan: "bg-cyan-500",
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-mission-steel w-12 truncate">{label}</span>
      <div className="flex-1 h-2 bg-mission-dark rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={cn("h-full rounded-full", colorClasses[color])}
        />
      </div>
      <span className="text-[10px] text-mission-cream font-mono w-8 text-right">{value}</span>
    </div>
  );
}

// ============================================================================
// LEADERBOARD ROW
// ============================================================================

function LeaderboardRow({
  rank,
  playerName,
  value,
  isLeader,
  suffix = "",
}: {
  rank: number;
  playerName: string;
  value: number | string;
  isLeader: boolean;
  suffix?: string;
}) {
  const medalEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "  ";

  return (
    <div
      className={cn(
        "flex items-center justify-between py-1 px-2 rounded",
        isLeader && "bg-mission-amber/10 border border-mission-amber/30"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm w-5">{medalEmoji}</span>
        <span className={cn(
          "text-xs",
          isLeader ? "text-mission-amber font-bold" : "text-mission-cream"
        )}>
          {playerName}
        </span>
      </div>
      <span className={cn(
        "text-xs font-mono",
        isLeader ? "text-mission-amber" : "text-mission-steel"
      )}>
        {value}{suffix}
      </span>
    </div>
  );
}

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

export function LiveStatsDashboard({ gameState, className }: LiveStatsDashboardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const stats = calculateLiveStats(gameState);
  const winProbabilities = calculateWinProbability(stats, gameState);

  // Sort for different leaderboards
  const byDamage = [...stats].sort((a, b) => b.totalDamage - a.totalDamage);
  const byHitRate = [...stats].sort((a, b) => b.hitRate - a.hitRate);
  const byScore = [...stats].sort((a, b) => b.score - a.score);

  // Find max values for bars
  const maxDamage = Math.max(...stats.map(s => s.totalDamage), 1);
  const maxCards = Math.max(...stats.map(s => s.cardsPlayed), 1);

  // Get the leader (most likely to win)
  const sortedByProbability = Object.entries(winProbabilities)
    .sort(([, a], [, b]) => b - a);
  const leaderId = sortedByProbability[0]?.[0];

  return (
    <div className={cn("panel-retro overflow-hidden", className)}>
      {/* Collapsed Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-3 flex items-center justify-between hover:bg-mission-panel-light/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <span className="label-embossed text-[10px]">LIVE STATS</span>
        </div>
        <div className="flex items-center gap-3">
          {/* Quick preview of leader */}
          {leaderId && (
            <span className="text-[10px] text-mission-amber">
              👑 {gameState.players[leaderId]?.name}: {winProbabilities[leaderId].toFixed(0)}%
            </span>
          )}
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            className="text-mission-steel"
          >
            ▼
          </motion.span>
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-3 pt-0 space-y-4">
              {/* Win Probability Section */}
              <div>
                <span className="label-embossed text-[8px] block mb-2 text-mission-amber">
                  MOST LIKELY TO WIN
                </span>
                <div className="space-y-1">
                  {sortedByProbability.map(([playerId, probability], index) => {
                    const player = gameState.players[playerId];
                    return (
                      <div key={playerId} className="flex items-center gap-2">
                        <span className="text-[10px] text-mission-steel w-16 truncate">
                          {player?.name}
                        </span>
                        <div className="flex-1 h-3 bg-mission-dark rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${probability}%` }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            className={cn(
                              "h-full rounded-full",
                              index === 0 ? "bg-mission-amber" :
                              index === 1 ? "bg-mission-green" :
                              "bg-mission-steel"
                            )}
                          />
                        </div>
                        <span className="text-[10px] text-mission-cream font-mono w-10 text-right">
                          {probability.toFixed(0)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Hit Rate Leaderboard */}
              <div>
                <span className="label-embossed text-[8px] block mb-2">HIT RATE</span>
                <div className="space-y-0.5">
                  {byHitRate.map((s, i) => (
                    <LeaderboardRow
                      key={s.playerId}
                      rank={i + 1}
                      playerName={s.playerName}
                      value={s.hitRate.toFixed(0)}
                      suffix="%"
                      isLeader={i === 0 && s.hitRate > 0}
                    />
                  ))}
                </div>
              </div>

              {/* Damage Leaderboard */}
              <div>
                <span className="label-embossed text-[8px] block mb-2">DAMAGE DEALT</span>
                <div className="space-y-1">
                  {byDamage.map((s) => (
                    <StatBar
                      key={s.playerId}
                      label={s.playerName}
                      value={s.totalDamage}
                      maxValue={maxDamage}
                      color="red"
                    />
                  ))}
                </div>
              </div>

              {/* Cards Played */}
              <div>
                <span className="label-embossed text-[8px] block mb-2">CARDS PLAYED</span>
                <div className="space-y-1">
                  {stats.map((s) => (
                    <StatBar
                      key={s.playerId}
                      label={s.playerName}
                      value={s.cardsPlayed}
                      maxValue={maxCards}
                      color="cyan"
                    />
                  ))}
                </div>
              </div>

              {/* Current Score (Trophy Points) */}
              <div>
                <span className="label-embossed text-[8px] block mb-2">TROPHY POINTS</span>
                <div className="space-y-0.5">
                  {byScore.map((s, i) => (
                    <LeaderboardRow
                      key={s.playerId}
                      rank={i + 1}
                      playerName={s.playerName}
                      value={s.score}
                      suffix=" pts"
                      isLeader={i === 0 && s.score > 0}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
