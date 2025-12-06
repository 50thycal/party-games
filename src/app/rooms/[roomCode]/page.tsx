"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { loadPlayerIdentity } from "@/lib/playerIdentity";

type PlayerDto = {
  id: string;
  name: string;
  role: "host" | "player";
};

type RoomDto = {
  roomCode: string;
  gameId: string;
  hostId: string;
  players: PlayerDto[];
  createdAt: number;
};

type GameState = {
  phase: string;
  [key: string]: unknown;
};

type GetRoomResponse =
  | { ok: true; data: { room: RoomDto; gameState: GameState | null } }
  | { ok: false; errorCode: string; message?: string };

type GameActionResponse =
  | { ok: true; data: { room: RoomDto; gameState: GameState } }
  | { ok: false; errorCode: string; message?: string };

export default function RoomPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode?.toUpperCase();
  const [room, setRoom] = useState<RoomDto | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  // Load current player identity
  useEffect(() => {
    const identity = loadPlayerIdentity();
    if (identity) {
      setCurrentPlayerId(identity.id);
    }
  }, []);

  // Poll room state
  useEffect(() => {
    if (!roomCode) return;

    let cancelled = false;

    async function fetchRoom() {
      try {
        const res = await fetch(`/api/get-room?roomCode=${roomCode}`);
        const json = (await res.json()) as GetRoomResponse;

        if (cancelled) return;

        if (!json.ok) {
          setError(json.message ?? "Room not found.");
          setRoom(null);
          setGameState(null);
          return;
        }

        setRoom(json.data.room);
        setGameState(json.data.gameState);
        setError(null);
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          setError("Error fetching room state.");
        }
      }
    }

    // Initial fetch
    fetchRoom();

    // Poll every second
    const intervalId = setInterval(fetchRoom, 1000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [roomCode]);

  // Handle Start Game action
  async function handleStartGame() {
    if (!room || !currentPlayerId) return;
    setIsStarting(true);

    try {
      const res = await fetch("/api/game-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomCode: room.roomCode,
          playerId: currentPlayerId,
          type: "START_GAME",
        }),
      });

      const json = (await res.json()) as GameActionResponse;
      if (!json.ok) {
        console.error("Failed to start game:", json.message);
      } else {
        setRoom(json.data.room);
        setGameState(json.data.gameState);
      }
    } catch (err) {
      console.error("Error starting game:", err);
    } finally {
      setIsStarting(false);
    }
  }

  if (!roomCode) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <h1 className="text-3xl font-bold mb-4">Invalid Room</h1>
        <p className="text-gray-400">No room code provided.</p>
        <Link href="/" className="mt-8 text-gray-400 hover:text-white transition-colors">
          Back to Home
        </Link>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <h1 className="text-3xl font-bold mb-4">Room {roomCode}</h1>
        <p className="text-red-400 mb-8">{error}</p>
        <Link href="/" className="text-gray-400 hover:text-white transition-colors">
          Back to Home
        </Link>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8">
        <h1 className="text-3xl font-bold mb-4">Room {roomCode}</h1>
        <p className="text-gray-400">Loading room...</p>
      </main>
    );
  }

  const isHost = currentPlayerId === room.hostId;
  const phase = gameState?.phase ?? "lobby";
  const isInLobby = phase === "lobby";

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        <header className="text-center mb-8">
          <p className="text-gray-400 text-sm mb-2">Room Code</p>
          <h1 className="text-4xl font-bold tracking-widest mb-2">{room.roomCode}</h1>
          <p className="text-gray-400 text-sm">
            Share this code with friends to let them join
          </p>
        </header>

        {/* Phase indicator */}
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-6 text-center">
          <p className="text-sm text-gray-400">
            Phase:{" "}
            <span className="font-mono text-white bg-gray-700 px-2 py-1 rounded">
              {phase}
            </span>
          </p>
        </section>

        {/* Players list */}
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">
            Players ({room.players.length})
          </h2>

          {room.players.length === 0 ? (
            <p className="text-gray-500 text-sm">No players yet.</p>
          ) : (
            <ul className="space-y-2">
              {room.players.map((player) => (
                <li
                  key={player.id}
                  className="flex items-center justify-between py-2 px-3 bg-gray-900 rounded-lg"
                >
                  <span className="flex items-center gap-2">
                    {player.name}
                    {player.id === room.hostId && (
                      <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded">
                        Host
                      </span>
                    )}
                    {player.id === currentPlayerId && (
                      <span className="text-xs text-gray-400">(You)</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Start Game button (host only, lobby phase only) */}
        {isHost && (
          <section className="mb-6">
            <button
              onClick={handleStartGame}
              disabled={isStarting || !isInLobby}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {!isInLobby
                ? "Game Started"
                : isStarting
                ? "Starting..."
                : "Start Game"}
            </button>
          </section>
        )}

        {/* Game info */}
        <p className="text-xs text-gray-500 text-center mb-6">
          Game: <code className="bg-gray-800 px-2 py-1 rounded">{room.gameId}</code>
        </p>

        <Link
          href="/"
          className="block text-center text-gray-400 hover:text-white transition-colors"
        >
          Leave Room
        </Link>
      </div>
    </main>
  );
}
