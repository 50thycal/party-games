"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

const AVAILABLE_GAMES = [
  { id: "comet-rush", name: "Comet Rush" },
];

export default function TestPage() {
  const router = useRouter();
  const [selectedGame, setSelectedGame] = useState(AVAILABLE_GAMES[0].id);
  const [playerCount, setPlayerCount] = useState(2);

  const handleStart = () => {
    router.push(`/test/${selectedGame}?players=${playerCount}`);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-2">Test Game Simulator</h1>
      <p className="text-gray-400 mb-8 text-center max-w-md">
        Run headless simulations with dumb bots to test game mechanics.
      </p>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-gray-400">Select Game</span>
          <select
            value={selectedGame}
            onChange={(e) => setSelectedGame(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
          >
            {AVAILABLE_GAMES.map((game) => (
              <option key={game.id} value={game.id}>
                {game.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm text-gray-400">Player Count</span>
          <select
            value={playerCount}
            onChange={(e) => setPlayerCount(Number(e.target.value))}
            className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white"
          >
            {[2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n} players
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={handleStart}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors mt-4"
        >
          Start Simulation
        </button>

        <Link
          href="/"
          className="text-center text-sm text-gray-500 hover:text-gray-400 transition-colors mt-4"
        >
          Back to Home
        </Link>
      </div>
    </main>
  );
}
