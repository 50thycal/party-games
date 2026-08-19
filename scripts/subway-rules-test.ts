import assert from "node:assert/strict";
import type { GameContext, Player, Room } from "../src/engine/types";
import { legalScheduleStart, scoreGame, subwayGame, validateNode } from "../src/games/subway/config";

const players: Player[] = [
  { id: "red", name: "Red", role: "host" },
  { id: "blue", name: "Blue", role: "player" },
];
const room: Room = { roomCode: "TEST", gameId: "subway", hostId: "red", players, createdAt: 0, mode: "simulation" };
const context = (playerId: string): GameContext => ({ room, playerId, now: () => 1, random: () => 0 });

let state = subwayGame.initialState(players);
state.players.red.contractId = "medium";
assert.equal(legalScheduleStart(state.players.red, 1), true, "a six-period block starts at period 1");
assert.equal(legalScheduleStart(state.players.red, 6), false, "a schedule block may not exceed period 10");

state.phase = "SCHEDULING_PROPOSAL";
state = subwayGame.reducer(state, { type: "PROPOSE_SCHEDULE", playerId: "red", payload: { start: 2 } }, context("red"));
assert.equal(state.players.red.proposedStart, 2, "a legal schedule proposal is stored");
state = subwayGame.reducer(state, { type: "PROPOSE_SCHEDULE", playerId: "red", payload: { start: 9 } }, context("red"));
assert.equal(state.players.red.proposedStart, 2, "an illegal proposal does not replace the schedule");

state.players.blue.contractId = "short";
state.players.blue.route = [{ x: 4, y: 4 }];
assert.match(validateNode(state, "red", { x: 5, y: 5 }) ?? "", /empty hole/, "opposing normal nodes enforce spacing");
assert.equal(validateNode(state, "red", { x: 6, y: 5 }), null, "spacing does not create a large exclusion wall");
assert.match(validateNode(state, "red", { x: 2, y: 2 }, true) ?? "", /normal holes/, "starters cannot occupy stations");

state.players.red.route = [{ x: 0, y: 3 }];
state.players.blue.route = [{ x: 2, y: 1 }, { x: 2, y: 5 }];
state.players.red.committedEngineering = [];
assert.match(validateNode(state, "red", { x: 4, y: 3 }) ?? "", /Crossing Design/, "crossing is illegal without its permit");
state.players.red.committedEngineering = ["crossing"];
assert.equal(validateNode(state, "red", { x: 4, y: 3 }), null, "Crossing Design permits one crossing");

state.players.red.contractId = "short";
state.players.red.route = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 1, stationId: "museum" }];
state.players.red.committedEngineering = ["straight", "long-segment", "terminal"];
state.players.blue.route = [];
const scored = scoreGame(state);
assert.equal(scored.phase, "RESULTS", "scoring advances to results");
assert.ok((scored.players.red.score ?? 0) > 0, "completion, station, and Engineering points are awarded");

console.log("Subway rules checks passed (schedule, starter, spacing, crossing, completion, Engineering scoring).");
