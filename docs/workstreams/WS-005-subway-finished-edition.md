# WS-005 — Subway finished edition

Build OS: v0.12
Phase: BUILDING
Status: Active
Updated: 2026-09-10
Implementation State: PR #159 merged; owner screenshot feedback implemented on codex/subway-touch-tabletop; validation and visual review in progress
Related PRs: [#159](https://github.com/50thycal/party-games/pull/159) (mobile tabletop; merged); [#154](https://github.com/50thycal/party-games/pull/154), [#155](https://github.com/50thycal/party-games/pull/155), [#156](https://github.com/50thycal/party-games/pull/156), [#157](https://github.com/50thycal/party-games/pull/157) (merged); [#158](https://github.com/50thycal/party-games/pull/158) (construction clarity and playtest export)

## Goal and approved scope
After this change, Subway supports complete 2-, 3- and 4-player games, with more
routes and cards, accessible light-strategy choices, a coherent transit theme,
and tested desktop/phone hotseat play.

Owner authorization: Calvin explicitly requested implementation on a mergeable
branch in the 2026-09-06 ChatGPT session and delegated rules, balancing and visual
design. This supersedes WS-004's pending card-selection and objective-scope
decisions for this implementation. Company-wide objectives are retained. No merge
is authorized here. No extra issue or workstream is needed for a discovered defect
that blocks this goal.

## Build Card / specification
- 2–4 seats, three routes per company, sampled from twelve unique contracts.
- Three mandatory route picks at list price from a 2/3/4-card refillable row; no pass or discounts.
- Empty starting hands, then six picks in any mix from Engineering (14 goals plus
  ten Destinations, globally unique) and Construction (eight copies each of five
  effects, duplicates allowed). Two face-up options per category or blind draw.
- Every held goal is active; no goal commitment, separate Destination draft or
  route assignment. Optional survey purchase follows drafting.
  Draft directions alternate and opening seats rotate between stages.
- Thirteen isolated practice lessons use real controls, camera pans, highlights,
  animated examples and Back/Skip/Replay; phase lesson links are available in-game.
- Drafts, starter pegs, surveys and construction queues visit every seat fairly.
  Priority rotates every period; any two overlapping companies create contention.
- Contact payments belong to the actual route owners. Shared vertices charge once
  per owner. An Access Pass subsidizes the next build; a City Grant provides $3M.
- Five Construction cards: Advance Booking, Relief Crew, Priority Dispatch, City
  Grant and Access Pass. One card per player per construction round. Priority has
  an opening opportunity window; the first claim closes it. Reducer authority,
  exact geometry and explicit Confirm remain.
- Named stations shuffle among well-spaced sites at game start; Major Stations
  have three docks and Minor Stations two. Contracts use 2–6 peg segments with
  a seven-segment hard cap and four premium route specials.
- $40M starting capital and a cheapest-complete-schedule suggestion. Validate every
  three-route combination can fund its complete schedule at list price.
- All opponents appear on the same continuous tabletop with private cards hidden.
  Improve printed map, typography and transit-sign styling.
- Local hotseat at `/subway` saves on the current device, supports restart confirmation,
  clear handoff and quick rules. Online rooms keep the existing storage transport.
- Browser lab uses the real reducer to reach all phases in desktop/phone iframes.

## Acceptance / verification
Run build, lint, existing Subway regressions, multiplayer/card/ownership/undo
regressions, 220 portfolio checks and full simulated games for 2/3/4 seats. Playtest
real UI controls in desktop and phone widths, including hotseat privacy, card focus,
placement preview/Confirm, save/resume, and results. Record evidence and honest
limitations; simulation is not a claim of statistically proven human balance.

## Framework preflight
Rechecked canonical VERSION.md at v0.11 on 2026-09-09; previously read v0.11 (Draft), the v0.5–v0.11 migration entries,
FRAMEWORK_SYNC and CLAUDE_HANDOFF. Migrated the framework block, current templates
and intake/result rules. Reviewed mode retained; historical work is not reopened.

## Review State
Pending independent review. No approval or merge claimed.

## Validation checkpoint
- `npm run build`, `npm run lint`, `./scripts/test-subway.sh`, and `git diff --check` pass.
- Existing geometry/rules regressions and new multiplayer, content, actual-owner
  toll, subsidy, undo, priority and finite-procurement checks pass.
- All 220 three-route portfolios can fund routes, minimum 16-round crew bills and five pins.
- 36 deterministic full games (12 each at 2/3/4 players) reached RESULTS.
  Average completed routes per company: 3.00 / 2.97 / 2.98; zero final-debt companies.
  Minimum remaining cash: $15M / $12M / $7M. Heuristic simulations do not prove
  human balance or validate human interaction and layout.
- Original live prototype inspected in browser. Updated branch visual playtest is
  **not completed**: cloud browser cannot reach localhost; Vercel preview redirects
  to authentication, and connected Vercel temporary-access request returned 403.
  Deployment status itself is successful. No protection settings were changed.

## Station readability checkpoint
Owner requested larger, distinct station signs and removal of district labels,
river and park shading. PR #157 increases name text 10.5 → 17 and metadata 9 → 12,
adds stable station colors and major/minor sign shapes, and removes the scenery.
Build, lint, full Subway tests (36 simulations) and diff checks pass. Browser
visual acceptance remains pending; no current-head independent approval claimed.

## Construction clarity and playtest-data checkpoint
After PR #157 merged, the owner added four requirements for follow-up PR #158:
pulse the complete active line,
draw the selected next segment before Confirm, stop immediately when no legal
construction remains, and provide a copy/paste AI playtest report. State v13
stores a finite full ledger of every accepted action with timestamps, payloads,
phase/round changes, and before/after player economy snapshots. Undo preserves
the reverted action in that ledger and appends its own action. Results export
structured Markdown plus JSON, final routes, cards/resources, scoring, station
layout, settings, rankings, end reason, and the complete action ledger. Rejected
actions remain untracked because the pure reducer returns the original state.

Reducer and export regressions cover immediate final-segment termination, normal
round-16 termination, Undo telemetry continuity, and report content. The ghost
segment was verified in the desktop construction fixture. Active-route animation,
the Results report control, and phone layouts remain in the browser visual gate.

## Next Step
Obtain an accessible preview to verify desktop/phone layouts,
card dialogs, placement preview/Confirm, all-seat handoff and local save/resume.
Use `/subway` for local hotseat and `/test/subway` for responsive phase fixtures.
Fix any defects on this branch, then request independent review. Do not merge
before the outstanding visual gate and independent review are satisfied.

## Mobile tabletop continuation — 2026-09-10

Owner authorized the playtest specification and implementation in this conversation (Yes please proceed; Continue your work). Goal: phone-readable tabletop play and temporary future-route sketches. Non-goals: rule/balance changes, authentication or backend room changes.

Acceptance checks: board fits independently of readable card text; ordinary drafting/play is direct; real pegs require Confirm; temporary ghost tail begins at pending peg and never commits future nodes or saves; Settings owns log; readable results and copy/download fallback. Typecheck, build, lint and Subway suite required. Browser phone/desktop verification and independent review required before merge.

Implementation state: MobileTable uses a separate phone tray and fit/magnify map; shared rules/action strip remain authoritative. Pointer drags exclude interactive controls. Existing persisted plans are no longer loaded by GameView; the new sketch is temporary. No existing stored plan data is deleted.

Framework: checked canonical v0.12 at 815e6a19c2ae243d5435282bee822b86fb823775. Applying finite-work intake and acceptance rules to this existing mission; no new workstream. Older workstream board dispositions are not changed without owner decisions.

Review State: Not reviewed.
Next Step: verify PR #159 preview and independently review.

Publication checkpoint: owner explicitly authorized Push. Terminal credentials had expired; connected GitHub upload succeeded with an exact matching implementation tree. PR #159: https://github.com/50thycal/party-games/pull/159. Local rules/lint/build validation passed; preview visual checks and independent review remain pending.

## Touch tabletop correction — 2026-09-10

Goal: restore a full navigable table on mobile after owner screenshots exposed a tiny map, oversized fixed controls and lost illustrated card faces. Non-goals: game rules, scoring, persistent state and room networking.

Implemented: one TabletopCanvas for all devices, illustrations in the card market, compact phone overlays/header, 16px native selects, touch drag from cards, midpoint-anchored pinch/pan, and keyboard-only focus camera movement. Temporary previews and real peg Confirm remain unchanged. Canonical VERSION.md rechecked: v0.12, compatible.

Acceptance: inside-table pan/zoom leaves page controls unchanged; cards readable by navigating the table; Confirm does not commit ghost tails; phone portrait/landscape and two-player browser flow verified before merge. Automated gates and browser preview pending. Review State: pending independent review. Next Step: validate and publish correction, then verify deployed preview.
