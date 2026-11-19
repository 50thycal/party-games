import assert from "node:assert/strict";
import type { GameContext, Player, Room } from "../src/engine/types";
import { tableSoccerGame, type TableSoccerAction } from "../src/games/table-soccer/config";
import {
  ballAt, canPlaceBumper, DEFAULT_TABLE, defaultPhones, fitPhone, GOALIE_LIMIT, goalieSaves,
  limitedPull, simulateShot, toPhone, toWorld, validLayout,
} from "../src/games/table-soccer/physics";

const table = DEFAULT_TABLE;
const ids = ["a", "b", "c", "d"];
const [a, b, c, d] = defaultPhones(ids, table);
const straight = { x: 0, y: 6.5 };
const bankPull = limitedPull({ x: -4, y: 6.5 });
const bumperA = { playerId: "a", x: 92, y: 60 };
const bumperB = { playerId: "b", x: 35, y: 45 };

assert(validLayout(table, [a, b, c, d]));
assert(!validLayout(table, [a, { ...b, x: a.x, y: a.y, angle: 32 }]));
assert(validLayout(table, [a, fitPhone({ ...b, x: -40, angle: 44 }, table)]));
assert(validLayout({ width: 65, length: 50 }, defaultPhones(ids, { width: 65, length: 50 })));
const oriented = toPhone(toWorld({ x: 3, y: 4 }, c), c);
assert(Math.abs(oriented.x - 3) < 1e-9 && Math.abs(oriented.y - 4) < 1e-9);
assert(canPlaceBumper(bumperA, table, [a, b], []));
assert(!canPlaceBumper(bumperA, table, [a, b], [bumperA]));
assert(!canPlaceBumper(a, table, [a, b], []));
assert(!canPlaceBumper({ x: 0, y: 0 }, table, [a, b], []));
console.log("PASS table bounds, rotated phone transforms, and bumper clearance");

const direct = simulateShot(table, [a, b], [], a, straight);
assert.equal(direct.crossing?.playerId, "b");
assert(Math.abs(direct.crossing!.x) < 1e-9);
assert(simulateShot(table, [a, { ...b, y: 24 }], [], a, straight).duration < direct.duration);
assert.equal(simulateShot(table, [a, b, c, d], [], c, straight).crossing?.playerId, "d");
assert.equal(simulateShot(table, [a, { ...b, angle: 0 }], [], a, { x: 0, y: 2 }).crossing, null);
const bank = simulateShot(table, [a, b], [bumperA, bumperB], a, bankPull);
assert.equal(simulateShot(table, [a, b], [], a, bankPull).crossing, null);
assert.equal(bank.crossing?.playerId, "b");
assert(!goalieSaves(0, bank.crossing!.x));
assert(goalieSaves(-GOALIE_LIMIT, bank.crossing!.x));
assert(bank.frames.every((frame, index) => index === 0 || frame.ms > bank.frames[index - 1].ms));
assert.deepEqual(ballAt(bank.frames, bank.duration), bank.frames.at(-1));
assert.deepEqual(simulateShot(table, [a, b], [bumperA, bumperB], a, bankPull), bank);
console.log("PASS straight, rotated, bank and missed shots with deterministic animation frames");

const players: Player[] = ids.slice(0, 2).map((id, index) => ({ id, name: `Player ${id}`, role: index === 0 ? "host" : "player" }));
const room: Room = { roomCode: "TEST", gameId: tableSoccerGame.id, hostId: "a", players, mode: "multiplayer", createdAt: 0 };
let state = tableSoccerGame.initialState(players);
let now = 10_000;
function act(type: string, playerId: string, fields: TableSoccerAction["payload"] = {}, expected = true) {
  const ctx: GameContext = { now: () => now, random: () => 0.5, playerId, room };
  const action: TableSoccerAction = { type, playerId, payload: { match: state.match, turn: state.turn, ...fields } };
  assert.equal(tableSoccerGame.isActionAllowed?.(state, action, ctx), expected, type);
  const next = tableSoccerGame.reducer(state, action, ctx);
  if (!expected) assert.equal(next, state, type);
  else assert.equal(next.revision, state.revision + 1, type);
  state = next;
}

act("SOCCER_OPEN_SETUP", "b", {}, false);
act("SOCCER_OPEN_SETUP", "a");
act("SOCCER_CONFIRM_LAYOUT", "a", { table, phones: [a, { ...b, playerId: "c" }] }, false);
act("SOCCER_CONFIRM_LAYOUT", "a", { table, phones: [a, b] });
act("SOCCER_PLACE_BUMPER", "a", { point: bumperA, placement: "initial" });
act("SOCCER_PLACE_BUMPER", "a", { point: bumperB, placement: "initial" }, false);
act("SOCCER_PLACE_BUMPER", "b", { point: bumperB, placement: "initial" });
assert.equal(state.phase, "aim");
act("SOCCER_KICK", "b", { pull: straight }, false);
act("SOCCER_KICK", "a", { pull: { x: NaN, y: 3 } }, false);
act("SOCCER_KICK", "a", { pull: bankPull });
act("SOCCER_SETTLE", "a", {}, false);
act("SOCCER_GOALIE", "a", { x: -GOALIE_LIMIT }, false);
act("SOCCER_GOALIE", "b", { x: GOALIE_LIMIT + 1 }, false);
act("SOCCER_GOALIE", "b", { x: -GOALIE_LIMIT, turn: 99 }, false);
act("SOCCER_GOALIE", "b", { x: -GOALIE_LIMIT });
now = state.shot!.settlesAt;
act("SOCCER_GOALIE", "b", { x: 0 }, false);
act("SOCCER_SETTLE", "b");
assert.equal(state.lastResult?.kind, "save");
assert.deepEqual(state.scores, [0, 0]);
assert.equal(state.shooterIndex, 1);
console.log("PASS server-authoritative live save, turn validation and late input rejection");

for (let score = 1; score <= 3; score += 1) {
  act("SOCCER_KICK", "b", { pull: { x: 0, y: 1 } });
  now = state.shot!.settlesAt;
  act("SOCCER_SETTLE", "a");
  assert.equal(state.lastResult?.kind, "miss");
  act("SOCCER_KICK", "a", { pull: bankPull });
  now = state.shot!.settlesAt;
  act("SOCCER_SETTLE", "b");
  assert.equal(state.lastResult?.kind, "goal");
  assert.deepEqual(state.scores, [score, 0]);
  act("SOCCER_SETTLE", "a", {}, false);
  if (score < 3) {
    const point = { x: 20 + score * 12, y: 25 };
    assert.equal(state.phase, "bonus-bumper");
    act("SOCCER_PLACE_BUMPER", "b", { placement: "bonus", point }, false);
    act("SOCCER_PLACE_BUMPER", "a", { placement: "initial", point }, false);
    act("SOCCER_PLACE_BUMPER", "a", { placement: "bonus", point });
  }
}
assert.equal(state.phase, "finished");
assert.equal(state.bumpers.length, 4);
act("SOCCER_PLACE_BUMPER", "a", { placement: "bonus", point: { x: 50, y: 10 } }, false);
act("SOCCER_PLAY_AGAIN", "b", {}, false);
act("SOCCER_PLAY_AGAIN", "a");
assert.deepEqual(state.scores, [0, 0]);
assert.deepEqual(state.phones, [a, b]);
assert.deepEqual(state.bumpers, []);
act("SOCCER_CONFIRM_LAYOUT", "a", { match: 1, table, phones: [a, b] }, false);
console.log("PASS scorer-only extra bumpers, first to three, rematch and stale request rejection");
