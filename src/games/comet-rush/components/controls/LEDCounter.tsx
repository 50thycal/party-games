"use client";

import { cn } from "@/lib/cn";

interface LEDCounterProps {
  value: number;
  digits?: number;
  size?: "sm" | "md" | "lg";
  color?: "green" | "amber" | "red";
  label?: string;
  className?: string;
}

/**
 * Retro 7-segment LED display style counter
 * Inspired by 1960s mission control readouts
 */
export function LEDCounter({
  value,
  digits = 2,
  size = "md",
  color = "green",
  label,
  className,
}: LEDCounterProps) {
  const displayValue = String(Math.abs(value)).padStart(digits, "0");
  const isNegative = value < 0;

  const sizeClasses = {
    sm: "text-lg px-1.5 py-0.5",
    md: "text-2xl px-2 py-1",
    lg: "text-4xl px-3 py-2",
  };

  const colorClasses = {
    green: "text-mission-green shadow-glow-green",
    amber: "text-mission-amber shadow-glow-amber",
    red: "text-mission-red shadow-glow-red",
  };

  const bgColorClasses = {
    green: "bg-mission-green/10",
    amber: "bg-mission-amber/10",
    red: "bg-mission-red/10",
  };

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      {label && (
        <span className="label-embossed text-[10px]">{label}</span>
      )}
      <div
        className={cn(
          "led-segment font-bold tracking-wider rounded-sm",
          "border border-mission-steel-dark",
          "bg-mission-dark",
          sizeClasses[size],
          bgColorClasses[color]
        )}
      >
        <span className={cn(colorClasses[color], "drop-shadow-lg")}>
          {isNegative && "-"}
          {displayValue}
        </span>
      </div>
    </div>
  );
}
