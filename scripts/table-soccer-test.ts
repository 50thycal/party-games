import assert from "node:assert/strict";
import type { GameContext, Player, Room } from "../src/engine/types";
import { tableSoccerGame, type TableSoccerAction } from "../src/games/table-soccer/config";
import { applySoloAction, nextBotAction, soloRoom, SOLO_PLAYER_ID } from "../src/games/table-soccer/solo";
import {
  BALL_RADIUS, ballAt, canPlaceBumper, DEFAULT_TABLE, defaultPhones, fitPhone, GOALIE_LIMIT, goalieSaves,
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
const railPhone = { ...a, x: 9 };
const legacyRailBumper = { playerId: "a", x: 4.65, y: 55 };
assert(!canPlaceBumper(legacyRailBumper, table, [railPhone, b], []));
assert(canPlaceBumper({ x: 5.81, y: 55 }, table, [railPhone, b], []));
const railAngle = Math.PI / 9;
const railFlight = simulateShot(table, [railPhone, b], [legacyRailBumper], railPhone, {
  x: 5 * Math.sin(railAngle), y: 5 * Math.cos(railAngle),
});
assert(railFlight.frames.every((frame) => frame.x >= BALL_RADIUS));
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
assert(state.shot!.startsAt > now, "networked shots retain time for the defender to receive the flight");
act("SOCCER_SETTLE", "a", {}, false);
act("SOCCER_GOALIE", "a", { x: -GOALIE_LIMIT, sequence: 1 }, false);
act("SOCCER_GOALIE", "b", { x: GOALIE_LIMIT + 1, sequence: 1 }, false);
act("SOCCER_GOALIE", "b", { x: -GOALIE_LIMIT, sequence: 1, turn: 99 }, false);
act("SOCCER_GOALIE", "b", { x: -GOALIE_LIMIT, sequence: 2 });
act("SOCCER_GOALIE", "b", { x: GOALIE_LIMIT, sequence: 1 }, false);
act("SOCCER_GOALIE", "b", { x: GOALIE_LIMIT, sequence: 2 }, false);
now = state.shot!.goalieUntil!;
act("SOCCER_GOALIE", "b", { x: 0, sequence: 3 }, false);
act("SOCCER_SETTLE", "a", {}, false);
now = state.shot!.settlesAt;
act("SOCCER_SETTLE", "b");
assert.equal(state.lastResult?.kind, "save");
assert.deepEqual(state.scores, [0, 0]);
assert.equal(state.shooterIndex, 1);
console.log("PASS server-authoritative live save, turn validation and out-of-order or late input rejection");

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

for (const count of [1, 3]) {
  const solo = soloRoom(count);
  let simulated = tableSoccerGame.initialState(solo.players);
  let clock = 1000;
  const local = (type: string, fields: TableSoccerAction["payload"] = {}) => {
    simulated = applySoloAction(simulated, solo, {
      type, playerId: SOLO_PLAYER_ID, payload: { match: simulated.match, turn: simulated.turn, ...fields },
    }, clock);
  };
  const bot = () => {
    const plan = nextBotAction(simulated, clock);
    assert(plan && "action" in plan);
    const previous = simulated;
    clock += plan.waitMs;
    simulated = applySoloAction(simulated, solo, plan.action, clock);
    assert.notEqual(simulated, previous);
  };
  local("SOCCER_OPEN_SETUP");
  local("SOCCER_CONFIRM_LAYOUT", { table, phones: simulated.phones });
  for (let i = 0; i < count; i += 1) bot();
  assert.equal(nextBotAction(simulated, clock), null);
  local("SOCCER_PLACE_BUMPER", { placement: "initial", point: { x: 120, y: 55 } });
  assert.equal(simulated.phase, "aim");
  local("SOCCER_KICK", { pull: { x: 0, y: 1 } });
  assert.equal(simulated.shot!.startsAt, clock, "one-phone player shots start at release");
  clock = simulated.shot!.settlesAt;
  local("SOCCER_SETTLE");
  bot();
  assert.equal(simulated.phase, "flight");
  const shot = simulated.shot!;
  assert(shot.startsAt > clock, "CPU shots give the human defender a reaction window");
  assert.equal(shot.crossing?.playerId, SOLO_PLAYER_ID);
  local("SOCCER_GOALIE", { x: shot.crossing!.x, sequence: 1 });
  clock = shot.settlesAt;
  local("SOCCER_SETTLE");
  assert.equal(simulated.lastResult?.kind, "save");
}
console.log("PASS solo match setup, automatic placement, CPU shots and human saves");

const crampedRoom = soloRoom(3);
const crampedTable = { width: 65, length: 50 };
const crampedPositions = [
  { x: 11.8929624, y: 14.2201239, angle: 97 },
  { x: 42.3560905, y: 12.9909433, angle: 83 },
  { x: 46.5126491, y: 36.4175115, angle: 213 },
  { x: 15.9549492, y: 38.4618566, angle: 292 },
];
const crampedPhones = crampedPositions.map((point, index) => ({ ...point, playerId: crampedRoom.players[index].id }));
assert(validLayout(crampedTable, crampedPhones));
const crampedState = {
  ...tableSoccerGame.initialState(crampedRoom.players),
  phase: "initial-bumpers" as const,
  table: crampedTable,
  phones: crampedPhones,
  players: crampedRoom.players,
  bumpers: [
    { playerId: SOLO_PLAYER_ID, x: 23.8, y: 27.8 },
    { playerId: "cpu-1", x: 33, y: 30 },
    { playerId: "cpu-2", x: 57, y: 24 },
  ],
};
const crampedPlan = nextBotAction(crampedState, 1000);
assert(crampedPlan && "action" in crampedPlan);
const fromCramped = applySoloAction(crampedState, crampedRoom, crampedPlan.action, 1300);
assert.equal(fromCramped.phase, "aim");
assert.equal(fromCramped.bumpers.length, 4);
console.log("PASS CPU finds a valid bumper on a cramped, rotated layout");
