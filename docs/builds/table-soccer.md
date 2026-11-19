# Table Soccer MVP

**Framework:** Build OS v0.12
**Workstream:** WS-009
**Build Card:** Approved by Calvin on 2026-11-18

## Outcome

Two to four people lay their phones flat and turn a real table into a shared soccer field. After setup, the main view on each phone is its own goal. A mini-map shows the ball between screens.

## Match rules

1. The host creates a multiplayer room. With two to four players joined, the host enters table width and length in centimeters or inches, then places and rotates each phone on the overhead map. The arrow on each phone marker shows the physical top edge. The default arrangement has all phones facing inward.
2. Each player places one stationary round bumper. All bumpers are public and stay in place for the match. Bumpers must fit inside the table and clear other bumpers and phone footprints.
3. Players take turns in room order. Drag the ball backward to aim and set power, then release to kick. The ball rolls in table coordinates and rebounds from round bumpers and the table rails. The shooter can score in any other player's goal. A shot that stops or meets a goal ends the turn.
4. Defenders slide their goalies during a shot. A goal is threatened when the ball crosses its goal line from the front. One server result decides whether the goalie was in its path. A save or miss advances the turn. A goal gives the shooter one point and a one-bumper placement before play continues. The third goal ends the match. The host can play again with the same calibration and a fresh set of scores and bumpers.

## Implementation

- Reuse the room lobby, public actions, reducer and Turso compare-and-swap updates. Restrict Table Soccer to multiplayer and 2–4 seats, lock new seats after setup starts, and allow existing players to rejoin. Table Soccer uses a versioned serializable state, a revision for freshness, and match/turn numbers for stale action rejection.
- The reducer validates the host's layout and computes a bounded, deterministic trajectory in centimeters. It publishes a scheduled start and sampled path. Clients animate locally using the server clock and transform world points into their individual phone coordinates. The trajectory ends at the first eligible goal crossing or when the ball stops.
- Poll room state faster only while a Table Soccer shot is available or in flight. Allow a short lead before the ball starts and a small receipt and settlement window at the end. Goalies respond locally to drags and publish coalesced, sequenced position updates during the flight. A slow request does not hold up a newer save. The server selects the position at settlement. A connected player can settle a finished flight even if the shooter leaves. The result is committed once.
- Camera detection, iPhone ranging, moving obstacles, hotseat and a separate simulation service are outside the MVP.

## Acceptance

- From the regular create and join pages, run a match with separate browser sessions. Verify 2–4 seats, manual shifting/rotation, initial bumper ownership, legitimate placement and late-join behavior.
- Verify pull-and-release aim, straight and bank trajectories, local arrival edge, responsive goalie control, a saved shot, a goal, the scorer's extra bumper, and a terminal score of three. Verify consistent state after refresh and on replay.
- Run the game-specific rules tests, existing bearings regression tests, type check, lint and production build. Exercise live saves in phone-width browser sessions. Verify the Vercel preview and record physical iPhone playtesting separately if hardware is available.

**After this change, the system should** let friends set up a game on their own table and react to the same virtual ball as it moves between their phones.

## Solo Playtest extension

Calvin authorized a one-phone mode and a multi-phone end-to-end playtest. The Create a Room screen offers Solo Playtest for Table Soccer. Choose one to three CPU opponents, then use the regular layout editor, playfield and first-to-three rules. A solo match runs in the browser. CPU opponents place their own bumpers, take turns and defend using the shared game rules and physics.

Verify a complete touch-control solo match and separate-browser multiplayer matches through the ordinary create, join, calibration and match flow at two, three and four seats. Check the direct solo entry on the Vercel preview.
