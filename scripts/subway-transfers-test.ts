import assert from "node:assert/strict";
import { DESTINATION_CARDS, STATIONS, engineeringById, destinationMet, objectiveProgress, objectiveMet, scoreGame, subwayGame, validateNode, stationAt, type RouteNode, type PlayerLine } from "../src/games/subway/config";
import { companyNetwork, longestNetwork, interchangeAt } from "../src/games/subway/network";
import { startPlaytest, testRoom } from "../src/games/subway/playtest";
const pt = (x:number,y:number,stationId?:string):RouteNode => ({x,y,stationId});
const line = (...route:RouteNode[]):PlayerLine => ({contractId:"short",paid:5,route});
const s=subwayGame.initialState(testRoom(2).players), p=s.players["seat-1"];
const progress=(id:string)=>objectiveProgress(id,p,[],s);

// Balanced, fixed, duplicate-free catalog and balanced private opening hands.
assert.equal(DESTINATION_CARDS.length,30);
for(const size of [2,3]) {
  const cards=DESTINATION_CARDS.filter(c=>c.stationIds.length===size);
  assert.equal(cards.length,15);
  assert.equal(new Set(cards.map(c=>[...c.stationIds].sort().join())).size,15);
  for(const st of STATIONS) {
    const n=cards.filter(c=>c.stationIds.includes(st.id)).length;
    assert.ok(size===2?n===3:n===4||n===5);
  }
}
for(const seats of [2,3,4]) for(let seed=0;seed<20;seed++) {
  const state=startPlaytest(seats,seed).state;
  const all=[...state.destinationDeck];
  for(const player of Object.values(state.players)) {
    assert.deepEqual(player.destinationHand.map(id=>DESTINATION_CARDS.find(c=>c.id===id)!.stationIds.length),[2,3]);
    all.push(...player.destinationHand);
  }
  assert.equal(new Set(all).size,30);assert.equal(all.length,30);
}

// Exact overlap/orthogonal proximity transfers; diagonal/area/opponent/crossing do not.
for(const [x,y,joins] of [[4,2,true],[5,2,true],[4,3,true],[5,3,false],[6,2,false]] as const) {
  p.lines=[line(pt(0,2),pt(4,2,"grand")),line(pt(x,y,"grand"),pt(x+4,y,"market"))];
  const graph=companyNetwork(p);
  assert.equal(graph.get("0,2")===graph.get(`${x+4},${y}`),joins);
  assert.equal(longestNetwork(p),joins?8:4,"transfers add zero length");
}
p.lines=[line(pt(0,0),pt(4,0),pt(4,3),pt(0,3),pt(0,1))];
assert.equal(longestNetwork(p),13,"adjacent nodes on the same line never create a shortcut or cycle");
p.lines=[line(pt(0,2),pt(8,2)),line(pt(4,0),pt(4,6))];
assert.equal(longestNetwork(p),8,"crossing strings do not join");
p.lines=[line(pt(0,2),pt(4,2)),line(pt(5,0),pt(5,2),pt(5,6))];
assert.equal(longestNetwork(p),8,"an adjacent transfer preserves branch trail limits");

// A neighborhood visited in two components must not merge those components.
const pair=DESTINATION_CARDS.find(c=>c.stationIds.join()==="market,grand")!;
p.lines=[line(pt(0,1),pt(3,1,"market")),line(pt(20,5,"market"),pt(24,5,"grand"))];
assert.equal(destinationMet(p,pair.id),true,"use any component serving all destinations, not the first visit");
p.lines[1].route[0].stationId="garden";
assert.equal(destinationMet(p,pair.id),false);
s.players["seat-2"].lines=[line(pt(3,1),pt(20,5))];
assert.equal(destinationMet(p,pair.id),false,"opponents cannot bridge");
p.lines[1].route[0]=pt(4,1,"garden");
assert.equal(destinationMet(p,pair.id),true,"adjacent own nodes bridge anywhere");

// Local hub is stricter than connection somewhere else in the company network.
p.lines=[line(pt(0,1),pt(8,3,"grand")),line(pt(0,1),pt(9,3,"grand")),line(pt(0,1),pt(10,3,"grand"))];
assert.equal(interchangeAt(p.lines,"grand"),true,"three-line adjacency chain qualifies");
p.lines[2].route[1]=pt(11,3,"grand");
assert.equal(interchangeAt(p.lines,"grand"),false,"outside shared starter does not satisfy local hub");
p.lines[2].route[1]=pt(9,4,"grand");
for(const seats of [2,3,4]) {
  s.playerOrder=Array.from({length:seats},(_,i)=>`seat-${i+1}`);
  assert.equal(progress("interchange").points,4);
}
p.lines.pop();assert.equal(progress("interchange").points,0);

// Citywide counts ten unique areas across even disconnected, unfinished lines.
p.lines=[line(...STATIONS.slice(0,4).map((st,i)=>pt(i,2,st.id))),line(...STATIONS.slice(4,7).map((st,i)=>pt(10+i,4,st.id))),line(...STATIONS.slice(7).map((st,i)=>pt(20+i,6,st.id)))];
assert.equal(progress("terminal").points,10);
p.lines[2].route[2].stationId="market";assert.equal(progress("terminal").points,0);

// Across Town tiers use exact borders, the same component and distinct side nodes.
p.lines=[line(pt(0,4),pt(12,4)),line(pt(13,4),pt(26,4))];
assert.equal(progress("crosstown-service").points,4);
p.lines.push(line(pt(3,0),pt(3,8)));assert.equal(progress("crosstown-service").points,4,"disconnected north/south does not upgrade");
p.lines[2]=line(pt(12,0),pt(12,3),pt(12,8));assert.equal(progress("crosstown-service").points,8);
assert.deepEqual(progress("crosstown-service").tiers,[4,8]);
p.lines[1].route[1].x=25;assert.equal(progress("crosstown-service").points,0);
p.lines=[line(pt(0,0),pt(26,8))];assert.equal(progress("crosstown-service").points,4,"two corners cannot stand for four different side nodes");

// Perimeter evaluates completed lines separately; starters alone never earn VP.
const threeSides=()=>line(pt(0,4),pt(3,2),pt(7,0),pt(12,3),pt(26,5));
for(let n=0;n<=3;n++) {
  p.lines=Array.from({length:n},threeSides);
  assert.equal(progress("perimeter").points,[0,2,5,8][n]);
  assert.deepEqual(progress("perimeter").tiers,[2,5,8]);
  assert.equal(objectiveMet("perimeter",p,[],s),n===3);
}
p.lines[2].route.pop();assert.equal(progress("perimeter").points,5,"Undo removes only one qualifying line");

// Corners: opposite pair then all four, connected, not merely visited.
p.lines=[line(pt(0,0),pt(12,4)),line(pt(13,4),pt(26,8))];
assert.equal(progress("four-corners").points,5);
p.lines.push(line(pt(26,0),pt(0,8)));assert.equal(progress("four-corners").points,5);
p.lines[2]=line(pt(26,0),pt(12,3),pt(0,8));assert.equal(progress("four-corners").points,10);
assert.deepEqual(progress("four-corners").tiers,[5,10]);
p.lines[2].route[0].x=25;assert.equal(progress("four-corners").points,5);
p.lines=[line(pt(0,0),pt(26,0))];assert.equal(progress("four-corners").points,0,"adjacent corners are not opposite");

// The exact live helper supplies the end score, with no neighborhood point entries.
p.lines=[threeSides(),threeSides(),threeSides()];
p.lines[0].route[1].stationId="market";
p.engineeringHand=["perimeter","terminal","crosstown-service","four-corners","local-service","interchange"];
const result=scoreGame(s,1).players[p.id];
for(const id of p.engineeringHand) assert.equal(result.scoreBreakdown!.find(i=>i.label===engineeringById(id)!.name)!.points,progress(id).points);
assert.ok(result.scoreBreakdown!.every(i=>!i.label.endsWith(" connection")));
console.log("Explicit transfers, 30-card balance/deals, component missions, revised objective tiers and scoring parity passed.");

// Legal 15-segment witness: all four corners through three distinct contracts.
// At most seven builds on any one line, so it fits inside nine rounds.
{
  const game=subwayGame.initialState(testRoom(2).players);game.stations=[];
  const player=game.players["seat-1"];
  const routes: [string,number[][]][]=[
    ["long",[[0,0],[4,0],[10,0],[13,0],[18,0],[19,2],[22,4],[26,0]]],
    ["short",[[0,0],[0,2],[2,4],[2,6],[0,8]]],
    ["tram",[[26,0],[26,2],[24,4],[26,8]]]
  ];
  for(const [contractId,nodes] of routes) {
    const current:PlayerLine={contractId,paid:0,route:[]};player.lines.push(current);
    for(const [x,y] of nodes) {
      const node=pt(x,y);
      assert.equal(validateNode(game,player.id,player.lines.length-1,node,current.route.length===0),null);
      current.route.push(node);
    }
  }
  assert.equal(objectiveProgress("four-corners",player,[],game).points,10);
}

{
  const game=startPlaytest(2,2).state, player=game.players["seat-1"];
  const routes = [{"contractId": "long", "paid": 0, "route": [{"x": 18, "y": 0}, {"x": 22, "y": 1, "stationId": "stadium"}, {"x": 21, "y": 7, "stationId": "grand"}, {"x": 18, "y": 8}, {"x": 13, "y": 6, "stationId": "harbor"}, {"x": 11, "y": 5, "stationId": "harbor"}, {"x": 8, "y": 2, "stationId": "market"}, {"x": 2, "y": 0}]}, {"contractId": "medium", "paid": 0, "route": [{"x": 22, "y": 0}, {"x": 19, "y": 1, "stationId": "theatre"}, {"x": 14, "y": 3, "stationId": "museum"}, {"x": 14, "y": 5}, {"x": 17, "y": 7, "stationId": "library"}, {"x": 19, "y": 5, "stationId": "grand"}, {"x": 24, "y": 5}]}, {"contractId": "crosstown", "paid": 0, "route": [{"x": 10, "y": 8}, {"x": 13, "y": 4, "stationId": "harbor"}, {"x": 11, "y": 2, "stationId": "garden"}, {"x": 7, "y": 4, "stationId": "airport"}, {"x": 5, "y": 3}, {"x": 1, "y": 6, "stationId": "university"}]}];
  player.lines=routes.map(l=>({...l,route:[]}));
  for(let step=0;step<8;step++) for(let i=0;i<routes.length;i++) {
    const node=routes[i].route[step]; if(!node) continue;
    assert.equal(validateNode(game,player.id,i,node,step===0),null);
    assert.equal(stationAt(node,game.stations)?.id,node.stationId);
    player.lines[i].route.push(node);
  }
  assert.equal(objectiveProgress("terminal",player,[],game).points,10);
  console.log("Legal recipe witnesses achieve Citywide Service and all four corners within seven builds per line.");
}
