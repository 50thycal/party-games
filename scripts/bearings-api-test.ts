import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST as create } from "../src/app/api/create-room/route";
import { POST as join } from "../src/app/api/join-room/route";
import { POST as action } from "../src/app/api/game-action/route";
import { GET as get } from "../src/app/api/get-room/route";
import { closeDatabase } from "../src/engine/database";
import { initialState, type BearingsState } from "../src/games/landmark-bearings/config";
import type { Room } from "../src/engine/types";

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost/api/${path}`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
async function read(roomCode: string) {
  const response = await get(new NextRequest(`http://localhost/api/get-room?roomCode=${roomCode}`));
  const json = await response.json(); assert.equal(response.status, 200); assert.equal(json.ok, true);
  return json.data as { room: Room; gameState: BearingsState };
}
async function send(roomCode: string, playerId: string, type: string, payload?: unknown) {
  const response = await action(request("game-action", { roomCode, playerId, type, payload }));
  const json = await response.json(); assert.equal(json.ok, true, JSON.stringify(json));
  return json.data.gameState as BearingsState;
}
async function main() {
  for (const mode of ["multiplayer", "hotseat"] as const) {
    const response = await create(request("create-room", { gameId: "landmark-bearings", mode,
      playerId: "api-calvin", name: "Calvin", playerCount: 2, playerNames: ["Calvin", "Zoe"] }));
    const json = await response.json(); assert.equal(response.status, 200); assert.equal(json.ok, true);
    const roomCode = json.data.room.roomCode as string;
    if (mode === "multiplayer") {
      const joined = await join(request("join-room", { roomCode, playerId: "api-zoe", name: "Zoe" }));
      assert.equal(joined.status, 200);
    }
    const stored = await read(roomCode);
    assert.equal(stored.room.players.length, 2); assert.equal(stored.gameState, null);
    const host = stored.room.hostId;
    const other = stored.room.players.find((p) => p.id !== host)!.id;
    let state = await send(roomCode, host, "START_GAME", { settings: {
      ...initialState().settings, rounds: 3, firstLandmarkId: "bourbon-street",
    } });
    for (let round = 1; round <= 3; round++) {
      const payload = { round, match: state.match };
      // Exercise the actual API and optimistic writes concurrently for two seats.
      await Promise.all([
        send(roomCode, host, "SUBMIT_GUESS", { ...payload, value: 120 }),
        send(roomCode, other, "SUBMIT_GUESS", { ...payload, value: 110 }),
      ]);
      state = (await read(roomCode)).gameState;
      assert.equal(Object.keys(state.guesses).length, 2);
      const denied = await action(request("game-action", { roomCode, playerId: other, type: "REVEAL_RESULTS", payload }));
      assert.equal(denied.status, 400);
      state = await send(roomCode, host, "REVEAL_RESULTS", payload);
      assert.equal(state.history.length, round);
      if (round === 1) { assert.deepEqual(state.history[0].winnerIds, [other]); assert.ok(Math.abs(state.history[0].answer - 108.7718) < 0.0001); }
      assert.deepEqual((await read(roomCode)).gameState, state, "GET reload retains results in libSQL");
      if (round < 3) state = await send(roomCode, host, "NEXT_ROUND", payload);
    }
    assert.equal(state.phase, "finished");
    const replay = await send(roomCode, host, "PLAY_AGAIN", { round: state.round, match: state.match });
    assert.equal(replay.phase, "lobby"); assert.equal(replay.history.length, 0);
    assert.equal((await read(roomCode)).gameState.match, 1);
    console.log(`PASS ${mode}: create/join → concurrent guesses → 3 rounds → stored reload → replay through real API handlers and isolated libSQL`);
  }
}
main().finally(closeDatabase).catch((error) => { console.error(error); process.exitCode = 1; });
