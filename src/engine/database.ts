import { createClient, type Client } from "@libsql/client";
import type { RoomState } from "./types";

/**
 * Turso (libSQL) database layer for persistent room state storage with optimistic locking.
 *
 * This provides:
 * - Shared persistence across all Vercel serverless instances
 * - Version-based optimistic locking to prevent race conditions
 * - ACID guarantees for concurrent operations
 *
 * Requires env vars from Vercel Turso Cloud integration:
 * - TURSO_DATABASE_URL
 * - TURSO_AUTH_TOKEN
 */

// Singleton Turso client instance
let clientInstance: Client | null = null;
let schemaInitialized = false;

/**
 * Get or create the singleton Turso client
 */
function getClient(): Client {
  if (clientInstance) {
    return clientInstance;
  }

  // Validate required env vars
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    throw new Error(
      "Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN. " +
        "Ensure Turso integration is connected on Vercel or run 'vercel env pull' for local dev."
    );
  }

  // Create Turso client
  clientInstance = createClient({
    url,
    authToken,
  });

  return clientInstance;
}

/**
 * Initialize database schema (creates tables if not exist)
 * Called lazily on first database operation
 */
async function ensureSchema(): Promise<void> {
  if (schemaInitialized) {
    return;
  }

  const client = getClient();

  try {
    await client.batch(
      [
        {
          sql: `CREATE TABLE IF NOT EXISTS rooms (
            room_code TEXT PRIMARY KEY,
            state_json TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1,
            updated_at INTEGER NOT NULL
          )`,
          args: [],
        },
        {
          sql: "CREATE INDEX IF NOT EXISTS idx_rooms_updated_at ON rooms(updated_at)",
          args: [],
        },
      ],
      "write"
    );
    schemaInitialized = true;
  } catch (err) {
    console.error("Failed to initialize Turso schema:", err);
    throw err;
  }
}

// Extended RoomState type with version for optimistic locking
export type VersionedRoomState = RoomState & {
  version: number;
};

/**
 * Get room state by room code
 */
export async function getRoomState(
  roomCode: string
): Promise<VersionedRoomState | undefined> {
  await ensureSchema();
  const client = getClient();

  const result = await client.execute({
    sql: "SELECT room_code, state_json, version, updated_at FROM rooms WHERE room_code = ?",
    args: [roomCode],
  });

  if (result.rows.length === 0) {
    return undefined;
  }

  const row = result.rows[0];
  const stateJson = row.state_json as string;
  const version = row.version as number;

  const roomState = JSON.parse(stateJson) as RoomState;

  return {
    ...roomState,
    version,
  };
}

/**
 * Set room state with optimistic locking.
 * Returns success status and current version.
 *
 * @param roomCode - The room code to update
 * @param state - The new state to save
 * @param expectedVersion - The version we expect (for conflict detection). If undefined, creates new room.
 */
export async function setRoomState(
  roomCode: string,
  state: RoomState,
  expectedVersion?: number
): Promise<{ success: boolean; currentVersion?: number }> {
  await ensureSchema();
  const client = getClient();
  const now = Date.now();
  const stateJson = JSON.stringify(state);

  if (expectedVersion === undefined) {
    // Creating new room - no version check needed
    try {
      await client.execute({
        sql: "INSERT INTO rooms (room_code, state_json, version, updated_at) VALUES (?, ?, 1, ?)",
        args: [roomCode, stateJson, now],
      });
      return { success: true, currentVersion: 1 };
    } catch (err) {
      // Room already exists (PRIMARY KEY constraint violation)
      const current = await getRoomState(roomCode);
      return { success: false, currentVersion: current?.version };
    }
  } else {
    // Updating existing room - use optimistic locking
    const result = await client.execute({
      sql: `UPDATE rooms
            SET state_json = ?,
                version = version + 1,
                updated_at = ?
            WHERE room_code = ? AND version = ?`,
      args: [stateJson, now, roomCode, expectedVersion],
    });

    if (result.rowsAffected === 0) {
      // No rows updated - either room doesn't exist or version mismatch
      const current = await getRoomState(roomCode);
      return { success: false, currentVersion: current?.version };
    }

    return { success: true, currentVersion: expectedVersion + 1 };
  }
}

/**
 * Delete a room
 */
export async function deleteRoom(roomCode: string): Promise<boolean> {
  await ensureSchema();
  const client = getClient();
  const result = await client.execute({
    sql: "DELETE FROM rooms WHERE room_code = ?",
    args: [roomCode],
  });
  return result.rowsAffected > 0;
}

/**
 * Check if a room exists
 */
export async function hasRoom(roomCode: string): Promise<boolean> {
  await ensureSchema();
  const client = getClient();
  const result = await client.execute({
    sql: "SELECT 1 FROM rooms WHERE room_code = ? LIMIT 1",
    args: [roomCode],
  });
  return result.rows.length > 0;
}

/**
 * Generate a unique 4-letter room code (A-Z)
 */
export async function generateRoomCode(): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code: string;

  // Keep generating until we find an unused code
  do {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (await hasRoom(code));

  return code;
}

/**
 * List all rooms (useful for debugging)
 */
export async function listRooms(): Promise<VersionedRoomState[]> {
  await ensureSchema();
  const client = getClient();
  const result = await client.execute({
    sql: "SELECT room_code, state_json, version, updated_at FROM rooms ORDER BY updated_at DESC",
    args: [],
  });

  return result.rows.map((row) => {
    const stateJson = row.state_json as string;
    const version = row.version as number;
    const roomState = JSON.parse(stateJson) as RoomState;

    return {
      ...roomState,
      version,
    };
  });
}

/**
 * Clean up old rooms (optional - can be used for maintenance)
 * Deletes rooms older than the specified age in milliseconds
 */
export async function cleanupOldRooms(maxAgeMs: number): Promise<number> {
  await ensureSchema();
  const client = getClient();
  const cutoffTime = Date.now() - maxAgeMs;
  const result = await client.execute({
    sql: "DELETE FROM rooms WHERE updated_at < ?",
    args: [cutoffTime],
  });
  return result.rowsAffected;
}

/**
 * Close database connection gracefully (for cleanup)
 */
export function closeDatabase(): void {
  if (clientInstance) {
    clientInstance.close();
    clientInstance = null;
    schemaInitialized = false;
  }
}
