# WS-005 — Paid extensions and configurable line count

Status: Owner-authorized implementation; blocked before coding by offline workspace.
Date: 2026-09-20. Build OS v0.12; canonical version checked via GitHub this session.
This is a continuation of WS-005, not a new workstream. Continue this draft PR
through implementation and review; do not open a second PR for the same bundle.

## Goal
After this change, players who finish all their contracted lines can keep making
meaningful board decisions, and the host can experiment with lines drafted per
company at game setup.

## Approved intent
- After all a company's drafted lines are complete, it may extend any owned line.
- Pay $1M for an extension. The preceding accepted proposal allows one extension
  per subsequent company turn, one or two peg spaces, subject to normal occupancy,
  heading and crossing rules. No extra normal crew bill on top of the extension fee.
- Keep original recipe completion, completion VP and qualifying original
  border-ending achievements intact. Never repeat the line completion cash reward.
- Extension stations/strings contribute normally to network length, transfers,
  Destination service and relevant Engineering goals, and can incur crossing tolls.
- Add a setup control for how many Line Contracts each company drafts; three stays
  the default. Apply one immutable value to all companies for that game.
- Keep the nine-round limit; no first-finisher early-end trigger.
- Other unapproved balance/design ideas remain parked. The polished introduction
  gets a handoff only in this PR; its implementation belongs in another session.

## Implementation contract
1. Model recipe completion separately from later physical extensions. Do not
   change which peg was the recipe's final station when appending an extension.
2. Enable extension selection only when every owned contract is finished, starting
   on the next company turn. Offer each extendable owned line, preview, confirm and
   skip. No second extension in the same turn and no repeated completion payment.
3. Use shared authoritative legality/cost helpers for reducer, board targets,
   previews, companion permissions and bots. Reject out-of-turn, occupied,
   out-of-range, self-crossing and stale/duplicate submissions without charging.
4. Preserve existing Undo, borrowing policy, payment events and paid-once Destination
   rewards. An extension's $1M construction charge should follow the existing
   construction borrowing rule, rather than introduce a separate cash restriction.
5. Card purchases retain the existing price, caps and before-action timing.
   Do not automatically pay $1M for passing: the owner's latest selection was the
   paid-extension option, not a new passive-income rule.
6. Prevent construction exhaustion from skipping a company with a legal extension.
   All-company completion alone is no longer proof that no board actions remain.
7. Setup control must exist wherever the host starts a game: local tabletop,
   companion host and Playtest Lab. Persist the value through server start,
   projections, reconnect, recordings, replays and reports. Reject invalid API
   values; never silently change an in-progress room.
8. Audit fixed three-line assumptions in procurement, draft order/termination,
   starter placement, crew controls, bot planning, progress panels, scoring,
   instructions, simulations and card-audit acquisition. Engineering picks and
   Destination deal counts do not automatically change with line count.
9. Bump state/rules compatibility and affected bot/audit versions as required.
   Update PROJECT_MODEL and append accepted decisions when implementation is concrete.

## Source audit and material implementation risk
Current main is rules v29. config.ts contains 13 unique contracts, starts players
at $40M, rejects PROCURE when unaffordable, hardcodes three acquisitions, and
constructionExhausted ignores finished routes. lineComplete uses recipe station
count while segmentsBuilt counts all route legs; these need deliberate separation.

Preserving one unused unique contract gives supply ceilings of 6/4/3 per company
for 2/3/4 players. These are supply bounds, not an approved promise that every
higher-count portfolio is affordable. Six cheapest contracts cost $35M; four
most expensive cost $42M. An unrestricted high-count selector can deadlock the
existing cash-only draft. Before exposing higher counts, determine a legal
acquisition approach. Do not silently raise starting cash, duplicate line colors,
allow contract borrowing, or narrow the feature to only fewer than three lines.
If solving this needs a new product ruling, show the owner the concrete trade-off.
No such ruling has been made in this blocked session.

## Acceptance checks
- Default three-line game keeps existing acquisition/crew/card/economy behavior.
- Every offered line count finishes procurement and starter placement with the
  advertised number of unique lines per company; insufficient funds cannot deadlock.
- Extension unlock, any-line choice, single action/turn, $1 fee, ordinary tolls,
  geometric validation, skip, Undo, duplicate/stale requests and reconnect tested.
- Recipe completion and prior border-ending qualification survive extensions;
  completion cash does not repeat; new Destination cash pays once and Undo reverses.
- New stations/length affect appropriate awards/objectives while recipe progress
  stays capped at its original total. Clear extension count/label on line UI.
- Complete 2/3/4-player simulations exercise default and supported custom counts,
  with bots taking legal extensions and reaching RESULTS/replaying deterministically.
- npm run build, npm run lint and ./scripts/test-subway.sh; browser shared board
  and portrait companion, including completed-network continuation.
- One ready-for-review implementation PR, independent current-head review and
  documentation-only finalization. Do not merge without owner direction.

## Current execution blocker
The initial repository read succeeded; subsequent shell calls failed with
exec-server disconnected and then 409 environment_offline. A separate Node runtime
attempt failed with the same offline environment. No runtime code was changed,
no tests for this bundle ran, and no build completion is claimed. This draft
records the approved work and intro handoff while the execution environment is down.
