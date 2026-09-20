# Project Model — Party Games

<!-- How does this system work TODAY? Present tense. Not a roadmap, not a history. -->

**Last updated:** 2026-09-15 · **Build OS v0.12** (see [50thycal/build-os](https://github.com/50thycal/build-os))

Project memory has three layers: this file (how the system works today),
[`DECISIONS.md`](DECISIONS.md) (why), and [`workstreams/`](workstreams/ACTIVE.md) (what is being
designed and built right now). Work in flight is described in its workstream, not here — this
file describes what is merged and live.

Audience: the project owner, design/review sessions, implementation agents, and future
maintainers. This is a conceptual mental model, not generated API documentation. Where the
code does not support a firm conclusion, the text says so explicitly.

---

## Subway companion transport

`/subway/multiplayer` is the multiplayer entry and game shell. A tablet host is
not a company seat; 2–4 phones join before START_GAME. `/subway` remains the local
testing tabletop. Generic Create/Join direct Subway players to the companion flow.

`/api/subway-companion` handles creation, joining, recovery, polling and actions.
The room JSON carries a `subwayCompanion` sidecar with SHA-256 device-token hashes,
roles/company bindings, revision, bounded deduplication receipts, acknowledgement
and per-company ghost plans. Credentials are generated on the server and saved
only on the device; Device reveals a recovery key for replacement browsers.
Knowing the public room code does not grant an existing company or tablet role.

All mutations use existing database compare-and-swap. Stale revisions fail; retries
with the same request ID do not repeat a payment. The server derives the acting
company from credentials/acknowledgement, never a client-supplied player ID.
Phones buy contracts, draft Engineering, buy destinations. The tablet
acknowledges the active company before crew or placement actions, and alone starts
and scores. Host scoring permits a host without a company seat.

Responses omit credentials, draw-pile identities and Undo snapshots. Phones receive
only their own private hands and ghost plans until results; the tablet receives
no private hands and only the currently acknowledged company's plans. A changed
turn invalidates the acknowledgement and removes ghosts; a fresh tablet page also
covers the board until confirmation. Public construction history retains sanitized
build/Undo/hiring records. Results reveal hands and the complete playtest ledger.
Legacy read/join/action endpoints reject these rooms, including the non-versioned
room reader. Other games retain their legacy transport behavior.

Tablet presentation reuses the zoomable tabletop with only board and crew panel.
Phone presentation has four scrolling pages (Destinations, Lines, Engineering,
General), safe-area bottom navigation and a portrait orientation prompt. Saved
plans are edited on the iPad and shown with line cards on the phone; they never
select or construct real pegs. Poll failures disable board interaction until recovery.

### Playtest guidance and live objective progress

Phones show a persistent next-step instruction with a direct page link, including
while another company drafts. Card status includes live VP and Completed text.
Public money events drive player-panel debit/credit animations and completion rewards; remounting establishes a watermark without replaying old money events.

An authenticated phone can toggle its owned Destinations on the shared iPad.
Enabled selections persist across turns and reconnects until their owner disables
them. The tablet projection includes only the current actor's selections, even
before tablet acknowledgement, and none when no actor exists. Board colors use
that projection without a separate legend or company/card code. Each card has a
stable color swatch on the phone; shared targets use equal-width color bands.
Phones receive only their own selections, including off-turn. Clear removes
only that company's highlights. This opt-in disclosure does not publish unselected
missions or the full hand. See DEC-047 for selection persistence and DEC-053 for
current-player-only shared visibility. The quick-start, full rulebook and existing
rules reference are marked DRAFT — NEEDS OWNER REVIEW; graphics follow wording
approval. Repository publication does not imply owner approval of their rules.

Ghost planning is a device-local Table setting, default off. Off hides saved
ghosts, planning controls and next-step hints, but retains normal real-placement
previews and Confirm. Turning it off does not erase saved plans.

The reducer rejects a line crossing or rejoining an earlier segment of its own
color; different colors retain contact/toll rules. Engineering goals use binary live progress with category and scope badges.
The same progress helper supplies phone VP and final score ledger points.
Neighborhood footprints, explicit node transfers and zero automatic area VP are implemented.

Engineering card faces share 21 schematic vector goal diagrams across phone,
tabletop, focus and results. Presentation summaries do not replace canonical
requirements or affect scoring/fingerprints. Network diagrams use multiple route
colors; single-line goals use one qualifying color with neutral transfer support.
Native Rules & symbols disclosures preserve full requirements and tag definitions
outside any card-selection button. Destination faces keep their existing atlas.

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
| Subway tabletop | `src/games/subway/canvas.tsx`, `table.tsx`, `board.tsx` | Subway is composed as one pan-and-zoom coordinate space (DEC-023): `canvas.tsx` is the camera, `table.tsx` the pieces laid out in world pixels, `board.tsx` the pegboard as one of them. Camera state is client-local and never derived from room state, so polling cannot move it. |
| Client view registry | `src/games/views.ts` | Maps `gameId → GameView`, plus `gameOptions` (the game list shown in the create-room UI) and per-game layout width. |
| Generic room shell | `src/app/rooms/[roomCode]/page.tsx` | Polling loop, identity resolution, hotseat player switching, `dispatchAction` with retries, lobby chrome, and mounting of the game view. Contains no game-specific logic. |
| Entry pages | `src/app/page.tsx`, `create/`, `join/` | Home (with a "latest merged PR" banner), room creation (game + mode + players), room joining. |
| AI narrator routes | `src/app/api/{host,desk,speak}/route.ts` | Stateless OpenAI calls serving one game each: HR Investigation narration, The Desk's Oracle round generation, and text-to-speech. |
| Dev simulator | `src/app/test/`, `src/app/api/llm-bot/route.ts`, `src/games/cafe/bots.ts` | **Development-only.** Runs Comet Rush and Cafe reducers in the browser with scripted or LLM bots. Bypasses the API routes and the database entirely. |
| Subway local hotseat | `src/app/subway/page.tsx` | Device-local, versioned save/resume, 2–4 seat setup and handoff. Uses the same pure reducer and GameView; no Turso/network dependency. |
| Subway playtest lab | `src/app/test/subway/`, `src/games/subway/playtest.ts` | Seeded legal-action phase walks and iframe viewports for desktop/phone inspection. Isolated from real rooms. |
| Subway rules harness | `scripts/subway-rules-test.ts`, `scripts/subway-multiplayer-test.ts`, `scripts/test-subway.sh` | The only automated test in the repository: compiles the Subway reducer plus engine types and asserts rules by driving the reducer directly. Covers Subway's contract recipes and route geometry, station docks, priority, procurement, merged goal drafting, Survey Pins, placement undo, crew billing and card timing, spatial rules, scoring, border-only starters, one-Confirm-one-action queue semantics, stale-confirm rejection, the bounded privacy-safe public event stream (append-on-accept, 20-entry cap, monotonic sequence across Undo), and state versioning. |

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
| Subway | `subway` | `SETUP → PROCUREMENT → ENGINEERING → STARTER_PLACEMENT → CONSTRUCTION → SCORING → RESULTS`, with `engineeringStep: CARD_DRAFT → BUY_SURVEYS → SURVEY` inside `ENGINEERING` (SURVEY is skipped when no pins are purchased). One `UNDO_PLACEMENT` action can walk the latest physical placement back across a phase boundary. State v13 (WS-005) retains a bounded public event stream — `events` (latest 20) plus a monotonic `nextEventSeq` that is never rewound, Undo included — and a finite full accepted-action telemetry ledger used only by the post-game AI report. Construction advances to scoring at round 16 or immediately when no incomplete line has a legal next segment. A game-start random layout assigns named stations to separated sites; Major Stations have three docks and Minor Stations have two. Starter pegs are reducer-legal only on non-station outer-border holes, and the view commits placements exclusively through an explicit Confirm dispatching `PLACE_STARTER`/`BUILD` with the one selected target. The active route pulses, and selection draws the unconfirmed segment before Confirm. |

**The string `"lobby"` is load-bearing in the shell.** The room page shows the room-code header,
the player list, and the leave link only while `gameState` is null or `state.phase === "lobby"`;
otherwise it hands the full width to the game view. Subway starts at `SETUP`, so it renders as
gameplay from its first action onward and provides its own pre-game chrome. `getGameplayWidth`
gives a game a wider gameplay container than the phone-first default; Subway takes the full
window, because it fills what is left of the screen with one tabletop the player pans and zooms
rather than a page that scrolls.

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
| `subway-plan-v8:<ROOM>:<PLAYER>:<CONTRACT>` | One saved phantom route plan (`{v, nodes, savedAt}`), versioned by Subway state shape | Subway saved Plan Mode (`src/games/subway/plans.ts`); parsed defensively, fails closed to no plan |
| `subway-seen-v8:<ROOM>:<PLAYER>` | Highest public event sequence this room/player pairing has seen | Subway pegboard narration dedupe across polls and reloads |

Identity is a client-held UUID with no authentication. Any client that knows a room code and a
player id can act as that player. Subway's saved plans are deliberately client-local (DEC-022):
they are private sketches, never room state, and do not sync across devices; when storage is
unavailable a plan lasts only for the session and the UI says so.

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
9. **Game rules stay in game modules.** The generic action pipeline rejects Subway
   companion rooms, which use their authenticated device transport. Games do not import one another.
10. **AI output is untrusted input.** It reaches state only via an action whose reducer clamps,
    validates, and bounds it (see The Desk re-clamping the Oracle's numbers), and every AI path
    has a deterministic fallback.
11. **Legacy hidden information is a rendering convention.** `GET /api/get-room`
    rejects Subway companion rooms; other games still return the entire state, so
    The Desk's `trueValue` and the Market Maker's position band, and HR Investigation's unsealed filings are
    concealed only by the view that
    chooses not to draw them. Any player reading the poll response can see them. Games may rely
    on this for social play; they must not rely on it for anything where a determined player's
    advantage would break the game.

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
  players, in any phase, including after a game has started. Subway declares 2–4 and rejects START_GAME outside that range. Its normal create UI
  offers 2/3/4 seats; old overfilled rooms cannot start. The engine-wide join limitation
  remains advisory; the Subway reducer rebuilds only the supported roster at start.
- **No server-side private state.** There is one room payload and every client gets all of it
  (invariant 11). A mechanic that needs true secrecy needs an engine change — per-player state
  filtering in `get-room` — not a game-level change.

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
- **Secrecy pressure is growing.** Three of the seven games now hold values the rules call secret,
  and legacy room responses still expose them (invariant 11). Subway companion rooms now filter private drafted cards per device; the earlier case for per-player
  filtering in `get-room`; the design question is tracked in
  [WS-001](workstreams/WS-001-subway-v0-3-redesign.md) and
  [WS-002](workstreams/WS-002-subway-route-engineering.md) as a non-goal, not a plan. Subway's
  saved phantom plans (WS-004/DEC-022) are the counter-example that shows the shape of the
  alternative: because they are client-local sketches in versioned browser storage that never
  enter an action payload or room state, they are genuinely private in a way no committed card
  is. WS-004's tabletop presentation — the opposition's edge showing card backs and counts, the
  privacy-vetted public event stream, the hotseat handoff veil — is deliberate *presentation*
  privacy on top of the same shared payload, and is documented as such rather than as secrecy.
  DEC-023's single-surface rework changed where those pieces sit on the table, not what any
  client receives. The new companion transport supersedes this limitation for
  newly created Subway multiplayer rooms only; local testing remains local.
- **Uncertain / not documented in the code:** whether `simulation` mode is intended to become a
  user-facing room mode (the shell supports it, the create page does not offer it), and whether
  the original `docs/history/` spec's WebSocket phase is still the intended upgrade path.

---

## Where the older documents went

Active design and build state lives in [`docs/workstreams/`](workstreams/ACTIVE.md) —
`ACTIVE.md` is the board, one `WS-###` file per thread. `docs/history/SPEC.md` and
`docs/history/PLAN.md` are the original December 2025 design and roadmap for the engine. They are retained for context and are **partly superseded**: they
describe views living inside `GameTemplate` (removed, see `DEC-002`) and an in-memory state store
(replaced, see `DEC-004` / `DEC-005`). `README.md` remains the practical quickstart for adding a
game. This file is the current source of truth for architecture; `docs/DECISIONS.md` records why.

---

<!-- Update this file in the same PR as any change that materially alters architecture,
     important flows, invariants, or system responsibilities. -->

## WS-005 gameplay invariants

Subway has 2–4 companies, exactly three selected contracts each from twelve, and ten
stations. Shared pure reducer helpers own the full-seat draft/placement rotation,
cyclic construction queue and owner-specific contact payments. Undo restores
every recipient balance.
Each company starts with $40M and chooses zero to three unfinished routes each turn
over nine construction rounds. Crew bills are $0/$1/$3/$6M, paid before building one
segment on each chosen route. No advance timetable or shelving phase exists.
Ending cash uses positive bands ($5M+ → 3 VP, $4M → 2, $2–3M → 1, $0–1M → 0)
and uncapped debt at −2 VP per $1M (DEC-060), computed by `cashScore` and shown on the
Construction schedule by `CashSpectrum`. Crews may be hired on credit again
(`crewDebtAllowed` is true), so hiring and contact tolls can both create debt. CrewBoard renders crew selection and round history while the
reducer owns billing, turn order and placement authority. Placement Undo refunds
placement tolls but retains the already-paid crew bill.

Each completed line immediately pays $3M. The valid final BUILD pays it once; the
placement Undo restores the entire previous balance, including reward and tolls.

`/subway` stores a versioned local session under `subway-hotseat-v17`. It is separate
from network rooms and uses no server authority; same-device social play is the only
intended mode. Storage errors show a keep-tab-open warning. `/test/subway` creates
isolated scenarios through real reducer actions, rendering the same GameView inside
true phone/desktop iframe viewports. It never writes the local player's saved game.

### Flexible Subway drafting (DEC-027)

Procurement presents a refillable player-count-sized route row. Three mandatory
list-price picks per player replace first refusal, passing and discount sales.
Each company receives two private Destination missions at START_GAME. Engineering's
CARD_DRAFT offers three picks per player, from two face-up goals or a blind pile,
with one copy of each of 21 Engineering goals. Destinations have a separate shuffled
deck of 15 neighborhood pairs and 15 triples. Pair/triple missions score
4/7 VP when their stations are connected through the company's own built network;
unfinished routes can contribute. One extra random mission costs $3M before hiring
on the owner's construction turn, once per game, with reducer-enforced affordability,
phase/actor/period guards. Public events disclose the purchase but not the mission.
The post-game telemetry export includes destination identities and purchase flags.
Construction cards and their special timing/economy effects have been removed.

Cyclic draft helpers keep the same seat order within and between stages. Construction
rounds keep the same opener so two-player round boundaries do not give double turns. Stale card-pick
tokens and duplicate goals are rejected. The final Engineering pick proceeds directly to all three route starters. There is no commitment or assignment.
Legacy schedule/commitment types and dormant helpers remain unreachable in v17.

`network.ts` provides own-node connectivity and longest edge-simple trails. Shared
neighborhood IDs join their exact peg holes; identical normal route nodes transfer; raw intersections
and opponents never bridge components. Border objectives check exact rows/columns;
a corner counts at most once when assigning distinct sides. First to Open uses an
undo-restored first-completion player field. Longest network scores logical peg-space
length without segment reuse: 5 VP to one winner or 3 each on a tie. Route specials
and per-contract Major bonuses are removed, retaining ordinary station scoring.

Contracts keep stable internal IDs, recipes and prices, and display thirteen color
names with unique two-letter codes. Neighborhoods have no dock limits at any player count.
Placed and planned area nodes retain the neighborhood ID plus the exact integer hole;
there are no physical dock offsets.
State version 15 requires restart for old rooms/saves and isolates old local plans.

The isolated `/subway/tutorial` route prepares lesson snapshots through the legal
playtest driver. It controls the real GameView with optional camera lesson props;
practice actions remain in component state and never write a network room or
hotseat save. Real games link to phase-specific lessons in a separate tab.

## Phone tabletop presentation (mobile continuation)

Placement uses Save ghost and Confirm peg with the committed-route build guide. Selecting a pending real peg immediately shows bright yellow legal ghost targets; tapping an unbuilt peg removes it and its tail so a replacement can be selected directly. Confirm commits only the pending real step. The owner removed the Next hole/Plan tools controls, coordinates, legend and build-cost receipt; quoteBuildCost and its reducer-comparison tests remain available, but GameView no longer renders the receipt. BUILD still calculates legality and transfers at confirmation.

Construction schedule is centered above the pegboard and contains order/hiring/history controls without duplicated hand cards. Its wide tabletop layout places crew controls beside round history, with companies in two columns. Engineering and Destination hands each occupy a horizontal row in the same zoomable tabletop; Cards focuses the first card at a usable zoom. Contract office and Market navigation exist only during route procurement and card drafting.

Undo step reverses one unconfirmed sketch node, preserving the committed prefix and recalculating the pending real target. It changes the working sketch only; Save ghost persists revisions. Committed-placement Undo remains a separate reducer action. On a later turn, a valid saved ghost is restored as guidance only: there is no pending real peg and Confirm remains disabled until the player taps a legal target. Tapping the first saved ghost peg follows the stored route; choosing another legal peg replaces the unbuilt sketch from that point. The bottom controls have opaque backing and a measured gap, and camera bounds allow roughly 60% of a viewport of pan buffer around the table so edge cards can reach the unobscured centre at any zoom.

RouteBuildGuide derives starter instructions, next real segment length and remaining segments from the committed route, never from ghost sketches. The active contract and automatic planner share this guide; manual Plan remains separate. A static FROM marker identifies the growing real route endpoint without intercepting taps. Lines focus prefers the active contract and falls back to the first piece.

Automatic framing also follows completed company handoffs and new construction rounds, but not routine polls. Focus magnification is capped at 110%; manual zoom can go closer. Public player pads stay outside the camera and show cash and line ownership.

All devices use TabletopCanvas: board, illustrated card faces and company pieces share one locally zoomable/pannable world. Phone overlays are limited to camera shortcuts and current placement controls. GameView owns targets, validation, pending peg, sketches and reducer dispatch. Settings contains public logbook entries; results also have a readable screen sheet and report text/download fallback. No state-version migration is required: presentation and previews are client-local.

Active starter/build contexts automatically open a line-locked planner. A fresh tap creates the solid pending real placement; the remaining tail is pale and dashed. Explicit Plan permits choosing another owned line. Save ghost persists a full intended route through plans.ts, keyed by state version, room, player and contract; the in-session cache also retains saves across turns if browser storage fails. preparePlan reconciles stored intent against real construction but never supplies a pending live peg. Diverged plans remain visible and labeled until revised or cleared. Confirm revalidates and dispatches exactly one player-selected placement; saved or unsaved tails never enter a reducer payload. Hotseat veils hide private sketches and saved routes. The 21 Engineering goals use text and placeholder category symbols; Destination illustrations remain. Exact rules are code-rendered.

Subway touch/table continuation: the camera adds reduced-motion-aware momentum after drag, with new-touch cancellation and scoped WebKit selection/callout suppression. Opponent panels begin collapsed and company plaques have bounded widths. Construction schedule presents selected-round order and per-line build/Undo facts through constructionHistory, projecting only public fields from telemetry. Survey purchases, placements and scoring are removed in state v22.

Ordinary route purchases dispatch directly from a priced button on the offer. Card drafting shows disabled availability on the face; current Engineering goals are readable inline. GameView serializes pending UI dispatches and reports rejected actions in its status strip. Planner context alone initializes automatic planning, including React's mount-effect replay; loading saved plans does not reset it. Hiring and subsequent active routes focus the pegboard. Target navigation respects the measured HUD bands. The camera opens the first hand/line piece, or current construction controls at a consistent working zoom. Construction history follows the current actions in visual and keyboard order. Results wrap for narrow screens and put the score breakdown before report export (DEC-033).

## Neighborhood board (DEC-043/DEC-044, state v19)

Ten stable neighborhood IDs replace point stations: 3 small (6 holes), 6 large
(16 holes), 1 medium (10 holes), with zero automatic neighborhood VP.
`randomStationLayout` packs six four-column interior bays. Each holds one 16-hole
large area with a flat or stepped boundary; four randomly selected bays also hold
a small/medium area grown within the connected complement. Identity order, vertical
reflection, shape and one empty column location use engine randomness. Every area
is connected, areas never overlap, and border holes remain clear. The denser areas
may touch boundaries; 124 interior holes are covered and 51 remain outside areas.
State stores exact `cells`; `stationAt` tests membership. Old station IDs and major/
minor internal category keys remain for cards, but no capacity field or dock cap remains.

Only placing a node inside serves an area. Different company lines transfer at
orthogonally adjacent nodes, anywhere on the board. Sharing an area
alone, diagonals, string-only crossings and opponents do not supply transfers. Every
physical contact uses actual hole geometry, including neighborhood pegs. Sharing an
area alone costs nothing. Longest network counts built segments, not transfer distance.
Engineering card behavior is defined by DEC-051 below. Literal borders remain exact-hole based.

Board footprints render beneath pegs, routes and target rings. Destination highlights
trace full area boundaries. Phone cards, tutorial and report use neighborhood rules;
reports include size, all occupied holes and exact node locations. Plans revalidate
neighborhood membership. State version 20 and local-save key require restart for older layouts/scoring.

### Destination and border objective balance

The deck contains 30 unique missions: 15 pairs (4 VP) and 15 triples (7 VP).
Pair appearances are three per neighborhood, triple appearances four/five. Start
deals one of each without replacement; remaining cards shuffle together for the
once-per-game $3M purchase. A mission checks the intersection of component sets
serving each named area: repeated area visits cannot merge separated networks.

Transfer groups collapse only orthogonal nodes from different lines.
Company components add built segments; longest trail traverses only those weighted
segments with a used-edge mask, adding no transfer length and not summing branches.
Engineering card scopes and awards are specified in the current RULES.md and
DEC-051. Live phone progress and the final ledger use the same evaluator; Undo
recomputes. Area labels show names and sizes, never automatic VP.

### JNCG card and label redesign (DEC-051, state v22)

`engineering.ts` owns 21 definitions, shared rule terms and binary predicates:
seven Line, seven Station and seven Neighborhood cards. `objectiveProgress`
exposes the same score to draft/hand/phone copy, final ledger, reports, bots and
the Card Audit. Single Line, Connected Network and Company-wide are separate
scopes. Endpoint = starter or completed final peg; Across Town/Opposite Corners
accept any qualifying pair in one own network, including two starters/two finals.
Station predicates count whole local clusters of different-line orthogonally adjacent nodes. Only Shared Stations includes opponents; opponents
never bridge own networks. Cluster merging may remove a distinct-station award.
All cards score once at game end, no tiers, with provisional live status.

Final Engineering draft moves directly to free starter placement. Survey phases,
fields, UI and scoring are gone; legacy survey actions are rejected. State v22
requires restart and separates new saves/plans from the old deck. Bot version 3
and audit policy version 2 adapt to the new predicates; simulation remains evidence
about those policies, not human balance or optimal play.

`neighborhoodLabels.ts` chooses a rectangular space wholly inside each actual
footprint, wraps names and adapts fonts to camera zoom within that space. Board
labels use the same area objects as hit testing and scoring, with stronger borders
and size captions. Backings/text are pointer-transparent; peg targets render above.
Generated layouts and the exact JNCG exported layout are regression fixtures.

### Player status, station access and fair drafting (DEC-052, state v23)

The route pool contains 3N+1 contracts for N companies. Copper is the second
seven-segment service (3,5,4,6,3,5,4; $11M; complete 9 VP; unfinished -8 VP).
The reducer ends Procurement after 3N picks, leaving one card. Refilling the
player-count-sized row gives the final picker two choices at every supported count.
Destination names use equal-neighborhood lists, with explicit any-order, no-endpoint
copy shared by faces/reports. Connected unfinished own lines can contribute.

All starter/build holes must be vacant across all companies and lines; plans use
the same validator. Strings still may cross or contact at empty holes. Own network
and Engineering transfer clusters retain orthogonal adjacency. State v23 requires
restart and new plan/replay namespaces. Bot policy v4/audit policy v3 identify new rules.

`stationAccess.ts` returns no fees under DEC-060. Starter/build adjacency joins are
free even with multiple opponents. Historical receipt shapes remain readable.
`routeContacts` still charges distinct geometric contacts with opposing strings;
BUILD transfers those payments and records public money events. Full-state Undo
restores balances and appends a monotonic reversal.

Public money events include only recipients, amounts and reasons. They are bounded
to 20, separate from private telemetry, and pass through companion projections.
`PlayerPads` is outside the remounting iPad table: player name/cash/line codes and
colors, no progress dots, with paired debit/credit and reduced-motion-compatible
transfer animation. Initial load sets a watermark; repeated polls do not replay it.
The measured pad height reserves canvas space. Hotseat uses the measured HUD band.
Phone status is sticky above its scrolling cards and includes own line peg dots,
a separate starter diamond and segment progress. Room/device details move to Settings.

QNHT presentation cleanup: the tablet gear opens a native modal containing table,
device and Lab settings; redundant phase/spectator banners and zoom toolbar are
hidden for the shared tablet. Compact live leaders appear above construction order.
Phone sticky status retains cash and line icons; detailed progress, mode, leaders,
legend and settings live in General. Outstanding hired lines pulse only on their
owner's active turn; completed activations stop. Reduced motion uses a static outline.
Active player pads highlight only during interactive phases, never results.
Payment previews render only for an opponent charge; payment markers arc upward
over 2.6 seconds while preserving existing queue/Undo/remount behavior.

`publicStatus.ts` uses the scoring helper for Largest Cluster size, leaders and
company counts across equally largest groups. Same-line adjacency counts for this
award, unlike Station-card transfers. The display and score cannot disagree due
to separate grouping algorithms. Empty boards have no leader.

## Subway Playtest Lab (WS-005 continuation)

### Full-deck Card Audit

The Card Audit tab enumerates all Engineering/Destination definitions and runs
paired normal/targeted trials at 2/3/4 players. Quick Check defaults to 25 trials;
Full Audit selects 100, and custom counts remain available. Up to two workers
run bounded batches (one when fewer than three logical cores are reported).
Responses commit in catalog order, preserving the contiguous checkpoint cursor. Both arms
begin at an identical legally recorded acquisition prefix; opening deal/offer
screening is bounded and explicitly conditional, not a natural acquisition-rate
estimate. Target utility is audit-only, activates only for an owned card and uses
public state/own hand. Live bot defaults and game scoring remain unchanged.
Scoring fixtures check positive and near-miss cases separately from legal
game records. Summary rates exclude failed/exhausted pairs and include matched n;
detailed statistics include Wilson intervals, tier counts and per-game economics.
The compact Markdown is one row per card; raw actions are separate replay files.
Statistics use the same reducer without per-action recording/hashing after the
acquisition prefix. Missing success/miss examples are deterministically rerun with
full recording, compared against the statistics and replay-verified in the worker.
Only statistics and selected witnesses cross back to the page. Policies/seeds and
matched denominators are unchanged; zero successes never proves impossibility.

IndexedDB `subway-card-audit-v1` stores the current audit metadata, incremental
paired results and at most one success/miss replay per card/arm. Each write checks
run identity/sequence against concurrent tabs. Reload resumes completed-pair
boundaries only under the same rules/build/bot/audit version. Stop waits for the
active batch of at most two pairs; leaving the tab terminates all workers. Storage failure pauses;
browser suspension is not server-side automation. Checkpoints are device-local
and can be cleared by the browser; MD/detailed JSON/replay downloads are backups.
Large full audits are owner-triggered, not implied by a smoke test.

`/subway/lab` creates production companion test rooms, runs browser-worker simulation
batches, and verifies/imports digital replays. `/subway` remains the quick complete
tabletop and `/test/subway` retains the isolated scene inspector. No phone-only
multiplayer board exists. The iPad still owns construction; phone screens are reused.

Optional `CompanionStore.lab` declares 2–4 human/bot/remote seats. One separate phone
controller credential has a bounded managedIds list; it can select only human seats
in that list, never invited friends or board powers. External phones join reserved
remote seats. Bot devices are server-only; iPad LAB_STEP generates one policy action
and passes it back through normal companion role/turn/revision/receipt enforcement.
Bot automation defaults on for the lab session. The open iPad waits through human
turns and resumes on bot turns across rounds; explicit pause/resume is retained in
local storage per room/device. Transient network/revision conflicts retain automation with a retry delay; genuine
bot request failures pause locally with visible error.
The iPad still drives requests; a closed or inactive browser is not a server scheduler.
Each request is persisted with CAS.
Changing a managed seat between human/bot and its profile is recorded. Normal rooms
reject LAB actions. The controller recovery key is returned only on creation; retain
it on the original iPad or phone. Existing device recovery restores room progress.
The first testing phone can also pair by room code using “My testing phone · Playtest
Lab”, before or after start. In labs without remote seats, ordinary phone joining
also pairs the controller. Mixed labs keep ordinary joins reserved for friends.
A CAS-protected controllerPaired flag permits only one code-only pairing; a separate
phone token is issued without invalidating the original recovery key. Room-code
possession grants this first pairing, so share the code only with intended testers.

Game randomness remains server-private; the test seed controls only bot choices.
Bots use the same bounded policy as simulation (`bots.ts`), own-hand/public-state
projection and versioned balanced/destination/completion/cautious weights with
casual/experienced candidate search. They are initial, uncalibrated heuristics.
They use objective evaluation and physical transfer utility, not automatic area VP.
The older scene/regression driver remains a separate simple legal-action fixture.

New companion games record setup and every accepted reducer action with all clock
and random values plus resulting state fingerprints. `recording.ts` verifies tapes,
state hashes and final equality under matching state version/rules source fingerprint.
The build embeds the source hash of config/network and Git build ID. There is no
state-version bump: recordings/lab are optional companion sidecars, not game rules.
Old rooms without recordings continue playing and retain text reports. Full replay
exports are available at RESULTS, or to the test iPad during a test. Poll responses
never contain recording tapes/initial state or device credentials. Authenticated
rejected attempts are bounded diagnostics outside the accepted-action stream;
concurrent diagnostic writes are best-effort and cannot overwrite accepted moves.

A dedicated worker runs 1–100 simulations per batch without blocking the UI and can
be terminated. Individual full records and batch summaries download locally. Imported
matching records must replay successfully before comparison; cohorts separate human
calibration/holdout, mixed, bots and simulation, matching rules and player count.
Replay is inspectable at any accepted action, with ordinary read-only game rendering.
Browser imports and batch results are session-local; downloadable records are the
transfer format. No human data has yet been supplied or calibration claimed.

`playtests/subway/index.json` indexes immutable SHA-256 original-export directories.
`archive-subway-playtest.mjs` preserves raw bytes, metadata, observations and analysis,
deduplicates reimports and labels malformed/legacy files reference-only. Structured
records are unverified until checked by the lab; catalog entries never imply verified
calibration. AGENTS.md requires archiving shared owner exports in the repository.
No GitHub credentials or repository write path are shipped to browsers.

### PRWK playtest interaction follow-up

Destination highlights are per-player, per-card opt-in selections in the companion
sidecar. They persist across turns and reconnects until their owner disables them.
Phones can toggle their own cards outside board turns; the iPad displays all enabled
cards with unique company/card labels, colors and a legend. Other phones receive
only their own selections. Enabling explicitly reveals destinations on the shared
board; unselected private cards remain hidden. The old single highlight migrates
on its next toggle. This changes only annotations, not reducer actions or scoring.

Results offer an MD File via the native share sheet directly from a user click,
with blob download and existing copy/text fallbacks. Both companion phones and
iPads expose it at results; quick tabletop uses the same save controls.
Engineering descriptions identical to their requirements render only once.

### Largest Cluster and company-aware bot planning (DEC-054)

State v24 integrates the separate public Largest Cluster award with the later no-stacking/card/payment rules. The pure cluster helper
groups route-node holes across companies with orthogonal adjacency, deduplicates
each company's presence per hole, and ignores strings, diagonals and Survey Pins.
It aggregates company counts across all equally largest groups, then awards once:
6/3/2/0 VP per leader for one/two/three/four leaders. The existing score ledger and
MD export display the result. Existing versions require restart; the deployment
rules fingerprint includes the new cluster source as well as config/network.

Bot policy v5 assigns whole Destination missions and unvisited Citywide areas to
lines as heuristic jobs. A beam search compares up to eight hypothetical placements
with hard 480-state experienced / 120-state casual bounds. Forecast utility includes
owned card points, route completion/penalties, tolls, completion cash, final debt,
cluster points and spatial guidance. First-to-complete ownership is forecast too.
Future crews use an explicit $2M marginal estimate; the existing exact schedule
search still chooses actual hiring, so this is not a perfect economic forecast.
Procurement accounts for portfolio construction reserve. No LLM or external service.

A bounded 96-entry memo retains computed paths for identical relevant observations.
Actual node, cash, round, goal or profile changes replan; cold cache and warm cache
give identical answers. This conservative invalidation avoids stale paths and
preserves audit regeneration across workers; it does not reuse paths after moves.
The fifth argument to chooseBotAction disables new planning for reproducible v2
baseline comparisons; production callers use v3. Both policies still use current
game rules. Historical audit checkpoints reject the changed bot/rules versions.

### GZZF bot, starter and report correction (DEC-048)

State v21 requires empty starter holes: any company's existing route node or a
Survey Pin blocks a new starter at that exact hole. Reducer validation and legal
target lists share enforcement. Adjacent starters and ordinary shared-peg
construction transfers/tolls remain legal. Existing v20 games/replays require
their original rules or a restart; no old placement is silently relocated.

Bot policy v2 uses a bounded remaining-round/three-line schedule search and
completion-subset evaluation. Objective gains on unfinished lines remain possible
and are evaluated as one-step alternatives. Costs include crews, completion cash
and final debt, with unknown future geometry/tolls explicitly optimistic. Current
public state and owned hands shape candidate placements using component mission
progress, border-goal reach and legal continuation. Economy constants are unchanged.

Results-only companion projection supplies recorded human, bot and unknown action
counts per company, current control/profile and recorded bot version. This never
exposes recording tapes or credentials. Both report controls use that projection;
without provenance reports say Unknown. Mixed/missing tags never become pure-human
evidence. Objective diagnostics give missing areas, disconnected networks, exact
Engineering requirements and binary status. ContractCard receives completed
segments consistently for fraction, recipe chips and bar.

PR #183 integration (2026-09-16): state v24, bot v5 and audit v4 prevent reuse of
older scoring/planning evidence. Forecasts charge starter access, retain paid
access and credit opponents. Current Engineering guidance replaces obsolete card
heuristics. Historical policy-v3 benchmarks remain evidence of the older rules,
not performance claims about this integrated version. Rulebook drafts remain
unreviewed; their Largest Cluster scoring text now reflects PR #183.

### Optional Subway bend modes (DEC-055)

Setup on local, companion-host and Lab surfaces selects immutable `bendMode`:
straight (default), tokens, or delayed. State v25 protects older persisted rooms.
`paths.ts` separates physical legs from scoring nodes: endpoint `via` stores
completed incoming bends; line `work` stores unfinished construction vertices.
`bends.ts` owns shared path validation, actual contact projection and legal-move
search. Reducer BUILD validates path, buys/spends tokens if needed, charges only
new physical contacts, then appends work or a scoring peg. Undo restores all
placement effects. Work consumes the selected crew without consuming other crews.

Board strings, overlap and crossing checks use all physical legs. Transfers,
neighborhoods and cards still see real route pegs only. Network graph keeps one
edge per completed segment, weighted by its entire path; partial work earns no
length. Setup mode and resources survive JSON storage, reconnect and replay and
appear in exports. Bot v6/audit v5 discover legal mode-aware actions. Saved plans
retain actual bend vertices but remain private non-binding sketches.

### DGLE playtest follow-up (DEC-056, state v26)

Connecting a held Destination mission pays $2M (pair) or $3M (triple) once, recorded in
`destinationsPaid` and as a bank money event, inside the same BUILD (or purchase) that
first connects it; full-state Undo reverses it. `cardPurchaseBlocker` is the single
source of purchase legality for BUY_DESTINATION and the new BUY_ENGINEERING (random
unheld goal from the shuffled deck or face-up row, $3M, once per game; DEC-060); both are allowed from the
acknowledged company on the iPad and from its phone, and `BuyCardButton` is the one
chooser used on both. The tablet projection keeps every company's Engineering and
Destination card ids (never decks); `PlayerPads` renders `CardGlyphs` (category base
shape plus per-card detail, green when met) and neighborhood abbreviation chips.
`turnSummary` derives a since-your-last-action recap from public telemetry and events;
the iPad flashes it after ACK_COMPANY. `deviceSession` stamps the saved companion
identity while polling; after twenty idle minutes a reopened page peeks once and either
forgets a finished/missing room or asks Resume/Leave, never deleting the recovery key
silently. Destination faces are slim (label, pictures, names) with rules behind a
disclosure; the phone header carries an R round badge.

### Ending-cash spectrum, lookahead and curve wording (DEC-057, state v27)

`SUBWAY_CONFIG.cashBands` supplies positive VP bands and the debt display bucket; scoring,
the build-cost preview, the crew bill, the phone summary, the bots and the public bar
all use `cashScore` for amounts and `cashBand` for display grouping; DEC-060 makes debt linear. `lookahead.ts`
derives the yellow next-step markers from the selected target: normally the legal
targets of the state that build would produce, and while a bend is being placed the
holes where the segment could still finish beyond it. It is pure, client-only and
unrelated to saved ghost plans. A line's change of heading is a curve everywhere in
rules, UI and config (`geometry.maxCurveDegrees`); "turn" means a company's turn.

### Strategy telemetry (DEC-058, classifier 1.0.0)

`src/games/subway/strategy/` is an analysis layer with no path back into gameplay:
`features.ts` replays the accepted-action log to rebuild each company's geometry
action by action (peg counts repair Undo) and derives behavioural features,
including field-wide means so "distinctive" can be told from "ordinary for this
game"; `classifiers.ts` turns features into thirteen 0-100 scores with separate
confidence and supporting metrics; `index.ts` assembles the per-company
fingerprint, the up-to-three primary reads, cumulative end-of-early and
end-of-mid snapshots, dataset rows and the occurrence/combination aggregates.
`STRATEGY_OCCURRENCE_THRESHOLD` and `STRATEGY_EVIDENCE_FLOOR` are defined once.
The playtest report renders the section and archives the fingerprints, raw
features and rows as JSON, versioned by classifier, rules fingerprint and state
version. `deepOptionality` trades the legal-continuation scan for speed in batch
runs and the affected classifier lowers its own confidence when it is skipped.

### YMIF optional lengths and compact status (DEC-059, state v28)

Local and companion setup select exact (default) or flexible segment length.
`validatePath` remains authoritative for previews and reducer placement: flexible
segments may finish at 1 through printed length with existing tolerance; bends and
unfinished work share the same budget. Bot candidate offsets distinguish modes.
Reports record the mode. Existing games require restart via the version guard.
Phone goals/destinations sit beside its route list; a transient banner marks turn
entry. Shared iPad panels carry one current-company route-progress strip and
per-company award strips. Awards derive from existing public standings.


### YMIF economy and card-draw continuation (DEC-060, state v29)

New setup defaults to delayed construction; straight-only is hidden but retained
internally for legacy fixtures/replays. Authoritative `validatePath` limits both
modes to one bend per segment, counting existing delayed work. The next hired
activation must finish the remaining budget. Delayed lookahead simulates the
pending worksite and validates each finishing hole with the same validator.
One dismissible badge sits beside one yellow dot; room/start-specific local
storage keeps it dismissed through tablet remounts and refreshes for that game.

Companion projections expose only `drawPileCounts`, never shuffled deck identities.
The shared purchase blocker uses those counts on clients and real decks in the
reducer. Both extra card types cost $3M, one extra each before hiring. Engineering
can be either face-up goal or random; face-up draws refill the row to two if supply
remains. Companion face-up drafting/purchasing is phone-only; tablet random draft
uses the current drafting actor, and random purchases require acknowledged company.
Phones show held Engineering cards before the always-visible public market and
Destination pages offer a matching draw area with availability reasons.

The iPad recap groups between-turn telemetry cash deltas by paying opponent,
including before a company's first construction turn, and shows the player total
separately from bank cash. Phone turn banners are unchanged. Destination faces
show their $2M/$3M completion reward and use `destinationsPaid` for Earned status.

## Subway host introduction

`HowToPlay` opens a read-only native dialog from local setup, companion entry/lobby,
phone General and table Settings. Sixteen short slides use deterministic peg-grid
SVG examples; a before/after join illustrates company connectivity. `introRoutes`
is shared with regression tests against the authoritative network and Destination
helpers. Selected bend and segment-length modes are the only input props. The
component has no game state, reducer dispatch, persistence or network access.
Closing restores focus and leaves the table mounted. The older `/subway/tutorial`
practice table remains separately accessible. Compact phone status is unchanged.

### Completed-company extensions (DEC-062, state v30)

Three completed contracts unlock one short extension on each subsequent company
turn. `HIRE_CREWS` selects at most one extendable owned line and marks `extending`
without charging; `BUILD` validates the normal geometry plus a 1–2-space straight
placement budget, period and expected node count. Only accepted placement charges
$1M plus contacts, using construction borrowing. Empty selection or skipping costs
nothing. Card purchases close when the action is selected. No completion cash repeats.

`route` includes all physical stations; `segmentsBuilt` caps at recipe length and
`recipeEndpoint` identifies the original final station for endpoint Engineering.
Network/transfer/destination evaluators include appended stations and strings.
Undo snapshots restore the fee and all route/payment/turn effects. Legal move and
exhaustion checks include eligible completed companies; the nine-round limit remains.
Bots, companion projections and recorded replays use the same HIRE/BUILD path.

The merged introduction also explains paid extensions and uses the extension-aware
end condition; the original connection lesson and setup-mode guidance are retained.
