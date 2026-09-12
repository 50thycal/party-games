import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { POST, GET } from "../src/app/api/subway-companion/route";
import { GET as legacyGet } from "../src/app/api/get-room/route";
import { POST as legacyJoin } from "../src/app/api/join-room/route";
import { POST as legacyAction } from "../src/app/api/game-action/route";

async function main() {
  // Isolated on-disk libSQL database; never touches a real room.
  process.env.TURSO_DATABASE_URL=`file:/tmp/subway-companion-api-${process.pid}.db`;
  process.env.TURSO_AUTH_TOKEN="local-test";
  const post=(body:unknown,token="",handler=POST)=>handler(new NextRequest("http://localhost/api/subway-companion",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify(body)}));
  const created=await (await post({operation:"create"})).json();
  assert.equal(created.ok,true,JSON.stringify(created));
  const {token:tablet,view}=created.data;
  const roomCode=view.room.roomCode;
  const joined=await Promise.all(["Calvin","Zoe"].map(name=>post({operation:"join",roomCode,role:"phone",name}).then(r=>r.json())));
  assert.ok(joined.every(r=>r.ok),JSON.stringify(joined));
  const state=await (await GET(new NextRequest(`http://localhost/api/subway-companion?roomCode=${roomCode}`,{headers:{Authorization:`Bearer ${tablet}`}}))).json();
  assert.equal(state.data.room.players.length,2,"concurrent joins survive CAS");
  const started=await (await post({operation:"action",roomCode,type:"START_GAME",requestId:"start",revision:state.data.revision},tablet)).json();
  assert.equal(started.ok,true,JSON.stringify(started));
  assert.equal(started.data.view.game.phase,"PROCUREMENT");
  const phone=joined[0].data;
  const privateView=await (await GET(new NextRequest(`http://localhost/api/subway-companion?roomCode=${roomCode}`,{headers:{Authorization:`Bearer ${phone.token}`}}))).json();
  assert.equal(privateView.data.game.players[phone.view.playerId].destinationHand.length,2);
  assert.ok(Object.values(privateView.data.game.players).filter((p:any)=>p.id!==phone.view.playerId).every((p:any)=>p.destinationHand.length===0));
  assert.equal((await GET(new NextRequest(`http://localhost/api/subway-companion?roomCode=${roomCode}`))).status,401);
  assert.equal((await legacyGet(new NextRequest(`http://localhost/api/get-room?roomCode=${roomCode}`))).status,403,"old room API must not leak private state");
  assert.equal((await post({roomCode,name:"Intruder",playerId:phone.view.playerId},"",legacyJoin)).status,403);
  assert.equal((await post({roomCode,playerId:view.room.hostId,type:"START_GAME"},"",legacyAction)).status,403);
  const rejoined=await (await post({operation:"join",roomCode,role:"phone"},phone.token)).json();
  assert.equal(rejoined.data.view.room.players.length,2);
  assert.equal(rejoined.data.view.playerId,phone.view.playerId,"recovery keeps the same company");
  const pad=await (await post({operation:"join",roomCode,role:"tablet"},tablet)).json();
  assert.equal(pad.data.view.role,"tablet");
  assert.equal((await post({operation:"join",roomCode,role:"tablet"})).status,401,"room code alone cannot take over iPad");
  assert.equal((await post({operation:"join",roomCode,name:"Late",role:"phone"})).status,400);
  console.log("Companion API: isolated persistence, concurrent joins, credentials, private projections, legacy endpoint guards and recovery passed.");
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
