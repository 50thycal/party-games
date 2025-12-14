import { NextRequest } from "next/server";
import { applyActionToRoom } from "@/engine/applyActionToRoom";
import type { BaseAction } from "@/engine/types";

// Force Node.js runtime (required for SQLite/better-sqlite3)
export const runtime = "nodejs";

type GameActionBody = {
  roomCode?: string;
  playerId?: string;
  type?: string;
  payload?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GameActionBody;

    const rawCode = body.roomCode?.trim();
    const type = body.type?.trim();
    const playerId = body.playerId?.trim();

    if (!rawCode || !playerId || !type) {
      return Response.json(
        {
          ok: false,
          errorCode: "MISSING_FIELDS",
          message: "roomCode, playerId, and type are required.",
        },
        { status: 400 }
      );
    }

    const action: BaseAction = {
      type,
      playerId,
      payload: body.payload,
    };

    const result = await applyActionToRoom({
      roomCode: rawCode,
      action,
    });

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          errorCode: result.errorCode,
          message: result.message,
        },
        { status: result.status }
      );
    }

    return Response.json(
      {
        ok: true,
        data: {
          room: result.roomState.room,
          gameState: result.roomState.gameState,
        },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in game-action:", err);
    return Response.json(
      {
        ok: false,
        errorCode: "INTERNAL_ERROR",
        message: "Failed to apply action.",
      },
      { status: 500 }
    );
  }
}
