"use client";

import { useState } from "react";
import Link from "next/link";

export default function JoinPage() {
  const [roomCode, setRoomCode] = useState("");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-8">Join a Room</h1>

      <div className="w-full max-w-xs">
        <input
          type="text"
          placeholder="Enter room code"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          maxLength={4}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 text-center text-2xl tracking-widest uppercase mb-4 focus:outline-none focus:border-blue-500"
        />

        <button
          disabled={roomCode.length !== 4}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          Join
        </button>
      </div>

      <Link href="/" className="mt-8 text-gray-400 hover:text-white transition-colors">
        Back to Home
      </Link>
    </main>
  );
}
