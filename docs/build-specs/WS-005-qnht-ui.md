# QNHT — reduce play-screen clutter

Owner authorized 2026-09-17. Continue WS-005. Framework v0.12 checked against
canonical origin/main on this date; no adoption delta.

## Goal and acceptance

- Tablet: no duplicate spectator/phase/phone-choice banners or destination legend.
  Keep board/schedule/table navigation, actionable placement controls, errors,
  handoff privacy and scoring. One settings gear contains playtest/device controls
  and existing table settings. Active company has a subtle player-pad highlight.
- Show compact public leaders above construction order; no right-hand overlay.
- Phone: pinned cash and line-icon progress only; detailed standings, legend,
  mode information and settings under General. Pulse all outstanding hired lines,
  stop pulsing spent activations and respect reduced motion.
- Concise accurate prompts: choose ONE Engineering card from two visible choices
  or draw blind. No change to drafting. Conditional opponent-payment preview only.
- Destination neighborhoods use card colors without C1/D1 codes, split into
  equal-width color bands when shared by selected cards. Keep current-player-only projection/privacy.
- Placement controls share a compact wrapping row. Unselected legal targets retain
  brightness. Payment animation takes 2.6 seconds and arcs above player pads;
  repeat-poll/Undo/reconnect behavior is unchanged.
- Archive QNHT unchanged; separately analyze end reason, scoring and economy.

## Non-goals / parked

Card illustrations and the card-face redesign (short requirements, title/category,
larger VP, explanatory images) await planning; do not generate images yet.
End-condition experiment is recorded only: owner described finishing the round
after the last player completes their final line. Clarify whether the intended
trigger is the FIRST company finishing all lines before any later implementation;
the literal last-player trigger leaves no unfinished lines to build. No rule change.

## Validation

Production build, lint, Subway suite, focused presentation regressions and browser
tablet/phone checks where available. Independent source review and documentation-
only finalization on one PR. Do not merge.
