# WS-005 — JNCG approved card and label redesign

Framework: Build OS v0.12; canonical checked 2026-09-15, matches adoption.
Classification: Significant continuation of WS-005. Owner authorized this single PR
in conversation after reviewing all 21 cards and shared rules. Implementation actor: /root.

## Goal
After this change, Subway should offer 21 clearly labeled Engineering cards with
one authoritative binary evaluator, no surveys, and readable correctly contained
neighborhood labels. Across Town/Opposite Corners accept any two qualifying endpoints.

## Non-Goals
New artwork, cash/crew/route economics, route draft expansion, highlight privacy
changes, notification redesign, public cluster awards, bendable segments, and
remaining unreviewed playtest items. Historical evidence remains unchanged.

## Approved behavior
Seven Line cards: North–South 3; Four-Side Service 4; Turning the Corner 3;
Return Service 3; Across Town 5; Perimeter Service 5; Opposite Corners 6.
Seven Station cards: Transfer Station 3; Three-Line Hub 4; Shared Stations 4;
Back-to-Back Stations 4; Station Chain 5; Neighborhood Interchange 5;
Terminal Interchanges 6.
Seven Neighborhood cards: Small Neighborhood Pair 3; Mixed Service 4;
Large Neighborhood Trio 3; Large Neighborhood Presence 2; Citywide Coverage 7;
Small Neighborhood Focus 5; Neighborhood Stopover 2.

Card copy specifies Single Line / Connected Network / Company-wide, completion,
endpoints, consecutive nodes, opponent contact and distinct stations as applicable.
Endpoint = starter or final peg of a completed contract. Across Town and Opposite
Corners may use two starters, two finals, or one of each in one own network.
One node cannot satisfy two distinct sides. Stations are whole local clusters
of overlapping/orthogonally adjacent different-line nodes. Same-line pairs alone
are not transfers. Opponents qualify only for Shared Stations and never connect
own networks. Station groups may merge and invalidate distinct-station counts.
All cards score once at game end, no tiers; live status recomputes after every action
and Undo. One construction may satisfy multiple cards. Normal starter vacancy holds.

Remove survey purchases/placement/scoring/UI/tutorial content and Surveyed System;
no replacement mechanic or budget change. State version must protect older saves.
Labels use the same area identity/cells as scoring, fit inside actual footprints,
wrap long names, remain pointer-transparent, and adapt to camera scale with clear
boundaries and S/M/L identification. JNCG is the primary regression layout.

## Acceptance Checks
- 7/7/7 cards and exact approved VP; matching draft/hand/phone/report/audit copy.
- Positive and near-miss fixtures for every card, endpoints, distinct sides,
  cluster merging, opponent exclusion, connected-vs-company-wide, and Undo.
- Survey actions cannot mutate state; final draft proceeds directly to starters.
- Generated/JNCG labels stay in their own footprints across zooms; pegs remain
  visible and tappable; phone/iPad/desktop browser checks where available.
- Production build, lint, full Subway suite, and independent current-head review.
- One PR; do not merge or implement the next playtest items.
