import assert from 'node:assert/strict';
import { runSimulation } from '../src/games/subway/lab';
import { PERSONALITIES, DEFAULT_BOT, chooseBotAction } from '../src/games/subway/bots';
import { fingerprint, parseRecord, recordIdentity, replayRecord, recordMetrics } from '../src/games/subway/recording';
import { seededRandom } from '../src/games/subway/playtest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { NextRequest } from 'next/server';
import { POST,GET } from '../src/app/api/subway-companion/route';

async function main() {
  for(const n of [2,3,4]) for(const personality of PERSONALITIES) {
    const profiles=Array.from({length:n},()=>({personality,skill:'experienced' as const}));
    const r=runSimulation(n,11,profiles);
    assert.equal(r.final!.phase,'RESULTS');
    assert.equal(fingerprint(replayRecord(parseRecord(JSON.stringify(r)))),fingerprint(r.final));
    assert.equal(recordMetrics(r).length,n);
    assert.equal(fingerprint(runSimulation(n,11,profiles)),fingerprint(r),'same seed is reproducible');
    assert.throws(()=>parseRecord(JSON.stringify({...r,initial:{version:20},actions:[]})),/replayable/);
    const wrongSetup=structuredClone(r);wrongSetup.initial.players={};assert.throws(()=>replayRecord(wrongSetup),/canonical setup/);
    assert.equal(recordIdentity(r),recordIdentity({...r,notes:[{at:1,actionIndex:0,text:'another export'}]}),'annotations do not duplicate the same game');
    const corrupt=structuredClone(r);corrupt.actions.at(-1)!.after='invalid';assert.throws(()=>replayRecord(corrupt),/diverged/);
    const old=structuredClone(r);old.rules='old';assert.throws(()=>replayRecord(old),/Rules differ/);
    
    // Compare a valid action state with opponent hands/decks changed; policy sees neither.
    const turn=replayRecord(r,1), changed=structuredClone(turn);
    changed.destinationDeck.reverse();changed.market.decks.engineering.reverse();
    for(const id of changed.playerOrder.slice(1)) changed.players[id].destinationHand=['secret'];
    assert.deepEqual(chooseBotAction(turn,seededRandom(3)),chooseBotAction(changed,seededRandom(3)));

    console.log(`Simulation/replay ${n} companies ${personality}: ${r.actions.length} actions`);
  }
  for(const n of [2,3,4]) {const r=runSimulation(n,31,Array.from({length:n},(_,i)=>({personality:PERSONALITIES[i],skill:'casual' as const})));assert.equal(fingerprint(replayRecord(r)),fingerprint(r.final));}
  process.env.TURSO_DATABASE_URL=`file:/tmp/subway-lab-${process.pid}.db`;process.env.TURSO_AUTH_TOKEN='local';
  const post=async(body:unknown,token='')=>(await POST(new NextRequest('http://localhost/api/subway-companion',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)}))).json();
  const get=async(roomCode:string,token:string,extra='')=>(await GET(new NextRequest(`http://localhost/api/subway-companion?roomCode=${roomCode}${extra}`,{headers:{Authorization:`Bearer ${token}`}}))).json();
  for(const count of [2,3,4]) {
    const created=await post({operation:'create',lab:true,seed:22,seats:Array.from({length:count},(_,i)=>({name:`Seat ${i+1}`,control:'bot',bot:DEFAULT_BOT}))});
    assert.equal(created.ok,true,JSON.stringify(created));
    const {token,controllerKey}=created.data;let view=created.data.view;const roomCode=view.room.roomCode;
    const act=async(type:string,payload?:unknown,requestId=crypto.randomUUID())=>{
      const r=await post({roomCode,type,payload,revision:view.revision,requestId},token);assert.equal(r.ok,true,JSON.stringify(r));view=r.data.view;return r;
    };
    await act('LAB_NOTE',{text:'Pre-game observation'});
    await act('START_GAME');
    const raw=await get(roomCode,token);assert.equal(raw.data.recording,undefined);assert.equal(raw.data.game.destinationDeck.length,0);
    assert.equal((await get(roomCode,controllerKey,'&export=1')).ok,false);
    await act('LAB_CONTROL',{playerId:view.room.players[0].id,control:'human',bot:DEFAULT_BOT});
    const controller=await get(roomCode,controllerKey);
    const select=await post({roomCode,type:'LAB_SELECT',payload:{playerId:view.room.players[0].id},revision:view.revision,requestId:'select'},controllerKey);assert.equal(select.ok,true);
    assert.equal(select.data.view.playerId,view.room.players[0].id);
    const forbidden=await post({roomCode,type:'BUILD',revision:select.data.view.revision,requestId:'bad'},controllerKey);assert.equal(forbidden.ok,false);
    view=(await get(roomCode,token)).data;
    await act('LAB_NOTE',{text:'Test marker'});
    await act('LAB_CONTROL',{playerId:view.room.players[0].id,control:'bot',bot:DEFAULT_BOT});
    let steps=0;
    while(view.game.phase!=='RESULTS'&&steps++<500) {
      const revision=view.revision,requestId=`bot-${steps}`;
      await act('LAB_STEP',undefined,requestId);
      const retry=await post({roomCode,type:'LAB_STEP',revision,requestId},token);assert.equal(retry.ok,true);assert.equal(retry.data.view.revision,view.revision,'retry cannot double play');
    }
    assert.equal(view.game.phase,'RESULTS');
    const exported=await get(roomCode,token,'&export=1');assert.equal(exported.ok,true);
    const record=parseRecord(JSON.stringify(exported.data));assert.equal(record.notes.length,2);assert.ok(record.diagnostics?.some(d=>d.action==='BUILD'));
    const restart=await post({roomCode,type:'START_GAME',revision:view.revision,requestId:'restart'},token);assert.equal(restart.ok,false,'completed rooms require a new room, as in production');
    assert.equal((await get(roomCode,token)).data.lab.notes.length,2,'rejected restart preserves observations');
    assert.equal(fingerprint(replayRecord(record)),fingerprint(record.final));
    assert.ok(!JSON.stringify(record).includes(token)&&!JSON.stringify(record).includes(controllerKey),'no credentials in export');
    console.log(`iPad API lab ${count} companies: replay, switching, privacy, idempotency, takeover and ${steps} bot actions passed`);
  }
  // A real invited phone and the tester controller remain distinct credentials.
  const mixed=await post({operation:'create',lab:true,seats:[{name:'Me',control:'human',bot:DEFAULT_BOT},{name:'Friend',control:'remote',bot:DEFAULT_BOT}]});
  const pad=mixed.data.token,key=mixed.data.controllerKey,code=mixed.data.view.room.roomCode;
  assert.equal((await post({roomCode:code,type:'START_GAME',revision:0,requestId:'early'},pad)).ok,false);
  const friend=await post({operation:'join',roomCode:code,name:'Friend',role:'phone'});assert.equal(friend.ok,true);
  assert.equal(friend.data.view.lab.seed,undefined,'friend cannot see bot seed');
  const forbiddenSeat=await post({roomCode:code,type:'LAB_SELECT',payload:{playerId:friend.data.view.playerId},revision:friend.data.view.revision,requestId:'steal'},key);assert.equal(forbiddenSeat.ok,false);
  const current=(await get(code,pad)).data;
  const started=await post({roomCode:code,type:'START_GAME',revision:current.revision,requestId:'go'},pad);assert.equal(started.ok,true);
  const own=await get(code,key);assert.equal(own.data.playerId,mixed.data.view.room.players[0].id);
  const activeToken=own.data.game.procurement.offer.activeId===own.data.playerId?key:friend.data.token;
  const purchase=await post({roomCode:code,type:'PROCURE',payload:{choice:'buy',contractId:own.data.game.procurement.row[0]},revision:own.data.revision,requestId:'human-buy'},activeToken);assert.equal(purchase.ok,true,JSON.stringify(purchase));
  const partial=(await get(code,pad,'&export=1')).data;assert.equal(partial.actions.at(-1).controller,'human');assert.equal(fingerprint(replayRecord(partial)),fingerprint(partial.final));
  const recovered=await post({operation:'join',roomCode:code,role:'phone'},key);assert.equal(recovered.data.view.playerId,own.data.playerId);
  const temp=mkdtempSync(join(tmpdir(),'subway-archive-'));
  const file=join(temp,'malformed.json');writeFileSync(file,JSON.stringify({schema:1,actions:[null],room:{},initial:{},rules:'x',source:'human'}));
  const script=join(process.cwd(),'scripts/archive-subway-playtest.mjs');
  const env={...process.env,SUBWAY_ARCHIVE_ROOT:join(temp,'archive')};
  execFileSync(process.execPath,[script,file],{env});execFileSync(process.execPath,[script,file],{env});
  const catalog=JSON.parse(readFileSync(join(temp,'archive/index.json'),'utf8'));assert.equal(catalog.length,1);assert.equal(catalog[0].cohort,'reference');assert.equal(catalog[0].validation,'malformed');assert.equal(catalog[0].comparisonEligible,false);
  assert.equal(readFileSync(join(temp,'archive',catalog[0].path),'utf8'),readFileSync(file,'utf8'));
  console.log('Remote seat isolation, human action provenance, partial replay, reconnect and archive byte preservation/dedup passed.');
  const normal=await post({operation:'create'});
  const denied=await post({roomCode:normal.data.view.room.roomCode,type:'LAB_NOTE',payload:{text:'bad'},revision:0,requestId:'bad'},normal.data.token);assert.equal(denied.ok,false);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
