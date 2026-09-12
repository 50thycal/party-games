import type { RoomState, Room, GameContext } from "../../engine/types";
import { subwayGame, cardDraftTurnId, starterTurnId, surveyTurnId, destinationById, SUBWAY_STATE_VERSION, type SubwayState, type SubwayAction } from "./config";
import { type SavedPlan, validPlanNodes, cleanNode } from "./plans";

export type CompanionDevice = { tokenHash: string; role: "tablet" | "phone"; playerId: string; requests: string[] };
export type CompanionStore = {
  version: 1;
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
  return {room:state.room,game,revision:store.revision,role:device.role,playerId:device.playerId,
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
}, clock: Pick<GameContext,"now"|"random">): RoomState {
  if (device.requests.includes(input.requestId)) return state;
  if (typeof input.requestId !== "string" || !input.requestId || input.requestId.length > 100 || !Number.isInteger(input.revision)) throw new Error("Invalid action request.");
  const store = state.subwayCompanion!;
  if (input.revision !== store.revision) throw new Error("The table changed. Check the updated view and try again.");
  const next = structuredClone(state);
  const session = next.subwayCompanion!;
  const game = state.gameState as SubwayState | null;
  const actor = companionActor(game);
  const seated = store.seated?.turn === companionTurn(game) ? store.seated.playerId : undefined;
  const payload = input.payload ?? {};
  if (input.type === "ACK_COMPANY") {
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
    const current = game ?? subwayGame.initialState(state.room.players);
    if (current.version !== SUBWAY_STATE_VERSION && input.type !== "START_GAME") throw new Error("This game needs a restart.");
    const result = subwayGame.reducer(current, {type:input.type,playerId,payload} as SubwayAction,
      {...clock,room:state.room,playerId});
    if (result === current) throw new Error("That action is no longer available.");
    next.gameState = result;
    if (input.type === "START_GAME") { session.plans = {}; session.seated = undefined; }
  }
  session.revision++;
  const updated = session.devices.find(d=>d.tokenHash===device.tokenHash)!;
  updated.requests = [...updated.requests,input.requestId].slice(-128);
  return next;
}
