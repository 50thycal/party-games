"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "@/engine/types";
import { TableSoccerGameView } from "@/games/table-soccer/GameView";
import { tableSoccerGame, type TableSoccerAction } from "@/games/table-soccer/config";
import { applySoloAction, nextBotAction, soloRoom, SOLO_PLAYER_ID } from "@/games/table-soccer/solo";

function SoloMatch({ room, onExit }: { room: Room; onExit: () => void }) {
  const [state, setState] = useState(() => applySoloAction(tableSoccerGame.initialState(room.players), room, {
    type: "SOCCER_OPEN_SETUP", playerId: SOLO_PLAYER_ID, payload: { match: 1, turn: 0 },
  }, 0));
  const current = useRef(state);
  const run = useCallback((action: TableSoccerAction) => {
    const next = applySoloAction(current.current, room, action, Date.now());
    if (next === current.current) return false;
    current.current = next;
    setState(next);
    return true;
  }, [room]);
  const dispatch = useCallback(async (type: string, payload?: TableSoccerAction["payload"]) => {
    return run({ type, playerId: SOLO_PLAYER_ID, payload });
  }, [run]);

  const plan = useMemo(() => nextBotAction(state, Date.now()), [state]);
  const needsBumperSpace = plan && "needsBumperSpace" in plan;
  useEffect(() => {
    if (!plan || "needsBumperSpace" in plan) return;
    const timer = setTimeout(() => run(plan.action), plan.waitMs);
    return () => clearTimeout(timer);
  }, [plan, run]);

  return (
    <div className="mx-auto max-w-lg">
      <TableSoccerGameView
        room={room} state={state} playerId={SOLO_PLAYER_ID} isHost
        dispatchAction={async (type, payload) => { await dispatch(type, payload); }}
        dispatchLiveAction={dispatch}
      />
      {needsBumperSpace && (
        <p role="status" className="mx-auto my-2 max-w-sm text-center text-sm text-amber-200">
          There’s no clear spot for another CPU bumper. Start a new solo setup with more room between the phones.
        </p>
      )}
      <button type="button" className="mx-auto mt-3 block min-h-11 px-3 text-sm text-gray-300 underline" onClick={onExit}>New solo setup</button>
    </div>
  );
}

export default function SoloTableSoccerPage() {
  const [opponents, setOpponents] = useState(1);
  const [room, setRoom] = useState<Room | null>(null);
  return (
    <main className="min-h-screen p-4">
      {room ? <SoloMatch room={room} onExit={() => setRoom(null)} /> : (
        <div className="soccer-shell">
          <header className="soccer-top"><h1>Table Soccer</h1><span>Solo Playtest</span></header>
          <section className="soccer-card">
            <h2>Play on one phone</h2>
            <p>Set up a virtual table and practice shots and saves against CPU opponents.</p>
            <div className="soccer-measurements">
              <label>CPU opponents
                <select value={opponents} onChange={(event) => setOpponents(Number(event.target.value))}>
                  <option value="1">1</option><option value="2">2</option><option value="3">3</option>
                </select>
              </label>
            </div>
            <button className="soccer-primary" type="button" onClick={() => setRoom(soloRoom(opponents))}>Set up solo match</button>
            <Link className="soccer-exit" href="/create">Back to Create a Room</Link>
          </section>
        </div>
      )}
    </main>
  );
}
