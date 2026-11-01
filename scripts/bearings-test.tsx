import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { GameContext, Room } from "../src/engine/types";
import { landmarkBearingsGame as game, initialState, standings, eligibleLandmarks,
  type BearingsState, type BearingsSettings } from "../src/games/landmark-bearings/config";
import { angularError, initialBearing, isLocation, type Location } from "../src/games/landmark-bearings/geography";
import { LANDMARKS, ORIGINS } from "../src/games/landmark-bearings/places";
import { LandmarkBearingsGameView } from "../src/games/landmark-bearings/GameView";
import { gameOptions, getGameView } from "../src/games/views";
import { getGame } from "../src/engine/gameRegistry";

const room: Room = { roomCode: "TEST", gameId: game.id, hostId: "calvin", createdAt: 0, mode: "multiplayer",
  players: ["calvin", "zoe", "abby", "linda", "george", "keith"].map((id, i) => ({ id, name: id, role: i ? "player" : "host" })) };
let seed = 6;
const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const context = (id: string, r = room): GameContext => ({ playerId: id, room: r, now: () => 1000, random });
function act(state: BearingsState, type: string, playerId = room.hostId, payload: Record<string, unknown> = {}, r = room) {
  return game.reducer(state, { type, playerId, payload: { round: state.round, match: state.match, ...payload } }, context(playerId, r));
}
function start(settings: Partial<BearingsSettings> = {}, r = room) {
  const state = initialState();
  return act(state, "START_GAME", r.hostId, { settings: { ...state.settings, ...settings } }, r);
}
function approx(actual: number | null, expected: number, tolerance = 1e-8) {
  assert.ok(actual !== null && Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
}
let count = 0;
function test(name: string, fn: () => void) { fn(); count++; console.log(`PASS ${name}`); }
const point = (latitude: number, longitude: number): Location => ({ name: "Point", latitude, longitude });

test("cardinal bearings", () => {
  approx(initialBearing(point(0, 0), point(10, 0)), 0);
  approx(initialBearing(point(0, 0), point(0, 10)), 90);
  approx(initialBearing(point(0, 0), point(-10, 0)), 180);
  approx(initialBearing(point(0, 0), point(0, -10)), 270);
});
test("dateline uses shortest great circle", () => approx(initialBearing(point(0, 179), point(0, -179)), 90));
test("coincident and antipodal bearings excluded", () => {
  assert.equal(initialBearing(point(0, 0), point(0, 0)), null);
  assert.equal(initialBearing(point(10, 20), point(-10, -160)), null);
});
test("chat coordinate regressions", () => {
  for (const [id, expected] of [["rushmore", 12.3073], ["empire-state", 68.8406], ["alamo", 132.8451],
    ["bourbon-street", 108.7718], ["niagara", 62.1197]] as const) {
    approx(initialBearing(ORIGINS[0], LANDMARKS.find((p) => p.id === id)!), expected, 0.0001);
  }
});
test("circular error and equivalent north", () => {
  assert.equal(angularError(359, 1), 2); assert.equal(angularError(1, 359), 2);
  assert.equal(angularError(360, 0), 0); assert.equal(angularError(0, 180), 180);
});
test("coordinate validation", () => {
  assert.ok(isLocation(ORIGINS[0]));
  for (const origin of [null, {}, point(NaN, 0), point(90, 0), point(-90, 0), point(0, 181), point(0, Infinity),
    { ...point(0, 0), name: "  " }, { ...point(0, 0), latitude: "30" }]) assert.equal(isLocation(origin), false);
});
test("catalog is unique and all presets give finite answers", () => {
  assert.equal(new Set(LANDMARKS.map((p) => p.id)).size, LANDMARKS.length);
  for (const landmark of LANDMARKS) {
    assert.ok(isLocation(landmark)); assert.ok(landmark.source.startsWith("https://"));
    for (const origin of ORIGINS) assert.ok(Number.isFinite(initialBearing(origin, landmark)));
  }
});
test("registered as a selectable game in both registries", () => {
  assert.equal(getGame(game.id), game); assert.ok(getGameView(game.id));
  assert.equal(gameOptions.find((p) => p.id === game.id)?.maxPlayers, game.maxPlayers);
  assert.equal(gameOptions[0].id, "subway", "preserve the existing default selection");
});
test("host starts selected first landmark, bounded no-repeat deck", () => {
  const state = start({ firstLandmarkId: "alamo", rounds: 10 });
  assert.equal(state.phase, "guessing"); assert.equal(state.round, 1);
  assert.equal(state.deck[0], "alamo"); assert.equal(state.deck.length, 10);
  assert.equal(new Set(state.deck).size, 10); assert.equal(state.players.length, 6);
});
test("pack restrictions and world catalog", () => {
  const state = start({ pack: "world", rounds: 10 });
  assert.equal(state.deck.length, 10);
  assert.ok(state.deck.every((id) => LANDMARKS.find((p) => p.id === id)?.region === "world"));
});
test("origin on a landmark excludes undefined answer", () => {
  const state = initialState();
  const settings = { ...state.settings, origin: LANDMARKS[0] };
  assert.ok(!eligibleLandmarks(settings).some((p) => p.id === LANDMARKS[0].id));
  assert.equal(start({ ...settings, firstLandmarkId: LANDMARKS[0].id }).phase, "lobby");
});
test("settings reject invalid and incompatible values", () => {
  const state = initialState();
  for (const change of [{ rounds: 0 }, { rounds: 11 }, { rounds: 1.5 }, { pack: "mars" },
    { origin: point(95, 20) }, { firstLandmarkId: "missing" }, { pack: "world", firstLandmarkId: "alamo" }]) {
    assert.equal(act(state, "START_GAME", "calvin", { settings: { ...state.settings, ...change } }), state);
  }
});
test("host-only controls, membership and action identity", () => {
  const state = initialState();
  assert.equal(act(state, "START_GAME", "zoe"), state);
  assert.equal(act(state, "START_GAME", "unknown"), state);
  assert.equal(game.reducer(state, { type: "START_GAME", playerId: "calvin" }, context("zoe")), state);
  assert.equal(act(state, "UNSUPPORTED"), state);
  assert.equal(act(state, "START_GAME", "calvin", {}, { ...room, players: room.players.slice(0, 1) }), state);
});
test("valid settings persist and start snapshots the roster", () => {
  let state = initialState();
  state = act(state, "UPDATE_SETTINGS", "calvin", { settings: { ...state.settings, rounds: 3, origin: ORIGINS[1] } });
  assert.equal(state.settings.origin.name, ORIGINS[1].name);
  state = act(state, "START_GAME"); assert.equal(state.players.length, 6);
  const late = { ...room, players: [...room.players, { id: "late", name: "Late", role: "player" as const }] };
  assert.equal(act(state, "SUBMIT_GUESS", "late", { value: 30 }, late), state);
});
test("zero-degree guess counts, 360 normalizes, guesses lock", () => {
  let state = start(); state = act(state, "SUBMIT_GUESS", "calvin", { value: 0 });
  assert.equal(state.guesses.calvin, 0);
  assert.equal(act(state, "SUBMIT_GUESS", "calvin", { value: 100 }), state);
  state = act(state, "SUBMIT_GUESS", "zoe", { value: 360 }); assert.equal(state.guesses.zoe, 0);
});
test("invalid guesses and stale round actions rejected", () => {
  const state = start();
  for (const value of [-1, 361, 25.5, NaN, Infinity, "90", null, undefined]) {
    assert.equal(act(state, "SUBMIT_GUESS", "calvin", { value }), state);
  }
  assert.equal(act(state, "SUBMIT_GUESS", "calvin", { value: 30, round: 0 }), state);
  assert.equal(act(state, "SUBMIT_GUESS", "calvin", { value: 30, match: -1 }), state);
  assert.equal(act(state, "REVEAL_RESULTS"), state, "no empty reveal");
});
test("Bourbon Street round reproduces Abby win and sorted standings", () => {
  let state = start({ firstLandmarkId: "bourbon-street" });
  for (const [playerId, value] of [["calvin", 120], ["zoe", 105], ["abby", 110], ["linda", 130], ["george", 130], ["keith", 100]] as const)
    state = act(state, "SUBMIT_GUESS", playerId, { value });
  assert.equal(act(state, "REVEAL_RESULTS", "zoe"), state);
  state = act(state, "REVEAL_RESULTS");
  assert.deepEqual(state.history[0].winnerIds, ["abby"]);
  approx(state.history[0].errors.abby, 1.22824465, 1e-7);
  assert.deepEqual(standings(state).map((p) => p.id), ["abby", "zoe", "keith", "calvin", "linda", "george"]);
});
test("tied guesses share round wins; reveal retries never score twice", () => {
  let state = start();
  state = act(state, "SUBMIT_GUESS", "calvin", { value: 100 });
  state = act(state, "SUBMIT_GUESS", "zoe", { value: 100 });
  state = act(state, "REVEAL_RESULTS");
  assert.deepEqual(state.history[0].winnerIds, ["calvin", "zoe"]);
  assert.equal(standings(state).find((p) => p.id === "zoe")?.wins, 1);
  assert.equal(act(state, "REVEAL_RESULTS"), state);
});
test("missing guesses cost 180 but cannot win the round", () => {
  let state = start(); state = act(state, "SUBMIT_GUESS", "calvin", { value: 0 });
  state = act(state, "REVEAL_RESULTS"); assert.equal(state.history[0].errors.zoe, 180);
  assert.deepEqual(state.history[0].winnerIds, ["calvin"]);
});
for (const mode of ["multiplayer", "hotseat"] as const) test(`${mode} complete five-round game, serialized persistence and replay`, () => {
  const r = { ...room, mode };
  let state = start({}, r);
  for (let round = 1; round <= 5; round++) {
    for (const player of r.players) state = act(state, "SUBMIT_GUESS", player.id, { value: Math.floor(random() * 360) }, r);
    state = act(state, "REVEAL_RESULTS", r.hostId, {}, r);
    assert.equal(state.history.length, round);
    state = JSON.parse(JSON.stringify(state));
    if (round < 5) {
      state = act(state, "NEXT_ROUND", r.hostId, {}, r);
      assert.equal(act(state, "NEXT_ROUND", r.hostId, { round }, r), state);
      assert.equal(state.round, round + 1); assert.equal(Object.keys(state.guesses).length, 0);
    }
  }
  assert.equal(state.phase, "finished");
  assert.equal(act(state, "NEXT_ROUND", r.hostId, {}, r), state);
  const before = state;
  state = act(state, "PLAY_AGAIN", r.hostId, {}, r);
  assert.equal(state.phase, "lobby"); assert.equal(state.match, before.match + 1);
  assert.equal(state.history.length, 0);
  state = act(state, "START_GAME", r.hostId, {}, r);
  assert.equal(act(state, "SUBMIT_GUESS", "calvin", { value: 30, match: before.match }, r), state);
});
test("reducer never mutates input and remains JSON serializable", () => {
  const state = start(); const serialized = JSON.stringify(state);
  act(state, "SUBMIT_GUESS", "calvin", { value: 50 });
  assert.equal(JSON.stringify(state), serialized);
});
test("guessing UI conceals answer and other players' guesses", () => {
  let state = start({ firstLandmarkId: "bourbon-street" });
  state = act(state, "SUBMIT_GUESS", "zoe", { value: 123 });
  const html = renderToStaticMarkup(<LandmarkBearingsGameView state={state} room={room} playerId="calvin" isHost dispatchAction={async () => {}} />);
  assert.ok(html.includes("Bourbon Street")); assert.ok(html.includes("N 0°"));
  assert.ok(!html.includes("108.8")); assert.ok(!html.includes("123°"));
  assert.ok(!html.includes("Answer compass")); assert.ok(html.includes("Lock in my guess"));
});
test("result UI includes answer, missing status, history, and final tie", () => {
  let state = start({ firstLandmarkId: "bourbon-street", rounds: 1 });
  state = act(state, "SUBMIT_GUESS", "calvin", { value: 110 });
  state = act(state, "SUBMIT_GUESS", "zoe", { value: 110 });
  state = act(state, "REVEAL_RESULTS");
  const html = renderToStaticMarkup(<LandmarkBearingsGameView state={state} room={room} playerId="calvin" isHost dispatchAction={async () => {}} />);
  for (const text of ["108.8", "Final standings", "share the expedition win!", "Missed", "Round history", "coordinate reference"])
    assert.ok(html.includes(text), text);
});
test("unknown persisted state version requests a fresh room", () => {
  const state = { ...initialState(), version: 999 };
  assert.equal(act(state, "START_GAME"), state);
  const html = renderToStaticMarkup(<LandmarkBearingsGameView state={state} room={room} playerId="calvin" isHost dispatchAction={async () => {}} />);
  assert.ok(html.includes("Create a fresh room"));
});
console.log(`Landmark Bearings: ${count} checks passed.`);
