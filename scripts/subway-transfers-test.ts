import assert from "node:assert/strict";
import { DESTINATION_CARDS, randomStationLayout, STATIONS, engineeringById, destinationMet, objectiveProgress, objectiveMet, scoreGame, subwayGame, validateNode, stationAt, type RouteNode, type PlayerLine } from "../src/games/subway/config";
import { companyNetwork, longestNetwork, interchangeAt } from "../src/games/subway/network";
import { startPlaytest, seededRandom, testRoom } from "../src/games/subway/playtest";
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
// Legal 15-segment witness: all four corners through three distinct contracts.
// At most seven builds on any one line, so it fits inside nine rounds.
{
  const game=subwayGame.initialState(testRoom(2).players);game.stations=[];
  const player=game.players["seat-1"];
  const routes: [string,number[][]][]=[
    ["long",[[0,0],[4,0],[10,0],[13,0],[18,0],[19,2],[22,4],[26,0]]],
    ["short",[[1,0],[0,2],[2,4],[2,6],[0,8]]],
    ["tram",[[26,0],[26,2],[24,4],[26,8]]]
  ];
  player.lines=routes.map(([contractId])=>({contractId,paid:0,route:[]}));
  // All distinct starters precede construction, as they do in a real game.
  for(let step=0;step<8;step++) for(const [i,[,nodes]] of Array.from(routes.entries())) {
    if (nodes[step]) {
      const [x,y]=nodes[step], current=player.lines[i];
      const node=pt(x,y);
      assert.equal(validateNode(game,player.id,i,node,step===0),null);
      current.route.push(node);
    }
  }
  assert.equal(objectiveProgress("opposite-corners",player,[],game).points,6);
}

{
  const game=startPlaytest(2,2).state, player=game.players["seat-1"];
  // Preserve this legal recipe witness on its original v21 layout. Deck growth
  // consumes five more random draws before layout creation in new games.
  const random=seededRandom(2);for(let i=0;i<15;i++)random();game.stations=randomStationLayout(random);
  const routes = [{"contractId": "long", "paid": 0, "route": [{"x": 18, "y": 0}, {"x": 22, "y": 1, "stationId": "stadium"}, {"x": 21, "y": 7, "stationId": "grand"}, {"x": 18, "y": 8}, {"x": 13, "y": 6, "stationId": "harbor"}, {"x": 11, "y": 5, "stationId": "harbor"}, {"x": 8, "y": 2, "stationId": "market"}, {"x": 2, "y": 0}]}, {"contractId": "medium", "paid": 0, "route": [{"x": 22, "y": 0}, {"x": 19, "y": 1, "stationId": "theatre"}, {"x": 14, "y": 3, "stationId": "museum"}, {"x": 14, "y": 5}, {"x": 17, "y": 7, "stationId": "library"}, {"x": 19, "y": 5, "stationId": "grand"}, {"x": 24, "y": 5}]}, {"contractId": "crosstown", "paid": 0, "route": [{"x": 10, "y": 8}, {"x": 13, "y": 4, "stationId": "harbor"}, {"x": 11, "y": 2, "stationId": "garden"}, {"x": 7, "y": 4, "stationId": "airport"}, {"x": 5, "y": 3}, {"x": 1, "y": 6, "stationId": "university"}]}];
  player.lines=routes.map(l=>({...l,route:[]}));
  for(let step=0;step<8;step++) for(let i=0;i<routes.length;i++) {
    const node=routes[i].route[step]; if(!node) continue;
    assert.equal(validateNode(game,player.id,i,node,step===0),null);
    assert.equal(stationAt(node,game.stations)?.id,node.stationId);
    player.lines[i].route.push(node);
  }
  assert.equal(objectiveProgress("citywide-coverage",player,[],game).points,0, "old company-wide witness cannot satisfy the new connected requirement");
  console.log("Legal recipe witnesses preserve opposite-corner success and reject disconnected Citywide Coverage.");
}
