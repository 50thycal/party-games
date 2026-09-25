import assert from 'node:assert/strict';
import {subwayGame, type SubwayState, type SubwayAction, lineComplete, segmentsBuilt, routeContacts, validateNode, hasLegalMove, longestNetwork, objectiveMet} from '../src/games/subway/config';
import {validatePath, findBendMove, remainingLength, pathContacts} from '../src/games/subway/bends';
import {reconcilePlan} from '../src/games/subway/plans';
import {lineLegs} from '../src/games/subway/paths';
import {largestCluster} from '../src/games/subway/clusters';
import {testRoom,seededRandom} from '../src/games/subway/playtest';
import {chooseBotAction,DEFAULT_BOT} from '../src/games/subway/bots';
import {newRecord,recordedReducer,replayRecord,fingerprint} from '../src/games/subway/recording';
const id='seat-1',other='seat-2',room=testRoom(2);
const act=(s:SubwayState,type:SubwayAction['type'],payload:SubwayAction['payload']={})=>subwayGame.reducer(s,{type,playerId:id,payload},{room,playerId:id,now:()=>1,random:()=>.5});
const base=(mode:SubwayState['bendMode']='tokens')=>{
 const s=subwayGame.initialState(room.players);s.bendMode=mode;s.phase='CONSTRUCTION';s.stations=[];s.currentPeriod=1;s.resolveQueue=[id,other];s.oddPriorityId=id;
 s.players[id].crewsHired=true;s.players[id].pendingActions=[0,1];s.players[id].bendTokens=3;
 s.players[id].lines=[{contractId:'short',paid:5,route:[{x:0,y:0}]},{contractId:'branch',paid:6,route:[{x:15,y:0}]}];
 s.players[other].lines=[{contractId:'long',paid:8,route:[{x:25,y:8}]}];return s;
};
for(const mode of ['straight','tokens','delayed'] as const){
 const start=subwayGame.reducer(subwayGame.initialState(room.players),{type:'START_GAME',playerId:room.hostId,payload:{bendMode:mode}},{room,playerId:room.hostId,now:()=>1,random:()=>.4});
 assert.equal(start.bendMode,mode);assert.equal(start.players[id].bendTokens,mode==='tokens'?3:0);
 assert.equal(subwayGame.reducer(start,{type:'START_GAME',playerId:room.hostId,payload:{bendMode:'straight'}},{room,playerId:room.hostId,now:()=>1,random:()=>.4}),start);
 assert.equal(JSON.parse(JSON.stringify(start)).bendMode,mode);
}
{
 const s=base(),payload={lineIndex:0,x:1,y:1,bends:[{x:1,y:0}]};
 const b=act(s,'BUILD',payload);assert.notEqual(b,s);assert.equal(b.players[id].bendTokens,2);
 assert.equal(segmentsBuilt(b.players[id].lines[0]),1);assert.equal(b.players[id].lines[0].route.length,2);
 assert.equal(longestNetwork(b.players[id]),2);assert.equal(lineLegs(b.players[id].lines[0]).length,2);
 assert.equal(b.players[id].lines[0].route[1].stationId,undefined);
 assert.equal(largestCluster(b.players).size,1,'bend is not occupied peg');
 const u=act(b,'UNDO_PLACEMENT');assert.deepEqual(u.players[id],s.players[id]);
 const straight=base('straight');assert.equal(act(straight,'BUILD',payload),straight);
 assert.match(validatePath(s,id,0,[{x:1,y:0},{x:0,y:1}])!,/90/);
 assert.match(validatePath(s,id,0,[{x:2,y:0},{x:2,y:2}])!,/total/);
 for(const bends of [null,{},[{x:NaN,y:0}],[{x:Infinity,y:0}],[null],Array(9).fill({x:1,y:0})])assert.equal(act(s,'BUILD',{...payload,bends} as never),s);
}
{
 const s=base();s.players[id].bendTokens=0;s.players[id].money=3;
 const b=act(s,'BUILD',{lineIndex:0,x:1,y:1,bends:[{x:1,y:0}]});assert.equal(b.players[id].money,0);assert.equal(b.players[id].bendTokens,0);
 assert.equal(b.moneyEvents?.[0].payments[0].reason,'Bend tokens');assert.equal(act(b,'UNDO_PLACEMENT').players[id].money,3);
 s.players[id].money=2;assert.equal(act(s,'BUILD',{lineIndex:0,x:1,y:1,bends:[{x:1,y:0}]}),s);
}
{
 const s=base();s.players[id].lines[0].contractId='medium';
 const b=act(s,'BUILD',{lineIndex:0,x:2,y:1,bends:[{x:1,y:0},{x:1,y:1}]});
 assert.equal(b,s,'two token bends on one segment are rejected');
}
{
 const s=base('delayed');s.players[id].money=10;
 let b=act(s,'BUILD',{lineIndex:0,x:1,y:0,pause:true});assert.notEqual(b,s);
 assert.equal(b.players[id].lines[0].route.length,1);assert.equal(longestNetwork(b.players[id]),0);
 assert.deepEqual(b.players[id].pendingActions,[1]);assert.equal(b.resolveQueue[0],id,'other hired line still acts');
 assert.equal(remainingLength(b,id,0),1);assert.equal(act(b,'BUILD',{lineIndex:0,x:1,y:1}),b,'cannot act twice');
 assert.deepEqual(act(b,'UNDO_PLACEMENT').players[id],s.players[id]);
 b=JSON.parse(JSON.stringify(b));b.players[id].pendingActions=[0];b.currentPeriod=2;
 const done=act(b,'BUILD',{lineIndex:0,x:1,y:1});assert.equal(done.players[id].lines[0].work,undefined);
 assert.deepEqual(done.players[id].lines[0].route[1].via,[{x:1,y:0}]);assert.equal(longestNetwork(done.players[id]),2);
 assert.equal(reconcilePlan(b,id,0,done.players[id].lines[0].route).stale,false,'saved continuation does not duplicate work');
 // Another company can occupy unbuilt space; the next leg is revalidated.
 b.players[other].lines[0].route.push({x:1,y:1});assert.equal(act(b,'BUILD',{lineIndex:0,x:1,y:1}),b);
 assert.match(validateNode(b,id,0,{x:1,y:1})!,/occupied/);
}
{
 const s=base('delayed');s.players[id].lines[0].contractId='medium';
 let b=act(s,'BUILD',{lineIndex:0,x:1,y:0,pause:true});b.players[id].pendingActions=[0];
 assert.equal(act(b,'BUILD',{lineIndex:0,x:1,y:1,pause:true}),b,'a second delayed bend is rejected');
 b=act(b,'BUILD',{lineIndex:0,x:1,y:2});assert.equal(segmentsBuilt(b.players[id].lines[0]),1);assert.equal(longestNetwork(b.players[id]),3);
}
{
 const s=base();s.players[other].lines[0].route=[{x:1,y:2},{x:3,y:1,via:[{x:1,y:0}]}];
 assert.equal(routeContacts(s,id,{x:0,y:0},{x:1,y:0},0).filter(c=>c.kind!=='station').length,1,'arrive at bend vertex costs');
 assert.equal(routeContacts(s,id,{x:0,y:0},{x:2,y:0},0).filter(c=>c.kind!=='station').length,1,'pass through bend costs once');
 s.players[other].lines[0].route=[{x:1,y:2}];s.players[other].lines[0].work=[{x:1,y:0}];
 assert.equal(routeContacts(s,id,{x:0,y:0},{x:2,y:0},0).filter(c=>c.kind!=='station').length,1,'worksite contact costs');
 assert.match(validatePath(s,id,0,[{x:1,y:0},{x:1,y:1}])!,/existing string/);
}
{
 const s=base();s.players[id].lines[0].contractId='branch';
 s.players[other].lines[0].route=[{x:1,y:1},{x:3,y:1}];
 const path=[{x:2,y:0},{x:2,y:2}];assert.equal(validatePath(s,id,0,path),null);
 assert.equal(pathContacts(s,id,0,path).filter(c=>c.kind!=='station').length,1,'actual bent leg crosses; chord would touch differently');
 const b=act(s,'BUILD',{lineIndex:0,x:2,y:2,bends:[path[0]]});assert.equal(b.players[other].money,s.players[other].money+1,'actual bent leg contact is charged');
}
for(const mode of ['tokens','delayed'] as const) {
 const s=base(mode),t=performance.now();assert.ok(findBendMove(s,id,0));assert.equal(hasLegalMove(s,id,0),true);
 assert.ok(performance.now()-t<3000,'ordinary move discovery stays bounded in practice');
}
// Fully boxed in: no legal first leg, including bent paths; discovery terminates.
{
 const s=base();s.players[id].lines[0].contractId='long';
 s.players[id].lines[0].route=[{x:0,y:0}];
 s.players[other].lines[0].route=[];
 for(let y=0;y<9;y++)for(let x=0;x<27;x++)if(x||y)s.players[other].lines[0].route.push({x,y});
 const t=performance.now();assert.equal(findBendMove(s,id,0),undefined);
 assert.ok(performance.now()-t<3000,'blocked board discovery is bounded');
}
// A bend inside a neighborhood is not a served peg or transfer station.
{
 const s=base();s.stations=[{id:'bend-only',name:'Bend Only',kind:'minor',x:1,y:0,cells:[{x:1,y:0}]}];
 const b=act(s,'BUILD',{lineIndex:0,x:1,y:1,bends:[{x:1,y:0}]});
 assert.equal(b.players[id].lines[0].route.some(n=>n.stationId==='bend-only'),false);
 assert.equal(largestCluster(b.players).size,1);
}
// Completion pays once, only after the unfinished final segment reaches a peg.
{
 const s=base('delayed');s.players[id].lines[0].route=[{x:0,y:7},{x:0,y:5},{x:0,y:2},{x:0,y:0}];
 const cash=s.players[id].money;
 const partial=act(s,'BUILD',{lineIndex:0,x:1,y:0,pause:true});
 assert.equal(partial.players[id].money,cash);assert.equal(lineComplete(partial.players[id].lines[0]),false);
 assert.equal(longestNetwork(partial.players[id]),7);
 partial.players[id].pendingActions=[0];partial.currentPeriod++;
 const finished=act(partial,'BUILD',{lineIndex:0,x:1,y:2});
 assert.equal(lineComplete(finished.players[id].lines[0]),true);assert.equal(finished.players[id].money,cash+3);
 assert.equal(longestNetwork(finished.players[id]),10);
 assert.deepEqual(act(finished,'UNDO_PLACEMENT').players[id],partial.players[id]);
}
// Each experiment completes/replays a full game under the real reducer.
for(const mode of ['tokens','delayed'] as const)for(const count of [2,3,4]){
 const r=testRoom(count),random=seededRandom(310+count),record=newRecord(r,subwayGame.initialState(r.players),'simulation');let s=record.initial;
 const step=(action:SubwayAction)=>{const next=recordedReducer(s,action,{room:r,playerId:action.playerId,random,now:()=>record.actions.length+1},record,'bot');assert.notEqual(next,s);s=next;};
 step({type:'START_GAME',playerId:r.hostId,payload:{bendMode:mode}});
 for(let n=0;s.phase!=='RESULTS'&&n<350;n++){const a=chooseBotAction(s,random,DEFAULT_BOT)!;if(a.type==='ADVANCE_SCORING')a.playerId=r.hostId;step(a);}
 assert.equal(s.phase,'RESULTS');record.final=s;assert.equal(fingerprint(replayRecord(record)),fingerprint(s));
 console.log(`Bend mode ${mode}: ${count} players completed and replayed`);
}
console.log('Bend modes: setup, paths, tokens, delayed work, contacts, scoring and Undo passed.');

// Legacy YMIF shortening: rooms started before DEC-063 keep flexible validation;
// new games can only start with exact lengths.
for(const mode of ['straight','tokens','delayed'] as const) {
 const s=base(mode);s.segmentLengthMode='flexible';
 assert.equal(validatePath(s,id,0,[{x:1,y:0}]),null);
 assert.notEqual(act(s,'BUILD',{lineIndex:0,x:1,y:0}),s);
 assert.match(validatePath(s,id,0,[{x:3,y:0}])!,/total/);
 const exact=base(mode);assert.match(validatePath(exact,id,0,[{x:1,y:0}])!,/total/);
}
{
 const s=base('tokens');s.segmentLengthMode='flexible';
 assert.equal(validatePath(s,id,0,[{x:1,y:0},{x:1,y:1}]),null);
 assert.match(validatePath(s,id,0,[{x:2,y:0},{x:2,y:1}])!,/total/);
 const delayed=base('delayed');delayed.segmentLengthMode='flexible';
 const work=act(delayed,'BUILD',{lineIndex:0,x:1,y:0,pause:true});
 work.players[id].pendingActions=[0];
 assert.match(validatePath(work,id,0,[{x:1,y:2}])!,/total/);
 assert.equal(validatePath(work,id,0,[{x:1,y:1}]),null);
 const initial=subwayGame.initialState(room.players),ctx={room,playerId:room.hostId,now:()=>1,random:()=>.4};
 assert.equal(subwayGame.reducer(initial,{type:'START_GAME',playerId:room.hostId,payload:{segmentLengthMode:'flexible'}},ctx),initial,'flexible length is retired for new games');
 const start=subwayGame.reducer(initial,{type:'START_GAME',playerId:room.hostId,payload:{}},ctx);
 assert.equal(JSON.parse(JSON.stringify(start)).segmentLengthMode,'exact');
 assert.equal(subwayGame.reducer(initial,{type:'START_GAME',playerId:room.hostId,payload:{segmentLengthMode:'invalid'} as never},ctx),initial);
}
console.log('Exact-only new games, legacy flexible length and shared bend budget checks passed.');
