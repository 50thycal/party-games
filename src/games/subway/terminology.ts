import type { BendMode } from './bends';

/** Player-facing crew explanation, shared by setup/help and construction. */
export function crewActivationText(mode: BendMode = 'straight'): string {
  if (mode === 'delayed') return 'Each hired line gets one construction activation: finish its segment or build one leg and stop at a bend. Hire that line again on a later turn to continue; other hired lines can still build.';
  if (mode === 'tokens') return 'Each hired line gets one construction activation to finish one segment, spending one token per bend. Extra tokens cost $3M each from available cash on Confirm.';
  return 'Each hired line gets one construction activation to finish one straight segment.';
}
