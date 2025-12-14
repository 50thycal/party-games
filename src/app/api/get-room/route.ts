import { NextRequest } from "next/server";
import { getRoomState } from "@/engine/stateStore";

// Force Node.js runtime (required for SQLite/better-sqlite3)
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawCode = searchParams.get("roomCode");

    if (!rawCode) {
      return Response.json(
        { ok: false, errorCode: "MISSING_ROOM_CODE", message: "roomCode query parameter is required." },
        { status: 400 }
      );
    }

    const roomCode = rawCode.toUpperCase();
    const state = getRoomState(roomCode);

    if (!state) {
      return Response.json(
        { ok: false, errorCode: "ROOM_NOT_FOUND", message: "Room not found." },
        { status: 404 }
      );
    }

    return Response.json(
      {
        ok: true,
        data: {
          room: state.room,
          gameState: state.gameState,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in get-room:", err);
    return Response.json(
      { ok: false, errorCode: "INTERNAL_ERROR", message: "Failed to fetch room." },
      { status: 500 }
    );
  }
}
