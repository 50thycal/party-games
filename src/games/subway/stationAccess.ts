import type { Point, RouteContact, SubwayState } from './config';
import { stationClusters } from './engineering';
import { networkNodeKey } from './network';

export type StationAccess = { contractId:string; ownerId:string; anchors:string[] };

/** Price a newly joined local station before applying the placement. Receipts
 * anchor to physical holes so later growth/merges cannot rename paid access. */
export function stationAccessContacts(state:SubwayState,playerId:string,lineIndex:number,to:Point):RouteContact[] {
  const me=state.players[playerId],line=me?.lines[lineIndex];
  if(!line)return [];
  if(!Object.values(state.players).some(p=>p.lines.some((l,i)=>(p.id!==playerId||i!==lineIndex)&&l.route.some(n=>Math.abs(n.x-to.x)+Math.abs(n.y-to.y)===1))))return [];
  const before=stationClusters(Object.values(state.players));
  const player={...me,lines:me.lines.map((l,i)=>i===lineIndex?{...l,route:[...l.route,to]}:l)};
  const groups=stationClusters(Object.values(state.players).map(p=>p.id===playerId?player:p));
  const joined=groups.find(g=>g.some(m=>m.owner===playerId&&m.line===lineIndex&&m.index===line.route.length));
  if(!joined)return [];
  const anchors=Array.from(new Set(joined.map(m=>networkNodeKey(m.node)))).sort();
  const owners=Array.from(new Set(joined.filter(m=>m.owner!==playerId).map(m=>m.owner)));
  return owners.filter(ownerId=>{
    const paid=(me.stationAccess??[]).some(r=>r.contractId===line.contractId&&r.ownerId===ownerId&&r.anchors.some(a=>anchors.includes(a)));
    // Incumbents already in a shared station are not charged when someone else
    // joins them, or when they subsequently extend their existing participation.
    const incumbent=before.some(g=>g.some(m=>m.owner===ownerId)&&g.some(m=>m.owner===playerId&&m.line===lineIndex)&&g.some(m=>anchors.includes(networkNodeKey(m.node))));
    return !paid&&!incumbent;
  }).map(ownerId=>({key:`station:${ownerId}:${anchors.join(';')}`,ownerId,kind:'station',x:to.x,y:to.y,stationAnchors:anchors}));
}
