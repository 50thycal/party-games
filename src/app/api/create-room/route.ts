import { NextRequest } from "next/server";
import { generateRoomCode, setRoomState } from "@/engine/stateStore";
import type { Player, Room, RoomState } from "@/engine/types";

// Force Node.js runtime (required for SQLite/better-sqlite3)
export const runtime = "nodejs";

type CreateRoomBody = {
  playerId?: string;
  name?: string;
  gameId?: string;
  mode?: "multiplayer" | "simulation" | "hotseat";
  playerCount?: number;
  playerNames?: string[]; // Optional names for pre-created players
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateRoomBody;

    const mode = body.mode || "multiplayer";
    const gameId = body.gameId?.trim() || "number-guess";

    // For multiplayer mode, require a player name
    if (mode === "multiplayer") {
      const name = body.name?.trim();
      if (!name) {
        return Response.json(
          { ok: false, errorCode: "MISSING_NAME", message: "Player name is required." },
          { status: 400 }
        );
      }

      const playerId = body.playerId?.trim() || crypto.randomUUID();

      // Generate unique room code (generateRoomCode already checks for uniqueness)
      const roomCode = await generateRoomCode();

      const hostPlayer: Player = {
        id: playerId,
        name,
        role: "host",
      };

      const room: Room = {
        roomCode,
        gameId,
        hostId: hostPlayer.id,
        players: [hostPlayer],
        createdAt: Date.now(),
        mode,
      };

      const roomState: RoomState = {
        room,
        gameState: null,
      };

      await setRoomState(roomCode, roomState);

      return Response.json(
        {
          ok: true,
          data: { room },
        },
        { status: 200 }
      );
    }

    // For hotseat and simulation modes, pre-create all players
    const playerCount = body.playerCount || 2;
    const playerNames = body.playerNames || [];

    // Generate unique room code
    const roomCode = await generateRoomCode();

    // Create all players
    const players: Player[] = [];
    for (let i = 0; i < playerCount; i++) {
      const playerId = crypto.randomUUID();
      const playerName = playerNames[i] || `Player ${i + 1}`;
      players.push({
        id: playerId,
        name: playerName,
        role: i === 0 ? "host" : "player",
      });
    }

    const room: Room = {
      roomCode,
      gameId,
      hostId: players[0].id,
      players,
      createdAt: Date.now(),
      mode,
    };

    const roomState: RoomState = {
      room,
      gameState: null,
    };

    await setRoomState(roomCode, roomState);

    return Response.json(
      {
        ok: true,
        data: { room },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in create-room:", err);
    return Response.json(
      { ok: false, errorCode: "INTERNAL_ERROR", message: "Failed to create room." },
      { status: 500 }
    );
  }
}
