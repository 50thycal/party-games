# Polished Subway introduction — separate-session handoff

Repository: https://github.com/50thycal/party-games
Public game: https://party-games-flame.vercel.app/
Workstream: WS-005. This is an in-game slide-style tutorial, not a standalone
PowerPoint requirement. The owner specifically requested a separate session.

## Outcome
A host can teach new players from the shared iPad before a game, with a short,
polished visual walkthrough. The biggest missing explanation is how stations
connect into transfer stations and how a company's lines form a network.

## Start here
Read AGENTS.md, docs/workstreams/ACTIVE.md, WS-005, PROJECT_MODEL, relevant DECISIONS
and the actual current rule implementation. Check open PRs before editing.
The paid-extension/configurable-line-count bundle is approved but was not built
in the session creating this handoff. Check its implementation status; do not
present planned behavior as currently playable or duplicate that implementation.
Older rulebook documents are drafts and contain historical rules. Reconcile
against code and latest accepted decisions rather than copying them wholesale.

## Recommended teaching sequence
1. Your company, owned line colors and how victory points determine the winner.
2. What stays on the iPad and what players do on their phones.
3. Drafting line recipes, summed lengths, Engineering goals and Destinations.
   Show the selected number of lines; do not hardcode three once configurable.
4. Starter placement on empty legal border pegs.
5. A normal turn: optional card purchase, crews and price, select/preview/confirm.
6. The core connection lesson: two owned lines connected by adjacent stations;
   a contrasting nearby-but-disconnected example; sharing a neighborhood alone
   does not connect them, and crossing strings alone does not form a transfer.
7. Destination service versus line completion: a real station serves a neighborhood;
   distinguish crossing a neighborhood from stopping in it. Explain cash rewards.
8. Exact length versus optional flexible length, curves, one bend, and the
   selected bend mode. In delayed mode the next activation finishes the remaining
   segment budget. Explain green targets, yellow previews and Undo visually.
9. Economy: paid crews, free station adjacency joins, normal string-contact tolls,
   borrowing, completion cash and ending-cash VP. Current debt is -2 VP per $1M;
   positive $0–1M=0, $2–3M=1, $4M=2, $5M+=3 VP.
10. Engineering scopes, longest network/largest transfer awards and final scoring.
11. Late-game extensions only after the separate feature is implemented: explain
    the actual fee/range/unlock rules without changing them.
12. A concise ready-to-play recap, with rules available to reopen later.

## Presentation and interaction
Use the existing Subway board/card visual language and exact deterministic SVG
examples for geometry. Teach one idea at a time with short text and clear before/
after examples. Reuse real components where practical. Distinguish company ownership
from line color. Use black station outlines, legible color abbreviations and
non-color-only cues. No tiny labels or prose-heavy slides.

Provide Next, Back, Skip/Close, visible progress, and a way to reopen How to play.
Support shared iPad landscape and phone portrait without making the compact phone
status panel taller. Keep the tutorial read-only: no spending money, advancing
turns or modifying a live game. Respect reduced motion and use accessible controls.
A long written rulebook can remain a reference; the intro must work for first-time
players watching together. Show a storyboard before investing in polished artwork.

## Acceptance and delivery
Verify every rule/example against the reducer, especially station connectivity,
crossing fees, bend budgets and selected setup options. Browser-test first-open,
next/back/skip/reopen, portrait/landscape, readability and no gameplay mutation.
Run repository-required checks, update WS-005 and open one independently reviewed
PR. No unrelated gameplay rebalance or automatic merge. Keep KC strategy changes,
automatic player-count rebalancing and a strategic-complexity rating system parked.
