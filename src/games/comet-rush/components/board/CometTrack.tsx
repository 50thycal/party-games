"use client";

import { cn } from "@/lib/cn";
import { motion } from "framer-motion";
import { getDangerLevel } from "../../theme/missionControl";

interface CometTrackProps {
  distanceToImpact: number;
  maxDistance?: number;
  lastMovement?: number | null;
  isAnimating?: boolean;
  className?: string;
}

/**
 * Top-down comet approach tracking display
 * Shows the comet's position on an 18-space track toward Earth
 * Comet starts on the RIGHT and moves LEFT toward Earth
 * Styled like a radar or mission tracking display
 */
export function CometTrack({
  distanceToImpact,
  maxDistance = 18,
  lastMovement,
  isAnimating = false,
  className,
}: CometTrackProps) {
  const dangerLevel = getDangerLevel(distanceToImpact);

  // Comet position: at distance 18, comet is at index 17 (right side)
  // At distance 1, comet is at index 0 (left side, near Earth)
  const cometPosition = distanceToImpact - 1;

  // Create track segments (0 = near Earth/left, 17 = far/right)
  const segments = Array.from({ length: maxDistance }, (_, i) => i);

  return (
    <div className={cn("panel-retro p-3", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="label-embossed">COMET APPROACH TRACKING</span>
        {lastMovement && (
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-xs px-2 py-0.5 bg-mission-red/20 border border-mission-red/50 rounded text-mission-red"
          >
            -{lastMovement} UNITS
          </motion.span>
        )}
      </div>

      {/* Track display */}
      <div className="relative bg-mission-dark rounded border border-mission-steel-dark p-2 overflow-hidden">
        {/* Scan line effect */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-mission-green/30 to-transparent animate-scan-line" />
        </div>

        {/* Grid lines (radar style) */}
        <div className="absolute inset-0 opacity-20">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 border-l border-mission-green/30"
              style={{ left: `${(i + 1) * 20}%` }}
            />
          ))}
        </div>

        {/* Track with segments */}
        <div className="relative flex items-center gap-0.5 py-2">
          {/* Earth indicator (LEFT side - impact zone) */}
          <div className="flex flex-col items-center mr-1">
            <div className="w-6 h-6 rounded-full bg-blue-600 border-2 border-blue-400 flex items-center justify-center text-[10px]">
              🌍
            </div>
            <span className="text-[8px] text-mission-green mt-0.5">EARTH</span>
          </div>

          {/* Track segments */}
          <div className="flex-1 flex items-center">
            {segments.map((index) => {
              const isComet = index === cometPosition;
              // Segments the comet has already passed (to the right of current position)
              const isPassed = index > cometPosition;

              // Danger zones: low indices are near Earth (dangerous)
              const isInCriticalZone = index < 6;
              const isInWarningZone = index >= 6 && index < 12;

              return (
                <div
                  key={index}
                  className="flex-1 flex flex-col items-center"
                >
                  {/* Segment marker */}
                  <div
                    className={cn(
                      "w-full h-2 border-r border-mission-steel-dark/50",
                      // Base coloring for danger zones (always visible)
                      isInCriticalZone && "bg-mission-red/20",
                      isInWarningZone && "bg-mission-amber/10",
                      !isInCriticalZone && !isInWarningZone && "bg-mission-panel-light/30",
                      // Highlight passed segments
                      isPassed && "bg-mission-steel-dark/40"
                    )}
                  >
                    {isComet && (
                      <motion.div
                        className="relative h-full"
                        animate={isAnimating ? {
                          x: [0, -5, 0],
                          transition: { duration: 0.6, ease: "easeInOut" }
                        } : {}}
                      >
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-lg">
                          ☄️
                        </div>
                      </motion.div>
                    )}
                  </div>

                  {/* Distance labels (every 3 units) - show distance from Earth */}
                  {(index + 1) % 3 === 0 && (
                    <span className="text-[8px] text-mission-steel mt-1">
                      {index + 1}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Start indicator (RIGHT side - where comet begins) */}
          <div className="flex flex-col items-center ml-1">
            <div className="w-4 h-4 rounded-full bg-mission-steel-dark border border-mission-steel flex items-center justify-center">
              <span className="text-[8px]">☄️</span>
            </div>
            <span className="text-[8px] text-mission-steel mt-0.5">START</span>
          </div>
        </div>

        {/* Distance readout */}
        <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-mission-steel-dark/50">
          <div className="flex items-center gap-2">
            <span className="label-embossed text-[10px]">DISTANCE:</span>
            <span
              className={cn(
                "led-segment text-xl font-bold",
                dangerLevel.color.glow
              )}
            >
              {distanceToImpact}
            </span>
            <span className="text-[10px] text-mission-steel">UNITS</span>
          </div>

          <div className={cn(
            "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
            distanceToImpact <= 6 && "bg-mission-red/30 text-mission-red animate-pulse",
            distanceToImpact > 6 && distanceToImpact <= 12 && "bg-mission-amber/30 text-mission-amber",
            distanceToImpact > 12 && "bg-mission-green/30 text-mission-green"
          )}>
            {distanceToImpact <= 6 ? "CRITICAL" : distanceToImpact <= 12 ? "WARNING" : "NOMINAL"}
          </div>
        </div>
      </div>
    </div>
  );
}
