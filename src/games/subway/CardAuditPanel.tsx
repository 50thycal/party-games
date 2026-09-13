'use client';
import { useEffect, useRef, useState } from 'react';
import { AUDIT_CARDS, auditCell, auditMarkdown, auditTasks, newAudit, retainAuditExamples, type AuditSummary, type runAuditPair } from './cardAudit';
import { beginAudit, loadAudit, loadAuditExample, saveAuditPair } from './auditStorage';
import { RULES_FINGERPRINT, BUILD_ID, type GameRecord } from './recording';
import { BOT_VERSION } from './bots';
import { AUDIT_POLICY_VERSION } from './auditPolicy';
import { ReportSaveControls } from './ReportSaveControls';

const button='rounded-xl bg-teal-700 px-4 py-3 font-bold text-white disabled:opacity-50';
function download(name:string,value:unknown) {
  const url=URL.createObjectURL(new Blob([JSON.stringify(value)],{type:'application/json'})),a=document.createElement('a');
  a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
export function CardAuditPanel({onReplay}:{onReplay:(record:GameRecord)=>void}) {
  const [summary,setSummary]=useState<AuditSummary|null>(null),[running,setRunning]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [trials,setTrials]=useState(100),[seed,setSeed]=useState(1),[keys,setKeys]=useState<string[]>([]),[example,setExample]=useState(''),[copied,setCopied]=useState(false);
  const current=useRef<AuditSummary|null>(null),worker=useRef<Worker|null>(null),stop=useRef(false),seen=useRef(new Set<string>());
  useEffect(()=>{let active=true;loadAudit().then(saved=>{if(active){current.current=saved.summary;setSummary(saved.summary);setKeys(saved.keys);seen.current=new Set(saved.keys);}}).catch(e=>{if(active)setError(`Checkpoint storage unavailable: ${String(e)}`);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;worker.current?.terminate();worker.current=null;};},[]);
  const compatible=!!summary&&summary.rules===RULES_FINGERPRINT&&summary.build===BUILD_ID&&summary.botVersion===BOT_VERSION&&summary.policyVersion===AUDIT_POLICY_VERSION;
  function launch() {
    const s=current.current;if(!s)return;
    stop.current=false;setRunning(true);s.status='running';setSummary({...s});
    const tasks=auditTasks(s.settings),w=new Worker(new URL('./cardAudit.worker.ts',import.meta.url));worker.current=w;
    const finish=(status:'complete'|'stopped')=>{s.status=status;setSummary({...s});setRunning(false);w.terminate();worker.current=null;};
    const next=()=>w.postMessage({settings:s.settings,task:tasks[s.pairs.length]});
    w.onmessage=async(event:MessageEvent<ReturnType<typeof runAuditPair>&{fatal?:string}>)=>{
      try {
        if(event.data.fatal)throw new Error(event.data.fatal);
        const result=event.data,nextSeen=new Set(seen.current),examples=retainAuditExamples(result,nextSeen);
        await saveAuditPair(s.storageId,s.pairs.length,result.pair,examples);
        if(worker.current!==w)return;
        seen.current=nextSeen;s.pairs.push(result.pair);setSummary({...s});setKeys(Array.from(seen.current));
        if(s.pairs.length===tasks.length)finish('complete');else if(stop.current)finish('stopped');else next();
      }catch(e){setError(`Audit paused: ${String(e)}. Reload to recover the last saved checkpoint.`);finish('stopped');}
    };
    w.onerror=e=>{setError(e.message||'Audit worker failed');finish('stopped');};next();
  }
  async function start() {
    setError('');setLoading(true);setCopied(false);
    try {const s=newAudit({trials,seed});await beginAudit(s);current.current=s;seen.current=new Set();setKeys([]);setExample('');setSummary(s);launch();}
    catch(e){setError(String(e));}finally{setLoading(false);}
  }
  const report=summary&&!running?auditMarkdown(summary):'';
  return <section className="space-y-4 rounded-xl bg-slate-800 p-4">
    <h2 className="text-2xl font-bold">Full Card Audit</h2>
    <p>All {AUDIT_CARDS.length} cards · 2, 3 and 4 players · matched normal/targeted games. No card selection needed. Game rules and live bots stay unchanged.</p>
    <p className="text-sm text-slate-300">100 trials means {AUDIT_CARDS.length*3*100*2} games. Use 1 for a smoke check. Large audits can take a long time; keep this page open. Checkpoints save on this browser/device. Export before clearing browser data.</p>
    <div className="flex flex-wrap items-center gap-3"><label>Trials per card/count <input aria-label="Audit trials" className="w-24 rounded bg-slate-950 p-2" type="number" min={1} max={1000} value={trials} disabled={running||loading} onChange={e=>setTrials(+e.target.value)}/></label><label>Seed <input aria-label="Audit seed" className="w-28 rounded bg-slate-950 p-2" type="number" min={0} max={4294967295} value={seed} disabled={running||loading} onChange={e=>setSeed(+e.target.value)}/></label>
    <button className={button} disabled={running||loading} onClick={()=>{if(!summary||window.confirm('Replace the saved audit? Export it first to keep it.'))void start();}}>Run Full Card Audit</button>
    {compatible&&summary.status!=='complete'&&!running&&<button className={button} disabled={loading} onClick={launch}>Resume saved audit</button>}
    {running&&<button className={button} onClick={()=>{stop.current=true;}}>Stop after current pair</button>}</div>
    {error&&<p role="alert" className="text-rose-300">{error}</p>}
    {summary&&<><p role="status">{running?'Running':summary.status} · {summary.pairs.length}/{summary.total} pairs · {summary.checks.filter(c=>c.passed).length}/{summary.checks.length} scoring checks passed · {summary.pairs.filter(p=>p.error).length} failed pairs</p>
    {!compatible&&<p>This checkpoint uses a different build or policy. Export it as a reference; start a new audit for this build.</p>}
    <progress className="w-full" value={summary.pairs.length} max={summary.total}/>
    {!running&&<><p>Compact report: one row per card. Detailed exports contain economics, tier counts and confidence intervals, without bulky action logs.</p>
    <div className="flex flex-wrap gap-3"><button className={button} onClick={()=>{void navigator.clipboard.writeText(report).then(()=>setCopied(true)).catch(()=>setError('Copy unavailable. Select the report text below or save the MD file.'));}}>{copied?'Copied':'Copy compact report'}</button><ReportSaveControls report={report} roomCode="card-audit"/>
    <button className={button} onClick={()=>download('subway-card-audit-details.json',{...summary,statistics:AUDIT_CARDS.map(c=>({cardId:c.id,counts:[2,3,4].map(count=>({count,normal:auditCell(summary,c.id,count,'normal'),targeted:auditCell(summary,c.id,count,'targeted')}))}))})}>Download detailed results</button></div>
    <details><summary>Compact Markdown report ({report.length.toLocaleString()} characters)</summary><textarea aria-label="Compact audit report" readOnly value={report} className="mt-2 h-96 w-full rounded bg-slate-950 p-3 text-sm"/></details>
    <details><summary>Scoring fixture details (not legal-route proofs)</summary>{summary.checks.map(c=><p key={c.cardId}>{c.cardId}: {c.passed?'pass':c.errors.join('; ')} ({c.checks} cases)</p>)}</details>
    {keys.length>0&&<div className="flex flex-wrap gap-3"><select aria-label="Audit replay example" className="max-w-full rounded bg-slate-950 p-2" value={example} onChange={e=>setExample(e.target.value)}><option value="">Choose a replay example</option>{keys.map(k=><option key={k}>{k}</option>)}</select><button className={button} disabled={!example} onClick={()=>void loadAuditExample(example).then(onReplay).catch(e=>setError(String(e)))}>Replay example</button><button className={button} disabled={!example} onClick={()=>void loadAuditExample(example).then(r=>download(`subway-audit-${example}.json`,r)).catch(e=>setError(String(e)))}>Export replay JSON</button></div>}</>}
    </>}
  </section>;
}
