/**
 * Mission Control Theme Constants
 * 1960s Space Race / Cold War aesthetic
 */

// Card type colors for consistent theming
export const cardColors = {
  engineering: {
    bg: 'bg-mission-eng-green',
    border: 'border-emerald-600',
    text: 'text-emerald-300',
    glow: 'shadow-glow-green',
  },
  espionage: {
    bg: 'bg-mission-pol-red',
    border: 'border-rose-600',
    text: 'text-rose-300',
    glow: 'shadow-glow-red',
  },
  economic: {
    bg: 'bg-amber-900/80',
    border: 'border-yellow-600',
    text: 'text-yellow-300',
    glow: 'shadow-glow-amber',
  },
  movement: {
    bg: 'bg-mission-move-blue',
    border: 'border-cyan-600',
    text: 'text-cyan-300',
    glow: 'shadow-glow-green',
  },
  strength: {
    bg: 'bg-mission-str-gold',
    border: 'border-amber-600',
    text: 'text-amber-300',
    glow: 'shadow-glow-amber',
  },
} as const;

// Status indicator colors
export const statusColors = {
  success: {
    light: 'bg-mission-green',
    text: 'text-mission-green',
    glow: 'text-glow-green',
  },
  warning: {
    light: 'bg-mission-amber',
    text: 'text-mission-amber',
    glow: 'text-glow-amber',
  },
  danger: {
    light: 'bg-mission-red',
    text: 'text-mission-red',
    glow: 'text-glow-red',
  },
  inactive: {
    light: 'bg-mission-steel-dark',
    text: 'text-mission-steel',
    glow: '',
  },
} as const;

// Rocket status display
export const rocketStatusConfig = {
  building: {
    icon: '🔧',
    label: 'BUILDING',
    color: statusColors.warning,
  },
  ready: {
    icon: '🚀',
    label: 'READY',
    color: statusColors.success,
  },
  launched: {
    icon: '💨',
    label: 'LAUNCHED',
    color: statusColors.inactive,
  },
  spent: {
    icon: '💥',
    label: 'SPENT',
    color: statusColors.inactive,
  },
} as const;

// Danger level thresholds for comet distance
export const dangerLevels = {
  safe: { min: 13, color: statusColors.success },
  warning: { min: 7, color: statusColors.warning },
  critical: { min: 0, color: statusColors.danger },
} as const;

export function getDangerLevel(distance: number) {
  if (distance >= dangerLevels.safe.min) return dangerLevels.safe;
  if (distance >= dangerLevels.warning.min) return dangerLevels.warning;
  return dangerLevels.critical;
}

// Animation durations (ms)
export const animationDurations = {
  diceRoll: 1500,
  cardDraw: 800,
  cardFlip: 600,
  cometAdvance: 600,
  buttonPress: 100,
} as const;
