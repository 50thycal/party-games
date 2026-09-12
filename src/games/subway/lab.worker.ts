import { runSimulation } from './lab';
import type { BotSettings } from './bots';
const worker=globalThis as unknown as {onmessage:(event:MessageEvent)=>void;postMessage:(value:unknown)=>void};
worker.onmessage=(event:MessageEvent<{count:number;seed:number;games:number;profiles:BotSettings[]}>)=>{
  const {count,seed,games,profiles}=event.data;
  if(!Number.isInteger(games)||games<1||games>100) {worker.postMessage({error:'Choose 1–100 games per batch.'});return;}
  for(let i=0;i<games;i++) {
    try {worker.postMessage({index:i,record:runSimulation(count,seed+i,profiles)});}
    catch(e) {worker.postMessage({index:i,error:e instanceof Error?e.message:String(e)});}
  }
  worker.postMessage({done:true});
};
