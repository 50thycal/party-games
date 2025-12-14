import type { RoomState } from "./types";
import * as db from "./database";
import type { VersionedRoomState } from "./database";

/**
 * State store for rooms with database persistence and optimistic locking.
 *
 * This module provides the same interface as the old in-memory store,
 * but now uses SQLite for persistence and version-based optimistic locking
 * to prevent race conditions.
 */

/**
 * Get room state by room code
 */
export function getRoomState(roomCode: string): RoomState | undefined {
  const versionedState = db.getRoomState(roomCode);
  if (!versionedState) return undefined;

  // Return without version for backward compatibility
  return {
    room: versionedState.room,
    gameState: versionedState.gameState,
  };
}

/**
 * Get room state with version (for optimistic locking)
 */
export function getVersionedRoomState(
  roomCode: string
): VersionedRoomState | undefined {
  return db.getRoomState(roomCode);
}

/**
 * Set room state (creates new room without version check)
 */
export function setRoomState(roomCode: string, state: RoomState): void {
  const result = db.setRoomState(roomCode, state);
  if (!result.success) {
    throw new Error(
      `Failed to create room ${roomCode}: room already exists or conflict occurred`
    );
  }
}

/**
 * Update room state with optimistic locking.
 * Returns true if successful, false if version conflict occurred.
 *
 * This is the preferred method for updating existing rooms to prevent race conditions.
 *
 * @param roomCode - The room code to update
 * @param state - The new state to save
 * @param expectedVersion - The version we expect (from the last read)
 * @returns Object with success status and current version
 */
export function updateRoomState(
  roomCode: string,
  state: RoomState,
  expectedVersion: number
): { success: boolean; currentVersion?: number } {
  return db.setRoomState(roomCode, state, expectedVersion);
}

/**
 * Delete a room
 */
export function deleteRoom(roomCode: string): boolean {
  return db.deleteRoom(roomCode);
}

/**
 * Check if a room exists
 */
export function hasRoom(roomCode: string): boolean {
  return db.hasRoom(roomCode);
}

/**
 * Generate a unique 4-letter room code (A-Z)
 */
export function generateRoomCode(): string {
  return db.generateRoomCode();
}

/**
 * List all rooms (useful for debugging)
 */
export function listRooms(): RoomState[] {
  return db.listRooms().map((versionedState) => ({
    room: versionedState.room,
    gameState: versionedState.gameState,
  }));
}

/**
 * Clean up old rooms (maintenance function)
 * Deletes rooms older than the specified age
 *
 * @param maxAgeMs - Maximum age in milliseconds (default: 24 hours)
 * @returns Number of rooms deleted
 */
export function cleanupOldRooms(maxAgeMs: number = 24 * 60 * 60 * 1000): number {
  return db.cleanupOldRooms(maxAgeMs);
}
