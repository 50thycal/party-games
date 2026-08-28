# Subway v0.5 rules and design pins

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
- **Hard cap: 3 contracts per company.** A company holding three cannot buy again, and once one is
  capped the other becomes the only possible owner and may no longer pass.
  **Note the arithmetic:** six contracts, all of which must sell, against a cap of three forces the
  split to exactly 3/3 every game. The declared minimum of two is therefore unreachable-below-three
  in practice, and a deliberately contract-heavy portfolio is no longer possible. What the draft
  still decides is *which* three you get and *what you pay* — see DEC-010 for the trade-off.

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
capital, which is the intended squeeze. Money is spent on contracts, mobilization, second-crew
capacity, and Survey Pins.

| Contract | Code | Ordered segment recipe | Nodes | Build periods | List | Complete | Major | Incomplete |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Short Line | S | 3–4–3–4 | 5 | 4 | $5M | +4 | +3 | −4 |
| Branch Line | B | 5–5–3–4–4 | 6 | 5 | $6M | +5 | +3 | −5 |
| Medium Line | M | 3–4–3–4–3–4 | 7 | 6 | $8M | +6 | +4 | −6 |
| Express Line | E | 5–4–5–4–5 | 6 | 5 | $9M | +6 | +5 | −7 (+3 VP for two Majors) |
| Crosstown Line | C | 4–3–4–3–4–3 | 7 | 6 | $10M | +7 | +4 | −7 |
| Long Line | L | 4–5–4–4–5–4–4 | 8 | 7 | $12M | +9 | +4 | −8 |

The recipe is the contract. Node count, build-period count, schedule-block length, and completion
all derive from it, so they can never drift apart.

Every company ends up with three, so the money question is *which* three: the cheap end (Short +
Branch + Medium, $19M) leaves real capital for mobilization and second crew, while the expensive end
(Express + Crosstown + Long, $31M) leaves almost none. The other ceiling is calendar, not cash: 16
periods against one crew means a portfolio over 16 build periods cannot run end to end at all, and
three contracts frequently total more than that.

## Line identity

Every contract carries a **permanent, globally distinct line color** and a one-letter code (S, B, M,
E, C, L), used for its route string and pegs, its docked station slot, its Gantt bar, its contract
card, its Survey Pins, and the active-line banner. Routes are colored by *line*, not by company;
company ownership is carried by the peg's outer ring, the company badge on every panel, the
odd/even priority tag, and the labels. Each line also draws with its own dash pattern, so nothing
depends on color alone.

## Engineering — draft, plan, then survey

Engineering runs in three steps.

### 1. Draft Destinations

Three Destination cards are dealt face up. Companies take turns picking one, the **odd-period
company first**, and the row refills while cards remain, until each company holds exactly **two**.
Picks are free. Six cards exist, so two are never drafted.

Destinations are no longer in the Procurement market — that market is objectives only. This is what
makes them appear in every game rather than only when somebody happened to pass on a contract.

### 2. Lock the plan

One action commits three things at once, and only once:

- **Exactly three Engineering objectives**, face down, hidden from the opposition until scoring.
  These are objectives, not a drawn route — including Crossing Design, which since v0.5 rewards a
  crossing rather than permitting one.
- **Both Destinations you drafted**, each assigned to one line you own. They are a **separate
  commitment** — they do not count toward the three. A line may carry at most **two**, and the same
  station may not be assigned twice to the same line. You cannot hold one back: the plan does not
  lock until both are assigned.
- **0–5 Survey Pins at $1M each.** The cost leaves your account the moment the plan locks and cannot
  be undone. You cannot buy more pins than you can pay for.

Your own committed objectives and Destinations show **live `COMPLETE` status** from the moment their
conditions are met — including reverting if the placement that met them is undone. The opposition
sees neither identity nor status until scoring.

### 3. Place the Survey Pins

Once both plans are locked, every purchased pin goes on the board publicly, companies alternating,
the **odd-period company first**. If one company has placed all of its pins the other simply finishes
its remainder; a company that bought none never places.

- A pin names one **normal hole**. Stations may not be pinned. Pins are **company-wide**: any line
  you own fulfils one.
- Pins **reserve nothing**: they occupy no hole, take no part in peg spacing, crossing, or station
  capacity, and either company may still build through them.
- Two companies may pin the same hole. One company may not stack two of its own pins on one hole.
- A pin scores **+1 VP** when **any** line you own later places a normal node on that hole. The
  opposition running through it does not count.

Scheduling opens once the last purchased pin is down.

## Route Planner — a private, non-binding sketch

During Engineering and Scheduling you can sketch a whole route for any line you own: pick a starter,
then step through the ordered recipe, seeing only endpoints the real rules would allow. Undo a step
or clear the sketch at any time.

The planner is **client-local**. It dispatches no action, reserves no hole, spends no money, is never
part of room state, and disappears on reload. It shows what is legal against the board *as it stands*
— the opposition can still build wherever it likes before you get there.

## Scheduling — one Gantt board, settled before any building

Each owned contract becomes a contiguous block as long as its recipe — one period per ordered
segment. The horizon is 16 periods.

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
penalty at scoring. Without it, a company whose three contracts total more than 16 build periods
could have no legal schedule at all. Shelved contracts are labelled as such on the board.

## Starter placement

One free starter peg per **scheduled** contract, costing no scheduled action. A shelved contract gets
no peg at all — it is never built, so a peg for it would only be a free blocker planting an exclusion
zone on the board. Companies alternate placements — the odd-period company first, then whoever has
placed fewer — until every scheduled contract has one. All spatial rules apply; starters may not use
station holes.

## Construction — executing the plan

Each period, every block scheduled in that period grants its line exactly one construction action.
A company running two blocks in one period (paid second crew) gets both actions.

- **Priority alternates by calendar period.** One company is randomly assigned odd-period priority at
  setup and the opposition holds the even periods; a Priority Permit overrides one contested period.
  The schedule board shows who leads in every period, not only contested ones.
- A scheduled action is a right, not a duty: a company may skip. **A skipped action is lost** — it
  never rolls into a later period, and the project may go unfinished.

### Construction cards

- **Overtime** — after a scheduled action, take one more on that same line.
- **Surge Crew** (renamed from Extra Crew, which now names the paid scheduling resource) — one extra
  action this period on a *different* line of yours.
- **Expedite Materials** — build before the opposition this period.
- *Field Adjustment* is retired: destinations are never pre-committed, so it would do nothing.

At most one Construction card per company per period. Nothing already built is ever moved.

### Undo — exactly one placement deep

The **latest physical placement** — a Survey Pin, a starter peg, or a construction node — can be taken
back by the company that made it, and by nobody else. It survives the phase change it may have caused
(the last survey opening Scheduling, the last starter opening Construction, the last build ending
Construction), and restores the exact state before it: the route, the turn, the queue, the period, the
phase, crossing usage, and any objective status it had completed.

It expires the moment **any other accepted action** happens — including the opposition's. An action
the rules reject changes nothing, so it does not expire the window; neither does simply polling the
room, nor a purely local edit such as a Route Planner sketch. Undo is one-shot: replaying it does
nothing. Purchases, card plays, commitments, schedule edits, locks, skips, and scoring can never be
undone.

## The board

A 27 x 9 pegboard — a 3:1 corridor rather than a square, so routes have room to make real shapes
instead of doubling back on themselves. The same six stations are spread along it and staggered
vertically; the two Major Stations sit 17 columns apart, which makes connecting both a long-haul job
and puts the Express Line's two-major bonus genuinely in reach only for a deliberate run. The board
pans and zooms, and on a phone it is meant to be zoomed into rather than read whole.

## Route interaction — priced, not prohibited

Since v0.5 the board is open. The only things that stop a placement are the ones that define the
puzzle: board bounds, the next ordered segment length, the 90° turn cap, exact station docks and
capacity, and one prohibition — **a string may not lie on top of an existing string**. Coincident
strings have no countable interaction and cannot be told apart on the board.

Everything else is legal and, against the opposition, costs money:

- A normal node may sit on an existing normal peg, beside one, or on the interior of a string.
- A string may cross other strings and pass through normal pegs.
- Adjacency is unrestricted. Your own network never blocks you.

**During Construction you pay the opposition $1M for every distinct contact** your new node and
string make with their normal route. Contacts with your own routes are free.

A contact is one *geometric event*, counted once per coordinate:

- a proper crossing of an opposing string;
- your endpoint landing inside an opposing string;
- any opposing normal peg your segment passes through or ends on.

Landing on an opposing peg is one contact however many of their strings meet there, and where a
crossing happens exactly at an existing peg, the peg wins — one contact, and not a "proper crossing".
Station docks keep their own exclusive rules and are not part of this.

The board shows the count, the total, who gets paid, and your cash afterwards before you confirm.

### Construction debt

Construction is the **only** phase that may take you below $0. Every earlier phase still refuses
what you cannot afford. Ending the game in debt costs **-2 VP per $1M** owed, and money the
opposition pays *you* for their own contacts reduces it. Remaining cash is still the last tiebreak,
after that penalty.

## Placing: look one step ahead

Placement takes two taps. The first selects a target — it stays marked and the board shows, in
dashed markers, where that line could go *next*. The second tap on the same target confirms it.

Current-step targets carry a solid ring marked **1**; following-step targets a dashed ring marked
**2**. The following markers are a preview, not a reservation: the opposition may build first, and
prices are recomputed when you actually confirm. Starter placement works the same way.

## Route geometry — ordered lengths, and no hairpins

A line is built as the **ordered recipe** in the table above: segment 1 must be the first length,
segment 2 the second, and so on. You cannot reorder them, and the line is finished exactly when the
recipe is exhausted.

- **Length** is the physical distance between the two endpoints in peg spaces. A segment satisfies a
  required length `L` when it falls within **±0.5** of it — so a straight 3, and a 2-across-2-down
  diagonal at 2.83, both count as a 3. Exactly `L ± 0.5` is legal.
- **Turns** may be at most **90°**, inclusive, between consecutive segments. Exactly 90° is legal;
  sharper is not. The first segment of a line has no previous heading, so nothing to judge.
- **Station docks are chosen, not assigned.** A station has one dock per unit of capacity, and you
  name the one you want. The dock's exact position — offset inside the station tile — is both what the
  route is drawn through and what length and angle are measured against, so different docks are
  genuinely different placements. A taken dock is refused outright; it is never silently swapped for
  the other one, so two companies racing for the same dock resolve first-come, first-served.

Everything else about a placement is judged against the pegboard **hole** it occupies, exactly as
before: occupancy, spacing, string overlap, and crossings.

## Spatial rules (unchanged)

- **Stations are multi-slot docks.** One connection per line, up to the station's capacity (2). A line
  docks a given station once. Station VP scores once per company however many of its lines dock there,
  so a second dock is purely defensive. A full station blocks further connections but never blocks
  strings passing over it.
- **Node spacing, shared holes, pegs on strings, strings through pegs, and crossings** are all legal
  now — see *Route interaction* above for what they cost.
- **Strings** may not lie on top of one another. That is the only surviving string prohibition.
- **Crossing** the opposition needs no permit and is unlimited; it costs $1M like any other contact.

## Scoring

Every purchased contract scores: completion VP if delivered, its incomplete penalty if not, plus its
major-station bonus if that line reached a Major Station. Stations score once per company.

Engineering cards reveal and score; Terminal Approach needs a completed line, Minimal Footprint needs
every contract delivered, **Network Link** (+3 VP) needs one *completed* line that connects at least
two *different* stations, and **Crossing Design** (+2 VP) is now an ordinary objective for making at
least one proper crossing of an opposing string — it grants no permission and caps nothing. **Network Link replaces Long Segment**, which is gone: on a 27-wide
corridor a long reach happened by accident, and the ordered recipes now decide segment length anyway.

Committed **Destinations** reveal and score **+3 VP** each when their assigned line connects the named
station — whether or not that line was ever completed, and nothing if it never got there. Placed
**Survey Pins** score **+1 VP** each when any line their buyer owns has a node on the pinned hole.
**Construction debt** costs **-2 VP per $1M** still owed.

Ties break on major connections, then remaining money, then a shared victory.

## Other prototype notes

- **Seats:** the first two players in the room become the companies; later joiners spectate.
- **State version:** `SUBWAY_STATE_VERSION` guards the saved shape. A room holding an older game shows a
  restart prompt rather than misreading it.
- Clients receive shared room state, but the view never renders an opponent's committed Engineering
  cards, their Destination assignments and status, or their unrevealed schedule. Server-filtered
  private state is a future engine enhancement — this is concealment by the view, not by the server.
  The Route Planner is the one genuinely private thing here: it never leaves the client.

## Future design pins (not implemented)

- **Company Cards:** asymmetric money, card counts, and abilities.
- **Multiple project cycles** per company.
- **Bot Player:** optional server-controlled third transit company.
- **Additional maps:** vary station layouts, peg density, geography, and constraints.
