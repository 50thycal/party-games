import { DESTINATION_CARDS, ENGINEERING_CARDS, SUBWAY_STATE_VERSION, nextCompanyId, objectiveProgress, subwayGame, type SubwayAction, type SubwayState } from './config';
import { BOT_VERSION, DEFAULT_BOT, PERSONALITIES, chooseBotAction, type BotSettings } from './bots';
import { AUDIT_POLICY_VERSION } from './auditPolicy';
import { BUILD_ID, RULES_FINGERPRINT, fingerprint, newRecord, recordedReducer, recordMetrics, replayRecord, type GameRecord } from './recording';
import { seededRandom, testRoom } from './playtest';
import { objectiveExplanation } from './objectiveGuidance';
import { checkAuditCards, type CardCheck } from './cardAuditChecks';

export const AUDIT_CARDS=[...ENGINEERING_CARDS.map(c=>({...c,family:'Engineering'})),...DESTINATION_CARDS.map(c=>({...c,family:'Destination'}))];
export type AuditSettings={trials:number;seed:number};
export type AuditTask={cardId:string;count:number;trial:number};
export type AuditOutcome={met:boolean;points:number;score:number;cash:number;debt:number;complete:number;crews:number;tolls:number;reason:string};
export type AuditPair={task:AuditTask;seed?:number;seat:number;attempts:number;prefix?:string;profiles?:BotSettings[];normal?:AuditOutcome;targeted?:AuditOutcome;error?:string;unavailable?:boolean};
export type AuditSummary={schema:1;storageId?:string;rules:string;stateVersion:number;build:string;botVersion:string;policyVersion:string;settings:AuditSettings;checks:CardCheck[];pairs:AuditPair[];total:number;status:'running'|'stopped'|'complete'};
export function auditTasks(settings:AuditSettings):AuditTask[] {
  if(!Number.isSafeInteger(settings.seed)||settings.seed<0||settings.seed>0xffffffff||!Number.isInteger(settings.trials)||settings.trials<1||settings.trials>1000) throw new Error('Use 1–1000 trials and a seed from 0 to 4294967295.');
  // Round-robin coverage: stop early and every card still gets a fair turn.
  return Array.from({length:settings.trials},(_,trial)=>AUDIT_CARDS.flatMap(c=>[2,3,4].map(count=>({cardId:c.id,count,trial})))).flat();
}
export function newAudit(settings:AuditSettings):AuditSummary {
  return {schema:1,rules:RULES_FINGERPRINT,stateVersion:SUBWAY_STATE_VERSION,build:BUILD_ID,botVersion:BOT_VERSION,policyVersion:AUDIT_POLICY_VERSION,settings,checks:checkAuditCards(),pairs:[],total:auditTasks(settings).length,status:'running'};
}
const held=(s:SubwayState,id:string,card:string)=>s.players[id].engineeringHand.includes(card)||s.players[id].destinationHand.includes(card);
const seedFor=(value:unknown)=>parseInt(fingerprint(value),16)>>>0;

/** Rejection-sampled legal acquisition prefix, shared by both arms. No deck/state injection.
 * Estimates are CONDITIONAL on acquiring this card, not natural draw/draft probabilities.
 * Destination focus begins after START_GAME; Engineering focus begins after its draft.
 */
export function runAuditPair(settings:AuditSettings,task:AuditTask):{pair:AuditPair;records:GameRecord[]} {
  const card=AUDIT_CARDS.find(c=>c.id===task.cardId);if(!card) throw new Error('Unknown audit card');
  const seat=task.trial%task.count,id=`seat-${seat+1}`;
  const profiles:BotSettings[]=Array.from({length:task.count},(_,i)=>i===seat?{...DEFAULT_BOT}:{personality:PERSONALITIES[(task.trial+i)%PERSONALITIES.length],skill:'experienced'});
  const pair:AuditPair={task,seat:seat+1,attempts:0,profiles};
  try {
    for(let attempt=0;attempt<128;attempt++) {
      pair.attempts++;
      const seed=seedFor([settings.seed,task.cardId,task.count,task.trial,attempt]);
      const room=testRoom(task.count);room.mode='simulation';
      let s=subwayGame.initialState(room.players);
      const prefix=newRecord(room,s,'simulation');prefix.seed=seed;prefix.botVersion=BOT_VERSION;prefix.profiles=profiles;
      const random=seededRandom(seed);
      const step=(a:SubwayAction)=>{const next=recordedReducer(s,a,{room,playerId:a.playerId,random,now:()=>prefix.actions.length+1},prefix,'bot');if(next===s) throw new Error(`Rejected acquisition action ${a.type}`);s=next;};
      step({type:'START_GAME',playerId:room.hostId});
      if(card.family==='Destination'&&!held(s,id,card.id)) continue;
      if(card.family==='Engineering') {
        // Only public opening offers; never inspect the hidden deck to steer a bot.
        if(!s.market.rows.engineering.includes(card.id)) continue;
        while(!held(s,id,card.id)&&prefix.actions.length<40) {
          if(s.phase!=='PROCUREMENT'&&!(s.phase==='ENGINEERING'&&s.engineeringStep==='CARD_DRAFT')) break;
          const actor=nextCompanyId(s)!;
          const a=actor===id&&s.phase==='ENGINEERING'&&s.market.rows.engineering.includes(card.id)?{type:'DRAFT_CARD' as const,playerId:id,payload:{deck:'engineering' as const,cardId:card.id,expectedPick:s.market.picks}}:chooseBotAction(s,seededRandom(seedFor([seed,actor,prefix.actions.length])),profiles[room.players.findIndex(p=>p.id===actor)]);
          if(!a) break;step(a);
        }
        if(!held(s,id,card.id)) continue;
      }
      pair.seed=seed;pair.prefix=fingerprint(prefix.actions);
      const records:GameRecord[]=[];
      for(const arm of ['normal','targeted'] as const) {
        const record=structuredClone(prefix);let state=structuredClone(s);
        const rng=seededRandom(seed);for(let i=0;i<prefix.actions.reduce((n,e)=>n+e.random.length,0);i++) rng();
        record.notes.push({at:0,actionIndex:prefix.actions.length,text:`Card Audit ${AUDIT_POLICY_VERSION}: ${arm}; ${card.id}; focal ${id}; conditional acquisition, not human calibration.`});
        const turns:Record<string,number>={};
        while(state.phase!=='RESULTS'&&record.actions.length<500) {
          const actor=nextCompanyId(state)!;turns[actor]=(turns[actor]??0)+1;
          const a=chooseBotAction(state,seededRandom(seedFor([seed,actor,turns[actor]])),profiles[room.players.findIndex(p=>p.id===actor)]??DEFAULT_BOT,arm==='targeted'&&actor===id?card.id:undefined);
          if(!a) throw new Error(`${arm}: no action in ${state.phase}`);
          if(a.type==='ADVANCE_SCORING') a.playerId=room.hostId;
          const next=recordedReducer(state,a,{room,playerId:a.playerId,random:rng,now:()=>record.actions.length+1},record,'bot');
          if(next===state) throw new Error(`${arm}: rejected ${a.type}`);state=next;
        }
        if(state.phase!=='RESULTS') throw new Error(`${arm}: action limit`);
        record.final=state;
        const p=state.players[id],progress=objectiveProgress(card.id,p,Object.values(state.players).filter(p=>p.id!==id),state);
        const metrics=recordMetrics(record)[seat];
        pair[arm]={met:progress.met,points:progress.points,score:p.score??0,cash:p.money,debt:Math.max(0,-p.money),complete:metrics.complete,crews:metrics.crews,tolls:metrics.tolls,reason:objectiveExplanation(card.id,state,p)};
        records.push(record);
      }
      return {pair,records};
    }
    pair.unavailable=true;return {pair,records:[]};
  } catch(e) {pair.error=e instanceof Error?e.message:String(e);return {pair,records:[]};}
}

export function interval(success:number,n:number):[number,number] {
  if(!n) return [0,1];const z=1.96,p=success/n,d=1+z*z/n,c=(p+z*z/(2*n))/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [Math.max(0,c-h),Math.min(1,c+h)];
}
export function auditCell(summary:AuditSummary,cardId:string,count:number,arm:'normal'|'targeted') {
  const pairs=summary.pairs.filter(p=>p.task.cardId===cardId&&p.task.count===count);
  // Matched-pair denominator only: never silently count a worker failure as a miss.
  const outcomes=pairs.filter(p=>!p.error&&!p.unavailable&&p.normal&&p.targeted).map(p=>p[arm]!);
  const success=outcomes.filter(o=>o.met).length,n=outcomes.length;
  const mean=(k:'points'|'score'|'cash'|'debt'|'complete'|'crews'|'tolls')=>n?outcomes.reduce((s,o)=>s+o[k],0)/n:null;
  return {n,success,interval:interval(success,n),tiers:Object.fromEntries(Array.from(new Set(outcomes.map(o=>o.points))).sort((a,b)=>a-b).map(v=>[v,outcomes.filter(o=>o.points===v).length])),mean:Object.fromEntries((['points','score','cash','debt','complete','crews','tolls'] as const).map(k=>[k,mean(k)])),errors:pairs.filter(p=>p.error).length,unavailable:pairs.filter(p=>p.unavailable).length};
}
export function auditMarkdown(s:AuditSummary):string {
  const valid=s.pairs.filter(p=>!p.error&&!p.unavailable&&p.normal&&p.targeted);
  const fmt=(card:string,count:number)=>{
    const n=auditCell(s,card,count,'normal'),t=auditCell(s,card,count,'targeted');
    return n.n?`${Math.round(n.success/n.n*100)}→${Math.round(t.success/t.n*100)}% (${n.n})`:'— (0)';
  };
  const rows=AUDIT_CARDS.map(c=>{
    const samples=valid.filter(p=>p.task.cardId===c.id),n=samples.length;
    const vp=n?(samples.reduce((v,p)=>v+p.targeted!.points,0)/n).toFixed(1):'—';
    const check=s.checks.find(k=>k.cardId===c.id);
    return `| ${c.family==='Engineering'?'E':'D'} · ${c.name} | ${[2,3,4].map(count=>fmt(c.id,count)).join(' | ')} | ${vp}/${c.vp} | ${!check?.passed?'CHECK FAILED':!n?'No sample':samples.some(p=>p.targeted!.met)?'Demonstrated':'Not demonstrated'} |`;
  });
  const widest=Math.max(0,...AUDIT_CARDS.flatMap(c=>[2,3,4].map(count=>{const t=auditCell(s,c.id,count,'targeted');return t.n?(t.interval[1]-t.interval[0])*50:0;})));
  return ['# Subway Card Audit',`Status: ${s.status}; ${s.pairs.length}/${s.total} pairs processed; ${valid.length*2} matched completed games.`,
    `Rules v${s.stateVersion} · ${s.rules} · build ${s.build} · bot ${s.botVersion}/audit ${s.policyVersion} · seed ${s.settings.seed}.`,
    `Scoring fixtures: ${s.checks.filter(c=>c.passed).length}/${s.checks.length} passed. Failed pairs: ${s.pairs.filter(p=>p.error).length}; acquisition exhausted: ${s.pairs.filter(p=>p.unavailable).length}.`,
    'Cells: normal→targeted full-completion % (matched n). VP is targeted mean across sampled player counts. Synthetic scoring fixtures do not prove legal reachability.',
    'Conditional on acquiring the card through a legal opening deal/draft; NOT natural acquisition rates or human probabilities. Baseline shares the same acquisition prefix. Opponents rotate personalities; focal bot is experienced/balanced.',
    `95% Wilson intervals are in detailed JSON (widest sampled half-width ≈${widest.toFixed(0)} percentage points). Small/zero samples are inconclusive; zero successes is not proof of impossibility.`,
    '', '| Card | 2 players | 3 players | 4 players | Mean VP | Finding |','|---|---|---|---|---|---|',...rows,
    '', 'No balance changes made. Inspect low-rate cards and their replay examples before changing rules. Full per-pair economics, tier counts, failures and confidence intervals are in the detailed export.'].join('\n');
}

/** Bounded witness retention: at most one verified success and miss per card/arm. */
export function retainAuditExamples(result:ReturnType<typeof runAuditPair>,seen:Set<string>):{key:string;record:GameRecord}[] {
  if(result.pair.error||result.pair.unavailable) return [];
  return result.records.flatMap((record,i)=>{
    const arm=i===0?'normal':'targeted',o=result.pair[arm]!;
    const key=`${result.pair.task.cardId}-${arm}-${o.met?'success':'miss'}`;
    if(seen.has(key)) return [];
    replayRecord(record);seen.add(key);return [{key,record}];
  });
}
