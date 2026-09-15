import assert from 'node:assert/strict';
import { subwayGame, routeContacts, validateNode, legalTargets, type SubwayState, type SubwayAction, type PlayerLine } from '../src/games/subway/config';
import { stationAccessContacts } from '../src/games/subway/stationAccess';
import { publicStandings, moneyChanges } from '../src/games/subway/publicStatus';
import { testRoom } from '../src/games/subway/playtest';
const line=(route:PlayerLine['route'],contractId='short'):PlayerLine=>({route,contractId,paid:0,start:1});
const base=()=>{const s=subwayGame.initialState(testRoom(3).players);s.stations=[];s.phase='CONSTRUCTION';s.resolveQueue=[...s.playerOrder];s.currentPeriod=1;s.players['seat-1'].crewsHired=true;s.players['seat-1'].pendingActions=[0];return s;};
const act=(s:SubwayState,type:SubwayAction['type'],payload:SubwayAction['payload'],id='seat-1')=>subwayGame.reducer(s,{type,payload,playerId:id},{room:testRoom(3),playerId:id,now:()=>1,random:()=>.5});
const access=(s:SubwayState,x:number,y:number,index=0)=>stationAccessContacts(s,'seat-1',index,{x,y});
{
 const s=base();s.players['seat-1'].lines=[line([{x:0,y:2}])];s.players['seat-2'].lines=[line([{x:2,y:3},{x:4,y:3}],'branch')];
 const before=structuredClone(s),contacts=routeContacts(s,'seat-1',{x:0,y:2},{x:2,y:2},0);
 assert.deepEqual(s,before);assert.equal(contacts.length,1);assert.equal(contacts[0].kind,'station');
 let b=act(s,'BUILD',{lineIndex:0,x:2,y:2});assert.equal(b.players['seat-1'].money,s.players['seat-1'].money-1);assert.equal(b.players['seat-2'].money,s.players['seat-2'].money+1);
 assert.equal(b.players['seat-1'].stationAccess?.length,1);assert.equal(b.moneyEvents?.length,1);
 // Remote station on same opponent is another charge.
 assert.equal(access(b,4,2).length,1);
 // Grow the first station into the remote one; paid anchors survive the merge.
 b.players['seat-3'].lines=[line([{x:3,y:3}],'medium')];
 assert.equal(access(b,4,2).filter(c=>c.ownerId==='seat-2').length,0);
 // New line at that station pays, even though another own line already paid.
 b.players['seat-1'].lines.push(line([{x:0,y:1}],'tram'));
 assert.equal(access(b,2,4,1).filter(c=>c.ownerId==='seat-2').length,1);
 const u=act(act(s,'BUILD',{lineIndex:0,x:2,y:2}),'UNDO_PLACEMENT',{});
 assert.equal(u.players['seat-1'].money,s.players['seat-1'].money);assert.deepEqual(u.players['seat-1'].stationAccess,s.players['seat-1'].stationAccess);
 assert.equal(u.moneyEvents?.at(-1)?.reversed,true);assert.deepEqual(moneyChanges(u.moneyEvents!.at(-1)!).map(c=>c.amount),[1,-1]);
 assert.equal(access(u,2,2).length,1,'undone access must be bought again');
}
{
 const s=base();s.players['seat-1'].lines=[line([{x:0,y:2}])];s.players['seat-2'].lines=[line([{x:2,y:3}],'branch'),line([{x:3,y:3}],'medium')];
 assert.equal(access(s,2,2).length,1,'several opponent pegs in one station, one charge');
 s.players['seat-3'].lines=[line([{x:3,y:2}],'tram')];assert.equal(access(s,2,2).length,2,'each opponent is a recipient');
 const b=act(s,'BUILD',{lineIndex:0,x:2,y:2});
 // Even previously paid station access never waives geometric crossing fees.
 b.players['seat-2'].lines.push(line([{x:3,y:0},{x:3,y:4}],'river'));
 assert.ok(routeContacts(b,'seat-1',{x:2,y:2},{x:5,y:2},0).some(c=>c.kind==='crossing'&&c.ownerId==='seat-2'));
}
{
 const s=base();s.players['seat-1'].lines=[line([{x:0,y:2}]),line([{x:2,y:2}],'tram')];
 assert.match(validateNode(s,'seat-1',0,{x:2,y:2})!,/occupied/);
 s.players['seat-2'].lines=[s.players['seat-1'].lines.pop()!];
 assert.equal(act(s,'BUILD',{lineIndex:0,x:2,y:2}),s,'stack rejected without payment');
 assert.ok(!legalTargets(s,'seat-1',0).some(p=>p.x===2&&p.y===2));
 assert.match(validateNode(s,'seat-1',0,{x:2,y:2},true)!,/empty hole/);
}
{
 const s=base();s.phase='STARTER_PLACEMENT';s.oddPriorityId='seat-1';s.players['seat-1'].lines=[line([])];s.players['seat-2'].lines=[line([{x:1,y:0}],'branch')];
 const b=act(s,'PLACE_STARTER',{lineIndex:0,x:0,y:0});assert.notEqual(b,s);assert.equal(b.players['seat-1'].money,s.players['seat-1'].money-1);
 assert.equal(b.players['seat-1'].stationAccess?.length,1);assert.equal(access(b,1,1).length,0,'subsequent access on this line is free');
 const u=act(b,'UNDO_PLACEMENT',{});assert.equal(u.players['seat-1'].money,s.players['seat-1'].money);assert.equal(u.moneyEvents?.at(-1)?.reversed,true);
}
{
 const s=base();assert.equal(publicStandings(s).size,0);assert.deepEqual(publicStandings(s).networkLeaders,[]);
 s.players['seat-1'].lines=[line([{x:0,y:0},{x:2,y:0}])];s.players['seat-2'].lines=[line([{x:0,y:1},{x:2,y:1}],'branch')];
 const p=publicStandings(s);assert.deepEqual(p.networkLeaders,['seat-1','seat-2']);assert.equal(p.size,2);assert.deepEqual(p.stationLeaders,['seat-1','seat-2']);
}
console.log('Station access: single/repeat/multiple owners, line isolation, merged clusters, independent crossings, starter fees, stack rejection, Undo and public ties passed.');
