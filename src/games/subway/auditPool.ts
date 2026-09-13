import type { AuditJobResult, AuditSettings, AuditTask } from './cardAudit';

type AuditWorker=Pick<Worker,'postMessage'|'terminate'|'onmessage'|'onerror'>;
export function auditConcurrency(cores:number|undefined):number {
  return cores!==undefined&&Number.isFinite(cores)&&cores>=3?2:1;
}

/** Bounded batches preserve the existing contiguous checkpoint cursor. Responses
 * may arrive in any order, but all commits occur in catalog order. */
export function startAuditPool(options:{
  settings:AuditSettings;tasks:AuditTask[];cursor:number;concurrency:number;
  createWorker:()=>AuditWorker;seenKeys:()=>string[];
  commit:(result:AuditJobResult,index:number)=>Promise<void>;
  finish:(status:'complete'|'stopped')=>void;error:(message:string)=>void;
}):{stop:()=>void;cancel:()=>void} {
  const workers:AuditWorker[]=[];
  let cancelled=false,stopping=false,cursor=options.cursor;
  const cancel=()=>{cancelled=true;workers.forEach(w=>w.terminate());};
  const fail=(e:unknown)=>{if(cancelled)return;cancel();options.error(e instanceof Error?e.message:String(e));};
  const finish=(status:'complete'|'stopped')=>{if(cancelled)return;cancel();options.finish(status);};
  const batch=()=>{
    if(cancelled)return;
    if(cursor===options.tasks.length){finish('complete');return;}
    if(stopping){finish('stopped');return;}
    const count=Math.min(workers.length,options.tasks.length-cursor),results=new Map<number,AuditJobResult>();
    for(let slot=0;slot<count;slot++) {
      const w=workers[slot],index=cursor+slot;
      w.onmessage=event=>{
        if(cancelled||results.has(index))return;
        const data=event.data as AuditJobResult&{fatal?:string};
        if(data.fatal){fail(new Error(data.fatal));return;}
        if(JSON.stringify(data.pair?.task)!==JSON.stringify(options.tasks[index])){fail(new Error('Audit worker returned the wrong trial.'));return;}
        results.set(index,data);
        if(results.size!==count)return;
        void (async()=>{
          for(let i=0;i<count;i++) {
            if(cancelled)return;
            await options.commit(results.get(cursor)!,cursor);
            if(cancelled)return;
            cursor++;
          }
          batch();
        })().catch(fail);
      };
      w.postMessage({settings:options.settings,task:options.tasks[index],seenKeys:options.seenKeys()});
    }
  };
  try {
    for(let i=0;i<Math.max(1,Math.min(2,options.concurrency));i++) {
      const w=options.createWorker();workers.push(w);
      w.onerror=e=>fail(new Error(e.message||'Audit worker failed'));
    }
    batch();
  }catch(e){fail(e);}
  return {stop:()=>{stopping=true;},cancel};
}
