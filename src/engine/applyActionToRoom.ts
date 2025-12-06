import { getRoomState, setRoomState } from "./stateStore";
import { getGame } from "./gameRegistry";
import type { BaseAction, GameContext, RoomState } from "./types";

export type ApplyActionResult =
  | { ok: true; roomState: RoomState }
  | { ok: false; errorCode: string; message: string; status: number };

/**
 * Apply an action to a room's game state.
 * This is the core action engine that routes actions through game reducers.
 */
export function applyActionToRoom(params: {
  roomCode: string;
  action: BaseAction;
}): ApplyActionResult {
  const roomCode = params.roomCode.toUpperCase();
  const roomState = getRoomState(roomCode);

  if (!roomState) {
    return {
      ok: false,
      errorCode: "ROOM_NOT_FOUND",
      message: "Room not found.",
      status: 404,
    };
  }

  const room = roomState.room;
  const template = getGame(room.gameId);

  if (!template) {
    return {
      ok: false,
      errorCode: "GAME_NOT_REGISTERED",
      message: `No game registered for id "${room.gameId}".`,
      status: 500,
    };
  }

  const ctx: GameContext = {
    now: () => Date.now(),
    random: () => Math.random(),
    room,
    playerId: params.action.playerId,
  };

  // Lazily initialize game state if null
  const currentGameState =
    roomState.gameState ?? template.initialState(room.players);

  // Check if action is allowed (if validator exists)
  if (
    template.isActionAllowed &&
    !template.isActionAllowed(currentGameState, params.action, ctx)
  ) {
    return {
      ok: false,
      errorCode: "ACTION_NOT_ALLOWED",
      message: "That action is not allowed in the current state.",
      status: 400,
    };
  }

  // Apply the reducer
  const nextState = template.reducer(currentGameState, params.action, ctx);

  const updated: RoomState = {
    ...roomState,
    gameState: nextState,
  };

  setRoomState(roomCode, updated);

  return { ok: true, roomState: updated };
}
