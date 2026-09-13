import { runAuditJob, type AuditSettings, type AuditTask } from './cardAudit';
const worker=globalThis as unknown as {onmessage:(event:MessageEvent)=>void;postMessage:(value:unknown)=>void};
worker.onmessage=(event:MessageEvent<{settings:AuditSettings;task:AuditTask;seenKeys:string[]}>)=>{
  try {worker.postMessage(runAuditJob(event.data.settings,event.data.task,event.data.seenKeys));}
  catch(e) {worker.postMessage({fatal:e instanceof Error?e.message:String(e)});}
};
