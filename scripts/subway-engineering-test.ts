import jncg from './fixtures/subway-jncg-neighborhoods.json';
import assert from 'node:assert/strict';
import { ENGINEERING_CARDS, objectiveProgress, subwayGame, type SubwayState, type SubwayAction } from '../src/games/subway/config';
import { engineeringWitness, checkAuditCards } from '../src/games/subway/cardAuditChecks';
import { stationClusters } from '../src/games/subway/engineering';
import { testRoom, seededRandom } from '../src/games/subway/playtest';
import { randomStationLayout } from '../src/games/subway/config';
import { neighborhoodLabel } from '../src/games/subway/neighborhoodLabels';
const points=(id:string,s:SubwayState)=>objectiveProgress(id,s.players['seat-1'],[s.players['seat-2']],s).points;
assert.deepEqual(['Line','Station','Neighborhood'].map(k=>ENGINEERING_CARDS.filter(c=>c.category===k).length),[7,7,7]);
assert.deepEqual(ENGINEERING_CARDS.map(c=>c.vp),[3,4,3,3,5,5,6,3,4,4,4,5,5,6,3,4,3,2,7,5,2]);
for(const result of checkAuditCards())assert.deepEqual(result.errors,[],result.cardId);
for(const id of ['north-south','turning-corner','return-service','terminal-interchanges']){
 const s=engineeringWitness(id);s.players['seat-1'].lines[0].route.pop();assert.equal(points(id,s),0,`${id}: incomplete endpoint`);
}
{
 const s=engineeringWitness('north-south'),r=s.players['seat-1'].lines[0].route;
 r[r.length-2]={x:6,y:8};r[r.length-1]={x:7,y:7};assert.equal(points('north-south',s),0,'intermediate border cannot substitute for final');
}
for(const id of ['across-town','opposite-corners']){
 const s=engineeringWitness(id),p=s.players['seat-1'];assert.ok(points(id,s)>0,'two connected starters qualify');
 p.lines[0].route.pop();assert.equal(points(id,s),0,'separated endpoint networks');
 s.players['seat-2'].lines=[{contractId:'short',paid:0,route:[p.lines[0].route.at(-1)!,p.lines[1].route[0]]}];
 assert.equal(points(id,s),0,'opponent cannot bridge endpoints');
 const q=engineeringWitness(id),r=q.players['seat-1'].lines[1].route;
 r.unshift({x:20,y:2});assert.equal(points(id,q),0,'unfinished growing end is not an endpoint');
}
// Any qualifying endpoint pair: two finals and a starter/final also count.
for(const id of ['across-town','opposite-corners'])for(const finals of [1,2]){
 const s=engineeringWitness(id),p=s.players['seat-1'];
 for(let i=0;i<finals;i++){
  const endpoint=p.lines[i].route[0];
  p.lines[i].route=[{x:10,y:3},{x:13,y:3},{x:16,y:3},{x:20,y:3},endpoint];
 }
 // Both lines remain in one company network; synthetic predicate fixture.
 if(finals===1)p.lines[1].route.push({x:10,y:4});
 assert.ok(points(id,s)>0,`${id}: ${finals} completed finals qualify`);
}
{
 const s=engineeringWitness('transfer-station');s.stations=[];
 assert.equal(points('transfer-station',s),0,'own transfer outside neighborhoods');
}
{
 const s=engineeringWitness('station-chain'),p=s.players['seat-1'];
 p.lines.forEach(l=>l.route.pop());assert.equal(points('station-chain',s),0,'only two stations');
 const q=engineeringWitness('station-chain');
 q.players['seat-1'].lines.push({contractId:'short',paid:0,route:[{x:3,y:1},{x:5,y:1}]});
 q.players['seat-1'].lines[1].route.push({x:4,y:1});
 assert.equal(stationClusters([q.players['seat-1']]).length,2);
 assert.equal(points('station-chain',q),0,'merged stations count once');
}
{
 const s=engineeringWitness('neighborhood-interchange');
 s.stations[0].cells!.push({x:3,y:4});s.stations[1].cells=[];
 assert.equal(points('neighborhood-interchange',s),0,'one neighborhood only');
 const q=engineeringWitness('neighborhood-interchange');
 q.stations[1].cells=[{x:4,y:4}];q.players['seat-1'].lines[1].route=[{x:4,y:4}];
 assert.equal(points('neighborhood-interchange',q),0,'separated neighborhoods');
}
{
 const s=engineeringWitness('four-sides');s.players['seat-1'].lines=[{contractId:'short',paid:0,route:[{x:0,y:0}]},{contractId:'short',paid:0,route:[{x:26,y:8}]}];
 assert.equal(points('four-sides',s),0,'two corners do not count as four endpoints');
}
{
 const s=engineeringWitness('perimeter-service'),p=s.players['seat-1'];
 p.lines=p.lines[0].route.map(n=>({contractId:'short',paid:0,route:[n]}));assert.equal(points('perimeter-service',s),0,'no aggregating separate lines');
}
{
 const s=engineeringWitness('back-to-back'),p=s.players['seat-1'];
 p.lines[0].route.splice(1,0,{x:4,y:6});p.lines[1].route.splice(1,0,{x:9,y:7});assert.equal(points('back-to-back',s),0,'stations must be consecutive on the same line');
 p.lines[0].route.splice(1,1);p.lines[1].route.splice(1,1);
 p.lines.push({contractId:'short',paid:0,route:[{x:3,y:1},{x:4,y:2},{x:5,y:1}]});
 p.lines[1].route.splice(1,0,{x:3,y:2},{x:4,y:1},{x:5,y:2});
 assert.equal(stationClusters([p]).length,1);assert.equal(points('back-to-back',s),0,'merged cluster counts once');
}
{
 const s=engineeringWitness('shared-stations');assert.equal(points('transfer-station',s),0,'opponents do not qualify as own transfers');
 s.players['seat-2'].lines=[];assert.equal(points('shared-stations',s),0);
}
{
 const s=engineeringWitness('three-line-hub'),p=s.players['seat-1'];
 p.lines[2].route[0]={x:5,y:1};assert.equal(points('three-line-hub',s),0,'one gap separates the third line');
 p.lines=[{contractId:'short',paid:0,route:[{x:1,y:1},{x:2,y:1}]}];assert.equal(stationClusters([p]).length,0,'same-line adjacency is not transfer');
}
for(const id of ['small-pair','small-focus']){
 const s=engineeringWitness(id),p=s.players['seat-1'];p.lines=p.lines[0].route.map(n=>({contractId:'short',paid:0,route:[n]}));assert.equal(points(id,s),0,'Single Line scope');
}
for(const id of ['mixed-service','large-trio','citywide-coverage']){
 const s=engineeringWitness(id),p=s.players['seat-1'];p.lines=p.lines[0].route.map(n=>({contractId:'short',paid:0,route:[n]}));assert.equal(points(id,s),0,'connected scope');
}
{
 const s=engineeringWitness('large-presence'),p=s.players['seat-1'];p.lines[1].route=p.lines[0].route;assert.equal(points('large-presence',s),0,'three pegs must occupy distinct holes');
}
{
 const s=engineeringWitness('neighborhood-stopover'),p=s.players['seat-1'];p.lines[0].route.splice(1,0,{x:0,y:0});assert.equal(points('neighborhood-stopover',s),0,'not consecutive');
}
// Real reducer completion and Undo, with card progress recomputed from live state.
{
 let s=subwayGame.initialState(testRoom(2).players);s.stations=[];s.phase='CONSTRUCTION';s.resolveQueue=['seat-1','seat-2'];
 const p=s.players['seat-1'];p.lines=[{contractId:'short',paid:0,route:[{x:0,y:0},{x:2,y:0},{x:5,y:0},{x:7,y:0}]}];p.engineeringHand=['return-service'];
 const dispatch=(type:SubwayAction['type'],payload?:SubwayAction['payload'])=>{s=subwayGame.reducer(s,{type,playerId:p.id,payload},{room:testRoom(2),playerId:p.id,now:()=>1,random:()=>.5});};
 dispatch('HIRE_CREWS',{lineIndexes:[0],period:1});dispatch('BUILD',{lineIndex:0,x:10,y:0});assert.equal(points('return-service',s),3);
 dispatch('UNDO_PLACEMENT');assert.equal(points('return-service',s),0);
}
// Containment across generated layouts and camera zooms. Names never use a
// bounding-box void which may belong to the neighboring area.
const layouts=[...Array.from({length:30},(_,seed)=>randomStationLayout(seededRandom(seed))),jncg.map(a=>({...randomStationLayout(seededRandom(1)).find(s=>s.name===a.name)!,cells:a.cells}))];
for(const layout of layouts)for(const area of layout)for(const zoom of [.15,.35,.5,1,2.4]){
 const l=neighborhoodLabel(area,zoom),cells=new Set(area.cells!.map(n=>`${n.x},${n.y}`));
 for(let x=l.x+.01;x<l.x+l.width;x+=.2)for(let y=l.y+.01;y<l.y+l.height;y+=.2)assert.ok(cells.has(`${Math.round(x)},${Math.round(y)}`),`${area.name}: label outside footprint`);
 assert.ok(l.font>0&&Number.isFinite(l.font));
 for(const y of l.lineYs)assert.ok(y-l.font*.65/82>=l.y && y+l.font*.65/82<=l.y+l.height);
 assert.ok(l.sizeY<=l.y+l.height);
}
console.log('21 Engineering cards: binary scoring, scope, endpoints, station merging, Undo and label containment passed.');
