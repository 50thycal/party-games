import assert from "node:assert/strict";
import { randomStationLayout, stationAt, nodePoint, destinationMet, DESTINATION_CARDS, scoreGame, surveyBlocker, legalTargets, validateNode, type PlayerLine } from "../src/games/subway/config";
import { companyNetwork, longestNetwork } from "../src/games/subway/network";
import { startPlaytest, seededRandom } from "../src/games/subway/playtest";

const layouts = new Set<string>();
for (const count of [2,3,4]) for (let seed=1;seed<=100;seed++) {
  const areas=randomStationLayout(seededRandom(seed));
  assert.deepEqual(areas,randomStationLayout(seededRandom(seed)),"layout reproducible from engine seed");
  const all=new Set<string>();
  for(const area of areas) {
    const cells=area.cells!;
    assert.equal(cells.length,area.kind==="minor"?6:area.kind==="major"?16:10);
    const own=new Set(cells.map(p=>`${p.x},${p.y}`));
    const reached=new Set<string>(),pending=[cells[0]];
    while(pending.length) { const p=pending.pop()!,key=`${p.x},${p.y}`; if(reached.has(key))continue; reached.add(key);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {const q={x:p.x+dx,y:p.y+dy}; if(own.has(`${q.x},${q.y}`)&&!reached.has(`${q.x},${q.y}`))pending.push(q);}
    }
    assert.equal(reached.size,cells.length,"footprint connected by adjacent holes");
    for(const cell of cells) {
      assert.ok(cell.x>0&&cell.x<26&&cell.y>0&&cell.y<8,"clear outer border");
      const key=`${cell.x},${cell.y}`;assert.ok(!all.has(key),"areas never overlap");all.add(key);
      assert.equal(stationAt(cell,areas)?.id,area.id,"every footprint hole serves its neighborhood");
    }
  }
  assert.equal(all.size,124);
  assert.equal(25*7-all.size,51,"51 interior holes remain outside neighborhoods");
  const s=startPlaytest(count,seed).state;
  s.players["seat-1"].lines=[{contractId:"short",paid:0,route:[]}];
  for(const area of s.stations) for(const cell of area.cells!) {
    // A two-peg straight approach always exists on this 27-column board.
    const from={x:cell.x>=2?cell.x-2:cell.x+2,y:cell.y};
    s.players["seat-1"].lines[0].route=[from];
    assert.equal(validateNode(s,"seat-1",0,cell),null,"every area hole has a legal approach on an empty board");
    if (cell === area.cells![0]) assert.ok(legalTargets(s,"seat-1",0).some(t=>t.x===cell.x&&t.y===cell.y&&t.slot===undefined));
    assert.ok(surveyBlocker(s,"seat-1",cell),"surveys cannot occupy neighborhoods");
  }
  layouts.add(JSON.stringify(areas));
}
assert.ok(layouts.size>90,"identities, footprints and orientations vary across seeds");
for(const random of [()=>0,()=>0.999999]) assert.equal(randomStationLayout(random).length,10,"bounded deterministic layout even with constant randomness");

{
  const s=startPlaytest(2,2).state,p=s.players["seat-1"],q=s.players["seat-2"];
  const line=(route:PlayerLine["route"]):PlayerLine=>({contractId:"short",paid:0,route});
  p.lines=[line([{x:0,y:2},{x:4,y:2,stationId:"garden"}]),line([{x:6,y:3,stationId:"garden"},{x:10,y:3,stationId:"market"}])];
  const card=DESTINATION_CARDS.find(c=>c.stationIds.length===2&&c.stationIds.includes("garden")&&c.stationIds.includes("market"))!;
  assert.equal(destinationMet(p,card.id),true,"different holes in one area transfer across own lines");
  assert.equal(longestNetwork(p),8,"area transfer adds no imaginary length");
  const graph=companyNetwork(p);assert.equal(graph.get("0,2"),graph.get("station:market"));
  q.lines=[p.lines.pop()!];
  assert.equal(destinationMet(p,card.id),false,"opponent network cannot supply a transfer");
  p.lines=[line([{x:0,y:2},{x:10,y:2}])];
  assert.equal(destinationMet(p,card.id),false,"passing string through an area is not a visit");
  p.lines=[line([{x:0,y:2},{x:4,y:2,stationId:"garden"},{x:6,y:3,stationId:"garden"}])];
  const items=scoreGame(s,0).players[p.id].scoreBreakdown!;
  assert.equal(items.filter(i=>i.label==="Garden connection").length,1,"repeat nodes score area once");
  assert.equal(items.find(i=>i.label==="Garden connection")!.points,5,"small area now earns 5 VP");
  p.lines[0].route.push({x:12,y:3,stationId:"theatre"},{x:15,y:3,stationId:"grand"});
  const resized=scoreGame(s,0).players[p.id].scoreBreakdown!;
  assert.equal(resized.find(i=>i.label==="Theatre connection")!.points,3,"medium retains 3 VP");
  assert.equal(resized.find(i=>i.label==="Grand Central connection")!.points,2,"large now earns 2 VP");
  assert.deepEqual(nodePoint({x:4,y:2,stationId:"garden",stationSlot:2}),{x:4,y:2},"legacy slot never offsets geometry");
}
console.log("Neighborhood layouts (300 seat/seed cases), every-hole approaches, node-only service, transfers and unique scoring passed.");
