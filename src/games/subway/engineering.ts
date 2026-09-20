import { lineComplete, recipeEndpoint, contractOf, STATIONS, stationAt, type SubwayPlayer, type SubwayState, type RouteNode, type PlayerLine } from './config';
import { borderSides, companyNetwork, networkNodeKey, nodesTransfer, distinctSides } from './network';

export type EngineeringCategory = 'Line' | 'Station' | 'Neighborhood';
export type EngineeringCard = { id:string; name:string; description:string; requirement:string; vp:number; kind:'objective'; category:EngineeringCategory; tags:string[] };
const card = (id:string,name:string,vp:number,category:EngineeringCategory,tags:string[],requirement:string):EngineeringCard => ({id,name,vp,category,tags,requirement,description:requirement,kind:'objective'});
export const ENGINEERING_CARDS:EngineeringCard[] = [
  card('north-south','North–South Connection',3,'Line',['Single Line','Complete Line','Line Ends Only'],'Start one line on the north border and finish it on the south border, or vice versa. Intermediate stations do not count.'),
  card('four-sides','Four-Side Service',4,'Line',['Company-wide','Line Ends Only'],'Have a starter or completed final station on each of the four borders. Different sides need different stations; lines need not connect.'),
  card('turning-corner','Turning the Corner',3,'Line',['Single Line','Complete Line','Line Ends Only'],'Start one line on an east/west border and finish on a north/south border, or vice versa.'),
  card('return-service','Return Service',3,'Line',['Single Line','Complete Line','Line Ends Only'],'Finish one line on the same border side as its starter.'),
  card('across-town','Across Town',5,'Line',['Connected Network','Line Ends Only'],'Connect qualifying line ends on the east and west borders. Each may be a starter or a completed final station, on the same or different lines.'),
  card('perimeter-service','Perimeter Service',5,'Line',['Single Line'],'One line has distinct stations on at least three different border sides. Any stations count; completion is not required.'),
  card('opposite-corners','Opposite Corners',6,'Line',['Connected Network','Line Ends Only'],'Connect qualifying line ends in diagonally opposite corners. Each may be a starter or a completed final station, on the same or different lines.'),
  card('transfer-station','Transfer Station',3,'Station',['Your Lines','One Neighborhood'],'Form a transfer station between two of your lines inside one neighborhood.'),
  card('three-line-hub','Three-Line Hub',4,'Station',['Your Lines','One Transfer Station'],'Bring all three of your lines together in one transfer station, anywhere on the board.'),
  card('shared-stations','Shared Transfer Stations',4,'Station',['Opponent Contact','Distinct Transfer Stations'],'Participate in two separate transfer stations containing your stations and opponent stations. The same opponent may join both. No neighborhood restriction.'),
  card('back-to-back','Back-to-Back Transfer Stations',4,'Station',['Single Line','Consecutive Stations','Distinct Transfer Stations'],'Two consecutive stations on one of your lines belong to two distinct transfer stations connecting to your other lines. No neighborhood restriction.'),
  card('station-chain','Transfer Station Chain',5,'Station',['Connected Network','Distinct Transfer Stations'],'Have three distinct transfer stations between your lines in one connected company network. No neighborhood restriction.'),
  card('neighborhood-interchange','Neighborhood Interchange',5,'Station',['Your Lines','One Transfer Station'],'Form one transfer station spanning two touching neighborhoods, with stations from at least two of your lines.'),
  card('terminal-interchanges','Terminal Interchanges',6,'Station',['Single Line','Complete Line','Distinct Transfer Stations'],'The starter and final station of one completed line belong to two distinct transfer stations connecting to your other lines.'),
  card('small-pair','Small Neighborhood Pair',3,'Neighborhood',['Single Line','S + S'],'Serve two different small neighborhoods with one line.'),
  card('mixed-service','Mixed Service',4,'Neighborhood',['Connected Network','S + M + L'],'Serve one small, one medium and one large neighborhood in one connected company network.'),
  card('large-trio','Large Neighborhood Trio',3,'Neighborhood',['Connected Network','L + L + L'],'Serve three different large neighborhoods in one connected company network.'),
  card('large-presence','Large Neighborhood Presence',2,'Neighborhood',['Company-wide','L'],'Place your stations on three distinct holes in one large neighborhood. Any of your lines may contribute, connected or not.'),
  card('citywide-coverage','Citywide Coverage',7,'Neighborhood',['Connected Network'],'Serve eight different neighborhoods in one connected company network.'),
  card('small-focus','Small Neighborhood Focus',5,'Neighborhood',['Single Line','S'],'Place two stations of the same line on distinct holes in one small neighborhood. They need not be consecutive.'),
  card('neighborhood-stopover','Neighborhood Stopover',2,'Neighborhood',['Single Line','Consecutive Stations'],'Place two consecutive stations of one line inside the same neighborhood, of any size.'),
];
export const ENGINEERING_RULES:Record<string,string> = {
  'Single Line':'One line satisfies the whole card. Its connections to other lines are allowed, but their stations cannot help.',
  'Connected Network':'Your physically connected lines may contribute. Opponent tracks never connect your network.',
  'Company-wide':'Any of your lines may contribute, even if disconnected.',
  'Line Ends Only':'A starter station or the original recipe’s final station. Extensions do not move that qualifying endpoint; an unfinished end does not count.',
  'Complete Line':'Every segment on the qualifying contract must be built.',
  'Consecutive Stations':'Successive stations on one line, joined by one segment.',
  'Distinct Transfer Stations':'Separate whole local transfer stations. One transfer station cannot count twice; merged transfer stations count once.',
  'Opponent Contact':'This card explicitly allows opponent stations; ordinary transfer cards require your own lines.',
  'Your Lines':'Transfers require stations from different lines belonging to you.',
  'One Transfer Station':'One local transfer station of horizontally/vertically adjacent different-line stations.',
  'One Neighborhood':'The individual stations forming the qualifying transfer are inside the same neighborhood.',
};
export const qualifyingEndpoints = (lines:PlayerLine[]):RouteNode[] => lines.flatMap(l => l.route.length ? [l.route[0],...(lineComplete(l)?[recipeEndpoint(l)!]:[])] : []);
type Member = {node:RouteNode;owner:string;line:number;index:number};
/** Whole local clusters, not line segments or pairwise transfer counts. */
export function stationClusters(players:SubwayPlayer[]):Member[][] {
  const members = players.flatMap(p=>p.lines.flatMap((l,line)=>l.route.map((node,index)=>({node,owner:p.id,line,index}))));
  const parent=members.map((_,i)=>i);
  const root=(i:number):number=>parent[i]===i?i:(parent[i]=root(parent[i]));
  for(let i=0;i<members.length;i++) for(let j=i+1;j<members.length;j++) {
    const a=members[i],b=members[j];
    if((a.owner!==b.owner||a.line!==b.line)&&nodesTransfer(a.node,b.node)) parent[root(i)]=root(j);
  }
  const groups=new Map<number,Member[]>();
  members.forEach((m,i)=>groups.set(root(i),[...(groups.get(root(i))??[]),m]));
  return Array.from(groups.values()).filter(g=>new Set(g.map(m=>`${m.owner}/${m.line}`)).size>=2);
}

export function engineeringMet(id:string,me:SubwayPlayer,opponents:SubwayPlayer[],state?:SubwayState):boolean {
  const areas=state?.stations??STATIONS;
  const areaId=(n:RouteNode)=>state ? stationAt(n,areas)?.id : n.stationId??stationAt(n,areas)?.id;
  const served=(nodes:RouteNode[])=>new Set(nodes.map(areaId).filter((id):id is string=>!!id));
  const sizeCount=(nodes:RouteNode[],kind:string)=>Array.from(served(nodes)).filter(id=>areas.find(a=>a.id===id)?.kind===kind).length;
  const complete=me.lines.filter(lineComplete);
  const endPairs=(fn:(a:RouteNode,b:RouteNode)=>boolean)=>complete.some(l=>fn(l.route[0],recipeEndpoint(l)!));
  const graph=()=>companyNetwork(me);
  const components=()=>{
    const g=graph(),out=new Map<number,RouteNode[]>();
    me.lines.flatMap(l=>l.route).forEach(n=>{const k=g.get(networkNodeKey(n))!;out.set(k,[...(out.get(k)??[]),n]);});
    return Array.from(out.values());
  };
  const endpointConnection=(fn:(a:RouteNode,b:RouteNode)=>boolean)=>{
    const nodes=qualifyingEndpoints(me.lines),g=graph();
    return nodes.some((a,i)=>nodes.slice(i+1).some(b=>g.get(networkNodeKey(a))===g.get(networkNodeKey(b))&&fn(a,b)));
  };
  const own=()=>stationClusters([me]);
  const stationIndex=(groups:Member[][],line:number,index:number)=>groups.findIndex(g=>g.some(m=>m.line===line&&m.index===index));
  const twoStations=(consecutive:boolean)=>{
    const groups=own();
    return me.lines.some((l,li)=>{
      if(!consecutive&&!lineComplete(l))return false;
      const pairs=consecutive?l.route.slice(1).map((_,i)=>[i,i+1]):[[0,contractOf(l)!.recipe.length]];
      return pairs.some(([a,b])=>{const x=stationIndex(groups,li,a),y=stationIndex(groups,li,b);return x>=0&&y>=0&&x!==y;});
    });
  };
  switch(id){
    case 'north-south':return endPairs((a,b)=>(a.y===0&&b.y===8)||(a.y===8&&b.y===0));
    case 'four-sides':return distinctSides(qualifyingEndpoints(me.lines),4);
    case 'turning-corner':return endPairs((a,b)=>borderSides(a).some(x=>borderSides(b).some(y=>(['north','south'].includes(x))!==(['north','south'].includes(y)))));
    case 'return-service':return endPairs((a,b)=>borderSides(a).some(s=>borderSides(b).includes(s)));
    case 'across-town':return endpointConnection((a,b)=>(a.x===0&&b.x===26)||(a.x===26&&b.x===0));
    case 'perimeter-service':return me.lines.some(l=>distinctSides(l.route,3));
    case 'opposite-corners':return endpointConnection((a,b)=>[a,b].every(n=>(n.x===0||n.x===26)&&(n.y===0||n.y===8))&&a.x!==b.x&&a.y!==b.y);
    case 'transfer-station':return own().some(g=>areas.some(area=>g.some(a=>areaId(a.node)===area.id&&g.some(b=>a.line!==b.line&&areaId(b.node)===area.id&&nodesTransfer(a.node,b.node)))));
    case 'three-line-hub':return own().some(g=>new Set(g.map(m=>m.line)).size>=3);
    case 'shared-stations':return stationClusters([me,...opponents]).filter(g=>g.some(m=>m.owner===me.id)&&g.some(m=>m.owner!==me.id)).length>=2;
    case 'back-to-back':return twoStations(true);
    case 'terminal-interchanges':return twoStations(false);
    case 'station-chain':{
      const g=graph(),counts=new Map<number,number>();
      own().forEach(cluster=>{const k=g.get(networkNodeKey(cluster[0].node))!;counts.set(k,(counts.get(k)??0)+1);});
      return Array.from(counts.values()).some(n=>n>=3);
    }
    case 'neighborhood-interchange':return own().some(g=>g.some(a=>g.some(b=>{
      const x=areaId(a.node),y=areaId(b.node);
      return !!x&&!!y&&x!==y&&nodesTransfer(a.node,b.node);
    })));
    case 'small-pair':return me.lines.some(l=>sizeCount(l.route,'minor')>=2);
    case 'mixed-service':return components().some(n=>['minor','medium','major'].every(k=>sizeCount(n,k)>=1));
    case 'large-trio':return components().some(n=>sizeCount(n,'major')>=3);
    case 'large-presence':return areas.some(a=>a.kind==='major'&&new Set(me.lines.flatMap(l=>l.route).filter(n=>areaId(n)===a.id).map(networkNodeKey)).size>=3);
    case 'citywide-coverage':return components().some(n=>served(n).size>=8);
    case 'small-focus':return me.lines.some(l=>areas.some(a=>a.kind==='minor'&&new Set(l.route.filter(n=>areaId(n)===a.id).map(networkNodeKey)).size>=2));
    case 'neighborhood-stopover':return me.lines.some(l=>l.route.slice(1).some((b,i)=>!!areaId(b)&&areaId(b)===areaId(l.route[i])));
    default:return false;
  }
}
