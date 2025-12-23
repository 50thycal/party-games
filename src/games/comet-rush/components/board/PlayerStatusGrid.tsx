"use client";

import { cn } from "@/lib/cn";
import { motion } from "framer-motion";
import { rocketStatusConfig, statusColors } from "../../theme/missionControl";
import type { RocketStatus } from "../../config";

interface RocketInfo {
  id: string;
  status: RocketStatus;
  power: number;
  accuracy: number;
  buildTimeRemaining: number;
}

interface PlayerInfo {
  id: string;
  name: string;
  resourceCubes: number;
  rockets: RocketInfo[];
  isActive: boolean;
  isCurrentUser: boolean;
}

interface PlayerStatusGridProps {
  players: PlayerInfo[];
  className?: string;
}

/**
 * Grid showing all players' launch station status
 * Displays rockets (building vs ready) and resources at a glance
 */
export function PlayerStatusGrid({ players, className }: PlayerStatusGridProps) {
  return (
    <div className={cn("panel-retro p-3", className)}>
      <span className="label-embossed text-[10px] block mb-3">LAUNCH STATION STATUS</span>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {players.map((player) => (
          <PlayerStatusCard key={player.id} player={player} />
        ))}

        {/* Empty slots for missing players */}
        {[...Array(Math.max(0, 4 - players.length))].map((_, i) => (
          <div
            key={`empty-${i}`}
            className="bg-mission-dark/50 border border-mission-steel-dark/30 rounded-sm p-2 opacity-30"
          >
            <span className="text-[10px] text-mission-steel">VACANT</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerStatusCard({ player }: { player: PlayerInfo }) {
  const buildingRockets = player.rockets.filter(r => r.status === "building");
  const readyRockets = player.rockets.filter(r => r.status === "ready");
  const launchedRockets = player.rockets.filter(r => r.status === "launched" || r.status === "spent");

  return (
    <motion.div
      className={cn(
        "bg-mission-dark border rounded-sm p-2 transition-all",
        player.isActive
          ? "border-mission-green shadow-glow-green"
          : "border-mission-steel-dark",
        player.isCurrentUser && "ring-1 ring-mission-amber/50"
      )}
      animate={player.isActive ? { borderColor: ["#33ff33", "#1a8c1a", "#33ff33"] } : {}}
      transition={{ duration: 2, repeat: Infinity }}
    >
      {/* Player name */}
      <div className="flex items-center justify-between mb-2">
        <span className={cn(
          "text-xs font-bold uppercase truncate",
          player.isActive ? "text-mission-green" : "text-mission-cream"
        )}>
          {player.name}
        </span>
        {player.isActive && (
          <div className="w-2 h-2 rounded-full bg-mission-green animate-pulse" />
        )}
      </div>

      {/* Rockets display */}
      <div className="flex flex-wrap gap-1 mb-2 min-h-[24px]">
        {/* Ready rockets */}
        {readyRockets.map((rocket) => (
          <RocketIcon
            key={rocket.id}
            status="ready"
            power={rocket.power}
            accuracy={rocket.accuracy}
          />
        ))}

        {/* Building rockets */}
        {buildingRockets.map((rocket) => (
          <RocketIcon
            key={rocket.id}
            status="building"
            turnsRemaining={rocket.buildTimeRemaining}
          />
        ))}

        {/* Show empty indicator if no rockets */}
        {player.rockets.filter(r => r.status !== "launched" && r.status !== "spent").length === 0 && (
          <span className="text-[10px] text-mission-steel italic">No rockets</span>
        )}
      </div>

      {/* Resources */}
      <div className="flex items-center gap-1 pt-1 border-t border-mission-steel-dark/50">
        <span className="text-mission-amber">●</span>
        <span className="led-segment text-sm text-mission-amber">{player.resourceCubes}</span>
        <span className="text-[8px] text-mission-steel">cubes</span>
      </div>
    </motion.div>
  );
}

function RocketIcon({
  status,
  power,
  accuracy,
  turnsRemaining,
}: {
  status: RocketStatus;
  power?: number;
  accuracy?: number;
  turnsRemaining?: number;
}) {
  const config = rocketStatusConfig[status];

  return (
    <motion.div
      className={cn(
        "relative flex items-center justify-center",
        "w-7 h-7 rounded-sm",
        "border",
        status === "ready" && "bg-mission-green/20 border-mission-green",
        status === "building" && "bg-mission-amber/20 border-mission-amber",
        status === "launched" && "bg-mission-steel-dark/50 border-mission-steel-dark",
        status === "spent" && "bg-mission-red/20 border-mission-red-dim"
      )}
      whileHover={{ scale: 1.1 }}
      title={`${config.label}${power ? ` | PWR: ${power}` : ""}${accuracy ? ` | ACC: ${accuracy}` : ""}${turnsRemaining ? ` | ${turnsRemaining} turns` : ""}`}
    >
      <span className="text-sm">{config.icon}</span>

      {/* Build time indicator */}
      {status === "building" && turnsRemaining !== undefined && (
        <span className="absolute -bottom-1 -right-1 text-[8px] bg-mission-amber text-mission-dark rounded-full w-3 h-3 flex items-center justify-center font-bold">
          {turnsRemaining}
        </span>
      )}

      {/* Power indicator for ready rockets */}
      {status === "ready" && power !== undefined && (
        <span className="absolute -top-1 -right-1 text-[8px] bg-mission-green text-mission-dark rounded-full w-3 h-3 flex items-center justify-center font-bold">
          {power}
        </span>
      )}
    </motion.div>
  );
}

/**
 * Compact single player status for the current user's console
 */
export function CurrentPlayerStatus({
  player,
  income,
  className,
}: {
  player: PlayerInfo;
  income: number;
  className?: string;
}) {
  const readyCount = player.rockets.filter(r => r.status === "ready").length;
  const buildingCount = player.rockets.filter(r => r.status === "building").length;

  return (
    <div className={cn("panel-retro p-3", className)}>
      <span className="label-embossed text-[10px] block mb-2">YOUR STATUS</span>

      <div className="flex items-center justify-between gap-4">
        {/* Resources gauge */}
        <div className="flex items-center gap-2">
          <span className="text-mission-amber text-lg">●</span>
          <div className="flex flex-col">
            <span className="led-segment text-2xl text-mission-amber">{player.resourceCubes}</span>
            <span className="text-[10px] text-mission-steel">+{income}/round</span>
          </div>
        </div>

        {/* Rocket counts */}
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-center">
            <span className="led-segment text-lg text-mission-green">{readyCount}</span>
            <span className="text-[8px] text-mission-steel">READY</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="led-segment text-lg text-mission-amber">{buildingCount}</span>
            <span className="text-[8px] text-mission-steel">BUILDING</span>
          </div>
        </div>
      </div>
    </div>
  );
}
