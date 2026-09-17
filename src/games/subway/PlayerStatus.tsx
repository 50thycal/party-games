"use client";
import {remainingLength,BEND_LABELS} from './bends';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SUBWAY_CONFIG, contractOf, segmentsBuilt, nextCompanyId, type SubwayState, type MoneyEvent } from './config';
import { moneyChanges, publicStandings } from './publicStatus';
import { DestinationChip, EngineeringGlyph } from './CardGlyphs';
import { destinationMet, objectiveMet } from './config';

export function PublicLeaders({game,dark=false}:{game:SubwayState;dark?:boolean}) {
  const standings=useMemo(()=>publicStandings(game),[game]);
  const names=(ids:string[])=>ids.length?`${ids.map(id=>game.players[id].name).join(' / ')}${ids.length>1?' (tied)':''}`:'No leader yet';
  return <div aria-label="Public leaders" className={`flex flex-wrap gap-x-4 gap-y-1 ${dark?'text-lg text-stone-800':'text-xs text-teal-100'}`}>
    <span>Longest network: <b>{names(standings.networkLeaders)}</b> · {standings.length.toFixed(1)} spaces</span>
    <span>Largest Transfer Station: <b>{names(standings.stationLeaders)}</b> · {standings.size} stations</span>
  </div>;
}

/** Initial load/remount establishes a watermark: never replay old payments.
 * New events queue once even if polling repeats them or jumps several actions. */
export function useMoneyEvents(game:SubwayState,roomKey:string) {
  const cursor=useRef<{key:string;seq:number}|null>(null);
  const [queue,setQueue]=useState<MoneyEvent[]>([]);
  useEffect(()=>{
    const events=game.moneyEvents??[],last=events.at(-1)?.seq??0;
    if(cursor.current?.key!==roomKey){cursor.current={key:roomKey,seq:last};setQueue([]);return;}
    const fresh=events.filter(e=>e.seq>cursor.current!.seq);
    cursor.current.seq=last;
    if(fresh.length)setQueue(q=>[...q,...fresh]);
  },[game.moneyEvents,roomKey]);
  const seq=queue[0]?.seq;
  useEffect(()=>{if(seq===undefined)return;const timer=setTimeout(()=>setQueue(q=>q.slice(1)),3200);return ()=>clearTimeout(timer);},[seq]);
  return queue[0];
}

export function PlayerPads({game,roomKey}:{game:SubwayState;roomKey:string}) {
  const event=useMoneyEvents(game,roomKey),changes=event?moneyChanges(event):[];
  const ids=game.playerOrder,activeId=['PROCUREMENT','ENGINEERING','STARTER_PLACEMENT','CONSTRUCTION'].includes(game.phase)?nextCompanyId(game):undefined;
  return <section aria-label="Player panels" className="pointer-events-auto relative w-full rounded-xl border border-teal-700 bg-[#10252e] p-2 text-white">
    <style>{`@keyframes subway-cash {0%{transform:translateY(6px);opacity:0}15%,80%{transform:translateY(0);opacity:1}100%{opacity:0}} .subway-cash{animation:subway-cash 3.2s both} @keyframes subway-transfer {0%{left:var(--from);transform:translate(-50%,0);opacity:0}15%{opacity:1}50%{transform:translate(-50%,-72px);opacity:1}85%{opacity:1}100%{left:var(--to);transform:translate(-50%,0);opacity:0}} .subway-transfer{animation:subway-transfer 2.6s ease-in-out both} @media(prefers-reduced-motion:reduce){.subway-cash,.subway-transfer{animation:none}.subway-transfer{display:none}}`}</style>
    <div role="status" aria-live="polite" className={`${event?'min-h-5':'sr-only'} text-center text-xs text-amber-200`}>{event?`${event.reversed?'Undo · ':''}${event.payments.map(p=>p.from==='bank'?`${game.players[p.to!]?.name} ${event.reversed?'−':'+'}$${p.amount}M · ${event.reversed?`${p.reason.toLowerCase()} reversed`:p.reason.toLowerCase()}`:`${game.players[p.from]?.name} ${event.reversed?'receives refund from':'pays'} ${game.players[p.to!]?.name??'the bank'} $${p.amount}M · ${p.reason}`).join(' · ')}`:'Company lines and cash'}</div>
    {event?.payments.filter(p=>p.from!=='bank'&&p.to).map((p,i)=><span key={`${event.seq}-${i}`} aria-hidden className="subway-transfer pointer-events-none absolute top-5 z-10 rounded bg-amber-200 px-2 text-xs font-black text-slate-900" style={{'--from':`${((ids.indexOf(event.reversed?p.to!:p.from)+.5)/ids.length)*100}%`,'--to':`${((ids.indexOf(event.reversed?p.from:p.to!)+.5)/ids.length)*100}%`} as React.CSSProperties}>${p.amount}M</span>)}
    <div className="grid gap-2" style={{gridTemplateColumns:`repeat(${ids.length}, minmax(0,1fr))`}}>{ids.map(id=>{
      const p=game.players[id];return <div key={id} aria-current={activeId===id?'step':undefined} className={`min-w-0 rounded-lg border-t-4 px-2 py-1 ${activeId===id?'bg-teal-700/40 ring-1 ring-teal-300/60':'bg-white/5'}`} style={{borderColor:p.color}}>
        <div className="flex flex-wrap justify-between gap-x-2 text-sm"><b className="truncate" title={p.name}>{p.name}</b><strong>${p.money}M</strong></div>
        <div aria-label={`${p.name}'s lines`} className="mt-1 flex flex-wrap gap-1">{p.lines.map(l=>{const c=contractOf(l)!;return <span key={c.id} title={c.name} aria-label={c.name} className="rounded border border-white/30 bg-slate-900 px-1 text-[10px] font-black"><span className="mr-1 inline-block h-1.5 w-3 rounded" style={{background:c.color}}/>{c.code}</span>;})}</div>
        {(p.engineeringHand.length>0||p.destinationHand.length>0)&&<div aria-label={`${p.name}'s cards`} data-public-cards={id} className="mt-1 flex flex-wrap items-center gap-1">
          {p.engineeringHand.map(cardId=><EngineeringGlyph key={cardId} id={cardId} met={objectiveMet(cardId,p,ids.filter(o=>o!==id).map(o=>game.players[o]),game)}/>)}
          {p.destinationHand.map(cardId=><DestinationChip key={cardId} id={cardId} met={destinationMet(p,cardId)}/>)}
        </div>}
        {changes.filter(c=>c.playerId===id).map((c,i)=><span key={`${event!.seq}-${i}`} className={`subway-cash mr-1 inline-block text-xs font-black ${c.amount>0?'text-emerald-300':'text-rose-300'}`}>{c.amount>0?'+':'−'}${Math.abs(c.amount)}M</span>)}
      </div>;
    })}</div>
  </section>;
}

export function PhoneStatus({game,playerId,details=false}:{game:SubwayState;playerId:string;details?:boolean}) {
  const me=game.players[playerId],standings=useMemo(()=>publicStandings(game),[game]);
  if(!me)return null;
  return <section aria-label="Your company status" className="rounded-xl bg-[#193640] p-3 text-white shadow-lg">
    <style>{`@keyframes subway-hired {50%{box-shadow:0 0 0 2px currentColor;background:#ffffff22}} .subway-hired{animation:subway-hired 1.8s ease-in-out infinite} @media(prefers-reduced-motion:reduce){.subway-hired{animation:none;outline:2px solid currentColor}}`}</style>
    <div className="flex flex-wrap items-center justify-between gap-1 text-xs"><b className="flex items-center gap-1.5">{me.name} · ${me.money}M<span aria-label={`Round ${game.currentPeriod} of ${SUBWAY_CONFIG.timelinePeriods}`} title={`Round ${game.currentPeriod} of ${SUBWAY_CONFIG.timelinePeriods}`} className="rounded bg-amber-300 px-1 text-[10px] font-black leading-4 text-slate-900">R{Math.min(game.currentPeriod,SUBWAY_CONFIG.timelinePeriods)}</span></b>{details&&<span>Your network {standings.lengths[playerId].toFixed(1)} spaces · Stations in leading transfer stations {standings.stationCounts[playerId]}</span>}</div>
    {details&&<><p className="mt-1 text-xs">{BEND_LABELS[game.bendMode??'straight']}{game.bendMode==='tokens'?` · ${me.bendTokens??0} bend tokens`:''}</p><div className="my-2"><PublicLeaders game={game}/></div></>}
    <div className="mt-1 space-y-1">{me.lines.map((l,index)=>{const c=contractOf(l)!,built=segmentsBuilt(l),left=c.recipe.length-built;const hired=game.phase==='CONSTRUCTION'&&nextCompanyId(game)===playerId&&me.crewsHired&&me.pendingActions.includes(index);return <div key={c.id} data-hired-line={hired?c.id:undefined} className={`flex flex-wrap items-center gap-x-2 rounded px-1 text-[11px] ${hired?'subway-hired':''}`} aria-label={`${c.name}: ${built} of ${c.recipe.length} segments built; ${c.recipe.length+1-l.route.length} stations and ${left} segments left${hired?'; hired to build':''}`}>
      <b className="w-7 border-b-4" style={{borderColor:c.color}}>{c.code}</b>
      <span className="flex gap-1" aria-hidden>{Array.from({length:c.recipe.length+1},(_,i)=><span key={i} className={`inline-block h-2.5 w-2.5 border ${i===0?'rotate-45':'rounded-full'}`} style={{borderColor:c.color,background:i<l.route.length?c.color:'transparent'}}/>)}</span>
      {details&&<span>{built}/{c.recipe.length} segments · {left} left{l.work?.length?` · Worksite: ${remainingLength(game,playerId,index).toFixed(1)} spaces to finish`:""}</span>}
    </div>;})}</div>
    {details&&me.lines.length>0&&<p className="mt-1 text-[10px] text-slate-300">Diamond = starter · filled = placed · empty = remaining stations. Pulsing lines have hired crews waiting to build.</p>}
  </section>;
}
