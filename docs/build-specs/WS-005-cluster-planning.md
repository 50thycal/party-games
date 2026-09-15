# WS-005 — Largest Cluster and bounded bot planning

Build OS v0.12; owner approved implementation in chat on 2026-09-15.
Significant continuation of WS-005, not a new mission. Canonical v0.12 checked.

## Goal
Add the agreed shared Largest Cluster bonus and improve algorithmic bot planning without LLM calls.

## Approved rules
- Clusters contain route-node holes across all companies, joined only by orthogonal adjacency or shared holes; no diagonal or string-only links. Survey Pins are excluded.
- Size is distinct occupied holes. A company's presence at each hole counts once, even if multiple own lines share it.
- Find all equally largest clusters, aggregate company presences across them, award the bonus once to the companies with the most presences.
- Award 6 VP to a sole leader, 3 each for two leaders, 2 each for three, zero for four. Empty boards award zero. Singleton occupied holes are valid clusters.
- Longest Network and its existing transfer rules/awards stay unchanged. Bump rules/state version so existing games do not change scoring mid-game.

## Bot scope
Company-wide objective allocation across lines, bounded multi-step candidate search, evaluation of objective/completion gains against crew/toll/debt costs, and reusable plans that invalidate on relevant observations. Shared by Lab and audit; no hidden opponent cards/decks, LLM requests, new service, or unbounded search. Preserve legal reducer authority and deterministic replay. Keep policy v2 available as an explicit benchmark baseline, not a second default.

## Acceptance checks
1. Cluster scoring covers empty, shared-hole deduplication, orthogonal/diagonal/string distinctions, all leader tie counts, tied-largest aggregation and unchanged longest-network behavior.
2. Rule text, result ledgers and exported settings explain the new award; old versions restart.
3. New bot produces legal deterministic actions and only observes own hand/public information. Cache hits and cold plans agree; changed boards/ownership/settings invalidate plans.
4. Search has fixed expansion/memory bounds. Compare old/new policies on identical fresh seeds at 2/3/4 players, reporting scores, cards, debt, unfinished routes and runtime, without claiming human calibration or guaranteed improvement.
5. Build, lint and full Subway suite pass. Browser verification attempted at phone/tablet sizes; report access failures honestly. Independent review required before merge.

## Non-goals
No other economy/card retuning, diagonal transfers, LLM integration, physical-device acceptance claim, automatic merge, or new testing UI.
