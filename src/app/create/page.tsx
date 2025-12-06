"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loadPlayerIdentity, savePlayerIdentity } from "@/lib/playerIdentity";

export default function CreatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-fill name from localStorage if available
  useEffect(() => {
    const identity = loadPlayerIdentity();
    if (identity) {
      setName(identity.name);
    }
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const existing = loadPlayerIdentity();
      const playerId = existing?.id ?? crypto.randomUUID();

      const res = await fetch("/api/create-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          name: trimmed,
          gameId: "number-guess",
        }),
      });

      const json = await res.json();
      if (!json.ok) {
        setError(json.message ?? "Failed to create room.");
        setIsSubmitting(false);
        return;
      }

      // Persist identity
      savePlayerIdentity({ id: playerId, name: trimmed });

      const roomCode: string = json.data.room.roomCode;
      router.push(`/rooms/${roomCode}`);
    } catch (err) {
      console.error(err);
      setError("Unexpected error while creating room.");
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-4">Create a Room</h1>
      <p className="text-gray-400 mb-8 text-center max-w-md">
        Enter your name and we&apos;ll create a new room. Share the code with friends once it&apos;s ready.
      </p>

      <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-4">
        <input
          type="text"
          placeholder="Your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg py-3 px-4 focus:outline-none focus:border-blue-500"
        />

        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
        >
          {isSubmitting ? "Creating..." : "Create Room"}
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
