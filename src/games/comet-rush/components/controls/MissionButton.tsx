"use client";

import { cn } from "@/lib/cn";
import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface MissionButtonProps {
  variant?: "primary" | "danger" | "warning" | "success";
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit" | "reset";
  children: ReactNode;
}

/**
 * Chunky retro button styled like 1960s mission control hardware
 * Has a 3D pressed effect and optional status light
 */
export function MissionButton({
  variant = "primary",
  size = "md",
  icon,
  isLoading,
  disabled,
  className,
  onClick,
  type = "button",
  children,
}: MissionButtonProps) {
  const variantClasses = {
    primary: "bg-mission-panel-light border-mission-steel text-mission-cream hover:bg-mission-panel",
    danger: "bg-mission-red-dim border-mission-red text-mission-cream hover:bg-mission-red/30",
    warning: "bg-mission-amber-dim border-mission-amber text-mission-dark hover:bg-mission-amber/30",
    success: "bg-mission-green-dim border-mission-green text-mission-cream hover:bg-mission-green/30",
  };

  const sizeClasses = {
    sm: "px-2 py-1 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const isDisabled = disabled || isLoading;

  return (
    <motion.button
      type={type}
      whileTap={isDisabled ? {} : { y: 2, boxShadow: "0 1px 0 #0d0d1a, 0 2px 4px rgba(0,0,0,0.3)" }}
      className={cn(
        "relative font-bold uppercase tracking-wider",
        "border-2 rounded-sm",
        "transition-colors duration-100",
        "shadow-button-3d",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={isDisabled}
      onClick={onClick}
    >
      <span className="flex items-center justify-center gap-2">
        {isLoading ? (
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          icon
        )}
        {children}
      </span>

      {/* Embossed highlight */}
      <div className="absolute inset-x-0 top-0 h-px bg-white/20 rounded-t-sm" />
    </motion.button>
  );
}
