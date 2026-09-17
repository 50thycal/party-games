# Engineering goal diagrams and compact faces

Workstream: WS-005. Classification: significant. Framework: Build OS v0.12;
canonical origin/main checked 2026-09-17, no version delta.
Owner authorized the 21-card proposal and subsequent color/label refinements.

## Goal
After this change, players can recognize each Engineering goal from a simple,
accurate diagram and a short sentence, with full rules available on demand.

## Non-goals
No Destination changes, generated raster art, scoring/deck/VP changes, state
migration, ending experiment or unrelated HUD changes.

## Approved requirements
- 7 Line, 7 Station, 7 Neighborhood goal diagrams, reflecting current requirements.
- Network examples use at least two colored lines. Single-line examples have one
  colored qualifying line; transfer support uses neutral gray rather than a
  second route color. Company-wide examples visibly permit disconnected lines.
- Shared Transfer Stations uses blue versus red, with ownership labels.
- S/M/L labels occupy reserved space, not routes/stations. Simple cream/transit
  theme, vector rendering and consistent notation throughout.
- Starter flag, completed-final square, either qualifying end double ring;
  adjacent separate stations enclosed by transfer outlines, never stacked.
- Title, category alone, readable upper-right VP, large diagram, short sentence,
  minimal scope badges. Full rules/tag definitions and notation accessible on
  every card, without nesting interactive controls inside selection buttons.
- Preserve card selection, disabled state, footer, compact/results and details
  callers. Destination face and artwork byte-for-byte unchanged.

## Acceptance checks
1. Every live Engineering ID has distinct art and accurate short copy.
2. Diagram networks and transfer adjacency are valid; separate transfers do not
   accidentally merge; required counts, borders and sizes are clear.
3. Single-line/network colors follow owner rules, independent of company color.
4. All current requirements and VP unchanged and reachable in details.
5. Phone/tablet widths remain readable; no overlapping labels or nested buttons.
6. Build, lint, Subway suite and dedicated card rendering checks pass.
7. Independent current-head review and documentation-only finalization.

## Validation approach
Data/SSR checks for all 21 diagrams, counts/colors/end markers and card semantics;
visual contact-sheet review and browser interaction where access permits.
Browser access restrictions must be disclosed, not bypassed.
