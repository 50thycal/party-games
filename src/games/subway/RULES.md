# Subway v0.1 rules and design pins

Subway is a single-project, two-player prototype. Each company buys one Line Contract, commits three
private Engineering cards, secretly schedules a contiguous construction block, places one free starter
peg, and constructs one continuous route. Shared periods are allowed; the Priority 1 company acts
first inside a shared period.

## Prototype assumptions (v0.1 rulings)

- **Procurement** ends immediately once both companies own a contract. The face-up market is refilled
  deterministically by cycling each deck in order, so duplicates of cards already in hand can appear.
- **Stations are multi-slot docks, not single pegs.** A station hole accepts one node per company, up
  to the station's capacity (2 in two-player mode). Placing a node on a station locks the route into
  one of the station's docking slots and consumes one connection. A company can claim a given station
  at most once. When capacity is full, no further company may connect, but strings may still pass over
  the station area — stations never become walls.
- **Node spacing** uses the eight surrounding holes and applies only between opposing *normal* nodes.
  Station nodes neither project nor receive spacing, and strings ignore spacing entirely.
- **Physical string rules:** a peg may not be placed on any existing string, a new string may not run
  exactly through any occupied peg hole (yours or the opposition's), and two strings may never occupy
  exactly the same path. Any other segment length is legal — long jumps are allowed.
- **Crossing:** crossing the opposing line requires the committed Crossing Design permit and is limited
  to one crossing total — a single segment that would cross two opposing segments is illegal.
- **Scheduling** auto-reveals the moment both proposals are locked (the reveal is simultaneous; there
  is no host button in new games), and schedule lock leads straight into starter placement. Priority 1
  is assigned randomly at game start and displayed on the schedule; Priority Permit reassigns it.
- **Construction cards** are played on your own scheduled action, before building. Overtime and Extra
  Crew both grant exactly one extra immediate sequential node (they are intentionally equivalent in
  v0.1) and cannot be played when only one node remains. Expedite Materials moves your earliest
  *future* scheduled period one period earlier; it never touches the current or past periods and never
  stacks two actions into one period. Field Adjustment is defined in data but excluded from the v0.1
  market: destinations are never pre-committed in this prototype, so the card would do nothing.
- **Passing:** a scheduled company may pass its construction action (the UI offers this prominently
  when no legal placement exists, so a blocked-in line can never soft-lock the game).
- **Scoring:** the contract's major-station bonus is awarded once if the line connects at least one
  Major Station, whether or not the line is completed. Terminal Approach and Minimal Footprint require
  a completed line. Parallel Corridor is approximated as one of your segments running within 15° of an
  opposing segment with midpoints at most 2.5 pegs apart. Geometry uses peg-coordinate vectors with the
  tolerances in `SUBWAY_CONFIG.tolerances`.
- **Seats:** the first two players in the room become the companies; later joiners spectate the shared
  board. Starting the game rebuilds seats from the live room so nobody can be stranded outside the
  game by lazy state initialization.
- Clients receive shared room state, but the view never renders an opponent's card identities or
  unrevealed proposals. True server-filtered private state is a future engine enhancement.

## Future design pins (not implemented)

- **Survey Markers:** give each player 2–3 non-reserving, stackable intent markers during Engineering
  and consider bonus VP when a route reaches one.
- **Company Cards:** asymmetric money, card counts, and abilities.
- **Multiple Line Contracts:** multiple project cycles per company.
- **Bot Player:** optional server-controlled third transit company for two-human games.
- **Additional maps:** vary station layouts, peg density, geography, and constraints.
