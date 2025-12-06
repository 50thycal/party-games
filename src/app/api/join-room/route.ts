import { NextRequest } from "next/server";
import { getRoomState, setRoomState } from "@/engine/stateStore";
import type { Player, RoomState } from "@/engine/types";

type JoinRoomBody = {
  roomCode?: string;
  playerId?: string;
  name?: string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as JoinRoomBody;

    const rawCode = body.roomCode?.trim();
    if (!rawCode) {
      return Response.json(
        { ok: false, errorCode: "MISSING_ROOM_CODE", message: "Room code is required." },
        { status: 400 }
      );
    }

    const roomCode = rawCode.toUpperCase();
    const name = body.name?.trim();
    if (!name) {
      return Response.json(
        { ok: false, errorCode: "MISSING_NAME", message: "Player name is required." },
        { status: 400 }
      );
    }

    const playerId = body.playerId?.trim() || crypto.randomUUID();

    const current = getRoomState(roomCode);
    if (!current) {
      return Response.json(
        { ok: false, errorCode: "ROOM_NOT_FOUND", message: "Room not found." },
        { status: 404 }
      );
    }

    const room = { ...current.room };

    // Check if player already exists (rejoining), update name if needed
    const existingIndex = room.players.findIndex((p) => p.id === playerId);
    if (existingIndex >= 0) {
      room.players[existingIndex] = {
        ...room.players[existingIndex],
        name,
      };
    } else {
      const newPlayer: Player = {
        id: playerId,
        name,
        role: "player",
      };
      room.players = [...room.players, newPlayer];
    }

    const updatedState: RoomState = {
      ...current,
      room,
    };

    setRoomState(roomCode, updatedState);

    return Response.json(
      {
        ok: true,
        data: { room },
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in join-room:", err);
    return Response.json(
      { ok: false, errorCode: "INTERNAL_ERROR", message: "Failed to join room." },
      { status: 500 }
    );
  }
}
