import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-8">Party Games</h1>
      <p className="text-gray-400 mb-8 text-center max-w-md">
        A Jackbox-style party game framework. Create a room or join with a code.
      </p>

      <div className="flex flex-col gap-4 w-full max-w-xs">
        <Link
          href="/create"
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg text-center transition-colors"
        >
          Create Room
        </Link>
        <Link
          href="/join"
          className="bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-6 rounded-lg text-center transition-colors"
        >
          Join Room
        </Link>
      </div>
    </main>
  );
}
