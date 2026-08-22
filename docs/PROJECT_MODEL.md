# Project Model — Party Games

<!-- How does this system work TODAY? Present tense. Not a roadmap, not a history. -->

**Last updated:** 2026-08-22 · **Build OS v0.1** (see [50thycal/build-os](https://github.com/50thycal/build-os))

Audience: the project owner, design/review sessions, implementation agents, and future
maintainers. This is a conceptual mental model, not generated API documentation. Where the
code does not support a firm conclusion, the text says so explicitly.

---

## Purpose

Party Games is a Jackbox-style platform for playing short multiplayer games with friends in a
browser. One person creates a room and shares a four-letter code; everyone else joins from
their phone. No installs, no accounts.

The project exists as much to make *building* those games cheap as to play them. The engine is
game-agnostic: a new game is a folder with a pure reducer and a React view, plus two registry
lines. Engine, routing, lobby, persistence, and syncing are never touched when a game is added.

Scale is deliberately small — an owner-operated project, a handful of concurrent rooms, party
group sizes of roughly 2–8 players.

---

## System Overview

A single Next.js 14 (App Router) application deployed on Vercel, with all authoritative game
rules running server-side and all durable state in a hosted Turso (libSQL) database.

```text
     phones / laptops (browsers)
   ┌───────────────┬───────────────┐
   │  host client  │ player client │      React client components
   └───────┬───────┴───────┬───────┘
           │  POST action  │  GET room state (polled every 1s)
           ▼               ▼
   ┌─────────────────────────────────────────────┐
   │  Next.js API routes (runtime = "nodejs")    │
   │  create-room · join-room · get-room ·       │
   │  game-action                                │
   └──────────────────┬──────────────────────────┘
                      │  applyActionToRoom
                      ▼
   ┌─────────────────────────────────────────────┐
   │  Engine: registry → game reducer (pure)     │
   │  optimistic-locking write loop              │
   └──────────────────┬──────────────────────────┘
                      ▼
   ┌─────────────────────────────────────────────┐
   │  Turso (libSQL): rooms(room_code, state_json,│
   │  version, updated_at)                        │
   └─────────────────────────────────────────────┘

   Side channels (stateless, game-specific, optional):
   client ──► /api/host  /api/desk  /api/speak ──► OpenAI
```

Two properties define the shape of everything else:

1. **The server owns the rules.** Clients dispatch *intents* (`{type, playerId, payload}`).
   The reducer for the room's game decides what that means. A client cannot write state.
2. **Sync is polling, not push.** Every client re-reads the whole room state once per second.
   There are no sockets, no server-side timers, and no background jobs.

---

## Major Components

| Component | Location | Responsibility |
|---|---|---|
| Engine types & contract | `src/engine/types.ts`, `defineGame.ts` | `Room`, `Player`, `BaseAction`, `GameContext`, and the `GameTemplate<S, A>` interface every game satisfies. `defineGame` is a typing passthrough only. |
| Game registry (server) | `src/engine/gameRegistry.ts` | Maps `gameId → GameTemplate`. Games are imported and registered at module load. |
| Action pipeline | `src/engine/applyActionToRoom.ts` | Loads versioned room state, resolves the template, runs `isActionAllowed`, runs the reducer, writes back under optimistic locking, retries on conflict. |
| State store | `src/engine/stateStore.ts` | Thin, mostly pass-through facade over the database module; the only module the API routes talk to. |
| Database layer | `src/engine/database.ts` | Turso client singleton, lazy schema creation, versioned read/write (CAS), room-code generation, maintenance helpers. |
| HTTP surface | `src/app/api/{create-room,join-room,get-room,game-action}/route.ts` | The engine's entire public API. All pinned to the Node.js runtime. |
| Game logic plugins | `src/games/<game>/config.ts` | Per-game state shape, actions, reducer, phase derivation, and action validation. Pure; no I/O. |
| Game views | `src/games/<game>/GameView.tsx` | Per-game UI for all roles and phases. Receives `{state, room, playerId, isHost, dispatchAction}`. |
| Client view registry | `src/games/views.ts` | Maps `gameId → GameView`, plus `gameOptions` (the game list shown in the create-room UI) and per-game layout width. |
| Generic room shell | `src/app/rooms/[roomCode]/page.tsx` | Polling loop, identity resolution, hotseat player switching, `dispatchAction` with retries, lobby chrome, and mounting of the game view. Contains no game-specific logic. |
| Entry pages | `src/app/page.tsx`, `create/`, `join/` | Home (with a "latest merged PR" banner), room creation (game + mode + players), room joining. |
| AI narrator routes | `src/app/api/{host,desk,speak}/route.ts` | Stateless OpenAI calls serving one game each: HR Investigation narration, The Desk's Oracle round generation, and text-to-speech. |
| Dev simulator | `src/app/test/`, `src/app/api/llm-bot/route.ts`, `src/games/cafe/bots.ts` | **Development-only.** Runs Comet Rush and Cafe reducers in the browser with scripted or LLM bots. Bypasses the API routes and the database entirely. |
| Subway rules harness | `scripts/subway-rules-test.ts`, `scripts/test-subway.sh` | The only automated test in the repository: compiles the Subway reducer plus engine types and asserts rules by driving the reducer directly. |

### How they relate

The engine knows nothing about any game beyond the `GameTemplate` contract; games know nothing
about transport, persistence, or each other. The room shell knows nothing about any game beyond
"look up a component by id and hand it props". Adding a game touches only `src/games/<game>/`
plus one line in each registry.

**A game is registered in two places.** `gameRegistry.ts` carries the logic; `views.ts` carries
the UI component *and* the player-facing metadata (name, description, min/max players) used by
the create-room page. These are independent lists and are kept in sync by hand.

---

## Main Lifecycle / Control Flow

### Room lifecycle

```text
/create ──POST /api/create-room──► room row written (gameState = null)
                                   │
                                   ▼
                         redirect /rooms/<CODE>
                                   │
/join ───POST /api/join-room───────┤ (adds player to room.players, CAS retry loop)
                                   │
                                   ▼
                        room page polls GET /api/get-room every 1s
                                   │
        host presses Start ──► POST /api/game-action {type: "START_GAME"}
                                   │
                                   ▼
                       reducer transitions the game's phase
                                   │
                            …play proceeds…
                                   │
                                   ▼
                     terminal phase (results / game_over / RESULTS)
                     — often with a PLAY_AGAIN / "Run it back" action
```

Rooms are never explicitly ended or deleted by any code path in the running app.

### Action pipeline (the important flow)

```text
GameView.dispatchAction(type, payload)
   │  client-side: up to 3 attempts, 100ms → 200ms → 400ms backoff,
   │  retrying only on CONCURRENT_UPDATE_CONFLICT or a network error
   ▼
POST /api/game-action { roomCode, playerId, type, payload }
   │
   ▼
applyActionToRoom (up to 5 attempts)
   ├─ read room + version                     ─► 404 ROOM_NOT_FOUND
   ├─ getGame(room.gameId)                    ─► 500 GAME_NOT_REGISTERED
   ├─ gameState ?? template.initialState(...)   (lazy first-touch init)
   ├─ isActionAllowed?  false                 ─► 400 ACTION_NOT_ALLOWED
   ├─ nextState = reducer(state, action, ctx)
   └─ UPDATE … WHERE room_code = ? AND version = ?
        ├─ 1 row  ─► 200 { room, gameState }
        └─ 0 rows ─► version conflict, loop again
                     after 5 attempts ─► 409 CONCURRENT_UPDATE_CONFLICT
```

`ctx` gives the reducer `now()`, `random()`, the `room`, and the acting `playerId`. Because a
conflicting attempt re-runs the reducer from freshly read state, reducers may be executed more
than once per HTTP request; each execution draws fresh randomness and time.

Note two things the code does *not* do, both visible in the source:

- The retry loop computes a backoff delay but `continue`s without sleeping (an in-code comment
  acknowledges this). Retries are effectively immediate.
- Actions carry no idempotency key. A client retry after a *network* error can apply the same
  action twice if the original request in fact succeeded.

### Where AI content enters the loop

Reducers perform no I/O. For the two AI-hosted games, one client fetches the content and then
commits it through an ordinary action:

```text
GameView effect (only on a "driving" client)
   └─► POST /api/host or /api/desk ──► OpenAI ──► JSON
         └─► dispatchAction("SET_INTRO" | "SET_ROUND" | …, {content})
               └─► reducer clamps/sanitises and stores it in game state
                     └─► every other client sees it on its next poll
```

The driving client is the host in `multiplayer` mode. HR Investigation widens this to *any*
active player in `hotseat`/`simulation` (`canDrive` in
`src/games/performance-review/config.ts`), because in pass-and-play the host seat may not be at
the device. Both games ship deterministic offline fallbacks, so they remain fully playable with
no `OPENAI_API_KEY`.

---

## Important State Machines / Workflows

### Room modes

`room.mode` is fixed at creation and never changes.

| Mode | Players created | Acting identity | Reachable from |
|---|---|---|---|
| `multiplayer` | Host only; others join by code | `localStorage` identity | `/create` |
| `hotseat` | All players pre-created at room creation | A client-side "active player" selector persisted in `localStorage` | `/create` |
| `simulation` | All players pre-created | First player | Not offered by the `/create` UI; the API accepts it and the room shell handles it. The `/test` simulator uses the *label* `simulation` for an in-browser room object that never reaches the server. |

### Per-game phases

Each game owns its own state machine; the engine only stores whatever the reducer returns.
`GameTemplate.getPhase(state)` is implemented by every game but is **not called anywhere** —
the room shell reads `state.phase` directly.

| Game | Id | Phases |
|---|---|---|
| Number Guess | `number-guess` | `lobby → guessing → results` (→ `guessing` via PLAY_AGAIN) |
| Comet Rush | `comet-rush` | `lobby → initialDraft → playing → gameOver` |
| Cafe | `cafe` | `lobby → planning → investment → customerDraft → customerResolution → shopClosed → cleanup → planning …→ gameOver` |
| Open House | `real-estate` | `lobby → playing → round_results → … → results` |
| HR Investigation | `performance-review` | `lobby → intro → accusation → reframing → interview → case_prep → editing → reveal → voting → round_over → … → game_over` |
| The Desk | `the-desk` | `lobby → briefing → quote → trading → settlement → briefing … → final` |
| Subway | `subway` | `SETUP → PROCUREMENT → ENGINEERING → STARTER_PLACEMENT → CONSTRUCTION → SCORING → RESULTS`, with `periodStep: COMMIT → RESOLVE` inside `CONSTRUCTION` |

**The string `"lobby"` is load-bearing in the shell.** The room page shows the room-code header,
the player list, and the leave link only while `gameState` is null or `state.phase === "lobby"`;
otherwise it hands the full width to the game view. Subway starts at `SETUP`, so it renders as
gameplay from its first action onward and provides its own pre-game chrome.

### Turn timing without a server clock

There is no server-side scheduler. Time-based rules are evaluated inside a reducer when some
client dispatches an action. Open House is the worked example: the state stores `turnStartedAt`,
any client may fire `TURN_TIMEOUT`, and `isActionAllowed` re-checks
`ctx.now() - turnStartedAt >= settings.turnTimeoutMs` server-side, so an early or stale timeout
is rejected rather than trusted.

---

## Data / Persistence

### Durable: Turso (libSQL)

One table, created lazily and idempotently on first use:

```sql
rooms(
  room_code  TEXT PRIMARY KEY,   -- 4 uppercase letters, A–Z
  state_json TEXT NOT NULL,      -- JSON of { room, gameState }
  version    INTEGER NOT NULL,   -- bumped on every successful update
  updated_at INTEGER NOT NULL    -- epoch ms; indexed
)
```

- **The entire room — metadata, player roster, and full game state — is one JSON blob.** Every
  write serialises the whole thing; there is no per-field or per-player storage.
- `version` is the concurrency control. Updates are compare-and-swap
  (`WHERE room_code = ? AND version = ?`); a zero-row update means someone else wrote first.
- `gameState` is `null` from room creation until the first action, at which point
  `applyActionToRoom` lazily calls `initialState(room.players)`. Reducers and views must tolerate
  a null game state.
- Room codes are generated by random 4-letter draw with a uniqueness lookup loop.
- `cleanupOldRooms`, `deleteRoom`, `listRooms`, `closeDatabase`, `registerGame`, `getAllGames`,
  and `hasGame` exist but have no callers in the app. **Nothing expires or deletes rooms today.**

### Client-side (browser `localStorage`)

| Key | Contents | Used by |
|---|---|---|
| `partyShellPlayer` | `{id, name}` player identity (UUID) | Multiplayer create/join and the room shell |
| `hotseat-active-player-<ROOMCODE>` | Currently-controlled player id | Hotseat mode |

Identity is a client-held UUID with no authentication. Any client that knows a room code and a
player id can act as that player.

### Not persisted

Anything a game does not put in its state: AI request/response logs, TTS audio, simulator runs,
and all React component state.

---

## External Systems

| System | Used for | Behavior when unavailable |
|---|---|---|
| **Turso (libSQL)** via `@libsql/client` | All room and game state. Requires `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. | Hard failure. The client constructor throws with an explicit message; every room operation 500s. There is no fallback store. |
| **OpenAI — chat completions** (`gpt-4o-mini`, JSON mode) | `/api/host` (HR Investigation narration), `/api/desk` (The Desk's rounds), `/api/llm-bot` (Comet Rush simulator bots) | Graceful. Missing `OPENAI_API_KEY` or a malformed reply returns `{ok:false}`; both shipped games substitute canned/RNG fallbacks and continue. |
| **OpenAI — TTS** (`gpt-4o-mini-tts`) | `/api/speak`, host-toggled narration read aloud on one device | Graceful. 503 with no key; the game continues silently. |
| **GitHub REST API** | Home-page "latest merged PR" banner (`src/lib/version-info.ts`, 60s revalidate, unauthenticated) | Graceful. Falls back to "Version info unavailable". |
| **Vercel** | Hosting; every push to `main` redeploys. Provides the Turso and OpenAI environment variables. | N/A (it is the runtime). |

---

## Important Invariants

These should remain true across implementations:

1. **The server is the only rules authority.** Clients send intents; only reducers change state.
   Any rule enforced solely in a `GameView` is not enforced.
2. **Reducers are pure and total.** No I/O and no engine imports beyond `types` and `defineGame`.
   An illegal or unrecognised action returns the state unchanged rather than throwing.
3. **All nondeterminism goes through `ctx.random()` / `ctx.now()`**, never `Math.random()` or
   `Date.now()` directly — and reducers must tolerate being re-run, because conflict retries
   replay them from fresh state. (One deck reshuffle in `cafe/config.ts` calls `Math.random()`
   directly; it is the sole exception in the game configs, not the pattern.)
4. **Game state must be JSON-serialisable.** It round-trips through `JSON.stringify`/`parse` on
   every write and read. No `Map`, `Set`, `Date`, class instance, or function survives.
5. **Every write to an existing room is version-checked.** A failed CAS is retried or reported —
   never treated as success, never converted into an unconditional overwrite.
6. **Room codes are uppercase.** API routes uppercase incoming codes before any lookup.
7. **Every game id appears in both registries** — `gameRegistry.ts` (logic) and `views.ts`
   (view + `gameOptions` entry) — with matching ids.
8. **`gameState` may be null** before the first action; the shell and every view must render
   sensibly in that state.
9. **The engine contains no game-specific logic**, and games do not import one another.
10. **AI output is untrusted input.** It reaches state only via an action whose reducer clamps,
    validates, and bounds it (see The Desk re-clamping the Oracle's numbers), and every AI path
    has a deterministic fallback.

---

## Current Architectural Constraints

- **Node.js runtime is mandatory** on every API route touching the database
  (`export const runtime = "nodejs"`). Edge runtime is not compatible with the current client.
- **Polling at 1 Hz is the only sync mechanism.** Worst-case observed latency for other players
  is ~1 second, and every connected client costs one row read per second. Game designs that need
  sub-second shared timing will fight this.
- **Whole-blob writes.** Room state size is a real budget: it is serialised and written on every
  action. Comet Rush accumulates a per-action `actionLog` inside game state, which grows for the
  life of a game.
- **No server-side scheduling.** No cron, no timers, no background workers. Anything time-based
  must be triggered by a client action and validated against `ctx.now()` in the reducer.
- **No authentication.** Identity is a client-generated UUID; room codes are the only access
  control, and the code space is 26⁴ ≈ 457k with no rate limiting.
- **Deploys can land mid-game.** State persists across deploys, so a reducer whose state shape
  changed may meet an older persisted blob. Only Subway guards this explicitly
  (`SUBWAY_STATE_VERSION`, with a "start a new game" prompt on mismatch); the other games do not.
- **Test coverage is one harness.** `scripts/test-subway.sh` (Subway rules) is the only automated
  test. There is no CI configuration in the repository; validation is `npm run build`,
  `npm run lint`, that script, and manual play.
- **Player-count limits are advisory.** `minPlayers`/`maxPlayers` are declared in the template and
  mirrored in `gameOptions`, but no server route enforces them — `join-room` admits any number of
  players, in any phase, including after a game has started.

---

## Known Architectural Pressure Points

Areas that are awkward, load-bearing in a fragile way, or likely to change. Stated as they are
observable in the code, not as plans.

- **The dual registry drifts.** Logic and UI/metadata live in separate files with no shared
  source; `maxPlayers` in particular exists twice.
- **`getPhase` is a dead contract.** Every game implements it; nothing calls it. The shell
  string-matches `state.phase === "lobby"` instead, which also makes `"lobby"` an undeclared
  cross-cutting convention that Subway does not follow.
- **Action delivery is at-least-once, not exactly-once.** No idempotency keys; the client retries
  on network errors, so a lost response can double-apply an action. The conflict-retry path also
  never sleeps despite computing a backoff.
- **AI orchestration lives in client effects.** Which client drives is decided by `isHost` /
  `canDrive` and guarded by React refs that only survive within a mounted session. If the driving
  client leaves or reloads at the wrong moment, a beat can be re-fetched or stall. There is no
  server-side lock on "who generates round N".
- **Nothing ages rooms out.** The maintenance helpers exist but are unwired, so the `rooms` table
  grows without bound.
- **Game configs are large.** `cafe/config.ts` (~3.1k lines) and `comet-rush/config.ts` (~2.9k
  lines) hold state, rules, content, and scoring in one file each; they are the hardest files in
  the repo to change safely, and the least covered by tests.
- **Reducer style is not uniform.** Most games return new objects; Subway `structuredClone`s the
  state and mutates the copy. Both satisfy the contract, but the difference is easy to trip over.
- **Comet Rush and Cafe carry a second, parallel implementation surface**: the `/test` simulator
  drives their reducers in-browser with its own bot logic. It is a development tool that can lag
  behind the games it simulates. `/test` offers only these two games.
- **`src/engine/index.ts`** re-exports the engine as a barrel that nothing imports; call sites use
  deep paths.
- **Uncertain / not documented in the code:** whether `simulation` mode is intended to become a
  user-facing room mode (the shell supports it, the create page does not offer it), and whether
  the original `docs/history/` spec's WebSocket phase is still the intended upgrade path.

---

## Where the older documents went

`docs/history/SPEC.md` and `docs/history/PLAN.md` are the original December 2025 design and
roadmap for the engine. They are retained for context and are **partly superseded**: they
describe views living inside `GameTemplate` (removed, see `DEC-002`) and an in-memory state store
(replaced, see `DEC-004` / `DEC-005`). `README.md` remains the practical quickstart for adding a
game. This file is the current source of truth for architecture; `docs/DECISIONS.md` records why.

---

<!-- Update this file in the same PR as any change that materially alters architecture,
     important flows, invariants, or system responsibilities. -->
