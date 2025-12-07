"use client";

import { FormEvent, useState } from "react";
import type { GameViewProps } from "@/games/views";
import type { NumberGuessState } from "./config";

export function NumberGuessGameView({
  state,
  room,
  playerId,
  isHost,
  dispatchAction,
}: GameViewProps<NumberGuessState>) {
  const [guessInput, setGuessInput] = useState("");
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isPlayingAgain, setIsPlayingAgain] = useState(false);

  const gameState = state as NumberGuessState;
  const phase = gameState?.phase ?? "lobby";
  const guesses = gameState?.guesses ?? {};
  const secret = gameState?.secret ?? null;
  const winnerId = gameState?.winnerId ?? null;

  const myGuess = playerId && guesses[playerId];
  const hasGuessed = myGuess !== undefined;
  const winnerPlayer = winnerId ? room.players.find((p) => p.id === winnerId) : null;
  const guessCount = Object.keys(guesses).length;

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

  async function handlePlayAgain() {
    setIsPlayingAgain(true);
    try {
      await dispatchAction("PLAY_AGAIN");
      setGuessInput("");
    } finally {
      setIsPlayingAgain(false);
    }
  }

  return (
    <>
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
            <button
              onClick={handlePlayAgain}
              disabled={isPlayingAgain}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-lg transition-colors"
            >
              {isPlayingAgain ? "Starting new round..." : "Play Again"}
            </button>
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
                  {winnerId === playerId && " (You!)"}
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  Guessed: {guesses[winnerId]}
                </p>
              </div>
            )}

            {/* Your guess */}
            {hasGuessed && winnerId !== playerId && (
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
    </>
  );
}
