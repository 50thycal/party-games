import Link from "next/link";
import { getLatestPR } from "@/lib/version-info";

// Ensure fresh PR data on each request
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const prInfo = await getLatestPR();

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center p-8">
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

      <Link
        href="/test"
        className="mt-8 text-sm text-gray-500 hover:text-gray-400 transition-colors"
      >
        Test game (dev)
      </Link>

      <div className="absolute bottom-4 left-0 right-0 text-center text-xs text-gray-600">
        {prInfo.prNumber > 0 ? (
          <>Latest: PR #{prInfo.prNumber} - {prInfo.prTitle} ({prInfo.mergedAt})</>
        ) : (
          <>Version info unavailable</>
        )}
      </div>
    </main>
  );
}
