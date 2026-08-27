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
**Status:** Accepted · **Supersedes:** DEC-014

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
**Status:** Accepted

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
