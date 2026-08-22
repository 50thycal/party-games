# Subway v0.3 rules and design pins

Subway is a two-player prototype played as a single pass:

```
Setup → Procurement → Engineering → Scheduling → Starter placement → Construction → Scoring → Results
```

Every decision about *when* work happens is made during Scheduling, before a single peg goes down.
Construction then executes that locked plan period by period. There is no scheduling phase, and no
secret commitment, once Construction begins.

## Procurement — six contracts, first refusal, and the Discount Yard

- Six Line Contracts are shuffled into a deck at setup and revealed **one at a time**. All six are
  bought before the phase ends; they do not all have to be *completed*.
- First refusal alternates contract by contract (contract 1 → seat A, contract 2 → seat B, …),
  independent of the construction priority assigned at setup.
- The company with first refusal either **buys** at the listed price, or **passes and drafts** one of
  the three face-up cards (Engineering / Scheduling / Construction). The drafted slot refills at once.
  Cards cost no money.
- The contract then goes to the opposition, who may **buy** it or **pass**. A second pass earns no
  card: the contract moves to the visible **Discount Yard**, marked down by $2M (floor $3M).
- Once the deck is empty, the Discount Yard is cleared one contract at a time under the same
  alternating first refusal. Each further double pass knocks another $2M off.
- **Ownership range: 2–4 contracts per company.** Because all six are bought and the cap is four,
  enforcing the cap is what guarantees the other company its minimum of two — a 4/2, 3/3 or 2/4 split.
  A company holding four cannot buy again, and when the opposition is capped the other company may no
  longer pass.

### Prototype rulings

- **The "five decisions" per company is descriptive, not a gate.** The offer sequence drives the
  phase, and Discount Yard cleanup can need extra decisions; blocking on a counter could leave a
  contract unowned. `decisionsUsed` is tracked and shown but never blocks a decision.
- **Distressed sale.** If a company is the only one that may legally own a contract and cannot afford
  the asking price, it pays what it holds. Together with the floor this guarantees the phase always
  terminates with all six owned and nobody in debt.
- **Floor deadlock.** If a Discount Yard contract is declined by both companies while already at the
  floor price, it is assigned to the legal buyer with the most money rather than looping forever.

## Economy

Six contracts total $50M, so an even 3/3 split runs about $25M — roughly 74% of the $34M starting
capital, which is the intended squeeze. Money is only ever spent on contracts, mobilization, and
second-crew capacity.

| Contract | Nodes | Build periods | List | Complete | Major | Incomplete |
| --- | --- | --- | --- | --- | --- | --- |
| Short Line | 5 | 4 | $5M | +4 | +3 | −4 |
| Branch Line | 6 | 5 | $6M | +5 | +3 | −5 |
| Medium Line | 7 | 6 | $8M | +6 | +4 | −6 |
| Express Line | 7 | 6 | $9M | +6 | +5 | −7 (+3 VP for two Majors) |
| Crosstown Line | 8 | 7 | $10M | +7 | +4 | −7 |
| Long Line | 9 | 8 | $12M | +9 | +4 | −8 |

Two contracts are comfortable, three demand tradeoffs, four is financially aggressive — and the real
ceiling is calendar, not cash: 16 periods against one crew means a portfolio over 16 build periods
cannot run end to end at all.

## Engineering (unchanged)

Each company holds Engineering cards, commits exactly three face down, and keeps them hidden until
scoring. They are objectives and permissions, not a drawn route. Crossing Design is still required to
cross an opposing line, once. Survey Markers remain pinned for a future version.

## Scheduling — one Gantt board, settled before any building

Each owned contract becomes a contiguous block as long as its construction actions (nodes − 1).
The horizon is 16 periods.

1. **Private planning.** Every company lays its blocks out on its own board, seeing live mobilization,
   second-crew cost, remaining capital, and any problems. The opposition sees only "planning".
2. **Submit.** A schedule cannot be submitted while it overruns the horizon or costs more than the
   company holds.
3. **Simultaneous reveal** once both are in, with opponent overlap and contested-period priority shown.
4. **One Scheduling card** per company, at most.
5. **Confirm.** Mobilization and crew are charged, schedules lock, and play moves to starter pegs.

### One base crew

A company's own blocks may not run concurrently for free — one base Construction Crew means one block
at a time. **Second crew** capacity costs $2M per period per extra simultaneous block, bought simply by
overlapping them (no card required). Opponent overlap is always legal and free; it only decides who
builds first.

### Mobilization

Charged per contract on the period its block starts: periods 1–3 cost $3M, 4–6 cost $2M, 7–9 cost $1M,
10 and later are free. Starting early is an economic decision, not a free one.

### Scheduling cards (rewritten for Gantt blocks)

- **Early Mobilization** — move one block one period earlier and waive the extra mobilization that
  earlier start would have cost.
- **Float** — after the reveal, slide one block one period earlier or later; costs recompute.
- **Priority Permit** — name one period where both companies are building; you build first in *that
  period only*. It never grants permanent priority.

### Shelving

A contract may be left off the schedule entirely. This is the escape valve for a portfolio too big for
the horizon (or too expensive to compress): the contract is simply never built and takes its incomplete
penalty at scoring. Without it, a company forced up to four contracts could have no legal schedule at
all. Shelved contracts are labelled as such on the board.

## Starter placement

One free starter peg per owned contract, costing no scheduled action. Companies alternate placements —
the priority company first, then whoever has placed fewer — until every contract has one. All spatial
rules apply; starters may not use station holes.

## Construction — executing the plan

Each period, every block scheduled in that period grants its line exactly one construction action.
A company running two blocks in one period (paid second crew) gets both actions.

- The default priority company acts first in a shared period, unless a Priority Permit named it.
- A scheduled action is a right, not a duty: a company may skip. **A skipped action is lost** — it
  never rolls into a later period, and the project may go unfinished.

### Construction cards

- **Overtime** — after a scheduled action, take one more on that same line.
- **Surge Crew** (renamed from Extra Crew, which now names the paid scheduling resource) — one extra
  action this period on a *different* line of yours.
- **Expedite Materials** — build before the opposition this period.
- *Field Adjustment* is retired: destinations are never pre-committed, so it would do nothing.

At most one Construction card per company per period. Nothing already built is ever moved.

## Spatial rules (unchanged)

- **Stations are multi-slot docks.** One connection per line, up to the station's capacity (2). A line
  docks a given station once. Station VP scores once per company however many of its lines dock there,
  so a second dock is purely defensive. A full station blocks further connections but never blocks
  strings passing over it.
- **Node spacing** — one empty hole between opposing *normal* nodes. Stations neither project nor
  receive spacing, and a company's own lines may run side by side.
- **Strings** — a peg may not sit on an existing string, a string may not run through an occupied hole,
  two strings may not share a path, and a company's own lines may never cross each other or themselves.
- **Crossing** the opposition needs the committed Crossing Design permit, and is limited to one crossing
  in total.

## Scoring

Every purchased contract scores: completion VP if delivered, its incomplete penalty if not, plus its
major-station bonus if that line reached a Major Station. Stations score once per company. Engineering
cards reveal and score; Terminal Approach needs a completed line and Minimal Footprint needs every
contract delivered. Ties break on major connections, then remaining money, then a shared victory.

## Other prototype notes

- **Seats:** the first two players in the room become the companies; later joiners spectate.
- **State version:** `SUBWAY_STATE_VERSION` guards the saved shape. A room holding an older game shows a
  restart prompt rather than misreading it.
- Clients receive shared room state, but the view never renders an opponent's committed cards or their
  unrevealed schedule. Server-filtered private state is a future engine enhancement.

## Future design pins (not implemented)

- **Survey Markers:** 2–3 non-reserving, stackable intent markers placed during Engineering, with bonus
  VP for building through one.
- **Company Cards:** asymmetric money, card counts, and abilities.
- **Multiple project cycles** per company.
- **Bot Player:** optional server-controlled third transit company.
- **Additional maps:** vary station layouts, peg density, geography, and constraints.
