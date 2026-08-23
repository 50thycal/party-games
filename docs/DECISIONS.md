# Decisions — Party Games

Why does the system work this way? Lightweight ADRs, appended in order, newest at the bottom.
This log follows [Build OS v0.1](https://github.com/50thycal/build-os).

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
