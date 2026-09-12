import { DEFAULT_BOT, BOT_VERSION, validBot, chooseBotAction, type BotSettings } from './bots';
import { newRecord, recordedReducer, type GameRecord } from './recording';
import { subwayGame, nextCompanyId, type SubwayState } from './config';
import { seededRandom, testRoom } from './playtest';

export type LabSeat = {id:string;name:string;control:'human'|'bot'|'remote';bot:BotSettings};
export type LabStore = {seats:LabSeat[];seed:number;step:number;history:{at:number;playerId:string;value:unknown}[];notes:{at:number;actionIndex:number;text:string}[]};
export function validateSeats(value:unknown): Omit<LabSeat,'id'>[] {
  if(!Array.isArray(value)||value.length<2||value.length>4) throw new Error('Choose 2–4 companies.');
  return value.map((v,i)=>{
    if(!v||!['human','bot','remote'].includes(v.control)||!validBot(v.bot)) throw new Error('Invalid company settings.');
    return {name:typeof v.name==='string'?v.name.trim().slice(0,40)||`Company ${i+1}`:`Company ${i+1}`,control:v.control,bot:v.bot};
  });
}
export function runSimulation(count:number,seed:number,profiles:BotSettings[]):GameRecord {
  if(![2,3,4].includes(count)||!Number.isInteger(seed)||profiles.length!==count||!profiles.every(validBot)) throw new Error('Invalid simulation settings.');
  const room=testRoom(count); room.mode='simulation';
  let state=subwayGame.initialState(room.players);
  const record=newRecord(room,state,'simulation');
  record.seed=seed;record.profiles=profiles;record.botVersion=BOT_VERSION;
  const random=seededRandom(seed), decisions=seededRandom(seed^0x9e3779b9);
  const step=(action:NonNullable<ReturnType<typeof chooseBotAction>>)=>{
    const next=recordedReducer(state,action,{room,playerId:action.playerId,now:()=>record.actions.length+1,random},record,'bot');
    if(next===state) throw new Error(`Bot action rejected: ${action.type}`);
    state=next;
  };
  step({type:'START_GAME',playerId:room.hostId});
  while(state.phase!=='RESULTS'&&record.actions.length<500) {
    const index=room.players.findIndex(p=>p.id===nextCompanyId(state));
    const action=chooseBotAction(state,decisions,profiles[index]??DEFAULT_BOT);
    if(!action) break;
    if(action.type==='ADVANCE_SCORING') action.playerId=room.hostId;
    step(action);
  }
  if(state.phase!=='RESULTS') throw new Error('Simulation did not finish within 500 actions.');
  record.final=state;
  return record;
}
