# Decisions — Party Games

Why does the system work this way? Lightweight ADRs, appended in order, newest at the bottom.
This log follows [Build OS v0.4](https://github.com/50thycal/build-os).

## How to add an entry

1. **Record consequential decisions only.** A decision belongs here if it constrains future work,
   is expensive to reverse, resolves a real trade-off where the losing option was defensible, was
   an owner decision with lasting effect, or deliberately accepts a cost. Naming, file layout, and
   choices any competent engineer would make the same way do not belong here.
2. **Use the next free `DEC-nnn`.** IDs are stable: never reused, never renumbered.
3. **Never rewrite an accepted entry** because the architecture later changed. Add a new entry
   that supersedes it, and change *only* the old entry's `Status` line to
   `Superseded by DEC-0NN`. The original context and rationale stay exactly as written — that
   record is the whole point of the file.
4. **Write `Alternatives considered: Unknown / not documented`** rather than inventing a rationale
   that was never recorded.
5. **Ship the entry in the same pull request as the change it explains.**
6. **An *open* decision does not belong here.** A choice still awaiting owner judgment lives in
   its workstream file under `Open Decisions` (`docs/workstreams/`). It graduates to a `DEC-nnn`
   once it is both settled and consequential — recording an unratified implementer ruling as an
   accepted decision launders it into history.

Format:

```text
### DEC-nnn — <Decision stated as a decision>

**Date:** YYYY-MM-DD
**Status:** Proposed · Accepted · Superseded by DEC-0NN · Deprecated

**Context**
**Decision**
**Rationale**
**Alternatives considered**
**Consequences**
```

> **Provenance note.** `DEC-001`–`DEC-008` were reconstructed on 2026-08-22 from repository
> evidence — commit messages, the original `docs/history/SPEC.md`, and the code itself — when this
> log was created. Rationale is quoted or paraphrased from what those commits actually state.
> Decisions whose reasoning could not be established from the repository were deliberately left
> out rather than invented.

---

### DEC-001 — Games are plugins; the engine stays game-agnostic

**Date:** 2025-12-06
**Status:** Accepted

**Context**
The project's founding goal (`docs/history/SPEC.md` §1–2) was to be able to build many small party
games quickly. The alternative most such projects fall into is one codebase per game, or a shared
codebase where each new game requires edits to shared routing, lobby, and networking code.

**Decision**
Define a single `GameTemplate<S, A>` contract — `initialState`, `reducer`, `getPhase`, optional
`isActionAllowed` — that every game satisfies. The engine (rooms, players, action dispatch,
persistence, syncing) knows nothing about any specific game. Adding a game means adding a folder
and registering it; no engine file changes.

**Rationale**
Stated in the spec as "developer speed, clarity, and extensibility": the shared infrastructure is
written once, and iteration cost per game stays flat as the number of games grows. Pure
`(state, action) => newState` rules are also testable without a server.

**Alternatives considered**
- **A game-aware engine with per-game branches.** Rejected in the spec's framing: it makes every
  new game a change to shared code.

**Consequences**
- Seven games now share one deploy, one lobby, and one persistence layer.
- The engine cannot optimise for any single game — a game needing different transport or timing
  guarantees has to work within the shared model or change it for everyone.
- Game rules are pure, so they can be driven directly by test harnesses and simulators
  (`scripts/subway-rules-test.ts`, `/test`).

---

### DEC-002 — Views live on the client, not in the game template

**Date:** 2025-12-07
**Status:** Accepted

**Context**
The original spec put `views: { HostView, PlayerView }` inside `GameTemplate`, which meant the
server-side game registry transitively imported React components. Commit `f40d186` changed this
while adding game selection.

**Decision**
Remove views from `GameTemplate` — "the engine is now logic-only". Game UI is resolved through a
separate client-side registry (`src/games/views.ts`) that maps a game id to a single `GameView`
component receiving `{state, room, playerId, isHost, dispatchAction}`.

**Rationale**
Keeps the server bundle free of client components and makes the room page fully generic: it looks
up a component by id and renders it, so it never changes when games are added. A single
`GameView` (rather than separate host/player views) lets each game decide for itself how much the
host and player screens differ.

**Alternatives considered** — Unknown / not documented.

**Consequences**
- Every game is registered **twice**: logic in `gameRegistry.ts`, UI plus player-facing metadata
  in `views.ts`. The two can drift.
- `minPlayers`/`maxPlayers` are now duplicated between the template and `gameOptions`.
- `GameTemplate.getPhase` survived the change but lost its consumer; nothing calls it today.

---

### DEC-003 — Sync by polling, not WebSockets

**Date:** 2025-12-06
**Status:** Accepted

**Context**
Real-time multiplayer normally implies a socket layer. The spec (§8) chose to defer that: "Phase 1
(MVP) — Polling … Advantages: zero complexity, great for early playtesting", with a stated Phase 2
upgrade path that would leave reducer and game code untouched.

**Decision**
Clients `GET /api/get-room` once per second and re-render from the returned snapshot. Actions are
ordinary `POST`s. No sockets, no push.

**Rationale**
Zero infrastructure on a serverless host, no connection lifecycle to manage, and party games at
this scale tolerate ~1s latency. The action/reducer contract is transport-independent, so the
upgrade stays available.

**Alternatives considered**
- **WebSockets from the start** (spec §8 Phase 2, §11). Deferred as unnecessary complexity for
  early playtesting rather than rejected on merit.

**Consequences**
- Every connected client costs one database read per second; a full room is ~8 reads/sec.
- No server push means no server-side timers: time-based rules must be triggered by a client
  action and re-validated in the reducer (see Open House's `TURN_TIMEOUT`).
- Games needing sub-second shared timing are not well served by the current transport.

---

### DEC-004 — Persist room state in SQLite with version-based optimistic locking

**Date:** 2025-12-14
**Status:** Superseded by DEC-005 *(storage medium only; the locking design it introduced remains
in force)*

**Context**
Room and game state lived in an in-memory `Map`. Commit `90f7f40` records the resulting failures:
race conditions when players acted simultaneously, data loss on server restart, lost updates where
polling overwrote optimistic state, and concurrent joins overwriting each other.

**Decision**
Replace the in-memory store with an on-disk SQLite database (`better-sqlite3`, WAL mode) holding
the serialised room state plus a `version` column. Every update is a compare-and-swap against the
expected version, with automatic retries: up to 5 server-side, 3 client-side with exponential
backoff. Failures surface as user-facing error toasts instead of failing silently.

**Rationale**
Quoted from the commit: it "provides a stable foundation for multiplayer games without requiring
WebSockets or major infrastructure changes" — concurrency correctness was achievable with a
version column and retries, without changing the transport or the game contract.

**Alternatives considered**
- **Locking or serialising all room writes.** Not discussed in the commit; optimistic locking was
  chosen directly.

**Consequences**
- Reducers may run more than once per request, since a conflicting attempt re-reads and replays.
- All store operations became version-aware; `getVersionedRoomState` / `updateRoomState` are now
  the primary interface, and unconditional writes are reserved for room creation.
- Concurrent-update failure became a real, user-visible error state (`409`).

---

### DEC-005 — Use hosted Turso (libSQL) rather than a local SQLite file

**Date:** 2025-12-14
**Status:** Accepted · **Supersedes:** DEC-004 (storage medium)

**Context**
On Vercel, the SQLite file from DEC-004 could not work. Commit `d5b7d49` first moved the database
to `/tmp/data` because `/var/task` is read-only, and explicitly noted that `/tmp` is ephemeral and
per-instance. The symptom was rooms vanishing and 404s when a different serverless instance served
the next request.

**Decision**
Replace `better-sqlite3` with `@libsql/client` against hosted Turso Cloud. All database operations
become async. Optimistic-locking semantics and retry counts are preserved exactly. Required
configuration is `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`; the client fails loudly with a
descriptive error when they are missing. Schema is created lazily and idempotently.

**Rationale**
From the commit: "true multi-instance persistence" — a network database is shared by every
serverless instance, survives cold starts and deploys, and keeps the ACID guarantees the locking
scheme depends on.

**Alternatives considered**
- **Local SQLite on `/tmp`** — tried first (`d5b7d49`) and abandoned: writable but ephemeral and
  instance-local.
- **Postgres or a KV store** — named in `d5b7d49` as alternatives ("Turso/Postgres/KV"); the
  commit does not record why Turso won.

**Consequences**
- Every API route touching the database is pinned to `runtime = "nodejs"`.
- Without the Turso environment variables the app cannot create or read any room — there is no
  fallback store, by design.
- Room state now survives deploys, which means a deploy can land mid-game and a new reducer can
  meet an old persisted state shape.
- Persistence is a network hop on every poll and every action.

---

### DEC-006 — Hotseat is a first-class room mode alongside multiplayer

**Date:** 2025-12-16
**Status:** Accepted

**Context**
The engine assumed one device per player, identified by a `localStorage` UUID. Playing several
seats from one device (pass-and-play) had no supported path. Commit `67d9a9e` added it "as a
first-class multiplayer feature".

**Decision**
Add `mode: "multiplayer" | "simulation" | "hotseat"` to `Room`, fixed at creation. For
hotseat/simulation, `create-room` pre-creates every player up front. The room shell tracks a
client-side *active player*, persisted per room in `localStorage`, and routes all dispatched
actions through it, with a switcher and a "Next Player" control.

**Rationale**
The change is confined to room creation and the room shell: game reducers see the same actions
from the same player ids either way, so every existing and future game gets pass-and-play for
free.

**Alternatives considered** — Unknown / not documented.

**Consequences**
- "Who is the host" becomes mode-dependent in the shell (`activePlayerId === room.hostId` in
  hotseat), and game logic that gates on host must account for that (see `canDrive` in HR
  Investigation, added later for exactly this reason).
- Any client in a hotseat room can act as any player; the mode assumes a trusted shared device.
- `simulation` exists in the type and in the shell, but the create-room UI offers only
  multiplayer and hotseat.

---

### DEC-007 — AI narration is fetched by one client and committed through an action

**Date:** 2026-07-05
**Status:** Accepted

**Context**
HR Investigation (`e343aed`) and The Desk (`416d941`) are hosted by an LLM narrator that generates
per-round content. Reducers are pure and the platform has no background workers, so generated
content had to enter the system somehow without making game logic do I/O.

**Decision**
Add stateless server routes (`/api/host`, `/api/desk`) that call OpenAI (`gpt-4o-mini`, strict
JSON) and return plain JSON. One client — the host in multiplayer — fetches the content in a React
effect and commits it via a normal action (`SET_INTRO`, `SET_ROUND`, …). The reducer sanitises and
clamps everything before storing it. Both commits state the requirement that "canned fallbacks
keep the game fully playable with no `OPENAI_API_KEY`", and The Desk's reducer "re-clamps all
Oracle output". `/api/speak` (`0123328`) extends the pattern to text-to-speech, playing on a single
device so the room hears one voice rather than a chorus of phones.

**Rationale**
Keeps reducer purity and the engine contract intact — the engine never learns that AI exists — and
makes generated content ordinary, replicated game state that every client receives through the
normal polling path. Treating model output as untrusted input, with fallbacks, keeps the games
playable when the key or the API is absent. `416d941` notes "engine untouched".

**Alternatives considered**
- **Generating content inside the reducer.** Incompatible with reducer purity and with
  conflict-retry replay.
- **A server-side job to generate rounds.** No scheduler exists on this platform (see DEC-003).

**Consequences**
- Orchestration lives in client effects, so which client drives matters. HR Investigation later
  widened this to any active player outside multiplayer (`canDrive`), because in pass-and-play the
  host seat may not be at the device.
- There is no server-side lock on "who generates round N"; a driving client that reloads at the
  wrong moment can re-fetch a beat or stall it.
- Every AI-dependent game must carry and maintain an offline fallback path.
- AI cost and latency are borne by a single client per room.

---

### DEC-008 — Subway versions its persisted game state

**Date:** 2026-08-20
**Status:** Accepted

**Context**
Because room state survives deploys (DEC-005), a game whose state shape changes can load a blob
written by an older build. Subway's v0.2 rework changed its state materially.

**Decision**
Stamp `SUBWAY_STATE_VERSION` into Subway's state, compare it on read, and have the view detect a
mismatch and offer to start a new game rather than attempting to render or migrate stale state.

**Rationale**
A party game in progress is cheap to restart and expensive to migrate; a clear "this room is
running an older version" prompt is better than a crash or silently wrong rules.

**Alternatives considered**
- **Migrating old state forward.** Not attempted; the value of an in-progress prototype session
  does not justify migration code.

**Consequences**
- Subway is the only game with this guard. The others can, in principle, meet an incompatible
  persisted state after a deploy.
- Any future change to Subway's state shape must bump the constant.

---

### DEC-009 — Adopt Build OS as the development framework

**Date:** 2026-08-22
**Status:** Accepted

**Context**
The project is built almost entirely through agent sessions — the commit history is a sequence of
Claude and Codex branches. Design intent lived in chat transcripts, and the only durable
architecture documents (`docs/spec`, `docs/plan`, December 2025) had drifted from the code: they
still described views inside the game template and an in-memory store, both long replaced. A new
session had no reliable way to learn how the system actually works or why.

**Decision**
Adopt [Build OS v0.1](https://github.com/50thycal/build-os) by reference, not by forking it.
Maintain `docs/PROJECT_MODEL.md` (how the system works today) and `docs/DECISIONS.md` (why), point
agents at them from a root `AGENTS.md`, and treat the GitHub pull request as the authoritative
implementation handoff. The original spec and plan move to `docs/history/` and are marked as
historical context rather than current truth.

**Rationale**
The framework's premise matches this project's actual failure mode: chat is a good place to think
and a bad place to remember. Referencing the canonical repository — rather than copying the
protocol in — keeps the framework upgradeable in one place instead of rotting separately here.

**Alternatives considered**
- **Copying the Build OS specification into this repository.** Rejected: the framework's own
  guidance is that projects reference a version rather than fork it, precisely to avoid divergent
  local variants.
- **Continuing to update `docs/spec` and `docs/plan` in place.** Rejected: they are a historical
  design and roadmap, not a description of the current system, and mixing the two is what let them
  go stale unnoticed.

**Consequences**
- Architecture-changing work now carries a documentation obligation in the same PR.
- Consequential decisions get recorded here as they are made, rather than reconstructed later.
- Final chat responses become deliberately short; the PR body carries the real handoff.

### DEC-010 — Subway caps a company at three Line Contracts, accepting a forced 3/3 split

**Date:** 2026-08-22
**Status:** Accepted

**Context**
Subway v0.3 sells all six Line Contracts every game and capped ownership at four, giving 4/2, 3/3
or 2/4 splits. The v0.3 brief explicitly wanted that asymmetry: it warned against any rule that
"would mathematically force exactly a 3–3 split and remove the ability for one company to pursue a
more contract-heavy strategy." Play-testing the four-cap showed the opposite problem — a company
could take four contracts, discover during Scheduling that they did not fit in 16 periods, and
shelve the overflow, which felt like a punishment for a decision made before the schedule was
visible.

**Decision**
Cap a company at three Line Contracts. All six still sell.

**Rationale**
Owner decision after play-testing. Three contracts is roughly the largest portfolio that can
actually be scheduled inside the 16-period horizon without heavy second-crew spending, so the cap
puts the ownership limit where the calendar limit already was.

**Alternatives considered**
- **Keeping the cap at four.** Rejected by the owner: it let a company over-commit before it could
  see whether the schedule fit.
- **Capping at three *and* letting contracts go unsold**, which would preserve asymmetric portfolio
  sizes (3/2 with one unsold). Not taken now — it is a larger change to Procurement, whose whole
  structure assumes every contract finds an owner. Recorded here as the obvious future move if the
  forced split proves dull.

**Consequences**
- **The split is now forced to exactly 3/3 every game**: six contracts, all sold, cap of three. The
  configured minimum of two is unreachable-below-three in practice, and the contract-heavy strategy
  the v0.3 brief wanted to preserve is no longer available. This supersedes that goal knowingly.
- The draft still decides *which* three contracts each company gets and *what it pays*, which the
  Discount Yard makes meaningful; only portfolio *size* stopped being a lever.
- `mustBuyOffer` fires more often, because a company reaches the cap sooner.
- `SUBWAY_CONFIG.maxContractsPerPlayer` remains the single knob; restoring asymmetry means changing
  it and relaxing "every contract is sold" together, not either alone.

### DEC-011 — A shelved Subway contract receives no starter peg

**Date:** 2026-08-22
**Status:** Accepted

**Context**
Scheduling lets a company shelve a contract it cannot fit in the horizon; the contract is never
built and takes its incomplete penalty. Starter placement, written before shelving existed, gave
one free peg to every *owned* contract.

**Decision**
Only contracts with a scheduled block receive a starter peg.

**Rationale**
A peg for a line that will never be built is not a neutral leftover: pegs project the one-empty-hole
spacing exclusion against the opposition, so a shelved contract's peg was a free blocker bought for
the price of a contract the company had already written off.

**Alternatives considered**
- **Placing the peg but exempting it from spacing.** Rejected: a peg on the board that does not
  behave like a peg is harder to explain than no peg at all.

**Consequences**
- `starterTurnId` alternates over scheduled lines only, and `PLACE_STARTER` rejects a shelved line.
- A company that shelves everything places no pegs and builds nothing; the phase still completes.
- `actionsRemaining` now ignores shelved contracts, so "work owed" reflects the real plan.

---

### DEC-012 — Upgrade to Build OS v0.4 and install the workstream layer

**Date:** 2026-08-23
**Status:** Accepted

**Context**
Party Games adopted Build OS v0.1 in PR #138 (`DEC-009`). Canonical Build OS had by then reached
v0.4, three minor versions ahead: v0.2 added persistent workstreams as a third project-memory
layer, v0.3 added the framework compatibility check and the pinned-version metadata block, and
v0.4 added protocol contracts for machine consumers. The gap was created in a day, which is the
point — the drift the compatibility check exists to catch does not need months to appear.

The gap had already cost something concrete. Subway v0.3 (PRs #137, #139) was designed outside
the repository, built, and merged, and its design brief, its four implementer rulings, and its
unanswered balance questions had no durable home. `PROJECT_MODEL.md` and `DECISIONS.md` cannot
hold in-flight design state: one describes what is, the other describes what was settled.

**Decision**
Upgrade the adopted version to v0.4, following the migration notes for each intervening version:
install `docs/workstreams/` with an `ACTIVE.md` board and one file per live effort (v0.2), record
the canonical/adopted/last-checked framework block in `AGENTS.md` and mark project-specific rules
as such (v0.3), and take no action on v0.4's contracts, whose migration note says a project with
no tooling reading Build OS artifacts needs none.

Retrofit exactly one workstream, `WS-001`, for Subway v0.3 — the only effort still live. Finished
work is not retrofitted.

**Rationale**
The workstream layer is the part of Build OS this project was actually missing: it runs one
substantial design thread at a time, designed in a separate tool, and the state between sessions
was living in chat and in merged PR descriptions. The compatibility block is cheap and makes the
next gap visible rather than silent.

Upgrading straight to v0.4 rather than stopping at v0.2 follows the framework's own guidance —
read every migration note between adopted and canonical, and apply what each requires. v0.4's
notes require nothing here, and saying so explicitly is itself the record.

**Alternatives considered**
- **Stay on v0.1 until Subway v0.3 is reviewed.** Rejected: the review is precisely the work that
  needs a workstream to hang from, and the framework permits a deliberate lag only as a recorded
  decision with a revisit date, which buys nothing here.
- **Retrofit a workstream per past effort** — the engine, each of the seven games. Rejected as
  workstream sprawl: they are complete, and what is worth keeping about them is already in the
  other two memory layers.
- **Adopt the workstream layer without the compatibility block.** Rejected: the block is what
  turned a one-day-old adoption into a detectable three-version gap.

**Consequences**
- Design and implementation sessions now start by reading `docs/workstreams/ACTIVE.md`, and
  checkpoint workstream state at meaningful moments.
- Handoffs on significant PRs carry `Framework:` and `Workstream:` fields.
- Unratified implementer rulings now have a home that is not `DECISIONS.md` — see `WS-001`'s open
  decisions D1–D4, which under the old setup would have had nowhere to go but a merged PR body.
- The adopted version is a pin that must be checked, not tracked. The next agent doing
  substantial work compares `AGENTS.md` against canonical `VERSION.md` and records the result,
  whether or not anything changed.


---

### DEC-013 — A Subway contract is its ordered segment recipe, and every contract owns a permanent line color

**Date:** 2026-08-24
**Status:** Accepted

**Context**
Subway v0.3 let a line go anywhere: any segment length, any turn, and routes drawn in the owning
company's color. The owner's first playtest of merged v0.3 found the consequence — routes looked
like scribbles rather than engineered alignments, every line a company owned looked the same, and
nothing about a placement was a decision beyond "is this hole free". WS-002's Build Card resolved
this with two owner decisions: every contract carries an exact ordered list of segment lengths that
must be built in order, and every contract carries a permanent, globally distinct line color.

The contract table already carried a `nodes` count that the schedule, completion check, progress
bar, and tests all read. A recipe makes that count derivable, and two sources for one number drift.

**Decision**
`LineContract.recipe: number[]` is the authoritative shape of a contract. Node count, construction
actions, Gantt block length, completion, UI progress, and tests all derive from it; the standalone
`nodes` field is gone. Each contract also carries a permanent `color`, a one-letter `code`, and a
dash pattern, used everywhere that line appears — string, pegs, station dock, Gantt bar, contract
card, Survey Pin, active-line banner. Company ownership moves to the peg's outer ring, badges, and
labels.

Segment length is physical Euclidean peg distance within ±0.5 of the required whole number, and a
line may turn at most 90° between consecutive segments. A station connection is a specific **dock**
the player names; the dock's offset position inside the station tile is the position used for both
drawing the route and measuring length and angle.

**Rationale**
Making the recipe the single source of truth is what stops a "7 nodes / 6 segments" contract from
ever being inconsistent with itself, and it is the reason the schedule model survived the change
untouched: recipe length equals the old action count for all six contracts, so the 16-period
calendar did not move.

Line color rather than company color is what makes a three-contract portfolio legible as three
projects. It costs the at-a-glance read of *whose* line a string is, which is why the code letter,
the dash pattern, the peg ring, and the panel badges all carry ownership instead — and why color is
never the only cue anywhere.

Docks participate in geometry because they must: if a dock renders 0.16 pegs off-centre but distance
is measured to the hole, the drawn route and the validated route are different objects, and a player
reasoning from the picture would be reasoning from a lie.

**Alternatives considered**
- **Keep `nodes` alongside `recipe`.** Rejected: two numbers, one truth, guaranteed drift.
- **Segment length as Chebyshev or Manhattan distance.** Rejected: neither matches what a player
  measures with their eye on a pegboard, and diagonals become either free or impossible.
- **Snap a station connection to the first open dock.** Rejected by OD-6: it makes a dock race
  invisible, and it silently relocates the endpoint a player chose their approach angle for.
- **Measure occupancy, spacing, and crossings from dock positions too.** Rejected as a scoped
  interpretation of R-2: those rules are about pegboard holes, and moving them onto fractional dock
  coordinates would newly make two lines docking *different* slots of one station cross each other
  near the tile — an owner-visible rule change nobody asked for.

**Consequences**
- Adding or rebalancing a contract means editing one array; nothing else needs to agree with it.
- A recipe must be provably buildable on the 27×9 board. The rules harness proves all six are, and
  proves every dock is reachable at every recipe length. A future board or recipe change must keep
  that test passing.
- Lines get boxed in far more often than in v0.3: a required length plus a 90° cap can leave no legal
  endpoint at all. The existing skip path absorbs it, and the active-line banner says so explicitly,
  but a company that starts three lines close together will strand them. That is a balance question
  for the owner playtest, not a bug.
- `SUBWAY_STATE_VERSION` is 6; v5 rooms restart per `DEC-008`.

---

### DEC-014 — Destinations and Survey Pins are paid commitments made beside the three Engineering cards, not among them

**Date:** 2026-08-24
**Status:** Superseded by DEC-016

**Context**
WS-002 activated two systems Subway had been carrying as future design pins: Destination cards
naming a station, and Survey Pins marking intent on the board. The obvious cheap implementation is
to make both of them Engineering cards — the market already exists, the commit action already
exists, the scorer already walks `committedEngineering`. The owner decided otherwise: exactly three
normal Engineering cards remain the commitment, Destinations sit beside them with their own cap of
two per line, and Survey Pins are bought with money rather than drafted.

**Decision**
Destinations share the face-up Engineering market but land in a separate `destinationHand`, are
assigned to a specific owned line at plan lock, and score +3 VP when that line connects the named
station — complete or not. Survey Pins cost $1M each, 0–5 per company, are charged once at plan
lock, and are then placed publicly on normal holes in alternating order starting with the
odd-period company. A pin scores +1 VP only when its own assigned line reaches its hole.

`ENGINEERING` therefore grows a substep: `PLAN` (one atomic lock of objectives, Destination
assignments, and pin purchase) then `SURVEY` (placing what was bought). Long Segment is deleted and
replaced by Network Link, +3 VP for one completed line connecting two distinct stations.

**Rationale**
Keeping the three-card commitment fixed is what keeps Engineering a real choice: if Destinations
competed for those slots they would just be objectives with a different picture, and the "assign it
to a line" decision — the interesting part — would never happen. Binding a Destination to one line
is also what makes it a *plan* rather than a wish; a card that pays out whichever line happens to
arrive asks nothing of the player.

Pricing pins in money rather than card slots puts them in tension with mobilization and second crew,
which is the only scarce resource Subway has that Engineering did not previously touch. Five pins
is a fifth of a cheap contract — enough to hurt, not enough to be a strategy on its own.

Pins reserve nothing deliberately. A marker that blocked a hole would be a $1M denial tool, and
denial on a 243-hole board with ±0.5 length tolerance is both stronger and duller than intent.

Long Segment had to go rather than be re-tuned: with recipes, segment length is no longer something
a player chooses, so an objective about segment length asks for nothing.

**Alternatives considered**
- **Destinations as ordinary Engineering cards.** Rejected by OD-11; see above.
- **Destinations scoring only on a completed line.** Rejected by OD-12: it would make an early
  Destination worthless the moment its line got shelved, and shelving is already penalised.
- **Survey Pins drafted from a market instead of bought.** Rejected: it puts them back in
  competition with objectives and removes the money tension that is their point.
- **Pins reserving their hole.** Rejected by OD-14.
- **Re-tuning Long Segment to a longer reach.** Rejected: ordered recipes remove the player choice
  the card was about.

**Consequences**
- Engineering is now two server round-trips, not one, and the phase can end without a Survey step at
  all when both companies buy zero pins. Both paths are covered by the rules harness.
- A player can buy pins they cannot usefully place, and can assign a Destination to a line they
  later shelve. Both are legal, both cost, and both are visible before locking — the plan panel
  shows cost and cash-after, and the private panel shows live status all game.
- Destination assignments are hidden from the opponent by the view only, exactly like committed
  Engineering cards, and inherit invariant 11's limitation. This is disclosed, not solved.
- The Engineering market deck now interleaves objectives and Destinations so both kinds are
  realistically draftable in the handful of passes a game contains.

---

### DEC-015 — Undo in Subway is one physical placement deep, implemented as a single pre-placement snapshot

**Date:** 2026-08-24
**Status:** Accepted

**Context**
The v0.3 playtest lost pegs to mis-taps, most painfully on a phone, where a stray tap costs a
scheduled action that never comes back. OD-15 permits undoing exactly the latest starter, Survey
Pin, or construction placement, only by its actor, and only until any later accepted action. Nothing
else — no purchase, card play, commitment, schedule edit, lock, skip, or scoring — is undoable.

Restoring a construction node exactly is not a matter of popping the route. A build can consume a
Crossing Design permit, complete a line, end a turn, advance the period, prune queued actions on
other lines, and end the Construction phase, all in one action.

**Decision**
`SubwayState.undo` holds one `UndoRecord`: the actor, a label, and a complete snapshot of the state
as it was immediately before the placement. The snapshot never carries an undo record of its own, so
the structure is exactly one level deep and bounded. `UNDO_PLACEMENT` restores the snapshot wholesale.

Expiry is structural rather than checked: the reducer clones the incoming state and clears `undo` on
the clone before dispatching, so every path that *accepts* an action returns a state with the window
already consumed, and every path that *rejects* one returns the untouched original with the window
intact. Only the undo branch itself reads the record.

**Rationale**
An inverse operation per action type is the version of this that looks tidy and is wrong: each new
side effect is a new thing to remember to reverse, and the failure mode is silent state corruption
discovered at scoring. A snapshot is exactly correct by construction, and correctness here is worth
roughly doubling one game's state blob — Subway's is small, bounded by six routes of at most nine
nodes and ten pins.

Deriving expiry from accept/reject rather than testing for it means a rule added later cannot forget
to expire the window. It also gives the two behaviours the spec asks for free: a rejected action
leaves the window standing, and a placement that advanced a phase stays undoable across that
boundary because the snapshot predates the advance.

**Alternatives considered**
- **Per-action inverse operations.** Rejected: correct only until the next side effect is added.
- **A general undo/history stack.** Rejected by the Build Card's non-goals and by unbounded room
  state; the spec names it as a stop condition.
- **Requiring opponent consent.** Rejected as a non-goal; it also cannot work under polling without
  a request/response mechanic the engine does not have.
- **Keeping the window open across the opponent's turn.** Rejected by OD-15: undoing a placement the
  opposition has already built against would rewrite their decision too.

**Consequences**
- Subway's persisted state roughly doubles in the worst case. It stays JSON-serialisable and
  bounded, and `structuredClone` in the reducer copies the snapshot with it.
- Any future Subway action must go through the same clone-and-clear path, or it will leave a stale
  undo window standing. The rules harness asserts the accept/reject behaviour directly.
- Derived status — objective completion, Destination fulfilment, Survey fulfilment — reverts with an
  undo automatically, because none of it is stored.

---

### DEC-016 — Destinations remain line-bound; Survey Pins become company-wide commitments

**Date:** 2026-08-25
**Status:** Superseded by DEC-019 · **Supersedes:** DEC-014

**Context**
DEC-014 deliberately separated Destinations and paid Survey Pins from the three normal Engineering
commitments, but bound both kinds of planning marker to a particular line. The next owner playtest
found that a Survey Pin's line assignment adds fragility without creating a useful choice: a player
has already paid for and publicly placed the exact point, and still has to route one of their lines
through it. Which owned line eventually reaches that point does not need to be predicted during
Engineering.

**Decision**
Retain DEC-014's Engineering structure and economics: Destinations share the market but remain
separate from the three normal commitments, stay assigned to one line with a maximum of two per
line, and score +3 VP when that line reaches the named station. Survey Pins still cost $1M each,
remain capped at five, are charged at plan lock, and are publicly placed in alternating order during
the SURVEY substep. They reserve nothing and score +1 VP.

Remove only the Survey-to-line binding. A Survey Pin belongs to its buying company and scores once
when any line owned by that company places a normal route node on its exact hole. An opponent's line
never fulfils it. Network Link continues to replace Long Segment exactly as DEC-014 specified.

**Rationale**
The public coordinate and purchase cost already express a commitment. Making the player also guess
which line will fulfil it compounds the risk of ordered recipes, the 90° turn cap, and station
competition without adding another meaningful decision at placement time. Company-wide fulfilment
keeps the marker useful as network planning while retaining every financial and spatial constraint.

Destinations stay line-bound because their central decision is different: assigning a named station
to a specific contract creates a route objective. Making them company-wide would turn that plan back
into a general wish.

**Alternatives considered**
- **Keep line-assigned Surveys.** Rejected after playtest: the assignment can invalidate a paid marker
  even when another owned line uses the exact planned point.
- **Allow either company to fulfil a pin.** Rejected: that would award the buyer for an opponent's
  construction and disconnect the point from the buyer's network.
- **Make Destinations company-wide too.** Rejected: line assignment is the meaningful planning choice
  for a named station card.

**Consequences**
- Survey Pin persisted state no longer needs `lineIndex`, so Subway's state version must bump and old
  rooms restart per DEC-008.
- Survey rendering uses company identity rather than line identity.
- A single pin still scores at most once even if several owned lines could satisfy it.
- Existing purchase, stacking, turn-order, non-reservation, Undo, and +1 VP rules do not change.

---

### DEC-017 — Opposing Subway pegs are paid shared infrastructure, with construction-only debt

**Date:** 2026-08-25
**Status:** Superseded by DEC-018

**Context**
Ordered segment recipes and the 90° turn limit made the one-empty-hole exclusion around opposing
pegs much stronger than it was under freeform routes. In the owner playtest it could eliminate every
legal move. Simply removing all occupation rules would erase competition; keeping exclusive pegs
would leave exact holes as absolute blockers. Charging for shared access preserves obstruction as an
economic decision.

All current costs are paid before Construction. A player who reaches the board with no cash could
therefore be unable to buy the newly introduced access even when it is the only useful route. The
owner chose to allow Construction debt, paired with a large VP consequence rather than a hard stop.

**Decision**
Opposing normal pegs no longer project a one-hole spacing exclusion. During Construction, a line may
use an opponent's exact normal peg as its next node for an immediate $1M transfer to that peg's
owner. The acting line owns its route node independently; payment does not transfer the original
node or create joint route ownership. Sharing is unavailable for starters, station docks, or another
line owned by the acting player, and every other route/string rule remains.

This $1M Construction payment may take cash below $0. No earlier phase may overspend. Final debt is
the amount ending cash is below zero and scores -2 VP per $1M; later access payments received reduce
that ending debt. The existing placement Undo reverses the node and transfer together.

**Rationale**
A $1M toll is material but smaller than any contract or crew commitment. It turns a blocker into
negotiated infrastructure without asking the opponent for a synchronous decision in a polling game.
Removing only adjacency gives routes room to coexist; pricing the exact occupied hole preserves the
value of getting there first.

At -2 VP per $1M, borrowing $3M costs 6 VP, approximately the completion value of a medium contract.
Debt can rescue a route, but routine borrowing is not free money. Using ending rather than cumulative
debt keeps payments received meaningful and makes the rule readable from the final balance.

**Alternatives considered**
- **Keep the spacing rule.** Rejected by playtest because constrained recipes can leave no legal
  placement at all.
- **Remove spacing but keep every peg exclusive.** Rejected: exact holes remain absolute blockers and
  the proposed player-to-player payment never occurs.
- **Require available cash.** Rejected: a $0 company could lose access to the relief rule precisely
  when it needs it.
- **Allow debt in every phase.** Rejected: it would undo Procurement, Survey, and Scheduling budget
  constraints rather than solve Construction access.
- **Track cumulative borrowing or charge interest.** Rejected as unnecessary accounting for a short
  prototype game.

**Consequences**
- Normal route coordinates may now appear in two opposing route arrays and need an accessible shared
  rendering while remaining independently scored.
- Placement, payment, and both balances are one reducer transition so optimistic retries cannot
  separate them.
- Shared endpoints do not consume Crossing Design, but overlapping strings, pass-through, self-
  crossing, exact station docks, recipes, and turn rules still apply.
- Negative cash becomes a valid Construction/Results state and remains the last existing tiebreak
  after its VP penalty is applied.
- The $1M toll and -2 VP rate are approved starting values, not final balance certification.

---

### DEC-018 — Normal Subway routes may interact freely; opposing contacts are paid

**Date:** 2026-08-27
**Status:** Accepted · **Supersedes:** DEC-017

**Context**
DEC-017 removed the opposing-node spacing rule and priced reuse of an opponent's exact peg, while
preserving every other string and occupancy prohibition. The following playtest showed that those
remaining prohibitions still make ordered recipes fail for reasons that are hard to plan around:
players cannot land on strings, pass through pegs, cross their own network, or cross an opponent
without first committing a permission card. A relief rule aimed at one peg did not solve the larger
crowded-board problem.

**Decision**
Keep only the spatial constraints that define the route puzzle: board bounds, the next ordered
segment length, a maximum 90° turn, exact station docks and capacity, and no exact collinear
string-over-string overlap. Normal route nodes may otherwise occupy existing normal nodes or string
interiors; strings may cross routes and pass through normal nodes; adjacency is unrestricted. These
permissions apply to the acting company's own routes and the opponent's routes.

Own-route interactions are free. During Construction, every distinct contact with the opposing
normal network costs $1M, transferred atomically to the opponent. A contact is a proper string
crossing, an endpoint on a string interior, or an opposing normal peg touched by the new segment or
endpoint. Count a geometric event once: landing on an opposing peg is one contact rather than one
charge for every incident string. Exact overlapping strings remain illegal because their contact
count is not finite or legible.

Crossing Design stops being permission and becomes an ordinary +2 VP objective for making at least
one proper opposing-string crossing. Crossings are unlimited. DEC-017's Construction-only debt,
-2 VP per $1M ending debt, later-receipt reduction, and full one-placement Undo remain in force for
the summed multi-contact payment.

**Rationale**
The competitive value of existing infrastructure comes from its price, not from silently deleting
legal endpoints. A per-contact toll scales with how heavily a player leans on the opposing network
and keeps an opponent's placement economically relevant without requiring a synchronous permission
decision. Free self-interaction lets a company build a network rather than treating its earlier
lines as accidental walls.

The short list of retained constraints is visible and planable: recipe, angle, board, station, and
exact overlap. Removing a Crossing permit also ensures a basic board action is never dependent on a
random card draw; the card still rewards the intended achievement.

**Alternatives considered**
- **Extend only exact-peg sharing.** Rejected after playtest because strings and self-routes still
  create hard, non-economic blockers.
- **One flat toll per placement.** Rejected because crossing one feature and exploiting several
  opposing features should not cost the same.
- **Charge own interactions too.** Rejected because no player receives that transfer and it would
  punish network connectivity without creating competition.
- **Allow exact overlapping strings.** Rejected because there is no clear finite contact count and
  coincident routes are difficult to read and select.
- **Delete Crossing Design.** Rejected because crossing remains a meaningful +2 VP achievement once
  separated from permission.

**Consequences**
- Geometry code needs one explicit contact enumerator shared by preview, reducer, scoring, and tests.
- A placement may transfer several million and create debt in one reducer transition; Undo must
  restore every route and balance effect.
- Route rendering must distinguish coincident nodes and visible crossings accessibly, while company
  identity remains separate from permanent line color.
- Proper crossings for Crossing Design exclude endpoint touches and contacts at existing pegs.
- The $1M/contact toll and -2 VP debt rate remain approved starting values for further playtest.

---

### DEC-019 — Destinations use a dedicated Engineering draft; Surveys remain company-wide

**Date:** 2026-08-27
**Status:** Accepted · **Supersedes:** DEC-016

**Context**
DEC-016 preserved Destinations in the mixed Engineering market reached through Procurement. In
practice, players could complete Procurement without seeing a Destination, so a designed planning
system was absent from the playtest. The owner wants Destinations to be an additional Engineering
choice, not a substitute for the three committed objectives or an occasional reward for passing on
a contract.

**Decision**
Remove Destinations from the Procurement Engineering market. At the start of Engineering, reveal
three Destination cards and let players alternate free picks, starting with the company that owns
odd-period priority and refilling the row while possible, until each player has exactly two.

Destinations remain separate from the three normal Engineering commitments. Every Destination is
assigned to one owned line during Engineering, with a maximum of two assigned to a line, and scores
+3 VP if that line reaches the named station whether or not it completes. Assignments remain hidden
from the opponent until scoring and visible with live status to their owner.

Retain DEC-016's Survey rule unchanged: each company may buy 0–5 Pins for $1M each and place them
publicly during Engineering; they are company-wide, stackable, and non-reserving, and each scores
+1 VP once when any owned line places a normal node at its exact hole.

**Rationale**
Exactly two cards guarantees the Destination system matters in every game while line assignment
still creates the intended route commitment. A three-card row gives a real choice at each pick;
alternation and existing priority avoid a new bidding or random-first-player subsystem. Keeping the
cards outside the three-objective cap preserves them as a separate planning layer rather than making
them ordinary objectives with station names.

**Alternatives considered**
- **Leave Destinations in Procurement.** Rejected by playtest because neither player is guaranteed
  to see one.
- **Draft two or three at player choice.** Rejected in favor of exactly two each, which is easier to
  balance, teach, and validate while meeting the owner's “at least two” goal.
- **Make Destinations company-wide like Surveys.** Rejected because assigning a named station to a
  particular contract is the Destination's meaningful planning choice.
- **Count Destinations among the three objective commitments.** Rejected by the owner in WS-002 and
  retained here.

**Consequences**
- Engineering gains a `DESTINATION_DRAFT` substep before planning and Survey placement.
- The Destination row, turn, deck, hands, assignments, view redaction, and state version require
  explicit reducer/test coverage.
- Six station cards produce four drafted cards and two unused cards each game.
- Procurement's Engineering market becomes normal objective cards only.

---

### DEC-020 — Adopt Build OS v0.5 and put significant PRs behind a reviewed-head merge gate

**Date:** 2026-08-27

**Status:** Accepted

**Context**
Party Games adopted Build OS v0.4 on 2026-08-23 (`DEC-012`). Canonical reached v0.5 on 2026-08-24,
one minor version ahead. WS-003's design package was written under v0.5 and declared itself blocked:
the v0.4 → v0.5 migration notes require an adopting project either to adopt or to record an explicit
deferral, and neither had happened, so the workstream could not legitimately start `BUILDING`.

The gap was not academic. In the three weeks before it, this project merged two significant Subway
PRs — #141, the whole WS-002 implementation, and #142 — with no independent review recorded against
either, and #143 merged a design packet whose review row still reads `Not started`. Every one of
those was written and merged through the same account. v0.5 exists because that pattern is the
normal failure, not an unusual one.

**Decision**
Adopt v0.5. Four protocol behaviors move into `AGENTS.md` and the Design Room's ChatGPT Project
instructions:

- **Capture Only** — a named mode for playtest notes and feedback dumps in which the design agent
  records and does nothing else, ended by a consolidation that keeps observations, interpretations,
  proposed rules, and approved decisions separate.
- **The Design Handoff PR** — a design agent may open the draft implementation PR itself once the
  card is approved and the spec issued; that is the single PR for the implementation, and opening
  it does not start `BUILDING`.
- **The reviewed-head merge gate** — a significant PR does not merge until an independent verdict
  approves its current head, named as a full 40-character SHA, with no Blocking or Should-fix
  finding outstanding. The agent that wrote the code may neither approve nor merge it.
- **Merge finalization** — the last commit before merge is documentation only, setting the
  workstream, `ACTIVE.md`, and `Review State` to what becomes true when the PR lands.

Local template copies are refreshed from canonical, and `REVIEW_SUMMARY.template.md` is added
because the project now records verdicts. Migrated history is not reopened: #141, #142, and #143
merged under v0.4 and stay merged, and their review rows keep saying what actually happened.
Active workstreams gain the `**Build OS:** v0.5` header and review fields at their next review
checkpoint rather than in a bulk edit, so nothing records a review that never took place.

**Rationale**
The alternative on offer was a recorded deferral, which the migration notes explicitly permit. It
was rejected because there is no cost to adopting: v0.5 is enforceable by people reading and writing
Markdown, and needs no CI, branch protection, or GitHub App this project does not have. Deferring
would have meant recording that we knew about the gate and chose to keep merging significant
gameplay changes without one — while WS-003, the largest Subway change yet specified, was queued
behind it.

The gate is worth its friction here specifically because this is a single-account repository where
the same actor designs, implements, and merges. That is the case v0.5's comment-verdict provision
is written for, and it is the case where an unreviewed merge is likeliest.

**Alternatives considered**
- **Record a deferral and implement WS-003 under v0.4.** Rejected: adopting costs a documentation
  pass, and the deferral would have to name a revisit trigger that was already satisfied.
- **Adopt only the merge gate.** Rejected as partial adoption that leaves the project claiming a
  version it does not follow; the migration notes are read as a unit.
- **Retrofit review fields onto WS-001 and WS-002.** Rejected by the migration notes and on the
  merits — backfilling a `Reviewed head` for a review nobody performed is exactly the dishonesty
  the field exists to prevent.
- **Fold the adoption into the WS-003 implementation PR.** Rejected: a framework migration inside a
  large gameplay diff is hard to review, and the approved WS-003 spec calls for a separate adoption.

**Consequences**
- WS-003 is unblocked and may proceed to `BUILDING` once this lands.
- Significant PRs now need an independent verdict naming their current head before merge, and this
  session's own implementation work cannot self-approve. Where GitHub refuses a same-account review,
  the verdict is a PR comment naming both the review actor and the implementation actor reviewed.
- Every significant PR gains a documentation-only finalization commit before merge.
- `AGENTS.md`'s `Project-specific:` rules are untouched; the v0.5 behaviors are merged alongside
  them, not over them.

---

### DEC-021 — Subway's primary view is a board-centred tabletop console with public narration

**Date:** 2026-08-29

**Status:** Accepted

**Context**
Subway's merged WS-003 board works, but its information architecture still reads like a web form:
the pegboard, programme, phase controls, cards, and company state appear in a long vertical page.
During playtest, both players watched the board and missed period changes, opponent placements, card
plays, and state changes reported elsewhere. Finding one's own hand or schedule meant scrolling away
from the shared object everyone was discussing.

The physical concept has a clearer hierarchy: one central pegboard, a public programme and game log,
and a player area containing cards, contracts, money, and controls. The digital version should use
that tabletop grammar while retaining responsive access on a phone.

**Decision**
Make the Metropolitan Pegboard Subway's dominant central surface at its current effective size.
Arrange the revealed programme, public opponent mat, private player mat/cards, phase-valid actions,
minimap, and public event history around it on desktop. On phone, keep the board and action strip in
view and move the supporting mats into compact bottom sheets/tabs rather than a single long page.

Add a bounded structured public event stream to Subway state. Accepted phase, period, turn, public
card, placement, route, Undo, and scoring changes create privacy-safe events. The UI presents major
transitions as brief pegboard banners, player actions as shorter notices, and retains the latest 20
events in a public history. Routine polls and rejected actions create and replay nothing. Events
never name hidden objectives, private Destination assignments, unrevealed schedules, or saved plans.

The owning player sees organized card faces and private status. Opponents see only public state and
card backs/counts until current rules reveal a card. Hotseat uses an explicit player-handoff veil.
This is presentation privacy only: the entire room state still reaches every client under invariant
11, and this decision does not claim server-side secrecy.

**Rationale**
The board is the game's shared attention surface, so transitions belong there. A structured event
sequence is more reliable than watching a mutable `message` string: it provides deduplication under
one-second polling, ordering when several state changes occur, an accessible history after animation,
and a single privacy review point. Tiering events prevents the solution from becoming a new source of
visual noise.

Keeping the board dominant preserves the toy-like pegboard identity. Desktop mats mirror the
physical table; mobile sheets acknowledge that a 3:1 board and four card families cannot remain
simultaneously readable at 390 pixels without either zoom or layering.

**Alternatives considered**
- **Reorder the existing vertical panels.** Rejected because it changes sequence but preserves the
  scrolling and divided attention that caused the problem.
- **Use only transient toasts derived from `message`.** Rejected because polls can replay them,
  simultaneous facts collapse into one string, and disappeared information has no history.
- **Put the entire tabletop on one infinitely zoomable canvas.** Rejected because cards, controls,
  text accessibility, and responsive input are better served by ordinary React layout around the
  already zoomable SVG board.
- **Add server-side private views now.** Rejected as a separate engine-wide architecture change; the
  owner asked for correct public/private presentation, and the current limitation remains disclosed.

**Consequences**
- Subway state version bumps because it gains a bounded event sequence.
- Accepted reducer paths need consistent event creation and privacy tests.
- `GameView.tsx` needs a real component/layout refactor rather than incremental panel shuffling.
- Hotseat must hide private mats during player transition.
- Event overlays must support dismissal, reduced motion, and an `aria-live` equivalent.

---

### DEC-022 — Phantom route plans are private client-local aids; placement commits through Confirm

**Date:** 2026-08-29

**Status:** Accepted

**Context**
The existing Route Planner is client-only but temporary: it is available only in Engineering and
Scheduling, and its ghost disappears when Construction begins. That removes the plan precisely when
the player needs to compare intended and actual construction. The live placement interaction also
commits when the player taps the selected target a second time, which makes changing one's mind look
like an Undo problem even though no reducer action has happened yet.

The same playtest found that every green starter target remains visually prominent after selection,
covering the following-step preview, and that interior starter positions do not match the intended
edge-entry rule of the tabletop.

**Decision**
Keep Plan Mode available through Starter Placement and Construction. Store one saved phantom route
per room/player/owned line in versioned browser local storage. It is private to the supported UI,
non-binding, never sent to shared room state, and never reserves, prices, scores, or authorizes a
hole. It survives refresh on that browser, marks itself stale when real construction diverges or
invalidates it, and remains editable/clearable by its owner.

Change starter and Construction placement to explicit select/reposition/Confirm. Tapping any legal
target creates or moves a provisional `NOW` marker and recomputes `NEXT` endpoints; only a separate
Confirm control dispatches the reducer action. Confirm consumes exactly one scheduled or bonus
action and lets the existing queue decide what follows. Post-confirm Undo remains DEC-015's one
physical placement snapshot.

All starters must be non-station holes on the 27×9 board's outer border. During starter preview,
unselected current targets are visually subordinate; `NEXT` wins over an overlapping current target,
and the selected `NOW` marker renders on top. Number, ring style, and colour all distinguish states.

**Rationale**
A private local plan matches its meaning: a pencil sketch belonging to one player, not game state.
Putting it in the room would expose intent, invite synchronization conflicts, and make a non-binding
aid look like a reservation. Local storage gives same-device continuity without changing reducer
fairness; the disclosed cost is that plans do not follow a player to another device.

Explicit Confirm cleanly separates exploration from commitment. It removes accidental second-tap
builds, makes target changes obvious, and leaves Undo for its intended job—reversing an action the
server actually accepted. Border-only starters strengthen the map's outside-in network shape and
reduce the sea of starter targets that caused the marker-layering bug.

**Alternatives considered**
- **Keep plans only in React memory.** Rejected because phase changes and refresh erase the plan.
- **Persist plans in Subway room state.** Rejected because the opponent receives the entire state and
  a private sketch has no reducer authority.
- **Keep second-tap confirmation and add a tooltip.** Rejected by playtest; the interaction itself,
  not merely its explanation, is the problem.
- **Auto-confirm after a short delay.** Rejected because it still turns inspection into commitment
  and is fragile under touch/poll timing.
- **Allow interior starters but visually recommend the border.** Rejected because the owner made the
  border an actual rule; reducer legality must match.

**Consequences**
- Planner storage needs versioned keys, defensive parsing, per-player isolation, and a fallback when
  storage is unavailable.
- Construction mode gains an explicit planner/place toggle and a sticky Confirm/Cancel action strip.
- Tests must preserve Overtime/Surge queue semantics: one Confirm is one action even if the same
  player has another pending action.
- Starter target generation and reducer validation both become border-only.
- The all-green starter failure becomes a render-precedence regression test.

---

### DEC-023 — Subway renders as one continuous zoomable tabletop, not a page of panels around a board

**Date:** 2026-08-30

**Status:** Accepted

**Context**
DEC-021 asked for a "board-centred tabletop console" and WS-004 shipped it as the pegboard plus
mats, a Gantt panel, an event rail, and phone bottom sheets — all laid out in normal page flow with
their own scroll regions, and only the pegboard itself pan/zoomable. The owner reviewed the merged
result on 2026-08-30 and clarified that this reads as "more UI cards and panels around the existing
webpage", which is not the intended design. The intended reference is the physical game seen from
directly above: one table, with the schedule board at the far edge, the pegboard in the middle, and
the acting player's own boards and cards on the near edge.

That distinction is presentational, not mechanical. Every rule, phase, cost, and privacy boundary
from WS-001–WS-004 stays exactly as the reducer defines it.

**Decision**
Subway's primary interface is a single pan-and-zoom coordinate space — one camera over one world —
that contains every component of the game as a physical-looking piece:

- the public construction schedule board at the top of the world;
- the metropolitan pegboard in the middle, dominant, at roughly its previous rendered size and never
  shrunk to make room for side panels;
- the acting player's private tabletop along the bottom: line-contract boards, committed cards,
  hands, budget, survey-pin supply, and the action controls;
- the opponent's public edge above the schedule, carrying public information and card backs only.

The camera pans and zooms as one unit. Zooming in far enough to read a card is the way cards are
read; a focused card also opens a readable focused state with its playable action attached. Screen
level keeps only a thin HUD: status, camera controls (zoom, Reset view, Focus schedule/pegboard/
hand/lines), narration, and the Confirm/Cancel action strip. There are no nested scroll regions
inside the tabletop, and no second, parallel dashboard interface anywhere.

Committed Engineering and Destination cards are shown attached to the line they are assigned to,
not in one undifferentiated row. Line-contract boards carry the line's own permanent colour, which
is never tied to a player/company colour.

Camera state is client-local and survives polling: a room refetch never resets zoom, pan, focused
card, provisional placement, or a saved plan.

**Rationale**
The tabletop metaphor was the point of WS-004, and a metaphor delivered as adjacent panels is not
delivered. Making the whole table one coordinate space is what produces the "seen from above"
reading: spatial memory replaces navigation, the board keeps its size at every zoom level, and the
same gesture that inspects the board inspects a card. It also removes the layout problem that forced
the phone into sheets and tabs — a phone gets the same table and simply starts zoomed differently.

Keeping the reducer untouched keeps this reversible in the only way that matters: if the presentation
ever conflicts with a rule, the rule wins and the conflict is surfaced rather than quietly resolved
in the view layer.

**Alternatives considered**
- **Keep the merged panel layout and enlarge the board.** Rejected by the owner: the arrangement,
  not the board size, is what makes it read as a web dashboard.
- **Zoomable board plus conventional panels (the merged v1).** Rejected: two interaction models on
  one screen, and the components that most need to feel physical — cards and contract boards — stay
  outside the tabletop.
- **A separate "tabletop mode" alongside the existing dashboard.** Rejected explicitly: a second
  parallel interface doubles the surface to maintain and leaves the wrong one as the default.
- **Drag-and-drop cards onto lines.** Rejected as the *only* interaction; a pointer-drag-only table
  is unusable by keyboard and fragile on touch. Selection plus an explicit action stays the
  contract, with drag available at most as an addition.

**Consequences**
- `GameView` becomes a camera plus world composition; the pegboard SVG loses its private pan/zoom
  and is positioned by the world camera like every other piece.
- Board hit-testing goes through the shared camera transform, so every tap path (and the playtest
  driver) must read the camera, not the SVG's own transform.
- Phone support becomes camera work — quick-focus controls and a screen-level action strip — rather
  than a separate small-screen layout.
- Privacy stays a rendering convention under invariant 11: opponent card faces and private
  assignments are never put into this client's DOM, and that limit is documented rather than
  overstated.
- Any future component must be placed in world coordinates to exist on the table at all.

---

### DEC-024 — Subway supports 2–4 companies with equal portfolios and a broader city

**Date:** 2026-09-06

**Status:** Accepted within the owner's delegated WS-005 implementation scope; pending PR review.

**Context**
The owner requested a more finished light-strategy game, explicitly delegated rules,
content, balance and visuals, and requested all changes on a branch. This authorizes
resolving WS-004's pending card-expansion and objective-scope questions in this build.
The two-seat implementation paid every toll to the first opponent and used two-seat
tiebreaks for drafts/placements. Its default schedule shelved work rather than fitting it.

**Decision**
Support 2–4 companies with three routes each, sampled from twelve. Each seat gets the
same pass-and-draft decision. Entire-table refusal precedes a discount; forced sales
bound procurement. The first offer starts from the randomized opening priority seat.
All seat rotations include every company; any two active schedules are contested.
Priority Permits cannot overwrite a previously claimed period.

Keep Engineering objectives company-wide for lower planning overhead. Add four goals,
four station Destinations, two Scheduling cards and two Construction cards. Keep the
existing geometry, toll rate and explicit placement Confirm. Pay each contacted owner
once per geometric contact, with city-paid Access Pass transfers and a $3M City Grant.
Start with $40M and suggest the cheapest schedule that includes every purchased route.
The Orbital route costs $8M and rewards 6 VP; this makes all 220 possible three-route
portfolios affordable at list price without using a grant or leaving a route unscheduled.

Keep the single tabletop, with every opponent visible and a lighter printed transit
map. Add a local hotseat entry that reuses the same reducer and view, persists a versioned
game on this browser and requires confirmation before replacing it. Existing network
rooms still use server-side reducer authority and Turso. Local play has no server and
is deliberately device-bound; it is not a second set of rules or UI.

**Rationale**
Equal portfolios cap workload per player as groups grow. Cash relief and schedule
suggestions remove bookkeeping traps while preserving the race for stations and
route-planning decisions. New cards have distinct, small effects. Automated games
measure termination and obvious tendencies; human enjoyment and strategy balance
are not inferred from the heuristic's win rates.

**Consequences**
State version 9 requires older rooms to restart. Contact records carry owner IDs.
Local storage may fail; a visible warning then tells players to keep the tab open.
The visual lab uses legal reducer actions and real iframe viewports without touching
live rooms. Build OS v0.11 is adopted in reviewed mode; no historical reviews or
acceptances are invented. This branch must receive independent review before merge.

---

### DEC-025 — Subway routes use named services and a shuffled, spaced station layout

**Date:** 2026-09-07
**Status:** Accepted within the owner's delegated WS-005 implementation scope; pending PR review.

**Context**
The owner rejected generic route names and the narrow 3–5 peg recipe range. They
requested a hard maximum of seven segments, 2–6 peg segment variation, four premium
route specials, three Major Station connections, and station locations that vary
between games without clustering every Destination.

**Decision**
Rename the original generic services as Market Shuttle, Garden Spur, Museum
Connector, Grand Central Express, and Harbor Line. Every route uses four to seven
segments whose printed lengths are 2–6 pegs. Four premium services score a visible
completion special: Grand Central Express, Crosstown, Orbital, and Airport Express.

At game start, assign the ten named stations to ten of fourteen predefined separated
sites using reducer-provided randomness. Station identity, type and Destination card
stay the same; only its map position changes. Major Stations have three docks and
Minor Stations have two.

**Rationale**
The new names make contracts feel like city services rather than difficulty labels.
Broader recipes create more readable route personalities while preserving the
existing 16-period schedule model. A bounded site set makes the board replayable
without allowing pathological station clumps or introducing freeform placement
complexity.

**Alternatives considered**
- **Fixed station positions.** Rejected by the owner because repeated games make
  Destination play too familiar.
- **Unconstrained random coordinates.** Rejected because adjacency and blocked
  geography would make some layouts poor before a player made a decision.

**Consequences**
State version 10 invalidates older rooms and local saves. Reducer tests verify
unique, separated station sites, 3/2 Major/Minor dock capacity, the 2–6 segment
range, seven-segment cap, premium route count, portfolio affordability, and full
2/3/4-player completion simulations. Visual browser verification remains pending.

---

### DEC-026 — Draft routes, then build a six-card hand before plan commitment

**Date:** 2026-09-08
**Status:** Accepted by owner; pending implementation review.

**Context**
The owner approved replacing starting hands and pass-for-card procurement with
staged choices that introduce cards gradually. This supersedes DEC-024's
pass-and-discount procurement behavior, retaining its other gameplay decisions.

**Decision**
Draft three routes each at list price from a player-count-sized replenishing row.
No passing or discounts. Start with no cards, then draft six cards from Engineering,
Scheduling and Construction, with two face-up choices per family and blind draws.
Require at least three distinct Engineering goals; tactical categories are optional.
Draft two Destinations separately, then commit plans and purchase surveys as before.
Alternate draft direction each round and rotate the opening seat between stages.
Provide isolated, replayable practice lessons using the real controls.

**Rationale**
Staging reduces the initial reading burden while preserving meaningful choices.
Goal reservation prevents a six-card hand that cannot legally commit a plan.

**Alternatives considered**
Keep starting hands and pass rewards: rejected by the owner. Require tactical
cards: rejected; choosing none is a player's strategic choice.

**Consequences**
State version 11 requires new games. Category piles contain eight copies per card,
shuffled only through reducer RNG. Blind Engineering draws skip owned goals.
Tutorial practice does not alter real games. Visual testing and independent review
remain outstanding and must not be inferred from passing reducer simulations.

---

### DEC-027 — Flexible goals and escalating per-round crews

**Date:** 2026-09-09
**Status:** Accepted by owner; pending implementation review.

**Context**
The owner approved removing goal commitment and advance route scheduling after
the staged-draft implementation. This supersedes DEC-026's category reservation,
separate Destination draft and commitment flow, and the older schedule/debt rules.

**Decision**
Draft six cards in any mix from two categories: Engineering (14 unique goals plus
ten unique Destinations, one copy of each globally), and Construction (repeatable
cards, eight copies of each of five effects). All held goals score automatically
against qualifying owned routes. Purchase optional survey pins after drafting.
Keep three route picks and alternating draft order.

Build over 16 rounds. Choose zero to three unfinished routes each turn and pay a
total $0/$1/$3/$6M crew bill, then build one segment on each chosen route. Start
with $60M; final debt costs four VP per $1M. No timetable or commitment is required.
Play at most one Construction card per round: Advance Booking ($1 off next round),
Relief Crew (first crew free), Priority Dispatch (opening opportunity to go first),
City Grant (+$3M), or Access Pass (next placement toll subsidy). Priority follows
normal rotating opportunities; after a claim other players retain their cards.
Discounts expire without cash or carryover and cannot make a bill negative.

**Rationale**
Players can adapt their network as space changes. Escalating crew bills make speed
a choice rather than a free advantage; scarce tactical cards compete with points
during drafting. Unique goals prevent repeated achievement payouts, while duplicate
Construction cards provide enough supply for unrestricted four-player drafts.

**Alternatives considered**
Flat $1M per crew: rejected by the owner because simultaneous construction would
have no extra total cost. Unique Construction cards: corrected by the owner;
duplicates are allowed. Retaining commitments and timetables: rejected as too narrow.

**Consequences**
State version 12 requires new games and local saves. $60M is a provisional balance
setting supported by 220 portfolio affordability checks and deterministic
simulations, not a human-balance claim. Shared reducer behavior applies to online
rooms and hotseat; further multiplayer UX work remains deferred. Visual validation
and independent current-head review are still required.

---

### DEC-028 — Construction stops when the board is exhausted and results retain a full playtest ledger

**Date:** 2026-09-09
**Status:** Accepted by owner; pending implementation review.

**Context**
The 16-round horizon could force players through turns where no legal construction
remained. The bounded public narration stream intentionally retained only twenty
privacy-safe events, so it could not support a complete post-game balance review.
The owner also requested clearer visual continuity between route selection and
placement confirmation.

**Decision**
Construction advances immediately to scoring when every incomplete route is
blocked from making a legal next placement; otherwise round 16 remains the hard
limit. During a construction turn, pulse the whole active route and render the
selected next segment translucently until Confirm.

Add a separate finite accepted-action telemetry ledger to Subway state. Each
entry records action order and time, actor, action and payload, phase/round before
and after, and before/after player economy/resource snapshots. Undo keeps the
reverted placement in history and appends an Undo event. Results expose a
copyable structured Markdown report containing final state and the JSON ledger.
Rejected actions are not recorded because reducer rejection must return the
original state unchanged.

**Rationale**
Ending on the last meaningful placement removes dead time without changing the
strategic 16-round pressure. The visual treatment makes the currently edited
route and prospective commitment legible on a dense shared board. A complete,
structured ledger makes AI-assisted playtest diagnosis reproducible; separating
it from public narration preserves the concise in-game logbook.

**Alternatives considered**
Continue empty rounds to 16: rejected by the owner. Expand the public event stream:
rejected because it is deliberately short and privacy-safe. Track rejected client
attempts in reducer state: rejected because that would make invalid actions mutate
authoritative game state and complicate retry semantics.

**Consequences**
State version 13 requires new rooms and local games. Room payloads grow with each
accepted action, but the game has finite drafts, three routes per company, and a
16-round cap. The report contains private card identities and therefore appears
only at Results. Browser verification of pulse, ghost preview, and copy behavior
remains part of PR #157's merge gate.

### DEC-029 — Phone table and temporary lookahead

Date: 2026-09-10. Status: owner-authorized; implementation review pending.

The owner approved a landscape-first phone table with a dismissible portrait prompt, readable cards, Settings-only log, direct ordinary drafting/card play, and explicit real peg confirmation. Mobile pieces occupy a screen-sized tray independent of map zoom. Temporary planning supersedes the save-plan interaction: start from the real endpoint or selected pending peg; Confirm commits that real peg only. Sketches spend/reserve nothing and clear on authoritative route or turn changes. Existing stored plans are left untouched but not loaded. Desktop retains its tabletop camera.

Consequence: separate responsive presentation shares the same reducer and placement logic; both surfaces require browser verification.

### DEC-030 — Restore the full touch tabletop

Date: 2026-09-10. Status: owner-authorized; implementation review pending.

Owner screenshots and feedback supersede DEC-029's fixed mobile tray. All devices use the full tabletop camera; cards and board pan and zoom together inside the game viewport. The outer page keeps normal browser accessibility zoom. Existing illustrated goal/destination faces appear in the draft market and hand; Construction uses a printed depot motif. Compact Confirm and camera controls remain overlays. Touch gestures may begin on table pieces without activating them after a drag. Ghost planning remains temporary and unchanged.

Consequence: one presentation path replaces the separate phone layout. Real iPhone pinch/pan and portrait/landscape acceptance remain required; desktop automation alone is insufficient evidence.

### DEC-031 — Interior surveys and a retrospective construction schedule

Date: 2026-09-10. Status: owner-authorized; implementation review pending.

All outer-border holes are starter areas and reject new Survey Pins. Existing saved pins are preserved. The owner requested an interactive Construction schedule: it records actual round order and builds, rather than reintroducing advance scheduling. The public projection includes undone builds but excludes hidden card identities. Opponent details default closed; board routes remain visible. Phone drag gets a short decelerating glide and scoped selection/callout suppression, respecting reduced motion.

### DEC-032 — Active-line planning opens automatically and saved ghosts return

Date: 2026-09-10. Status: owner-authorized; implementation review pending.

The owner supersedes DEC-029's temporary-only planning choice. Starter and build turns open with planning enabled for the active line, without a line picker. The first unbuilt node is a solid pending real placement; subsequent nodes are pale dashed construction guides. Only Confirm commits the single pending placement. Explicit Plan opens cross-line planning with a picker and no automatic build target. Save ghost stores the full intended route privately per game, player and contract on this browser; loading reconciles it against real construction. A stale saved plan remains visible and labeled but never automatically supplies a build target. Clear saved removes only that plan and reports storage failure honestly. Unsaved edits remain temporary. This restores DEC-022's storage semantics without changing reducer state or rules.

Engineering goals and Destinations share a 24-panel vintage transit illustration atlas matching Construction. Names, exact requirements, point values and the existing geometry diagrams remain rendered by code, not baked into generated artwork.

Consequences: saved plans do not sync across devices and do not reserve board space. Current-head independent review and physical phone acceptance remain required. Alternatives considered: retaining manual-only temporary planning was rejected by the owner's current request.

### DEC-033 — Ordinary Subway actions belong on their pieces

Date: 2026-09-11. Status: owner-authorized; implementation review pending.

The owner requested a thorough mobile playtest and delegated fixes that reduce popup windows. Route offers show a Buy button, price and remaining cash directly on the printed route. Draft and Construction-card buttons show their availability on the piece; current Engineering goals show their complete rules and progress without opening a dialog. Explicit buttons were chosen over dragging a purchase onto a player mat because dragging already pans the shared tabletop.

Construction schedule opens at current-turn controls, with round history below. Cards and Lines focus their first piece; survey purchase has a dedicated focus target. Oversized zones use a consistent working zoom instead of magnifying to fill one axis. Compact planning keeps Next hole, Save ghost and Confirm visible, with secondary editing in inline Plan tools. Real peg confirmation and the privacy handoff remain. Results wrap at phone width and place scores before optional report export. These are presentation changes, with no rule or saved-state shape changes.

### DEC-034 — Active-route guidance separates real work from sketches

Date: 2026-09-11. Status: owner-delegated; implementation review pending.

Of active-route guidance, blocked-move explanations and scoring highlights, choose active-route guidance for this iteration: it benefits every placement without making balance assumptions. A shared inline guide uses only committed route progress, with starter border/first-length instructions. The real endpoint receives a static FROM marker; future sketch instructions say Next ghost once a real placement is selected. Lines focuses the active contract before falling back to the first. Keep unrelated map information readable, manual planning distinct, and Confirm authoritative; no new popup, animation, rule or persisted field.

### DEC-035 — Quote the next real build consistently before Confirm

Date: 2026-09-11. Status: owner-delegated; implementation review pending.

Choose inline cost previews over a station finder and crew completion previews. Automatic planning had hidden the recipient/cash/debt information available in ordinary placement, making the default interaction less informative. Both modes now use one quote from current contacts and balance. Show recipient totals even when Access Pass subsidizes them; say the pass is used even on a free build, matching the reducer. Debt is a conditional end-game penalty, never an immediate VP deduction. No whole-plan budget forecast, new modal, automatic card play or rule change.

### DEC-036 — Direct ghost taps and a smaller placement strip

Date: 2026-09-11. Status: owner-authorized; implementation review pending.

Latest physical-phone feedback supersedes DEC-033's Next hole/Plan tools controls and DEC-035's visible build receipt. Keep only the active route, real build guide, Save ghost and Confirm peg in automatic planning. Legal ghost targets appear immediately in bright yellow after the pending starter or real segment is selected. Tap an unbuilt peg to remove it and its tail, then choose a replacement directly on the board. No coordinate readout or solid/dashed legend. Manual cross-line Plan retains its route selector; closing it restores the active line when a build is pending. Confirmation still commits exactly one real placement; saving ghosts remains private and device-local.

Center Construction schedule over the board and remove duplicate card faces from it. Each Engineering/Construction hand is horizontal on the shared zoomable tabletop, with Cards focusing its first card. Hide Contract office and Market after drafting completes. Tradeoff accepted by the owner: a simpler placement surface omits the pre-confirmation toll receipt; toll/debt rules and reducer validation are unchanged.

### DEC-037 — Visible sketch Undo and room around tabletop edges

Date: 2026-09-11. Status: owner-authorized; implementation review pending.

The owner's next playtest supersedes DEC-036's two-button placement strip: add Undo step for the last unconfirmed real/ghost node, while preserving the separate committed-placement Undo. Keep Save ghost and Confirm peg; no planning dropdown returns. Opaque bottom-control backing prevents underlying pieces showing through, and viewport-scaled pan slack lets the outermost cards reach the usable centre. The Construction schedule uses side-by-side crew/history sections and horizontal route choices. No reducer or persistence changes. Alternatives considered: Unknown / not documented.

### DEC-038 — Saved ghosts require an explicit build tap on later turns

Date: 2026-09-11. Status: owner-authorized; implementation review pending.

A saved route is visual guidance, not authorization to select or build its next segment. When that line becomes active on a later construction turn, restore the ghost but start with no pending real peg and disabled Confirm. The player must tap a legal peg, including the first saved ghost peg when desired. Following that peg preserves the remaining guide; selecting another legal peg replaces the unbuilt sketch from that point. This changes client interaction only; the reducer, explicit Confirm requirement and device-local plan storage remain unchanged.


### DEC-039 — Network missions replace single-station goals

Date: 2026-09-11. Status: owner-authorized; implementation review pending.

The owner's two-player playtest found easy goals, little money pressure and unused
Construction cards. Their approved overhaul separates two privately dealt Destination
missions from a three-pick Engineering-only draft of 16 unique goals. Destinations
require connected own networks across two or three stations and pay 4/7 VP. One extra
random mission costs $5M before hiring, once per game. No assignment to a single line.
Shared stations and identical pegs transfer passengers; raw crossings and opponents
do not. Directional goals use exact borders, including the modified Three Fronts
and all-three-line, opposite-corner Four Corners. Conflicting cards are intentional.

Start with $50M and use nine construction rounds; retain crew and debt prices.
Two-player station capacities shrink to one minor/two major; 3–4 seats retain two/three.
Color-named, two-letter-coded contracts keep prices/recipes/completion penalties,
with all route-specific and per-line Major bonuses removed. A separate longest
continuous network award replaces Long Haul: 5 VP alone, 3 each if tied, logical
peg-space length without reusing a segment. Earliest three-contract completion is
persisted for First to Open and rewound with placement Undo.

Implementation details: the mission deck contains every unique unordered pair/triple
(45/120); corners can represent either adjoining edge once per distinct-side count;
all three lines must join the component serving Four Corners. State version 14
prevents old saves from adopting changed card meanings or dock geometry.

Construction-card mechanics remain available internally but this draft no longer
supplies them; a new supply rule/redesign is not added. The iPad companion, overtime
and reserve changes remain deferred. Lower money/rounds is a balance hypothesis to
retest with people, not a proven outcome from reducer simulations.

Alternatives considered: the owner chose exact borders over nearest-side regions,
company connections over single-line destinations, and economy levers before a
larger construction redesign. This supersedes DEC-027's mixed six-card draft and
previous easy objective/route bonus rules.

### DEC-040 — Remove Construction cards from Subway

Date: 2026-09-11. Status: owner-authorized; implementation review pending.

The owner removed Construction cards from the current game to reduce rules and
interface complexity. Subway no longer has a Construction deck or hand, card-play
action, per-round card allowance, Priority Dispatch window, crew discounts, City
Grant, or Access Pass toll subsidy. Construction begins each round in the normal
rotating order and proceeds directly to crew selection. Scheduling cards remain a
separate existing system.

State version 15 and the hotseat save key prevent older rooms, device saves and
saved ghost plans from adopting the smaller state shape. The unused Construction
sprite and card UI are removed, and post-game telemetry no longer reports a
Construction hand. Historical decisions remain as records of earlier editions;
this decision supersedes their current Construction-card rules.

Consequences: every crew uses the standard $0M/$1M/$3M/$6M bill and every contact
toll is paid by the building company. The effects can be redesigned and reintroduced
later through a new owner decision. Alternatives considered: retaining unreachable
mechanics for a future supply rule was rejected because it preserved design and
maintenance complexity without contributing to play.

### DEC-041 — Completion cash and shared iPad companions

Date: 2026-09-11. Status: owner-authorized; implementation review pending.

Starting capital becomes $40M. Completing a line immediately pays $3M; nine
rounds, crew pricing and final debt penalties remain. Reward payment occurs in
the authoritative final BUILD and is reversed by placement Undo. Borrowing stays
available: the design encourages early completion without forbidding parallel
construction. All-three completion supplies $49M over the game, with $9M delayed.
This supersedes DEC-039's starting-cash value, not its other rules. Human balance
acceptance remains necessary; deterministic cadence comparisons are not proof.

Multiplayer uses an iPad host without a company seat plus 2–4 company phones.
The iPad owns public board/crew interaction. Phones own purchases, drafting and
private card browsing in four portrait pages. Explicit handoff covers the board
and hides outgoing ghosts before the incoming company acknowledges possession.
Local testing keeps the existing complete tabletop.

Device credentials and room-backed plans require an authenticated, filtered
transport. A Subway-specific endpoint uses the existing room CAS store, binding
unpredictable tokens (stored hashed server-side) to tablet/phone roles and company
IDs. Revision checks and bounded request receipts prevent stale/replayed actions.
The generic endpoints reject companion rooms so no parallel unfiltered path remains.
Private cards and decks are omitted from unauthorized responses; Undo snapshots
are never transmitted. Ghosts transfer only to their company's phone and the
acknowledged iPad turn. Results disclose goals and the post-game ledger.

Recovery uses the existing device key, not selecting another company's name.
No accounts, sockets or infrastructure migration are introduced. The trade-off is
that losing both browser storage and the recovery key loses that device's access;
the public room code deliberately cannot impersonate an existing participant.
State v16 restarts older rule states. Other games keep their legacy transport.

### DEC-042 — Guided turns, optional ghosts and tiered shape objectives

Date: 2026-09-12. Status: owner-authorized; implementation review pending.

The latest physical playtest requests explicit phase directions on phones, visible
completion/cash notices, optional planning, cyclic turn order and no same-color
self-crossing. Draft and construction rounds use the same cyclic seat order,
without snake picks or rotating round openers. Crew turns still include one
segment per hired line; billing and nine-round limits do not change.

Ghost planning is off by default in Table settings, persisted per device. Ordinary
peg preview and confirmation remain; enabling planning restores saved sketches.
Turning it off hides rather than deletes them. This supersedes automatic planning
as the default under DEC-032, not its opt-in implementation.

The owner delegated tier values: directional and terminal goals pay 2/4/their
existing maximum (6 or 7), not cumulative awards. Single-line Across Town and
company Four Corners instead use explicit geographic milestones. Scoring and
live phone progress share one evaluator. Completion is recomputed, not latched,
so Undo and mutable conditions remain honest. Other Engineering goals stay binary.

A phone may intentionally show an owned Destination's locations on the shared
iPad during its acknowledged board turn. The server validates ownership, role,
actor and acknowledgement; only the tablet receives the selected station IDs.
Turn changes hide them. Private hands and unselected cards remain filtered.

State v17 protects existing games from changed rules. Neighborhood conversion is
still an owner decision recorded in the workstream proposal, not an accepted
rule. Alternatives: automatic page switching was rejected in favor of a persistent
action link so players can keep reading private cards without forced navigation.


### DEC-043 — Neighborhood footprints replace exclusive station docks

Date: 2026-09-12. Status: owner-authorized; implementation review pending.

The owner approved replacing hard-to-hit station docks with larger areas, node-only
service, transfers among own lines in the same area, and no dock limits. The owner
specified three small, six large and one medium area, and Local Service on one line
visiting all three small areas. This supersedes earlier station capacity/offset rules.

Implementation uses 3/6/4-hole connected footprints, 2/5/3 base VP, fixed identity-size
mapping, and shuffled/rotated separated interior bays. The medium score is the
implementation choice between existing small/large values. Footprints never cover
outer border pegs; random generation is bounded and always valid.

Nodes retain exact holes plus area IDs; ordinary physical contact tolls apply even
inside an area. Sharing an area itself is not a toll. Own area transfers are logical
connections of zero added length; only actual string contributes to longest network.
Repeats never multiply service scores. Medium areas qualify for general destinations
and terminals but not small/large-specific goals. State v18 restarts old games.

Alternatives: keeping capacity limits was explicitly rejected by the owner. String
pass-through service was not selected; node-only service preserves intentional routing.
Separated bays trade fully free placement for reliable spacing and deterministic setup.


### DEC-044 — Larger neighborhoods reward smaller targets

Date: 2026-09-12. Status: owner-authorized; implementation review pending.

After viewing the neighborhood board, the owner requested small/medium/large
footprints of 6/10/16 pegs and reversed base rewards. These now score 5/3/2 VP.
Counts remain three small, one medium, six large; all other card and network rules
remain unchanged. This supersedes DEC-043's footprint sizes, base VP and separated
3×3 bay packing, not node-only service or free own-area transfers.

The 27×9 board has 175 interior holes; 124 are now neighborhood holes. Six
four-column bays pair each large area with a connected complementary region;
four of those regions hold the smaller areas. Shapes, identities, vertical flips
and a single gap column vary with engine randomness. This guarantees valid packing
without retries, preserves 51 survey-eligible holes and every outer-border peg.
Areas can touch boundaries, unlike the earlier sparse layout. Expanding the board
was unnecessary and would change route reach and the directional objectives.
State v19 prevents old games from silently changing score values mid-session.


### DEC-045 — Physical transfers and goal-led neighborhood scoring

Date: 2026-09-12. Status: owner-approved; implemented by PR #174.

Owner approved zero automatic area VP for the next playtest and replaced free
area-wide transfers with overlapping or horizontally/vertically adjacent nodes
on different company lines, anywhere on the board. Diagonals and crossings do
not join. This supersedes DEC-043/044's area transfers and base awards, not their
footprints or node-only service. Longest trail adds no transfer distance and
never reuses a built segment. Central Interchange uses one local adjacency group.

The destination deck is 15 pairs and 15 triples, balanced by neighborhood identity;
one pair/one triple dealt, 4/7 VP retained, optional $5M purchase unchanged.
The reviewed engineering revisions and 6/10/4/8/10-point awards are canonical in
RULES.md and config: Regional Service, Citywide Service, Local Service, Central
Interchange, Across Town, Perimeter Service and Four Corners. Borders are literal;
distinct sides need distinct nodes. State v20 prevents old rooms changing rules.

This is a balance experiment: visiting a neighborhood only matters through goals
(and the existing large-neighborhood tiebreak), while route/survey/longest/debt
scoring remains. Human playtests must assess the ambitious ten-area/four-corner
goals and whether neighborhoods absent from a hand are ignored.
