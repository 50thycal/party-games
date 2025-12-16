"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loadPlayerIdentity, savePlayerIdentity } from "@/lib/playerIdentity";
import { gameOptions } from "@/games/views";

type RoomMode = "multiplayer" | "simulation" | "hotseat";

export default function CreatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [selectedGameId, setSelectedGameId] = useState(gameOptions[0]?.id ?? "");
  const [mode, setMode] = useState<RoomMode>("multiplayer");
  const [playerCount, setPlayerCount] = useState(2);
  const [playerNames, setPlayerNames] = useState<string[]>(["", ""]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill name from localStorage if available
  useEffect(() => {
    const identity = loadPlayerIdentity();
    if (identity) {
      setName(identity.name);
    }
  }, []);

  const selectedGame = gameOptions.find((g) => g.id === selectedGameId);

  // Update playerNames array when playerCount changes
  useEffect(() => {
    const newNames = Array(playerCount).fill("").map((_, i) =>
      playerNames[i] || ""
    );
    setPlayerNames(newNames);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerCount]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Validation based on mode
    if (mode === "multiplayer") {
      const trimmed = name.trim();
      if (!trimmed || !selectedGameId) return;
    } else {
      if (!selectedGameId) return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const existing = loadPlayerIdentity();
      const playerId = existing?.id ?? crypto.randomUUID();

      const body: Record<string, unknown> = {
        gameId: selectedGameId,
        mode,
      };

      if (mode === "multiplayer") {
        body.playerId = playerId;
        body.name = name.trim();
      } else {
        body.playerCount = playerCount;
        body.playerNames = playerNames.filter(n => n.trim()).length > 0
          ? playerNames
          : undefined;
      }

      const res = await fetch("/api/create-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!json.ok) {
        setError(json.message ?? "Failed to create room.");
        setIsSubmitting(false);
        return;
      }

      // Persist identity for multiplayer mode
      if (mode === "multiplayer") {
        savePlayerIdentity({ id: playerId, name: name.trim() });
      }

      const roomCode: string = json.data.room.roomCode;
      router.push(`/rooms/${roomCode}`);
    } catch (err) {
      console.error(err);
      setError("Unexpected error while creating room.");
      setIsSubmitting(false);
    }
  }

  const isFormValid = () => {
    if (!selectedGameId) return false;
    if (mode === "multiplayer") {
      return name.trim().length > 0;
    }
    return true;
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-4">Create a Room</h1>
      <p className="text-gray-400 mb-8 text-center max-w-md">
        Choose a game and mode to get started.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-4">
        {/* Game Selection */}
        <div>
          <label htmlFor="game-select" className="block text-sm text-gray-400 mb-2">
            1. Select Game
          </label>
          <select
            id="game-select"
            value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 focus:outline-none focus:border-blue-500"
          >
            {gameOptions.map((game) => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </select>
          {selectedGame && (
            <p className="mt-2 text-xs text-gray-500">
              {selectedGame.description} ({selectedGame.minPlayers}-{selectedGame.maxPlayers} players)
            </p>
          )}
        </div>

        {/* Mode Selection */}
        <div>
          <label className="block text-sm text-gray-400 mb-2">
            2. Select Mode
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setMode("multiplayer")}
              className={`py-3 px-4 rounded-lg border transition-colors ${
                mode === "multiplayer"
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600"
              }`}
            >
              Multiplayer
            </button>
            <button
              type="button"
              onClick={() => setMode("simulation")}
              className={`py-3 px-4 rounded-lg border transition-colors ${
                mode === "simulation"
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600"
              }`}
            >
              Simulation
            </button>
            <button
              type="button"
              onClick={() => setMode("hotseat")}
              className={`py-3 px-4 rounded-lg border transition-colors ${
                mode === "hotseat"
                  ? "bg-blue-600 border-blue-500 text-white"
                  : "bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600"
              }`}
            >
              Hotseat
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {mode === "multiplayer" && "Play online with friends by sharing a room code"}
            {mode === "simulation" && "Watch AI players compete automatically"}
            {mode === "hotseat" && "Pass and play on one device"}
          </p>
        </div>

        {/* Multiplayer: Name Input */}
        {mode === "multiplayer" && (
          <div>
            <label htmlFor="name-input" className="block text-sm text-gray-400 mb-2">
              3. Your Name
            </label>
            <input
              id="name-input"
              type="text"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Simulation/Hotseat: Player Count */}
        {(mode === "simulation" || mode === "hotseat") && (
          <div>
            <label htmlFor="player-count" className="block text-sm text-gray-400 mb-2">
              3. Number of Players
            </label>
            <input
              id="player-count"
              type="number"
              min={selectedGame?.minPlayers ?? 2}
              max={selectedGame?.maxPlayers ?? 8}
              value={playerCount}
              onChange={(e) => setPlayerCount(parseInt(e.target.value) || 2)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        {/* Hotseat: Optional Player Names */}
        {mode === "hotseat" && (
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              4. Player Names (Optional)
            </label>
            <div className="space-y-2">
              {Array.from({ length: playerCount }).map((_, i) => (
                <input
                  key={i}
                  type="text"
                  placeholder={`Player ${i + 1}`}
                  value={playerNames[i] || ""}
                  onChange={(e) => {
                    const newNames = [...playerNames];
                    newNames[i] = e.target.value;
                    setPlayerNames(newNames);
                  }}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg py-2 px-3 focus:outline-none focus:border-blue-500 text-sm"
                />
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting || !isFormValid()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          {isSubmitting ? "Creating..." : "Start Game"}
        </button>
      </form>

      {error && (
        <p className="mt-4 text-red-400 text-sm">{error}</p>
      )}

      <Link href="/" className="mt-8 text-gray-400 hover:text-white transition-colors">
        Back to Home
      </Link>
    </main>
  );
}
