# Subway Card Audit — 2026-08-29

**Workstream:** WS-004
**Source audited:** `src/games/subway/config.ts` on `main` at `fa780cc`
**Re-verified:** 2026-08-30 against `main` at `208a7d4` — the inventory below is unchanged
(Engineering 10, Destination 6, Scheduling 3, Construction 3, Line Contracts 6)
**Status:** Inventory verified; expansion recommendations await owner review

## Audit Standard

The owner asked each category to contain at least 10 cards **or** at least six different card types.
This audit treats a “type” as a unique owner-facing rule, not a duplicate copy or a renamed version of
the same effect.

| Category | Unique types now | Cards/copies now | Threshold result | Recommendation |
|---|---:|---:|---|---|
| Engineering | 10 | 10 | Meets both | Keep; audit wording/balance during playtest only |
| Destination | 6 | 6 | Meets six-type alternative | Keep one per station; do not pad without new destination concepts |
| Scheduling | 3 | 3 | Below threshold | Add at least 3 approved unique types; then decide whether to build a 10-card deck with duplicates |
| Construction | 3 | 3 | Below threshold | Add at least 3 approved unique types; then decide whether to build a 10-card deck with duplicates |

Current market decks contain one copy of each listed type and cycle deterministically. Starting hands
are five Engineering cards (`Straightaway`, `45° Bend`, `Network Link`, `Terminal Approach`,
`Crossing Design`), all three Scheduling cards, and two Construction cards (`Overtime`, `Surge
Crew`). Other cards enter through the existing face-up market.

## Current Inventory

### Engineering — 10 unique objective types

| Card | VP | Current rule checked | Audit note |
|---|---:|---|---|
| Gentle Curve | +4 | One line has three consecutive segments with every turn ≤30° | Clear route-shape objective |
| 45° Bend | +3 | One line has a turn >30° and ≤50° | Clear, but overlaps the general 90° route limit rather than changing it |
| Straightaway | +4 | One line has three consecutive segments aligned within 15° | Clear route-shape objective |
| Station Approach | +4 | A line enters a Major Station with its last turn within 15° | Major-station-specific geometry |
| Through Station | +5 | A line enters and leaves a station while turning ≤30° there | Highest-value precision objective |
| Network Link | +3 | One completed line connects at least two distinct stations | Completion plus network objective |
| Parallel Corridor | +4 | A segment runs within 15° and 2.5 pegs of an opposing segment | Competitive proximity objective |
| Terminal Approach | +4 | A completed line ends at a station | Completion plus endpoint objective |
| Minimal Footprint | +3 | Every contract owned by the player completes | Portfolio objective; name may understate its difficulty |
| Crossing Design | +2 | One segment properly crosses an opposing segment | Objective only; never crossing permission |

**Audit verdict:** Variety is sufficient. The family covers curve, bend, straight, station approach,
through-running, network, parallel, terminal, portfolio completion, and crossing. No additions are
needed to meet the requested threshold.

### Destination — 6 unique station types

All Destinations score +3 VP when the assigned owned line reaches the named station, complete or not.
They are drafted two per player from a three-card public row and do not count among the three normal
Engineering commitments.

| Card | Station type | Capacity | Current rule checked | Audit note |
|---|---|---:|---|---|
| Destination: Market | Minor | 2 | Assigned line connects Market | Western/southern minor destination |
| Destination: Grand Central | Major | 2 | Assigned line connects Grand Central | Western major destination |
| Destination: Museum | Minor | 2 | Assigned line connects Museum | Mid-board minor destination |
| Destination: Garden | Minor | 2 | Assigned line connects Garden | Mid-board/northern minor destination |
| Destination: Stadium | Minor | 2 | Assigned line connects Stadium | Eastern/southern minor destination |
| Destination: Harbor Exchange | Major | 2 | Assigned line connects Harbor Exchange | Eastern major destination |

**Audit verdict:** The category meets the six-type alternative exactly. Its six types are tied to the
six physical stations, which is coherent. Adding four near-duplicate station cards merely to reach
10 would make the draft less legible. Expand only if the board gains stations or the owner approves a
new class such as paired-destination cards.

### Scheduling — 3 unique tactical types

| Card | Timing | Current effect | Cost interaction | Audit note |
|---|---|---|---|---|
| Early Mobilization | After reveal, before schedule confirmation | Move one block one period earlier | Waives only the positive mobilization increase; crew-cost changes remain | Distinct cost-control/tempo card |
| Float | After reveal, before schedule confirmation | Move one block one period earlier or later | All costs adjust normally | Broad schedule flexibility |
| Priority Permit | After reveal, before schedule confirmation | Choose one contested period and build first there | No direct cash change | Only priority-control card |

**Audit verdict:** Below threshold. `Early Mobilization` and `Float` partially overlap because both
can shift a block earlier; future additions should create new decisions rather than more one-period
movement variants.

### Construction — 3 unique tactical types

| Card | Timing | Current effect | Toll/debt interaction | Audit note |
|---|---|---|---|---|
| Overtime | Before acting in a Construction period | Add one action to a line already scheduled that period | Every added placement pays its own contacts and may create debt | Same-line acceleration |
| Surge Crew | Before acting in a Construction period | Add one action on a different owned line with a legal move | Every added placement pays its own contacts and may create debt | Cross-line acceleration |
| Expedite Materials | Before acting in a Construction period | Move the player to the front of that period's resolve queue | No direct toll change | Priority/tempo control |

**Audit verdict:** Below threshold. Two of three cards add an action; additions should emphasize
access economics, conditional precision, or recovery rather than another unconditional extra build.

## Expansion Candidates for Owner Review

These are design recommendations, not approved game rules. None may be implemented by WS-004.

### Recommended Scheduling additions

| Candidate | Proposed effect | Why it is distinct | Main balance/question to resolve |
|---|---|---|---|
| Shared Staging | After reveal, waive the second-crew charge for exactly one overlap period | Directly manages crew economics without moving a block | Is a full $2M waiver right, or should it reduce the charge by $1M? |
| Resequence | Swap the start periods of two owned scheduled blocks; both blocks must still fit and the final schedule must be affordable | Changes two projects together and can preserve total footprint | Should mobilization/crew costs simply recalculate, with no waiver? Recommended: yes |
| Recovery Float | Move one owned block exactly two periods later; all costs adjust | Creates a meaningful retreat option rather than Float's ±1 flexibility | Is two periods strong enough to require discarding another card or paying $1M? Recommended: no added cost initially |

If all three are approved, Scheduling reaches six unique types. A later quantity decision could form a
10-card deck using duplicates of broadly useful cards; recommended starting distribution for testing:

| Type | Copies |
|---|---:|
| Early Mobilization | 2 |
| Float | 2 |
| Priority Permit | 2 |
| Shared Staging | 2 |
| Resequence | 1 |
| Recovery Float | 1 |
| **Total** | **10** |

### Recommended Construction additions

| Candidate | Proposed effect | Why it is distinct | Main balance/question to resolve |
|---|---|---|---|
| Temporary Easement | Before one confirmed placement, reduce that placement's opponent-contact toll by $1M, minimum $0 | Interacts with the new paid-access economy rather than action count | Does the opponent lose the waived $1M? Recommended: yes; it is a discount, not bank subsidy |
| Survey Crew | Add one action on an owned line only when its next confirmed node fulfils one of the player's unfulfilled Survey Pins | Conditional acceleration tied to public planning | If the selected placement changes before Confirm, the bonus must remain conditional and fail cleanly |
| Recovery Shift | Before skipping a line with no legal move, convert that action into one action on a different owned line with a legal move | Reduces dead-action frustration without adding total actions | Should it work only when the original line truly has zero legal targets? Recommended: yes |

If all three are approved, Construction reaches six unique types. Recommended 10-card test deck:

| Type | Copies |
|---|---:|
| Overtime | 2 |
| Surge Crew | 2 |
| Expedite Materials | 2 |
| Temporary Easement | 2 |
| Survey Crew | 1 |
| Recovery Shift | 1 |
| **Total** | **10** |

## Owner Review Table

Record future decisions here or in a follow-up Build Card; do not treat the recommendations above as
approved merely because this audit is merged.

| Decision | Current recommendation | Owner decision |
|---|---|---|
| Engineering additions | None; 10 types already | Pending review |
| Destination additions | None; six station types already | Pending review |
| Scheduling new types | Shared Staging, Resequence, Recovery Float | Pending review |
| Construction new types | Temporary Easement, Survey Crew, Recovery Shift | Pending review |
| Deck model | Six unique types distributed across 10 total cards | Pending review |
