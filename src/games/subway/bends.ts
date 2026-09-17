import {SUBWAY_CONFIG, angleChange, allLines, contractOf, lineComplete, segmentsBuilt, segmentsCross, segmentsOverlap, routeContacts, type Point, type SubwayState, type RouteContact} from './config';
import {pathLength, pathLegs, lineLegs, constructionTip} from './paths';

export type BendMode='straight'|'tokens'|'delayed';
export const BEND_MODES:BendMode[]=['straight','tokens','delayed'];
export const BEND_LABELS:Record<BendMode,string>={straight:'Straight segments',tokens:'Bend tokens',delayed:'Delayed construction'};
export const isBendMode=(v:unknown):v is BendMode=>BEND_MODES.includes(v as BendMode);
const same=(a:Point,b:Point)=>a.x===b.x&&a.y===b.y;
const on=(p:Point,a:Point,b:Point)=>Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))<1e-8&&p.x>=Math.min(a.x,b.x)&&p.x<=Math.max(a.x,b.x)&&p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y);
const valid=(p:Point)=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.y>=0&&p.x<27&&p.y<9;
export const tokenCost=(s:SubwayState,id:string,count:number)=>Math.max(0,count-(s.players[id].bendTokens??0))*3;
export function remainingLength(s:SubwayState,id:string,index:number) {
 const l=s.players[id].lines[index],required=contractOf(l)?.recipe[segmentsBuilt(l)]??0;
 return required-(l.work?.length?pathLength([l.route.at(-1)!,...l.work]):0);
}

/** Preview and reducer share validation. points omit the existing construction tip. */
export function validatePath(s:SubwayState,id:string,index:number,points:Point[],pause=false,previewOnly=false):string|null {
 const me=s.players[id],l=me?.lines[index],mode=s.bendMode??'straight';
 if(!l||!l.route.length||lineComplete(l))return 'Choose an unfinished line with a starter.';
 if(!Array.isArray(points)||!points.length||points.length>8||points.some(p=>!valid(p)))return 'Choose valid board holes.';
 if(mode==='straight'&&(points.length!==1||pause||l.work?.length))return 'This game uses straight segments.';
 if(mode==='delayed'&&points.length!==1)return 'Build one leg per activation in delayed mode.';
 if(pause&&mode!=='delayed'&&!(previewOnly&&mode==='tokens'))return 'Only delayed construction can stop at a bend.';
 const bends=points.length-1+Number(pause);
 if(mode==='tokens'&&tokenCost(s,id,bends)>Math.max(0,me.money))return 'Extra bend tokens cost $3M each and require available cash.';
 const from=constructionTip(l)!;
 const existing=lineLegs(l),newLegs=pathLegs([from,...points]);
 // Preserve the existing priority of same-color collision guidance.
 for(let i=0;i<newLegs.length;i++){
  const [a,b]=newLegs[i],prior=[...existing,...newLegs.slice(0,i)];
  for(const [c,d] of prior.slice(0,-1))if(segmentsCross(a,b,c,d)||on(b,c,d)||on(c,a,b)||on(d,a,b))return 'A line cannot cross or rejoin its own color.';
 }
 const length=pathLength([l.route.at(-1)!,...(l.work??[]),...points]);
 const required=contractOf(l)!.recipe[segmentsBuilt(l)],tol=SUBWAY_CONFIG.geometry.lengthTolerance;
 if(pause?length>required+tol-1+1e-8:Math.abs(length-required)>tol+1e-8)return pause?'Leave at least one peg space to finish this segment.':`Segment must span ${required} spaces in total (path ${length.toFixed(1)}).`;
 for(let i=0;i<newLegs.length;i++) {
  const [a,b]=newLegs[i];
  if(same(a,b))return 'Each leg must have positive length.';
  if(Object.values(s.players).some(p=>p.lines.some(line=>line.route.some(n=>same(n,b)))))return 'One peg per hole. This hole is already occupied.';
  const previous=i?newLegs[i-1]:existing.at(-1);
  if(previous&&angleChange(previous[0],a,b)>90+1e-8)return 'A line may curve at most 90°.';
  for(const [c,d] of [...existing,...newLegs.slice(0,i)]) {
   if(segmentsOverlap(a,b,c,d))return 'A string cannot lie on top of an existing string.';
   if(previous&&same(c,previous[0])&&same(d,a))continue;
   if(segmentsCross(a,b,c,d)||on(b,c,d)||on(c,a,b)||on(d,a,b))return 'A line cannot cross or rejoin its own color.';
  }
  for(const {line} of allLines(s))for(const [c,d] of lineLegs(line))if(segmentsOverlap(a,b,c,d))return 'A string cannot lie on top of an existing string.';
 }
 return null;
}

/** Physical contacts for new legs only; bends never receive station access. */
export function pathContacts(s:SubwayState,id:string,index:number,points:Point[],pause=false):RouteContact[] {
 const l=s.players[id].lines[index],legs=pathLegs([constructionTip(l)!,...points]);
 const contacts=new Map<string,RouteContact>();
 legs.forEach(([a,b],i)=>routeContacts(s,id,a,b,index).filter(c=>c.kind!=='station'||!pause&&i===legs.length-1).forEach(c=>contacts.set(c.key,c)));
 return Array.from(contacts.values());
}

export type BendMove={points:Point[];pause:boolean};
/** Find a real legal action, not a chord approximation, for crew/end checks and bots. */
export function findBendMove(s:SubwayState,id:string,index:number):BendMove|undefined {
 const l=s.players[id]?.lines[index];if(!l?.route.length||lineComplete(l))return;
 const mode=s.bendMode??'straight';
 const search=(prefix:Point[]):BendMove|undefined=>{
  const tip=prefix.at(-1)??constructionTip(l)!;
  const budget=remainingLength(s,id,index)-pathLength([constructionTip(l)!,...prefix])+SUBWAY_CONFIG.geometry.lengthTolerance;
  const candidates:Point[]=[];
  for(let y=Math.max(0,Math.ceil(tip.y-budget));y<=Math.min(8,Math.floor(tip.y+budget));y++)for(let x=Math.max(0,Math.ceil(tip.x-budget));x<=Math.min(26,Math.floor(tip.x+budget));x++)if(Math.hypot(x-tip.x,y-tip.y)<=budget+1e-8)candidates.push({x,y});
  for(const p of candidates) {
   const points=[...prefix,p];if(!validatePath(s,id,index,points))return {points,pause:false};
  }
  if(mode==='straight')return;
  for(const p of candidates) {
   const points=[...prefix,p];if(validatePath(s,id,index,points,true,true))continue;
   if(mode==='delayed')return {points,pause:true};
   const found=search(points);if(found)return found;
  }
 };
 return search([]);
}
