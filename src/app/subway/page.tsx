"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Room } from "@/engine/types";
import { SubwayGameView } from "@/games/subway/GameView";
import { SUBWAY_STATE_VERSION, subwayGame, nextCompanyId, type SubwayAction, type SubwayState } from "@/games/subway/config";

type Session = { room: Room; game: SubwayState; seat: string };
const SAVE_KEY = "subway-hotseat-v19";

export default function SubwayHotseat() {
  const [session, setSession] = useState<Session | null>(null);
  const latest = useRef<Session | null>(null);
  const [count, setCount] = useState(2);
  const [names, setNames] = useState(["", "", "", ""]);
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(true);
  const [newGame, setNewGame] = useState(false);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const value = JSON.parse(raw) as Session;
        if (value.game?.version === SUBWAY_STATE_VERSION && value.room?.mode === "hotseat" &&
            value.room.players.length >= 2 && value.room.players.length <= 4 && value.game.players[value.seat]) {
          latest.current = value;
          setSession(value);
        }
      }
    } catch { setSaved(false); }
    setReady(true);
  }, []);
  const commit = (value: Session) => {
    latest.current = value;
    setSession(value);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(value)); setSaved(true); }
    catch { setSaved(false); }
  };
  const start = () => {
    const players = names.slice(0, count).map((name, i) => ({ id: `seat-${i + 1}`, name: name.trim() || `Company ${i + 1}`, role: i === 0 ? "host" as const : "player" as const }));
    // LAN/HTTP phone previews lack randomUUID; getRandomValues still provides
    // an independent 128-bit namespace for this device-local game and its plans.
    const localId = typeof crypto.randomUUID === "function" ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, "0")).join("");
    const room: Room = { roomCode: `LOCAL-${localId}`, gameId: "subway", hostId: players[0].id, players, createdAt: Date.now(), mode: "hotseat" };
    const game = subwayGame.reducer(subwayGame.initialState(players), {type:"START_GAME", playerId:room.hostId}, {room, playerId:room.hostId, now:Date.now, random:Math.random});
    commit({room, game, seat:room.hostId});
    setNewGame(false);
  };
  const dispatchAction = async (type: string, payload?: unknown) => {
    const value = latest.current;
    if (!value) return;
    const game = subwayGame.reducer(value.game, {type, payload, playerId:value.seat} as SubwayAction, {room:value.room, playerId:value.seat, now:Date.now, random:Math.random});
    if (game === value.game && type === "AUTO_SCHEDULE") return;
    if (game === value.game) throw new Error("That action is unavailable. Check the current turn and card requirements.");
    commit({...value, game});
  };
  if (!ready) return <main className="p-8">Opening the transit office…</main>;
  if (!session || newGame) return (
    <main className="min-h-screen bg-[#10232d] px-5 py-12 text-[#f6f1df]" style={{fontFamily:"ui-sans-serif, system-ui, sans-serif"}}>
      <div className="mx-auto max-w-xl">
        <Link href="/" className="text-sm text-teal-200">← Party Games</Link>
        <p className="mt-12 text-xs font-bold uppercase tracking-[.3em] text-teal-300">Metropolitan Transit Authority</p>
        <h1 className="mt-3 text-6xl font-black tracking-tight">SUBWAY<span className="text-orange-400">.</span></h1>
        <p className="mt-4 text-lg text-slate-300">Three routes. One growing city. Make the connections that count.</p>
        <Link href="/subway/tutorial" className="mt-5 inline-block rounded-xl border border-teal-300 px-5 py-3 font-bold text-teal-200">Learn by playing · guided tutorial →</Link>
        <div className="mt-8 flex gap-2 border-y border-white/15 py-4 text-sm text-teal-100"><span>2–4 companies</span><span>·</span><span>Pass & play</span><span>·</span><span>Saves on this device</span></div>
        <h2 className="mt-7 text-sm font-bold uppercase tracking-widest">How many companies?</h2>
        <div className="mt-3 grid grid-cols-3 gap-3">{[2,3,4].map((n) => <button key={n} aria-pressed={count===n} onClick={()=>setCount(n)} className={`rounded-xl border-2 p-4 text-lg font-bold ${count===n ? "border-teal-300 bg-teal-800" : "border-white/20 bg-white/5"}`}>{n} players</button>)}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">{names.slice(0,count).map((name,i)=><label key={i} className="text-sm text-slate-300">Company {i+1}<input maxLength={24} value={name} placeholder={`Company ${i+1}`} onChange={(e)=>setNames(names.map((v,j)=>j===i?e.target.value:v))} className="mt-1 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-3 text-white" /></label>)}</div>
        <p className="mt-5 text-sm leading-relaxed text-slate-300">Draft routes and goals, then choose construction crews each round. Build from the city edge toward stations. Finished routes, stations and goals earn points; unfinished work and debt lose points.</p>
        {session && <p className="mt-4 rounded-lg bg-amber-200 p-3 text-sm font-semibold text-amber-950">Starting replaces the game saved on this device.</p>}
        <button onClick={start} className="mt-6 w-full rounded-xl bg-[#ebac51] py-4 font-black text-[#10232d] hover:bg-amber-300">{session ? "Replace game & open the city" : "Open the city"} →</button>
        {session && <button onClick={()=>setNewGame(false)} className="mt-3 w-full p-3 text-teal-200">Return to current game</button>}
      </div>
    </main>
  );
  const next = nextCompanyId(session.game);
  return <main className="min-h-screen bg-[#10232d] p-2 text-white sm:p-3" style={{fontFamily:"ui-sans-serif, system-ui, sans-serif"}}>
    <header className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#18343f] p-2">
      <Link href="/" className="mr-auto px-2 font-black tracking-wider">SUBWAY<span className="text-amber-400">.</span></Link>
      <label className="text-xs text-slate-300"><span className="hidden lg:inline">Playing as </span><select aria-label="Active company" value={session.seat} onChange={(e)=>commit({...session, seat:e.target.value})} className="ml-1 rounded-lg bg-[#10232d] p-2 text-base font-bold text-white">{session.room.players.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {next && next !== session.seat && <button onClick={()=>commit({...session,seat:next})} className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-bold">Pass to {session.game.players[next].name} →</button>}
      <details className="relative"><summary className="cursor-pointer rounded-lg bg-white/10 px-3 py-2 text-xs">Menu</summary><div className="absolute right-0 top-full z-50 mt-2 flex w-40 flex-col gap-2 rounded-xl bg-[#18343f] p-2 shadow-xl"><button onClick={()=>setHelp(!help)} aria-expanded={help} className="rounded-lg bg-white/10 px-3 py-2 text-xs">How to play</button>
      <button onClick={()=>setNewGame(true)} className="rounded-lg bg-white/10 px-3 py-2 text-xs">New game</button></div></details>
    </header>
    {!saved && <p role="status" className="mb-2 rounded bg-amber-100 p-2 text-sm text-amber-950">Device storage is unavailable. Keep this tab open to finish your game.</p>}
    {help && <aside className="mb-2 rounded-xl bg-[#f5f3e9] p-4 text-sm leading-relaxed text-slate-900"><b>Your first journey</b><ol className="ml-5 mt-2 list-decimal space-y-1"><li>Draft one route at list price each turn. Everyone ends with three routes; there is no pass.</li><li>Receive two private Destination missions at start. Draft three Engineering goals from two face-up choices or a blind draw, then optionally buy surveys.</li><li>Each round, hire crews for different routes: $1M / $3M / $6M for 1 / 2 / 3 crews. Build one segment per crew. Start with $50M; construction lasts at most nine rounds. Buy one extra Destination for $5M before hiring, once per game.</li><li>Place your free starter pegs on the border. Follow each route’s printed segment lengths; turns may be up to 90°.</li><li>Tap a glowing peg, inspect the next step and toll, then Confirm. You can plan ahead without committing.</li><li>Score finished routes, stations, connected missions and Engineering goals. Longest continuous network earns 5 VP (3 each if tied). Keep debt low. Most points wins!</li></ol><p className="mt-2">Use Board, Schedule, Lines and Cards to move around the table. Drag to pan; scroll or pinch to zoom. Pass the device before revealing the next company’s cards. Geography is decorative.</p></aside>}
    <SubwayGameView room={session.room} state={session.game} playerId={session.seat} isHost={session.seat===session.room.hostId} dispatchAction={dispatchAction} />
  </main>;
}
