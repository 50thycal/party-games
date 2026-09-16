import assert from 'node:assert/strict';
import { publicStandings } from '../src/games/subway/publicStatus';
import { largestCluster } from '../src/games/subway/clusters';
import { subwayGame, scoreGame, validateNode, type PlayerLine } from '../src/games/subway/config';
import { testRoom } from '../src/games/subway/playtest';
import { botObservation, DEFAULT_BOT } from '../src/games/subway/bots';
import { plannedBotRoute, clearBotRouteCache, ROUTE_SEARCH_LIMIT, companyJobs, forecastBotBuild, missingJobStops } from '../src/games/subway/botRoutes';

const fixture=(n=4)=>subwayGame.initialState(testRoom(n).players);
const line=(nodes:number[][]):PlayerLine=>({contractId:'long',paid:0,start:1,route:nodes.map(([x,y])=>({x,y}))});
const s=fixture();
assert.deepEqual(largestCluster(s.players).leaders,[]);
for(let n=1;n<=4;n++) {
  const game=fixture();
  for(let i=0;i<n;i++) game.players[`seat-${i+1}`].lines=[line([[i,0]])];
  const r=largestCluster(game.players);
  assert.equal(r.size,n);assert.equal(r.leaders.length,n);
  for(let i=1;i<=n;i++) assert.equal(r.points[`seat-${i}`],n===4?0:6/n);
}
s.players['seat-1'].lines=[line([[0,0],[1,0]]),line([[0,0]])];
s.players['seat-2'].lines=[line([[1,0],[2,1]])];
s.players['seat-3'].lines=[line([[10,0],[11,0]])];
let r=largestCluster(s.players);
assert.equal(r.size,2);assert.equal(r.clusters.length,2);
assert.deepEqual(r.counts,{'seat-1':2,'seat-2':1,'seat-3':2,'seat-4':0});
assert.equal(r.points['seat-1'],3);assert.equal(r.points['seat-3'],3);
// The long string and diagonal gap do not make a physical cluster.
s.players['seat-4'].lines=[line([[20,0],[26,8]])];
assert.deepEqual(largestCluster(s.players),r);
const scored=scoreGame(s,1);
assert.equal(scored.players['seat-1'].scoreBreakdown?.find(i=>i.label.startsWith('Largest Transfer Station'))?.points,3);
assert.equal(scored.players['seat-4'].scoreBreakdown?.find(i=>i.label.startsWith('Largest Transfer Station'))?.points,0);

const game=fixture(2),id='seat-1';game.phase='CONSTRUCTION';game.currentPeriod=1;game.resolveQueue=[id];
game.players[id].lines=[line([[3,0]]),line([[13,0]]),line([[23,0]])];
game.players[id].engineeringHand=['north-south','citywide-coverage'];game.players[id].crewsHired=true;game.players[id].pendingActions=[0];
const before=JSON.stringify(game),observed=botObservation(game,id);
const first=plannedBotRoute(observed,id,0,false,DEFAULT_BOT);
assert.ok(first.target);assert.ok(first.expanded<=ROUTE_SEARCH_LIMIT);
assert.equal(validateNode(game,id,0,first.target!),null);
assert.deepEqual(plannedBotRoute(observed,id,0,false,DEFAULT_BOT),first);
clearBotRouteCache();assert.deepEqual(plannedBotRoute(observed,id,0,false,DEFAULT_BOT),first);
assert.equal(JSON.stringify(game),before,'search never mutates actual game');
game.players['seat-2'].engineeringHand=['opposite-corners'];game.destinationDeck=['dest-market-university'];
assert.deepEqual(plannedBotRoute(botObservation(game,id),id,0,false,DEFAULT_BOT),first,'hidden information cannot alter a plan');
game.players[id].money=-20;
const changed=plannedBotRoute(botObservation(game,id),id,0,false,DEFAULT_BOT);
clearBotRouteCache();assert.deepEqual(plannedBotRoute(botObservation(game,id),id,0,false,DEFAULT_BOT),changed,'changed cash is evaluated fresh');
assert.equal(companyJobs(game,id).length,3);
game.players[id].lines[1].route[0].stationId='market';
assert.deepEqual(missingJobStops(game.players[id],0,{destination:['market'],citywide:['market']}),['market'],'Citywide coverage must not erase disconnected Destination guidance');
assert.deepEqual(missingJobStops(game.players[id],0,{destination:[],citywide:['market']}),['market'],'disconnected Citywide service does not fulfill this component');
for(const change of ['board','ownership','profile','focus','round'] as const) {
  const state=structuredClone(game);
  if(change==='board') state.players['seat-2'].lines=[line([[7,0],[7,4]])];
  if(change==='ownership') state.players[id].engineeringHand=['opposite-corners'];
  if(change==='round') state.currentPeriod=9;
  const profile=change==='profile'?{...DEFAULT_BOT,personality:'cautious' as const}:DEFAULT_BOT;
  const focus=change==='focus'?'citywide-coverage':undefined;
  const warm=plannedBotRoute(botObservation(state,id),id,0,false,profile,focus);
  clearBotRouteCache();assert.deepEqual(plannedBotRoute(botObservation(state,id),id,0,false,profile,focus),warm,`${change} invalidates cached observations`);
  if(warm.target) assert.equal(validateNode(state,id,0,warm.target),null);
}
const finish=fixture(2);finish.players[id].lines=[0,1,2].map(i=>({contractId:'short',paid:5,start:1,route:Array.from({length:i===2?4:5},(_,x)=>({x,y:i}))}));
assert.equal(forecastBotBuild(finish,id,2,{x:4,y:2},false,true).firstCompletedPlayerId,id);
finish.firstCompletedPlayerId='seat-2';
assert.equal(forecastBotBuild(finish,id,2,{x:4,y:2},false,true).firstCompletedPlayerId,'seat-2');
console.log('Cluster rules, score ledger, bounded planner, cache determinism, privacy and mutation checks passed.');

// Shared standings and scorer use identical same-line/tied-largest semantics.
const display=fixture();display.players['seat-1'].lines=[line([[0,0],[1,0],[2,0]])];
display.players['seat-2'].lines=[line([[10,0],[11,0]])];display.players['seat-3'].lines=[line([[12,0]])];
assert.deepEqual(publicStandings(display).stationLeaders,largestCluster(display.players).leaders);
assert.deepEqual(publicStandings(display).stationCounts,largestCluster(display.players).counts);
assert.deepEqual(publicStandings(display).stationLeaders,['seat-1']);
// Forecast cash, opponent credits and receipts agree with real accepted placements.
for(const starter of [true,false]) {
 const f=fixture(2),who='seat-1'; f.stations=[];
 f.oddPriorityId=who; f.players[who].lines=[{...line(starter?[]:[[0,0]]),contractId:'short'}];
 f.players['seat-2'].lines=[line([[starter?1:2,1]])];
 f.phase=starter?'STARTER_PLACEMENT':'CONSTRUCTION';f.currentPeriod=1;f.resolveQueue=[who];
 f.players[who].crewsHired=true;f.players[who].pendingActions=[0];
 const pt=starter?{x:1,y:0}:{x:2,y:0};
 const original=JSON.stringify(f);
 const forecast=forecastBotBuild(f,who,0,pt,starter,true);
 const actual=subwayGame.reducer(f,{playerId:who,type:starter?'PLACE_STARTER':'BUILD',payload:{lineIndex:0,...pt}},{room:testRoom(2),playerId:who,now:()=>1,random:()=>.5});
 assert.notEqual(actual,f);
 for(const owner of [who,'seat-2']) assert.equal(forecast.players[owner].money,actual.players[owner].money);
 assert.deepEqual(forecast.players[who].stationAccess,actual.players[who].stationAccess??[]);
 assert.equal(forecast.players[who].tollsPaid,actual.players[who].tollsPaid);
 assert.equal(JSON.stringify(f),original);
}
