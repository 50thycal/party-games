# Party Games Engine

A Jackbox-style multiplayer game framework built with Next.js

This project is a modular party game engine that lets developers quickly build simple multiplayer games that friends can play together by joining a shared room on their phones.

It uses a plugin-style architecture:
- The engine manages rooms, players, actions, state transitions, and syncing.
- Each game defines its own reducer, state machine, and UI.
- Games can be added by simply creating a folder and registering it — no changes to core engine files.

This design makes the system easy to extend, fast to iterate, and ideal for building lots of small party-style games.

---

## Live System Architecture Overview

The project is built using Next.js App Router with a clean separation between:

### 1. Engine (server-side logic)

Handles everything related to the game simulation:
- Room creation (`/api/create-room`)
- Joining rooms (`/api/join-room`)
- Polling room & game state (`/api/get-room`)
- Dispatching player actions (`/api/game-action`)
- Running reducers for each game
- Validating allowed actions
- Keeping room state in an in-memory store (dev-friendly)

The engine is game-agnostic — it does not know anything about UI or phases of any specific game.

---

### 2. Game Templates (server-side logic)

Each game defines:
- `initialState(players)`
- `reducer(state, action, ctx)`
- `getPhase(state)`
- `isActionAllowed(...)`

A game has full control over its state machine — phases, rules, winning logic, etc.

All games conform to the same template, so the engine can run any game without modification.

---

### 3. Game Views (client-side React components)

Each game provides a `GameView` component that receives:

```typescript
{
  room,
  state,      // gameState
  playerId,
  isHost,
  dispatchAction
}
```

This lets each game:
- Show its own UI
- Send arbitrary actions to the server via `dispatchAction`
- Render differently based on host vs. player role
- Use any internal UX patterns without affecting other games

---

### 4. Generic Room Page

`RoomPage` is fully generic:
- It loads room + gameState via polling
- Detects if the user is the host
- Looks up the active game in:
  - `gameRegistry` (logic)
  - `views.ts` (UI)
- Renders:
  - Shared chrome (players, header)
  - Game-specific view component

The room page never needs to be updated when new games are added.

---

## How Games Work

All games follow the same lifecycle:
1. Host chooses a game on the Create Room page.
2. Room is created with:
   - Unique 4-letter code
   - Selected game's ID
   - Host identity
3. Players join using the room code.
4. Game reducers drive all state changes.
5. The engine stores and syncs the updated state.
6. Views re-render using the new gameState.

---

## How to Add a New Game

This is where the engine shines.

To add a new game:

### Step 1 — Create a folder

Example:

```
/src/games/trivia-blitz/
```

### Step 2 — Add a config file

`/src/games/trivia-blitz/config.ts`

This file defines:

```typescript
export const triviaBlitzGame = defineGame({
  id: "trivia-blitz",
  name: "Trivia Blitz",
  minPlayers: 2,
  maxPlayers: 10,

  initialState(players) { ... },
  reducer(state, action, ctx) { ... },
  getPhase(state) { return state.phase; },
  isActionAllowed() { ... }
});
```

All game logic lives here.

---

### Step 3 — Add UI

Create:

`/src/games/trivia-blitz/GameView.tsx`

The component receives shared game props:

```typescript
export type GameViewProps = {
  room;
  state;
  playerId;
  isHost;
  dispatchAction(type, payload);
};
```

Use `dispatchAction('ACTION_NAME', payload)` to send actions to the server.

---

### Step 4 — Register the game

Add to `/src/engine/gameRegistry.ts`:

```typescript
import { triviaBlitzGame } from "@/games/trivia-blitz/config";

games.set(triviaBlitzGame.id, triviaBlitzGame);
```

And to `/src/games/views.ts`:

```typescript
import { TriviaBlitzGameView } from "./trivia-blitz/GameView";

// Add to gameOptions array
export const gameOptions: GameOption[] = [
  // ... existing games
  {
    id: "trivia-blitz",
    name: "Trivia Blitz",
    description: "Fast-paced trivia battles!",
    minPlayers: 2,
    maxPlayers: 10,
  },
];

// Add to gameViews registry
const gameViews: Record<string, GameViewComponent> = {
  // ... existing games
  "trivia-blitz": TriviaBlitzGameView as GameViewComponent,
};
```

---

### Step 5 — Your game now appears in the dropdown on the Create Room page

That's it.

One deploy → new game is live.

---

## Local Development

```bash
npm install
npm run dev
```

Access on your phone:
- Find your machine's LAN IP (e.g. `192.168.1.12`)
- Visit: `http://192.168.1.12:3000`

This is the best way to test multi-device behavior.

---

## About In-Memory Storage

Rooms and game state are stored in an in-memory Map.
- Works great locally.
- Fine for short sessions on Vercel.
- Rooms reset when serverless instances restart or redeploy.

Future improvement: plug in Redis or a KV store for persistence.

---

## Deployment

Every push to main redeploys to Vercel.

You do not need a new project for each game — all games live inside one engine and deploy together.

---

## Why This Architecture Rocks

- Fastest possible iteration loop
- No backend changes needed to add new games
- Reasonable for tiny prototypes, but strong enough for a real product
- Clean separation:
  - Server handles logic
  - Client handles UI
  - Reducers enforce rules
- Flexible: turn-based games, trivia, voting games, bluffing games — all follow the same pattern

---

## Future Extensions

- Replace in-memory store with Redis/KV
- Add WebSockets for real-time sync
- Add animations or transitions per-game
- Create reusable game components (timers, buzzers, modals)
- Add a Game Browser homepage

---

## Project Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── api/               # API routes (create-room, join-room, etc.)
│   ├── create/            # Create room page
│   ├── join/              # Join room page
│   └── rooms/[roomCode]/  # Generic room page
├── engine/                # Core game engine
│   ├── types.ts           # Type definitions
│   ├── stateStore.ts      # In-memory room storage
│   ├── gameRegistry.ts    # Game template registry
│   ├── applyActionToRoom.ts # Action dispatcher
│   └── defineGame.ts      # Helper for defining games
├── games/                 # Game implementations
│   ├── views.ts           # Client-side view registry
│   └── number-guess/      # Example game
│       ├── config.ts      # Game logic
│       └── GameView.tsx   # Game UI
└── lib/                   # Utilities
    └── playerIdentity.ts  # localStorage identity helper
```

---

Made with care. Have fun building games with your friends!
