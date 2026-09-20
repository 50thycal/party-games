# WS-005 — Paid extensions (draft-count option parked)

Status: Owner-authorized extension implementation; design-only draft, not yet built.
Date: 2026-09-20. Build OS v0.12; canonical version checked via GitHub this session.
This is a continuation of WS-005, not a new workstream. Continue this draft PR
through implementation and review; do not open a second PR for the same bundle.

## Goal
After this change, players who finish all their contracted lines can keep making
meaningful board decisions. Drafting remains fixed at three lines per company.

## Approved intent
- After all a company's drafted lines are complete, it may extend any owned line.
- Pay $1M for an extension. The preceding accepted proposal allows one extension
  per subsequent company turn, one or two peg spaces, subject to normal occupancy,
  heading and crossing rules. No extra normal crew bill on top of the extension fee.
- Keep original recipe completion, completion VP and qualifying original
  border-ending achievements intact. Never repeat the line completion cash reward.
- Extension stations/strings contribute normally to network length, transfers,
  Destination service and relevant Engineering goals, and can incur crossing tolls.
- Owner follow-up 2026-09-20: withdraw the configurable line-count control from this
  bundle. Keep three Line Contracts per company. Do not expose a setup selector
  or accept a nonstandard count through an API. Revisit only after budget/supply design.
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
7. Preserve fixed three-line procurement, starter placement and existing card counts.
   Configurable draft count is parked, not a hidden feature to implement now.
8. Bump state/rules compatibility and affected bot/audit versions as required.
   Update PROJECT_MODEL and append accepted decisions when implementation is concrete.

## Source audit and material implementation risk
Current main is rules v29. config.ts contains 13 unique contracts, starts players
at $40M, rejects PROCURE when unaffordable, hardcodes three acquisitions, and
constructionExhausted ignores finished routes. lineComplete uses recipe station
count while segmentsBuilt counts all route legs; these need deliberate separation.

The owner parked configurable line counts after this audit: preserving one spare
contract gives supply ceilings of 6/4/3 for 2/3/4 players, but four expensive
contracts can cost $42M against the $40M cash-only draft. This is background for
future design, not an implementation task or blocker for paid extensions.

## Acceptance checks
- Default three-line game keeps existing acquisition/crew/card/economy behavior.
- All setup/transport paths retain exactly three drafted lines per company; no
  adjustable-count selector or nonstandard-count action is introduced.
- Extension unlock, any-line choice, single action/turn, $1 fee, ordinary tolls,
  geometric validation, skip, Undo, duplicate/stale requests and reconnect tested.
- Recipe completion and prior border-ending qualification survive extensions;
  completion cash does not repeat; new Destination cash pays once and Undo reverses.
- New stations/length affect appropriate awards/objectives while recipe progress
  stays capped at its original total. Clear extension count/label on line UI.
- Complete 2/3/4-player simulations exercise the unchanged three-line draft,
  with bots taking legal extensions and reaching RESULTS/replaying deterministically.
- npm run build, npm run lint and ./scripts/test-subway.sh; browser shared board
  and portrait companion, including completed-network continuation.
- One ready-for-review implementation PR, independent current-head review and
  documentation-only finalization. Do not merge without owner direction.

## Execution status
The previous session could not begin coding because shell and Node execution
reported environment_offline. Shell access recovered on 2026-09-20. This scope
update changes documentation only. Extensions are not implemented or validated;
continue PR #197 through implementation, checks and independent review before merge.
