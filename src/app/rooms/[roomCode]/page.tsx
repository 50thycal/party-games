"use client";

import { FormEvent, useEffect, useState } from "react";
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

type NumberGuessState = {
  phase: "lobby" | "guessing" | "results";
  secret: number | null;
  guesses: Record<string, number>;
  winnerId: string | null;
};

type GetRoomResponse =
  | { ok: true; data: { room: RoomDto; gameState: NumberGuessState | null } }
  | { ok: false; errorCode: string; message?: string };

type GameActionResponse =
  | { ok: true; data: { room: RoomDto; gameState: NumberGuessState } }
  | { ok: false; errorCode: string; message?: string };

export default function RoomPage() {
  const params = useParams<{ roomCode: string }>();
  const roomCode = params.roomCode?.toUpperCase();

  const [room, setRoom] = useState<RoomDto | null>(null);
  const [gameState, setGameState] = useState<NumberGuessState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentPlayerId, setCurrentPlayerId] = useState<string | null>(null);

  // Action states
  const [isStarting, setIsStarting] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [guessInput, setGuessInput] = useState("");
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);

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

    fetchRoom();
    const intervalId = setInterval(fetchRoom, 1000);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [roomCode]);

  // Generic action dispatcher
  async function dispatchAction(type: string, payload?: Record<string, unknown>) {
    if (!room || !currentPlayerId) return;

    const res = await fetch("/api/game-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomCode: room.roomCode,
        playerId: currentPlayerId,
        type,
        payload,
      }),
    });

    const json = (await res.json()) as GameActionResponse;
    if (!json.ok) {
      console.error("Action failed:", json);
      return;
    }

    setRoom(json.data.room);
    setGameState(json.data.gameState);
  }

  async function handleStartGame() {
    setIsStarting(true);
    try {
      await dispatchAction("START_GAME");
      setGuessInput("");
    } finally {
      setIsStarting(false);
    }
  }

  async function handleRevealResults() {
    setIsRevealing(true);
    try {
      await dispatchAction("REVEAL_RESULTS");
    } finally {
      setIsRevealing(false);
    }
  }

  async function handleSubmitGuess(e: FormEvent) {
    e.preventDefault();
    if (!guessInput.trim()) return;

    const value = Number(guessInput.trim());
    if (!Number.isFinite(value) || value < 1 || value > 100) return;

    setIsSubmittingGuess(true);
    try {
      await dispatchAction("SUBMIT_GUESS", { value });
    } finally {
      setIsSubmittingGuess(false);
    }
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
  const isHost = currentPlayerId === room.hostId;
  const phase = gameState?.phase ?? "lobby";
  const guesses = gameState?.guesses ?? {};
  const secret = gameState?.secret ?? null;
  const winnerId = gameState?.winnerId ?? null;

  const myGuess = currentPlayerId && guesses[currentPlayerId];
  const hasGuessed = myGuess !== undefined;
  const winnerPlayer = winnerId ? room.players.find((p) => p.id === winnerId) : null;
  const guessCount = Object.keys(guesses).length;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* Header */}
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
          <h2 className="font-semibold mb-4">Players ({room.players.length})</h2>

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
                  {phase === "guessing" && (
                    <span className="text-xs text-gray-400">
                      {guesses[player.id] !== undefined ? "Guessed" : "Waiting..."}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Host Controls */}
        {isHost && (
          <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
            <h2 className="font-semibold mb-4">Host Controls</h2>

            {phase === "lobby" && (
              <button
                onClick={handleStartGame}
                disabled={isStarting}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {isStarting ? "Starting..." : "Start Game"}
              </button>
            )}

            {phase === "guessing" && (
              <button
                onClick={handleRevealResults}
                disabled={isRevealing || guessCount === 0}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
              >
                {isRevealing
                  ? "Revealing..."
                  : guessCount === 0
                  ? "Waiting for guesses..."
                  : `Reveal Results (${guessCount} guesses)`}
              </button>
            )}

            {phase === "results" && (
              <p className="text-gray-400 text-sm text-center">
                Game complete! Create a new room to play again.
              </p>
            )}
          </section>
        )}

        {/* Game Area */}
        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6 mb-6">
          <h2 className="font-semibold mb-4">
            {phase === "lobby" && "Waiting to Start"}
            {phase === "guessing" && "Make Your Guess"}
            {phase === "results" && "Results"}
          </h2>

          {/* Lobby phase */}
          {phase === "lobby" && (
            <p className="text-gray-400 text-sm">
              Waiting for the host to start the game...
            </p>
          )}

          {/* Guessing phase */}
          {phase === "guessing" && (
            <>
              {hasGuessed ? (
                <div className="text-center">
                  <p className="text-gray-400 mb-2">You guessed:</p>
                  <p className="text-4xl font-bold text-green-400">{myGuess}</p>
                  <p className="text-gray-500 text-sm mt-2">
                    Waiting for other players and the host to reveal results...
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmitGuess} className="space-y-4">
                  <p className="text-gray-400 text-sm">
                    Pick a number between 1 and 100:
                  </p>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={guessInput}
                    onChange={(e) => setGuessInput(e.target.value)}
                    placeholder="Your guess"
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg py-3 px-4 text-center text-2xl focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    disabled={isSubmittingGuess || !guessInput.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                  >
                    {isSubmittingGuess ? "Submitting..." : "Submit Guess"}
                  </button>
                </form>
              )}
            </>
          )}

          {/* Results phase */}
          {phase === "results" && (
            <div className="space-y-4">
              {/* Secret number */}
              {secret !== null && (
                <div className="text-center py-4 bg-gray-900 rounded-lg">
                  <p className="text-gray-400 text-sm mb-1">The secret number was:</p>
                  <p className="text-4xl font-bold text-yellow-400">{secret}</p>
                </div>
              )}

              {/* Winner */}
              {winnerPlayer && winnerId && (
                <div className="text-center py-4 bg-green-900/30 border border-green-700 rounded-lg">
                  <p className="text-gray-400 text-sm mb-1">Winner:</p>
                  <p className="text-2xl font-bold text-green-400">
                    {winnerPlayer.name}
                    {winnerId === currentPlayerId && " (You!)"}
                  </p>
                  <p className="text-gray-400 text-sm mt-1">
                    Guessed: {guesses[winnerId]}
                  </p>
                </div>
              )}

              {/* Your guess */}
              {hasGuessed && winnerId !== currentPlayerId && (
                <div className="text-center py-2">
                  <p className="text-gray-400 text-sm">
                    Your guess: <span className="font-semibold">{myGuess}</span>
                  </p>
                </div>
              )}

              {/* All guesses */}
              <details className="mt-4">
                <summary className="cursor-pointer text-gray-400 text-sm hover:text-white">
                  Show all guesses
                </summary>
                <ul className="mt-3 space-y-1">
                  {room.players.map((p) => (
                    <li
                      key={p.id}
                      className="flex justify-between text-sm py-1 px-2 bg-gray-900 rounded"
                    >
                      <span className="text-gray-300">
                        {p.name}
                        {p.id === winnerId && " *"}
                      </span>
                      <span className="text-gray-400">
                        {guesses[p.id] !== undefined ? guesses[p.id] : "No guess"}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </section>

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
