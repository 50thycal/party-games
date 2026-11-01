# Landmark Bearings

2–12 players · multiplayer phones or one-device hotseat

Choose **Landmark Bearings** in Create Room. The host chooses a starting city,
device location (only on request), or named coordinates; a landmark pack; and
1–10 rounds. Santa Fe, US favorites and five rounds are the defaults. The first
landmark can be chosen; subsequent landmarks are shuffled without repeats.

Each player guesses the initial compass bearing toward the named landmark:
**north 0°, east 90°, south 180°, west 270°**. Enter a whole number from 0 to 359;
360 is also accepted as north. Submitting locks the guess for that round.

The host reveals when ready. Opponents' guesses and the answer stay hidden in
the normal view until then. The closest guess wins the round; equal errors share
the win. The answer ray and each player's guess appear on the compass, followed
by the sorted results, cumulative standings and round history.

Error is the smaller angle around the circle: 359° versus 1° is **2° off**.
The host may confirm an early reveal; each missing player receives **180° off**
and cannot share that round's win. At least one actual guess is required.

Lowest **total degrees off** wins the expedition. Equal totals share the final
win; round wins are shown as a separate statistic, not a tiebreaker. Calculations
use unrounded values; screens display one decimal place.

In hotseat, use the room's **Next Player** or **Controlling** selector, then return
to the host seat to reveal or advance. Players who join after the expedition
starts wait for the next game. Replay returns to setup with the previous settings
and clears scores. A fresh roster is taken at the next start.

Bearings are initial great-circle azimuths on a spherical Earth, measured clockwise
from **true north**. They are not magnetic compass headings, driving directions,
or angles on a flat map. Coincident/antipodal points have no unique bearing and
are excluded from the deck. The exact poles cannot be starting locations.
Landmark coordinate references are linked after reveal. No AI/API key is required.

The existing room transport sends complete state to clients. Hidden guesses are
a normal-play UI convention, not protection against someone inspecting network
state or application code.

## Development checks

`npm run test:bearings` tests math, game rules, rendering and the real room API
handlers against a temporary local libSQL database. It never touches production.
`/test/bearings` shows isolated phone and desktop games using the same reducer and
view, without database transport. These lab games reset on refresh.
