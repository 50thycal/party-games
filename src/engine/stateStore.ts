import type { RoomState } from "./types";
import * as db from "./database";
import type { VersionedRoomState } from "./database";

/**
 * State store for rooms with database persistence and optimistic locking.
 *
 * This module provides the interface for room state management using Turso (libSQL)
 * for persistence and version-based optimistic locking to prevent race conditions.
 */

/**
 * Get room state by room code
 */
export async function getRoomState(
  roomCode: string
): Promise<RoomState | undefined> {
  const versionedState = await db.getRoomState(roomCode);
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
export async function getVersionedRoomState(
  roomCode: string
): Promise<VersionedRoomState | undefined> {
  return await db.getRoomState(roomCode);
}

/**
 * Set room state (creates new room without version check)
 */
export async function setRoomState(
  roomCode: string,
  state: RoomState
): Promise<void> {
  const result = await db.setRoomState(roomCode, state);
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
export async function updateRoomState(
  roomCode: string,
  state: RoomState,
  expectedVersion: number
): Promise<{ success: boolean; currentVersion?: number }> {
  return await db.setRoomState(roomCode, state, expectedVersion);
}

/**
 * Delete a room
 */
export async function deleteRoom(roomCode: string): Promise<boolean> {
  return await db.deleteRoom(roomCode);
}

/**
 * Check if a room exists
 */
export async function hasRoom(roomCode: string): Promise<boolean> {
  return await db.hasRoom(roomCode);
}

/**
 * Generate a unique 4-letter room code (A-Z)
 */
export async function generateRoomCode(): Promise<string> {
  return await db.generateRoomCode();
}

/**
 * List all rooms (useful for debugging)
 */
export async function listRooms(): Promise<RoomState[]> {
  const versionedRooms = await db.listRooms();
  return versionedRooms.map((versionedState) => ({
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
export async function cleanupOldRooms(
  maxAgeMs: number = 24 * 60 * 60 * 1000
): Promise<number> {
  return await db.cleanupOldRooms(maxAgeMs);
}
