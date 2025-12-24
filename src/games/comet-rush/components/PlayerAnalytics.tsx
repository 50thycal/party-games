"use client";

import { cn } from "@/lib/cn";
import type { PlayerGameStats, GameAnalytics } from "../actionLog";

// ============================================================================
// TYPES
// ============================================================================

interface PlayerAnalyticsProps {
  analytics: GameAnalytics;
  className?: string;
}

interface PlayerStatsCardProps {
  stats: PlayerGameStats;
  rank: number;
}

// ============================================================================
// STAT DISPLAY HELPERS
// ============================================================================

function StatRow({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string | number;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex justify-between items-center py-0.5">
      <span className="text-mission-steel text-xs">{label}</span>
      <span
        className={cn(
          "text-xs font-mono",
          highlight ? "text-mission-amber" : "text-mission-cream"
        )}
      >
        {value}
        {unit && <span className="text-mission-steel ml-0.5">{unit}</span>}
      </span>
    </div>
  );
}

// ============================================================================
// PLAYER STATS CARD
// ============================================================================

function PlayerStatsCard({ stats, rank }: PlayerStatsCardProps) {
  const medalEmoji = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "";

  return (
    <div
      className={cn(
        "panel-retro p-3",
        stats.isWinner && "border-mission-amber"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2 pb-2 border-b border-mission-steel-dark">
        <div className="flex items-center gap-2">
          <span className="text-lg">{medalEmoji}</span>
          <span className="text-sm font-bold text-mission-cream">
            {stats.playerName}
          </span>
        </div>
        <span className="led-segment text-lg text-mission-amber">
          {stats.finalScore} pts
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
        {/* Rockets */}
        <div>
          <span className="label-embossed text-[8px] block mb-1">ROCKETS</span>
          <StatRow label="Built" value={stats.rocketsBuilt} />
          <StatRow label="Launched" value={stats.rocketsLaunched} />
        </div>

        {/* Accuracy */}
        <div>
          <span className="label-embossed text-[8px] block mb-1">ACCURACY</span>
          <StatRow label="Hits" value={stats.hits} />
          <StatRow label="Misses" value={stats.misses} />
          <StatRow
            label="Hit Rate"
            value={stats.hitRate.toFixed(0)}
            unit="%"
            highlight
          />
        </div>

        {/* Damage */}
        <div>
          <span className="label-embossed text-[8px] block mb-1 mt-2">DAMAGE</span>
          <StatRow label="Total Damage" value={stats.totalDamage} highlight />
          <StatRow label="Segments" value={stats.segmentsDestroyed} />
        </div>

        {/* Cards */}
        <div>
          <span className="label-embossed text-[8px] block mb-1 mt-2">CARDS</span>
          <StatRow label="Drawn" value={stats.cardsDrawn} />
          <StatRow label="Played" value={stats.cardsPlayed} />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// GAME SUMMARY
// ============================================================================

function GameSummary({ analytics }: { analytics: GameAnalytics }) {
  const formatDuration = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}m ${seconds}s`;
  };

  return (
    <div className="panel-retro p-3 mb-4">
      <span className="label-embossed text-[10px] block mb-2">GAME SUMMARY</span>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
        <div>
          <span className="led-segment text-2xl text-mission-green block">
            {analytics.totalRounds}
          </span>
          <span className="text-[10px] text-mission-steel">ROUNDS</span>
        </div>
        <div>
          <span className="led-segment text-2xl text-mission-amber block">
            {analytics.totalRocketsLaunched}
          </span>
          <span className="text-[10px] text-mission-steel">LAUNCHES</span>
        </div>
        <div>
          <span className="led-segment text-2xl text-mission-green block">
            {analytics.overallHitRate.toFixed(0)}%
          </span>
          <span className="text-[10px] text-mission-steel">HIT RATE</span>
        </div>
        <div>
          <span className="led-segment text-2xl text-mission-cream block">
            {formatDuration(analytics.gameDurationMs)}
          </span>
          <span className="text-[10px] text-mission-steel">DURATION</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-mission-steel-dark">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <span className="text-sm text-mission-amber">
              {analytics.totalRocketsBuilt}
            </span>
            <span className="text-[10px] text-mission-steel block">
              Rockets Built
            </span>
          </div>
          <div>
            <span className="text-sm text-mission-amber">
              {analytics.totalDamageDealt}
            </span>
            <span className="text-[10px] text-mission-steel block">
              Total Damage
            </span>
          </div>
          <div>
            <span className="text-sm text-mission-amber">
              {analytics.totalActions}
            </span>
            <span className="text-[10px] text-mission-steel block">
              Total Actions
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function PlayerAnalytics({ analytics, className }: PlayerAnalyticsProps) {
  // Sort players by score (highest first)
  const sortedStats = [...analytics.playerStats].sort(
    (a, b) => b.finalScore - a.finalScore
  );

  return (
    <div className={cn("space-y-4", className)}>
      {/* Game Summary */}
      <GameSummary analytics={analytics} />

      {/* Player Stats */}
      <div>
        <span className="label-embossed text-[10px] block mb-2">
          PLAYER STATISTICS
        </span>
        <div className="grid gap-3 md:grid-cols-2">
          {sortedStats.map((stats, index) => (
            <PlayerStatsCard
              key={stats.playerId}
              stats={stats}
              rank={index + 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
