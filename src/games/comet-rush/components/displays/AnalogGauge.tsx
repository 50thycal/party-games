"use client";

import { cn } from "@/lib/cn";

interface AnalogGaugeProps {
  value: number;
  max: number;
  label: string;
  unit?: string;
  size?: "sm" | "md" | "lg";
  color?: "green" | "amber" | "red";
  showValue?: boolean;
  className?: string;
}

/**
 * Circular analog gauge inspired by 1960s instrumentation
 * Shows a value as a filled arc with tick marks
 */
export function AnalogGauge({
  value,
  max,
  label,
  unit,
  size = "md",
  color = "green",
  showValue = true,
  className,
}: AnalogGaugeProps) {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const angle = (percentage / 100) * 270; // 270 degree arc

  const sizeConfig = {
    sm: { width: 60, strokeWidth: 4, fontSize: "text-xs" },
    md: { width: 80, strokeWidth: 5, fontSize: "text-sm" },
    lg: { width: 100, strokeWidth: 6, fontSize: "text-base" },
  };

  const colorConfig = {
    green: { stroke: "#33ff33", glow: "drop-shadow(0 0 4px #33ff33)" },
    amber: { stroke: "#ffbf00", glow: "drop-shadow(0 0 4px #ffbf00)" },
    red: { stroke: "#ff3333", glow: "drop-shadow(0 0 4px #ff3333)" },
  };

  const config = sizeConfig[size];
  const colors = colorConfig[color];
  const radius = (config.width - config.strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = (270 / 360) * circumference;
  const dashOffset = arcLength - (angle / 270) * arcLength;

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <span className="label-embossed text-[10px]">{label}</span>

      <div className="relative" style={{ width: config.width, height: config.width }}>
        <svg
          width={config.width}
          height={config.width}
          viewBox={`0 0 ${config.width} ${config.width}`}
          className="transform -rotate-[135deg]"
        >
          {/* Background track */}
          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={radius}
            fill="none"
            stroke="#1a1a2e"
            strokeWidth={config.strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeLinecap="round"
          />

          {/* Value arc */}
          <circle
            cx={config.width / 2}
            cy={config.width / 2}
            r={radius}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={config.strokeWidth}
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            className="transition-all duration-300"
            style={{ filter: colors.glow }}
          />
        </svg>

        {/* Center value display */}
        {showValue && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className={cn("led-segment font-bold", config.fontSize)}
              style={{ color: colors.stroke, textShadow: `0 0 5px ${colors.stroke}` }}
            >
              {value}
            </span>
            {unit && (
              <span className="text-[8px] text-mission-steel uppercase">{unit}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
