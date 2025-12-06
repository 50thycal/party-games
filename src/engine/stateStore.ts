import type { RoomState } from "./types";

/**
 * In-memory state store for rooms.
 * This is a development-only implementation.
 * Will be replaced with a real database later.
 */

const rooms = new Map<string, RoomState>();

/**
 * Get room state by room code
 */
export function getRoomState(roomCode: string): RoomState | undefined {
  return rooms.get(roomCode);
}

/**
 * Set room state for a room code
 */
export function setRoomState(roomCode: string, state: RoomState): void {
  rooms.set(roomCode, state);
}

/**
 * Delete a room
 */
export function deleteRoom(roomCode: string): boolean {
  return rooms.delete(roomCode);
}

/**
 * Check if a room exists
 */
export function hasRoom(roomCode: string): boolean {
  return rooms.has(roomCode);
}

/**
 * Generate a unique 4-letter room code (A-Z)
 */
export function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code: string;

  // Keep generating until we find an unused code
  do {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms.has(code));

  return code;
}

/**
 * List all rooms (useful for debugging)
 */
export function listRooms(): RoomState[] {
  return Array.from(rooms.values());
}
