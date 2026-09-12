import type { GameContext, Room } from '../../engine/types';
import { subwayGame, SUBWAY_STATE_VERSION, SUBWAY_CONFIG, ENGINEERING_CARDS, DESTINATION_CARDS, LINE_CONTRACTS, lineComplete, objectiveProgress, type SubwayState, type SubwayAction } from './config';

export function fingerprint(value:unknown):string {
  const canonical=(v:unknown):string=>Array.isArray(v)?`[${v.map(canonical).join(',')}]`:v&&typeof v==='object'?`{${Object.keys(v).sort().filter(k=>(v as Record<string,unknown>)[k]!==undefined).map(k=>JSON.stringify(k)+':'+canonical((v as Record<string,unknown>)[k])).join(',')}}`:JSON.stringify(v)??'null';
  let hash=2166136261; const text=canonical(value);
  for(let i=0;i<text.length;i++) hash=Math.imul(hash^text.charCodeAt(i),16777619);
  return (hash>>>0).toString(16).padStart(8,'0');
}
export const RULES_FINGERPRINT=process.env.NEXT_PUBLIC_SUBWAY_RULES_HASH||fingerprint({version:SUBWAY_STATE_VERSION,config:SUBWAY_CONFIG,engineering:ENGINEERING_CARDS,destinations:DESTINATION_CARDS,lines:LINE_CONTRACTS});
export const BUILD_ID=process.env.NEXT_PUBLIC_SUBWAY_BUILD_ID||'unrecorded-local-build';
export type RecordedAction={action:SubwayAction;times:number[];random:number[];after:string;controller:'human'|'bot'};
export type GameRecord={schema:1;rules:string;stateVersion:number;build:string;room:Room;initial:SubwayState;actions:RecordedAction[];notes:{at:number;actionIndex:number;text:string}[];controls:{at:number;playerId:string;value:unknown}[];diagnostics?:{at:number;actor:string;action:string;reason:string}[];source:'human'|'mixed'|'bots'|'simulation';seed?:number;botVersion?:string;profiles?:unknown;final?:SubwayState};
export function newRecord(room:Room,initial:SubwayState,source:GameRecord['source']='human'):GameRecord {
  return {schema:1,rules:RULES_FINGERPRINT,stateVersion:SUBWAY_STATE_VERSION,build:BUILD_ID,room:structuredClone(room),initial:structuredClone(initial),actions:[],notes:[],controls:[],diagnostics:[],source};
}
export function recordedReducer(state:SubwayState,action:SubwayAction,ctx:GameContext,record:GameRecord,controller:'human'|'bot'='human'):SubwayState {
  if(record.actions.length>=2000) throw new Error('Recording action limit reached; export this test before continuing.');
  const times:number[]=[],random:number[]=[];
  const result=subwayGame.reducer(state,action,{...ctx,now:()=>{const v=ctx.now();times.push(v);return v;},random:()=>{const v=ctx.random();random.push(v);return v;}});
  if(result!==state) record.actions.push({action:structuredClone(action),times,random,after:fingerprint(result),controller});
  return result;
}
export function parseRecord(text:string):GameRecord {
  if(text.length>20_000_000) throw new Error('Export is too large (20 MB limit).');
  const r=JSON.parse(text) as GameRecord;
  if(r?.schema!==1||!r.room||!r.initial||!Array.isArray(r.actions)||r.actions.length<1||r.actions[0]?.action?.type!=='START_GAME'||r.actions.length>2000||!['human','mixed','bots','simulation'].includes(r.source)||typeof r.rules!=='string') throw new Error('This is not a replayable Subway JSON export. Keep older reports in the archive as legacy records.');
  if(!Number.isInteger(r.stateVersion)||typeof r.build!=='string'||typeof r.room.roomCode!=='string'||typeof r.room.hostId!=='string'||!Array.isArray(r.room.players)||!r.room.players.every(p=>p&&typeof p.id==='string'&&typeof p.name==='string')||new Set(r.room.players.map(p=>p.id)).size!==r.room.players.length||r.room.players.length<2||r.room.players.length>4||!r.actions.every(e=>e?.action&&Array.isArray(e.times)&&Array.isArray(e.random)&&e.times.every(Number.isFinite)&&e.random.every(n=>Number.isFinite(n)&&n>=0&&n<1)&&typeof e.after==='string')) throw new Error('Malformed replay actions or roster.');
  return r;
}
export function replayRecord(record:GameRecord,limit=record.actions.length):SubwayState {
  if(!Number.isInteger(limit)||limit<0||limit>record.actions.length) throw new Error('Invalid replay action index.');
  if(record.rules!==RULES_FINGERPRINT||record.stateVersion!==SUBWAY_STATE_VERSION) throw new Error('Rules differ from this build. Archive and inspect this record using its original version.');
  if(fingerprint(record.initial)!==fingerprint(subwayGame.initialState(record.room.players))) throw new Error('Initial state is not the canonical setup for these rules.');
  let state=structuredClone(record.initial);
  for(const [i,e] of Array.from(record.actions.slice(0,limit).entries())) {
    let t=0,r=0;
    const next=subwayGame.reducer(state,e.action,{room:record.room,playerId:e.action.playerId,now:()=>{if(t>=e.times.length) throw new Error(`Clock tape exhausted at action ${i+1}`);return e.times[t++];},random:()=>{if(r>=e.random.length) throw new Error(`Random tape exhausted at action ${i+1}`);return e.random[r++];}});
    if(next===state||t!==e.times.length||r!==e.random.length||fingerprint(next)!==e.after) throw new Error(`Replay diverged at action ${i+1} (${e.action.type}).`);
    state=next;
  }
  if(limit===record.actions.length&&record.final&&fingerprint(state)!==fingerprint(record.final)) throw new Error('Final state differs from recorded actions.');
  return state;
}
export const recordIdentity=(record:GameRecord):string=>fingerprint({room:record.room,setup:record.actions[0]});
export function recordMetrics(record:GameRecord) {
  const s=record.final;
  if(!s||s.phase!=='RESULTS') throw new Error('Only completed games can enter a balance comparison.');
  return s.playerOrder.map(id=>{
    const p=s.players[id], others=Object.values(s.players).filter(p=>p.id!==id);
    return {seat:s.playerOrder.indexOf(id)+1,score:p.score??0,cash:p.money,complete:p.lines.filter(lineComplete).length,neighborhoods:new Set(p.lines.flatMap(l=>l.route).map(n=>n.stationId).filter(Boolean)).size,engineeringVp:p.engineeringHand.reduce((n,c)=>n+objectiveProgress(c,p,others,s).points,0),destinationVp:p.destinationHand.reduce((n,c)=>n+objectiveProgress(c,p,others,s).points,0),crews:p.crewPaid??0,tolls:p.tollsPaid,skips:record.actions.filter(e=>e.action.playerId===id&&e.action.type==='SKIP_ACTION').length};
  });
}
