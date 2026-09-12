import { createHash, randomBytes } from "node:crypto";
import { NextRequest } from "next/server";
import { generateRoomCode, setRoomState, getVersionedRoomState, updateRoomState } from "@/engine/stateStore";
import { validateSeats } from "@/games/subway/lab";
import type { SubwayState } from "@/games/subway/config";
import type { RoomState } from "@/engine/types";
import { companionAction, companionView, type CompanionDevice } from "@/games/subway/companion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const tokenFrom = (req: NextRequest) => req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
const reply = (data: unknown) => Response.json({ok:true,data},{headers:{"Cache-Control":"no-store"}});
const fail = (message: string, status = 400) => Response.json({ok:false,message},{status});

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("roomCode")?.toUpperCase() ?? "";
  const state = await getVersionedRoomState(code);
  if (!state?.subwayCompanion) return fail("Companion room not found.",404);
  const device = state.subwayCompanion.devices.find(d=>d.tokenHash===hash(tokenFrom(req)));
  if (!device) return fail("Join this room or enter your recovery key.",401);
  if(req.nextUrl.searchParams.get('export')==='1') {
    const game=state.gameState as SubwayState|null;
    if(!game||!state.subwayCompanion.recording) return fail('This older game has no replay recording. Use its text report.');
    if(game.phase!=='RESULTS' && !(state.subwayCompanion.lab&&device.role==='tablet')) return fail('Full export is available after results.',403);
    return reply({...state.subwayCompanion.recording,final:game});
  }
  return reply(companionView(state,device));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = tokenFrom(req);
    if (body.operation === "create") {
      const roomCode = await generateRoomCode();
      const credential = randomBytes(32).toString("hex");
      const tablet: CompanionDevice = {tokenHash:hash(credential),role:"tablet",playerId:crypto.randomUUID(),requests:[]};
      const state: RoomState = {room:{roomCode,gameId:"subway",hostId:tablet.playerId,players:[],createdAt:Date.now(),mode:"multiplayer"},gameState:null,
        subwayCompanion:{version:1,revision:0,devices:[tablet],plans:{}}};
      let controllerKey:string|undefined;
      if(body.lab) {
        const seats=validateSeats(body.seats).map(s=>({...s,id:crypto.randomUUID()}));
        const seed=Number.isInteger(body.seed)?body.seed>>>0:1;
        state.room.players=seats.map(s=>({id:s.id,name:s.name,role:'player'}));
        state.subwayCompanion!.lab={seats,seed,step:0,history:[],notes:[]};
        // Bot device credentials are never returned. The controller cannot act as a remote friend.
        for(const seat of seats.filter(s=>s.control!=='remote')) state.subwayCompanion!.devices.push({tokenHash:hash(randomBytes(32).toString('hex')),role:'phone',playerId:seat.id,requests:[]});
        const managedIds=seats.filter(s=>s.control!=='remote').map(s=>s.id);
        if(managedIds.length) {
          controllerKey=randomBytes(32).toString('hex');
          state.subwayCompanion!.devices.push({tokenHash:hash(controllerKey),role:'phone',playerId:managedIds[0],requests:[],managedIds});
        }
      }
      await setRoomState(roomCode,state);
      return reply({token:credential,controllerKey,view:companionView(state,tablet)});
    }
    const code = typeof body.roomCode === "string" ? body.roomCode.toUpperCase() : "";
    if (!/^[A-Z]{4}$/.test(code)) return fail("Enter a four-letter room code.");
    // Generate once per HTTP request; a losing CAS retry must retain identity.
    const credential = randomBytes(32).toString("hex");
    const playerId = crypto.randomUUID();
    for (let attempt=0; attempt<5; attempt++) {
      const current = await getVersionedRoomState(code);
      if (!current?.subwayCompanion) return fail("Companion room not found.",404);
      const device = current.subwayCompanion.devices.find(d=>d.tokenHash===hash(token));
      if (body.operation === "join") {
        if (device) return reply({token,view:companionView(current,device)});
        if (body.role === "tablet") return fail("Enter the iPad recovery key to reopen its board.",401);
        if (token) return fail("Recovery key not recognized.",401);
        const name = typeof body.name === "string" ? body.name.trim().slice(0,40) : "";
        if (!name) return fail("Enter your company name.");
        if (current.gameState || (!current.subwayCompanion.lab && current.room.players.length>=4)) return fail("This game has started or already has four companies.");
        const next = structuredClone(current);
        const lab=current.subwayCompanion.lab;
        const reserved=lab?.seats.find(s=>s.control==='remote'&&!current.subwayCompanion!.devices.some(d=>d.playerId===s.id&&d.role==='phone'));
        if(lab&&!reserved) return fail('No invited company seats remain.');
        const joined: CompanionDevice = {tokenHash:hash(credential),role:"phone",playerId:reserved?.id??playerId,requests:[]};
        if(!lab) next.room.players.push({id:playerId,name,role:"player"});
        next.subwayCompanion!.devices.push(joined);
        next.subwayCompanion!.revision++;
        if ((await updateRoomState(code,next,current.version)).success) return reply({token:credential,view:companionView(next,joined)});
      } else {
        if (!device) return fail("Your device needs to rejoin this room.",401);
        let next:RoomState;
        try {
          next = companionAction(current,device,body,{now:Date.now,random:Math.random});
        } catch(error) {
          // Diagnostics never enter the replay stream or expose rejected payloads.
          const message=error instanceof Error?error.message:'Action rejected.';
          if(current.subwayCompanion.recording) {
            const rejected=structuredClone(current);
            const record=rejected.subwayCompanion!.recording!;
            record.diagnostics=[...(record.diagnostics??[]),{at:Date.now(),actor:device.playerId,action:typeof body.type==='string'?body.type.slice(0,80):'invalid',reason:message}].slice(-100);
            // Same game revision: only an out-of-band diagnostic changed.
            await updateRoomState(code,rejected,current.version);
          }
          return fail(message);
        }
        if (next === current || (await updateRoomState(code,next,current.version)).success) return reply({view:companionView(next,next.subwayCompanion!.devices.find(d=>d.tokenHash===device.tokenHash)!)});
      }
    }
    return fail("The table changed. Try again.",409);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update the table.");
  }
}
