import { NextRequest } from "next/server";
import { generateRoomCode, setRoomState } from "@/engine/stateStore";
import type { Player, Room, RoomState } from "@/engine/types";

// Force Node.js runtime (required for SQLite/better-sqlite3)
export const runtime = "nodejs";

type CreateRoomBody = {
  playerId?: string;
  name?: string;
  gameId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateRoomBody;

    const name = body.name?.trim();
    if (!name) {
      return Response.json(
        { ok: false, errorCode: "MISSING_NAME", message: "Player name is required." },
        { status: 400 }
      );
    }

    const playerId = body.playerId?.trim() || crypto.randomUUID();
    const gameId = body.gameId?.trim() || "number-guess";

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
