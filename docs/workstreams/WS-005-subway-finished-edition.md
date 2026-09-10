# WS-005 — Subway finished edition

Build OS: v0.12
Phase: BUILDING
Status: Blocked
Updated: 2026-09-10
Implementation State: PR #161 merged; saved planning and Engineering artwork implemented. Production build (including type validation), lint, saved-plan tests, 220 affordability checks and 36 full simulations passed. Publishing follow-up; browser acceptance blocked and independent review pending.
Related PRs: [#161](https://github.com/50thycal/party-games/pull/161) (merged); saved-planning follow-up on codex/subway-saved-planning; [#160](https://github.com/50thycal/party-games/pull/160) (touch tabletop correction; merged); [#159](https://github.com/50thycal/party-games/pull/159) (mobile tabletop; merged); [#154](https://github.com/50thycal/party-games/pull/154), [#155](https://github.com/50thycal/party-games/pull/155), [#156](https://github.com/50thycal/party-games/pull/156), [#157](https://github.com/50thycal/party-games/pull/157) (merged); [#158](https://github.com/50thycal/party-games/pull/158) (construction clarity and playtest export)

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
Implement and verify automatic active-line planning, saved private ghosts and themed Engineering artwork; publish a follow-up PR for independent review. Do not merge.

## Saved planning and Engineering artwork continuation — 2026-09-10

Owner authorization: implement the requested automatic planner for the currently built line and starter peg, saved ghost routes, no line picker during ordinary placement, an explicit cross-line planner, and Engineering artwork matching Construction.
Non-goals: rule/balance changes, automatic placement confirmation, cross-device plan sync, backend changes, and changes to tabletop camera behavior.
Acceptance: active starter/build opens with planning ready; only explicit Plan exposes line switching; Save retains a private per-game/player/contract ghost through reload and turns; stale plans remain clearly identified; Confirm commits exactly one legal real placement and never a future tail; plans stay hidden at hotseat handoff; planned paths are pale/dashed while the pending real step is solid and labeled; all Engineering goals and Destinations retain exact code-rendered rules with themed illustration. Build, lint, rules tests, persistence regressions and phone/desktop browser checks required.
Framework preflight: canonical VERSION.md checked through GitHub; v0.12 matches adoption. Continue WS-005; no new mission admitted. PR #161 is merged; its post-merge COMMENT explicitly was not an approval and does not retrospectively clear the gate.

Implementation checkpoint: active placement opens the locked Build + plan controls; explicit Plan enables cross-line switching. Save ghost/clear controls use versioned storage plus a session fallback. Pending real pegs have solid route styling and NOW selection; planned targets use P/dashed markers, and future routes use lighter dashed strokes. New pure preparePlan helper refuses stale saved build targets. Engineering/Destination cards retain rules and geometry beneath a 24-panel illustration atlas.

Validation: saved-plan regressions cover 2/3/4-seat starter plans, reload, room/player/contract isolation, defensive copies, built-prefix reconciliation, stale plans, malformed/versioned/oversized storage and unavailable storage. All 36 complete simulations and 220 affordability checks pass. All 24 card IDs have a distinct artwork mapping. Browser verification blocked: Browser Use refused the local preview URL with ERR_BLOCKED_BY_CLIENT. No responsive browser pass, physical iPhone pass, or independent approval is claimed. No permission/protection settings were changed. Next Step: obtain an accessible preview, verify Save/reload/Confirm/handoff on phone and desktop, and independently review the follow-up PR; do not merge.

Artwork: public/subway/engineering-cards.png, generated with the built-in image-generation tool using Construction art as style reference. Prompt specified a full-bleed 6-column × 4-row atlas with 24 square vintage screenprinted transit scenes in parchment, mustard, orange and petrol teal; row-major subjects match the exact ENGINEERING_ART_IDS mapping. No embedded words or rule diagrams; all text and rule geometry remain code-rendered.

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

### PR #160 browser findings

Local supervised preview available. In two-player 390px portrait, illustrated goal/destination cards render and one click drafts a goal. In 844px landscape, crew hiring, target selection, temporary planning and Confirm were exercised. Two segments sketched then Confirm left exactly one real segment built (1/5). Browser inspection caught a full-width crew board shrinking controls, duplicate Construction market keys, and pointer focus scrolling before click; all corrected. Camera viewport suppresses native scrolling and button pointer focus; keyboard navigation retains automatic visibility. Production build/lint and 36 simulations passed before the final focus-boundary adjustment; final validation recorded in PR.

No physical iPhone multitouch test or new complete manual game is claimed. Automated simulations cover full games; browser work here targets the reported interaction regressions. Vercel branch preview requires sign-in and the supplied share token does not unlock it; connected Vercel access returns 403. The local supervised browser is usable. Review State: PR #160 pending independent review. Final pointer regression: one click on Next legal target selected hole 1,1 and enabled Confirm; hiring charged the expected $1M. Focus shortcuts now use work zoom for readable pieces; Fit entire board explicitly fits the map. Physical multitouch remains unverified. Next Step: independent review and physical-phone gesture acceptance for PR #160; no merge by implementation actor.

## Glide and construction schedule — owner continuation

Owner requested smooth phone glide, suppressed text selection/callout, compact company plaques, opponent details hidden initially, distinct Construction artwork, surveys outside starter areas, and an interactive Construction schedule with order/line counts/build history. Accepted in this conversation. Non-goals: advance scheduling, crew economy changes, hiding routes on the map.

Implementation: momentum decelerates after a drag, stops on new touch, and respects reduced motion. The table disables WebKit selection and touch callout; form inputs retain entry behavior. Company plaques have bounded widths, and opponents are behind a Show opponents control. Five illustrated panels map to the five live Construction cards. The reducer rejects surveys on all outer-border holes. Construction schedule rounds and company rows expose only public build facts projected from telemetry, including undone placements; no private drafted card history is displayed.

Acceptance checks: border survey actions rejected without consuming pins; interior survey/Undo preserved; schedule history reflects BUILD and UNDO; 2–4 player simulations finish; production build/lint pass. Browser glide/artwork/schedule verification and independent review required before merge. Next Step: finish validation and publish follow-up PR, then independent review. No merge by implementation actor.

Validation checkpoint: production build, lint, typecheck, full Subway suite and 36 simulations passed. New survey-border and construction-history/Undo regressions passed. Local browser at 844px landscape verified order and three-line counts for both companies, hidden opponent panels, drag movement continuing after release then settling, and computed user-select:none. At 390px portrait, the generated Priority Dispatch card panel rendered correctly in the market. Physical Safari touch-callout and real-device glide feel remain unverified. Independent review pending; no merge performed.
