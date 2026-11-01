"use client";

import { useState } from "react";
import type { Room } from "../../../../engine/types";
import { initialState, landmarkBearingsGame } from "../../../../games/landmark-bearings/config";
import { LandmarkBearingsGameView } from "../../../../games/landmark-bearings/GameView";

const names = ["Calvin", "Zoe", "Abby", "Linda", "George", "Keith"];
const room: Room = { roomCode: "LAB", gameId: landmarkBearingsGame.id, hostId: "lab-0",
  createdAt: 0, mode: "hotseat", players: names.map((name, index) => ({ id: `lab-${index}`,
    name, role: index === 0 ? "host" : "player" })) };

export default function BearingsLabView() {
  const [state, setState] = useState(initialState);
  const [playerId, setPlayerId] = useState(room.hostId);
  return <main className="mx-auto max-w-lg space-y-4 p-4">
    <p className="text-center text-xs text-amber-200">Local lab · no room is saved · refresh resets</p>
    <label className="block text-sm text-slate-300">Controlling
      <select className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 p-3" value={playerId}
        onChange={(event) => setPlayerId(event.target.value)}>
        {room.players.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}
      </select>
    </label>
    <LandmarkBearingsGameView state={state} room={room} playerId={playerId} isHost={playerId === room.hostId}
      dispatchAction={async (type, payload) => {
        // Evaluate once per event rather than draw randomness in a React updater.
        const next = landmarkBearingsGame.reducer(state, { type, playerId, payload },
          { playerId, room, now: Date.now, random: Math.random });
        setState(next);
      }} />
  </main>;
}
