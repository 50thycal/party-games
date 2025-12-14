import Database from "better-sqlite3";
import type { RoomState } from "./types";
import path from "path";
import fs from "fs";

/**
 * SQLite database layer for persistent room state storage with optimistic locking.
 *
 * This replaces the in-memory store with a persistent database that:
 * - Survives server restarts
 * - Prevents race conditions with version-based optimistic locking
 * - Provides ACID guarantees for concurrent operations
 */

// Database file location
const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "party-games.db");

// Singleton database instance
let dbInstance: Database.Database | null = null;

/**
 * Get or create the singleton database instance
 */
function getDb(): Database.Database {
  if (dbInstance) {
    return dbInstance;
  }

  // Ensure data directory exists
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  // Initialize database connection
  dbInstance = new Database(DB_PATH);

  // Enable WAL mode for better concurrent access
  dbInstance.pragma("journal_mode = WAL");

  // Create schema if not exists
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS room_states (
      room_code TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      host_id TEXT NOT NULL,
      players TEXT NOT NULL,
      game_state TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_room_states_created_at ON room_states(created_at);
    CREATE INDEX IF NOT EXISTS idx_room_states_updated_at ON room_states(updated_at);
  `);

  return dbInstance;
}

// Extended RoomState type with version for optimistic locking
export type VersionedRoomState = RoomState & {
  version: number;
};

/**
 * Get room state by room code
 */
export function getRoomState(roomCode: string): VersionedRoomState | undefined {
  const db = getDb();

  const row = db
    .prepare(
      `SELECT room_code, game_id, host_id, players, game_state, version, created_at, updated_at
       FROM room_states
       WHERE room_code = ?`
    )
    .get(roomCode) as
    | {
        room_code: string;
        game_id: string;
        host_id: string;
        players: string;
        game_state: string;
        version: number;
        created_at: number;
        updated_at: number;
      }
    | undefined;

  if (!row) return undefined;

  const players = JSON.parse(row.players);

  return {
    room: {
      roomCode: row.room_code,
      gameId: row.game_id,
      hostId: row.host_id,
      players,
      createdAt: row.created_at,
    },
    gameState: JSON.parse(row.game_state),
    version: row.version,
  };
}

/**
 * Set room state with optimistic locking.
 * Returns true if successful, false if version conflict occurred.
 *
 * @param roomCode - The room code to update
 * @param state - The new state to save
 * @param expectedVersion - The version we expect (for conflict detection). If undefined, creates new room.
 */
export function setRoomState(
  roomCode: string,
  state: RoomState,
  expectedVersion?: number
): { success: boolean; currentVersion?: number } {
  const db = getDb();
  const now = Date.now();

  if (expectedVersion === undefined) {
    // Creating new room - no version check needed
    try {
      db.prepare(
        `INSERT INTO room_states (
          room_code, game_id, host_id, players, game_state, version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
      ).run(
        roomCode,
        state.room.gameId,
        state.room.hostId,
        JSON.stringify(state.room.players),
        JSON.stringify(state.gameState),
        state.room.createdAt,
        now
      );
      return { success: true, currentVersion: 1 };
    } catch (err) {
      // Room already exists
      const current = getRoomState(roomCode);
      return { success: false, currentVersion: current?.version };
    }
  } else {
    // Updating existing room - use optimistic locking
    const result = db
      .prepare(
        `UPDATE room_states
         SET game_id = ?,
             host_id = ?,
             players = ?,
             game_state = ?,
             version = version + 1,
             updated_at = ?
         WHERE room_code = ? AND version = ?`
      )
      .run(
        state.room.gameId,
        state.room.hostId,
        JSON.stringify(state.room.players),
        JSON.stringify(state.gameState),
        now,
        roomCode,
        expectedVersion
      );

    if (result.changes === 0) {
      // No rows updated - either room doesn't exist or version mismatch
      const current = getRoomState(roomCode);
      return { success: false, currentVersion: current?.version };
    }

    return { success: true, currentVersion: expectedVersion + 1 };
  }
}

/**
 * Delete a room
 */
export function deleteRoom(roomCode: string): boolean {
  const db = getDb();
  const result = db
    .prepare(`DELETE FROM room_states WHERE room_code = ?`)
    .run(roomCode);
  return result.changes > 0;
}

/**
 * Check if a room exists
 */
export function hasRoom(roomCode: string): boolean {
  const db = getDb();
  const result = db
    .prepare(`SELECT 1 FROM room_states WHERE room_code = ? LIMIT 1`)
    .get(roomCode);
  return result !== undefined;
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
  } while (hasRoom(code));

  return code;
}

/**
 * List all rooms (useful for debugging)
 */
export function listRooms(): VersionedRoomState[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT room_code, game_id, host_id, players, game_state, version, created_at, updated_at
       FROM room_states
       ORDER BY created_at DESC`
    )
    .all() as Array<{
    room_code: string;
    game_id: string;
    host_id: string;
    players: string;
    game_state: string;
    version: number;
    created_at: number;
    updated_at: number;
  }>;

  return rows.map((row) => ({
    room: {
      roomCode: row.room_code,
      gameId: row.game_id,
      hostId: row.host_id,
      players: JSON.parse(row.players),
      createdAt: row.created_at,
    },
    gameState: JSON.parse(row.game_state),
    version: row.version,
  }));
}

/**
 * Clean up old rooms (optional - can be used for maintenance)
 * Deletes rooms older than the specified age in milliseconds
 */
export function cleanupOldRooms(maxAgeMs: number): number {
  const db = getDb();
  const cutoffTime = Date.now() - maxAgeMs;
  const result = db
    .prepare(`DELETE FROM room_states WHERE updated_at < ?`)
    .run(cutoffTime);
  return result.changes;
}

/**
 * Close database connection gracefully
 */
export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
