import type { RoomState, Room, GameContext } from "../../engine/types";
import { subwayGame, cardDraftTurnId, starterTurnId, surveyTurnId, destinationById, SUBWAY_STATE_VERSION, type SubwayState, type SubwayAction } from "./config";
import { newRecord, recordedReducer, type GameRecord } from './recording';
import { chooseBotAction, validBot, BOT_VERSION } from './bots';
import { seededRandom } from './playtest';
import type { LabStore } from './lab';
import { nextCompanyId } from './config';
import { type SavedPlan, validPlanNodes, cleanNode } from "./plans";

export type CompanionDevice = { tokenHash: string; role: "tablet" | "phone"; playerId: string; requests: string[]; managedIds?: string[] };
export type CompanionStore = {
  version: 1;
  lab?: LabStore;
  recording?: GameRecord;
  revision: number;
  devices: CompanionDevice[];
  seated?: { playerId: string; turn: string };
  plans: Record<string, Record<string, SavedPlan>>;
  destinationHighlight?: {playerId:string;cardId:string;turn:string};
};
export type CompanionView = {
  room: Room;
  game: SubwayState | null;
  revision: number;
  role: "tablet" | "phone";
  playerId: string;
  actorId?: string;
  seatedId?: string;
  turn: string;
  plans: Record<string, SavedPlan>;
  engineeringRemaining: number;
  canUndo: boolean;
  highlightedStations: string[];
  lab?: {seats: LabStore["seats"]; managedIds:string[]; seed?:number; notes:LabStore["notes"]};
};

export function companionActor(game: SubwayState | null): string | undefined {
  if (!game) return;
  if (game.phase === "PROCUREMENT") return game.procurement.offer?.activeId;
  if (game.phase === "ENGINEERING") {
    if (game.engineeringStep === "CARD_DRAFT") return cardDraftTurnId(game);
    if (game.engineeringStep === "SURVEY") return surveyTurnId(game);
  }
  if (game.phase === "STARTER_PLACEMENT") return starterTurnId(game);
  if (game.phase === "CONSTRUCTION") return game.resolveQueue[0];
}
export function companionTurn(game: SubwayState | null): string {
  return game ? `${game.startedAt}:${game.phase}:${game.engineeringStep}:${game.currentPeriod}:${companionActor(game) ?? ""}` : "lobby";
}

/** Allowlisted transport projection. No sidecar credentials or undo snapshots leave the server. */
export function companionView(state: RoomState, device: CompanionDevice): CompanionView {
  const store = state.subwayCompanion!;
  const original = state.gameState as SubwayState | null;
  const game = original ? structuredClone(original) : null;
  const turn = companionTurn(original);
  const seatedId = store.seated?.turn === turn ? store.seated.playerId : undefined;
  const owner = device.role === "phone" ? device.playerId : seatedId;
  if (game) {
    game.destinationDeck = [];
    game.procurement.deck = [];
    game.market.decks = {engineering: [], scheduling: []};
    // Keep only public construction records until results; snapshots contain hands.
    if (game.phase !== "RESULTS") game.telemetry = game.telemetry.filter(e=>["BUILD","UNDO_PLACEMENT","HIRE_CREWS"].includes(e.action)).map(e=>({...e,
      playersBefore:Object.fromEntries(Object.entries(e.playersBefore).map(([id,p])=>[id,{...p,engineeringCards:[],destinationCards:[]}])),
      playersAfter:Object.fromEntries(Object.entries(e.playersAfter).map(([id,p])=>[id,{...p,engineeringCards:[],destinationCards:[]}]))}));
    if (game.undo) game.undo.state = undefined as unknown as SubwayState;
    for (const p of Object.values(game.players)) {
      if (p.id !== owner && game.phase !== "RESULTS") {
        p.engineeringHand = [];
        p.destinationHand = [];
        p.committedEngineering = [];
        p.destinationCommitments = [];
        p.schedulingHand = [];
        p.scoreBreakdown = undefined;
      }
      // Tablet carries public pieces only, even after company acknowledgement.
      if (device.role === "tablet" && game.phase !== "RESULTS") {
        p.engineeringHand = []; p.destinationHand = []; p.committedEngineering = [];
        p.destinationCommitments = []; p.schedulingHand = [];
      }
    }
  }
  return {lab:store.lab ? {seats:store.lab.seats,managedIds:device.managedIds??[],seed:device.role==='tablet'?store.lab.seed:undefined,notes:device.role==='tablet'||device.managedIds?store.lab.notes:[]}:undefined,room:state.room,game,revision:store.revision,role:device.role,playerId:device.playerId,
    actorId:companionActor(original),seatedId,turn,
    highlightedStations:device.role==="tablet" && seatedId && store.destinationHighlight?.playerId===seatedId && store.destinationHighlight.turn===turn ? destinationById(store.destinationHighlight.cardId)?.stationIds ?? [] : [],
    plans:structuredClone(owner ? store.plans[owner] ?? {} : {}),
    engineeringRemaining:original?.market.decks.engineering.length ?? 0,
    canUndo:device.role === "tablet" && !!original?.undo && store.seated?.playerId === original.undo.playerId};
}

const PHONE_ACTIONS = new Set(["PROCURE", "DRAFT_CARD", "BUY_SURVEYS", "BUY_DESTINATION"]);
const TABLET_ACTIONS = new Set(["HIRE_CREWS", "PLACE_SURVEY", "PLACE_STARTER", "BUILD", "SKIP_ACTION", "UNDO_PLACEMENT", "ADVANCE_SCORING"]);

/** Pure authenticated transaction; caller persists with CAS, including acknowledgement and plans. */
export function companionAction(state: RoomState, device: CompanionDevice, input: {
  type: string; payload?: Record<string, unknown>; revision: number; requestId: string;
}, clock: Pick<GameContext,"now"|"random">, automated = false): RoomState {
  if (device.requests.includes(input.requestId)) return state;
  if (typeof input.requestId !== "string" || !input.requestId || input.requestId.length > 100 || !Number.isInteger(input.revision)) throw new Error("Invalid action request.");
  const store = state.subwayCompanion!;
  if (input.revision !== store.revision) throw new Error("The table changed. Check the updated view and try again.");
  if(input.type === 'LAB_STEP') {
    const lab=store.lab, game=state.gameState as SubwayState|null;
    if(!lab||device.role!=='tablet'||!game||game.phase==='RESULTS') throw new Error('Bot controls require an active iPad test room.');
    const actor=nextCompanyId(game)!;
    const seat=lab.seats.find(s=>s.id===actor);
    if(game.phase!=='SCORING'&&seat?.control!=='bot') throw new Error('Waiting for a human company.');
    const random=seededRandom((lab.seed+lab.step*997)>>>0);
    const action=chooseBotAction(game,random,seat?.bot);
    if(!action) throw new Error('No bot decision available.');
    let prepared=structuredClone(state);
    const phoneAction=PHONE_ACTIONS.has(action.type);
    const botDevice=phoneAction?prepared.subwayCompanion!.devices.find(d=>d.role==='phone'&&d.playerId===actor&&!d.managedIds):device;
    if(!botDevice) throw new Error('Bot company device missing.');
    if(!phoneAction&&action.type!=='ADVANCE_SCORING') prepared=companionAction(prepared,device,{type:'ACK_COMPANY',payload:{playerId:actor},revision:prepared.subwayCompanion!.revision,requestId:input.requestId+':ack'},clock);
    const result=companionAction(prepared,botDevice,{type:action.type,payload:action.payload as Record<string,unknown>,revision:prepared.subwayCompanion!.revision,requestId:input.requestId+':move'},clock,true);
    result.subwayCompanion!.lab!.step++;
    const receipt=result.subwayCompanion!.devices.find(d=>d.tokenHash===device.tokenHash)!;
    receipt.requests=[...receipt.requests,input.requestId].slice(-128);
    return result;
  }
  const next = structuredClone(state);
  const session = next.subwayCompanion!;
  const game = state.gameState as SubwayState | null;
  const actor = companionActor(game);
  const seated = store.seated?.turn === companionTurn(game) ? store.seated.playerId : undefined;
  const payload = input.payload ?? {};
  if(input.type.startsWith('LAB_')) {
    const lab=session.lab;
    if(!lab) throw new Error('Testing controls are unavailable in normal games.');
    if(input.type==='LAB_SELECT') {
      const id=payload.playerId;
      if(device.role!=='phone'||typeof id!=='string'||!device.managedIds?.includes(id)||lab.seats.find(s=>s.id===id)?.control!=='human') throw new Error('Choose a company controlled by you.');
      session.devices.find(d=>d.tokenHash===device.tokenHash)!.playerId=id;
    } else if(input.type==='LAB_CONTROL') {
      if(device.role!=='tablet') throw new Error('Configure companies on the iPad.');
      const seat=lab.seats.find(s=>s.id===payload.playerId);
      if(!seat||seat.control==='remote'||!['human','bot'].includes(String(payload.control))||!validBot(payload.bot)) throw new Error('Invalid managed company.');
      seat.control=payload.control as 'human'|'bot';seat.bot=payload.bot;
      const change={at:clock.now(),playerId:seat.id,value:{control:seat.control,bot:seat.bot}};
      lab.history.push(change);
      session.recording?.controls.push(change);
    } else if(input.type==='LAB_NOTE') {
      if(device.role!=='tablet'&&!device.managedIds) throw new Error('Only the tester can mark problems.');
      if(typeof payload.text!=='string'||!payload.text.trim()||payload.text.length>1000||lab.notes.length>=100) throw new Error('Enter a note of 1–1000 characters (100 per game).');
      const note={at:clock.now(),actionIndex:session.recording?.actions.length??0,text:payload.text.trim()};
      lab.notes.push(note);session.recording?.notes.push(note);
    } else throw new Error('Unknown testing control.');
  } else if (input.type === "ACK_COMPANY") {
    if (device.role !== "tablet" || !actor || payload.playerId !== actor) throw new Error("Wait for the active company.");
    session.seated = {playerId:actor,turn:companionTurn(game)};
  } else if (input.type === "SHOW_DESTINATION") {
    if (device.role !== "phone" || !game || device.playerId !== actor || seated !== actor) throw new Error("Confirm your company on the iPad first, during your board turn.");
    const cardId = payload.cardId;
    if (cardId !== null && (typeof cardId !== "string" || !game.players[device.playerId].destinationHand.includes(cardId))) throw new Error("Choose one of your own Destination cards.");
    session.destinationHighlight = cardId === null ? undefined : {playerId:device.playerId,cardId:cardId as string,turn:companionTurn(game)};
  } else if (input.type === "SAVE_GHOST") {
    if (device.role !== "tablet" || !seated || seated !== actor || !game) throw new Error("Confirm your company first.");
    const contractId = payload.contractId;
    if (typeof contractId !== "string" || !game.players[seated].lines.some(l=>l.contractId===contractId) || !validPlanNodes(payload.nodes)) throw new Error("Invalid ghost route.");
    session.plans[seated] ??= {};
    session.plans[seated][contractId] = {nodes:payload.nodes.map(cleanNode),savedAt:clock.now()};
  } else {
    let playerId = device.playerId;
    if (input.type === "START_GAME") {
      if (device.role !== "tablet") throw new Error("Start the game on the iPad.");
      playerId = state.room.hostId;
    } else if (device.role === "phone") {
      if (!PHONE_ACTIONS.has(input.type)) throw new Error("Use the iPad for board actions.");
    } else {
      if (!TABLET_ACTIONS.has(input.type)) throw new Error("Use your phone for cards and purchases.");
      if (input.type === "ADVANCE_SCORING") playerId = state.room.hostId;
      else if (input.type === "UNDO_PLACEMENT" && game?.undo?.playerId && store.seated?.playerId === game.undo.playerId) playerId = game.undo.playerId;
      else {
        if (!seated || seated !== actor) throw new Error("Confirm the active company first.");
        playerId = seated;
      }
    }
    if(input.type==='START_GAME'&&game?.version===SUBWAY_STATE_VERSION&&game.phase!=='SETUP') throw new Error('This game has already started. Create a new room.');
    const current = input.type==='START_GAME'?subwayGame.initialState(state.room.players):game??subwayGame.initialState(state.room.players);
    if (current.version !== SUBWAY_STATE_VERSION && input.type !== "START_GAME") throw new Error("This game needs a restart.");
    if(session.lab && device.role==='phone' && session.lab.seats.find(s=>s.id===playerId)?.control==='bot' && device.managedIds) throw new Error('Take over this bot on the iPad first.');
    if(input.type==='START_GAME') {
      if(session.lab && session.lab.seats.some(s=>s.control==='remote'&&!session.devices.some(d=>d.role==='phone'&&!d.managedIds&&d.playerId===s.id))) throw new Error('Wait for the invited phones to join.');
      session.recording=newRecord(state.room,current);
      if(session.lab) {
        if(game) {session.lab.notes=[];session.lab.history=[];session.lab.step=0;}
        session.recording.notes=structuredClone(session.lab.notes);
        session.recording.controls=structuredClone(session.lab.history);
        session.recording.seed=session.lab.seed;session.recording.profiles=structuredClone(session.lab.seats);session.recording.botVersion=BOT_VERSION;
      }
    }
    const action={type:input.type,playerId,payload} as SubwayAction;
    const controller=automated?'bot':'human';
    const result = session.recording ? recordedReducer(current,action,{...clock,room:state.room,playerId},session.recording,controller) : subwayGame.reducer(current,action,{...clock,room:state.room,playerId});
    if (result === current) throw new Error("That action is no longer available.");
    next.gameState = result;
    if(session.recording && session.lab) {
      const played=session.recording.actions.filter(e=>!['START_GAME','ADVANCE_SCORING'].includes(e.action.type));
      session.recording.source=played.some(e=>e.controller==='bot')?(played.some(e=>e.controller==='human')?'mixed':'bots'):'human';
    }
    if (input.type === "START_GAME") { session.plans = {}; session.seated = undefined; }
  }
  session.revision++;
  const updated = session.devices.find(d=>d.tokenHash===device.tokenHash)!;
  updated.requests = [...updated.requests,input.requestId].slice(-128);
  return next;
}
