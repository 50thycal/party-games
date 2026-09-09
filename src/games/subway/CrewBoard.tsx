"use client";

import { useState } from "react";
import { activationCost, buildableLines, constructionById, constructionCardBlocker, contractOf, SUBWAY_CONFIG, type ConstructionCardId, type SubwayState } from "./config";
import { Printed, TableButton } from "./table";

export function CrewBoard({game,viewerId,busy,veiled,act,onCard}:{game:SubwayState;viewerId:string;busy:boolean;veiled:boolean;act:(type:string,payload?:Record<string,unknown>)=>unknown;onCard:(id:ConstructionCardId)=>void}) {
  const [selected,setSelected]=useState<number[]>([]);
  const p=game.players[viewerId];
  const priority=game.priorityQueue[0];
  const actor=priority??game.resolveQueue[0];
  const hiring=game.phase==="CONSTRUCTION"&&!priority&&actor===viewerId&&!p?.crewsHired;
  const available=p?buildableLines(game,viewerId):[];
  const indexes=selected.filter(i=>available.includes(i));
  const cost=p?activationCost(p,indexes.length):0;
  return <Printed zone="schedule" title="Crew dispatch" subtitle={`Round ${game.currentPeriod} / ${SUBWAY_CONFIG.timelinePeriods}`}>
    <div className="flex gap-2" aria-label={`Round ${game.currentPeriod} of 16`}>{Array.from({length:16},(_,i)=><span key={i} className={`rounded px-3 py-2 text-xl font-bold ${i+1===game.currentPeriod?"bg-teal-700 text-white":"bg-stone-200"}`}>{i+1}</span>)}</div>
    <p className="mt-4 text-xl">1 crew $1M · 2 crews $3M · 3 crews $6M. One segment per chosen route. Unpaid debt: −4 VP per $1M.</p>
    {game.phase!=="CONSTRUCTION"?<p className="mt-3 text-xl">Choose routes afresh each construction round. There is no advance timetable.</p>:<>
      <p className="mt-3 text-2xl font-bold">{game.players[actor]?.name}: {priority?"Priority Dispatch opportunity":hiring?"choose your crews":"construction turn"}</p>
      {p&&!veiled&&<>
        {!!p.nextCrewDiscount&&<p className="mt-2 text-xl font-bold text-teal-800">Next round: $1M crew discount reserved.</p>}
        {!!p.crewDiscount&&!p.crewsHired&&<p className="mt-2 text-xl font-bold text-teal-800">This round: ${p.crewDiscount}M off your crew bill. Expires unused.</p>}
        {priority===viewerId&&<div className="mt-4 flex gap-4"><TableButton disabled={busy} onClick={()=>act("PLAY_CONSTRUCTION_CARD",{cardId:"expedite",period:game.currentPeriod})}>Play Priority Dispatch</TableButton><TableButton disabled={busy} onClick={()=>act("PASS_PRIORITY",{period:game.currentPeriod})}>Keep card · pass priority</TableButton></div>}
        {hiring&&<div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-3">{p.lines.map((line,i)=><button key={i} disabled={busy||!available.includes(i)} aria-pressed={indexes.includes(i)} onClick={()=>setSelected(indexes.includes(i)?indexes.filter(n=>n!==i):[...indexes,i])} className={`rounded-xl border-4 px-5 py-4 text-xl font-bold disabled:opacity-40 ${indexes.includes(i)?"border-teal-700 bg-teal-100":"border-stone-300 bg-white"}`}>{contractOf(line)?.name}</button>)}</div>
          <p className="text-xl">Hire {indexes.length} crew(s): <b>${cost}M</b> · Cash afterward: <b>${p.money-cost}M</b>{p.money-cost<0&&<strong className="ml-4 text-red-700">Final debt penalty at this balance: {(p.money-cost)*4} VP</strong>}</p>
          <TableButton disabled={busy} onClick={()=>act("HIRE_CREWS",{lineIndexes:indexes,period:game.currentPeriod})}>{indexes.length?`Pay $${cost}M & build` : "No crews · end turn"}</TableButton>
        </div>}
        <div className="mt-5 flex flex-wrap gap-3">{p.constructionHand.map((id,i)=><button key={i} onClick={()=>onCard(id)} className="max-w-sm rounded-xl border-2 border-amber-600 bg-amber-50 p-3 text-left text-lg"><b>{constructionById(id)?.name}</b><span className="block text-sm text-stone-600">{constructionCardBlocker(game,viewerId,id)??"Available now · uses your one card"}</span></button>)}</div>
      </>}
    </>}
  </Printed>;
}
