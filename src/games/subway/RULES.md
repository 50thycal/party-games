# Subway — Metropolitan Transit

A light-strategy route-building game for **2–4 companies**. Most victory points wins.

## Game flow

1. Start with **$60M and no cards**.
2. Draft three route contracts each, at list price, from a replenishing row of
   two/three/four choices for two/three/four players. No passing or discounts.
3. Draft **six cards each**, choosing any mix of Engineering and Construction.
4. Optionally buy Survey Pins, then place them.
5. Place one free starter for each route on a non-station outer-border hole.
6. Play up to **16 construction rounds**, choosing crews anew each turn. End
   immediately if no incomplete route has a legal next segment.
7. Score all held goals, routes, stations and surveys; subtract unfinished-route
   penalties and **4 VP per $1M of final debt**.

There is no Engineering commitment, Destination assignment, separate Destination
draft, or advance scheduling phase. Any of your routes may satisfy a Destination.
Engineering cards describe their company-wide scoring conditions.

## Drafting

The route pool supplies 6/9/12 unique routes for 2/3/4 companies. Refill the visible
row after each purchase while the deck lasts. Every player must take one per turn.

For cards, show two Engineering and two Construction cards. Take one face-up card
or draw blindly from either pile. Refill immediately while cards remain. If a
blind pile is empty, its remaining face-up cards are still available. There is
no minimum number from either category.

The Engineering pile contains **one copy of each of 14 goals and 10 Destinations**,
shared across the whole table. Construction contains eight copies of each of the
five abilities below; duplicate Construction cards in a hand are allowed.

Pick order alternates forward and reverse each draft round. Rotate the opening
seat between route and card drafts. Snake turnarounds may give consecutive picks;
each full draft round visits every company once.

## Route contracts

| Route | Code | Segment recipe | Price | Complete VP | Major bonus | Unfinished VP |
|---|---|---|---:|---:|---:|---:|
| Market Shuttle | S | 2,3,2,3 | 5 | 4 | 3 | −4 |
| Garden Spur | B | 4,2,3,4,2 | 6 | 5 | 3 | −5 |
| Museum Connector | M | 3,5,2,4,3,5 | 8 | 6 | 4 | −6 |
| Grand Central Express | E | 6,4,5,3,6 | 10 | 6 | 5 | −7 |
| Crosstown Line | C | 5,3,4,2,5,3 | 10 | 7 | 4 | −7 |
| Harbor Line | L | 4,6,3,5,2,4,6 | 11 | 9 | 4 | −8 |
| Old Town Tram | T | 2,3,4,2 | 5 | 4 | 3 | −4 |
| Riverside Line | R | 4,2,5,3,4 | 7 | 5 | 4 | −5 |
| University Shuttle | U | 3,2,4,3 | 6 | 4 | 3 | −4 |
| Orbital Line | O | 4,5,2,4,3,5 | 9 | 6 | 4 | −6 |
| Airport Express | A | 6,3,5,4,2 | 10 | 6 | 5 | −6 |
| Neighbourhood Local | N | 2,3,2,4,3 | 6 | 5 | 3 | −5 |

The Major bonus pays once per contract that docks at least one Major Station,
complete or incomplete. Four premium routes carry completion specials: Grand
Central Express scores +3 for two Major Stations; Crosstown scores +3 for
reaching within five pegs of both board edges; Orbital scores +3 for three
stations; and Airport Express scores +4 for docking at Airport. Every recipe
has 4–7 segments, and every printed segment is 2–6 pegs long.

## Engineering goals

Every goal in your hand can score once. No commitment is required. Destinations
pay **+3 VP** if any of your routes docks the named station, finished or unfinished.
All goals stay private until results; the owner can inspect live progress.

| Engineering goal | VP | Requirement |
|---|---:|---|
| Gentle Curve | 4 | One line has three consecutive segments where every turn is ≤30°. |
| 45° Bend | 3 | One line turns more than 30° and at most 50° at a node. |
| Straightaway | 4 | One line has three consecutive segments aligned within 15°. |
| Major Connection | 4 | One completed line connects a Major and a Minor Station. |
| Grand Tour | 5 | One completed line connects one Major and at least two Minor Stations. |
| Network Link | 4 | One completed line connects at least three different stations. |
| Long Haul | 4 | One completed line has six or more segments. |
| End of the Line | 4 | A completed line ends on a station. |
| Twin Completion | 3 | Complete at least two Line Contracts. |
| Crossing Design | 2 | One of your segments properly crosses any existing line. |
| Across Town | 5 | One line has a node within five pegs of both board edges. |
| Local Service | 4 | Your company connects two different Minor Stations. |
| Interchange | 3 | Two of your lines dock the same station. |
| On Budget | 3 | Complete at least two lines and finish with at least $3M. |

## Surveys

After card drafting, each company may buy zero to five Survey Pins for $1M each.
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

On your turn, optionally play an eligible card, then choose zero to three different
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
Construction ends after round 16, or immediately after a placement leaves no
legal next segment on any incomplete route. Empty rounds are never played. A
blocked or skipped placement does not refund its hired crew. Normal placement
legality remains unchanged.

## Construction cards

Play **at most one card per company per round**, discarded when played. Priority
Dispatch is the only opening-window exception; all other cards are played during
your own turn at their printed timing. Cards cannot be played during drafting.

| Card | Effect | Timing |
|---|---|---|
| Advance Booking | Reserve $1M off your crew bill next round. Expires unused; never pays cash. Unavailable in round 16. | Before hiring |
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
Minor Stations have two docks; Major Stations have three. Each game shuffles
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

Route completion/unfinished penalties, printed route specials, Major bonuses,
unique connected stations (5 VP Major, 2 VP Minor), all held Engineering goals and
Destinations, Survey Pins and final debt appear in the results breakdown. A station
scores once per company. Ties break on Major connections, then cash, then shared victory.

Crew dispatch replaces the timetable. Use Crews, Board, Lines and Cards to move
around the same pan-and-zoom table. Read cards in their focus dialogs. Hotseat
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

State version **13** requires new games; old local saves are not migrated.
Automated games test termination and rule behavior, not human enjoyment or
statistically proven balance. Desktop/phone visual verification is still pending.
