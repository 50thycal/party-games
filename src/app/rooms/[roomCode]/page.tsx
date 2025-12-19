"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { loadPlayerIdentity } from "@/lib/playerIdentity";
import { getGameView } from "@/games/views";

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
  mode: "multiplayer" | "simulation" | "hotseat";
};

type GetRoomResponse =
  | { ok: true; data: { room: RoomDto; gameState: unknown } }
  | { ok: false; errorCode: string; message?: string };

type GameActionResponse =
  | { ok: true; data: { room: RoomDto; gameState: unknown } }
  | { ok: false; errorCode: string; message?: string };

const MAX_ACTION_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 100;

export default function RoomPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode?.toUpperCase();

  const [room, setRoom] = useState<RoomDto | null>(null);
  const [gameState, setGameState] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null); // For hotseat mode
  const [actionError, setActionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load current player identity
  useEffect(() => {
    const identity = loadPlayerIdentity();
    if (identity) {
      setCurrentPlayerId(identity.id);
    }
  }, []);

  // Initialize activePlayerId for hotseat mode
  useEffect(() => {
    if (!room || !roomCode) return;

    if (room.mode === "hotseat") {
      // Try to load from localStorage
      const storageKey = `hotseat-active-player-${roomCode}`;
      const stored = localStorage.getItem(storageKey);

      if (stored && room.players.find(p => p.id === stored)) {
        setActivePlayerId(stored);
      } else if (room.players.length > 0) {
        // Default to first player
        const firstPlayer = room.players[0].id;
        setActivePlayerId(firstPlayer);
        localStorage.setItem(storageKey, firstPlayer);
      }
    } else if (room.mode === "simulation") {
      // For simulation mode, set to host or first player
      setActivePlayerId(room.players[0]?.id || null);
    }
  }, [room, roomCode]);

  // Poll room state
  useEffect(() => {
    if (!roomCode) return;

    let cancelled = false;

    async function fetchRoom() {
      try {
        const res = await fetch(`/api/get-room?roomCode=${roomCode}`);

        // Handle 404 (API route not found - likely old deployment)
        if (res.status === 404) {
          console.error("API route not found (404). Server may need redeployment.");
          if (!cancelled) {
            setError(
              "Server endpoints not found. The app may need to be redeployed. Please contact the host or try again later."
            );
            setRoom(null);
            setGameState(null);
          }
          return; // Stop polling on 404
        }

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

    fetchRoom();
    const intervalId = setInterval(fetchRoom, 1000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [roomCode]);

  // Auto-dismiss action errors after 5 seconds
  useEffect(() => {
    if (actionError) {
      const timer = setTimeout(() => setActionError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [actionError]);

  // Generic action dispatcher with retry logic and exponential backoff
  async function dispatchAction(type: string, payload?: Record<string, unknown>) {
    if (!room || isSubmitting) return;

    // Determine which player ID to use based on mode
    const effectivePlayerId = room.mode === "hotseat" || room.mode === "simulation"
      ? activePlayerId
      : currentPlayerId;

    if (!effectivePlayerId) return;

    setIsSubmitting(true);
    setActionError(null);

    for (let attempt = 0; attempt < MAX_ACTION_RETRIES; attempt++) {
      try {
        const res = await fetch("/api/game-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomCode: room.roomCode,
            playerId: effectivePlayerId,
            type,
            payload,
          }),
        });

        const json = (await res.json()) as GameActionResponse;

        if (!json.ok) {
          // Handle specific error codes
          if (json.errorCode === "CONCURRENT_UPDATE_CONFLICT") {
            // This is a transient error, retry with exponential backoff
            if (attempt < MAX_ACTION_RETRIES - 1) {
              const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
              await new Promise((resolve) => setTimeout(resolve, delay));
              continue;
            } else {
              setActionError(
                "Too many players acting at once. Please try again in a moment."
              );
              setIsSubmitting(false);
              return;
            }
          } else if (json.errorCode === "ACTION_NOT_ALLOWED") {
            setActionError(json.message ?? "That action is not allowed right now.");
            setIsSubmitting(false);
            return;
          } else {
            setActionError(json.message ?? "Action failed. Please try again.");
            setIsSubmitting(false);
            return;
          }
        }

        // Success! Update state and exit
        setRoom(json.data.room);
        setGameState(json.data.gameState);
        setIsSubmitting(false);
        return;
      } catch (err) {
        console.error("Network error in dispatchAction:", err);

        // Network error - retry with exponential backoff
        if (attempt < MAX_ACTION_RETRIES - 1) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        } else {
          setActionError("Network error. Please check your connection and try again.");
          setIsSubmitting(false);
          return;
        }
      }
    }

    setIsSubmitting(false);
  }

  // Change active player (for hotseat mode)
  function changeActivePlayer(playerId: string) {
    if (!room || !roomCode || room.mode !== "hotseat") return;
    setActivePlayerId(playerId);
    localStorage.setItem(`hotseat-active-player-${roomCode}`, playerId);
  }

  // Cycle to next player (for hotseat mode)
  function nextPlayer() {
    if (!room || !activePlayerId || room.mode !== "hotseat") return;
    const currentIndex = room.players.findIndex(p => p.id === activePlayerId);
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % room.players.length;
    changeActivePlayer(room.players[nextIndex].id);
  }

  // Error states
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

  // Derived state
  const effectivePlayerId = room.mode === "hotseat" || room.mode === "simulation"
    ? activePlayerId
    : currentPlayerId;
  const isHost = (room.mode === "hotseat" || room.mode === "simulation")
    ? activePlayerId === room.hostId
    : currentPlayerId === room.hostId;

  // Get the game view component
  const GameView = getGameView(room.gameId);

  // Check if we're in gameplay mode (not lobby)
  const isInGameplay = gameState && (gameState as { phase?: string })?.phase !== "lobby";

  return (
    <main
      className={`min-h-screen ${isInGameplay ? "p-4" : "flex flex-col items-center justify-center p-8"}`}
      style={isInGameplay ? { paddingBottom: 'calc(80px + env(safe-area-inset-bottom))' } : undefined}
    >
      <div className={`w-full ${isInGameplay ? "max-w-lg mx-auto" : "max-w-md"}`}>
        {/* Action Error Toast */}
        {actionError && (
          <div className="mb-4 bg-red-900 border border-red-700 rounded-lg p-4 text-sm">
            <p className="text-red-100">{actionError}</p>
          </div>
        )}

        {/* Header - only show in lobby, hidden during gameplay */}
        {(!gameState || (gameState as { phase?: string })?.phase === "lobby") && (
          <header className="text-center mb-8">
            <p className="text-gray-400 text-sm mb-2">Room Code</p>
            <h1 className="text-4xl font-bold tracking-widest mb-2">{room.roomCode}</h1>
            <p className="text-gray-400 text-sm">
              {room.mode === "multiplayer" && "Share this code with friends to let them join"}
              {room.mode === "simulation" && "Simulation Mode - AI Players"}
              {room.mode === "hotseat" && "Hotseat Mode - Pass and Play"}
            </p>
          </header>
        )}

        {/* Hotseat Player Switcher - always show in hotseat mode */}
        {room.mode === "hotseat" && activePlayerId && (
          <section className="bg-blue-900 border border-blue-700 rounded-lg p-4 mb-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <label className="block text-xs text-blue-300 mb-2">Controlling</label>
                <select
                  value={activePlayerId}
                  onChange={(e) => changeActivePlayer(e.target.value)}
                  className="w-full bg-blue-950 border border-blue-700 rounded-lg py-2 px-3 text-sm focus:outline-none focus:border-blue-500"
                >
                  {room.players.map((player) => (
                    <option key={player.id} value={player.id}>
                      {player.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={nextPlayer}
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2 px-4 rounded-lg transition-colors whitespace-nowrap"
              >
                Next Player
              </button>
            </div>
          </section>
        )}

        {/* Players list - only show in lobby, hidden during gameplay */}
        {(!gameState || (gameState as { phase?: string })?.phase === "lobby") && (
          <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
            <h2 className="font-semibold mb-4">Players ({room.players.length})</h2>

            {room.players.length === 0 ? (
              <p className="text-gray-500 text-sm">No players yet.</p>
            ) : (
              <ul className="space-y-2">
                {room.players.map((player) => {
                  const isActive = room.mode === "hotseat" && player.id === activePlayerId;
                  return (
                    <li
                      key={player.id}
                      className={`flex items-center justify-between py-2 px-3 rounded-lg ${
                        isActive
                          ? "bg-blue-900 border border-blue-700"
                          : "bg-gray-900"
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        {player.name}
                        {player.id === room.hostId && (
                          <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded">
                            Host
                          </span>
                        )}
                        {player.id === currentPlayerId && room.mode === "multiplayer" && (
                          <span className="text-xs text-gray-400">(You)</span>
                        )}
                        {isActive && (
                          <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                            Active
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        {/* Game View - renders game-specific UI */}
        {GameView && effectivePlayerId ? (
          <GameView
            state={gameState}
            room={room}
            playerId={effectivePlayerId}
            isHost={isHost}
            dispatchAction={dispatchAction}
          />
        ) : (
          <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
            <p className="text-gray-400 text-sm text-center">
              {!GameView
                ? `Unknown game: ${room.gameId}`
                : "Loading player identity..."}
            </p>
          </section>
        )}

        {/* Submitting indicator */}
        {isSubmitting && (
          <p className="text-xs text-gray-400 text-center mb-4">Submitting action...</p>
        )}

        {/* Game info and Leave Room - only show when not in active gameplay */}
        {/* The GameView handles these controls during gameplay with a fixed bottom bar */}
        {(!gameState || (gameState as { phase?: string })?.phase === "lobby") && (
          <>
            <p className="text-xs text-gray-500 text-center mb-6">
              Game: <code className="bg-gray-800 px-2 py-1 rounded">{room.gameId}</code>
            </p>

            <Link
              href="/"
              className="block text-center text-gray-400 hover:text-white transition-colors"
            >
              Leave Room
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
