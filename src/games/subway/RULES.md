# Subway v0.2 rules and design pins

Subway is a two-player prototype. Each company drafts up to two Line Contracts, commits three private
Engineering cards, then builds period by period: every period both companies secretly commit to a line
(or to passing), reveal together, and build in priority order.

## Flow

1. **Setup** — the host starts once two players are in the room.
2. **Procurement** — a snake draft over 6 picks (three each). All four Line Contracts are face up
   alongside one face-up Engineering, Scheduling, and Construction card.
3. **Engineering** — each company commits exactly 3 cards face down.
4. **Starter placement** — one free starter peg per contracted line.
5. **Construction** — 10 periods, each a secret commitment → simultaneous reveal → build in priority
   order.
6. **Scoring / Results**.

## Prototype assumptions (v0.2 rulings)

- **The draft is a snake** (A B | B A | A B) and the company *without* Priority 1 picks first, so the
  random priority coin flip is offset by first pick. Total picks = contracts on offer + 2, which is
  three each in a two-player game; a company may hold at most two contracts. Cards cost nothing, so
  money only ever buys contracts and is otherwise a tiebreaker.
- **A company that reaches its final pick with no contract must buy one.** With four contracts and a
  two-contract cap, at least two are always still available, so this can never deadlock.
- **The action budget, not money, is the real constraint.** Ten periods against contracts costing 4–8
  actions means only the cheaper pairings can both be finished; a second contract you cannot deliver
  costs you its incomplete penalty.
- **Per-period commitment:** a company commits to one line or to a pass, in secret. Commitments reveal
  simultaneously. A company with no incomplete, unblocked line is auto-passed and is never asked.
  Priority 1 builds first when both build in the same period, which matters because the second builder
  sees where the first one placed before choosing.
- **Stations are multi-slot docks, not single pegs.** A station hole accepts one connection per *line*,
  up to the station's capacity (2). Placing a node on a station locks that line into a docking slot and
  consumes one slot — so a company holding two contracts can take both slots and shut the rival out.
  A single line may dock a given station only once. Station VP scores once per company however many of
  its lines dock there, so the second dock is a purely defensive play. When a station is full no
  further line may connect, but strings may still pass over the station area — stations never become
  walls.
- **Node spacing** uses the eight surrounding holes and applies only between opposing *normal* nodes.
  Station nodes neither project nor receive spacing, and a company's own two lines may run side by side.
- **Physical string rules:** a peg may not be placed on any existing string, a new string may not run
  through any occupied peg hole, and two strings may never occupy exactly the same path. A company's
  own lines may never cross each other or themselves. Any segment length is legal — long jumps are
  allowed.
- **Crossing** the opposing line requires the committed Crossing Design permit and is limited to one
  crossing in total, so a single segment that would cross two opposing segments is illegal.
- **Scheduling cards** were redefined for the per-period model (the old block-shifting effects have no
  meaning without a Gantt block). At most one per period:
  - *Early Mobilization* — after the reveal, change what you committed to this period.
  - *Float* — after the reveal, drop to the back of this period's build order and place last.
  - *Priority Permit* — take Priority 1 for the rest of the game, re-ordering the current period too.
- **Construction cards**, at most one per period, played on a period you build:
  - *Overtime* — one extra node, on the committed line.
  - *Extra Crew* — one extra node, on either of your lines.
  - *Expedite Materials* — build first this period, ahead of the opposition. ("One period earlier" has
    no meaning without a fixed schedule; within-period order is the equivalent granularity.)
  - *Field Adjustment* is retired and excluded from the market: destinations are never pre-committed,
    so it would do nothing.
- **Passing:** a company building this period may stop early, and the UI offers this prominently when
  no legal placement exists, so a blocked-in line can never soft-lock the game.
- **Scoring:** stations score once per company. Each contract scores its completion VP or its incomplete
  penalty, plus its major-station bonus if *that line* connects a Major Station. The Express special
  needs that one line to reach two Major Stations. Terminal Approach requires a completed line;
  Minimal Footprint requires every contract you signed to be delivered. Other objectives are satisfied
  by any one of your lines. Parallel Corridor is approximated as one of your segments running within
  15° of an opposing segment with midpoints at most 2.5 pegs apart. Geometry uses peg-coordinate
  vectors with the tolerances in `SUBWAY_CONFIG.tolerances`.
- **Seats:** the first two players in the room become the companies; later joiners spectate the shared
  board. Starting rebuilds seats from the live room so nobody is stranded by lazy state init.
- **State version:** `SUBWAY_STATE_VERSION` guards the saved shape. A room holding an older game shows
  a restart prompt instead of breaking, and starting resets it to the current rules.
- Clients receive shared room state, but the view never renders an opponent's card identities or their
  unrevealed commitment. True server-filtered private state is a future engine enhancement.

## Future design pins (not implemented)

- **Survey Markers:** give each player 2–3 non-reserving, stackable intent markers during Engineering
  and consider bonus VP when a route reaches one.
- **Company Cards:** asymmetric money, card counts, and abilities.
- **More contracts / multiple project cycles** per company.
- **Bot Player:** optional server-controlled third transit company for two-human games.
- **Additional maps:** vary station layouts, peg density, geography, and constraints.
