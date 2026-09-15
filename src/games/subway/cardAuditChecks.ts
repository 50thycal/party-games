import { DESTINATION_CARDS, ENGINEERING_CARDS, objectiveProgress, scoreGame, subwayGame, type PlayerLine, type RouteNode, type SubwayState } from './config';
import { testRoom } from './playtest';
export type CardCheck={cardId:string;passed:boolean;checks:number;errors:string[]};
const pt=(x:number,y:number,stationId?:string):RouteNode=>({x,y,...(stationId?{stationId}:{})});
const line=(route:RouteNode[]):PlayerLine=>({contractId:'short',paid:5,start:1,route});
const finished=(a:RouteNode,b:RouteNode)=>line([a,pt(5,3),pt(8,4),pt(11,4),b]);

/** Synthetic predicate witnesses, not a claim that these routes are legally buildable. */
export function engineeringWitness(id:string):SubwayState {
  const s=subwayGame.initialState(testRoom(2).players),p=s.players['seat-1'];
  // Independent synthetic area membership fixtures, explicitly coordinate-based.
  s.stations=s.stations.map((a,i)=>({...a,cells:[pt(2+i*2,4),pt(2+i*2,5),pt(2+i*2,6)]}));
  const nodes=(kind?:string)=>s.stations.filter(a=>!kind||a.kind===kind).map(a=>({...a.cells![0],stationId:a.id}));
  switch(id){
    case 'north-south':p.lines=[finished(pt(3,0),pt(6,8))];break;
    case 'four-sides':p.lines=[finished(pt(4,0),pt(5,8)),finished(pt(0,3),pt(26,4))];break;
    case 'turning-corner':p.lines=[finished(pt(0,3),pt(9,0))];break;
    case 'return-service':p.lines=[finished(pt(0,3),pt(0,6))];break;
    case 'across-town':p.lines=[line([pt(0,3),pt(14,4),pt(25,4)]),line([pt(26,4)])];break;
    case 'perimeter-service':p.lines=[line([pt(0,3),pt(7,0),pt(26,4)])];break;
    case 'opposite-corners':p.lines=[line([pt(0,0),pt(14,4),pt(26,7)]),line([pt(26,8)])];break;
    case 'transfer-station':p.lines=[line([pt(2,4)]),line([pt(2,5)])];break;
    case 'three-line-hub':p.lines=[line([pt(2,1)]),line([pt(3,1)]),line([pt(4,1)])];break;
    case 'shared-stations':p.lines=[line([pt(2,1),pt(6,1)])];s.players['seat-2'].lines=[line([pt(2,2),pt(6,2)])];break;
    case 'back-to-back':p.lines=[line([pt(2,1),pt(6,1)]),line([pt(2,2),pt(6,2)])];break;
    case 'station-chain':p.lines=[line([pt(2,1),pt(6,1),pt(10,1)]),line([pt(2,2),pt(6,2),pt(10,2)])];break;
    case 'neighborhood-interchange':s.stations[0].cells=[pt(2,4)];s.stations[1].cells=[pt(3,4)];p.lines=[line([pt(2,4)]),line([pt(3,4)])];break;
    case 'terminal-interchanges':p.lines=[finished(pt(2,1),pt(14,1)),line([pt(2,2),pt(14,2)])];break;
    case 'small-pair':p.lines=[line(nodes('minor').slice(0,2))];break;
    case 'mixed-service':p.lines=[line(['minor','medium','major'].map(k=>nodes(k)[0]))];break;
    case 'large-trio':p.lines=[line(nodes('major').slice(0,3))];break;
    case 'large-presence':p.lines=s.stations.find(a=>a.kind==='major')!.cells!.map(n=>line([n]));break;
    case 'citywide-coverage':p.lines=[line(nodes().slice(0,8))];break;
    case 'small-focus':p.lines=[line(s.stations.find(a=>a.kind==='minor')!.cells!.slice(0,2))];break;
    case 'neighborhood-stopover':p.lines=[line(s.stations[0].cells!.slice(0,2))];break;
    default:throw new Error(`Missing Engineering witness: ${id}`);
  }
  return s;
}
export function checkAuditCards():CardCheck[] {
  return [...ENGINEERING_CARDS,...DESTINATION_CARDS].map(card=>{
    const errors:string[]=[];let checks=0;
    const test=(s:SubwayState,expected:number,label:string)=>{
      checks++;const p=s.players['seat-1'];
      const result=objectiveProgress(card.id,p,[s.players['seat-2']],s);
      if(result.points!==expected||result.met!==(expected===card.vp))errors.push(`${label}: expected ${expected}, got ${result.points}`);
      p.engineeringHand=ENGINEERING_CARDS.some(c=>c.id===card.id)?[card.id]:[];
      p.destinationHand=p.engineeringHand.length?[]:[card.id];
      const ledger=scoreGame(s,1).players[p.id].scoreBreakdown?.find(r=>r.label===card.name);
      if(!ledger||ledger.points!==expected)errors.push(`${label}: ledger disagrees`);
    };
    const base=()=>subwayGame.initialState(testRoom(2).players);
    test(base(),0,'empty');
    const dest=DESTINATION_CARDS.find(c=>c.id===card.id);
    if(dest){
      const s=base(),p=s.players['seat-1'];p.lines=[line(dest.stationIds.map((id,i)=>pt(2+i*3,4,id)))];test(s,card.vp,'connected');
      for(let i=0;i<dest.stationIds.length;i++){const missing=structuredClone(s);missing.players[p.id].lines[0].route.splice(i,1);test(missing,0,`missing ${i+1}`);}
      p.lines=dest.stationIds.map((id,i)=>line([pt(2+i*4,4,id)]));test(s,0,'disconnected');
    }else{
      const s=engineeringWitness(card.id);test(s,card.vp,'witness');
      s.players['seat-1'].lines=[];test(s,0,'witness removed');
    }
    return {cardId:card.id,passed:!errors.length,checks,errors};
  });
}
