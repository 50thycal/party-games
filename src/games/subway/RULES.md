# Subway — Metropolitan Transit

A light-strategy route-building game for **2–4 companies**. Most victory points wins.

## Game flow

1. Start with **$50M and two private Destination missions**.
2. Draft three route contracts each, at list price, from a replenishing row of
   two/three/four choices for two/three/four players. No passing or discounts.
3. Draft **three Engineering goals each**, choosing between two face-up cards or a blind draw.
4. Optionally buy Survey Pins, then place them.
5. Place one free starter for each route on a non-station outer-border hole.
6. Play up to **9 construction rounds**, choosing crews anew each turn. End
   immediately if no incomplete route has a legal next segment.
7. Score all held goals, routes, stations and surveys; subtract unfinished-route
   penalties and **4 VP per $1M of final debt**.

There is no Engineering commitment, Destination assignment, separate Destination
draft, or advance scheduling phase. Destinations require one connected company network; separated routes do not qualify.
Engineering cards describe their company-wide scoring conditions.

## Drafting

The route pool supplies 6/9/12 unique routes for 2/3/4 companies. Refill the visible
row after each purchase while the deck lasts. Every player must take one per turn.

The Engineering pile contains **one copy of each of 16 goals**. Each player drafts
three goals. Show two face-up goals, refilling after each pick, or draw blind.
Destinations and Construction cards are not part of this draft.

Pick order alternates forward and reverse each draft round. Rotate the opening
seat between route and card drafts. Snake turnarounds may give consecutive picks;
each full draft round visits every company once.

## Route contracts

| Route | Code | Segment recipe | Price | Complete VP | Unfinished VP |
|---|---|---|---:|---:|---:|
| Red Line | RE | 2, 3, 2, 3 | $5M | 4 | -4 |
| Orange Line | OR | 4, 2, 3, 4, 2 | $6M | 5 | -5 |
| Green Line | GR | 3, 5, 2, 4, 3, 5 | $8M | 6 | -6 |
| Blue Line | BL | 6, 4, 5, 3, 6 | $10M | 6 | -7 |
| Purple Line | PU | 5, 3, 4, 2, 5, 3 | $10M | 7 | -7 |
| Teal Line | TE | 4, 6, 3, 5, 2, 4, 6 | $11M | 9 | -8 |
| Pink Line | PI | 2, 3, 4, 2 | $5M | 4 | -4 |
| Black Line | BK | 4, 2, 5, 3, 4 | $7M | 5 | -5 |
| Yellow Line | YE | 3, 2, 4, 3 | $6M | 4 | -4 |
| Gray Line | GY | 4, 5, 2, 4, 3, 5 | $9M | 6 | -6 |
| White Line | WH | 6, 3, 5, 4, 2 | $10M | 6 | -6 |
| Brown Line | BR | 2, 3, 2, 4, 3 | $6M | 5 | -5 |

Contracts retain their recipes, prices, completion points and unfinished penalties.
Route-specific specials and per-line Major Station bonuses are removed. Ordinary
station points still score once per company. White Line uses dark casing and dark
lettering so it remains distinguishable on the map.

## Destination missions

At game start, deal two private random missions to each company. The separate deck
contains one of each unordered pair and triple of the ten named stations: 45 pairs
and 120 triples. Shuffle once with the game's random source; draw without replacement.
Two-station missions pay **4 VP**, three-station missions **7 VP**.

All named stations must be reachable within one connected part of your own network.
Different lines may contribute and need not be complete. Transfer at a shared
station (different occupied docks still connect) or an identical peg node on both
lines. A raw crossing or an opponent's route does not provide a transfer.

Before hiring crews on your construction turn, you may pay **$5M for one extra
random mission, once per game**. Pay immediately; the purchase cannot create debt.
Missions stay private until results and score only if fulfilled. No line assignment,
card lock, or penalty for an unfulfilled mission applies.

## Engineering goals

All three drafted goals may score once. Read each card's completion condition:
North–South Lines and Four Corners do not require finished contracts; goals saying
“complete” do. Incompatible objectives may deliberately appear in the same hand.

North/south are the top/bottom border rows; west/east are the left/right border
columns. Directional goals use actual border pegs, never a nearest-side region.
A corner may represent either adjoining side, but a single peg cannot count as
two different pegs/sides for Three-Way Service, Three Fronts or Perimeter Service.
Loop asks for the starting *side*, not the exact starting peg or a closed circuit.
Across Town alone uses the first/last three columns instead of exact borders.

| Engineering goal | VP | Requirement |
|---|---:|---|
| Three-Way Service | 6 | Complete all three lines with their final pegs on three different board sides. |
| Turning the Corner | 6 | Complete all three lines: each starts on the east or west border and ends on the north or south border. |
| Loop | 7 | Complete all three lines: each ends on the same board side as its starter. |
| Major Connection | 6 | One completed line connects two different Major Stations. |
| North–South Lines | 7 | All three lines each have a node on both the north and south borders. |
| Integrated Network | 7 | Connect all three completed lines into one company network through shared stations or pegs. |
| Terminal Network | 6 | Complete all three lines with their final nodes at stations. The same station may serve multiple lines. |
| Surveyed System | 7 | Complete all three lines and build through at least one of your purchased Survey Pins. |
| First to Open | 7 | Be the first company to complete all three lines. |
| Across Town | 6 | One completed line has a node in the first three columns and another in the last three columns. |
| Local Service | 5 | Connect four different Minor Stations across your company. Your lines need not connect to one another. |
| Central Interchange | 6 | Dock two separate lines at the same Major Station in a two-player game; three lines in a three- or four-player game. |
| On Budget | 6 | Complete all three lines and finish with at least $5M. |
| Perimeter Service | 6 | One completed line has three distinct pegs on three different board sides. |
| Three Fronts | 7 | Complete all three lines: their starters occupy three different board sides and their final pegs all occupy the same side. |
| Four Corners | 6 | Connect all three lines into a company network joining the northwest and southeast corner pegs, or the northeast and southwest corner pegs. |

Integrated Network requires all three completed lines in one connected component,
which may use different transfer stations. Central Interchange instead requires
convergence at one Major Station and does not require complete contracts.
Four Corners requires all three lines connected in the same component as both exact
opposite corner pegs. First to Open uses the earliest accepted completion of all
three contracts; Undo of that placement restores the award opportunity.

## Longest network — public goal

At scoring, find each company's longest continuous trail of built segments.
Measure length in **peg spaces between logical peg positions** (station dock offsets
do not change this award). Transfer at own shared stations/pegs. A peg may be
revisited, but no segment may be used twice. Disconnected sections cannot be added;
branches only count if a single trail can traverse them without reusing a segment.
The longest company receives **5 VP**, or **3 VP each** when tied. An empty network
never wins the award. Unfinished lines can contribute.

## Surveys

After card drafting, each company may buy zero to five Survey Pins for $1M each.
Survey Pins must be placed on interior, non-station holes. All outer-border holes are reserved for starter pegs.
This purchase is paid once and must be affordable; it cannot create debt.
Then take turns placing purchased pins on non-station holes, not stacked on your
own pins. They reserve nothing. Each pays +1 VP if one of your routes has a node
on that hole at scoring.

## Construction rounds

At each round's beginning, normal starting priority rotates one company.
Companies holding Priority Dispatch get an opening opportunity in that order:
play it or keep it. The first claimant takes first turn and closes the window.
Other players keep their cards. Priority Dispatch uses that company's one-card
allowance for this round. If nobody claims, normal order applies.

On your turn, optionally buy your extra Destination mission, then choose zero to three different
unfinished, buildable routes and hire their crews:

| Crews activated | Total bill |
|---|---:|
| 0 | $0M |
| 1 | $1M |
| 2 | $3M |
| 3 | $6M |

Each selected route receives one segment placement. Hire once per turn; crew
choices cannot be changed after payment. Zero crews ends the turn. You may
choose different routes next round. Hiring and contact payments can create debt.
The displayed bill previews remaining cash and the final penalty at that balance.

Every company gets a turn each round, including a company choosing no crews.
Construction ends after round 9, or immediately after a placement leaves no
legal next segment on any incomplete route. Empty rounds are never played. A
blocked or skipped placement does not refund its hired crew. Normal placement
legality remains unchanged.

## Construction cards (retained ability rules)

The new Engineering-only draft does not supply Construction cards. They are not
dealt or purchased in this edition. Their reducer mechanics remain for isolated
fixtures and a future supply/design decision; no new dealing rule is implied.


Play **at most one card per company per round**, discarded when played. Priority
Dispatch is the only opening-window exception; all other cards are played during
your own turn at their printed timing. Cards cannot be played during drafting.

| Card | Effect | Timing |
|---|---|---|
| Advance Booking | Reserve $1M off your crew bill next round. Expires unused; never pays cash. Unavailable in the final round. | Before hiring |
| Relief Crew | Waive the first crew's $1M this turn: totals $0M / $2M / $5M for 1 / 2 / 3 crews. | Before hiring |
| Priority Dispatch | Take first turn this round; other potential claimants keep their cards. | Opening window |
| City Grant | Receive $3M, including to repay debt. | Before hiring |
| Access Pass | City pays all contact tolls on your next segment this turn. Route owners still receive payment. | After hiring, before building |

A reserved Advance Booking discount can combine with a Relief Crew played next
round, but never reduce a bill below zero. A discount expires if you hire no crews.
Old timetable shifts and extra-build Construction effects have been replaced by
this five-card ability set.

## Placement and contact rules

Follow the route's lengths **in the printed order**, within ±0.5 peg-space distance.
Turns may be at most **90°**, inclusive. The first segment has no heading constraint.
Station docks have distinct positions; choose a particular free dock. Length and
angle use its physical position. A taken dock is rejected, never substituted.
With two companies, Minor Stations have one dock and Major Stations two. With
three or four companies, they have two and three respectively. Each game shuffles
the named stations among deliberately well-spaced board sites, so Destinations
move while the city never clusters into one corner. A line docks each station at
most once.

Normal pegs may share holes, sit on strings, or be adjacent. Routes may cross and
pass through pegs. Only collinear **string overlap** is prohibited. Stations never
block strings passing over them. The current route glows during construction; a
selected next node draws a translucent route-colored segment until Confirm.

Each distinct contact with another company's normal network costs **$1M to that
owner**. Multiple incident strings at one vertex cost once per owner. If several
companies share a contacted point, pay each. Contacts with your own routes are
free. Departing an already shared node is not charged again. Station docks keep
their separate occupancy rules. Construction can incur debt; every $1M still owed
at the end costs **−4 VP**.

Each Confirm consumes one hired action. Undo restores the latest physical placement,
its toll transfers and pending action, until another accepted action occurs.
It does **not** refund the crew-hiring transaction. A restored Access Pass can
cover that restored placement again; the already-played card stays spent.

## Scoring and the table

Route completion/unfinished penalties, the longest network award,
unique connected stations (5 VP Major, 2 VP Minor), all held Engineering goals and
Destinations, Survey Pins and final debt appear in the results breakdown. A station
scores once per company. Ties break on Major connections, then cash, then shared victory.

Construction schedule replaces the timetable. Use Crews, Board, Lines and Cards to move
around the same pan-and-zoom table. Read missions and Engineering cards directly on their tabletop pieces. Hotseat
players pass the device before revealing the next hand. Online hidden information
remains a social rendering convention; the shared room payload contains all hands.

Local hotseat is at `/subway`. `/subway/tutorial` provides 13 replayable practice
lessons using isolated states and real controls. It never alters a real room or
hotseat save. Camera focus, outlines and schematic animations explain the phases;
Back, Skip, Replay and phase-specific links remain available.

Results include **Copy AI Report**, which exports structured Markdown plus the
complete accepted-action ledger: setup, cards, routes, placements, crew and toll
economy, Undo actions, scoring, timing, and the construction end reason. Rejected
actions are not tracked because they never change reducer state.

State version **14** requires new games; old local saves are not migrated.
Automated games test termination and rule behavior, not human enjoyment or
statistically proven balance. Desktop/phone visual verification is still pending.
