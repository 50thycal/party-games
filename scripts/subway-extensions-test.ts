import assert from 'node:assert/strict';
import { subwayGame, LINE_CONTRACTS, STATIONS, buildableLines, legalTargets, nextCompanyId, pendingStarters, constructionExhausted, contractOf, extensionCount, extensionEligible, segmentsBuilt, recipeEndpoint, lineComplete, longestNetwork, destinationMet, DESTINATION_CARDS, type SubwayState, type SubwayAction } from '../src/games/subway/config';
import { validatePath, findBendMove } from '../src/games/subway/bends';
import { engineeringMet } from '../src/games/subway/engineering';
import { testRoom, seededRandom } from '../src/games/subway/playtest';
import { chooseBotAction } from '../src/games/subway/bots';
import { newRecord, recordedReducer, replayRecord, fingerprint } from '../src/games/subway/recording';
import { companionView, companionAction, companionTurn, type CompanionDevice } from '../src/games/subway/companion';
import type { RoomState } from '../src/engine/types';
const room=testRoom(2),id=room.players[0].id,other=room.players[1].id;
const ctx={room,playerId:id,now:()=>1,random:seededRandom(73)};
const send=(s:SubwayState,type:SubwayAction['type'],payload?:SubwayAction['payload'],playerId=id)=>subwayGame.reducer(s,{type,playerId,payload},{...ctx,playerId});
function fixture():SubwayState {
 const s=subwayGame.initialState(room.players);s.phase='CONSTRUCTION';s.currentPeriod=6;s.resolveQueue=[id,other];s.stations=[];
 s.players[id].lines=LINE_CONTRACTS.slice(0,3).map((c,i)=>{let x=0;return {contractId:c.id,paid:c.cost,route:[{x,y:i*3},...c.recipe.map(n=>({x:x+=n,y:i*3}))]};});
 s.players[id].money=0;s.players[id].crewsHired=false;s.players[id].pendingActions=[];
 return s;
}
let s=fixture();assert.ok(extensionEligible(s.players[id]));assert.ok(!constructionExhausted(s));assert.deepEqual(buildableLines(s,id),[0,1,2]);
const original=structuredClone(s.players[id].lines[0]);const end=original.route.at(-1)!;const target={x:end.x,y:1};
assert.equal(validatePath(s,id,0,[target]),null);assert.ok(validatePath(s,id,0,[{x:end.x,y:3}]));assert.ok(validatePath(s,id,0,[original.route[0]]));assert.ok(validatePath(s,id,0,[{x:end.x-1,y:1}]));
assert.equal(send(s,'HIRE_CREWS',{lineIndexes:[0,1],period:6}),s,'one extension per turn');
assert.equal(send(s,'HIRE_CREWS',{lineIndexes:[0],period:5}),s,'stale period rejected');
assert.equal(send(s,'HIRE_CREWS',{lineIndexes:[0],period:6},other),s,'out of turn');
let partial=structuredClone(s);partial.players[id].lines[2].route.pop();assert.ok(!extensionEligible(partial.players[id]));assert.ok(!buildableLines(partial,id).includes(0));
s=send(s,'HIRE_CREWS',{lineIndexes:[0],period:6});assert.equal(s.players[id].money,0,'preview selection is free');assert.ok(s.players[id].extending);
const action={lineIndex:0,...target,period:6,expectedNodes:original.route.length};
assert.equal(send(s,'BUILD',{...action,period:5}),s);assert.equal(send(s,'BUILD',{...action,expectedNodes:0}),s);assert.equal(send(s,'BUILD',{...action,y:4}),s);assert.equal(send(s,'BUY_ENGINEERING',{period:6}),s,'card buy closes when action is selected');
const built=send(s,'BUILD',action);assert.notEqual(built,s);assert.equal(built.players[id].money,-1,'borrowing: exactly $1M, no completion bonus');assert.equal(built.players[id].crewPaid??0,0,'no second crew fee');assert.equal(extensionCount(built.players[id].lines[0]),1);assert.equal(segmentsBuilt(built.players[id].lines[0]),contractOf(original)!.recipe.length);assert.deepEqual(recipeEndpoint(built.players[id].lines[0]),end);assert.ok(lineComplete(built.players[id].lines[0]));assert.ok(engineeringMet('return-service',built.players[id],[]));assert.ok(longestNetwork({...built.players[id],lines:[built.players[id].lines[0]]})>longestNetwork({...s.players[id],lines:[s.players[id].lines[0]]}));assert.equal(send(built,'BUILD',action),built,'duplicate cannot build or charge');assert.equal(built.resolveQueue[0],other);
const undone=send(built,'UNDO_PLACEMENT');assert.deepEqual(undone.players[id].lines,s.players[id].lines);assert.equal(undone.players[id].money,0);assert.deepEqual(undone.resolveQueue,s.resolveQueue);assert.ok(undone.players[id].extending);assert.equal(send(undone,'BUILD',action).players[id].money,-1);
const skipped=send(fixture(),'HIRE_CREWS',{lineIndexes:[],period:6});assert.equal(skipped.players[id].money,0,'no passive income for skip');assert.equal(skipped.resolveQueue[0],other);
// The third recipe's last build never unlocks a second action in the same turn.
let completing=fixture();const last=completing.players[id].lines[2].route.pop()!;completing.players[id].crewsHired=true;completing.players[id].pendingActions=[2];
completing=send(completing,'BUILD',{lineIndex:2,...last});assert.ok(extensionEligible(completing.players[id]));assert.equal(completing.resolveQueue[0],other);
assert.equal(send(completing,'HIRE_CREWS',{lineIndexes:[0],period:6}),completing);assert.equal(send(completing,'BUILD',action),completing);
completing=send(completing,'HIRE_CREWS',{lineIndexes:[],period:6},other);assert.equal(completing.currentPeriod,7);
const nextTurn=send(completing,'HIRE_CREWS',{lineIndexes:[0],period:7});assert.ok(nextTurn.players[id].extending);
// Crossing a competitor pays the ordinary toll in addition to the extension.
let cross=fixture();cross.players[other].lines=[{contractId:LINE_CONTRACTS[3].id,paid:0,route:[{x:end.x-1,y:1},{x:end.x+1,y:1}]}];const otherCash=cross.players[other].money;cross=send(cross,'HIRE_CREWS',{lineIndexes:[0],period:6});cross=send(cross,'BUILD',{...action,y:2});assert.equal(cross.players[id].money,-2);assert.equal(cross.players[other].money,otherCash+1);assert.equal(send(cross,'UNDO_PLACEMENT').players[other].money,otherCash);
// Destination cash remains paid once, including extensions and Undo.
let dest=fixture();const card=DESTINATION_CARDS.find(c=>c.stationIds.length===2)!;dest.players[id].destinationHand=[card.id];dest.players[id].lines[0].route[0].stationId=card.stationIds[0];dest.stations=[{...STATIONS.find(a=>a.id===card.stationIds[1])!,...target,cells:[target]}];dest=send(dest,'HIRE_CREWS',{lineIndexes:[0],period:6});const paid=send(dest,'BUILD',action);assert.ok(destinationMet(paid.players[id],card.id));assert.equal(paid.players[id].money,1);assert.deepEqual(paid.players[id].destinationsPaid,[card.id]);const reversed=send(paid,'UNDO_PLACEMENT');assert.equal(reversed.players[id].money,0);assert.deepEqual(reversed.players[id].destinationsPaid??[],[]);assert.equal(send(reversed,'BUILD',action).players[id].money,1);
// Companion projection/reconnect and revision guards use the same authoritative path.
const tablet:CompanionDevice={role:'tablet',playerId:'tablet',tokenHash:'test-tablet',requests:[]};const phone:CompanionDevice={role:'phone',playerId:id,tokenHash:'test-phone',requests:[]};
let state:RoomState={room:{...room,mode:'multiplayer',hostId:'tablet'},gameState:s,subwayCompanion:{version:1,revision:0,devices:[tablet,phone],plans:{},seated:{playerId:id,turn:companionTurn(s)}}};
assert.ok(companionView(state,phone).game!.players[id].extending);
const input={type:'BUILD',payload:action,revision:0,requestId:'extension-1'};
assert.throws(()=>companionAction(state,phone,input,ctx));state=companionAction(state,tablet,input,ctx);assert.equal((state.gameState as SubwayState).players[id].money,-1);assert.equal(companionAction(state,state.subwayCompanion!.devices[0],input,ctx),state);assert.equal(companionView(JSON.parse(JSON.stringify(state)),phone).game!.players[id].lines[0].route.length,original.route.length+1);
// Completed companies remain actionable on the final round, then scoring starts.
let final=fixture();final.currentPeriod=9;final.resolveQueue=[id];final=send(final,'HIRE_CREWS',{lineIndexes:[0],period:9});final=send(final,'BUILD',{...action,period:9});assert.equal(final.phase,'SCORING');assert.equal(final.currentPeriod,9);
// Full real-action drafts and games, including deterministic replay of every extension.
let extensions=0;
for(const count of [2,3,4]) {
 const r=testRoom(count),random=seededRandom(700+count);let game=subwayGame.initialState(r.players);const record=newRecord(r,game,'bots');let ticks=0;
 const act=(a:SubwayAction)=>{const next=recordedReducer(game,a,{room:r,playerId:a.playerId,now:()=>++ticks,random},record,'bot');assert.notEqual(next,game,`accepted ${a.type}`);game=next;};
 act({type:'START_GAME',playerId:r.hostId,payload:{segmentLengthMode:'flexible',bendMode:'straight'}});
 for(let n=0;n<400&&game.phase!=='RESULTS';n++) {
  const actor=nextCompanyId(game)!,p=game.players[actor];let a:SubwayAction;
  if(game.phase==='STARTER_PLACEMENT') {
   const lineIndex=pendingStarters(p)[0],x=game.playerOrder.indexOf(actor)*6+lineIndex*2;
   assert.ok(legalTargets(game,actor,lineIndex,true).some(t=>t.x===x&&t.y===0));a={type:'PLACE_STARTER',playerId:actor,payload:{lineIndex,x,y:0}};
  } else if(game.phase==='CONSTRUCTION'&&!extensionEligible(p)) {
   if(!p.crewsHired)a={type:'HIRE_CREWS',playerId:actor,payload:{lineIndexes:buildableLines(game,actor),period:game.currentPeriod}};
   else {const lineIndex=p.pendingActions[0],tip=p.lines[lineIndex].route.at(-1)!;assert.ok(legalTargets(game,actor,lineIndex).some(t=>t.x===tip.x&&t.y===tip.y+1));a={type:'BUILD',playerId:actor,payload:{lineIndex,x:tip.x,y:tip.y+1}};}
  } else a=chooseBotAction(game,random,undefined,undefined,false)!;
  if(a.type==='BUILD'&&p.extending)extensions++;act(a);
 }
 assert.equal(game.phase,'RESULTS');assert.ok(Object.values(game.players).every(p=>p.lines.length===3));record.final=game;assert.equal(fingerprint(replayRecord(record)),fingerprint(game));
}
assert.ok(extensions>0,'complete simulations actually build extensions');
assert.ok(findBendMove(fixture(),id,0));
console.log(`Paid extensions: legality, borrowing, tolls, destination/Undo, companions, cap and 2/3/4-player replay pass (${extensions} extensions).`);
