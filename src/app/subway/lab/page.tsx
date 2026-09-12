'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { DEFAULT_BOT, type BotSettings } from '@/games/subway/bots';
import { BotPicker } from '@/games/subway/LabControls';
import type { LabSeat } from '@/games/subway/lab';
import { parseRecord, replayRecord, recordMetrics, recordIdentity, RULES_FINGERPRINT, type GameRecord } from '@/games/subway/recording';
import { SUBWAY_STATE_VERSION, type SubwayState } from '@/games/subway/config';
import { SubwayGameView } from '@/games/subway/GameView';
const button='rounded-xl bg-teal-700 px-4 py-3 font-bold text-white disabled:opacity-50';
const field='rounded-lg bg-slate-900 p-3 text-white';
function download(name:string,value:unknown) {const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
type Imported={record:GameRecord;verified:boolean;cohort:'calibration'|'holdout'};
export default function PlaytestLab() {
  const [mode,setMode]=useState<'room'|'simulation'|'records'>('room');
  const [count,setCount]=useState(2),[seed,setSeed]=useState(1),[games,setGames]=useState(10);
  const [seats,setSeats]=useState<Omit<LabSeat,'id'>[]>(Array.from({length:4},(_,i)=>({name:`Company ${i+1}`,control:i===0?'human':'bot',bot:{...DEFAULT_BOT}})));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(0);
  const [records,setRecords]=useState<GameRecord[]>([]),[imports,setImports]=useState<Imported[]>([]),[failures,setFailures]=useState<string[]>([]);
  const [selected,setSelected]=useState<GameRecord|null>(null),[replay,setReplay]=useState<SubwayState|null>(null),[at,setAt]=useState(0),[verifiedAt,setVerifiedAt]=useState<number|null>(null),[replaySeat,setReplaySeat]=useState('');
  const worker=useRef<Worker|null>(null);
  useEffect(()=>()=>worker.current?.terminate(),[]);
  function changeSeat(i:number,patch:Partial<Omit<LabSeat,'id'>>) {setSeats(old=>old.map((s,j)=>j===i?{...s,...patch}:s));}
  async function createRoom() {
    setBusy(true);setError('');
    try {
      const response=await fetch('/api/subway-companion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operation:'create',lab:true,seats:seats.slice(0,count),seed})});
      const json=await response.json();if(!json.ok) throw new Error(json.message);
      localStorage.setItem('subway-companion-device-v1',JSON.stringify({roomCode:json.data.view.room.roomCode,token:json.data.token,controllerKey:json.data.controllerKey}));
      window.location.assign('/subway/multiplayer');
    } catch(e) {setError(e instanceof Error?e.message:'Could not create test room.');setBusy(false);}
  }
  function simulate() {
    if(!Number.isInteger(games)||games<1||games>100||!Number.isInteger(seed)) {setError('Choose an integer seed and 1–100 games.');return;}
    setRecords([]);setFailures([]);setProgress(0);setBusy(true);setError('');
    const w=new Worker(new URL('../../../games/subway/lab.worker.ts',import.meta.url));worker.current=w;
    w.onmessage=(event:MessageEvent<{record?:GameRecord;error?:string;index?:number;done?:boolean}>)=>{
      const data=event.data;
      if(data.record) setRecords(old=>[...old,data.record!]);
      if(data.error) setFailures(old=>[...old,`Seed ${seed+(data.index??0)}: ${data.error}`]);
      if(data.index!==undefined) setProgress(data.index+1);
      if(data.done) {setBusy(false);w.terminate();worker.current=null;}
    };
    w.onerror=e=>{setError(e.message||'Simulation worker failed.');setBusy(false);w.terminate();worker.current=null;};
    w.postMessage({count,seed,games,profiles:seats.slice(0,count).map(s=>s.bot)});
  }
  async function importFiles(files:FileList|null) {
    if(!files) return;
    setError('');
    for(const file of Array.from(files)) try {
      const record=parseRecord(await file.text());
      let verified=false;
      if(record.rules===RULES_FINGERPRINT&&record.stateVersion===SUBWAY_STATE_VERSION) {replayRecord(record);verified=true;}
      setImports(old=>{const found=old.find(i=>recordIdentity(i.record)===recordIdentity(record));return found?old.map(i=>i===found&&record.actions.length>i.record.actions.length?{...i,record,verified}:i):[...old,{record,verified,cohort:'calibration'}];});
    } catch(e) {setError(`${file.name}: ${e instanceof Error?e.message:String(e)}`);}
  }
  function openRecord(record:GameRecord) {
    if(busy) return;
    setMode('records');
    setSelected(record);setAt(record.actions.length);setReplaySeat(record.room.players[0].id);setReplay(null);setVerifiedAt(null);setError('');
    try {setReplay(replayRecord(record));setVerifiedAt(record.actions.length);} catch(e) {setError(e instanceof Error?e.message:String(e));}
  }
  const comparable=imports.filter(i=>i.verified&&i.record.stateVersion===SUBWAY_STATE_VERSION&&i.record.rules===RULES_FINGERPRINT&&i.record.room.players.length===count&&i.record.source==='human'&&i.record.final?.phase==='RESULTS');
  const cohorts=[{name:'Simulation',items:records.filter(r=>r.room.players.length===count&&r.rules===RULES_FINGERPRINT)},...(['calibration','holdout'] as const).map(c=>({name:`Human ${c}`,items:comparable.filter(i=>i.cohort===c).map(i=>i.record)}))];
  return <main className="mx-auto min-h-dvh max-w-5xl space-y-5 p-4 text-white">
    <nav className="flex flex-wrap gap-4"><Link href="/subway/multiplayer">← Table & phones</Link><Link href="/subway">Quick tabletop</Link><Link href="/test/subway">Scene inspector</Link></nav>
    <header><h1 className="text-3xl font-black">Subway Playtest Lab</h1><p className="mt-2 text-slate-300">Rules v{SUBWAY_STATE_VERSION} · human games, bot opponents and repeatable experiments.</p></header>
    <div className="flex flex-wrap gap-2">{(['room','simulation','records'] as const).map(m=><button disabled={busy} className={`${button} ${mode===m?'ring-2 ring-amber-400':''}`} key={m} onClick={()=>setMode(m)}>{m==='room'?'iPad playtest':m==='simulation'?'Simulate games':'Review exports'}</button>)}</div>
    {error&&<p role="alert" className="rounded bg-rose-950 p-3">{error}</p>}
    {mode!=='records'&&<><div className="flex flex-wrap gap-4"><label>Companies<select aria-label="Companies" disabled={busy} className={`${field} ml-2`} value={count} onChange={e=>setCount(+e.target.value)}>{[2,3,4].map(n=><option key={n}>{n}</option>)}</select></label><label>{mode==='room'?'Bot decision seed':'Seed'}<input aria-label="Seed" disabled={busy} className={`${field} ml-2 w-28`} type="number" value={seed} onChange={e=>setSeed(+e.target.value)}/></label></div>
    {mode==='room'&&<p>Open this setup on your iPad. Build on the iPad; use one testing phone to switch your companies, or invite friends on their phones.</p>}
    <div className="grid gap-3 sm:grid-cols-2">{seats.slice(0,count).map((seat,i)=><section className="space-y-3 rounded-xl bg-slate-800 p-4" key={i}><label>Company {i+1}<input aria-label={`Company ${i+1} name`} disabled={busy} className={`${field} mt-1 w-full`} maxLength={40} value={seat.name} onChange={e=>changeSeat(i,{name:e.target.value})}/></label>{mode==='room'&&<label className="block">Controlled by<select disabled={busy} aria-label={`Company ${i+1} control`} className={`${field} ml-2`} value={seat.control} onChange={e=>changeSeat(i,{control:e.target.value as LabSeat['control']})}><option value="human">Me</option><option value="bot">Bot</option><option value="remote">Friend’s phone</option></select></label>}{(mode==='simulation'||seat.control==='bot')&&<BotPicker value={seat.bot} disabled={busy} onChange={(bot:BotSettings)=>changeSeat(i,{bot})}/>}</section>)}</div></>}
    {mode==='room'&&<><button className={button} disabled={busy} onClick={()=>void createRoom()}>{busy?'Creating…':'Create iPad test room'}</button><p className="text-sm text-slate-300">Test rooms save automatically. Reopen Table & phones to resume with your device key.</p></>}
    {mode==='simulation'&&<><div className="flex flex-wrap items-center gap-3"><label>Games<input aria-label="Games" disabled={busy} className={`${field} ml-2 w-24`} type="number" min={1} max={100} value={games} onChange={e=>setGames(+e.target.value)}/></label><button className={button} disabled={busy} onClick={simulate}>Run batch</button>{busy&&<button className={button} onClick={()=>{worker.current?.terminate();worker.current=null;setBusy(false);}}>Stop after completed results</button>}<span role="status">{progress}/{games} processed · {records.length} completed · {failures.length} failed</span></div><p>Personalities are initial heuristics, not yet calibrated to your friends. Import human games to compare behavior. Save exports before leaving this page.</p>{failures.map((f,i)=><p className="text-rose-300" key={i}>{f}</p>)}
    <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr>{['Population','Games','Mean VP','Cash','Lines complete','Goal VP','Destination VP','Skips'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{cohorts.map(c=>{const rows=c.items.flatMap(recordMetrics);const mean=(key:keyof typeof rows[number])=>rows.length?(rows.reduce((n,r)=>n+r[key],0)/rows.length).toFixed(1):'—';return <tr className="border-t border-slate-600" key={c.name}><td className="p-2">{c.name}</td><td>{c.items.length}</td><td>{mean('score')}</td><td>{mean('cash')}</td><td>{mean('complete')}</td><td>{mean('engineeringVp')}</td><td>{mean('destinationVp')}</td><td>{mean('skips')}</td></tr>;})}</tbody></table></div><p className="text-sm">Matching rules and {count} players only. Human cohorts exclude mixed/bot games. Means are descriptive; small samples do not establish balance.</p>
    {records.length>0&&<button className={button} onClick={()=>download('subway-batch-summary.json',{rules:RULES_FINGERPRINT,profiles:records[0]?.profiles,games:records.map(r=>({seed:r.seed,metrics:recordMetrics(r)})),failures})}>Download batch summary</button>}
    {records.map((r,i)=><div className="flex flex-wrap items-center gap-3 rounded bg-slate-800 p-3" key={i}><span>Seed {r.seed} · {r.actions.length} actions</span><button disabled={busy} className={button} onClick={()=>openRecord(r)}>Replay</button><button className={button} onClick={()=>download(`subway-simulation-${r.seed}.json`,r)}>Export game</button></div>)}</>}
    {(mode==='records'||mode==='simulation')&&<section className="space-y-3 rounded-xl bg-slate-800 p-4"><label>Import digital playtests<input aria-label="Import digital playtests" className="mt-2 block w-full" type="file" accept=".json" multiple onChange={e=>void importFiles(e.target.files)}/></label><p className="text-sm">Share the original exports in your development session to archive them in the repository. Importing here only opens them in this browser session.</p>{imports.map((item,i)=><div className="flex flex-wrap gap-3" key={i}><span>{item.record.room.roomCode} · {item.record.source} · v{item.record.stateVersion} · {item.verified?'Replay verified':'Different rules; reference only'}</span><select className={field} aria-label={`Cohort ${i+1}`} value={item.cohort} onChange={e=>setImports(old=>old.map((v,j)=>j===i?{...v,cohort:e.target.value as Imported['cohort']}:v))}><option value="calibration">Calibration</option><option value="holdout">Holdout validation</option></select><button disabled={busy} className={button} onClick={()=>openRecord(item.record)}>Verify & replay</button></div>)}</section>}
    {mode==='records'&&selected&&<section className="space-y-3"><details className="rounded bg-slate-800 p-3"><summary>Original actions and notes</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-sm">{JSON.stringify({actions:selected.actions,notes:selected.notes,controls:selected.controls,diagnostics:selected.diagnostics},null,2)}</pre></details><p>Record: {selected.source} · {selected.actions.length} actions · {selected.build}</p><label>Replay through action<input aria-label="Replay action" className="mx-2 w-24 rounded bg-slate-800 p-2" type="number" min={0} max={selected.actions.length} value={at} onChange={e=>setAt(Math.max(0,Math.min(selected.actions.length,+e.target.value)))}/></label><button className={button} onClick={()=>{setReplay(null);setVerifiedAt(null);try{setReplay(replayRecord(selected,at));setVerifiedAt(at);setError('');}catch(e){setError(String(e));}}}>Go to moment</button><select aria-label="Replay company" className={field} value={replaySeat} onChange={e=>setReplaySeat(e.target.value)}>{selected.room.players.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>{replay&&<><p className="text-emerald-300">Verified through action {verifiedAt}. Replay is read-only.</p><SubwayGameView room={selected.room} state={replay} playerId={replaySeat} isHost={false} dispatchAction={()=>{throw new Error('This is a read-only replay.');}}/></>}</section>}
  </main>;
}
