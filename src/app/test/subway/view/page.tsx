"use client";
import { useEffect, useState } from "react";
import { SubwayGameView } from "@/games/subway/GameView";
import { subwayGame, nextCompanyId, type SubwayAction } from "@/games/subway/config";
import { runPlaytest, stepPlaytest, seededRandom } from "@/games/subway/playtest";

type Fixture=ReturnType<typeof runPlaytest>;
export default function SubwayScene(){
  const [fixture,setFixture]=useState<Fixture|null>(null);
  const [seat,setSeat]=useState('seat-1');
  const [error,setError]=useState('');
  useEffect(()=>{
    const params=new URLSearchParams(window.location.search);
    const count=Number(params.get('count'));
    const phase=params.get('phase')??'PROCUREMENT';
    try { const result=runPlaytest([2,3,4].includes(count)?count:4,7,phase);setFixture(result);setSeat(nextCompanyId(result.state)??'seat-1'); }
    catch(e){setError(String(e));}
  },[]);
  if(error) return <p role="alert">{error}</p>;
  if(!fixture) return <p className="p-4">Playing the preceding phases…</p>;
  return <main className="bg-[#10232d] p-2 text-white">
    <header className="mb-2 flex flex-wrap gap-2 text-xs"><b className="mr-auto p-2">SUBWAY · {fixture.state.phase}</b><select aria-label="Active company" className="rounded bg-slate-800 p-2" value={seat} onChange={e=>setSeat(e.target.value)}>{fixture.room.players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <button className="rounded bg-teal-800 p-2" onClick={()=>{try{const state=stepPlaytest(fixture.state,fixture.room,seededRandom(fixture.state.nextEventSeq));setFixture({...fixture,state});setSeat(nextCompanyId(state)??seat);}catch(e){setError(String(e));}}}>Demo next action</button>
    </header>
    <SubwayGameView room={fixture.room} state={fixture.state} playerId={seat} isHost={seat===fixture.room.hostId} dispatchAction={async(type,payload)=>{const next=subwayGame.reducer(fixture.state,{type,payload,playerId:seat} as SubwayAction,{room:fixture.room,playerId:seat,now:Date.now,random:Math.random});if(next===fixture.state)throw new Error('Action rejected');setFixture({...fixture,state:next});}} />
  </main>;
}
