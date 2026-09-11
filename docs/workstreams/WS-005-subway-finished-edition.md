# WS-005 — Subway finished edition

Build OS: v0.12
Phase: BUILDING
Status: Active
Updated: 2026-09-11
Implementation State: PR #168 merged. The manual Plan panel viewport correction is implemented and validated on codex/subway-plan-panel-fit: the tabletop remeasures after a wrapping hotseat header changes its top edge, keeping the complete bottom HUD inside the visual viewport. Production build/type validation, lint, full Subway suite, 220 affordability checks and 36 simulations passed. Independent current-head review remains pending.
Related PRs: follow-up Plan-panel viewport PR pending; [#168](https://github.com/50thycal/party-games/pull/168) (saved-plan opt-in; merged); [#167](https://github.com/50thycal/party-games/pull/167) (Undo/pan; merged); [#166](https://github.com/50thycal/party-games/pull/166) (tap-and-plan; merged); [#165](https://github.com/50thycal/party-games/pull/165) (build-cost preview; merged); [#164](https://github.com/50thycal/party-games/pull/164) (active-route guidance; merged); [#163](https://github.com/50thycal/party-games/pull/163) (direct-piece mobile fixes; merged); [#162](https://github.com/50thycal/party-games/pull/162) (saved planning; merged); [#161](https://github.com/50thycal/party-games/pull/161) (merged); [#160](https://github.com/50thycal/party-games/pull/160) (touch tabletop correction; merged); [#159](https://github.com/50thycal/party-games/pull/159) (mobile tabletop; merged); [#154](https://github.com/50thycal/party-games/pull/154), [#155](https://github.com/50thycal/party-games/pull/155), [#156](https://github.com/50thycal/party-games/pull/156), [#157](https://github.com/50thycal/party-games/pull/157) (merged); [#158](https://github.com/50thycal/party-games/pull/158) (construction clarity and playtest export)

## Goal and approved scope
Current continuation after PR #168 merged: owner reports that the taller manual Plan panel is clipped at the bottom of an iPhone viewport after the hotseat header wraps. Keep the existing panel and tabletop interaction, but make the camera surface follow post-render changes to its top edge so the whole bottom HUD moves upward. Non-goals: planner behavior, reducer rules, saved plans, panel redesign or new controls. Acceptance: every manual Plan action remains visible in 390px portrait and 844px landscape; build, lint and full Subway suite pass; independent review remains required.

Current continuation after PR #167 merged: owner reports that a saved plan automatically selects the next real segment on a later turn. Restore the saved ghost visually, but require the player to tap the next peg before Confirm becomes available; following the saved peg preserves its tail, while another legal peg replaces the future sketch. Non-goals: changing reducer legality, confirmation, plan storage or other tabletop UI. Acceptance: a legal two-round browser flow shows ghost/no pending/no Confirm before tap, then one pending and exactly one committed build after tap/Confirm; saved-plan tests, build, lint and Subway suite. Independent review remains required.

Current continuation after PR #166 merged: owner requests Undo while sketching either a pending real peg or ghost, clearer bottom-panel separation, more pan buffer around edge cards, and a wider/shorter Construction schedule. Undo step removes only the last unconfirmed sketch node; the existing committed-placement Undo remains distinct. Non-goals: rules, saved-state shape, extra dialogs or new game features. Acceptance: successive ghost/pending undo and Confirm behavior; phone bottom-control spacing; last cards can pan toward the viewport centre; horizontal schedule with usable crew controls; build/lint/Subway suite and browser checks. Implementation on codex/subway-undo-pan-space is in progress; independent review remains required.

Current owner-authorized continuation: tap the pending starter/real segment, immediately extend the ghost using bright yellow legal targets, Save ghost and Confirm only the real peg. Remove Next hole, Plan tools, coordinates, legend and cost receipt from the active planner. Tap an unbuilt peg to revise the sketch without another tool. Center Construction schedule above the pegboard, remove its duplicate card faces, run each hand horizontally and hide Contract office/Market after drafting. Keep the zoomable shared tabletop, manual cross-line planning, reducer rules, private saved plans and explicit confirmation. Acceptance: direct starter/build taps, ghost correction/save/one-step confirmation, desktop/phone layout, build/lint/full Subway suite. The latest owner instruction supersedes the earlier receipt display and compact-tools decisions; no new adjacent ideas admitted.

Build-cost continuation — owner delegated three new ideas, evaluation, selection and build. Chosen: inline build-cost preview over station finder and crew completion preview. Goal: before confirming a real segment, show its toll recipients, personal cost, resulting cash and projected debt penalty consistently in automatic planning and ordinary placement. Non-goals: changing toll/debt rules, whole-ghost budgeting, extra confirmation dialogs, starter charges or other players' private history. Acceptance: quote agrees with reducer for free/multiple-owner/subsidized/debt builds; no quote for manual ghost planning or starter; phone/desktop layout; build/lint/full Subway suite. PR #164 merged; start from merged main. Canonical v0.12 already checked this session; repository remains reviewed mode. Station finder and crew completion preview PARK, no tickets.

Build-cost validation: 12 quote-versus-BUILD comparisons across free/multiple-owner contacts, normal/low/negative cash, with and without Access Pass, plus same-recipient aggregation. Checks cover no mutation, actual recipient transfers, cash afterward, debt penalty and pass consumption on free builds. Existing rules/saved-plan suite, 220 affordability checks and 36 complete simulations passed; production build/type validation, lint and diff check passed. Four-seat browser fixture at 390px portrait showed an inline free-build quote ($42M → $42M) with Confirm visible; ordinary placement showed a $1M payment to Evergreen Metro ($42M → $41M). Desktop Access Pass action updated that selected quote to city-funded $1M and unchanged player cash. Manual Plan hid the quote. Actual subsidized transfer/debt outcomes were verified by reducer comparisons; no additional full UI game or physical-device pass is claimed. Preview stopped. React checklist: pure derived values, no new effects/state.

Active-route final validation: production build/type validation, lint, rules/saved-plan regressions, 220 affordability checks and 36 complete 2/3/4-player simulations passed. Browser evidence below covers the presentation change; no new automated visual test added. Preview stopped after checks. Independent review pending.
Current continuation (owner delegated selection and implementation): choose among active-route guidance, blocked-move explanations and scoring highlights. Selected active-route guidance because it applies to every placement without changing balance. Non-goals: rules/economy, new dialogs, dimming useful board information, scoring changes or additional assets. Acceptance: starter border/first-length instructions; real remaining count independent of ghost sketches; labeled real endpoint; Lines shortcut opens active contract; manual planning remains distinct; phone/desktop browser checks plus build/lint/Subway suite. PR #163 is merged; this continuation starts from its merged main head. Canonical v0.12 checked 2026-09-11. Other two ideas PARK, no tickets.

Browser checkpoint: four-seat legal-action fixtures at 390px portrait and 1280px desktop. Starter with a two-segment saved sketch still correctly reports five real segments left and the first length. Hired Garden Spur and Old Town Tram for $3M; Garden Spur shows Build 4 pegs / 5 left, while selected-step continuation says Next ghost: 2 pegs. Lines opens the second contract (Garden Spur), not the first. Confirm switches to Old Town Tram / Build 2 pegs / 4 left. Desktop inspection shows FROM on the real endpoint, NOW on pending peg and pale dashed ghosts. No physical touch or human balance claim. React checklist applied; guide uses derived values without new state/effects.

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

Plan-panel viewport continuation: independent review pending for the follow-up PR. The tabletop height now remeasures after committed layouts, covering hotseat header wrapping that does not emit a window resize. In the legal four-seat construction fixture, the complete manual Plan action row remained inside the embedded phone viewport: portrait placed Close plan at y=760–804 with 38px viewport clearance, and landscape at y=302–346 with 42px clearance. Production build/type validation, lint, diff check, full rules/saved-plan suite, 220 affordability checks and 36 complete simulations passed. No physical-device acceptance claimed.

Saved-plan opt-in continuation: independent review pending for the follow-up PR. A legal four-seat browser flow created and saved a Garden Spur ghost in round 1, confirmed exactly one real build (12 → 13 built pegs), advanced all companies into round 2, and rehired Garden Spur. On entry, the saved ghost was visible (three plan pegs) while pending peg count was zero, yellow plan-target count was zero and Confirm was disabled; six legal real targets were available. Tapping the saved next peg enabled Confirm, created exactly one pending peg and exposed yellow follow-on targets. Confirm then increased the total built count exactly once (21 → 22). Production build/type validation, lint, diff check, saved-plan regression, full rules suite, 220 affordability checks and 36 complete simulations passed. React checklist applied: no new effect, derived legality remains memoized, tap transitions remain event-driven. Preview stopped after checks; no physical-device acceptance claimed.

PR #168: Merged. Its saved-plan opt-in behavior is the baseline for this continuation; no historical approval is inferred here.

PR #167: Independent current-head review pending; published with an exact matching validated tree. No self-approval or merge. Browser checks: 390px starter Undo removed one ghost while preserving Confirm, then removed the pending starter and disabled Undo/Confirm. Fresh starter + ghost → Undo → Confirm produced one built peg and retained committed Undo. Desktop construction Undo cleared a pending real segment with built count unchanged at 12; ghost-only Undo preserved Confirm; confirming increased built count to 13. Bottom controls had opaque backing and a 12px gap at 390px and 844px landscape. Panning moved the final card row above the old boundary into the usable centre (roughly y=181–597 after adjustment). Wide schedule measured about 919×245 screen pixels at overview zoom, with crew controls beside history; route choices subsequently constrained to one three-column row. No physical-touch acceptance claimed. Preview stopped after checks.

PR #166: Pending independent review of its current head. Published through connected GitHub with an exact matching validated implementation tree. No self-approval, merge or historical approval inferred.

Final compiled-UI check: hired one Garden Spur crew, used Give up remaining builds on Construction schedule, and verified the turn advanced to Ember Transit. The simplified planner therefore retains a reachable way to end construction. Preview stopped after verification.

Tap-and-plan validation: production build/type validation, lint, diff check and full Subway suite passed, including 220 affordability checks, 36 complete 2/3/4-seat simulations and saved-plan/quote regressions. Desktop starter taps immediately showed yellow targets; direct ghost tap/save left the real board unchanged, revising a ghost by tapping it worked, and Confirm left one built starter plus its saved ghost. At 390px, hired Garden Spur/Old Town Tram, directly tapped a real build then a yellow ghost target, saved, and confirmed: built peg count increased from 12 to 13 and the active route changed to Old Town Tram. Each Engineering/Construction row had equal card top coordinates and increasing horizontal positions. Schedule/board centers matched and the schedule had zero card articles; office/Market were absent in construction. Inspected 844px landscape schedule and compact controls. React checklist applied: event-driven sketch changes, no new effects or persistence shape. Physical-device testing remains unclaimed.

PR #162: Pending independent review. Published through connected GitHub with an exact matching validated implementation tree. Browser acceptance remains blocked; no finalization or merge claimed.

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
Publish the Plan-panel viewport follow-up, obtain independent current-head review, then physical iPhone acceptance. No self-approval or merge.

## Direct-piece playtest continuation — 2026-09-11

Owner authorization: thoroughly playtest and improve mobile gameplay, minimizing popup windows and making ordinary actions available on the actual game pieces. Significant continuation of WS-005; no new mission. Non-goals: game economy/rules, backend, drag-to-purchase gestures, replacing the shared tabletop, or removing real-peg confirmation/privacy handoff. Canonical Build OS v0.12 checked through GitHub and compatible.

Acceptance: direct priced route purchase; readable on-piece card effects and actions; accessible survey/crew controls; automatic active-line planning on mount, handoff and subsequent hired routes; saved ghosts never commit as real construction; usable phone portrait/landscape and desktop navigation; scoring without horizontal clipping. Required build, lint, rules suite, 220 affordability checks and 36 complete simulations.

FIX NOW findings implemented: redundant route-purchase modal; initially closed automatic planner caused by mount-effect replay; planner target navigation failing to pan to the selected hole; focus centering between hand pieces; survey purchase outside the opening viewport; construction actions following history; oversized working zoom on a short screen; stale post-drag click suppression; small/crowded planning controls; and clipped portrait results. DEC-033 records the interaction choices. Engineering goals are fully readable on the table; Construction cards have explicit Play buttons and blocker reasons. Dispatches are serialized and failures reported inline. No reducer/state-version change.

Browser evidence (real controls in legal phase fixtures, not a claim of a complete manually played game):
- 390px portrait: four-seat route Buy charged $6M, added one route, changed actor and disabled subsequent purchases; zero dialogs. Engineering drafting consumed one pick and disabled the waiting player's row; artwork and exact rules visible.
- Survey purchase opens on its own slip; adding one pin and paying $1M reaches the waiting state without a dialog.
- Automatic starter planning appears on mount and after hotseat reveal. A saved starter sketch rendered one solid pending peg and a 0.55-opacity future peg. Confirm changed only the pending peg to built. Handoff removed all private ghost pegs from the DOM until reveal.
- Construction: priority passes for two companies; one-crew purchase charged $1M. Saved lookahead rendered pending/plan segments separately; Confirm built exactly one. Undo restored the pending step; rebuilding produced public history `#57 undone · #59 built`.
- Direct City Grant play increased cash from $35M to $38M, removed the card, disabled other cards for that round, and opened no dialog. Desktop two-crew hiring charged $3M; the next hired route entered its locked planner automatically after the first build.
- 844px landscape: reviewed opening controls, panned the shared table and checked working zoom. Three-seat procurement shows three priced route options. Full-table/Board behavior retains separate controls.
- Phone scoring: the real Reveal action reached RESULTS. Winner and points are readable first; measured results scrollWidth equals clientWidth (373px), with no horizontal overflow. Export is an optional inline section below scores.
- Existing rules/saved-plan regressions, 220 affordability checks and 36 complete 2/3/4-player heuristic simulations pass. Lint passes. Physical iPhone multitouch, Safari callout behavior, human strategic balance, and independent review are not claimed.
- Real two-player local entry initially failed on HTTP preview because randomUUID was unavailable. Fixed with a 128-bit getRandomValues fallback for the local game namespace. Afterward, starting, buying University Shuttle for $6M, reloading to the same owned route/$54M balance, and passing through Company 2's privacy veil all worked. HTTPS continues using randomUUID.

Review State: PR #163 pending independent review; no approval or merge performed. PR #162 is now merged; its prior pending review statement is historical, not retrospectively cleared.

Final validation: `npm run build` completed with type validation, `npm run lint` passed without warnings/errors, `./scripts/test-subway.sh` passed (including 220 affordability checks and 36 complete simulations), and `git diff --check` passed. Supervised preview stopped after verification. No complete manually played game or physical device pass is claimed.

Publication checkpoint: PR #163 opened through connected GitHub. Validated implementation head: 4cc00d770104f39b4540e03698980465e4c091be. A documentation-only publication checkpoint follows it; independent review must name the current full head. This is not merge finalization.

### Complete UI game continuation — 2026-09-11

Final continuation checks: production build/type validation, lint, complete Subway rules/saved-plan suite, 220 affordability checks, all 36 full simulations and git diff --check passed. Supervised preview stopped after verification.

Continued the real two-company local game through remaining route/card drafts, survey purchase/placement, all six starters, six construction rounds and Reveal Engineering & score. All six routes completed; Company 2 won 29–23, with $12M versus $10M remaining. Contact tolls, changing crew counts, consecutive turns, private handoffs and automatic end-of-construction were exercised through visible UI controls. Browser-driven legal-target selection is not a human strategic balance assessment. This extends the earlier phase checks; the complete game ran at desktop size, not on a physical phone.

Verified issues corrected: camera focus now follows completed company handoffs and new rounds (without moving on routine polls); automatic focus caps magnification at 110% so the survey slip is not enlarged until its actions are clipped; survey purchase quantity resets when changing company/room. Manual zoom remains available. React dependency checklist applied. Independent current-head review and physical iPhone gesture/callout acceptance remain pending; no approval or merge performed.

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
