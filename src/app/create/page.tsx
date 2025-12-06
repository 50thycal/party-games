import Link from "next/link";

export default function CreatePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-8">Create a Room</h1>

      <p className="text-gray-400 mb-8 text-center max-w-md">
        Select a game to create a new room. (Games will be available after Phase 5)
      </p>

      <div className="w-full max-w-xs">
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center">
          <p className="text-gray-500">No games registered yet</p>
        </div>
      </div>

      <Link href="/" className="mt-8 text-gray-400 hover:text-white transition-colors">
        Back to Home
      </Link>
    </main>
  );
}
