import Link from "next/link";

interface RoomPageProps {
  params: {
    roomCode: string;
  };
}

export default function RoomPage({ params }: RoomPageProps) {
  const { roomCode } = params;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-4">Room: {roomCode}</h1>

      <p className="text-gray-400 mb-8 text-center max-w-md">
        Room view placeholder. This will display the game lobby and active game views.
      </p>

      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-semibold mb-4">Lobby</h2>
        <p className="text-gray-500">Waiting for players...</p>
      </div>

      <Link href="/" className="mt-8 text-gray-400 hover:text-white transition-colors">
        Leave Room
      </Link>
    </main>
  );
}
