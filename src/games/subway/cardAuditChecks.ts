import { DESTINATION_CARDS, ENGINEERING_CARDS, STATIONS, objectiveProgress, scoreGame, subwayGame, type PlayerLine, type RouteNode, type SubwayState } from './config';
import { testRoom } from './playtest';

export type CardCheck={cardId:string;passed:boolean;checks:number;errors:string[]};
const pt=(x:number,y:number,stationId?:string):RouteNode=>({x,y,...(stationId?{stationId}:{})});
const line=(route:RouteNode[]):PlayerLine=>({contractId:'short',paid:5,start:1,route});
const finished=(a:RouteNode,b:RouteNode)=>line([a,pt(5,3),pt(8,4),pt(11,4),b]);

/** Synthetic predicate fixtures, NOT evidence that a legal construction path exists. */
export function checkAuditCards():CardCheck[] {
  return [...ENGINEERING_CARDS,...DESTINATION_CARDS].map(card=>{
    const errors:string[]=[];let checks=0;
    const test=(s:SubwayState,expected:number,label:string)=>{
      checks++;
      const p=s.players['seat-1'];
      const result=objectiveProgress(card.id,p,[s.players['seat-2']],s);
      if(result.points!==expected||result.met!==(expected===card.vp)) errors.push(`${label}: expected ${expected} VP/full=${expected===card.vp}, got ${result.points}/full=${result.met}`);
      p.engineeringHand=ENGINEERING_CARDS.some(c=>c.id===card.id)?[card.id]:[];
      p.destinationHand=p.engineeringHand.length?[]:[card.id];
      const ledger=scoreGame(s,1).players[p.id].scoreBreakdown?.find(r=>r.label===card.name);
      if(!ledger||ledger.points!==expected) errors.push(`${label}: final ledger disagrees`);
    };
    const base=()=>subwayGame.initialState(testRoom(2).players);
    test(base(),0,'empty');
    const s=base(),p=s.players['seat-1'];
    p.lines=[finished(pt(0,1),pt(8,0)),finished(pt(8,0),pt(26,4)),finished(pt(26,4),pt(12,8))];
    p.money=5;
    const dest=DESTINATION_CARDS.find(c=>c.id===card.id);
    if(dest) {
      p.lines=[line(dest.stationIds.map((id,i)=>pt(2+i*3,4,id)))];
      test(s,card.vp,'connected');
      for(let i=0;i<dest.stationIds.length;i++) {
        const missing=structuredClone(s);missing.players[p.id].lines[0].route.splice(i,1);test(missing,0,`missing ${i+1}`);
      }
      p.lines=dest.stationIds.map((id,i)=>line([pt(2+i*4,4,id)]));test(s,0,'disconnected');
    } else {
      switch(card.id) {
        case 'gentle': break;
        case 'bend': p.lines=[0,1,2].map(i=>finished(pt(0,1+i),pt(4+i*3,0)));break;
        case 'straight': p.lines=[0,1,2].map(i=>finished(pt(0,1+i),pt(0,5+i)));break;
        case 'through': p.lines=[0,1,2].map(i=>finished(pt(3+i*3,0),pt(4+i*3,8)));break;
        case 'three-fronts': p.lines=[pt(0,1),pt(7,0),pt(26,1)].map((a,i)=>finished(a,pt(4+i*3,8)));break;
        case 'perimeter': p.lines=[0,1,2].map(i=>line([pt(0,1+i),pt(4+i,0),pt(10,3),pt(15,4),pt(26,5+i)]));break;
        case 'network': break;
        case 'solvent': break;
        case 'minimal': s.surveyPins=[{playerId:p.id,x:5,y:3}];break;
        case 'crossing': s.firstCompletedPlayerId=p.id;break;
        case 'terminal': p.lines=[line(STATIONS.map((st,i)=>pt(1+i*2,4,st.id)))];break;
        case 'local-service': p.lines=[line(STATIONS.filter(st=>st.kind==='minor').map((st,i)=>pt(2+i*3,4,st.id)))];break;
        case 'approach': p.lines=[finished(pt(0,1),pt(20,4))];STATIONS.filter(st=>st.kind==='major').slice(0,3).forEach((st,i)=>{p.lines[0].route[i+1].stationId=st.id;});break;
        case 'interchange': p.lines=[0,1,2].map(i=>line([pt(8+i,4,'grand')]));break;
        case 'crosstown-service': p.lines=[line([pt(0,3),pt(8,0),pt(26,4),pt(16,8)])];break;
        case 'four-corners': p.lines=[line([pt(0,0),pt(26,8),pt(26,0),pt(0,8)])];break;
        default: errors.push('Missing explicit Engineering fixture');
      }
      test(s,card.vp,'full');
      const tiers=objectiveProgress(card.id,p,[s.players['seat-2']],s).tiers;
      if(tiers) for(let n=1;n<tiers.length;n++) {
        const partial=structuredClone(s);
        if(card.id==='crosstown-service') partial.players[p.id].lines=[line([pt(0,3),pt(26,4)])];
        else if(card.id==='four-corners') partial.players[p.id].lines=[line([pt(0,0),pt(26,8)])];
        else partial.players[p.id].lines=partial.players[p.id].lines.slice(0,n);
        test(partial,tiers[n-1],`tier ${n}`);
      }
      const near=structuredClone(s),q=near.players[p.id];
      if(card.id==='solvent') q.money=4;
      else if(card.id==='crossing') near.firstCompletedPlayerId='seat-2';
      else if(card.id==='minimal') near.surveyPins[0].playerId='seat-2';
      else if(card.id==='terminal'||card.id==='local-service') q.lines[0].route.at(-1)!.stationId=q.lines[0].route[0].stationId;
      else if(card.id==='approach') q.lines[0].route.pop();
      else if(card.id==='interchange') q.lines[2].route=[pt(20,4,'grand')];
      else if(card.id==='network') q.lines[2].route.pop();
      else q.lines=[];
      test(near,0,'negative');
    }
    return {cardId:card.id,passed:errors.length===0,checks,errors};
  });
}
