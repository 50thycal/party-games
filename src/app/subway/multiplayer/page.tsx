"use client";
import { HowToPlay } from "@/games/subway/Intro";

import {SegmentLengthSelect,type SegmentLengthMode} from "@/games/subway/SegmentLengthSelect";
import {BendModeSelect} from "@/games/subway/BendModeSelect";
import {type BendMode} from "@/games/subway/bends";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PhoneStatus, PlayerPads, YourTurnBanner } from "@/games/subway/PlayerStatus";
import { ReportSaveControls } from "@/games/subway/ReportSaveControls";
import { generateAiPlaytestReport } from "@/games/subway/report";
import { LabControls } from "@/games/subway/LabControls";
import { recoverableBotError } from "@/games/subway/botAutomation";
import { nextCompanyId } from "@/games/subway/config";
import { turnSummary, type TurnSummary } from "@/games/subway/turnSummary";
import { BuyCardButton } from "@/games/subway/BuyCardButton";
import { DEVICE_SESSION_KEY, DEVICE_SESSION_TOUCH_MS, parseSavedIdentity, resumeDecision, staleRoomDecision, stamped, type SavedDeviceIdentity } from "@/games/subway/deviceSession";
import type { CompanionView } from "@/games/subway/companion";
import { SubwayGameView } from "@/games/subway/GameView";
import { DestinationCardFace, EngineeringCardFace } from "@/games/subway/CardArt";
import { ContractCard } from "@/games/subway/cards";
import { phoneGuidance } from "@/games/subway/guidance";
import { destinationColor } from "@/games/subway/destinationColors";
import { SUBWAY_CONFIG, cardPurchaseBlocker, contractById, contractOf, destinationMet, objectiveProgress, lineComplete, segmentsBuilt, type RouteNode } from "@/games/subway/config";

const KEY = DEVICE_SESSION_KEY;
type Identity = SavedDeviceIdentity;
type Tab = "destinations" | "lines" | "engineering" | "general";
const tabs: {id:Tab;icon:string;label:string}[] = [
  {id:"destinations",icon:"⚑",label:"Destinations"}, {id:"lines",icon:"〰",label:"Lines"},
  {id:"engineering",icon:"⚙",label:"Engineering"}, {id:"general",icon:"ⓘ",label:"General"},
];
const button = "min-h-12 rounded-xl bg-teal-700 px-4 py-3 font-bold text-white disabled:opacity-40";
const input = "w-full rounded-xl border border-slate-500 bg-slate-900 p-3 text-white";

export default function SubwayMultiplayerPage() {
  const [bendMode,setBendMode]=useState<BendMode>('delayed');
  const [segmentLengthMode,setSegmentLengthMode]=useState<SegmentLengthMode>('exact');
  const [identity,setIdentity] = useState<Identity|null>(null);
  const [auto,setAuto]=useState(true);
  const botRetryAfter=useRef(0);
  useEffect(()=>{
    if(!identity) return;
    try {setAuto(localStorage.getItem(`subway-bots:${identity.roomCode}:${identity.token}`)!=='off');} catch {setAuto(true);}
  },[identity]);
  const toggleAuto=(enabled:boolean)=>{
    setAuto(enabled);
    if(identity) try {localStorage.setItem(`subway-bots:${identity.roomCode}:${identity.token}`,enabled?'on':'off');} catch { /* Current session still works. */ }
  };
  const [follow,setFollow]=useState(true);
  const [view,setView] = useState<CompanionView|null>(null);
  const [code,setCode] = useState("");
  const [name,setName] = useState("");
  const [role,setRole] = useState("phone");
  const [recovery,setRecovery] = useState("");
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const [online,setOnline] = useState(true);
  const [tab,setTab] = useState<Tab>("destinations");
  const [deviceSettings,setDeviceSettings] = useState(false);
  const hasGame=!!view?.game;
  const padsRef=useRef<HTMLDivElement>(null);
  const [padsHeight,setPadsHeight]=useState(120);
  useEffect(()=>{
    const el=padsRef.current;if(!el)return;
    const observer=new ResizeObserver(()=>setPadsHeight(el.getBoundingClientRect().height));
    observer.observe(el);return ()=>observer.disconnect();
  },[view?.role,hasGame]);
  const [acknowledgedTurn,setAcknowledgedTurn] = useState<string|null>(null);
  // A saved identity idle for more than the window waits here for Resume/Leave.
  const [stale,setStale] = useState<(Identity&{name?:string})|null>(null);
  // Flash shown to the company that just took the iPad: what happened meanwhile.
  const [summary,setSummary] = useState<{turn:string;playerId:string;summary:TurnSummary}|null>(null);
  useEffect(()=>{ if(!summary) return; const timer=setTimeout(()=>setSummary(null),9000); return ()=>clearTimeout(timer); },[summary]);
  const lastTouch = useRef(0);
  const persist = (next:Identity) => { try { localStorage.setItem(KEY,JSON.stringify(stamped(next,Date.now()))); } catch { /* Session still works. */ } };
  const sending = useRef(false);
  const latestRevision = useRef(-1);
  const accept = (next:CompanionView) => {
    if (next.revision < latestRevision.current) return;
    latestRevision.current = next.revision;
    setView(next);
  };
  useEffect(()=>{
    setCode(new URLSearchParams(window.location.search).get("roomCode")?.toUpperCase() ?? "");
    let saved:Identity|null=null;
    try { saved = parseSavedIdentity(localStorage.getItem(KEY)); } catch { /* Join form remains usable. */ }
    const decision = resumeDecision(saved, Date.now());
    if (decision === "resume") setIdentity(saved);
    else if (decision === "ask" && saved) {
      // Idle too long: peek once. A finished or missing room is forgotten; a
      // live one asks before rejoining so a long break never locks anyone out.
      const idle = saved;
      (async () => {
        let ok=false, phase:string|undefined, name:string|undefined;
        try {
          const response=await fetch(`/api/subway-companion?roomCode=${idle.roomCode}`,{headers:{Authorization:`Bearer ${idle.token}`},cache:"no-store"});
          const json=await response.json();
          ok=!!json.ok; phase=json.data?.game?.phase; name=json.data?.game?.players?.[json.data?.playerId]?.name;
        } catch { ok=true; /* Offline: keep the identity and ask. */ }
        if (staleRoomDecision(ok,phase)==="forget") { try { localStorage.removeItem(KEY); } catch { /* Nothing to clear. */ } }
        else setStale({...idle,name});
      })();
    }
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
        if (!cancelled) {
          accept(json.data);setOnline(true);
          if (Date.now()-lastTouch.current>DEVICE_SESSION_TOUCH_MS) { lastTouch.current=Date.now(); persist(identity); }
        }
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
      persist(next);lastTouch.current=Date.now();
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
      if(type === "ACK_COMPANY") {
        setAcknowledgedTurn(json.data.view.turn);
        const id=typeof payload?.playerId==="string"?payload.playerId:undefined;
        const recap=id&&view.game?turnSummary(view.game,id):null;
        setSummary(recap&&id?{turn:json.data.view.turn,playerId:id,summary:recap}:null);
      }
    } catch(e) {const message=e instanceof Error?e.message:"Action failed. Check the table before trying again.";setError(message);throw e;}
    finally {sending.current=false;setBusy(false);}
  }
  const run=(type:string,payload?:Record<string,unknown>)=>{void act(type,payload).catch(error=>{
    if(type!=='LAB_STEP') return;
    if(recoverableBotError(error)) {botRetryAfter.current=Date.now()+2000;return;}
    setAuto(false);setError(`Bots paused: ${error instanceof Error?error.message:'Action failed.'} Use Resume to try again.`);
  });};
  useEffect(()=>{
    if(!auto||!view?.lab||view.role!=='tablet'||busy||!online||!view.game) return;
    const id=nextCompanyId(view.game);
    if(view.game.phase==='RESULTS'||(view.game.phase!=='SCORING'&&view.lab.seats.find(s=>s.id===id)?.control!=='bot')) return;
    const timer=setTimeout(()=>run('LAB_STEP'),Math.max(500,botRetryAfter.current-Date.now()));
    return ()=>clearTimeout(timer);
    // Each accepted server revision permits exactly one next request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[auto,view,busy,online]);
  useEffect(()=>{
    if(!follow||!view?.lab||view.role!=='phone'||busy||!online||!view.game) return;
    const id=nextCompanyId(view.game);
    if(id&&id!==view.playerId&&view.lab.managedIds.includes(id)&&view.lab.seats.find(s=>s.id===id)?.control==='human') run('LAB_SELECT',{playerId:id});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[follow,view,busy,online]);
  async function exportRecord() {
    if(!identity) return;
    try {
      const response=await fetch(`/api/subway-companion?roomCode=${identity.roomCode}&export=1`,{headers:{Authorization:`Bearer ${identity.token}`}});
      const json=await response.json();if(!json.ok) throw new Error(json.message);
      const url=URL.createObjectURL(new Blob([JSON.stringify(json.data,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download=`subway-${identity.roomCode}-replay.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } catch(e) {setError(e instanceof Error?e.message:'Export failed.');}
  }
  function leave() {try{localStorage.removeItem(KEY);}catch{ /* Nothing to clear. */ }setIdentity(null);setView(null);setStale(null);latestRevision.current=-1;setDeviceSettings(false);}

  if(!view&&stale) return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 p-6" data-resume-prompt>
    <h1 className="text-3xl font-black">Welcome back</h1>
    <p>This device was last in room <b className="tracking-widest">{stale.roomCode}</b>{stale.name?<> as <b>{stale.name}</b></>:null} more than 20 minutes ago.</p>
    <button className={button} onClick={()=>{const next={roomCode:stale.roomCode,token:stale.token,...(stale.controllerKey?{controllerKey:stale.controllerKey}:{})};persist(next);lastTouch.current=Date.now();setStale(null);setIdentity(next);}}>Resume room {stale.roomCode}</button>
    <button className="min-h-12 rounded-xl border border-slate-500 px-4 py-3 font-bold" onClick={leave}>Leave · start fresh</button>
    <p className="text-xs text-slate-400">Leaving forgets this device’s key. You can still rejoin with the recovery key from the iPad settings.</p>
  </main>;

  if(!view) return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-5 p-6">
    <Link href="/" className="text-sm text-slate-400">← Party Games</Link>
    <h1 className="text-3xl font-black">Subway · Table & phones</h1>
    <HowToPlay bendMode={bendMode} segmentLengthMode={segmentLengthMode}/>
    <p>Create the shared board on your iPad, then join each company on a phone.</p>
    {identity ? <><p>{online?"Opening your company…":"Could not reconnect. Your game is saved."}</p><button className={button} onClick={leave}>Join with a recovery key</button></> : <>
      <button className={button} disabled={busy} onClick={()=>void enter("create")}>I am the iPad · Create game</button>
      <form className="space-y-3 border-t border-slate-600 pt-5" onSubmit={e=>{e.preventDefault();void enter("join");}}>
        <label className="block">Room code<input aria-label="Room code" className={input} maxLength={4} value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/></label>
        <label className="block">This device<select className={input} value={role} onChange={e=>setRole(e.target.value)}><option value="phone">My phone</option><option value="lab-phone">My testing phone · Playtest Lab</option><option value="tablet">I am the iPad · Reconnect</option></select></label>
        {role==="phone"&&<label className="block">Company name<input className={input} maxLength={40} value={name} onChange={e=>setName(e.target.value)}/></label>}
        {role==='lab-phone'&&<p className="text-sm">Enter the iPad’s room code to connect your first testing phone. You can switch between the lab’s managed companies; building stays on the iPad.</p>}
        <label className="block text-sm">Recovery key {role!=="tablet"?"(only when rejoining)":"from the original iPad"}<input className={input} type="password" autoComplete="off" value={recovery} onChange={e=>setRecovery(e.target.value)}/></label>
        <button className={`${button} w-full`} disabled={busy||code.length!==4}>Join game</button>
      </form>
    </>}
    {error&&<p role="alert" className="text-rose-300">{error}</p>}
    <Link href="/subway" className="text-sm underline">Quick tabletop</Link>
    <Link href="/subway/lab" className="text-sm underline">Playtest Lab · testing</Link>
  </main>;

  const game=view.game;
  const me=game?.players[view.playerId];
  const actor=game?.players[view.actorId??""];
  const tablet=view.role==="tablet";
  const controlsDisabled=busy||!online;
  const onPhone=game?.phase==="PROCUREMENT"||(game?.phase==="ENGINEERING"&&game.engineeringStep==="CARD_DRAFT");
  const needsHandoff=tablet&&!onPhone&&!!view.actorId&&(view.seatedId!==view.actorId||acknowledgedTurn!==view.turn);
  const header=<header className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#193640] p-2 text-white">
    {!game&&<strong>SUBWAY · Room {view.room.roomCode}</strong>}
    <button aria-label="Settings" aria-expanded={deviceSettings} className="ml-auto min-h-11 min-w-11 rounded-lg bg-white/10 px-3 py-2" onClick={()=>setDeviceSettings(v=>!v)}>⚙</button>
  </header>;
  const labControls=<LabControls view={view} run={run} busy={controlsDisabled} auto={auto} setAuto={toggleAuto} follow={follow} setFollow={setFollow} onExport={()=>void exportRecord()} controllerKey={identity?.controllerKey}/>;
  const settingsContent=<section className="space-y-3 rounded-xl bg-slate-800 p-4 text-white">
    {labControls}
    <p className="font-bold">SUBWAY · Room {view.room.roomCode}</p><p className="text-sm">Keep this recovery key private. It restores this device on another browser.</p>
    <code className="block break-all text-xs select-all">{identity?.token}</code>
    <button className={button} onClick={leave}>Leave this device</button>
  </section>;
  const settings=deviceSettings&&settingsContent;
  const reports=game?.phase==='RESULTS'&&<><ReportSaveControls report={generateAiPlaytestReport(game,{...view.reportContext,roomCode:view.room.roomCode,mode:view.room.mode})} roomCode={view.room.roomCode}/>{!view.lab&&<button className={button} onClick={()=>void exportRecord()}>Download replay JSON</button>}</>;
  const notices=<>{!online&&<p role="alert" className="rounded-lg bg-amber-950 p-3">Connection lost. Reconnecting… Board actions are paused.</p>}{error&&<p role="alert" className="rounded-lg bg-rose-950 p-3">{error}</p>}</>;
  if(!game) return <main className="mx-auto max-w-xl space-y-5 p-4">{header}{settings}{notices}<HowToPlay bendMode={bendMode} segmentLengthMode={segmentLengthMode}/>
    <h1 className="text-2xl font-bold">Companies at the table</h1>
    <div className="rounded-xl bg-slate-800 p-4"><p className="text-sm">Join on each phone at</p><p className="break-all font-bold">{typeof window!=="undefined"?window.location.host:""}/subway/multiplayer</p><p className="text-5xl font-black tracking-widest">{view.room.roomCode}</p>{view.lab&&<p className="mt-3">Choose <strong>My testing phone · Playtest Lab</strong> on your phone to control your managed companies. First connection needs only this room code. Friends with reserved seats choose My phone.</p>}</div>
    {view.room.players.map(p=><p key={p.id} className="rounded-xl bg-white/10 p-4">{p.name} · ready</p>)}
    {tablet&&<SegmentLengthSelect value={segmentLengthMode} onChange={setSegmentLengthMode} disabled={controlsDisabled}/>}
    {tablet&&<BendModeSelect value={bendMode} onChange={setBendMode} disabled={controlsDisabled}/>}
    {tablet?<button className={button} disabled={controlsDisabled||view.room.players.length<2} onClick={()=>run("START_GAME",{bendMode,segmentLengthMode})}>Start with {view.room.players.length} companies</button>:<p>Keep this phone with you. The iPad starts the game.</p>}
  </main>;

  const flash=summary&&summary.turn===view.turn&&!needsHandoff?<TurnFlash name={game.players[summary.playerId]?.name??"You"} color={game.players[summary.playerId]?.color??"#0f766e"} summary={summary.summary} onClose={()=>setSummary(null)}/>:null;
  if(tablet) return <main className="space-y-2 p-2" style={{paddingBottom:padsHeight}}>{needsHandoff&&<>{header}{settings}</>}{notices}{reports}{flash}
    {game.phase==="ENGINEERING"&&game.engineeringStep==="CARD_DRAFT"&&<section className="rounded-xl bg-[#193640] p-4 text-white"><p className="text-lg font-bold">{actor?.name}: choose a face-up Engineering card on your phone.</p><p>Or draw a random goal here.</p><button className={`${button} mt-2`} disabled={controlsDisabled||!view.engineeringRemaining} onClick={()=>run("DRAFT_CARD",{deck:"engineering",expectedPick:game.market.picks})}>Draw random Engineering goal</button></section>}
    {view.canUndo&&!view.seatedId&&!needsHandoff&&<button className={button} disabled={controlsDisabled} onClick={()=>run("UNDO_PLACEMENT")}>Undo {game.undo?.label}</button>}
    {needsHandoff?<section className="flex min-h-[65dvh] flex-col items-center justify-center gap-6 rounded-3xl bg-[#193640] p-8 text-center">
      <h1 className="text-3xl font-bold">Pass to {actor?.name}</h1><p>The previous company’s ghosts are hidden.</p>
      <button className={button} disabled={controlsDisabled} onClick={()=>run("ACK_COMPANY",{playerId:view.actorId})}>I am {actor?.name}</button>
      {view.canUndo&&game.undo&&<button className="min-h-12 underline" disabled={controlsDisabled} onClick={()=>run("UNDO_PLACEMENT")}>Undo last placement · {game.players[game.undo.playerId]?.name}</button>}
    </section>:<div className={!online?"pointer-events-none opacity-60":""}>
      <SubwayGameView drawPileCounts={view.drawPileCounts} key={`${view.turn}:${view.seatedId??"public"}`} state={game} room={view.room} playerId={view.seatedId??""} isHost boardOnly settingsContent={settingsContent} externalBottom={padsHeight} reportContext={view.reportContext} remotePlans={view.plans} dispatchAction={act} highlightedStations={view.highlightedStations} destinationHighlights={view.destinationHighlights} onSaveGhost={(contractId:string,nodes:RouteNode[])=>act("SAVE_GHOST",{contractId,nodes})}/>
    </div>}
    <div ref={padsRef} className="fixed inset-x-0 bottom-0 z-30 bg-[#10252e] px-2 pt-1" style={{paddingBottom:"max(8px, env(safe-area-inset-bottom))"}}><PlayerPads game={game} roomKey={view.room.roomCode}/></div>
  </main>;

  if(!me) return <main className="p-4">{header}{notices}<p>Waiting for your company.</p></main>;
  const myTurn=view.actorId===me.id;
  const guidance=phoneGuidance(game,me.id);
  return <main className="mx-auto min-h-dvh max-w-lg space-y-4 px-3 pb-28 pt-3"><div className="sticky top-0 z-20 bg-[#10252e] pb-2"><PhoneStatus game={game} playerId={me.id}/><YourTurnBanner active={myTurn} storageKey={`subway-turn-banner:${view.room.roomCode}:${me.id}`} turnKey={`${view.turn}:${game.phase==="PROCUREMENT"?game.procurement.offerIndex:game.phase==="ENGINEERING"?game.market.picks:game.phase==="STARTER_PLACEMENT"?Object.values(game.players).reduce((n,p)=>n+p.lines.filter(l=>l.route.length>0).length,0):0}`}/></div>{notices}
    <style>{`@media (orientation: landscape) { .phone-portrait-prompt { display: flex !important; } }`}</style>
    <div className="phone-portrait-prompt fixed inset-0 z-50 hidden flex-col items-center justify-center gap-3 bg-[#10252e] p-6 text-center"><span className="text-4xl" aria-hidden>↻</span><p className="text-xl font-bold">Turn your phone upright</p><p>Your cards are arranged for portrait play.</p></div>
    <section className="rounded-xl border border-teal-500 bg-[#193640] p-3 shadow-lg" aria-live="polite"><p className="text-sm">{guidance.text}</p>{tab!==guidance.tab&&<button className={`${button} mt-2 w-full`} onClick={()=>{setTab(guidance.tab);window.scrollTo({top:0});}}>{guidance.label}</button>}</section>
    <h1 className="text-xl font-bold">{tabs.find(t=>t.id===tab)?.label}</h1>
{tab==="destinations"&&<>{me.destinationHand.map(id=>{const met=destinationMet(me,id);return <section key={id} className="space-y-2" data-destination-section={id}><DestinationCardFace paid={me.destinationsPaid?.includes(id)} card={id} color={me.color} state={met?"met":"idle"} footer={<p data-destination-status={met?"met":"open"} className={`mt-1.5 rounded-full px-2 py-1 text-center text-xs font-black ${met?"bg-emerald-600 text-white":"bg-rose-100 text-rose-900"}`}>{met?"✓ Connected":"Not yet connected"}</p>}/><button className={`${button} w-full`} aria-pressed={view.destinationHighlights.some(h=>h.cardId===id)} disabled={controlsDisabled} onClick={()=>run("SHOW_DESTINATION",{cardId:id,enabled:!view.destinationHighlights.some(h=>h.cardId===id)})}><span aria-hidden className="mr-2 inline-block h-3 w-3 rounded-full border border-white" style={{background:destinationColor(view.room.players.findIndex(p=>p.id===me.id),me.destinationHand.indexOf(id))}}/>Highlights: {view.destinationHighlights.some(h=>h.cardId===id)?"On":"Off"}</button></section>;})}<p className="text-xs text-slate-300">Your selections are saved. The shared board shows them only during your turn; your phone keeps your own selections visible.</p><button className={button} disabled={controlsDisabled} onClick={()=>run("SHOW_DESTINATION",{cardId:null})}>Clear my highlights</button>
      <section aria-label="Destination draw" className="rounded-xl border border-purple-300/50 p-3"><h2 className="mb-2 rounded-lg bg-purple-200 p-2 font-bold text-slate-900">Draw more on your turn · $3M</h2><p className="mb-2 text-sm">Draw a random Destination. One extra per game, before hiring crews.</p><BuyCardButton game={game} playerId={me.id} busy={controlsDisabled} act={run} counts={view.drawPileCounts} deck="destination"/></section>
    </>}
    {tab==="lines"&&<>
      {game.phase==="PROCUREMENT"&&<section className="space-y-4"><p>Choose three lines, one per turn.</p>{game.procurement.row.map(id=>{const c=contractById(id)!;return <ContractCard key={id} contract={c}><button className={`${button} mt-3 w-full`} disabled={controlsDisabled||!myTurn||me.money<c.cost} onClick={()=>run("PROCURE",{choice:"buy",contractId:id})}>Buy {c.name} · ${c.cost}M</button></ContractCard>;})}</section>}
      {me.lines.map(line=>{const c=contractOf(line)!;const plan=view.plans[line.contractId];return <ContractCard key={line.contractId} contract={c} progress={game.phase==="PROCUREMENT"||game.phase==="ENGINEERING"?undefined:{built:segmentsBuilt(line),total:c.recipe.length}}>
        <p className="mt-3 text-sm">{lineComplete(line)?"Complete · $3M reward paid":"Complete this line to receive $3M."}</p>
        {plan&&<GhostDiagram nodes={plan.nodes} color={c.color} built={line.route.length}/>}
      </ContractCard>;})}
    </>}
    {tab==="engineering"&&<>
      {me.engineeringHand.map(id=>{const progress=objectiveProgress(id,me,Object.values(game.players).filter(p=>p.id!==me.id),game);return <section key={id} className="space-y-2"><EngineeringCardFace card={id} color={me.color} state={progress.met?"met":"idle"}/><p className={progress.met?"font-bold text-emerald-300":"font-bold text-amber-200"}>{progress.met?"✓ Currently met":"In progress"} · {progress.points}/{progress.max} VP now</p>{progress.count!==undefined&&progress.tiers&&<p className="text-sm">Tiers: {progress.tiers.join(" / ")} VP. Current tier: {Math.min(progress.tiers.length,progress.count)}/{progress.tiers.length}.</p>}</section>;})}
      <section aria-label="Engineering market" className="space-y-3 rounded-xl border border-amber-300/50 p-3">
        <h2 className="rounded-lg bg-amber-200 p-2 font-bold text-slate-900">{game.phase==="ENGINEERING"&&game.engineeringStep==="CARD_DRAFT"?"Draft an Engineering goal":"Draw more on your turn · $3M"}</h2>
        <p className="text-sm">Choose a face-up goal or draw at random. {game.phase!=="ENGINEERING"&&"One extra Engineering goal per game, before hiring crews."}</p>
        {game.market.rows.engineering.map(id=>{const drafting=game.phase==="ENGINEERING"&&game.engineeringStep==="CARD_DRAFT";const blocker=drafting?(!myTurn?"Wait for your draft turn.":undefined):cardPurchaseBlocker(game,me.id,"engineering",id,view.drawPileCounts);return <div key={id}><EngineeringCardFace card={id} color={me.color}/><button className={`${button} mt-2 w-full`} disabled={controlsDisabled||!!blocker} title={blocker} onClick={()=>drafting?run("DRAFT_CARD",{deck:"engineering",cardId:id,expectedPick:game.market.picks}):run("BUY_ENGINEERING",{cardId:id,period:game.currentPeriod})}>{drafting?"Choose this goal":"Draw this goal · $3M"}</button>{blocker&&<p className="mt-1 text-xs">{blocker}</p>}</div>;})}
        {game.phase==="ENGINEERING"&&game.engineeringStep==="CARD_DRAFT"?<button className={`${button} w-full`} disabled={controlsDisabled||!myTurn||!view.engineeringRemaining} onClick={()=>run("DRAFT_CARD",{deck:"engineering",expectedPick:game.market.picks})}>Draw random Engineering goal</button>:<BuyCardButton game={game} playerId={me.id} busy={controlsDisabled} act={run} counts={view.drawPileCounts} deck="engineering"/>}
      </section>
    </>}
    {tab==="general"&&<>
      {header}{settings}{reports}
      <PhoneStatus game={game} playerId={me.id} details/>
      <p className="text-sm">Round {game.currentPeriod}/{SUBWAY_CONFIG.timelinePeriods}</p>
      <HowToPlay bendMode={game.bendMode} segmentLengthMode={game.segmentLengthMode}/>
      <BuyCardButton game={game} playerId={me.id} busy={controlsDisabled} act={run} counts={view.drawPileCounts}/>
      {game.playerOrder.map(id=>{const p=game.players[id];return <section key={id} className="space-y-2 rounded-xl border border-white/20 p-4"><strong>{p.name} · ${p.money}M {p.score!==undefined?`· ${p.score} VP`:""}</strong><p>{p.lines.filter(lineComplete).length}/3 lines complete</p>{p.lines.map(l=><p key={l.contractId}>{contractOf(l)?.name}: {segmentsBuilt(l)}/{contractOf(l)?.recipe.length} segments</p>)}{game.phase==="RESULTS"&&p.scoreBreakdown?.map((s,i)=><p key={i} className="text-sm">{s.label}: {s.points} VP</p>)}</section>;})}
      <p className="text-sm">Crews: $1M / $3M / $6M. Completing each line pays $3M. Final debt costs 2 VP per $1M. $4M earns 2 VP; $5M or more earns 3 VP.</p>
      <section className="space-y-3">{game.events.slice().reverse().map(e=><p key={e.seq} className="border-t border-white/10 pt-3 text-sm">{e.text}</p>)}</section>
    </>}
    <nav aria-label="Company pages" className="fixed inset-x-0 bottom-0 z-30 mx-auto grid max-w-lg grid-cols-4 gap-1 border-t border-white/20 bg-[#10252e] px-2 pt-2" style={{paddingBottom:"max(12px, env(safe-area-inset-bottom))"}}>
      {tabs.map(t=><button key={t.id} aria-current={tab===t.id?"page":undefined} className={`min-h-16 rounded-xl text-[11px] ${tab===t.id?"bg-teal-700 text-white":"text-slate-300"}`} onClick={()=>{setTab(t.id);window.scrollTo({top:0});}}><span aria-hidden className="block text-2xl">{t.icon}</span>{t.label}</button>)}
    </nav>
  </main>;
}

function TurnFlash({name,color,summary,onClose}:{name:string;color:string;summary:TurnSummary;onClose:()=>void}) {
  const cash=summary.cashDelta;
  return <div role="dialog" aria-label="Since your last turn" data-turn-flash className="fixed inset-0 z-40 flex items-start justify-center bg-stone-950/60 p-4 pt-[12vh]" onClick={onClose}>
    <style>{`@keyframes subway-flash{0%{transform:translateY(-12px);opacity:0}100%{transform:translateY(0);opacity:1}} .subway-flash{animation:subway-flash .35s ease-out both} @media(prefers-reduced-motion:reduce){.subway-flash{animation:none}}`}</style>
    <section className="subway-flash w-full max-w-md rounded-2xl border-t-8 bg-[#f6edda] p-5 text-stone-900 shadow-2xl" style={{borderColor:color}} onClick={e=>e.stopPropagation()}>
      <p className="text-xs font-bold uppercase tracking-[.3em] text-amber-800">While the iPad was away</p>
      <h2 className="mt-1 text-2xl font-black">{name}, since your last turn</h2>
      <p className={`mt-2 text-3xl font-black tabular-nums ${cash>0?"text-emerald-700":cash<0?"text-red-700":"text-stone-500"}`}>{cash>0?`+$${cash}M`:cash<0?`−$${-cash}M`:"$0M"} <span className="text-sm font-bold text-stone-600">net cash change</span></p>
      {summary.receipts.length>0&&<section className="mt-3 rounded-lg bg-emerald-100 p-3"><b>Payments received</b>{summary.receipts.map(p=><p key={p.playerId} className="flex justify-between"><span>{p.name}</span><strong>${p.amount}M</strong></p>)}<p className="mt-1 flex justify-between border-t border-emerald-300 pt-1 font-bold"><span>Total from players</span><span>${summary.opponentIncome}M</span></p></section>}
      {summary.bankIncome!==0&&<p className="mt-2 text-sm">Bank rewards: ${summary.bankIncome}M</p>}
      {summary.completions.length>0&&<p className="mt-2 text-sm font-bold text-purple-900">Opposition completed: {summary.completions.join(", ")}</p>}
      {summary.lines.length>0&&<ul className="mt-3 space-y-1 text-sm">{summary.lines.map((line,i)=><li key={i} className="border-t border-stone-300/60 pt-1">{line}</li>)}</ul>}
      <button className={`${button} mt-4 w-full`} onClick={onClose} autoFocus>Got it · start my turn</button>
    </section>
  </div>;
}

function GhostDiagram({nodes,color,built}:{nodes:RouteNode[];color:string;built:number}) {
  return <div className="mt-3"><p className="text-xs">Saved ghost · edit on the iPad</p><svg viewBox="-1 -1 28 10" role="img" aria-label="Your saved line plan" className="mt-2 w-full rounded-lg bg-stone-200 p-2">
    {nodes.slice(1).map((n,i)=><line key={`l${i}`} x1={nodes[i].x} y1={nodes[i].y} x2={n.x} y2={n.y} stroke={color} strokeWidth=".18" strokeDasharray={i+1>=built?".3 .2":undefined} opacity={i+1>=built?.5:1}/>)}
    {nodes.map((n,i)=><circle key={i} cx={n.x} cy={n.y} r=".22" fill={color} opacity={i>=built?.5:1}/>)}
  </svg></div>;
}
