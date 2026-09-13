import type { AuditPair, AuditSummary } from './cardAudit';
import type { GameRecord } from './recording';

function open():Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const r=indexedDB.open('subway-card-audit-v1',1);
    r.onupgradeneeded=()=>{for(const name of ['meta','pairs','examples']) r.result.createObjectStore(name);};
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('Close other Lab tabs to access the audit checkpoint.'));
  });
}
async function write(fn:(t:IDBTransaction)=>void) {
  const db=await open();try {await new Promise<void>((resolve,reject)=>{const t=db.transaction(['meta','pairs','examples'],'readwrite');t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error??new Error('Audit save aborted'));fn(t);});} finally {db.close();}
}
export async function beginAudit(summary:AuditSummary,expectedId:string|null) {
  summary.storageId=crypto.randomUUID();
  await write(t=>{const r=t.objectStore('meta').get('run');r.onsuccess=()=>{
    if((r.result?.storageId??null)!==expectedId){t.abort();return;}
    for(const name of ['meta','pairs','examples']) t.objectStore(name).clear();t.objectStore('meta').put({...summary,pairs:[],saved:0},'run');
  };});
}
export async function saveAuditPair(storageId:string|undefined,index:number,pair:AuditPair,examples:{key:string;record:GameRecord}[]) {
  await write(t=>{const r=t.objectStore('meta').get('run');r.onsuccess=()=>{
    if(!storageId||r.result?.storageId!==storageId||r.result.saved!==index){t.abort();return;}
    t.objectStore('pairs').put(pair,index);for(const e of examples)t.objectStore('examples').put(e.record,e.key);
    t.objectStore('meta').put({...r.result,saved:index+1},'run');
  };});
}
export async function loadAudit():Promise<{summary:AuditSummary|null;keys:string[]}> {
  const db=await open();try {return await new Promise((resolve,reject)=>{
    const t=db.transaction(['meta','pairs','examples'],'readonly'),meta=t.objectStore('meta').get('run'),pairs=t.objectStore('pairs').getAll(),keys=t.objectStore('examples').getAllKeys();
    t.oncomplete=()=>resolve({summary:meta.result?{...meta.result,pairs:pairs.result,status:pairs.result.length===meta.result.total?'complete':'stopped'}:null,keys:keys.result.map(String)});t.onerror=()=>reject(t.error);
  });}finally{db.close();}
}
export async function loadAuditExample(key:string,expectedId:string|undefined):Promise<GameRecord> {
  const db=await open();try{return await new Promise((resolve,reject)=>{
    const t=db.transaction(['meta','examples'],'readonly'),meta=t.objectStore('meta').get('run'),r=t.objectStore('examples').get(key);
    t.oncomplete=()=>{
      if(!expectedId||meta.result?.storageId!==expectedId)reject(new Error('Another tab replaced this audit. Reload before opening examples.'));
      else if(!r.result)reject(new Error('Example not found'));else resolve(r.result);
    };t.onerror=()=>reject(t.error);
  });}finally{db.close();}
}
