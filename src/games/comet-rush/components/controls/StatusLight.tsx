"use client";

import { cn } from "@/lib/cn";

interface StatusLightProps {
  status: "on" | "off" | "warning" | "danger";
  size?: "sm" | "md" | "lg";
  pulse?: boolean;
  label?: string;
  className?: string;
}

/**
 * Status indicator light like those on mission control panels
 * Can pulse to indicate activity
 */
export function StatusLight({
  status,
  size = "md",
  pulse = false,
  label,
  className,
}: StatusLightProps) {
  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  const statusClasses = {
    on: "bg-mission-green shadow-glow-green",
    off: "bg-mission-steel-dark",
    warning: "bg-mission-amber shadow-glow-amber",
    danger: "bg-mission-red shadow-glow-red",
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn(
          "rounded-full",
          "border border-mission-steel-dark",
          sizeClasses[size],
          statusClasses[status],
          pulse && status !== "off" && "animate-pulse-glow"
        )}
        style={{
          boxShadow: status !== "off"
            ? `inset 0 -2px 4px rgba(0,0,0,0.5), 0 0 8px currentColor`
            : `inset 0 -2px 4px rgba(0,0,0,0.5)`,
        }}
      />
      {label && (
        <span className="label-embossed text-[10px]">{label}</span>
      )}
    </div>
  );
}
