import { getVersionedRoomState, updateRoomState } from "./stateStore";
import { getGame } from "./gameRegistry";
import type { BaseAction, GameContext, RoomState } from "./types";

export type ApplyActionResult =
  | { ok: true; roomState: RoomState }
  | { ok: false; errorCode: string; message: string; status: number };

const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 10;

/**
 * Apply an action to a room's game state with optimistic locking and automatic retries.
 * This prevents race conditions when multiple players submit actions simultaneously.
 */
export function applyActionToRoom(params: {
  roomCode: string;
  action: BaseAction;
}): ApplyActionResult {
  const roomCode = params.roomCode.toUpperCase();

  // Retry loop for handling version conflicts
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const versionedRoomState = getVersionedRoomState(roomCode);

    if (!versionedRoomState) {
      return {
        ok: false,
        errorCode: "ROOM_NOT_FOUND",
        message: "Room not found.",
        status: 404,
      };
    }

    const room = versionedRoomState.room;
    const currentVersion = versionedRoomState.version;
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
      versionedRoomState.gameState ?? template.initialState(room.players);

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

    const updatedRoomState: RoomState = {
      room: versionedRoomState.room,
      gameState: nextState,
    };

    // Try to update with optimistic locking
    const result = updateRoomState(roomCode, updatedRoomState, currentVersion);

    if (result.success) {
      // Success! Return the updated state
      return { ok: true, roomState: updatedRoomState };
    }

    // Version conflict - another action was applied concurrently
    // Retry with exponential backoff (only if not the last attempt)
    if (attempt < MAX_RETRIES - 1) {
      // Small random delay to reduce thundering herd
      const delay = RETRY_DELAY_MS * Math.pow(2, attempt) + Math.random() * 10;
      // Note: In production, consider using a proper async sleep
      // For now, we'll just retry immediately (Next.js API routes are sync)
      continue;
    }
  }

  // Max retries exceeded - this should be very rare
  return {
    ok: false,
    errorCode: "CONCURRENT_UPDATE_CONFLICT",
    message:
      "Too many concurrent updates. Please try again in a moment.",
    status: 409,
  };
}
