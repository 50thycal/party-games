"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { CompanionView } from "@/games/subway/companion";
import { SubwayGameView } from "@/games/subway/GameView";
import { DestinationCardFace, EngineeringCardFace } from "@/games/subway/CardArt";
import { ContractCard } from "@/games/subway/cards";
import { SUBWAY_CONFIG, contractById, contractOf, destinationMet, objectiveMet, lineComplete, segmentsBuilt, type RouteNode } from "@/games/subway/config";

const KEY = "subway-companion-device-v1";
type Identity = {roomCode:string;token:string};
type Tab = "destinations" | "lines" | "engineering" | "general";
const tabs: {id:Tab;icon:string;label:string}[] = [
  {id:"destinations",icon:"⚑",label:"Destinations"}, {id:"lines",icon:"〰",label:"Lines"},
  {id:"engineering",icon:"⚙",label:"Engineering"}, {id:"general",icon:"ⓘ",label:"General"},
];
const button = "min-h-12 rounded-xl bg-teal-700 px-4 py-3 font-bold text-white disabled:opacity-40";
const input = "w-full rounded-xl border border-slate-500 bg-slate-900 p-3 text-white";

export default function SubwayMultiplayerPage() {
  const [identity,setIdentity] = useState<Identity|null>(null);
  const [view,setView] = useState<CompanionView|null>(null);
  const [code,setCode] = useState("");
  const [name,setName] = useState("");
  const [role,setRole] = useState("phone");
  const [recovery,setRecovery] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [online,setOnline] = useState(true);
  const [tab,setTab] = useState<Tab>("destinations");
  const [surveys,setSurveys] = useState(0);
  const [deviceSettings,setDeviceSettings] = useState(false);
  const [acknowledgedTurn,setAcknowledgedTurn] = useState<string|null>(null);
  const sending = useRef(false);
  const latestRevision = useRef(-1);
  const accept = (next:CompanionView) => {
    if (next.revision < latestRevision.current) return;
    latestRevision.current = next.revision;
    setView(next);
  };
  useEffect(()=>{
    setCode(new URLSearchParams(window.location.search).get("roomCode")?.toUpperCase() ?? "");
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (saved?.roomCode && saved?.token) setIdentity(saved);
    } catch { /* Join form remains usable. */ }
  },[]);
  useEffect(()=>{
    if (!identity) return;
    let cancelled=false;
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{
      try {
        const response=await fetch(`/api/subway-companion?roomCode=${identity.roomCode}`,{headers:{Authorization:`Bearer ${identity.token}`},cache:"no-store"});
        const json=await response.json();
        if (!json.ok) throw new Error(json.message);
        if (!cancelled) {accept(json.data);setOnline(true);}
      } catch { if(!cancelled) setOnline(false); }
      if(!cancelled) timer=setTimeout(poll,1000);
    };
    void poll();
    return ()=>{cancelled=true;clearTimeout(timer);};
  },[identity]);

  async function enter(operation:"create"|"join") {
    setBusy(true);setError("");
    try {
      const response=await fetch("/api/subway-companion",{method:"POST",headers:{"Content-Type":"application/json",...(recovery?{Authorization:`Bearer ${recovery.trim()}`}:{})},body:JSON.stringify({operation,roomCode:code,name,role})});
      const json=await response.json();
      if(!json.ok) throw new Error(json.message);
      const next={roomCode:json.data.view.room.roomCode,token:json.data.token};
      localStorage.setItem(KEY,JSON.stringify(next));
      latestRevision.current=-1;setIdentity(next);accept(json.data.view);setOnline(true);
    } catch(e) {setError(e instanceof Error?e.message:"Could not join.");}
    finally {setBusy(false);}
  }

  async function act(type:string,payload?:Record<string,unknown>) {
    if(!identity || !view) throw new Error("Reconnect to your company first.");
    if(sending.current) throw new Error("Wait for the current action to finish.");
    sending.current=true;setBusy(true);setError("");
    const body=JSON.stringify({operation:"action",roomCode:identity.roomCode,type,payload,revision:view.revision,requestId:crypto.randomUUID()});
    try {
      // A network retry uses the same request ID: the server never repeats a payment.
      let response:Response|undefined;
      for(let attempt=0;attempt<2;attempt++) {
        try {response=await fetch("/api/subway-companion",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${identity.token}`},body});break;}
        catch(e) {if(attempt===1) throw e;}
      }
      const json=await response!.json();
      if(!json.ok) throw new Error(json.message);
      accept(json.data.view);setOnline(true);
      if(type === "ACK_COMPANY") setAcknowledgedTurn(json.data.view.turn);
    } catch(e) {const message=e instanceof Error?e.message:"Action failed. Check the table before trying again.";setError(message);throw e;}
    finally {sending.current=false;setBusy(false);}
  }
  const run=(type:string,payload?:Record<string,unknown>)=>{void act(type,payload).catch(()=>{});};
  function leave() {localStorage.removeItem(KEY);setIdentity(null);setView(null);latestRevision.current=-1;setDeviceSettings(false);}

  if(!view) return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 p-6">
    <Link href="/" className="text-sm text-slate-400">← Party Games</Link>
    <h1 className="text-3xl font-black">Subway · Table & phones</h1>
    <p>Create the shared board on your iPad, then join each company on a phone.</p>
    {identity ? <><p>{online?"Opening your company…":"Could not reconnect. Your game is saved."}</p><button className={button} onClick={leave}>Join with a recovery key</button></> : <>
      <button className={button} disabled={busy} onClick={()=>void enter("create")}>I am the iPad · Create game</button>
      <form className="space-y-3 border-t border-slate-600 pt-5" onSubmit={e=>{e.preventDefault();void enter("join");}}>
        <label className="block">Room code<input aria-label="Room code" className={input} maxLength={4} value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/></label>
        <label className="block">This device<select className={input} value={role} onChange={e=>setRole(e.target.value)}><option value="phone">My phone</option><option value="tablet">I am the iPad · Reconnect</option></select></label>
        {role==="phone"&&<label className="block">Company name<input className={input} maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label>}
        <label className="block text-sm">Recovery key {role==="phone"?"(only when rejoining)":"from the original iPad"}<input className={input} type="password" autoComplete="off" value={recovery} onChange={e=>setRecovery(e.target.value)}/></label>
        <button className={`${button} w-full`} disabled={busy||code.length!==4}>Join game</button>
      </form>
    </>}
    {error&&<p role="alert" className="text-rose-300">{error}</p>}
    <Link href="/subway" className="text-sm underline">Local testing tabletop</Link>
  </main>;

  const game=view.game;
  const me=game?.players[view.playerId];
  const actor=game?.players[view.actorId??""];
  const tablet=view.role==="tablet";
  const controlsDisabled=busy||!online;
  const onPhone=game?.phase==="PROCUREMENT"||(game?.phase==="ENGINEERING"&&["CARD_DRAFT","BUY_SURVEYS"].includes(game.engineeringStep));
  const needsHandoff=tablet&&!onPhone&&!!view.actorId&&(view.seatedId!==view.actorId||acknowledgedTurn!==view.turn);
  const header=<header className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#193640] p-3 text-white">
    <strong>SUBWAY <span className="text-amber-300">·</span> {tablet?`Room ${view.room.roomCode}`:me?.name??view.room.players.find(p=>p.id===view.playerId)?.name}</strong>
    <span className="text-sm">{me?`$${me.money}M · Round ${game?.currentPeriod}/${SUBWAY_CONFIG.timelinePeriods}`:`${view.room.players.length}/4 companies`}</span>
    <button className="rounded-lg bg-white/10 px-3 py-2 text-sm" onClick={()=>setDeviceSettings(v=>!v)}>Device</button>
  </header>;
  const settings=deviceSettings&&<section className="space-y-3 rounded-xl bg-slate-800 p-4">
    <p className="text-sm">Keep this recovery key private. It restores this device on another browser.</p>
    <code className="block break-all text-xs select-all">{identity?.token}</code>
    <button className={button} onClick={leave}>Leave this device</button>
  </section>;
  const notices=<>{!online&&<p role="alert" className="rounded-lg bg-amber-950 p-3">Connection lost. Reconnecting… Board actions are paused.</p>}{error&&<p role="alert" className="rounded-lg bg-rose-950 p-3">{error}</p>}</>;
  if(!game) return <main className="mx-auto max-w-xl space-y-5 p-4">{header}{settings}{notices}
    <h1 className="text-2xl font-bold">Companies at the table</h1>
    <div className="rounded-xl bg-slate-800 p-4"><p className="text-sm">Join on each phone at</p><p className="break-all font-bold">{typeof window!=="undefined"?window.location.host:""}/subway/multiplayer</p><p className="text-5xl font-black tracking-widest">{view.room.roomCode}</p></div>
    {view.room.players.map(p=><p key={p.id} className="rounded-xl bg-white/10 p-4">{p.name} · ready</p>)}
    {tablet?<button className={button} disabled={controlsDisabled||view.room.players.length<2} onClick={()=>run("START_GAME")}>Start with {view.room.players.length} companies</button>:<p>Keep this phone with you. The iPad starts the game.</p>}
  </main>;

  if(tablet) return <main className="space-y-2 p-2">{header}{settings}{notices}
    {view.canUndo&&!view.seatedId&&!needsHandoff&&<button className={button} disabled={controlsDisabled} onClick={()=>run("UNDO_PLACEMENT")}>Undo {game.undo?.label}</button>}
    {onPhone&&<p className="rounded-xl bg-teal-950 p-3">{actor?`${actor.name}: choose on your phone.`:"Buy Survey Pins on your phones."}</p>}
    {needsHandoff?<section className="flex min-h-[65dvh] flex-col items-center justify-center gap-6 rounded-3xl bg-[#193640] p-8 text-center">
      <h1 className="text-3xl font-bold">Pass to {actor?.name}</h1><p>The previous company’s ghosts are hidden.</p>
      <button className={button} disabled={controlsDisabled} onClick={()=>run("ACK_COMPANY",{playerId:view.actorId})}>I am {actor?.name}</button>
      {view.canUndo&&game.undo&&<button className="min-h-12 underline" disabled={controlsDisabled} onClick={()=>run("UNDO_PLACEMENT")}>Undo last placement · {game.players[game.undo.playerId]?.name}</button>}
    </section>:<div className={!online?"pointer-events-none opacity-60":""}>
      <SubwayGameView key={`${view.turn}:${view.seatedId??"public"}`} state={game} room={view.room} playerId={view.seatedId??""} isHost boardOnly remotePlans={view.plans} dispatchAction={act} onSaveGhost={(contractId:string,nodes:RouteNode[])=>act("SAVE_GHOST",{contractId,nodes})}/>
    </div>}
  </main>;

  if(!me) return <main className="p-4">{header}{notices}<p>Waiting for your company.</p></main>;
  const myTurn=view.actorId===me.id;
  const buyDestination=game.phase==="CONSTRUCTION"&&myTurn&&!me.crewsHired&&!me.destinationPurchased;
  return <main className="mx-auto min-h-dvh max-w-lg space-y-4 px-3 pb-28 pt-3">{header}{settings}{notices}
    <style>{`@media (orientation: landscape) { .phone-portrait-prompt { display: flex !important; } }`}</style>
    <div className="phone-portrait-prompt fixed inset-0 z-50 hidden flex-col items-center justify-center gap-3 bg-[#10252e] p-6 text-center"><span className="text-4xl" aria-hidden>↻</span><p className="text-xl font-bold">Turn your phone upright</p><p>Your cards are arranged for portrait play.</p></div>
    <p className="rounded-xl bg-white/5 p-3 text-sm" aria-live="polite">{onPhone?(game.engineeringStep==="BUY_SURVEYS"&&game.phase==="ENGINEERING"?"Choose Survey Pins under General.":myTurn?`Your choice · open ${game.phase==="PROCUREMENT"?"Lines":"Engineering"}.`:`${actor?.name??"Another company"} is choosing.`):game.phase==="RESULTS"?"Final results are ready.":`${actor?.name??"The table"} has the iPad.`}</p>
    <h1 className="text-xl font-bold">{tabs.find(t=>t.id===tab)?.label}</h1>
    {tab==="destinations"&&<>{me.destinationHand.map(id=><DestinationCardFace key={id} card={id} color={me.color} state={destinationMet(me,id)?"met":"idle"}/>)}
      {buyDestination&&<button className={`${button} w-full`} disabled={controlsDisabled||me.money<5} onClick={()=>run("BUY_DESTINATION",{period:game.currentPeriod})}>Buy another Destination · $5M</button>}
    </>}
    {tab==="lines"&&<>
      {game.phase==="PROCUREMENT"&&<section className="space-y-4"><p>Choose three lines, one per turn.</p>{game.procurement.row.map(id=>{const c=contractById(id)!;return <ContractCard key={id} contract={c}><button className={`${button} mt-3 w-full`} disabled={controlsDisabled||!myTurn||me.money<c.cost} onClick={()=>run("PROCURE",{choice:"buy",contractId:id})}>Buy {c.name} · ${c.cost}M</button></ContractCard>;})}</section>}
      {me.lines.map(line=>{const c=contractOf(line)!;const plan=view.plans[line.contractId];return <ContractCard key={line.contractId} contract={c} progress={{built:segmentsBuilt(line),total:c.recipe.length}}>
        <p className="mt-3 text-sm">{lineComplete(line)?"Complete · $3M reward paid":"Complete this line to receive $3M."}</p>
        {plan&&<GhostDiagram nodes={plan.nodes} color={c.color} built={line.route.length}/>}
      </ContractCard>;})}
    </>}
    {tab==="engineering"&&<>
      {game.phase==="ENGINEERING"&&game.engineeringStep==="CARD_DRAFT"&&<section className="space-y-4"><p>Pick one of these goals, or draw blind. Three picks per company.</p>
        {game.market.rows.engineering.map(id=><div key={id}><EngineeringCardFace card={id} color={me.color}/><button className={`${button} mt-2 w-full`} disabled={controlsDisabled||!myTurn} onClick={()=>run("DRAFT_CARD",{deck:"engineering",cardId:id,expectedPick:game.market.picks})}>Choose this goal</button></div>)}
        <button className={`${button} w-full`} disabled={controlsDisabled||!myTurn||!view.engineeringRemaining} onClick={()=>run("DRAFT_CARD",{deck:"engineering",expectedPick:game.market.picks})}>Draw blind · {view.engineeringRemaining} left</button>
      </section>}
      {me.engineeringHand.map(id=><EngineeringCardFace key={id} card={id} color={me.color} state={objectiveMet(id,me,Object.values(game.players).filter(p=>p.id!==me.id),game)?"met":"idle"}/>)}
    </>}
    {tab==="general"&&<>
      {game.phase==="ENGINEERING"&&game.engineeringStep==="BUY_SURVEYS"&&!me.engineeringLocked&&<section className="space-y-3 rounded-xl bg-white/10 p-4"><label>Survey Pins · $1M each<select className={input} value={surveys} onChange={e=>setSurveys(Number(e.target.value))}>{[0,1,2,3,4,5].map(n=><option key={n} value={n}>{n} pins</option>)}</select></label><button className={button} disabled={controlsDisabled||me.money<surveys} onClick={()=>run("BUY_SURVEYS",{surveys})}>Confirm {surveys} pins</button></section>}
      {buyDestination&&<button className={button} disabled={controlsDisabled||me.money<5} onClick={()=>run("BUY_DESTINATION",{period:game.currentPeriod})}>Buy Destination · $5M</button>}
      {game.playerOrder.map(id=>{const p=game.players[id];return <section key={id} className="space-y-2 rounded-xl border border-white/20 p-4"><strong>{p.name} · ${p.money}M {p.score!==undefined?`· ${p.score} VP`:""}</strong><p>{p.lines.filter(lineComplete).length}/3 lines complete</p>{p.lines.map(l=><p key={l.contractId}>{contractOf(l)?.name}: {segmentsBuilt(l)}/{contractOf(l)?.recipe.length} segments</p>)}{game.phase==="RESULTS"&&p.scoreBreakdown?.map((s,i)=><p key={i} className="text-sm">{s.label}: {s.points} VP</p>)}</section>;})}
      <p className="text-sm">Crews: $1M / $3M / $6M. Completing each line pays $3M. Final debt costs 4 VP per $1M.</p>
      <section className="space-y-3">{game.events.slice().reverse().map(e=><p key={e.seq} className="border-t border-white/10 pt-3 text-sm">{e.text}</p>)}</section>
    </>}
    <nav aria-label="Company pages" className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-lg grid-cols-4 gap-1 border-t border-white/20 bg-[#10252e] px-2 pt-2" style={{paddingBottom:"max(12px, env(safe-area-inset-bottom))"}}>
      {tabs.map(t=><button key={t.id} aria-current={tab===t.id?"page":undefined} className={`min-h-16 rounded-xl text-[11px] ${tab===t.id?"bg-teal-700 text-white":"text-slate-300"}`} onClick={()=>{setTab(t.id);window.scrollTo({top:0});}}><span aria-hidden className="block text-2xl">{t.icon}</span>{t.label}</button>)}
    </nav>
  </main>;
}

function GhostDiagram({nodes,color,built}:{nodes:RouteNode[];color:string;built:number}) {
  return <div className="mt-3"><p className="text-xs">Saved ghost · edit on the iPad</p><svg viewBox="-1 -1 28 10" role="img" aria-label="Your saved route plan" className="mt-2 w-full rounded-lg bg-stone-200 p-2">
    {nodes.slice(1).map((n,i)=><line key={`l${i}`} x1={nodes[i].x} y1={nodes[i].y} x2={n.x} y2={n.y} stroke={color} strokeWidth=".18" strokeDasharray={i+1>=built?".3 .2":undefined} opacity={i+1>=built?.5:1}/>)}
    {nodes.map((n,i)=><circle key={i} cx={n.x} cy={n.y} r=".22" fill={color} opacity={i>=built?.5:1}/>)}
  </svg></div>;
}
