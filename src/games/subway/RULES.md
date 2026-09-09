# Subway — Metropolitan Transit

A competitive route-building game for **2–4 companies**. Build a useful network,
deliver your contracts and complete secret goals. Most victory points wins.

## Quick start

1. Take three route contracts. Choose from the face-up row at list price; no passing.
2. Draft six cards, then two Destinations. Assign Destinations to your routes and choose three Engineering goals.
3. Schedule construction. The initial suggestion includes every route at the lowest cost.
4. Place one free starter peg per scheduled route on the edge of the map.
5. Build the printed segment lengths in order. Tap, inspect the preview, then Confirm.
6. Score routes, stations and goals. Unfinished contracts and debt lose points.

The same rules apply at every player count. Local pass-and-play is at `/subway`;
Create Room → Subway → Hotseat uses the online room system. Local games save on the
current browser/device and can resume after refresh; they do not sync to other devices.

## Companies and contracts

Each company starts with **$40M and no cards**.
Shuffle the twelve-route pool and select six routes for two players, nine for
three, or twelve for four. Reveal a row of **2/3/4 choices**, respectively.
Each turn, buy one visible contract at list price; refill while the deck lasts.
There is no passing, discount, or card reward. Everyone takes three routes.

Draft order runs forward, then reverse, alternating each round. Rotate the
opening seat one place between route, card, and Destination drafts. A snake
turnaround can give one player consecutive picks.

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

## Engineering

First draft six cards each, one per turn: any of two face-up Engineering,
Scheduling or Construction cards, or a blind draw from that category. Refill
immediately. Each shuffled category pile contains eight copies of each card.
You must collect at least three distinct Engineering goals within six picks;
remaining picks are reserved for goals when necessary. Face-up goals you own
cannot be drafted; blind Engineering draws skip owned goals without spending a
pick. Scheduling and Construction cards are optional and may have duplicates.
Cards cannot be played during drafting.

Then draft two Destinations per company from a row of three, separate from
the six-card allowance, using the next rotated opening seat and snake order.
There is one card for each of ten stations. Assign every drafted Destination to
an owned line, at most two per line. Each pays **+3 VP** if that line docks its
station, whether the line is finished or not.

Choose **three different Engineering goals** from your hand. These are company-wide:
any qualifying owned route may satisfy a goal. They are separate from Destinations.
The card describes its precise scoring condition. Uncommitted cards never score.
The interface shows your own progress privately.

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

Optionally buy up to five Survey Pins for $1M each. Place them on non-station holes,
taking turns across all companies. A pin scores +1 VP if any of your routes has a
node on it. Pins reserve nothing. You may not stack your own pins on one hole.

## Scheduling

Each route needs one contiguous block of periods equal to its segment count,
inside the **16-period** programme. Its starter is free and does not use a period.
The initial suggestion minimizes the total cost of scheduling all routes, breaking
ties by earliest finish. You can request the suggestion again or change any start.
A deliberately shelved route gets no starter and incurs its unfinished penalty.

Mobilization costs $3M for starts 1–3, $2M for 4–6, $1M for 7–9, and nothing for 10+.
Each extra simultaneous route costs $2M per overlapping period for another crew.
You must afford the schedule before submitting. Everyone submits privately, then
all schedules reveal. Each company may play **one Scheduling card per game**, then
confirm. Costs are paid when all confirm.

| Card | Effect |
|---|---|
| Early Mobilization | Move a block one period earlier; waive the extra mobilization cost. |
| Float | Move a block one period earlier or later; costs adjust. |
| Priority Permit | Take first place in one period where you and another company work. A claimed period cannot be overwritten. |
| Staggered Start | Move one block one to three periods later; costs adjust. |
| Coordination Window | Waive $2M of your crew-overlap cost. |

Shifts must fit the calendar and remain affordable. Priority starts at a randomly
chosen company and rotates each period through **every seat**. Resolution order
also rotates, skipping companies without work. A Permit moves its owner to the
front while preserving the remaining order.

## Building the map

Place starters on the outer border, alternating fairly across companies. Survey
pins and starters do not consume scheduled build actions. During construction,
each active line gets one placement per scheduled period. A company resolves its
pending actions, then play moves to the next company; empty periods skip forward.

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
block strings passing over them. Printed river/park/districts are decorative.

Each distinct contact with another company's normal network costs **$1M to that
owner**. Multiple incident strings at one vertex cost once per owner. If several
companies share a contacted point, pay each. Contacts with your own routes are
free. Departing an already shared node is not charged again. Station docks keep
their separate occupancy rules. Construction can incur debt; every $1M still owed
at the end costs **−2 VP**.

| Construction card | Effect |
|---|---|
| Overtime | Add one action on a line already working this period. |
| Surge Crew | Add one action on a different unfinished, buildable line. |
| Expedite Materials | Move ahead of the remaining companies this period. |
| City Grant | Receive $3M immediately. |
| Access Pass | City pays the contacts on your next placement this period. Owners still receive their tolls. Expires after that placement or at period end. |

Play at most **one Construction card per company per period**, only while your
company remains in that period's queue. Bonus actions still require legal targets.
Each Confirm consumes exactly one action; a skipped action is lost. You can Undo
the latest physical placement until another accepted action occurs. Undo restores
all affected balances, the pending queue and any unused Access Pass.

## Reading the table and passing the device

Everything is on one pan-and-zoom tabletop: other companies at the far edge,
schedule above the map, route boards and your private cards below. Use quick-focus
buttons, drag to pan, scroll/pinch to zoom. Tap a card to read it and take its action.
Current selection and the next possible step have different numbered rings.
Reposition freely before Confirm; a preview never spends or reserves anything.
Saved phantom routes are personal planning aids, stored only on your device.

Pass to the next company before revealing its hand. The veil hides private cards
when changing seats. Opponent boards contain public routes, money and card counts.
Online privacy is a social rendering convention: clients receive the entire room
payload. This is not an adversarial hidden-state service.

## Final scoring

Route completion or unfinished penalties, route Major bonuses, unique connected
stations (**5 VP Major, 2 VP Minor**), three committed Engineering goals, fulfilled
Destinations, Survey Pins, and debt all appear in the score breakdown. A station
scores once per company, even if two of its routes dock there. Ties break on Major
connections, then remaining money, then a shared victory. Scoring is final when
the host advances to Results.

State version **11** requires existing older online games to restart. Multiplayer
balance is provisional: automated games verify completion and expose tendencies;
human games remain the test of enjoyment and long-term strategy balance.

## Guided practice

Visit `/subway/tutorial` for 13 replayable lessons using isolated practice states
and real game controls. Camera pans, area outlines, animated examples and accepted
action feedback explain the phases. Back, Skip, Replay and lesson selection are
available throughout. Animations respect reduced-motion preferences. The in-game
Phase lesson link opens practice in another tab without altering the live game.
Desktop/phone visual verification remains pending.
