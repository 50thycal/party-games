# WS-005 — Polished in-game introduction

Owner-authorized 2026-09-20. Significant continuation, Build OS v0.12 (canonical
VERSION.md checked 2026-09-20; no version delta). This request is the approved
Owner Plan/Build Card equivalent; no new gameplay decisions.

## Goal
A host teaches the current game from a short visual walkthrough on the shared
iPad, with particularly clear station connectivity and Destination examples.

## Non-goals
No reducer, economy, compact phone panel, paid extensions, configurable line count,
or automatic merge. PR #197 checked: design-only draft at
74f365d2bd54ff694d0f3ac8bf05b21ca3addbd2. Three lines remain fixed.

## Storyboard (shown before artwork implementation)
1. Company and victory points.
2. Phones versus shared board.
3. Three line contracts, ordered recipes and goal scopes.
4. Empty border starters.
5. Optional cards, crews, preview and Confirm.
6. Before/after orthogonal station join between two own colors.
7. Shared neighborhood with separated stations: not connected.
8. Crossing and diagonal counterexamples.
9. Destination journey through two connected own lines.
10. Current exact/flexible lengths.
11. Current bend mode, one bend, shared length budget.
12. Green targets, yellow lookahead and Undo.
13. Free adjacency, string-contact tolls and debt.
14. Public awards.
15. Scoring/end condition and ready-to-play recap.

## Rule evidence
- DEC-059/060: optional shortening, free station joins, one bend, $3M cards,
  delayed default and ending debt. Earlier rulebooks are not authoritative.
- config.ts: activationCost, cardPurchaseBlocker, cashScore, destinationMet,
  payConnectedDestinations, constructionExhausted, scoring and setup constants.
- network.ts: nodesTransfer, transferGroups, companyNetwork, longestNetwork.
- clusters.ts: largestCluster; award membership differs from own-line connectivity.
- bends.ts: validatePath, remainingLength, tokenCost; bends are not station pegs.

## Acceptance checks
- Read-only modal accepts only setup modes, with no dispatch/room or storage writes.
- Next/Back, skip/close, Escape, progress/jump, ready and reopen work.
- Native dialog focus containment and restoration; no animation/motion dependency.
- Current setup modes reach the modal on setup, phone General and table Settings.
- Landscape iPad and portrait phone tested, including every slide and overflow.
- Navigation leaves saved hotseat game bytes unchanged; no tutorial POSTs.
- Required build, lint and complete Subway suite; independent current-head review.
