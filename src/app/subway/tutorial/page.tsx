"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SubwayGameView } from "@/games/subway/GameView";
import { nextCompanyId, subwayGame, type SubwayAction, type SubwayActionType } from "@/games/subway/config";
import { runPlaytest, seededRandom } from "@/games/subway/playtest";
import { SUBWAY_LESSONS } from "@/games/subway/tutorial";

type Practice = ReturnType<typeof runPlaytest>;

function LessonAnimation({kind}:{kind:string}) {
  return <div className="hidden w-44 shrink-0 overflow-hidden rounded-xl bg-[#10232d] p-2 sm:block" aria-hidden="true">
    <svg viewBox="0 0 180 65" className="h-16 w-full">
      {kind==="cards" ? <g>{[0,1,2].map(i=><g key={i} transform={`translate(${20+i*48} 8)`}><rect width="34" height="48" rx="4" fill={["#d6a249","#4f93b6","#db7d43"][i]}/><path d="M8 14h18M8 22h18M8 30h12" stroke="#10232d" strokeWidth="3"/></g>)}</g> : kind==="schedule" ? <g>{[0,1,2].map(i=><g key={i}><path d={`M10 ${14+i*19}h160`} stroke="#54737e"/><rect x={15+i*30} y={6+i*19} width="75" height="15" rx="3" fill={["#edb659","#4ab9ac","#819cde"][i]}/></g>)}</g> : <g><path d="M12 48H60L98 16H166" fill="none" stroke="#f0b65a" strokeWidth="5"/>{kind==="crossing" && <path d="M65 8L120 58" stroke="#71c9dc" strokeWidth="5"/>}{[[12,48],[60,48],[98,16],[166,16]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="6" fill="#f8f2df" stroke="#10232d" strokeWidth="2"/>{kind==="recipe" && i<3 && <text x={x+17} y={y+14} fill="white" fontSize="10">{[2,3,2][i]}</text>}</g>)}</g>}
    </svg>
    <div className="tutorial-train h-1 w-8 rounded bg-teal-300"/>
    <style jsx>{`@keyframes train {from {transform:translateX(0)} to {transform:translateX(125px)}} .tutorial-train {animation:train 2.5s ease-in-out infinite alternate} @media(prefers-reduced-motion:reduce){.tutorial-train{animation:none}}`}</style>
  </div>;
}

export default function SubwayTutorial() {
  const [index,setIndex]=useState(0);
  const [practice,setPractice]=useState<Practice|null>(null);
  const latest=useRef<Practice|null>(null);
  const [seat,setSeat]=useState("");
  const [done,setDone]=useState<SubwayActionType[]>([]);
  const [error,setError]=useState("");
  const [beat,setBeat]=useState(0);
  const lesson=SUBWAY_LESSONS[index];
  const openLesson=(i:number)=>{
    try {
      const value=runPlaytest(2,7,SUBWAY_LESSONS[i].phase);
      // Simulation avoids a hotseat privacy veil; no practice action reaches an API.
      value.room={...value.room,roomCode:`TUTORIAL-${i}`,mode:"simulation"};
      latest.current=value;setPractice(value);setSeat(nextCompanyId(value.state)??value.room.hostId);
      setIndex(i);setDone([]);setError("");setBeat(b=>b+1);
    } catch(e){setError(String(e));}
  };
  useEffect(()=>{
    const requested=Number(new URLSearchParams(window.location.search).get("lesson")??0);
    openLesson(Number.isInteger(requested)&&requested>=0&&requested<SUBWAY_LESSONS.length?requested:0);
  },[]);
  const complete=!lesson.actions || lesson.actions.every(action=>done.includes(action));
  return <main className="min-h-screen bg-[#10232d] p-2 text-white sm:p-3">
    <header className="mb-2 rounded-xl border border-teal-300/30 bg-[#18343f] p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs"><b className="mr-auto tracking-widest text-teal-200">SUBWAY · TRAINING LINE</b><Link href="/subway" className="rounded bg-white/10 px-3 py-2">Exit practice</Link></div>
      <div className="mt-2 flex gap-4"><LessonAnimation kind={lesson.art}/><div className="min-w-0"><h1 className="text-lg font-black">{index+1}/{SUBWAY_LESSONS.length} · {lesson.title}</h1><p className="mt-1 max-w-4xl text-sm leading-relaxed text-slate-200">{lesson.text}</p></div></div>
      <p role="status" className="mt-2 rounded bg-black/20 p-2 text-sm text-amber-100">{complete&&lesson.actions ? "✓ Practice action completed. You can keep exploring or continue." : lesson.task}</p>
      <nav aria-label="Tutorial lessons" className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <button disabled={index===0} onClick={()=>openLesson(index-1)} className="rounded bg-white/10 px-3 py-2 disabled:opacity-40">Back</button>
        <button onClick={()=>openLesson(index)} className="rounded bg-white/10 px-3 py-2">Replay lesson</button>
        <button onClick={()=>setBeat(b=>b+1)} className="rounded bg-white/10 px-3 py-2">Show this area</button>
        <select aria-label="Jump to lesson" value={index} onChange={e=>openLesson(Number(e.target.value))} className="min-w-0 max-w-48 rounded bg-[#10232d] p-2">{SUBWAY_LESSONS.map((l,i)=><option key={l.title} value={i}>{i+1}. {l.title}</option>)}</select>
        {index<SUBWAY_LESSONS.length-1 ? <button onClick={()=>openLesson(index+1)} className="ml-auto rounded bg-amber-300 px-4 py-2 font-bold text-slate-950">{complete?"Next stop →":"Skip practice →"}</button> : <Link href="/subway" className="ml-auto rounded bg-amber-300 px-4 py-2 font-bold text-slate-950">Ready to play →</Link>}
      </nav>
    </header>
    {error&&<p role="alert" className="p-3 text-red-200">{error}</p>}
    {practice ? <SubwayGameView key={`${index}:${practice.room.roomCode}`} room={practice.room} state={practice.state} playerId={seat} isHost={seat===practice.room.hostId} lessonZone={lesson.zone} lessonBeat={beat} dispatchAction={async(type,payload)=>{
      const current=latest.current;if(!current)return;
      const action={type,payload,playerId:seat} as SubwayAction;
      const next=subwayGame.reducer(current.state,action,{room:current.room,playerId:seat,now:()=>current.state.nextEventSeq,random:seededRandom(current.state.nextEventSeq+31)});
      if(next===current.state)throw new Error("Check the highlighted control and the current turn.");
      const value={...current,state:next};latest.current=value;setPractice(value);
      const matches=index!==3&&index!==4 || type!=="DRAFT_CARD" || (index===3 ? !!action.payload?.cardId : !action.payload?.cardId);
      if(matches)setDone(previous=>[...previous,type as SubwayActionType]);
      if(!(index===10&&type==="BUILD"))setSeat(nextCompanyId(next)??current.room.hostId);
    }}/> : <p className="p-6">Preparing a practice table…</p>}
  </main>;
}
