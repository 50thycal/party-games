import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const {startAuditPool,auditConcurrency}=require(path.join(process.argv[2],'src/games/subway/auditPool.js'));
assert.equal(auditConcurrency(undefined),1);assert.equal(auditConcurrency(2),1);assert.equal(auditConcurrency(8),2);
const tasks=Array.from({length:5},(_,trial)=>({cardId:'north-south',count:2,trial}));
const flush=async()=>{for(let i=0;i<10;i++)await new Promise(setImmediate);};
function harness(overrides={}) {
  const workers=[],commits=[],finished=[],errors=[];
  const options={settings:{trials:1,seed:1},tasks,cursor:0,concurrency:2,
    createWorker:()=>{const w={sent:[],terminated:false,postMessage(v){this.sent.push(v);},terminate(){this.terminated=true;}};workers.push(w);return w;},
    seenKeys:()=>[],commit:async(r,i)=>{commits.push(i);},finish:s=>finished.push(s),error:e=>errors.push(e),...overrides};
  const control=startAuditPool(options);
  const reply=(slot)=>{const w=workers[slot];w.onmessage({data:{pair:{task:w.sent.at(-1).task},examples:[]}});};
  return {workers,commits,finished,errors,control,reply};
}
const h=harness();assert.equal(h.workers.length,2);
h.reply(1);await flush();assert.deepEqual(h.commits,[]);
h.control.stop();h.reply(0);await flush();assert.deepEqual(h.commits,[0,1]);
assert.deepEqual(h.finished,['stopped']);assert.ok(h.workers.every(w=>w.terminated));
const resumed=harness({cursor:2});assert.equal(resumed.workers[0].sent[0].task.trial,2);
resumed.reply(1);resumed.reply(0);await flush();assert.deepEqual(resumed.commits,[2,3]);
resumed.reply(0);await flush();assert.deepEqual(resumed.commits,[2,3,4]);assert.deepEqual(resumed.finished,['complete']);
const storage=harness({commit:async(_r,i)=>{if(i===1)throw Error('storage failed');}});
storage.reply(1);storage.reply(0);await flush();assert.deepEqual(storage.errors,['storage failed']);assert.ok(storage.workers.every(w=>w.terminated));
const failed=harness();failed.workers[1].onerror({message:'worker failed'});failed.reply(0);await flush();assert.deepEqual(failed.commits,[]);assert.deepEqual(failed.errors,['worker failed']);
let release;const pending=harness({commit:()=>new Promise(resolve=>{release=resolve;})});pending.reply(0);pending.reply(1);await flush();pending.control.cancel();release();await flush();assert.deepEqual(pending.finished,[]);assert.ok(pending.workers.every(w=>w.sent.length===1&&w.terminated));
const wrong=harness();wrong.workers[0].onmessage({data:{pair:{task:tasks[4]},examples:[]}});assert.equal(wrong.errors.length,1);
let creations=0;const ctor=harness({createWorker:()=>{if(++creations===2)throw Error('constructor failed');return {postMessage(){},terminate(){creations++;}};}});assert.deepEqual(ctor.errors,['constructor failed']);assert.equal(creations,3);
console.log('Audit pool: reversed completion, ordered commits, stop/drain, resume/tail, storage/worker/constructor errors and cancellation passed.');
