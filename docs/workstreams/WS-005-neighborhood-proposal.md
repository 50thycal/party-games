# Neighborhood conversion — approved specification

Status: OWNER AUTHORIZED on 2026-09-12. Implemented in PR #172; validation/review tracked in WS-005.

## Approved board rule

Keep the ten named places, but make each a colored neighborhood footprint on
the peg grid. There are three small, six large and one medium neighborhood.
Small neighborhoods contain three holes (straight or L-shaped);
large neighborhoods contain six holes (2×3 or a connected triangular footprint);
the medium neighborhood contains four holes (square or T-shaped).
Shuffle positions and rotate footprints once per game, using the game's seeded
randomness. Never overlap neighborhoods; keep a clear outer border and enough
space between areas. Use ten separated interior 3×3 bays as a guaranteed valid layout, avoiding retry/fallback failure. Do not
move areas during a game or rotate the pegboard's north/south labels.

A line serves a neighborhood when it places a node inside that footprint.
Passing through with string alone earns nothing. A line can serve a neighborhood
once; revisiting does not multiply points. Two of a company's lines serving the
same neighborhood can transfer there, even at different holes. Opponent lines
and geometric crossings do not provide transfers.

Small neighborhoods: Market, Garden, Library (2 VP each).
Large neighborhoods: Grand Central, Museum, Stadium, University, Airport,
Harbor Exchange (5 VP each). Medium neighborhood: Theatre (3 VP).
These identities keep their sizes while locations, shapes and rotations vary.
Score each distinct neighborhood once per company. No neighborhood-wide dock cap;
ordinary peg sharing/contact rules apply at individual holes. The internal major/
minor category IDs map to large/small for objective compatibility; medium is neither.

## Affected cards — one suggested change each

| Card | Approved neighborhood rule |
|---|---|
| All pair/triple Destinations | Serve every named neighborhood within one connected company network. Different lines may supply the visits, but must connect. Retain 4/7 VP initially. |
| Major Connection | Complete one line serving two distinct large neighborhoods; retain 6 VP. |
| Integrated Network | Connect all three completed lines through shared neighborhoods or shared pegs; retain 7 VP. Different transfers are allowed. |
| Terminal Network | A qualifying completed line's final peg lies inside a neighborhood. Retain 2/4/6 VP for one/two/three lines; the same neighborhood may serve multiple terminals. |
| Local Service | One line serves all three small neighborhoods; the line need not be complete. Retain 5 VP. |
| Central Interchange | Two separate lines in a two-player game, or three at 3–4 players, each place a node inside the same large neighborhood. Retain 6 VP. Unlike Integrated Network, this requires one common hub and no completed contracts. |
| Four Corners | Keep the exact opposite-corner goal and its tiers; neighborhood transfers may form the connecting company network. Maximum still requires all three lines in that component. |

Three-Way Service, Turning the Corner, Loop, North–South Lines, Across Town,
Perimeter Service and Three Fronts retain their literal border/column geometry;
neighborhood boundaries are not board sides. Surveyed System, First to Open and
On Budget retain their conditions, although easier connections may affect balance.

## Other rules affected

- Longest network: neighborhood transfers connect routes, but add zero imaginary
  string length. Count only built segments, never reuse one. Retest branches and cycles.
- Surveys: retain their own exact-hole target and place outside neighborhoods.
- Tolls: charge existing point/segment contact tolls, not simply being in the same
  neighborhood as an opponent. Sharing an area is not touching an opponent's string.
- Highlights: outline the complete footprint rather than one dock plaque.
- Reports/Undo: retain neighborhood ID plus exact hole, footprint layout and state
  version so replay, geometry and reversal stay unambiguous.
- Geometry: segment lengths still measure peg-to-peg; remove tiny dock offsets.

## Acceptance before release

Seeded layouts at 2/3/4 players must be in bounds, non-overlapping and varied;
every neighborhood has reachable legal node targets. Node-inside vs pass-through,
transfers, unique scoring, different-color contacts, same-color rejection,
objective tiers, exact-border goals, full-game simulation and phone/iPad rendering
all need coverage. Compare completion rate and meaningful route choices with the
station version; do not treat more completed routes alone as proof of balance.

Owner authorized node-only service, neighborhood transfers, no dock limits and the revised counts/Local Service condition. State v18 requires new games.
