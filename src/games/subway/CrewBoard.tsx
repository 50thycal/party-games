"use client";

import { useState } from "react";
import { activationCost, buildableLines, contractOf, SUBWAY_CONFIG, type SubwayState } from "./config";
import { Printed, TableButton } from "./table";
import { constructionHistory } from "./constructionHistory";

export function CrewBoard({game,viewerId,busy,veiled,act,boardOnly=false}:{game:SubwayState;viewerId:string;busy:boolean;veiled:boolean;act:(type:string,payload?:Record<string,unknown>)=>unknown;boardOnly?:boolean}) {
  const [selected,setSelected]=useState<number[]>([]);
  const [historyRound,setHistoryRound]=useState(game.currentPeriod);
  const [historyPlayer,setHistoryPlayer]=useState<string|null>(null);
  const history=constructionHistory(game,historyRound);
  const p=game.players[viewerId];
  const actor=game.resolveQueue[0];
  const hiring=game.phase==="CONSTRUCTION"&&actor===viewerId&&!p?.crewsHired;
  const available=p?buildableLines(game,viewerId):[];
  const indexes=selected.filter(i=>available.includes(i));
  const cost=p?activationCost(p,indexes.length):0;
  return <Printed style={{width:1720, maxWidth:"100%"}} zone="schedule" title="Construction schedule" subtitle={`Round ${game.currentPeriod} / ${SUBWAY_CONFIG.timelinePeriods}`}>
    <div className="grid grid-cols-[640px_1fr] items-start gap-8">
    <div data-turn-controls={game.phase === "CONSTRUCTION" ? "true" : undefined}>
    {game.phase!=="CONSTRUCTION"?<p className="mt-3 text-xl">Choose routes afresh each construction round. There is no advance timetable.</p>:<>
      <p className="mt-3 text-2xl font-bold">{game.players[actor]?.name}: {hiring?"choose your crews":"construction turn"}</p>
      {p&&!veiled&&<>
        {hiring&&<div className="mt-4 space-y-4">
          {!boardOnly && !p.destinationPurchased && <div>
            <TableButton disabled={busy || p.money < SUBWAY_CONFIG.destinationPurchaseCost || !game.destinationDeck.length} onClick={() => act("BUY_DESTINATION", {period:game.currentPeriod})}>Buy Destination · $5M</TableButton>
            <p className="mt-2 text-lg">One extra random mission per game, before hiring crews.</p>
          </div>}
          <div className="grid grid-cols-3 gap-3">{p.lines.map((line,i)=><button key={i} disabled={busy||!available.includes(i)} aria-pressed={indexes.includes(i)} onClick={()=>setSelected(indexes.includes(i)?indexes.filter(n=>n!==i):[...indexes,i])} className={`rounded-xl border-4 px-3 py-4 text-xl font-bold disabled:opacity-40 ${indexes.includes(i)?"border-teal-700 bg-teal-100":"border-stone-300 bg-white"}`}>{contractOf(line)?.name}</button>)}</div>
          <p className="text-xl">Hire {indexes.length} crew(s): <b>${cost}M</b> · Cash afterward: <b>${p.money-cost}M</b>{p.money-cost<0&&<strong className="ml-4 text-red-700">Final debt penalty at this balance: {(p.money-cost)*4} VP</strong>}</p>
          <TableButton disabled={busy} onClick={()=>act("HIRE_CREWS",{lineIndexes:indexes,period:game.currentPeriod})}>{indexes.length?`Pay $${cost}M & build` : "No crews · end turn"}</TableButton>
        </div>}
        {actor===viewerId&&p.crewsHired&&p.pendingActions.length>0&&<div className="mt-4">
          <TableButton disabled={busy} onClick={()=>act("SKIP_ACTION")}>Give up remaining builds</TableButton>
        </div>}
        {game.undo?.playerId===viewerId&&<div className="mt-4">
          <TableButton disabled={busy} onClick={()=>act("UNDO_PLACEMENT")}>Undo {game.undo.label}</TableButton>
        </div>}
        <p className="mt-4 text-xl">1 crew $1M · 2 crews $3M · 3 crews $6M. One segment per chosen route. Unpaid debt: −4 VP per $1M.</p>
      </>}
    </>}
    </div>
    <div className="border-l-2 border-stone-300 pl-8">
    <p className="mb-3 text-lg">Longest continuous company network: +5 VP, or +3 each if tied. Peg-space length; transfers at shared pegs/neighborhoods, no segment twice.</p>
    <div className="flex flex-wrap gap-2" aria-label="Construction rounds">{Array.from({length:SUBWAY_CONFIG.timelinePeriods},(_,i)=><button key={i} aria-label={`View round ${i+1}`} aria-pressed={historyRound===i+1} onClick={()=>setHistoryRound(i+1)} className={`rounded px-3 py-2 text-xl font-bold ${historyRound===i+1?"bg-teal-700 text-white":"bg-stone-200"}`}>{i+1}</button>)}</div>
    <p className="mt-3 text-lg">Round {historyRound} · {historyRound>game.currentPeriod?"Projected construction order":"Construction order"}</p>
    <div className="mt-3 grid grid-cols-2 items-start gap-3">{history.order.map((id,rank)=>{
      const company=game.players[id];
      const builds=history.builds.filter(b=>b.actorId===id);
      return <div key={id} className="rounded-lg border-2 border-stone-300 bg-white/70 p-3">
        <button className="flex min-h-[74px] w-full flex-wrap items-center gap-3 text-left text-xl" aria-expanded={historyPlayer===id} onClick={()=>setHistoryPlayer(historyPlayer===id?null:id)}>
          <b className="rounded-full px-3 py-1 text-white" style={{background:company.color}}>{rank+1}</b><b>{company.name}</b><span>{company.lines.length} lines</span>
          <span className="ml-auto">{historyRound===game.currentPeriod&&actor===id?"Building now → ":""}{builds.filter(b=>!b.undone).length} built</span>
        </button>
        {historyPlayer===id&&<div className="mt-3 text-lg">{company.lines.map((line,i)=>{
          const entries=builds.filter(b=>b.lineIndex===i);
          return <p key={i}><b>{contractOf(line)?.name}</b>: {entries.length?entries.map(b=>`#${b.actionNumber}${b.undone?" undone":" built"}`).join(" · "):"No build recorded"}</p>;
        })}</div>}
      </div>;
    })}</div>
    </div>
    </div>
  </Printed>;
}
